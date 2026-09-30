# -*- coding: utf-8 -*-
u"""An organelle has a shape, and a distance from the nucleus.                           2026-09-30

Gary, to Søren:

    "could you potentially add a circularity metric to the organelles that are being segmented?
     In such a metric, a perfect circle will be 1 because it has the same length and width. The
     reason for this is that in disease, organelles can change shape, so it would be great to have
     a metric that can prove this, particularly in the AD volume compared to healthy tissue."
    "I also want to have the distance from the organelle centroid to the nucleus centroid
     calculated and displayed for each organelle."

WHICH METRIC. "A perfect circle will be 1 because it has the same length and width" describes the
ASPECT RATIO. The metric universally called circularity is 4πA/P², which is also 1 for a circle
but for a different reason — it is the most area a given perimeter can enclose. On the shapes this
is for they disagree sharply: a swollen, ragged, invaginated lysosome is as wide as it is long and
scores 1 on aspect ratio, while its circularity collapses. Søren picked the whole FIJI set, so all
four of ImageJ's Shape Descriptors are computed, by ImageJ's own definitions, so a number here and
a number off a FIJI ROI go in the same column:

    circularity   4πA/P²                              1 = circle, falls with a ragged outline
    aspect ratio  major/minor of the fitted ellipse   1 = as wide as it is long
    roundness     4A/(π·major²)                       1/aspect ratio, after the area-matched fit
    solidity      A / convex hull area                1 = convex, falls with a bite out of it

THE ELLIPSE IS FITTED THE WAY IMAGEJ FITS IT: from the polygon's central second moments, then
scaled so the ellipse encloses the ROI's own area. That last step is why roundness comes out at
exactly 1 for a square — a property of the definition, asserted in the check so nobody later
"fixes" it.

EXACT MOMENTS, NOT A PIXEL SUM. These are polygons, so the area, the centroid and the three second
moments are closed-form sums over the edges. That also means the centroid is the AREA centroid:
traceloft's existing centroid() is the mean of the vertices, which is right for pairing contours
between sections and wrong here, because clicking densely down one side of a contour would drag
the centre towards the dense side. The check traces that exact case.

ONE RING PER SECTION. The descriptors are measured on the LARGEST ring of each section — the
outline. Perimeter, convex hull and second moments of a section holding an outline plus a hole are
not one shape, and an organelle outline with a hole is rare enough (the holes machinery in this
tool is for astrocytic NR type II) that inventing a convention for it would be worse than saying
which ring was measured. `rings` on each section says how many there were.

FROM THE CONTOURS, EVERY TIME, NOT STORED. The volume travels with a tracing because Søren wanted
the stored number to be the number he saw before he pressed submit. Shape has no such history, and
computing it on read means it exists for every tracing ever made rather than only for ones
submitted after today. One code path, nothing to drift.

Check: organelleshapecheck.js (1 red before — the function does not exist — and 24 green after).
Run: python3 src/an_organelle_has_a_shape_and_a_distance.py, then python3 src/build_stamps.py,
then, from inside wjump-build/, python3 build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


SHAPE = u'''
  /* ── WHAT SHAPE IT IS ────────────────────────────────────────────────────────  2026-09-30
     Gary: "could you potentially add a circularity metric to the organelles that are being
     segmented... in disease, organelles can change shape, so it would be great to have a metric
     that can prove this". ImageJ's four Shape Descriptors, by ImageJ's definitions, so a number
     from here and a number off a FIJI ROI belong in the same column. See
     src/an_organelle_has_a_shape_and_a_distance.py for why all four and not just the one.

     Everything below is exact for a polygon -- area, centroid and the three central second
     moments are closed-form sums over the edges, not a pixel count. In particular the centroid is
     the AREA centroid; centroid() above is the mean of the VERTICES, which is the right thing for
     pairing contours between sections and the wrong thing here.

     shape(rings, resNm) -> { ok, sections, perSection[], atMaxArea, median, centroid }
       perSection  one entry per z: { z, rings, areaUm2, perimeterUm, circularity, aspectRatio,
                                      roundness, solidity, majorUm, minorUm, angleDeg, cx, cy }
       atMaxArea   the descriptors at the section with the greatest area -- the organelle's widest
                   cross-section, which is the section an electron microscopist would measure
       median      the median of each descriptor over all sections
       centroid    the volume-weighted 3D centre, in voxels and in nm */

  /* Signed area, area centroid and the central second moments of one closed polygon, in one pass.
     mu20 = ∫(x-cx)² dA, mu02 = ∫(y-cy)² dA, mu11 = ∫(x-cx)(y-cy) dA. */
  function moments(pts){
    var n = pts.length, a2 = 0, cx = 0, cy = 0, ixx = 0, iyy = 0, ixy = 0, i;
    for (i = 0; i < n; i++){
      var p = pts[i], q = pts[(i + 1) % n];
      var cr = p[0] * q[1] - q[0] * p[1];
      a2 += cr;
      cx += (p[0] + q[0]) * cr;
      cy += (p[1] + q[1]) * cr;
      iyy += cr * (p[0] * p[0] + p[0] * q[0] + q[0] * q[0]);
      ixx += cr * (p[1] * p[1] + p[1] * q[1] + q[1] * q[1]);
      ixy += cr * (p[0] * q[1] + 2 * p[0] * p[1] + 2 * q[0] * q[1] + q[0] * p[1]);
    }
    var A = a2 / 2;
    if (!(Math.abs(A) > 0)) return null;
    cx = cx / (3 * a2); cy = cy / (3 * a2);
    var m20 = iyy / 12 - A * cx * cx,
        m02 = ixx / 12 - A * cy * cy,
        m11 = ixy / 24 - A * cx * cy;
    /* Sign follows the winding; every quantity below wants the magnitudes. */
    var s = A < 0 ? -1 : 1;
    return { area: Math.abs(A), cx: cx, cy: cy,
             mu20: s * m20, mu02: s * m02, mu11: s * m11 };
  }

  function perimeter(pts){
    var L = 0;
    for (var i = 0; i < pts.length; i++){
      var p = pts[i], q = pts[(i + 1) % pts.length];
      L += Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]));
    }
    return L;
  }

  /* Monotone chain. Returns the hull's vertices counter-clockwise. */
  function convexHull(pts){
    var P = pts.slice().sort(function(a, b){ return a[0] - b[0] || a[1] - b[1]; });
    if (P.length < 3) return P;
    var cross = function(o, a, b){
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    };
    var lo = [], hi = [], i;
    for (i = 0; i < P.length; i++){
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], P[i]) <= 0) lo.pop();
      lo.push(P[i]);
    }
    for (i = P.length - 1; i >= 0; i--){
      while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], P[i]) <= 0) hi.pop();
      hi.push(P[i]);
    }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }

  /* One section's descriptors, measured on `pts` in MICROMETRES. */
  function describe(pts){
    var m = moments(pts);
    if (!m) return null;
    var A = m.area, P = perimeter(pts);
    if (!(A > 0) || !(P > 0)) return null;
    /* The ellipse with the same second moments, then scaled to the same area -- ImageJ's fit. */
    var common = Math.sqrt((m.mu20 - m.mu02) * (m.mu20 - m.mu02) + 4 * m.mu11 * m.mu11);
    var major = 2 * Math.SQRT2 * Math.sqrt(Math.max(0, (m.mu20 + m.mu02 + common) / A));
    var minor = 2 * Math.SQRT2 * Math.sqrt(Math.max(0, (m.mu20 + m.mu02 - common) / A));
    if (major > 0 && minor > 0){
      var k = Math.sqrt(A / (Math.PI * (major / 2) * (minor / 2)));
      major *= k; minor *= k;
    }
    var hull = convexHull(pts), hm = hull.length >= 3 ? moments(hull) : null;
    /* A traced contour is a polygon, and a polygon's perimeter is shorter than the smooth curve it
       stands for, so 4πA/P² can land a hair above 1 on a well-clicked circle. Capped, because a
       circularity of 1.0004 in a spreadsheet is a distraction, not information. */
    var circ = Math.min(1, 4 * Math.PI * A / (P * P));
    return { areaUm2: A, perimeterUm: P,
             circularity: circ,
             aspectRatio: minor > 0 ? major / minor : null,
             roundness: major > 0 ? 4 * A / (Math.PI * major * major) : null,
             solidity: hm && hm.area > 0 ? Math.min(1, A / hm.area) : null,
             majorUm: major, minorUm: minor,
             angleDeg: 0.5 * Math.atan2(2 * m.mu11, m.mu20 - m.mu02) * 180 / Math.PI,
             cx: m.cx, cy: m.cy };
  }

  function medianOf(xs){
    var v = xs.filter(function(x){ return x !== null && x !== undefined && isFinite(x); })
              .sort(function(a, b){ return a - b; });
    if (!v.length) return null;
    var h = v.length >> 1;
    return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
  }

  function shape(rings, resNm){
    var res = resNm || [1, 1, 1];
    var sx = res[0] / 1000, sy = res[1] / 1000;          // voxel -> µm on the section plane
    var byZ = {}, zs = [];
    (rings || []).forEach(function(r){
      if (!r || !r.points || r.points.length < 3) return;
      var z = Math.round(r.z);
      if (!byZ[z]){ byZ[z] = []; zs.push(z); }
      byZ[z].push(r);
    });
    zs.sort(function(a, b){ return a - b; });
    if (!zs.length) return { ok: false, reason: "nothing traced", sections: 0 };
    var per = [];
    zs.forEach(function(z){
      /* The largest ring is the outline. See the doc comment above for why only one. */
      var best = null, bestA = -1;
      byZ[z].forEach(function(r){
        var a = ringArea(r.points);
        if (a > bestA){ bestA = a; best = r; }
      });
      if (!best) return;
      var um = best.points.map(function(p){ return [p[0] * sx, p[1] * sy]; });
      var d = describe(um);
      if (!d) return;
      d.z = z; d.rings = byZ[z].length;
      /* The centroid goes back into voxels, which is the unit every coordinate in this tool is in. */
      d.cxVox = d.cx / sx; d.cyVox = d.cy / sy;
      per.push(d);
    });
    if (!per.length) return { ok: false, reason: "nothing measurable", sections: 0 };

    var top = per[0], i;
    for (i = 1; i < per.length; i++) if (per[i].areaUm2 > top.areaUm2) top = per[i];

    var KEYS = ["areaUm2", "perimeterUm", "circularity", "aspectRatio", "roundness", "solidity",
                "majorUm", "minorUm"];
    var med = {};
    KEYS.forEach(function(k){ med[k] = medianOf(per.map(function(s){ return s[k]; })); });

    /* The 3D centre, weighted by how much of the organelle each section stands for -- the same
       Cavalieri slab volume() gives each section, so the centroid and the volume are the same
       object seen two ways. With one section the slab is the section. */
    var gaps = [];
    for (i = 0; i < per.length - 1; i++) gaps.push((per[i + 1].z - per[i].z) * res[2]);
    var wx = 0, wy = 0, wz = 0, wsum = 0;
    for (i = 0; i < per.length; i++){
      var below = gaps[i - 1] === undefined ? (gaps[i] === undefined ? res[2] : gaps[i]) : gaps[i - 1];
      var above = gaps[i] === undefined ? (gaps[i - 1] === undefined ? res[2] : gaps[i - 1]) : gaps[i];
      var w = per[i].areaUm2 * (below + above) / 2;
      wx += per[i].cxVox * w; wy += per[i].cyVox * w; wz += per[i].z * w; wsum += w;
    }
    var cen = wsum > 0
      ? { xVox: wx / wsum, yVox: wy / wsum, zVox: wz / wsum,
          xNm: wx / wsum * res[0], yNm: wy / wsum * res[1], zNm: wz / wsum * res[2] }
      : null;

    return { ok: true, sections: per.length, perSection: per,
             atMaxArea: top, median: med, centroid: cen,
             /* Reported so a reader can see the summary was taken from a real section and which. */
             maxAreaZ: top.z };
  }
'''

edit("core/traceloft.js", [

 (u"the shape descriptors",
  u"  return { loft: loft, volume: volume, interpolate: interpolate, thinSections: thinSections,",
  SHAPE + u"\n  return { loft: loft, volume: volume, shape: shape, interpolate: interpolate, thinSections: thinSections,"),

 (u"...and the pieces they are built from, for a check to reach",
  u"           _nestOf: nestOf, _mergeHoles: mergeHoles, _earClip: earClip, N: N };",
  u"           _nestOf: nestOf, _mergeHoles: mergeHoles, _earClip: earClip,\n"
  u"           _moments: moments, _perimeter: perimeter, _convexHull: convexHull, _describe: describe,\n"
  u"           N: N };"),
])
print("\nNow: node organelleshapecheck.js, then python3 src/build_stamps.py,"
      "\nthen, from inside wjump-build/, python3 build_wjump.py")
