# -*- coding: utf-8 -*-
u"""Every tool can tick a traced whole cell, not only µJump.                              2026-09-24

Søren: "The whole cell and nucleus filter should work on all the tools. Does it?"

It did not. Measured across the family before anything was changed:

    ujump    extraGroups=2  tracedKindCounts=2  tracedKindHas=1
    djump    0              0                   0
    pjump    0              0                   0
    hjump    0              0                   0
    bjump    0              0                   0
    ljump    0              0                   0
    wjump    0              0                   0
    xjump    0              0                   0

One tool in eight, which is the tool the feature was written on. The other seven carry the same
control (core/organellefilter.js) and the same index reader (core/tracedoutlines.js); what they
lacked was the two lines that join them.

TWO SHAPES, and they take different work.

    δ and π are µJump-shaped. Two lists -- a FILTER list and a LAYER list -- and a hasOne() closure
    of their own that answers "does this cell have one" inline. They get µJump's four edits, which
    is the whole feature including a tick in the layer list drawing the outlines.

    η, β, λ, ω and χ share the rule: they call UJ.organelleFilter.matches(have, want, mode), and
    `have` is whatever their own organelle reports gave. So the lookup went into the SHARED RULE as
    an optional fourth argument (see src/a_traced_cell_is_a_thing_you_can_tick.py section 4): a
    tool that hands over the cell's ids gets the two kinds answered there, a tool that hands over
    nothing behaves exactly as it did. Five tools, one line each, rather than five copies of the
    same five lines drifting apart -- which this family has already done once.

    Those five have no layer LIST; they pick extra layers with the #filterOrganSeg dropdown, which
    has offered "Whole cells" and "Nuclei" since src/a_whole_cell_is_something_you_can_pick.py. So
    nothing is missing there, and nothing is added.

THE IDS ARE EACH TOOL'S OWN, and this is the part that cannot be shared. A tracing is filed against
whichever id the tracer had, and the tools do not agree on what a cell is called:

    η   HSB[i] (the cell body) and c3Id(i) (the c3 segment)
    β   BID[i] and BSEG[i]
    λ   BID[i]; Lee16 has no segmentation, so there is no root id to give
    ω   the nucleus key, n.id
    χ   the cell KEY, u.key -- a χJump cell is an assembly, not a segment

WHY THE CACHE IS NOW KEYED BY DATASET. ωJump switches volume while the page is open and rebuilds
its controls when it does. A single cached index meant the second volume's counts were the first
volume's. Nobody had hit it because ωJump had no such counts until today.

Checks, both written first:
  tracedkindalltoolscheck.js         the list and the filtering, per page, in a browser
  wjump-build/wjtracedkindcheck.js   ωJump's matching, headless -- its nuclei come out of a volume
                                     no file:// harness can read, so "Preview matches" has nothing
                                     to match there; 6 of its 8 assertions failed before this.

Run: python3 src/every_tool_can_tick_a_traced_cell.py, then python3 src/build_stamps.py, then
python3 wjump-build/build_wjump.py and python3 xjump-build/build_xjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _build(name):
    u"""wjump-build/ and xjump-build/ sit beside microns-neuroglancer-tool/ in Søren's tree; this
    working copy keeps them one level further out. Both spellings are tried rather than one being
    assumed, because getting it wrong writes a page nobody ships."""
    for c in (os.path.join(HERE, "..", name), os.path.join(HERE, "..", "xw", name)):
        if os.path.isdir(c):
            return os.path.normpath(c)
    raise SystemExit("cannot find %s/ beside %s" % (name, HERE))


def edit(path, pairs):
    P = path if os.path.isabs(path) else os.path.join(HERE, path)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


WJ = _build("wjump-build")
XJ = _build("xjump-build")


# ── 1. the index is cached per dataset, because ωJump changes dataset while it is open ─────────
edit("core/tracedoutlines.js", [
 (u"the cached index remembers which dataset it is of",
  u'''var TRACED_KIND_SETS = null, TRACED_KIND_WAIT = null;''',
  u'''var TRACED_KIND_SETS = null, TRACED_KIND_WAIT = null, TRACED_KIND_DS = null;'''),

 (u"...and is dropped when that changes",
  u'''function tracedKindSets(force){
  if (TRACED_KIND_SETS && !force) return Promise.resolve(TRACED_KIND_SETS);
  if (TRACED_KIND_WAIT && !force) return TRACED_KIND_WAIT;''',
  u'''function tracedKindSets(force){
  /* ── ONE CACHE PER DATASET ─────────────────────────────────  2026-09-24
     ωJump switches volume with the page open and rebuilds its controls when it does, so a single
     cached index would show the previous volume's counts beside the new volume's cells. Nothing
     had hit this before, because ωJump had no such counts until today. */
  var ds = tracedOutlinesDsQS();
  if (ds !== TRACED_KIND_DS){ TRACED_KIND_SETS = null; TRACED_KIND_WAIT = null; TRACED_KIND_DS = ds; }
  if (TRACED_KIND_SETS && !force) return Promise.resolve(TRACED_KIND_SETS);
  if (TRACED_KIND_WAIT && !force) return TRACED_KIND_WAIT;'''),

 (u"...and the fetch uses the dataset it just decided on",
  u'''  TRACED_KIND_WAIT = fetch(REPORT_ENDPOINT + "?tracings=1" + tracedOutlinesDsQS())''',
  u'''  TRACED_KIND_WAIT = fetch(REPORT_ENDPOINT + "?tracings=1" + ds)'''),
])


# ── 1b. a caller that brings its own vocabulary can still add a group ──────────────────
edit("core/organellefilter.js", [
 (u"extraGroups survives an explicit groups list",
  u"""  function groupsOf(opts){
    if (opts && opts.groups) return opts.groups;
    /* \u2500\u2500 A GROUP THE ONTOLOGY DOES NOT HAVE""",
  u"""  function groupsOf(opts){
    /* \u2500\u2500 A GROUP THE ONTOLOGY DOES NOT HAVE"""),

 (u"...and the base is whichever vocabulary the caller meant",
  u"""    var base = baseGroups();
    if (opts && opts.extraGroups && opts.extraGroups.length)""",
  u"""    /* `groups` REPLACES the ontology; `extraGroups` ADDS to whatever it ended up being. The two
       were written a day apart and an early return on `groups` quietly made them exclusive — so
       χJump, the one tool that passes its own vocabulary because it generates it into its own page,
       was the one tool that got no traced-outline group. 2026-09-24. */
    var base = (opts && opts.groups) ? opts.groups : baseGroups();
    if (opts && opts.extraGroups && opts.extraGroups.length)"""),
])

# ── 2. ηJump ───────────────────────────────────────────────────────────────────────────────────
edit("hjump.html", [
 (u"η: the list carries the two kinds",
  u'''    UJ.organelleFilter.render(box,{
      counts:counts, cls:"forganelle", modeId:"filterOrganelleMode",''',
  u'''    UJ.organelleFilter.render(box,{
      /* Whole cells and nuclei somebody has OUTLINED — a group of their own, counted off the
         traced-structures index rather than the organelle-locations sheet (2026-09-24). */
      counts:Object.assign(counts,(typeof tracedKindCounts==="function")?tracedKindCounts():{}),
      extraGroups:(typeof tracedKindGroup==="function")?tracedKindGroup():null,
      cls:"forganelle", modeId:"filterOrganelleMode",'''),

 (u"η: ...and the cell's ids reach the rule",
  u'''      if(!UJ.organelleFilter.matches(hjumpOrganelleKindsOf(i),wantOrganelles,organelleMode))continue;''',
  u'''      /* BOTH ids: a tracing on this page is filed with the cell body as its nucleusId and the
         c3 segment as its rootId, and either may be the one it was saved under. */
      if(!UJ.organelleFilter.matches(hjumpOrganelleKindsOf(i),wantOrganelles,organelleMode,
                                     {nuc:String(HSB[i]),root:c3Id(i)}))continue;'''),

 (u"η: the index is read once and the list redrawn",
  u'''  buildOrganelleFilterUI();''',
  u'''  buildOrganelleFilterUI();
  /* ── THE TRACED-OUTLINE KINDS ────────────────────────────────  2026-09-24
     Read once, then the list is drawn again with the counts in it. The renderer keeps the ticks
     across a redraw, so this cannot take away a choice already made, and the organelle fetch it
     goes back through is itself cached. Exposed for tracedkindalltoolscheck.js. */
  window.tracedKindsRefresh=function(force){
    if(typeof tracedKindSets!=="function")return Promise.resolve();
    return tracedKindSets(force).then(function(){ try{ buildOrganelleFilterUI(); }catch(_e){} });
  };
  try{ window.tracedKindsRefresh(); }catch(_e){}'''),
])


# ── 3. λJump ───────────────────────────────────────────────────────────────────────────────────
edit("ljump.html", [
 (u"λ: the list carries the two kinds",
  u'''      UJ.organelleFilter.render(organellesBox,{
        counts:counts, cls:"forganelle", modeId:"fOrganelleMode",''',
  u'''      UJ.organelleFilter.render(organellesBox,{
        counts:Object.assign(counts,(typeof tracedKindCounts==="function")?tracedKindCounts():{}),
        /* Outlined whole cells and nuclei, from the traced-structures index (2026-09-24). */
        extraGroups:(typeof tracedKindGroup==="function")?tracedKindGroup():null,
        cls:"forganelle", modeId:"fOrganelleMode",'''),

 (u"λ: ...and the cell's id reaches the rule",
  u'''      if(!UJ.organelleFilter.matches(ljumpOrganelleKindsOf(i),organelleSel,organelleMode)) continue;''',
  u'''      /* Lee16 has no segmentation, so a tracing here is filed by nucleus id and there is no
         root id to offer — which is what the filter's own "Open all" already passes. */
      if(!UJ.organelleFilter.matches(ljumpOrganelleKindsOf(i),organelleSel,organelleMode,
                                     {nuc:BID[i]?String(BID[i]):"",root:""})) continue;'''),

 (u"λ: the index is read once and the list redrawn",
  u'''  window.__ljumpBuildOrganelleFilterBox=buildOrganelleFilterBox;''',
  u'''  window.__ljumpBuildOrganelleFilterBox=buildOrganelleFilterBox;
  /* The traced-outline kinds, read once and the list redrawn with their counts (2026-09-24).
     The renderer keeps the ticks across a redraw. */
  window.tracedKindsRefresh=function(force){
    if(typeof tracedKindSets!=="function")return Promise.resolve();
    return tracedKindSets(force).then(function(){ try{ buildOrganelleFilterBox(); }catch(_e){} });
  };
  try{ window.tracedKindsRefresh(); }catch(_e){}'''),
])


# ── 4. βJump ───────────────────────────────────────────────────────────────────────────────────
edit("bjump.html", [
 (u"β: the list carries the two kinds",
  u'''    UJ.organelleFilter.render(organellesBox,{
      counts:counts||{}, cls:"forganelle", modeId:"fOrganelleMode",''',
  u'''    UJ.organelleFilter.render(organellesBox,{
      counts:Object.assign(counts||{},(typeof tracedKindCounts==="function")?tracedKindCounts():{}),
      /* Outlined whole cells and nuclei, from the traced-structures index (2026-09-24). */
      extraGroups:(typeof tracedKindGroup==="function")?tracedKindGroup():null,
      cls:"forganelle", modeId:"fOrganelleMode",'''),

 (u"β: ...and the cell's ids reach the rule",
  u'''      if(!UJ.organelleFilter.matches(bjumpOrganelleKindsOf(i),organelleSel,organelleMode))continue;''',
  u'''      /* Both ids, as this page's own "Open all" passes them: the segmentation covers about half
         the block, so a tracing may be filed under either. */
      if(!UJ.organelleFilter.matches(bjumpOrganelleKindsOf(i),organelleSel,organelleMode,
                                     {nuc:String(BID[i]),root:BSEG[i]?String(BSEG[i]):""}))continue;'''),

 (u"β: the index is read once and the list redrawn",
  u'''  window.__bjumpBuildOrganelleFilterBox=buildOrganelleFilterBox;''',
  u'''  window.__bjumpBuildOrganelleFilterBox=buildOrganelleFilterBox;
  /* The traced-outline kinds, read once and the list redrawn with their counts (2026-09-24).
     buildOrganelleFilterBox draws immediately with zeroes and fills the counts in when its own
     fetch lands, so going back through it cannot blank the list. */
  window.tracedKindsRefresh=function(force){
    if(typeof tracedKindSets!=="function")return Promise.resolve();
    return tracedKindSets(force).then(function(){ try{ buildOrganelleFilterBox(); }catch(_e){} });
  };
  try{ window.tracedKindsRefresh(); }catch(_e){}'''),
])


# ── 5. ωJump (built: wjump-build/) ─────────────────────────────────────────────────────────────
edit(os.path.join(WJ, "wjump_app.js"), [
 (u"ω: the list carries the two kinds",
  u'''    UJ.organelleFilter.render(fEl("f-organelles"), {
      counts: counts, cls: "forganelle", modeId: "f-organelle-mode",''',
  u'''    UJ.organelleFilter.render(fEl("f-organelles"), {
      /* Outlined whole cells and nuclei — not organelles, and not in this volume's organelle
         tallies, so they come from the traced-structures index (2026-09-24). */
      counts: Object.assign(counts, (typeof tracedKindCounts === "function") ? tracedKindCounts() : {}),
      extraGroups: (typeof tracedKindGroup === "function") ? tracedKindGroup() : null,
      cls: "forganelle", modeId: "f-organelle-mode",'''),

 (u"ω: the index is read once and the controls redrawn",
  u'''  function renderFilterControls(){''',
  u'''  /* ── THE TRACED-OUTLINE KINDS ───────────────────────────────  2026-09-24
     Read once per volume and the controls drawn again with the counts in them. The index itself is
     cached per dataset in core/tracedoutlines.js, so the switch that rebuilds these controls also
     gets the right numbers rather than the previous volume's.
     Declared before renderFilterControls only because that reads better; the function is hoisted. */
  window.tracedKindsRefresh = function(force){
    if (typeof tracedKindSets !== "function") return Promise.resolve();
    return tracedKindSets(force).then(function(){
      try { renderFilterControls(); } catch (e){}
    });
  };
  function renderFilterControls(){'''),

 (u"ω: ...and it is asked again when the volume changes",
  u'''    renderFilterControls();
    if (FRESULT) filterInvalidate();''',
  u'''    renderFilterControls();
    try { window.tracedKindsRefresh(); } catch (e){}
    if (FRESULT) filterInvalidate();'''),
])

edit(os.path.join(WJ, "wjump_logic.js"), [
 (u"ω: the nucleus's id reaches the rule",
  u'''        if (!UJ.organelleFilter.matches(have, organelles, oMode)) return;''',
  u'''        /* The nucleus key is what a tracing here is filed under (nucleusId); this volume has
           no flat cell segmentation to offer a root id from. */
        if (!UJ.organelleFilter.matches(have, organelles, oMode, { nuc: String(n.id), root: "" })) return;'''),
])


# ── 6. χJump (built: xjump-build/) ─────────────────────────────────────────────────────────────
edit(os.path.join(XJ, "xjump_app.js"), [
 (u"χ: the list carries the two kinds",
  u'''    UJ.organelleFilter.render(host, {
      counts: counts,''',
  u'''    UJ.organelleFilter.render(host, {
      /* Outlined whole cells and nuclei, counted off the traced-structures index rather than the
         organelle log — a whole cell is not an organelle and is not in it (2026-09-24). */
      counts: Object.assign(counts, (typeof tracedKindCounts === "function") ? tracedKindCounts() : {}),
      extraGroups: (typeof tracedKindGroup === "function") ? tracedKindGroup() : null,'''),

 (u"χ: ...and the cell's key reaches the rule",
  u'''        if (!UJ.organelleFilter.matches(have, orgWant, orgMode)) return false;''',
  u'''        /* By KEY: a χJump cell is an assembly rather than a segment, and the tracing card
           files a tracing here under the cell key. */
        if (!UJ.organelleFilter.matches(have, orgWant, orgMode, { nuc: u.key, root: "" })) return false;'''),

 (u"χ: the index is read once and the list redrawn",
  u'''  function buildOrganelleFilter(){''',
  u'''  /* The traced-outline kinds, read once and the list redrawn with their counts (2026-09-24).
     The renderer keeps the ticks across a redraw. Hoisted, so the order here is only readability. */
  window.tracedKindsRefresh = function(force){
    if (typeof tracedKindSets !== "function") return Promise.resolve();
    return tracedKindSets(force).then(function(){
      try { buildOrganelleFilter(); } catch (e){}
    });
  };
  function buildOrganelleFilter(){'''),

 (u"χ: ...and asked for on load",
  u'''    buildOrganelleFilter();''',
  u'''    buildOrganelleFilter();
    try { window.tracedKindsRefresh(); } catch (e){}'''),
])


# ── 7. δJump and πJump: µJump-shaped, so they get the whole of it ──────────────────────────────
MU = [
 (u"the layer list carries the two kinds",
  u'''    UJ.organelleFilter.render(orgBox,{
      counts:(typeof ujumpOrganelleCounts==="function")?ujumpOrganelleCounts(orgMap):{},
      cls:"forgpt",
      mode:false,''',
  u'''    UJ.organelleFilter.render(orgBox,{
      counts:Object.assign((typeof ujumpOrganelleCounts==="function")?ujumpOrganelleCounts(orgMap):{},
                           (typeof tracedKindCounts==="function")?tracedKindCounts():{}),
      /* Whole cells and nuclei that somebody has OUTLINED — not organelles, and not in the
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
  /* ── THE TRACED-OUTLINE KINDS ────────────────────────────────  2026-09-24
     Read once and both lists redrawn, which is the same shape the organelle map above uses and for
     the same reason: the counts are what make the checkboxes worth having, and a filter that
     fetched on every render would ask again on every tick. organelleFilter.render() preserves the
     ticks across a redraw, so this cannot take away a choice already made. */
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
  u'''    const organSegLayers=(typeof buildTracedOrganelleLayers==="function")
      ? await buildTracedOrganelleLayers(
          {nuc:lastResult.matches.map(function(m){return rowNucId(m.row);}),
           root:lastResult.matches.map(function(m){return rowRootId(m.row);})},
          organSegSel&&organSegSel.value,function(msg){viewAllBtn.textContent=msg;})
      : [];''',
  u'''    const organSegIds={nuc:lastResult.matches.map(function(m){return rowNucId(m.row);}),
                       root:lastResult.matches.map(function(m){return rowRootId(m.row);})};
    const organSegLayers=(typeof buildTracedOrganelleLayers==="function")
      ? await buildTracedOrganelleLayers(organSegIds,
          organSegSel&&organSegSel.value,function(msg){viewAllBtn.textContent=msg;})
      : [];
    /* ── AND WHAT THE LAYER LIST ASKED FOR ──────────────────────────  2026-09-24
       Søren: "tick either Whole cell or Nucleus to select for those and to show their 3D
       structures." The dropdown above picks ONE thing to draw; these are ticks, and several can be
       on at once, so they are asked for one at a time and added to what the dropdown gave. */
    const tracedTicks=(typeof TRACED_KIND_VALUES!=="undefined"&&typeof buildTracedOrganelleLayers==="function")
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
for _pg in ("djump.html", "pjump.html"):
    print("  " + _pg)
    edit(_pg, MU)


# ── 8. the two build guards are told which served lines this replaces ──────────────────────────
u"""ωJump and χJump refuse to write a page whose code lines the build no longer produces -- the
guard that stops a rebuild silently reverting a week of fixes. A core or app change that REPLACES a
line looks exactly like that from the outside, so each one is declared. The ω side is declared
through wjump-build/src/wjump_core_lines_replaced.py (run it, then build_wjump.py); the χ side is
two lines of its own app, declared here."""
edit(os.path.join(XJ, "build_xjump.py"), [
 (u"χ: the guard is told about the two replaced lines",
  u'''        'cellIdsFor: function(rootIn){ var c = xjumpCellOf("", rootIn); return c ? c.segs : []; }',
    ]''',
  u'''        'cellIdsFor: function(rootIn){ var c = xjumpCellOf("", rootIn); return c ? c.segs : []; }',
        # 2026-09-24, src/every_tool_can_tick_a_traced_cell.py: the organelle list gained the two
        # traced kinds and their counts, and the matching call gained the cell's key. Replaced
        # lines of this build's own, not hand edits to the served page.
        'counts: counts,',
        'if (!UJ.organelleFilter.matches(have, orgWant, orgMode)) return false;'
    ]'''),
])
