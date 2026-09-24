# -*- coding: utf-8 -*-
u"""A contour that was never closed is not closed on the way out.                         2026-09-24

Søren, with a screenshot of an arachnoid barrier cell in Neuroglancer: "When changing the line
annotations to poly-line it is making a few very long lines from one end of the cell to the other,
which is disturbing. Can we avoid this somehow?"

Those are closing chords, and ringAnnotations draws them deliberately -- in BOTH shapes, so the
polyline change only made an old fault visible:

    pointB: pts[(i + 1) % pts.length]      // lines: the last edge joins last -> first
    P.push(P[0].slice());                  // polyline: the first vertex repeated as the last

Right for a lysosome, which IS a ring, and for anything drawn on the pad, where closeRing() closes
it. Wrong for what he has actually been tracing: an arachnoid barrier cell is a flattened sheet, and
its profile on a section is an OPEN curve following a membrane. Joining its two ends draws a
straight line across the entire cell. Measured on a traced arc of the same shape: the longest drawn
span was 4,950 voxels against a step of 63 -- a chord seventy-nine times the contour's own stride,
and not in the data. It was invented here.

WHY NOT A FLAG. A ring does not carry one, and threading "was this closed?" through the pad, the
link reader, the Drive file and back would be a large change to record something the geometry
already states. Neuroglancer's own polylines do not carry it either: core/tracing.js's polylineRing
drops a repeated last vertex on the way IN, so an open curve and a closed ring arrive here looking
identical except for their shape.

SO IT IS MEASURED. The gap between the last point and the first, against the LONGEST ordinary
segment of the same contour -- not the mean or the median, because Douglas-Peucker leaves a closed
ring with segments of wildly different lengths and its closing segment is one of the long ones. A
closed ring's gap is the same order as its longest step; an open curve's is the span of the whole
shape. Past four times the longest step, it is a chord, and the contour is left open.

FOUR IS DELIBERATELY GENEROUS. The failure this must never have is opening a ring that was closed,
which would leave a visible notch in a lysosome; the failure it accepts is leaving a nearly-closed
curve open, which draws exactly what was traced and nothing more. A C-shape missing its last tenth
is left open on purpose -- inventing the last tenth is still inventing.

THREE POINTS OR FEWER ARE CLOSED without measuring: a triangle is a ring, and there is no "ordinary
segment" to compare against when every segment is the shape.

Check: openringcheck.js, written first; 5 of its 9 assertions failed before this went in.
Run: python3 src/a_contour_that_was_never_closed_stays_open.py, then python3 src/build_stamps.py,
then python3 wjump-build/build_wjump.py and python3 xjump-build/build_xjump.py
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


edit("core/tracing.js", [
 (u"whether a contour was ever closed, measured",
  u'''  function ringAnnotations(rings, idPrefix, opts){''',
  u'''/* ── WAS THIS CONTOUR EVER CLOSED? ────────────────────────────────────────────────  2026-09-24
   Søren: "it is making a few very long lines from one end of the cell to the other." Those are
   closing chords on contours that were never rings -- an arachnoid barrier cell is a sheet, and its
   profile on a section is an open curve along a membrane.

   The gap from the last point back to the first, against the LONGEST ordinary segment. Not the mean
   or the median: Douglas-Peucker leaves a closed ring with very uneven segments, and its closing
   segment is one of the long ones, so a median would call real rings open. A closed ring's gap is
   the same order as its longest step; an open curve's is the span of the whole shape -- measured at
   79x on one of his.

   Four times is deliberately generous in the safe direction. Wrongly opening a ring puts a notch in
   a lysosome; wrongly leaving a nearly-closed curve open draws exactly what was traced.
   See src/a_contour_that_was_never_closed_stays_open.py. */
  var RING_CLOSE_RATIO = 4;
  function ringWasClosed(pts){
    if (!pts || pts.length < 4) return true;      // a triangle is a ring, and has nothing to compare
    var longest = 0, i, dx, dy;
    for (i = 1; i < pts.length; i++){
      dx = pts[i][0] - pts[i - 1][0]; dy = pts[i][1] - pts[i - 1][1];
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > longest) longest = d;
    }
    if (!longest) return true;                    // every point on top of the last: nothing to say
    dx = pts[pts.length - 1][0] - pts[0][0]; dy = pts[pts.length - 1][1] - pts[0][1];
    return Math.sqrt(dx * dx + dy * dy) <= longest * RING_CLOSE_RATIO;
  }
  function ringAnnotations(rings, idPrefix, opts){'''),

 (u"...and neither shape draws the chord when it was not",
  u'''      var z = Math.round(r.z), i;
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
      out.push({ type: "polyline", id: idPrefix + "_" + ri, points: P });''',
  u'''      var z = Math.round(r.z), i;
      /* Both shapes drew the closing chord, so the polyline change only made an old fault
         visible (2026-09-24). */
      var shut = ringWasClosed(pts);
      if (asLines){
        var last = shut ? pts.length : pts.length - 1;
        for (i = 0; i < last; i++){
          var a = pts[i], b = pts[(i + 1) % pts.length];
          out.push({ type: "line", id: idPrefix + "_" + ri + "_" + i,
                     pointA: [Math.round(a[0]), Math.round(a[1]), z],
                     pointB: [Math.round(b[0]), Math.round(b[1]), z] });
        }
        return;
      }
      var P = [];
      for (i = 0; i < pts.length; i++) P.push([Math.round(pts[i][0]), Math.round(pts[i][1]), z]);
      if (shut) P.push(P[0].slice());
      out.push({ type: "polyline", id: idPrefix + "_" + ri, points: P });'''),
])
