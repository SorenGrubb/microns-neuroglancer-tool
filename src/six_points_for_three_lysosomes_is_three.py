# -*- coding: utf-8 -*-
u"""Six points for three lysosomes is three lysosomes.                           2026-09-19

Søren, with the panel still in front of him: *"it has not been fixed that it says there are 6x
lysosomes, when there are only really 3."*

He is right, and the fix so far was in the wrong two places. Yesterday's work stopped the PAGE from
sending a second centre (src/a_centre_is_registered_once.py) and stopped the BACKEND from keeping
one (backend/src_one_centre_per_tracing.py). Both are about rows written from now on. Neither says
anything about the six rows already in his sheet, so the panel reads six and says six -- and it
would go on saying six until he ran tidyTracingCentres by hand.

THE PANEL SHOULD READ THE SHEET THE WAY THE BACKEND NOW WRITES IT. `fromStructureId` names the
outline a centre was computed from. One outline, one centre: two rows carrying the same
fromStructureId are not two organelles and never were -- they are the same organelle's centre
written down twice, and the later one supersedes. That is exactly the rule the backend enforces on
new writes, and applying it on the way in costs nothing and makes the housekeeping optional rather
than required.

WHAT IT DOES NOT TOUCH. fromStructureId is blank on every hand-placed annotation and on every row
written before 2026-09-18, so nothing collapses that was not written by this one feature. Two
people who independently place a point on the same lysosome by eye stay two points, which is the
whole purpose of counting them: agreement is the measurement.

THE SECTION HEADER CHANGES WITH IT, from "3 outlined, 6 logged, 3 paired" to "3 outlined, 3 logged,
3 paired", because both lists come through the same door now. A header that counts rows while the
line above it counts organelles is the disagreement this is removing, not a second opinion worth
keeping.

Run: python3 src/six_points_for_three_lysosomes_is_three.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HELPER = [
    (u'''function organelleCountParts(structs){''',
     u'''/* ── ONE LOGGED POINT PER ORGANELLE, NOT ONE PER ROW ────────────────  2026-09-19
   Søren: *"it has not been fixed that it says there are 6x lysosomes, when there are only really
   3."* Three outlines, each of which had registered its centre twice, counted as six organelles.

   `fromStructureId` names the outline a centre was computed from, so two rows carrying the same one
   are the same organelle written down twice and the later supersedes -- which is the rule the
   backend now enforces on new writes. Applied here as well, the old rows in the sheet stop being
   counted twice without anybody having to tidy them first.

   BLANK IS NOT A KEY. Hand-placed annotations and everything written before 2026-09-18 carry no
   fromStructureId, and they are all kept: two people pointing at the same lysosome by eye are two
   opinions, and agreeing is the measurement. Only rows this one feature wrote can collapse.

   THE LAST ONE WINS, because the sheet is append-only and the newest row is the current answer --
   the same rule as centreRowFor_ at the other end. */
function organelleOwnStructs(groups){
  var out = [], at = {};
  (groups || []).forEach(function(g){
    ((g && g.structures) || []).forEach(function(s){
      if (!s) return;
      var one = { kind: s.kind, pointA: s.pointA || "", pointB: s.pointB || "",
                  comment: s.comment || (g && g.comment) || "",
                  source: s.source || "",
                  fromStructureId: String(s.fromStructureId || ""),
                  by: s.by || (g && g.by) || "" };
      var key = one.fromStructureId;
      if (key && at[key] !== undefined){ out[at[key]] = one; return; }
      if (key) at[key] = out.length;
      out.push(one);
    });
  });
  return out;
}
function organelleCountParts(structs){''',
     "two centres of one outline are one organelle"),
]

ANNS = [
    (u'''        PANEL_ORGAN_ANNS=[].concat(...organelleGroups.map(g=>(g.structures||[]).map(s=>({
          kind:s.kind,pointA:s.pointA,pointB:s.pointB,
          /* fromSegmentation: set on a point the tracing card registered from an outline's own
             centre. Blank on every row written before 2026-09-18 and on every hand-placed one,
             which is exactly what it means. */
          fromSegmentation:!!(s.source&&/segment/i.test(String(s.source))),
          by:s.by||""}))));''',
     u'''        /* Through organelleOwnStructs since 2026-09-19, so the section's "N logged" counts
           organelles and not rows -- the same list, read the same way, as the line above it. */
        PANEL_ORGAN_ANNS=organelleOwnStructs(organelleGroups).map(function(s){
          return {kind:s.kind,pointA:s.pointA,pointB:s.pointB,
          /* fromSegmentation: set on a point the tracing card registered from an outline's own
             centre. Blank on every row written before 2026-09-18 and on every hand-placed one,
             which is exactly what it means. */
                  fromSegmentation:!!(s.source&&/segment/i.test(String(s.source))),
                  fromStructureId:s.fromStructureId||"",
                  by:s.by||""};
        });''',
     "...and the Organelles section counts them that way too"),
]

SUMMARY = [
    (u'''        const allStructs=[].concat(...organelleGroups.map(g=>(g.structures||[]).map(s=>({
          kind:s.kind,pointA:s.pointA,pointB:s.pointB,
          comment:s.comment||g.comment||"",source:s.source||"",by:s.by||g.by||""}))));
        const parts=organelleCountParts(allStructs);''',
     u'''        /* The comment travels WITH its structure -- it is what the row reads its name and
           size out of -- and two rows for one outline arrive as one, so "6× lysosome" for three
           lysosomes is no longer sayable. See organelleOwnStructs. */
        const allStructs=organelleOwnStructs(organelleGroups);
        const parts=organelleCountParts(allStructs);''',
     "the summary line counts organelles"),
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


edit("core/panel.js", HELPER + ANNS + SUMMARY)
print("\nnow: node organcountcheck.js && node organcardcheck.js && node ccpanelcheck.js "
      "&& python3 src/build_stamps.py")
