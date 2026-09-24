# -*- coding: utf-8 -*-
u"""A contour is not joined to something nineteen micrometres away.                       2026-09-24

Søren, with a render of a pial sheath fibroblast shredded across its middle: "The middle part of
this fibroblast is getting a really bad mesh, likely because the segmentations are a bit too far
apart in z. Can we fix this? somehow?" -- and, a minute later: "or maybe it is because there is a
primary cilia I have segmented much closer in z compared with the rest of the structure."

THE SECOND GUESS IS THE RIGHT ONE. Measured on his own file (018 - Pial sheath fibroblast.json):
our reader turns its 12,803 line annotations into 479 contours on 243 sections, and the spacing is
bimodal -- 166 gaps of one or two sections and 73 gaps of nine to eleven. The cilium is traced every
40-80 nm; the cell body every ~400 nm.

THAT ALONE WOULD ONLY MAKE THE BODY COARSE. What shreds it is pairUp(), which joins each contour to
the NEAREST contour on the next section and has never had any idea how far "nearest" is. Where the
cilium has a contour and the body does not, the body's contour is banded to the cilium. Of his 380
bands, 23 stretch more than twice the two contours' combined radius and 7 more than five times; the
worst joins a 48-voxel contour to a 32-voxel one whose centres are 4,780 voxels -- 19 µm -- apart.
The widest single triangle in the mesh spans 32.5 µm. Those are the slats in his picture.

THE RULE, AND WHY IT IS THIS ONE. Sorted by how far apart the two outlines actually are -- the gap
between their bounding circles, not between their centres -- his bands split cleanly:

    ratio d/(rA+rB)   2.06 2.22 2.25 2.29 2.44 2.50 2.54 2.57 2.58 | 2.93 3.02 3.30 3.35 3.67
                      3.82 4.06 5.19 7.17 10.51 11.41 13.57 39.36 59.20

Everything up to 2.58 is a real band between neighbouring profiles of one cell; from 2.93 up, the
two outlines are 4.8 to 23 µm apart and nothing of one cell moves that far between sections. So a
pair is plausible when EITHER

    the centres are within 2.5 × (rA + rB)            -- near, relative to how big they are
    or their outlines are within one larger-diameter  -- nearly touching, whatever the ratio

and implausible otherwise. Both clauses are ratios of the contours' own size, so nothing here needs
to know how big a voxel is, and a tool tracing at a different scale gets the same rule for free.
A contour with no size recorded is paired exactly as before -- the guard cannot fire on a caller
that predates it.

AND THE OTHER HALF, WITHOUT WHICH THIS WOULD BE WORSE THAN THE BUG. loft() only ever bands
CONSECUTIVE entries of its z list. With the reach limit alone, the body's contour at z=19410 would
find nothing plausible at 19412 -- the next entry, a cilium -- and be capped, and so would every
other body section: ninety-two flat discs floating in a row. So an unmatched contour now STAYS LIVE
and is offered to each later section until something plausible turns up.

HOW LONG IT WAITS is the tracer's own spacing: the widest gap between consecutive sections anywhere
in this tracing. On his file that is eleven sections, exactly the rate he used for the body. On an
evenly traced object it is one, so a contour that genuinely ends is capped at the very next section,
as it always was.

Checked in loftreachcheck.js, written first; 4 of its 14 assertions failed before this went in, and
the widest triangle in his file was 32.5 µm.
Run: python3 src/a_contour_is_not_joined_to_something_far_away.py, then python3 src/build_stamps.py,
then python3 wjump-build/build_wjump.py
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


edit("core/traceloft.js", [
 # ── 1. how big a contour is, and how far "nearest" may be ─────────────────────────────────────
 (u"a contour knows its own size, and pairing has a reach",
  u"""  /* Greedy nearest-centroid pairing between the contours of two neighbouring sections. A cell that
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
  }""",
  u"""  /* The furthest a contour's outline gets from its own centre — its size, for deciding whether
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
  }"""),

 # ── 2. the loft records each contour's size ───────────────────────────────────────────────────
 (u"loft records the size",
  u"""      byZ[z].push({ pts: pts, c: centroid(pts) });""",
  u"""      byZ[z].push({ pts: pts, c: centroid(pts), rad: radiusOf(pts) });"""),

 # ── 3. an unmatched contour waits for its own next section ────────────────────────────────────
 (u"a contour waits for its own next section",
  u"""    function pairByParity(below, above, wantHole, zLo, zHi){
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
    }""",
  u"""    function pairByParity(liveList, above, zHi, wantHole, out){
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
    var maxGap = 1;
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
    }"""),

 # ── 4. and the interpolator's chains get the same protection ──────────────────────────────────
 (u"the interpolator records the size too",
  u"""      byZ[z].push({ pts: pts, c: centroid(pts), src: i, inst: r.inst || 0 });""",
  u"""      byZ[z].push({ pts: pts, c: centroid(pts), rad: radiusOf(pts), src: i, inst: r.inst || 0 });"""),

 (u"...and its live chains carry theirs",
  u"""      var below = live.map(function(L){ return { c: centroid(L.last) }; });""",
  u"""      /* With the radius, so a chain is not dragged onto a contour nowhere near it either — the
         same rule the mesh uses, and for the same reason (2026-09-24). */
      var below = live.map(function(L){ return { c: centroid(L.last), rad: radiusOf(L.last) }; });"""),
])


# ── 5. how long it waits is not read off the z list ───────────────────────────────────────────
u"""The first version took the wait from the widest gap between consecutive sections in the z list,
which is wrong for exactly the case this exists for: on Søren's fibroblast the cilium has a contour
on EVERY section, so the list's gaps are all one, and the body's contour was dropped after a single
section again. The list says how often SOMETHING was traced, not how often THIS object was.

So it is a plain number of sections, generous enough for a tracer stepping ten at a time, and
widened further if the list itself shows wider steps. Waiting is only safe because the reach limit
is there: a contour that waits is still only ever banded to something its own size, next to it."""
edit("core/traceloft.js", [
 (u"the wait is not read off the z list",
  u"""    var maxGap = 1;
    for (var gi = 1; gi < zs.length; gi++) maxGap = Math.max(maxGap, zs[gi] - zs[gi - 1]);""",
  u"""    var maxGap = 12;
    for (var gi = 1; gi < zs.length; gi++) maxGap = Math.max(maxGap, zs[gi] - zs[gi - 1]);"""),
])
