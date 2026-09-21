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
    const n={};
    ((d&&d.tracings)||[]).forEach(function(t){
      const k=String((t&&(t.instanceOf||t.kind))||"").toLowerCase();
      if(!k||k==="cell"||k==="nucleus")return;
      n[k]=(n[k]||0)+1;
    });
    const kinds=Object.keys(n).sort();
    if(!kinds.length){
      sel.options[1].textContent="All outlined organelles — none traced yet";
      return;
    }
    sel.options[1].textContent="All outlined organelles ("+kinds.reduce(function(a,k){return a+n[k];},0)+")";
    kinds.forEach(function(k){
      const label=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined"&&ORGANELLE_KIND_BY_VALUE[k])
                 ?(ORGANELLE_KIND_BY_VALUE[k].short||ORGANELLE_KIND_BY_VALUE[k].label||k):k;
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
const FILTER_TRACE_CAP=150;
async function buildTracedOrganelleLayers(ids,want,say){
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
  const isOrganelle=function(t){
    const k=String((t&&(t.instanceOf||t.kind))||"").toLowerCase();
    return !!k&&k!=="cell"&&k!=="nucleus";
  };
  let mine=index.filter(function(t){
    if(!t||!t.structureId||!isOrganelle(t))return false;
    if(want!=="__all"&&String(t.instanceOf||t.kind||"").toLowerCase()!==String(want).toLowerCase())
      return false;
    return nucSet.has(String(t.nucleusId||""))||rootSet.has(String(t.rootId||""));
  });
  if(!mine.length)return [];
  /* THE CAP IS SAID, NOT SILENT. One Drive read per outline is right for a cell and wrong for a
     filter that matched three hundred, and a view that quietly drew the first hundred and fifty
     would be a lie about what the dataset holds. */
  let capped=0;
  if(mine.length>FILTER_TRACE_CAP){capped=mine.length-FILTER_TRACE_CAP;mine=mine.slice(0,FILTER_TRACE_CAP);}
  const got=[];
  for(let i=0;i<mine.length;i++){
    say&&say("Reading outline "+(i+1)+"/"+mine.length+"\u2026");
    try{
      const r=await fetch(REPORT_ENDPOINT+"?tracings=1&structureId="+encodeURIComponent(mine[i].structureId)
                          +tracedOutlinesDsQS());
      const d=await r.json();
      const one=((d&&d.tracings)||[])[0];
      const st=(one&&!one.error)?(UJ.tracing.rowsToStructures(one.rows||[])[0]||null):null;
      if(st&&st.rings&&st.rings.length)got.push({t:mine[i],rings:st.rings});
    }catch(_e){/* one unreadable outline is not the view's problem */}
  }
  if(!got.length)return [];
  /* Grouped by kind, each kind's outlines in one layer, in the colour that kind was drawn in. */
  const byKind={};
  got.forEach(function(g){
    const k=String(g.t.instanceOf||g.t.kind||"organelle").toLowerCase();
    (byKind[k]=byKind[k]||[]).push(g);
  });
  const layers=[];
  Object.keys(byKind).sort().forEach(function(k){
    const anns=[];
    byKind[k].forEach(function(g,gi){
      /* The same closed loops of lines tracingViewerOpen writes for one cell -- see its header
         for why lines and not polygons. */
      (g.rings||[]).forEach(function(r,ri){
        const pts=r.points||[];
        if(pts.length<3)return;
        const z=Math.round(r.z);
        for(let i=0;i<pts.length;i++){
          const a=pts[i],b=pts[(i+1)%pts.length];
          anns.push({type:"line",id:"to"+gi+"_"+ri+"_"+i,
                     pointA:[Math.round(a[0]),Math.round(a[1]),z],
                     pointB:[Math.round(b[0]),Math.round(b[1]),z]});
        }
      });
    });
    if(!anns.length)return;
    const label=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined"&&ORGANELLE_KIND_BY_VALUE[k])
               ?(ORGANELLE_KIND_BY_VALUE[k].short||ORGANELLE_KIND_BY_VALUE[k].label||k):k;
    layers.push({type:"annotation",source:"local://annotations",tab:"annotations",
                 name:"traced "+label+" ("+byKind[k].length+")",
                 annotationColor:byKind[k][0].t.color||"#40e28c",
                 annotations:anns});
  });
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
