# -*- coding: utf-8 -*-
u"""πJump: the EM section sits beside the top view, not under it.                      2026-09-21

Søren, with a screenshot of the live page: "These could be next to each other". pinky100 has no
layer diagram (it is one Layer 2/3 block), so the column δJump's layout puts the section under was
the only column: a centred top view with the section alone below it and half the card empty.

Each figure is now its own flex item -- layer diagram (where there is one), top view, section --
so they sit side by side and wrap only when the card is too narrow for both.

Run: python3 src/pjump_section_beside_the_top_view.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "pjump.html")
OLD = u'''  /* The EM section goes under the top view (2026-09-21), as on δJump. */
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">'
    +(layerSvg?'<div style="flex:1 1 200px;min-width:180px">'+layerSvg+'</div>':'')
    +((topSvg||under)?'<div style="flex:1 1 200px;min-width:180px">'+topSvg+under+'</div>':'')
    +'</div>';'''
NEW = u'''  /* SIDE BY SIDE, 2026-09-21. Søren: "These could be next to each other". pinky100 has no layer
     diagram, so stacking the section under the top view (δJump's layout) left it alone in one
     column. Each figure is its own item now, and they wrap only on a narrow card. */
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">'
    +(layerSvg?'<div style="flex:1 1 200px;min-width:180px">'+layerSvg+'</div>':'')
    +(topSvg?'<div style="flex:1 1 200px;min-width:180px">'+topSvg+'</div>':'')
    +(under?'<div style="flex:0 1 260px;min-width:200px">'+under+'</div>':'')
    +'</div>';'''
s = io.open(P, encoding="utf-8").read()
if NEW in s: print("already there")
else:
    assert s.count(OLD) == 1
    s = s.replace(OLD, NEW, 1); io.open(P, "w", encoding="utf-8").write(s); print("ok: side by side")
