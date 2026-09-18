/* core/organellelink.js — an annotation and a segmentation of the same organelle.    2026-09-18

   Søren: *"I would like that the organelles are featured in the cell identity as an expandable
   section where the annotations are coupled with the segmentations where the annotation coordinate
   is within the 3D volume of the segmentation."*

   Two features have grown up separately. One logs WHERE an organelle is — a point, or a point pair
   for a vector kind. The other outlines WHAT SHAPE it is — contours, section by section, with a
   volume. They are about the same objects and have never met. This module is the rule that marries
   them, written once so the cell panel, the tracing card and the viewer cannot disagree about which
   annotation belongs to which segmentation.

   ── WHAT "INSIDE THE 3D VOLUME" MEANS, and why it is not simply "inside" ──────────────────────

   A tracing is contours on a FEW sections — every fifth is the usual advice, every fortieth is
   still useful (the card says what each costs). So the traced object is a stack of outlines with
   gaps between them, and a point one section past the last contour is not outside the organelle,
   it is outside the SAMPLING. Taking the outlines literally would fail to pair exactly the
   annotations placed most carefully: at the ends, where somebody looked for the middle of the
   thing and marked it there.

   So (Søren's choice, 2026-09-18): the z must lie between the outermost traced sections PLUS HALF A
   SECTION STEP either side — half, because that is the tissue each end section already stands for
   in Cavalieri's estimator, which is what the volume beside it is computed with. The step is the
   MEDIAN gap between traced sections, not the mean: one accidental jump of forty sections in a
   tracing otherwise drawn every fifth must not widen the tolerance for the whole object.

   In x and y the test is on the NEAREST traced section, and it is EVEN-ODD over every contour
   there: inside an odd number of them is inside, which makes a contour drawn within another a hole
   — the same rule the volume uses and the same rule the Blender export fills with. A point in the
   hole of a nucleoplasmic reticulum is not in the nucleus.

   ── THE VOLUMETRIC CENTRE ────────────────────────────────────────────────────────────────────

   Søren: *"When drawing a segmentation of an organelle that does not have an annotation, the
   volumetric center of the segmentation should be registered as an annotation."* — and, asked
   whether it should replace a manual one: *"this should be more precise than the manually
   annotated, so it should replace it."*

   `centre()` is the area-weighted centroid of the stack: each section contributes its own centroid
   weighted by its NET area, holes subtracting both. A centroid so computed can fall outside a
   banana-shaped object, which is true of centroids and not a bug — `centre()` says whether its own
   answer is inside itself (`inside: false`), so a caller that needs a point ON the object can say
   so rather than quietly placing a marker in the cytoplasm.

   Run: node organellelinkcheck.js */
window.UJ = window.UJ || {};
UJ.organellelink = (function(){
  "use strict";

  /* "x,y,z" — the form every coordinate in this family is written in — as three numbers. Returns
     null for anything else, because a half-read coordinate is worse than none. */
  function parsePoint(s){
    if (Array.isArray(s)) return (s.length >= 3 && s.every(isFinite)) ? [+s[0], +s[1], +s[2]] : null;
    var m = String(s == null ? "" : s).trim().split(/[\s,]+/).filter(function(t){ return t !== ""; });
    if (m.length < 3) return null;
    var v = m.slice(0, 3).map(Number);
    return v.every(function(n){ return isFinite(n); }) ? v : null;
  }

  /* Twice the signed area, which is all the sign test and the weighting need. */
  function area2(pts){
    var a = 0;
    for (var i = 0, n = pts.length; i < n; i++){
      var p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a;
  }
  /* Ray casting, and the boundary is deliberately unspecified: a point exactly on an edge is a
     vanishingly rare tie in voxel coordinates, and pretending to resolve it would be a lie about
     a contour drawn by hand through a grey boundary. */
  function inRing(pt, pts){
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++){
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi))
        inside = !inside;
    }
    return inside;
  }
  /* The even-odd rule, over every contour on one section. Odd is in, which makes a contour inside
     another a hole -- the rule the volume and the Blender export already use. */
  function inSection(pt, ringsHere){
    var n = 0;
    for (var i = 0; i < ringsHere.length; i++)
      if (inRing(pt, ringsHere[i].points || [])) n++;
    return (n % 2) === 1;
  }

  /* By z, in order, with only the contours that are contours. */
  function bySection(rings){
    var by = {}, zs = [];
    (rings || []).forEach(function(r){
      if (!r || !r.points || r.points.length < 3) return;
      var z = Math.round(r.z);
      if (!by[z]){ by[z] = []; zs.push(z); }
      by[z].push(r);
    });
    zs.sort(function(a, b){ return a - b; });
    return { by: by, zs: zs };
  }
  /* THE MEDIAN GAP, not the mean. A tracing drawn every fifth section with one accidental jump of
     forty has a mean gap that the jump owns; the median still says five, which is what the section
     step actually was for all but one pair of contours. */
  function sectionStep(zs){
    if (zs.length < 2) return 1;
    var gaps = [];
    for (var i = 1; i < zs.length; i++) gaps.push(zs[i] - zs[i - 1]);
    gaps.sort(function(a, b){ return a - b; });
    var mid = gaps.length >> 1;
    return gaps.length % 2 ? gaps[mid] : ((gaps[mid - 1] + gaps[mid]) / 2);
  }

  /* Is this point inside this traced object? See the header for the two halves of the rule. */
  function inside(point, rings, opts){
    var pt = parsePoint(point);
    if (!pt) return false;
    var s = bySection(rings);
    if (!s.zs.length) return false;
    var step = sectionStep(s.zs);
    /* Half a step, because that is the tissue an end section already stands for in the estimator
       the volume beside it comes from. opts.zPad overrides for a caller with its own reason. */
    var pad = (opts && opts.zPad != null) ? opts.zPad : step / 2;
    var lo = s.zs[0] - pad, hi = s.zs[s.zs.length - 1] + pad;
    if (pt[2] < lo || pt[2] > hi) return false;
    var best = s.zs[0], bestD = Math.abs(pt[2] - best);
    for (var i = 1; i < s.zs.length; i++){
      var d = Math.abs(pt[2] - s.zs[i]);
      if (d < bestD){ bestD = d; best = s.zs[i]; }
    }
    return inSection(pt, s.by[best]);
  }

  /* The area-weighted centroid of the stack, in the same voxel frame the contours are in. Holes
     subtract, from both the weight and the moment, because that is what a hole is. */
  function centre(rings){
    var s = bySection(rings);
    if (!s.zs.length) return null;
    var wx = 0, wy = 0, wz = 0, wSum = 0;
    s.zs.forEach(function(z){
      var here = s.by[z];
      var netA = 0, cx = 0, cy = 0;
      here.forEach(function(r){
        var pts = r.points;
        var a2 = area2(pts);
        var a = Math.abs(a2) / 2;
        if (!a) return;
        /* SOLID OR HOLE, decided by nesting rather than by winding: a contour drawn by hand has
           whatever winding the hand went round in, and the even-odd rule the rest of the tool uses
           does not care. A contour inside an odd number of others is a hole. */
        var depth = 0;
        for (var k = 0; k < here.length; k++)
          if (here[k] !== r && inRing(pts[0], here[k].points || [])) depth++;
        var sign = (depth % 2) ? -1 : 1;
        /* The polygon centroid, from the same cross products the area came from. */
        var gx = 0, gy = 0;
        for (var i = 0, n = pts.length; i < n; i++){
          var p = pts[i], q = pts[(i + 1) % n];
          var cross = p[0] * q[1] - q[0] * p[1];
          gx += (p[0] + q[0]) * cross;
          gy += (p[1] + q[1]) * cross;
        }
        if (a2 !== 0){ gx /= (3 * a2); gy /= (3 * a2); }
        netA += sign * a;
        cx += sign * a * gx;
        cy += sign * a * gy;
      });
      if (netA <= 0) return;                 // a section that is all hole weighs nothing
      wSum += netA;
      wx += cx;                              // cx already carries its own area weight
      wy += cy;
      wz += netA * z;
    });
    if (wSum <= 0) return null;
    var out = [Math.round(wx / wSum), Math.round(wy / wSum), Math.round(wz / wSum)];
    /* A centroid can fall outside a curved object. Saying so is the difference between a caller
       that places a marker on the organelle and one that places it in the cytoplasm next to it. */
    return { point: out, inside: inside(out, rings), sections: s.zs.length,
             step: sectionStep(s.zs) };
  }

  /* ── PAIRING ──────────────────────────────────────────────────────────────────────────────────
     `annotations` are {kind, point, ...} — whatever the caller has, carried through untouched on
     the way out. `tracings` are {rings, kind, ...} likewise. An annotation pairs with the FIRST
     segmentation (in the caller's order) that contains it AND agrees about what it is; kinds that
     disagree are not the same organelle however well the point lands, unless opts.anyKind.

     Returns every annotation and every segmentation exactly once, in three lists, so a caller can
     render the lot without deciding anything itself. */
  function pair(annotations, tracings, opts){
    var anns = (annotations || []).slice(), trs = (tracings || []).slice();
    var anyKind = !!(opts && opts.anyKind);
    var kindOf = function(x){ return String((x && (x.kind || x.instanceOf)) || "").toLowerCase(); };
    var pairs = trs.map(function(t){ return { tracing: t, annotations: [] }; });
    var loose = [];
    anns.forEach(function(a){
      var pt = parsePoint(a && (a.point || a.pointA));
      var hit = -1;
      if (pt) for (var i = 0; i < trs.length; i++){
        if (!anyKind && kindOf(a) && kindOf(trs[i]) && kindOf(a) !== kindOf(trs[i])) continue;
        if (inside(pt, trs[i].rings, opts)){ hit = i; break; }
      }
      if (hit >= 0) pairs[hit].annotations.push(a); else loose.push(a);
    });
    return {
      paired: pairs.filter(function(p){ return p.annotations.length; }),
      /* A segmentation nobody has annotated. After 2026-09-18 a new one always gets its centre
         registered, so this is older work -- and the panel offers to register it. */
      untracedAnnotations: loose,
      unannotatedTracings: pairs.filter(function(p){ return !p.annotations.length; })
                               .map(function(p){ return p.tracing; })
    };
  }

  /* WHICH ANNOTATIONS A NEW SEGMENTATION SUPERSEDES. Søren, on the traced centre: "this should be
     more precise than the manually annotated, so it should replace it." Nothing is deleted -- the
     record is append-only and somebody's observation is not ours to erase -- so "replace" is a
     statement about which coordinate is the cell's answer, and this is the list the new one takes
     that place from. */
  function superseded(rings, annotations, kind, opts){
    var k = String(kind || "").toLowerCase();
    return (annotations || []).filter(function(a){
      var ak = String((a && a.kind) || "").toLowerCase();
      if (k && ak && k !== ak) return false;
      var pt = parsePoint(a && (a.point || a.pointA));
      return !!pt && inside(pt, rings, opts);
    });
  }

  return { inside: inside, centre: centre, pair: pair, superseded: superseded,
           parsePoint: parsePoint, sectionStep: sectionStep,
           /* for the check, which drives the real geometry rather than a copy of it */
           _inSection: inSection, _inRing: inRing, _bySection: bySection };
})();
