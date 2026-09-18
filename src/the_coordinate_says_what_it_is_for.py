# -*- coding: utf-8 -*-
"""The coordinate says what it is for.                                          2026-09-18

Søren, on the coordinate row: *"Could this be a mouseover for the first coordinate? Also, this text
'jump to it in minnie65, identify the nearest cell & its neighbours, and load the cell + nucleus in
3D' should be changed to 'paste a coordinate from Neuroglancer here to figure out what cell type you
are looking at' (make it sound better, and more concise if you can)."*

TWO DIFFERENT KINDS OF SENTENCE, and the reason they get different treatment.

"Or paste x, y, z into the x field -- it splits automatically" is a fact about one input box. It
belongs on that box: somebody who is about to paste into it is hovering it, and nobody else needs
telling. A `title` on #x is exactly that sentence's audience, and it was a line of the card.

The label was describing the PIPELINE -- jump, find the nearest cell, list its neighbours, load two
meshes -- which is what the page does after you press the arrow, and all of it is visible the moment
it happens. What the label has to answer is why anybody would type here at all, which is his
sentence. So:

    COORDINATE -- paste one from Neuroglancer to see what cell type you are looking at

His words, one clause shorter: "paste a coordinate ... here" becomes "paste one", since the label is
already the word COORDINATE and repeating it is the thing making it long. "figure out" -> "see".

The dropped detail is not moved into a tooltip anywhere. It described the result rather than the
purpose, and a tooltip nobody has a reason to hover is a worse place for it than nowhere.

Run: python3 src/the_coordinate_says_what_it_is_for.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SPLIT_HINT = ("Paste a whole coordinate here — “x, y, z” in one go, from Neuroglancer "
              "or anywhere else — and it splits itself across the three boxes.")

PAIRS = [
    ('''<label>Coordinate <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; jump to it in minnie65, identify the nearest cell &amp; its neighbours, and load the cell + nucleus in 3D</span></label>''',
     '''<!-- 2026-09-18 (Søren) -- the label used to describe the PIPELINE: jump, find the nearest
     cell, list its neighbours, load two meshes. All of that is visible the moment it happens, so
     the label was spending a line on what the page would show anyway. What a label has to answer
     is why somebody would type here at all. -->
<label>Coordinate <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; paste one from Neuroglancer to see what cell type you are looking at</span></label>''',
     "the label says why you would use it, not what happens next"),

    ('''<div class="coord"><input type="text" id="x" inputmode="decimal" placeholder="x"></div>''',
     '''<div class="coord"><input type="text" id="x" inputmode="decimal" placeholder="x" title="'''
     + SPLIT_HINT + '''"></div>''',
     "...and the paste trick is on the box it is about"),

    ('''<p class="hint">Or paste <code>x, y, z</code> into the x field &mdash; it splits automatically.</p>
''',
     '''''',
     "...so it is no longer a line of the card"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
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
