# -*- coding: utf-8 -*-
u"""Redundant contour points go, and the link is capped where the browser actually cuts.  2026-09-22

Søren, on a whole cell that opened as about:blank#blocked: "Now we are back to about:blank#blocked
but at least the lysosome annotations open in Neuroglancer again", and then: "Could we reduce the
number of annotation points when they seem redundant?"

Two halves of one problem, and the second is the answer to the first.

── THE CAP WAS WRONG ─────────────────────────────────────────────────────────────────────────────
TRACING_LINK_MAX was 8,000,000, from a measurement on 2026-09-22 that said a 5.83M character link
loads. THAT MEASUREMENT WAS OF THE WRONG THING. It set location.href on an ALREADY-OPEN Neuroglancer
tab, so the browser never built a URL at all -- a same-document hash change stays in the renderer.
Opening a tracing opens a NEW TAB, which is a cross-document navigation through the browser process,
and that has a hard limit.

MEASURED PROPERLY, same browser, same day, by navigating cross-document to a long fragment:

    2,097,152 characters (2 MiB)   loads
    2,097,153 characters           the tab becomes about:blank#blocked

Exactly url::kMaxURLChars. His line-drawn whole cell was about 2.3M, so the tab could never load it
and the card said nothing, because 2.3M was comfortably under a cap of 8M that did not exist.

TRACING_LINK_MAX is 2,097,152 now, minus the base URL, and above it the state is offered to copy or
download instead of a tab that will go blank.

── AND THE POINTS THEMSELVES ─────────────────────────────────────────────────────────────────────
A contour drawn with a pen is sampled by the POINTER, not by the shape: a straight stretch of
membrane arrives as twenty points that two would draw identically. On a viewer with no polyline
type each of those twenty is its own line annotation.

UJ.tracing.simplifyRings(rings, tol) drops them -- Douglas-Peucker, run on the closed ring from the
two points farthest apart so the result does not depend on where the pen started, with an explicit
stack because a freehand contour is thousands of points deep. Guarantee: no point of the drawn
outline moves more than `tol`, which defaults to HALF A VOXEL of the space the contour is stored in
-- below what the screen can show at the level it was traced at. A ring under six points is left
alone, and nothing is ever reduced below three.

IT TOUCHES THE LINK ONLY. The rings handed in are not modified: the tracing on the card, in the
sheet, and every volume and area computed from it are the record, and they are untouched. And the
card SAYS what it dropped, so a number he can check replaces a silent change of his data.

Checks: simplifycheck.js (written first, the straight run collapsing to four corners and the
deviation and area bounds), linksizecheck.js (the measured cap).
Run: python3 src/fewer_points_and_the_real_cap.py, then python3 src/build_stamps.py
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


# ── 1. the simplifier, beside the writer it feeds ─────────────────────────────────────────────
edit("core/tracing.js", [
 (u"simplifyRings",
  u'''  function ringAnnotations(rings, idPrefix, opts){''',
  u'''  /* ── FEWER POINTS ──────────────────────────────────────────────────────────  2026-09-22
     Søren: "Could we reduce the number of annotation points when they seem redundant?"

     Douglas-Peucker. A closed ring is split at the point farthest from the first, so the answer
     does not depend on where the pen happened to start, and each half is walked with an explicit
     stack -- a freehand contour is thousands of points and recursion would be thousands deep.

     `tol` is in VOXELS of the space the contour is stored in and no point of the drawn outline
     moves further than that. Half a voxel by default: below what the screen shows at the level it
     was traced at, and the area it encloses moves by well under a tenth of a percent.

     THE RINGS HANDED IN ARE NOT MODIFIED. This is for the link; the tracing is the record.
     See src/fewer_points_and_the_real_cap.py. */
  var SIMPLIFY_TOL = 0.5;
  function dpKeep(pts, first, last, tol, keep){
    var stack = [[first, last]];
    while (stack.length){
      var seg = stack.pop(), i0 = seg[0], i1 = seg[1];
      if (i1 <= i0 + 1) continue;
      var ax = pts[i0][0], ay = pts[i0][1], bx = pts[i1][0], by = pts[i1][1];
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      var worst = -1, at = -1;
      for (var i = i0 + 1; i < i1; i++){
        var qx = pts[i][0] - ax, qy = pts[i][1] - ay, d;
        if (L2 === 0){ d = qx * qx + qy * qy; }
        else {
          var t = (qx * dx + qy * dy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          var ex = qx - t * dx, ey = qy - t * dy;
          d = ex * ex + ey * ey;
        }
        if (d > worst){ worst = d; at = i; }
      }
      if (worst > tol * tol){ keep[at] = 1; stack.push([i0, at]); stack.push([at, i1]); }
    }
  }
  function simplifyRing(pts, tol){
    var n = pts.length;
    if (n < 6 || !(tol > 0)) return pts;
    /* The far point, so the two halves are the two sides of the shape and not an arbitrary cut. */
    var far = 0, best = -1, i;
    for (i = 1; i < n; i++){
      var dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1], d = dx * dx + dy * dy;
      if (d > best){ best = d; far = i; }
    }
    var keep = {}; keep[0] = 1; keep[far] = 1;
    dpKeep(pts, 0, far, tol, keep);
    /* The second half runs far -> n -> 0, so index n stands for point 0. */
    var wrap = pts.slice(far).concat([pts[0]]);
    var keep2 = {}; keep2[0] = 1; keep2[wrap.length - 1] = 1;
    dpKeep(wrap, 0, wrap.length - 1, tol, keep2);
    for (var k in keep2){ var j = far + (+k); if (j < n) keep[j] = 1; }
    var out = [];
    for (i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    return out.length >= 3 ? out : pts;
  }
  /* rings -> { rings, before, after }, the counts so the card can say what it dropped. */
  function simplifyRings(rings, tol){
    var t = (typeof tol === "number") ? tol : SIMPLIFY_TOL;
    try { if (typeof window.JUMP_SIMPLIFY_TOL === "number") t = window.JUMP_SIMPLIFY_TOL; }
    catch (_e){}
    var before = 0, after = 0;
    var out = (rings || []).map(function(r){
      var pts = r.points || [];
      before += pts.length;
      var s = simplifyRing(pts, t);
      after += s.length;
      return (s === pts) ? r : { z: r.z, points: s };
    });
    return { rings: out, before: before, after: after, tol: t };
  }

  function ringAnnotations(rings, idPrefix, opts){'''),
 (u"...and the writer runs it first",
  u'''    var out = [];
    var asLines = (opts && typeof opts.lines === "boolean")
                ? opts.lines : !viewerTakesPolylines(opts && opts.base);''',
  u'''    var out = [];
    var asLines = (opts && typeof opts.lines === "boolean")
                ? opts.lines : !viewerTakesPolylines(opts && opts.base);
    /* Redundant points go before anything is written, on both shapes (2026-09-22). opts.tol = 0
       keeps every point. The counts ride back on the array for a caller that wants to report. */
    var simp = simplifyRings(rings, opts && opts.tol);
    rings = simp.rings;'''),
 (u"...and hands the counts back",
  u'''      out.push({ type: "polyline", id: idPrefix + "_" + ri, points: P });
    });
    return out;''',
  u'''      out.push({ type: "polyline", id: idPrefix + "_" + ri, points: P });
    });
    out.simplified = { before: simp.before, after: simp.after, tol: simp.tol };
    return out;'''),
 (u"...and it is exported",
  u'''           ringAnnotations: ringAnnotations, viewerTakesPolylines: viewerTakesPolylines,''',
  u'''           ringAnnotations: ringAnnotations, simplifyRings: simplifyRings,
           viewerTakesPolylines: viewerTakesPolylines,'''),
])

# ── 2. the cap, where the browser actually cuts ───────────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"the measured cap",
  u'''var TRACING_LINK_LONG = 1500000, TRACING_LINK_MAX = 8000000;''',
  u'''/* MEASURED 2026-09-22 by navigating CROSS-DOCUMENT to a long fragment -- which is what opening
   a tab does, and what the earlier 5.83M measurement did NOT do (it set location.href on an
   already-open viewer, a same-document hash change the renderer handles without ever building a
   URL). 2,097,152 characters loads; 2,097,153 becomes about:blank#blocked. Exactly
   url::kMaxURLChars. See src/fewer_points_and_the_real_cap.py. */
var TRACING_LINK_LONG = 1200000, TRACING_LINK_MAX = 2097152;'''),
 (u"...and the refusal says what to do about it",
  u'''      "That is more than a viewer link can carry (" + kc + "). Paste the state into Neuroglancer "
      + "instead \\u2014 its {} button takes it \\u2014 or open one structure at a time.", true);''',
  u'''      "That is more than a tab can be opened with (" + kc + "; the browser refuses past 2,097,152 "
      + "and shows about:blank#blocked). Paste the state into Neuroglancer instead \\u2014 its {} "
      + "button takes it \\u2014 or open one structure at a time." + shapeSay, true);'''),
])

# shapeSay is computed below the refusal, so it moves above both branches.
edit("core/tracingcard.js", [
 (u"the shape note is computed before either branch",
  u'''  if (url.length > TRACING_LINK_MAX){''',
  u'''  /* 2026-09-22: on a viewer with no polyline type a contour costs one annotation per edge, so the
     same cell is about four times the link. Better to name the reason than to let him wonder. */
  let shapeSay = "";
  try {
    if (UJ.tracing.viewerTakesPolylines && !UJ.tracing.viewerTakesPolylines(base))
      shapeSay = " This viewer cannot read polyline annotations, so every edge is its own line and "
               + "the link is about four times longer than it needs to be \\u2014 Spelunker and "
               + "neuroglancer-demo read polylines.";
  } catch (_e){}
  if (url.length > TRACING_LINK_MAX){'''),
 (u"...so the later copy of it goes",
  u'''  /* 2026-09-22: on a viewer with no polyline type a contour costs one annotation per edge, so
     the same cell is about four times the link. Better to name the reason than to let him wonder. */
  let shapeSay = "";
  try {
    if (url.length > TRACING_LINK_LONG && UJ.tracing.viewerTakesPolylines
        && !UJ.tracing.viewerTakesPolylines(base))
      shapeSay = " This viewer cannot read polyline annotations, so every edge is its own line and "
               + "the link is about four times longer than it needs to be \\u2014 Spelunker and "
               + "neuroglancer-demo read polylines.";
  } catch (_e){}
  if (url.length > TRACING_LINK_LONG){''',
  u'''  /* shapeSay is computed above, for both branches. */
  if (url.length > TRACING_LINK_LONG){'''),
])

# ── 3. and the card says how many points it dropped ───────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"the layers keep their simplify tally",
  u'''  const used = {}; let firstName = "";
  structs.forEach(function(t, i){''',
  u'''  const used = {}; let firstName = "";
  let cut = { before: 0, after: 0, tol: 0 };
  structs.forEach(function(t, i){'''),
 (u"...counted as they are written",
  u'''    st.layers.push({ type: "annotation", source: "local://annotations", tab: "annotations",
                     name: nm, annotationColor: t.color || "#40e28c",
                     annotations: tracingRingAnns(t.rings, "t" + i, base) });''',
  u'''    const anns = tracingRingAnns(t.rings, "t" + i, base);
    if (anns.simplified){
      cut.before += anns.simplified.before; cut.after += anns.simplified.after;
      cut.tol = anns.simplified.tol;
    }
    st.layers.push({ type: "annotation", source: "local://annotations", tab: "annotations",
                     name: nm, annotationColor: t.color || "#40e28c", annotations: anns });'''),
 (u"...and said, when it is worth saying",
  u'''  const kc = Math.round(url.length / 1000) + "k characters";''',
  u'''  const kc = Math.round(url.length / 1000) + "k characters";
  /* What was dropped, in his own numbers, so a silent change to his outlines is not something he
     has to take on trust. Only when it is a tenth or more -- below that it is noise. */
  const cutSay = (cut.before && cut.before - cut.after > cut.before / 10)
    ? " Redundant points dropped: " + cut.before.toLocaleString() + " \\u2192 "
      + cut.after.toLocaleString() + " (no point of the outline moved more than " + cut.tol
      + " voxel" + (cut.tol === 1 ? "" : "s") + "; your saved tracing is unchanged)."
    : "";'''),
])

# ── 4. the note that was measured wrong, and the tally actually said ──────────────────────────
edit("core/tracingcard.js", [
 (u"the 5.83M note was of a same-document hash change",
  u'''    /* It opens: 40,000 annotations in a 5.83M character link were measured loading in Chrome. The
       sentence is for the browsers that are tighter, and it is not an error. */''',
  u'''    /* It opens -- up to 2,097,152 characters, which is where the browser stops (measured
       2026-09-22; the 5.83M figure this note used to carry was a same-document hash change on an
       already-open viewer, which never builds a URL at all). Not an error, just a warning. */'''),
 (u"...the long-link sentence carries the tally",
  u'''      + "copy or download the state below and paste it into Neuroglancer\\u2019s {} button."
      + shapeSay, false);''',
  u'''      + "copy or download the state below and paste it into Neuroglancer\\u2019s {} button."
      + shapeSay + cutSay, false);'''),
 (u"...and so does the sentence for a link that simply opened",
  u'''    + ", one annotation layer each, in the colours they were drawn in. Edit them there and paste "
    + "the address bar back into the box above to read them in again.")) + cellStr);''',
  u'''    + ", one annotation layer each, in the colours they were drawn in. Edit them there and paste "
    + "the address bar back into the box above to read them in again.")) + cellStr + cutSay);'''),
])
