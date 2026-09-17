"""A traced structure says what it is from the list, not from a text box.             2026-09-17

Søren, after tracing a lysosome on nine sections and typing "Lysosome" into a free-text field:
*"Instead of free text, we need it to have a dropdown to select an organelle type like the list we
have for identification of organelles. There should be one option to input an organelle type only
if it does not exist on the list. If it is a nucleus, the user should be able to select nucleus and
if it is the entire cell's mesh, then the user should be able to select that. Those should be in the
top of the list. If the nucleus or cell mesh already exists at the location put in the coordinates,
those should be prefilled."*

Free text was the wrong shape, and it was mine. Every other structure this project records comes
from the ontology -- the organelle card, the bulk paste, the filter and the dashboard all key on the
same kinds -- and a tracing typed "Lysosome" one day and "lysosome" the next is two things to every
one of them. The list was already there: `UJ.organelles.optionsHtml()` renders it <optgroup> by
<optgroup>, and has since the organelle card was built.

FOUR CHANGES.

1. **The list, with the two whole-object answers on top.** "Whole cell -- the cell's own mesh" and
   "Nucleus" first, because they are what somebody outlines when the segmentation has missed a cell
   and they are not organelles. Then the ontology, unchanged. Then, last, "Something else -- type
   the name", the only door to a text box: a kind that has to be typed is a kind the ontology is
   missing, and it should feel like the exception it is.

2. **The kind travels with the tracing.** `kind` is the ontology's own value ("lysosome"), `name` is
   its label, and both go into the shared rows, the read-back and the Blender export.

3. **The cell is read, not asked for.** core/segread.js already answers "what root id and what
   nucleus id are at this voxel" from the same segmentation the rest of the tool uses, so opening
   the pad resolves the coordinate and the two id boxes fill themselves. It never overwrites
   something already typed, and it SAYS what it found -- a prefilled id nobody explains is a number
   to distrust, and "nothing is segmented there" is itself the answer when the reason for tracing is
   that the segmentation has missed the cell.

4. **Magnification, separate from the mip.** The zoom list stopped at 8 nm/px, which is where the
   data stops; a lysosome is about 500 nm, sixty pixels, and he was tracing one. `zoom` draws each
   source voxel as zoom x zoom screen pixels, so the pad can go closer than the data does. It costs
   nothing extra to fetch -- the window in VOXELS shrinks as the magnification grows -- and the
   label says "8 nm data" rather than pretending the resolution improved.

   (Søren, mid-change: *"I see the zoom level is already there. so nevermind that."* The selector
   was; what it could not do was go past the finest mip, which is the case he was in.)

The pad's own markup and pointer handling stay in src/a_polygon_tool_of_our_own.py, which owns that
region. This file touches the tile reader, the row format, the notebook parameters and the CARD.

Run: python3 src/what_it_is_comes_from_the_list.py
     node emtilescheck.js && node tracingcheck.js && node tracingpanelcheck.js


SUPERSEDED PAIRS REMOVED, 2026-09-17: the edits below marked here were later rewritten by another
generator, which now owns that text. The reason they were made is still this file's; the
literal is the other file's, so re-running this one is a no-op rather than a second insert.
Superseded: "the ids are read from the segmentation"; "the card asks what it is from the list"
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# -- core/emtiles.js: magnification on top of the mip --------------------------------------------
EMTILES = [
]

JS = [
]


# BLENDER: every pair here was superseded by a later generator, which now owns that text.
# Kept as an empty list so this file still runs as the no-op it has become; the reason for
# the change is in the docstring above, and the literal is the other generator's.
BLENDER = []

# HTML: every pair here was superseded by a later generator, which now owns that text.
# Kept as an empty list so this file still runs as the no-op it has become; the reason for
# the change is in the docstring above, and the literal is the other generator's.
HTML = []

# TRACING: every pair here was superseded by a later generator, which now owns that text.
# Kept as an empty list so this file still runs as the no-op it has become; the reason for
# the change is in the docstring above, and the literal is the other generator's.
TRACING = []

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


edit("core/emtiles.js", EMTILES)
edit("core/tracing.js", TRACING)
edit("src/core_blenderexport.py", BLENDER)
edit("ujump.html", HTML + JS)
print("\nnow: python3 src/core_blenderexport.py   and   node tracingpanelcheck.js")
