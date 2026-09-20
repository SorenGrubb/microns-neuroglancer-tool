# -*- coding: utf-8 -*-
u"""The section moves up beside the ruler.                                        2026-09-20

Søren, looking at λJump's card with the EM section live on it (real Lee16 tissue, an endothelial
cell in layer 1): *"This can be arranged more compact."*

WHAT THE SPACE WAS DOING. The depth ruler is about 130 px wide and 260 px tall. Beside it sat one
paragraph three lines deep, and then nothing -- roughly 200 px of empty background, 560 px wide,
for the rest of the ruler's height. The section was a row of its own UNDER all of that, centred,
with its own empty margins left and right. Two large gaps, one picture.

THE FIX IS THE ONE µJUMP ALREADY MADE, and its own comment describes it exactly: *"the two
diagrams stop being two flex siblings and become a model column and a stack, and the stack is what
grew."* The ruler stays a column; the paragraph and the section become a stack beside it, filling
the space the paragraph was leaving. The card loses a whole row and gains nothing in height, which
is what "more compact" means here.

TWO SMALL THINGS THAT COME WITH THE MOVE:

  - the canvas stops centring itself. margin:0 auto was right when it was alone in a full-width
    row; in a column beside the ruler it would float in the middle of its own stack while the
    paragraph above it starts at the left. Left-aligned, it lines up with the text it sits under.
  - the stack needs a min-width. Below about 420 px the flex row wraps and the stack goes full
    width, which is correct on a phone -- but without a floor it wraps early and the section ends
    up narrower than the 260 px it is drawn for, on a screen with room for both.

Run: python3 src/the_section_moves_up_beside_the_ruler.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
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


# ── the paragraph and the section become one stack ────────────────────────────────────────────
ROW_OLD = u'''    +'<p class="hint" style="flex:1 1 200px;margin-top:0">\''''
ROW_NEW = u'''    /* ── THE STACK BESIDE THE RULER ─────────────────────────  2026-09-20
       Søren, seeing the section land in a row of its own: *"This can be arranged more compact."*
       It was: one paragraph three lines deep beside a ruler 260 px tall, then ~200 px of empty
       background, then the picture in a full-width row with margins either side.

       So the paragraph and the section become a column and fill that space, which is the move
       µJump already made for the same reason -- "the two diagrams stop being two flex siblings and
       become a model column and a stack, and the stack is what grew".

       min-width 240: below that the row wraps and the stack goes full width, which is right on a
       phone. Without a floor it wraps early and the section renders narrower than the 260 px it is
       drawn at, on a screen with room for both. */
    +'<div style="flex:1 1 300px;min-width:240px">'
    +'<p class="hint" style="margin:0">\''''

TAIL_OLD = u'''    +'</p></div>';

  /* The section goes under the depth ruler, which is the slot µJump uses: beside the orientation
     diagram, where this column has room and the reader is already asking where the cell is rather
     than what it is. */
  h+=emPlaneBox(pos);
'''
TAIL_NEW = u'''    +'</p>'
    /* Inside the stack now, not in a row of its own. Still the slot µJump uses -- beside the
       orientation diagram, where the reader is already asking where the cell is rather than what
       it is -- just without the empty row that used to separate them. */
    +emPlaneBox(pos)
    +'</div></div>';
'''

# The canvas no longer centres itself: alone in a full-width row that was right, in a column beside
# a left-aligned paragraph it is not.
# Short and quote-free on purpose. The first version quoted the whole two-line expression, and the
# triple-quoted literal swallowed the trailing "'" of "var(--line);'" -- ";'''" ends the string at
# the semicolon. The anchor below contains no quote characters at all, so there is nothing for the
# quoting to eat.
CV_OLD = u";margin:0 auto;background:var(--bg)"
CV_NEW = u";margin:4px 0 0;background:var(--bg)"

print("ljump.html")
edit("ljump.html", [
    (u"the paragraph opens a stack", ROW_OLD, ROW_NEW),
    (u"...and the section goes inside it", TAIL_OLD, TAIL_NEW),
    (u"...where the canvas lines up with the text rather than centring",
     CV_OLD, CV_NEW),
])

print(u"\nnow: node emljumpcheck.js && node ljumpdashcheck.js "
      u"&& python3 src/build_stamps.py && node stampcheck.js")
