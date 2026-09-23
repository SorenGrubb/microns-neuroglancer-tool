# -*- coding: utf-8 -*-
u"""The pad's tip bar uses a token that exists.                                          2026-09-23

Caught by refusedsavecheck.js, whose last section walks every var(--...) in the served page and
asserts the theme defines it: "every token used is defined in the dark theme <- card".

src/the_pad_gives_tips.py (2026-09-22) gave the tip bar background:var(--card). There is no --card
token -- the surface colour in these pages is --panel -- so the bar had NO background at all in
either theme, and the tips sat straight on the EM. It is --panel now, which is what every other
strip on the card uses.

Not today's bug and not the one being worked on, but mine, and the check found it while the
re-share work was being run past it. Fixing it there and then is cheaper than writing it down.

Run: python3 src/the_tip_bar_has_a_colour.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "core/tracingcard.js")
s = io.open(P, encoding="utf-8").read()
OLD = u'''background:var(--card);color:var(--ink);border-bottom:1px solid var(--line)'''
NEW = u'''background:var(--panel);color:var(--ink);border-bottom:1px solid var(--line)'''
if NEW in s: print("  already there: the tip bar has a colour")
else:
    assert s.count(OLD) == 1, "tip bar: %d" % s.count(OLD)
    io.open(P, "w", encoding="utf-8").write(s.replace(OLD, NEW, 1))
    print("  ok: the tip bar has a colour")
