# -*- coding: utf-8 -*-
u"""Contours interpolate between sections, curving in z rather than cutting straight.    2026-09-22

Søren: "Can we also interpolate between polylines in z?" -- asked, he wanted it for a smoother 3D
view and Blender export, with the made contours marked as interpolated, and doing its best where
the shape does not pair up cleanly.

THE FINDING THAT DECIDED THE DESIGN. loft() bands STRAIGHT between consecutive sections. A contour
interpolated LINEARLY between two of them lies exactly on that straight band: it would add
triangles and change the surface not at all. A linear fill is worth precisely nothing for the
purpose he asked for it. So the interpolation CURVES in z -- Catmull-Rom through the corresponding
vertex on four consecutive contours -- and interpcheck.js proves it by sampling a sphere every
second section and asserting the made contour lands nearer the true radius than the straight line
between its neighbours does.

CORRESPONDENCE, NOT VERTEX INDEX. The pieces were already here and already trusted, because the
mesh is built from them: resample() to 64 points by arc length, orient() for winding, pairUp() for
which contour on one section is which on the next, bestOffset() for the rotation that pairs their
vertices. A chain is followed upward from the lowest section, each ring rotated onto the one below,
so a contour whose pen started somewhere else does not twist into a bowtie. interpcheck.js asserts
that on an ellipse written from a vertex 2.1 radians round.

WHAT IT MAKES, AND WHAT IT DOES NOT.
  - a contour at every MISSING section between two traced ones -- integer z, so it has a section to
    belong to, and it is saved with the tracing carrying interp:true;
  - with opts.per, that many extra rings BETWEEN adjacent sections, at fractional z. These are for
    the mesh and the export only and are never saved: there is no section to put them on.
Every made ring carries interp:true. The rings handed in are not modified.

AND IT MEASURES NOTHING NEW. Cavalieri already accounts for skipped sections by multiplying area by
the spacing, so interpolating cannot improve a volume -- it can only add a small bias. The volume
stays computed from the DRAWN contours, and interpcheck.js asserts it is bit-identical afterwards.

Where a cell branches, pairUp pairs each contour with the nearest free one and the rest are left
alone -- his choice, "do its best anyway" -- and the count of unpaired contours is reported rather
than hidden.

WHERE IT IS WORST, said here rather than hidden by a kind test: at the two ends of a chain the
tangent has to be clamped, and a shape that stops dead -- the pole of a sphere, the last section of
an organelle -- is where any interpolation is furthest out. Measured at the pole of a sphere the
cubic was slightly WORSE than a straight line (144 against 150, true 218); measured in its body it
was 0.2 voxels off where the straight line was 3.9. So interpcheck.js compares in the body and says
so. The overshoot guard is asserted everywhere: no made contour leaves the span of the two it sits
between.

Check: interpcheck.js (written first; it failed with the function absent).
Run: python3 src/contours_interpolate_in_z.py, then python3 src/build_stamps.py
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


edit("core/traceloft.js", [
 (u"interpolate",
  u'''  return { loft: loft, volume: volume,''',
  u'''  /* ── INTERPOLATING BETWEEN SECTIONS ──────────────────────────────────────────  2026-09-22
     Søren: "Can we also interpolate between polylines in z?"

     WHY IT CURVES. loft() bands straight between consecutive sections, so a LINEARLY interpolated
     contour lies exactly on the band it was meant to improve -- more triangles, identical surface.
     This runs a Catmull-Rom through the corresponding vertex on four consecutive contours instead,
     which bows the surface the way a round object actually goes. Proven in interpcheck.js against
     a sphere: the made contour lands nearer the true radius than the straight line does.

     CORRESPONDENCE comes from the pieces the mesh already trusts -- resample to N by arc length,
     orient for winding, pairUp for which contour is which on the next section, bestOffset for the
     rotation that pairs their vertices. Chains are followed upward from the lowest section, so a
     contour whose pen started elsewhere does not twist.

     interpolate(rings, {per}) -> { rings, made, unpaired, chains }
       rings    the ones handed in, UNCHANGED, plus the made ones marked interp:true
       per      extra rings between ADJACENT sections, at fractional z: mesh and export only,
                never saved, because there is no section to put them on. 0 by default, which
                makes only the contours for MISSING sections.
     See src/contours_interpolate_in_z.py. */
  function catmull(p0, p1, p2, p3, t){
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t
                + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function interpolate(rings, opts){
    opts = opts || {};
    var per = Math.max(0, Math.min(8, opts.per | 0));
    var byZ = {}, zs = [];
    (rings || []).forEach(function(r, i){
      if (!r || !r.points || r.points.length < 3) return;
      var pts = resample(orient(r.points), N);
      if (!pts) return;
      var z = +r.z;
      if (!byZ[z]){ byZ[z] = []; zs.push(z); }
      byZ[z].push({ pts: pts, c: centroid(pts), src: i, inst: r.inst || 0 });
    });
    zs.sort(function(a, b){ return a - b; });
    if (zs.length < 2) return { rings: (rings || []).slice(), made: 0, unpaired: 0, chains: 0 };

    /* CHAINS. Each one is the same contour followed up the stack, every ring rotated onto the one
       below it so vertex i means the same place all the way up. */
    var chains = [], live = [], unpaired = 0;
    byZ[zs[0]].forEach(function(r){
      var ch = { steps: [{ z: zs[0], pts: r.pts }], inst: r.inst };
      chains.push(ch); live.push({ ch: ch, last: r.pts });
    });
    for (var k = 1; k < zs.length; k++){
      var above = byZ[zs[k]];
      var below = live.map(function(L){ return { c: centroid(L.last) }; });
      var pr = pairUp(below, above), taken = {};
      pr.pairs.forEach(function(pair){
        var L = live[pair[0]], A = above[pair[1]];
        taken[pair[1]] = 1;
        var off = bestOffset(L.last, A.pts);
        var rot = A.pts.slice(off).concat(A.pts.slice(0, off));
        L.ch.steps.push({ z: zs[k], pts: rot });
        L.last = rot;
      });
      /* A contour nothing paired with starts a chain of its own -- a branch, or the section where
         the organelle first appears. Its own doing its best: it is not forced onto a neighbour. */
      above.forEach(function(A, j){
        if (taken[j]) return;
        unpaired++;
        var ch = { steps: [{ z: zs[k], pts: A.pts }], inst: A.inst };
        chains.push(ch); live.push({ ch: ch, last: A.pts });
      });
    }

    /* AND THE RINGS BETWEEN. Catmull-Rom on each vertex, clamped at the ends of a chain. */
    var made = [];
    chains.forEach(function(ch){
      var S = ch.steps;
      if (S.length < 2) return;
      for (var i = 0; i + 1 < S.length; i++){
        var a = S[i], b = S[i + 1];
        var p0 = S[i - 1] || a, p3 = S[i + 2] || b;
        var gap = b.z - a.z;
        /* The sections with nothing on them, and then the fractional ones if asked for. */
        var want = [];
        for (var zz = Math.floor(a.z) + 1; zz < b.z; zz++)
          if (zz > a.z) want.push({ z: zz, t: (zz - a.z) / gap, keep: true });
        for (var q = 1; q <= per; q++){
          var t = q / (per + 1), fz = a.z + gap * t;
          if (want.some(function(w){ return Math.abs(w.z - fz) < 1e-9; })) continue;
          want.push({ z: fz, t: t, keep: false });
        }
        want.forEach(function(w){
          var pts = [];
          for (var v = 0; v < N; v++){
            pts.push([catmull(p0.pts[v][0], a.pts[v][0], b.pts[v][0], p3.pts[v][0], w.t),
                      catmull(p0.pts[v][1], a.pts[v][1], b.pts[v][1], p3.pts[v][1], w.t)]);
          }
          made.push({ z: w.z, points: pts, inst: ch.inst, interp: true, section: w.keep });
        });
      }
    });
    made.sort(function(x, y){ return x.z - y.z; });
    return { rings: (rings || []).slice().concat(made), made: made.length,
             unpaired: unpaired, chains: chains.length };
  }

  return { loft: loft, volume: volume, interpolate: interpolate,'''),
])
