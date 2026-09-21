# -*- coding: utf-8 -*-
u"""λJump: "Browse a cell" lists the cells the community added.                       2026-09-21

Søren: "why do the cell registered as new by community not show in the list?" Four added cells
(three astrocytes, a microglia) were in the nucleus arrays and identified -- Filter and show counted
them -- but "Browse a cell" is built by populateRandomTypeSelect() at load, before the added cells
arrive, and absorbAddedNuclei() only told the filter dropdown that the range had moved. So the
list showed the detections' identities alone, and "484 cells nobody has identified yet" was
488 detections minus four, never counting the four added.

absorbAddedNuclei() now rebuilds "Browse a cell" too. Check: ljaddedcheck.js.

Run: python3 src/ljump_browse_lists_the_added_cells.py, then python3 src/build_stamps.py
"""
import io, os
P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ljump.html")
s = io.open(P, encoding="utf-8").read()
OLD = u'''  try{ if(typeof window.__ljumpBuildIdentityDropdown==="function")window.__ljumpBuildIdentityDropdown(); }catch(_e){}
}'''
NEW = u'''  try{ if(typeof window.__ljumpBuildIdentityDropdown==="function")window.__ljumpBuildIdentityDropdown(); }catch(_e){}
  /* ...and so does "Browse a cell" (2026-09-21): it was built once, before the added cells came,
     so a cell the community added was never in it. */
  try{ if(typeof populateRandomTypeSelect==="function")populateRandomTypeSelect(); }catch(_e2){}
}'''
if NEW in s: print("already there")
else:
    assert s.count(OLD) == 1
    s = s.replace(OLD, NEW, 1); io.open(P, "w", encoding="utf-8").write(s); print("ok: Browse a cell is rebuilt with the added cells")
