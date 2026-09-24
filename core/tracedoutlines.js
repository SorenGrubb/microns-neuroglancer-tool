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
/* ── TOO BIG TO OPEN IS NOT TOO BIG TO USE ─────────────────────────  2026-09-24
   Søren: "there should be an option to paste the JSON code yourself into a Neuroglancer instance
   when the file size is too big ... offer the user to either do the search again more limited or
   download a JSON file (if possible inside the warning)".

   2,097,152 is where Chromium refuses to open a tab -- measured in his browser on 2026-09-22, and
   the reason a view past it shows about:blank#blocked. Overridable as JUMP_LINK_MAX for the same
   reason JUMP_VIEWER_POLYLINES is overridable: so it can be driven without building a
   twenty-three megabyte view. See src/too_big_to_open_is_not_too_big_to_use.py. */
function tracedLinkMax(){
  try { if (window.JUMP_LINK_MAX > 0) return Number(window.JUMP_LINK_MAX); } catch (_e){}
  return 2097152;
}
/* His own toolbar, with a ring round the one button this is about. A data URI rather than a file
   beside the page: 9.5 kB, no second request, and nothing to go missing on a deploy. */
var TRACED_JSON_HINT = "data:image/png;base64,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";
function tracedSaveBlob(blob, name){
  var u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function(){ try { document.body.removeChild(a); URL.revokeObjectURL(u); } catch (_e){} }, 0);
}
/* The warning, with the state in it. `after` is the element it is put beneath -- the button that
   was pressed -- so it appears where the press happened rather than somewhere the page has to be
   scrolled to. Returns the panel. */
function tracedOutlinesStateOffer(after, json, chars){
  var host = after && after.parentNode ? after.parentNode : document.body;
  var old = host.querySelector ? host.querySelector(".jsonoffer") : null;
  if (old) old.parentNode.removeChild(old);
  var max = tracedLinkMax();
  var box = document.createElement("div");
  box.className = "jsonoffer";
  box.style.cssText = "flex:1 1 100%;margin:8px 0 0;padding:10px 12px;border:1px solid var(--line);"
    + "border-radius:8px;background:var(--panel);font-size:12px;line-height:1.5";
  box.innerHTML =
      '<p style="margin:0 0 6px"><b style="color:var(--bad)">This view is too big to open in a tab.</b> '
    + "It is " + chars.toLocaleString() + " characters, and a browser refuses past "
    + max.toLocaleString() + " — the tab would come up blank (about:blank#blocked). "
    + "Nothing is wrong with the view itself.</p>"
    + '<p style="margin:0 0 8px">Two ways on: narrow the search until it fits, or take the state '
    + "and paste it into Neuroglancer yourself, which has no size limit at all.</p>"
    + '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">'
    + '<button type="button" class="idbtn jsoncopy">Copy the JSON</button>'
    + '<button type="button" class="idbtn jsonsave">Download it as a file</button>'
    + '<button type="button" class="idbtn jsonnarrow">Narrow the search instead</button></div>'
    + '<p style="margin:0 0 6px">Open your Neuroglancer, press the <b>{}</b> button in the top bar, '
    + "select everything in the box that opens and paste over it.</p>"
    + '<img src="' + TRACED_JSON_HINT + '" alt="Neuroglancer’s top bar, with the {} button '
    + 'ringed" style="display:block;max-width:100%;height:auto;border-radius:6px;border:1px solid '
    + 'var(--line)">';
  if (after && after.parentNode) after.parentNode.insertBefore(box, after.nextSibling);
  else document.body.appendChild(box);

  var c = box.querySelector(".jsoncopy");
  if (c) c.addEventListener("click", function(){
    var yes = function(){ c.textContent = "Copied — paste it into the {} box"; };
    var no = function(){ c.textContent = "Could not copy — use the download"; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(json).then(yes, no);
      else no();
    } catch (_e){ no(); }
  });
  var d = box.querySelector(".jsonsave");
  if (d) d.addEventListener("click", function(){
    try { tracedSaveBlob(new Blob([json], { type: "application/json" }),
                         "neuroglancer_state.json"); d.textContent = "Downloaded"; }
    catch (_e){ d.textContent = "Could not download it"; }
  });
  var n = box.querySelector(".jsonnarrow");
  if (n) n.addEventListener("click", function(){
    try { box.parentNode.removeChild(box); } catch (_e){}
  });
  return box;
}
/* ── WHICH CELLS HAVE BEEN OUTLINED ───────────────────────────────────────────  2026-09-24
   Søren: "I need to be able to filter for only the cells that have whole cell structures."

   The organelle filter asks the organelle-locations sheet; a traced whole cell is not in it. This
   reads the traced-structures index -- the same one the outline picker reads -- once per page, and
   answers which cells carry one. By nucleus id AND root id, because a tracing is filed against
   whichever the tracer had, and by both scoped and bare ids, because a dataset prefixes them.

   Cached: the filter renders on load and again whenever counts arrive, and a fetch per render
   would be a request every time somebody ticks anything.
   See src/a_traced_cell_is_a_thing_you_can_tick.py. */
var TRACED_KIND_SETS = null, TRACED_KIND_WAIT = null, TRACED_KIND_DS = null;
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
  /* ── ONE CACHE PER DATASET ─────────────────────────────────  2026-09-24
     ωJump switches volume with the page open and rebuilds its controls when it does, so a single
     cached index would show the previous volume's counts beside the new volume's cells. Nothing
     had hit this before, because ωJump had no such counts until today. */
  var ds = tracedOutlinesDsQS();
  if (ds !== TRACED_KIND_DS){ TRACED_KIND_SETS = null; TRACED_KIND_WAIT = null; TRACED_KIND_DS = ds; }
  if (TRACED_KIND_SETS && !force) return Promise.resolve(TRACED_KIND_SETS);
  if (TRACED_KIND_WAIT && !force) return TRACED_KIND_WAIT;
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return Promise.resolve({ cell: {}, nucleus: {} });
  TRACED_KIND_WAIT = fetch(REPORT_ENDPOINT + "?tracings=1" + ds)
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
/* ── THE CELL'S NAME OPENS THE CELL WITH ITS OUTLINE ────────────────  2026-09-24
   Søren: "When the cell has a whole cell or nucleus segmentation, it should load that when opening
   Neuroglancer by clicking the cell name."

   Delegated on the document rather than wired per anchor: these headlines are rewritten whenever a
   cell loads, a community identification wins, or a merged detection is expanded, and a listener
   attached to the anchor would be re-attached on each of those or quietly lost on one of them.

   An anchor opts in by carrying the cell's ids (class="ctlink", data-nuc, data-root). One that
   does not is left entirely alone -- see src/the_cell_name_opens_the_cell_with_its_outline.py for
   why that is not merely defensive. */
function tracedCellNameLayers(nucId, rootId){
  if (typeof tracedKindHas !== "function" || typeof buildTracedOrganelleLayers !== "function")
    return Promise.resolve([]);
  var wants = [];
  if (tracedKindHas("__traced_cell", nucId, rootId)) wants.push("__cells");
  if (tracedKindHas("__traced_nucleus", nucId, rootId)) wants.push("__nuclei");
  if (!wants.length) return Promise.resolve([]);
  /* One kind at a time and in series: buildTracedOrganelleLayers answers for one pick, and two
     Drive reads of one cell in parallel buy nothing worth the second connection. */
  var out = [];
  return wants.reduce(function(chain, w){
    return chain.then(function(){
      return buildTracedOrganelleLayers({ nuc: [String(nucId || "")], root: [String(rootId || "")] },
                                        w, function(){})
        .then(function(ls){ if (ls && ls.length) out.push.apply(out, ls); },
              function(e){ console.warn("[traced cell link] " + w + " unavailable", e); });
    });
  }, Promise.resolve()).then(function(){ return out; });
}
function tracedCellNameWire(){
  if (tracedCellNameWire.done || typeof document === "undefined") return;
  tracedCellNameWire.done = true;
  document.addEventListener("click", function(e){
    /* The browser's own shortcuts stay the browser's: ctrl/cmd-click and middle-click open the
       plain link in a background tab, which is what they are for. */
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = (e.target && e.target.closest) ? e.target.closest("a.ctlink") : null;
    if (!a || !a.href) return;
    var nuc = a.getAttribute("data-nuc") || "", root = a.getAttribute("data-root") || "";
    if (!nuc && !root) return;
    /* Asked of the index already in memory, so an untraced cell costs nothing: no request, no
       delay, and the anchor behaves exactly as it did before any of this existed. */
    if (typeof tracedKindHas !== "function") return;
    if (!tracedKindHas("__traced_cell", nuc, root) && !tracedKindHas("__traced_nucleus", nuc, root)) return;
    e.preventDefault();
    var href = a.href, win = null;
    try { win = window.open("", "_blank"); } catch (_e){}      // at the click, or it is a popup
    var ext = a.querySelector(".ext"), was = ext ? ext.innerHTML : "";
    if (ext) ext.innerHTML = "\u2026";
    tracedCellNameLayers(nuc, root).then(function(layers){
      if (ext) ext.innerHTML = was;
      var url = href, k = href.indexOf("#!");
      if (layers.length && k >= 0){
        try {
          var st = JSON.parse(decodeURIComponent(href.slice(k + 2)));
          st.layers = (st.layers || []).concat(layers);
          var u2 = href.slice(0, k) + "#!" + encodeURIComponent(JSON.stringify(st));
          var cap = (typeof tracedLinkMax === "function") ? tracedLinkMax() : 2000000;
          if (u2.length <= cap) url = u2;
          else console.warn("[traced cell link] " + u2.length.toLocaleString() + " characters is past "
                            + "what a viewer link carries (" + cap.toLocaleString() + ") \u2014 opened "
                            + "the cell without its outline.");
        } catch (_e){ console.warn("[traced cell link] could not read the link's own state", _e); }
      }
      if (win){ try { win.opener = null; } catch (_e){} win.location.href = url; }
      else window.open(url, "_blank", "noopener");
    });
  });
}
if (typeof document !== "undefined"){
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tracedCellNameWire);
  else tracedCellNameWire();
}
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
    /* Straight after "all organelles", so it is found rather than scrolled to -- and in the order
       they are declared, which puts whole cells first. Each one goes after the last one inserted,
       or they come out reversed. */
    let at=sel.options[2]||null;
    Object.keys(TRACED_NOT_ORGANELLE).forEach(function(k){
      if(!other[k])return;
      const m=TRACED_NOT_ORGANELLE[k];
      const o=document.createElement("option");
      o.value=m.pick;
      o.textContent=m.plural+" ("+other[k]+" outlined)";
      sel.insertBefore(o, at);
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
