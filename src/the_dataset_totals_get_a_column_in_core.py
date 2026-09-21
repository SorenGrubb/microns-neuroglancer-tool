# -*- coding: utf-8 -*-
u"""The "Across all datasets" grid moves into core/gamify.js.                         2026-09-21

src/the_dataset_totals_get_a_column.py (2026-09-19) fixed Søren's *"looked good on a phone, but
looks bad on a computer screen"* in wjump.html and wjump_demo.html -- in their INLINED copies of
core/gamify.js. core/gamify.js itself kept the inline-blocks, so every tool that loads it by tag
still shows "MICrONS minnie65 1488ηJump — H01 human cortex 5βJump ..." on a laptop, and ωJump's next
rebuild (which inlines core/gamify.js) would have put the bug back there too.

profileTotalsHtml is read out of the served wjump.html whole and replaces core's.

Run: python3 src/the_dataset_totals_get_a_column_in_core.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def fn(s, start=u"function profileTotalsHtml(t){"):
    i = s.index(start)
    j = s.index(u"\n}\n", i) + 3
    return s[i:j]

served = io.open(os.path.join(HERE, "wjump.html"), encoding="utf-8").read()
NEW = fn(served)
assert u"A GRID, NOT A HOPE" in NEW and u"grid-template-columns" in NEW
p = os.path.join(HERE, "core", "gamify.js")
s = io.open(p, encoding="utf-8").read()
OLD = fn(s)
if OLD == NEW:
    print("core/gamify.js: already there")
else:
    assert u"inline-block;min-width:150px" in OLD
    s = s.replace(OLD, NEW, 1)
    io.open(p, "w", encoding="utf-8").write(s)
    print("core/gamify.js: profileTotalsHtml is the grid")
