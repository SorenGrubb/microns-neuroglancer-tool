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

  /* ── WHAT IS IN THE PICTURE, WRITTEN ON THE PICTURE ───────────────────────────────────────
     Søren: "we also need to have a tool logo in the lower right corner and the cell name and
     organelle names in the top left corner. Make sure it does not overcrowd the image."

     FOUR LINES AND THEN A COUNT. That cap is how the promise about overcrowding is kept rather
     than hoped for: a pad with nine traced structures would otherwise write nine lines down the
     side of the cell they are inside. shotcheck.js measures the ink in that corner and fails if it
     goes past a tenth of it.

     THE LIST IS THE PANEL'S, not this file's idea of what is on screen. core/mesh3d.js's legend()
     skips whatever the isolate button has hidden, so a picture taken with only the nucleus showing
     does not claim a cell is in it. */
  var MAX_LINES = 4;
  function legendLines(){
    var L = [];
    try { L = m3d().legend() || []; } catch (_e){ return []; }
    var names = L.map(function(q){ return q.label; }).filter(Boolean);
    if (names.length <= MAX_LINES) return names;
    return names.slice(0, MAX_LINES - 1)
                .concat(["+ " + (names.length - (MAX_LINES - 1)) + " more"]);
  }
  function drawTitle(ctx, w, h, lines){
    if (!lines.length) return;
    var pad = Math.max(10, Math.round(w * 0.025));
    var font = Math.max(11, Math.round(h * 0.040));
    var step = Math.round(font * 1.35);
    var ink = cssColor("--ink", "#ffffff"), halo = cssColor("--bg", "#000000");
    ctx.save();
    ctx.font = "600 " + font + "px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, Math.round(font * 0.30));
    lines.forEach(function(t, i){
      var y = pad + i * step;
      ctx.strokeStyle = halo; ctx.strokeText(t, pad, y);
      ctx.fillStyle = ink;    ctx.fillText(t, pad, y);
    });
    ctx.restore();
  }

  /* ── THE TOOL'S OWN WORDMARK ──────────────────────────────────────────────────────────────
     READ OFF THE PAGE, not copied in here. Every tool in this family wears the same mark in its
     own letter — µJump, δJump, χJump — built in HTML as `<h1 class="logo"><span class="mu">µ</span>
     <span class="jm">Jump</span></h1>` with an arrow after it in CSS. Drawing it here from that
     element's own text means a tool renamed, or a ninth one added, needs nothing from this file;
     an image asset would have been a ninth copy of a thing that is already written down.

     The accent letter and the ink word are the page's own two colours, for the same reason. */
  function wordmark(){
    try {
      var el = document.querySelector("h1.logo, .logo");
      var mu = el && el.querySelector(".mu"), jm = el && el.querySelector(".jm");
      if (mu && jm) return { mark: mu.textContent.trim(), word: jm.textContent.trim() };
      var t = (el && el.textContent || "").trim();
      if (t) return { mark: t.slice(0, 1), word: t.slice(1) };
    } catch (_e){}
    return null;
  }
  function drawMark(ctx, w, h){
    var m = wordmark();
    if (!m) return;
    var pad = Math.max(10, Math.round(w * 0.025));
    var font = Math.max(12, Math.round(h * 0.052));
    var ink = cssColor("--ink", "#ffffff"), accent = cssColor("--accent", "#49b0ff");
    var halo = cssColor("--bg", "#000000");
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, Math.round(font * 0.26));
    var fam = "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    /* Measured right to left, because it is anchored to the right-hand edge. */
    ctx.font = "700 " + Math.round(font * 0.62) + "px " + fam;
    var arrowW = ctx.measureText("\u2197").width;
    ctx.font = "800 " + font + "px " + fam;
    var wordW = ctx.measureText(m.word).width;
    ctx.font = "italic 800 " + font + "px " + fam;
    var markW = ctx.measureText(m.mark).width;
    /* A QUARTER OF THE ARROW'S WIDTH OF SLACK. measureText returns the advance, and the ↗ glyph
       paints past its own: anchored at exactly the padding, its tip was clipped by the right edge
       in both themes. Seen by looking at the file, not by reading the arithmetic. */
    var x = w - pad - arrowW * 1.25 - wordW - markW, y = h - pad;
    ctx.strokeStyle = halo;
    ctx.font = "italic 800 " + font + "px " + fam;
    ctx.strokeText(m.mark, x, y); ctx.fillStyle = accent; ctx.fillText(m.mark, x, y);
    ctx.font = "800 " + font + "px " + fam;
    ctx.strokeStyle = halo;
    ctx.strokeText(m.word, x + markW, y); ctx.fillStyle = ink;
    ctx.fillText(m.word, x + markW, y);
    ctx.font = "700 " + Math.round(font * 0.62) + "px " + fam;
    ctx.strokeStyle = halo;
    ctx.strokeText("\u2197", x + markW + wordW, y - Math.round(font * 0.42));
    ctx.fillStyle = accent;
    ctx.fillText("\u2197", x + markW + wordW, y - Math.round(font * 0.42));
    ctx.restore();
  }

  /* Everything that goes on top of the render, in one place, so the picture and every frame of the
     turn carry the same furniture. */
  function decorate(ctx, f, opts){
    var o = opts || {};
    if (o.bar !== false) drawBar(ctx, f.w, f.h, barFor(f.nmPerPx, f.w));
    if (o.title !== false) drawTitle(ctx, f.w, f.h, legendLines());
    if (o.mark !== false) drawMark(ctx, f.w, f.h);
  }

  /* ── THE PICTURE ──────────────────────────────────────────────────────────────────────────── */
  function imageBlob(opts){
    var o = opts || {};
    var f = m3d().frame();
    if (!f) return Promise.reject(new Error("there is no 3D panel open to photograph"));
    var p = paint(f);
    decorate(p.ctx, f, o);
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
    /* Worked out ONCE, before the turn starts, and reused for every frame: the camera distance
       does not change as the model turns, so recomputing the bar per frame would only risk it
       flickering between two round numbers at the boundary. */
    var deco = { bar: o.bar, title: o.title, mark: o.mark,
                 fixed: o.bar === false ? null : barFor(first.nmPerPx, first.w),
                 lines: o.title === false ? [] : legendLines() };
    return gifenc().then(function(G){
      var w = first.w, h = first.h;
      /* The sample, for the palette. */
      var want = [0, Math.floor(n / 3), Math.floor(2 * n / 3)], got = [];
      M.turn(n, function(k){ if (want.indexOf(k) >= 0) got.push(frameRGBA(M.frame(), deco)); });
      var sample = new Uint8ClampedArray(w * h * 4 * got.length);
      got.forEach(function(g, i){ sample.set(g, i * w * h * 4); });
      var pal = G.quantize(sample, 256, { format: "rgb565" });
      got.length = 0;

      var enc = G.GIFEncoder();
      M.turn(n, function(k){
        var rgba = frameRGBA(M.frame(), deco);
        var idx = G.applyPalette(rgba, pal, "rgb565");
        enc.writeFrame(idx, w, h, { palette: k === 0 ? pal : undefined,
                                    delay: Math.round(1000 / fps) });
      });
      enc.finish();
      return new Blob([enc.bytes()], { type: "image/gif" });
    });
  }
  /* ── TWELVE LEVELS OF GRAIN, FOR A MACHINE THAT COUNTS IN THIRTY-TWOS ──────────────────────
     Søren, asked where the rings are: the exported PNG and the rotating GIF, not the panel. The
     PNG measures clean — 2px of one value across 1240. The GIF measured 351. This is why.

     gifenc keys every pixel by rgb888_to_rgb565, in `quantize` when it chooses the palette and in
     `applyPalette` when it looks one up. The smallest difference either can see is 8 of 255 on red
     and blue and 4 on green. The field spans eighteen levels in the light theme: two bins. The
     half-level of noise in the shader was sized for a framebuffer's eight bits and is invisible at
     this grid, so the gradient arrived as flat slabs with hard joins.

     TWELVE LEVELS, then — half as much again as a 5-bit step. Eight is not enough, because the
     light field's middle is the page's own white at 253.7 and its bin starts at 248: four down is
     still the same bin and four up clamps, so the brightest plateau could not break up at all. The
     flat run across a 1240px row goes 44px at eight, 8px at ten, 6px at twelve.

     Equally on all three channels, so a grey stays a grey; and from ign(x, y), which depends on
     position alone, so the grain is a fixed texture the model turns underneath rather than
     something that crawls from frame to frame. A white-noise hash in its place measured 254px:
     uniform random values clump, and a clump on one side of a boundary is a flat patch. ign is
     low-discrepancy, which is precisely the property that stops that.

     The same function as the shader's, in JavaScript. A GIF cannot hold more than three values
     across this ramp whatever is done to it; what it can hold is three values mixed. 2026-10-04. */
  function grain(d, w){
    var i, x, y, t;
    for (i = 0; i < d.length; i += 4){
      x = (i >> 2) % w; y = (i >> 2) / w | 0;
      t = (x * 0.06711056 + y * 0.00583715) % 1;
      t = (52.9829189 * t) % 1 - 0.5;
      d[i] += t * 12; d[i + 1] += t * 12; d[i + 2] += t * 12;
    }
    return d;
  }

  /* One frame, right way up, with the same furniture on it, as the flat RGBA the encoder wants. */
  function frameRGBA(f, deco){
    var p = paint(f);
    if (deco.fixed) drawBar(p.ctx, f.w, f.h, deco.fixed);
    if (deco.lines && deco.lines.length) drawTitle(p.ctx, f.w, f.h, deco.lines);
    if (deco.mark !== false) drawMark(p.ctx, f.w, f.h);
    return grain(p.ctx.getImageData(0, 0, f.w, f.h).data, f.w);
  }

  /* ── WHAT TO SAY ABOUT IT ─────────────────────────────────────────────────────────────────
     Søren, asked what a post should say: "It should say which cell it is and if there are
     organelles, then also which organelles."

     THE SAME LIST AS THE CORNER, so a post and the picture it carries cannot disagree about what
     is in it. Then the dataset, read from the volume registry rather than typed here — on ωJump
     that is one of sixty-three names and no caption written in this file could know which. Then
     the bar, because a reader scrolling past deserves the scale without opening anything. Then the
     tool and where to find it, which is the only part that is advertising and is kept to five
     words.

     The composer is where it gets edited. This is what is there when there is no time to. */
  function datasetName(){
    try {
      var v = window.UJ && UJ.volumes && UJ.volumes.primary && UJ.volumes.primary();
      if (v && v.label) return String(v.label);
      var c = window.UJ && UJ.cfg && UJ.cfg.volume;
      if (c && (c.label || c.key)) return String(c.label || c.key);
    } catch (_e){}
    return "";
  }
  function toolName(){
    var m = wordmark();
    return m ? (m.mark + m.word) : "";
  }
  function captionFor(opts){
    var o = opts || {};
    var bits = [];
    var names = legendLines();
    if (names.length) bits.push(names.join(" \u00b7 "));
    var ds = o.dataset || datasetName();
    var tail = [];
    if (ds) tail.push(ds);
    try {
      var f = m3d().frame();
      if (f) tail.push(barFor(f.nmPerPx, f.w).label + " scale bar");
    } catch (_e){}
    if (tail.length) bits.push(tail.join(", "));
    var tool = o.tool || toolName();
    if (tool) bits.push("Rendered in " + tool + ": grubblab.com");
    return bits.join(" \u2014 ");
  }

  /* ── SHARING IT ───────────────────────────────────────────────────────────────────────────
     Søren: "There should also be a share option to share it on Bluesky/LinkedIn/X."

     NONE OF THE THREE TAKES AN IMAGE THROUGH A LINK. Their composers accept text and a URL, and
     that is all — an intent URL cannot carry a picture, on any of them. So there are two honest
     routes and this takes whichever the browser offers:

       the share sheet   navigator.share with the file. On a phone this is the real thing: the OS
                         sheet opens with the PNG or the GIF attached and Bluesky, LinkedIn and X
                         are all in it. Windows has it too, with a shorter list.
       the clipboard     everywhere else. The picture goes to the clipboard, the caption with it,
                         and the composer opens in a new tab for one paste. Clipboard images are
                         PNG only — a GIF cannot be put on a clipboard at all — so a turn shared
                         this way is downloaded instead, and the caller is told which happened.

     It returns WHAT IT DID rather than throwing or going quiet, because the two routes need
     different things from the person afterwards and only the caller can say so on screen. */
  var NETS = {
    bluesky:  { name: "Bluesky",  url: function(t){ return "https://bsky.app/intent/compose?text=" + encodeURIComponent(t); } },
    linkedin: { name: "LinkedIn", url: function(){ return "https://www.linkedin.com/feed/?shareActive=true"; } },
    x:        { name: "X",        url: function(t){ return "https://x.com/intent/post?text=" + encodeURIComponent(t); } }
  };
  function nets(){ return Object.keys(NETS).map(function(k){ return { key: k, name: NETS[k].name }; }); }
  function composerUrl(key, text){
    var n = NETS[key] || NETS.bluesky;
    return n.url(text || "");
  }
  /* Can this browser hand a file to the OS? Asked of the real file, because Chrome says yes to
     navigator.share and no to this one for a type it will not carry. */
  function canShareFile(file){
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); }
    catch (_e){ return false; }
  }
  function shareView(opts){
    var o = opts || {};
    var text = o.text || captionFor(o);
    var want = o.what === "turn" ? turnBlob(o) : imageBlob(o);
    return want.then(function(blob){
      var ext = blob.type === "image/gif" ? "gif" : "png";
      var name = (o.name || "cell") + "_" + stamp() + "." + ext;
      var file = null;
      try { file = new File([blob], name, { type: blob.type }); } catch (_e){}
      if (file && canShareFile(file))
        return navigator.share({ files: [file], text: text })
          .then(function(){ return { how: "sheet", text: text }; })
          .catch(function(e){
            /* A dismissed sheet is not a failure and must not fall through to a download the
               person did not ask for. */
            if (e && (e.name === "AbortError" || /abort|cancel/i.test(e.message || "")))
              return { how: "cancelled", text: text };
            return viaClipboard(blob, name, text);
          });
      return viaClipboard(blob, name, text);
    });
  }
  function viaClipboard(blob, name, text){
    var copied = Promise.resolve(false);
    if (blob.type === "image/png"){
      try {
        copied = navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
                   .then(function(){ return true; }).catch(function(){ return false; });
      } catch (_e){ copied = Promise.resolve(false); }
    }
    return copied.then(function(ok2){
      if (!ok2) save(blob, name);          // the file still has to reach them somehow
      return { how: ok2 ? "clipboard" : "download", text: text, file: name };
    });
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
           legendLines: legendLines, wordmark: wordmark, captionFor: captionFor,
           shareView: shareView, nets: nets, composerUrl: composerUrl,
           imageBlob: imageBlob, turnBlob: turnBlob,
           saveImage: saveImage, saveTurn: saveTurn,
           _vendorUrl: vendorUrl, _reset: function(){ GIF = null; } };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = (typeof window !== "undefined" ? window : global).UJ.mesh3dshot;
