/* core/mesh3dshot.js — the 3D panel's view, as a picture you can put in a paper.    2026-10-03

   Søren: *"Can we make a button to export the view of the show in 3D as an image with scalebar or
   as a movie that rotates 360 degrees with the current view?"*

   Two things come out of here: a PNG of exactly what is on screen with a scale bar burned into it,
   and an animated GIF of one full turn from the view you are looking at.

   ── THE SCALE BAR IS THE WHOLE RISK ─────────────────────────────────────────────────────────
   A picture of a cell is pleasant. A picture of a cell with a bar under it is a MEASUREMENT, and
   one that is wrong is worse than none at all: it will be read off a figure, years later, by
   somebody who was not here and has no way to check it.

   So the number is computed where the camera is, not beside it. core/mesh3d.js's nmPerPx() is
   2·dist·tan(FOV/2)·span ÷ height — the visible height at the model's own centre plane, in
   nanometres, divided by the pixels covering it — and all three of those live in that file. A
   second copy of the field of view in this one would be wrong by a constant factor, which is the
   kind of wrong that looks right. shotcheck.js asserts the bar's PIXEL length against its
   nanometre length, and then goes and finds that many pixels of bar in the decoded PNG.

   AND IT IS TRUE AT THE MODEL'S CENTRE. This is a perspective camera, so a bar is exact on one
   plane and slightly off in front of and behind it. The centre plane is the honest choice and the
   usual one; at the distances this panel sits at the error across a cell is a few per cent.

   ── WHY A GIF AND NOT A VIDEO ────────────────────────────────────────────────────────────────
   Søren's choice, and the right one for what he does with these: a GIF drops into PowerPoint,
   Word, Slack and a web page. Nothing in a browser can write MP4; WebM is smaller and prettier and
   PowerPoint on Windows will not play it.

   Measured before it was built, on a branching cell at the panel's own retina size (1240x600):

   | frames |  file  | grab | encode |
   |---|---|---|---|
   | 36 | 0.15 MB | 1.4 s | 0.3 s |
   | 48 | 0.21 MB | 2.0 s | 0.4 s |
   | 64 | 0.27 MB | 2.8 s | 0.5 s |

   Far smaller than a GIF usually is, because the field behind the model is flat and the palette is
   taken once for the whole turn rather than per frame — the lighting does not change as the model
   turns, so a per-frame palette costs time and makes the file bigger.

   THE ENCODER IS FETCHED, NOT LOADED. core/vendor/gifenc.js is 22 KB and most sessions will never
   export a turn, so it is read on the first one and evaluated into its own object — which also
   means the vendored file stays byte-identical to what npm publishes, with no browser shim glued
   to the front of it. Same discipline as the JPEG XL decoder next to it.

   Run: node shotcheck.js */
var UJ = UJ || {};
UJ.mesh3dshot = (function(){
  "use strict";

  /* Where the vendored encoder lives. Default: core/vendor/ beside the page, as every tool in this
     family serves core/ from. A check hands the source straight in instead. */
  var BASE = "", SRC = "";
  function configure(cfg){
    if (!cfg) return;
    if (cfg.base) BASE = String(cfg.base);
    if (cfg.gifSrc) SRC = String(cfg.gifSrc);
  }
  function vendorUrl(){
    if (BASE) return BASE + "gifenc.js";
    try { return new URL("core/vendor/gifenc.js", location.href).href; }
    catch (_e){ return "core/vendor/gifenc.js"; }
  }
  var GIF = null;
  function gifenc(){
    if (GIF) return Promise.resolve(GIF);
    var got = SRC ? Promise.resolve(SRC)
                  : fetch(vendorUrl()).then(function(r){
                      if (!r.ok) throw new Error("could not read the GIF encoder (" + r.status + ")");
                      return r.text();
                    });
    return got.then(function(src){
      /* Evaluated into ITS OWN `exports`, which is the published CommonJS build's only expectation.
         Nothing is added to the page's globals and the vendored file is untouched. */
      var mod = {};
      (new Function("exports", src))(mod);
      if (!mod.GIFEncoder || !mod.quantize || !mod.applyPalette)
        throw new Error("the GIF encoder did not load");
      GIF = mod;
      return mod;
    });
  }

  /* THE CORE RENDERER, WHICH IS NOT ALWAYS `UJ.mesh3d`. χJump keeps core/mesh3d.js as
     `UJ.mesh3dCore` and puts its own fetching half under the usual name; since
     src/one_renderer_for_every_tool.py its panel is drawn by the core one all the same. On the
     other seven pages the two are the same object. */
  function m3d(){
    var U = window.UJ || {};
    var M = (U.mesh3dCore && U.mesh3dCore.frame) ? U.mesh3dCore
          : (U.mesh3d && U.mesh3d.frame) ? U.mesh3d : null;
    if (!M) throw new Error("core/mesh3d.js is not loaded, or has no panel open");
    return M;
  }

  /* ── THE BAR ──────────────────────────────────────────────────────────────────────────────
     1, 2 or 5 times a power of ten, which is what a reader expects on a figure and what every
     microscope's software draws. Aimed at about a fifth of the width: long enough to measure
     against, short enough not to be the subject of the picture. */
  var AIM = 0.22;
  function barFor(nmPerPx, widthPx){
    var want = nmPerPx * widthPx * AIM;                      // nanometres we would like
    var p = Math.pow(10, Math.floor(Math.log(want) / Math.LN10));
    var nm = p;
    [1, 2, 5, 10].forEach(function(m){ if (p * m <= want) nm = p * m; });
    var px = Math.round(nm / nmPerPx);
    return { nm: nm, px: px, label: labelFor(nm) };
  }
  /* Nanometres below a micrometre, micrometres above it, millimetres above a thousand of those —
     the unit somebody would say out loud, with no trailing zeros after the point. */
  function labelFor(nm){
    if (nm < 1000) return trim(nm) + " nm";
    if (nm < 1000000) return trim(nm / 1000) + " µm";
    return trim(nm / 1000000) + " mm";
  }
  function trim(v){
    var s = v.toFixed(2);
    s = s.replace(/\.?0+$/, "");
    return s;
  }

  /* ── A FRAME ONTO A CANVAS ────────────────────────────────────────────────────────────────
     readPixels' origin is the BOTTOM-left and a canvas image runs top-down, so every row is put
     back in the opposite order. Getting this wrong mirrors the picture vertically, which on a
     neuron is not obvious — it just looks like a different cell. */
  function paint(f){
    var c = document.createElement("canvas");
    c.width = f.w; c.height = f.h;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(f.w, f.h);
    var d = img.data, px = f.px, row = f.w * 4, y, x;
    for (y = 0; y < f.h; y++){
      var from = (f.h - 1 - y) * row, to = y * row;
      for (x = 0; x < row; x++) d[to + x] = px[from + x];
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, ctx: ctx };
  }

  /* ── THE BAR IS DRAWN IN THE PAGE'S OWN INK ───────────────────────────────────────────────
     Not always white. The first version was, with a dark outline to carry it on a light field, and
     on the light theme it came out as outlined lettering over a hollow rectangle — legible, and
     obviously a sticker rather than part of the figure. The panel's own --ink against its own --bg
     is what a reader expects: near-white on the dark theme, near-black on the light one.

     THE HALO STAYS, in the background colour. The field behind the bar is a gradient, and the
     model can be drawn over the corner the bar sits in; a stroke of the background underneath the
     fill means neither of those can swallow it. */
  function cssColor(name, fallback){
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (_e){ return fallback; }
  }
  function drawBar(ctx, w, h, bar){
    var pad = Math.max(10, Math.round(w * 0.025));
    var th = Math.max(3, Math.round(h * 0.012));
    var x = pad, y = h - pad - th;
    var font = Math.max(11, Math.round(h * 0.045));
    var ink = cssColor("--ink", "#ffffff"), halo = cssColor("--bg", "#000000");
    ctx.save();
    ctx.lineJoin = "round";
    ctx.strokeStyle = halo;
    ctx.lineWidth = Math.max(3, Math.round(th * 1.6));
    ctx.strokeRect(x, y, bar.px, th);
    ctx.fillStyle = ink;
    ctx.fillRect(x, y, bar.px, th);
    ctx.font = "600 " + font + "px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textBaseline = "alphabetic";
    /* Clear of the bar by half the type size, so a descender -- the µ of µm, every time -- does
       not sit on it. The first version used the bar's own thickness, which is a few pixels. */
    var base = y - Math.round(font * 0.45);
    ctx.lineWidth = Math.max(3, Math.round(font * 0.30));
    ctx.strokeStyle = halo;
    ctx.strokeText(bar.label, x, base);
    ctx.fillStyle = ink;
    ctx.fillText(bar.label, x, base);
    ctx.restore();
  }

  /* ── THE PICTURE ──────────────────────────────────────────────────────────────────────────── */
  function imageBlob(opts){
    var o = opts || {};
    var f = m3d().frame();
    if (!f) return Promise.reject(new Error("there is no 3D panel open to photograph"));
    var p = paint(f);
    if (o.bar !== false) drawBar(p.ctx, f.w, f.h, barFor(f.nmPerPx, f.w));
    return new Promise(function(res, rej){
      p.canvas.toBlob(function(b){ b ? res(b) : rej(new Error("the picture could not be made")); },
                      "image/png");
    });
  }

  /* ── THE TURN ─────────────────────────────────────────────────────────────────────────────
     TWO PASSES OVER THE TURN, on purpose. The first takes three frames a third of a turn apart and
     builds ONE palette from them; the second encodes. Holding all forty-eight frames to palette
     them together would be 140 MB at the panel's retina size, and a palette per frame is both
     slower and larger. Painting is cheap; memory is not. */
  function turnBlob(opts){
    var o = opts || {};
    var n = Math.max(8, Math.min(120, o.frames || 48));
    var fps = Math.max(5, Math.min(50, o.fps || 24));
    var M = m3d();
    var first = M.frame();
    if (!first) return Promise.reject(new Error("there is no 3D panel open to turn"));
    var bar = o.bar === false ? null : barFor(first.nmPerPx, first.w);
    return gifenc().then(function(G){
      var w = first.w, h = first.h;
      /* The sample, for the palette. */
      var want = [0, Math.floor(n / 3), Math.floor(2 * n / 3)], got = [];
      M.turn(n, function(k){ if (want.indexOf(k) >= 0) got.push(frameRGBA(M.frame(), bar)); });
      var sample = new Uint8ClampedArray(w * h * 4 * got.length);
      got.forEach(function(g, i){ sample.set(g, i * w * h * 4); });
      var pal = G.quantize(sample, 256, { format: "rgb565" });
      got.length = 0;

      var enc = G.GIFEncoder();
      M.turn(n, function(k){
        var rgba = frameRGBA(M.frame(), bar);
        var idx = G.applyPalette(rgba, pal, "rgb565");
        enc.writeFrame(idx, w, h, { palette: k === 0 ? pal : undefined,
                                    delay: Math.round(1000 / fps) });
      });
      enc.finish();
      return new Blob([enc.bytes()], { type: "image/gif" });
    });
  }
  /* One frame, right way up, with the bar on it, as the flat RGBA the encoder wants. */
  function frameRGBA(f, bar){
    var p = paint(f);
    if (bar) drawBar(p.ctx, f.w, f.h, bar);
    return p.ctx.getImageData(0, 0, f.w, f.h).data;
  }

  /* ── HANDING IT OVER ─────────────────────────────────────────────────────────────────────── */
  function save(blob, name){
    var u = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = u; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    /* A beat, because Safari reads the href after the click returns. */
    setTimeout(function(){ URL.revokeObjectURL(u); }, 4000);
  }
  function stamp(){
    var d = new Date();
    var p = function(v){ return (v < 10 ? "0" : "") + v; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
         + "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function saveImage(opts){
    var o = opts || {};
    return imageBlob(o).then(function(b){
      save(b, (o.name || "cell") + "_" + stamp() + ".png"); return b;
    });
  }
  function saveTurn(opts){
    var o = opts || {};
    return turnBlob(o).then(function(b){
      save(b, (o.name || "cell") + "_turn_" + stamp() + ".gif"); return b;
    });
  }

  return { configure: configure, barFor: barFor, labelFor: labelFor,
           imageBlob: imageBlob, turnBlob: turnBlob,
           saveImage: saveImage, saveTurn: saveTurn,
           _vendorUrl: vendorUrl, _reset: function(){ GIF = null; } };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = (typeof window !== "undefined" ? window : global).UJ.mesh3dshot;
