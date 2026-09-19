# -*- coding: utf-8 -*-
u"""An older row keeps its id in `source`.                                       2026-09-19

Søren, after hard-refreshing repeatedly and then deleting rows by hand: *"I have pressed ctrl+shift+R
many times, it does not update"* and *"I even deleted the duplicates from the Google Drive and
removed them from the google sheet, they still show"*.

THE PAGE WAS FINE AND SO WAS THE PUSH. Asked for his own cell, the deployed backend answers:

    295844,151391,17862  source=lysosome_1789846306269           fromStructureId=
    295844,151391,17862  source=lysosome_1789846306269           fromStructureId=
    295974,151346,17838  source=lysosome_1789846306269__i1       fromStructureId=
    295974,151346,17838  source=lysosome_1789846306269__i1       fromStructureId=
    295812,151370,17901  source=lysosome_1789846306269__i1__i2   fromStructureId=
    295813,151358,17899  source=lysosome_1789846306269__i1__i2   fromStructureId=

The id of the outline each centre was computed from is RIGHT THERE, in `source`, which is where this
feature first put it. `source` was later repurposed to say what KIND of source a point has --
"segmentation" rather than a hand -- and `fromStructureId` was added to carry the id. His six rows
predate that split, so the new count keyed on a column that is empty for every one of them and
collapsed nothing.

SO IT READS EITHER. A value in `source` that is not one of the source WORDS and has the shape of one
of our ids IS one, and is used as the key. Stated as a shape rather than a guess: our ids are a
slug, an underscore, a millisecond timestamp, and optionally `__iN` suffixes -- nothing that could
be confused with "segmentation" or "hand".

IT ALSO FIXES THE OTHER HALF OF HIS SCREENSHOT. `fromSegmentation` was tested as
`/segment/i.test(source)`, so these rows read as hand-placed: the panel listed all six as "logged,
not outlined" beside three outlines it refused to pair them with. A row whose source is an id came
from an outline by definition, and now says so.

AND IT IS WHY DELETING THEM DID NOT HELP. tidyTracingCentres() matches on fromStructureId too, so it
would have reported nothing to tidy; whatever he deleted was not these rows, which the live endpoint
still returns. After this, nothing needs deleting at all.

Run: python3 src/an_older_row_keeps_its_id_in_source.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

READER = [
    (u'''function organelleOwnStructs(groups){''',
     u'''/* ── WHICH OUTLINE A LOGGED POINT CAME FROM ────────────────────────  2026-09-19
   Two columns have carried this, and Søren's own six rows are in the older one. `source` held the
   outline's id when the feature was first written; it was then repurposed to say what KIND of
   source a point has -- "segmentation" as against somebody's eye -- and `fromStructureId` was added
   for the id. Rows written in between keep the id in `source` and nothing in `fromStructureId`.

   A SHAPE, NOT A GUESS. Our ids are a slug, an underscore, a millisecond timestamp and optionally
   `__iN` suffixes. "segmentation" and "hand" cannot match that, and neither can a blank. So a
   `source` that looks like an id is read as one, and anything else is left alone. */
function organelleFromId(s){
  var f = String((s && s.fromStructureId) || "");
  if (f) return f;
  var src = String((s && s.source) || "");
  return /^[A-Za-z0-9-]+_\\d{6,}(__i\\d+)*$/.test(src) ? src : "";
}
/* And a point whose source is an id came FROM an outline, whatever the word in the column says --
   which is what decides whether an outline supersedes it or the panel lists them side by side. */
function organelleIsFromOutline(s){
  var src = String((s && s.source) || "");
  return !!(/segment/i.test(src) || organelleFromId(s));
}
function organelleOwnStructs(groups){''',
     "an id in the older column is still an id"),

    (u'''                  fromStructureId: String(s.fromStructureId || ""),
                  by: s.by || (g && g.by) || "" };
      var key = one.fromStructureId;''',
     u'''                  fromStructureId: organelleFromId(s),
                  by: s.by || (g && g.by) || "" };
      var key = one.fromStructureId;''',
     "...so two of his rows are one lysosome"),
]

SEGMENTED = [
    (u'''                  fromSegmentation:!!(s.source&&/segment/i.test(String(s.source))),
                  fromStructureId:s.fromStructureId||"",''',
     u'''                  /* Either column, since 2026-09-19: a point whose `source` is a structure id
                     came from an outline, and reading only the word listed Søren's six centres as
                     hand-placed beside the three outlines they were computed from. */
                  fromSegmentation:organelleIsFromOutline(s),
                  fromStructureId:s.fromStructureId||"",''',
     "...and came from an outline rather than from somebody's eye"),
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


edit("core/panel.js", READER + SEGMENTED)
print("\nnow: node organcountcheck.js && node organjumpcheck.js && node ccpanelcheck.js "
      "&& python3 src/build_stamps.py")
