# -*- coding: utf-8 -*-
u"""A traced whole cell, and a traced nucleus, are things you can tick.                   2026-09-24

Søren: "I need to be able to filter for only the cells that have whole cell structures, and it shows
93 matches even though there are only 4. Please make a tick in the two organelle boxes where I can
tick either Whole cell or Nucleus to select for those and to show their 3D structures."

THE 93 WAS RIGHT, AND THAT IS THE PROBLEM. What he picked -- "Traced organelle outlines" -- sits
under a heading that says "Add extra layers to the 3D view (optional -- doesn't change which cells
match)", and it does not. With nothing ticked in the organelle list, "Has the ticked structure(s)
annotated" means "has ANY annotation", and 93 cells do. Nothing was broken. There was simply no way
to ask the question, because the list is built from the organelle ontology and a whole cell is not
in it -- it is not an organelle, and it is not in the organelle-locations sheet either. It is in the
traced-structures index, which no part of that filter had ever read.

SO THE TWO LISTS GAIN TWO KINDS OF THEIR OWN, in a group of their own:

    __traced_cell      cells somebody has outlined the whole of
    __traced_nucleus   cells somebody has outlined the nucleus of

A GROUP OF THEIR OWN, not folded in among the organelles, for the reason the picker already keeps
them separate (src/a_whole_cell_is_something_you_can_pick.py): a whole cell is not an organelle, and
mixing them would quietly change what the neighbouring numbers mean.

THE COUNT IS CELLS, which is the unit every other number in that panel uses and has been misread
once already -- "Nucleoplasmic reticulum says 1, when there are hundreds of them". Two outlines of
one cell count once, because the number beside a checkbox has to be the number of cells that
checkbox can return.

THREE PIECES:
  core/organellefilter.js   gains `extraGroups`, so a caller can append a group without replacing
                            the ontology. Every tool with this control can use it.
  core/tracedoutlines.js    reads the traced-structures index once, caches it, and answers which
                            cells carry a traced cell or nucleus -- by nucleus id AND root id,
                            because a tracing is filed against whichever the tracer had.
  the page                  supplies the counts, answers hasOne() for the two kinds, and lets a
                            tick in the LAYER list draw those outlines.

Check: tracedkindcheck.js, written first; 12 of its assertions failed before this went in.
Run: python3 src/a_traced_cell_is_a_thing_you_can_tick.py, then python3 src/build_stamps.py, then
python3 wjump-build/build_wjump.py and python3 xjump-build/build_xjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── 1. the filter control can be given a group of its own ──────────────────────────────────────
edit("core/organellefilter.js", [
 (u"extraGroups",
  u'''  function groupsOf(opts){
    if (opts && opts.groups) return opts.groups;''',
  u'''  function groupsOf(opts){
    if (opts && opts.groups) return opts.groups;
    /* ── A GROUP THE ONTOLOGY DOES NOT HAVE ──────────────────────────────────────  2026-09-24
       Søren wanted to filter on "has somebody outlined the whole of this cell", which is a real
       question about the dataset and is not an organelle. `extraGroups` appends without replacing,
       so a caller adds a question rather than taking over the list.
       See src/a_traced_cell_is_a_thing_you_can_tick.py. */
    var base = baseGroups();
    if (opts && opts.extraGroups && opts.extraGroups.length)
      return base.concat(opts.extraGroups);
    return base;
  }
  function baseGroups(opts){'''),
])


# ── 2. which cells carry a traced whole cell or nucleus ────────────────────────────────────────
INDEX = u'''/* ── WHICH CELLS HAVE BEEN OUTLINED ───────────────────────────────────────────  2026-09-24
   Søren: "I need to be able to filter for only the cells that have whole cell structures."

   The organelle filter asks the organelle-locations sheet; a traced whole cell is not in it. This
   reads the traced-structures index -- the same one the outline picker reads -- once per page, and
   answers which cells carry one. By nucleus id AND root id, because a tracing is filed against
   whichever the tracer had, and by both scoped and bare ids, because a dataset prefixes them.

   Cached: the filter renders on load and again whenever counts arrive, and a fetch per render
   would be a request every time somebody ticks anything.
   See src/a_traced_cell_is_a_thing_you_can_tick.py. */
var TRACED_KIND_SETS = null, TRACED_KIND_WAIT = null;
var TRACED_KIND_VALUES = { "__traced_cell": "cell", "__traced_nucleus": "nucleus" };
function tracedKindIds(t){
  var out = [];
  ["nucleusId", "rootId"].forEach(function(f){
    var v = String((t && t[f]) || "").trim();
    if (!v) return;
    out.push(v);
    var i = v.indexOf(":");                 // "<dataset>:<id>" -- both spellings answer
    if (i >= 0) out.push(v.slice(i + 1));
  });
  return out;
}
function tracedKindSets(force){
  if (TRACED_KIND_SETS && !force) return Promise.resolve(TRACED_KIND_SETS);
  if (TRACED_KIND_WAIT && !force) return TRACED_KIND_WAIT;
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return Promise.resolve({ cell: {}, nucleus: {} });
  TRACED_KIND_WAIT = fetch(REPORT_ENDPOINT + "?tracings=1" + tracedOutlinesDsQS())
    .then(function(r){ return r.json(); })
    .then(function(d){
      var sets = { cell: {}, nucleus: {} };
      ((d && d.tracings) || []).forEach(function(t){
        var k = String((t && (t.instanceOf || t.kind)) || "").toLowerCase();
        if (k !== "cell" && k !== "nucleus") return;
        tracedKindIds(t).forEach(function(id){ sets[k][id] = 1; });
      });
      TRACED_KIND_SETS = sets; TRACED_KIND_WAIT = null;
      return sets;
    }, function(e){
      TRACED_KIND_WAIT = null;
      console.warn("[traced kinds] index unavailable", e);
      return { cell: {}, nucleus: {} };
    });
  return TRACED_KIND_WAIT;
}
/* Does THIS cell carry one? `value` is a __traced_ pseudo-kind; anything else is not ours. */
function tracedKindHas(value, nucId, rootId){
  var k = TRACED_KIND_VALUES[value];
  if (!k || !TRACED_KIND_SETS) return false;
  var set = TRACED_KIND_SETS[k] || {};
  var ids = tracedKindIds({ nucleusId: nucId, rootId: rootId });
  for (var i = 0; i < ids.length; i++) if (set[ids[i]]) return true;
  return false;
}
/* CELLS, not tracings -- the unit every other number in that panel uses. */
function tracedKindCounts(){
  var c = {};
  c.__traced_cell = TRACED_KIND_SETS ? Object.keys(TRACED_KIND_SETS.cell || {}).length : 0;
  c.__traced_nucleus = TRACED_KIND_SETS ? Object.keys(TRACED_KIND_SETS.nucleus || {}).length : 0;
  /* An id counted twice -- once scoped, once bare -- would double it. Both spellings of one cell
     are in the set on purpose, so the count is halved where both are present. */
  ["cell", "nucleus"].forEach(function(k){
    if (!TRACED_KIND_SETS) return;
    var ids = Object.keys(TRACED_KIND_SETS[k] || {}), bare = {};
    ids.forEach(function(id){ var i = id.indexOf(":"); bare[i >= 0 ? id.slice(i + 1) : id] = 1; });
    c[k === "cell" ? "__traced_cell" : "__traced_nucleus"] = Object.keys(bare).length;
  });
  return c;
}
/* The group the two lists show. Empty when the page has no backend to ask. */
function tracedKindGroup(){
  return [{ label: "Traced outlines (whole structures)", kinds: [
    { value: "__traced_cell", label: "Whole cell (traced)", short: "Whole cell (traced)" },
    { value: "__traced_nucleus", label: "Nucleus (traced)", short: "Nucleus (traced)" }
  ] }];
}
'''

edit("core/tracedoutlines.js", [
 (u"which cells have been outlined", u'''var FILTER_ORGAN_SEG_FILLED=false;''',
  INDEX + u'''var FILTER_ORGAN_SEG_FILLED=false;'''),
])


# ── 3. the page: both lists carry the group, and the filter answers for it ─────────────────────
PAGE = [
 (u"the layer list carries the two kinds",
  u'''    UJ.organelleFilter.render(orgBox,{
      counts:(typeof ujumpOrganelleCounts==="function")?ujumpOrganelleCounts(orgMap):{},
      cls:"forgpt",
      mode:false,''',
  u'''    UJ.organelleFilter.render(orgBox,{
      counts:Object.assign((typeof ujumpOrganelleCounts==="function")?ujumpOrganelleCounts(orgMap):{},
                           (typeof tracedKindCounts==="function")?tracedKindCounts():{}),
      /* Whole cells and nuclei that somebody has OUTLINED \u2014 not organelles, and not in the
         organelle-locations sheet, so they come from the traced-structures index and sit in a
         group of their own (2026-09-24). */
      extraGroups:(typeof tracedKindGroup==="function")?tracedKindGroup():null,
      cls:"forgpt",
      mode:false,'''),

 (u"the filter list carries them too",
  u'''    UJ.organelleFilter.render(box,{
      counts:ujumpOrganelleCounts(orgMap),
      cls:"forgfilter",
      modeId:"filterOrganelle",''',
  u'''    UJ.organelleFilter.render(box,{
      counts:Object.assign(ujumpOrganelleCounts(orgMap),
                           (typeof tracedKindCounts==="function")?tracedKindCounts():{}),
      extraGroups:(typeof tracedKindGroup==="function")?tracedKindGroup():null,
      cls:"forgfilter",
      modeId:"filterOrganelle",'''),

 (u"the index is read once, and the lists redrawn when it lands",
  u'''  renderOrganelleFilterBox(window.ORG_MAP||null);''',
  u'''  renderOrganelleFilterBox(window.ORG_MAP||null);
  /* \u2500\u2500 THE TRACED-OUTLINE KINDS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-09-24
     Read once and both lists redrawn, which is the same shape the organelle map above uses and for
     the same reason: the counts are what make the checkboxes worth having, and a filter that
     fetched on every render would ask again on every tick. organelleFilter.render() preserves the
     ticks across a redraw, so this cannot take away a choice already made.
     Exposed for tracedkindcheck.js, which needs to seed an index and redraw. */
  window.tracedKindsRefresh=function(force){
    if(typeof tracedKindSets!=="function")return Promise.resolve();
    return tracedKindSets(force).then(function(){
      try{ renderOrganelleFilterBox(window.ORG_MAP||null); }catch(_e){}
      try{ renderOrganelleLayerBox(window.ORG_MAP||null); }catch(_e){}
    });
  };
  try{ window.tracedKindsRefresh(); }catch(_e){}'''),

 (u"a cell answers for them in the filter",
  u'''        const hasOne=k=>denseHas(k)||!!(orgReports&&orgReports.some(o=>o.kind===k));''',
  u'''        /* A ticked __traced_ kind asks the traced-structures index, not the organelle
           reports: "has somebody outlined the whole of this cell" is a different question of a
           different dataset (2026-09-24). */
        const orgRid=String(rowRootId(row)||"");
        const hasOne=k=>(typeof tracedKindHas==="function"&&tracedKindHas(k,orgNid,orgRid))
                       ||denseHas(k)||!!(orgReports&&orgReports.some(o=>o.kind===k));'''),

 (u"...and a tick in the layer list draws them",
  u'''    const organSegLayers=await buildTracedOrganelleLayers(
      {nuc:lastResult.matches.map(function(m){return rowNucId(m.row);}),
       root:lastResult.matches.map(function(m){return rowRootId(m.row);})},
      organSegSel&&organSegSel.value,function(msg){viewAllBtn.textContent=msg;});''',
  u'''    const organSegIds={nuc:lastResult.matches.map(function(m){return rowNucId(m.row);}),
                       root:lastResult.matches.map(function(m){return rowRootId(m.row);})};
    const organSegLayers=await buildTracedOrganelleLayers(
      organSegIds, organSegSel&&organSegSel.value,function(msg){viewAllBtn.textContent=msg;});
    /* \u2500\u2500 AND WHAT THE LAYER LIST ASKED FOR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-09-24
       S\u00f8ren: "tick either Whole cell or Nucleus to select for those and to show their 3D
       structures." The dropdown above picks ONE thing to draw; these are ticks, and several can be
       on at once, so they are asked for one at a time and added to what the dropdown gave. */
    const tracedTicks=(typeof TRACED_KIND_VALUES!=="undefined")
      ? Array.prototype.map.call(
          document.querySelectorAll("#filterOrganellesBox .forgpt:checked"),
          function(cb){ return cb.value; }).filter(function(v){ return !!TRACED_KIND_VALUES[v]; })
      : [];
    for(const v of tracedTicks){
      const want=v==="__traced_cell"?"__cells":"__nuclei";
      if(organSegSel&&organSegSel.value===want)continue;      // the dropdown already drew it
      const more=await buildTracedOrganelleLayers(organSegIds,want,
        function(msg){viewAllBtn.textContent=msg;});
      if(more&&more.length)organSegLayers.push.apply(organSegLayers,more);
    }'''),
]
for _pg in ("ujump.html",):
    edit(_pg, PAGE)


# ── 4. every tool: the matching rule answers for the two kinds when given the cell's ids ───────
edit("core/organellefilter.js", [
 (u"matches() can answer for a traced kind",
  u'''  function matches(have, want, m){
    if (!m) return true;
    have = have || []; want = want || [];''',
  u'''  function matches(have, want, m, ids){
    if (!m) return true;
    have = have || []; want = want || [];
    /* \u2500\u2500 A TRACED WHOLE CELL IS NOT IN THE CALLER'S LIST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-09-24
       S\u00f8ren: "The whole cell and nucleus filter should work on all the tools."
       Every tool builds `have` from its own organelle reports, and a traced outline is in neither
       those nor the ontology -- it is in the traced-structures index. A tool that passes the cell's
       ids gets the two kinds answered here rather than in seven filter loops; one that passes
       nothing behaves exactly as before.
       See src/a_traced_cell_is_a_thing_you_can_tick.py. */
    if (ids && typeof tracedKindHas === "function"){
      have = have.slice();
      ["__traced_cell", "__traced_nucleus"].forEach(function(v){
        if (have.indexOf(v) < 0 && tracedKindHas(v, ids.nuc, ids.root)) have.push(v);
      });
    }'''),
])
