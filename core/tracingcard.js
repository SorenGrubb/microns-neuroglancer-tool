/* ── core/tracingcard.js ─ trace a cell or organelle ────────────────────────────
   Extracted verbatim from ujump.html on 2026-09-20 (stage A of the tracing extraction in
   claude/the-tracing-card-has-to-be-extracted.md) so µJump, λJump, δJump, βJump and ηJump can share
   ONE tracing card instead of growing five that drift.

   Søren: *"We need to have the pad fixed so that it can be easily implemented into new tools."*

   WHY THIS FILE EXISTS AT ALL. The subsystem is 96 top-level functions and ~3,500 lines. Porting
   it by hand to four more pages would be a fork four times the size of the ηJump organelle form
   that cost a day to undo in September, and it would drift the same way for the same reason.

   NOTHING WAS RENAMED. Every function is still a plain global, so no call site in ujump.html
   changed — the same convention core/mesh.js, core/gamify.js and core/panel.js already use.

   WHAT IS IN HERE:
     - the tracing store and its list (tracingRead/Write, tracingRenderList, tracingGroups)
     - reading contours out of a pasted Neuroglancer link (tracingReadLink, tracingWhat)
     - structure ids, numbering and publishing (tracingNextIndex, tracingKeep, tracingPublish)
     - putting contours BACK into a viewer (tracingRingLines, tracingShowCellIn, tracingViewerOpen,
       organOverlayInto, organShowAllInViewer)
     - the 3D preview beside the pad (pad3D*)
     - volumes (tracingVolumeOf, padVolume, tracingVolShow)
     - drafts, local and server-side (draft*)
     - THE PAD itself: one section of EM with a real polygon tool on it (padOpen, padDraw,
       padPaint, padRings, padStep, and the wirePad listeners)

   ── HOST CONTRACT ─ what the page must provide ───────────────────────────────────

   required : escHtml, postReport, REPORT_ENDPOINT, REPORTER_NAME, REPORTER_EMAIL,
              GOOGLE_VERIFIED, GOOGLE_CREDENTIAL, buildState(pos), UJ.cfg (.res), and this
              dataset's imagery — either a global SRC with .em/.seg/.nuc, or UJ.cfg.tracing.sources
   config   : UJ.cfg.tracing = { lsKey, draftsKey, draftKey, penKey, sources, identityFor }.
              Every field optional; the four keys fall back to µJump's, sources falls back to SRC,
              and identityFor to µJump's own tables when they are present. A tool that sets none of
              them gets µJump's storage, which is why setting the four keys is the first thing a
              new host must do — storagekeycheck.js fails until it does
   from core: core/segread.js, core/segpaint.js, core/emtiles.js, core/tracepad.js,
              core/traceloft.js, core/tracing.js, core/organellelink.js, core/nucmesh.js,
              core/ontology.js (LEAF_NAMES), core/organelles.js, core/gamify.js
   optional : CUR_POS, CUR_ROOT, CUR_NUCID, NID, NT, OWN_TYPE, OWN_TYPE_NAMES, CT_NAMES,
              rootId, rootIdToIndex, showSubmitToast, refreshFavStars — every one reached
              through a `typeof` guard, so a page with none of them still runs the card

   STILL µJUMP-SHAPED, AND KNOWN TO BE (stage B fixes each, deliberately not in the same edit as
   the move):
     - four localStorage keys are literal "ujump_..." strings. A second tool loading this file
       TODAY would share µJump's tracings and drafts — exactly the bug storagekeycheck.js was
       written for. Nothing else loads it yet.
     - (fixed 2026-09-20) the seven SRC reads now go through tracingSources(), which falls back
       to SRC so µJump is unchanged.
     - (fixed 2026-09-20) tracingIdentityFor asks UJ.cfg.tracing.identityFor first and returns
       null on a page with no tables, instead of throwing inside a click handler.
     - (fixed 2026-09-20, stage C) the card's MARKUP is built by tracingCardHtml(); a host
       supplies an empty <div class="card" id="tracingCard"></div> and calls UJ.tracingcard.mount().
     - (fixed 2026-09-20) the two ticks that need a segmentation and meshes are removed on a
       dataset that has neither, and the pad's six zoom labels are computed from the volume's own
       scale list instead of carrying minnie65's numbers — padTrimForHost, padRelabelMips.

   DOM IDS THIS MODULE READS/WRITES — a host page must use these names:
     #tracingCard #tracingPanel #tracingX/Y/Z #tracingOpen #tracePadOpen #tracePad #tracePadWrap
     #tracePadMip #tracePadPrev #tracePadNext #tracePadStep #tracePadUndo #tracePadPen #tracePadPan
     #tracePadSeg #tracePadSegSay #tracePadZ #tracePadSay #tracePadRings #tracePadVol
     #tracePadInsts #tracePadNewInst #tracePadHelp #tracingLink #tracingLayer #tracingRead
     #tracingStatus #tracingFound #tracingLayers #tracingWhat #tracingType #tracingColor
     #tracingEachOwn #tracingEachList #tracingDraftBar #tracingList

   CAUTION when editing: this file declares 318 top-level names, many with `const`/`let`. Top-level
   const DOES cross <script> boundaries but is NOT on window, and a second declaration of the same
   name anywhere on the page is a SyntaxError that silently kills that whole block. Before wiring a
   new tool to this file, check the page for its own TRACING_*, PAD_*, DRAFT_* declarations. */
var UJ = UJ || {};
/* ── THE SIGN-IN GATE, FOR A PAGE THAT HAS NONE ──────────────────────────────────  2026-09-21
   core/bulkorgan.js, core/panel.js's organelle form and this card ask reportGateBlock() before
   they send anything: "" to go ahead, or the reason not to, with Google's prompt already offered.
   µJump and ωJump define their own; the other six did not, so the question was skipped and a
   signed-out submission went out to be refused. Defined HERE because this file is on every tool,
   and only when the page has not got one -- a page's own `function reportGateBlock` in a later
   script replaces this. GOOGLE_EXP is seconds on µJump and milliseconds elsewhere; both are read. */
if (typeof window !== "undefined" && typeof window.reportGateBlock !== "function"){
  window.reportGateBlock = function(){
    var cred = (typeof GOOGLE_CREDENTIAL !== "undefined") ? GOOGLE_CREDENTIAL : null;
    var ver  = (typeof GOOGLE_VERIFIED !== "undefined") ? GOOGLE_VERIFIED : false;
    var exp  = (typeof GOOGLE_EXP !== "undefined") ? Number(GOOGLE_EXP) || 0 : 0;
    var expMs = exp > 1e12 ? exp : exp * 1000;
    var expired = !!cred && expMs > 0 && Date.now() > expMs - 60000;
    if (ver && cred && !expired) return "";
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.prompt(); } catch (_e){}
    return expired
      ? "Your Google sign-in has expired \u2014 they last about an hour. Sign in again with the "
        + "account button in the top-right corner, then press Submit again.\n\nNothing has been "
        + "sent, so your work is still here."
      : "Please sign in with Google before submitting \u2014 use the account button in the "
        + "top-right corner, then try again.\n\nNothing has been sent, so your work is still here: "
        + "sign in and press Submit again.";
  };
}
/* ── TRACING A CELL THE SEGMENTATION DOES NOT HAVE ──────────────────────────────  2026-09-16
   Paste a link of contours, keep it, and it rides into the Blender export as an ordinary cell.

   ONE BUTTON, AND IT DOES BOTH HALVES.  2026-09-17. Søren: *"I think sharing should not be an
   option, the meshes made should always be a part of the dataset and everybody should be able to
   use it."* There were two -- Keep, which was local, and Share, which needed a sign-in -- and the
   predictable result was that the easy one got pressed and the work stayed on one laptop.

   THE EXPORT STILL DOES NOT WAIT FOR THE BACKEND, which is why the local half survives: a tracing
   is written to localStorage first, so the Blender download works signed out, offline, and against
   a backend nobody has redeployed. The share is attempted immediately after, and if there is no
   sign-in it is QUEUED rather than refused -- tracingFlush() sends it the moment one appears.

   NO CONSENSUS, AND NO OWNER EITHER. Nothing votes on a tracing; the newest version of it simply
   is it. But anyone may extend or correct one -- Søren, same message: *"other people should be
   able to add to it or edit it"* -- so credit accumulates instead of transferring, and no version
   is ever deleted. */
/* ── WHOSE STORAGE THIS IS ──────────────────────────────────  2026-09-20
   localStorage is ONE store shared by every page on grubblab.com, so a key written into a shared
   module is a key every tool that loads it takes turns overwriting. µJump and πJump spent a week
   doing exactly that to each other's dashboard cache and navigation history; storagekeycheck.js
   is what came out of it.

   EACH PAGE NAMES ITS OWN, as literals, through UJ.cfg.tracing — the shape core/stepthrough.js
   already uses (`stepCfg().lsKey || "ujump_stepthrough_v1"`). The fallbacks below are µJump's
   real keys, so µJump is unchanged whether or not it configures them.

   NOT BUILT FROM UJ.cfg.id, which was the first plan and would have been a quiet disaster:
   µJump's id is "microns", not "ujump", so every key would have been renamed and every tracing
   and draft anybody had saved would still be in their browser under a name nothing reads.

   AND NOT COMPUTED AT ALL, for a second reason: storagekeycheck.js resolves a key only when it is
   a literal it can read in the page. A computed key is reported as an expression nobody can
   audit, and it says so because a computed key escapes both of its other rules. */
/* ── WHERE THIS DATASET'S IMAGERY IS ─────────────────────────────  2026-09-20
   Three facts and a voxel size: the EM to draw a section from, the segmentation to paint over it,
   the nuclei to read a nucleus id out of, and how big a voxel is. µJump keeps them in a global
   called SRC; λJump keeps the same facts in UJ.cfg.viewer.

   FALLS BACK TO SRC, so µJump declares nothing and is unchanged. A host without one sets
   UJ.cfg.tracing.sources — an object, or a function of no arguments for a host whose sources are
   themselves assembled at load time.

   IT RETURNS res TOO, and that is not tidiness: five of the seven call sites carried their own
   copy of `res: UJ.cfg ? UJ.cfg.res : [4, 4, 40]`, which is five places for a dataset with a
   different voxel size to be got wrong in, and only one of them would be noticed. */
function tracingSources(){
  var o = null;
  try {
    var c = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.sources : null;
    if (c) o = (typeof c === "function") ? c() : c;
  } catch (_e){ o = null; }
  if (!o) { try { o = SRC; } catch (_e){ o = null; } }   // ReferenceError on a page with no SRC
  o = o || {};
  var res = [4, 4, 40];
  try { if (UJ && UJ.cfg && UJ.cfg.res) res = UJ.cfg.res; } catch (_e){}
  /* skipScales COMES THROUGH, and it has to. This object is what the card hands to
     UJ.emtiles.configure() in four places when it finds the reader unconfigured — and on V1DD the
     volume's first scale is a `placeholder` that 404s. Dropping the field here would mean that
     whether δJump's mip 0 is real depended on whether the cell card or the pad configured emtiles
     first: open the pad before looking at a cell and the section is a flat grey rectangle, with no
     chunks fetched and nothing in the console. */
  /* segInfo/nucInfo and segOffsetNm/nucOffsetNm too, 2026-09-21: χJump's cb2 segmentation
     keeps its info elsewhere and sits 1,216 sections below its EM. Dropped here, every configure
     the card makes would read it at the EM's z. See core/segread.js. */
  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res,
           skipScales: o.skipScales || [],
           segInfo: o.segInfo || "", nucInfo: o.nucInfo || "",
           segOffsetNm: o.segOffsetNm || null, nucOffsetNm: o.nucOffsetNm || null,
           u16: o.u16 || null };
}
/* ── THIS DATASET'S CONTRAST, NOT minnie65's ──────────────  2026-09-20
   core/emtiles.js stretches [lo,hi] to black-white and defaults to 86/172. Those are minnie65's
   numbers. The pad called drawSection with no window at all, so every dataset got them — and on
   Lee16, whose median is 189, more than half of every section clipped to pure white and the
   membranes clipped to pure black. Søren: *"The contrast of the lJump tracing window is totally
   off."* It was, and by a lot.

   µJump could never have shown it: its own EM_WINDOW is 86/172, so its pad was right by
   coincidence. δJump's is 115/144 and would have been wrong the day it got the card.

   READ FROM THE PAGE, THREE WAYS, IN ORDER. UJ.cfg.tracing.window if a host wants the pad
   stretched differently from the rest of its page; otherwise the page's own EM_WINDOW, which all
   three pages already define in one place and already use for the cell card's EM plane; otherwise
   emtiles' default, so a page with neither is exactly as it was.

   EM_WINDOW IS READ IN A try, NOT BEHIND typeof. It is a top-level `const`, and on µJump this
   file is parsed 2,000 lines before that line runs — `typeof` does not protect against a temporal
   dead zone, it throws like any other read. Called at draw time, so in practice it is long
   initialised; the try is for the page that loads the card and never defines one. */
/* May the pad draw a level whose sections are thicker than the finest? Only where the host says so
   -- see src/one_card_many_volumes.py. */
function tracingSlabOk(){
  try { var f = tracingCfg().slabOk; return !!(typeof f === "function" ? f() : f); }
  catch (_e){ return false; }
}
function tracingWindow(){
  var w = null;
  try { w = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.window : null; } catch (_e){ w = null; }
  if (typeof w === "function"){ try { w = w(); } catch (_e){ w = null; } }
  if (!w){ try { w = EM_WINDOW; } catch (_e){ w = null; } }
  if (!w || w.lo == null || w.hi == null) return { lo: 86, hi: 172 };
  return { lo: w.lo, hi: w.hi };
}
/* ── WHY THIS DATASET NEEDS THE CARD ────────────────────  2026-09-20
   The card's first sentence was "For a cell the segmentation does not have." That is minnie65's
   situation and a precise one — the top of that volume has nuclei segmented and cells not. It is
   wrong on Lee16, which has no segmentation at all so that is EVERY cell, and wrong on V1DD,
   whose segmentation is behind a CAVE login so it depends who is asking.

   The ticks beside it already read from the host and so does the zoom menu; the sentence saying
   what the card is FOR did not, so a card that had correctly removed its segmentation tick still
   opened by talking about a segmentation.

   A plain string, or a function for a host whose answer depends on who is signed in. µJump's
   sentence is the default, so a page that sets nothing is unchanged. */
function tracingIntro(){
  try {
    var s = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.intro : null;
    if (typeof s === "function") s = s();
    if (s) return String(s);
  } catch (_e){}
  return "For a cell the segmentation does not have.";
}
function tracingCfg(){
  try { return (UJ && UJ.cfg && UJ.cfg.tracing) || {}; } catch (_e){ return {}; }
}
const TRACING_KEY = tracingCfg().lsKey || "ujump_tracings_v1";
/* ── ONE CARD, MANY VOLUMES ───────────────────────────────────────  2026-09-21
   UJ.cfg.tracing.scope(): the volume open now, on a page that holds several (ωJump). "" everywhere
   else, and then every function below returns exactly what it did before. See
   src/one_card_many_volumes.py. */
function tracingScope(){
  try { var f = tracingCfg().scope; return f ? String(typeof f === "function" ? f() : f) : ""; }
  catch (_e){ return ""; }
}
/* THE ONE STORE, 2026-09-21. localStorage, unless the host says keepLocal: false -- then an object
   in memory for the life of the page. See src/the_card_can_keep_nothing_in_the_browser.py. */
var TRACING_MEM = {};
var TRACING_MEM_STORE = {
  getItem: function(k){ return Object.prototype.hasOwnProperty.call(TRACING_MEM, k) ? TRACING_MEM[k] : null; },
  setItem: function(k, v){ TRACING_MEM[k] = String(v); },
  removeItem: function(k){ delete TRACING_MEM[k]; }
};
function tracingKeepsLocal(){
  try { var v = tracingCfg().keepLocal; return v === undefined ? true : !!v; } catch (_e){ return true; }
}
function tracingStore(){
  if (!tracingKeepsLocal()) return TRACING_MEM_STORE;
  try { return window.localStorage || TRACING_MEM_STORE; } catch (_e){ return TRACING_MEM_STORE; }
}
/* THE ONE STORE, 2026-09-21. localStorage, unless the host says keepLocal: false -- then an object
   in memory for the life of the page. See src/the_card_can_keep_nothing_in_the_browser.py. */
var TRACING_MEM = {};
var TRACING_MEM_STORE = {
  getItem: function(k){ return Object.prototype.hasOwnProperty.call(TRACING_MEM, k) ? TRACING_MEM[k] : null; },
  setItem: function(k, v){ TRACING_MEM[k] = String(v); },
  removeItem: function(k){ delete TRACING_MEM[k]; }
};
function tracingKeepsLocal(){
  try { var v = tracingCfg().keepLocal; return v === undefined ? true : !!v; } catch (_e){ return true; }
}
function tracingStore(){
  if (!tracingKeepsLocal()) return TRACING_MEM_STORE;
  try { return window.localStorage || TRACING_MEM_STORE; } catch (_e){ return TRACING_MEM_STORE; }
}
function tracingScopedKey(k){ var s = tracingScope(); return s ? k + ":" + s : k; }
/* A cell id filed under this volume: "<scope>:<id>", or "<scope>:" with no cell named. An id that
   already carries the scope -- ωJump's nucleusKeys do -- is left as it is. */
function tracingScoped(id){
  var s = tracingScope(); id = String(id || "");
  if (!s || id.indexOf(s + ":") === 0) return id;
  return s + ":" + id;
}
function tracingInScope(list){
  var s = tracingScope();
  if (!s) return list || [];
  return (list || []).filter(function(t){
    return String((t && (t.nucleusId || t.nucId || t.nucleus_id)) || "").indexOf(s + ":") === 0;
  });
}
let TRACINGS_KEPT=[];
function tracingRead(){
  try{ const v=JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_KEY))||"[]"); return Array.isArray(v)?v:[]; }
  catch(_e){ return []; }
}
function tracingWrite(list){
  try{ tracingStore().setItem(tracingScopedKey(TRACING_KEY),JSON.stringify(list)); }catch(_e){}
}
function tracingSay(msg,bad){
  const el=document.getElementById("tracingStatus");
  if(el)el.innerHTML=bad?'<span style="color:var(--bad)">'+escHtml(msg)+'</span>':escHtml(msg);
}
/* Held between "Read the contours" and "Keep it", so the name and colour are chosen AFTER seeing
   what was found rather than before. */
let TRACING_PENDING=null;

/* ── KEPT TRACINGS, BY CELL ──────────────────────────────────────────────────  2026-09-21
   Søren: "it is confusing that lysosomes from different microglia have the same number. What I
   would like is that they are organized as sub-elements of the cell they were traced in". A series
   is per cell, so two cells each having a Lysosome 1 is right; the flat list hid the cell. See
   src/the_tracings_group_by_cell.py. */
function tracingCellKeyOf(nuc, root, coord){
  nuc = String(nuc || ""); root = String(root || ""); coord = String(coord || "");
  return nuc ? "n:" + nuc : (root ? "r:" + root : (coord ? "c:" + coord : ""));
}
/* The cell's own line: its type, its nucleus, its root, how many. */
function tracingCellHead(nuc, root, type, n, coord){
  const bits = [];
  if (type && type !== "traced") bits.push("<b>" + escHtml(type) + "</b>");
  if (nuc) bits.push("nucleus " + escHtml(nuc));
  if (root) bits.push("root " + escHtml(root));
  if (coord) bits.push((nuc || root ? "centre " : "cell at ") + escHtml(tracingCoordShow(coord)));
  if (!nuc && !root && !coord) bits.push("<b>Not filed against a cell</b>");
  return '<span class="tracingcellhead" style="flex:1 1 200px;min-width:0">' + bits.join(" &middot; ")
    + ' <span style="opacity:.6">&middot; ' + n + " tracing" + (n === 1 ? "" : "s") + "</span></span>";
}
/* Groups in the order their first member comes, so the list does not jump when one is added. */
function tracingGroupByCell(list, nucOf, rootOf, coordOf){
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
    if (!g.coord && coordOf(t)) g.coord = String(coordOf(t));
    g.items.push({ t: t, i: i });
  });
  /* No cell last: it is the group nobody is looking for. */
  order.sort(function(a, b){ return (a === "" ? 1 : 0) - (b === "" ? 1 : 0); });
  return order.map(function(k){ return by[k]; });
}
/* "Remove all" asks in the button itself: a browser dialog would stop the page. */
function tracingArm(b, ask, go){
  if (!b.dataset.armed){
    const label = b.textContent;
    b.dataset.armed = "1"; b.textContent = ask; b.style.color = "var(--bad)";
    setTimeout(function(){
      if (b.isConnected && b.dataset.armed){ delete b.dataset.armed; b.textContent = label; b.style.color = ""; }
    }, 4000);
    return;
  }
  go();
}
const TRACING_BTN = 'style="padding:2px 9px;font-size:12px;flex:0 0 auto"';
const TRACING_CELL_BOX = 'class="tracingcell" style="border-top:1px solid var(--line);padding:6px 0 2px"';
const TRACING_CELL_ROW = 'style="display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap"';

function tracingRenderList(){
  const host=document.getElementById("tracingList");
  if(!host)return;
  if(!TRACINGS_KEPT.length){
    host.innerHTML='<p class="hint">Nothing traced yet. A kept tracing is included in every '
      +'Blender download from this page until you remove it.</p>';
    return;
  }
  const groups=tracingGroupByCell(TRACINGS_KEPT,function(t){return t.nucleus_id;},function(t){return t.root_id;},
                                  function(t){return t.cell_coord;});
  host.innerHTML='<label>Kept tracings, by cell &mdash; these go into the 3D export</label>'
    +groups.map(function(g,gi){
      const type=(g.items.filter(function(x){return x.t.type&&x.t.type!=="traced";})[0]||{t:{}}).t.type||"";
      return '<div '+TRACING_CELL_BOX+' data-g="'+gi+'">'
        +'<div '+TRACING_CELL_ROW+'>'+tracingCellHead(g.nuc,g.root,type,g.items.length,g.coord)
        +'<button class="idbtn tracingcellngl" data-g="'+gi+'" '+TRACING_BTN+' title="All of this '
        +'cell&rsquo;s kept tracings in the viewer, each in its own colour, with the cell.">Neuroglancer</button>'
        +'<button class="idbtn tracingcelldrop" data-g="'+gi+'" '+TRACING_BTN+' title="Take all of '
        +'this cell&rsquo;s tracings off this page. What is already in the dataset stays there.">'
        +'Remove all</button></div>'
        +g.items.map(function(x){
          const t=x.t, i=x.i;
          const sections=new Set((t.rings||[]).map(function(r){return r.z;})).size;
          return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0 4px 18px;font-size:12px;'
            +'border-left:2px solid var(--line);margin-left:5px">'
            +'<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
              +escHtml(t.color||"#3a6b5a")+'"></span>'
            +'<span style="flex:1 1 auto">'+escHtml(t.name||"traced")+'</span>'
            +'<span style="opacity:.7">'+(t.rings||[]).length+' contour'
              +((t.rings||[]).length===1?"":"s")+' on '+sections+' section'+(sections===1?"":"s")
              +(isFinite(t.volume_um3)?' &middot; '+volFmt(t.volume_um3)+' µm³':'')+'</span>'
            /* A tracing that has not reached the dataset says so HERE, where the tracing is, rather
               than in a status line that the next action overwrites. */
            +(t.pending_share
                ?'<span style="color:var(--warn);font-weight:600" title="Kept here, not in the shared '
                 +'dataset yet. Sign in with Google and it goes up on its own.">waiting for sign-in</span>'
                :'<span style="opacity:.55" title="In the shared dataset — anyone can open it and add '
                 +'to it.">in the dataset</span>')
            +'<button class="idbtn tracingview" data-n="'+i+'" style="padding:2px 9px;font-size:12px" '
            +'title="Open this tracing in the viewer — its contours as an annotation layer in its '
            +'own colour.">Neuroglancer</button>'
            +'<button class="idbtn tracingdrop" data-n="'+i+'" style="padding:2px 9px;font-size:12px">'
            +'Remove</button></div>';
        }).join("")
        +'</div>';
    }).join("");
  host.querySelectorAll(".tracingview").forEach(function(b){
    b.addEventListener("click",function(){
      const t=TRACINGS_KEPT[Number(b.dataset.n)];
      if(t)tracingViewerOpen([t],null,{nuc:t.nucleus_id||"",root:t.root_id||""});
    });
  });
  host.querySelectorAll(".tracingdrop").forEach(function(b){
    b.addEventListener("click",function(){
      TRACINGS_KEPT.splice(Number(b.dataset.n),1);
      tracingWrite(TRACINGS_KEPT);tracingRenderList();
    });
  });
  host.querySelectorAll(".tracingcellngl").forEach(function(b){
    b.addEventListener("click",function(){
      const g=groups[Number(b.dataset.g)];
      if(g)tracingViewerOpen(g.items.map(function(x){return x.t;}),
        "Opened all "+g.items.length+" of this cell’s kept tracings in the viewer, each in its own colour.",
        {nuc:g.nuc,root:g.root,centre:tracingCellCentre(g.coord,g.nuc)});
    });
  });
  host.querySelectorAll(".tracingcelldrop").forEach(function(b){
    const g=groups[Number(b.dataset.g)];
    b.addEventListener("click",function(){
      if(!g)return;
      tracingArm(b,"Click again to remove "+g.items.length,function(){
        const waiting=g.items.filter(function(x){return x.t.pending_share;}).length;
        TRACINGS_KEPT=TRACINGS_KEPT.filter(function(t){return tracingCellKeyOf(t.nucleus_id,t.root_id,t.cell_coord)!==g.key;});
        tracingWrite(TRACINGS_KEPT);tracingRenderList();
        tracingSay("Removed "+g.items.length+" tracing"+(g.items.length===1?"":"s")+" of that cell from this page. "
          +(waiting?waiting+" had not reached the dataset yet and are gone. ":"")
          +"What is in the dataset stays there.");
      });
    });
  });
}

/* ── WHAT CAME OFF THE LINK, LAYER BY LAYER ────────────────────────────────────  2026-09-19
   Søren: *"...the user can then deselect tracings if they are not supposed to be there, but all of
   them should be shown in the 3D window."*

   Asked which way a deselected one should go, he chose **gone**: the 3D window shows exactly what
   will be committed. That makes this list the only control that matters on the card, so it says
   enough to decide with — the layer's name, how many contours on how many sections, and the colour
   the surface is drawn in. A row that cannot be ticked says why rather than being greyed in
   silence. */
function tracingGroups(){
  return (TRACING_PENDING && TRACING_PENDING.groups) || null;
}
function tracingLayersRender(){
  const box = document.getElementById("tracingLayers");
  const gs = tracingGroups();
  if (!box) return;
  if (!gs || gs.length < 2){ box.style.display = "none"; box.innerHTML = ""; return; }
  box.style.display = "";
  const on = gs.filter(function(g){ return g.on; }).length;
  box.innerHTML = '<label style="margin:0 0 6px">' + gs.length
    + ' annotation layers &mdash; ' + on + ' will be added</label>'
    + gs.map(function(g){
        const flat = g.sections < 2;
        return '<div class="row" style="gap:8px;margin-top:4px;align-items:center;flex-wrap:nowrap">'
          + '<input type="checkbox" class="laytick" data-inst="' + g.inst + '"'
            + (g.on ? " checked" : "") + (flat ? " disabled" : "")
            + ' style="flex:0 0 auto;margin:0">'
          + '<span style="display:inline-block;flex:0 0 10px;height:10px;border-radius:2px;'
            + 'background:' + escHtml(padInstColour(g.inst)) + '"></span>'
          + '<span style="flex:1 1 auto;min-width:0;font-size:13px;'
            + (g.on ? "" : "color:var(--mut);") + 'overflow:hidden;text-overflow:ellipsis;'
            + 'white-space:nowrap">' + escHtml(g.layer || "(unnamed layer)") + '</span>'
          + '<span class="hint" style="flex:0 0 auto">'
            + (flat ? "one section \u2014 no surface to close"
                    : (g.rings.length + " contour" + (g.rings.length === 1 ? "" : "s")
                       + " on " + g.sections + " section" + (g.sections === 1 ? "" : "s")))
          + '</span></div>';
      }).join("");
  [].slice.call(box.querySelectorAll(".laytick")).forEach(function(t){
    t.addEventListener("change", function(){
      const g = (tracingGroups() || []).filter(function(x){ return x.inst === +t.dataset.inst; })[0];
      if (!g) return;
      g.on = t.checked;
      tracingApplySelection();
    });
  });
}
/* THE ONE PLACE THE TICKS ARE APPLIED. Everything downstream — the 3D preview, the volume, the
   naming rows, the Add button — reads TRACING_PENDING.rings and knows nothing about a tick. */
function tracingApplySelection(){
  const gs = tracingGroups();
  if (!gs) return;
  let rings = [];
  gs.forEach(function(g){ if (g.on) rings = rings.concat(g.rings); });
  TRACING_PENDING.rings = rings;
  /* TWO STRUCTURES FROM TWO LAYERS ARE TWO DIFFERENT THINGS, by construction: nobody draws one
     organelle in two channels. So the card asks what each one is rather than asking once — which is
     the "suggestion" the request is about, made into a control. It is a tick, so it can be turned
     back off for three mitochondria drawn in three layers. */
  const each = document.getElementById("tracingEachOwn");
  const many = gs.filter(function(g){ return g.on; }).length > 1;
  if (each && many && !each.checked) each.checked = true;
  tracingColourSync();
  tracingLayersRender();
  tracingEachRender(true);
  tracingVolShow();
  pad3DSoon();
}
/* ── THE CARD'S OWN PICKER, WHICH WAS DEAD ON THIS ROUTE ───────────────────────  2026-09-19
   It writes PAD_INST_COLOUR for the structure being drawn -- behind `if(!PAD)return;`, so on the
   paste route, where there is no pad, it did nothing at all. The swatch sat at its markup default
   (#3a6b5a) while the structure was committed in the palette's first colour (#40e28c): the control
   and the result disagreed, quietly, and nobody would have found it by looking at either one.
   Caught by tracingpanelcheck.js when the first version of this function pushed the picker's stale
   default INTO the palette and changed the colour in the notebook.

   So it runs BOTH WAYS, and the palette is the source: reading a link seeds the picker from
   padInstColour (the bisection-ordered palette blender/colour_policy.py shares), and touching the
   picker writes back. With several structures each naming row has its own and this steps aside. */
function tracingColourSync(fromPicker){
  const gs = tracingGroups(), col = document.getElementById("tracingColor");
  if (!gs || !col || tracingEachOwn()) return;
  const on = gs.filter(function(g){ return g.on; });
  if (!on.length) return;
  if (fromPicker) on.forEach(function(g){ PAD_INST_COLOUR[String(g.inst)] = col.value; });
  else col.value = padInstColour(on[0].inst);
}

/* ── THE CARD STOPS DESCRIBING WHAT IT NO LONGER HAS ───────────────────────────  2026-09-19
   Søren: *"If I click Look at it in Neuroglancer now, nothing happens"* — and *"add it to the
   dataset also does nothing."* Both were true, and both had the same cause: padOpen had set
   TRACING_PENDING to null and left the whole block below on screen, three volume lines and all. A
   tool showing a volume for contours it does not have is worse than one showing nothing, and two
   buttons that fail in silence beside it is worse again.

   One function, so the state and the thing describing it cannot drift apart. */
function tracingPendingClear(){
  TRACING_PENDING = null;
  const f = document.getElementById("tracingFound");
  if (f) f.style.display = "none";
  const v = document.getElementById("tracingVolSay");
  if (v) v.textContent = "";
  const l = document.getElementById("tracingLayers");
  if (l){ l.style.display = "none"; l.innerHTML = ""; }
  try { pad3DRelease(); } catch (_e){}
}

function tracingReadLink(){
  const link=document.getElementById("tracingLink").value;
  const layer=(document.getElementById("tracingLayer").value||"").trim();
  document.getElementById("tracingFound").style.display="none";
  TRACING_PENDING=null;
  /* The old picture goes with the old contours. Every failure below returns early, and a preview
     of the last link that worked sitting under an error about this one is the worst of both. */
  pad3DRelease();
  const r=UJ.tracing.ringsFromLink(link,layer||null);
  if(!r.ok){tracingSay(r.error,true);return;}
  /* ONE STRUCTURE PER ANNOTATION LAYER, since 2026-09-19 (Søren: "If there is more than one
     annotation channel in the neuroglancer link, it should be suggested that there are more than
     one organelle"). Everything readable used to be poured into one structure, so a cell, a
     mitochondrion and a nucleus drawn in three channels came back as one impossible object under
     one name, with nothing on the card ever mentioning a layer. Within a layer the old rule still
     holds: one cell in one layer is one cell, and a Volume can still split it further. */
  const rings=r.rings;
  const sections=new Set(rings.map(function(x){return x.z;}));
  const named=(r.structures.find(function(s){return s.name;})||{}).name||"";
  const groups=(r.structures||[]).map(function(s,i){
    const zs={};
    (s.rings||[]).forEach(function(x){zs[x.z]=1;});
    return {inst:i, layer:s.layer||"", name:s.name||"", from:s.from||"",
            sections:Object.keys(zs).length,
            rings:(s.rings||[]).map(function(x){return {z:x.z,points:x.points,inst:i};})};
  });
  /* CAUTIOUS BY DEFAULT, and the reason is in this file rather than in taste: µJump writes
     annotation layers into its own links everywhere — synapses in and out, cell contacts, organelle
     points, centriole and cilium vectors — and some are POINTS, which three-to-a-section read as a
     contour. A link copied from one of those views would otherwise arrive offering half a dozen
     structures made of synapses. So the layer this tool makes, if it is there, is the one ticked;
     otherwise everything readable is. Nothing is hidden either way — every layer is a row. */
  const prefer=r.preferred&&groups.some(function(g){return g.layer===r.preferred;});
  groups.forEach(function(g){
    g.on=g.sections>=2&&(!prefer||g.layer===r.preferred);
  });
  /* READING A LINK IS A FRESH START, and it has to say so out loud or the card quietly wears the
     last one's clothes. Caught by tracinglayerscheck.js: after a three-layer link the "name each
     one separately" tick was still on for the next link's single structure, because
     tracingApplySelection only ever turns it ON (and should -- a tick turned on by hand mid-link
     must not be turned off by the next tick). The same leak applies to the per-structure colours
     and types, which are keyed by number: structure 1 of a new link would arrive wearing the
     colour somebody picked for structure 1 of the last one.
     Only when the pad is not holding contours of its own -- those numbers are the PAD'S. */
  if(!(PAD&&PAD.rings&&PAD.rings.length))
    groups.forEach(function(g){
      delete PAD_INST_COLOUR[String(g.inst)];
      delete PAD_INST_KIND[String(g.inst)];
    });
  const eachOwn=document.getElementById("tracingEachOwn");
  if(eachOwn)eachOwn.checked=groups.filter(function(g){return g.on;}).length>1;
  TRACING_PENDING={groups:groups,rings:rings};
  if(named)document.getElementById("tracingName").value=named;
  const zs=Array.from(sections).sort(function(a,b){return a-b;});
  const gaps=zs.length>1?Math.round((zs[zs.length-1]-zs[0])/(zs.length-1)):0;
  /* WHICH SHAPE IT READ, in words. The same link is organelle markers to the bulk card and a
     contour to this one -- the box it is pasted into is what decides -- so saying "from 36 points"
     rather than just "3 contours" makes pasting the wrong link into the wrong box visible. */
  const fromWhat={points:"from "+r.seen.points+" points",lines:"from line annotations",
                  polygons:"from polygons",volume:"from a traced volume"};
  const src=fromWhat[(r.structures[0]||{}).from||""]||"";
  tracingSay(rings.length+" contour"+(rings.length===1?"":"s")+(src?" "+src:"")+" on "+sections.size
    +" section"+(sections.size===1?"":"s")+", z "+zs[0]+"\u2013"+zs[zs.length-1]
    +(gaps?" (about every "+gaps+" section"+(gaps===1?"":"s")+")":"")
    +(r.seen.mixedZ?" \u2014 "+r.seen.mixedZ+" contour(s) span more than one section, which is "
      +"usually a stray point":"")
    /* WHICH IS SEVERAL THINGS, said in the same breath as how much of it there is. Without this
       the only clue that a link carried three channels was that the numbers looked too big. */
    +(groups.length>1?" \u2014 from "+groups.length+" annotation layers; tick the ones that "
      +"belong below, and the 3D window shows what will be added":""));
  /* NOTHING TICKED HAS DEPTH. This was a flat refusal of the whole link until 2026-09-19; with
     one row per layer it only has to be true of everything at once, and a single flat layer beside
     three good ones is a row that says "one section" rather than a rejection of all four. */
  if(!groups.some(function(g){return g.on;})){
    tracingSay(groups.length>1
      ?"None of those layers has contours on more than one section. A flat outline has no surface "
       +"to close \u2014 outline it on at least two."
      :"Only one section has a contour on it. A flat outline has no surface to close \u2014 "
       +"outline the cell on at least two sections.",true);
    return;
  }
  document.getElementById("tracingFound").style.display="";
  /* AFTER the block is shown, never before: a canvas measured inside display:none comes back zero
     by zero, and the renderer has no reason to know it was asked too early. This also draws the
     layer list, applies the default selection and renders the naming rows — one entry point, so
     ticking a box later takes exactly the same path as reading the link did. */
  tracingApplySelection();
}

/* What the dropdown means, in one place: the value that travels with the tracing and the label
   a person reads. "__cell" and "__nucleus" are this card's own, everything else is the ontology's
   own value, and "__other" is the only one that takes its name from a text box. */
/* Split out from tracingWhat() (2026-09-17) so the single box and each row of the per-structure
   list read a dropdown value the SAME way. Two copies of this mapping is how a lysosome traced in
   one place stops being the same thing as a lysosome traced in the other. */
function tracingWhatOf(v,typed){
  if(v==="__cell")return {kind:"cell",name:"Whole cell"};
  if(v==="__nucleus")return {kind:"nucleus",name:"Nucleus"};
  if(v==="__other")return {kind:"other",name:String(typed||"").trim()};
  /* The label from whichever vocabulary this page carries -- see tracingWhat()'s own note. */
  const k=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined")?ORGANELLE_KIND_BY_VALUE[v]:null;
  return {kind:v,name:(k&&k.label)||UJ.organelles.labelOf(v)};
}
function tracingWhat(){
  const sel=document.getElementById("tracingWhat");
  const v=sel?sel.value:"__other";
  if(v==="__cell")return {kind:"cell",name:"Whole cell"};
  if(v==="__nucleus")return {kind:"nucleus",name:"Nucleus"};
  if(v==="__other"){
    const typed=(document.getElementById("tracingName").value||"").trim();
    return {kind:"other",name:typed};
  }
  /* The label from whichever vocabulary this page carries. µJump defines its own
     ORGANELLE_KIND_BY_VALUE in core/ontology.js and leaves UJ.organelleData unset, so
     UJ.organelles.labelOf() would hand back the raw value -- "nucleoplasmic_reticulum_2" where the
     dropdown says "Nucleoplasmic reticulum type II". Asked of the page first, the module second,
     so this works on a tool that has either. */
  const k=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined")?ORGANELLE_KIND_BY_VALUE[v]:null;
  return {kind:v,name:(k&&k.label)||UJ.organelles.labelOf(v)};
}

/* ── WHAT IS ON THE PAD, AS TRACINGS ────────────────────────────────────────────  2026-09-17
   Søren: *"I want the option to draw more than one organelle of the same type... when publishing
   they should have different numbers."*

   One tracing per structure drawn, not one per pad. They share everything that is about the CELL --
   the type, the nucleus and root ids, the ontology kind -- and differ in the three things that make
   them separate objects: their contours, their colour, and their number.

   THE NUMBER IS DECIDED FROM THE DATASET, not from this pad. Tracing two more mitochondria into a
   cell that already has three makes 4 and 5, so tracingNextIndex() reads the index -- the cheap
   route, one sheet scan and no files -- and counts from there. With no index in hand (not deployed,
   offline, never browsed) it starts at 1 and says so rather than refusing: a number that turns out
   to collide is a label to fix, and refusing to record the tracing loses the work.

   THE ID IS NOT THE NUMBER. A structureId ends in the PAD's own index, which never changes while
   the pad is open and survives a draft; the published number can move if somebody else adds one
   first. Tying the identity to a label that can shift would turn a re-add into a rival rather than
   a new version, which is the one failure this feature has been careful about all day. */
/* The label a name belongs to, with any number taken off the end: "Mitochondrion 3" and
   "Mitochondrion" are the same series, and the fourth one is 4. */
function tracingSeriesLabel(name){
  return String(name || "").replace(/\s+\d+$/, "").trim().toLowerCase();
}
/* Numbers of tracings opened for editing this session, by structureId. Filled by
   tracingOpenShared, which has the tracing in its hand; read by tracingCurrentAll below. */
var TRACING_EDIT_INDEX = {};
/* ── THE PAD'S OWN BASE, WHICH IS NEVER SOMEBODY ELSE'S ID ─────────────────────  2026-09-19
   Søren's Drive folder had `lysosome_…__i1__i2.json`: the id of a new organelle built by adding a
   suffix to the id of a DIFFERENT tracing that happened to be open for editing. The compound name
   is the harmless half. The other half never fired only by luck — editing `X` and drawing a second
   organelle files it as `X__i1`, which is not a new structure but the one already published under
   that id, so a new organelle would have become the next version of an existing one.

   The suffix is only a way to mint distinct ids; nothing reads the relationship. So it hangs off a
   base the pad owns. Minted once per pad session and kept, because structure two must get the SAME
   id on every press or each press files another tracing. */
var TRACING_BASE_ID = "";
/* THE NUMBER A STRUCTURE IS ALREADY PUBLISHED UNDER, or 0 for one that is new. The stash first
   because it cannot be stale and does not depend on the index having loaded; the shared index
   second because it survives a reload, which the stash does not -- a draft of an edit resumed
   tomorrow has no memory of what it is a version of, and the index does. */
function tracingPublishedIndex(structureId){
  var id = String(structureId || "");
  if (!id) return 0;
  if (TRACING_EDIT_INDEX[id] > 0) return TRACING_EDIT_INDEX[id];
  var found = 0;
  (TRACING_SHARED || []).forEach(function(t){
    if (t && String(t.structureId || "") === id && Number(t.instanceIndex) > 0)
      found = Math.round(Number(t.instanceIndex));
  });
  return found;
}
function tracingNextIndex(kind, label, nuc, root){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  var top = 0;
  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");
    /* THE KIND IS THE SERIES, except for the one kind that is not a kind. "Something else" files
       everything under "other", so two unrelated hand-named structures on one cell would number
       each other if the kind alone decided it -- a hand-named "Dense body" would come back as
       "Myelin figure 2". Under `other`, the NAME is the series. */
    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = (nuc && String(t.nucleusId || "") === String(nuc))
                || (root && String(t.rootId || "") === String(root));
    if (same && sameCell && Number(t.instanceIndex) > top) top = Number(t.instanceIndex);
  });
  return top + 1;
}

function tracingCurrentAll(){
  /* IT SAYS SO NOW, 2026-09-19. Returning [] in silence is what made "Add it to the dataset" and
     "Look at it in Neuroglancer" both do nothing at all on a card that was still showing three
     volumes. The other empty case below -- something with no type yet -- has always explained
     itself; this one never did. */
  if(!TRACING_PENDING||!(TRACING_PENDING.rings||[]).length){
    tracingSay("There are no contours in hand. Draw some on the pad and press \u201cUse these "
      +"contours\u201d, or paste a Neuroglancer link above and read it.",true);
    return [];
  }
  const rings=TRACING_PENDING.rings||[];
  /* The structures on the pad, in the order they were started. A tracing read from a pasted link
     has no instances at all and comes back as one, which is the ordinary case. */
  const groups=[];
  rings.forEach(function(r){
    const k=r.inst||0;
    let g=groups.filter(function(x){return x.inst===k;})[0];
    if(!g){g={inst:k,rings:[]};groups.push(g);}
    g.rings.push({z:r.z,points:r.points});
  });
  groups.sort(function(x,y){return x.inst-y.inst;});
  if(!groups.length)return [];

  /* WHAT EACH ONE IS. Its own type when they are named separately, the shared box otherwise --
     see tracingKindFor(). The box is stored back first, because with the option on the box holds
     the SELECTED structure's type and nothing has told it to save yet. */
  if(PAD)tracingStoreKindOf(PAD.inst);
  groups.forEach(function(g){ g.w=tracingKindFor(g.inst); });
  const unnamed=groups.filter(function(g){return !g.w.name;});
  if(unnamed.length){
    tracingSay(unnamed.length===groups.length
      ?"Type what it is, or pick it from the list — the name becomes the object's name in "
       +"Blender."
      :"Number "+(unnamed[0].inst+1)+" has no type yet. Click it in the Drawing strip and say what "
       +"it is — with separate names on, each one needs its own.",true);
    document.getElementById("tracingName").focus();
    return [];
  }

  const nid=(document.getElementById("tracingNucId").value||"").trim();
  const rid=(document.getElementById("tracingRootId").value||"").trim();
  const type=document.getElementById("tracingType").value||"traced";

  /* A SERIES IS A KIND, NOT A PAD. Two mitochondria and a lysosome are Mitochondrion 1,
     Mitochondrion 2 and Lysosome 1 -- so the numbering is per series, each starting from what the
     cell already carries of THAT kind. */
  const seriesKey=function(w){
    return String(w.kind||"")+"|"+((w.kind==="other")?tracingSeriesLabel(w.name):"");
  };
  /* THE ID IS SETTLED FIRST, because it is what decides whether a structure is new. It used to
     be assigned after the numbering, which was harmless only while the numbering did not care. */
  if(!TRACING_PENDING.id){
    const label=groups[0].w.name;
    const prior=(TRACINGS_KEPT||[]).filter(function(x){return x&&x.id&&x.name===label;})[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);
  }
  /* WHERE THE OTHER STRUCTURES HANG FROM.  2026-09-19
     With nothing opened for editing, the pad's own id — so three structures drawn together are
     still X, X__i1, X__i2. With a tracing opened, TRACING_PENDING.id names somebody's EXISTING
     structure: `X__i1 + "__i2"` is the compound id Søren found in Drive, and `X + "__i1"` is worse,
     because that is a real and different lysosome. A fresh base, minted once and kept, is the only
     thing here that cannot already belong to something else. */
  if(!TRACING_BASE_ID)
    TRACING_BASE_ID = PAD_EDIT_ID ? UJ.tracing.structureId(groups[0].w.name || "tracing")
                                  : TRACING_PENDING.id;
  /* A WHOLE CELL OPENED ON THE PAD, 2026-09-21: each number knows the shared tracing it came from
     (PAD_EDIT_IDS, tracingOpenCellShared), and is a version of that one. */
  const editOf=function(g){ return (typeof PAD_EDIT_IDS!=="undefined"&&PAD_EDIT_IDS[String(g.inst)])||""; };
  /* One expression for what a structure is called, used by the numbering below AND by the
     submission at the end. They were two copies of it, which is how they could have disagreed. */
  const idOf=function(g){ return editOf(g)||(g.inst?(TRACING_BASE_ID+"__i"+g.inst):TRACING_PENDING.id); };

  /* ── A VERSION KEEPS ITS NUMBER ─────────────────────────────────────────────────  2026-09-19
     Søren: *"because I have edited one of the lysosomes twice, it is now called Lysosome 5... I
     would like that editing it does not increase its number."* Every structure used to be handed
     "one more than the highest this cell carries", including one that IS that highest. Three
     lysosomes came out numbered 1, 3 and 5.

     Only genuinely new structures draw from the fresh numbers now, so a new organelle traced beside
     an edited one still gets the next free one rather than inheriting anything. */
  const first={}, taken={}, count={}, keep={};
  groups.forEach(function(g){
    const k=seriesKey(g.w);
    count[k]=(count[k]||0)+1;
    const has=tracingPublishedIndex(idOf(g));
    if(has){ keep[g.inst]=has; return; }
    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid);
  });

  return groups.map(function(g){
    const k=seriesKey(g.w);
    const mine=keep[g.inst]||0;
    let index, several;
    if(mine){
      index=mine;
      /* It was published WITH a number, so it keeps one: dropping it on a re-add would rename
         "Lysosome 3" to "Lysosome" and make the same object look like a different one. */
      several=(mine>1)||(count[k]>1);
    } else {
      const n=(taken[k]||0); taken[k]=n+1;
      index=first[k]+n;
      several=(count[k]>1)||(first[k]>1);
    }
    const t={name:UJ.tracing.instanceName(g.w.name,index,several),
             kind:g.w.kind,type:type,
             color:(typeof padInstColour==="function")?padInstColour(g.inst):"#3a6b5a",
             traced_by:(typeof REPORTER_NAME!=="undefined"&&REPORTER_NAME)||"",
             rings:g.rings};
    if(several){t.instance_index=index;t.instance_of=g.w.kind||"";}
    /* MEASURED ONCE, HERE, per structure -- so the number stored against each one is the number
       shown against it on the pad, and two organelles never share a volume. */
    const vol=tracingVolumeOf(t.rings);
    if(vol&&vol.ok){
      t.volume_um3=vol.volumeUm3;
      t.volume_method="cavalieri";
      t.volume_trapezoid_um3=vol.volumeTrapezoidUm3;
      t.section_gap_nm=vol.gapNm;
      t.area_um2=vol.areaUm2;
      t.areas=vol.perSection.map(function(q){return {z:q.z,areaUm2:q.areaUm2};});
    }
    if(nid)t.nucleus_id=nid;
    const cat=tracingCellAtVal();
    if(cat)t.cell_coord=cat;
    if(rid)t.root_id=rid;
    /* The pad's own index, not the published number: see the header. The first structure keeps the
       bare id, so editing a shared tracing and adding it back is still a version of THAT tracing;
       every other one hangs off the pad's base rather than off that tracing's id (2026-09-19). */
    t.id=idOf(g);
    return t;
  });
}

/* ── SOMEWHERE TO GO AND DRAW ────────────────────────────────────────────────────  2026-09-17
   Søren: "I don't see any link to a neuroglancer instance anywhere where I can go and use the
   polygon tool to trace a cell." There wasn't one, and the tool the card named does not exist in
   any viewer a link can reach -- see src/a_viewer_to_trace_in.py for what was measured.

   Same state buildState() gives the jump arrow -- his viewer, his layer ticks, this coordinate --
   plus an empty annotation layer with the line tool live. */
/* Where the viewer opens: the card's own boxes, or the cell on screen if they are empty.

   HALF-FILLED IS AN ERROR. Two of three means he is mid-type; falling back to CUR_POS there opens
   a viewer somewhere else that looks exactly like a viewer in the right place, and he finds out two
   sections into a tracing. All three, or none. */
/* cellCardFold moved to core/panel.js on 2026-09-20 — three copies had already drifted in
   their comments, and λJump and βJump were about to make it five. See the header there. */
function tracingPos(){
  const val=function(id){const el=document.getElementById(id);return el?String(el.value||"").trim():"";};
  const raw=[val("tracingX"),val("tracingY"),val("tracingZ")];
  const given=raw.filter(function(s){return s!=="";}).length;
  if(given===3){
    const p=raw.map(Number);
    if(!p.every(function(n){return isFinite(n);}))
      return {error:"That coordinate has something in it that is not a number."};
    return {pos:p.map(Math.round)};
  }
  if(given>0)return {error:"All three of x, y and z, or leave them empty to use the cell on screen."};
  if(window.CUR_POS&&window.CUR_POS.length===3)return {pos:window.CUR_POS.slice()};
  return {error:"Type a coordinate above, or search a cell first \u2014 the viewer has to open somewhere."};
}

/* ── THE BOXES FOLLOW THE CELL YOU LOOKED UP ────────────────────────────────────  2026-09-17
   Søren: *"If a cell has been looked up in the cell identity window, that cell's coordinates should
   be in the cells trace coordinate window."*

   They did, once: on load and when the card was opened, and only while the boxes were EMPTY. Which
   meant the ordinary order of work did not work. Open the card, look at a cell, look at a second
   cell -- the boxes still hold the first one, because they are no longer empty, and nothing here
   ever looked again.

   TWO CHANGES. The fill now happens whenever a cell is looked up, not only when the card is opened;
   and "empty" became "still ours" -- the boxes are refilled when they hold exactly what this
   function last put there, which is the real question (has he typed a coordinate of his own?) and
   not the one that was being asked.

   A COORDINATE HE TYPED IS NEVER OVERWRITTEN. It says so instead, with a button, because silently
   leaving stale coordinates in place is how you trace the wrong cell. */
var TRACING_POS_AUTO = "";
function tracingPosEls(){
  return ["tracingX","tracingY","tracingZ"].map(function(i){ return document.getElementById(i); });
}
function tracingPosNow(){
  return tracingPosEls().map(function(e){ return e ? String(e.value||"").trim() : ""; }).join(",");
}
function tracingFillPos(force){
  const els = tracingPosEls();
  if (els.some(function(e){ return !e; })) return;
  if (!(window.CUR_POS && window.CUR_POS.length === 3)) return;
  const want = window.CUR_POS.map(function(n){ return String(Math.round(n)); });
  const now = tracingPosNow();
  const ours = (now === ",,") || (now === TRACING_POS_AUTO);
  const say = document.getElementById("tracingPosSay");
  if (!ours && !force){
    /* His own coordinate stands. But the cell on screen has moved on from it, and that is worth
       one sentence and one button rather than a silent disagreement. */
    if (say && now !== want.join(",")){
      say.innerHTML = 'The cell on screen is at <b>' + escHtml(want.join(", ")) + '</b>, which is '
        + 'not what is in the boxes. <button type="button" class="hist-chip" id="tracingPosTake">'
        + 'use the cell on screen</button>';
      const take = document.getElementById("tracingPosTake");
      if (take) take.addEventListener("click", function(){ tracingFillPos(true); });
    }
    return;
  }
  els.forEach(function(e, i){ e.value = want[i]; });
  TRACING_POS_AUTO = want.join(",");
  if (say) say.textContent = "From the cell you looked up.";
  /* The pad is not moved under him: it is a view he may be drawing in, and a cell lookup is not a
     request to abandon it. The boxes are where the NEXT pad opens. */
}

/* WHY A PROPERTY AND NOT A POLL. CUR_POS is assigned in four places in this file -- the own-record
   panel, the nucleus panel, the URL restore, the community panel -- and none of them is an event
   this card could listen to. Wrapping the property makes every one of them an event without any of
   them knowing, which is the only version of this that cannot fall out of step by being forgotten
   at the fifth assignment. Feature-detected and reversible: if defineProperty is refused, the card
   behaves exactly as it did before. */
(function watchCurPos(){
  try {
    var held = window.CUR_POS;
    Object.defineProperty(window, "CUR_POS", {
      configurable: true,
      get: function(){ return held; },
      set: function(v){
        held = v;
        try { tracingFillPos(false); } catch (e){}
      }
    });
  } catch (e){}
})();

/* ── THE CONTOURS, BACK IN A VIEWER ─────────────────────────────────────────────  2026-09-17
   Søren: *"We need a way to look at the segmentations in Neuroglancer also."*

   This card has always read contours OUT of a Neuroglancer link. This is the other direction, and
   it is what makes a traced structure a thing you can go and LOOK at rather than only a number in
   a list: ONE ANNOTATION LAYER PER STRUCTURE, named for it and in its own colour, each contour a
   closed loop of line annotations.

   LINES, NOT POLYGONS, for the same reason tracingOpen() hands out the point tool: no viewer a
   link can reach has a polygon tool (measured 2026-09-17), and an annotation type a viewer does not
   know is one it does not draw. Closed loops of lines are also exactly what core/tracing.js reads
   back — chainLines() joins them end to end within a section — so a tracing opened this way can be
   edited there and pasted straight back in here. That round trip is the point.

   One layer PER STRUCTURE rather than one for all of them, for two reasons that happen to agree:
   a layer carries one colour, and the reader chains loose lines within a layer, so two structures
   sharing one would be read back as one. */
/* ── AND THE LINK IT BUILDS SHOWS IT ─────────────────────────────  2026-09-19
   Søren: *"For the jump button here, it would make sense that it shows the organelle."*

   The other end of core/panel.js's ORGAN_SHOW_NEXT: a Jump beside an organelle arms it, and the
   next link this page builds gets that organelle on it. Read once and cleared, because every
   navigation rebuilds the link and contours left over from the last jump would be drawn at a
   coordinate they have nothing to do with -- which looks exactly like a correct answer.

   Returns whether anything went on, so the check can tell "nothing was armed" from "something was
   armed and dropped". */
function organOverlayInto(st, pos){
  const want = (typeof ORGAN_SHOW_NEXT !== "undefined") ? ORGAN_SHOW_NEXT : null;
  if (!want || !st) return false;
  /* ── THE COORDINATE IT WAS ARMED AT, NOT THE FIRST CALLER ──────────────  2026-09-20
     Søren: *"the jump buttons for the organelles do not include the segmentation data or the
     centroid annotation."* They did -- in the out-box link. The ↗ beside the cell's name is built
     by showNucleus, which runs BEFORE buildState, so an overlay consumed by the first caller could
     never reach the link he actually clicks.

     So it is not consumed. What stops a lysosome's contours being drawn somewhere they do not
     belong is now the thing that actually decides it: the position. Armed at a coordinate, applied
     to every state built for that coordinate, and silently absent everywhere else -- which is what
     "one shot" was reaching for and only approximated. */
  const at = want.point;
  if (at && pos && pos.length === 3){
    const same = at.every(function(n, i){ return Math.round(n) === Math.round(pos[i]); });
    if (!same) return false;
  }
  /* Neuroglancer keys layers by name, and the page's own base state may already carry one called
     this -- tracingViewerOpen's reason, and the same answer. */
  const nm = (String(want.name || "").replace(/[^\w .\u00b5-]+/g, "").trim() || "organelle");
  /* THE OUTLINE AND THE CENTRE, TOGETHER. It used to be one or the other, so the row that reads
     `centre (295844, 151391, 17862)` sent you to that coordinate with nothing marking it. They are
     two different claims about one organelle -- what shape it is, and where the record says it is
     -- and the reason to have both is to see them against each other. One layer, because it is one
     organelle. */
  let anns = [];
  if (want.rings && want.rings.length) anns = tracingRingLines(want.rings, "org");
  if (want.point && want.point.length === 3)
    anns = anns.concat([{ type: "point", id: "orgcentre",
                          point: want.point.map(Math.round) }]);
  if (!anns.length) return false;
  st.layers = (st.layers || []).filter(function(l){
    return !(l && l.type === "annotation" && String(l.name || "") === nm);
  });
  st.layers.push({ type: "annotation", source: "local://annotations", tab: "annotations",
                   name: nm, annotationColor: want.color || "#40e28c", annotations: anns });
  st.selectedLayer = { layer: nm, visible: true };
  return true;
}
function tracingRingLines(rings, idPrefix){
  const out = [];
  (rings || []).forEach(function(r, ri){
    const pts = r.points || [];
    if (pts.length < 3) return;
    const z = Math.round(r.z);
    for (let i = 0; i < pts.length; i++){
      const a = pts[i], b = pts[(i + 1) % pts.length];   // closed: the last vertex joins the first
      out.push({ type: "line", id: idPrefix + "_" + ri + "_" + i,
                 pointA: [Math.round(a[0]), Math.round(a[1]), z],
                 pointB: [Math.round(b[0]), Math.round(b[1]), z] });
    }
  });
  return out;
}
/* Where the viewer lands: the middle of what is being shown, not the box at the top of the card,
   which may still hold the coordinate of a different cell. */
function tracingCentreOf(structs){
  let n = 0, sx = 0, sy = 0; const zs = [];
  structs.forEach(function(t){
    (t.rings || []).forEach(function(r){
      zs.push(r.z);
      (r.points || []).forEach(function(p){ sx += p[0]; sy += p[1]; n++; });
    });
  });
  if (!n) return null;
  zs.sort(function(a, b){ return a - b; });
  return [Math.round(sx / n), Math.round(sy / n), Math.round(zs[zs.length >> 1])];
}
/* ── THE CELL AND ITS NUCLEUS, IN THE 3D PANE ───────────────────────────────────  2026-09-17
   Søren: *"I would like that the neuron and its nucleus are showing in the 3D window when opening
   in Neuroglancer."*

   buildState() already selects segments — but from CUR_ROOT/CUR_NUCID, the globals for whichever
   cell is on the PANEL, which is not necessarily the cell this tracing belongs to. So the tracing's
   own ids win here, and the layers are ADDED when the state has none (the segmentation tick can be
   off, and then there is nothing to select into).

   The cell is drawn see-through for the same reason it is in the pad's own 3D window: the contours
   are INSIDE it, and an opaque cell mesh hides the one thing this link exists to show. The nucleus
   is blue, here as everywhere else — blender/colour_policy.py, NUC_COLOR #3a72d8.

   Given NEITHER id, the selections are cleared rather than left alone. buildState would otherwise
   quietly hand back whatever cell happens to be on screen, and a mesh around somebody's contours
   that is not the cell they traced is worse than no mesh at all. */
/* ── THE COMMUNITY'S ROOT IDS FOR THIS NUCLEUS ─────────────────────────────  2026-09-21
   Søren: "when I show the segmented organelle in Neuroglancer, it only shows with the default root
   ID, not with the community reported root IDs." The same list the 3D model and the volume combine:
   the host's extraRootsFor, else the page's own fetchExtraRootIdsFor (µJump, δJump, πJump), else
   nothing. Cached per nucleus for the session, and never waited on for more than 5 s. */
var TRACING_EXTRA_ROOTS = {};
function tracingExtraRootsFor(nuc, root){
  nuc = String(nuc || ""); root = String(root || "");
  if (!nuc) return Promise.resolve([]);
  var f = (UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.extraRootsFor)
       || (typeof fetchExtraRootIdsFor === "function" ? fetchExtraRootIdsFor : null);
  if (!f) return Promise.resolve([]);
  var key = nuc + "|" + root;
  if (!TRACING_EXTRA_ROOTS[key]){
    TRACING_EXTRA_ROOTS[key] = Promise.resolve()
      .then(function(){ return f(nuc, root); })
      .then(function(l){ return (l || []).map(String).filter(function(x){ return x && x !== "0" && x !== root; }); },
            function(){ delete TRACING_EXTRA_ROOTS[key]; return []; });
  }
  var timeout = new Promise(function(res){ setTimeout(function(){ res(null); }, 5000); });
  return Promise.race([TRACING_EXTRA_ROOTS[key], timeout]).then(function(l){
    if (l === null){ delete TRACING_EXTRA_ROOTS[key]; return []; }   /* try again next time */
    return l;
  });
}
/* The state's cell layer: its first segmentation layer that is not the nuclei. */
function tracingCellLayerOf(st){
  var isNuc = function(l){ return /nucle/i.test(String(l.name || "") + " " + String(l.source || "")); };
  return ((st && st.layers) || []).filter(function(l){ return l && l.type === "segmentation" && !isNuc(l); })[0] || null;
}
/* The proposed root IDs onto a state's cell layer, after the root it already selects. The link's
   own cell layer first (δJump's card has no segmentation to read, but its viewer has v1dd_public,
   2026-09-21); a new one from the card's segmentation only where the link has none; else nothing. */
function tracingAddRootsTo(st, extra){
  if (!extra || !extra.length) return false;
  var cell = tracingCellLayerOf(st);
  if (!cell && !tracingSources().seg) return false;
  if (!cell){
    cell = { type: "segmentation", source: tracingSources().seg, tab: "source", name: "segmentation",
             notSelectedAlpha: 0.05, objectAlpha: 0.35 };
    st.layers.push(cell);
  }
  cell.segments = (cell.segments || []).slice();
  extra.forEach(function(x){ if (cell.segments.indexOf(x) < 0) cell.segments.push(x); });
  if (cell.objectAlpha == null) cell.objectAlpha = 0.35;
  /* One cell, one colour -- see this change's header. */
  cell.segmentColors = Object.assign({}, cell.segmentColors || {});
  cell.segments.forEach(function(x){ cell.segmentColors[x] = "#ff3b3b"; });
  return true;
}
function tracingShowCellIn(st, root, nuc){
  st.layers = st.layers || [];
  const isNuc = function(l){ return /nucle/i.test(String(l.name || "") + " " + String(l.source || "")); };
  const segLayers = st.layers.filter(function(l){ return l && l.type === "segmentation"; });
  let nucLayer  = segLayers.filter(isNuc)[0] || null;
  let cellLayer = segLayers.filter(function(l){ return !isNuc(l); })[0] || null;
  if (!root && !nuc){
    segLayers.forEach(function(l){ delete l.segments; });
    return false;
  }
  if (root){
    if (!cellLayer){
      cellLayer = { type: "segmentation", source: tracingSources().seg, tab: "source", name: "segmentation",
                    notSelectedAlpha: 0.05 };
      st.layers.push(cellLayer);
    }
    cellLayer.segments = [String(root)];
    /* Every segment of the cell, where a cell is many (χJump); see padSegOverlay. */
    try {
      const f = UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.cellIdsFor;
      if (typeof f === "function") (f(String(root), String(nuc || "")) || []).forEach(function(x){
        x = String(x); if (x && cellLayer.segments.indexOf(x) < 0) cellLayer.segments.push(x); });
    } catch (_e){}
    cellLayer.objectAlpha = 0.35;
  } else if (cellLayer){ delete cellLayer.segments; }
  if (nuc){
    if (!nucLayer){
      nucLayer = { type: "segmentation", source: tracingSources().nuc, tab: "source", name: "nuclei",
                   notSelectedAlpha: 0.05 };
      st.layers.push(nucLayer);
    }
    nucLayer.segments = [String(nuc)];
    nucLayer.objectAlpha = 0.6;
    nucLayer.segmentColors = Object.assign({}, nucLayer.segmentColors || {});
    nucLayer.segmentColors[String(nuc)] = "#3a72d8";
  } else if (nucLayer){ delete nucLayer.segments; }
  return true;
}
/* ── WHERE A CELL IS ─────────────────────────────────────────────────────────  2026-09-21
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
  const pos = (ids && ids.centre && ids.centre.length === 3) ? ids.centre.slice() : tracingCentreOf(structs);
  if (!pos){ tracingSay("Those contours have no coordinates to centre on.", true); return; }
  let st;
  try { st = buildState(pos); }
  catch (e){ tracingSay("Could not build a viewer link: " + String(e && e.message || e), true); return; }
  /* Same two layers tracingOpen() drops, for the same reasons: the Cortical layers bands are line
     annotations that would chain into these contours if this link were ever pasted back, and a
     leftover empty "tracing" layer is a place for a stray click to land. */
  st.layers = (st.layers || []).filter(function(l){
    return !(l && l.type === "annotation"
             && (/cortical layers/i.test(String(l.name || "")) || l.name === "tracing"));
  });
  const used = {}; let firstName = "";
  structs.forEach(function(t, i){
    /* Neuroglancer keys layers by NAME, so two structures called the same thing would be one layer
       with one of them in it. The number is already how they are told apart everywhere else. */
    let nm = String(t.name || "").replace(/[^\w .µ-]+/g, "").trim() || ("structure " + (i + 1));
    if (used[nm]) nm = nm + " (" + (i + 1) + ")";
    used[nm] = 1; if (!firstName) firstName = nm;
    st.layers.push({ type: "annotation", source: "local://annotations", tab: "annotations",
                     name: nm, annotationColor: t.color || "#40e28c",
                     annotations: tracingRingLines(t.rings, "t" + i) });
  });
  st.selectedLayer = { layer: firstName, visible: true };
  const shown = tracingShowCellIn(st, (ids && ids.root) || "", (ids && ids.nuc) || "");
  /* A 3D pane, or there is nowhere for the meshes to appear. xy-3d rather than 4panel: the contours
     live on xy sections, and three section panes to one 3D pane spends the width on two views that
     show the same outline twice. */
  st.layout = { type: "xy-3d", orthographicProjection: true };
  const viewerEl = document.getElementById("viewer");
  const base = (viewerEl && viewerEl.value) || "https://spelunker.cave-explorer.org/";
  const url = base + "#!" + encodeURIComponent(JSON.stringify(st));
  /* A tracing is tens of vertices a section, so this is comfortable; a hundred sections of freehand
     is not, and a URL the browser silently truncates would open a viewer missing half the cell
     without saying so. Better to say so here. */
  if (url.length > 1500000){
    tracingSay("Too many vertices to put in a viewer link (" + Math.round(url.length / 1000)
      + "k characters). Open one structure at a time, or use the Blender export.", true);
    return;
  }
  /* THE WHOLE CELL, 2026-09-21: the tab first, synchronously, then the community's root IDs for
     the nucleus onto the cell layer, then the tab is sent there. Where there are none to read the
     wait is nothing, and a backend that does not answer costs 5 s, not the view. */
  const nucId = (ids && ids.nuc) || "", rootId = (ids && ids.root) || "";
  /* A cell layer to put them in: the link's own (δJump's v1dd_public, which the card itself cannot
     read) or the card's segmentation -- 2026-09-21, Søren: "In dJump, I don't see it including the
     community reported root IDs". */
  const canExtra = !!nucId && !!(tracingCellLayerOf(st) || tracingSources().seg)
    && !!((UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.extraRootsFor) || typeof fetchExtraRootIdsFor === "function");
  if (!canExtra) window.open(url, "_blank", "noopener");
  else {
    let win = null;
    try { win = window.open("", "_blank"); } catch (_e){}
    tracingExtraRootsFor(nucId, rootId).then(function(extra){
      let u = url;
      if (tracingAddRootsTo(st, extra)) u = base + "#!" + encodeURIComponent(JSON.stringify(st));
      if (win){ try { win.opener = null; } catch (_e){} win.location.href = u; }
      else window.open(u, "_blank", "noopener");
      if (extra.length) tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + ".")) + " The cell "
        + "is shown with its " + extra.length + " community-proposed root ID" + (extra.length === 1 ? "" : "s")
        + " as well as " + (rootId ? "its own" : "its nucleus") + ".");
    });
  }
  const nStr = structs.length + " structure" + (structs.length === 1 ? "" : "s");
  const cellStr = shown
    ? " The cell is in the 3D pane, see-through, with its nucleus in blue inside it."
    : " No cell or nucleus ID on this tracing, so the 3D pane is empty — fill one in above and"
      + " open it again.";
  tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + " — " + nStr
    + ", one annotation layer each, in the colours they were drawn in. Edit them there and paste "
    + "the address bar back into the box above to read them in again.")) + cellStr);
}

/* ── SEGMENT THIS ONE ───────────────────────────────────────────────────────────  2026-09-18
   Søren: *"Where there is an annotation without a segmentation, there should be an option to start
   segmenting it."*

   The cell panel's Organelles section has the button; this is what it opens. The coordinate and the
   organelle both come from the annotation, so the pad opens ON the thing rather than near it and
   the type box already says what it is -- which is also what makes the outline pair back to that
   same annotation when it is added, and supersede it.

   Called by name from core/panel.js, guarded there: this card is not on every page that panel
   serves. */
/* ── THE CELL WITH ALL ITS ORGANELLES ───────────────────  2026-09-20
   Søren: *"There should also be an option to view the cells with all its organelles, but under
   the organelles list."*

   Each row's Jump answers "where is this one, and what shape is it". Three lysosomes in a microglia
   is a claim about the CELL -- where they sit relative to each other, whether they cluster, how
   much of the soma they take up -- and that is a picture you cannot assemble by pressing Jump three
   times.

   Called by name from core/panel.js's Organelles section and guarded there with a typeof, the same
   way openTracingAt below is: that panel serves six tools and only the ones with a tracing card can
   open a viewer full of contours.

   tracingViewerOpen does the work and is not touched. It gives each structure its own annotation
   layer in its own colour, centres on the middle of the lot, puts the cell in the 3D pane
   see-through with its nucleus in blue, and refuses politely when the URL would be longer than a
   viewer can swallow -- all written for the pad's own "Look at it in Neuroglancer", none of it ever
   pad-specific. A second caller, not a second implementation.

   `missing` is how many of this cell's outlines have not had their geometry read here. Said rather
   than waited for: fetching first and opening after would put the window.open in a different turn
   from the click, which is a window the browser does not let you have. */
function organShowAllInViewer(trs, nid, root, missing){
  const structs = (trs || []).filter(function(t){ return t && (t.rings || []).length; })
    .map(function(t){
      return { name: t.name || (t.instanceOf || t.kind || "organelle"),
               color: t.color || "#40e28c", rings: t.rings };
    });
  if (!structs.length){
    tracingSay("None of this cell’s outlines have been read here yet — open the "
      + "Organelles list, give it a moment, and try again.", true);
    return;
  }
  const what = structs.length + " organelle" + (structs.length === 1 ? "" : "s");
  tracingViewerOpen(structs,
    "Opened this cell with " + what + " on it — one annotation layer each, in the colours they "
    + "were drawn in."
    + (missing ? " " + missing + " more outline" + (missing === 1 ? " has" : "s have")
                 + " not been read here, so " + (missing === 1 ? "it is" : "they are")
                 + " not on it." : ""),
    { nuc: nid || "", root: root || "",
      centre: tracingCellCentre((trs || []).map(function(t){ return t && (t.cellCoord || t.cell_coord); })
                                  .filter(Boolean)[0] || "", nid) });
}
function openTracingAt(pt, kind){
  try {
    var panel = document.getElementById("tracingPanel");
    if (panel) panel.open = true;
    var card = document.getElementById("tracingCard");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });
    ["tracingX", "tracingY", "tracingZ"].forEach(function(id, i){
      var e = document.getElementById(id);
      if (e && pt && isFinite(pt[i])) e.value = Math.round(pt[i]);
    });
    /* The type, when the page's dropdown has it. An organelle kind this page does not know is not
       an error -- the boxes are still filled and the person picks. */
    var what = document.getElementById("tracingWhat");
    if (what && kind){
      var has = [].slice.call(what.options).some(function(o){ return o.value === kind; });
      if (has){
        what.value = kind;
        what.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    /* The ids of the cell it belongs to, so the outline is filed against the same cell the
       annotation was -- otherwise pairing them afterwards would be a coincidence. */
    var fill = function(id, v){ var e = document.getElementById(id); if (e && v) e.value = v; };
    fill("tracingNucId", (typeof CUR_NUCID !== "undefined" && CUR_NUCID) || "");
    fill("tracingRootId", (typeof CUR_ROOT !== "undefined" && CUR_ROOT) || "");
    padOpen();
    tracingSay("Tracing " + (kind ? tracingWhatOf(kind, "").name : "this organelle") + " at "
      + (pt || []).join(", ") + " — outline it on at least two sections. Its centre becomes "
      + "the cell's coordinate for it, more precise than the logged point.");
  } catch (e){
    tracingSay("Could not open the pad there: " + String(e && e.message || e), true);
  }
}

function tracingOpen(){
  const got=tracingPos();
  if(got.error){tracingSay(got.error,true);return;}
  const pos=got.pos;
  let st;
  try{st=buildState(pos);}catch(e){tracingSay("Could not build a viewer link: "+String(e&&e.message||e),true);return;}
  /* The Cortical layers bands are `line` annotations in a local annotation layer, so leaving them
     on the link he traces over means ringsFromLink() chains them in with his contours into rings
     that span the dataset. They are also a thick grid over the picture he is trying to draw on. */
  st.layers=(st.layers||[]).filter(function(l){
    return !(l&&l.type==="annotation"&&/cortical layers/i.test(String(l.name||"")));});
  st.layers=st.layers.filter(function(l){return !(l&&l.type==="annotation"&&l.name==="tracing");});
  /* ── THE VIEWER YOU DRAW IN IS NOT THE VIEWER YOU SHARE FROM ──────────────────  2026-09-18
     Søren, with a screenshot of ngl.microns-explorer.org and a state full of single points: "If it
     is armed, why does it still produce single point annotations when I try?"

     Because it was armed correctly and he was in the wrong viewer. The picker at the top of the
     Jump tab was choosing this one too, and that picker exists for a different job: it says which
     viewer to VIEW a cell in, and its first option is the MICrONS viewer because that is the one
     with a Share button. Sharing and drawing are not the same requirement, and coupling them meant
     the drawing route inherited a preference made for sharing.

     So tracing opens SPELUNKER, always. It is the only viewer measured to have a polyline at all
     (from his own pasted state, 2026-09-18), the tool has no button in its toolbar, and a layer's
     `tool` in the state is the armed tool -- so this link opens it with the polyline already live
     and nothing to hunt for. His viewer preference still governs every other link this page writes.

     A viewer without polylines could still be traced in with the point tool, which core/tracing.js
     reads -- but offering that choice is what produced a cell ringed with six loose points and a
     puzzled question, so it is not offered. */
  const TRACE_VIEWER="https://spelunker.cave-explorer.org/";
  st.layers.push({type:"annotation",source:"local://annotations",tool:"annotatePolyline",
                  tab:"annotations",name:"tracing",annotations:[]});
  st.selectedLayer={layer:"tracing",visible:true};
  st.layout="xy";   // tracing happens on sections; the 3D pane only takes the width
  window.open(TRACE_VIEWER+"#!"+encodeURIComponent(JSON.stringify(st)),"_blank","noopener");
  tracingSay("Spelunker opened at "+pos.join(", ")+", on a layer called \u201ctracing\u201d with the "
    +"POLYLINE tool already live \u2014 there is no button for it in any viewer\u2019s toolbar, so "
    +"the link arms it. Click round the cell, then click the first vertex again to close the ring; "
    +", and . step a section. Spelunker rather than the viewer picked at the top of the Jump tab, "
    +"because it is the only one with a polyline. Paste the address bar back here.");
}

/* ── ADDING A TRACING IS SHARING IT ─────────────────────────────────────────────  2026-09-17
   One button. The tracing is kept in this page -- so the 3D export works signed out and with no
   backend at all -- and posted to the shared record in the same press.

   SIGNED OUT IT QUEUES, IT DOES NOT REFUSE. Attribution needs a verified Google identity, and
   stopping there would be the old two-button behaviour wearing one button's clothes. So it is kept
   with `pending_share` on it, the list says so, and tracingFlush() sends it as soon as a sign-in
   appears. */
function tracingKeep(){
  /* ONE PRESS, EVERY STRUCTURE ON THE PAD. Søren, 2026-09-17: several organelles of the same type,
     each with its own number. They are separate tracings from here on -- separate rows, separate
     files, separate volumes -- and the only thing this loop shares between them is the press. */
  const all=tracingCurrentAll();
  if(!all.length)return;
  all.forEach(function(t){
    // Keeping the same tracing twice used to put the cell in the Blender scene twice.
    const at=TRACINGS_KEPT.findIndex(function(x){return x&&x.id&&x.id===t.id;});
    const prior=at>=0?TRACINGS_KEPT[at]:null;
    if(prior&&prior.shared_at)t.shared_at=prior.shared_at;
    /* ── AND WHAT IT HAS ALREADY REGISTERED ─────────────────────────────────────  2026-09-19
       Søren: *"the 3 lysosomes I have segmented seem to have 2 annotation points each... they
       should only have one annotation point."*

       `shared_at` was carried across a re-add and `centre_registered` was not, so every re-add
       looked like a tracing that had never registered its centre and posted a second point. The
       COORDINATE comes with it, because the flag alone would be the wrong fix for the other half of
       what he saw: when an outline is edited its centroid moves, and a tracing that refuses to
       re-register leaves the stale point standing. Moved is the question; pressed is not. */
    if(prior&&prior.centre_registered)t.centre_registered=prior.centre_registered;
    if(prior&&prior.centre_at)t.centre_at=prior.centre_at;
    t.pending_share=true;
    if(at>=0)TRACINGS_KEPT.splice(at,1,t); else TRACINGS_KEPT.push(t);
  });
  tracingWrite(TRACINGS_KEPT);
  /* Committed: the contours are in the dataset now and the card is about nothing. The preview goes
     with it -- a context left behind belongs to a tracing that is no longer pending -- and so do
     the volume lines, which is the same clearing padOpen needs and is therefore the same function.
     2026-09-19: this used to be three statements here and one of them missing there. */
  tracingPendingClear();
  document.getElementById("tracingLink").value="";
  let sent=0;
  all.forEach(function(t){ if(tracingPublish(t))sent++; });
  /* IT IS NOT A DRAFT ANY MORE. Kept locally and queued or shared, and either way the way back to
     it is the list -- so a stale draft here would be a second, older copy of the same cell waiting
     to be resumed on top of it. */
  draftClear();
  /* THE PAD IS FINISHED TOO, 2026-09-19. draftClear() one line up already says this work is no
     longer unfinished; the pad has to agree, or the next thing drawn joins contours that are
     already in the dataset and goes in again with them. (Harmless until today, because padOpen
     replaced the pad regardless -- which is the bug this is part of fixing.) The way back to a
     tracing after it is added is "Show the tracings in the dataset", which opens it for editing
     with its id attached, so nothing is stranded. */
  if (PAD){
    PAD.rings = []; PAD.pending = []; PAD.stroke = null; PAD.inst = 0;
    PAD_INST_KIND = {}; PAD_INST_COLOUR = {};
    try { padPaint(); padRings(); } catch (_e){}
  }
  PAD_EDIT_ID = ""; TRACING_BASE_ID = ""; PAD_EDIT_IDS = {};
  tracingRenderList();
  const what=all.length===1
    ?'“'+all[0].name+'”'
    :all.length+' structures — '+all.map(function(t){return t.name;}).join(", ");
  tracingSay(sent===all.length
    ?what+' '+(all.length===1?'is':'are')+' in the dataset and in this page’s 3D export. '
     +'Anybody can open '+(all.length===1?'it':'them')+' from the list at the bottom of this card '
     +'and add to '+(all.length===1?'it':'them')+' — that becomes the next version, with their '
     +'name beside yours, and nothing of this one is deleted.'
    :what+' '+(all.length===1?'is':'are')+' kept here and in your 3D export. '
     +(all.length===1?'It has':'They have')+' NOT reached the dataset yet — sign in with Google '
     +'(the account button, top right) and '+(all.length===1?'it goes':'they go')+' up on '
     +(all.length===1?'its':'their')+' own.');
  tracingFlushSoon();
}

/* Returns whether it went. `quiet` is for the automatic flush, which must not fire a sign-in
   prompt at somebody who did not just press anything. */
/* ── AN OUTLINE REGISTERS ITS OWN CENTRE ────────────────────────────────────────  2026-09-18
   Søren: *"When drawing a segmentation of an organelle that does not have an annotation, the
   volumetric center of the segmentation should be registered as an annotation."*

   An ordinary `organelle_location` row, so everything that reads annotations -- the per-cell
   summary, the counts beside the filter, the Master cell list -- sees it without knowing anything
   new. An organelle that has been outlined stops being invisible to half the tool.

   It goes out SILENTLY (his word): noteSaveResult says nothing when it worked and says what the
   server said when it did not, so three organelles in one press cost no extra toasts and a
   deployment that refuses the write still gets to say so. The tracing's own toast announces the
   press already.

   ONLY AN ORGANELLE. A traced cell or nucleus is the cell, not something inside it, and the
   organelle annotations are a list of things inside cells.

   AND ONLY FOR A CELL. An annotation is filed against a nucleus or a root ID; a tracing with
   neither has nowhere to be an annotation OF, and inventing a home for it would put it on whatever
   cell happened to be on screen. */
/* Where a tracing's centre is, as the string the annotation carries, or "" for a tracing that
   has no business having one. Split out of tracingRegisterCentre so that "has this moved?" can be
   asked without posting anything -- the two were one function, which is why the only question
   available was "has anything been pressed?". */
function tracingCentreAt(t){
  try {
    if (!t || !t.rings || !t.rings.length) return "";
    const kind = String(t.kind || "").toLowerCase();
    if (!kind || kind === "cell" || kind === "nucleus") return "";
    if (!window.UJ || !UJ.organellelink) return "";
    if (!String(t.nucleus_id || "") && !String(t.root_id || "")) return "";
    const c = UJ.organellelink.centre(t.rings);
    return (c && c.point) ? c.point.join(",") : "";
  } catch (_e){ return ""; }
}
function tracingRegisterCentre(t){
  try {
    if (!t || !t.rings || !t.rings.length) return false;
    const kind = String(t.kind || "").toLowerCase();
    if (!kind || kind === "cell" || kind === "nucleus") return false;
    if (!window.UJ || !UJ.organellelink) return false;
    const nid = String(t.nucleus_id || ""), rid = String(t.root_id || "");
    if (!nid && !rid) return false;
    const c = UJ.organellelink.centre(t.rings);
    if (!c || !c.point) return false;
    const at = c.point.join(",");
    /* The row explains itself in the sheet before any column is read. */
    const say = "Volumetric centre of the outlined “" + (t.name || kind) + "”"
      + (isFinite(t.volume_um3) ? " (" + (t.volume_um3 >= 1 ? t.volume_um3.toFixed(2)
          : t.volume_um3.toFixed(4)) + " µm³, " + c.sections + " sections)" : "")
      + ", registered from the segmentation rather than placed by hand."
      /* A centroid can fall outside a curved object. It is still where the organelle is; it is not
         a point ON it, and the difference is worth one clause. */
      + (c.inside ? "" : " The centroid lies outside the outline — a curved shape — so "
                       + "this marks where it is rather than a point on it.");
    const payload = { type: "organelle_location",
      timestamp: new Date().toISOString(),
      nucleusId: nid, rootId: rid, coord: at,
      groupId: "centre_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      subIndex: 1, subCount: 1,
      kind: kind, pointA: at, pointB: "",
      identified: t.type || "", path: "", comment: say,
      /* WHERE IT CAME FROM, in columns as well as in words. ensureHeaderColumn on the backend adds
         both by itself, which is how every optional field on that sheet has arrived; a deployment
         older than today simply ignores them and the row is still a correct annotation. */
      source: "segmentation", fromStructureId: t.id || "",
      reporterName: (typeof REPORTER_NAME !== "undefined" && REPORTER_NAME) || "",
      reporterEmail: (typeof REPORTER_EMAIL !== "undefined" && REPORTER_EMAIL) || "",
      credential: (typeof GOOGLE_CREDENTIAL !== "undefined" && GOOGLE_CREDENTIAL) || "" };
    if (typeof noteSaveResult === "function") noteSaveResult(payload);
    else tracingPost(payload);
    /* The panel caches the annotations for a minute; this one should be in the next draw of the
       section it belongs to rather than a minute later. */
    try { if (typeof PANEL_TRACINGS !== "undefined") PANEL_TRACINGS_AT = 0; } catch (_e){}
    return true;
  } catch (e){
    console.warn("[uJump tracing] could not register the centre:", e && e.message);
    return false;
  }
}

function tracingPublish(t,quiet){
  if(!t||!t.rings||!t.rings.length)return false;
  const signedIn=(typeof GOOGLE_VERIFIED!=="undefined"&&GOOGLE_VERIFIED)
                &&(typeof GOOGLE_CREDENTIAL!=="undefined"&&GOOGLE_CREDENTIAL);
  if(!signedIn){
    if(!quiet&&typeof reportGateBlock==="function")reportGateBlock();   // offers the prompt itself
    return false;
  }
  /* ONE POST FOR THE WHOLE TRACING.  2026-09-17
     The geometry no longer goes into the sheet -- the backend writes it to a JSON file in Drive and
     keeps one index row -- so a share is one submission carrying every contour, where it used to be
     one POST per contour. groupId names this act of sharing: it is half of the key the backend
     versions on, and it is in the file's name. */
  const gid="trace_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
  const sub=UJ.tracing.toSubmission(t.rings,{structureId:t.id,name:t.name,kind:t.kind||"",
                                             cellType:t.type,color:t.color,
                                             nucleusId:tracingScoped(t.nucleus_id||""),rootId:t.root_id||"",
                                             cellCoord:t.cell_coord||"",
                                             /* the size goes with it -- Søren, 2026-09-17: "add the
                                                volumes to the data for the cell when submitting" */
                                             instanceIndex:t.instance_index,
                                             instanceOf:t.instance_of,
                                             volumeUm3:t.volume_um3,
                                             volumeMethod:t.volume_method,
                                             volumeTrapezoidUm3:t.volume_trapezoid_um3,
                                             sectionGapNm:t.section_gap_nm,
                                             areaUm2:t.area_um2, areas:t.areas});
  if(!sub.contours.length)return false;
  const ok=postReport(Object.assign({timestamp:new Date().toISOString(),groupId:gid},sub),
                      "Tracing added to the dataset \u2014 thank you.");
  if(ok===false)return false;
  t.pending_share=false;
  t.shared_at=new Date().toISOString();
  /* A PROMISE IS NOT A YES, 2026-09-21. λJump, βJump, ηJump and ωJump answer with a promise of
     {ok, error}; the backend can still refuse (a token that lapsed in flight, a deployment that
     does not know the type). A refused tracing goes back on the queue it would otherwise have been
     taken off, so it is sent on the next sign-in, and the card says why it was not. */
  if(ok&&typeof ok.then==="function"){
    ok.then(function(d){
      if(!(d&&d.ok===false))return;
      t.pending_share=true; t.shared_at="";
      tracingWrite(TRACINGS_KEPT); tracingRenderList();
      tracingSay("\u201c"+(t.name||"The tracing")+"\u201d did NOT reach the dataset: "
        +String(d.error||"the server refused it")+" It is kept here and goes up on its own once "
        +"you are signed in.");
      tracingFlushSoon();
    },function(){});
  }
  /* AFTER the tracing, and only if the tracing went: an annotation pointing at an outline that was
     refused would be a coordinate with nothing behind it. Once per tracing, not once per press, so
     a queued one registers its centre when it finally goes out too.

     ONCE PER PLACE, since 2026-09-19. "Once per tracing" was the intent and `centre_registered`
     the mechanism, but tracingKeep did not carry it and every re-add posted again. It carries it
     now, and the test is whether the centre has MOVED rather than whether anything was pressed:
     an unchanged re-add posts nothing, and an edited outline posts its new centre, which the
     backend files over the old one rather than beside it. */
  const centreNow=tracingCentreAt(t);
  /* A RECORD THAT SAYS REGISTERED BUT NOT WHERE is every tracing kept before today, and treating
     "place unknown" as "moved" would have re-registered all of them at once. So: never registered
     and it has a centre -> register; registered and the place is KNOWN to have changed -> register;
     registered with no place recorded -> leave it alone. The last of those means an old tracing
     edited tomorrow keeps its old point rather than gaining a second, which is the conservative
     direction of the two and the one this whole change is about. Caught by tracingpanelcheck.js,
     whose fourth tracing is exactly that record. */
  const moved=t.centre_registered
    ? !!(t.centre_at&&centreNow&&centreNow!==t.centre_at)
    : !!centreNow;
  if(moved&&tracingRegisterCentre(t)){
    t.centre_registered=true;
    t.centre_at=centreNow;
  }
  tracingWrite(TRACINGS_KEPT);
  return true;
}

var TRACING_FLUSH_TIMER=null;
function tracingPendingCount(){
  return (TRACINGS_KEPT||[]).filter(function(t){return t&&t.pending_share;}).length;
}
function tracingFlush(){
  if(!tracingPendingCount())return 0;
  var n=0;
  TRACINGS_KEPT.forEach(function(t){ if(t&&t.pending_share&&tracingPublish(t,true))n++; });
  if(n){ tracingWrite(TRACINGS_KEPT); tracingRenderList();
         tracingSay(n+" tracing"+(n===1?"":"s")+" went into the dataset now that you are signed in."); }
  return n;
}
/* POLLED, RATHER THAN HOOKED ONTO THE SIGN-IN. A credential arrives in this file from at least
   three places -- Google One Tap, the account chip's own flow, and a token restored on load -- and
   none of them is one event a card can listen to. The timer exists only while something is waiting
   and stops itself the moment nothing is, so signed in with an empty queue it never runs at all. */
function tracingFlushSoon(){
  if(TRACING_FLUSH_TIMER)return;
  TRACING_FLUSH_TIMER=setInterval(function(){
    if(!tracingPendingCount()){clearInterval(TRACING_FLUSH_TIMER);TRACING_FLUSH_TIMER=null;return;}
    tracingFlush();
  },4000);
}
/* ── THE SHAPE, WHILE IT IS STILL BEING MADE ────────────────────────────────────  2026-09-17
   Søren: *"there should also be a window below to show the 3D structure while it is being
   generated, so the user can get a view of what it looks like. Preferably also with the nucleus and
   root ID meshes as transparent. Perhaps this should be an option, rather than it loading
   immediately if it is slow to load."*

   Three things, and they cost wildly different amounts, which is why they are wired differently:

     THE TRACING is lofted by core/traceloft.js -- a millisecond for a forty-section cell -- so it
     is redrawn after every contour, with no ceremony and no asking.

     THE GHOSTS (the cell's own mesh for the root ID, the nucleus's for the nucleus ID) are
     megabytes over the network. They are fetched ONCE per (root, nucleus) pair, kept, and reused
     for every redraw after that; the checkbox turns them off for anyone who does not want to pay
     for them at all. This is the "perhaps this should be an option" he asked for, and the whole
     panel is behind a button for the same reason.

   IT IS NOT THE EXPORT'S SURFACE, and the panel says so. trace_mesh.py fills each section under the
   even-odd rule and marches cubes over the blend, so it treats a contour inside another as a hole
   and smooths across a skipped section. This lofts. On one closed outline per section -- which is
   what tracing a cell looks like -- they agree about the silhouette and differ in smoothness. */
var PAD3D_ON = false, PAD3D_BUSY = false, PAD3D_AT = 0, PAD3D_SOON = null;
var PAD3D_MESHES = null, PAD3D_KEY = "", PAD3D_NOTE = "";
/* The camera, kept across redraws. Without this, closing a contour snapped the view back to its
   starting angle -- which is exactly the moment somebody has just turned the cell to look at the
   part they are drawing. core/mesh3d.js mutates this object as the pointer drags it, so handing the
   same one back is all it takes. */
var PAD3D_VIEW = { yaw: 0.6, pitch: 0.3, dist: 1.9 };

/* ── WHICH CARD THE PREVIEW BELONGS TO ─────────────────────────────────────────  2026-09-19
   Søren: *"the neuroglancer link paste function needs to have a 3D rendering also, so you can see
   the 3D mesh before committing."*

   THE SAME RULE pad3DRings() BELOW ALREADY USES TO CHOOSE THE CONTOURS -- written once here so the
   picture and the contours in it can never disagree about whose tracing is being shown. The pad
   wins while it has anything on it (pressing "Use these contours" sets TRACING_PENDING but leaves
   the pad open, and the preview should stay where the person is working); a pasted link with no
   pad behind it draws in the paste card. */
function pad3DTarget(){
  if (PAD && PAD.rings && PAD.rings.length) return "pad";
  if (TRACING_PENDING && TRACING_PENDING.rings && TRACING_PENDING.rings.length) return "paste";
  return "pad";
}
function pad3DHosts(){
  return [document.getElementById("tracePad3DHost"),
          document.getElementById("tracingPaste3DHost")].filter(Boolean);
}
function pad3DHost(){
  return document.getElementById(pad3DTarget() === "paste" ? "tracingPaste3DHost"
                                                           : "tracePad3DHost");
}
/* The pad's preview is behind a button and stays behind it. The paste card's draws as soon as there
   are contours, because by then the person has pasted a link and is deciding whether to commit it,
   which is the whole of what was asked for. */
function pad3DWanted(){
  return pad3DTarget() === "paste" ? !!(TRACING_PENDING && TRACING_PENDING.rings
                                        && TRACING_PENDING.rings.length)
                                   : PAD3D_ON;
}
/* "with the cell and nucleus, see-through" under the kept tracings is the PASTED link's preview
   tick; shown only when that preview is the one drawing (2026-09-21, Søren: "What is the purpose
   of the ... tick down there?"). The pad has its own. */
function tracingPasteGhostsSync(){
  var t = document.getElementById("tracingPasteGhosts");
  if (!t) return;
  var l = (t.closest && t.closest("label")) || t;
  l.style.display = (pad3DTarget() === "paste") ? "flex" : "none";
}
function pad3DWantGhosts(){
  var t = document.getElementById(pad3DTarget() === "paste" ? "tracingPasteGhosts"
                                                            : "tracePadGhosts");
  return !!(t && t.checked);
}
/* The paste card has a colour picker of its own, and a preview in a different colour from the swatch
   six lines above it is the tool disagreeing with itself. The pad keeps taking the colour from the
   structure's chip. */
function pad3DTint(inst){
  /* ONLY WHILE THE CARD HAS ONE COLOUR TO GIVE, tightened 2026-09-19. A pasted link can now carry
     three structures, each with its own picker in the naming rows; taking the card's single swatch
     then would paint all three the same and contradict the list above them. */
  if (pad3DTarget() === "paste" && !tracingEachOwn()){
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
      .exec(String((document.getElementById("tracingColor") || {}).value || ""));
    if (m) return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }
  return padInstTint(inst);
}

/* The contours in hand: the pad's, or a tracing read from a pasted link if the pad is not the way
   it was made. */
function pad3DRings(){
  if (PAD && PAD.rings && PAD.rings.length) return UJ.tracepad.toRings(PAD);
  if (TRACING_PENDING && TRACING_PENDING.rings) return TRACING_PENDING.rings;
  return [];
}

/* A WebGL context per redraw would be a context leak with a browser-enforced limit -- "too many
   active WebGL contexts: oldest context will be lost" is a real message, and the oldest context on
   this page belongs to somebody's cell panel. Asking a canvas for its context again returns the
   SAME one, so this reaches the outgoing panel's context without the renderer having to hand it
   out. */
function pad3DRelease(){
  /* BOTH HOSTS, since 2026-09-19: the preview moves between the pad and the paste card, and a
     canvas left behind in the other one is two things at once -- a live context counting against
     the browser's limit, and a picture of a different tracing sitting under a card that is about
     this one. */
  const here = pad3DHost();
  pad3DHosts().forEach(function(h){
    const cv = h.querySelector("canvas");
    if (cv) try {
      const gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
      const e = gl && gl.getExtension("WEBGL_lose_context");
      if (e) e.loseContext();
    } catch (_e){}
    if (h !== here) h.innerHTML = "";
  });
}

function pad3DIds(){
  const nuc = (document.getElementById("tracingNucId").value || "").trim();
  const root = (document.getElementById("tracingRootId").value || "").trim();
  return { nuc: nuc, root: root, key: root + "|" + nuc };
}

/* Fetched once per pair of ids and kept. Neither failure is fatal: a cell with no mesh and a
   nucleus with none are both ordinary -- tracing is what you do when the segmentation has missed
   something -- so each is reported in the note and the rest still draws. */
async function pad3DGhostMeshes(){
  const ids = pad3DIds();
  if (PAD3D_MESHES && PAD3D_KEY === ids.key) return PAD3D_MESHES;
  const out = [], notes = [];
  /* core/mesh.js BY ITS OWN NAME FIRST.  2026-09-21. This looked only for a page global `MeshDL`,
     which µJump and δJump define as `const MeshDL = UJ.mesh;` and βJump never has — it calls the
     module UJ.mesh throughout. So the see-through cell could never load on βJump, and the note
     below would then have said there was no ID in a box that had one. */
  const MESH = (window.UJ && UJ.mesh && UJ.mesh.fetchCombinedMesh) ? UJ.mesh
             : ((typeof MeshDL !== "undefined" && MeshDL && MeshDL.fetchCombinedMesh) ? MeshDL : null);
  /* THE PAGE'S OWN READER FIRST (2026-09-22). χJump's cells are assemblies of cb2 fragments
     with their own mesh store; core/mesh.js is loaded there only for its exports and cannot read
     them. See src/the_pad_asks_the_page_for_the_cell_mesh.py. */
  const HOSTMESH = (window.UJ && UJ.cfg && UJ.cfg.tracing && typeof UJ.cfg.tracing.cellMesh === "function")
                 ? UJ.cfg.tracing.cellMesh : null;
  if (HOSTMESH){
    if (ids.root || ids.nuc){
      try {
        const hm = await HOSTMESH(ids.root, ids.nuc, function(msg){
          pad3DNote("fetching the cell\u2019s mesh\u2026 " + (msg || ""));
        });
        if (hm && hm.positions && hm.positions.length) out.push({ what: "cell", mesh: hm });
        else if (!hm || !hm.note) notes.push("the cell has no mesh to draw");
        if (hm && hm.note) notes.push(hm.note);
      } catch (e){ notes.push("the cell\u2019s mesh could not be read: " + String(e && e.message || e)); }
    }
  } else if (ids.root && ids.root !== "0" && MESH){
    try {
      const m = await MESH.fetchCombinedMesh(ids.root, function(f, msg){
        pad3DNote("fetching the cell’s mesh… " + (msg || Math.round((f || 0) * 100) + "%"));
      });
      if (m && m.positions && m.positions.length) out.push({ what: "cell", mesh: m });
      else notes.push("the cell has no mesh to draw");
    } catch (e){ notes.push("the cell’s mesh could not be read: " + String(e && e.message || e)); }
  }
  /* Only where the dataset HAS a nucleus volume. On βJump the box holds a Hoechst blob number,
     and a reader configured with no volume fetches the host's own 404 page as "/info". */
  if (ids.nuc && UJ.nucmesh && tracingSources().nuc){
    try {
      if (!UJ.nucmesh.configured()) UJ.nucmesh.configure({ nuc: tracingSources().nuc });
      pad3DNote("fetching the nucleus’ mesh…");
      const n = await UJ.nucmesh.fetchNucleus(ids.nuc);
      if (n && n.positions.length) out.push({ what: "nucleus", mesh: n });
      else notes.push("nucleus " + ids.nuc + " has no mesh in the nuclei volume");
    } catch (e){ notes.push("the nucleus mesh could not be read: " + String(e && e.message || e)); }
  }
  /* SILENCE WAS THE WORST OF THE THREE.  2026-09-20. With both id boxes empty this returned an
     empty list and an empty note, so the preview drew the contours alone and said nothing at all
     about the surroundings the tick above it had just promised. A tick that is on, and a picture
     with nothing in it, and no sentence joining them. */
  if (!out.length && !notes.length)
    notes.push("no cell or nucleus ID in the boxes above, so there is nothing to draw around it \u2014 "
             + "type one in, or open the pad from a cell");
  PAD3D_MESHES = out; PAD3D_KEY = ids.key; PAD3D_NOTE = notes.join("; ");
  return out;
}

/* core/mesh3d.js's renderer: UJ.mesh3dCore where a page keeps its own UJ.mesh3d (χJump), else
   UJ.mesh3d. See src/the_pad_draws_with_the_core_renderer.py. */
function tracingM3D(){
  return (window.UJ && UJ.mesh3dCore && UJ.mesh3dCore.prepare) ? UJ.mesh3dCore : UJ.mesh3d;
}
function pad3DNote(msg){
  const h = pad3DHost();
  if (h) h.innerHTML = '<p class="hint">' + escHtml(msg) + "</p>";
}

async function pad3DDraw(){
  if (!pad3DWanted() || PAD3D_BUSY) return;
  const host = pad3DHost(); if (!host) return;
  const rings = pad3DRings();
  if (!rings.length){
    pad3DNote("Close a contour and the shape appears here.");
    return;
  }
  PAD3D_BUSY = true;
  try {
    const res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    /* ── EACH STRUCTURE ON ITS OWN, IN ITS OWN COLOUR ──────────────────────────────  2026-09-17
       Søren: *"I would like if the different segmented meshes also have different colors in the 3D
       window."* Two things were wrong here and the colour was the visible one. Every contour on the
       pad went into ONE loft, so a contour belonging to number 2 and a contour belonging to number
       3 on the same section were treated as two contours of a SINGLE object and lofted to each
       other across the gap between them — the preview was not three organelles in one colour, it
       was one impossible organelle. Grouping by structure is what makes them separate surfaces;
       painting each in the colour its chip already carries is what he asked for. */
    const byInst = {}, order = [];
    rings.forEach(function(r){
      const k = r.inst || 0;
      if (!byInst[k]){ byInst[k] = []; order.push(k); }
      byInst[k].push(r);
    });
    order.sort(function(a, b){ return a - b; });
    const lofts = [];
    order.forEach(function(k){
      /* One structure failing to loft — a single stray vertex, a contour that is a line — must not
         cost the others their picture. */
      let lg = null;
      try { lg = UJ.traceloft.loft(byInst[k], res); } catch (_e){ lg = null; }
      if (lg && lg.positions && lg.positions.length) lofts.push({ inst: k, g: lg });
    });
    if (!lofts.length){ pad3DNote("Nothing to draw yet."); PAD3D_BUSY = false; return; }

    let ghosts = [];
    const wantGhosts = pad3DWantGhosts();
    if (wantGhosts) ghosts = await pad3DGhostMeshes();

    /* ONE FRAME FOR EVERYTHING, over the union of every structure and then the cell around them —
       see prepare()'s own comment. Letting each centre on itself would stack two mitochondria on
       top of one another, which looks like a picture and is a lie about where they are. The span is
       opened out when there are ghosts so the surroundings are visible rather than filling the
       view; the tracing is still the subject, and the wheel does the rest. */
    const raw = lofts.map(function(L){
      return tracingM3D().prepare(L.g.positions, L.g.indices, { unitNm: 1 });
    });
    const lo = raw[0].lo.slice(), hi = raw[0].hi.slice();
    raw.forEach(function(q){
      for (let i = 0; i < 3; i++){
        if (q.lo[i] < lo[i]) lo[i] = q.lo[i];
        if (q.hi[i] > hi[i]) hi[i] = q.hi[i];
      }
    });
    const frame = { mid: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
                    span: (Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1)
                          * (ghosts.length ? 2.5 : 1) };
    const geos = lofts.map(function(L){
      return tracingM3D().prepare(L.g.positions, L.g.indices, { unitNm: 1, frame: frame });
    });
    /* THE ONE BEING DRAWN IS THE SUBJECT, so the lighting and the wheel favour it — and it is the
       one whose shape you are deciding about right now. The rest are drawn SOLID beside it, not
       see-through: they are traced work, not context, and the see-through tier belongs to the cell
       and the nucleus that surround all of them. */
    let subject = 0;
    lofts.forEach(function(L, i){ if (L.inst === (PAD ? (PAD.inst || 0) : 0)) subject = i; });
    if (geos[subject].empty) subject = 0;
    const geo = geos[subject];
    if (geo.empty){ pad3DNote("Nothing to draw yet."); PAD3D_BUSY = false; return; }
    const siblings = [];
    geos.forEach(function(q, i){
      if (i === subject || q.empty) return;
      /* pad3DTint rather than padInstTint, 2026-09-19: the siblings asked the palette directly,
         which was right while the pad was the only route that could have several structures and
         wrong the moment a pasted link could. */
      siblings.push({ geo: q, tint: pad3DTint(lofts[i].inst), alpha: 1 });
    });

    const drawn = siblings.concat(ghosts.map(function(x){
      return { geo: tracingM3D().prepare(x.mesh.positions, x.mesh.indices,
                                      { unitNm: 1000, frame: frame }),
               /* The cell fainter than the nucleus: it is the larger surface and the one you are
                  most often looking THROUGH. */
               alpha: x.what === "cell" ? 0.14 : 0.35,
               /* BLUE MEANS NUCLEUS, here and in the Blender export and in the cell panel --
                  blender/colour_policy.py, 2026-09-08, quoting Søren: "the nucleus always blue",
                  NUC_COLOR #3a72d8. The cell around it is a neutral grey ON PURPOSE: the palette in
                  that policy reserves hues 200-250 for nuclei and 335-25 for vessels, and the
                  blue-grey this used to be sat at hue 222 -- inside the nucleus band, which is
                  exactly the confusion the reservation exists to prevent. */
               tint: x.what === "cell" ? [0.72, 0.72, 0.74]
                                       : (tracingM3D().NUC_TINT || [0.23, 0.45, 0.85]) };
    }));
    pad3DRelease();
    const um = [0, 1, 2].map(function(i){ return (hi[i] - lo[i]) / 1000; });
    const nContours = lofts.reduce(function(n, L){ return n + (L.g.contours || 0); }, 0);
    const nHoles = lofts.reduce(function(n, L){ return n + (L.g.holes || 0); }, 0);
    const zSeen = {};
    rings.forEach(function(r){ zSeen[r.z] = 1; });
    const nSections = Object.keys(zSeen).length;
    let lead = "<b>A preview, not the export’s surface.</b> <span class='hint'>The contours "
      + "lofted section to section — " + nContours + " contour" + (nContours === 1 ? "" : "s")
      + " on " + nSections + " section" + (nSections === 1 ? "" : "s") + ", "
      + um.map(function(v){ return v.toFixed(1); }).join(" × ") + " µm. The Blender export "
      + "fills each section and marches cubes over the stack, which is smoother.</span>";
    /* SAID OUT LOUD WHEN THERE IS ONE, since 2026-09-19. This caption used to end "...and treats a
       contour drawn inside another as a hole", which was the polite way of saying the preview did
       not -- it lofted the inner contour as a second tube. Now both do, and the thing worth saying
       instead is how many the tool found, because a hole it did NOT recognise is the failure a
       tracer needs to catch while the pad is still open. */
    if (nHoles)
      lead += "<br><span class='hint'>" + nHoles + " contour" + (nHoles === 1 ? " is" : "s are")
        + " drawn inside another, and " + (nHoles === 1 ? "is" : "are")
        + " cut out as " + (nHoles === 1 ? "a hole" : "holes") + " — here, in the volume above "
        + "and in the export.</span>";
    if (lofts.length > 1)
      lead += "<br><span class='hint'>" + lofts.length + " structures, each lofted on its own and "
        + "in the colour of its chip above — "
        + lofts.map(function(L){
            return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;'
              + 'background:' + escHtml(padInstColour(L.inst)) + '"></span> ' + (L.inst + 1); }).join(", ")
        /* "The one you are drawing" is the pad's sentence; on a pasted link nothing is being
           drawn and the subject is simply the first. 2026-09-19. */
        + (pad3DTarget() === "paste" ? ". The first one is the brightest.</span>"
                                     : ". The one you are drawing is the brightest.</span>");
    if (lofts.every(function(L){ return L.g.flat; }))
      lead += "<br><span class='hint'>One section only, so this is a flat outline. Step with "
        + "<b>,</b> or <b>.</b> and go round again to give it a shape.</span>";
    if (ghosts.length)
      lead += "<br><span class='hint'>See-through around it: "
        + ghosts.map(function(d){ return d.what; }).join(" and ") + ".</span>";
    if (PAD3D_NOTE && wantGhosts)
      lead += "<br><span class='hint'>" + escHtml(PAD3D_NOTE) + ".</span>";
    tracingM3D().show(host, geo, { lead: lead, ghosts: drawn, view: PAD3D_VIEW,
                                tint: pad3DTint(lofts[subject].inst),
                                emptyMessage: "Nothing to draw yet." });
  } catch (e){
    pad3DNote("Could not build the preview: " + String(e && e.message || e));
  }
  PAD3D_BUSY = false;
}

/* Coalesced. Closing a contour, deleting one and dragging a point all ask for a redraw, and a drag
   asks on every frame of it; rebuilding the whole loft each time would make the pad stutter on the
   one gesture that has to stay smooth. */
function pad3DSoon(){
  if (!pad3DWanted()) return;
  if (PAD3D_SOON) return;
  const wait = Math.max(0, 250 - (Date.now() - PAD3D_AT));
  PAD3D_SOON = setTimeout(function(){
    PAD3D_SOON = null; PAD3D_AT = Date.now(); pad3DDraw();
  }, wait);
}

/* ── HOW MUCH OF IT THERE IS ────────────────────────────────────────────────────  2026-09-17
   Søren: *"We need to calculate the organelle volumes also and add the volumes to the data for the
   cell when submitting."*

   core/traceloft.js does the arithmetic -- Cavalieri's estimator over the outlined areas, with the
   even-odd rule so a contour inside another is a hole -- and this half puts the number where it is
   useful: ON THE PAD WHILE DRAWING, because a volume you only see after submitting cannot tell you
   that you have traced one section too few; and on the submission, which is what he asked for.

   THE NUMBER STORED IS THE NUMBER HE SAW. It is measured here and passed into the submission rather
   than recomputed anywhere else, so the figure in the sheet is the one on the screen that persuaded
   him the tracing was finished. A second, independent computation at submission time could differ
   from it by a percent and nobody would ever find out which was which.

   IT IS AN ESTIMATE AND THE PANEL SAYS SO, with the sampling it was made at: a sphere traced every
   fifth section comes back about one percent light (measured in traceloftcheck.js), and a volume
   quoted without the spacing it was sampled at is a number without an error bar. */
function tracingVolumeOf(rings){
  try {
    if (!window.UJ || !UJ.traceloft || !UJ.traceloft.volume) return null;
    return UJ.traceloft.volume(rings || [], (UJ.cfg && UJ.cfg.res) || [4, 4, 40]);
  } catch (e){ return null; }
}
/* µm³ at a readable number of digits. An organelle is 0.01 µm³ and a cell is 5,000; one format
   cannot serve both, and rounding a lysosome to "0.0" would be the tool losing the measurement. */
function volFmt(v){
  if (!isFinite(v)) return "?";
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toExponential(2);
}
function tracingVolumeSay(v){
  if (!v) return "";
  if (!v.ok){
    return v.areaUm2 !== undefined
      ? "Outlined area " + volFmt(v.areaUm2) + " µm² on one section — " + v.reason + "."
      : "";
  }
  return "Volume " + volFmt(v.volumeUm3) + " µm³ (Cavalieri, " + v.sections
    + " section" + (v.sections === 1 ? "" : "s") + " every " + Math.round(v.gapNm) + " nm"
    + (v.evenlySpaced ? "" : ", unevenly spaced") + "). "
    + volFmt(v.volumeTrapezoidUm3) + " µm³ between the outermost contours, which is the "
    + "lower bound — the difference is what lies past them.";
}
function padVolume(){
  const el = document.getElementById("tracePadVol");
  if (!el || !PAD) return null;
  const all = UJ.tracepad.toRings(PAD);
  const insts = UJ.tracepad.instances(PAD).filter(function(it){ return it.contours; });
  /* ONE LINE EACH once there are several. A single figure over two mitochondria is the volume of
     no object at all -- it is the sum of two, which is a number nobody asked for and which looks
     exactly like the answer somebody did ask for. */
  if (insts.length > 1){
    el.innerHTML = insts.map(function(it){
      const v = tracingVolumeOf(all.filter(function(r){ return (r.inst || 0) === it.inst; }));
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;'
        + 'margin-right:4px;background:' + escHtml(padInstColour(it.inst)) + '"></span>'
        + '<b>' + (it.inst + 1) + '</b> — '
        + escHtml(v ? tracingVolumeSay(v) : "nothing yet");
    }).join("<br>");
    return null;
  }
  const v = tracingVolumeOf(all);
  el.textContent = v ? tracingVolumeSay(v) : "";
  return v;
}
/* The same figure beside the button that submits, because that is where it is being decided. A
   tracing that arrived on a pasted link never passed the pad, so it cannot be padVolume's job. */
function tracingVolShow(){
  const el = document.getElementById("tracingVolSay");
  if (!el) return null;
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings){ el.textContent = ""; return null; }
  /* ONE LINE EACH once there are several, exactly as padVolume does it: a single figure over a cell
     and its nucleus is the volume of no object at all — it is the sum of two, which is a number
     nobody asked for and which looks exactly like the answer somebody did ask for. */
  const insts = tracingEachInsts().filter(function(i){
    return rings.some(function(r){ return (r.inst || 0) === i; });
  });
  if (insts.length > 1){
    el.innerHTML = insts.map(function(i){
      const v = tracingVolumeOf(rings.filter(function(r){ return (r.inst || 0) === i; }));
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;'
        + 'margin-right:4px;background:' + escHtml(padInstColour(i)) + '"></span>'
        + '<b>' + (i + 1) + '</b> \u2014 ' + escHtml(v ? tracingVolumeSay(v) : "nothing yet");
    }).join("<br>");
    return null;
  }
  const v = tracingVolumeOf(rings);
  el.textContent = v ? tracingVolumeSay(v) : "";
  return v;
}

/* ── A DRAFT, SO A TRACING CAN BE PUT DOWN AND PICKED UP ────────────────────────  2026-09-17
   Søren: *"you should be able to save a draft of your progress and continue editing it later
   before submitting."*

   Tracing a cell over forty sections is not one sitting, and until now the only two states were
   "in the page" and "in the dataset": a reload lost everything, and the way to keep work was to
   add a half-finished tracing to the shared record, which is the wrong thing to do with a half-
   finished tracing.

   IT SAVES ITSELF. Every closed contour, every deleted one, every step to another section and every
   field below writes the draft, coalesced to a second or so. A button is kept as well, because
   "did that save?" deserves an answer, but nobody should have to remember it.

   WHAT A DRAFT IS: the contours, the half-drawn one, the section, where the view sits, the zoom and
   the step, everything filled in below, and -- the part that matters when somebody else's tracing
   is being extended -- WHICH TRACING IT IS. Resuming a draft of an edit still adds a version to
   that tracing rather than a new one beside it.

   IT LIVES IN THIS BROWSER, in localStorage, and the bar says so. Nothing is sent: a draft is
   explicitly the state before anything is shared, and putting unfinished geometry in the dataset to
   keep it safe is exactly what this exists to avoid.

   ONE DRAFT, NOT A PILE. Starting a fresh pad while one is kept says so rather than overwriting it
   quietly, and the draft survives until it is resumed, discarded, or replaced by drawing something
   new. A tracing that has been ADDED clears its draft: it is in the dataset, which is a better
   place to continue from -- open it from the list below and it comes back in full. */
/* ── A DRAFT IS ONE OF SEVERAL ─────────────────────────────────────────────────  2026-09-19
   Søren: *"Perhaps we could also keep saved segmentation drafts here somewhere, so they can be
   easily found and continued."*

   There was exactly one. `ujump_tracing_draft_v1` is a single key, so "save a draft" has always
   meant "replace the draft": start on a second organelle and the first was gone, with nothing on
   screen ever having said there was only room for one.

   EVERYTHING GOES THROUGH draftStore. Asked where drafts should live, he chose the dataset --
   following the account between machines -- and that is the next half of this: one Drive file and
   one index row each, mirrored from here. Keeping the reads and writes behind one object is what
   makes that an addition rather than a rewrite, and is why the list is built this way now.

   THE OLD KEY IS READ AND NEVER WRITTEN. A draft saved before today is adopted on first read and
   left exactly where it is -- belt and braces, on the day a tracing was destroyed by a save that
   thought it knew better. */
const TRACING_DRAFTS_KEY = tracingCfg().draftsKey || "ujump_tracing_drafts_v2";
const TRACING_DRAFT_KEY = tracingCfg().draftKey || "ujump_tracing_draft_v1";  // old single slot: read, never written
/* The pen tick's own preference. It was three copies of one literal in the wiring below, which is
   three places to forget when a second tool loads this file. */
const TRACING_PEN_KEY = tracingCfg().penKey || "ujump_tracing_pen_v1";
const TRACING_DRAFTS_MAX = 50;
var TRACING_DRAFT_SOON = null, TRACING_DRAFT_ID = "";

var draftStore = (function(){
  function readAll(){
    var out = [];
    try {
      var raw = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFTS_KEY)) || "null");
      if (raw && Array.isArray(raw.drafts)) out = raw.drafts.filter(function(d){
        return d && Array.isArray(d.rings);
      });
    } catch (_e){ out = []; }
    if (!out.length){
      /* MIGRATION, ONE WAY. The single-slot draft becomes the first entry in the list; the old key
         keeps its copy, because nothing good has ever come of a migration that also deletes. */
      try {
        var one = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFT_KEY)) || "null");
        if (one && Array.isArray(one.rings) && one.rings.length){
          if (!one.id) one.id = "migrated";
          if (!one.title) one.title = "Unfinished tracing";
          out = [one];
        }
      } catch (_e2){}
    }
    out.sort(function(a, b){ return String(b.at || "").localeCompare(String(a.at || "")); });
    return out;
  }
  function writeAll(list){
    try { tracingStore().setItem(tracingScopedKey(TRACING_DRAFTS_KEY), JSON.stringify({ v: 2, drafts: list })); return true; }
    catch (_e){
      padSay("This browser refused to keep the draft \u2014 it is out of storage. Your contours "
        + "are still on the pad.", true);
      return false;
    }
  }
  return {
    list: readAll,
    get: function(id){
      var m = readAll().filter(function(d){ return d.id === id; });
      return m.length ? m[0] : null;
    },
    put: function(d){
      var list = readAll(), at = -1, i;
      for (i = 0; i < list.length; i++) if (list[i].id === d.id){ at = i; break; }
      /* NOTHING IS DROPPED TO MAKE ROOM. One tracing was lost today to a silent overwrite; the
         answer to a full list is not another one. A NEW draft is refused and said so; the ones
         already in the list go on saving. */
      if (at < 0 && list.length >= TRACING_DRAFTS_MAX){
        padSay("There are already " + TRACING_DRAFTS_MAX + " unfinished tracings kept here, so this "
          + "one was not added. Add or discard one below and it will keep itself from then on.",
          true);
        return false;
      }
      if (at >= 0) list.splice(at, 1, d); else list.unshift(d);
      var wrote = writeAll(list);
      /* The browser first, always: it is the copy that cannot fail and the one the pad reads back.
         The server is a mirror of it, throttled, and its failure costs nothing here. */
      if (wrote) draftPush(d, false);
      return wrote;
    },
    drop: function(id){
      var list = readAll().filter(function(d){ return d.id !== id; });
      draftPushDelete(id);
      return writeAll(list);
    },
    /* EVERY DRAFT THIS ACCOUNT HAS, from both copies. One kept in both is shown once, preferring
       whichever was updated later — so a draft carried on from the laptop resumes the laptop's
       version rather than a stale copy of it sitting in this browser. */
    all: function(){
      var here = readAll(), seen = {}, out = [];
      here.forEach(function(d){ seen[d.id] = 1; out.push(d); });
      DRAFT_SERVER.forEach(function(s){
        var mine = null, i;
        for (i = 0; i < out.length; i++) if (out[i].id === s.draftId){ mine = out[i]; break; }
        if (!mine){
          out.push({ id: s.draftId, title: s.title, at: s.updated, remote: true,
                     rings: new Array(Math.max(0, s.contours | 0)), pending: [],
                     sections: s.sections, editId: s.editId });
          return;
        }
        mine.alsoRemote = true;
        if (String(s.updated || "") > String(mine.at || "")) mine.staler = s;
      });
      out.sort(function(a, b){ return String(b.at || "").localeCompare(String(a.at || "")); });
      return out;
    }
  };
})();

/* ── THE SERVER COPY ───────────────────────────────────────────────────────────  2026-09-19
   Søren chose drafts kept in the dataset, so they follow the account between machines.

   NOT postReport: that fires Google One Tap and shows an alert when signed out, which is right for
   submitting a report and wrong for an autosave. Signed out this does nothing at all, and that is
   the intended behaviour rather than a degraded one — the card already promises a tracing is kept
   whether or not anybody has signed in.

   THROTTLED, and the number is not arbitrary: the pad autosaves about every 1.2 s while somebody
   draws, and a Drive write per second per tracer is a quota mail. Two minutes, plus every explicit
   save. The backend generator says the same thing at its end, because a throttle enforced in one
   place and assumed in the other is a thing that gets changed in ignorance. */
/* ── WHICH DATASET'S SHEET ───────────────────────────────────────────────────────  2026-09-21
   The backend reads µJump's spreadsheet for any request that does not name a dataset. δJump and
   πJump wrap window.fetch to add one; λJump, βJump and ηJump add it in their own call sites — so a
   read made from THIS file carried none there, and their tracing lists, numbering and account
   drafts were µJump's. Built exactly as core/panel.js's panelDsQS builds it. */
function tracingDsQS(){
  try { if (UJ && UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds)
          return "&ds=" + encodeURIComponent(UJ.cfg.backend.ds); } catch (_e){}
  return "";
}
/* The page's postAndRead where it has one; otherwise the same POST, with the dataset in the body,
   answering {ok, error} the way postAndRead does. λJump, βJump and ηJump have no postAndRead, so
   the account-draft save and delete below did nothing there at all. */
function tracingPost(payload){
  if (typeof postAndRead === "function") return postAndRead(payload);
  var p = {};
  for (var k in payload) p[k] = payload[k];
  try { if (!p.ds && UJ.cfg.backend.ds) p.ds = UJ.cfg.backend.ds; } catch (_e){}
  return fetch(REPORT_ENDPOINT, { method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) })
    .then(function(r){ return r.text(); })
    .then(function(t){
      var d = null; try { d = JSON.parse(t); } catch (_pe){}
      return (d && (d.ok === true || d.status === "ok")) ? { ok: true }
           : { ok: false, error: (d && d.error) || String(t || "").slice(0, 200) };
    }, function(e){ return { ok: false, offline: true, error: String(e && e.message || e) }; });
}
var DRAFT_PUSH_AT = 0, DRAFT_PUSH_EVERY = 120000, DRAFT_SERVER = [], DRAFT_SERVER_AT = 0;
function draftSignedIn(){
  return !!(typeof GOOGLE_VERIFIED !== "undefined" && GOOGLE_VERIFIED
            && typeof GOOGLE_CREDENTIAL !== "undefined" && GOOGLE_CREDENTIAL && REPORT_ENDPOINT);
}
function draftPush(d, force){
  if (!draftSignedIn() || !d || !d.id) return false;
  if (!force && Date.now() - DRAFT_PUSH_AT < DRAFT_PUSH_EVERY) return false;
  DRAFT_PUSH_AT = Date.now();
  const zs = {}, insts = {};
  (d.rings || []).forEach(function(r){ zs[r.z] = 1; insts[r.inst || 0] = 1; });
  try {
    tracingPost({ type: "tracing_draft", action: "save", credential: GOOGLE_CREDENTIAL,
      draftId: d.id, title: d.title || "", updated: d.at || new Date().toISOString(),
      contours: (d.rings || []).length, sections: Object.keys(zs).length,
      structures: Object.keys(insts).length,
      x: (d.centre && d.centre[0]) || 0, y: (d.centre && d.centre[1]) || 0, z: d.z || 0,
      nucleusId: tracingScoped(d.nucId || ""), rootId: d.rootId || "", editId: d.editId || "",
      draft: JSON.stringify(d) }).then(function(){ draftServerSoon(true); }, function(){});
  } catch (_e){ return false; }
  return true;
}
function draftPushDelete(id){
  if (!draftSignedIn() || !id) return;
  try {
    tracingPost({ type: "tracing_draft", action: "delete",
                  credential: GOOGLE_CREDENTIAL, draftId: id }).then(function(){
      DRAFT_SERVER = DRAFT_SERVER.filter(function(x){ return x.draftId !== id; });
      draftRender();
    }, function(){});
  } catch (_e){}
}
/* The index, which opens no Drive file at the other end. Cheap enough to ask for on sign-in and
   after a push, and not cheap enough to ask for on every render. */
function draftServerSoon(force){
  if (!draftSignedIn()) return;
  if (!force && Date.now() - DRAFT_SERVER_AT < 30000) return;
  DRAFT_SERVER_AT = Date.now();
  fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL) + tracingDsQS())
    .then(function(r){ return r.json(); })
    .then(function(j){
      if (j && j.ok && j.drafts){ DRAFT_SERVER = tracingInScope(j.drafts); draftRender(); }
    })
    .catch(function(){});
}

/* Which draft the pad is writing to. One per drafting session: a fresh pad starts a new one, and
   resuming adopts the id of the one resumed, so saving updates it rather than growing a second
   copy of the same work every time the autosave fires. */
function draftCurrentId(){
  if (!TRACING_DRAFT_ID)
    TRACING_DRAFT_ID = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return TRACING_DRAFT_ID;
}
/* What the list calls it, from the boxes already filled in. Asked-for names would be a field
   between somebody and their work, and a list of "Untitled" is a list you still have to open one
   by one -- which is the thing this is for. */
function draftTitleNow(){
  const val = function(id){ const e = document.getElementById(id); return e ? String(e.value || "") : ""; };
  let what = "";
  try {
    const sel = document.getElementById("tracingWhat");
    if (sel && sel.selectedIndex >= 0) what = sel.options[sel.selectedIndex].textContent || "";
  } catch (_e){}
  if (val("tracingWhat") === "__other" && val("tracingName")) what = val("tracingName");
  let n = 0;
  try { n = UJ.tracepad.instances(PAD).filter(function(i){ return i.contours; }).length; } catch (_e2){}
  const bits = [];
  if (n > 1) bits.push(n + " \u00d7 " + (what || "structure"));
  else if (what) bits.push(what);
  const cell = [val("tracingType"), val("tracingNucId")].filter(function(s){ return s; }).join(" ");
  if (cell) bits.push(cell);
  return bits.join(" \u00b7 ") || "Unfinished tracing";
}

/* The one the pad is on, which is what every guard in draftSave is about. */
function draftRead(){ return draftStore.get(draftCurrentId()); }
function draftWrite(d){ draftStore.put(d); }
function draftClear(id){
  draftStore.drop(id || draftCurrentId());
  if (!id || id === TRACING_DRAFT_ID) TRACING_DRAFT_ID = "";
  draftRender();
}

function draftNow(){
  if (!PAD) return null;
  const val = function(id){ const e = document.getElementById(id); return e ? e.value : ""; };
  const found = document.getElementById("tracingFound");
  return { v: 2, id: draftCurrentId(), title: draftTitleNow(), at: new Date().toISOString(),
           /* ── A CONTOUR REMEMBERS WHICH STRUCTURE IT IS ────────────────────  2026-09-17
              Søren: *"When I resumed this segmentation, the second segmentation had the color of
              the first on and said it was empty."* Exactly that: this map wrote {z, points} and
              dropped `inst`, so every contour came back as `r.inst || 0` -- structure one's --
              and structure two, whose contours had just been handed to structure one, was empty.
              The colours and types below were already carried; the one field that says WHICH
              structure a contour belongs to was not. */
           rings: PAD.rings.map(function(r){ return { z: r.z, points: r.points, inst: r.inst || 0 }; }),
           pending: PAD.pending.slice(),
           z: PAD.z, centre: PAD_CENTRE ? PAD_CENTRE.slice() : null,
           mip: val("tracePadMip"), step: val("tracePadStep"),
           editId: PAD_EDIT_ID || "",
           /* Which shared tracing each number is a version of (2026-09-21), or a resumed draft of a
              whole cell would file all but the first as new tracings. */
           editIds: (typeof PAD_EDIT_IDS !== "undefined") ? PAD_EDIT_IDS : {},
           structureId: (TRACING_PENDING && TRACING_PENDING.id) || "",
           /* THE BASE GOES IN THE DRAFT, 2026-09-19. Without it, resuming tomorrow mints a new one
              and every structure after the first is filed as a NEW tracing rather than a version of
              the one it already is -- the same class of fault as the compound ids this fixes. */
           baseId: TRACING_BASE_ID || "",
           used: !!(found && found.style.display !== "none"),
           what: val("tracingWhat"), name: val("tracingName"), type: val("tracingType"),
           color: val("tracingColor"), nucId: val("tracingNucId"), rootId: val("tracingRootId"),
           cellAt: val("tracingCellAt"),
           typeTouched: !!TRACING_TYPE_TOUCHED,
           /* SEVERAL STRUCTURES ARE PART OF THE DRAFT TOO. Resuming with the contours back but the
              colours re-dealt and the types forgotten would be a worse draft than none: the work
              would look restored and quietly be wrong about what each thing is. */
           inst: PAD.inst || 0,
           instColour: PAD_INST_COLOUR, instKind: PAD_INST_KIND,
           eachOwn: tracingEachOwn() };
}
function draftSave(explicit){
  const d = draftNow();
  if (!d) return null;
  if (!d.rings.length && !d.pending.length){
    /* ── A SAVE MAY NEVER REDUCE KEPT WORK TO NOTHING ──────────────────────────  2026-09-19
       Søren: *"I saved a draft of 3 lysosomes... but then the drawing number started over."*
       He lost all three here. The intent was already right -- "saving it would quietly destroy the
       one already kept" is what the old comment said -- but the guard was `&& !d.used`, and `used`
       only means "the naming block is showing", which padOpen leaves showing. So an empty pad,
       opened at another coordinate, wrote itself over forty-eight contours.

       The guard was about the pad; it should have been about THE DRAFT. An empty pad never
       replaces a draft that has contours in it, whatever else is on screen and whether the save
       was asked for or automatic. `used` keeps its old job underneath, where there is nothing to
       destroy: it is what lets the fields be kept before the first contour is closed. */
    const kept = draftRead();
    if (kept && kept.rings.length){
      if (explicit)
        padSay("Nothing on the pad to save \u2014 so the " + kept.rings.length + " contour"
          + (kept.rings.length === 1 ? "" : "s") + " already kept " + (kept.rings.length === 1
          ? "is" : "are") + " left alone. Resume them from the bar above.", true);
      return null;
    }
    if (!d.used){
      if (explicit) padSay("Nothing to save yet \u2014 close a contour first.", true);
      return null;
    }
  }
  draftWrite(d);
  /* AN EXPLICIT PRESS BEATS THE THROTTLE. Somebody pressing Save draft is saying "make sure", and
     making sure is precisely what the two-minute timer does not do. */
  if (explicit) draftPush(d, true);
  draftRender();
  if (explicit) padSay(!tracingKeepsLocal()
    ? (draftSignedIn()
       ? "Draft saved on your account, so you can carry on later or from another machine. This "
         + "tool keeps no work in the browser itself."
       : "Draft kept on this page only \u2014 this tool keeps no work in the browser. Sign in and "
         + "it is saved to your account; close the page without signing in and it is gone.")
    : draftSignedIn()
    ? "Draft saved \u2014 in this browser and on your account, so you can carry on from another "
      + "machine. The pad reopens where you left it, on the same section."
    : "Draft saved in this browser. Close the page if you like \u2014 the pad reopens where you "
      + "left it, on the same section. Sign in and it is kept on your account too.");
  return d;
}
function draftSoon(){
  if (TRACING_DRAFT_SOON) return;
  TRACING_DRAFT_SOON = setTimeout(function(){
    TRACING_DRAFT_SOON = null;
    try { draftSave(false); } catch (e){}
  }, 1200);
}

function draftWhen(iso){
  try {
    const d = new Date(iso), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? "today at " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                   : d.toLocaleString();
  } catch (e){ return "earlier"; }
}
/* ── THE LIST, WHICH IS THE POINT OF THE WHOLE CHANGE ──────────────────────────  2026-09-19
   Søren: *"so they can be easily found and continued."* Found means seeing all of them with enough
   on each row to tell them apart -- what it is, how much of it there is, and when it was left --
   and continued means a Resume on every one rather than only on the last.

   The row for the draft the pad is CURRENTLY writing to says so instead of offering to resume
   itself, which would be a button that appears to do something and does nothing. */
function draftRender(){
  const bar = document.getElementById("tracingDraftBar");
  if (!bar) return;
  const list = draftStore.all();
  if (!list.length){ bar.style.display = "none"; bar.innerHTML = ""; return; }
  const wrap = document.getElementById("tracePadWrap");
  const open = wrap && wrap.style.display !== "none";
  const here = TRACING_DRAFT_ID;
  bar.style.display = "";
  bar.innerHTML = '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;'
      + 'color:var(--mut);margin-bottom:6px">Unfinished tracings'
      + (list.length > 1 ? " (" + list.length + ")" : "") + '</div>'
    + list.map(function(d){
        const zs = {};
        (d.rings || []).forEach(function(r){ zs[r.z] = 1; });
        const nz = Object.keys(zs).length;
        const mine = d.id === here && open;
        return '<div class="row" style="gap:8px;align-items:baseline;flex-wrap:wrap;'
            + 'margin-bottom:4px">'
          + '<span style="flex:1 1 200px;min-width:0;font-size:13px'
            + (mine ? ';color:var(--accent)' : '') + '">' + escHtml(d.title || "Unfinished tracing")
            + (d.editId ? ' <span class="hint">(a version of one already in the dataset)</span>' : '')
            + '</span>'
          + '<span class="hint" style="flex:0 0 auto">' + (d.rings || []).length + ' contour'
            + ((d.rings || []).length === 1 ? '' : 's')
            + (d.remote ? ' on ' + (d.sections || 0) + ' section' + ((d.sections || 0) === 1 ? '' : 's')
                        : ' on ' + nz + ' section' + (nz === 1 ? '' : 's'))
            + ', ' + escHtml(draftWhen(d.at))
            /* SAID, NOT ASSUMED: a draft that is only on the account has to be fetched before it
               can be drawn, and one that is newer there than here would otherwise resume as a
               stale copy without a word. */
            + (d.remote ? ' \u00b7 on your account' : (d.staler ? ' \u00b7 a newer one is on your account'
                                                              : '')) + '</span>'
          + (mine
              ? '<span class="hint" style="flex:0 0 auto">on the pad now</span>'
              : '<button type="button" class="hist-chip draftres" data-id="' + escHtml(d.id) + '">'
                + 'Resume it</button>')
          + '<button type="button" class="hist-chip draftdrop" data-id="' + escHtml(d.id) + '">'
            + 'Discard</button>'
          + '</div>';
      }).join("");
  [].slice.call(bar.querySelectorAll(".draftres")).forEach(function(b){
    b.addEventListener("click", function(){ draftResume(b.dataset.id); });
  });
  [].slice.call(bar.querySelectorAll(".draftdrop")).forEach(function(b){
    b.addEventListener("click", function(){
      const d = draftStore.get(b.dataset.id);
      /* Asked, because this is the one button here that destroys work and there is no undo for it
         -- and it names the one being discarded, now that there is more than one to confuse. */
      if (window.confirm("Discard \u201c" + ((d && d.title) || "this unfinished tracing")
        + "\u201d? It has not been added to the dataset, and this cannot be undone."))
        draftClear(b.dataset.id);
    });
  });
}

function draftResume(id){
  /* THE ID IS ADOPTED, not replaced: saving from here on updates the draft that was resumed rather
     than growing a second copy of the same work on the next autosave. */
  const d = id ? draftStore.get(id) : draftRead();
  /* ── FETCHED FIRST, WHEN IT IS NOT IN THIS BROWSER ─────────────────────────────  2026-09-19
     The index carries the counts but not a single coordinate, which is what makes listing cheap;
     a draft started on another machine therefore has to be asked for before it can be drawn. The
     same route brings back a NEWER server copy of one that is also here, so carrying on from the
     laptop on the desktop resumes the laptop's version. */
  const stale = d && d.staler;
  if ((!d || d.remote || stale) && id && draftSignedIn()){
    padSay("Fetching that tracing from your account\u2026");
    fetch(REPORT_ENDPOINT + "?drafts=" + encodeURIComponent(GOOGLE_CREDENTIAL) + tracingDsQS()
          + "&draftId=" + encodeURIComponent(id))
      .then(function(r){ return r.json(); })
      .then(function(j){
        if (!j || !j.ok || !j.draft){
          padSay("That tracing could not be read from your account"
            + (j && j.error ? ": " + j.error : "") + ".", true);
          return;
        }
        var got = j.draft;
        got.id = id;
        /* Written to this browser as it arrives, so the pad is reading the same copy everything
           else does and a reload does not have to fetch it again. */
        draftStore.put(got);
        TRACING_DRAFT_ID = id;
        draftResumeFrom(got);
      })
      .catch(function(e){
        padSay("Could not reach your account to fetch that tracing: "
          + String(e && e.message || e), true);
      });
    return;
  }
  if (!d) return;
  draftResumeFrom(d);
}
/* The half that puts a draft on the pad, split out so it can be reached both by the local path
   above and by the one that had to fetch first. */
function draftResumeFrom(d){
  if (!d) return;
  /* Restored before anything else looks at it: a draft written before this existed has none, and
     "" means the next add mints one, which is what used to happen every time. */
  TRACING_BASE_ID = d.baseId || "";
  TRACING_DRAFT_ID = d.id || draftCurrentId();
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure(tracingSources());
  PAD = UJ.tracepad.create();
  /* inst: the other half of the fix in draftNow() above. A draft written before this existed has
     no inst on its contours, and `|| 0` puts all of them on structure one -- which is what it
     honestly knows, rather than guessing a split that was never written down. */
  PAD.rings = (d.rings || []).map(function(r){
    return { z: Math.round(r.z), inst: Math.max(0, Math.round(r.inst || 0)),
             points: (r.points || []).map(function(p){ return [Math.round(p[0]), Math.round(p[1])]; }) };
  });
  PAD.pending = (d.pending || []).map(function(p){ return [Math.round(p[0]), Math.round(p[1])]; });
  PAD.z = Math.round(d.z || (PAD.rings[0] && PAD.rings[0].z) || 0);
  PAD_CENTRE = (d.centre && d.centre.length === 3) ? d.centre.slice() : [0, 0, PAD.z];
  PAD_CENTRE[2] = PAD.z;
  PAD_VIEW = null; PAD_BASE_READY = false;
  PAD_EDIT_ID = d.editId || "";
  PAD_EDIT_IDS = (d.editIds && typeof d.editIds === "object") ? d.editIds : {};
  const set = function(id, v){ const e = document.getElementById(id); if (e && v) e.value = v; };
  set("tracePadMip", d.mip); set("tracePadStep", d.step);
  set("tracingWhat", d.what); set("tracingName", d.name); set("tracingType", d.type);
  set("tracingColor", d.color); set("tracingNucId", d.nucId); set("tracingRootId", d.rootId);
  set("tracingCellAt", d.cellAt);
  TRACING_TYPE_TOUCHED = !!d.typeTouched;
  PAD_INST_COLOUR = d.instColour || {};
  PAD_INST_KIND = d.instKind || {};
  const eachBox = document.getElementById("tracingEachOwn");
  if (eachBox) eachBox.checked = !!d.eachOwn;
  if (d.inst) UJ.tracepad.setInstance(PAD, d.inst);
  const nameRow = document.getElementById("tracingNameRow");
  if (nameRow) nameRow.style.display = (d.what === "__other") ? "" : "none";
  document.getElementById("tracePadWrap").style.display = "";
  padDraw();
  if (d.used && PAD.rings.length){
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: d.structureId || undefined };
    document.getElementById("tracingFound").style.display = "";
    tracingEachRender(true);
  }
  draftRender();
  tracingSay("Draft resumed \u2014 " + PAD.rings.length + " contour"
    + (PAD.rings.length === 1 ? "" : "s") + " back on the pad, on section " + PAD.z + ". "
    + (d.editId ? "It is a version of a tracing already in the dataset, and adding it stays that."
                : "Nothing has been shared yet; it goes into the dataset when you add it."));
}

/* ── THE DATASET'S TRACINGS, AND ADDING TO ONE ──────────────────────────────────  2026-09-17
   Søren: *"other people should be able to add to it or edit it."*

   The index is one sheet scan on the backend and opens no Drive files, so listing is cheap enough
   to do on a button press; only the tracing you choose to open is fetched. Opening one puts its
   contours in the pad as ordinary contours -- every one of them movable, deletable, extendable,
   because they are the same kind of thing the pad makes -- and keeps its structureId, so adding it
   again is the NEXT VERSION of that tracing rather than a rival to it. Nothing is overwritten: the
   older file and the older row both stay. */
var TRACING_SHARED = [], PAD_EDIT_ID = "", TRACING_INDEX_AT = 0;

/* THE INDEX, FETCHED QUIETLY, because the numbering needs it before he presses anything.
   ?tracings=1 is one sheet scan and opens no Drive files -- that is what the Drive split bought --
   so this is cheap enough to do when the pad opens, and a minute's cache keeps it to one request
   per session of work. It fails silently: with no index, tracingNextIndex() starts at 1 and says
   so, which is a label to fix rather than work lost. */
function tracingIndexSoon(){
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return;
  if (Date.now() - TRACING_INDEX_AT < 60000) return;
  TRACING_INDEX_AT = Date.now();
  try {
    fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS())
      .then(function(r){ return r.json(); })
      .then(function(d){ if (d && d.tracings){ TRACING_SHARED = tracingInScope(d.tracings);
                                               tracingReconcileKept(); } })
      .catch(function(){});
  } catch (e){}
}

/* ── "IN THE DATASET" IS CHECKED AGAINST THE DATASET ───────────────────────  2026-09-21
   Søren's three lysosomes on πJump all said "in the dataset"; the dataset had one (the backend lost
   two rows to a race on a new tab -- backend/src_a_new_tab_is_made_once.py). Whenever the dataset's
   list is read, a kept tracing marked as in it that the list does not have goes back on the queue
   and is sent again. One sent in the last minute is left alone: its row may not be readable yet. */
function tracingReconcileKept(){
  var have = {};
  (TRACING_SHARED || []).forEach(function(t){ if (t && t.structureId) have[String(t.structureId)] = 1; });
  var now = Date.now(), back = [];
  (TRACINGS_KEPT || []).forEach(function(t){
    if (!t || !t.id || t.pending_share || have[String(t.id)]) return;
    var at = Date.parse(t.shared_at || "");
    if (isFinite(at) && now - at < 60000) return;
    t.pending_share = true; t.shared_at = ""; back.push(t);
  });
  if (!back.length) return 0;
  tracingWrite(TRACINGS_KEPT); tracingRenderList();
  tracingSay(back.map(function(t){ return "\u201c" + (t.name || "a tracing") + "\u201d"; }).join(", ")
    + (back.length === 1 ? " was" : " were") + " marked as in the dataset, and the dataset does not have "
    + (back.length === 1 ? "it" : "them") + ". Sending " + (back.length === 1 ? "it" : "them")
    + " again \u2014 signed in, that happens now.", true);
  tracingFlushSoon();
  return back.length;
}

async function tracingBrowse(){
  const host = document.getElementById("tracingShared");
  if (!host) return;
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT){
    host.innerHTML = '<p class="hint">This page has no backend configured, so there is nothing to '
      + "read yet.</p>";
    return;
  }
  host.innerHTML = '<p class="hint">Reading the dataset’s tracings…</p>';
  try {
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS());
    const d = await r.json();
    TRACING_SHARED = tracingInScope((d && d.tracings) || []);
    tracingRenderShared();
    if (d && Array.isArray(d.tracings)) tracingReconcileKept();
  } catch (e){
    host.innerHTML = '<p class="hint" style="color:var(--bad)">Could not read them: '
      + escHtml(String(e && e.message || e)) + ". If the backend has not been redeployed since "
      + "2026-09-17 it does not answer this question yet.</p>";
  }
}

/* ── THE DATASET'S TRACINGS, BY CELL ─────────────────────────────────────────  2026-09-21
   The same grouping as the kept list, with three things for the whole cell: open all of it in the
   pad, in Neuroglancer, or as a zip. Groups newest first -- the cell somebody is working on now is
   the one most likely to be wanted -- and inside a cell by kind and number, so Lysosome 1, 2, 3
   read in order. See src/the_tracings_group_by_cell.py. */
function tracingRenderShared(){
  const host = document.getElementById("tracingShared");
  if (!host) return;
  if (!TRACING_SHARED.length){
    host.innerHTML = '<p class="hint">Nothing has been traced into the dataset yet. Yours would be '
      + "the first.</p>";
    return;
  }
  const groups = tracingGroupByCell(TRACING_SHARED, function(t){ return t.nucleusId; },
                                    function(t){ return t.rootId; }, function(t){ return t.cellCoord; });
  const newest = function(g){ return g.items.reduce(function(m, x){
    const s = String(x.t.timestamp || ""); return s > m ? s : m; }, ""); };
  groups.sort(function(a, b){
    if ((a.key === "") !== (b.key === "")) return a.key === "" ? 1 : -1;
    return newest(b).localeCompare(newest(a));
  });
  groups.forEach(function(g){
    g.items.sort(function(a, b){
      const ka = String(a.t.instanceOf || a.t.kind || ""), kb = String(b.t.instanceOf || b.t.kind || "");
      if (ka !== kb) return ka.localeCompare(kb);
      const na = Number(a.t.instanceIndex) || 0, nb = Number(b.t.instanceIndex) || 0;
      if (na !== nb) return na - nb;
      return String(a.t.name || "").localeCompare(String(b.t.name || ""), undefined, { numeric: true });
    });
  });
  TRACING_SHARED_GROUPS = groups;
  host.innerHTML = '<label>In the dataset, by cell — open one to add to it or correct it</label>'
    + groups.map(function(g, gi){
        const type = (g.items.filter(function(x){ return x.t.cellType; })[0] || { t: {} }).t.cellType || "";
        return '<div ' + TRACING_CELL_BOX + ' data-g="' + gi + '">'
          + '<div ' + TRACING_CELL_ROW + '>' + tracingCellHead(g.nuc, g.root, type, g.items.length, g.coord)
          + '<button class="idbtn tracingcellpad" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell onto the pad, each as its own numbered structure. Adding them back '
            + 'is the next version of each.">Open all in the pad</button>'
          + '<button class="idbtn tracingcellngl" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell in the viewer, each in its own colour, with the cell.">Neuroglancer</button>'
          + '<button class="idbtn tracingcellzip" data-g="' + gi + '" ' + TRACING_BTN + ' title="A zip '
            + 'of this cell: each tracing&rsquo;s contours (JSON), a mesh of each (OBJ, nm), and an '
            + 'index.">Download zip</button></div>'
          + g.items.map(function(x){
              const t = x.t;
              const who = (t.contributors && t.contributors.length) ? t.contributors.join(", ")
                                                                    : (t.tracedBy || "");
              return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0 4px 18px;'
                + 'font-size:12px;flex-wrap:wrap;border-left:2px solid var(--line);margin-left:5px">'
                + '<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
                  + escHtml(t.color || "#3a6b5a") + '"></span>'
                + '<span style="flex:1 1 140px;min-width:0">' + escHtml(t.name || t.structureId) + '</span>'
                + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"
                  + ((t.contours === 1) ? "" : "s") + " on " + (t.sections || 0) + " section"
                  + ((t.sections === 1) ? "" : "s") + '</span>'
                + '<span style="opacity:.7;flex:1 1 120px;min-width:0" title="Everyone who has added a '
                  + 'version of this tracing, in the order they first did.">' + escHtml(who)
                  + ((t.versions > 1) ? " &middot; v" + t.versions : "") + '</span>'
                + '<button class="idbtn tracingopen" data-sid="' + escHtml(t.structureId) + '" '
                  + TRACING_BTN + '>Open it in the pad</button>'
                /* Looking is not editing: see tracingSharedInViewer. */
                + '<button class="idbtn tracingngl" data-sid="' + escHtml(t.structureId) + '" '
                  + TRACING_BTN + ' title="Open this tracing in the viewer, as an annotation layer in '
                  + 'its own colour — without taking it onto your pad.">Neuroglancer</button>'
                + (t.fileUrl ? ' <a href="' + escHtml(t.fileUrl) + '" target="_blank" rel="noopener" '
                    + 'style="font-size:12px;opacity:.7" title="The tracing’s own file in Drive">file</a>' : "")
                + '</div>';
            }).join("")
          + '</div>';
      }).join("");
  [].slice.call(host.querySelectorAll(".tracingopen")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenShared(b.dataset.sid, b); });
  });
  [].slice.call(host.querySelectorAll(".tracingngl")).forEach(function(b){
    b.addEventListener("click", function(){ tracingSharedInViewer(b.dataset.sid, b); });
  });
  const sidsOf = function(b){ const g = groups[Number(b.dataset.g)];
    return g ? g.items.map(function(x){ return x.t.structureId; }) : []; };
  [].slice.call(host.querySelectorAll(".tracingcellpad")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenCellShared(sidsOf(b), b); });
  });
  [].slice.call(host.querySelectorAll(".tracingcellngl")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellSharedInViewer(sidsOf(b), b); });
  });
  [].slice.call(host.querySelectorAll(".tracingcellzip")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellZip(groups[Number(b.dataset.g)], b); });
  });
}
var TRACING_SHARED_GROUPS = [];

/* One tracing's geometry, as tracingOpenShared reads it. */
async function tracingFetchShared(sid){
  const r = await fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(sid)
                        + tracingDsQS());
  const d = await r.json();
  const t = ((d && d.tracings) || [])[0];
  if (!t) throw new Error("the dataset has no tracing with that id any more");
  if (t.error) throw new Error(t.error);
  const st = UJ.tracing.rowsToStructures(t.rows || [])[0];
  if (!st || !st.rings.length) throw new Error("that tracing came back with no contours on it");
  return { t: t, st: st };
}
/* A whole cell's, four at a time -- each is a Drive read on the backend. One that fails is
   reported, not fatal: the others are still the cell. */
async function tracingFetchCell(sids, btn){
  const out = new Array(sids.length);
  let next = 0, done = 0;
  const label = btn ? btn.textContent : "";
  const one = async function(){
    while (next < sids.length){
      const k = next++;
      try { out[k] = Object.assign({ sid: sids[k] }, await tracingFetchShared(sids[k])); }
      catch (e){ out[k] = { sid: sids[k], error: String(e && e.message || e) }; }
      done++;
      if (btn) btn.textContent = "reading " + done + " of " + sids.length + "…";
    }
  };
  if (btn){ btn.disabled = true; btn.dataset.label = label; }
  try { await Promise.all([one(), one(), one(), one()]); }
  finally { if (btn){ btn.disabled = false; btn.textContent = label; } }
  return out;
}
function tracingFailedSay(got){
  const bad = got.filter(function(x){ return x.error; });
  return bad.length ? " " + bad.length + " could not be read (" + bad.map(function(x){
    return x.sid + ": " + x.error; }).join("; ") + ")." : "";
}

async function tracingCellSharedInViewer(sids, btn){
  if (!sids.length) return;
  const got = await tracingFetchCell(sids, btn);
  const good = got.filter(function(x){ return !x.error; });
  if (!good.length){ tracingSay("Could not open that cell's tracings." + tracingFailedSay(got), true); return; }
  const ids = { nuc: "", root: "" };
  let coord = "";
  good.forEach(function(x){
    ids.nuc = ids.nuc || x.t.nucleusId || x.st.nucleusId || "";
    ids.root = ids.root || x.t.rootId || x.st.rootId || "";
    coord = coord || x.t.cellCoord || x.st.cellCoord || "";
  });
  ids.centre = tracingCellCentre(coord, ids.nuc);
  tracingViewerOpen(good.map(function(x){
      return { name: x.st.name || x.t.name || x.sid, color: x.t.color || x.st.color || "#40e28c", rings: x.st.rings }; }),
    "Opened all " + good.length + " of this cell’s tracings in the viewer, each in its own colour. "
    + "Nothing has been taken onto your pad." + tracingFailedSay(got), ids);
}

/* ── A WHOLE CELL ON THE PAD ─────────────────────────────────────────────────  2026-09-21
   Each tracing becomes its own numbered structure, and PAD_EDIT_IDS remembers which shared tracing
   each number was opened from -- idOf() in tracingCurrentAll() asks it first. Its type, colour
   and published number come with it, so adding them back is the next version of each. */
var PAD_EDIT_IDS = {};
function tracingKindValue(kind, name){
  const what = document.getElementById("tracingWhat");
  if (kind === "cell") return "__cell";
  if (kind === "nucleus") return "__nucleus";
  const has = what && [].slice.call(what.options).some(function(o){ return o.value === kind; });
  return (kind && kind !== "other" && has) ? kind : "__other";
}
async function tracingOpenCellShared(sids, btn){
  if (!sids.length) return;
  if (sids.length === 1) return tracingOpenShared(sids[0], btn);
  const got = await tracingFetchCell(sids, btn);
  const good = got.filter(function(x){ return !x.error; });
  if (!good.length){ tracingSay("Could not open that cell's tracings." + tracingFailedSay(got), true); return; }
  try {
    if (!UJ.emtiles.configured()) UJ.emtiles.configure(tracingSources());
    PAD = UJ.tracepad.create();
    PAD.rings = [];
    PAD_INST_KIND = {}; PAD_INST_COLOUR = {}; PAD_EDIT_IDS = {};
    TRACING_BASE_ID = ""; TRACING_DRAFT_ID = "";
    good.forEach(function(x, k){
      x.st.rings.forEach(function(r){
        PAD.rings.push({ z: Math.round(r.z), inst: k,
          points: r.points.map(function(p){ return [Math.round(p[0]), Math.round(p[1])]; }) });
      });
      PAD_EDIT_IDS[String(k)] = String(x.st.structureId || x.sid);
      TRACING_EDIT_INDEX[String(x.st.structureId || x.sid)] = Math.round(Number(x.st.instanceIndex || x.t.instanceIndex) || 0);
      if (x.t.color || x.st.color) PAD_INST_COLOUR[String(k)] = x.t.color || x.st.color;
      const kind = String(x.st.kind || x.t.kind || "");
      const v = tracingKindValue(kind, x.st.name);
      PAD_INST_KIND[String(k)] = Object.assign({ value: v },
        tracingWhatOf(v, v === "__other" ? String(x.st.name || x.t.name || "").replace(/\s+\d+$/, "") : ""));
    });
    PAD.inst = 0;
    PAD.z = PAD.rings[0].z;
    const p0 = PAD.rings[0].points;
    let cx = 0, cy = 0;
    p0.forEach(function(p){ cx += p[0]; cy += p[1]; });
    PAD_CENTRE = [Math.round(cx / p0.length), Math.round(cy / p0.length), PAD.z];
    PAD_VIEW = null; PAD_BASE_READY = false;
    document.getElementById("tracePadWrap").style.display = "";
    PAD_EDIT_ID = PAD_EDIT_IDS["0"];
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: PAD_EDIT_ID };
    /* Each its own type: they are a lysosome AND a mitochondrion, not three of one thing. */
    const each = document.getElementById("tracingEachOwn");
    if (each) each.checked = true;
    const first = good[0], set = function(id, v){ const e = document.getElementById(id); if (e && v) e.value = v; };
    const what = document.getElementById("tracingWhat");
    if (what) what.value = PAD_INST_KIND["0"].value;
    set("tracingNucId", first.st.nucleusId || first.t.nucleusId);
    set("tracingRootId", first.st.rootId || first.t.rootId);
    set("tracingCellAt", tracingCoordShow(first.st.cellCoord || first.t.cellCoord || ""));
    const typeSel = document.getElementById("tracingType");
    const ct = first.st.cellType || first.t.cellType;
    if (typeSel && ct && [].slice.call(typeSel.options).some(function(o){ return o.value === ct; })){
      typeSel.value = ct; TRACING_TYPE_TOUCHED = true;
    }
    document.getElementById("tracingFound").style.display = "";
    tracingEachRender(true);
    try { padDraw(); } catch (_e){}
    try { padRings(); } catch (_e){}
    draftSoon();
    tracingSay("All " + good.length + " of this cell’s tracings are on the pad, numbered 1 to " + good.length
      + " in the Drawing strip, each in its own colour and with its own type. Correct any of them, "
      + "press “Use these contours” and add them again: each becomes the next version of itself, and "
      + "nothing of the old ones is deleted." + tracingFailedSay(got));
    if (PAD3D_ON){ PAD3D_MESHES = null; pad3DSoon(); }
  } catch (e){
    tracingSay("Could not open that cell's tracings: " + String(e && e.message || e), true);
  }
}

/* ── A WHOLE CELL AS A ZIP ───────────────────────────────────────────────────  2026-09-21 */
var TRACING_JSZIP = null;
function tracingJSZip(){
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!TRACING_JSZIP) TRACING_JSZIP = new Promise(function(res, rej){
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = function(){ window.JSZip ? res(window.JSZip) : rej(new Error("JSZip did not load")); };
    s.onerror = function(){ TRACING_JSZIP = null; rej(new Error("could not load JSZip from cdnjs")); };
    document.head.appendChild(s);
  });
  return TRACING_JSZIP;
}
function tracingSaveBlob(blob, name){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function tracingSafeName(s){
  return String(s || "tracing").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "tracing";
}
/* The pad's own loft, in nanometres, as OBJ. */
function tracingObjOf(name, rings, res){
  const g = UJ.traceloft.loft(rings, res);
  if (!g || !g.positions || !g.positions.length) return "";
  const out = ["# " + name + " — lofted from its contours by µJump's tracing card; units: nm", "o " + tracingSafeName(name)];
  for (let i = 0; i < g.positions.length; i += 3)
    out.push("v " + g.positions[i].toFixed(1) + " " + g.positions[i + 1].toFixed(1) + " " + g.positions[i + 2].toFixed(1));
  for (let i = 0; i < g.indices.length; i += 3)
    out.push("f " + (g.indices[i] + 1) + " " + (g.indices[i + 1] + 1) + " " + (g.indices[i + 2] + 1));
  return out.join("\n") + "\n";
}
async function tracingCellZip(g, btn){
  if (!g || !g.items.length) return;
  const label = btn ? btn.textContent : "";
  try {
    const JSZip = await tracingJSZip();
    const got = await tracingFetchCell(g.items.map(function(x){ return x.t.structureId; }), btn);
    if (btn){ btn.disabled = true; btn.textContent = "zipping…"; }
    const res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    const cell = tracingSafeName(g.nuc ? "nucleus_" + g.nuc : (g.root ? "root_" + g.root
                                 : (g.coord ? "cell_at_" + g.coord.split(",").join("_") : "no_cell")));
    const zip = new JSZip(), dir = zip.folder(cell);
    const index = { nucleusId: g.nuc, rootId: g.root, dataset: (UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds) || "",
                    exported: new Date().toISOString(), voxelSizeNm: res, tracings: [], failed: [] };
    got.forEach(function(x){
      if (x.error){ index.failed.push({ structureId: x.sid, error: x.error }); return; }
      const t = x.t, st = x.st, name = st.name || t.name || x.sid;
      const base = tracingSafeName(name) + "__" + tracingSafeName(x.sid);
      const meta = { structureId: x.sid, name: name, kind: st.kind || t.kind || "", cellType: t.cellType || st.cellType || "",
                     color: t.color || st.color || "", nucleusId: t.nucleusId || st.nucleusId || "",
                     rootId: t.rootId || st.rootId || "", cellCoord: t.cellCoord || st.cellCoord || "",
                     instanceIndex: t.instanceIndex, instanceOf: t.instanceOf || "",
                     volumeUm3: t.volumeUm3, contributors: t.contributors || [], versions: t.versions || 1,
                     tracedBy: t.tracedBy || "", timestamp: t.timestamp || "", fileUrl: t.fileUrl || "",
                     voxelSizeNm: res, units: "tool voxels (x, y) and section (z)" };
      dir.file(base + ".json", JSON.stringify(Object.assign({}, meta, { contours: st.rings }), null, 1));
      let obj = "";
      try { obj = tracingObjOf(name, st.rings, res); } catch (_e){ obj = ""; }
      if (obj) dir.file(base + ".obj", obj);
      index.tracings.push(Object.assign({ file: base + ".json", mesh: obj ? base + ".obj" : "" }, meta));
    });
    dir.file("cell.json", JSON.stringify(index, null, 1));
    dir.file("README.txt", [
      "Tracings of " + (g.nuc ? "nucleus " + g.nuc : g.root ? "root " + g.root : "no named cell")
        + (g.nuc && g.root ? ", root " + g.root : "") + (index.dataset ? " — " + index.dataset : ""),
      "Exported " + index.exported, "",
      "<name>__<structureId>.json   the tracing: its contours in tool voxels, its ids and who traced it",
      "<name>__<structureId>.obj    a mesh lofted from those contours, in nanometres",
      "cell.json                    this list, machine-readable", "",
      "Voxel size (nm): " + res.join(" x "), ""].concat(index.tracings.map(function(t){
        return t.name + "  " + t.structureId + (t.fileUrl ? "  " + t.fileUrl : ""); }))
      .concat(index.failed.length ? ["", "Could not be read:"].concat(index.failed.map(function(f){
        return f.structureId + ": " + f.error; })) : []).join("\n") + "\n");
    const blob = await zip.generateAsync({ type: "blob" });
    tracingSaveBlob(blob, cell + "_tracings.zip");
    tracingSay("Saved " + cell + "_tracings.zip — " + index.tracings.length + " tracing"
      + (index.tracings.length === 1 ? "" : "s") + ", each with its contours and a mesh." + tracingFailedSay(got));
  } catch (e){
    tracingSay("Could not make the zip: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}

/* The same fetch tracingOpenShared() does, ending in a viewer instead of on the pad. Kept separate
   rather than given a flag: the two do different things with the answer, and the pad version has a
   second job (it becomes an EDIT of that tracing, carrying its structureId) that looking must not
   quietly start. */
async function tracingSharedInViewer(sid, btn){
  const label = btn ? btn.textContent : "";
  if (btn){ btn.disabled = true; btn.textContent = "opening…"; }
  try {
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(sid)
                          + tracingDsQS());
    const d = await r.json();
    const t = ((d && d.tracings) || [])[0];
    if (!t) throw new Error("the dataset has no tracing with that id any more");
    if (t.error) throw new Error(t.error);
    const st = UJ.tracing.rowsToStructures(t.rows || [])[0];
    if (!st || !st.rings.length) throw new Error("that tracing came back with no contours on it");
    tracingViewerOpen([{ name: st.name || t.name || sid, color: t.color || st.color || "#40e28c",
                         rings: st.rings }],
      "Opened “" + (st.name || t.name || sid) + "” in the viewer — its contours as "
      + "an annotation layer in its own colour. Nothing has been taken onto your pad; use "
      + "“Open it in the pad” for that.",
      { nuc: t.nucleusId || st.nucleusId || "", root: t.rootId || st.rootId || "" });
  } catch (e){
    tracingSay("Could not open that tracing: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}

async function tracingOpenShared(sid, btn){
  const label = btn ? btn.textContent : "";
  if (btn){ btn.disabled = true; btn.textContent = "opening…"; }
  try {
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(sid)
                          + tracingDsQS());
    const d = await r.json();
    const t = ((d && d.tracings) || [])[0];
    if (!t) throw new Error("the dataset has no tracing with that id any more");
    if (t.error) throw new Error(t.error);
    const st = UJ.tracing.rowsToStructures(t.rows || [])[0];
    if (!st || !st.rings.length) throw new Error("that tracing came back with no contours on it");

    if (!UJ.emtiles.configured())
      UJ.emtiles.configure(tracingSources());
    PAD = UJ.tracepad.create();
    PAD.rings = st.rings.map(function(r){
      return { z: Math.round(r.z),
               points: r.points.map(function(p){ return [Math.round(p[0]), Math.round(p[1])]; }) };
    });
    PAD.z = PAD.rings[0].z;
    /* Opened ON the first contour, not at whatever coordinate was in the boxes: the whole point of
       opening somebody's tracing is to see it. */
    const p0 = PAD.rings[0].points;
    let cx = 0, cy = 0;
    p0.forEach(function(p){ cx += p[0]; cy += p[1]; });
    PAD_CENTRE = [Math.round(cx / p0.length), Math.round(cy / p0.length), PAD.z];
    PAD_VIEW = null; PAD_BASE_READY = false;
    document.getElementById("tracePadWrap").style.display = "";
    padDraw();

    /* The identity travels with it, so adding a version does not quietly drop the cell type or the
       ids somebody else filled in. */
    /* ── AND THE PAD BEFORE IT DOES NOT ─────────────────────────────────────────  2026-09-19
       This builds a whole new PAD, so it is a fresh pad by every other measure, but it is not
       padOpen and it was resetting neither of the two things a pad session owns. Draw two
       organelles, leave without committing, open somebody's tracing to edit: the stale base would
       have filed the second structure of THIS session under the second structure of the last one,
       and the stale draft id would have saved the edit over that session's draft. Same fault as
       the compound ids, one level up. */
    TRACING_BASE_ID = ""; TRACING_DRAFT_ID = "";
    PAD_EDIT_ID = st.structureId; PAD_EDIT_IDS = {};
    /* ── WHAT NUMBER IT IS ALREADY PUBLISHED UNDER ──────────────────────────────  2026-09-19
       Søren: *"I would like that editing it does not increase its number."* It did: the submission
       builder asked for "one more than the highest this cell has" for every structure, including a
       version of one that is already counted in that highest. Remembered here, where the tracing
       itself is in hand, rather than re-derived later from an index that may not have loaded. */
    TRACING_EDIT_INDEX[String(st.structureId)] = Math.round(Number(st.instanceIndex) || 0);
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: st.structureId };
    draftSoon();          // an edit is draftable from the moment it is opened
    const what = document.getElementById("tracingWhat");
    if (what){
      const has = [].slice.call(what.options).some(function(o){ return o.value === st.kind; });
      what.value = (st.kind && has) ? st.kind : (st.kind ? "__other" : "__cell");
      document.getElementById("tracingNameRow").style.display =
        (what.value === "__other") ? "" : "none";
      if (what.value === "__other") document.getElementById("tracingName").value = st.name || "";
    }
    if (st.color) document.getElementById("tracingColor").value = st.color;
    if (st.nucleusId) document.getElementById("tracingNucId").value = st.nucleusId;
    if (st.rootId) document.getElementById("tracingRootId").value = st.rootId;
    { const ca = document.getElementById("tracingCellAt"), cc = st.cellCoord || t.cellCoord;
      if (ca && cc) ca.value = tracingCoordShow(cc); }
    /* FILED AGAINST NO CELL: opened, it looks for one -- the nearest nucleus to where it was drawn --
       so adding it again files the next version under the cell. How Søren's λJump lysosome, traced
       before the card could read λJump's nuclei, gets its cell (2026-09-21). */
    if (!st.nucleusId && !st.rootId && !(st.cellCoord || t.cellCoord)){
      const nucBox = document.getElementById("tracingNucId");
      if (nucBox) nucBox.value = "";
      try { tracingFillCell(PAD_CENTRE); } catch (_e){}
    }
    const typeSel = document.getElementById("tracingType");
    if (typeSel && st.cellType){
      const opt = [].slice.call(typeSel.options).filter(function(o){ return o.value === st.cellType; })[0];
      if (opt){ typeSel.value = st.cellType; TRACING_TYPE_TOUCHED = true; }
    }
    document.getElementById("tracingFound").style.display = "";
    tracingEachRender(true);
    const who = (t.contributors && t.contributors.length) ? t.contributors.join(", ")
                                                          : (t.tracedBy || "somebody");
    tracingSay("“" + (st.name || st.structureId) + "” is in the pad — "
      + st.rings.length + " contour" + (st.rings.length === 1 ? "" : "s") + " by " + who + ", "
      + "version " + (t.versions || 1) + ". Every point can be moved, deleted or added to, and "
      + ", and . step between the sections it was drawn on. Press “Use these contours” and "
      + "then add it again to make your version the current one — nothing of theirs is deleted.");
    if (PAD3D_ON){ PAD3D_MESHES = null; pad3DSoon(); }
  } catch (e){
    tracingSay("Could not open that tracing: " + String(e && e.message || e), true);
  }
  if (btn){ btn.disabled = false; btn.textContent = label; }
}

/* ── THE PAD ─────────────────────────────────────────────────────────────────────  2026-09-17
   Søren: "A polygon tool is much easier for the user. Can you try to implement it?" There is none
   to borrow -- see src/a_polygon_tool_of_our_own.py for what was measured -- so the section is
   drawn here and the tool put on it. core/tracepad.js holds the state and knows nothing about the
   DOM; this half draws, and turns a click into a tool voxel through the view core/emtiles.js
   returns. Vertices are stored in TOOL voxels, so changing the zoom or panning never moves one. */
var PAD = null, PAD_VIEW = null, PAD_BUSY = false, PAD_HOVER = null, PAD_CENTRE = null;
/* A move asked for while a section is loading: padDraw draws again when it is done. */
var PAD_REDRAW = false;

/* ── SEVERAL OF THE SAME THING, EACH ITS OWN COLOUR ─────────────────────────────  2026-09-17
   Søren: *"I want the option to draw more than one organelle of the same type, the extra added
   organelles should have different colors, so you can distinguish them, and when publishing they
   should have different numbers, also when shown on the cell identity page."*

   A cell has forty mitochondria. Until now the pad held one structure and two contours on a section
   were two blobs OF IT -- right for a cell with a hole in it, wrong for two mitochondria side by
   side, and there was no way to say which you meant.

   THE COLOURS ARE THE EXPORT'S OWN, from blender/colour_policy.py through UJ.tracing: red means
   vessel and blue means nucleus, so the palette contains neither, and the same structure is the
   same colour on the pad and in the .blend. The colour picker still works and now sets the colour
   of the one being drawn -- it is a choice about THIS structure, not about the tracing. */
var PAD_INST_COLOUR = {}, PAD_INST_KIND = {};

/* ── ONE TYPE FOR ALL OF THEM, UNLESS YOU SAY OTHERWISE ─────────────────────────  2026-09-17
   Søren: *"I would like an option to identify the organelles identities individually, so standard
   is that they are all the same, but if you click a button you can identify them individually."*

   The default is the case that happens: several mitochondria in one cell, one type between them,
   one dropdown. Turning the option on makes the type box belong to the structure SELECTED in the
   Drawing strip, so one pass over a cell can log a mitochondrion, a lysosome and two vesicles
   without leaving the pad.

   NOTHING CHANGES ON THE WAY IN. Switching it on seeds every structure with the type already
   chosen, so the act of turning it on never alters what anything IS -- it only makes them
   separately editable. Switching it off goes back to the shared box and leaves what was stored
   alone, so a mis-click is not a lost afternoon.

   THEY STILL NUMBER WITHIN THEIR OWN TYPE. Two mitochondria and a lysosome on one cell are
   Mitochondrion 1, Mitochondrion 2 and Lysosome 1 -- a series is a kind, not a pad. */
function tracingEachOwn(){
  const box = document.getElementById("tracingEachOwn");
  return !!(box && box.checked);
}
/* What THIS structure is, as {kind, name}: its own when they are named separately and it has one,
   the shared box otherwise. */
function tracingKindFor(inst){
  if (tracingEachOwn()){
    const own = PAD_INST_KIND[String(inst || 0)];
    if (own && (own.kind || own.name)) return { kind: own.kind, name: own.name };
  }
  return tracingWhat();
}
/* ── ONE NAMING PER DRAWING NUMBER ──────────────────────────────────────────────  2026-09-17
   Søren: *"The name each one separately I thought would give me an option to name each one, so that
   there would be one naming for each drawing number."*

   Which is what the words say, and it is not what the tick did. It made the SINGLE box above mean
   "whichever number is selected on the pad": naming three structures was three trips to the Drawing
   strip, there was no moment when you could see what you had called them, and since the strip lives
   on the PAD, closing the pad left numbers two and three unreachable — the card then showed one
   type box, which looked like one naming for everything and quietly was not.

   On, the box is replaced by one ROW PER STRUCTURE: number, colour, type, and a name box when the
   type is "something else". All of them on screen at once, all of them editable, in the order they
   were drawn, and they survive the pad being closed because the list is built from the contours
   rather than from the pad.

   These two used to move a type between the single box and PAD_INST_KIND. The list writes
   PAD_INST_KIND directly, so there is nothing left to carry, and carrying it would now mean copying
   a hidden box's stale value onto whichever structure was just selected. Kept as no-ops rather than
   deleted: the call sites are about the SELECTION changing, which is still a real event, and the
   next thing to want them is likelier to want this comment than a fresh guess. */
function tracingShowKindOf(_inst){ /* the row shows it, and never had to be told */ }
function tracingStoreKindOf(_inst){ /* the row stores it, on change, where it was typed */ }
/* The structures to list, from the contours rather than from the pad, so the list is right after
   the pad is closed and for a tracing that arrived on a pasted link. */
function tracingEachInsts(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings)
             || (PAD && PAD.rings) || [];
  const seen = {}, out = [];
  rings.forEach(function(r){ const k = r.inst || 0; if (!seen[k]){ seen[k] = 1; out.push(k); } });
  if (PAD && !seen[PAD.inst || 0]) out.push(PAD.inst || 0);
  out.sort(function(a, b){ return a - b; });
  return out;
}
/* ── THE BOX YOU PICKED IS THE DEFAULT ─────────────────────────────────────────  2026-09-17
   Søren: *"I would like that if you choose an organelle before pressing Name each one separately,
   then the chosen organelle would be the default in the separate namings."*

   It used to seed only structures that had NO type yet (`if (!PAD_INST_KIND[k])`), which is right
   the very first time and wrong every time after: tick on, tick off, choose Lysosome, tick on again
   — and the rows still said whatever they said the first time, because by then they all had a type.
   The box is the last thing the person touched, and ignoring it is the one reading nobody expects.

   So the box now wins, WITH ONE EXCEPTION: if the stored types already DISAGREE with each other,
   somebody has been through the rows and named them individually, and that is work the tick must
   not quietly undo. All the same (or none) means nothing has been individually decided yet, and the
   box is the newer instruction. */
function tracingSeedKinds(){
  const what = document.getElementById("tracingWhat");
  const w = tracingWhat();
  const insts = tracingEachInsts();
  const named = insts.map(function(i){
    const o = PAD_INST_KIND[String(i)];
    return o ? String(o.value || "") : null;
  }).filter(function(v){ return v !== null; });
  const differ = named.length > 1 && named.some(function(v){ return v !== named[0]; });
  insts.forEach(function(i){
    const k = String(i);
    if (differ && PAD_INST_KIND[k]) return;      // individually named already — leave it alone
    PAD_INST_KIND[k] = { value: what ? what.value : "", kind: w.kind, name: w.name };
  });
}
/* Rebuilt only when the SET of structures changes. padRings() calls this on every close, delete and
   drag; rebuilding each time would take the caret out of a name box mid-word. A colour change
   writes through without a rebuild for the same reason. */
var TRACING_EACH_SIG = null;
function tracingEachRender(force){
  try { tracingPasteGhostsSync(); } catch (_e){}
  const box = document.getElementById("tracingEachList");
  const one = document.getElementById("tracingWhatRow");
  const lbl = document.getElementById("tracingWhatLabel");
  const nameRow = document.getElementById("tracingNameRow");
  const what = document.getElementById("tracingWhat");
  if (!box || !one || !what) return;
  const on = tracingEachOwn();
  const insts = tracingEachInsts();
  /* The question is only worth asking once there are two to tell apart -- and once it has been
     answered yes it stays, or turning it on would hide its own tick. */
  const row = document.getElementById("tracingEachRow");
  if (row) row.style.display = (insts.length > 1 || on) ? "flex" : "none";
  box.style.display = on ? "" : "none";
  one.style.display = on ? "none" : "flex";
  if (lbl) lbl.textContent = on ? "What did you outline? One row per number:"
                                : "What did you outline?";
  if (!on){
    TRACING_EACH_SIG = null;
    if (nameRow) nameRow.style.display = (what.value === "__other") ? "" : "none";
    return;
  }
  if (nameRow) nameRow.style.display = "none";   // each row carries its own
  const sig = insts.join(",");
  if (!force && sig === TRACING_EACH_SIG) return;
  TRACING_EACH_SIG = sig;
  const opts = what.innerHTML;
  box.innerHTML = insts.map(function(i){
    return '<div class="row" style="gap:8px;margin-top:6px;align-items:center;flex-wrap:nowrap">'
      + '<b style="flex:0 0 26px;font-family:monospace">#' + (i + 1) + '</b>'
      + '<div class="coord" style="flex:0 0 52px"><input type="color" class="eachcol" data-inst="'
        + i + '" style="width:100%;height:34px;padding:2px" title="The colour this one is drawn in '
        + '— on the pad, in the 3D window and in the dataset."></div>'
      + '<select class="eachwhat" data-inst="' + i + '" style="flex:2 1 auto;min-width:0">'
        + opts + '</select>'
      + '<div class="coord eachnamewrap" data-inst="' + i + '" style="flex:1 1 130px;display:none">'
        + '<input type="text" class="eachname" data-inst="' + i + '" placeholder="Name it"></div>'
      + '</div>';
  }).join("");
  insts.forEach(function(i){
    const k = String(i);
    const sel  = box.querySelector('.eachwhat[data-inst="' + i + '"]');
    const col  = box.querySelector('.eachcol[data-inst="' + i + '"]');
    const wrap = box.querySelector('.eachnamewrap[data-inst="' + i + '"]');
    const nm   = box.querySelector('.eachname[data-inst="' + i + '"]');
    const own  = PAD_INST_KIND[k];
    col.value = padInstColour(i);
    const want = (own && own.value) || what.value || "__cell";
    if ([].slice.call(sel.options).some(function(o){ return o.value === want; })) sel.value = want;
    if (sel.value === "__other"){ wrap.style.display = ""; nm.value = (own && own.name) || ""; }
    const store = function(){
      PAD_INST_KIND[k] = Object.assign({ value: sel.value },
                                       tracingWhatOf(sel.value, nm.value));
      padInstances(); pad3DSoon(); draftSoon();
    };
    sel.addEventListener("change", function(){
      wrap.style.display = (sel.value === "__other") ? "" : "none";
      store();
      if (sel.value === "__other") nm.focus();
    });
    nm.addEventListener("input", store);
    col.addEventListener("input", function(){
      PAD_INST_COLOUR[k] = col.value;
      /* Not a rebuild: everything that shows a colour is asked to repaint instead, so the picker
         under the pointer stays where it is. */
      padPaint(); padRings();
    });
    /* Seeded, not stored: the row is showing a type, so that IS this structure's type from now on
       -- but silently, because a render is not an edit and should not schedule a draft save or a
       preview rebuild for each of five rows. */
    PAD_INST_KIND[k] = Object.assign({ value: sel.value }, tracingWhatOf(sel.value, nm.value));
  });
}
function padInstColour(i){
  var k = String(i || 0);
  if (!PAD_INST_COLOUR[k]) PAD_INST_COLOUR[k] = UJ.tracing.instanceColour(i || 0);
  return PAD_INST_COLOUR[k];
}
/* The same colour the chip and the fill use, as the 0..1 triple the WebGL panel wants — so the
   surface in the 3D window and the outline on the pad are the same colour by construction rather
   than by two lists kept in step by hand. Falls back to the palette's first entry, which is what a
   structure with no colour of its own has always been drawn in. */
function padInstTint(i){
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(padInstColour(i) || ""));
  if (!m) return null;
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}
/* #rrggbb with an alpha, for the fill under a contour. Written out rather than reached for through
   a colour library, because this is the only place in the file that needs it. */
function hexA(hex, a){
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!m) return "rgba(64,226,140," + a + ")";
  return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16)
       + "," + a + ")";
}
/* One chip per structure on the pad, in its own colour, with the one being drawn marked. Clicking
   a chip goes back to that structure -- which is how you add a section to the second mitochondrion
   after starting a third. */
function padInstances(){
  const box = document.getElementById("tracePadInsts");
  if (!box || !PAD) return;
  const list = UJ.tracepad.instances(PAD);
  /* The option is a question about telling two things apart, so it is not asked until there are
     two -- and it stays once it has been answered yes, or turning it on would hide its own tick. */
  const row = document.getElementById("tracingEachRow");
  if (row) row.style.display = (list.length > 1 || tracingEachOwn()) ? "flex" : "none";
  box.innerHTML = list.map(function(it){
    const on = (it.inst === (PAD.inst || 0));
    return '<button type="button" class="hist-chip padinst" data-inst="' + it.inst + '" '
      + 'style="display:inline-flex;align-items:center;gap:5px;'
      + (on ? "outline:2px solid var(--accent);" : "") + '" title="'
      + (on ? "The one you are drawing now" : "Go back to this one") + ' — '
      + it.contours + ' contour(s) on ' + it.sections + ' section(s)">'
      + '<span style="width:9px;height:9px;border-radius:2px;background:'
      + escHtml(padInstColour(it.inst)) + '"></span>' + (it.inst + 1)
      /* Its own type on the chip once they can differ -- with the option off the label would be the
         same word repeated down the strip, which is noise. */
      + (tracingEachOwn()
          ? ' <span style="opacity:.75;max-width:90px;overflow:hidden;text-overflow:ellipsis;'
            + 'white-space:nowrap">' + escHtml(tracingKindFor(it.inst).name || "?") + '</span>'
          : '')
      + (it.contours ? '' : ' <span style="opacity:.6">empty</span>') + '</button>';
  }).join("");
  [].slice.call(box.querySelectorAll(".padinst")).forEach(function(b){
    b.addEventListener("click", function(){
      /* What is in the type boxes belongs to the one being LEFT, and the one being arrived at puts
         its own there. Storing first is what makes the strip a set of tabs rather than a row of
         buttons that quietly copy one structure's type onto the next. */
      tracingStoreKindOf(PAD.inst);
      UJ.tracepad.setInstance(PAD, +b.dataset.inst);
      tracingShowKindOf(PAD.inst);
      const col = document.getElementById("tracingColor");
      if (col) col.value = padInstColour(PAD.inst);
      padPaint(); padRings();
      padSay("Drawing number " + (PAD.inst + 1) + " now — anything you draw joins that one."
        + (tracingEachOwn() ? " The type box above is its own." : ""));
    });
  });
}

/* ── WHICH MACHINE THIS IS, ASKED ONCE ──────────────────────────────────────────  2026-09-17
   Søren: *"Make sure that all the commands work for mac also."* Nearly all of them already did --
   shift, the arrow keys, comma and full stop, dragging a point, the wheel in the 3D panel are the
   same gesture on both. ONE genuinely differs, and it is the one added today: CTRL+CLICK IS THE
   SECONDARY CLICK ON macOS. Every ordinary right-click a Mac user makes arrives with ctrlKey set,
   so "ctrl+click removes the whole contour" would remove a contour every time they tried to delete
   a single point. Cmd there, Ctrl everywhere else.

   navigator.userAgentData.platform where it exists; navigator.platform where it does not, which is
   deprecated and still the only one Safari answers. Neither is spoof-proof and neither has to be:
   the cost of guessing wrong is a gesture that does nothing, and the panel below spells out which
   key this page thinks you have. */
var PAD_MAC = (function(){
  try {
    var pl = (navigator.userAgentData && navigator.userAgentData.platform)
          || navigator.platform || navigator.userAgent || "";
    return /mac|iphone|ipad|ipod/i.test(pl);
  } catch (e){ return false; }
})();
var PAD_MOD = PAD_MAC ? "\u2318 Cmd" : "Ctrl";
/* What a "right-click" is, in words, on the machine reading this. On a Mac it is ctrl+click or a
   two-finger click; naming it "right-click" to somebody on a trackpad with no right button is the
   kind of instruction that reads as "this feature is not for you". */
var PAD_RIGHT = PAD_MAC ? "ctrl+click (or a two-finger click)" : "right-click";

function padSay(msg, bad){
  const el = document.getElementById("tracePadSay");
  if (el){ el.textContent = msg; el.style.color = bad ? "var(--bad)" : ""; }
}

/* ── THE SEGMENTATION, UNDER THE CONTOURS ───────────────────────────────────────  2026-09-17
   Søren: *"There should be an option to show the segmentation of the root ID and the nucleus ID of
   the cell in the EM window."*

   The ids are the card's own boxes, which is what makes this about ONE cell rather than a coloured
   mosaic of the whole volume: the root ID in magenta, the nucleus ID in blue, over the section the
   pad has just drawn. Best-effort by design — a cell the segmentation does not have is exactly the
   case this pad exists for, and the tick failing to find anything must not cost the section. */
function padSegSay(msg, bad){
  const el = document.getElementById("tracePadSegSay");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = bad ? "var(--bad)" : "";
}
async function padSegOverlay(){
  const box = document.getElementById("tracePadSeg");
  if (!box || !box.checked){ padSegSay(""); return null; }
  if (!PAD_VIEW){ padSegSay("No section on the pad yet.", true); return null; }
  /* Each id only where the dataset has the volume to paint it from, 2026-09-21 — on βJump the
     nucleus box holds a Hoechst blob number and there is no nucleus segmentation behind it. */
  const SRCS = tracingSources();
  const root = SRCS.seg ? (document.getElementById("tracingRootId").value || "").trim() : "";
  const nuc = SRCS.nuc ? (document.getElementById("tracingNucId").value || "").trim() : "";
  if (!root && !nuc){
    padSegSay("Nothing to paint — fill in this cell's root ID or nucleus ID below the pad, "
      + "then tick this again.", true);
    return null;
  }
  try {
    if (!UJ.segpaint.configured())
      UJ.segpaint.configure(tracingSources());
    const cv = document.getElementById("tracePad");
    padSegSay("Reading the segmentation…");
    /* THE WHOLE CELL, where a cell is many segments.  2026-09-21. On χJump the root box holds
       one fragment and the cell is every fragment of its assembly; the host says which. */
    let also = [];
    try {
      const f = UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.cellIdsFor;
      /* By the cell's key as well as the fragment (2026-09-21): on χJump the fragment under the
         pointer need not be one the cell lists. */
      const key = (document.getElementById("tracingNucId").value || "").trim();
      if ((root || key) && typeof f === "function")
        also = (f(root, key) || []).map(String).filter(function(x){ return x && x !== root; });
    } catch (_e){ also = []; }
    /* And the community's proposed root IDs for the nucleus, 2026-09-21 -- the same cell the viewer
       link shows. The nucleus box is read whether or not there is a nucleus volume to paint it in. */
    const nucForExtras = (document.getElementById("tracingNucId").value || "").trim();
    let proposed = 0;
    if (SRCS.seg && nucForExtras){
      try { (await tracingExtraRootsFor(nucForExtras, root)).forEach(function(x){
              if (x !== root && also.indexOf(x) < 0){ also.push(x); proposed++; } }); } catch (_e){}
    }
    const got = await UJ.segpaint.paint(cv, PAD_VIEW, { root: root || also[0] || "", rootAlso: root ? also : also.slice(1), nuc: nuc, alpha: 0.4,
      onProgress: function(d){ padSegSay("Reading the segmentation… " + d + " chunk(s)"); } });
    /* PER VOLUME, because "nothing appeared" has two causes that need different answers: the cell
       is not in this window, or the cell is not in the segmentation at all -- which is the whole
       reason somebody would be tracing it by hand. One number each says which. */
    const part = function(what, id, r){
      if (!id) return null;
      if (!r) return what + " " + id + ": not read";
      return what + " " + id + ": " + (r.painted ? r.painted.toLocaleString() + " px" : "nothing here")
        + " (" + r.chunks + " chunk" + (r.chunks === 1 ? "" : "s") + " at " + r.nmPerVoxel + " nm)";
    };
    /* Søren, 2026-09-21: "for the tracing segmentation, all the root IDs that have been proposed
       should be shown" -- they are painted, and the line says how many. */
    const said = [part(proposed ? "root + " + proposed + " proposed root ID" + (proposed === 1 ? "" : "s")
                       : also.length ? "cell (" + (also.length + 1) + " segments)" : "root",
                       root || also[0] || "", got && got.cell), part("nucleus", nuc, got && got.nucleus)]
                   .filter(Boolean).join(" · ");
    if (got && got.ok && !got.painted)
      padSegSay(said + " — nothing on this section. Either it is not in this window, or this "
        + "cell is not in the segmentation, which is what hand tracing is for.", true);
    else padSegSay(said);
    return got;
  } catch (e){
    padSegSay("Could not read the segmentation: " + String(e && e.message || e)
      + " — the section itself is fine.", true);
    return null;
  }
}

/* Alt was held when this stroke began: it continues a contour rather than starting one.
   See src/the_pen_picks_up_where_it_left_off.py. */
var PAD_EXTEND = false;
async function padDraw(){
  if (!PAD_CENTRE) return;
  const cv = document.getElementById("tracePad");
  if (PAD_BUSY){ PAD_REDRAW = true; return; }
  PAD_BUSY = true;
  PAD_REDRAW = false;
  const sel = document.getElementById("tracePadMip");
  const pick = String(sel.value).split(":");
  const mip = +pick[0], zoom = +(pick[1] || 1);
  try{
    /* Fill the card rather than sitting in a black band: the canvas' pixel width IS the number of
       voxels drawn, so it is set from the space available rather than fixed in the markup. Capped,
       because every extra 128 pixels is another column of chunks to fetch. */
    const host = cv.parentElement;
    const wide = Math.max(320, Math.min(880, (host && host.clientWidth ? host.clientWidth - 2 : 560)));
    /* THE WINDOW GOES IN. Without it emtiles uses 86/172 — minnie65's — on every volume; see
       tracingWindow's header for what that did to Lee16. */
    var PAD_WIN = tracingWindow();
    PAD_VIEW = await UJ.emtiles.drawSection(cv, {
      centre: PAD_CENTRE, mip: mip, zoom: zoom, w: wide, h: cv.height, slabOk: tracingSlabOk(),
      lo: PAD_WIN.lo, hi: PAD_WIN.hi,
      onProgress: function(d, n){ if (d < n) padSay("Loading the section\u2026 " + d + "/" + n); }
    });
    /* ── THE MENU NOW DESCRIBES THIS PAD, NOT A 560 px ONE ────────  2026-09-20
       padRelabelMips also runs at mount, where the canvas still has the 560 the markup gives it
       because the pad is display:none and has no width to measure. The pad then sizes itself to
       the card — 718 px in a 1280 px window — so the menu read "11 µm" beside a caption reading
       "13.9 µm across", both about the same picture. drawSection has just set cv.width to the
       width it really used, so this is the first moment the two can agree. Not awaited: the
       labels are not what the reader is waiting for. */
    try { padRelabelMips(); } catch (_e){}
    /* ── THE SEGMENTATION GOES ON BEFORE THE CAPTURE ───────────────────────────  2026-09-17
       padCapture() snapshots the canvas as the base that every later contour repaint restores. An
       overlay painted after it would be wiped by the first mouse move; painted here it is part of
       the section, which is what it is. */
    await padSegOverlay();
    /* THE ONE MOMENT THE CANVAS IS KNOWN TO HOLD A FINISHED SECTION. See padCapture. */
    padCapture();
    padPaint();
    padRings();
    padSay(UJ.tracepad.count(PAD).rings + " contour(s) kept, "
      + (PAD.pending.length ? PAD.pending.length + " vertices on this one \u2014 click the ring to close it"
                            : "click each vertex round the cell")
      + (PAD_SAY_NEXT ? " " + PAD_SAY_NEXT : ""));
    /* Kept while another draw is queued behind this one: the note is about where the pad is going. */
    if (!PAD_REDRAW) PAD_SAY_NEXT = "";
  }catch(e){
    /* Spent unsaid rather than carried: a note about a move that did not finish would turn
       up appended to the next section that does, out of nowhere. */
    PAD_SAY_NEXT = "";
    padSay("Could not read the EM there: " + String(e && e.message || e), true);
    /* drawSection resets the canvas' width before it fetches anything, which clears it. A fetch
       that failed would otherwise leave a blank pad with no outline on it. */
    padPaint();
  }
  PAD_BUSY = false;
  padZLabel();
  if (PAD_REDRAW){ PAD_REDRAW = false; padDraw(); }
}

/* ── HALF A SCREEN AT A TIME ─────────────────────────────────────────────────  2026-09-21
   fx, fy are fractions of what is on the pad: -0.5 is half a screen left (or up). Measured off
   the view actually drawn, so it is half the screen at every zoom and every voxel size. */
function padPan(fx, fy){
  if (!PAD_VIEW || !PAD_CENTRE) return;
  const a = PAD_VIEW.toolAt(0, 0), b = PAD_VIEW.toolAt(PAD_VIEW.w, PAD_VIEW.h);
  const dx = Math.round((b[0] - a[0]) * fx), dy = Math.round((b[1] - a[1]) * fy);
  PAD_CENTRE = [PAD_CENTRE[0] + dx, PAD_CENTRE[1] + dy, PAD.z];
  PAD_SAY_NEXT = "Moved to " + PAD_CENTRE[0] + ", " + PAD_CENTRE[1] + ".";
  padDraw();
}

/* ── THE EM IS CAPTURED BY THE ONE FUNCTION THAT KNOWS IT IS FRESH ──────────────  2026-09-17
   Søren: *"If I shift click to move the view, it now only moves the segmentation and not the EM
   images."*

   It did, and the cause was a flag rather than anything to do with panning. Capturing and restoring
   were one function choosing between them on `PAD_PAINTING`, so ANY repaint could decide it was the
   one holding the fresh section -- including the hover repaint in pointermove, which fires on a
   pointer that has barely moved while a pan's fetch is still in the air:

     shift+click          -> padDraw() starts; the section is still the OLD one on the canvas
     the pointer twitches -> pointermove -> padPaint() captures THAT as the base, and flips the flag
     the fetch lands      -> the new section is drawn, then padPaint() restores the old base over it
                             and draws the contours at their NEW positions

   Old tissue, moved outline, exactly as reported. So capturing stopped being a mode: padDraw()
   captures, once, at the only moment the canvas is known to hold a finished section, and padPaint()
   only ever restores. A repaint arriving mid-fetch now redraws the previous section, which is what
   was on screen anyway. */
var PAD_BASE = null, PAD_BASE_READY = false;
/* ONE LINE, SAID ONCE, WHEN THE SECTION IS ON SCREEN.  2026-09-19. padDraw is asynchronous and
   finishes with a padSay whatever happens, so a caller that says something before calling it is
   overwritten a moment later -- which is how "your contours came with you" vanished behind
   "48 contour(s) kept" in testing, and would have vanished behind "Could not read the EM there"
   in the field. Set this instead and padDraw appends it to its own conclusion, once. */
var PAD_SAY_NEXT = "";
function padBase(cv){
  if (!PAD_BASE || PAD_BASE.width !== cv.width || PAD_BASE.height !== cv.height){
    PAD_BASE = document.createElement("canvas");
    PAD_BASE.width = cv.width; PAD_BASE.height = cv.height;
    PAD_BASE_READY = false;      // a base the wrong size is not a section, it is an empty canvas
  }
  return PAD_BASE;
}
function padCapture(){
  const cv = document.getElementById("tracePad");
  if (!cv) return;
  padBase(cv).getContext("2d").drawImage(cv, 0, 0);
  PAD_BASE_READY = true;
}
function padPaint(){
  const cv = document.getElementById("tracePad"), g = cv.getContext("2d");
  padBase(cv);
  if (PAD_BASE_READY) g.drawImage(PAD_BASE, 0, 0);
  if (!PAD_VIEW) return;
  const px = function(t){ return PAD_VIEW.pxAt(t); };
  /* Contours already closed on THIS section, then the one being drawn.

     ONE PATH PER STRUCTURE, FILLED EVEN-ODD, since 2026-09-19 (Søren: *"If I draw one contour
     inside another, it should subtract the inside from the outside, so that the inner one becomes
     a hole"*). Each ring used to get its own beginPath/fill, which painted an inner contour ON TOP
     of the outer one — two overlapping washes where the volume, the export and now the preview
     all say there is a hole. Grouping by r.inst is what keeps two mitochondria drawn side by side
     from punching each other: same structure, same path; different structures, different paths. */
  const padFills = {};
  PAD.rings.forEach(function(r){
    if (r.z !== PAD.z) return;
    const key = String(r.inst || 0);
    if (!padFills[key]){ padFills[key] = new Path2D(); }
    const sub = padFills[key];
    r.points.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) sub.lineTo(q[0], q[1]); else sub.moveTo(q[0], q[1]); });
    sub.closePath();
  });
  Object.keys(padFills).forEach(function(key){
    g.fillStyle = hexA(padInstColour(+key || 0), 0.14);
    g.fill(padFills[key], "evenodd");
  });
  PAD.rings.forEach(function(r){
    if (r.z !== PAD.z) return;
    g.beginPath();
    r.points.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.closePath();
    /* Its own structure's colour, so two mitochondria side by side are two shapes rather than one
       ambiguous pair of outlines. The OUTLINE is still per contour: it is about the line you drew,
       not about the region it bounds, and a hole's rim has to be visible to be draggable. */
    const col = padInstColour(r.inst || 0);
    g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    /* The vertices of a CLOSED contour, because since 2026-09-17 they can be dragged, and a handle
       you cannot see is a handle you do not know you have. */
    r.points.forEach(function(p){
      const q = px([p[0], p[1], PAD.z]);
      g.beginPath(); g.arc(q[0], q[1], 2.5, 0, 6.2832);
      g.fillStyle = col; g.fill();
    });
  });
  /* The one under the pointer, larger, so it is obvious which one a drag would take. */
  if (PAD_HOVER && !PAD.pending.length){
    const h = UJ.tracepad.hitVertex(PAD, PAD_HOVER[0], PAD_HOVER[1], PAD_VIEW.pxPerToolVoxel);
    if (h){
      const v = UJ.tracepad.vertexOf(PAD, h.ring, h.vertex);
      if (v){ const q = px([v[0], v[1], PAD.z]);
        g.beginPath(); g.arc(q[0], q[1], 6, 0, 6.2832);
        g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.stroke(); }
    }
  }
  /* THE STROKE, WHILE THE PEN IS DOWN. Drawn from the raw samples rather than from the thinned
     ring, because the thinning happens on lifting: what the hand is doing now is the line the hand
     is making, and a preview that lagged behind it by a simplification pass would feel wrong in a
     way that is hard to name and easy to notice. */
  if (PAD.stroke && PAD.stroke.length > 1){
    g.beginPath();
    PAD.stroke.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.strokeStyle = padInstColour(PAD.inst || 0); g.lineWidth = 2; g.stroke();
  }
  if (PAD.pending.length){
    g.beginPath();
    PAD.pending.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    /* The contour being clicked is the same colour as the one it will become. It used to be a
       fixed amber, which was fine when there was only ever one structure and is a lie now. */
    const pcol = padInstColour(PAD.inst || 0);
    g.strokeStyle = pcol; g.lineWidth = 2; g.stroke();
    PAD.pending.forEach(function(p, i){
      const q = px([p[0], p[1], PAD.z]);
      g.beginPath();
      if (i === 0){
        /* THE FIRST VERTEX IS A RING, not a dot, and it lights up when the pointer is on it.
           It is the thing you have to come back to, so it has to be visible from the first click
           rather than remembered. */
        const near = PAD_HOVER && UJ.tracepad.nearFirst(PAD, PAD_HOVER[0], PAD_HOVER[1],
                                                        PAD_VIEW.pxPerToolVoxel);
        g.arc(q[0], q[1], near ? 9 : 6, 0, 6.2832);
        g.strokeStyle = near ? "#ffffff" : pcol;
        g.lineWidth = near ? 3 : 2; g.stroke();
      } else {
        g.arc(q[0], q[1], 2.5, 0, 6.2832);
        g.fillStyle = pcol; g.fill();
      }
    });
  }
}
/* One chip per contour on this section, each with its own delete. "Delete this one" should not
   mean "Undo until it is gone" -- that is the difference between correcting a tracing and starting
   it again. */
function padRings(){
  try { tracingPasteGhostsSync(); } catch (_e){}
  /* The preview and the draft both follow the contours from here: this is called after every close,
     every delete and every reload of a section, which is every way the set of rings can change. */
  pad3DSoon();
  draftSoon();
  padVolume();
  padInstances();
  tracingEachRender();      // a new structure gets a row; a deleted one loses it
  const box = document.getElementById("tracePadRings");
  if (!box || !PAD) return;
  const here = UJ.tracepad.onSection(PAD);
  if (!here.length){ box.innerHTML = ""; return; }
  /* WHICH NUMBER IS THIS? The chips used to count their own position on the section -- so a pad
     with two structures showed "2 · 33 points" next to a strip chip reading "2 empty", and the two
     2s meant different things. With more than one structure the chip says which STRUCTURE the
     contour belongs to instead, which is the number the rest of the card is about. */
  const severalHere = UJ.tracepad.instances(PAD).length > 1;
  box.innerHTML = '<span class="hint">On this section:</span> '
    + here.map(function(h, n){
        return '<button type="button" class="hist-chip padring" data-ring="' + h.ring + '" '
          + 'title="Delete this contour \u2014 it belongs to number ' + ((h.inst || 0) + 1) + '">'
          + '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;'
          + 'margin-right:4px;background:' + escHtml(padInstColour(h.inst || 0)) + '"></span>'
          + (severalHere ? ('#' + ((h.inst || 0) + 1)) : String(n + 1))
          + ' \u00b7 ' + h.points + ' points \u00d7</button>';
      }).join(" ");
  [].slice.call(box.querySelectorAll(".padring")).forEach(function(b){
    b.addEventListener("click", function(){
      if (UJ.tracepad.deleteRing(PAD, +b.dataset.ring)){
        padPaint(); padRings();
        padSay("Contour deleted. " + UJ.tracepad.count(PAD).rings + " left.");
      }
    });
  });
}

function padZLabel(){
  const el = document.getElementById("tracePadZ");
  if (el) el.textContent = "z " + PAD.z
    + (PAD_VIEW ? "  \u00b7  " + (Math.round(PAD_VIEW.umAcross * 10) / 10) + " \u00b5m across  \u00b7  "
                  + PAD_VIEW.nmPerPx + " nm data" : "");
}

function padStep(dir){
  const n = Math.max(1, parseInt(document.getElementById("tracePadStep").value, 10) || 5);
  PAD.pending = [];                        // a half-drawn contour belongs to the section it is on
  PAD.z += dir * n;
  PAD_CENTRE = [PAD_CENTRE[0], PAD_CENTRE[1], PAD.z];
  padDraw();
}

function padOpen(){
  const got = tracingPos();
  if (got.error){ tracingSay(got.error, true); return; }
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure(tracingSources());

  /* ── WITH WORK IN HAND, THIS MOVES THE PAD; IT DOES NOT REPLACE IT ─────────────  2026-09-19
     Søren: *"I then moved to another coordinate to continue segmenting, but then the drawing
     number started over... Can I append this extra new drawing to the 3 others?"*

     It started over because both lines below ran unconditionally: a brand new pad, and
     TRACING_PENDING thrown away. Everything he had drawn went with them.

     NOBODY TYPES A COORDINATE TO ADD A SECTION. The card teaches `,` and `.` for stepping through
     an organelle you are already on, so typing a coordinate and pressing this means "go there and
     draw the NEXT thing". Hence: keep the contours, keep the numbering, move the field, and start
     the next free number — which is the appending he asked for, without a question to answer.
     Contours read off a pasted link are adopted rather than dropped: they are already
     {z, points, inst}, which is exactly what the pad stores. */
  const inHand = (PAD && PAD.rings && PAD.rings.length) ? PAD.rings.slice()
               : (TRACING_PENDING && (TRACING_PENDING.rings || []).length)
                 ? TRACING_PENDING.rings.map(function(r){
                     return { z: r.z, points: r.points, inst: r.inst || 0 }; })
                 : null;
  if (inHand){
    if (!PAD) PAD = UJ.tracepad.create();
    PAD.rings = inHand;
    PAD.z = got.pos[2];
    PAD_CENTRE = got.pos.slice();
    PAD_VIEW = null; PAD_BASE_READY = false;
    const n = UJ.tracepad.newInstance(PAD);          // the next free number, not the count
    document.getElementById("tracePadWrap").style.display = "";
    /* SAID WHEN THE PAD IS ACTUALLY SHOWING THE NEW PLACE, not before. padDraw is asynchronous and
       ends with a padSay of its own either way, so anything said here would be overwritten a moment
       later by "48 contour(s) kept" — or, if the EM could not be read, by an error this has no
       business burying. One line, consumed once, appended to whatever padDraw concludes. */
    PAD_SAY_NEXT = "Your " + inHand.length + " contour" + (inHand.length === 1 ? "" : "s")
      + " came with you \u2014 anything you draw here is number " + (n + 1)
      + ". Click a number in the strip to add to that one instead.";
    padDraw();
    padRings();
    tracingResolveAt(got.pos);
    return;
  }

  PAD = UJ.tracepad.create();
  PAD.z = got.pos[2];
  PAD_CENTRE = got.pos.slice();
  PAD_VIEW = null; PAD_BASE_READY = false;
  /* A FRESH PAD IS A FRESH STRUCTURE. Opening the pad after editing somebody's tracing must not
     leave its id attached, or the next cell you draw would be filed as the next version of theirs.
     The ghosts go too: they belong to the ids that were in the boxes.
     tracingPendingClear() rather than `TRACING_PENDING = null` since 2026-09-19: setting it to null
     on its own left the card below showing three volumes for contours that no longer existed. */
  /* A FRESH PAD IS A FRESH DRAFT, 2026-09-19. Without this the next tracing would save itself
     over the last one's draft entry -- which is the single-slot behaviour this change exists to
     end, reintroduced one level down. And a fresh BASE, or the next pad's second structure would
     be filed as this one's second structure. */
  TRACING_DRAFT_ID = ""; TRACING_BASE_ID = "";
  PAD_EDIT_ID = ""; PAD_EDIT_IDS = {}; tracingPendingClear(); PAD3D_MESHES = null; PAD3D_KEY = "";
  /* A kept draft is not thrown away by opening the pad -- but it WILL be replaced once something is
     drawn here, and being told that before it happens is the whole difference. */
  tracingIndexSoon();          // so "the fourth mitochondrion" knows about the first three
  const kept = draftRead();
  if (kept && kept.rings.length)
    tracingSay("There is an unfinished tracing kept in this browser — " + kept.rings.length
      + " contour(s), saved " + draftWhen(kept.at) + ". Resume it from the bar above, or carry on "
      + "here and it is replaced as soon as you close a contour.");
  document.getElementById("tracePadWrap").style.display = "";
  padDraw();
  tracingResolveAt(got.pos);
}

/* WHAT THE REST OF THE TOOL WOULD CALL THIS CELL.  2026-09-17
   Søren: "from the root ID or nucleus ID it should suggest what cell type it is based on the cell
   identity." Same precedence as everywhere else in this file -- Grubb et al.'s own verification,
   then the community's report, then the MICrONS prediction -- so the suggestion agrees with what
   the cell panel and the filter say about the same cell, which a second rule here would not.

   Either id gets there: nidToIndex() and rootIdToIndex() are the two reverse maps the Root/Nucleus
   search already builds. */
/* The parameters are NOT called nucId/rootId by accident: `rootId` is also the name of the page's
   own index-to-root-id function, and a parameter called that shadows it -- which is why the first
   version of this filled the nucleus in from a root id and never the other way round. Caught by the
   check asserting BOTH directions rather than one. */
function tracingIdentityFor(nucIn, rootIn){
  /* ── WHAT THIS CELL ALREADY IS, IF THE PAGE KNOWS ──────────────────  2026-09-20
     The body below is µJump's, and it reads µJump's tables: NID, NT, OWN_TYPE, OWN_TYPE_NAMES,
     CT_NAMES. Most are behind a `typeof` guard; NID and CT_NAMES were not, and on a page without
     them this throws inside a click handler — which looks like a button that does nothing.

     A host that can identify its own cells answers here. One that cannot gets null, and the form
     simply does not pre-select a type. That is a real state, not a degraded one: this only ever
     OFFERS a starting point, and offering none is better than offering a wrong one. */
  try {
    var hook = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.identityFor : null;
    if (typeof hook === "function") return hook(nucIn, rootIn) || null;
  } catch (_e){}
  if (typeof NID === "undefined") return null;      // no tables on this page, and none promised
  var i = -1, via = "";
  if (nucIn && typeof nidToIndex === "function"){
    i = nidToIndex(String(nucIn));
    if (i >= 0) via = "nucleus " + nucIn;
  }
  if (i < 0 && rootIn && typeof rootIdToIndex === "function"){
    i = rootIdToIndex(String(rootIn));
    if (i >= 0) via = "root ID " + rootIn;
  }
  if (i < 0) return null;
  /* THE OTHER ID COMES FREE.  2026-09-17. Søren: "the nucleus ID should also be put in, because you
     know that this root ID is associated with this nucleus ID because the cell has been identified."
     Exactly so -- the index IS the association, and this dataset stores both sides of it, so once
     either id has found a cell the other one is a lookup rather than a question. It matters most in
     the case that prompted it: a coordinate inside a process reads a root id and NOTHING in the
     nucleus volume, because the nucleus is somewhere else entirely. */
  var pair = { nucleusId: String(NID[i]), rootId: (typeof rootId === "function" ? rootId(i) : "") || "" };
  function answer(name, how){ return { name: name, how: how, via: via,
                                       nucleusId: pair.nucleusId, rootId: pair.rootId }; }
  if (typeof OWN_TYPE !== "undefined" && OWN_TYPE[i] !== 255)
    return answer(OWN_TYPE_NAMES[OWN_TYPE[i]], "verified by Grubb et al.");
  var comm = (window.__COMM_ROWTYPE || {})[String(NID[i])];
  if (comm) return answer(comm, "reported by the community");
  var t = (typeof NT !== "undefined") ? NT[i] : 0;
  if (t && typeof CT_NAMES !== "undefined") return answer(CT_NAMES[t - 1], "MICrONS\u2019 prediction");
  return answer("", "no identity on file");
}

/* Selected for him, and said out loud WHERE IT CAME FROM: a guess with no provenance is worse than
   no guess, and these three sources are not equally strong. Never overrides a choice made by hand --
   TRACING_TYPE_TOUCHED is set the moment he picks one himself. */
var TRACING_TYPE_TOUCHED = false;
function tracingSuggestType(){
  const sel = document.getElementById("tracingType");
  const say = document.getElementById("tracingTypeSay");
  if (!sel || !say) return;
  const nuc = (document.getElementById("tracingNucId").value || "").trim();
  const root = (document.getElementById("tracingRootId").value || "").trim();
  if (!nuc && !root){ say.textContent = ""; return; }
  let id = null;
  try { id = tracingIdentityFor(nuc, root); } catch (e){ say.textContent = ""; return; }
  if (!id){ say.textContent = "No cell in this dataset has that nucleus ID or root ID."; return; }
  /* Fill in whichever id the cell has and the box does not. Never overwrites: a value already
     there was either read from the segmentation or typed, and both outrank a lookup. */
  const nucEl = document.getElementById("tracingNucId"), rootEl = document.getElementById("tracingRootId");
  const gained = [];
  if (id.nucleusId && !nucEl.value.trim()){ nucEl.value = id.nucleusId; gained.push("nucleus " + id.nucleusId); }
  if (id.rootId && !rootEl.value.trim()){ rootEl.value = id.rootId; gained.push("root ID " + id.rootId); }
  const also = gained.length ? " Its " + gained.join(" and ") + " filled in from the record." : "";
  if (!id.name){ say.textContent = "Nothing is on file for that cell yet \u2014 name its type yourself." + also; return; }
  /* MATCHING TWO VOCABULARIES.  MICrONS records a subclass code -- "6P-CT" -- while this list
     carries the identification tree's leaf names, and the leaf for that one reads "Layer 6 CT
     pyramidal neuron (6P-CT)". The code in parentheses IS the join, and it is there on every leaf
     that has one, so the second rule below is not a heuristic about text but a use of how the
     ontology was written. Anything with no leaf at all is added under a group of its own rather
     than refused: the cell's own record is a better answer than none, and this field becomes a
     Blender collection name, not a key into the tree. */
  const opts = [].slice.call(sel.options);
  const want = String(id.name);
  let opt = opts.filter(function(o){ return o.value === want; })[0];
  if (!opt) opt = opts.filter(function(o){ return o.value.indexOf("(" + want + ")") >= 0; })[0];
  if (!opt) opt = opts.filter(function(o){ return o.value.toLowerCase() === want.toLowerCase(); })[0];
  if (!opt){
    let grp = sel.querySelector('optgroup[data-own="1"]');
    if (!grp){
      grp = document.createElement("optgroup");
      grp.label = "This cell\u2019s own record";
      grp.setAttribute("data-own", "1");
      sel.insertBefore(grp, sel.firstChild);
    }
    grp.innerHTML = "";
    opt = document.createElement("option");
    opt.value = want; opt.textContent = want;
    grp.appendChild(opt);
  }
  if (!TRACING_TYPE_TOUCHED){
    sel.value = opt.value;
    say.textContent = "Set to \u201c" + opt.value + "\u201d from " + id.via + " \u2014 " + id.how + "." + also;
  } else {
    say.textContent = id.via.charAt(0).toUpperCase() + id.via.slice(1) + " is on file as \u201c"
      + id.name + "\u201d (" + id.how + ")." + also;
  }
}

/* WHAT IS ALREADY THERE, READ RATHER THAN ASKED FOR.  2026-09-17
   Søren: "If the nucleus or cell mesh already exists at the location put in the coordinates, those
   should be prefilled." core/segread.js answers exactly that from the same segmentation the rest of
   the tool uses, so the two id boxes fill themselves.

   It never overwrites something already typed, and it SAYS what it found: a prefilled id with no
   explanation is a number to distrust, and "nothing is segmented there" is itself the answer when
   the reason for tracing is that the segmentation has missed the cell. */
/* ── THE CELL, FROM THE PAGE'S OWN NUCLEUS LIST ──────────────────────────  2026-09-21
   Where there is no segmentation to read (λJump), or as well as it: the nearest nucleus the page
   knows -- detected or added -- within 10 µm, the bulk card's own radius. A host with its own idea
   of a cell answers UJ.cfg.tracing.cellAt(pos) -> {nucleusId, coord:[x,y,z], distNm, label}. */
function tracingCellAtVal(){
  var e = document.getElementById("tracingCellAt");
  var n = String(e ? e.value : "").split(/[\s,;]+/).filter(Boolean).map(Number);
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
    + " \u00b5m away \u2014 its id and centre are filled in below.";
}

async function tracingResolveAt(pos){
  const say=document.getElementById("tracingAtSay");
  const nucEl=document.getElementById("tracingNucId"), rootEl=document.getElementById("tracingRootId");
  if(!say||!nucEl||!rootEl)return;
  try{
    UJ.segread.configure(tracingSources());
  }catch(e){say.textContent=tracingFillCell(pos);return;}
  say.textContent="Reading what is at "+pos.join(", ")+"\u2026";
  try{
    const r=await UJ.segread.resolveAt(pos);
    const bits=[];
    if(r.nucleusId){ if(!nucEl.value.trim())nucEl.value=String(r.nucleusId);
                     bits.push("nucleus "+r.nucleusId); }
    if(r.rootId&&r.rootId!=="0"){ if(!rootEl.value.trim())rootEl.value=String(r.rootId);
                                  bits.push("cell "+r.rootId); }
    /* WHAT WAS NOT READ, AND WHY, BESIDE WHAT WAS.  2026-09-20. V1DD has no flat cell
       segmentation this tool may index, so the root ID box stays empty there however good the
       coordinate is — and an empty box under "nothing is segmented at that coordinate" reads as a
       fact about the tissue when it is a fact about the dataset. Only the two answers that are
       about a VOLUME rather than about this point are repeated; "nothing segmented there" is
       already the sentence above. */
    /* Only for a box this left EMPTY, 2026-09-21: on βJump the nucleus box is always filled from
       the cell, and "no nucleus volume" after every coordinate would explain nothing. */
    const missed=[];
    if(/no flat cell segmentation|could not be read/.test(r.why||"")&&!rootEl.value.trim())
      missed.push(r.why);
    if(/no nucleus volume|could not be read/.test(r.nucWhy||"")&&!nucEl.value.trim())
      missed.push(r.nucWhy);
    const near=tracingFillCell(pos);
    say.textContent=(bits.length
      ? "At that coordinate: "+bits.join(", ")+" \u2014 filled in below."+(near?" "+near:"")
      : (near||"Nothing is segmented at that coordinate, which is usually why you are tracing it."))
      +(missed.length?" ("+missed.join("; ")+".)":"");
    tracingSuggestType();
  }catch(e){ say.textContent="Could not read the segmentation there: "+String(e&&e.message||e)
                +" "+tracingFillCell(pos); }
}

function wirePad(){
  const cv = document.getElementById("tracePad");
  if (!cv) return;
  document.getElementById("tracePadOpen").addEventListener("click", padOpen);
  document.getElementById("tracePadPrev").addEventListener("click", function(){ padStep(-1); });
  [].slice.call(document.querySelectorAll("#tracePadPan .padpan")).forEach(function(bt){
    bt.addEventListener("click", function(e){
      e.preventDefault(); e.stopPropagation();
      const f = String(bt.dataset.pan).split(",");
      padPan(+f[0], +f[1]);
    });
  });
  document.getElementById("tracePadNext").addEventListener("click", function(){ padStep(1); });
  document.getElementById("tracePadMip").addEventListener("change", function(){
    padDraw();
  });
  document.getElementById("tracePadUndo").addEventListener("click", function(){
    UJ.tracepad.undo(PAD); padPaint(); padRings(); padSay("Undone.");
  });
  document.getElementById("tracePadClose").addEventListener("click", function(){
    document.getElementById("tracePadWrap").style.display = "none";
    draftSave(false); draftRender();      // closing the pad is not losing the work
    /* The panel goes with the pad, and its context is handed back rather than left for the browser
       to reclaim when it runs out. */
    pad3DRelease(); PAD3D_ON = false;
    const h3 = document.getElementById("tracePad3DHost"); if (h3) h3.innerHTML = "";
  });
  /* REMEMBERED, because somebody with a pen display has a pen display every day. Per browser, like
     the theme; it is a preference about the hand doing the drawing, not about the tracing. */
  const pen = document.getElementById("tracePadPen");
  if (pen){
    try { pen.checked = tracingStore().getItem(TRACING_PEN_KEY) === "1"; } catch (_e){}
    pen.addEventListener("change", function(){
      try { tracingStore().setItem(TRACING_PEN_KEY, pen.checked ? "1" : "0"); } catch (_e){}
      padSay(pen.checked
        ? "Freehand on — press and draw all the way round the structure, then lift. Shift+drag "
          + "pans while this is on."
        : "Freehand off — back to a click per vertex, and the first one closes the contour.");
    });
  }
  const ni = document.getElementById("tracePadNewInst");
  if (ni) ni.addEventListener("click", function(){
    if (!PAD) return;
    tracingStoreKindOf(PAD.inst);          // what is in the boxes belongs to the one being left
    const n = UJ.tracepad.newInstance(PAD);
    const col = document.getElementById("tracingColor");
    if (col) col.value = padInstColour(n);
    padPaint(); padRings();
    padSay("Number " + (n + 1) + " started, in its own colour. Same type, same cell — it is "
      + "added as its own structure, with its own number and its own volume.");
  });
  const pd = document.getElementById("tracePadDraft");
  if (pd) pd.addEventListener("click", function(){ draftSave(true); });
  const p3 = document.getElementById("tracePad3D");
  if (p3) p3.addEventListener("click", function(){
    PAD3D_ON = !PAD3D_ON;
    p3.textContent = PAD3D_ON ? "Hide the 3D view" : "Show it in 3D";
    if (PAD3D_ON){ PAD3D_AT = 0; pad3DDraw(); }
    else { pad3DRelease(); const h = pad3DHost(); if (h) h.innerHTML = ""; }
  });
  const pg = document.getElementById("tracePadGhosts");
  if (pg) pg.addEventListener("change", function(){ PAD3D_AT = 0; pad3DDraw(); });
  /* A full redraw rather than a paint on top: the overlay has to be under the captured base (see
     padSegOverlay), and turning it OFF has to get the clean section back, which only a redraw can
     do. The EM chunks are cached, so this is a repaint, not a refetch. */
  const ps = document.getElementById("tracePadSeg");
  if (ps) ps.addEventListener("change", function(){
    padSegSay(ps.checked ? "Reading the segmentation…" : "");
    padDraw();
  });
  padHelpKeys();
  document.getElementById("tracePadUse").addEventListener("click", function(){
    const rings = UJ.tracepad.toRings(PAD);
    const sections = new Set(rings.map(function(r){ return r.z; }));
    if (sections.size < 2){
      padSay("Outline the cell on at least two sections \u2014 a flat outline has no surface to "
        + "close. Step with , and . and go round again.", true);
      return;
    }
    /* THE ID SURVIVES THE PAD. Editing a tracing opened from the dataset and pressing this must
       produce the NEXT VERSION of it, not a rival; PAD_EDIT_ID is set by tracingOpenShared() and
       cleared by padOpen(), so a pad opened fresh carries nothing. */
    TRACING_PENDING = { rings: rings, id: PAD_EDIT_ID || undefined };
    document.getElementById("tracingFound").style.display = "";
    tracingEachRender(true);
    tracingVolShow();
    tracingSay(rings.length + " contour" + (rings.length === 1 ? "" : "s") + " from the pad on "
      + sections.size + " sections. Name it below and keep it.");
    document.getElementById("tracingName").focus();
  });

  /* A DRAG PANS, A CLICK DROPS A VERTEX. One pointer, no modes: anything that moved more than a
     few pixels between down and up was a pan, and a pan must not leave a vertex behind. */
  var down = null, moved = false, dragging = null;
  cv.addEventListener("pointerdown", function(e){
    if (!PAD_VIEW) return;
    /* THE WHOLE CONTOUR, ON A MODIFIER, AND NOT THE SAME ONE ON EVERY MACHINE.  2026-09-17
       Søren: "ctrl+ right click should remove all the connected points in a polyline." On Windows
       that is exactly ctrl+right-click. ON A MAC IT CANNOT BE: ctrl+click IS the secondary click
       there, so every ordinary right-click a Mac user makes arrives with ctrlKey set, and binding
       this to ctrl would delete a contour every time somebody tried to delete a single point. So
       the modifier is Cmd on a Mac and Ctrl everywhere else, and it works with EITHER button --
       Cmd+click makes no context menu, so the left button has to carry it there. */
    if (padErase(e)){ down = null; dragging = null; padEraseAt(e); return; }
    /* LEFT BUTTON ONLY. A right-click fires pointerdown/pointerup like any other, so without this
       every right-click -- the gesture that deletes a point or adds one to a line -- ALSO dropped a
       new vertex where it was clicked. Caught by tracingpanelcheck.js driving real pointer events
       rather than calling the handlers, which is the whole reason it drives them. */
    if (e.button !== 0){ down = null; dragging = null; return; }
    down = [e.offsetX, e.offsetY]; moved = false;
    /* A DRAG THAT STARTS ON A POINT MOVES THE POINT.  2026-09-17
       Søren: "after the segmentation is done, it should be possible to move the polyline points
       individually." Everywhere else on the canvas a drag still pans, and shift+drag always does,
       so nothing is taken away -- but a visible handle that a drag slides past would be a strange
       thing to draw. */
    /* NOT WITH ALT (2026-09-22): alt carries on a contour, and the end of a lifted stroke is a
       vertex -- grabbing it would drag the end instead of drawing from it. */
    if (!e.shiftKey && !e.altKey){
      const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
      dragging = UJ.tracepad.hitVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
    } else dragging = null;
    /* ── A PEN DRAWS.  2026-09-17 ──────────────────────────────────────────────────────────────
       Søren: *"Could we have an option to click and draw the mouse around a structure to mimic
       using a pen to draw, so that you can use a e.g. Kamvas 13 pad or a Apple pen to draw the
       polylines?"*

       A stroke starts here and ends on lifting; core/tracepad.js thins it into an ordinary contour,
       so everything downstream -- editing it, the volume, the preview, the export -- cannot tell it
       from a clicked one.

       THE PRECEDENCE MATTERS. Grabbing a vertex still wins, so a drawn contour can be corrected
       point by point exactly like a clicked one; shift still pans, so the field can be moved
       mid-cell; and the whole-contour remove still wins over both. Only the leftover case -- a
       plain press on empty canvas -- becomes a stroke.

       A PEN TURNS IT ON BY ITSELF, once, and says so. pointerType is the browser telling us a
       stylus is on the glass, and somebody who has just put a pen to a Kamvas is not asking to
       place one vertex. Announced rather than silent, and it is an ordinary tick box afterwards. */
    if (!drawFreehand() && e.pointerType === "pen"){
      const box = document.getElementById("tracePadPen");
      if (box){ box.checked = true;
        try { tracingStore().setItem(TRACING_PEN_KEY, "1"); } catch (_e){}
        padSay("Pen detected — freehand drawing is on. Draw all the way round the structure "
          + "and lift. Untick “draw freehand” to go back to clicking each vertex."); }
    }
    PAD_EXTEND = false;
    if ((drawFreehand() || e.altKey) && !dragging && !e.shiftKey){
      PAD_EXTEND = !!e.altKey;
      const t0 = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
      UJ.tracepad.startStroke(PAD, t0[0], t0[1]);
      padPaint();
    }
    /* Guarded, the way core/mesh3d.js has always guarded its own: capture throws when the pointer
       id is not active -- a synthetic event, a pointer the browser has already released -- and an
       exception thrown HERE would abandon the rest of pointerdown, mid-gesture, for a call whose
       only job is to keep events coming to this canvas. */
    try { cv.setPointerCapture(e.pointerId); } catch (_e){}
  });
  cv.addEventListener("pointermove", function(e){
    PAD_HOVER = PAD_VIEW ? PAD_VIEW.toolAt(e.offsetX, e.offsetY) : null;
    if (down && (Math.abs(e.offsetX - down[0]) > 3 || Math.abs(e.offsetY - down[1]) > 3)) moved = true;
    if (PAD.stroke && PAD_HOVER){
      /* Sampled no finer than two pixels, whatever the zoom: the tolerances are in tool voxels and
         the hand is in pixels, so both are converted through the view rather than guessed. */
      UJ.tracepad.strokePoint(PAD, PAD_HOVER[0], PAD_HOVER[1], padTol(2));
      padPaint();
      return;
    }
    if (dragging && PAD_HOVER){
      UJ.tracepad.moveVertex(PAD, dragging, PAD_HOVER[0], PAD_HOVER[1]);
      padPaint();
      return;
    }
    /* The pointer says what a click is about to do, before it does it. */
    if (!down && PAD_VIEW && PAD_HOVER){
      const k = PAD_VIEW.pxPerToolVoxel;
      const onV = UJ.tracepad.hitVertex(PAD, PAD_HOVER[0], PAD_HOVER[1], k);
      const onE = onV ? null : UJ.tracepad.hitEdge(PAD, PAD_HOVER[0], PAD_HOVER[1], k);
      cv.style.cursor = onV ? "grab" : (onE ? "copy" : "crosshair");
      padPaint();
    }
  });
  cv.addEventListener("pointerup", function(e){
    if (e.button !== 0){ down = null; dragging = null; return; }   // see pointerdown
    if (!PAD_VIEW || !down) return;
    const wasPan = moved;
    const from = down; down = null;
    if (PAD.stroke){
      /* Within about a pixel of where it was drawn. A distance rather than a vertex count, because
         "within a pixel of the line I drew" is a promise about the picture the tracer is looking
         at -- see core/tracepad.js's simplify(). */
      /* ALT: CARRY ON THE CONTOUR IT STARTED ON (2026-09-22). Snapping within 15 px of it. */
      const extend = (PAD_EXTEND || e.altKey) && UJ.tracepad.extendStroke;
      PAD_EXTEND = false;
      const what = extend ? UJ.tracepad.extendStroke(PAD, padTol(1.2), padTol(15))
                          : UJ.tracepad.endStroke(PAD, padTol(1.2));
      PAD_HOVER = null;
      if (what === "extended" || what === "replaced"){
        padPaint(); padRings();
        padSay(what === "extended"
          ? "Contour continued from where the pen left it, and closed again. Alt+draw again to go on; Undo takes this part back."
          : "Contour mended — the stretch between where the stroke began and ended is replaced by it. Undo takes it back.");
        return;
      }
      if (extend && what === "ring"){
        const n0 = PAD.rings[PAD.rings.length - 1].points.length;
        padPaint(); padRings();
        padSay("A new contour, " + n0 + " points — alt+draw continues a contour only when it starts "
          + "on one of this structure’s, on this section.");
        return;
      }
      if (what === "ring"){
        const n = PAD.rings[PAD.rings.length - 1].points.length;
        padPaint(); padRings();
        padSay("Contour drawn — " + n + " points kept from the stroke. Drag any of them to "
          + "correct it, or step a section with , or . and draw the next one.");
        return;
      }
      /* Too short to be a stroke: it was a click, so treat it as one rather than losing it. */
      padPaint();
    }
    if (dragging){
      const wasDrag = moved;
      dragging = null;
      if (wasDrag){ padPaint(); pad3DSoon(); draftSoon();
        /* Named for the machine reading it: "right-click" is not a gesture a Mac trackpad has. */
        padSay("Point moved. " + PAD_RIGHT.charAt(0).toUpperCase() + PAD_RIGHT.slice(1)
        + " a point to delete it, or a line to put a new point in the middle of it."); return; }
      /* Pressed and released on a vertex without moving: not a drag, and not a new vertex either --
         a click there means the first vertex when one is being drawn, and nothing otherwise. */
      if (!PAD.pending.length) return;
    }
    /* SHIFT MOVES THE FIELD.  2026-09-17
       Søren: "it should be possible to move the field around using shift+click." Held down, shift
       means "go there" rather than "put a vertex there": a click recentres on the point, a drag
       pans by it. Explicit, so it works mid-contour -- the vertices are in dataset voxels and do
       not move when the view does, which is the whole reason they are stored that way. */
    if (e.shiftKey){
      if (wasPan){
        const a0 = PAD_VIEW.toolAt(from[0], from[1]), b0 = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
        PAD_CENTRE = [PAD_CENTRE[0] - (b0[0] - a0[0]), PAD_CENTRE[1] - (b0[1] - a0[1]), PAD.z];
      } else {
        const t0 = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
        PAD_CENTRE = [t0[0], t0[1], PAD.z];
      }
      padDraw();
      padSay("Moved to " + PAD_CENTRE[0] + ", " + PAD_CENTRE[1] + ". "
        + (PAD.pending.length ? PAD.pending.length + " vertices still on this contour." : ""));
      return;
    }
    if (wasPan){
      const a = PAD_VIEW.toolAt(from[0], from[1]), b = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
      PAD_CENTRE = [PAD_CENTRE[0] - (b[0] - a[0]), PAD_CENTRE[1] - (b[1] - a[1]), PAD.z];
      padDraw();
      return;
    }
    const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
    const r = UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
    padPaint();
    if (r.closed) padRings();
    padSay(r.closed
      ? UJ.tracepad.count(PAD).rings + " contour(s) \u2014 step a section with , or . and go round again"
      : (PAD.pending.length === 1
          ? "First vertex marked. Click round the cell, then click that ring again to close."
          : PAD.pending.length + " vertices \u2014 click the ring to close"));
  });
  cv.addEventListener("dblclick", function(e){
    if (UJ.tracepad.closeRing(PAD)){ padPaint(); padRings(); padSay("Contour closed."); return; }
    padInsertAt(e);
  });
  /* RIGHT-CLICK: delete the point under the pointer, or put one in the middle of the line under it.
     Søren: "correct if a line in the polyline is placed wrongly" -- which is usually a corner
     wanting one more point, not a point in the wrong place, so the segment is a target too. */
  cv.addEventListener("contextmenu", function(e){
    if (!PAD_VIEW) return;
    e.preventDefault();
    /* Ctrl+right-click on Windows and Linux lands here rather than in pointerdown, which ignores
       every button but the left one. Cmd+right-click on a Mac lands here too. */
    if (padErase(e)){ padEraseAt(e); return; }
    const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
    const k = PAD_VIEW.pxPerToolVoxel;
    const v = UJ.tracepad.hitVertex(PAD, t[0], t[1], k);
    if (v){
      const what = UJ.tracepad.deleteVertex(PAD, v);
      padPaint(); padRings();
      padSay(what === "ring"
        ? "That took the contour under three points, so the contour went with it."
        : "Point deleted.");
      return;
    }
    padInsertAt(e);
  });
  /* The gesture list is written once for both platforms and named at runtime, so nobody reads an
     instruction for a key their keyboard does not have -- and so the page SAYS which machine it
     thinks it is on, which is the cheap way to find out it guessed wrong. */
  function padHelpKeys(){
    [].slice.call(document.querySelectorAll("#tracePadHelp .padmod"))
      .forEach(function(el){ el.textContent = PAD_MOD; });
    [].slice.call(document.querySelectorAll("#tracePadHelp .padright"))
      .forEach(function(el){ el.textContent = PAD_RIGHT; });
    const mac = document.getElementById("padHelpMac");
    if (mac) mac.textContent = PAD_MAC
      ? "Read as a Mac: \u201cright-click\u201d above means ctrl+click or a two-finger click, and "
        + "the whole-contour remove is \u2318 Cmd \u2014 not ctrl, because ctrl+click is already "
        + "your right-click."
      : "Read as a PC. On a Mac the whole-contour remove is \u2318 Cmd instead of Ctrl, because "
        + "ctrl+click is already the right-click there.";
  }

  /* Which modifier means "take the whole thing", by platform. Read from the event rather than
     stored, so a page opened on one machine and a keyboard swapped under it still agrees. */
  function padErase(e){ return PAD_MAC ? e.metaKey : e.ctrlKey; }
  function drawFreehand(){
    const box = document.getElementById("tracePadPen");
    return !!(box && box.checked);
  }
  /* Pixels to tool voxels, through the view. Every tolerance in the pen path is a distance ON
     SCREEN -- that is what the hand controls -- and the contour is stored in dataset voxels, so
     zooming in has to make the thinning finer in voxels to stay the same in pixels. */
  function padTol(px){
    const k = (PAD_VIEW && PAD_VIEW.pxPerToolVoxel) || 1;
    return px / (k || 1);
  }
  function padEraseAt(e){
    if (!PAD_VIEW || !PAD) return;
    const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
    const k = PAD_VIEW.pxPerToolVoxel;
    /* A point of it or a line of it: either is a way of pointing at the contour you mean, and
       asking somebody to hit a vertex exactly when the whole thing is about to go is pedantry. */
    const hit = UJ.tracepad.hitVertex(PAD, t[0], t[1], k)
             || UJ.tracepad.hitEdge(PAD, t[0], t[1], k);
    if (!hit){
      padSay(PAD_MOD + "+click a point or a line of the contour you want to remove \u2014 there is "
        + "nothing under the pointer.", true);
      return;
    }
    const pending = hit.ring < 0;
    UJ.tracepad.deleteRing(PAD, hit.ring);
    padPaint(); padRings();
    padSay(pending
      ? "The contour you were drawing is gone. Undo cannot bring it back \u2014 start it again."
      : "Contour removed, all of it. " + UJ.tracepad.count(PAD).rings + " left.");
  }
  function padInsertAt(e){
    if (!PAD_VIEW) return;
    const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
    const edge = UJ.tracepad.hitEdge(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
    if (!edge){ padSay("Nothing there to correct \u2014 " + PAD_RIGHT + " a point to delete it, or "
      + "a line to put a new point in it. " + PAD_MOD + "+click removes a whole contour.",
      true); return; }
    UJ.tracepad.insertVertex(PAD, edge, t[0], t[1]);
    padPaint(); padRings();
    padSay("Point added to that line \u2014 drag it where it belongs.");
  }
  /* , and . step a section, the same keys Neuroglancer uses, but only while the pad is on screen
     and nothing is being typed into. */
  document.addEventListener("keydown", function(e){
    const wrap = document.getElementById("tracePadWrap");
    if (!wrap || wrap.style.display === "none") return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
    if (e.key === ","){ padStep(-1); e.preventDefault(); }
    else if (e.key === "."){ padStep(1); e.preventDefault(); }
    else if (e.key === "Enter"){ if (UJ.tracepad.closeRing(PAD)){ padPaint(); padSay("Contour closed."); } }
    else if (e.key === "Escape"){ PAD.pending = []; padPaint(); padSay("Contour abandoned."); }
  });
}

function wireTracing(){
  const sel=document.getElementById("tracingType");
  if(!sel)return;
  /* The same cell names the identification tree offers, so a traced astrocyte is the same word as
     a detected one and lands in the same Blender collection. */
  const names=(typeof LEAF_NAMES!=="undefined")?Object.keys(LEAF_NAMES).map(function(k){
    return {v:LEAF_NAMES[k],l:LEAF_NAMES[k]};}):[];
  names.sort(function(a,b){return a.l<b.l?-1:1;});
  sel.innerHTML='<option value="traced">(no cell type)</option>'
    +names.map(function(n){return '<option value="'+escHtml(n.v)+'">'+escHtml(n.l)+'</option>';}).join("");
  /* THE SAME LIST THE ORGANELLE CARD USES.  2026-09-17
     Søren: "Instead of free text, we need it to have a dropdown to select an organelle type like
     the list we have for identification of organelles." optionsHtml() is that list, <optgroup> by
     <optgroup>. The two whole-object answers go above it because they are not organelles and are
     the commonest reason to trace anything; "something else" goes last, and is the only door to a
     text box, because a kind that has to be typed is one the ontology is missing. */
  const what=document.getElementById("tracingWhat");
  if(what){
    what.innerHTML='<optgroup label="The cell itself">'
      +'<option value="__cell">Whole cell \u2014 the cell\u2019s own mesh</option>'
      +'<option value="__nucleus">Nucleus</option></optgroup>'
      +((typeof ORGANELLE_KIND_OPTIONS_HTML!=="undefined")
          ? ORGANELLE_KIND_OPTIONS_HTML : UJ.organelles.optionsHtml())
      +'<optgroup label="Not on the list"><option value="__other">Something else \u2014 type the name</option></optgroup>';
    what.value="__cell";
    what.addEventListener("change",function(){
      document.getElementById("tracingNameRow").style.display=(what.value==="__other")?"":"none";
      if(what.value==="__other")document.getElementById("tracingName").focus();
      /* This box is the SHARED one, and with the list on it is not even on screen -- see
         tracingEachRender(). The strip still has to redraw, because with the list off every chip
         shows this type. */
      padInstances();
    });
  }
  /* The option, and the two directions it creates. Seeding on the way in is what makes turning it
     on safe: every structure starts as what they all were. */
  const each=document.getElementById("tracingEachOwn");
  if(each)each.addEventListener("change",function(){
    if(each.checked)tracingSeedKinds();
    tracingEachRender(true);
    padInstances();padRings();
    padSay(each.checked
      ?"One row per number now — each with its own colour, type and name. They all start as "
       +"what they already were, and they are still added in one press."
      :"Back to one type for all of them.");
  });
  TRACINGS_KEPT=tracingRead();
  tracingRenderList();
  document.getElementById("tracingRead").addEventListener("click",function(){
    try{tracingReadLink();}catch(e){tracingSay(String(e&&e.message||e),true);}
  });
  /* WHAT CHANGES THE PICTURE, REDRAWS IT.  2026-09-19. The ghosts tick is the one that costs
     something -- it fetches the cell's mesh -- so it is the one that has to be a tick rather than a
     default. The two id boxes feed those same fetches (pad3DIds), and the colour is the surface's
     own colour, so all four belong here. pad3DSoon() coalesces, which matters for the id boxes:
     they are typed into a digit at a time. */
  ["tracingPasteGhosts","tracingNucId","tracingRootId"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("change",function(){pad3DSoon();});
  });
  /* The card's own colour has one more thing to do than the rest: it is the structure's colour
     while there is only one, so it has to reach the swatch in the layer list and the palette the
     preview reads, not just trigger a redraw. */
  const oneCol=document.getElementById("tracingColor");
  if(oneCol)oneCol.addEventListener("input",function(){
    tracingColourSync(true); tracingLayersRender(); pad3DSoon();
  });
  const openBtn=document.getElementById("tracingOpen");
  if(openBtn)openBtn.addEventListener("click",tracingOpen);
  /* The structures as they stand in the naming block -- names, colours and numbers included, since
     tracingCurrentAll() is what the Add button submits. Looking at what you are ABOUT to add is
     worth more than looking at it afterwards. */
  const viewBtn=document.getElementById("tracingViewer");
  if(viewBtn)viewBtn.addEventListener("click",function(){
    let all=[];
    try{all=tracingCurrentAll();}catch(e){all=[];}
    /* tracingCurrentAll() refuses (and says why) when something has no type yet. Looking is not
       submitting, so fall back to the raw contours rather than making a person name a structure
       before they are allowed to see it. */
    if(!all.length&&TRACING_PENDING&&(TRACING_PENDING.rings||[]).length){
      const byInst={},order=[];
      TRACING_PENDING.rings.forEach(function(r){
        const k=r.inst||0;
        if(!byInst[k]){byInst[k]=[];order.push(k);}
        byInst[k].push({z:r.z,points:r.points});
      });
      order.sort(function(a,b){return a-b;});
      all=order.map(function(k){
        return {name:(tracingKindFor(k).name||("Structure "+(k+1))),
                color:padInstColour(k),rings:byInst[k]};
      });
    }
    tracingViewerOpen(all, null, {
      nuc: (document.getElementById("tracingNucId").value || "").trim(),
      root: (document.getElementById("tracingRootId").value || "").trim() });
  });
  /* The same paste-splitter the main coordinate box has, so "240640, 207872, 21360" copied out of
     Neuroglancer's own readout lands in three fields. */
  const tx=document.getElementById("tracingX");
  if(tx)tx.addEventListener("input",function(e){
    const p=String(e.target.value||"").split(/[\s,]+/).filter(function(s){return s!=="";});
    if(p.length>=3){e.target.value=p[0];
      document.getElementById("tracingY").value=p[1];
      document.getElementById("tracingZ").value=p[2];}
  });
  /* Pre-filled from the cell on screen, so pasting "x, y, z" over them meant clearing them
     first. Søren: "when you click the first coordinate it should mark it so pasting is easy." */
  ["tracingX","tracingY","tracingZ","tracingNucId","tracingRootId"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("focus",function(){try{el.select();}catch(_e){}});
  });
  /* Typing an id in by hand suggests the type too -- the ids are not only ever filled by the
     coordinate read, and somebody who knows the cell should not have to open the pad to get it. */
  ["tracingNucId","tracingRootId"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("change",tracingSuggestType);
  });
  /* Everything you fill in is part of the draft: a resumed tracing that had forgotten which cell it
     was of would have to be identified twice. */
  ["tracingWhat","tracingName","tracingType","tracingColor","tracingNucId","tracingRootId","tracingCellAt"]
    .forEach(function(id){
      const el=document.getElementById(id);
      if(el)el.addEventListener("change",function(){ if(PAD)draftSoon(); });
    });
  const nameBox=document.getElementById("tracingName");
  if(nameBox)nameBox.addEventListener("change",function(){
    if(PAD){tracingStoreKindOf(PAD.inst);padInstances();}
  });
  draftRender();
  const typeSel=document.getElementById("tracingType");
  if(typeSel)typeSel.addEventListener("change",function(){TRACING_TYPE_TOUCHED=true;});
  /* The picker is a choice about the structure being drawn, not about the tracing: with several on
     the pad, "the colour" is not a thing there is one of. */
  const colSel=document.getElementById("tracingColor");
  if(colSel)colSel.addEventListener("input",function(){
    if(!PAD)return;
    PAD_INST_COLOUR[String(PAD.inst||0)]=colSel.value;
    padPaint();padRings();
  });
  const tPanel=document.getElementById("tracingPanel");
  if(tPanel)tPanel.addEventListener("toggle",tracingFillPos);
  tracingFillPos();
  document.getElementById("tracingKeep").addEventListener("click",tracingKeep);
  /* THERE IS NO SHARE BUTTON ANY MORE. Søren, 2026-09-17: "I think sharing should not be an option,
     the meshes made should always be a part of the dataset." tracingKeep() does both halves. */
  const browse=document.getElementById("tracingBrowse");
  if(browse)browse.addEventListener("click",function(){tracingBrowse();});
  /* Anything left over from a session that ended signed out goes up as soon as one appears. */
  if(tracingPendingCount())tracingFlushSoon();
}

/* ── THE CARD'S OWN MARKUP ────────────────────────────────  2026-09-20
   Read out of ujump.html and emitted mechanically by src/tracingcard_stage_c_markup.py — not
   retyped. 196 lines of HTML with single quotes, double quotes, entities, inline styles and forty
   title="..." tooltips is the kind of thing a transcription gets 99% right, and the 1% is a
   tooltip that quietly loses a quote and swallows the next attribute.

   A LINE ARRAY, not one long string, so a diff of this file reads line-for-line against the markup
   it came from. Not a template literal: there is no backtick and no ${} in here today, and the
   first one somebody added would be a syntax error in a file they were not editing.

   The WRAPPER is not here. `<div class="card" id="tracingCard">` stays in the host page, because
   where the card sits is the page's decision and what is inside it is this module's. */
function tracingCardHtml(){
  return [
    "<details id=\"tracingPanel\">",
    "<summary style=\"cursor:pointer;font-weight:600\">Trace a cell or organelle &mdash; outline it, and it joins the dataset</summary>",
    "<p class=\"hint\" style=\"margin-top:8px\">" + tracingIntro() + " The button below opens <b>Spelunker</b> with its <b>polyline</b> tool already armed &mdash; no viewer has a button for that tool, so the link arms it. Click each vertex round the cell, click the first one again to close the ring, then step a section with <b>,</b> or <b>.</b> and go round again. Paste the whole address bar back here. (Spelunker rather than the viewer picked at the top of the Jump tab: that choice is for viewing and sharing, and Spelunker is the only one with a polyline.) Three vertices to a section, two sections minimum; tracing every fifth section comes out about half a percent off the real volume, every fortieth about eleven.</p>",
    "<label style=\"margin-top:10px\">Where to open it <span style=\"font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px\">&mdash; voxels, the same as the coordinate box at the top of this tab</span></label>",
    "<div class=\"row\"><div class=\"coord\"><input type=\"text\" id=\"tracingX\" inputmode=\"decimal\" placeholder=\"x\"></div><div class=\"coord\"><input type=\"text\" id=\"tracingY\" inputmode=\"decimal\" placeholder=\"y\"></div><div class=\"coord\"><input type=\"text\" id=\"tracingZ\" inputmode=\"decimal\" placeholder=\"z\"></div></div>",
    "<p class=\"hint\" style=\"margin-top:4px\">Or paste <code>x, y, z</code> into the x field &mdash; it splits automatically. Filled in from the cell you look up, and kept in step with it until you type a coordinate of your own.</p>",
    "<p class=\"hint\" id=\"tracingPosSay\" style=\"margin-top:4px\"></p>",
    "<div class=\"row\" style=\"gap:8px;margin-top:8px\">",
    "<button class=\"idbtn\" id=\"tracePadOpen\" style=\"flex:1 1 auto\" title=\"Draws the EM section here and gives you a real polygon tool: click each vertex, click the first one again to close. No viewer a link can reach has one.\">Trace it here &mdash; polygon tool</button>",
    "<button class=\"idbtn\" id=\"tracingOpen\" style=\"flex:1 1 auto\" title=\"Opens Spelunker at the coordinate in the boxes above, with an empty annotation layer called &quot;tracing&quot; already selected and its POLYLINE tool already armed &mdash; no viewer has a button for that tool. Spelunker rather than the viewer picked at the top of the Jump tab: that choice is for viewing and sharing, and Spelunker is the only viewer with a polyline to draw with.\">Open a viewer instead</button>",
    "</div>",
    "<div id=\"tracePadWrap\" style=\"display:none;margin-top:10px\">",
    "<div class=\"row\" style=\"gap:8px;align-items:center;flex-wrap:wrap\">",
    "<select id=\"tracePadMip\" style=\"flex:0 0 auto\" title=\"How much of the section is on the pad. Above 8 nm the number is the data&rsquo;s own resolution; below it the 8 nm voxels are simply drawn larger, which is what putting vertices on a 500 nm organelle needs. Only levels that keep 40 nm sections are used &mdash; coarser ones average several sections into one, and a tracing is section by section. The widest view is also the slowest to load: its chunks are half as wide, so it costs about three times as many (measured 2026-09-17).\">",
    "<option value=\"2:1\">18 &micro;m across &mdash; 32 nm data, slower to load</option>",
    "<option value=\"1:1\" selected>9 &micro;m &mdash; 16 nm data, a whole cell</option>",
    "<option value=\"0:1\">4.5 &micro;m &mdash; 8 nm data, full detail</option>",
    "<option value=\"0:2\">2.2 &micro;m &mdash; 8 nm data, drawn 2&times;</option>",
    "<option value=\"0:4\">1.1 &micro;m &mdash; 8 nm data, drawn 4&times;</option>",
    "<option value=\"0:8\">0.6 &micro;m &mdash; 8 nm data, drawn 8&times; (an organelle)</option>",
    "</select>",
    "<button class=\"idbtn\" id=\"tracePadPrev\" style=\"flex:0 0 auto\" title=\"Back one step (, key)\">&#9664;</button>",
    "<span class=\"hint\" id=\"tracePadZ\" style=\"flex:0 0 auto;min-width:130px;text-align:center\">&nbsp;</span>",
    "<button class=\"idbtn\" id=\"tracePadNext\" style=\"flex:0 0 auto\" title=\"On one step (. key)\">&#9654;</button>",
    "<div class=\"coord\" style=\"flex:0 0 84px\" title=\"How many sections a step moves. Every fifth section is about half a percent off the real volume.\"><input type=\"text\" id=\"tracePadStep\" inputmode=\"numeric\" value=\"5\"></div>",
    "<button class=\"idbtn\" id=\"tracePadUndo\" style=\"flex:0 0 auto\" title=\"Takes back the last vertex, or the last closed contour if you have not started one\">Undo</button>",
    "<label style=\"font-size:12px;display:flex;align-items:center;gap:6px;flex:0 0 auto\" title=\"Press and draw all the way round the structure, then lift — the way you would with a pen on paper. Made for a pen display or a tablet, and it works with a mouse held down. The stroke is thinned to a contour you can still edit point by point. With this on, a plain drag DRAWS, so shift+drag is how you pan. Lifted too early? Hold alt (option on a Mac) and draw on from where it stopped.\"><input type=\"checkbox\" id=\"tracePadPen\"> draw freehand (pen)</label>",
    "<!-- THE SEGMENTATION, UNDER THE CONTOURS.  2026-09-17. Søren: \"There should be an option to show",
    "     the segmentation of the root ID and the nucleus ID of the cell in the EM window.\" Off by",
    "     default: it is a second volume to fetch, and a cell the segmentation does not have -- which is",
    "     what this pad was built for -- has nothing to show. -->",
    "<label style=\"font-size:12px;display:flex;align-items:center;gap:6px;flex:0 0 auto\" title=\"Paints this cell's own segmentation over the section: the root ID in magenta and the nucleus ID in blue, from the same volumes Neuroglancer paints. It shows where the automatic segmentation thinks the boundary is, so you can see whether you are correcting it, extending it, or drawing something it never saw. Costs a second fetch, so it is off until you ask.\"><input type=\"checkbox\" id=\"tracePadSeg\"> show the segmentation</label>",
    "<!-- ITS OWN LINE, NOT THE STATUS LINE.  2026-09-18. Søren: \"I got this error message, and the",
    "     segmentation would not load.\" The error was about a volume save, and the shared status line is",
    "     written over by whatever happens next -- so whatever the overlay had said about itself was gone",
    "     before he could read it. What the segmentation did belongs beside its own tick. -->",
    "<span class=\"hint\" id=\"tracePadSegSay\" style=\"flex:1 1 100%\"></span>",
    "</div>",
    "<div style=\"position:relative;margin-top:8px;overflow:auto;border:1px solid var(--line);border-radius:7px;background:#111\">",
    "<canvas id=\"tracePad\" width=\"560\" height=\"460\" style=\"display:block;cursor:crosshair;touch-action:none\"></canvas>",
    "<!-- FOUR BUTTONS THAT MOVE THE PICTURE.  2026-09-21. Søren: \"we need to have some buttons to move the",
    "     image up, down, left or right. It should move half a screen every time... Then you can also",
    "     navigate around using a phone or tablet.\" Over the picture, in its corner, because on a phone",
    "     the toolbar above wraps out of sight. -->",
    "<div id=\"tracePadPan\" style=\"position:absolute;right:8px;bottom:8px;display:grid;grid-template-columns:repeat(3,38px);grid-template-rows:repeat(3,38px);gap:3px;opacity:.9\">",
    "<span></span>",
    "<button type=\"button\" class=\"padpan\" data-pan=\"0,-0.5\" style=\"padding:0;width:38px;height:38px;font-size:16px;line-height:1;border-radius:7px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.4);cursor:pointer\" title=\"Move the picture half a screen up\" aria-label=\"Move up\">&#9650;</button>",
    "<span></span>",
    "<button type=\"button\" class=\"padpan\" data-pan=\"-0.5,0\" style=\"padding:0;width:38px;height:38px;font-size:16px;line-height:1;border-radius:7px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.4);cursor:pointer\" title=\"Move the picture half a screen left\" aria-label=\"Move left\">&#9664;</button>",
    "<span></span>",
    "<button type=\"button\" class=\"padpan\" data-pan=\"0.5,0\" style=\"padding:0;width:38px;height:38px;font-size:16px;line-height:1;border-radius:7px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.4);cursor:pointer\" title=\"Move the picture half a screen right\" aria-label=\"Move right\">&#9654;</button>",
    "<span></span>",
    "<button type=\"button\" class=\"padpan\" data-pan=\"0,0.5\" style=\"padding:0;width:38px;height:38px;font-size:16px;line-height:1;border-radius:7px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.4);cursor:pointer\" title=\"Move the picture half a screen down\" aria-label=\"Move down\">&#9660;</button>",
    "<span></span>",
    "</div>",
    "</div>",
    "<!-- SEVERAL OF THE SAME THING.  2026-09-17. Søren: \"I want the option to draw more than one",
    "     organelle of the same type, the extra added organelles should have different colors.\" Under",
    "     the canvas, beside the contour chips, because it is the same kind of control: what is on this",
    "     pad, and which of it you are working on. -->",
    "<div class=\"row\" style=\"gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap\">",
    "<span class=\"hint\" style=\"flex:0 0 auto\">Drawing:</span>",
    "<span id=\"tracePadInsts\" style=\"display:flex;gap:6px;flex-wrap:wrap;flex:1 1 auto\"></span>",
    "<button class=\"idbtn\" id=\"tracePadNewInst\" style=\"flex:0 0 auto;padding:2px 9px;font-size:12px\" title=\"Start another organelle of the same type. It gets its own colour here and its own number when it is added to the dataset, so several mitochondria in one cell stay apart. Everything else — the type, the cell, the ids — is shared.\">+ another one</button>",
    "</div>",
    "<div id=\"tracePadRings\" style=\"margin-top:6px\"></div>",
    "<p class=\"hint\" id=\"tracePadVol\" style=\"margin-top:4px\" title=\"Cavalieri's estimator: each section's outlined area times the slab of tissue that section stands for. A contour drawn inside another is a hole, the same rule the export fills with. It updates as you draw.\"></p>",
    "<p class=\"hint\" id=\"tracePadSay\" style=\"margin-top:6px\">Click each vertex round the cell. The first one is drawn as a ring &mdash; click it again to close the contour. <b>Shift+click</b> moves the field there, shift+drag or a plain drag pans it, and <b>,</b> and <b>.</b> step a section.</p>",
    "<!-- EVERY GESTURE, IN ONE PLACE.  2026-09-17. Søren: \"make a list of all the possible commands with",
    "     an explanation of what they do.\" The status line above is written over by the next thing that",
    "     happens, so it cannot be the reference; this can. The modifier names are filled in at runtime",
    "     (padHelpKeys) because they are not the same on a Mac -- see PAD_MAC. -->",
    "<details id=\"tracePadHelp\" style=\"margin-top:6px\">",
    "<summary style=\"cursor:pointer;font-size:12px;color:var(--mut)\">Every gesture the pad understands</summary>",
    "<table style=\"width:100%;border-collapse:collapse;font-size:12px;margin-top:6px\">",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>click</b></td><td style=\"padding:3px 0\">Put a vertex down. The first one is drawn as an open ring.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>draw freehand</b> (the tick box)</td><td style=\"padding:3px 0\">Press, go all the way round the structure, lift &mdash; one stroke, the way a pen works. Made for a pen display (Kamvas, iPad) and fine with a mouse held down. The stroke is thinned to a handful of points you can still drag, delete and add to; a pen switches this on by itself the first time it touches the pad. While it is on, a plain drag DRAWS, so <b>shift+drag</b> is how you pan.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>alt+draw</b> (option on a Mac)</td><td style=\"padding:3px 0\">Carries on a contour. Lifted the pen too early? Hold alt and draw on from where it stopped: the closing line across the gap goes and the new stroke goes in. End the stroke on the contour and it replaces the stretch between its two ends instead &mdash; redrawing a part that went wrong. Undo takes back just that part. A pen button set to alt in the tablet&rsquo;s driver does the same.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>click the first ring</b></td><td style=\"padding:3px 0\">Close the contour. Three vertices minimum &mdash; under that a &ldquo;close&rdquo; is a mis-click, and it is ignored.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>Enter</b></td><td style=\"padding:3px 0\">Closes it too, for anyone who expects that.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>Esc</b></td><td style=\"padding:3px 0\">Abandon the contour being drawn. Closed ones are untouched.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>drag a point</b></td><td style=\"padding:3px 0\">Move that vertex. Works on a closed contour as well as the one in progress.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b class=\"padright\">right-click</b> a point</td><td style=\"padding:3px 0\">Delete that one vertex. If it takes the contour under three points the contour goes with it, and you are told so.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b class=\"padright\">right-click</b> or <b>double-click</b> a line</td><td style=\"padding:3px 0\">Put a new vertex in the middle of that segment &mdash; then drag it where it belongs. This is what a corner that bulges usually needs.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b class=\"padmod\">Ctrl</b>+click a contour</td><td style=\"padding:3px 0\">Remove the <b>whole</b> contour &mdash; every connected point of it. Point at any vertex or any line of it; either button.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>shift+click</b></td><td style=\"padding:3px 0\">Centre the view there. Safe mid-contour: vertices are stored in dataset voxels, so moving the view never moves one.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>drag</b>, or <b>shift+drag</b></td><td style=\"padding:3px 0\">Pan. A drag that moved more than a few pixels never leaves a vertex behind.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>,</b> and <b>.</b></td><td style=\"padding:3px 0\">Step a section back and on &mdash; the same two keys Neuroglancer uses. By the number in the step box; every fifth section is about half a percent off the real volume.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>&#9664;</b> <b>&#9654;</b></td><td style=\"padding:3px 0\">The same, for a mouse. A half-drawn contour belongs to its own section and is dropped when you step.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>Undo</b></td><td style=\"padding:3px 0\">The last vertex mid-contour; the last contour <i>on this section</i> between them. Never one from a section you cannot see.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>the chips</b> (1 &middot; 9 points &times;)</td><td style=\"padding:3px 0\">One per contour on this section, in the colour of the organelle it belongs to. Click one to delete that contour.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>+ another one</b></td><td style=\"padding:3px 0\">Start a second organelle of the same type in the same cell &mdash; a cell has forty mitochondria, not one. Each gets its own colour here and its own number when added (Mitochondrion 1, 2, 3&hellip;), and they are added as separate structures with separate volumes. Click a colour in the <b>Drawing:</b> strip to go back to one of them.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>name each one separately</b></td><td style=\"padding:3px 0\">Appears once there are two. Off (the usual case) they are all the same type. On, each carries its own: click a number in the <b>Drawing:</b> strip and the type box becomes that one's &mdash; so one pass over a cell can log a mitochondrion, a lysosome and two vesicles. They are still added in one press, and each is numbered within its own type.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>the &micro;m dropdown</b></td><td style=\"padding:3px 0\">How much of the section is on the pad. Below 8 nm the voxels are drawn larger rather than finer &mdash; the label says which. The widest view is the slowest to load.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>Show it in 3D</b></td><td style=\"padding:3px 0\">The shape so far, rebuilt after every contour. <span id=\"tracePadHelpGhosts\">With the checkbox, the cell&rsquo;s own mesh and the nucleus are drawn see-through around it.</span> Drag to turn, scroll to zoom.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>Use these contours</b></td><td style=\"padding:3px 0\">Hand them to the fields below, where you say what it is and add it to the dataset. Two sections minimum &mdash; a flat outline has no surface to close.</td></tr>",
    "</table>",
    "<p class=\"hint\" id=\"padHelpMac\" style=\"margin-top:4px\"></p>",
    "</details>",
    "<div class=\"row\" style=\"gap:8px;margin-top:6px\">",
    "<button class=\"idbtn\" id=\"tracePadUse\" style=\"flex:1 1 auto\">Use these contours</button>",
    "<button class=\"idbtn\" id=\"tracePadDraft\" style=\"flex:0 0 auto\" title=\"Keeps everything as it stands — the contours, the section you are on, the view, and whatever you have filled in below — in this browser, so you can close the page and carry on later. It saves itself as you go; this is the button for making sure.\">Save draft</button>",
    "<button class=\"idbtn\" id=\"tracePadClose\" style=\"flex:0 0 auto\">Close the pad</button>",
    "</div>",
    "<!-- THE SHAPE, WHILE IT IS STILL BEING MADE.  2026-09-17. Søren: \"there should also be a window",
    "     below to show the 3D structure while it is being generated, so the user can get a view of what",
    "     it looks like. Preferably also with the nucleus and root ID meshes as transparent. Perhaps this",
    "     should be an option, rather than it loading immediately if it is slow to load.\" Behind a",
    "     button for exactly that reason: the tracing itself lofts in a millisecond, but a whole cell's",
    "     mesh is megabytes and nobody should pay for it per contour. Once open it follows every closed",
    "     contour. -->",
    "<div class=\"row\" style=\"gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap\">",
    "<button class=\"idbtn\" id=\"tracePad3D\" style=\"flex:1 1 auto\" title=\"Lofts the contours you have drawn into a surface and draws it here. Not the export's surface -- that one is built by filling each section and running marching cubes, and it is smoother; this is the same silhouette, now.\">Show it in 3D</button>",
    "<label style=\"font-size:12px;display:flex;align-items:center;gap:6px;flex:0 0 auto\" title=\"Fetches the cell's own mesh for the root ID and the nucleus mesh for the nucleus ID, and draws both see-through around your tracing, so you can see where it sits. Megabytes for a whole neuron, which is why it is a choice.\"><input type=\"checkbox\" id=\"tracePadGhosts\" checked> with the cell and nucleus, see-through</label>",
    "</div>",
    "<div id=\"tracePad3DHost\" style=\"margin-top:6px\"></div>",
    "</div>",
    "<!-- BELOW THE PAD, NOT ABOVE IT.  2026-09-17. This bar appears by itself, a second or so after the",
    "     first contour is closed, and anything that appears ABOVE the canvas pushes the canvas down",
    "     under a pointer that is in the middle of drawing on it. Caught by tracingpanelcheck.js, whose",
    "     click coordinates went stale the moment the bar arrived -- which is the same thing happening to",
    "     a person, one click at a time. -->",
    "<div id=\"tracingDraftBar\" style=\"display:none;margin-top:8px;font-size:12px\"></div>",
    "<p class=\"hint\" style=\"margin-top:6px\"><b>Spelunker has a polyline tool, and it is the best route here.</b> Pick <i>Annotate polyline</i>, click round the cell, click the first vertex to close it, then copy the link &mdash; the whole contour arrives as one shape. (This card said the opposite until 2026-09-18: the polyline was measured as never reaching the link, which was wrong. A polyline only enters the link once it is <i>finished</i>, which is the likeliest way that measurement came back empty.) The MICrONS viewer still offers only point, bounding box, line and ellipsoid, so there a ring of <b>points</b> &mdash; one click per vertex, read back in the order you clicked them &mdash; or a ring of <b>line</b> annotations at two clicks a segment is the way. All three are read.</p>",
    "<label style=\"margin-top:10px\">Neuroglancer link</label>",
    "<textarea id=\"tracingLink\" placeholder=\"Paste the whole address bar, with your contours on it.\"></textarea>",
    "<div class=\"row\" style=\"gap:8px;margin-top:8px\">",
    "<div class=\"coord\" style=\"flex:1 1 auto\"><input type=\"text\" id=\"tracingLayer\" placeholder=\"Annotation layer name (optional)\" title=\"Which annotation layer to read. Leave it empty and it does the right thing on its own: a layer called &quot;tracing&quot; (what the button above makes) wins if the link has one, and the Cortical layers bands are never read as contours.\"></div>",
    "<button class=\"idbtn\" id=\"tracingRead\" style=\"flex:0 0 auto\">Read the contours</button>",
    "</div>",
    "<p class=\"hint\" id=\"tracingStatus\"></p>",
    "<div id=\"tracingFound\" style=\"display:none;margin-top:8px\">",
    "<!-- ONE ROW PER ANNOTATION LAYER.  2026-09-19. Søren: \"If there is more than one annotation channel",
    "     in the neuroglancer link, it should be suggested that there are more than one organelle, and",
    "     the user can then deselect tracings if they are not supposed to be there.\" Hidden when the link",
    "     had one layer, because a list of one is not a choice. -->",
    "<div id=\"tracingLayers\" style=\"display:none;margin-bottom:10px\"></div>",
    "<label style=\"margin-top:4px\" id=\"tracingWhatLabel\">What did you outline?</label>",
    "<div class=\"row\" id=\"tracingWhatRow\" style=\"gap:8px\">",
    "<select id=\"tracingWhat\" style=\"flex:2 1 auto;min-width:0\" title=\"The same ontology the organelle card and the filter use, so a traced lysosome is the same thing as a reported one. The whole cell and its nucleus are at the top because they are what you outline when the segmentation has missed a cell, and they are not organelles.\"></select>",
    "<div class=\"coord\" style=\"flex:0 0 120px\"><input type=\"color\" id=\"tracingColor\" value=\"#3a6b5a\" style=\"width:100%;height:38px;padding:2px\"></div>",
    "</div>",
    "<!-- ONE TYPE FOR ALL OF THEM, UNLESS YOU SAY OTHERWISE.  2026-09-17. Søren: \"I would like an",
    "     option to identify the organelles identities individually, so standard is that they are all the",
    "     same, but if you click a button you can identify them individually.\" Hidden until there are two",
    "     to tell apart, because until then it is a question about nothing. -->",
    "<label id=\"tracingEachRow\" style=\"font-size:12px;display:none;align-items:center;gap:6px;margin-top:6px\" title=\"Off, everything you draw here is the same type — the usual case, several mitochondria in one cell. On, the box above is replaced by one row per drawing number, each with its own colour, type and name. They are still one press to add, and they are still numbered within their own type.\">",
    "<input type=\"checkbox\" id=\"tracingEachOwn\"> name each one separately",
    "</label>",
    "<!-- ONE ROW PER DRAWING NUMBER.  2026-09-17. Søren: \"The name each one separately I thought would",
    "     give me an option to name each one, so that there would be one naming for each drawing",
    "     number.\" See tracingEachRender(). -->",
    "<div id=\"tracingEachList\" style=\"display:none;margin-top:4px\"></div>",
    "<div class=\"row\" id=\"tracingNameRow\" style=\"gap:8px;margin-top:8px;display:none\">",
    "<div class=\"coord\" style=\"flex:1 1 auto\"><input type=\"text\" id=\"tracingName\" placeholder=\"Name it &mdash; and tell me, so it can go on the list\"></div>",
    "</div>",
    "<label style=\"margin-top:10px\">Which cell is it part of?</label>",
    "<div class=\"row\" style=\"gap:8px\">",
    "<select id=\"tracingType\" style=\"flex:2 1 auto;min-width:0\" title=\"The cell type this structure belongs to. It becomes the collection the object lands in when the Blender scene is built. Suggested from the nucleus or root ID below, by the same precedence the rest of the tool uses: verified, then community-reported, then the MICrONS prediction.\"></select>",
    "</div>",
    "<p class=\"hint\" id=\"tracingTypeSay\" style=\"margin-top:4px\"></p>",
    "<!-- LABELS, NOT PLACEHOLDERS.  2026-09-17. Søren: \"Here it says nucleus ID but it is a root",
    "     ID.\" It did: these two sat side by side with the nucleus box EMPTY and showing its",
    "     placeholder, and the root box FILLED and therefore showing nothing at all -- so the only",
    "     words on the row named the wrong box. A placeholder is a hint about what to type; it is",
    "     never a name for what is there. -->",
    "<div class=\"row\" style=\"gap:8px;margin-top:8px\">",
    "<div style=\"flex:1 1 auto;min-width:0\">",
    "<label style=\"margin:0 0 4px\">Nucleus ID</label>",
    "<div class=\"coord\"><input type=\"text\" id=\"tracingNucId\" inputmode=\"numeric\" placeholder=\"none at this coordinate\"></div>",
    "</div>",
    "<div style=\"flex:1 1 auto;min-width:0\">",
    "<label style=\"margin:0 0 4px\">Root ID &mdash; the cell</label>",
    "<div class=\"coord\"><input type=\"text\" id=\"tracingRootId\" inputmode=\"numeric\" placeholder=\"none at this coordinate\"></div>",
    "</div>",
    "</div>",
    "<!-- A CELL IS ALSO A PLACE.  2026-09-21. Søren: \"we also need to associate the organelles with",
    "     the cell centroid coordinates and not just the nucleus IDs and root IDs\". Filled with the",
    "     nearest nucleus's centre; editable, because a cell somebody has just added is where they say. -->",
    "<div style=\"margin-top:8px\">",
    "<label style=\"margin:0 0 4px\">Cell centre &mdash; x, y, z in voxels</label>",
    "<div class=\"coord\"><input type=\"text\" id=\"tracingCellAt\" placeholder=\"the centre of its nucleus, e.g. 102016, 21037, 763\"></div>",
    "</div>",
    "<p class=\"hint\" id=\"tracingAtSay\" style=\"margin-top:4px\"></p>",
    "<p class=\"hint\" id=\"tracingVolSay\" style=\"margin-top:4px\"></p>",
    "<!-- THE SHAPE, BEFORE IT IS COMMITTED.  2026-09-19. Søren: \"the neuroglancer link paste function",
    "     needs to have a 3D rendering also, so you can see the 3D mesh before committing.\" The pad has",
    "     had this since 2026-09-17, and pad3DRings() has ALWAYS fallen back to a pasted tracing -- but",
    "     the button, the tick and the canvas all live inside #tracePadWrap, which is display:none",
    "     unless the pad is open, so on this route the feature existed and could not be reached.",
    "     It draws itself rather than waiting for a button: the loft is a millisecond. The ghosts are",
    "     the megabytes, so they are the tick, and it starts off here. -->",
    "<label style=\"font-size:12px;display:flex;align-items:center;gap:6px;margin-top:8px\" title=\"Fetches the cell&#39;s own mesh for the root ID and the nucleus mesh for the nucleus ID, and draws both see-through around your tracing, so you can see where it sits. Megabytes for a whole neuron, which is why it is a choice.\"><input type=\"checkbox\" id=\"tracingPasteGhosts\"> with the cell and nucleus, see-through</label>",
    "<div id=\"tracingPaste3DHost\" style=\"margin-top:6px\"></div>",
    "<!-- ONE BUTTON, BECAUSE SHARING IS NOT A CHOICE.  2026-09-17. Søren: \"I think sharing should not",
    "     be an option, the meshes made should always be a part of the dataset and everybody should be",
    "     able to use it.\" There were two buttons here, Keep and Share, and the second one was the half",
    "     that needed a sign-in -- which meant the ordinary path was to press the first and leave the",
    "     work on one laptop. Now finishing a tracing does both. Signed out it is still kept, and it",
    "     goes up on its own the moment you sign in; see tracingFlush() for why that is a queue rather",
    "     than a refusal. -->",
    "<div class=\"row\" style=\"gap:8px;margin-top:10px\">",
    "<button class=\"idbtn\" id=\"tracingKeep\" style=\"flex:1 1 auto\" title=\"Adds this tracing to the shared dataset, where anyone can use it and anyone can extend it, and keeps it in this page's own 3D export. Needs a Google sign-in to be attributed — without one it waits here until you sign in.\">Add it to the dataset &mdash; and to your 3D export</button>",
    "<button class=\"idbtn\" id=\"tracingViewer\" style=\"flex:0 0 auto\" title=\"Opens the viewer chosen at the top of the Jump tab with these contours on it — one annotation layer per structure, in its own colour, each contour a closed loop of lines. Edit them there and paste the address bar back into the box above to read them in again.\">Look at it in Neuroglancer</button>",
    "</div>",
    "</div>",
    "<div id=\"tracingList\" style=\"margin-top:12px\"></div>",
    "<!-- THE DATASET'S TRACINGS, TO ADD TO.  2026-09-17. Søren: \"other people should be able to add to",
    "     it or edit it.\" Reading them back is what makes that possible at all: the index costs one",
    "     sheet scan and opens no files, and only the tracing you choose to open is fetched. -->",
    "<div style=\"margin-top:12px;border-top:1px solid var(--line);padding-top:10px\">",
    "<div class=\"row\" style=\"gap:8px\">",
    "<button class=\"idbtn\" id=\"tracingBrowse\" style=\"flex:1 1 auto\" title=\"Every tracing anyone has added, newest version first. Open one and its contours come into the pad, where you can extend it onto more sections or correct a contour; adding it again is its next version, with your name added to its contributors and nothing of the old one deleted.\">Show the tracings in the dataset</button>",
    "</div>",
    "<div id=\"tracingShared\" style=\"margin-top:8px\"></div>",
    "</div>",
    "</details>"
  ].join("\n");
}

/* ── WHERE THE TWO WIRING PASSES ARE CALLED FROM ─────────────────────  2026-09-20
   wirePad and wireTracing were IIFEs, run where they sat at the bottom of ujump.html's body. From
   a <script src> in the head they would run before the body exists — and since both guard on
   finding their element, they would return quietly and the pad would be dead with nothing in the
   console to say so. That is the one failure this extraction could have made invisible.

   IDEMPOTENT ON PURPOSE. µJump has the card in its markup and is wired once, on DOMContentLoaded.
   A tool that BUILDS the card when a panel opens calls UJ.tracingcard.wire() again afterwards, and
   two sets of listeners on one button is a button that fires twice. */
/* ── A CONTROL THE DATASET CANNOT HONOUR IS REMOVED, NOT DISABLED ──────  2026-09-20
   The card is one piece of markup now shared by five datasets, and two of its ticks need volumes
   only some of them have:

     #tracePadSeg     paints this cell's own segmentation under the contours. It needs a
                      segmentation. Lee16 is image only, and tracingSources().seg is "".
     #tracePadGhosts  fetches the cell mesh and the nucleus mesh and draws them see-through around
                      the tracing. It needs meshes. λJump says it has none by having no
                      UJ.cfg.mesh at all, which is a statement in its config, not an omission.

   THE GHOST TICK IS TWO TICKS AND A SENTENCE, which the first version of this missed and the
   check caught: #tracingPasteGhosts is the same control on the pasted-contours side of the card,
   and the help table has a line describing both. Removing one of three leaves a page that offers
   the feature twice and explains it once.

   REMOVED RATHER THAN DISABLED, because a greyed tick is a promise that it will work later and a
   tooltip nobody opens is the only place the truth could live. What a dataset does not have is
   not offered. µJump has both volumes and keeps both ticks.

   THE LABEL GOES, NOT JUST THE INPUT. Each tick is an <input> inside its own <label>; removing
   only the input would leave the words "show the segmentation" with nothing to tick.

   ONLY ON MARKUP THIS MODULE BUILT. mount() calls this in the branch that filled an empty
   wrapper, so a page carrying its own copy of the card keeps every control it wrote. */
/* Show the segmentation tick when the volume open now has a segmentation; hide AND untick it
   when it has not, so a hidden tick can never keep asking for a volume that is not there. */
function padSegTickSync(){
  var box = document.getElementById("tracePadSeg");
  if (!box) return;
  var seg = "";
  try { seg = tracingSources().seg || ""; } catch (_e){ seg = ""; }
  var lab = (box.closest && box.closest("label")) || box;
  var say = document.getElementById("tracePadSegSay");
  lab.style.display = seg ? "" : "none";
  if (say) say.style.display = seg ? "" : "none";
  if (!seg) box.checked = false;
}
function padTrimForHost(el){
  el = el || document.getElementById("tracingCard") || document;
  var gone = [];
  function drop(id, alsoId){
    var n = el.querySelector("#" + id);
    if (!n) return;
    var lab = (n.closest && n.closest("label")) || n;
    if (lab.parentNode) lab.parentNode.removeChild(lab);
    gone.push(id);
    if (alsoId){
      var s = el.querySelector("#" + alsoId);
      if (s && s.parentNode){ s.parentNode.removeChild(s); gone.push(alsoId); }
    }
  }
  var seg = "";
  try { seg = tracingSources().seg || ""; } catch (_e){ seg = ""; }
  /* A TOOL WHOSE VOLUME CHANGES (scope(), ωJump) keeps the tick and hides it: the next volume may
     have a segmentation, and datasetChanged() shows it again. 2026-09-21, found live. */
  if (!seg && tracingCfg().scope) padSegTickSync();
  else if (!seg) drop("tracePadSeg", "tracePadSegSay");   // its own status line goes with it
  var mesh = null;
  try { mesh = (UJ && UJ.cfg && UJ.cfg.mesh) || null; } catch (_e){ mesh = null; }
  if (!(mesh && (mesh.meshBase || mesh.meshBaseAlt))){
    drop("tracePadGhosts");        // beside the pad's own 3D window
    drop("tracingPasteGhosts");    // the same control on the pasted-contours side
    drop("tracePadHelpGhosts");    // and the line in the help table that describes them
  }
  return gone;
}

/* ── THE ZOOM MENU SAYS WHAT THIS VOLUME ACTUALLY IS ────────────  2026-09-20
   Each option's value is "mip:zoom" and its text begins with a width in µm and the data's own
   resolution in nm — "18 µm across — 32 nm data". Both numbers were typed for minnie65, whose
   finest scale is 8 nm. Lee16's finest is 4 nm, so mip 2 there is 16 nm and half as wide, and the
   menu was describing a volume the pad was not drawing.

   Computed from core/emtiles.js's own scale list rather than tabulated per tool:

       width µm = canvas px × (nm per voxel at this mip) ÷ zoom ÷ 1000

   µJump's six labels come out of this BYTE-IDENTICAL to the ones a person typed in 2026-09-17,
   which is the evidence that the arithmetic is the same arithmetic and not a second opinion.

   Only the head is rewritten. The tails — "a whole cell", "full detail", "drawn 2×" — say what
   the level is FOR, and that is true of any volume. The one exception is ", slower to load" on the
   widest option: see below, it is a fact about chunk geometry and is checked rather than kept.

   Silent when emtiles cannot answer. A menu with minnie65's numbers on it is wrong; a page that
   refuses to open the pad because a label could not be computed is worse. */
async function padRelabelMips(){
  var sel = document.getElementById("tracePadMip");
  if (!sel || typeof UJ === "undefined" || !UJ.emtiles) return false;
  try { if (!UJ.emtiles.configured()) UJ.emtiles.configure(tracingSources()); } catch (_e){}
  try { if (!UJ.emtiles.configured()) return false; } catch (_e){ return false; }
  /* THE CANVAS'S OWN WIDTH, which is the number of voxels drawn across it. At mount that is the
     560 the markup carries, because the pad is display:none and has nothing to measure; after the
     first draw it is what the pad actually used, and padOpen calls this again then. The six
     hand-written labels this reproduces were written for 560, so before a draw the menu says what
     they said and after one it says what is on screen. */
  /* ── AS FAR AS THE VOLUME GOES ─────────────────────────────────────────────  2026-09-21
     Søren, on ηJump: "Things are just bigger in the human, so the maximum 12 µm across is too
     small". The six fixed levels stop at mip 2, which is minnie65's 32 nm and H01's 16. Every
     coarser level that still keeps one section (or a slab, where the host allows slabs) goes on
     top. See src/the_pad_reaches_the_coarsest_section.py. */
  try {
    var s0 = await UJ.emtiles.scaleAt(0, tracingSlabOk());
    var nLv = (s0 && s0.count) || 0, topMip = 0;
    for (var k = 0; k < sel.options.length; k++){
      var mk = parseInt(String(sel.options[k].value).split(":")[0], 10) || 0;
      if (mk > topMip) topMip = mk;
    }
    for (var m = topMip + 1; m < nLv; m++){
      var v = m + ":1";
      if ([].some.call(sel.options, function(o){ return o.value === v; })) continue;
      var sm = await UJ.emtiles.scaleAt(m, tracingSlabOk());
      if (!sm || !sm.scale || (sm.slab > 1 && !tracingSlabOk())) break;
      /* Only while the widest view is under 15 µm (at the menu's 560 px): H01's was 9, which is
         a third of a human pyramidal soma. µJump's, δJump's and λJump's already reach 18-22 µm and
         stay as they were; a 290 µm pad would be a map, not a place to trace. */
      var widest = 0;
      for (var q = 0; q < sel.options.length; q++){
        var pq = String(sel.options[q].value).split(":"), sq = await UJ.emtiles.scaleAt(parseInt(pq[0], 10) || 0, tracingSlabOk());
        if (sq && sq.scale) widest = Math.max(widest, 560 * sq.scale.resolution[0] / (parseFloat(pq[1]) || 1) / 1000);
      }
      if (widest >= 15) break;
      var op = document.createElement("option");
      op.value = v; op.textContent = "0 \u00b5m across \u2014 0 nm data";
      sel.insertBefore(op, sel.options[0]);
      /* ", slower to load" was a claim about minnie65's widest level; it is not the widest now. */
      [].forEach.call(sel.options, function(o){ o.textContent = o.textContent.replace(/, slower to load$/, ""); });
    }
    /* ── HALF SIZE ──────────────────────────────────────────────────────────  2026-09-22
       Søren, from a phone: "This is still too small to segment the cell, we need a larger view
       also". The widest level drawn at half size -- each 2x2 block of voxels one pixel, their
       mean -- wherever the widest view at 560 px is under 30 µm, which is every volume here.
       See src/the_pad_can_draw_half_size.py. */
    var wMip = 0;
    [].forEach.call(sel.options, function(o){
      var pp = String(o.value).split(":");
      if (parseFloat(pp[1] || 1) >= 1) wMip = Math.max(wMip, parseInt(pp[0], 10) || 0);
    });
    var hv = wMip + ":0.5";
    if (![].some.call(sel.options, function(o){ return o.value === hv; })){
      var sw = await UJ.emtiles.scaleAt(wMip, tracingSlabOk());
      if (sw && sw.scale && 560 * sw.scale.resolution[0] / 1000 < 30){
        var oh = document.createElement("option");
        oh.value = hv; oh.textContent = "0 \u00b5m across \u2014 0 nm data, drawn half size";
        oh.title = "Twice as much tissue: each pixel is the mean of 2\u00d72 voxels. Four times the chunks on the first draw.";
        sel.insertBefore(oh, sel.options[0]);
      }
    }
  } catch (_e){}
  var cv = document.getElementById("tracePad");
  var w = (cv && cv.width) || 560;
  var chunk0 = 0, chunk1 = 0, wide0 = -1;
  for (var i = 0; i < sel.options.length; i++){
    var o = sel.options[i], parts = String(o.value).split(":");
    var mip = parseInt(parts[0], 10) || 0, zoom = parseFloat(parts[1]) > 0 ? parseFloat(parts[1]) : 1;
    var got;
    try { got = await UJ.emtiles.scaleAt(mip, tracingSlabOk()); } catch (_e){ return false; }
    if (!got || !got.scale) return false;
    var nm = +got.scale.resolution[0].toFixed(2), um = w * got.scale.resolution[0] / zoom / 1000;
    /* 18, 9, 4.5, 2.2, 1.1, 0.6 — whole numbers stay whole, the rest keep one decimal, which is
       exactly how the hand-written labels were written. */
    var head = (um >= 10 ? Math.round(um) : Math.round(um * 10) / 10) + " \u00b5m"
             + (i === 0 ? " across" : "") + " \u2014 " + nm + " nm data"
             + (got.slab > 1 ? " (" + got.slab + "-section slab)" : "");
    o.textContent = o.textContent.replace(
      /* [\d.]+ FOR THE NANOMETRES TOO. `\d+` matches minnie65's 16 and 32 and Lee16's 4 and 8,
         and not V1DD's 19.4 — so on V1DD this replaced once, put a decimal into the string, and
         then never matched again. A relabel that runs on every draw has to be idempotent. */
      /^[\d.]+ \u00b5m( across)? \u2014 [\d.]+ nm data( \(\d+-section slab\))?/, head);
    try {
      var cs = got.scale.chunk_sizes && got.scale.chunk_sizes[0];
      /* The first two levels drawn 1:1 or closer -- not the half-size one on top, which is the
         same mip as the next and would make every volume look evenly chunked. */
      if (zoom >= 1){
        if (wide0 < 0){ wide0 = i; chunk0 = (cs && cs[0]) || 0; }
        else if (!chunk1) chunk1 = (cs && cs[0]) || 0;
      }
    } catch (_e){}
  }
  /* ", slower to load" IS A minnie65 FACT, AND IT IS CHECKED.
     There it is true: at 32 nm the chunks are 64 px wide where at 16 nm they are 128, so the
     widest view costs about three times as many fetches. Lee16 chunks 512 px at every scale, so
     its widest view is no slower than the next one and the warning would be a lie. */
  if (wide0 >= 0 && chunk0 && chunk1 && chunk0 >= chunk1)
    sel.options[wide0].textContent =
      sel.options[wide0].textContent.replace(/, slower to load$/, "");
  return true;
}

/* ── WHAT THE TWO ID BOXES ARE CALLED HERE ─────────────────────────  2026-09-21
   UJ.cfg.tracing.idLabels = {nuc, root, nucNumeric, rootNumeric}. On χJump the first box holds a
   cell's key -- "cb2/htem/pc_0", not a number -- and the second a fragment. */
function tracingLabelIds(el){
  var L = null;
  try { L = UJ.cfg.tracing.idLabels; } catch (_e){ L = null; }
  if (!L) return;
  [["tracingNucId", L.nuc, L.nucNumeric], ["tracingRootId", L.root, L.rootNumeric]].forEach(function(t){
    var inp = el.querySelector("#" + t[0]);
    if (!inp) return;
    var lab = inp.parentNode && inp.parentNode.parentNode ? inp.parentNode.parentNode.querySelector("label") : null;
    if (t[1] && lab) lab.innerHTML = t[1];
    if (t[2] === false) inp.removeAttribute("inputmode");
  });
}
UJ.tracingcard = UJ.tracingcard || {};
/* ── FILL THE WRAPPER, THEN WIRE WHAT WAS FILLED ───────────────────  2026-09-20
   A host supplies an empty `<div class="card" id="tracingCard"></div>` wherever the card belongs
   in its layout, and this puts the card in it.

   IT WILL NOT OVERWRITE A WRAPPER THAT ALREADY HAS SOMETHING IN IT. A page still carrying its own
   copy of the markup keeps it — the module wires what is there instead of replacing it underneath
   somebody who has edited it. */
UJ.tracingcard.mount = function(el){
  el = el || document.getElementById("tracingCard");
  if (el && !el.firstElementChild) {
    try { el.innerHTML = tracingCardHtml(); }
    catch (e){ try { console.warn("tracingcard: mount", e); } catch (_c){} return false; }
    /* Only what this module built is trimmed — see padTrimForHost's header. */
    try { padTrimForHost(el); } catch (_e){}
    try { tracingLabelIds(el); } catch (_e){}
  }
  var ok = UJ.tracingcard.wire();
  /* AFTER wiring, and not awaited. The menu's listener is already on by then, so a relabel cannot
     race it, and the first scale fetch must not hold up a card that is otherwise ready. */
  try { padRelabelMips(); } catch (_e){}
  return ok;
};
/* ── THE VOLUME CHANGES UNDER THE CARD (ωJump's menu) ───────────────  2026-09-21
   Two calls, in order: datasetChanging() while the OLD volume is still what scope() returns -- the
   pad closes and its work is saved as a draft under that volume's key -- then, once the host has
   switched, datasetChanged(), which points the readers at the new volume and reads its lists. */
UJ.tracingcard.datasetChanging = function(){
  try {
    var wrap = document.getElementById("tracePadWrap");
    if (wrap && wrap.style.display !== "none"){
      var close = document.getElementById("tracePadClose");
      if (close) close.click();
    }
  } catch (_e){}
  return true;
};
UJ.tracingcard.datasetChanged = function(){
  PAD = null; PAD_VIEW = null; PAD_CENTRE = null;
  TRACING_DRAFT_ID = "";
  ["tracingNucId", "tracingRootId", "tracingCellAt", "tracingX", "tracingY", "tracingZ"].forEach(function(id){
    var e = document.getElementById(id); if (e) e.value = "";
  });
  try { TRACING_POS_AUTO = ""; } catch (_e){}
  var src = tracingSources();
  try { UJ.emtiles.configure(src); } catch (_e){}
  try { if (src.seg || src.nuc) UJ.segread.configure(src); } catch (_e){}
  try { if (UJ.segpaint && (src.seg || src.nuc)) UJ.segpaint.configure(src); } catch (_e){}
  TRACING_SHARED = []; TRACING_INDEX_AT = 0; DRAFT_SERVER = []; DRAFT_SERVER_AT = 0;
  try { tracingRenderList(); } catch (_e){}
  try { draftRender(); } catch (_e){}
  try { tracingIndexSoon(); } catch (_e){}
  try { draftServerSoon(true); } catch (_e){}
  try { padRelabelMips(); } catch (_e){}
  try { padSegTickSync(); } catch (_e){}
  return true;
};
UJ.tracingcard.wire = function(){
  if (UJ.tracingcard._wired) return false;
  var padEl = document.getElementById("tracePad"),
      typeEl = document.getElementById("tracingType");
  if (!padEl && !typeEl) return false;        // the card is not on the page (yet)
  UJ.tracingcard._wired = true;
  try { wirePad(); } catch (e){ try { console.warn("tracingcard: wirePad", e); } catch (_c){} }
  try { wireTracing(); } catch (e){ try { console.warn("tracingcard: wireTracing", e); } catch (_c){} }
  return true;
};
if (typeof document !== "undefined"){
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function(){ UJ.tracingcard.mount(); });
  else UJ.tracingcard.mount();
}
