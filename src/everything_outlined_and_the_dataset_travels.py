# -*- coding: utf-8 -*-
u"""Everything outlined, and the dataset's own outlines travel.                         2026-09-26

Søren, having outlined an endothelial cell's whole cell, nucleus, primary cilium and centrioles:

    "I tried to download the colab notebook for this cell. While it included primary cilium and
     centrioles, the nucleus and whole cell mesh were not included in the notebook - I want them in.
     They also did not show up in the Neuroglancer window after filtering for them"

TWO CAUSES, AND THEY ARE ONE MISTAKE SEEN FROM TWO SIDES: on this panel a whole cell and a nucleus
were FILTER CRITERIA, and nothing else.

THE NOTEBOOK SENT TRACINGS_KEPT — what the pad happens to be holding in this browser. The tracing
card's own heading says as much: "kept tracings, by cell — these go into the 3D export". The cilium
and the centrioles were kept because he had just drawn them; the whole cell and the nucleus were
saved, shared and in the dataset, and nothing had loaded them back into that tab. So nothing sent
them. Asked how it should behave, he chose: always read them from the dataset.

  IT IS DONE IN core/blenderexport.js, not in four pages. downloadNotebook already receives the
  cells the export is about (opts.cells, with root_id and nucleus_id), so it has everything it needs
  to ask for their outlines itself. It becomes async and reads them before it builds. µJump, δJump,
  πJump and ηJump each change by nothing at all, which is the point: the fault was one behaviour
  living in four call sites, and the fix should not be.

  WHAT IS KEPT STILL WINS. A tracing open in the pad may carry edits the dataset has not seen, so
  the merge is by structure id with the local copy on top. Anything the dataset has and the browser
  does not is added.

  CAPPED AT FILTER_TRACE_CAP, the same 150 reads the filter uses, and said rather than silent — one
  Drive read per outline is right for a cell and wrong for a filter that matched three hundred.

THE VIEW WAS SET TO "ALL OUTLINED ORGANELLES", which by deliberate design excludes the two kinds
that are not organelles: a whole cell is a hundred times the contours of a lysosome, so they were
given pickers of their own on 2026-09-23. He had ticked "whole cell (traced)" and "nucleus
(traced)", which decides WHICH CELLS MATCH and says nothing about what is drawn. Both halves of
that are defensible and together they produced a view with nothing in it.

  SO THERE IS AN "EVERYTHING OUTLINED" — whole cells, nuclei and organelles in one view, counted
  together — and TICKING EITHER CRITERION MOVES THE PICKER TO IT. Only a picker nobody has touched
  moves: one change of the select by hand and it is left alone for the rest of the session, because
  a control that keeps undoing a deliberate choice is worse than one that never helps.

Check: tracedexportcheck.js, written first; 12 of its assertions failed before this went in. Its
fixture also records the trap that cost a run: core/tracing.js's decodePoints reads "x,y;x,y", and
a JSON array of points produces a structure with no contours — which reads exactly like a backend
that lost them.

Run: python3 src/everything_outlined_and_the_dataset_travels.py, then python3 src/build_stamps.py,
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


print("core/tracedoutlines.js")
edit("core/tracedoutlines.js", [
 # ── 1. a pick that means all of it ───────────────────────────────────────────────────────────
 (u"__everything takes every kind",
  u"""  const takes=function(t){
    const k=kindOf(t);
    if(!k)return false;
    if(wantedKind)return k===wantedKind;
    if(want==="__all")return !TRACED_NOT_ORGANELLE[k];
    return k===String(want).toLowerCase();
  };""",
  u"""  const takes=function(t){
    const k=kindOf(t);
    if(!k)return false;
    /* ── EVERYTHING MEANS EVERYTHING ────────────────────────────────  2026-09-26
       "__all" is every ORGANELLE and stays that way; the two kinds that are not organelles have
       had pickers of their own since 2026-09-23, because a whole cell is a hundred times the
       contours of a lysosome and somebody choosing "all organelles" is not asking for that.
       What was missing was the third answer: yes, all of it, I know what I am asking for.
       See src/everything_outlined_and_the_dataset_travels.py. */
    if(want==="__everything")return true;
    if(wantedKind)return k===wantedKind;
    if(want==="__all")return !TRACED_NOT_ORGANELLE[k];
    return k===String(want).toLowerCase();
  };"""),

 # ── 2. ...and the picker offers it ───────────────────────────────────────────────────────────
 (u"the picker offers everything",
  u"""    /* Straight after "all organelles", so it is found rather than scrolled to -- and in the order
       they are declared, which puts whole cells first. Each one goes after the last one inserted,
       or they come out reversed. */
    let at=sel.options[2]||null;""",
  u"""    /* ── AND ONE THAT MEANS ALL OF IT ─────────────────────────────  2026-09-26
       Above the three narrower answers, because it is the one somebody who ticked "whole cell
       (traced)" in the filter above is actually asking for, and the one the filter moves the
       picker to. The count is every outline in the dataset, organelles and whole structures
       together -- the same unit the options below it use. */
    const everyN=kinds.reduce(function(a,k){return a+n[k];},0)
                +Object.keys(other).reduce(function(a,k){return a+other[k];},0);
    if(everyN&&!sel.querySelector('option[value="__everything"]')){
      const eo=document.createElement("option");
      eo.value="__everything";
      eo.textContent="Everything outlined \\u2014 whole cells, nuclei and organelles ("+everyN+")";
      sel.insertBefore(eo, sel.options[2]||null);
    }
    /* Straight after "all organelles", so it is found rather than scrolled to -- and in the order
       they are declared, which puts whole cells first. Each one goes after the last one inserted,
       or they come out reversed. */
    let at=sel.options[3]||sel.options[2]||null;"""),
])

print("core/tracedoutlines.js -- the dataset's own outlines")
edit("core/tracedoutlines.js", [
 (u"the structures themselves, not layers",
  u"""var FILTER_ORGAN_SEG_FILLED=false;""",
  u"""/* ── THE OUTLINES THE DATASET HOLDS, AS STRUCTURES ────────────────────────────  2026-09-26
   buildTracedOrganelleLayers answers "draw these"; this answers "here they are", in the key names
   blender/trace_mesh.py uses, so a structure read out of the sheet goes into a notebook with
   nothing translating it a second time.

   WHY IT EXISTS. The Blender notebook sent only what the pad was holding — Søren's cilium and
   centrioles, drawn minutes earlier, and not the whole cell and nucleus he had saved and shared.
   See src/everything_outlined_and_the_dataset_travels.py.

   Returns { tracings: [...], capped: n }. `capped` is how many were left unread, and the caller
   says so: one Drive read per outline is right for a cell and wrong for three hundred. */
async function tracedStructuresForCells(ids, say, opts){
  if(typeof REPORT_ENDPOINT==="undefined"||!REPORT_ENDPOINT) return {tracings:[],capped:0};
  if(!window.UJ||!UJ.tracing||!UJ.tracing.fetchMany) return {tracings:[],capped:0};
  const nucSet=new Set(),rootSet=new Set();
  ((ids&&ids.nuc)||[]).forEach(function(n){ if(n&&String(n)!=="0")nucSet.add(String(n)); });
  ((ids&&ids.root)||[]).forEach(function(r){ if(r&&String(r)!=="0")rootSet.add(String(r)); });
  if(!nucSet.size&&!rootSet.size) return {tracings:[],capped:0};
  let index=[];
  try{
    say&&say("Looking up this cell\\u2019s outlines\\u2026");
    const r=await fetch(REPORT_ENDPOINT+"?tracings=1"+tracedOutlinesDsQS());
    const d=await r.json();
    index=(d&&d.tracings)||[];
  }catch(e){ console.warn("[traced export] tracings index unavailable",e); return {tracings:[],capped:0}; }
  /* BY EITHER ID, because a tracing is filed against whichever the tracer had: somebody who
     started from a coordinate inside a process has a root id and nothing in the nucleus volume. */
  let mine=index.filter(function(t){
    if(!t||!t.structureId)return false;
    return nucSet.has(String(t.nucleusId||""))||rootSet.has(String(t.rootId||""));
  });
  let capped=0;
  const cap=(typeof FILTER_TRACE_CAP!=="undefined")?FILTER_TRACE_CAP:150;
  if(mine.length>cap){ capped=mine.length-cap; mine=mine.slice(0,cap); }
  if(!mine.length) return {tracings:[],capped:capped};
  say&&say("Reading "+mine.length+" outline"+(mine.length===1?"":"s")+"\\u2026");
  const res=await UJ.tracing.fetchMany(REPORT_ENDPOINT,mine,tracedOutlinesDsQS(),function(d,n){
    say&&say("Reading outlines "+d+"/"+n+"\\u2026"); });
  const out=[];
  mine.forEach(function(t){
    const x=res[t.structureId];
    if(!x||!x.st||!x.st.rings||!x.st.rings.length)return;
    const one=(UJ.tracing.toTracings([x.st])||[])[0];
    if(!one)return;
    /* toTracings carries neither of these, and the notebook needs both: `kind` is what
       colour_policy colours by, and `root_id` is how blenderexport decides a tracing belongs to
       a cell in this export rather than judging it by where it sits. */
    one.kind=String(x.st.instanceOf||x.st.kind||t.instanceOf||t.kind||"");
    const rid=String(x.st.rootId||t.rootId||"");
    if(rid)one.root_id=rid;
    const nid=String(x.st.nucleusId||t.nucleusId||"");
    if(nid&&!one.nucleus_id)one.nucleus_id=nid;
    one.structure_id=String(t.structureId);
    out.push(one);
  });
  return {tracings:out,capped:capped};
}
/* WHAT THE PAD IS HOLDING WINS. A tracing open here may carry edits the dataset has not seen, so
   the local copy takes the id and the dataset fills in everything the browser does not have. */
function tracedMergeKept(kept, fromDataset){
  const out=(kept||[]).slice();
  const have={};
  out.forEach(function(t){
    const k=String((t&&(t.structure_id||t.structureId||t.id))||"");
    if(k)have[k]=1;
  });
  (fromDataset||[]).forEach(function(t){
    const k=String((t&&(t.structure_id||t.structureId||t.id))||"");
    if(k&&have[k])return;
    out.push(t);
  });
  return out;
}
/* ── THE PICKER FOLLOWS WHAT YOU FILTERED FOR ─────────────────────────────────  2026-09-26
   Søren ticked "whole cell (traced)" and "nucleus (traced)" and opened a view with no outlines in
   it, because those checkboxes decide which cells match and the picker decides what is drawn.
   Both are right on their own. So a criterion that names a traced structure now moves the picker
   to "Everything outlined" — ONCE, and only while nobody has set the picker by hand: a control
   that keeps undoing a deliberate choice is worse than one that never helps. Our own move does not
   dispatch a change event, so it does not count as that deliberate choice. */
var TRACED_PICK_USER_SET=false;
function tracedPickFollowWire(){
  if(tracedPickFollowWire.done||typeof document==="undefined")return;
  tracedPickFollowWire.done=true;
  document.addEventListener("change",function(e){
    const t=e.target;
    if(!t)return;
    if(t.id==="filterOrganSeg"){ TRACED_PICK_USER_SET=true; return; }
    if(!t.classList||!t.classList.contains("forganelle"))return;
    if(!t.checked||!TRACED_KIND_VALUES[t.value])return;
    const sel=document.getElementById("filterOrganSeg");
    if(!sel||TRACED_PICK_USER_SET||sel.value!=="")return;
    const put=function(){
      if(TRACED_PICK_USER_SET||sel.value!=="")return;
      if(!sel.querySelector('option[value="__everything"]'))return;
      sel.value="__everything";
    };
    /* The options are filled lazily, the first time somebody reaches for the picker -- so the tick
       that arrives first asks for them and then sets it. */
    if(sel.querySelector('option[value="__everything"]')) put();
    else if(typeof fillOrganSegKinds==="function") Promise.resolve(fillOrganSegKinds()).then(put, function(){});
  });
}
if(typeof document!=="undefined"){
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",tracedPickFollowWire);
  else tracedPickFollowWire();
}
var FILTER_ORGAN_SEG_FILLED=false;"""),
])

print("core/blenderexport.js")
edit("core/blenderexport.js", [
 (u"the notebook reads the cells' outlines itself",
  u"""  function downloadNotebook(opts){
    const nb = buildNotebook(opts);""",
  u"""  /* ── AND WHAT THE DATASET HOLDS, NOT ONLY WHAT THIS BROWSER KEPT ──────────────  2026-09-26
     Søren: "the nucleus and whole cell mesh were not included in the notebook - I want them in."
     They were saved and shared; nothing had loaded them back into that tab, and this took
     opts.tracings — the pad's own list — as the whole truth.

     Done HERE rather than in each page's click handler: this already receives the cells the export
     is about, so it has everything it needs to ask. Four call sites change by nothing, which is
     the point — the fault was one behaviour living in four places.

     A page that wants the old behaviour passes datasetTracings:false. A page without
     core/tracedoutlines.js loaded gets exactly what it got before.
     See src/everything_outlined_and_the_dataset_travels.py. */
  async function datasetTracingsFor(opts){
    if (opts.datasetTracings === false) return opts.tracings || [];
    if (typeof tracedStructuresForCells !== "function"
        || typeof tracedMergeKept !== "function") return opts.tracings || [];
    var nuc = [], root = [];
    (opts.cells || []).forEach(function(c){
      if (c && c.nucleus_id) nuc.push(String(c.nucleus_id));
      if (c && c.root_id) root.push(String(c.root_id));
    });
    if (!nuc.length && !root.length) return opts.tracings || [];
    try {
      var r = await tracedStructuresForCells({ nuc: nuc, root: root }, opts.say || null);
      if (r && r.capped && typeof showSubmitToast === "function")
        showSubmitToast(false, "These cells have more hand-traced outlines than one download reads "
          + "at once, so " + r.capped + " of them are not in this notebook. Narrow the filter and "
          + "download again to get the rest.");
      return tracedMergeKept(opts.tracings || [], (r && r.tracings) || []);
    } catch (e){
      console.warn("[blender export] could not read the dataset's outlines", e);
      return opts.tracings || [];
    }
  }
  async function downloadNotebook(opts){
    opts = Object.assign({}, opts, { tracings: await datasetTracingsFor(opts) });
    const nb = buildNotebook(opts);"""),
])
print("\nNow: python3 src/build_stamps.py, then python3 wjump-build/build_wjump.py")
