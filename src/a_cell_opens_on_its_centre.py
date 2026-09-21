# -*- coding: utf-8 -*-
u"""A cell's Neuroglancer opens on the cell; a tracing's opens on the tracing.          2026-09-21

Søren: "The neuroglancer instance for the microglia centers on the lysosome and not the cell
nucleus center. For the lysosome itself, that is fine, but for the microglia it should be on its
own center."

tracingViewerOpen centred every link on the middle of the contours it was given. It now takes
ids.centre, and the three cell-level buttons pass one:
  - the kept list's cell row, and the dataset list's cell row;
  - the cell card's "all outlines of this cell" (organShowAllInViewer).
The centre is the cell's own (cell_coord / cellCoord), else where the page knows the nucleus to be
(tracingCentreOfNucleus: the page's nucleus list, by id), else -- a cell with neither -- the
contours, as before. A single tracing's Neuroglancer is unchanged.

Run: python3 src/a_cell_opens_on_its_centre.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "core/tracingcard.js")


def edit(pairs):
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit([
 (u"the viewer centres on the cell when it is given one",
  u'''function tracingViewerOpen(structs, say, ids){
  structs = (structs || []).filter(function(t){ return t && (t.rings || []).length; });
  if (!structs.length){ tracingSay("Nothing to look at yet — no contours.", true); return; }
  const pos = tracingCentreOf(structs);''',
  u'''/* ── WHERE A CELL IS ─────────────────────────────────────────────────────────  2026-09-21
   Søren: "for the microglia it should be on its own center." The cell's centre as voxels: its
   stored centre ("x,y,z"), else the page's own position for its nucleus, else null. */
function tracingCentreOfNucleus(nuc){
  nuc = String(nuc || "").replace(/^.*:/, "");
  if (!nuc || typeof bulkNucIdOf !== "function" || typeof bulkCoordOf !== "function"
      || typeof N === "undefined") return null;
  for (var i = 0; i < N; i++){
    if (String(bulkNucIdOf(i)) !== nuc) continue;
    var c = String(bulkCoordOf(i) || "").split(",").map(Number);
    return (c.length === 3 && c.every(isFinite)) ? c.map(Math.round) : null;
  }
  return null;
}
function tracingCellCentre(coord, nuc){
  var c = String(coord || "").split(",").map(Number);
  if (c.length === 3 && c.every(isFinite)) return c.map(Math.round);
  try { return tracingCentreOfNucleus(nuc); } catch (_e){ return null; }
}
function tracingViewerOpen(structs, say, ids){
  structs = (structs || []).filter(function(t){ return t && (t.rings || []).length; });
  if (!structs.length){ tracingSay("Nothing to look at yet — no contours.", true); return; }
  /* A CELL opens on the cell (ids.centre), a tracing on the tracing. */
  const pos = (ids && ids.centre && ids.centre.length === 3) ? ids.centre.slice() : tracingCentreOf(structs);'''),
 (u"the kept list's cell row passes the cell's centre",
  u'''        {nuc:g.nuc,root:g.root});''',
  u'''        {nuc:g.nuc,root:g.root,centre:tracingCellCentre(g.coord,g.nuc)});'''),
 (u"the dataset list's cell row too",
  u'''  const ids = { nuc: "", root: "" };
  good.forEach(function(x){
    ids.nuc = ids.nuc || x.t.nucleusId || x.st.nucleusId || "";
    ids.root = ids.root || x.t.rootId || x.st.rootId || "";
  });''',
  u'''  const ids = { nuc: "", root: "" };
  let coord = "";
  good.forEach(function(x){
    ids.nuc = ids.nuc || x.t.nucleusId || x.st.nucleusId || "";
    ids.root = ids.root || x.t.rootId || x.st.rootId || "";
    coord = coord || x.t.cellCoord || x.st.cellCoord || "";
  });
  ids.centre = tracingCellCentre(coord, ids.nuc);'''),
 (u"...and the cell card's all-outlines view",
  u'''    { nuc: nid || "", root: root || "" });''',
  u'''    { nuc: nid || "", root: root || "",
      centre: tracingCellCentre((trs || []).map(function(t){ return t && (t.cellCoord || t.cell_coord); })
                                  .filter(Boolean)[0] || "", nid) });'''),
])
