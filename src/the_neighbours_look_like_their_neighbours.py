# -*- coding: utf-8 -*-
"""The neighbours look like their neighbours.                                   2026-09-18

Søren: *"I Don't think the 3 nearest neighboring cells should be all caps. Also, there should be a
grey line below it like the rest."*

Both are the same mistake: when I folded that block into a <details> this morning I hand-styled the
summary to keep the look of the <h4> it replaced -- uppercase, letter-spaced, 11 px, muted -- instead
of adopting the pattern the sections around it already use. So it came out shouting in a row of
sentence-case labels.

THERE IS A HOUSE PATTERN AND IT HAS A NAME. "Astrocyte-synapse proximity" and "Cell contacts" are
both `<details class="rv-panel neigh">` with a plain `<summary>`: .rv-panel supplies the triangle
that rotates on open and the typography, .neigh supplies the rule above and the spacing. Using the
two classes instead of eleven inline properties fixes the caps, the size, the colour and the arrow
in one move -- and means the next change to that look reaches this section too.

THE MISSING LINE IS NOT MISSING FROM HERE. Each of these sections carries its own rule ABOVE it, so
what separates two sections is the lower one's border-top. The neighbours have theirs. The gap he
is pointing at is between the neighbours and Connectivity -- and Connectivity is the one section with
no rule at all, because it is an <a> toggle rather than an rv-panel. So the line belongs on
Connectivity, where it is missing, not doubled onto the block above it: that way every section still
has exactly one rule and the rhythm is unbroken all the way down.

`:not(:empty)` because #connPanel is an empty div until renderConnectivityToggle fills it, and a
border on an empty div is a line with nothing under it -- on a cell whose panel never builds one,
which is the case nobody would have looked at.

Run: python3 src/the_neighbours_look_like_their_neighbours.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    ('''  h+='<details class="neigh" style="margin-top:12px"><summary style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);cursor:pointer;margin:0">3 nearest neighbouring cells</summary><div style="margin-top:6px">';''',
     '''  /* THE SAME TWO CLASSES THE SECTIONS AROUND IT USE, 2026-09-18 (Søren: "I Don't think the 3
     nearest neighboring cells should be all caps"). It was hand-styled to keep the look of the <h4>
     it replaced, which made it shout in a row of sentence-case labels. .rv-panel gives the rotating
     triangle and the typography, .neigh the rule above and the spacing -- exactly what
     "Astrocyte-synapse proximity" and "Cell contacts" are built from. */
  h+='<details class="rv-panel neigh"><summary>3 nearest neighbouring cells</summary><div style="margin-top:6px">';''',
     "the neighbours' summary is styled like the sections around it"),

    ('''.rv-panel{margin-top:10px}''',
     '''.rv-panel{margin-top:10px}
/* 2026-09-18 (Søren: "there should be a grey line below it like the rest") -- each collapsible
   section in the cell panel carries its own rule ABOVE it (see .neigh), so what separates two of
   them is the LOWER one's border-top. Connectivity was the one section without one, because it is
   an <a> toggle rather than an rv-panel -- which is why the block above it looked unfinished. The
   rule goes here, where it was missing, rather than doubled onto the neighbours above: every
   section then has exactly one, and the rhythm is unbroken down the panel.
   :not(:empty) because this div is empty until renderConnectivityToggle fills it, and a border on
   an empty div is a grey line with nothing under it on every cell that never builds one. */
#connPanel:not(:empty){margin-top:16px;border-top:1px solid var(--line);padding-top:12px}''',
     "...and Connectivity gets the rule it was the only one missing"),
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
