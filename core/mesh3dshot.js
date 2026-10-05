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
  /* Three lines at most, so the cap is now on how many KINDS share the third one rather than on
     how many lines there are. 2026-10-04. */
  var MAX_KINDS = 3;
  /* ── WHAT IT IS, WHERE IT IS, WHAT ELSE IS IN IT ──────────────────────────────────────────
     Søren: "I want the verdict on the cell type and the coordinates of the center of the nucleus.
     If there are organelles included, I want the type(s) of organelles not their numbers."

     Each line is left out when there is nothing to put in it, so a panel that knows nothing gets a
     clean picture rather than three blanks — and the caption below, which reads this same list,
     cannot then disagree with the corner about what is in the frame.

     VOXELS, AND IT DOES NOT SAY SO. Added on 4 October on the argument that a posted picture has
     no sentence around it to supply the unit; dropped on the 5th, on Søren's *"Drop the vox after
     the coordinates"*, which is the better argument: whoever reads a MICrONS coordinate knows what
     it is, and the one thing anybody does with it is paste it into Neuroglancer's position box,
     which wants those three numbers and not a fourth word. Voxels rather than micrometres for
     ujump.html's reason -- micrometres do not paste back. 2026-10-05. */
  function legendLines(){
    var L = null;
    try { L = m3d().legend(); } catch (_e){ return []; }
    if (!L) return [];
    var out = [], k = L.kinds || [];
    if (L.verdict) out.push(L.verdict);
    if (L.atVox) out.push(L.atVox[0] + ", " + L.atVox[1] + ", " + L.atVox[2]);
    if (k.length) out.push(k.length <= MAX_KINDS ? k.join(", ")
                           : k.slice(0, MAX_KINDS - 1).join(", ")
                             + " + " + (k.length - (MAX_KINDS - 1)) + " more");
    return out;
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

      /* ── A RAMP THE QUANTISER CANNOT SEE ──────────────────────────────────────────────────
         Søren: *"GIF is more important that it looks nice"*, and it is already past Bluesky's
         megabyte, so the trade that was made for size is not the trade to keep.

         gifenc keys every pixel through rgb888_to_rgb565 — in `quantize` when it chooses colours
         and in `applyPalette` when it looks one up — so the smallest difference it can see is 8 of
         255 on red and blue. The field spans eighteen levels. Left to itself the quantiser cannot
         produce more than two or three background greys however many entries it is given, which is
         why twelve levels of grain were needed to break the slabs up, and why the turn had a visible
         texture on it.

         SO THE GREYS ARE PUT IN BY HAND. 216 colours are quantised for the model, and the rest of
         the table is an EXACT ramp across the field's own range, measured off the sample. Then
         every near-neutral pixel inside that range is mapped through a 256-entry lookup straight to
         the nearest rung, instead of through the 5-6-5 bin that cannot tell two rungs apart.
         applyPalette still answers for everything else, which is what it is good at.

         THE GRAIN THEN DROPS FROM TWELVE LEVELS TO THREE, because the rungs are now about half a
         level apart rather than eight. It is still there — a ramp is still a ramp — but it is at
         the scale the screen's own dither runs at rather than one you can see. */
      /* ── THE FIELD'S RANGE, FROM THE FIELD ────────────────────────────────────────────────
         The first version of this took the darkest and lightest near-neutral pixel anywhere in the
         sample, which is black text and a white halo: a ramp of forty rungs across 0-255 instead of
         across eighteen levels, steps of six where the point was steps of one, and the slabs came
         straight back at 219px. Measured, which is the only reason it was noticed.

         THE PERIMETER IS ALL FIELD. Nothing this exporter draws touches the edge -- the title, the
         bar and the wordmark all sit inside a pad -- and the model is framed well inside it. So the
         outermost two-pixel ring of the first frame is the field and nothing else, and a 2nd/98th
         percentile over it drops anything that slipped in anyway. */
      var i, x, y, edge = [];
      for (y = 0; y < h; y++){
        for (x = 0; x < w; x++){
          if (y > 1 && y < h - 2 && x > 1 && x < w - 2) { x = w - 3; continue; }
          i = (y * w + x) * 4;
          edge.push([sample[i], sample[i+1], sample[i+2]]);
        }
      }
      edge.sort(function(a, b){ return a[1] - b[1]; });
      /* AVERAGED OVER THE TAILS, not read off one pixel at each end. A single pixel carries the
         dither's own level and a half, and the direction taken from two of them is wrong by enough
         that extrapolating it four times over -- which is what the dark theme needs, its perimeter
         spanning six levels -- misses the middle of its own field. shotcheck.js said so: 74px of
         slab on a fixture that is almost all field. */
      function tail(a, b){
        var s = [0, 0, 0], k, n = 0;
        for (k = a; k < b && k < edge.length; k++){
          s[0] += edge[k][0]; s[1] += edge[k][1]; s[2] += edge[k][2]; n++;
        }
        return n ? [s[0]/n, s[1]/n, s[2]/n] : [0, 0, 0];
      }
      var lo = tail(0, Math.max(1, Math.floor(edge.length * 0.05)));
      var hi = tail(Math.floor(edge.length * 0.95), edge.length);
      /* ── AND THE RAMP FOLLOWS THE FIELD'S OWN COLOUR, NOT GREY ────────────────────────────
         The first version built a ramp of greys and tested pixels for neutrality, and the DARK
         theme's field is not neutral: it is #0d1117 lifted, and the lift multiplies each channel,
         so the brighter it gets the more blue it is -- 20, 26, 36 at the middle, where the test
         wanted the three within six of each other. Light mode went to 4px of flat and dark stayed
         at 219, which is what said so.

         So the ramp is the LINE from the field's darkest corner to past its brightest middle, in
         three channels, and a pixel belongs to it when it sits on that line. Grey was a special
         case of this that happened to fit one theme. */
      /* ── AND THE BRIGHT END IS MEASURED, NOT GUESSED ─────────────────────────────────────
         The perimeter sees the field's dim end; its brightest point is the middle of the picture,
         behind the model. The first version guessed it at twice the perimeter's span, which
         overshot by about half -- and since every rung spends an entry the wordmark then does not
         get, overshooting put stripes through the µ while capping the rungs put the slabs back at
         18px. Neither, if the far end is simply looked for.

         ONE PASS ALONG THE LINE. The direction is the perimeter's own dim-to-bright; a pixel is on
         the field when its red and blue match what that direction predicts from its green; and the
         brightest such pixel in the sample is where the field actually ends. */
      var dir = [hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]];
      var top = hi[1];
      if (dir[1] > 0){
        for (i = 0; i < sample.length; i += 4){
          var gv = sample[i+1];
          if (gv <= top) continue;
          var tt = (gv - lo[1]) / dir[1];
          if (Math.abs(sample[i]   - (lo[0] + dir[0]*tt)) > 3) continue;
          if (Math.abs(sample[i+2] - (lo[2] + dir[2]*tt)) > 3) continue;
          top = gv;
        }
      }
      var ext = dir[1] > 0 ? (top - lo[1]) / dir[1] : 1;
      var c0 = [Math.max(0, lo[0] - 2), Math.max(0, lo[1] - 2), Math.max(0, lo[2] - 2)];
      var c1 = [Math.min(255, Math.round(lo[0] + dir[0] * ext) + 2),
                Math.min(255, Math.round(lo[1] + dir[1] * ext) + 2),
                Math.min(255, Math.round(lo[2] + dir[2] * ext) + 2)];
      var gSpan = c1[1] - c0[1];
      /* TWENTY-FOUR RUNGS IS ENOUGH, AND THE REST OF THE TABLE IS NOT FREE. Every rung taken for
         the field is a colour the model and the wordmark do not get, and at 48 the accent teal had
         so few shades left that the µ came out striped. The field's real span is under twenty
         levels in both themes, so the rungs stay about a level apart and the other 232 entries go
         where the picture is. */
      var RAMP = (gSpan >= 4) ? Math.min(40, Math.max(8, gSpan + 1)) : 0;
      var pal = G.quantize(sample, 256 - RAMP, { format: "rgb565" });
      var rampAt = pal.length, LINE = [];
      for (i = 0; i < RAMP; i++){
        var f = i / (RAMP - 1);
        LINE.push([Math.round(c0[0] + (c1[0]-c0[0]) * f),
                   Math.round(c0[1] + (c1[1]-c0[1]) * f),
                   Math.round(c0[2] + (c1[2]-c0[2]) * f)]);
        pal.push(LINE[i]);
      }
      /* Which rung a green level belongs on, for every green there is. Built once; the other two
         channels are then checked against that rung rather than searched for. */
      var RUNG = new Uint8Array(256);
      for (i = 0; i < 256; i++){
        if (!RAMP){ RUNG[i] = 0; continue; }
        var r = Math.round((i - c0[1]) / (gSpan || 1) * (RAMP - 1));
        RUNG[i] = Math.max(0, Math.min(RAMP - 1, r));
      }
      got.length = 0;

      /* ── AND THE FIELD'S OWN COLOUR GOES TO INDEX 0 ───────────────────────────────────────
         Søren: *"I also noticed a green blinking of the background while it was turning."*

         It is index 0. gifenc hard-codes the Logical Screen Descriptor's background colour index to
         zero, a decoder paints that colour before the first frame and again on every loop, and the
         quantiser had sorted the light theme's accent teal — the wordmark's #0f766e — into that
         slot. Dark mode's index 0 happened to be near-black, so it only showed on the light one.
         Measured: the light turn's table began [12,115,107], [16,119,111], [19,122,114].

         So the entry nearest the field's own corner is swapped into index 0 and every frame's
         indices are remapped through the swap. Nothing about the picture changes; what the decoder
         paints between frames stops being a colour from the wordmark.

         AND dispose: 1 ON EVERY FRAME, which says "leave it there". The default lets a decoder
         choose, and "restore to background" is one of the choices. Two answers to one question,
         because the one that is easy to verify here is not the one every decoder obeys. */
      var corner = [sample[0], sample[1], sample[2]], best = 0, bestD = 1e9;
      for (i = 0; i < pal.length; i++){
        var d = (pal[i][0]-corner[0])*(pal[i][0]-corner[0])
              + (pal[i][1]-corner[1])*(pal[i][1]-corner[1])
              + (pal[i][2]-corner[2])*(pal[i][2]-corner[2]);
        if (d < bestD){ bestD = d; best = i; }
      }
      var swap = new Uint8Array(256);
      for (i = 0; i < 256; i++) swap[i] = i;
      if (best !== 0){
        var t = pal[0]; pal[0] = pal[best]; pal[best] = t;
        swap[0] = best; swap[best] = 0;
      }

      var enc = G.GIFEncoder();
      M.turn(n, function(k){
        var rgba = frameRGBA(M.frame(), deco);
        var idx = G.applyPalette(rgba, pal, "rgb565");
        var j, p, v;
        for (j = 0; j < idx.length; j++){
          p = j * 4;
          v = rgba[p+1];
          /* On the field's own line, inside its range: straight to its rung. */
          if (RAMP && v >= c0[1] && v <= c1[1]){
            var rg = LINE[RUNG[v]];
            /* FOUR LEVELS EITHER SIDE. Tight enough to leave the wordmark's antialiasing alone
               -- it runs through true greys, and the dark theme's field is a blue-grey whose red
               sits five levels below a true grey at the same green -- and loose enough to survive
               the direction being estimated from a seven-level baseline and then extrapolated
               three times over, which at ±2 lost the middle of the dark field and left 74px of
               slab. shotcheck.js, on a fixture that is almost all field, is what noticed. */
            if (Math.abs(rgba[p] - rg[0]) <= 4 && Math.abs(rgba[p+2] - rg[2]) <= 4)
              idx[j] = rampAt + RUNG[v];
          }
          idx[j] = swap[idx[j]];
        }
        enc.writeFrame(idx, w, h, { palette: k === 0 ? pal : undefined,
                                    dispose: 1,
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
      d[i] += t * 3; d[i + 1] += t * 3; d[i + 2] += t * 3;
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
