# -*- coding: utf-8 -*-
u"""The measurements go into the sheet.                                                  2026-09-30

Søren: *"But where are they in the Google sheets? I would like that these numbers are saved there,
so we can do graphs with them."*

They were nowhere, and that was a decision of mine rather than an oversight: everything was
computed from the contours on each read, which meant all 68 existing tracings had the numbers the
day the feature shipped. It also meant nothing was stored, so there was nothing to graph from —
and graphing is the point.

ONE COMPUTATION, TWO NAMES FOR IT. The numbers already exist, once, in tracedShapeRows(). This
does NOT recompute them for the sheet; it maps that one result onto sheet column names through
TRACED_SHEET_FIELDS, a single table where the Excel header and the sheet column meet. This project
has been bitten four times by the same shape of bug — a value decided by one expression and
matched by a second that drifted from it (celltypeLink's argument order, the notebook's tracings,
the pool rule, the organelle numbering). A second measurement pass written for the sheet would be
the fifth. The map is the only place the two vocabularies touch, and it is a list, so a column
without a source or a source without a column is visible on one screen.

WHAT CAN GO STALE, AND WHY IT IS STORED ANYWAY. Most of the numbers are intrinsic to one outline —
shape, size, centroid — and can never be wrong later. Three are relational: the nearest organelle,
its surface distance, its centroid distance. Those change the moment somebody traces another
organelle in the same cell, so a stored value is only true as of when it was written. Dropping
them from the sheet would answer that by making the interesting comparison impossible; instead
every row carries `measuredAt` and `measuredSiblings` — the number of organelles that cell had
when the row was measured — so a row measured against three siblings is visibly not a row measured
against eleven, and the re-measure button brings it up to date.

TWO WAYS IN. A tracing submitted from now on carries its measurements with it, the way the volume
already does. Everything traced before today needs a backfill, which is one button: measure every
outline in the dataset and post them in a single batch, against the `traced_measurements` branch
this adds to Code.gs — a branch that touches only the measurement columns, never the Drive file,
the version count or the credit.

Check: organellesheetcheck.js (the sheet-field map), gs_harness_measurements.js (the backend).
Run: python3 src/the_measurements_go_into_the_sheet.py, then python3 src/build_stamps.py,
then, from inside wjump-build/, python3 build_wjump.py
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


SHEET = u'''
/* ── THE SAME NUMBERS, UNDER THE SHEET'S NAMES ───────────────────────────────────  2026-09-30
   Søren: "I would like that these numbers are saved there, so we can do graphs with them."

   NOT A SECOND MEASUREMENT PASS. tracedShapeRows() above computes everything once; this maps that
   result onto column names for the Google Sheet. The map is the only place the Excel header and
   the sheet column meet, which is the point — this project's recurring bug is a value decided by
   one expression and matched by a second that drifted from it, and a measurement pass written
   separately for the sheet would be the next one.

   Left column: the Excel header tracedShapeRows produces. Right: the sheet column Code.gs writes.
   A header without a column, or a column without a header, shows up here on one screen.

   "Sections" IS NOT HERE, DELIBERATELY. The sheet already has a `sections` column, counted in
   Code.gs from the contours it was posted. Mapping the Excel header onto it would make one number
   with two authors, which is this project's recurring bug in miniature — so the backend keeps the
   one it computes and this map stays disjoint from the columns the row already owns. */
var TRACED_SHEET_FIELDS = [
  ["Area at widest section (\\u00b5m\\u00b2)",   "widestAreaUm2"],
  ["Perimeter at widest section (\\u00b5m)",     "perimeterUm"],
  ["Circularity (widest)",               "circularity"],
  ["Aspect ratio (widest)",              "aspectRatio"],
  ["Roundness (widest)",                 "roundness"],
  ["Solidity (widest)",                  "solidity"],
  ["Major axis (\\u00b5m)",                      "majorAxisUm"],
  ["Minor axis (\\u00b5m)",                      "minorAxisUm"],
  ["Circularity (median)",               "circularityMedian"],
  ["Aspect ratio (median)",              "aspectRatioMedian"],
  ["Roundness (median)",                 "roundnessMedian"],
  ["Solidity (median)",                  "solidityMedian"],
  ["Sphericity (Wadell)",                "sphericityWadell"],
  ["Sphericity (MorphoLibJ, 36\\u03c0V\\u00b2/S\\u00b3)", "sphericityMorphoLibJ"],
  ["Elongation (3D)",                    "elongation3d"],
  ["Flatness (3D)",                      "flatness3d"],
  ["Solidity (3D)",                      "solidity3d"],
  ["Mesh volume (\\u00b5m\\u00b3)",              "meshVolumeUm3"],
  ["Mesh surface area (\\u00b5m\\u00b2)",        "meshSurfaceUm2"],
  ["Centroid X (voxel)",                 "centroidX"],
  ["Centroid Y (voxel)",                 "centroidY"],
  ["Centroid Z (voxel)",                 "centroidZ"],
  ["Distance to nucleus centroid (\\u00b5m)",    "distNucleusCentroidUm"],
  ["Nucleus centroid from",              "nucleusCentroidFrom"],
  ["Distance to nucleus surface (\\u00b5m)",     "distNucleusSurfaceUm"],
  ["Nearest organelle (by surface)",     "nearestBySurface"],
  ["Distance to its surface (\\u00b5m)",         "distNearestSurfaceUm"],
  ["Distance to its centroid (\\u00b5m)",        "distNearestPairCentroidUm"],
  ["Nearest organelle (by centroid)",    "nearestByCentroid"],
  ["Distance to that centroid (\\u00b5m)",       "distNearestCentroidUm"]
];

/* tracedMeasurements(tracings, opts) -> [{structureId, ...the columns above, measuredAt,
   measuredSiblings}], ready to post. `measuredSiblings` is how many OTHER organelles of that cell
   were in this measurement — the three relational numbers are only true against that set, and a
   row measured against three siblings is a different claim from one measured against eleven. */
function tracedMeasurements(tracings, opts){
  var rows = tracedShapeRows(tracings, opts) || [];
  var when = new Date().toISOString();
  /* Counted from the rows themselves, by the same cell rule and the same "what may be a
     neighbour" rule the distances used, so the number cannot describe a different set. */
  var sibs = {};
  rows.forEach(function(r){
    var k = String(r["Kind"] || "").toLowerCase();
    if (k === "cell" || k === "nucleus") return;
    var key = String(r["Nucleus ID"] || "") + "|" + String(r["Root ID"] || "");
    sibs[key] = (sibs[key] || 0) + 1;
  });
  return rows.filter(function(r){ return r["Structure ID"]; }).map(function(r){
    var key = String(r["Nucleus ID"] || "") + "|" + String(r["Root ID"] || "");
    var kind = String(r["Kind"] || "").toLowerCase();
    var mine = sibs[key] || 0;
    var m = { structureId: r["Structure ID"] };
    TRACED_SHEET_FIELDS.forEach(function(p){ m[p[1]] = r[p[0]]; });
    m.measuredAt = when;
    m.measuredSiblings = (kind === "cell" || kind === "nucleus") ? mine : Math.max(0, mine - 1);
    return m;
  });
}
window.tracedMeasurements = tracedMeasurements;
window.TRACED_SHEET_FIELDS = TRACED_SHEET_FIELDS;
'''

edit("core/tracedoutlines.js", [
 (u"the same numbers under the sheet's names",
  u"window.tracedShapeRows = tracedShapeRows;\nwindow.TRACED_SHAPE_COLUMNS = TRACED_SHAPE_COLUMNS;",
  u"window.tracedShapeRows = tracedShapeRows;\nwindow.TRACED_SHAPE_COLUMNS = TRACED_SHAPE_COLUMNS;\n" + SHEET),
])
print("\nNow: node organellesheetcheck.js")
