# -*- coding: utf-8 -*-
"""The neighbours fold, and the jump comes up.                                  2026-09-18

Søren, two more on the cell panel:

  *"The nearest neighbors should be just above the connectivity and be collapsed by default."*
  *"Jump to this nucleus should be next to the nearest nucleus at this voxel, just after 'from
  query', but make it look nice."*

Both are about the panel's ORDER OF ATTENTION, and they pull in the same direction: what a reader
wants first should be near the top, and what they want occasionally should be one click away rather
than three screens down.

THE NEIGHBOURS. Three cells, each with a type, two ids and a coordinate -- about 120 px of the panel,
below every collapsed section, opened by nobody most of the time. They become a <details>, closed,
sitting between the propose/vote panel and Connectivity, so all four "more about this cell" sections
are now in one run and read as a list of things you can open. The <h4> becomes the <summary> and
keeps its own styling, so the block still looks like the section it was rather than like a link.

THE JUMP BUTTON was at the very bottom of the panel, under Cell history -- as far as it is possible
to be from the line that says which nucleus it would jump to. It moves onto the end of that line.
"Make it look nice" is the constraint that decides the styling: a full-size .jump button dropped
into a 12 px monospace line would set the line height and look like a mistake, so it keeps the class
(the click handler binds `.jump`) and overrides the size to match the inline "Jump to centriole"
button that already lives in a .meta line a few hundred lines up. Nothing invented; a pattern that
was already in the file for exactly this situation.

Run: python3 src/the_neighbours_fold_and_the_jump_comes_up.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NEIGH_START = "  const ne=kNearest(NX[i],NY[i],NZ[i],3,i);\n"
NEIGH_END = "  }\n  h+='</div>';\n  h+= ti.cls"
CONN = "  h+='<div id=\"connPanel\" style=\"margin:6px 0\"></div>';\n"

JUMP_OLD = ("  h+='<button class=\"jump\" data-x=\"'+NX[i]+'\" data-y=\"'+NY[i]+'\" data-z=\"'+NZ[i]"
            "+'\">Jump to this nucleus &#8599;</button>';\n")

NEAREST_OLD = ("  h+='<div class=\"meta\">nearest nucleus '+coordSpan(NX[i],NY[i],NZ[i])"
               "+' &middot; '+(r.dist/1000).toFixed(2)+' &micro;m from query</div>';")

NEAREST_NEW = (
    "  /* THE JUMP IS ON THE LINE THAT NAMES WHAT IT JUMPS TO, 2026-09-18 (Søren: \"Jump to this\n"
    "     nucleus should be next to the nearest nucleus at this voxel, just after 'from query', but\n"
    "     make it look nice.\") It used to sit at the very bottom of the panel, under Cell history,\n"
    "     which is as far as it is possible to get from the line saying WHICH nucleus it means.\n"
    "     It keeps class=\"jump\" because the click handler below binds `.jump`, and overrides the\n"
    "     size: a full-size button in a 12 px monospace line would set the line's height and read as\n"
    "     a mistake. The override matches the inline \"Jump to centriole\" button that already lives\n"
    "     in a .meta line in renderStandalone -- the pattern for this was already in the file. */\n"
    "  h+='<div class=\"meta\">nearest nucleus '+coordSpan(NX[i],NY[i],NZ[i])"
    "+' &middot; '+(r.dist/1000).toFixed(2)+' &micro;m from query'"
    "+'<button class=\"jump\" data-x=\"'+NX[i]+'\" data-y=\"'+NY[i]+'\" data-z=\"'+NZ[i]+'\" "
    "style=\"margin:0 0 0 10px;padding:2px 8px;font-size:11px;vertical-align:middle\">"
    "Jump to this nucleus &#8599;</button>'+'</div>';")

OPEN_OLD = "  h+='<div class=\"neigh\"><h4>3 nearest neighbouring cells</h4>';\n"
OPEN_NEW = (
    "  /* COLLAPSED, AND NEXT TO THE OTHER THINGS YOU CAN OPEN, 2026-09-18 (Søren: \"The nearest\n"
    "     neighbors should be just above the connectivity and be collapsed by default.\") Three cells\n"
    "     with a type, two ids and a coordinate each is about 120 px that most readers never want.\n"
    "     The <h4> becomes the <summary> and keeps its styling, so this still reads as the section it\n"
    "     was rather than as a link; .neigh keeps supplying the rule above it that separates it. */\n"
    "  h+='<details class=\"neigh\" style=\"margin-top:12px\"><summary style=\"font-size:11px;"
    "text-transform:uppercase;letter-spacing:.05em;color:var(--mut);cursor:pointer;margin:0\">"
    "3 nearest neighbouring cells</summary><div style=\"margin-top:6px\">';\n")


def move(s):
    if "3 nearest neighbouring cells</summary>" in s:
        print("  already there: the neighbours fold, above Connectivity")
        return s, False
    assert s.count(NEIGH_START) == 1, "neighbours block start not unique"
    assert s.count(NEIGH_END) == 1, "neighbours block end not unique"
    assert s.count(CONN) == 1, "the connectivity panel is not unique"
    i = s.find(NEIGH_START)
    j = s.find(NEIGH_END) + len("  }\n  h+='</div>';\n")
    assert j > i, "the block ends before it starts"
    block = s[i:j]
    assert OPEN_OLD in block, "the <h4> heading is not in the block being moved"
    # Fold it: the heading becomes a summary, and the closing div becomes the details.
    folded = block.replace(OPEN_OLD, OPEN_NEW, 1)
    assert folded.endswith("  h+='</div>';\n")
    folded = folded[:-len("  h+='</div>';\n")] + "  h+='</div></details>';\n"
    s = s[:i] + s[j:]                    # out of the bottom of the panel
    s = s.replace(CONN, folded + CONN, 1)  # and in above Connectivity
    print("  ok: the neighbours fold, just above Connectivity")
    return s, True


PAIRS = [
    (JUMP_OLD, "", "the jump button leaves the bottom of the panel"),
    (NEAREST_OLD, NEAREST_NEW, "...and lands on the line that names the nucleus"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    s, _ = move(s)
    for old, new, why in pairs:
        if new and new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        if not new and old not in s:
            print("  already there: " + why)
            continue
        assert not (new and new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("ujump.html", PAIRS)
print("\nnow: node jumplayoutcheck.js && python3 src/build_stamps.py")
