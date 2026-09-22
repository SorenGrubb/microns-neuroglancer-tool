# -*- coding: utf-8 -*-
u"""The viewer link carries one polyline per contour, not a line per edge.               2026-09-22

Søren: "It seems that even though we have succesfully reduced the number of points with the
polyline, it still uses the old JSON code with line annotations to open in Neuroglancer, if you can
confirm that, please build a new JSON code with the polyline annotations to open in Neuroglancer
instead."

Confirmed. lines_that_nearly_meet_are_one_contour.py joined loose line annotations on the way IN;
the way OUT was untouched. tracingRingLines wrote one {type:"line"} per EDGE, so a 26-vertex
contour left as 26 annotations holding 52 coordinates -- the contour twice over, every vertex
written as the end of one segment and the start of the next.

MEASURED IN HIS OWN BROWSER, spelunker.cave-explorer.org, 2026-09-22: a #! state carrying
{"type":"polyline","id":"pl_0","points":[[x,y,z] x8]} loads, is typed POLYLINE in the layer, and
comes back out of viewer.state.toJSON() with its eight points in order. The id is still mandatory
-- a state with none loads an empty layer in silence, measured the same way on 2026-09-22.

A ring goes out CLOSED, its first vertex repeated as the last: a polyline draws the segments
between consecutive points and nothing more, and that repeat is what Spelunker itself writes, which
is why core/tracing.js's ringFrom drops it on the way in. So the round trip is exact.

WHERE IT LIVES: UJ.tracing.ringAnnotations (core/tracing.js), beside the reader it is the inverse
of -- core/tracedoutlines.js needs it too and does not load core/tracingcard.js.

THE WAY BACK, if a viewer ever refuses them: JUMP_VIEWER_LINES = true in the console and every
link that page builds afterwards is lines again. tracingRingLines is kept for it. Not localStorage
-- ωJump's build refuses any key but the theme, and a half-remembered setting is its own trap.

Checks: polylinelinkcheck.js (written first, failed on 2,080 line annotations for 80 contours and a
321k link), organjumpcheck.js, organoutlinecheck.js.
Run: python3 src/the_viewer_link_is_polylines.py, then python3 src/build_stamps.py
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


# ── 1. the writer, beside the reader ──────────────────────────────────────────────────────────
edit("core/tracing.js", [
 (u"ringAnnotations",
  u'''  return { ringsFromLink: ringsFromLink, _readLayer: readLayer, fetchMany: fetchMany,''',
  u'''  /* ── THE WAY OUT ───────────────────────────────────────────────────────────  2026-09-22
     One POLYLINE per contour -- the inverse of polylineRing above, and the shape Spelunker itself
     writes. A ring is stored open here and goes out closed: the first vertex repeated as the last,
     because a polyline draws the segments between consecutive points and nothing more. ringFrom
     drops that repeat again on the way back in, so a link read by this file returns what it held.

     Every annotation carries an id. Measured in Søren's browser on 2026-09-22: a state whose
     annotations have none loads a layer with ZERO in it, in silence.

     opts.lines (or window.JUMP_VIEWER_LINES in the console) writes the old edge-per-line shape instead,
     for a viewer too old to know polylines. See src/the_viewer_link_is_polylines.py. */
  function viewerWantsLines(){
    try { return window.JUMP_VIEWER_LINES === true; } catch (_e){ return false; }
  }
  function ringAnnotations(rings, idPrefix, opts){
    var out = [];
    var asLines = (opts && typeof opts.lines === "boolean") ? opts.lines : viewerWantsLines();
    (rings || []).forEach(function(r, ri){
      var pts = r.points || [];
      if (pts.length < 3) return;
      var z = Math.round(r.z), i;
      if (asLines){
        for (i = 0; i < pts.length; i++){
          var a = pts[i], b = pts[(i + 1) % pts.length];
          out.push({ type: "line", id: idPrefix + "_" + ri + "_" + i,
                     pointA: [Math.round(a[0]), Math.round(a[1]), z],
                     pointB: [Math.round(b[0]), Math.round(b[1]), z] });
        }
        return;
      }
      var P = [];
      for (i = 0; i < pts.length; i++) P.push([Math.round(pts[i][0]), Math.round(pts[i][1]), z]);
      P.push(P[0].slice());
      out.push({ type: "polyline", id: idPrefix + "_" + ri, points: P });
    });
    return out;
  }

  return { ringsFromLink: ringsFromLink, _readLayer: readLayer, fetchMany: fetchMany,
           ringAnnotations: ringAnnotations,'''),
])

# ── 2. the card asks for it ───────────────────────────────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"the card's shared writer",
  u'''function tracingRingLines(rings, idPrefix){''',
  u'''/* POLYLINES, 2026-09-22: one annotation per contour instead of one per edge. The writer sits in
   core/tracing.js beside the reader it is the inverse of; tracingRingLines below is what it falls
   back to. See src/the_viewer_link_is_polylines.py. */
function tracingRingAnns(rings, idPrefix){
  try {
    if (window.UJ && UJ.tracing && UJ.tracing.ringAnnotations)
      return UJ.tracing.ringAnnotations(rings, idPrefix);
  } catch (_e){}
  return tracingRingLines(rings, idPrefix);
}
function tracingRingLines(rings, idPrefix){'''),
 (u"...for an organelle's outline",
  u'''  if (want.rings && want.rings.length) anns = tracingRingLines(want.rings, "org");''',
  u'''  if (want.rings && want.rings.length) anns = tracingRingAnns(want.rings, "org");'''),
 (u"...and for a cell's",
  u'''                     annotations: tracingRingLines(t.rings, "t" + i) });''',
  u'''                     annotations: tracingRingAnns(t.rings, "t" + i) });'''),
])

# ── 3. and so do the filtered cells' traced outlines ──────────────────────────────────────────
edit("core/tracedoutlines.js", [
 (u"the traced outlines too",
  u'''      /* The same closed loops of lines tracingViewerOpen writes for one cell -- see its header
         for why lines and not polygons. */
      (g.rings||[]).forEach(function(r,ri){
        const pts=r.points||[];
        if(pts.length<3)return;
        const z=Math.round(r.z);
        for(let i=0;i<pts.length;i++){
          const a=pts[i],b=pts[(i+1)%pts.length];
          anns.push({type:"line",id:"to"+gi+"_"+ri+"_"+i,
                     pointA:[Math.round(a[0]),Math.round(a[1]),z],
                     pointB:[Math.round(b[0]),Math.round(b[1]),z]});
        }
      });''',
  u'''      /* The same annotations tracingViewerOpen writes for one cell: one closed POLYLINE per
         contour (2026-09-22, src/the_viewer_link_is_polylines.py). */
      [].push.apply(anns,UJ.tracing.ringAnnotations(g.rings||[],"to"+gi));'''),
])
