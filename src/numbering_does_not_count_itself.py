# -*- coding: utf-8 -*-
u"""The numbering does not count the structure being saved.                             2026-09-27

Found by tracingpanelcheck.js, five assertions red, minutes after
src/a_cells_organelles_of_a_kind_are_numbered.py went in. Two consequences of one oversight.

THE COUNT INCLUDED THE THING BEING COUNTED. tracingNextIndex now counts how many of a kind the cell
HAS — the published index plus what this browser has kept. A RE-ADD of a structure is in that kept
list already, so it counted itself: one kept "second tracing" answered 2, `first[k] > 1` was true,
and a lone hand-named structure came back "second tracing 2". A lone nucleus came back "Nucleus 2".
The ids on the pad are excluded now, because a structure is not its own sibling.

AND THE PRIOR LOOKUP MATCHED ON THE EXACT NAME. tracingCurrentAll finds the structure a re-add is a
version of by `x.name === label`, where label is the BARE name from the form and x.name is whatever
was kept. Numbered names broke it: "second tracing" did not match "second tracing 2", so a re-add
minted a fresh id and the kept list grew a twin — the very failure
src/a_second_cell_does_not_take_the_first_ones_id.py exists to prevent, arriving from the other
direction. It compares series labels now, which is the same comparison tracingNextIndex and
tracingBareOf already use for a series: "Lysosome 3" and "Lysosome" are one series, and the cell
test is what separates two cells.

WHY THE CHECK CAUGHT IT AND I DID NOT: organellenumberingcheck.js was written for the new rule and
passed on its own. The regressions were in the suite for the OLD one, whose fixtures re-add a
structure — which is the case the new rule mishandled. Writing the new check first is not a
substitute for running the old ones.

Check: tracingpanelcheck.js (5 red), and organellenumberingcheck.js and reopenedtracingcheck.js
stay green.
Run: python3 src/numbering_does_not_count_itself.py, then python3 src/build_stamps.py,
then python3 wjump-build/build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracingcard.js", [
 (u"the count can be told what not to count",
  u"""function tracingNextIndex(kind, label, nuc, root){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  var top = 0, have = 0, seen = {};""",
  u"""/* `skip` is the ids on the pad. A structure is not its own sibling: a re-add is in TRACINGS_KEPT
   already, so without this it counted itself and a lone hand-named structure came back "second
   tracing 2". Found by tracingpanelcheck.js; see src/numbering_does_not_count_itself.py. */
function tracingNextIndex(kind, label, nuc, root, skip){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  var top = 0, have = 0, seen = {};
  (skip || []).forEach(function(id){ if (id) seen[String(id)] = 1; });"""),

 (u"...and the published scan honours it",
  u"""    if (same && sameCell){
      have++;
      seen[String(t.structureId || "")] = 1;""",
  u"""    if (same && sameCell){
      if (seen[String(t.structureId || "")]) return;      // on the pad: counted by the caller
      have++;
      seen[String(t.structureId || "")] = 1;"""),

 (u"...and so does the kept scan",
  u"""  (TRACINGS_KEPT || []).forEach(function(t){
    if (!t || !t.id || seen[String(t.id)]) return;""",
  u"""  (TRACINGS_KEPT || []).forEach(function(t){
    if (!t || !t.id || seen[String(t.id)]) return;        // already counted, or on the pad"""),

 (u"...and the caller says what is on the pad",
  u"""    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid);
  });""",
  u"""    /* ITS OWN ID AND NOTHING ELSE'S (2026-09-27). Skipping every id on the pad was wrong the
       other way: the siblings OPENED beside a new structure are real siblings and must be counted,
       and only the structure asking must not count itself. Both halves were caught by a check —
       tracingpanelcheck for the self-count, reopenedtracingcheck for the over-skip. */
    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid,[idOf(g)]);
  });"""),

 (u"the count is only meaningful where a cell has many",
  u"""  return Math.max(top, have) + 1;""",
  u"""  /* THE COUNT IS ONLY MEANINGFUL FOR A KIND A CELL HAS MANY OF (2026-09-27). A cell has one
     nucleus, so counting nuclei and answering 2 made a lone nucleus "Nucleus 2" — and under
     `other` the same count inflated a hand-named singleton. Those keep the old answer: one more
     than the highest number actually carried. Found by tracingpanelcheck.js. */
  return (tracingKindNumbered(wantK) ? Math.max(top, have) : top) + 1;"""),

 (u"a version is found by its series, not by its exact name",
  u"""    const prior=oneEach?(TRACINGS_KEPT||[]).filter(function(x){
      return x&&x.id&&x.name===label&&sameCell(x);
    })[0]:null;""",
  u"""    /* BY SERIES, NOT BY THE EXACT NAME (2026-09-27). This compared x.name === label, where label
       is the BARE name from the form — so once names carry numbers, "second tracing" no longer
       matched the kept "second tracing 2", a re-add minted a fresh id, and the kept list grew a
       twin. That is the failure src/a_second_cell_does_not_take_the_first_ones_id.py exists to
       prevent, arriving from the other direction. tracingSeriesLabel is the comparison
       tracingNextIndex and tracingBareOf already use for a series; the cell test below is what
       separates two cells. See src/numbering_does_not_count_itself.py. */
    const wantSeries=tracingSeriesLabel(label);
    const prior=oneEach?(TRACINGS_KEPT||[]).filter(function(x){
      return x&&x.id&&tracingSeriesLabel(x.name)===wantSeries&&sameCell(x);
    })[0]:null;"""),
])
print("\nNow: python3 src/build_stamps.py, then python3 wjump-build/build_wjump.py")
