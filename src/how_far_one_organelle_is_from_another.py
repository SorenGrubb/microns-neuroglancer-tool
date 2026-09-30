# -*- coding: utf-8 -*-
u"""How far one organelle is from another, surface to surface.                           2026-09-30

Søren: *"Also calculate the shortest distance from the organelle mesh to the nucleus mesh and if
possible the organelle mesh to the nearest organelle mesh from the same cell and also the shortest
distance between their centroids."*

SURFACE TO SURFACE IS A DIFFERENT QUESTION FROM CENTRE TO CENTRE, and it is the one a contact
argument needs. Two organelles whose centroids are 2 µm apart are touching if they are 1 µm
across each and two microns apart if they are small — the centroid distance cannot tell those
apart, and "is this lysosome on the nuclear envelope" is exactly the case where it matters. Both
are reported; neither replaces the other.

MEASURED BETWEEN THE TRACED CONTOURS. Each outline becomes a point cloud: every contour resampled
at equal arc length, lifted into nm. The distance is the smallest gap between the two clouds. That
makes its resolution ALONG Z the section spacing — if the true closest approach of two surfaces
falls between two traced sections, nothing traced can see it there, and it will read slightly long.
In the plane it is exact to the resample spacing. This is the one honest caveat and it belongs in
the doc rather than in a footnote nobody reads: the check uses shapes whose closest approach is in
plane, where the answer is a number that can be written down in advance.

NOT A LOFTED MESH, DELIBERATELY. loft() exists and would give a true surface, but a surface built
by interpolation puts the answer partly in the interpolator: two contours 200 nm apart in a dataset
sectioned every 40 nm would report a contact that no one traced. Contour points are what was
actually drawn.

BRUTE FORCE, WITH A BOUNDING-BOX GATE. An organelle is a few hundred points and a nucleus a few
thousand, so one pair is a millisecond; what would not scale is every pair in a cell with fifty
outlines. The gate is exact rather than approximate — if the gap between two bounding boxes already
exceeds the best distance found so far, no pair of points inside them can beat it — so it prunes
without ever changing an answer.

WHAT THE NEAREST NEIGHBOUR IS ALLOWED TO BE: another organelle of the same cell. Not itself, and
not the cell outline or the nucleus — a whole-cell outline encloses everything, so its distance to
each organelle is a property of the tracing, not of the biology. The nucleus gets its own column
because it is the landmark Gary named.

TWO NEAREST NEIGHBOURS, NOT ONE. Nearest by surface and nearest by centroid can be different
organelles — a large one whose edge is close, and a small one whose centre is close — so both are
named, with their distances. The pair found by surface also reports its centroid separation, which
is the "shortest distance between their centroids" in the request read the other way.

Check: organelleshapecheck.js (surface distances on shapes with closed-form answers),
organellesheetcheck.js (the columns and the neighbour rules).
Run: python3 src/how_far_one_organelle_is_from_another.py, then python3 src/build_stamps.py,
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


GEOM = u'''
  /* ── HOW FAR TWO OUTLINES ARE FROM EACH OTHER ────────────────────────────────  2026-09-30
     Søren: "calculate the shortest distance from the organelle mesh to the nucleus mesh and ...
     to the nearest organelle mesh from the same cell".

     surfacePoints(rings, resNm, perContour) -> Float64Array of x,y,z triples in NANOMETRES
       Every contour resampled at equal arc length -- the same resample() the loft uses, so the
       points are spread evenly round the outline rather than bunched where somebody clicked.

     minSurfaceDistNm(A, B) -> the smallest distance between the two clouds, in nm

     RESOLUTION ALONG Z IS THE SECTION SPACING. The points only exist on traced sections, so a
     closest approach that falls between two of them reads slightly long. In plane it is exact to
     the resample spacing. Deliberately measured on the contours rather than on a lofted surface:
     a surface built by interpolation would put part of the answer in the interpolator. */
  function surfacePoints(rings, resNm, perContour){
    var res = resNm || [1, 1, 1], n = perContour || N;
    var list = (rings || []).filter(function(r){ return r && r.points && r.points.length >= 3; });
    var out = new Float64Array(list.length * n * 3), k = 0;
    list.forEach(function(r){
      var rs = resample(r.points, n);
      if (!rs) return;
      for (var i = 0; i < rs.length; i++){
        out[k++] = rs[i][0] * res[0];
        out[k++] = rs[i][1] * res[1];
        out[k++] = r.z * res[2];
      }
    });
    return out.subarray(0, k);
  }

  function boundsOf(P){
    if (!P || !P.length) return null;
    var b = [P[0], P[1], P[2], P[0], P[1], P[2]];
    for (var i = 3; i < P.length; i += 3){
      if (P[i] < b[0]) b[0] = P[i];       if (P[i] > b[3]) b[3] = P[i];
      if (P[i+1] < b[1]) b[1] = P[i+1];   if (P[i+1] > b[4]) b[4] = P[i+1];
      if (P[i+2] < b[2]) b[2] = P[i+2];   if (P[i+2] > b[5]) b[5] = P[i+2];
    }
    return b;
  }
  /* The gap between a point and a box: zero inside it, and otherwise a true lower bound on the
     distance to anything the box holds -- which is what makes the gate below exact. */
  function pointBoxGap2(x, y, z, b){
    var dx = x < b[0] ? b[0] - x : (x > b[3] ? x - b[3] : 0);
    var dy = y < b[1] ? b[1] - y : (y > b[4] ? y - b[4] : 0);
    var dz = z < b[2] ? b[2] - z : (z > b[5] ? z - b[5] : 0);
    return dx * dx + dy * dy + dz * dz;
  }
  function minSurfaceDistNm(A, B){
    if (!A || !B || !A.length || !B.length) return null;
    var bb = boundsOf(B), best = Infinity, i, j;
    for (i = 0; i < A.length; i += 3){
      var ax = A[i], ay = A[i+1], az = A[i+2];
      /* EXACT, NOT APPROXIMATE. Nothing in B can be nearer to this point than the box holding B
         is, so a point whose box gap already loses cannot win, and skipping it changes no answer. */
      if (pointBoxGap2(ax, ay, az, bb) >= best) continue;
      for (j = 0; j < B.length; j += 3){
        var dx = ax - B[j], dy = ay - B[j+1], dz = az - B[j+2];
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) best = d2;
      }
      if (best === 0) break;
    }
    return isFinite(best) ? Math.sqrt(best) : null;
  }
'''

edit("core/traceloft.js", [
 (u"the surface point cloud and the distance between two of them",
  u"  return { loft: loft, volume: volume, shape: shape, interpolate: interpolate, thinSections: thinSections,",
  GEOM + u"\n  return { loft: loft, volume: volume, shape: shape,\n"
  u"           surfacePoints: surfacePoints, minSurfaceDistNm: minSurfaceDistNm,\n"
  u"           interpolate: interpolate, thinSections: thinSections,"),
])

# ── the sheet ────────────────────────────────────────────────────────────────────────────────
edit("core/tracedoutlines.js", [

 (u"six more columns",
  u'''  "Distance to nucleus centroid (\\u00b5m)", "Nucleus centroid from",
  "Traced by", "Structure ID"
];''',
  u'''  "Distance to nucleus centroid (\\u00b5m)", "Nucleus centroid from",
  /* SURFACE TO SURFACE (2026-09-30). A different question from centre to centre, and the one a
     contact argument needs -- see src/how_far_one_organelle_is_from_another.py. The nucleus one is
     blank unless somebody outlined the nucleus: a detection centroid is a point, and a point has
     no surface to be near. Nearest BY SURFACE and nearest BY CENTROID can be different organelles,
     so both are named. */
  "Distance to nucleus surface (\\u00b5m)",
  "Nearest organelle (by surface)", "Distance to its surface (\\u00b5m)",
  "Distance to its centroid (\\u00b5m)",
  "Nearest organelle (by centroid)", "Distance to that centroid (\\u00b5m)",
  "Traced by", "Structure ID"
];'''),

 (u"...the clouds each outline is measured as",
  u'''  var out = [];
  list.forEach(function(t){
    var s = UJ.traceloft.shape(t.rings, res);
    if (!s || !s.ok) return;''',
  u'''  /* MEASURED ONCE EACH. The point cloud and the shape of every outline are computed up front,
     because the pairing below asks for each of them many times -- every organelle against every
     other organelle of its cell. Keyed by position in `list` so a row can find its own. */
  var cloud = list.map(function(t){
    try { return UJ.traceloft.surfacePoints(t.rings, res); } catch (e){ return null; }
  });
  var shp = list.map(function(t){
    try { return UJ.traceloft.shape(t.rings, res); } catch (e){ return null; }
  });
  var kindOf = function(t){ return String(t.kind || t.instance_of || "").toLowerCase(); };
  var cellKey = function(t){ return String(t.nucleus_id || "") + "|" + String(t.root_id || ""); };
  /* WHAT MAY BE A NEIGHBOUR: another organelle of the same cell. Not itself; not the whole-cell
     outline, which encloses everything, so its distance to each organelle says something about the
     tracing rather than about the cell; and not the nucleus, which has a column of its own. */
  var isOrganelle = function(t){ var k = kindOf(t); return k !== "cell" && k !== "nucleus"; };
  var tracedNucCloud = {};
  list.forEach(function(t, i){
    if (kindOf(t) !== "nucleus" || !cloud[i] || !cloud[i].length) return;
    if (t.nucleus_id) tracedNucCloud["n:" + t.nucleus_id] = cloud[i];
    if (t.root_id) tracedNucCloud["r:" + t.root_id] = cloud[i];
  });
  var distNm = function(a, b){
    if (!a || !b) return null;
    var dx = (a.xVox - b.xVox) * res[0], dy = (a.yVox - b.yVox) * res[1],
        dz = (a.zVox - b.zVox) * res[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  var out = [];
  list.forEach(function(t, ti){
    var s = shp[ti];
    if (!s || !s.ok) return;'''),

 (u"...and the three distances that come of it",
  u'''    var top = s.atMaxArea, med = s.median;
    out.push({''',
  u'''    /* To the nucleus SURFACE -- only when the nucleus was outlined. */
    var nucCloud = tracedNucCloud["n:" + nid] || tracedNucCloud["r:" + rid] || null;
    var nucSurf = "";
    if (nucCloud && cloud[ti] && cloud[ti] !== nucCloud){
      var dn = UJ.traceloft.minSurfaceDistNm(cloud[ti], nucCloud);
      if (dn !== null) nucSurf = dn / 1000;
    }
    /* And to the nearest other organelle of the same cell, found twice over: by surface and by
       centroid. They can be different organelles, which is the point of naming both. */
    var bestS = null, bestSd = Infinity, bestC = null, bestCd = Infinity;
    list.forEach(function(o, oi){
      if (oi === ti || !isOrganelle(o)) return;
      if (cellKey(o) !== cellKey(t)) return;
      if (!shp[oi] || !shp[oi].ok) return;
      if (cloud[ti] && cloud[oi]){
        var ds = UJ.traceloft.minSurfaceDistNm(cloud[ti], cloud[oi]);
        if (ds !== null && ds < bestSd){ bestSd = ds; bestS = oi; }
      }
      var dc = distNm(s.centroid, shp[oi].centroid);
      if (dc !== null && dc < bestCd){ bestCd = dc; bestC = oi; }
    });
    var nameOf = function(i){ return i === null ? "" : (list[i].name || list[i].kind || "traced"); };
    var pairCentroid = bestS === null ? "" : distNm(s.centroid, shp[bestS].centroid);

    var top = s.atMaxArea, med = s.median;
    out.push({'''),

 (u"...written into the row",
  u'''      "Distance to nucleus centroid (\\u00b5m)": r3(dist),
      "Nucleus centroid from": from,''',
  u'''      "Distance to nucleus centroid (\\u00b5m)": r3(dist),
      "Nucleus centroid from": from,
      "Distance to nucleus surface (\\u00b5m)": r3(nucSurf === "" ? null : nucSurf),
      "Nearest organelle (by surface)": nameOf(bestS),
      "Distance to its surface (\\u00b5m)": r3(bestS === null ? null : bestSd / 1000),
      "Distance to its centroid (\\u00b5m)": r3(pairCentroid === "" ? null : pairCentroid / 1000),
      "Nearest organelle (by centroid)": nameOf(bestC),
      "Distance to that centroid (\\u00b5m)": r3(bestC === null ? null : bestCd / 1000),'''),
])
print("\nNow: node organelleshapecheck.js && node organellesheetcheck.js,"
      "\nthen python3 src/build_stamps.py, then from inside wjump-build/, python3 build_wjump.py")
