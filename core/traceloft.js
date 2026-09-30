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
     · two contours on one section are two tubes here, and one blended object there;
     · a section skipped is bridged straight here, and interpolated there.
   For one closed outline per section — which is what tracing a cell looks like — the two agree on
   the silhouette and differ only in smoothness.

   A CONTOUR INSIDE ANOTHER IS A HOLE IN BOTH, since 2026-09-19 (Søren: *"it should subtract the
   inside from the outside... This hole should also exist in the 3D mesh"*). It was lofted as its
   own tube standing inside the first until then, while volume() below and trace_mesh.py both
   already subtracted it — so the preview was the only place the tracing looked wrong, which is
   the worst place for it to look wrong.

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

  /* The furthest a contour's outline gets from its own centre — its size, for deciding whether
     another contour is near enough to be the same object. MAX rather than mean: an open curve's
     centroid is not inside it, and the extent is the honest measure of how big the thing is. */
  function radiusOf(pts){
    if (!pts || !pts.length) return 0;
    var c = centroid(pts), m = 0, i, d;
    for (i = 0; i < pts.length; i++){
      d = Math.hypot(pts[i][0] - c[0], pts[i][1] - c[1]);
      if (d > m) m = d;
    }
    return m;
  }
  /* ── HOW FAR “NEAREST” IS ALLOWED TO BE ────────────────────────────  2026-09-24
     Søren, of a fibroblast traced every tenth section with a cilium traced on every one: "The middle
     part of this fibroblast is getting a really bad mesh." The body's contour had nothing of its own
     on the next section, so it was banded to the cilium 19 µm away.

     Plausible when the centres are near RELATIVE TO HOW BIG the two contours are, or when their
     outlines nearly touch whatever the ratio. Both are ratios of the contours' own size, so this
     needs no idea how big a voxel is. Measured on his file, the two populations do not overlap:
     every real band is under 2.58, every shard is 2.93 or more.
     See src/a_contour_is_not_joined_to_something_far_away.py. */
  var REACH_RATIO = 2.5;
  function plausiblePair(d, ra, rb){
    if (!(ra > 0) || !(rb > 0)) return true;        // no size recorded: exactly as before
    if (d <= REACH_RATIO * (ra + rb)) return true;
    return (d - (ra + rb)) <= 2 * Math.max(ra, rb);
  }
  /* Greedy nearest-centroid pairing between the contours of two neighbouring sections. A cell that
     branches has two contours above one, and one of them gets the band while the other is capped —
     which draws the branch as a separate stub rather than as a twisted sheet joining both.

     THE SECOND-NEAREST IS NOT TRIED when the nearest is implausible, and that is deliberate: if the
     closest contour on that section is not this object, nothing further away is either. */
  function pairUp(below, above){
    var used = {}, pairs = [], i, j;
    for (i = 0; i < below.length; i++){
      var c = below[i].c, pick = -1, bestD = Infinity;
      for (j = 0; j < above.length; j++){
        if (used[j]) continue;
        var d = Math.pow(c[0] - above[j].c[0], 2) + Math.pow(c[1] - above[j].c[1], 2);
        if (d < bestD){ bestD = d; pick = j; }
      }
      if (pick >= 0 && plausiblePair(Math.sqrt(bestD), below[i].rad, above[pick].rad)){
        used[pick] = 1; pairs.push([i, pick]);
      }
    }
    return { pairs: pairs, usedAbove: used };
  }

  /* @loftholes:start */
  /* ── WHICH CONTOURS ARE HOLES ──────────────────────────────────────────────────  2026-09-19
     Søren: *"If I draw one contour inside another, it should subtract the inside from the outside,
     so that the inner one becomes a hole. This hole should also exist in the 3D mesh."*

     The same counting areaOfSection() has always done, on the resampled rings: how many other
     contours of this section contain this one. Odd is a hole; even is solid; a ring inside a hole
     is solid again, so a vesicle inside a vacuole inside a cell needs no special case.

     The PARENT is the container one depth up, which is what decides whose cap a hole is punched
     out of. Found by a second pass rather than by sorting on area, because "inside" is the
     question and a large ring can sit inside a larger concave one. */
  function nestOf(list){
    var depth = [], parent = [], i, j;
    for (i = 0; i < list.length; i++){
      var d = 0;
      for (j = 0; j < list.length; j++)
        if (i !== j && pointInRing(list[i].pts[0], list[j].pts)) d++;
      depth.push(d); parent.push(-1);
    }
    for (i = 0; i < list.length; i++)
      for (j = 0; j < list.length; j++)
        if (i !== j && depth[j] === depth[i] - 1 && pointInRing(list[i].pts[0], list[j].pts))
          parent[i] = j;
    return { depth: depth, parent: parent };
  }

  /* ── A CAP WITH ITS HOLES CUT OUT ──────────────────────────────────────────────  2026-09-19
     Only needed where a contour that HAS holes also has no neighbour on one side -- the two ends
     of the stack, and a branch. A hole that starts or stops mid-stack never comes through here:
     its parent is not capped there, and the hole's own reversed disc is the cavity's floor. */
  function cross2(o, a, b){
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }
  /* STRICTLY inside, which matters more than it looks: bridging duplicates two vertices, and a
     test that counted a coincident point as inside would reject every ear and stall the clip. */
  function inTri(p, a, b, c){
    return cross2(a, b, p) > 0 && cross2(b, c, p) > 0 && cross2(c, a, p) > 0;
  }
  /* Eberly's bridge. From the hole's rightmost vertex M, cast +x; the outer edge hit first gives a
     point I, and the candidate P is that edge's right-hand end. If any REFLEX vertex of the outer
     lies inside the triangle M-I-P it blocks the straight line, and the visible one is whichever
     of them sits at the smallest angle from +x -- nearest wins a tie. */
  function bridge(outer, hole){
    var m = 0, i;
    for (i = 1; i < hole.length; i++) if (hole[i][0] > hole[m][0]) m = i;
    var M = hole[m], bestX = Infinity, e = -1;
    for (i = 0; i < outer.length; i++){
      var a = outer[i], b = outer[(i + 1) % outer.length];
      if ((a[1] > M[1]) === (b[1] > M[1])) continue;          // the edge does not span M's row
      var x = a[0] + (M[1] - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
      if (x >= M[0] && x < bestX){ bestX = x; e = i; }
    }
    if (e < 0) return null;                                    // the hole is not inside after all
    var p = outer[e][0] > outer[(e + 1) % outer.length][0] ? e : (e + 1) % outer.length;
    var I = [bestX, M[1]], P = outer[p], bestAng = Infinity, bestD = Infinity;
    for (i = 0; i < outer.length; i++){
      if (i === p) continue;
      var R = outer[i];
      var prev = outer[(i + outer.length - 1) % outer.length], next = outer[(i + 1) % outer.length];
      if (cross2(prev, R, next) > 0) continue;                 // convex: it cannot block anything
      if (!inTri(R, M, I, P) && !inTri(R, M, P, I)) continue;
      var dx = R[0] - M[0], dy = R[1] - M[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
      var ang = Math.abs(dy) / L, d = dx * dx + dy * dy;
      if (ang < bestAng - 1e-12 || (Math.abs(ang - bestAng) <= 1e-12 && d < bestD)){
        bestAng = ang; bestD = d; p = i;
      }
    }
    return { hole: m, outer: p };
  }
  /* Holes are bridged rightmost first, so a later bridge can see the boundary an earlier one
     already folded in rather than crossing it. */
  function mergeHoles(outer, holes){
    var poly = outer.slice(), order = [], i, k;
    for (k = 0; k < holes.length; k++){
      var m = 0;
      for (i = 1; i < holes[k].length; i++) if (holes[k][i][0] > holes[k][m][0]) m = i;
      order.push({ h: holes[k], x: holes[k][m][0] });
    }
    order.sort(function(a, b){ return b.x - a.x; });
    for (k = 0; k < order.length; k++){
      var br = bridge(poly, order[k].h);
      if (!br) return null;
      var H = order[k].h, merged = [];
      for (i = 0; i <= br.outer; i++) merged.push(poly[i]);
      for (i = 0; i < H.length; i++) merged.push(H[(br.hole + i) % H.length]);
      merged.push(H[br.hole]);
      merged.push(poly[br.outer]);
      for (i = br.outer + 1; i < poly.length; i++) merged.push(poly[i]);
      poly = merged;
    }
    return poly;
  }
  /* Ear clipping, O(n²) and unapologetic: a cap is at most a few hundred vertices and happens
     twice per structure per stack, not per frame. It returns what it managed rather than throwing,
     and the caller checks the count. */
  function earClip(poly){
    var n = poly.length, V = [], tris = [], i, guard = 2 * n * n;
    for (i = 0; i < n; i++) V.push(i);
    while (V.length > 3 && guard-- > 0){
      var cut = -1;
      for (var vi = 0; vi < V.length; vi++){
        var i0 = V[(vi + V.length - 1) % V.length], i1 = V[vi], i2 = V[(vi + 1) % V.length];
        var a = poly[i0], b = poly[i1], c = poly[i2];
        if (cross2(a, b, c) <= 0) continue;                    // reflex or degenerate: not an ear
        var clear = true;
        for (var k = 0; k < V.length; k++){
          var ik = V[k];
          if (ik === i0 || ik === i1 || ik === i2) continue;
          if (inTri(poly[ik], a, b, c)){ clear = false; break; }
        }
        if (!clear) continue;
        tris.push([i0, i1, i2]); cut = vi; break;
      }
      if (cut < 0) break;
      V.splice(cut, 1);
    }
    if (V.length === 3) tris.push([V[0], V[1], V[2]]);
    return tris;
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
      byZ[z].push({ pts: pts, c: centroid(pts), rad: radiusOf(pts) });
    });
    zs.sort(function(a, b){ return a - b; });

    /* HOLES ARE STORED REVERSED, and that is the whole of the special-casing. band() and cap()
       below are untouched: a ring wound the other way makes them emit triangles whose normals
       point into the cavity, which is where the material is. Reversing after resampling keeps the
       equal-arc-length spacing, and the centroid is the same either way. */
    var nest = {};
    zs.forEach(function(z){
      var list = byZ[z], n = nestOf(list);
      nest[z] = n;
      list.forEach(function(r, i){
        r.hole = (n.depth[i] % 2) === 1;
        r.parent = n.parent[i];
        if (r.hole) r.pts = r.pts.slice().reverse();
      });
    });

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
    /* The same cap, with this contour's holes cut out of it. Falls back to fans -- the outer's,
       plus each hole's reversed -- if the bridge or the clip cannot cope: coplanar and ugly, but
       closed, and still outer-minus-hole by signed volume. Returns whether the holes were dealt
       with here, so the caller knows not to give them their own disc as well. */
    function capHoled(ring, holes, z, flip){
      if (!holes.length){ cap(ring, z, flip); return true; }
      /* The holes are ALREADY clockwise -- that is how they are stored -- which is exactly the
         winding a hole has to have to be spliced into a counter-clockwise outer and leave one
         simple polygon behind. Nothing to turn round here. */
      var poly = mergeHoles(ring.pts, holes.map(function(h){ return h.pts; }));
      var tris = poly ? earClip(poly) : null;
      if (!tris || tris.length < poly.length - 2){
        cap(ring, z, flip);
        holes.forEach(function(h){ cap(h, z, flip); });
        return true;
      }
      var first = pos.length / 3, i;
      for (i = 0; i < poly.length; i++) put(poly[i], z);
      for (i = 0; i < tris.length; i++){
        var t = tris[i];
        if (flip) idx.push(first + t[0], first + t[2], first + t[1]);
        else idx.push(first + t[0], first + t[1], first + t[2]);
      }
      return true;
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
           to cross-check volume() against the loft. Two sums over one tracing are worth more than
           either of them alone, and they can only agree if this is consistent. */
        idx.push(a0, b1, b0, a0, a1, b1);
      }
    }
    function holesOf(z, i){
      return byZ[z].filter(function(r){ return r.parent === i; });
    }

    if (!zs.length) return { positions: new Float32Array(0), indices: new Uint32Array(0),
                             sections: 0, contours: 0, capped: 0, holes: 0 };
    function holeCount(){
      var n = 0;
      zs.forEach(function(z){ byZ[z].forEach(function(r){ if (r.hole) n++; }); });
      return n;
    }
    /* ONE SECTION IS NOT A SOLID, and saying so beats drawing a disc somebody would read as one.
       Two flat caps facing opposite ways give a visible outline with no thickness claimed -- with
       the hole cut out of both, so a single traced section of a ring shows as a ring. */
    if (zs.length === 1){
      var z0 = zs[0];
      byZ[z0].forEach(function(r, i){
        if (r.hole) return;
        capHoled(r, holesOf(z0, i), z0, false);
        capHoled(r, holesOf(z0, i), z0, true);
      });
      return { positions: new Float32Array(pos), indices: new Uint32Array(idx),
               sections: 1, contours: byZ[z0].length, capped: byZ[z0].length,
               holes: holeCount(), flat: true };
    }

    /* A contour is capped on whichever side it has no neighbour: both ends of the stack always,
       and anywhere in the middle where a cell branches or a section was left blank. Without that
       the preview is an open tube and reads as a hole in the tracing. */
    var hasAbove = {}, hasBelow = {}, capped = 0, contours = 0;
    function mark(set, z, i){ set[z + ":" + i] = 1; }
    function marked(set, z, i){ return !!set[z + ":" + i]; }
    /* BY PARITY. Outlines are paired with outlines and holes with holes, in two passes, so greedy
       nearest-centroid can never join a hole to an outline -- which would be a sheet through the
       middle of the tissue, and is exactly what a small hole next to a small neighbouring cell
       would have produced. */
    function pairByParity(liveList, above, zHi, wantHole, out){
      var b = [], a = [], ai = [], i;
      for (i = 0; i < liveList.length; i++) if (!liveList[i].r.hole === !wantHole) b.push(liveList[i]);
      for (i = 0; i < above.length; i++) if (!above[i].hole === !wantHole){ ai.push(i); a.push(above[i]); }
      if (!b.length || !a.length) return;
      pairUp(b.map(function(L){ return L.r; }), a).pairs.forEach(function(p){
        var L = b[p[0]], A = a[p[1]], j = ai[p[1]];
        band(L.r, A, L.z, zHi);
        mark(hasAbove, L.z, L.i);
        mark(hasBelow, zHi, j);
        out[L.z + ":" + L.i] = { r: A, z: zHi, i: j };
      });
    }
    /* ── A CONTOUR WAITS FOR ITS OWN NEXT SECTION ────────────────────  2026-09-24
       This used to band zs[k] to zs[k+1] and nothing else, which is right only while everything is
       traced at one rate. Søren's fibroblast is traced every tenth section with a cilium on every
       one, so the body's next contour is ten sections up and the section in between holds only the
       cilium — which, before the reach limit above, is what the body got banded to.

       HOW LONG IT WAITS is the tracer's own spacing: the widest gap between consecutive sections
       anywhere in this tracing. Eleven sections on his file, exactly the rate he used; ONE on an
       evenly traced object, so a contour that genuinely ends is still capped at the very next
       section, as it always was. */
    var maxGap = 12;
    for (var gi = 1; gi < zs.length; gi++) maxGap = Math.max(maxGap, zs[gi] - zs[gi - 1]);
    var live = zs.length ? byZ[zs[0]].map(function(r, i){ return { r: r, z: zs[0], i: i }; }) : [];
    for (var k = 1; k < zs.length; k++){
      var above = byZ[zs[k]], zHi = zs[k], moved = {};
      pairByParity(live, above, zHi, false, moved);
      pairByParity(live, above, zHi, true, moved);
      var next = [], took = {};
      live.forEach(function(L){
        var rep = moved[L.z + ":" + L.i];
        if (rep){ next.push(rep); took[rep.i] = 1; return; }
        if (zHi - L.z <= maxGap) next.push(L);      // still waiting; past that, it has ended
      });
      above.forEach(function(A, j){ if (!took[j]) next.push({ r: A, z: zHi, i: j }); });
      live = next;
    }
    /* Which holes were taken care of by their parent's cap, so they do not also get a disc of
       their own on that side -- two coplanar caps facing the same way is a doubled surface, and
       doubles the volume it encloses. */
    var doneBelow = {}, doneAbove = {};
    zs.forEach(function(z, k){
      byZ[z].forEach(function(r, i){
        if (r.hole) return;
        var hs = holesOf(z, i);
        if (k === 0 || !marked(hasBelow, z, i)){
          capHoled(r, hs, z, true); capped++;
          hs.forEach(function(h){ doneBelow[z + ":" + byZ[z].indexOf(h)] = 1; });
        }
        if (k === zs.length - 1 || !marked(hasAbove, z, i)){
          capHoled(r, hs, z, false); capped++;
          hs.forEach(function(h){ doneAbove[z + ":" + byZ[z].indexOf(h)] = 1; });
        }
      });
      /* A hole that begins or ends inside the stack: its parent carries on past it, so nothing was
         punched, and the cavity needs its own floor or ceiling. Reversed storage points it the
         right way round without a flag. */
      byZ[z].forEach(function(r, i){
        if (!r.hole) return;
        if ((k === 0 || !marked(hasBelow, z, i)) && !doneBelow[z + ":" + i]){ cap(r, z, true); capped++; }
        if ((k === zs.length - 1 || !marked(hasAbove, z, i)) && !doneAbove[z + ":" + i]){
          cap(r, z, false); capped++;
        }
      });
      contours += byZ[z].length;
    });
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx),
             sections: zs.length, contours: contours, capped: capped, holes: holeCount() };
  }
  /* @loftholes:end */
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

  /* ── INTERPOLATING BETWEEN SECTIONS ──────────────────────────────────────────  2026-09-22
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
      byZ[z].push({ pts: pts, c: centroid(pts), rad: radiusOf(pts), src: i, inst: r.inst || 0 });
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
      /* With the radius, so a chain is not dragged onto a contour nowhere near it either — the
         same rule the mesh uses, and for the same reason (2026-09-24). */
      var below = live.map(function(L){ return { c: centroid(L.last), rad: radiusOf(L.last) }; });
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

  /* ── SECTIONS THAT LIE ON THE LINE BETWEEN THEIR NEIGHBOURS ──────────────────  2026-09-23
     Søren: "Can we reduce z-layers that are redundant in addition?"

     LINEAR, not the cubic interpolate() above uses. loft() bands straight between sections and
     Cavalieri is a trapezoid sum over them, so a contour already on the straight line between its
     two neighbours adds nothing to the mesh and nothing to the volume. Fitting a cubic here would
     be prettier and false: it is not what either consumer does with the sections.

     AND THIS MOVES THE VOLUME, which dropping points inside a contour does not: it changes which
     areas the sum is over. The caller is given volBefore/volAfter to say so.

     thinSections(rings, {nm}) -> { rings, before, after, dropped, worstNm }
     The first and last section are never dropped -- they are what the object's extent IS.
     See src/redundant_sections_can_go_too.py. */
  function thinSections(rings, opts){
    opts = opts || {};
    var resNm = (window.UJ && UJ.cfg && UJ.cfg.res && +UJ.cfg.res[0]) || 4;
    var tol = (+opts.nm > 0 ? +opts.nm : 16) / resNm;      /* voxels */
    var byZ = {}, zs = [];
    (rings || []).forEach(function(r){
      if (!r || !r.points || r.points.length < 3) return;
      var z = +r.z;
      if (!byZ[z]){ byZ[z] = []; zs.push(z); }
      byZ[z].push(r);
    });
    zs.sort(function(a, b){ return a - b; });
    if (zs.length < 3) return { rings: (rings || []).slice(), before: zs.length,
                                after: zs.length, dropped: [], worstNm: 0 };

    /* One resampled, aligned ring per section: the comparison has to be vertex to vertex, and
       pairUp/bestOffset are how every other part of this file decides which vertex is which. */
    var reps = zs.map(function(z){ return resample(orient(byZ[z][0].points), N); });
    for (var i = 1; i < reps.length; i++){
      var off = bestOffset(reps[i - 1], reps[i]);
      reps[i] = reps[i].slice(off).concat(reps[i].slice(0, off));
    }

    /* How far section k sits from the straight line between a and b. */
    function devOf(a, k, b){
      var t = (zs[k] - zs[a]) / (zs[b] - zs[a]), worst = 0;
      for (var v = 0; v < N; v++){
        var x = reps[a][v][0] + (reps[b][v][0] - reps[a][v][0]) * t;
        var y = reps[a][v][1] + (reps[b][v][1] - reps[a][v][1]) * t;
        var d = Math.sqrt(Math.pow(reps[k][v][0] - x, 2) + Math.pow(reps[k][v][1] - y, 2));
        if (d > worst) worst = d;
      }
      return worst;
    }

    /* Greedy: the cheapest section goes first, and its two neighbours are re-judged against the
       wider gap they now span. A section only ever gets harder to drop, never easier. */
    var alive = zs.map(function(){ return true; });
    var prev = zs.map(function(_, i){ return i - 1; });
    var next = zs.map(function(_, i){ return i + 1; });
    var dev = zs.map(function(_, i){
      return (i === 0 || i === zs.length - 1) ? Infinity : devOf(i - 1, i, i + 1);
    });
    var dropped = [], worst = 0;
    for (;;){
      var best = -1, bestD = Infinity;
      for (var k = 1; k < zs.length - 1; k++)
        if (alive[k] && dev[k] < bestD){ bestD = dev[k]; best = k; }
      if (best < 0 || bestD > tol) break;
      alive[best] = false; dropped.push(zs[best]);
      if (bestD > worst) worst = bestD;
      var a = prev[best], b = next[best];
      next[a] = b; prev[b] = a;
      if (a > 0 && alive[a]) dev[a] = devOf(prev[a], a, next[a]);
      if (b < zs.length - 1 && alive[b]) dev[b] = devOf(prev[b], b, next[b]);
    }

    var keep = {};
    zs.forEach(function(z, i){ if (alive[i]) keep[z] = 1; });
    var out = (rings || []).filter(function(r){ return keep[+r.z]; });
    return { rings: out, before: zs.length, after: zs.length - dropped.length,
             dropped: dropped, worstNm: Math.round(worst * resNm * 10) / 10 };
  }


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


  /* ── THE SAME QUESTIONS IN THREE DIMENSIONS ──────────────────────────────────  2026-09-30
     shape3d(rings, resNm) -> { ok, volumeUm3, surfaceUm2, hullVolumeUm3,
                                sphericityWadell, sphericityMorphoLibJ,
                                elongation, flatness, solidity3d, axesUm, sections }

     EVERYTHING IN µm, FROM resNm. In a serial-section dataset the z step is many times the xy
     pixel; metrics computed on voxel indices would report every organelle as elongated along z.
     See src/the_same_questions_in_three_dimensions.py.

     V AND S COME FROM THE SAME OBJECT -- the lofted mesh, which is closed. Voxel faces overestimate
     surface area, and sphericity cubes the surface, so the estimator matters more here than
     anywhere else in this file.

     TWO SPHERICITY CONVENTIONS, BOTH NAMED. Wadell π^(1/3)(6V)^(2/3)/S, MorphoLibJ 36πV²/S³ =
     Wadell³. Reporting one silently is how a number stops lining up with FIJI. */

  /* Eigenvalues of a symmetric 3x3, largest first. Analytic (Smith 1961) -- three eigenvalues do
     not need an iterative solver, and a solver that sometimes fails to converge is worse than a
     formula that never does. m = [xx, yy, zz, xy, xz, yz]. */
  function eig3(m){
    var xx = m[0], yy = m[1], zz = m[2], xy = m[3], xz = m[4], yz = m[5];
    var p1 = xy * xy + xz * xz + yz * yz;
    var q = (xx + yy + zz) / 3;
    if (p1 === 0) return [xx, yy, zz].sort(function(a, b){ return b - a; });
    var p2 = (xx - q) * (xx - q) + (yy - q) * (yy - q) + (zz - q) * (zz - q) + 2 * p1;
    var p = Math.sqrt(p2 / 6);
    var b00 = (xx - q) / p, b11 = (yy - q) / p, b22 = (zz - q) / p;
    var b01 = xy / p, b02 = xz / p, b12 = yz / p;
    var det = b00 * (b11 * b22 - b12 * b12) - b01 * (b01 * b22 - b12 * b02)
            + b02 * (b01 * b12 - b11 * b02);
    var r = det / 2;
    r = r < -1 ? -1 : (r > 1 ? 1 : r);
    var phi = Math.acos(r) / 3;
    var e1 = q + 2 * p * Math.cos(phi);
    var e3 = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3);
    return [e1, 3 * q - e1 - e3, e3];
  }

  /* Incremental convex hull, returning its volume. Points are decimated first: a hull is decided
     by its extremes, and a thousand of them place it as well as ten thousand do. Returns 0 when the
     cloud is flat or degenerate, which the caller reads as "no solidity to report". */
  function hullVolume(P){
    var n = P.length / 3;
    if (n < 4) return 0;
    var stride = Math.max(1, Math.floor(n / 1200));
    var pts = [];
    for (var i = 0; i < n; i += stride) pts.push([P[i*3], P[i*3+1], P[i*3+2]]);
    if (pts.length < 4) return 0;
    var sub = function(a, b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; };
    var crs = function(a, b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; };
    var dot = function(a, b){ return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; };
    /* A starting tetrahedron: two extremes, then the point furthest from that line, then the point
       furthest from that plane. Picking the first four in order fails on any sorted input. */
    var i0 = 0, i1 = 0, k;
    for (k = 1; k < pts.length; k++){
      if (pts[k][0] < pts[i0][0]) i0 = k;
      if (pts[k][0] > pts[i1][0]) i1 = k;
    }
    if (i0 === i1) return 0;
    var d01 = sub(pts[i1], pts[i0]), i2 = -1, best = 0;
    for (k = 0; k < pts.length; k++){
      var c = crs(d01, sub(pts[k], pts[i0])), L = dot(c, c);
      if (L > best){ best = L; i2 = k; }
    }
    if (i2 < 0 || best <= 0) return 0;
    var nrm = crs(d01, sub(pts[i2], pts[i0])), i3 = -1; best = 0;
    for (k = 0; k < pts.length; k++){
      var h = Math.abs(dot(nrm, sub(pts[k], pts[i0])));
      if (h > best){ best = h; i3 = k; }
    }
    if (i3 < 0 || best <= 0) return 0;
    var faces = [];
    var add = function(a, b, c, inside){
      var nn = crs(sub(pts[b], pts[a]), sub(pts[c], pts[a]));
      if (dot(nn, sub(pts[inside], pts[a])) > 0){ var t = b; b = c; c = t;
        nn = crs(sub(pts[b], pts[a]), sub(pts[c], pts[a])); }
      faces.push([a, b, c, nn]);
    };
    add(i0, i1, i2, i3); add(i0, i1, i3, i2); add(i0, i2, i3, i1); add(i1, i2, i3, i0);
    /* THE TEST IS A DISTANCE, NOT A DOT PRODUCT.  2026-09-30
       It was an unnormalised dot against a fixed epsilon, and that works on scattered points and
       fails on exactly the input this is for. A face normal here has magnitude (edge length)², so
       at coordinates in nanometres it is ~4e8; floating noise on a point lying EXACTLY in a face's
       plane then comes out around 4, which sailed past an epsilon of 2e-4 and read as "outside".
       Traced contours are full of coplanar points -- they are stacked rings -- so face after face
       was torn out for points already on the hull, and the sphere came back with a hull a hundred
       times its own bounding box. Dividing by |n| makes it the real distance to the plane, and the
       epsilon is relative to the cloud's own size. Caught by organelleshapecheck.js. */
    var lo = [pts[0][0], pts[0][1], pts[0][2]], hi = [pts[0][0], pts[0][1], pts[0][2]];
    for (k = 1; k < pts.length; k++) for (var c3 = 0; c3 < 3; c3++){
      if (pts[k][c3] < lo[c3]) lo[c3] = pts[k][c3];
      if (pts[k][c3] > hi[c3]) hi[c3] = pts[k][c3];
    }
    var diag = Math.sqrt((hi[0]-lo[0])*(hi[0]-lo[0]) + (hi[1]-lo[1])*(hi[1]-lo[1])
                       + (hi[2]-lo[2])*(hi[2]-lo[2]));
    var eps = 1e-7 * (diag || 1);
    for (k = 0; k < pts.length; k++){
      var p = pts[k], vis = [], keep = [], f;
      for (var fi = 0; fi < faces.length; fi++){
        f = faces[fi];
        var nl = Math.sqrt(dot(f[3], f[3])) || 1;
        if (dot(f[3], sub(p, pts[f[0]])) / nl > eps) vis.push(f); else keep.push(f);
      }
      if (!vis.length) continue;
      /* The horizon: every edge of a visible face that a visible face does not share. */
      var cnt = {};
      vis.forEach(function(g){
        [[g[0], g[1]], [g[1], g[2]], [g[2], g[0]]].forEach(function(e){
          var key = e[0] < e[1] ? e[0] + "_" + e[1] : e[1] + "_" + e[0];
          if (cnt[key]) cnt[key].n++; else cnt[key] = { n: 1, a: e[0], b: e[1] };
        });
      });
      faces = keep;
      var interior = pts[i0], any = false;
      Object.keys(cnt).forEach(function(key){
        var e = cnt[key];
        if (e.n !== 1) return;
        var nn = crs(sub(pts[e.b], pts[e.a]), sub(p, pts[e.a]));
        if (!(dot(nn, nn) > 0)) return;
        /* Outward means away from the hull's inside; any interior point decides it, and the
           centroid of the seed tetrahedron is always inside. */
        var cen = [(pts[i0][0]+pts[i1][0]+pts[i2][0]+pts[i3][0])/4,
                   (pts[i0][1]+pts[i1][1]+pts[i2][1]+pts[i3][1])/4,
                   (pts[i0][2]+pts[i1][2]+pts[i2][2]+pts[i3][2])/4];
        var a = e.a, b = e.b;
        if (dot(nn, sub(cen, pts[a])) > 0){ var t = a; a = b; b = t;
          nn = crs(sub(pts[b], pts[a]), sub(p, pts[a])); }
        faces.push([a, b, k, nn]);
        any = true;
      });
      if (!any) return 0;
      interior = interior;
    }
    /* A HULL THAT IS NOT CLOSED HAS NO VOLUME, and a number computed from an open surface is
       worse than no number: every edge of a closed triangulation is shared by exactly two faces,
       so this refuses rather than reports. Solidity then reads blank in the sheet. */
    var edge = {}, openEdges = 0;
    faces.forEach(function(f){
      [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]].forEach(function(e){
        var key = e[0] < e[1] ? e[0] + "_" + e[1] : e[1] + "_" + e[0];
        edge[key] = (edge[key] || 0) + 1;
      });
    });
    Object.keys(edge).forEach(function(key){ if (edge[key] !== 2) openEdges++; });
    if (openEdges) return 0;
    var vol = 0;
    faces.forEach(function(f){
      var a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
      vol += dot(a, crs(b, c)) / 6;
    });
    return Math.abs(vol);
  }

  function shape3d(rings, resNm){
    var res = resNm || [1, 1, 1];
    var M;
    try { M = loft(rings, res); } catch (e){ return { ok: false, reason: "could not be lofted" }; }
    if (!M || !M.indices || M.indices.length < 12 || M.flat || M.sections < 2)
      return { ok: false, reason: "one section has no depth — trace it on at least two",
               sections: M ? M.sections : 0 };
    var P = M.positions, I = M.indices;
    /* Every triangle makes a tetrahedron with the origin. Signed, so the outside cancels and what
       is left is the solid -- holes included, which is what makes a torus come out as a torus. */
    var V = 0, S = 0, cx = 0, cy = 0, cz = 0;
    var mxx = 0, myy = 0, mzz = 0, mxy = 0, mxz = 0, myz = 0, t;
    for (t = 0; t < I.length; t += 3){
      var ia = I[t]*3, ib = I[t+1]*3, ic = I[t+2]*3;
      var ax = P[ia], ay = P[ia+1], az = P[ia+2];
      var bx = P[ib], by = P[ib+1], bz = P[ib+2];
      var gx = P[ic], gy = P[ic+1], gz = P[ic+2];
      var ux = bx-ax, uy = by-ay, uz = bz-az;
      var vx = gx-ax, vy = gy-ay, vz = gz-az;
      var nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
      S += Math.sqrt(nx*nx + ny*ny + nz*nz) / 2;
      var v6 = ax*(by*gz - bz*gy) - ay*(bx*gz - bz*gx) + az*(bx*gy - by*gx);
      var v = v6 / 6;
      V += v;
      cx += v * (ax+bx+gx) / 4; cy += v * (ay+by+gy) / 4; cz += v * (az+bz+gz) / 4;
      /* Barycentric: over a tetrahedron with one vertex at the origin,
         ∫ x_i x_j dV = v/20 · ( (Σ p_i)(Σ p_j) + Σ p_i p_j ). */
      var sx = ax+bx+gx, sy = ay+by+gy, sz = az+bz+gz;
      mxx += v * (sx*sx + ax*ax + bx*bx + gx*gx) / 20;
      myy += v * (sy*sy + ay*ay + by*by + gy*gy) / 20;
      mzz += v * (sz*sz + az*az + bz*bz + gz*gz) / 20;
      mxy += v * (sx*sy + ax*ay + bx*by + gx*gy) / 20;
      mxz += v * (sx*sz + ax*az + bx*bz + gx*gz) / 20;
      myz += v * (sy*sz + ay*az + by*bz + gy*gz) / 20;
    }
    var sgn = V < 0 ? -1 : 1;
    V *= sgn; cx *= sgn; cy *= sgn; cz *= sgn;
    mxx *= sgn; myy *= sgn; mzz *= sgn; mxy *= sgn; mxz *= sgn; myz *= sgn;
    if (!(V > 0) || !(S > 0)) return { ok: false, reason: "no enclosed volume", sections: M.sections };
    cx /= V; cy /= V; cz /= V;
    var Cxx = mxx/V - cx*cx, Cyy = myy/V - cy*cy, Czz = mzz/V - cz*cz,
        Cxy = mxy/V - cx*cy, Cxz = mxz/V - cx*cz, Cyz = myz/V - cy*cz;
    var ev = eig3([Cxx, Cyy, Czz, Cxy, Cxz, Cyz]);
    /* The equivalent ellipsoid: semi-axis = sqrt(5·eigenvalue), MorphoLibJ's inertia-ellipsoid
       convention. Moment ratios, NOT end-to-end lengths -- a 5:1 rod does not score exactly 5. */
    var a1 = Math.sqrt(Math.max(0, 5 * ev[0])) / 1000,
        a2 = Math.sqrt(Math.max(0, 5 * ev[1])) / 1000,
        a3 = Math.sqrt(Math.max(0, 5 * ev[2])) / 1000;
    var volUm3 = V / 1e9, surfUm2 = S / 1e6;
    var wadell = Math.pow(Math.PI, 1/3) * Math.pow(6 * volUm3, 2/3) / surfUm2;
    var hull = hullVolume(P) / 1e9;
    return { ok: true, sections: M.sections,
             volumeUm3: volUm3, surfaceUm2: surfUm2,
             sphericityWadell: Math.min(1, wadell),
             sphericityMorphoLibJ: Math.min(1, Math.pow(wadell, 3)),
             elongation: a2 > 0 ? a1 / a2 : null,
             flatness: a3 > 0 ? a2 / a3 : null,
             solidity3d: hull > 0 ? Math.min(1, volUm3 / hull) : null,
             hullVolumeUm3: hull > 0 ? hull : null,
             axesUm: [a1, a2, a3],
             centroidNm: [cx, cy, cz] };
  }

  return { loft: loft, volume: volume, shape: shape, shape3d: shape3d,
           surfacePoints: surfacePoints, minSurfaceDistNm: minSurfaceDistNm,
           interpolate: interpolate, thinSections: thinSections,
           _orient: orient, _resample: resample, _bestOffset: bestOffset,
           _signedArea: signedArea, _pairUp: pairUp,
           _ringArea: ringArea, _pointInRing: pointInRing, _areaOfSection: areaOfSection,
           _nestOf: nestOf, _mergeHoles: mergeHoles, _earClip: earClip,
           _moments: moments, _perimeter: perimeter, _convexHull: convexHull, _describe: describe,
           _eig3: eig3, _hullVolume: hullVolume,
           N: N };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = (typeof window !== "undefined" ? window : global).UJ.traceloft;
