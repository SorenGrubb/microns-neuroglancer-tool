# -*- coding: utf-8 -*-
u"""A tracing knows the cell it belongs to, by its centre as well as by its ids.          2026-09-21

Søren, on λJump: "I traced a lysosome of a microglia i had just identified. I had saved it as a
new cell with the approximate centroid coordinates for the microglia nucleus. But the dataset does
not contain nucleus ID or root ID, so the lysosome tracing cannot be associated with the cell. I
think we also need to associate the organelles with the cell centroid coordinates and not just the
nucleus IDs and root IDs, otherwise, how do we know what cell those organelles are from?"

Two things were wrong, and he named the general one.

THE IDS WERE THERE TO BE HAD. The card fills its id boxes from the segmentation under the
coordinate (core/segread.js). Lee16 has none, so they stayed empty -- but λJump knows every nucleus,
detected AND added (an added cell is absorbed into the same arrays, with its own id from
addedNucleusId), and where each sits. Every tool with a nucleus list exposes it the same way to the
bulk card: nearest(x,y,z) -> {i, dist}, bulkNucIdOf(i), bulkCoordOf(i). tracingNearestCell() asks
exactly that (or the host's UJ.cfg.tracing.cellAt, where a tool has its own idea of a cell), within
10 µm -- the bulk card's own radius -- and fills the nucleus box when it is empty.

A CELL IS ALSO A PLACE. A third box, the cell's centre (x, y, z in voxels), filled with the nearest
nucleus's position, editable, and carried everywhere the ids are:
  - the tracing keeps it (cell_coord) and sends it (cellCoord); the backend writes it to the row
    and the index (backend/src_the_cell_centre_is_kept.py);
  - a draft remembers it; a tracing opened from the dataset brings it back;
  - the kept list and the dataset's list group by nucleus, else root, else centre -- so a tracing
    with only a centre is "cell at x, y, z", not "Not filed against a cell" -- and show the centre
    beside the ids when there is one;
  - the zip's index carries it.

Run: python3 src/the_tracing_knows_its_cell_centre.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)


print("core/tracing.js")
edit("core/tracing.js", [
 (u"a submission carries the cell's centre",
  u'''                color: meta.color || "", nucleusId: meta.nucleusId || "", rootId: meta.rootId || "",
                comment: meta.comment || "",''',
  u'''                color: meta.color || "", nucleusId: meta.nucleusId || "", rootId: meta.rootId || "",
                /* The cell's centre, "x,y,z" in voxels (2026-09-21): a cell is also a place, and on
                   a dataset with no segmentation it may be the only name it has. */
                cellCoord: meta.cellCoord || "",
                comment: meta.comment || "",'''),
 (u"...and reading one back keeps it",
  u'''      ["kind", "cellType", "color", "nucleusId", "rootId"].forEach(function(f){''',
  u'''      ["kind", "cellType", "color", "nucleusId", "rootId", "cellCoord"].forEach(function(f){'''),
])

print("\ncore/tracingcard.js")
edit("core/tracingcard.js", [
 # ── the box
 (u"a third box: the cell's centre",
  u'''    "<p class=\\"hint\\" id=\\"tracingAtSay\\" style=\\"margin-top:4px\\"></p>",''',
  u'''    "<!-- A CELL IS ALSO A PLACE.  2026-09-21. Søren: \\"we also need to associate the organelles with",
    "     the cell centroid coordinates and not just the nucleus IDs and root IDs\\". Filled with the",
    "     nearest nucleus's centre; editable, because a cell somebody has just added is where they say. -->",
    "<div style=\\"margin-top:8px\\">",
    "<label style=\\"margin:0 0 4px\\">Cell centre &mdash; x, y, z in voxels</label>",
    "<div class=\\"coord\\"><input type=\\"text\\" id=\\"tracingCellAt\\" placeholder=\\"the centre of its nucleus, e.g. 102016, 21037, 763\\"></div>",
    "</div>",
    "<p class=\\"hint\\" id=\\"tracingAtSay\\" style=\\"margin-top:4px\\"></p>",'''),
 # ── the nearest nucleus
 (u"the nearest nucleus, from the page's own list",
  u'''async function tracingResolveAt(pos){''',
  u'''/* ── THE CELL, FROM THE PAGE'S OWN NUCLEUS LIST ──────────────────────────  2026-09-21
   Where there is no segmentation to read (λJump), or as well as it: the nearest nucleus the page
   knows -- detected or added -- within 10 µm, the bulk card's own radius. A host with its own idea
   of a cell answers UJ.cfg.tracing.cellAt(pos) -> {nucleusId, coord:[x,y,z], distNm, label}. */
function tracingCellAtVal(){
  var e = document.getElementById("tracingCellAt");
  var n = String(e ? e.value : "").split(/[\\s,;]+/).filter(Boolean).map(Number);
  return (n.length === 3 && n.every(isFinite)) ? n.map(Math.round).join(",") : "";
}
function tracingCoordShow(c){ return String(c || "").split(",").join(", "); }
function tracingNearestCell(pos){
  var h = UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.cellAt;
  if (typeof h === "function") return h(pos) || null;
  if (typeof nearest !== "function" || typeof bulkNucIdOf !== "function"
      || typeof bulkCoordOf !== "function") return null;
  var r = nearest(pos[0], pos[1], pos[2]);
  if (!r || !(r.i >= 0) || !(r.dist <= 10000)) return null;
  var c = String(bulkCoordOf(r.i) || "").split(",").map(Number);
  if (c.length !== 3 || !c.every(isFinite)) return null;
  var lab = "";
  try { lab = (UJ.cfg.bulk && typeof UJ.cfg.bulk.name === "function") ? String(UJ.cfg.bulk.name(r.i) || "") : ""; }
  catch (_e){ lab = ""; }
  return { nucleusId: String(bulkNucIdOf(r.i)), coord: c.map(Math.round), distNm: r.dist, label: lab };
}
/* Fills the nucleus box when it is empty and the centre box when it is empty -- never over
   something typed, and never a centre for a DIFFERENT nucleus than the one in the box. */
function tracingFillCell(pos){
  var nucEl = document.getElementById("tracingNucId"), atEl = document.getElementById("tracingCellAt");
  if (!atEl) return "";
  var c = null;
  try { c = tracingNearestCell(pos); } catch (_e){ c = null; }
  if (!c) return "";
  var have = nucEl ? nucEl.value.trim() : "";
  if (have && c.nucleusId && have !== String(c.nucleusId)) return "";
  if (nucEl && !have && c.nucleusId) nucEl.value = String(c.nucleusId);
  if (!atEl.value.trim()) atEl.value = c.coord.join(", ");
  try { tracingSuggestType(); } catch (_e){}
  return "Nearest nucleus: " + (c.label || c.nucleusId) + ", " + (c.distNm / 1000).toFixed(1)
    + " \\u00b5m away \\u2014 its id and centre are filled in below.";
}

async function tracingResolveAt(pos){'''),
 (u"...asked when the segmentation cannot be",
  u'''    UJ.segread.configure(tracingSources());
  }catch(e){say.textContent="";return;}''',
  u'''    UJ.segread.configure(tracingSources());
  }catch(e){say.textContent=tracingFillCell(pos);return;}'''),
 (u"...and after it when it can",
  u'''    say.textContent=(bits.length
      ? "At that coordinate: "+bits.join(", ")+" \\u2014 filled in below."
      : "Nothing is segmented at that coordinate, which is usually why you are tracing it.")
      +(missed.length?" ("+missed.join("; ")+".)":"");''',
  u'''    const near=tracingFillCell(pos);
    say.textContent=(bits.length
      ? "At that coordinate: "+bits.join(", ")+" \\u2014 filled in below."+(near?" "+near:"")
      : (near||"Nothing is segmented at that coordinate, which is usually why you are tracing it."))
      +(missed.length?" ("+missed.join("; ")+".)":"");'''),
 (u"...and when the segmentation read fails",
  u'''  }catch(e){ say.textContent="Could not read the segmentation there: "+String(e&&e.message||e); }''',
  u'''  }catch(e){ say.textContent="Could not read the segmentation there: "+String(e&&e.message||e)
                +" "+tracingFillCell(pos); }'''),
 # ── carried
 (u"the tracing keeps its cell's centre",
  u'''    if(nid)t.nucleus_id=nid;''',
  u'''    if(nid)t.nucleus_id=nid;
    const cat=tracingCellAtVal();
    if(cat)t.cell_coord=cat;'''),
 (u"...and sends it",
  u'''nucleusId:tracingScoped(t.nucleus_id||""),rootId:t.root_id||"",''',
  u'''nucleusId:tracingScoped(t.nucleus_id||""),rootId:t.root_id||"",
                                             cellCoord:t.cell_coord||"",'''),
 (u"a draft remembers it",
  u'''           color: val("tracingColor"), nucId: val("tracingNucId"), rootId: val("tracingRootId"),''',
  u'''           color: val("tracingColor"), nucId: val("tracingNucId"), rootId: val("tracingRootId"),
           cellAt: val("tracingCellAt"),'''),
 (u"...and gives it back",
  u'''  set("tracingColor", d.color); set("tracingNucId", d.nucId); set("tracingRootId", d.rootId);''',
  u'''  set("tracingColor", d.color); set("tracingNucId", d.nucId); set("tracingRootId", d.rootId);
  set("tracingCellAt", d.cellAt);'''),
 (u"a tracing opened from the dataset brings its centre",
  u'''    if (st.rootId) document.getElementById("tracingRootId").value = st.rootId;''',
  u'''    if (st.rootId) document.getElementById("tracingRootId").value = st.rootId;
    { const ca = document.getElementById("tracingCellAt"), cc = st.cellCoord || t.cellCoord;
      if (ca && cc) ca.value = tracingCoordShow(cc); }'''),
 (u"a tracing filed against no cell finds one when it is opened",
  u'''    { const ca = document.getElementById("tracingCellAt"), cc = st.cellCoord || t.cellCoord;
      if (ca && cc) ca.value = tracingCoordShow(cc); }''',
  u'''    { const ca = document.getElementById("tracingCellAt"), cc = st.cellCoord || t.cellCoord;
      if (ca && cc) ca.value = tracingCoordShow(cc); }
    /* FILED AGAINST NO CELL: opened, it looks for one -- the nearest nucleus to where it was drawn --
       so adding it again files the next version under the cell. How Søren's λJump lysosome, traced
       before the card could read λJump's nuclei, gets its cell (2026-09-21). */
    if (!st.nucleusId && !st.rootId && !(st.cellCoord || t.cellCoord)){
      const nucBox = document.getElementById("tracingNucId");
      if (nucBox) nucBox.value = "";
      try { tracingFillCell(PAD_CENTRE); } catch (_e){}
    }'''),
 (u"...and so does a whole cell",
  u'''    set("tracingRootId", first.st.rootId || first.t.rootId);''',
  u'''    set("tracingRootId", first.st.rootId || first.t.rootId);
    set("tracingCellAt", tracingCoordShow(first.st.cellCoord || first.t.cellCoord || ""));'''),
 (u"...and the zip's index",
  u'''                     rootId: t.rootId || st.rootId || "", instanceIndex: t.instanceIndex, instanceOf: t.instanceOf || "",''',
  u'''                     rootId: t.rootId || st.rootId || "", cellCoord: t.cellCoord || st.cellCoord || "",
                     instanceIndex: t.instanceIndex, instanceOf: t.instanceOf || "",'''),
 (u"a new volume clears it",
  u'''  ["tracingNucId", "tracingRootId", "tracingX", "tracingY", "tracingZ"].forEach(function(id){
    var e = document.getElementById(id); if (e) e.value = "";''',
  u'''  ["tracingNucId", "tracingRootId", "tracingCellAt", "tracingX", "tracingY", "tracingZ"].forEach(function(id){
    var e = document.getElementById(id); if (e) e.value = "";'''),
 (u"editing it saves the draft",
  u'''  ["tracingWhat","tracingName","tracingType","tracingColor","tracingNucId","tracingRootId"]
    .forEach(function(id){''',
  u'''  ["tracingWhat","tracingName","tracingType","tracingColor","tracingNucId","tracingRootId","tracingCellAt"]
    .forEach(function(id){'''),
 # ── grouped
 (u"a cell's key falls back to its centre",
  u'''function tracingCellKeyOf(nuc, root){
  nuc = String(nuc || ""); root = String(root || "");
  return nuc ? "n:" + nuc : (root ? "r:" + root : "");
}''',
  u'''function tracingCellKeyOf(nuc, root, coord){
  nuc = String(nuc || ""); root = String(root || ""); coord = String(coord || "");
  return nuc ? "n:" + nuc : (root ? "r:" + root : (coord ? "c:" + coord : ""));
}'''),
 (u"...the header names the centre",
  u'''function tracingCellHead(nuc, root, type, n){
  const bits = [];
  if (type && type !== "traced") bits.push("<b>" + escHtml(type) + "</b>");
  if (nuc) bits.push("nucleus " + escHtml(nuc));
  if (root) bits.push("root " + escHtml(root));
  if (!nuc && !root) bits.push("<b>Not filed against a cell</b>");''',
  u'''function tracingCellHead(nuc, root, type, n, coord){
  const bits = [];
  if (type && type !== "traced") bits.push("<b>" + escHtml(type) + "</b>");
  if (nuc) bits.push("nucleus " + escHtml(nuc));
  if (root) bits.push("root " + escHtml(root));
  if (coord) bits.push((nuc || root ? "centre " : "cell at ") + escHtml(tracingCoordShow(coord)));
  if (!nuc && !root && !coord) bits.push("<b>Not filed against a cell</b>");'''),
 (u"...and grouping reads it",
  u'''function tracingGroupByCell(list, nucOf, rootOf){
  const by = {}, order = [];
  list.forEach(function(t, i){
    const k = tracingCellKeyOf(nucOf(t), rootOf(t));
    if (!by[k]){ by[k] = { key: k, nuc: String(nucOf(t) || ""), root: String(rootOf(t) || ""), items: [] }; order.push(k); }
    const g = by[k];
    if (!g.root && rootOf(t)) g.root = String(rootOf(t));''',
  u'''function tracingGroupByCell(list, nucOf, rootOf, coordOf){
  const by = {}, order = [];
  coordOf = coordOf || function(){ return ""; };
  /* ωJump files a tracing with no nucleus as "<volume>:" -- a scope, not a cell (2026-09-21). */
  const nucOf0 = nucOf;
  nucOf = function(t){ const v = String(nucOf0(t) || ""); return /:$/.test(v) ? "" : v; };
  list.forEach(function(t, i){
    const k = tracingCellKeyOf(nucOf(t), rootOf(t), coordOf(t));
    if (!by[k]){ by[k] = { key: k, nuc: String(nucOf(t) || ""), root: String(rootOf(t) || ""),
                           coord: String(coordOf(t) || ""), items: [] }; order.push(k); }
    const g = by[k];
    if (!g.root && rootOf(t)) g.root = String(rootOf(t));
    if (!g.coord && coordOf(t)) g.coord = String(coordOf(t));'''),
 (u"the kept list groups by centre too",
  u'''  const groups=tracingGroupByCell(TRACINGS_KEPT,function(t){return t.nucleus_id;},function(t){return t.root_id;});''',
  u'''  const groups=tracingGroupByCell(TRACINGS_KEPT,function(t){return t.nucleus_id;},function(t){return t.root_id;},
                                  function(t){return t.cell_coord;});'''),
 (u"...and names it",
  u'''        +'<div '+TRACING_CELL_ROW+'>'+tracingCellHead(g.nuc,g.root,type,g.items.length)''',
  u'''        +'<div '+TRACING_CELL_ROW+'>'+tracingCellHead(g.nuc,g.root,type,g.items.length,g.coord)'''),
 (u"...and Remove all removes by the same key",
  u'''        TRACINGS_KEPT=TRACINGS_KEPT.filter(function(t){return tracingCellKeyOf(t.nucleus_id,t.root_id)!==g.key;});''',
  u'''        TRACINGS_KEPT=TRACINGS_KEPT.filter(function(t){return tracingCellKeyOf(t.nucleus_id,t.root_id,t.cell_coord)!==g.key;});'''),
 (u"the dataset's list groups by centre too",
  u'''  const groups = tracingGroupByCell(TRACING_SHARED, function(t){ return t.nucleusId; },
                                    function(t){ return t.rootId; });''',
  u'''  const groups = tracingGroupByCell(TRACING_SHARED, function(t){ return t.nucleusId; },
                                    function(t){ return t.rootId; }, function(t){ return t.cellCoord; });'''),
 (u"...and names it",
  u'''          + '<div ' + TRACING_CELL_ROW + '>' + tracingCellHead(g.nuc, g.root, type, g.items.length)''',
  u'''          + '<div ' + TRACING_CELL_ROW + '>' + tracingCellHead(g.nuc, g.root, type, g.items.length, g.coord)'''),
 (u"...and the zip is named by it",
  u'''    const cell = tracingSafeName(g.nuc ? "nucleus_" + g.nuc : (g.root ? "root_" + g.root : "no_cell"));''',
  u'''    const cell = tracingSafeName(g.nuc ? "nucleus_" + g.nuc : (g.root ? "root_" + g.root
                                 : (g.coord ? "cell_at_" + g.coord.split(",").join("_") : "no_cell")));'''),
])
