# -*- coding: utf-8 -*-
u"""The pad's 3D view draws with core/mesh3d.js's renderer wherever the page has one of its own,
and "show the segmentation" asks the host for the cell by its key as well as its fragment.   2026-09-21

Søren, on χJump: "It has problems with tracing and showing in 3D. Only shows 1 fragment of the
segmentation."

3D. The pad calls prepare / show / NUC_TINT on UJ.mesh3d, which is core/mesh3d.js's API. χJump has
its own UJ.mesh3d -- the renderer that knows cb2's frame, with a different API -- so the preview
failed with "UJ.mesh3d.prepare is not a function". χJump now loads core/mesh3d.js as well, under
UJ.mesh3dCore (xjump-build/src/xjump_pad_draws_and_the_card_turns_round.py), and the card asks for
tracingM3D(): UJ.mesh3dCore where a page has it, else UJ.mesh3d.

THE CELL. cellIdsFor(root) found a cell by the fragment in the root box. A cb2 fragment is
chunk-bounded -- a square of the cell -- and the fragment under the pointer need not be one the cell
lists. The card now passes the cell's key too, cellIdsFor(root, nuc), so χJump answers with every
fragment of the cell the card is filed under; the overlay and the viewer link both ask this way.

Check: xjpadcheck.js. Run: python3 src/the_pad_draws_with_the_core_renderer.py, then
python3 src/build_stamps.py
"""
import io, os
P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core/tracingcard.js")
s = io.open(P, encoding="utf-8").read(); b = s


def edit(name, old, new, count=1):
    global s
    if new in s: print("  already there: " + name); return
    assert s.count(old) == count, "%s: %d" % (name, s.count(old))
    s = s.replace(old, new); print("  ok: " + name)


edit(u"one name for the renderer",
     u'''function pad3DNote(msg){''',
     u'''/* core/mesh3d.js's renderer: UJ.mesh3dCore where a page keeps its own UJ.mesh3d (χJump), else
   UJ.mesh3d. See src/the_pad_draws_with_the_core_renderer.py. */
function tracingM3D(){
  return (window.UJ && UJ.mesh3dCore && UJ.mesh3dCore.prepare) ? UJ.mesh3dCore : UJ.mesh3d;
}
function pad3DNote(msg){''')
edit(u"...used to prepare", u"UJ.mesh3d.prepare(", u"tracingM3D().prepare(", count=3)
edit(u"...for the nucleus tint", u"(UJ.mesh3d.NUC_TINT ||", u"(tracingM3D().NUC_TINT ||")
edit(u"...and to show", u"    UJ.mesh3d.show(host, geo,", u"    tracingM3D().show(host, geo,")
edit(u"the overlay asks for the cell by its key too",
     u'''      if (root && typeof f === "function") also = (f(root) || []).map(String).filter(function(x){ return x && x !== root; });''',
     u'''      /* By the cell's key as well as the fragment (2026-09-21): on χJump the fragment under the
         pointer need not be one the cell lists. */
      const key = (document.getElementById("tracingNucId").value || "").trim();
      if ((root || key) && typeof f === "function")
        also = (f(root, key) || []).map(String).filter(function(x){ return x && x !== root; });'''),
edit(u"...and so does the viewer link",
     u'''      if (typeof f === "function") (f(String(root)) || []).forEach(function(x){''',
     u'''      if (typeof f === "function") (f(String(root), String(nuc || "")) || []).forEach(function(x){''')
if s != b: io.open(P, "w", encoding="utf-8").write(s)
