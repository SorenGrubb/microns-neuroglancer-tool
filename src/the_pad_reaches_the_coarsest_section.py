# -*- coding: utf-8 -*-
u"""The pad reaches as far as the volume's single-section levels go.                   2026-09-21

Søren, on ηJump: "Things are just bigger in the human, so the maximum 12 µm across is too small".

The pad's zoom menu is six fixed levels whose widest is mip 2 -- minnie65's 32 nm, the coarsest
level there that is still one section. H01's levels are 4 / 8 / 16 / 32 nm, all 33 nm sections,
so mip 2 is only 16 nm and the widest view half what the volume could show. padRelabelMips(),
which already reads each level off the volume to label the menu, now also puts every coarser level
that still keeps ONE section, up to about 50 µm across, at the top of it: H01 gains 32 nm, twice as wide. A slab level (64 nm on
H01, which averages two sections) is added only where the host allows slabs (slabOk), as before.
µJump, δJump, πJump and λJump have no single-section level past mip 2, so their menus are unchanged.

Check: padreachcheck.js. Run: python3 src/the_pad_reaches_the_coarsest_section.py, then
python3 src/build_stamps.py
"""
import io, os
P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core/tracingcard.js")
s = io.open(P, encoding="utf-8").read()
OLD = u'''  var cv = document.getElementById("tracePad");
  var w = (cv && cv.width) || 560;
  var chunk0 = 0, chunk1 = 0;'''
NEW = u'''  /* ── AS FAR AS THE VOLUME GOES ─────────────────────────────────────────────  2026-09-21
     Søren, on ηJump: "Things are just bigger in the human, so the maximum 12 µm across is too
     small". The six fixed levels stop at mip 2, which is minnie65's 32 nm and H01's 16. Every
     coarser level that still keeps one section (or a slab, where the host allows slabs) goes on
     top. See src/the_pad_reaches_the_coarsest_section.py. */
  try {
    var s0 = await UJ.emtiles.scaleAt(0, tracingSlabOk());
    var nLv = (s0 && s0.count) || 0, topMip = 0;
    for (var k = 0; k < sel.options.length; k++){
      var mk = parseInt(String(sel.options[k].value).split(":")[0], 10) || 0;
      if (mk > topMip) topMip = mk;
    }
    for (var m = topMip + 1; m < nLv; m++){
      var v = m + ":1";
      if ([].some.call(sel.options, function(o){ return o.value === v; })) continue;
      var sm = await UJ.emtiles.scaleAt(m, tracingSlabOk());
      if (!sm || !sm.scale || (sm.slab > 1 && !tracingSlabOk())) break;
      /* Only while the widest view is under 15 µm (at the menu's 560 px): H01's was 9, which is
         a third of a human pyramidal soma. µJump's, δJump's and λJump's already reach 18-22 µm and
         stay as they were; a 290 µm pad would be a map, not a place to trace. */
      var widest = 0;
      for (var q = 0; q < sel.options.length; q++){
        var pq = String(sel.options[q].value).split(":"), sq = await UJ.emtiles.scaleAt(parseInt(pq[0], 10) || 0, tracingSlabOk());
        if (sq && sq.scale) widest = Math.max(widest, 560 * sq.scale.resolution[0] / Math.max(1, parseInt(pq[1], 10) || 1) / 1000);
      }
      if (widest >= 15) break;
      var op = document.createElement("option");
      op.value = v; op.textContent = "0 \\u00b5m across \\u2014 0 nm data";
      sel.insertBefore(op, sel.options[0]);
      /* ", slower to load" was a claim about minnie65's widest level; it is not the widest now. */
      [].forEach.call(sel.options, function(o){ o.textContent = o.textContent.replace(/, slower to load$/, ""); });
    }
  } catch (_e){}
  var cv = document.getElementById("tracePad");
  var w = (cv && cv.width) || 560;
  var chunk0 = 0, chunk1 = 0;'''
if NEW in s: print("already there")
else:
    assert s.count(OLD) == 1
    s = s.replace(OLD, NEW, 1); io.open(P, "w", encoding="utf-8").write(s); print("ok: coarser single-section levels join the menu")
