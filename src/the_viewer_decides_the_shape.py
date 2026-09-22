# -*- coding: utf-8 -*-
u"""Polylines only where the viewer takes them -- which is not where Søren works.        2026-09-22

Søren, with a screenshot of ngl.microns-explorer.org and the JSON editor open on a layer reading
`"annotations": []`: "Now it opens nicely, but there are no whole cell annotations".

MEASURED IN HIS OWN BROWSER, the same day, one probe state per viewer carrying a polyline, a line
and a point:

    ngl.microns-explorer.org            NO   <- the tools' DEFAULT, and where he works
    neuroglancer.neuvue.io              NO
    h01-dot-neuroglancer-demo.appspot   NO   <- ηJump's viewer; the substring match would have
                                              said yes, which is why it was measured and not assumed
    spelunker.cave-explorer.org         yes
    neuroglancer-demo.appspot.com       yes  <- βJump's, ωJump's and χJump's

AND THE FAILURE IS NOT THE POLYLINE ALONE. On a viewer with no polyline type, ONE polyline in the
list empties the WHOLE layer: the line and the point beside it went too, in silence. Verified by
loading the same state without the polyline -- both came back. So a viewer that cannot read the
shape does not lose one contour, it loses the cell, and says nothing.

That settles the default. The shape follows the VIEWER THE LINK IS FOR, matched on its exact host,
and anything not measured gets lines -- which every one of the five reads. Worst case is a longer
link; never an empty layer. Where polylines are taken the link is about a quarter the size (77k vs
321k characters for 80 contours, measured in polylinelinkcheck.js).

WHERE THE BASE COMES FROM: the page's <select id="viewer"> where it has one (µ/δ/πJump), else
UJ.cfg.viewer.base (λ/η/β/ω/χJump). Both are read here so no caller has to plumb it.

THE OVERRIDE: JUMP_VIEWER_POLYLINES = true (or false) in the console forces the shape on that page,
for trying a viewer this list has not met. Replaces JUMP_VIEWER_LINES from this morning.

AND IT SAYS SO: where the link is long and the viewer took lines, the card now names the viewer
that would have made it shorter, instead of leaving him to wonder why a cell costs 2 MB.

Checks: polylinelinkcheck.js (both shapes, both ways round), plus the viewer set explicitly in
linksizecheck.js, organjumpcheck.js, organoutlinecheck.js, organallcheck.js.
Run: python3 src/the_viewer_decides_the_shape.py, then python3 src/build_stamps.py
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


# ── 1. the shape follows the viewer ───────────────────────────────────────────────────────────
edit("core/tracing.js", [
 (u"which viewers take a polyline",
  u'''     opts.lines (or window.JUMP_VIEWER_LINES in the console) writes the old edge-per-line shape instead,
     for a viewer too old to know polylines. See src/the_viewer_link_is_polylines.py. */
  function viewerWantsLines(){
    try { return window.JUMP_VIEWER_LINES === true; } catch (_e){ return false; }
  }''',
  u'''     THE SHAPE FOLLOWS THE VIEWER (2026-09-22, src/the_viewer_decides_the_shape.py). Measured in
     Søren's browser, one probe state per viewer: spelunker.cave-explorer.org and
     neuroglancer-demo.appspot.com read a polyline; ngl.microns-explorer.org, neuroglancer.neuvue.io
     and h01-dot-neuroglancer-demo.appspot.com do NOT -- and on those, ONE polyline empties the
     WHOLE layer, taking the lines and points beside it, in silence. So an unknown viewer gets
     lines: a longer link is a cost, an empty layer is a lie.

     JUMP_VIEWER_POLYLINES = true (or false) in the console forces it on that page. */
  var POLYLINE_VIEWERS = { "spelunker.cave-explorer.org": 1, "neuroglancer-demo.appspot.com": 1 };
  function viewerBase(){
    try { var el = document.getElementById("viewer"); if (el && el.value) return String(el.value); }
    catch (_e){}
    try { if (window.UJ && UJ.cfg && UJ.cfg.viewer && UJ.cfg.viewer.base)
            return String(UJ.cfg.viewer.base); } catch (_e){}
    return "";
  }
  function viewerTakesPolylines(base){
    try { if (window.JUMP_VIEWER_POLYLINES === true) return true;
          if (window.JUMP_VIEWER_POLYLINES === false) return false; } catch (_e){}
    var h = "";
    /* The exact host, never a substring: "h01-dot-neuroglancer-demo.appspot.com" ends in
       "neuroglancer-demo.appspot.com" and does NOT take polylines. */
    try { h = new URL(String(base || viewerBase()), location.href).host; } catch (_e){ return false; }
    return !!POLYLINE_VIEWERS[h];
  }'''),
 (u"...and the writer asks",
  u'''    var asLines = (opts && typeof opts.lines === "boolean") ? opts.lines : viewerWantsLines();''',
  u'''    var asLines = (opts && typeof opts.lines === "boolean")
                ? opts.lines : !viewerTakesPolylines(opts && opts.base);'''),
 (u"...and both are exported, so a caller can say which it got",
  u'''           ringAnnotations: ringAnnotations,''',
  u'''           ringAnnotations: ringAnnotations, viewerTakesPolylines: viewerTakesPolylines,
           viewerBase: viewerBase,'''),
])

# ── 2. the card hands it the base its link is for ─────────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"tracingRingAnns takes the base",
  u'''function tracingRingAnns(rings, idPrefix){
  try {
    if (window.UJ && UJ.tracing && UJ.tracing.ringAnnotations)
      return UJ.tracing.ringAnnotations(rings, idPrefix);
  } catch (_e){}
  return tracingRingLines(rings, idPrefix);
}''',
  u'''function tracingRingAnns(rings, idPrefix, base){
  try {
    if (window.UJ && UJ.tracing && UJ.tracing.ringAnnotations)
      return UJ.tracing.ringAnnotations(rings, idPrefix, { base: base || "" });
  } catch (_e){}
  return tracingRingLines(rings, idPrefix);
}'''),
 (u"...and the cell's link says which viewer it is for",
  u'''                     annotations: tracingRingAnns(t.rings, "t" + i) });''',
  u'''                     annotations: tracingRingAnns(t.rings, "t" + i, base) });'''),
])

# `base` is read further down tracingViewerOpen than the layers are built, so it moves up.
edit("core/tracingcard.js", [
 (u"the base is known before the layers are built",
  u'''  const used = {}; let firstName = "";
  structs.forEach(function(t, i){''',
  u'''  /* The viewer decides the annotation shape (2026-09-22), so it has to be known before the
     layers are written, not just when the URL is joined. */
  const viewerEl0 = document.getElementById("viewer");
  const base = (viewerEl0 && viewerEl0.value)
            || (window.UJ && UJ.cfg && UJ.cfg.viewer && UJ.cfg.viewer.base)
            || "https://spelunker.cave-explorer.org/";
  const used = {}; let firstName = "";
  structs.forEach(function(t, i){'''),
 (u"...so the old pair of lines goes",
  u'''  const viewerEl = document.getElementById("viewer");
  const base = (viewerEl && viewerEl.value) || "https://spelunker.cave-explorer.org/";
  const url = base + "#!" + encodeURIComponent(JSON.stringify(st));''',
  u'''  /* base is resolved above, before the layers are written. */
  const url = base + "#!" + encodeURIComponent(JSON.stringify(st));'''),
])

# ── 3. and where lines made it long, it says which viewer would not have ──────────────────────
edit("core/tracingcard.js", [
 (u"a long link says the viewer is why",
  u'''  if (url.length > TRACING_LINK_LONG){''',
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
  if (url.length > TRACING_LINK_LONG){'''),
 (u"...appended to the sentence it already says",
  u'''      "Opening a long link (" + kc + "). If the viewer comes up empty, your browser cut it short: "
      + "copy or download the state below and paste it into Neuroglancer\\u2019s {} button.", false);''',
  u'''      "Opening a long link (" + kc + "). If the viewer comes up empty, your browser cut it short: "
      + "copy or download the state below and paste it into Neuroglancer\\u2019s {} button."
      + shapeSay, false);'''),
])
