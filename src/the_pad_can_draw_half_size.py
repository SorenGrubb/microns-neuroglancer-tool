# -*- coding: utf-8 -*-
u"""The pad can draw the widest level at half size, so a whole cell fits -- on a phone too.   2026-09-22

Søren, with a phone screenshot of ηJump's pad at "10 µm across — 32 nm data": "This is still too
small to segment the cell, we need a larger view also".

The pad draws one voxel per pixel at its widest, so its width in µm is the canvas width times the
coarsest single-section level: 560 px x 32 nm = 18 µm on a desktop, 320 px x 32 nm = 10 µm on a
phone. There is no coarser single-section level to go to (H01's 64 nm averages two sections).

core/emtiles.js: drawSection takes zoom 0.5 (and 0.25). It reads twice as many voxels each way and
draws each 2x2 block as ONE pixel, the mean of the four -- averaging, not picking, so a membrane
one voxel wide is not dropped at random. toolAt/pxAt/effNmPerPx/umAcross already divide by the
zoom, so the pad's clicks, contours, segmentation overlay and pan all follow unchanged.

core/tracingcard.js: padRelabelMips puts "<widest mip>:0.5" at the top of the menu wherever the
widest view (at 560 px) is under 30 µm -- every volume here -- labelled with what it shows
("36 µm across — 32 nm data, drawn half size"; 20 µm on a phone). Cost: four times the chunks of
the widest level on the first draw; the chunks are cached, so stepping through sections is free
until the next 64-section block.

Checks: emtilescheck.js (half size), padreachcheck.js (the menu, on a 560 and a 320 px pad).
Run: python3 src/the_pad_can_draw_half_size.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/emtiles.js", [
 (u"zoom may be a half or a quarter",
  u'''    var zoom = Math.max(1, Math.min(16, opts.zoom | 0 || 1));''',
  u'''    /* HALF AND QUARTER SIZE, 2026-09-22 (src/the_pad_can_draw_half_size.py): below 1 the window
       holds more voxels than the canvas has pixels, and each k x k block is drawn as its mean. */
    var zr = +opts.zoom || 1;
    var zoom = zr >= 1 ? Math.max(1, Math.min(16, zr | 0)) : (1 / zr <= 2.5 ? 0.5 : 0.25);'''),
 (u"a block of voxels becomes one pixel, their mean",
  u'''    for (var py2 = 0; py2 < vh; py2++){
      for (var px2 = 0; px2 < vw; px2++){
        var o2 = py2 * vw + px2;''',
  u'''    if (zoom < 1){
      /* The MEAN of each k x k block, not one voxel of it: a membrane one voxel wide would
         otherwise vanish or survive depending on where the block boundary fell. */
      var kk = Math.round(1 / zoom);
      for (var hy = 0; hy < h; hy++){
        for (var hx = 0; hx < w; hx++){
          var sum = 0, cnt = 0;
          for (var dy = 0; dy < kk; dy++){
            var vy = hy * kk + dy; if (vy >= vh) break;
            for (var dx = 0; dx < kk; dx++){
              var vx = hx * kk + dx; if (vx >= vw) break;
              var oh = vy * vw + vx;
              if (seen[oh]){ sum += raw[oh]; cnt++; }
            }
          }
          if (!cnt) continue;
          var vm = (sum / cnt - loUsed) * 255 / spanUsed;
          vm = vm < 0 ? 0 : vm > 255 ? 255 : vm;
          var oo = (hy * w + hx) * 4;
          img.data[oo] = img.data[oo + 1] = img.data[oo + 2] = vm;
        }
      }
    } else
    for (var py2 = 0; py2 < vh; py2++){
      for (var px2 = 0; px2 < vw; px2++){
        var o2 = py2 * vw + px2;'''),
])

edit("core/tracingcard.js", [
 (u"the half-size level goes on top",
  u'''      [].forEach.call(sel.options, function(o){ o.textContent = o.textContent.replace(/, slower to load$/, ""); });
    }
  } catch (_e){}''',
  u'''      [].forEach.call(sel.options, function(o){ o.textContent = o.textContent.replace(/, slower to load$/, ""); });
    }
    /* ── HALF SIZE ──────────────────────────────────────────────────────────  2026-09-22
       Søren, from a phone: "This is still too small to segment the cell, we need a larger view
       also". The widest level drawn at half size -- each 2x2 block of voxels one pixel, their
       mean -- wherever the widest view at 560 px is under 30 µm, which is every volume here.
       See src/the_pad_can_draw_half_size.py. */
    var wMip = 0;
    [].forEach.call(sel.options, function(o){
      var pp = String(o.value).split(":");
      if (parseFloat(pp[1] || 1) >= 1) wMip = Math.max(wMip, parseInt(pp[0], 10) || 0);
    });
    var hv = wMip + ":0.5";
    if (![].some.call(sel.options, function(o){ return o.value === hv; })){
      var sw = await UJ.emtiles.scaleAt(wMip, tracingSlabOk());
      if (sw && sw.scale && 560 * sw.scale.resolution[0] / 1000 < 30){
        var oh = document.createElement("option");
        oh.value = hv; oh.textContent = "0 \\u00b5m across \\u2014 0 nm data, drawn half size";
        oh.title = "Twice as much tissue: each pixel is the mean of 2\\u00d72 voxels. Four times the chunks on the first draw.";
        sel.insertBefore(oh, sel.options[0]);
      }
    }
  } catch (_e){}'''),
 (u"the widest-view sum reads a fractional zoom",
  u'''560 * sq.scale.resolution[0] / Math.max(1, parseInt(pq[1], 10) || 1) / 1000);''',
  u'''560 * sq.scale.resolution[0] / (parseFloat(pq[1]) || 1) / 1000);'''),
 (u"...and so does the relabel",
  u'''    var mip = parseInt(parts[0], 10) || 0, zoom = Math.max(1, parseInt(parts[1], 10) || 1);''',
  u'''    var mip = parseInt(parts[0], 10) || 0, zoom = parseFloat(parts[1]) > 0 ? parseFloat(parts[1]) : 1;'''),
])

# 2026-09-22, the same day: ", slower to load" was judged on options 0 and 1, which after the
# half-size level went on top are the SAME mip -- so the warning was never removed where it is
# untrue (Lee16, V1DD). It is judged on the first two levels drawn 1:1 or closer now.
edit("core/tracingcard.js", [
 (u"the chunk warning is judged on the 1:1 levels",
  u'''    try {
      var cs = got.scale.chunk_sizes && got.scale.chunk_sizes[0];
      if (i === 0) chunk0 = (cs && cs[0]) || 0;
      if (i === 1) chunk1 = (cs && cs[0]) || 0;
    } catch (_e){}''',
  u'''    try {
      var cs = got.scale.chunk_sizes && got.scale.chunk_sizes[0];
      /* The first two levels drawn 1:1 or closer -- not the half-size one on top, which is the
         same mip as the next and would make every volume look evenly chunked. */
      if (zoom >= 1){
        if (wide0 < 0){ wide0 = i; chunk0 = (cs && cs[0]) || 0; }
        else if (!chunk1) chunk1 = (cs && cs[0]) || 0;
      }
    } catch (_e){}'''),
 (u"...declared",
  u'''  var chunk0 = 0, chunk1 = 0;''',
  u'''  var chunk0 = 0, chunk1 = 0, wide0 = -1;'''),
 (u"...and applied to that level",
  u'''  if (sel.options.length && chunk0 && chunk1 && chunk0 >= chunk1)
    sel.options[0].textContent =
      sel.options[0].textContent.replace(/, slower to load$/, "");''',
  u'''  if (wide0 >= 0 && chunk0 && chunk1 && chunk0 >= chunk1)
    sel.options[wide0].textContent =
      sel.options[wide0].textContent.replace(/, slower to load$/, "");'''),
])
