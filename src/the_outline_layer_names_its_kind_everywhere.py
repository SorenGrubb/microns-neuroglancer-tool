# -*- coding: utf-8 -*-
u"""The traced-outline layer is named the same on a page without core/ontology.js.   2026-09-21

core/tracedoutlines.js names each layer from ORGANELLE_KIND_BY_VALUE, which core/ontology.js
defines. χJump builds its vocabulary into UJ.organelleData instead and has no such global, so its
layer read "traced mitochondria" -- the raw value -- where every other tool reads "traced
mitochondrion". core/organelles.js's shortOf() reads the same vocabulary on every page, so it is
the fallback. Pages that have ORGANELLE_KIND_BY_VALUE are unchanged.

Run: python3 src/the_outline_layer_names_its_kind_everywhere.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(HERE, "core", "tracedoutlines.js")
s = io.open(p, encoding="utf-8").read()
OLD = u"ORGANELLE_KIND_BY_VALUE[k].label||k):k;"
NEW = u"ORGANELLE_KIND_BY_VALUE[k].label||k):tracedOutlinesKindName(k);"
FN = u'''/* A kind's short name where the page has no ORGANELLE_KIND_BY_VALUE (χJump), from the same
   vocabulary through core/organelles.js. 2026-09-21. */
function tracedOutlinesKindName(k){
  try { if (window.UJ && UJ.organelles && UJ.organelles.shortOf) return UJ.organelles.shortOf(k); }
  catch (_e){}
  return k;
}
'''
if NEW in s: print("already there")
else:
    assert s.count(OLD) == 2, s.count(OLD)
    s = s.replace(OLD, NEW)
    ANCH = u"var UJ = UJ || {};\n"
    assert s.count(ANCH) == 1
    s = s.replace(ANCH, ANCH + FN, 1)
    io.open(p, "w", encoding="utf-8").write(s); print("core/tracedoutlines.js: both names from the vocabulary")
