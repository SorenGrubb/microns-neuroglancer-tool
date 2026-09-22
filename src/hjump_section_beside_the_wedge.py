# -*- coding: utf-8 -*-
u"""ηJump: the EM section beside the layer wedge, the IDs below both.                  2026-09-21

Søren: "I would prefer the EM next to the model and the other things below, like for the other
tools." The section sat under the wedge in a left column with the IDs beside them. Now the wedge and
the section share a row, as on µJump, δJump and πJump, and the IDs and everything after them run
full width underneath. Check: hjlayoutcheck.js.

Run: python3 src/hjump_section_beside_the_wedge.py, then python3 src/build_stamps.py
"""
import io, os
P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "hjump.html")
s = io.open(P, encoding="utf-8").read()
OLD = u'''    +'<div style="flex:1 1 260px;min-width:220px">'+layerDiagram(HX[i],HY[i],volLayer(i))
    +emPlaneBox(pos, seg, UJ.cfg.viewer.seg)+'</div>'
    +'<div style="flex:2 1 260px;min-width:240px">';'''
NEW = u'''    /* SIDE BY SIDE, 2026-09-21 -- Søren: "I would prefer the EM next to the model and the other
       things below, like for the other tools." The wedge and the section share this row; the IDs
       and the rest run full width underneath (the two closing tags below are unchanged). */
    +'<div style="flex:1 1 220px;min-width:200px">'+layerDiagram(HX[i],HY[i],volLayer(i))+'</div>'
    +'<div style="flex:0 1 300px;min-width:220px">'+emPlaneBox(pos, seg, UJ.cfg.viewer.seg)+'</div>'
    +'</div><div style="margin-top:6px"><div>';'''
if NEW in s: print("already there")
else:
    assert s.count(OLD) == 1
    s = s.replace(OLD, NEW, 1); io.open(P, "w", encoding="utf-8").write(s); print("ok: the section beside the wedge")
