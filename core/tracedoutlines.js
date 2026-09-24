/* core/tracedoutlines.js — the matched cells' hand-traced outlines, in "Open all matches".  2026-09-21

   Moved out of ujump.html's Filter-and-show closure, where it was built on 2026-09-18 (its own
   notes follow, kept). organoutlinecheck.js was written first and prints the same on both sides.

   WHAT A HOST DOES
     markup   a <select id="filterOrganSeg"> with options "" (None — points only) and "__all";
              the module fills in the kinds lazily, the first time somebody reaches for it.
     call     const layers = await buildTracedOrganelleLayers({nuc:[...], root:[...]}, sel.value, say);
              with the MATCHED cells' ids — both, because a tracing is filed against whichever
              the tracer had — then push the layers onto the state it opens.
   Needs REPORT_ENDPOINT, core/tracing.js (rowsToStructures) and, for the kind labels,
   core/ontology.js's ORGANELLE_KIND_BY_VALUE. Reads name UJ.cfg.backend.ds. */
var UJ = UJ || {};
/* A kind's short name where the page has no ORGANELLE_KIND_BY_VALUE (χJump), from the same
   vocabulary through core/organelles.js. 2026-09-21. */
/* ── THE TWO KINDS THAT ARE NOT ORGANELLES ────────────────────────────────────  2026-09-23
   Søren: "There are no options to select whole cell structure in the Filter and show."
   Named here rather than looked up: tracedOutlinesKindName("cell") answers "cell", and a layer
   called "traced cell (3)" beside "traced lysosome (12)" reads as though a cell were another
   organelle. See src/a_whole_cell_is_something_you_can_pick.py. */
var TRACED_NOT_ORGANELLE = { cell: { pick: "__cells", plural: "Whole cells", layer: "whole cell" },
                             nucleus: { pick: "__nuclei", plural: "Nuclei", layer: "nucleus" } };
function tracedOutlinesKindName(k){
  try { if (window.UJ && UJ.organelles && UJ.organelles.shortOf) return UJ.organelles.shortOf(k); }
  catch (_e){}
  return k;
}
function tracedOutlinesDsQS(){
  try { if (UJ && UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds)
          return "&ds=" + encodeURIComponent(UJ.cfg.backend.ds); } catch (_e){}
  return "";
}
/* ── THE FILTERED CELLS BRING THEIR OUTLINES ──────────────────────────────────  2026-09-18
   Søren: "it should also be possible to select include organelles segmentations of a specific
   kind or all organelle segmentations for the filtered cells."

   Modelled on buildVascTraceLayers, which this handler already awaits and pushes onto the state:
   a list of ready-made annotation layers, or [] when nothing is asked for or nothing can be read.
   Nothing about which cells matched, or about the Excel export, is touched by it.

   ONE LAYER PER KIND. A filter can match hundreds of cells; a layer per outline would be a layer
   list nobody can use and a URL nobody can open. Per kind is what the organelle POINTS already do
   in this view, so the two halves of one organelle arrive as two layers you turn on together. */
/* ── THE PICKER LISTS WHAT EXISTS ─────────────────────────────────────────────  2026-09-18
   "a specific kind" has to be a list of kinds, and a list invented from the ontology would offer
   sixty-one options of which two have ever been drawn. So it is filled from the index the moment
   somebody reaches for it -- once, lazily, because a filter card that fetches on load costs every
   visitor a request for a control most of them never touch.

   THE NUMBER IS OUTLINES IN THE DATASET, and the label says so. The counts beside the organelle
   POINT checkboxes above are cells-carrying-the-structure over cells examined (see
   core/organellefilter.js, and the day that number was misread), and quietly putting a different
   unit in the same panel would be the same mistake from the other side. */
var FILTER_ORGAN_SEG_FILLED=false;
async function fillOrganSegKinds(){
  if(FILTER_ORGAN_SEG_FILLED)return;
  const sel=document.getElementById("filterOrganSeg");
  if(!sel||!REPORT_ENDPOINT)return;
  FILTER_ORGAN_SEG_FILLED=true;
  try{
    const r=await fetch(REPORT_ENDPOINT+"?tracings=1"+tracedOutlinesDsQS());
    const d=await r.json();
    const n={}, other={};
    ((d&&d.tracings)||[]).forEach(function(t){
      const k=String((t&&(t.instanceOf||t.kind))||"").toLowerCase();
      if(!k)return;
      /* A cell and a nucleus are counted apart from the organelles, and offered apart: the number
         beside "All outlined organelles" is what somebody reads to decide whether the view is
         worth opening, and a whole cell is a hundred times the contours of a lysosome. */
      if(TRACED_NOT_ORGANELLE[k]){ other[k]=(other[k]||0)+1; return; }
      n[k]=(n[k]||0)+1;
    });
    const kinds=Object.keys(n).sort();
    if(!kinds.length&&!Object.keys(other).length){
      sel.options[1].textContent="All outlined organelles — none traced yet";
      return;
    }
    sel.options[1].textContent=kinds.length
      ?"All outlined organelles ("+kinds.reduce(function(a,k){return a+n[k];},0)+")"
      :"All outlined organelles — none traced yet";
    /* Straight after "all organelles", so it is found rather than scrolled to. */
    Object.keys(TRACED_NOT_ORGANELLE).forEach(function(k){
      if(!other[k])return;
      const m=TRACED_NOT_ORGANELLE[k];
      const o=document.createElement("option");
      o.value=m.pick;
      o.textContent=m.plural+" ("+other[k]+" outlined)";
      sel.insertBefore(o, sel.options[2]||null);
    });
    kinds.forEach(function(k){
      const label=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined"&&ORGANELLE_KIND_BY_VALUE[k])
                 ?(ORGANELLE_KIND_BY_VALUE[k].short||ORGANELLE_KIND_BY_VALUE[k].label||k):tracedOutlinesKindName(k);
      const o=document.createElement("option");
      o.value=k;
      o.textContent=label.charAt(0).toUpperCase()+label.slice(1)+" ("+n[k]+" outlined)";
      sel.appendChild(o);
    });
  }catch(e){
    FILTER_ORGAN_SEG_FILLED=false;      // a hiccup is not an answer; let the next reach try again
    console.warn("[uJump filter] could not list traced organelle kinds",e);
  }
}
function tracedOutlinesWire(){
  const sel=document.getElementById("filterOrganSeg");
  if(!sel||sel.dataset.wired)return;
  sel.dataset.wired="1";
  ["focus","mousedown"].forEach(function(ev){ sel.addEventListener(ev,fillOrganSegKinds); });
}
/* ── TWO CAPS, FOR TWO DIFFERENT COSTS ────────────────────────────────────────  2026-09-23
   Søren, on picking whole cells: "We also have to keep in mind that they may be too big for showing
   in Neuroglancer if we collect all of them."

   FILTER_TRACE_CAP is a cap on READS -- one Drive file per outline -- and says so in its own note.
   It is not a cap on the LINK, and cannot be: 150 lysosomes is a small view and three whole cells
   is not. Measured 2026-09-23: six traced cells of 200 contours built a 22,397k link, ten times
   what a tab can be opened with, without the outline cap firing once.

   So the link has a cap of its own, in the unit the browser actually counts. 2,097,152 is where
   Chromium stops (measured in Søren's browser, 2026-09-22); 1,200,000 of it is offered to the
   outlines and the remaining ~900k left for what else the state carries -- segmentation layers,
   region boxes, organelle points, the EM. A caller that knows its own state can pass {budget: n}.
   See src/the_outlines_fit_the_link_they_go_in.py. */
const FILTER_TRACE_CAP=150;
const FILTER_TRACE_BUDGET=1200000;
/* What this costs in a URL, not in memory: encodeURIComponent turns every quote, brace, comma and
   colon into three characters, so JSON.stringify alone under-counts by about two thirds. */
function tracedOutlinesCost(anns){
  try { return encodeURIComponent(JSON.stringify(anns)).length; }
  catch (_e){ return Infinity; }
}
async function buildTracedOrganelleLayers(ids,want,say,opts){
  if(!want||!REPORT_ENDPOINT)return [];
  /* The cells that matched, by both ids -- a tracing is filed against whichever the tracer had. */
  const nucSet=new Set(),rootSet=new Set();
  ((ids&&ids.nuc)||[]).forEach(function(n){if(n)nucSet.add(String(n));});
  ((ids&&ids.root)||[]).forEach(function(r){if(r&&r!=="0")rootSet.add(String(r));});
  if(!nucSet.size&&!rootSet.size)return [];
  let index=[];
  try{
    say&&say("Looking up traced outlines\u2026");
    const r=await fetch(REPORT_ENDPOINT+"?tracings=1"+tracedOutlinesDsQS());
    const d=await r.json();
    index=(d&&d.tracings)||[];
  }catch(e){console.warn("[uJump filter] tracings index unavailable",e);return [];}
  const kindOf=function(t){ return String((t&&(t.instanceOf||t.kind))||"").toLowerCase(); };
  /* WHAT THIS SELECTION MEANS (2026-09-23). "__all" is every ORGANELLE, as it always was; the two
     kinds that are not organelles answer to pickers of their own. */
  const wantedKind=(function(){
    for(var k in TRACED_NOT_ORGANELLE)
      if(TRACED_NOT_ORGANELLE[k].pick===want)return k;
    return "";
  })();
  const takes=function(t){
    const k=kindOf(t);
    if(!k)return false;
    if(wantedKind)return k===wantedKind;
    if(want==="__all")return !TRACED_NOT_ORGANELLE[k];
    return k===String(want).toLowerCase();
  };
  let mine=index.filter(function(t){
    if(!t||!t.structureId||!takes(t))return false;
    return nucSet.has(String(t.nucleusId||""))||rootSet.has(String(t.rootId||""));
  });
  if(!mine.length)return [];
  /* THE CAP IS SAID, NOT SILENT. One Drive read per outline is right for a cell and wrong for a
     filter that matched three hundred, and a view that quietly drew the first hundred and fifty
     would be a lie about what the dataset holds. */
  let capped=0;
  if(mine.length>FILTER_TRACE_CAP){capped=mine.length-FILTER_TRACE_CAP;mine=mine.slice(0,FILTER_TRACE_CAP);}
  /* TOGETHER, 2026-09-22 -- one request per twenty, and nothing twice in a page. They were read
     one after another, fifteen cold calls in a row. See src/the_outlines_come_in_one_request.py.
     One unreadable outline is not the view's problem: it is simply not drawn. */
  const got=[];
  say&&say("Reading "+mine.length+" outline"+(mine.length===1?"":"s")+"\u2026");
  const res=await UJ.tracing.fetchMany(REPORT_ENDPOINT,mine,tracedOutlinesDsQS(),function(d,n){
    say&&say("Reading outlines "+d+"/"+n+"\u2026"); });
  mine.forEach(function(t){
    const x=res[t.structureId];
    if(x&&x.st&&x.st.rings&&x.st.rings.length)got.push({t:t,rings:x.st.rings});
  });
  if(!got.length)return [];
  /* Grouped by kind, each kind's outlines in one layer, in the colour that kind was drawn in. */
  const byKind={};
  got.forEach(function(g){
    const k=String(g.t.instanceOf||g.t.kind||"organelle").toLowerCase();
    (byKind[k]=byKind[k]||[]).push(g);
  });
  /* ── AS MANY AS THE LINK WILL TAKE ────────────────────────────────────────────  2026-09-23
     The annotations are made first and measured as they go, and an outline that does not fit the
     remaining budget is left out whole -- never half an outline, which would be a shape nobody
     traced. Order is the index's, so what you get is the first N rather than an arbitrary N. */
  const budget=(opts&&opts.budget!==undefined)?opts.budget:FILTER_TRACE_BUDGET;
  const madeFor={}; let spent=0, tooBig=0;
  Object.keys(byKind).sort().forEach(function(k){
    madeFor[k]=[];
    byKind[k].forEach(function(g,gi){
      /* The same annotations tracingViewerOpen writes for one cell: one closed POLYLINE per
         contour (2026-09-22, src/the_viewer_link_is_polylines.py). */
      const a=UJ.tracing.ringAnnotations(g.rings||[],"to"+gi);
      if(!a||!a.length)return;
      const cost=tracedOutlinesCost(a);
      if(spent+cost>budget){ tooBig++; return; }
      spent+=cost;
      [].push.apply(madeFor[k],a);
    });
  });
  const layers=[];
  Object.keys(byKind).sort().forEach(function(k){
    const anns=madeFor[k]||[];
    if(!anns.length)return;
    const label=TRACED_NOT_ORGANELLE[k]?TRACED_NOT_ORGANELLE[k].layer
               :((typeof ORGANELLE_KIND_BY_VALUE!=="undefined"&&ORGANELLE_KIND_BY_VALUE[k])
                 ?(ORGANELLE_KIND_BY_VALUE[k].short||ORGANELLE_KIND_BY_VALUE[k].label||k)
                 :tracedOutlinesKindName(k));
    layers.push({type:"annotation",source:"local://annotations",tab:"annotations",
                 name:"traced "+label+" ("+byKind[k].length+")",
                 annotationColor:byKind[k][0].t.color||"#40e28c",
                 annotations:anns});
  });
  /* SAID, NOT SILENT -- the same rule the reads cap follows six lines down, for the same reason:
     somebody reading this view is deciding what to trace next. */
  if(tooBig&&typeof showSubmitToast==="function"){
    /* WHY, WHEN THE ANSWER IS THE VIEWER. On one that cannot read polylines every EDGE of every
       contour is its own annotation, so a single whole cell is already over the budget and the
       honest view is empty -- measured here: three traced cells are 180 contours and 712k as
       polylines, and nothing at all as lines. An empty view with no reason is the worst of the
       three outcomes, so the reason somebody can act on is named. */
    var shapeWhy="";
    try {
      if(UJ.tracing&&UJ.tracing.viewerTakesPolylines&&!UJ.tracing.viewerTakesPolylines())
        shapeWhy=" This viewer cannot read polyline annotations, so every edge of every contour is "
               +"its own line and these outlines cost about four times what they need to \u2014 "
               +"Spelunker and neuroglancer-demo read polylines, and the same cells fit there.";
    } catch (_sw){}
    showSubmitToast(false,(got.length===tooBig
        ?"Not one of these "+tooBig+" outlines fits a viewer link on its own"
        :"Left "+tooBig+" outline"+(tooBig===1?"":"s")+" out")
      +" \u2014 a viewer link cannot be opened past 2,097,152 characters"
      +(got.length===tooBig?"":", and the ones drawn already fill it")+". Pick one kind rather "
      +"than all, or narrow the filter. A whole cell is a hundred times the contours of a "
      +"lysosome."+shapeWhy);
  }
  if(capped&&typeof showSubmitToast==="function")
    showSubmitToast(false,"Drew "+got.length+" traced outline"+(got.length===1?"":"s")
      +" and left "+capped+" out \u2014 the view reads one file per outline, so it stops at "
      +FILTER_TRACE_CAP+". Narrow the filter, or pick one kind rather than all.");
  return layers;
}
if (typeof document !== "undefined"){
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tracedOutlinesWire);
  else tracedOutlinesWire();
}
