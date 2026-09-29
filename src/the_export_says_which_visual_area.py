# -*- coding: utf-8 -*-
u"""The export says which visual area the cell is in.                                    2026-09-28

Søren, on yesterday's visual-area filter: "Please add the column".

ALWAYS, NOT ONLY WHEN THE FILTER IS ON. The area is already computed for every candidate row —
src/which_visual_area_a_cell_is_in.py bakes a two-bit label for all 144,118 nuclei and measures
anything else against the walls on the spot — so gating the column on result.areaActive would
withhold something already in hand. That is the convention this export settled on for Vessel
type, Cortical layer and the cilium/centriole flags, each of which carries a comment saying so;
the V1-column bucket is the exception because its own bucketing only runs when asked for.

WHERE IT SITS: beside "Cortical layer". Those two answer the same shape of question — where in
the cortex this cell is — one down the depth axis and one across the surface.

The value is the full name: "V1 (VISp)", "RL (VISrl)", "AL (VISal)", "LM (VISlm)". A blank means
no label, which for an "N"-space row cannot happen and for a standalone row means its position
fell outside every sector — worth seeing as a blank rather than guessed at.

Check: visualareacheck.js (extended with the export assertions; red before, green after).
Run: python3 src/the_export_says_which_visual_area.py, then python3 src/build_stamps.py
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


edit("ujump.html", [

 (u"the match record carries the area",
  u"      return{row,fine,fineDist,gl,layerLabel,wmDist,v1Bucket,regionBoxLabel,hasCil,hasCent,nearDist,isRefRow:!!isRefRow};",
  u"      return{row,fine,fineDist,gl,layerLabel,wmDist,v1Bucket,rowArea,regionBoxLabel,hasCil,hasCent,nearDist,isRefRow:!!isRefRow};"),

 (u"...and the export has a column for it",
  u'''      {header:"Cortical layer",get:m=>m.layerLabel||""},
''',
  u'''      {header:"Cortical layer",get:m=>m.layerLabel||""},
      /* Always included, like Cortical layer above and for the same reason: evalRow() already
         knows it for every row, so gating it on the area filter being on would withhold something
         already in hand. Cortical layer is where the cell is down the depth axis; this is where it
         is across the surface. Blank means no sector matched, which an "N"-space row cannot be --
         see src/which_visual_area_a_cell_is_in.py for how the four are told apart. */
      {header:"Visual area",get:m=>(m.rowArea===null||m.rowArea===undefined)?"":((window.AREA_NAMES||[])[m.rowArea]||("area "+m.rowArea))},
'''),

 (u"...and a check can ask what the column set is",
  u"  function buildColumns(result,orgKinds){",
  u"""  /* ON WINDOW so a check can ask for the column set without downloading a workbook (2026-09-28)
     -- the same reason fetchAllRootIdProposals is exposed further down. What is worth asserting
     about a column is which results it appears for, and that is a property of this function, not
     of the .xlsx that comes out the other end. The assignment sits above the declaration because
     a function declaration is hoisted to the top of its scope; it is the same function object the
     download handler calls. */
  window.buildColumns=buildColumns;
  function buildColumns(result,orgKinds){"""),
])
print("\nNow: node visualareacheck.js, then python3 src/build_stamps.py")
