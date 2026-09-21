# -*- coding: utf-8 -*-
u"""What core/tracingcard.js needs to run on χJump, where a cell is an assembly of fragments.   2026-09-21

χJump step 2. core/segread.js now reads cb2's raw, displaced segmentation (step 1). Four things
between that and the card, each defaulting to exactly today's behaviour on the five pages that
already carry it:

  1. tracingSources() passes segInfo / nucInfo / segOffsetNm / nucOffsetNm through. It rebuilt the
     sources object field by field and would have dropped them, so the card's own configure() of
     segread would read cb2 at the EM's z -- 48 µm off -- with no info to read it with.
  2. core/segpaint.js's configure registers the same two things with segread, because the card
     configures segpaint on its own (when the tick is used before a coordinate has been resolved).
  3. The segmentation tick paints the WHOLE CELL. On cb2 the root box holds one fragment -- a few
     µm of neurite -- and the cell is 100 to 300 of them. UJ.cfg.tracing.cellIdsFor(id) returns the
     rest; segpaint.paint takes them as o.rootAlso, in the cell's colour. A raw plane is matched
     against them through a lookup by the low word, since 300 ids per voxel is too many to loop.
  4. UJ.cfg.tracing.idLabels names the two id boxes. On χJump the "nucleus" box holds the cell's
     key (cb2/htem/pc_0, cb2:41) -- what an organelle there is filed under -- and the root box a
     fragment. Labels are what the eye reads; see the 2026-09-17 note beside them.

Run: python3 src/the_card_on_a_volume_of_fragments.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)

print("core/tracingcard.js")
edit("core/tracingcard.js", [
 (u"1. sources keep a displaced volume's geometry",
  u'''  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res,
           skipScales: o.skipScales || [] };''',
  u'''  /* segInfo/nucInfo and segOffsetNm/nucOffsetNm too, 2026-09-21: χJump's cb2 segmentation
     keeps its info elsewhere and sits 1,216 sections below its EM. Dropped here, every configure
     the card makes would read it at the EM's z. See core/segread.js. */
  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res,
           skipScales: o.skipScales || [],
           segInfo: o.segInfo || "", nucInfo: o.nucInfo || "",
           segOffsetNm: o.segOffsetNm || null, nucOffsetNm: o.nucOffsetNm || null };'''),
 (u"3. the tick paints the whole cell",
  u'''    const got = await UJ.segpaint.paint(cv, PAD_VIEW, { root: root, nuc: nuc, alpha: 0.4,''',
  u'''    /* THE WHOLE CELL, where a cell is many segments.  2026-09-21. On χJump the root box holds
       one fragment and the cell is every fragment of its assembly; the host says which. */
    let also = [];
    try {
      const f = UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.cellIdsFor;
      if (root && typeof f === "function") also = (f(root) || []).map(String).filter(function(x){ return x && x !== root; });
    } catch (_e){ also = []; }
    const got = await UJ.segpaint.paint(cv, PAD_VIEW, { root: root, rootAlso: also, nuc: nuc, alpha: 0.4,'''),
 (u"...and says so",
  u'''    const said = [part("root", root, got && got.cell), part("nucleus", nuc, got && got.nucleus)]''',
  u'''    const said = [part(also.length ? "cell (" + (also.length + 1) + " segments)" : "root",
                       root, got && got.cell), part("nucleus", nuc, got && got.nucleus)]'''),
 (u"3b. ...and the viewer link selects the whole cell",
  u'''    cellLayer.segments = [String(root)];
    cellLayer.objectAlpha = 0.35;''',
  u'''    cellLayer.segments = [String(root)];
    /* Every segment of the cell, where a cell is many (χJump); see padSegOverlay. */
    try {
      const f = UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.cellIdsFor;
      if (typeof f === "function") (f(String(root)) || []).forEach(function(x){
        x = String(x); if (x && cellLayer.segments.indexOf(x) < 0) cellLayer.segments.push(x); });
    } catch (_e){}
    cellLayer.objectAlpha = 0.35;'''),
 (u"4. the id boxes are named by the host",
  u'''    /* Only what this module built is trimmed — see padTrimForHost's header. */
    try { padTrimForHost(el); } catch (_e){}''',
  u'''    /* Only what this module built is trimmed — see padTrimForHost's header. */
    try { padTrimForHost(el); } catch (_e){}
    try { tracingLabelIds(el); } catch (_e){}'''),
 (u"...by this",
  u'''UJ.tracingcard = UJ.tracingcard || {};''',
  u'''/* ── WHAT THE TWO ID BOXES ARE CALLED HERE ─────────────────────────  2026-09-21
   UJ.cfg.tracing.idLabels = {nuc, root, nucNumeric, rootNumeric}. On χJump the first box holds a
   cell's key -- "cb2/htem/pc_0", not a number -- and the second a fragment. */
function tracingLabelIds(el){
  var L = null;
  try { L = UJ.cfg.tracing.idLabels; } catch (_e){ L = null; }
  if (!L) return;
  [["tracingNucId", L.nuc, L.nucNumeric], ["tracingRootId", L.root, L.rootNumeric]].forEach(function(t){
    var inp = el.querySelector("#" + t[0]);
    if (!inp) return;
    var lab = inp.parentNode && inp.parentNode.parentNode ? inp.parentNode.parentNode.querySelector("label") : null;
    if (t[1] && lab) lab.innerHTML = t[1];
    if (t[2] === false) inp.removeAttribute("inputmode");
  });
}
UJ.tracingcard = UJ.tracingcard || {};'''),
])

print("core/segpaint.js")
edit("core/segpaint.js", [
 (u"2. configure registers a displaced volume",
  u'''    CFG = { seg: UJ.segread._httpBase(cfg.seg), nuc: UJ.segread._httpBase(cfg.nuc),
            res: cfg.res || [4, 4, 40] };
    return CFG;''',
  u'''    CFG = { seg: UJ.segread._httpBase(cfg.seg), nuc: UJ.segread._httpBase(cfg.nuc),
            res: cfg.res || [4, 4, 40] };
    /* Where each volume's info lives and how far it sits from the tool's frame, registered with
       segread -- whose _getInfo and _chunkBuf this file reads through. 2026-09-21, χJump. */
    if (UJ.segread.borrowInfo){
      if (CFG.seg){ UJ.segread.borrowInfo(CFG.seg, cfg.segInfo); UJ.segread.setOffsetNm(CFG.seg, cfg.segOffsetNm); }
      if (CFG.nuc){ UJ.segread.borrowInfo(CFG.nuc, cfg.nucInfo); UJ.segread.setOffsetNm(CFG.nuc, cfg.nucOffsetNm); }
    }
    return CFG;'''),
 (u"3. the cell's other segments, in its colour",
  u'''    if (root)
      out.cell = await layer(img.data, view, SEG, [root], [CELL_COLOR], alpha, tick);''',
  u'''    /* o.rootAlso: the cell's OTHER segments, same colour -- χJump, where a cell is 100-300
       fragments and the root box holds one. 2026-09-21. */
    var cellIds = root ? [root].concat((o.rootAlso || []).map(idPair).filter(Boolean)) : [];
    if (root)
      out.cell = await layer(img.data, view, SEG, cellIds, [CELL_COLOR], alpha, tick);'''),
])

print("core/segread.js")
edit("core/segread.js", [
 (u"3. a raw plane against many ids, by the low word",
  u'''    var d = new Uint32Array(buf);
    if (d.length < sh[0] * sh[1] * sh[2] * words) return out;
    var z0 = sh[0] * sh[1] * lz;
    for (var y = 0; y < sh[1]; y++)
      for (var x = 0; x < sh[0]; x++){
        var i = z0 + x + sh[0] * y, lo, hi;
        if (words === 1){ lo = d[i] >>> 0; hi = 0; } else { lo = d[2 * i] >>> 0; hi = d[2 * i + 1] >>> 0; }
        if (!lo && !hi) continue;
        for (var k = 0; k < nw; k++)
          if (wanted[k].lo === lo && wanted[k].hi === hi){ out[y * ch[0] + x] = k + 1; break; }
      }
    return out;''',
  u'''    var d = new Uint32Array(buf);
    if (d.length < sh[0] * sh[1] * sh[2] * words) return out;
    /* By the low word: a χJump cell is up to ~300 ids, and 300 comparisons per voxel is the
       quarter-million-voxel stall this function exists to avoid. */
    var byLo = new Map();
    for (var q = 0; q < nw; q++){
      var L = byLo.get(wanted[q].lo);
      if (!L) byLo.set(wanted[q].lo, L = []);
      L.push(q);
    }
    var z0 = sh[0] * sh[1] * lz;
    for (var y = 0; y < sh[1]; y++)
      for (var x = 0; x < sh[0]; x++){
        var i = z0 + x + sh[0] * y, lo, hi;
        if (words === 1){ lo = d[i] >>> 0; hi = 0; } else { lo = d[2 * i] >>> 0; hi = d[2 * i + 1] >>> 0; }
        if (!lo && !hi) continue;
        var cand = byLo.get(lo);
        if (!cand) continue;
        for (var k = 0; k < cand.length; k++)
          if (wanted[cand[k]].hi === hi){ out[y * ch[0] + x] = cand[k] + 1; break; }
      }
    return out;'''),
])
