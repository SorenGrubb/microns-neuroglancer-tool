/* core/traceloft.js — a surface through the contours, while they are still being drawn. 2026-09-17

   Søren: *"there should also be a window below to show the 3D structure while it is being
   generated, so the user can get a view of what it looks like."*

   THIS IS NOT trace_mesh.py, AND IT MUST NOT PRETEND TO BE. The export's surface is built by
   filling each section under the even-odd rule, blending signed distances across the gaps, and
   running marching cubes over the result (blender/trace_mesh.py) — which handles a contour drawn
   inside another as a hole, a cell that splits into two, and a skipped section, and costs seconds
   in Python. What a person tracing wants between two clicks is a different thing: an answer NOW to
   "is this the shape I think it is". So this lofts — it joins each contour to the next one up with
   a band of triangles and caps the two ends — which is a millisecond of arithmetic and is right
   about the thing being asked: the silhouette.

   WHERE IT DIFFERS FROM THE EXPORT, said plainly because a preview that quietly disagrees with the
   file you download is worse than no preview:
     · a contour drawn INSIDE another is lofted as its own tube here, and is a HOLE in the export;
     · two contours on one section are two tubes here, and one blended object there;
     · a section skipped is bridged straight here, and interpolated there.
   For one closed outline per section — which is what tracing a cell looks like — the two agree on
   the silhouette and differ only in smoothness.

   CORRESPONDENCE IS THE WHOLE PROBLEM. Two contours with different vertex counts, drawn from
   different starting points, possibly in opposite directions, have to be joined without the
   surface twisting into a bow tie. Three steps, in this order, and each one is necessary:
     1. WINDING. Every ring is made counter-clockwise by its own signed area, so a contour drawn
        the other way round is not joined back-to-front.
     2. RESAMPLING. Both rings are resampled to the same number of points BY ARC LENGTH, so a
        forty-point outline and a nine-point one have vertices that mean the same places.
     3. ROTATION. The second ring's start index is rotated to whichever offset minimises the total
        squared distance between paired vertices — all N of them tried, because N is 64 and the
        cost is nothing next to being wrong.

   Coordinates in are the TOOL'S OWN VOXELS, the same as everywhere else in the tracing feature;
   coordinates out are NANOMETRES, absolute, which is what core/mesh3d.js's prepare() wants and
   the frame the cell's own mesh arrives in. Nothing here knows how big a voxel is except through
   the resolution it is handed.

   Run: node traceloftcheck.js */
(typeof window !== "undefined" ? window : global).UJ =
  (typeof window !== "undefined" ? window : global).UJ || {};
UJ.traceloft = (function(){
  "use strict";

  /* How many vertices every contour is resampled to. Sixty-four is above the number anybody clicks
     by hand (a careful outline is twenty to forty) so resampling adds points rather than throwing
     them away, and it keeps the whole preview under a few thousand triangles for a forty-section
     cell — small enough to rebuild on every click. */
  var N = 64;

  function signedArea(pts){
    var a = 0;
    for (var i = 0; i < pts.length; i++){
      var p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  /* Counter-clockwise, always. A ring drawn clockwise and its neighbour drawn anticlockwise would
     otherwise be joined vertex 0 to vertex 0 and then in opposite directions round the loop, which
     is a Möbius band, not a cell. */
  function orient(pts){
    return signedArea(pts) < 0 ? pts.slice().reverse() : pts.slice();
  }

  function centroid(pts){
    var x = 0, y = 0;
    for (var i = 0; i < pts.length; i++){ x += pts[i][0]; y += pts[i][1]; }
    return [x / pts.length, y / pts.length];
  }

  /* Equal steps along the PERIMETER, not equal steps in index. A contour clicked densely round a
     spine and sparsely along a straight edge has vertices that are not comparable between sections
     any other way. */
  function resample(pts, n){
    var m = pts.length, d = [], total = 0, i;
    for (i = 0; i < m; i++){
      var a = pts[i], b = pts[(i + 1) % m];
      var L = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
      d.push(L); total += L;
    }
    if (!(total > 0)) return null;           // every vertex in the same place: not a contour
    var out = [], step = total / n, want = 0, seg = 0, along = 0;
    for (i = 0; i < n; i++){
      while (seg < m - 1 && along + d[seg] < want){ along += d[seg]; seg++; }
      var t = d[seg] ? (want - along) / d[seg] : 0;
      if (t > 1) t = 1;
      var p = pts[seg], q = pts[(seg + 1) % m];
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      want += step;
    }
    return out;
  }

  /* Which rotation of B pairs best with A. Every offset is tried: N is 64, so this is 4,096 squared
     distances per band — microseconds — and the alternative (matching the two closest vertices and
     hoping) is wrong exactly when the contour is elongated, which is most neurites. */
  function bestOffset(A, B){
    var best = 0, bestD = Infinity;
    for (var o = 0; o < B.length; o++){
      var s = 0;
      for (var i = 0; i < A.length; i++){
        var b = B[(i + o) % B.length];
        s += Math.pow(A[i][0] - b[0], 2) + Math.pow(A[i][1] - b[1], 2);
      }
      if (s < bestD){ bestD = s; best = o; }
    }
    return best;
  }

  /* Greedy nearest-centroid pairing between the contours of two neighbouring sections. A cell that
     branches has two contours above one, and one of them gets the band while the other is capped —
     which draws the branch as a separate stub rather than as a twisted sheet joining both. */
  function pairUp(below, above){
    var used = {}, pairs = [], i, j;
    for (i = 0; i < below.length; i++){
      var c = below[i].c, pick = -1, bestD = Infinity;
      for (j = 0; j < above.length; j++){
        if (used[j]) continue;
        var d = Math.pow(c[0] - above[j].c[0], 2) + Math.pow(c[1] - above[j].c[1], 2);
        if (d < bestD){ bestD = d; pick = j; }
      }
      if (pick >= 0){ used[pick] = 1; pairs.push([i, pick]); }
    }
    return { pairs: pairs, usedAbove: used };
  }

  function loft(rings, resNm){
    var res = resNm || [1, 1, 1];
    var byZ = {}, zs = [];
    (rings || []).forEach(function(r){
      if (!r || !r.points || r.points.length < 3) return;
      var pts = resample(orient(r.points), N);
      if (!pts) return;
      var z = Math.round(r.z);
      if (!byZ[z]){ byZ[z] = []; zs.push(z); }
      byZ[z].push({ pts: pts, c: centroid(pts) });
    });
    zs.sort(function(a, b){ return a - b; });

    var pos = [], idx = [];
    function put(p, z){
      pos.push(p[0] * res[0], p[1] * res[1], z * res[2]);
      return pos.length / 3 - 1;
    }
    /* A fan from the centroid. Flat, and it has to be: a cap that guessed at a dome would be
       inventing the one part of the shape the tracer did not draw. */
    function cap(ring, z, flip){
      var mid = put(ring.c, z), first = pos.length / 3, i;
      for (i = 0; i < ring.pts.length; i++) put(ring.pts[i], z);
      for (i = 0; i < ring.pts.length; i++){
        var a = first + i, b = first + (i + 1) % ring.pts.length;
        if (flip) idx.push(mid, b, a); else idx.push(mid, a, b);
      }
    }
    function band(lo, hi, zLo, zHi){
      var off = bestOffset(lo.pts, hi.pts);
      var baseA = pos.length / 3, i;
      for (i = 0; i < N; i++) put(lo.pts[i], zLo);
      var baseB = pos.length / 3;
      for (i = 0; i < N; i++) put(hi.pts[(i + off) % N], zHi);
      for (i = 0; i < N; i++){
        var a0 = baseA + i, a1 = baseA + (i + 1) % N;
        var b0 = baseB + i, b1 = baseB + (i + 1) % N;
        /* WOUND OUTWARD, to agree with the caps. Nothing on screen depends on it -- the renderer
           has no culling and its shader is two-sided -- but a surface whose triangles disagree
           about which side is out has no signed volume, and traceloftcheck.js measures exactly that
           to cross-check volume() against the loft. Two sums over one tracing that agree are worth
           more than either of them alone, and they can only agree if this is consistent. */
        idx.push(a0, b1, b0, a0, a1, b1);
      }
    }

    if (!zs.length) return { positions: new Float32Array(0), indices: new Uint32Array(0),
                             sections: 0, contours: 0, capped: 0 };
    /* ONE SECTION IS NOT A SOLID, and saying so beats drawing a disc somebody would read as one.
       Two flat caps facing opposite ways give a visible outline with no thickness claimed. */
    if (zs.length === 1){
      byZ[zs[0]].forEach(function(r){ cap(r, zs[0], false); cap(r, zs[0], true); });
      return { positions: new Float32Array(pos), indices: new Uint32Array(idx),
               sections: 1, contours: byZ[zs[0]].length, capped: byZ[zs[0]].length, flat: true };
    }

    /* A contour is capped on whichever side it has no neighbour: both ends of the stack always,
       and anywhere in the middle where a cell branches or a section was left blank. Without that
       the preview is an open tube and reads as a hole in the tracing. */
    var hasAbove = {}, hasBelow = {}, capped = 0, contours = 0;
    function mark(set, z, i){ set[z + ":" + i] = 1; }
    function marked(set, z, i){ return !!set[z + ":" + i]; }
    for (var k = 0; k < zs.length - 1; k++){
      var below = byZ[zs[k]], above = byZ[zs[k + 1]];
      var got = pairUp(below, above);
      /* eslint-disable no-loop-func */
      (function(zLo, zHi, lo, hi){
        got.pairs.forEach(function(p){
          band(lo[p[0]], hi[p[1]], zLo, zHi);
          mark(hasAbove, zLo, p[0]);
          mark(hasBelow, zHi, p[1]);
        });
      })(zs[k], zs[k + 1], below, above);
    }
    zs.forEach(function(z, k){
      byZ[z].forEach(function(r, i){
        contours++;
        if (k > 0 && !marked(hasBelow, z, i)){ cap(r, z, true); capped++; }
        if (k === 0){ cap(r, z, true); capped++; }
        if (k < zs.length - 1 && !marked(hasAbove, z, i)){ cap(r, z, false); capped++; }
        if (k === zs.length - 1){ cap(r, z, false); capped++; }
      });
    });
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx),
             sections: zs.length, contours: contours, capped: capped };
  }

  /* ── HOW MUCH OF IT THERE IS ────────────────────────────────────────────────────  2026-09-17
     Søren: *"We need to calculate the organelle volumes also and add the volumes to the data for
     the cell when submitting."*

     A stack of outlines is exactly what Cavalieri's estimator is for, and it is the standard answer
     in stereology rather than a convenience: each section's area is multiplied by the slab of tissue
     that section stands for, and the sum is the volume. No surface has to be built, so this is
     arithmetic on the contours themselves — it costs nothing, it can be shown while drawing, and it
     does not depend on the lofting above being right about anything.

     TWO NUMBERS, DELIBERATELY. They differ only in what happens at the two ends of the stack, and
     the difference IS the uncertainty:

       cavalieri   each section owns a slab of (gap below + gap above)/2, with the end sections
                   mirrored so they own a full slab. The stack therefore extends half a gap past the
                   outermost contour at each end, which is right for an object that tapers away
                   between the last section you traced and the one you did not — a cell, a nucleus,
                   a mitochondrion. This is the reported volume.
       trapezoid   the frusta between traced sections and nothing beyond them. It cannot include
                   what is past the outermost contour, so it is a LOWER BOUND, and it is exact for
                   a cylinder whose flat ends you traced.

     THE EVEN-ODD RULE, the same one trace_mesh.py fills with: a contour drawn inside another is a
     HOLE, not a second blob. Depth is counted by testing each ring's first vertex against every
     other ring on its section, so a ring inside a ring inside a ring is solid again — which is what
     a vesicle inside a vacuole is.

     AREAS ARE µm², VOLUMES µm³, and the section spacing comes from the resolution the caller hands
     in. Nothing here knows how big a voxel is. */
  function ringArea(pts){
    return Math.abs(signedArea(pts));
  }
  /* Ray casting along +x. The ring is closed implicitly, as everywhere else in this feature. */
  function pointInRing(p, pts){
    var inside = false, n = pts.length;
    for (var i = 0, j = n - 1; i < n; j = i++){
      var a = pts[i], b = pts[j];
      if ((a[1] > p[1]) !== (b[1] > p[1])
          && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  /* The area of one section: rings at even depth add, rings at odd depth subtract. Signed rather
     than sorted by size, because "inside" is the question and a large ring can sit inside a larger
     concave one. */
  function areaOfSection(rings){
    var out = 0;
    rings.forEach(function(r, i){
      if (!r.points || r.points.length < 3) return;
      var depth = 0;
      rings.forEach(function(o, j){
        if (i === j || !o.points || o.points.length < 3) return;
        if (pointInRing(r.points[0], o.points)) depth++;
      });
      out += (depth % 2 ? -1 : 1) * ringArea(r.points);
    });
    return Math.max(0, out);
  }

  function volume(rings, resNm){
    var res = resNm || [1, 1, 1];
    var pxArea = res[0] * res[1] / 1e6;          // one voxel of section, in µm²
    var byZ = {}, zs = [];
    (rings || []).forEach(function(r){
      if (!r || !r.points || r.points.length < 3) return;
      var z = Math.round(r.z);
      if (!byZ[z]){ byZ[z] = []; zs.push(z); }
      byZ[z].push(r);
    });
    zs.sort(function(a, b){ return a - b; });
    var per = zs.map(function(z){
      return { z: z, rings: byZ[z].length, areaUm2: areaOfSection(byZ[z]) * pxArea };
    });
    if (!per.length) return { ok: false, reason: "nothing traced", sections: 0, contours: 0 };
    if (per.length === 1)
      /* ONE SECTION HAS NO DEPTH, and a volume of zero would be a number somebody could believe.
         The area is real and is returned; the volume is not knowable and says so. */
      return { ok: false, reason: "one section has no depth — trace it on at least two",
               sections: 1, contours: per[0].rings, areaUm2: per[0].areaUm2, perSection: per };

    var gaps = [], i;
    for (i = 0; i < zs.length - 1; i++) gaps.push((zs[i + 1] - zs[i]) * res[2]);
    var cav = 0, trap = 0;
    for (i = 0; i < per.length; i++){
      var below = gaps[i - 1] === undefined ? gaps[i] : gaps[i - 1];
      var above = gaps[i] === undefined ? gaps[i - 1] : gaps[i];
      cav += per[i].areaUm2 * (below + above) / 2 / 1000;      // nm -> µm
    }
    for (i = 0; i < gaps.length; i++)
      trap += (per[i].areaUm2 + per[i + 1].areaUm2) / 2 * gaps[i] / 1000;
    var sorted = gaps.slice().sort(function(a, b){ return a - b; });
    return { ok: true, method: "cavalieri",
             volumeUm3: cav, volumeTrapezoidUm3: trap,
             sections: per.length,
             contours: per.reduce(function(a, p){ return a + p.rings; }, 0),
             perSection: per,
             areaUm2: per.reduce(function(a, p){ return a + p.areaUm2; }, 0),
             gapNm: sorted[sorted.length >> 1],
             spanNm: (zs[zs.length - 1] - zs[0]) * res[2],
             /* Every gap the same means the sections were stepped evenly, which is the condition
                the half-a-percent figure on the card was measured under. */
             evenlySpaced: sorted[0] === sorted[sorted.length - 1] };
  }

  return { loft: loft, volume: volume,
           _orient: orient, _resample: resample, _bestOffset: bestOffset,
           _signedArea: signedArea, _pairUp: pairUp,
           _ringArea: ringArea, _pointInRing: pointInRing, _areaOfSection: areaOfSection, N: N };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = (typeof window !== "undefined" ? window : global).UJ.traceloft;
