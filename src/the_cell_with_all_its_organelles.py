# -*- coding: utf-8 -*-
u"""The cell with all its organelles.                                            2026-09-20

Søren, having just opened one lysosome in the viewer and sent back the render of it sitting inside
its microglia: *"There should also be an option to view the cells with all its organelles, but under
the organelles list."*

ONE AT A TIME IS THE WRONG UNIT FOR THE QUESTION HE IS ASKING. Each row's Jump answers "where is
this one, and what shape is it" -- and three lysosomes in a microglia is a claim about the CELL:
where they sit relative to each other, whether they cluster, how much of the soma they take up. That
needs them all on screen together, which is a different picture and not one you can assemble by
pressing Jump three times.

THE MACHINERY IS tracingViewerOpen's, UNCHANGED. It already takes a list of structures, gives each
its own annotation layer in its own colour, centres on the middle of the lot, puts the cell in the
3D pane see-through with its nucleus in blue, and refuses politely when the URL would be too long
for a viewer to swallow. It was written for the tracing pad's "Look at it in Neuroglancer"; nothing
about it was pad-specific, so this is a second caller rather than a second implementation.

WHAT IS IN HAND, AND SAYING SO WHEN IT IS NOT. The index (?tracings=1) carries no contours -- that
is what makes listing cheap -- so an outline whose geometry has not been fetched cannot be drawn.
The section fetches them when it is opened, which is the same click that makes the button visible,
so in practice they are there. When some are not, it opens with the ones it has and says how many it
could not read, rather than either waiting or pretending.

AND IT DOES NOT WAIT BEFORE OPENING. Fetching first and opening after would be tidier and would be
blocked as a popup: a window.open that is not in the same turn as the click is not a window the
browser lets you have.

Run: python3 src/the_cell_with_all_its_organelles.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BUTTON = [
    (u'''  var nSeg = trs.length, nAnn = anns.length;''',
     u'''  /* \u2500\u2500 ALL OF THEM AT ONCE, UNDER THE LIST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-09-20
     S\u00f8ren: *"There should also be an option to view the cells with all its organelles, but under
     the organelles list."* Each row's Jump answers "where is this one"; three lysosomes in a
     microglia is a claim about the cell, and that is a different picture.

     Only when there is something to draw, and only on a page that can draw it -- this panel serves
     six tools and the viewer opener belongs to the ones with a tracing card. */
  var allBtn = "";
  if (withRings.length && typeof organShowAllInViewer === "function")
    allBtn = '<div style="margin-top:8px"><button type="button" class="idbtn organshowall" '
      + 'style="width:auto;padding:4px 10px;font-size:12px" '
      + 'title="Opens the viewer with this cell and every outline on it \\u2014 one annotation layer '
      + 'each, in the colours they were drawn in, with the cell see-through in the 3D pane.">'
      + 'Show the cell with all ' + withRings.length + ' organelle'
      + (withRings.length === 1 ? "" : "s") + ' \\u2197</button></div>';
  var nSeg = trs.length, nAnn = anns.length;''',
     "the section can offer to open the whole cell"),

    (u'''    + '<div style="margin-top:4px">' + rows.join("")
    + (noRings.length ? '<p class="hint" style="margin-top:4px">''',
     u'''    + '<div style="margin-top:4px">' + rows.join("") + allBtn
    + (noRings.length ? '<p class="hint" style="margin-top:4px">''',
     "...and it sits under the list, where he asked for it"),

    (u'''  [].slice.call(host.querySelectorAll(".organtrace")).forEach(function(b){''',
     u'''  /* The structures are handed over directly rather than looked up again from an id: they are in
     hand here, with their rings, and a second lookup is a second chance to disagree with the list
     the person is looking at. */
  [].slice.call(host.querySelectorAll(".organshowall")).forEach(function(b){
    b.addEventListener("click", function(){
      if (typeof organShowAllInViewer === "function")
        organShowAllInViewer(withRings, nid, root, noRings.length);
    });
  });
  [].slice.call(host.querySelectorAll(".organtrace")).forEach(function(b){''',
     "...and pressing it hands over the outlines it listed"),
]

OPENER = [
    # Anchored on the function's own signature line, not on the box-drawn heading above it:
    # counting \u2500 characters to reproduce a rule by hand is how the first attempt failed.
    (u"""function openTracingAt(pt, kind){""",
     u"""/* \u2500\u2500 THE CELL WITH ALL ITS ORGANELLES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-09-20
   S\u00f8ren: *"There should also be an option to view the cells with all its organelles, but under
   the organelles list."*

   Each row's Jump answers "where is this one, and what shape is it". Three lysosomes in a microglia
   is a claim about the CELL -- where they sit relative to each other, whether they cluster, how
   much of the soma they take up -- and that is a picture you cannot assemble by pressing Jump three
   times.

   Called by name from core/panel.js's Organelles section and guarded there with a typeof, the same
   way openTracingAt below is: that panel serves six tools and only the ones with a tracing card can
   open a viewer full of contours.

   tracingViewerOpen does the work and is not touched. It gives each structure its own annotation
   layer in its own colour, centres on the middle of the lot, puts the cell in the 3D pane
   see-through with its nucleus in blue, and refuses politely when the URL would be longer than a
   viewer can swallow -- all written for the pad's own "Look at it in Neuroglancer", none of it ever
   pad-specific. A second caller, not a second implementation.

   `missing` is how many of this cell's outlines have not had their geometry read here. Said rather
   than waited for: fetching first and opening after would put the window.open in a different turn
   from the click, which is a window the browser does not let you have. */
function organShowAllInViewer(trs, nid, root, missing){
  const structs = (trs || []).filter(function(t){ return t && (t.rings || []).length; })
    .map(function(t){
      return { name: t.name || (t.instanceOf || t.kind || "organelle"),
               color: t.color || "#40e28c", rings: t.rings };
    });
  if (!structs.length){
    tracingSay("None of this cell\u2019s outlines have been read here yet \u2014 open the "
      + "Organelles list, give it a moment, and try again.", true);
    return;
  }
  const what = structs.length + " organelle" + (structs.length === 1 ? "" : "s");
  tracingViewerOpen(structs,
    "Opened this cell with " + what + " on it \u2014 one annotation layer each, in the colours they "
    + "were drawn in."
    + (missing ? " " + missing + " more outline" + (missing === 1 ? " has" : "s have")
                 + " not been read here, so " + (missing === 1 ? "it is" : "they are")
                 + " not on it." : ""),
    { nuc: nid || "", root: root || "" });
}
function openTracingAt(pt, kind){""",
     "the page can open a cell with every outline on it"),
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


edit("core/panel.js", BUTTON)
edit("ujump.html", OPENER)
print("\nnow: node organallcheck.js && node organjumpcheck.js && node ccpanelcheck.js "
      "&& python3 src/build_stamps.py")
