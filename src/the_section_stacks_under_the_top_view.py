# -*- coding: utf-8 -*-
u"""δJump's cell card stops leaving two holes in itself.                         2026-09-20

Søren, with the card on screen: *"This could be more compact."*

MEASURED BEFORE CHANGING ANYTHING, in a 1280 px viewport (the numbers are px, from
getBoundingClientRect on the live panel):

    layer diagram column   296 → 633   y 874 → 1206
    top view column        647 → 984   y 874 → 1041
    EM section             296 → 984   y 1216 → 1381     <- full width
    ...its canvas          296 → 556                      <- 260 px of it

Two holes, and they are the same hole twice:

  * **165 px of empty column under the top view**, because the top view is 168 px tall and the
    layer diagram beside it is 332;
  * **428 px of empty row beside the section**, because the section's box spans the full 688 px
    and the canvas inside it is 260.

The section was appended AFTER the two-column block, so it could only land underneath both. Put it
in the SECOND column instead and the two holes fill each other: 168 + 166 = 334 against the layer
diagram's 332, which is as close to level as this will ever get without arithmetic.

THE SAME FIX λJUMP HAD, for the same complaint. There it was *"This can be arranged more
compact"* and the section went beside the depth ruler
(src/the_section_moves_up_beside_the_ruler.py). Different card, same shape of gap.

── renderLocationDiagram TAKES WHAT GOES UNDER IT ──────────────────────────────

Rather than the caller building its own flex row, the function that already owns the two-column
layout gains an optional second argument. It is called in FIVE places on this page and only one of
them has a section to place; the other four pass nothing and are untouched, which is what an
optional argument with an empty default is for.

Run: python3 src/the_section_stacks_under_the_top_view.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)


DIAG_OLD = u'''function renderLocationDiagram(pos){
  const[vx,vy,vz]=pos;
  const layerSvg=renderLayerDiagram(estimateLayer(vx,vy,vz));
  const topSvg=renderTopViewDiagram(vx,vy,vz);
  if(!layerSvg&&!topSvg)return "";
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">'
    +(layerSvg?'<div style="flex:1 1 200px;min-width:180px">'+layerSvg+'</div>':'')
    +(topSvg?'<div style="flex:1 1 200px;min-width:180px">'+topSvg+'</div>':'')
    +'</div>';
}'''

DIAG_NEW = u'''/* ── WHAT GOES UNDER THE TOP VIEW ────────────────────────  2026-09-20
   Søren: *"This could be more compact."* Measured on the card before changing it: the top view is
   168 px tall against the layer diagram's 332, so 165 px of its column was empty; and the EM
   section, appended after this block, spanned the full 688 px around a 260 px canvas, so 428 px
   of that row was empty too. Two holes that fill each other.

   `under` is stacked in the SECOND column, beneath the top view. 168 + 166 = 334 against 332,
   which is as level as this gets. Optional, because this function is called in five places on
   this page and exactly one of them has a section to place. */
function renderLocationDiagram(pos,under){
  const[vx,vy,vz]=pos;
  const layerSvg=renderLayerDiagram(estimateLayer(vx,vy,vz));
  const topSvg=renderTopViewDiagram(vx,vy,vz);
  under=under||"";
  if(!layerSvg&&!topSvg&&!under)return "";
  /* align-items:flex-start keeps each column its own height rather than stretching the shorter
     one, which is what lets the right column end level with the left instead of below it. */
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">'
    +(layerSvg?'<div style="flex:1 1 200px;min-width:180px">'+layerSvg+'</div>':'')
    +((topSvg||under)?'<div style="flex:1 1 200px;min-width:180px">'+topSvg+under+'</div>':'')
    +'</div>';
}'''

MOUNT_OLD = u'''  h+=renderLocationDiagram(pos);
  /* The section goes under the layer diagram and the top view, which is the slot µJump uses:
     the reader is already asking where this cell is rather than what it is. */
  h+=emPlaneBox(pos);'''

MOUNT_NEW = u'''  /* The section goes UNDER THE TOP VIEW rather than under the whole block — see
     renderLocationDiagram's header for the two holes that closes. */
  h+=renderLocationDiagram(pos,emPlaneBox(pos));'''

print("djump.html")
edit("djump.html", [
    (u"the two-column block takes what stacks under the top view", DIAG_OLD, DIAG_NEW),
    (u"...and the section is what stacks there", MOUNT_OLD, MOUNT_NEW),
], marker=u"WHAT GOES UNDER THE TOP VIEW")

print(u"\nnow: node emdjumpcheck.js")
