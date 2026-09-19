# -*- coding: utf-8 -*-
u"""A contour inside another is a hole.                                          2026-09-19

Søren: *"If I draw one contour inside another, it should subtract the inside from the outside, so
that the inner one becomes a hole. This hole should also exist in the 3D mesh."*

HALF OF THIS WAS ALREADY TRUE, and it is worth saying which half before changing anything, because
the two halves that were wrong are the two he can SEE:

  volume   core/traceloft.js areaOfSection() has counted depth by ray casting since 2026-09-17 and
           subtracts odd-depth rings. The µm³ on the card was already right.
  export   blender/trace_mesh.py fills every section under the even-odd rule before marching cubes.
           The mesh you download already had the hole.
  pad      padPaint() drew each ring with its own beginPath/fill, so the inner contour was filled
           ON TOP of the outer one. Two overlapping washes, no hole.  ← WRONG
  preview  loft() gave every ring its own centroid fan and its own band, so the inner contour was
           lofted as a SECOND TUBE standing inside the first.                    ← WRONG

So the tracing has been carrying the right answer and showing the wrong picture. That is the worst
arrangement available: somebody checks the preview, sees a tube inside a tube, and distrusts a
volume that was correct all along.

THE PAD IS ONE PATH PER STRUCTURE, FILLED EVEN-ODD. Canvas has had `fill("evenodd")` since forever
and it is the same rule as everything else in this feature, so the fix is to stop calling fill()
per contour: collect this section's rings BY STRUCTURE (r.inst -- two mitochondria side by side must
not punch each other), lay them into one path, fill once. Strokes and vertex dots stay per ring,
because those are about the contour you drew rather than about the region it bounds.

THE PREVIEW NEEDS THREE THINGS, and none of them is a new idea -- they are the same three the
export does, done with the machinery already in this file:

  1. WHICH RINGS ARE HOLES. nestOf() counts, for each ring on a section, how many other rings of
     that section contain it, using the pointInRing() that volume() already uses. Odd is a hole.
     A ring inside a hole is solid again, which is what a vesicle inside a vacuole is, and it gets
     its own holes at the next depth -- so this is general rather than a special case for one
     contour inside one other.
  2. HOLES ARE WOUND THE OTHER WAY. A hole ring is stored reversed, and then NOTHING else has to
     know: band() and cap() are unchanged, and the reversal flips their normals to point into the
     cavity, which is the direction the material actually is. This is the whole reason to reverse
     rather than to branch -- the alternative was a `isHole` argument threaded through every call.
  3. THE END CAPS ARE PUNCHED. Where a solid contour has no neighbour above or below, its cap is
     no longer a centroid fan but the outer ring with its holes bridged in and ear-clipped, so the
     cap has the hole cut out of it. Holes that start or stop in the MIDDLE of the stack -- which is
     the common case, a nucleus inside a soma -- need no punching at all: the parent is not capped
     there, and the hole's own disc, reversed, is the floor or ceiling of the cavity.

PAIRING IS BY PARITY. pairUp() runs twice per section gap, once over the solids and once over the
holes, so a hole can never be joined to an outline. Greedy nearest centroid would otherwise pair a
small hole to a small neighbouring cell across the section, which is a sheet through the middle of
the tissue.

WHAT EAR CLIPPING IS FOR AND WHY THE FALLBACK IS NOT A FAILURE. Bridging a hole into its outer ring
(Eberly's rule: from the hole's rightmost vertex, cast +x, take the edge hit first, and if reflex
vertices block the straight line take the one at the smallest angle) makes one simple polygon, and
ear clipping triangulates it. If that ever fails on a contour shaped in a way the bridge cannot
see past, the cap falls back to a fan for the outer plus a REVERSED fan for each hole: the two are
coplanar so it looks worse, but the surface is still closed and its signed volume is still
outer-minus-hole. A preview that is ugly in a rare case beats one that is wrong.

MEASURED, not asserted: traceloftcheck.js now lofts the same annulus the volume test uses -- a
1 µm circle with a 0.5 µm circle inside it on every section -- and checks that the mesh is
watertight, that its signed volume is three quarters of the solid's, and that it agrees with the
trapezoid estimate to the same 5% the solid cross-check uses. That is the assertion that says the
hole is really in the mesh and not just in the arithmetic.

Run: python3 src/a_contour_inside_another_is_a_hole.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── core/traceloft.js ────────────────────────────────────────────────────────────────────────
# The helpers go in above loft(); loft() itself is replaced whole, because nearly every line of it
# changes and a patchwork of one-line edits would be unreadable next to what it now does.

HELPERS = u'''  /* @loftholes:start */
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
      byZ[z].push({ pts: pts, c: centroid(pts) });
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
    function pairByParity(below, above, wantHole, zLo, zHi){
      var bi = [], ai = [], b = [], a = [], i;
      for (i = 0; i < below.length; i++) if (!below[i].hole === !wantHole){ bi.push(i); b.push(below[i]); }
      for (i = 0; i < above.length; i++) if (!above[i].hole === !wantHole){ ai.push(i); a.push(above[i]); }
      if (!b.length || !a.length) return;
      pairUp(b, a).pairs.forEach(function(p){
        band(b[p[0]], a[p[1]], zLo, zHi);
        mark(hasAbove, zLo, bi[p[0]]);
        mark(hasBelow, zHi, ai[p[1]]);
      });
    }
    for (var k = 0; k < zs.length - 1; k++){
      pairByParity(byZ[zs[k]], byZ[zs[k + 1]], false, zs[k], zs[k + 1]);
      pairByParity(byZ[zs[k]], byZ[zs[k + 1]], true, zs[k], zs[k + 1]);
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
'''

EXPORTS = [
    (u'''  return { loft: loft, volume: volume,
           _orient: orient, _resample: resample, _bestOffset: bestOffset,
           _signedArea: signedArea, _pairUp: pairUp,
           _ringArea: ringArea, _pointInRing: pointInRing, _areaOfSection: areaOfSection, N: N };''',
     u'''  return { loft: loft, volume: volume,
           _orient: orient, _resample: resample, _bestOffset: bestOffset,
           _signedArea: signedArea, _pairUp: pairUp,
           _ringArea: ringArea, _pointInRing: pointInRing, _areaOfSection: areaOfSection,
           _nestOf: nestOf, _mergeHoles: mergeHoles, _earClip: earClip, N: N };''',
     "the nesting and the triangulator are reachable from the check"),
]

HEADER = [
    (u'''   WHERE IT DIFFERS FROM THE EXPORT, said plainly because a preview that quietly disagrees with the
   file you download is worse than no preview:
     · a contour drawn INSIDE another is lofted as its own tube here, and is a HOLE in the export;
     · two contours on one section are two tubes here, and one blended object there;
     · a section skipped is bridged straight here, and interpolated there.
   For one closed outline per section — which is what tracing a cell looks like — the two agree on
   the silhouette and differ only in smoothness.''',
     u'''   WHERE IT DIFFERS FROM THE EXPORT, said plainly because a preview that quietly disagrees with the
   file you download is worse than no preview:
     · two contours on one section are two tubes here, and one blended object there;
     · a section skipped is bridged straight here, and interpolated there.
   For one closed outline per section — which is what tracing a cell looks like — the two agree on
   the silhouette and differ only in smoothness.

   A CONTOUR INSIDE ANOTHER IS A HOLE IN BOTH, since 2026-09-19 (Søren: *"it should subtract the
   inside from the outside... This hole should also exist in the 3D mesh"*). It was lofted as its
   own tube standing inside the first until then, while volume() below and trace_mesh.py both
   already subtracted it — so the preview was the only place the tracing looked wrong, which is
   the worst place for it to look wrong.''',
     "the header stops listing the hole as a difference from the export"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


# loft() is replaced BY REGION rather than by matching its whole body: the body is eighty lines and
# a string match on all of it would break on the next unrelated comment fix.
#
# AND THE REGION IS MARKED BY SENTINELS, which is the whole lesson of 2026-09-18, learned twice in
# one day (see src/a_section_beside_the_model.py and src/one_window_for_every_em.py). A generator
# whose REPLACEMENT contains its own anchor is idempotent only for as long as the replacement never
# changes: the second run cannot find its way back to the region it wrote. This one wrote helpers
# ABOVE loft(), so a guard that looked inside "from loft() to the section after it" stopped seeing
# them the moment they moved -- and the second run duplicated every one of them. Caught by
# `grep -c "function nestOf"` returning 2, which is the cheapest check there is and is why it is
# worth running a generator twice before believing it.
#
# @loftholes:start ... @loftholes:end identify the REGION. On a first run the sentinels are not
# there and the original anchors are used; from then on the sentinels are, whatever is between them.
OPEN, CLOSE = "  /* @loftholes:start */", "  /* @loftholes:end */"


def resplice(rel, start_line, end_line, block):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    lines = s.split("\n")
    if OPEN in lines and CLOSE in lines:
        a, b = lines.index(OPEN), lines.index(CLOSE) + 1
        if "\n".join(lines[a:b]) == block.rstrip("\n"):
            print(rel + "\n  already there: loft() knows about holes")
            return
        what = "loft() re-spliced"
    else:
        aa = [i for i, L in enumerate(lines) if L.startswith(start_line)]
        bb = [i for i, L in enumerate(lines) if L.startswith(end_line)]
        assert len(aa) == 1, "start anchor found %d times" % len(aa)
        assert len(bb) == 1, "end anchor found %d times" % len(bb)
        assert aa[0] < bb[0], "anchors out of order"
        a, b = aa[0], bb[0]
        what = "loft() replaced"
    out = lines[:a] + block.rstrip("\n").split("\n") + lines[b:]
    io.open(p, "w", encoding="utf-8").write("\n".join(out))
    assert "\n".join(out).count("function nestOf(list){") == 1, "the block went in twice"
    print(rel + "\n  ok: %s, %d lines -> %d" % (what, b - a, len(block.rstrip("\n").split("\n"))))


resplice("core/traceloft.js",
         "  function loft(rings, resNm){",
         "  /* ── HOW MUCH OF IT THERE IS",
         HELPERS)
edit("core/traceloft.js", EXPORTS + HEADER)

# ── the pad ──────────────────────────────────────────────────────────────────────────────────
PAD = [
    (u'''  /* Contours already closed on THIS section, then the one being drawn. */
  PAD.rings.forEach(function(r){
    if (r.z !== PAD.z) return;
    g.beginPath();
    r.points.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.closePath();
    /* Its own structure's colour, so two mitochondria side by side are two shapes rather than one
       ambiguous pair of outlines. */
    const col = padInstColour(r.inst || 0);
    g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    g.fillStyle = hexA(col, 0.14); g.fill();''',
     u'''  /* Contours already closed on THIS section, then the one being drawn.

     ONE PATH PER STRUCTURE, FILLED EVEN-ODD, since 2026-09-19 (Søren: *"If I draw one contour
     inside another, it should subtract the inside from the outside, so that the inner one becomes
     a hole"*). Each ring used to get its own beginPath/fill, which painted an inner contour ON TOP
     of the outer one — two overlapping washes where the volume, the export and now the preview
     all say there is a hole. Grouping by r.inst is what keeps two mitochondria drawn side by side
     from punching each other: same structure, same path; different structures, different paths. */
  const padFills = {};
  PAD.rings.forEach(function(r){
    if (r.z !== PAD.z) return;
    const key = String(r.inst || 0);
    if (!padFills[key]){ padFills[key] = new Path2D(); }
    const sub = padFills[key];
    r.points.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) sub.lineTo(q[0], q[1]); else sub.moveTo(q[0], q[1]); });
    sub.closePath();
  });
  Object.keys(padFills).forEach(function(key){
    g.fillStyle = hexA(padInstColour(+key || 0), 0.14);
    g.fill(padFills[key], "evenodd");
  });
  PAD.rings.forEach(function(r){
    if (r.z !== PAD.z) return;
    g.beginPath();
    r.points.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.closePath();
    /* Its own structure's colour, so two mitochondria side by side are two shapes rather than one
       ambiguous pair of outlines. The OUTLINE is still per contour: it is about the line you drew,
       not about the region it bounds, and a hole's rim has to be visible to be draggable. */
    const col = padInstColour(r.inst || 0);
    g.strokeStyle = col; g.lineWidth = 2; g.stroke();''',
     "the pad fills each structure once, even-odd"),
]

# ── the preview's own caption, which said the opposite ───────────────────────────────────────
# It told the reader that the EXPORT treats a contour inside another as a hole -- which was the
# polite way of saying the preview does not. It does now, and a caption that still drew the
# distinction would be the tool explaining a difference it no longer has.
CAPTION = [
    (u'''    const nContours = lofts.reduce(function(n, L){ return n + (L.g.contours || 0); }, 0);''',
     u'''    const nContours = lofts.reduce(function(n, L){ return n + (L.g.contours || 0); }, 0);
    const nHoles = lofts.reduce(function(n, L){ return n + (L.g.holes || 0); }, 0);''',
     "the preview counts its holes"),

    (u'''      + um.map(function(v){ return v.toFixed(1); }).join(" \u00d7 ") + " \u00b5m. The Blender export "
      + "fills each section and marches cubes over the stack, which is smoother and treats a "
      + "contour drawn inside another as a hole.</span>";''',
     u'''      + um.map(function(v){ return v.toFixed(1); }).join(" \u00d7 ") + " \u00b5m. The Blender export "
      + "fills each section and marches cubes over the stack, which is smoother.</span>";
    /* SAID OUT LOUD WHEN THERE IS ONE, since 2026-09-19. This caption used to end "...and treats a
       contour drawn inside another as a hole", which was the polite way of saying the preview did
       not -- it lofted the inner contour as a second tube. Now both do, and the thing worth saying
       instead is how many the tool found, because a hole it did NOT recognise is the failure a
       tracer needs to catch while the pad is still open. */
    if (nHoles)
      lead += "<br><span class='hint'>" + nHoles + " contour" + (nHoles === 1 ? " is" : "s are")
        + " drawn inside another, and " + (nHoles === 1 ? "is" : "are")
        + " cut out as " + (nHoles === 1 ? "a hole" : "holes") + " \u2014 here, in the volume above "
        + "and in the export.</span>";''',
     "...and says so, instead of saying only the export does it"),
]

edit("ujump.html", PAD + CAPTION)
# The generator that wrote padPaint and the caption owns those regions too, or a re-run puts the
# per-ring fill and the old sentence back.
edit("src/the_tracing_card.py", PAD + CAPTION)

print("\nnow: node traceloftcheck.js && node tracingpanelcheck.js && python3 src/build_stamps.py")
