# -*- coding: utf-8 -*-
u"""A vessel is a thing you trace, and it belongs to no cell.                            2026-10-08

Søren: *"Under Traced outlines (whole structures) I want a new topic called Vasculature with all
the possible vascular segments Artery, arteriole, capillary, venule, vein, and one called
Lymphatic vessel. We should be able to segment them without belonging to a certain cell, and they
should be possible to include in the filter."*

TWO PARTS OF THAT ARE AWKWARD, AND HE SETTLED BOTH.

  "included in the filter" -- the organelle filter asks "does THIS CELL carry one", and a vessel
  has no cell, so the question has no answer. He chose: the ticks pick which VESSELS are listed,
  shown and exported; they do not filter the cell table at all. So the Vasculature list is its own
  control inside the same box, with its own class, and UJ.organelleFilter.checked() does not
  return it -- a ticked capillary cannot change which cells match.

  "without belonging to a certain cell" -- then what is it filed against? He chose a vessel name
  he reuses, so segments traced on different days join into one vessel.

THE NAME IS THE JOIN, AND IT IS NOT A NEW CONCEPT. tracingSeriesLabel already strips a trailing
number, so "Capillary A 1" and "Capillary A 2" are the series "Capillary A", exactly as three
lysosomes on one cell are the series "Lysosome". A vessel changes exactly one thing about that
question: the CELL is not part of it. tracingNextIndex and tracingBareOf each gained one clause
saying so, and they say it through the same two helpers rather than twice.

WHAT A VESSEL CARRIES: its kind, its name, its contours, and nothing else. No nucleus id, no root
id, no cell coordinate -- NOT EVEN WHEN A CELL IS OPEN ON THE CARD, which is the case that would
otherwise file a capillary as part of whichever endothelial cell he happened to be looking at. The
whole point of the feature is that it is not part of one.

AND IT IS NOT AN ORGANELLE. organIsOrganelle() was "any kind that is not cell or nucleus", which
would have put a capillary in a cell's Organelles list the moment one matched by accident. It asks
UJ.tracing.isVessel() now, in the same breath as the other two.

Where the six live: core/tracing.js, once, with their colours. The pad reads them, the filter
reads them, and the Blender export already carries them -- a vessel with no cell falls to the box
test (2026-10-07, src/a_per_box_notebook_is_that_box.py), which for a vessel is exactly right.

Check: vesselcheck.js (new)
Run: python3 src/a_vessel_is_not_part_of_a_cell.py
     python3 src/build_stamps.py
     node vesselcheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── 1. the six, once ──────────────────────────────────────────────────────────────────────────
VESSELS = u'''  /* ── THE VESSELS ───────────────────────────────────  2026-10-08
     Søren: *"a new topic called Vasculature with all the possible vascular segments Artery,
     arteriole, capillary, venule, vein, and one called Lymphatic vessel."*

     IN FLOW ORDER, not alphabetical: artery → arteriole → capillary → venule → vein is how the
     blood goes and how anyone reading the list expects to find them; the lymphatic is its own
     vessel and sits last. The colours are the convention a physiologist already has in their eye
     — arterial red warming to the capillary bed, venous blue, lymph green — and they are here
     rather than chosen per tool because a capillary has to be the same colour in the pad, the
     viewer and the Blender scene or the picture lies.

     A vessel is NOT a cell and NOT an organelle. Everything that asks "which cell is this on"
     answers "none" for one, which is the point: see src/a_vessel_is_not_part_of_a_cell.py. */
  var VESSELS = [
    { value: "__artery",    kind: "artery",    label: "Artery",           color: "#e5484d" },
    { value: "__arteriole", kind: "arteriole", label: "Arteriole",        color: "#f76808" },
    { value: "__capillary", kind: "capillary", label: "Capillary",        color: "#c44bc4" },
    { value: "__venule",    kind: "venule",    label: "Venule",           color: "#5b8def" },
    { value: "__vein",      kind: "vein",      label: "Vein",             color: "#3451b2" },
    { value: "__lymphatic", kind: "lymphatic", label: "Lymphatic vessel", color: "#46a758" }
  ];
  var VESSEL_BY = {};
  VESSELS.forEach(function(v){ VESSEL_BY[v.kind] = v; VESSEL_BY[v.value] = v; });
  /* Either spelling, any casing: the pad hands the "__capillary" option value, the sheet hands
     back the stored "capillary", and a row written by hand can be "Capillary". */
  function vesselOf(k){ return VESSEL_BY[String(k || "").trim().toLowerCase()] || null; }
  function isVessel(k){ return !!vesselOf(k); }
'''

OLD_EXPORT = u'''  return { coordKey: coordKey, cellOf: cellOf, sameCell: sameCell,
           sameCellWhy: sameCellWhy, splitOf: splitOf,
           elsewhereByCoord: elsewhereByCoord,'''
NEW_EXPORT = (VESSELS
              + u'''  return { coordKey: coordKey, cellOf: cellOf, sameCell: sameCell,
           sameCellWhy: sameCellWhy, splitOf: splitOf,
           VESSELS: VESSELS, vesselOf: vesselOf, isVessel: isVessel,
           elsewhereByCoord: elsewhereByCoord,''')

edit("core/tracing.js", [
    (u"the six vessels, with their colours", OLD_EXPORT, NEW_EXPORT),
])

# ── 2. not an organelle ───────────────────────────────────────────────────────────────────────
OLD_ORG = u'''function organIsOrganelle(t){
  var k = String((t && (t.instanceOf || t.kind)) || "").toLowerCase();
  return !!k && k !== "cell" && k !== "nucleus";
}'''
NEW_ORG = u'''function organIsOrganelle(t){
  var k = String((t && (t.instanceOf || t.kind)) || "").toLowerCase();
  /* A VESSEL IS NOT ONE EITHER (2026-10-08). This was "anything that is not the cell or its
     nucleus", which made an artery an organelle by default — and the Organelles section is a
     list of what is INSIDE a cell. A vessel is filed against no cell at all, so it would only
     ever arrive here by accident, and when it did it would read as part of one. */
  try { if (window.UJ && UJ.tracing && UJ.tracing.isVessel && UJ.tracing.isVessel(k)) return false; }
  catch (_e){}
  return !!k && k !== "cell" && k !== "nucleus";
}'''
edit("core/panel.js", [
    (u"a vessel is not an organelle", OLD_ORG, NEW_ORG),
])

# ── 3. the pad ────────────────────────────────────────────────────────────────────────────────
OLD_WHATOF = u'''function tracingWhatOf(v,typed){
  if(v==="__cell")return {kind:"cell",name:"Whole cell"};
  if(v==="__nucleus")return {kind:"nucleus",name:"Nucleus"};
  if(v==="__other")return {kind:"other",name:String(typed||"").trim()};'''
NEW_WHATOF = u'''/* The vessel name box, which only a vascular kind asks for. "" when empty or absent. */
function tracingVesselName(){
  var el = document.getElementById("tracingVessel");
  return el ? String(el.value || "").trim() : "";
}
function tracingWhatOf(v,typed){
  if(v==="__cell")return {kind:"cell",name:"Whole cell"};
  if(v==="__nucleus")return {kind:"nucleus",name:"Nucleus"};
  if(v==="__other")return {kind:"other",name:String(typed||"").trim()};
  /* ── A VESSEL IS NAMED, NOT NUMBERED INTO A CELL ────────  2026-10-08
     The name he types is what joins segments traced on different days into one vessel; with none
     typed it is just its kind, and the numbering tells the segments apart either way. */
  var ves = (window.UJ && UJ.tracing && UJ.tracing.vesselOf) ? UJ.tracing.vesselOf(v) : null;
  if (ves) return { kind: ves.kind, name: String(typed || "").trim() || ves.label };'''

OLD_WHAT = u'''  if(v==="__other"){
    const typed=(document.getElementById("tracingName").value||"").trim();
    return {kind:"other",name:typed};
  }'''
NEW_WHAT = u'''  if(v==="__other"){
    const typed=(document.getElementById("tracingName").value||"").trim();
    return {kind:"other",name:typed};
  }
  {
    const ves=(window.UJ&&UJ.tracing&&UJ.tracing.vesselOf)?UJ.tracing.vesselOf(v):null;
    if(ves)return {kind:ves.kind,name:tracingVesselName()||ves.label};
  }'''

OLD_OPTS = u'''    what.innerHTML='<optgroup label="The cell itself">'
      +'<option value="__cell">Whole cell \\u2014 the cell\\u2019s own mesh</option>'
      +'<option value="__nucleus">Nucleus</option></optgroup>'
      +((typeof ORGANELLE_KIND_OPTIONS_HTML!=="undefined")
          ? ORGANELLE_KIND_OPTIONS_HTML : UJ.organelles.optionsHtml())
      +'<optgroup label="Not on the list"><option value="__other">Something else \\u2014 type the name</option></optgroup>';'''
NEW_OPTS = u'''    /* VASCULATURE SITS WITH THE CELL ITSELF, above the organelles: like the whole cell and the
       nucleus it is a whole object you outline because the segmentation has not given you one,
       and unlike every kind below it, it is part of no cell at all (2026-10-08). */
    const vesselOpts=(window.UJ&&UJ.tracing&&UJ.tracing.VESSELS)
      ? ('<optgroup label="Vasculature">'
         + UJ.tracing.VESSELS.map(function(v){
             return '<option value="'+escHtml(v.value)+'">'+escHtml(v.label)+'</option>'; }).join("")
         + '</optgroup>')
      : "";
    what.innerHTML='<optgroup label="The cell itself">'
      +'<option value="__cell">Whole cell \\u2014 the cell\\u2019s own mesh</option>'
      +'<option value="__nucleus">Nucleus</option></optgroup>'
      +vesselOpts
      +((typeof ORGANELLE_KIND_OPTIONS_HTML!=="undefined")
          ? ORGANELLE_KIND_OPTIONS_HTML : UJ.organelles.optionsHtml())
      +'<optgroup label="Not on the list"><option value="__other">Something else \\u2014 type the name</option></optgroup>';'''

OLD_CHANGE = u'''    what.addEventListener("change",function(){
      document.getElementById("tracingNameRow").style.display=(what.value==="__other")?"":"none";
      if(what.value==="__other")document.getElementById("tracingName").focus();'''
NEW_CHANGE = u'''    what.addEventListener("change",function(){
      document.getElementById("tracingNameRow").style.display=(what.value==="__other")?"":"none";
      if(what.value==="__other")document.getElementById("tracingName").focus();
      /* The vessel box, and the colour that goes with the kind. Picking "Capillary" and getting
         the previous structure's green would make six vessels in one scene unreadable, which is
         the whole reason the colours are declared beside the kinds (2026-10-08). */
      try { tracingVesselSync(); } catch (_ev){}'''

VSYNC = u'''
/* ── THE VESSEL BOX ────────────────────────────────────  2026-10-08
   Shown only for a vascular kind, and offering the names already in the dataset so reusing one is
   a click rather than a retyping — a vessel joins its segments BY THAT STRING, and "Capillary A"
   and "capillary a" would be two vessels. The datalist is built from the index the card already
   holds; nothing is fetched for it. See src/a_vessel_is_not_part_of_a_cell.py. */
function tracingVesselNames(kind){
  var want = String(kind || "").toLowerCase(), seen = {}, out = [];
  var take = function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "").toLowerCase();
    if (want && k !== want) return;
    if (!(window.UJ && UJ.tracing && UJ.tracing.isVessel && UJ.tracing.isVessel(k))) return;
    var nm = tracingSeriesLabel(t.name || "");
    if (nm && !seen[nm]){ seen[nm] = 1; out.push(nm); }
  };
  (TRACING_SHARED || []).forEach(take);
  (TRACINGS_KEPT || []).forEach(function(t){ take({ kind: t.kind, name: t.name }); });
  out.sort(function(a, b){ return a.localeCompare(b, undefined, { numeric: true }); });
  return out;
}
function tracingVesselSync(){
  var what = document.getElementById("tracingWhat");
  var row = document.getElementById("tracingVesselRow");
  var box = document.getElementById("tracingVessel");
  var list = document.getElementById("tracingVesselNames");
  if (!what || !row) return;
  var ves = (window.UJ && UJ.tracing && UJ.tracing.vesselOf)
          ? UJ.tracing.vesselOf(what.value) : null;
  row.style.display = ves ? "" : "none";
  if (!ves) return;
  if (box) box.placeholder = ves.label + " \\u2014 name it to join its segments (optional)";
  if (list) list.innerHTML = tracingVesselNames(ves.kind).map(function(n){
    return '<option value="' + escHtml(n) + '"></option>'; }).join("");
  /* Its own colour, unless the person has already chosen one for this structure. */
  var col = document.getElementById("tracingColor");
  if (col && !col.dataset.chosen) col.value = ves.color;
}
'''

OLD_HTMLROW = u'''    "<div class=\\"row\\" id=\\"tracingNameRow\\" style=\\"gap:8px;margin-top:8px;display:none\\">",'''
NEW_HTMLROW = u'''    "<!-- THE VESSEL IT IS PART OF.  2026-10-08. S\\u00f8ren: a Vasculature topic whose segments are",
    "     traced without belonging to a cell. The name is what joins segments of one vessel; the",
    "     datalist offers the ones already in the dataset. Hidden for every other kind. -->",
    "<div class=\\"row\\" id=\\"tracingVesselRow\\" style=\\"gap:8px;margin-top:8px;display:none\\">",
    "<div class=\\"coord\\" style=\\"flex:1 1 auto\\"><input type=\\"text\\" id=\\"tracingVessel\\" list=\\"tracingVesselNames\\" placeholder=\\"Name it to join its segments (optional)\\" title=\\"Segments of one vessel share this name, so a capillary traced across three sessions is one capillary. Leave it empty and the segment is filed under its kind alone. A vessel is filed against NO cell \\u2014 not even the one open on this card.\\"></div>",
    "<datalist id=\\"tracingVesselNames\\"></datalist>",
    "</div>",
    "<div class=\\"row\\" id=\\"tracingNameRow\\" style=\\"gap:8px;margin-top:8px;display:none\\">",'''

OLD_IDS = u'''    if(nid)t.nucleus_id=nid;
    const cat=tracingCellAtVal();
    if(cat)t.cell_coord=cat;
    if(rid)t.root_id=rid;'''
NEW_IDS = u'''    /* ── A VESSEL TAKES NO CELL'S IDS ────────────────────  2026-10-08
       Søren: *"We should be able to segment them without belonging to a certain cell."* The
       card almost always has a cell on it — he traces vessels while looking at the endothelial
       cells on them — so without this line every capillary would be filed as part of whichever
       cell happened to be open, which is the opposite of what was asked for. */
    const isVes=!!(window.UJ&&UJ.tracing&&UJ.tracing.isVessel&&UJ.tracing.isVessel(g.w.kind));
    if(!isVes){
      if(nid)t.nucleus_id=nid;
      const cat=tracingCellAtVal();
      if(cat)t.cell_coord=cat;
      if(rid)t.root_id=rid;
    }'''

SAME_OLD = '''    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = tracingSameCell(tracingCellOf(t), here);'''
SAME_NEW = '''    var same = (k === wantK) && (!tracingSeriesIsNamed(wantK)
                                 || tracingSeriesLabel(t.name) === wantL);
    var sameCell = tracingSeriesIgnoresCell(wantK)
                 || tracingSameCell(tracingCellOf(t), here);'''
# Three callers, three anchors: the bare-number allocator, tracingNextIndex's published pass, and
# its kept-list pass. The same two clauses in each, because they are the same question.
A1_OLD = '''  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");
''' + SAME_OLD + '''
    if (!same || !sameCell) return;
    var n = Math.round(Number(t.instanceIndex) || 0);'''
A1_NEW = '''  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");
''' + SAME_NEW + '''
    if (!same || !sameCell) return;
    var n = Math.round(Number(t.instanceIndex) || 0);'''
A2_OLD = SAME_OLD + '''
    if (same && sameCell){'''
A2_NEW = SAME_NEW + '''
    if (same && sameCell){'''
A3_OLD = '''    var k = String(t.instance_of || t.kind || "");
''' + SAME_OLD + '''
    if (!same || !sameCell) return;
    have++;'''
A3_NEW = '''    var k = String(t.instance_of || t.kind || "");
''' + SAME_NEW + '''
    if (!same || !sameCell) return;
    have++;'''

SERIES = u'''/* ── WHAT MAKES A SERIES ───────────────────────────────  2026-10-08
   Two questions the numbering asks, each answered once rather than in both allocators.

   IS THE NAME PART OF IT? For a kind, no: two lysosomes on a cell are Lysosome 1 and 2 whatever
   else is around. For "other" the user typed the name, so the name IS the kind. For a vessel the
   name is the vessel — "Capillary A" and "Capillary B" are two capillaries and number apart.

   IS THE CELL PART OF IT? For everything a cell contains, yes. For a vessel, no: it has no cell,
   so its segments number within the vessel across every cell and every session, which is what
   makes "Capillary A 1" and "Capillary A 2" one vessel traced twice. */
function tracingSeriesIsNamed(kind){
  var k = String(kind || "");
  if (k === "other") return true;
  try { return !!(window.UJ && UJ.tracing && UJ.tracing.isVessel && UJ.tracing.isVessel(k)); }
  catch (_e){ return false; }
}
function tracingSeriesIgnoresCell(kind){
  try { return !!(window.UJ && UJ.tracing && UJ.tracing.isVessel
                  && UJ.tracing.isVessel(String(kind || ""))); }
  catch (_e){ return false; }
}
function tracingKindNumbered(kind){'''

edit("core/tracingcard.js", [
    (u"tracingWhatOf knows a vessel", OLD_WHATOF, NEW_WHATOF),
    (u"...and so does tracingWhat", OLD_WHAT, NEW_WHAT),
    (u"the Vasculature optgroup", OLD_OPTS, NEW_OPTS),
    (u"...the box appears with it", OLD_CHANGE, NEW_CHANGE),
    (u"...the box itself", OLD_HTMLROW, NEW_HTMLROW),
    (u"...and what fills it", u"function tracingWhat(){", VSYNC + u"function tracingWhat(){"),
    (u"a vessel takes no cell's ids", OLD_IDS, NEW_IDS),
    (u"one answer to what makes a series", u"function tracingKindNumbered(kind){", SERIES),
    (u"...asked by the bare-number allocator", A1_OLD, A1_NEW),
    (u"...by the published pass", A2_OLD, A2_NEW),
    (u"...and by the kept-list pass", A3_OLD, A3_NEW),
])
print("done")

# ── 4. the index of what has been traced, as vessels ──────────────────────────────────────────
VIDX = u'''
/* ── THE VESSELS IN THE DATASET, AS VESSELS ────────────────────────────────────  2026-10-08
   Søren: a Vasculature topic whose ticks pick WHICH VESSELS are listed, shown and exported —
   "they do not filter the cell table at all", because "does this cell have an artery" is not a
   question anyone asks.

   Grouped by kind AND by the name he reused, through tracingSeriesLabel, which strips a trailing
   number: "Capillary A 1" and "Capillary A 2" are two segments of the vessel "Capillary A". The
   index alone answers all of it — no contours are read, so this costs the one sheet scan the
   page already makes. See src/a_vessel_is_not_part_of_a_cell.py. */
var TRACED_VESSELS = null, TRACED_VESSELS_WAIT = null, TRACED_VESSELS_DS = null;
function tracedVesselIndex(force){
  var ds = tracedOutlinesDsQS();
  if (ds !== TRACED_VESSELS_DS){ TRACED_VESSELS = null; TRACED_VESSELS_WAIT = null; TRACED_VESSELS_DS = ds; }
  if (TRACED_VESSELS && !force) return Promise.resolve(TRACED_VESSELS);
  if (TRACED_VESSELS_WAIT && !force) return TRACED_VESSELS_WAIT;
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return Promise.resolve({ vessels: [], counts: {} });
  TRACED_VESSELS_WAIT = fetch(REPORT_ENDPOINT + "?tracings=1" + ds)
    .then(function(r){ return r.json(); })
    .then(function(d){
      TRACED_VESSELS = tracedVesselsFrom((d && d.tracings) || []);
      TRACED_VESSELS_WAIT = null;
      return TRACED_VESSELS;
    }, function(e){
      TRACED_VESSELS_WAIT = null;
      console.warn("[vessels] index unavailable", e);
      return { vessels: [], counts: {} };
    });
  return TRACED_VESSELS_WAIT;
}
/* Split out so a check can hand it rows without a backend. */
function tracedVesselsFrom(rows){
  var by = {}, out = [], counts = {};
  /* THE KEY IS THE COMPARISON, THE NAME IS WHAT HE TYPED. tracingSeriesLabel lowercases on
     purpose -- it exists to compare -- so grouping on it and then PRINTING it turned "Capillary A"
     into "capillary a" on screen. Caught by vesselcheck.js. The key groups; the first spelling
     seen is what is shown, which is the one he wrote. */
  var series = (typeof tracingSeriesLabel === "function")
    ? tracingSeriesLabel
    : function(n){ return String(n || "").replace(/\\s+\\d+$/, "").trim().toLowerCase(); };
  var shown = function(n){ return String(n || "").replace(/\\s+\\d+$/, "").trim(); };
  (rows || []).forEach(function(t){
    if (!t || !t.structureId) return;
    var kind = String(t.instanceOf || t.kind || "").toLowerCase();
    if (!(window.UJ && UJ.tracing && UJ.tracing.isVessel && UJ.tracing.isVessel(kind))) return;
    var fallback = (UJ.tracing.vesselOf(kind) || {}).label || kind;
    var name = shown(t.name || "") || fallback;
    var key = kind + "|" + (series(t.name || "") || fallback.toLowerCase());
    var v = by[key];
    if (!v){
      v = by[key] = { kind: kind, name: name, label: (UJ.tracing.vesselOf(kind) || {}).label || kind,
                      color: (UJ.tracing.vesselOf(kind) || {}).color || "#888",
                      segments: [], contours: 0, sections: 0 };
      out.push(v);
      counts[kind] = (counts[kind] || 0) + 1;
    }
    v.segments.push(t);
    v.contours += Number(t.contours || 0);
    v.sections += Number(t.sections || 0);
  });
  out.sort(function(a, b){
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
  });
  return { vessels: out, counts: counts };
}
window.tracedVesselIndex = tracedVesselIndex;
window.tracedVesselsFrom = tracedVesselsFrom;
'''

edit("core/tracedoutlines.js", [
    (u"the vessel index", u"window.tracedMeasureAndSave = tracedMeasureAndSave;",
     VIDX + u"\nwindow.tracedMeasureAndSave = tracedMeasureAndSave;"),
])

# ── 5. the Vasculature control in the filter ──────────────────────────────────────────────────
OLD_TAIL = u'''    host.innerHTML = h;

    var m = host.querySelector("#" + modeId);'''
NEW_TAIL = u'''    /* ── AND THE VESSELS, WHICH ARE NOT A QUESTION ABOUT CELLS ──────────────────  2026-10-08
       Søren wanted the vascular kinds in the filter, and when asked what ticking one should do:
       *"the ticks pick which traced vessels are listed, shown in the viewer and put in a Blender
       box — they do not filter the cell table at all."* So it is in the same box, under its own
       heading, with its OWN class: checked() returns .forganelle and never these, so a ticked
       capillary cannot change which cells match. Its own list says what it found. */
    h += vesselSectionHtml();
    host.innerHTML = h;
    try { wireVessels(host); } catch (_ev){}

    var m = host.querySelector("#" + modeId);'''

VSEC = u'''  /* The six, from core/tracing.js, never a second list. "" when this page has not loaded it. */
  function vesselSectionHtml(){
    var V = (window.UJ && UJ.tracing && UJ.tracing.VESSELS) || null;
    if (!V || !V.length) return "";
    return '<div class="fvessel-box" style="margin-top:12px;border-top:1px solid var(--line);'
      + 'padding-top:9px">'
      + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);'
      + 'margin-bottom:3px">Vasculature</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px 14px">'
      + V.map(function(v){
          return '<label style="font-size:12px;display:flex;align-items:center;gap:6px">'
            + '<input type="checkbox" class="fvessel" value="' + esc(v.kind) + '" style="width:auto">'
            + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:'
            + esc(v.color) + '"></span>' + esc(v.label)
            + ' <span class="nsub fvessel-n" data-k="' + esc(v.kind) + '" style="color:var(--mut)">'
            + '\\u2026</span></label>';
        }).join("")
      + '</div>'
      + '<p class="hint" style="margin:5px 0 0">These are traced vessels, not cells. A vessel is '
      + 'filed against no cell, so ticking one lists the vessels below \\u2014 it does not change '
      + 'which cells the filter returns. The number is how many vessels of that kind have been '
      + 'traced, counting all the segments of one vessel as one.</p>'
      + '<div class="fvessel-list" style="margin-top:4px"></div></div>';
  }
  function vesselsChecked(host){
    if (!host) return [];
    return Array.prototype.map.call(host.querySelectorAll(".fvessel:checked"),
      function(cb){ return cb.value; });
  }
  /* Filled from the index when the page has one; silent when it does not, because a tool without
     core/tracedoutlines.js has no vessels to list and an error message about it would be noise. */
  function wireVessels(host){
    var box = host.querySelector(".fvessel-box");
    if (!box) return;
    var draw = function(idx){
      var want = vesselsChecked(host);
      box.querySelectorAll(".fvessel-n").forEach(function(el){
        el.textContent = String((idx.counts || {})[el.dataset.k] || 0);
      });
      var list = box.querySelector(".fvessel-list");
      if (!list) return;
      if (!want.length){
        list.innerHTML = '<p class="hint" style="margin:4px 0 0">Tick a kind to list the vessels '
          + 'traced in this dataset.</p>';
        return;
      }
      var hit = (idx.vessels || []).filter(function(v){ return want.indexOf(v.kind) >= 0; });
      if (!hit.length){
        list.innerHTML = '<p class="hint" style="margin:4px 0 0">Nothing of '
          + (want.length === 1 ? 'that kind' : 'those kinds') + ' has been traced yet.</p>';
        return;
      }
      list.innerHTML = hit.map(function(v, i){
        var seg = v.segments.length;
        return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;'
          + 'border-top:1px solid var(--line);padding:4px 0">'
          + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:'
          + esc(v.color) + '"></span>'
          + '<b style="flex:0 0 auto">' + esc(v.name) + '</b>'
          + '<span style="opacity:.7;flex:1 1 90px;min-width:0">' + esc(v.label) + ' \\u00b7 '
          + seg + ' segment' + (seg === 1 ? '' : 's') + ' \\u00b7 ' + v.contours + ' contours</span>'
          + '<button type="button" class="idbtn fvessel-ngl" data-i="' + i + '" '
          + 'style="padding:1px 7px;font-size:11px" title="Open every segment of this vessel in '
          + 'the viewer, each in its own layer.">Neuroglancer</button>'
          + '<button type="button" class="idbtn fvessel-pad" data-i="' + i + '" '
          + 'style="padding:1px 7px;font-size:11px" title="Open every segment of this vessel on '
          + 'the tracing pad, to add to it or correct it.">Open in the pad</button>'
          + '</div>';
      }).join("");
      var sidsOf = function(b){
        var v = hit[Number(b.dataset.i)];
        return v ? v.segments.map(function(t){ return t.structureId; }) : [];
      };
      list.querySelectorAll(".fvessel-ngl").forEach(function(b){
        b.addEventListener("click", function(){
          if (typeof tracingCellSharedInViewer === "function") tracingCellSharedInViewer(sidsOf(b), b);
          else alert("The tracing card is not on this page, so there is no viewer to open.");
        });
      });
      list.querySelectorAll(".fvessel-pad").forEach(function(b){
        b.addEventListener("click", function(){
          if (typeof tracingOpenCellShared === "function") tracingOpenCellShared(sidsOf(b), b);
          else alert("The tracing card is not on this page.");
        });
      });
    };
    var idx = { vessels: [], counts: {} };
    draw(idx);
    host.querySelectorAll(".fvessel").forEach(function(cb){
      cb.addEventListener("change", function(){ draw(idx); });
    });
    if (typeof tracedVesselIndex === "function")
      tracedVesselIndex().then(function(r){ idx = r || idx; draw(idx); }, function(){});
  }

  function checked(host, cls){'''

OLD_RET = u'''  return { render:render, checked:checked, mode:mode, matches:matches,
           countsFrom:countsFrom, _groupsOf:groupsOf };'''
NEW_RET = u'''  return { render:render, checked:checked, mode:mode, matches:matches,
           vesselsChecked:vesselsChecked,
           countsFrom:countsFrom, _groupsOf:groupsOf };'''

edit("core/organellefilter.js", [
    (u"the Vasculature section is rendered", OLD_TAIL, NEW_TAIL),
    (u"...and built, wired and asked for by its own name",
     u"  function checked(host, cls){", VSEC),
    (u"...on the module", OLD_RET, NEW_RET),
])
print("done 2")
