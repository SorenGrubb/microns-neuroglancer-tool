# -*- coding: utf-8 -*-
u"""The dataset totals get a column.                                             2026-09-19

Søren, on the "Across all datasets" block: *"This looked good on a phone, but looks bad on a
computer screen."*

WHAT HE IS LOOKING AT, in his own screenshot:

    µJump — MICrONS minnie65 1488ηJump — H01 human cortex 5βJump — Alzheimer's vCLEM CA1 136

`1488ηJump`. Eight datasets, each `<span style="display:inline-block;min-width:150px">`, joined with
nothing at all.

WHY IT LOOKED RIGHT ON A PHONE AND WRONG ON A LAPTOP, which is the whole of the bug: at 360 px every
one of those spans is wider than the line, so each takes a line of its own and the list reads like a
list. At 900 px three or four fit on a line, with no separator between them and nothing lining up --
and a label that happens to be shorter than 150 px puts the next dataset's name hard against the
previous one's number. The layout was never a layout; it was one width happening to wrap well.

A GRID INSTEAD OF A MIN-WIDTH. `repeat(auto-fill, minmax(240px, 1fr))` is one column on a phone
(unchanged from what he liked), two or three on a laptop, and each cell is a flex row with the name
on the left and the points on the right -- so the numbers line up down each column instead of
floating wherever the name happened to end. Tabular figures so 1488 and 136 share a decimal grid,
and `gap` doing the separating rather than a hope about widths.

Nothing wraps into an ellipsis: "χJump — cb2 cerebellum (fragment assembly)" is a long name and
truncating it would lose the one thing the row is for. The cell grows to two lines instead, and the
grid's rows size themselves.

wjump_demo.html carries its own copy of the block, so it is edited too -- the demo is what people
see before they have an account, and a demo that looks broken is worse than no demo.

Run: python3 src/the_dataset_totals_get_a_column.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    (u'''  var per=perList(t).map(function(p){
    return '<span style="display:inline-block;min-width:150px">'+escHtml(p.label||p.ds)+' <b>'+pointsText(p.points)+'</b></span>';
  }).join("");''',
     u'''  /* ── A GRID, NOT A HOPE ABOUT WIDTHS ────────────────────────────────────────────  2026-09-19
     Søren: *"This looked good on a phone, but looks bad on a computer screen."* These were
     inline-blocks with min-width:150px and NO separator, which is a list only while every one of
     them is wider than the line — true at 360 px, false on a laptop, where it came out as
     "MICrONS minnie65 1488ηJump — H01 human cortex 5βJump — ...".
     One column on a phone, two or three on a laptop, the name left and the points right in every
     cell so the numbers line up down the column. Names are allowed to wrap rather than be cut:
     "χJump — cb2 cerebellum (fragment assembly)" is exactly the kind of thing an ellipsis eats. */
  var per=perList(t).map(function(p){
    return '<div style="display:flex;gap:10px;align-items:baseline;min-width:0">'
      +'<span style="flex:1 1 auto;min-width:0">'+escHtml(p.label||p.ds)+'</span>'
      +'<b style="flex:0 0 auto;font-variant-numeric:tabular-nums">'+pointsText(p.points)+'</b>'
      +'</div>';
  }).join("");''',
     "each dataset is a row of its own, name left and points right"),

    (u'''    +'<div style="font-size:12px;color:var(--mut,#8b949e);margin-top:4px">'+per+'</div>' ''' .rstrip(),
     u'''    +'<div style="font-size:12px;color:var(--mut,#8b949e);margin-top:6px;display:grid;'
      +'grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:3px 22px">'+per+'</div>' ''' .rstrip(),
     "...in a grid that gives it one column on a phone and several on a screen"),
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


for page in ("wjump.html", "wjump_demo.html"):
    edit(page, PAIRS)
print("\nnow: node profiletotalscheck.js && python3 src/build_stamps.py")
