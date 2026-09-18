# -*- coding: utf-8 -*-
"""Two lines that did not need the room.                                        2026-09-18

Søren, twice in a row on the Jump card:

  *"To simplify, I think these layer options could go under the advanced viewer, just beneath the
  viewer."*
  *"This could be a mouse-over for the random button instead of taking space."*

Both are the same judgement: a thing that is READ ONCE does not deserve permanent vertical space on
the panel somebody uses every day.

THE LAYER TICKS. EM imagery / Segmentation / Nuclei are set once, if ever -- and the hint under them
says why they barely matter ("On identify, the cell and its nucleus are loaded automatically, so
both segmentation layers switch on even if unchecked"). A control that explains that it usually does
not apply belongs behind the disclosure that already holds the viewer choice and the custom base
state, which are the other two things nobody touches twice.

NOTHING ABOUT THE JAVASCRIPT CHANGES, and that is worth stating because it looks like it should.
The three ids are untouched, and getElementById reaches inside a CLOSED <details> exactly as it
reaches anywhere else -- a collapsed disclosure hides its contents from the eye, not from the DOM.
So every buildState() that reads #em/#seg/#nuc keeps reading the same values, with Advanced shut.
That is the one thing a check has to prove rather than assume, and jumplayoutcheck.js proves it by
building a real viewer state with the disclosure closed.

THE RANDOM-EXAMPLE SENTENCE becomes the button's own title. It describes what pressing the button is
FOR, which is exactly what a tooltip on that button is, and it was three lines of the panel at
narrow widths.

Run: python3 src/two_lines_that_did_not_need_the_room.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RANDOM_HINT = ("Great for learning what a cell type looks like (a new random example loads each "
               "click), or for quickly finding a cell that still needs a first identification.")

LAYERS = '''<div style="margin-top:14px"><label>Layers</label>
<div class="toggles"><label><input type="checkbox" id="em" checked> EM imagery</label><label><input type="checkbox" id="seg" checked> Segmentation (flat v1300)</label><label><input type="checkbox" id="nuc" checked> Nuclei</label></div>
<p class="hint">On identify, the cell (root ID) and its nucleus are loaded automatically, so both segmentation layers switch on even if unchecked.</p></div>
'''

VIEWER_SELECT = '''<select id="viewer"><option value="https://ngl.microns-explorer.org/">MICrONS Neuroglancer (has Share button)</option><option value="https://spelunker.cave-explorer.org/">Spelunker / CAVE explorer</option><option value="https://neuroglancer-demo.appspot.com/">Google Neuroglancer (no login)</option><option value="https://neuroglancer.neuvue.io/">neuvue (MICrONS)</option></select>
'''

PAIRS = [
    # ── the sentence becomes the button's tooltip ───────────────────────────────────────────
    ('''<button class="idbtn" id="randomOfType">Random example</button>
</div>
<p class="hint">''' + RANDOM_HINT + '''</p>''',
     '''<!-- 2026-09-18 (Søren: "This could be a mouse-over for the random button instead of taking
     space.") -- the sentence described what pressing THIS button is for, which is what a title on
     this button is, and it ran to three lines at narrow widths. -->
<button class="idbtn" id="randomOfType" title="''' + RANDOM_HINT + '''">Random example</button>
</div>''',
     "the random-example sentence is the button's own tooltip"),

    # ── the layer ticks move inside Advanced, just under the viewer ─────────────────────────
    (LAYERS + '''<details><summary>Advanced: viewer + custom base state</summary>
<label style="margin-top:12px">Viewer</label>
''' + VIEWER_SELECT,
     '''<!-- 2026-09-18 (Søren: "these layer options could go under the advanced viewer, just beneath
     the viewer") -- these three ticks are set once if ever, and the hint under them says why they
     barely matter at all: identifying a cell switches both segmentation layers on regardless. A
     control that explains that it usually does not apply belongs behind the same disclosure as the
     viewer choice and the custom base state.
     NO JAVASCRIPT MOVED WITH THEM. The ids are untouched and getElementById reaches inside a
     CLOSED <details> exactly as it reaches anywhere else -- a collapsed disclosure hides its
     contents from the eye, not from the DOM -- so every buildState() that reads #em/#seg/#nuc
     keeps reading the same values with Advanced shut. jumplayoutcheck.js builds a real viewer
     state with it closed rather than taking that on trust. -->
<details><summary>Advanced: viewer + custom base state</summary>
<label style="margin-top:12px">Viewer</label>
''' + VIEWER_SELECT + LAYERS,
     "the layer ticks sit under the viewer, inside Advanced"),
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


edit("ujump.html", PAIRS)
print("\nnow: node jumplayoutcheck.js && python3 src/build_stamps.py")
