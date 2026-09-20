# -*- coding: utf-8 -*-
u"""The history fold is styled everywhere.                                       2026-09-20

Found while planning the port to the other tools: `.chist-panel>summary>h4{margin:0}` was added to
ujump.html on 2026-09-20 -- and the fold it styles was added to `core/panel.js`, which all five
panel tools load.

SO FOUR TOOLS HAVE BEEN RENDERING IT UNSTYLED since that push. The <h4> keeps its 8px bottom margin
inside the <summary>, which pushes the rotating triangle off the heading's baseline: the feature
works, and looks like a mistake. dJump, pJump, lJump and bJump all show it; hJump does not load
panel.js and renders its history another way, but it carries the same .chist-panel block, so it
gets the line too rather than being the one page where a shared rule is missing.

THIS IS THE SHAPE OF THE WHOLE PORT, IN ONE LINE. A change that lives in core/ reaches five tools
the moment it is pushed; the CSS it needs does not, because every page carries its own copy of the
stylesheet. Anything ported from here on has to move both halves or it arrives broken on arrival.

Run: python3 src/the_history_fold_is_styled_everywhere.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ANCHOR = u'''.chist-panel h4{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:0 0 8px}'''
RULE = u'''
/* The history is a <details> since 2026-09-20 (core/panel.js's renderCellHistory) and its <h4>
   lives in the <summary>, where the margin below it would push the triangle off the text's
   baseline. The fold ships in core/ and reaches every tool at once; this line has to travel with
   it, because each page carries its own copy of the stylesheet. */
.chist-panel>summary>h4{margin:0}'''

PAGES = ["djump.html", "pjump.html", "ljump.html", "bjump.html", "hjump.html"]

for page in PAGES:
    p = os.path.join(HERE, page)
    if not os.path.exists(p):
        print("  " + page + ": not here, skipped")
        continue
    s = io.open(p, encoding="utf-8").read()
    if ".chist-panel>summary>h4" in s:
        print("  already there: " + page)
        continue
    assert s.count(ANCHOR) == 1, "%s: anchor found %d times" % (page, s.count(ANCHOR))
    io.open(p, "w", encoding="utf-8").write(s.replace(ANCHOR, ANCHOR + RULE, 1))
    print("  ok: " + page)

print("\nnow: python3 src/build_stamps.py && node stampcheck.js && node chistfoldcheck.js")
