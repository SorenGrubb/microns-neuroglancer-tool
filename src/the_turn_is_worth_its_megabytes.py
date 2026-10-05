# -*- coding: utf-8 -*-
u"""The turn is worth its megabytes, and index 0 is not the wordmark's green.             2026-10-05

Søren: *"GIF is more important that it looks nice and if it is already too big for Bluesky, then why
not make it a bit bigger. I also noticed a green blinking of the background while it was turning."*

TWO THINGS, AND THE SECOND IS A BUG.

THE GREEN IS INDEX 0. gifenc hard-codes the Logical Screen Descriptor's background colour index to
zero; a decoder paints that colour before the first frame and again on every loop; and the quantiser
had sorted the light theme's accent teal — the wordmark's #0f766e — into that slot. Measured, the
light turn's colour table began [12,115,107], [16,119,111], [19,122,114]. Dark mode's index 0
happened to be near-black, so it only ever showed on the light one, and it blinked rather than
flashed once because a loop re-paints it every cycle.

Fixed twice over: the entry nearest the field's own corner is swapped into index 0 and every frame's
indices are remapped through the swap, and every frame is written with `dispose: 1` — "leave it
there" — because the default lets a decoder choose and "restore to background" is one of the
choices. Two answers to one question, because the one easy to verify here is not the one every
decoder obeys.

AND THE QUALITY WAS A TRADE MADE FOR A SIZE HE DOES NOT WANT. gifenc keys every pixel through
rgb888_to_rgb565, so the smallest difference it can see is 8 of 255 on red and blue; the field spans
eighteen levels; and the quantiser therefore cannot produce more than two or three background greys
however many entries it is given. That is why twelve levels of grain were needed to break up the
slabs, and why the turn had a visible texture on it.

SO THE GREYS ARE PUT IN BY HAND. 216 colours are quantised for the model and the rest of the table
is an EXACT ramp across the field's own measured range; every near-neutral pixel inside that range
is mapped through a 256-entry lookup straight to its rung, rather than through a 5-6-5 bin that
cannot tell two rungs apart. applyPalette still answers for everything else, which is what it is
good at. The grain then drops from twelve levels to three, because the rungs are about half a level
apart rather than eight.

Check: shotcheck.js — the flat-run measurement, and the colour table's first entry.
Run: python3 src/the_turn_is_worth_its_megabytes.py
     python3 src/build_stamps.py
     node shotcheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


OLD = r"""    return gifenc().then(function(G){
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
  }"""

NEW = r"""    return gifenc().then(function(G){
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
  }"""

edit("core/mesh3dshot.js", [

 (u"the turn is worth its megabytes", OLD, NEW),

 (u"...and the grain drops to what a half-level ramp needs",
  u"      d[i] += t * 12; d[i + 1] += t * 12; d[i + 2] += t * 12;",
  u"      d[i] += t * 3; d[i + 1] += t * 3; d[i + 2] += t * 3;"),
])
print("\nNow: python3 src/build_stamps.py, then node shotcheck.js")
