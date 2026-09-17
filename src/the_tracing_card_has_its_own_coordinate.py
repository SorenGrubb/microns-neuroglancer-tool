"""The button wanted a coordinate it had no way to be given.                          2026-09-17

Søren, on the new button: *"The button is there, but it doesn't work. I would like if you can also
input coordinates of the cell or organelle you want to trace, so you just straight to it. The
coordinate input should look the same as the other coordinate input for uJump."*

It "doesn't work" is the card's own refusal showing: *"Search a coordinate or a cell first — the
viewer opens where you are."* tracingOpen() read `window.CUR_POS` and nothing else, so on a freshly
loaded page — which is exactly when somebody opens the tracing card to go and trace something — it
had nowhere to open. Making the card depend on a search in a different card, for a coordinate he
already has written down, was the wrong shape.

THE CARD NOW CARRIES ITS OWN x / y / z. Same markup as the main search box (`div.row` of
`div.coord` inputs, `inputmode="decimal"`), same voxels, and the same paste behaviour: drop
`x, y, z` into the x field and it splits itself across the three. It is pre-filled from the cell on
screen whenever all three are empty — on load and every time the card is opened — so the one-click
case for a cell he just searched is unchanged, and the boxes still say where it is about to go.

HALF-FILLED IS AN ERROR, NOT A FALLBACK. Two of three filled in means he meant to type a coordinate
and has not finished; silently opening at CUR_POS instead would be a viewer at the wrong place,
looking exactly like a viewer at the right one — and he would find out two sections into a tracing.
So: all three, or none.

Run: python3 src/the_tracing_card_has_its_own_coordinate.py
     node tracingpanelcheck.js


SUPERSEDED PAIRS REMOVED, 2026-09-17: the edits below marked here were later rewritten by another
generator, which now owns that text. The reason they were made is still this file's; the
literal is the other file's, so re-running this one is a no-op rather than a second insert.
Superseded: "the card has its own coordinate boxes"; "the coordinate boxes are driven in a real page"; "the refusal it now gives is the one asserted"
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HTML = [
]

JS = [

]


# PANELCHECK: every pair here was superseded by a later generator, which now owns that text.
# Kept as an empty list so this file still runs as the no-op it has become; the reason for
# the change is in the docstring above, and the literal is the other generator's.
PANELCHECK = []

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


edit("ujump.html", HTML + JS)
edit("tracingpanelcheck.js", PANELCHECK)
print("\nnow: node tracingpanelcheck.js")
