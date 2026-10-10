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
  /* ── AND THE DECODERS THE PAD HAS BEEN ASKED TO USE ────────────────────────  2026-10-03
     Empty on every volume whose levels the browser can already read, which is all but one of the
     sixty-eight this family offers. See tracingDecoders() and the tick beside the pad. */
  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res,
           skipScales: o.skipScales || [], decoders: o.decoders || tracingDecoders(),
           segInfo: o.segInfo || "", nucInfo: o.nucInfo || "",
           segOffsetNm: o.segOffsetNm || null, nucOffsetNm: o.nucOffsetNm || null,
           u16: o.u16 || null };
}
/* ── A DECODER THE PAGE WENT AND FETCHED ─────────────────────────────────────  2026-10-03
   Eyewire II's retina publishes 16, 32 and 64 nm as JPEG XL, which Chrome cannot read, so without
   this the pad opens at the volume's 128 nm jpeg level and a lysosome is four pixels across.

   NULL UNTIL THE TICK IS TICKED AND THE DECODER IS UP, both of them. Null means core/emtiles.js
   drops those levels, which is exactly right while there is nothing to decode them with — a menu
   offering 16 nm before the worker has booted would draw noise or nothing.

   THE BUFFER IS COPIED, and this is the expensive mistake not to make. core/segread.js caches a
   chunk's ArrayBuffer by URL and range and core/emtiles.js caches the decoded plane in a WeakMap
   keyed on that same buffer; transferring it to the worker DETACHES it, so the next read of that
   chunk -- the one the cache exists to make free -- would get zero bytes. A quarter of a megabyte
   of copy against a 45 ms decode is not a trade worth thinking about twice. */
var PAD_FINE = false;
function tracingDecoders(){
  try {
    if (!PAD_FINE) return null;
    if (!(window.UJ && UJ.jxl && UJ.jxl.ready())) return null;
    return { jxl: function(buf){ return UJ.jxl.decode(buf.slice(0)); } };
  } catch (_e){ return null; }
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
   in memory for the life of the page. See src/the_card_can_keep_nothing_in_the_browser.py.

   AND IT EXISTED TWICE, verbatim, fifteen lines apart, under a comment calling itself THE ONE
   STORE. Harmless by luck -- the declarations hoist and the two copies were identical -- and
   exactly the shape of fault this file keeps paying for. 2026-10-04. */
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
  /* ── INDEXEDDB, THROUGH A SYNCHRONOUS MIRROR ─────────────────────────────────  2026-10-05
     core/kvstore.js. The ceiling that cost Søren two hours was localStorage's few megabytes,
     shared by every tool on the origin; IndexedDB is granted against free disk. It answers
     getItem/setItem/removeItem exactly as localStorage does, so the sixteen call sites below did
     not change -- and it REFUSES to write until it has hydrated, because an empty mirror written
     back over real work would be a worse bug than the one this fixes.

     Until it has hydrated, this still answers localStorage: a page that reads in that window gets
     the old copy rather than nothing, and tracingInit() waits on ready() before its first read so
     that window is normally empty. */
  if (window.UJ && UJ.kv && UJ.kv.hydrated()) return UJ.kv;
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
/* ── ONE DEFINITION OF "THE SAME CELL" ────────────────────────  2026-10-06
   Søren: *"the nucleus and rootID are useless, because the vasculature segmentation is crap.
   Therefor I am tracing those myself and reporting what cell is there... a coordinate for the cell
   center, that is what defines the cell and not the faulty rootID or nucleus ID."*

   THE ORDER IS HIS: coordinate, then nucleus, then root. A reported centre is a person saying "this
   is a cell and it is here"; a nucleus id is the segmentation's claim; a root id in vasculature can
   cover a hundred cells at once.

   EXACT, on his instruction. Two reported centres 3.7 µm apart are two cells, not one re-reported
   slightly differently — asked directly, he chose "group on the exact coordinate". So the only
   normalising here is whitespace and rounding, which is formatting rather than tolerance: the box
   shows "427087, 220193, 1940" and the sheet stores "427087,220193,1940", and those are one place.

   THERE WAS ONE OF THESE FOR EVERY CALLER. The same `nuc || root` test, with no coordinate in it at
   all, was written out in tracingBareOf, twice in tracingNextIndex and once in tracingCurrentAll —
   which is why a second cell's first centriole came back named "Centriole / centrosome 2". Five
   copies of one decision is how a rule gets fixed in one place and stays broken in four. */
/* ── DELEGATES, SINCE 2026-10-07 ────────────────────────────
   These three were written here on the 6th, and core/panel.js and core/blenderexport.js went on
   carrying their own `nuc || root` tests because this file is not where they look. The definition
   moved to core/tracing.js, which all three load; these keep their names so every call site in this
   file reads as it did. */
function tracingCoordKey(v){ return UJ.tracing.coordKey(v); }
/* A row from any of the three shapes this card holds cells in: the sheet's camelCase, the kept
   list's snake_case, and the card's own boxes. */
function tracingCellOf(x){ return UJ.tracing.cellOf(x); }
function tracingSameCell(a, b){ return UJ.tracing.sameCell(a, b); }
/* ── AND THE KEY EVERY "BY CELL" LIST GROUPS ON ───────────────  2026-10-06
   This read nucleus, then root, then coordinate — so Søren's four structures, reported at
   427087, 220193, 1940, were filed into cell 394673650's panel on the strength of a nucleus id the
   segmentation had got wrong, and the coordinate he had reported on purpose was never reached. */
function tracingCellKeyOf(nuc, root, coord){
  nuc = String(nuc || ""); root = String(root || "");
  var at = tracingCoordKey(coord);
  return at ? "c:" + at : (nuc ? "n:" + nuc : (root ? "r:" + root : ""));
}
/* The cell's own line: its type, its nucleus, its root, how many. */
function tracingCellHead(nuc, root, type, n, coord){
  /* THE PLACE FIRST, since 2026-10-06: it is what the group is keyed on, so it is what tells two
     cells apart in a list. The ids follow as what the segmentation claims. */
  const bits = [];
  if (type && type !== "traced") bits.push("<b>" + escHtml(type) + "</b>");
  if (coord) bits.push("cell at " + escHtml(tracingCoordShow(coord)));
  if (nuc) bits.push("nucleus " + escHtml(nuc));
  if (root) bits.push("root " + escHtml(root));
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
  tracingThinWire(); tracingThinShow();
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
  try { tracingIdClear(); } catch (_e){}    // an offer about a tracing that is no longer pending
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
  /* JOINED ENDS, SAID OUT LOUD (2026-09-22). Line annotations drawn by hand do not meet
     exactly; the reader joins ends within a third of a segment and keeps one vertex where there
     were two. That is a change to his drawing, so it is reported rather than done quietly. */
  const fromWhat={points:"from "+r.seen.points+" points",
                  lines:"from "+r.seen.lines+" line annotations"
                       +(r.seen.joined?", "+r.seen.joined+" nearly-meeting ends joined into one "
                         +"vertex each":""),
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
  tracingThinWire(); tracingThinShow();
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
/* The vessel name box, which only a vascular kind asks for. "" when empty or absent. */
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
  if (ves) return { kind: ves.kind, name: String(typed || "").trim() || ves.label };
  /* The label from whichever vocabulary this page carries -- see tracingWhat()'s own note. */
  const k=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined")?ORGANELLE_KIND_BY_VALUE[v]:null;
  return {kind:v,name:(k&&k.label)||UJ.organelles.labelOf(v)};
}

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
  if (box) box.placeholder = ves.label + " \u2014 name it to join its segments (optional)";
  if (list) list.innerHTML = tracingVesselNames(ves.kind).map(function(n){
    return '<option value="' + escHtml(n) + '"></option>'; }).join("");
  /* Its own colour, unless the person has already chosen one for this structure. */
  var col = document.getElementById("tracingColor");
  if (col && !col.dataset.chosen) col.value = ves.color;
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
  {
    const ves=(window.UJ&&UJ.tracing&&UJ.tracing.vesselOf)?UJ.tracing.vesselOf(v):null;
    if(ves)return {kind:ves.kind,name:tracingVesselName()||ves.label};
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
/* ── AND WHETHER IT IS IN THE DATASET AT ALL ──────────────────────────────────  2026-09-27
   Søren: "Lysosome 1 of my tracing is renamed to lysosome 5 and is now version 3 even though I
   have not touched it, I have only opened it in the pad and traced other organelles."

   A structure saved while it was the only one of its kind carries NO instance_index — `several` is
   false, so the name is bare and no number is submitted. TRACING_EDIT_INDEX then holds 0 for it,
   the TRACING_SHARED scan wants `> 0`, and the numbering read 0 as "new" and handed it the next
   free number. Zero was doing two jobs. This map does the other one.

   TRACING_EDIT_SIG is the second half: the fingerprint of what the DATASET holds, so an untouched
   re-add of something opened from there can be refused the way an untouched re-add of something
   kept here already is. tracingKeep carried shared_sig from TRACINGS_KEPT, and a tracing opened
   from the dataset is not in TRACINGS_KEPT — so nothing had anything to compare.
   See src/opening_an_organelle_is_not_changing_it.py. */
var TRACING_EDIT_KNOWN = {}, TRACING_EDIT_SIG = {};
/* In the dataset, whatever number it carries — including none. */
function tracingIsPublished(structureId){
  var id = String(structureId || "");
  if (!id) return false;
  if (TRACING_EDIT_KNOWN[id]) return true;
  var found = false;
  (TRACING_SHARED || []).forEach(function(t){
    if (t && String(t.structureId || "") === id) found = true;
  });
  return found;
}
/* What the dataset's copy of a structure would sign as, so an unchanged re-add matches it. Built
   through the same toSubmission the publish path uses, with the same normalisers — tracingScoped
   for the nucleus id, and the rings rounded the way the pad rounds them when it opens one. */
function tracingSigOfShared(st){
  try {
    if (!st || !st.rings || !st.rings.length) return "";
    var rings = st.rings.map(function(r){
      return { z: Math.round(r.z), ringIndex: r.ringIndex,
               points: (r.points || []).map(function(p){
                 return [Math.round(p[0]), Math.round(p[1])]; }) };
    });
    var sub = UJ.tracing.toSubmission(rings, {
      structureId: st.structureId, name: st.name, kind: st.kind || "",
      cellType: st.cellType, color: st.color,
      nucleusId: tracingScoped(st.nucleusId || ""), rootId: st.rootId || "",
      cellCoord: st.cellCoord || "",
      instanceIndex: st.instanceIndex, instanceOf: st.instanceOf });
    return tracingShareSig(sub);
  } catch (_e){ return ""; }
}
/* One place both openers record what they have just opened, so they cannot do it differently. */
function tracingNoteOpened(st, sid){
  var id = String((st && st.structureId) || sid || "");
  if (!id) return;
  TRACING_EDIT_KNOWN[id] = 1;
  TRACING_EDIT_INDEX[id] = Math.round(Number(st && st.instanceIndex) || 0);
  var sig = tracingSigOfShared(st);
  if (sig) TRACING_EDIT_SIG[id] = sig;
}
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
/* ── WHICH KINDS CARRY A NUMBER ───────────────────────────────────────────────  2026-09-27
   A cell has one whole cell and one nucleus, so a number on those is noise. Under `other` the user
   typed the name and it is the identifier they chose. Every ontology organelle kind can occur many
   times on one cell, and the number is how they are told apart — so it is always given, from the
   first one. See src/a_cells_organelles_of_a_kind_are_numbered.py. */
/* ── WHAT MAKES A SERIES ───────────────────────────────  2026-10-08
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
function tracingKindNumbered(kind){
  var k = String(kind || "");
  return !!k && k !== "cell" && k !== "nucleus" && k !== "other";
}
/* ── THE ONE ALLOCATOR ────────────────────────────────────────────────────────  2026-09-27
   This cell's structures of this kind that carry NO number, oldest first, each paired with the
   number it is owed — the lowest that no numbered sibling already has.

   Asked by BOTH consumers: the card, for a bare structure that happens to be open on the pad, and
   tracingNumberBare, for the ones that are not. Two allocators would hand the same number to two
   structures, which is the mistake the last four days were made of. */
function tracingBareOf(kind, label, nuc, root, at){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  if (!tracingKindNumbered(wantK)) return [];
  var here = tracingCellOf({ nucleusId: nuc, rootId: root, cellCoord: at });
  var bare = [], taken = {};
  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");
    var same = (k === wantK) && (!tracingSeriesIsNamed(wantK)
                                 || tracingSeriesLabel(t.name) === wantL);
    var sameCell = tracingSeriesIgnoresCell(wantK)
                 || tracingSameCell(tracingCellOf(t), here);
    if (!same || !sameCell) return;
    var n = Math.round(Number(t.instanceIndex) || 0);
    if (n > 0) taken[n] = 1; else bare.push(t);
  });
  /* Oldest first, so 1 is the one that was drawn first and the numbering is stable. */
  bare.sort(function(a, b){
    return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
  });
  var out = [], n = 1;
  bare.forEach(function(row){
    while (taken[n]) n++;
    out.push({ row: row, index: n }); taken[n] = 1;
  });
  return out;
}
/* The number a bare published structure is owed, or 0 if it is not one. */
function tracingBareNumberFor(id, kind, label, nuc, root, at){
  var list = tracingBareOf(kind, label, nuc, root, at), want = String(id || "");
  for (var i = 0; i < list.length; i++)
    if (String(list[i].row.structureId || "") === want) return list[i].index;
  return 0;
}
/* `skip` is the ids on the pad. A structure is not its own sibling: a re-add is in TRACINGS_KEPT
   already, so without this it counted itself and a lone hand-named structure came back "second
   tracing 2". Found by tracingpanelcheck.js; see src/numbering_does_not_count_itself.py. */
function tracingNextIndex(kind, label, nuc, root, skip, at){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  var here = tracingCellOf({ nucleusId: nuc, rootId: root, cellCoord: at });
  var top = 0, have = 0, seen = {};
  (skip || []).forEach(function(id){ if (id) seen[String(id)] = 1; });
  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");
    /* THE KIND IS THE SERIES, except for the one kind that is not a kind. "Something else" files
       everything under "other", so two unrelated hand-named structures on one cell would number
       each other if the kind alone decided it -- a hand-named "Dense body" would come back as
       "Myelin figure 2". Under `other`, the NAME is the series. */
    var same = (k === wantK) && (!tracingSeriesIsNamed(wantK)
                                 || tracingSeriesLabel(t.name) === wantL);
    var sameCell = tracingSeriesIgnoresCell(wantK)
                 || tracingSameCell(tracingCellOf(t), here);
    if (same && sameCell){
      if (seen[String(t.structureId || "")]) return;      // on the pad: counted by the caller
      have++;
      seen[String(t.structureId || "")] = 1;
      if (Number(t.instanceIndex) > top) top = Number(t.instanceIndex);
    }
  });
  /* ── HOW MANY IT HAS, NOT THE HIGHEST IT CARRIES ──────────────────────────────  2026-09-27
     This returned top+1, and a structure saved on its own submits no instanceIndex at all — so a
     cell with seven unnumbered lysosomes answered 1, and the eighth was named "Lysosome" like the
     rest. Measured on Hesham's cell. Both terms are kept: a cell with one numbered 5 and nothing
     else must still answer 6. */
  /* ── AND WHAT THIS BROWSER HAS KEPT BUT NOT YET SHARED ──────────────  2026-09-27
     Found by idcollisioncheck.js, whose fixture has an empty published index on purpose: three
     lysosomes saved in three pad sessions all came back "Lysosome 1", because nothing had reached
     the dataset for the count to find. That is not only a fixture — this card works signed out by
     design and the published index can be a minute stale, so the same thing happens offline.
     Counted by id, so a structure in both lists counts once. */
  (TRACINGS_KEPT || []).forEach(function(t){
    if (!t || !t.id || seen[String(t.id)]) return;        // already counted, or on the pad
    var k = String(t.instance_of || t.kind || "");
    var same = (k === wantK) && (!tracingSeriesIsNamed(wantK)
                                 || tracingSeriesLabel(t.name) === wantL);
    var sameCell = tracingSeriesIgnoresCell(wantK)
                 || tracingSameCell(tracingCellOf(t), here);
    if (!same || !sameCell) return;
    have++;
    if (Number(t.instance_index) > top) top = Number(t.instance_index);
  });
  /* THE COUNT IS ONLY MEANINGFUL FOR A KIND A CELL HAS MANY OF (2026-09-27). A cell has one
     nucleus, so counting nuclei and answering 2 made a lone nucleus "Nucleus 2" — and under
     `other` the same count inflated a hand-named singleton. Those keep the old answer: one more
     than the highest number actually carried. Found by tracingpanelcheck.js. */
  return (tracingKindNumbered(wantK) ? Math.max(top, have) : top) + 1;
}

/* ── A ROW MAY NOT DISAGREE WITH ITSELF ABOUT WHICH CELL IT IS ──────  2026-10-06
   Søren, four structures filed under a cell 125 µm from where they were drawn: *"now it mixed
   two different tracings completely."*

   THE COORDINATE WAS RIGHT. 427087, 220193, 1940 is where those contours are. The nucleus id was
   394673650, whose own centre is 402334, 232283, 479. So "are the contours near the cell
   coordinate?" would have passed all four; what is wrong is that the row names two different places
   at once.

   LOCATION FIRST, NUCLEUS SECOND, ROOT NEVER. Søren: *"we can't always trust the root ID...
   many different cells share the same root ID... more important is the cell location, which is put
   as close to the nucleus center as possible."* A cell coordinate is PUT at the nucleus centre, so
   25 µm is generous slack for one typed by hand and nowhere near a hundred.

   IT RETURNS NOTHING WHEN THE PAGE CANNOT ANSWER -- ωJump has no nucleus table, and a cell
   nobody has named has no centre to be far from. A guard that guesses is worse than one that is
   quiet, and this one has to be right every time or it will be switched off. */
var TRACING_CELL_FAR_UM = 25;
function tracingCellDisagrees(){
  try {
    var nid = (document.getElementById("tracingNucId") || {}).value;
    nid = String(nid || "").trim();
    var at = tracingCellAtVal();
    if (!nid || !at) return null;
    if (typeof window.tracingNucCentroid !== "function") return null;
    var nc = window.tracingNucCentroid(nid);
    if (!nc || !isFinite(nc.xVox)) return null;
    var c = at.split(",").map(Number);
    if (c.length !== 3 || !c.every(isFinite)) return null;
    var res = (UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    var dx = (c[0] - nc.xVox) * res[0], dy = (c[1] - nc.yVox) * res[1],
        dz = (c[2] - nc.zVox) * res[2];
    var um = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;
    if (!(um > TRACING_CELL_FAR_UM)) return null;
    /* WHICH CELL IT REALLY IS, when the page can say. The same reader the coordinate box is filled
       from, so the answer offered here is the answer that box would have given. */
    var near = null;
    try { near = tracingNearestCell(c); } catch (_e){ near = null; }
    return { um: um, nid: nid, at: at,
             nearId: (near && near.nucleusId) ? String(near.nucleusId) : "",
             nearUm: near ? (near.distNm / 1000) : 0 };
  } catch (_e){ return null; }
}
/* Beside the coordinate box, which is the thing it is about, and never in the way. */
function tracingCellNoteShow(){
  var el = document.getElementById("tracingAtSay");
  if (!el) return;
  var d = null;
  try { d = tracingCellDisagrees(); } catch (_e){ d = null; }
  if (!d) return;
  el.textContent = "Nucleus " + d.nid + " is " + d.um.toFixed(1) + " \u00b5m from this coordinate"
    + (d.nearId ? " (the nucleus there is " + d.nearId + ")" : "")
    + " \u2014 the coordinate is what files this tracing, so this is only worth a look if you "
    + "expected the segmentation to be right here.";
}
function tracingCellDisagreeSay(d){
  return "These contours are filed at " + tracingCoordShow(d.at) + ", and nucleus " + d.nid
    + " is " + d.um.toFixed(1) + " \u00b5m from there \u2014 they are two different cells, so "
    + "nothing has been added."
    + (d.nearId
        ? " The cell at that coordinate is nucleus " + d.nearId + ", "
          + d.nearUm.toFixed(1) + " \u00b5m away. Put that in the nucleus box, or clear the box and "
          + "the coordinate and read them again."
        : " Clear the nucleus and cell-centre boxes and read them again from the coordinate.");
}
function tracingCurrentAll(){
  /* ── WHAT IS ON THE PAD, NOT WHAT WAS ON IT WHEN IT OPENED ─────────────  2026-10-05
     Søren: *"as soon as I added it to the dataset, the whole cell mesh disappeared."* It never
     left the browser. TRACING_PENDING is written by a pasted link, a resumed draft, either "Open in
     the pad" and "Use these contours" — and by nothing that draws. padRings() refreshes the
     preview, the volume, the strip, the 3D view and the draft, and left this alone, so a tracing
     opened for editing and drawn on submitted the contours it was opened with, under the id it was
     opened with. Nothing refused it, because the 4 October geometry guard compares a submission
     against OTHER structures and this one matched only itself.

     THE PAD IS THE TRUTH WHEN THERE IS A PAD. This file already says so where the link reader
     declines to clear the per-structure colours and types — "those numbers are the PAD'S". A
     tracing read from a link carries `groups`, which a pad never does, and keeps its own rings. An
     empty TRACING_PENDING still meets the gate below, because that gate is about having decided,
     not about where the contours are. */
  if (PAD && (PAD.rings || []).length && TRACING_PENDING && !TRACING_PENDING.groups){
    try { TRACING_PENDING.rings = UJ.tracepad.toRings(PAD); } catch (_e0){}
  }
  /* ── AND TWO STRUCTURES ARE TWO KINDS ──────────────────────────  2026-10-05
     With the tick off, tracingKindFor() answers for every structure out of the one box, so a pad
     holding a nucleus and a whole cell filed both as whatever it said. tracingEachAuto() turns the
     rows on the moment a second structure appears, so in ordinary use this never fires; it is here
     because the thing it prevents costs an evening. */
  if (tracingEachAuto(true)) return [];
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
  /* ── BEFORE ANYTHING IS BUILT ─────────────────────────────  2026-10-06
     Here rather than at the button, because the Neuroglancer link goes through this function too and
     a link naming the wrong cell is a quieter version of the same mistake. */
  /* ── AND IT DOES NOT REFUSE ───────────────────────────  2026-10-06
     This refused a submission whose nucleus id and coordinate named different places, for about an
     hour. For a vascular cell — where Søren is tracing precisely BECAUSE the segmentation's
     ids are wrong — that is always true, so it would have refused every tracing he is doing.
     "A guard that refuses correct work is a guard somebody switches off", written on 4 October and
     walked into on the 6th.

     The coordinate decides the cell now, so a stale id is noise rather than a hazard: it is said
     once, beside the box it is about, and nothing is blocked. */
  try { tracingCellNoteShow(); } catch (_eCell){}

  /* A SERIES IS A KIND, NOT A PAD. Two mitochondria and a lysosome are Mitochondrion 1,
     Mitochondrion 2 and Lysosome 1 -- so the numbering is per series, each starting from what the
     cell already carries of THAT kind. */
  const seriesKey=function(w){
    return String(w.kind||"")+"|"+((w.kind==="other")?tracingSeriesLabel(w.name):"");
  };
  /* THE ID IS SETTLED FIRST, because it is what decides whether a structure is new. It used to
     be assigned after the numbering, which was harmless only while the numbering did not care. */
  if(!TRACING_PENDING.id){
    const label=groups[0].w.name, kindNow=String(groups[0].w.kind||"");
    /* ── AND THE SAME CELL ────────────────────────────────────────────────────────  2026-09-23
       Søren: "one of the arachnoid barrier cells is missing". It was overwritten. This filter
       matched on the NAME alone, and "Whole cell" is the default name of every cell anybody traces
       -- so his second arachnoid barrier cell (nucleus 286159) found the first (nucleus 286849) in
       the kept list, took its id, and filed 30,948 vertices of somebody's tracing as the previous
       version of a different cell.

       The intent is right and stays: re-reading a cell you have already added must file a version
       rather than a twin. The key was too weak. A structure is its name AND THE CELL IT IS PART OF,
       compared the same three ways tracingNextIndex compares cells above -- nucleus, root, or the
       coordinate -- any one positive match being enough, because a root id moves when the
       segmentation is proofread and a nucleus id does not.

       WITH NOTHING TO COMPARE the answer is no. A twin is two rows to merge; an overwrite is an
       afternoon of tracing behind a "v2" label. Minting an id deletes nothing, so the doubtful case
       takes the recoverable mistake. See src/a_second_cell_does_not_take_the_first_ones_id.py. */
    const bareId=function(v){ var s=String(v||""); var i=s.indexOf(":"); return i<0?s:s.slice(i+1); };
    const cellOf=function(x){
      return {nuc:bareId(x&&(x.nucleus_id||x.nucleusId)),
              root:bareId(x&&(x.root_id||x.rootId)),
              at:String((x&&(x.cell_coord||x.cellCoord))||"")};
    };
    const here=cellOf({nucleus_id:nid,root_id:rid,cell_coord:tracingCellAtVal()});
    const sameCell=function(x){
      const c=cellOf(x);
      /* ── A DISAGREEMENT COUNTS, NOT ONLY AN AGREEMENT ──────────────  2026-10-02
         Søren, on ηJump: "I traced a nucleus and then I traced another nucleus right after... they
         had exactly the same structureID... everything else was different for them except color
         and rootID (it is a large weird root ID)."

         This read "any ONE positive match is enough", so his two nuclei -- different nucleus ids,
         one shared H01 root id -- matched on the root, and the nucleus ids that disagreed were
         never consulted. H01's segmentation merges; a root id there can cover many cells, which
         is what a large weird root id IS. More than one cell sharing a root id was never the
         problem: a test that could only look for agreement was.

         A NUCLEUS ID SETTLES IT BOTH WAYS when both have one. It is the cell's own name, and the
         2026-09-23 note already says why it is the one to trust: a root id moves when the
         segmentation is proofread and a nucleus id does not. So a proofread cell still keeps its
         id (its nucleus agrees), and two nuclei inside one merged segment are two cells.

         The root and the coordinate keep their old meaning for everything else, because a cell
         traced from a point inside a process has a root id and nothing else, and that is the case
         the root test was added for. The root id is not wrong here; it is WEAKER. */
      /* THROUGH THE ONE DEFINITION, since 2026-10-06. This was a fourth copy of it, and on the
         6th it was the only one of the four that had been corrected — which is exactly how a rule
         gets fixed in one place and stays broken everywhere else. */
      return tracingSameCell(c, here);
    };
    /* ── AND ONLY FOR SOMETHING A CELL HAS ONE OF ──────────────────────────────────  2026-09-27
       Hesham: "if I'm logging multiple lysosomes I still have to change the color of the annotation
       between each lysosome — if I don't, the new tracing will replace the old one."

       Name AND cell identifies a WHOLE CELL, because a cell has exactly one. It identifies nothing
       about a lysosome: a cell has as many as somebody draws, every one of them is named bare
       "Lysosome" (the number is only added when there is more than one of the kind on the pad), and
       they are all on the same cell. So the second lysosome found the first and filed itself as its
       next version. Measured: three lysosomes in three pad sessions came back as ONE id.

       Editing one on purpose is a different route and is unaffected — "Open it in the pad" sets
       PAD_EDIT_ID / PAD_EDIT_IDS, and editOf() is asked before any of this. What is given up is
       that pasting the same link twice for one organelle now makes two of them rather than two
       versions: two rows to merge, against an afternoon of tracing behind a "v2" label. The same
       trade src/a_second_cell_does_not_take_the_first_ones_id.py made, decided the same way.
       See src/a_cell_has_one_whole_cell_and_twenty_lysosomes.py. */
    /* "other" is in, and it is not an exception: under `other` the user TYPED the name, which is
       the one case where a name is a chosen identifier rather than a kind — tracingSeriesLabel
       already treats it that way for the numbering, for the same reason. Two tracings both called
       "Astrocyte at the glia limitans" on one cell are one structure, traced twice. Two called
       "Lysosome" are two lysosomes. (Found by tracingpanelcheck.js, which went red on five
       assertions when this rule first read cell-or-nucleus alone.) */
    const oneEach=(kindNow==="cell"||kindNow==="nucleus"||kindNow==="other");
    /* BY SERIES, NOT BY THE EXACT NAME (2026-09-27). This compared x.name === label, where label
       is the BARE name from the form — so once names carry numbers, "second tracing" no longer
       matched the kept "second tracing 2", a re-add minted a fresh id, and the kept list grew a
       twin. That is the failure src/a_second_cell_does_not_take_the_first_ones_id.py exists to
       prevent, arriving from the other direction. tracingSeriesLabel is the comparison
       tracingNextIndex and tracingBareOf already use for a series; the cell test below is what
       separates two cells. See src/numbering_does_not_count_itself.py. */
    const wantSeries=tracingSeriesLabel(label);
    const prior=oneEach?(TRACINGS_KEPT||[]).filter(function(x){
      return x&&x.id&&tracingSeriesLabel(x.name)===wantSeries&&sameCell(x);
    })[0]:null;
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);
  }
  /* WHERE THE OTHER STRUCTURES HANG FROM.  2026-09-19
     With nothing opened for editing, the pad's own id — so three structures drawn together are
     still X, X__i1, X__i2. With a tracing opened, TRACING_PENDING.id names somebody's EXISTING
     structure: `X__i1 + "__i2"` is the compound id Søren found in Drive, and `X + "__i1"` is worse,
     because that is a real and different lysosome. A fresh base, minted once and kept, is the only
     thing here that cannot already belong to something else. */
  /* ALWAYS MINTED, 2026-09-27. It was TRACING_PENDING.id whenever nothing was open for editing
     — so on a whole cell being re-read, whose pending id is that cell's EXISTING id, a second
     structure drawn beside it became `<that cell's id>__i1`: the compound-id hazard this block's
     own note from 2026-09-19 describes, still live for that one case. The base is only ever used
     for inst >= 1, and editOf() has already had its say about those, so a fresh one can never take
     something else's identity. A draft carries it (baseId), so resuming one keeps every id it had. */
  if(!TRACING_BASE_ID)
    TRACING_BASE_ID = UJ.tracing.structureId(groups[0].w.name || "tracing");
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
  /* ── AND "PUBLISHED" IS NOT "PUBLISHED WITH A NUMBER" ──────────────────────────  2026-09-27
     This asked tracingPublishedIndex and treated 0 as "new", so a structure saved on its own —
     which carries no instance_index at all — was renumbered every time it was opened. `known`
     asks whether the dataset has it; `keep` says what number it carries, and 0 is an answer.
     See src/opening_an_organelle_is_not_changing_it.py. */
  const first={}, taken={}, count={}, keep={}, known={};
  groups.forEach(function(g){
    const k=seriesKey(g.w);
    count[k]=(count[k]||0)+1;
    const id=idOf(g);
    if(tracingIsPublished(id)){ known[g.inst]=1; keep[g.inst]=tracingPublishedIndex(id); return; }
    /* ITS OWN ID AND NOTHING ELSE'S (2026-09-27). Skipping every id on the pad was wrong the
       other way: the siblings OPENED beside a new structure are real siblings and must be counted,
       and only the structure asking must not count itself. Both halves were caught by a check —
       tracingpanelcheck for the self-count, reopenedtracingcheck for the over-skip. */
    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid,[idOf(g)],
                                                      tracingCellAtVal());
  });

  return groups.map(function(g){
    const k=seriesKey(g.w);
    const mine=keep[g.inst]||0;
    let index, several;
    if(known[g.inst]){
      index=mine;
      /* IT WAS PUBLISHED WITHOUT A NUMBER AND IS OWED ONE (2026-09-27). Through the same allocator
         the siblings that are NOT on the pad go through, so its position in the cell's order is its
         own and no number is handed out twice. */
      if(!index&&tracingKindNumbered(g.w.kind))
        index=tracingBareNumberFor(idOf(g),g.w.kind,g.w.name,nid,rid,tracingCellAtVal());
      /* IT IS NAMED THE WAY IT WAS PUBLISHED, whatever else is on the pad (2026-09-27). With a
         number it keeps that number — dropping it would rename "Lysosome 3" to "Lysosome" and make
         the same object look like a different one. With none, it is given the one it is owed
         (2026-09-27) — and only a kind a cell has many of is owed one at all.

         This read `(mine>1)||(count[k]>1)`, which renamed a published "Lysosome 1" to "Lysosome"
         when it was re-added alone — an off-by-one nobody had reached, because a lone "Lysosome 1"
         was never recognised as published to begin with. */
      several=(index>0);
    } else {
      const n=(taken[k]||0); taken[k]=n+1;
      index=first[k]+n;
      /* ALWAYS, for a kind a cell can have many of (2026-09-27). It was `(count>1)||(first>1)`,
         which left a cell's FIRST lysosome bare — and a bare one submits no number, so the next one
         asked "what is the highest number here" and got 0, and stayed bare too. Søren: "if you add
         another lysosome to a cell that already has a lysosome they both get a number". */
      several=(count[k]>1)||(first[k]>1)||tracingKindNumbered(g.w.kind);
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
    /* ── A VESSEL TAKES NO CELL'S IDS ────────────────────  2026-10-08
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
    }
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
/* ── THE IDS FOLLOW THE CELL TOO ─────────────────────────────────────────────────  2026-09-22
   Søren, on χJump: "Segmentation still does not work in xJump" -- the pad was on one cell and the
   fragment box held another's, from an earlier lookup, so the overlay looked for the wrong cell.
   See src/the_ids_follow_the_cell.py. */
var TRACING_IDS_SOON = null;
function tracingIdsOnScreen(){
  try {
    var f = UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.cellOnScreen;
    if (typeof f === "function") return f() || null;
  } catch (_e){ return null; }
  var hasN = typeof CUR_NUCID !== "undefined", hasR = typeof CUR_ROOT !== "undefined";
  if (!hasN && !hasR) return null;              // a page with no idea of a cell's ids
  return { nuc: hasN && CUR_NUCID ? String(CUR_NUCID) : "", root: hasR && CUR_ROOT ? String(CUR_ROOT) : "" };
}
function tracingFollowIds(){
  var ids = tracingIdsOnScreen();
  var nucEl = document.getElementById("tracingNucId"), rootEl = document.getElementById("tracingRootId");
  if (!ids || !nucEl || !rootEl) return false;
  var want = [String(ids.nuc || ""), String(ids.root || "")];
  if (nucEl.value.trim() === want[0] && rootEl.value.trim() === want[1]) return false;
  /* Contours on an open pad were drawn on the cell these boxes name. */
  var wrap = document.getElementById("tracePadWrap");
  if (typeof PAD !== "undefined" && PAD && (PAD.rings || []).length && wrap && wrap.style.display !== "none"){
    var say = document.getElementById("tracingPosSay");
    if (say) say.textContent = "The cell and fragment boxes still name the cell on the pad — it has contours on it.";
    return false;
  }
  nucEl.value = want[0]; rootEl.value = want[1];
  var at = document.getElementById("tracingCellAt");
  if (at && window.CUR_POS && window.CUR_POS.length === 3)
    at.value = window.CUR_POS.map(function(n){ return Math.round(n); }).join(", ");
  try { tracingSuggestType(); } catch (_e){}
  return true;
}
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
  /* The ids with it, a tick later: pages set CUR_POS before their ids (2026-09-22). */
  clearTimeout(TRACING_IDS_SOON);
  TRACING_IDS_SOON = setTimeout(function(){ try { tracingFollowIds(); } catch (_e){} }, 0);
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
  if (want.rings && want.rings.length) anns = tracingRingAnns(want.rings, "org");
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
/* POLYLINES, 2026-09-22: one annotation per contour instead of one per edge. The writer sits in
   core/tracing.js beside the reader it is the inverse of; tracingRingLines below is what it falls
   back to. See src/the_viewer_link_is_polylines.py. */
function tracingRingAnns(rings, idPrefix, base){
  try {
    if (window.UJ && UJ.tracing && UJ.tracing.ringAnnotations)
      return UJ.tracing.ringAnnotations(rings, idPrefix, { base: base || "" });
  } catch (_e){}
  return tracingRingLines(rings, idPrefix);
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
/* ── THE STATE, TO PASTE INTO THE VIEWER ITSELF ──────────────────────────────  2026-09-22
   Neuroglancer's {} button takes a pasted state, which is how Søren was opening the tracings a
   link could not carry. The status line offers the same JSON: on the clipboard, or as a file.
   See src/a_long_tracing_still_opens.py. */
var TRACING_STATE_JSON = "";
function tracingStateOffer(json, msg, bad){
  TRACING_STATE_JSON = String(json || "");
  var el = document.getElementById("tracingStatus");
  if (!el){ tracingSay(msg, bad); return; }
  el.innerHTML = (bad ? '<span style="color:var(--bad)">' + escHtml(msg) + "</span>" : escHtml(msg))
    + ' <button type="button" class="hist-chip" id="tracingCopyState">copy the JSON</button>'
    + ' <button type="button" class="hist-chip" id="tracingSaveState">download it</button>';
  var c = document.getElementById("tracingCopyState");
  if (c) c.addEventListener("click", function(){
    var done = function(){ c.textContent = "copied \u2014 paste it into Neuroglancer\u2019s {} button"; };
    var no = function(){ c.textContent = "could not copy \u2014 use download it"; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(TRACING_STATE_JSON).then(done, no);
      else no();
    } catch (_e){ no(); }
  });
  var d = document.getElementById("tracingSaveState");
  if (d) d.addEventListener("click", function(){
    try { tracingSaveBlob(new Blob([TRACING_STATE_JSON], { type: "application/json" }),
                          "neuroglancer_state.json"); d.textContent = "downloaded"; }
    catch (_e){ d.textContent = "could not download it"; }
  });
}
/* ── THE TAB IS TAKEN AT THE CLICK ───────────────────────────────────────────  2026-09-22
   Søren: "the Neuroglancer window is still blocked. Why?" Because a browser only allows
   window.open in the turn the click happened in, and the list's buttons read the tracing out of
   the dataset first. A caller that will fetch reserves the tab before it does -- an async function
   runs synchronously up to its first await, so the reservation is still inside the click -- and
   tracingViewerOpen sends that tab to the link. See src/the_viewer_tab_is_taken_at_the_click.py. */
var TRACING_HELD_WIN = null;
function tracingReserveTab(msg){
  try { TRACING_HELD_WIN = window.open("", "_blank"); } catch (_e){ TRACING_HELD_WIN = null; }
  if (TRACING_HELD_WIN) try {
    TRACING_HELD_WIN.document.write('<!doctype html><meta charset="utf-8"><title>Opening\u2026</title>'
      + '<body style="font:14px system-ui;background:#0d1117;color:#e6edf3;padding:24px">'
      + escHtml(msg || "Reading the contours, then opening the viewer\u2026"));
    TRACING_HELD_WIN.document.close();
  } catch (_e){}
  return TRACING_HELD_WIN;
}
function tracingHeldTab(){ var w = TRACING_HELD_WIN; TRACING_HELD_WIN = null; return w; }
/* Opens the link: the tab reserved at the click if there is one, else a new one. Returns false when
   the browser refused -- pop-ups off -- so the caller can say so rather than look like it did
   nothing. */
function tracingOpenUrl(url){
  var held = tracingHeldTab();
  if (held){
    try { held.opener = null; } catch (_e){}
    try { held.location.href = url; return true; } catch (_e){}
  }
  var w = null;
  try { w = window.open(url, "_blank", "noopener"); } catch (_e){ w = null; }
  return !!w;
}
function tracingSayBlocked(st){
  tracingStateOffer(JSON.stringify(st),
    "Your browser blocked the viewer tab \u2014 allow pop-ups for this page, or paste the state "
    + "into Neuroglancer\u2019s {} button:", true);
}
/* How long a viewer link may be. MEASURED, not guessed (2026-09-22, Chrome on
   spelunker.cave-explorer.org): a 5.83M character URL carrying 40,000 line annotations navigates
   and loads in full. Below LONG nothing is said; between LONG and MAX it opens and says the link
   is a long one; above MAX no tab is opened, because a truncated URL opens a viewer missing half
   the cell without saying so. */
/* MEASURED 2026-09-22 by navigating CROSS-DOCUMENT to a long fragment -- which is what opening
   a tab does, and what the earlier 5.83M measurement did NOT do (it set location.href on an
   already-open viewer, a same-document hash change the renderer handles without ever building a
   URL). 2,097,152 characters loads; 2,097,153 becomes about:blank#blocked. Exactly
   url::kMaxURLChars. See src/fewer_points_and_the_real_cap.py. */
var TRACING_LINK_LONG = 1200000, TRACING_LINK_MAX = 2097152;
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
  /* The viewer decides the annotation shape (2026-09-22), so it has to be known before the
     layers are written, not just when the URL is joined. */
  const viewerEl0 = document.getElementById("viewer");
  /* `let`, because a link too big for this viewer is re-pointed at one that takes it below
     (2026-09-23, src/too_big_here_opens_where_it_fits.py). */
  let base = (viewerEl0 && viewerEl0.value)
            || (window.UJ && UJ.cfg && UJ.cfg.viewer && UJ.cfg.viewer.base)
            || "https://spelunker.cave-explorer.org/";
  const used = {}; let firstName = "";
  let cut = { before: 0, after: 0, tol: 0 };
  structs.forEach(function(t, i){
    /* Neuroglancer keys layers by NAME, so two structures called the same thing would be one layer
       with one of them in it. The number is already how they are told apart everywhere else. */
    let nm = String(t.name || "").replace(/[^\w .µ-]+/g, "").trim() || ("structure " + (i + 1));
    if (used[nm]) nm = nm + " (" + (i + 1) + ")";
    used[nm] = 1; if (!firstName) firstName = nm;
    const anns = tracingRingAnns(t.rings, "t" + i, base);
    if (anns.simplified){
      cut.before += anns.simplified.before; cut.after += anns.simplified.after;
      cut.tol = anns.simplified.tol; cut.nm = anns.simplified.nm;
    }
    st.layers.push({ type: "annotation", source: "local://annotations", tab: "annotations",
                     name: nm, annotationColor: t.color || "#40e28c", annotations: anns });
  });
  st.selectedLayer = { layer: firstName, visible: true };
  const shown = tracingShowCellIn(st, (ids && ids.root) || "", (ids && ids.nuc) || "");
  /* A 3D pane, or there is nowhere for the meshes to appear. xy-3d rather than 4panel: the contours
     live on xy sections, and three section panes to one 3D pane spends the width on two views that
     show the same outline twice. */
  st.layout = { type: "xy-3d", orthographicProjection: true };
  /* base is resolved above, before the layers are written. */
  let url = base + "#!" + encodeURIComponent(JSON.stringify(st));
  /* A tracing is tens of vertices a section, so this is comfortable; a hundred sections of freehand
     is not, and a URL the browser silently truncates would open a viewer missing half the cell
     without saying so. Better to say so here. */
  const kc = Math.round(url.length / 1000) + "k characters";
  /* What was dropped, in his own numbers, so a silent change to his outlines is not something he
     has to take on trust. Only when it is a tenth or more -- below that it is noise. */
  const cutSay = (cut.before && cut.before - cut.after > cut.before / 10)
    ? " Redundant points dropped: " + cut.before.toLocaleString() + " \u2192 "
      + cut.after.toLocaleString() + " (no point of the outline moved more than "
      + (Math.round(cut.tol * 40) / 10) + " nm; your saved tracing is unchanged)."
    : "";
  /* 2026-09-22: on a viewer with no polyline type a contour costs one annotation per edge, so the
     same cell is about four times the link. Better to name the reason than to let him wonder. */
  let shapeSay = "";
  try {
    if (UJ.tracing.viewerTakesPolylines && !UJ.tracing.viewerTakesPolylines(base))
      shapeSay = " This viewer cannot read polyline annotations, so every edge is its own line and "
               + "the link is about four times longer than it needs to be \u2014 Spelunker and "
               + "neuroglancer-demo read polylines.";
  } catch (_e){}
  let movedViewer = false;
  if (url.length > TRACING_LINK_MAX){
    /* PRICE THE ALTERNATIVE (2026-09-23). Søren spent an evening dropping points and then sections
       off a cell that already fitted as polylines and could never fit as lines -- so rather than
       tell him again that this viewer cannot read them, the same state is measured the other way
       and the answer is in the sentence. See src/an_oversized_link_prices_the_other_viewer.py. */
    /* OPEN IT WHERE IT FITS (2026-09-23). Søren: "Can't you just measure when it will fail to
       open and then open with Spelunker instead? It should be easy for the user." The measurement
       was already being made to tell him about it; making it and then not acting on it was the
       wrong end of the job. See src/too_big_here_opens_where_it_fits.py. */
    let elseSay = "", moved = false;
    try {
      if (UJ.tracing.viewerTakesPolylines && !UJ.tracing.viewerTakesPolylines(base)){
        /* One he already has in his own list, if the page offers one. */
        const altBase = (function(){
          try {
            const el = document.getElementById("viewer");
            const hit = el && [].filter.call(el.options, function(o){
              return UJ.tracing.viewerTakesPolylines(o.value);
            })[0];
            if (hit) return hit.value;
          } catch (_e){}
          return "https://spelunker.cave-explorer.org/";
        })();
        const alt = JSON.parse(JSON.stringify(st));
        let n = 0;
        (alt.layers || []).forEach(function(l, i){
          if (!l || !l.annotations) return;
          const rs = structs[n] ? structs[n].rings : null; n++;
          if (rs) l.annotations = tracingRingAnns(rs, "t" + i, altBase);
        });
        const altUrl = altBase + "#!" + encodeURIComponent(JSON.stringify(alt));
        if (altUrl.length <= TRACING_LINK_MAX){
          const wasHost = (function(){ try { return new URL(base).host; } catch (_e){ return base; } })();
          const nowHost = (function(){ try { return new URL(altBase).host; } catch (_e){ return altBase; } })();
          st = alt; base = altBase; url = altUrl; moved = movedViewer = true;
          tracingSay("Too big for " + wasHost + " as line annotations (" + kc + "; a tab cannot be "
            + "opened past 2,097,152 characters), so it opened in " + nowHost + " as polylines, "
            + "where it is " + Math.round(altUrl.length / 1000) + "k. Nothing was dropped. Your "
            + "viewer setting is unchanged \u2014 this one link went elsewhere because it had to.");
        } else {
          elseSay = " It would still be " + Math.round(altUrl.length / 1000) + "k as polylines, so "
                  + "no viewer takes it as a link: the {} editor is the way in.";
        }
      }
    } catch (_e){}
    if (!moved){
      tracingStateOffer(JSON.stringify(st),
        "That is more than a tab can be opened with (" + kc + "; the browser refuses past 2,097,152 "
        + "and shows about:blank#blocked). Paste the state into Neuroglancer instead \u2014 its {} "
        + "button takes it, with no URL and no limit." + elseSay, true);
      return;
    }
  }
  /* shapeSay is computed above, for both branches. */
  if (url.length > TRACING_LINK_LONG){
    /* It opens -- up to 2,097,152 characters, which is where the browser stops (measured
       2026-09-22; the 5.83M figure this note used to carry was a same-document hash change on an
       already-open viewer, which never builds a URL at all). Not an error, just a warning. */
    tracingStateOffer(JSON.stringify(st),
      "Opening a long link (" + kc + "). If the viewer comes up empty, your browser cut it short: "
      + "copy or download the state below and paste it into Neuroglancer\u2019s {} button."
      + shapeSay + cutSay, false);
  }
  /* THE WHOLE CELL, 2026-09-21: the tab first, synchronously, then the community's root IDs for
     the nucleus onto the cell layer, then the tab is sent there. Where there are none to read the
     wait is nothing, and a backend that does not answer costs 5 s, not the view. */
  /* movedViewer: the sentence saying WHERE it opened and why is the one that must survive. */
  const wasLong = movedViewer || url.length > TRACING_LINK_LONG;
  const nucId = (ids && ids.nuc) || "", rootId = (ids && ids.root) || "";
  /* A cell layer to put them in: the link's own (δJump's v1dd_public, which the card itself cannot
     read) or the card's segmentation -- 2026-09-21, Søren: "In dJump, I don't see it including the
     community reported root IDs". */
  const canExtra = !!nucId && !!(tracingCellLayerOf(st) || tracingSources().seg)
    && !!((UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.extraRootsFor) || typeof fetchExtraRootIdsFor === "function");
  if (!canExtra){ if (!tracingOpenUrl(url)){ tracingSayBlocked(st); return; } }
  else {
    /* The tab reserved at the click, or one opened now -- either way it is taken BEFORE the
       community's root IDs are fetched, for the same reason. */
    let win = tracingHeldTab();
    if (!win) try { win = window.open("", "_blank"); } catch (_e){}
    if (!win){ tracingSayBlocked(st); return; }
    tracingExtraRootsFor(nucId, rootId).then(function(extra){
      let u = url;
      if (tracingAddRootsTo(st, extra)) u = base + "#!" + encodeURIComponent(JSON.stringify(st));
      if (win){ try { win.opener = null; } catch (_e){} win.location.href = u; }
      else window.open(u, "_blank", "noopener");
      if (extra.length && !wasLong) tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + ".")) + " The cell "
        + "is shown with its " + extra.length + " community-proposed root ID" + (extra.length === 1 ? "" : "s")
        + " as well as " + (rootId ? "its own" : "its nucleus") + ".");
    });
  }
  const nStr = structs.length + " structure" + (structs.length === 1 ? "" : "s");
  const cellStr = shown
    ? " The cell is in the 3D pane, see-through, with its nucleus in blue inside it."
    : " No cell or nucleus ID on this tracing, so the 3D pane is empty — fill one in above and"
      + " open it again.";
  if (wasLong) return;          // the long-link offer, with its two buttons, stays put
  tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + " — " + nStr
    + ", one annotation layer each, in the colours they were drawn in. Edit them there and paste "
    + "the address bar back into the box above to read them in again.")) + cellStr + cutSay);
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
               kind: String((t.instanceOf || t.kind) || "").toLowerCase(),
               color: t.color || "#40e28c", rings: t.rings };
    });
  if (!structs.length){
    tracingSay("None of this cell’s outlines have been read here yet — open the "
      + "Organelles list, give it a moment, and try again.", true);
    return;
  }
  /* ── TWO KINDS, COUNTED APART \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-07
     Since the cell and its nucleus now travel with the organelles (see core/panel.js), "with 4
     organelles on it" would be a miscount of a link with two of them. */
  const isBody = function(s){ return s.kind === "cell" || s.kind === "nucleus"; };
  const nBody = structs.filter(isBody).length, nOrg = structs.length - nBody;
  const what = (nOrg ? nOrg + " organelle" + (nOrg === 1 ? "" : "s") : "")
    + ((nOrg && nBody) ? " and " : "")
    + (nBody ? structs.filter(isBody).map(function(s){
         return s.kind === "cell" ? "the whole cell" : "the nucleus"; }).join(" and ")
         + " you traced" : "");
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

/* ── AND THE SIBLINGS THAT ARE NOT ON THE PAD ─────────────────────────────────  2026-09-27
   Søren, asked whether these should be numbered on the save or on a press: "Automatically, on the
   save." So each unnumbered sibling of a kind just saved is fetched, renamed and re-submitted: one
   version each, a name-only change, and the card says how many rows it wrote.

   ONE DRIVE READ AND ONE POST EACH. For the ordinary case ahead — a cell with one bare lysosome and
   a second being added — that is one of each. For Hesham's seven it is seven, once. A read that
   fails is logged and skipped: the save has already happened, and a structure left unnumbered is
   recoverable, while a save that threw would not be.

   `skip` is the ids handled on the pad, which took their numbers from the same allocator.
   See src/a_cells_organelles_of_a_kind_are_numbered.py. */
async function tracingNumberBare(kind, label, nuc, root, skip){
  var list = tracingBareOf(kind, label, nuc, root);
  var mine = list.filter(function(e){
    return (skip || []).indexOf(String(e.row.structureId || "")) < 0;
  });
  if (!mine.length) return 0;
  var done = 0;
  for (var i = 0; i < mine.length; i++){
    var row = mine[i].row, idx = mine[i].index;
    try {
      var got = await tracingFetchShared(String(row.structureId));
      var st = got.st;
      var base = String(st.name || row.name || "").replace(/\s+\d+$/, "").trim();
      var nt = { id: st.structureId,
                 name: UJ.tracing.instanceName(base, idx, true),
                 kind: st.kind || row.kind || "",
                 type: st.cellType || row.cellType || "traced",
                 color: st.color || row.color || "#3a6b5a",
                 /* EVERYONE WHO DREW ON IT, not whoever pressed Add: a rename is not authorship. */
                 traced_by: (st.contributors && st.contributors.length)
                              ? st.contributors.join(", ") : (st.tracedBy || row.tracedBy || ""),
                 rings: st.rings,
                 instance_index: idx,
                 instance_of: st.instanceOf || st.kind || row.kind || "",
                 nucleus_id: st.nucleusId || "", root_id: st.rootId || "",
                 cell_coord: st.cellCoord || "",
                 volume_um3: st.volumeUm3, volume_method: st.volumeMethod };
      if (tracingPublish(nt, true)){
        done++;
        /* The index in hand is now stale, and the next save reads it — so it is told, rather than
           re-fetched, and a second save numbers nothing. */
        row.name = nt.name;
        row.instanceIndex = String(idx);
        row.instanceOf = nt.instance_of;
      }
    } catch (e){
      console.warn("[uJump tracing] could not number " + row.structureId, e && e.message);
    }
  }
  return done;
}
/* Every numbered kind in one save, and one sentence about what it wrote. */
function tracingNumberBareAfter(all){
  try {
    if (!all || !all.length) return;
    var nuc = String(all[0].nucleus_id || ""), root = String(all[0].root_id || "");
    var ids = all.map(function(t){ return String(t.id || ""); });
    var kinds = {};
    all.forEach(function(t){ if (tracingKindNumbered(t.kind)) kinds[String(t.kind)] = t.name; });
    var todo = Object.keys(kinds);
    if (!todo.length) return;
    todo.reduce(function(chain, k){
      return chain.then(function(n){
        return Promise.resolve(tracingNumberBare(k, kinds[k], nuc, root, ids))
                 .then(function(m){ return n + m; });
      });
    }, Promise.resolve(0)).then(function(n){
      if (!n) return;
      var el = document.getElementById("tracingStatus");
      var was = el ? el.textContent : "";
      tracingSay(was + " " + n + (n === 1 ? " structure" : " structures") + " already on this cell "
        + "had no number, so " + (n === 1 ? "it was renamed" : "they were renamed") + " \u2014 they "
        + "are numbered 1 to " + n + " now, in the order they were drawn. That is a new version of "
        + (n === 1 ? "that one" : "each of them") + " with nothing but the name changed.");
      /* The rows in hand were patched above, so the list on screen is right; the clock is
         cleared so the next real read goes to the backend rather than trusting a minute-old
         index this just changed. */
      try { TRACING_INDEX_AT = 0; } catch (_e){}
    }, function(e){ console.warn("[uJump tracing] numbering failed", e && e.message); });
  } catch (e){ console.warn("[uJump tracing] numbering failed", e && e.message); }
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
    /* ── AND WHAT IT LAST SENT ──────────────────────────────────────────────────  2026-09-23
       The same omission as the one the paragraph above describes, one field later. shared_sig is
       the fingerprint of the last submission and it is what tracingPublish refuses a re-send on;
       rebuilt without it, every press looked like a tracing that had never been sent. Søren's
       sheet: three rows for one organelle, 12 contours and 137 vertices on each of them.

       ANYTHING REMEMBERED ABOUT A TRACING BELONGS IN THIS LIST. That is now four fields, all with
       the same shape and the same failure -- so if a fifth is ever added, it goes here in the same
       breath. See src/what_was_sent_survives_a_re_add.py. */
    if(prior&&prior.shared_sig)t.shared_sig=prior.shared_sig;
    /* ── OR WHAT THE DATASET HOLDS, FOR ONE OPENED FROM IT ───────────────────────  2026-09-27
       There is no prior for a tracing opened from the dataset — it was never in TRACINGS_KEPT — so
       it had no signature, so tracingPublish could not tell an untouched re-add from a change and
       posted a version either way. Søren: "I don't want to get a new version of an organelle if
       there are no changes to it." The dataset's own copy signs as TRACING_EDIT_SIG, recorded when
       it was opened. See src/opening_an_organelle_is_not_changing_it.py. */
    if(!t.shared_sig&&TRACING_EDIT_SIG[t.id])t.shared_sig=TRACING_EDIT_SIG[t.id];
    /* ── AND WHETHER IT HAS ALREADY NAMED ITS CELL ───────────────────  2026-09-24
       The fifth field, and the paragraph above asked for it to go here in the same breath. Without
       it, every re-add of an outlined whole cell would offer to identify the cell again — and the
       community index it checks against does not refresh for a minute, so it would say yes.
       See src/outlining_a_whole_cell_is_identifying_it.py. */
    if(prior&&prior.identified_at){
      t.identified_at=prior.identified_at;
      t.identified_as=prior.identified_as;
      t.identified_certainty=prior.identified_certainty;
    }
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
  let sent=0, same=0;
  all.forEach(function(t){
    t.share_nochange=false;
    if(tracingPublish(t))sent++;
    else if(t.share_nochange)same++;   // already up there, unchanged: arrived, not waiting
  });
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
  tracingSay(sent+same===all.length
    ?what+' '+(all.length===1?'is':'are')+' in the dataset and in this page’s 3D export. '
     +(same?(same===all.length
        ?(all.length===1?'Nothing had changed since you last added it, so nothing was sent again. '
                        :'Nothing had changed since you last added them, so nothing was sent again. ')
        :same+' of them had not changed, so only the rest were sent again. '):'')
     +'Anybody can open '+(all.length===1?'it':'them')+' from the list at the bottom of this card '
     +'and add to '+(all.length===1?'it':'them')+' — that becomes the next version, with their '
     +'name beside yours, and nothing of this one is deleted.'
    :what+' '+(all.length===1?'is':'are')+' kept here and in your 3D export. '
     +(all.length===1?'It has':'They have')+' NOT reached the dataset yet — sign in with Google '
     +'(the account button, top right) and '+(all.length===1?'it goes':'they go')+' up on '
     +(all.length===1?'its':'their')+' own.');
  /* After the card's own sentence, because it appends to it (2026-09-27). */
  tracingNumberBareAfter(all);
  tracingFlushSoon();
  /* ── AND THE TRACED-OUTLINE INDEX IS NOW OUT OF DATE ────────────────  2026-09-24
     Søren, of a macrophage he had just traced: "This macrophage does not show the whole cell trace
     when opening in Neuroglancer." core/tracedoutlines.js reads that index ONCE, at page load, and
     nothing invalidated it — so the cell name's ↗ was asking a set fetched before this tracing
     existed. The delay is the one every other submission here uses: Apps Script needs a moment to
     append the row before a re-read would see it. Refreshing rather than merely clearing, because
     the filter's Whole cell / Nucleus counts read the same set and should gain this cell too. */
  setTimeout(function(){
    try {
      if (typeof window.tracedKindsRefresh === "function") window.tracedKindsRefresh(true);
      else if (typeof tracedKindSets === "function") tracedKindSets(true);
    } catch (_e){}
  }, 2500);
  /* LAST, and after tracingSay: the offer sits under the card's own sentence about the press, and
     tracingPendingClear() above would have removed it if it had been built first (2026-09-24). */
  try { tracingIdAsk(all); } catch (_e){}
}

/* ── OUTLINING A WHOLE CELL IS IDENTIFYING IT ────────────────────────  2026-09-24
   Søren: "It is tedious that I have to both identify the cell when I input segmentation and then
   afterwards also identify it again."

   The card already asked which cell this is; the answer went into the tracing's row as a label and
   was read by nothing as an identification. So the press now offers to make it one. The one thing
   the card does not know is how sure he is, and that is not a formality — the 1-5 rating is what
   settles a tie between two proposed names in core/panel.js's tally — so it is the one question
   asked. See src/outlining_a_whole_cell_is_identifying_it.py for why each guard below is there. */
var TRACING_ID_OFFER = null;

/* The cell's own coordinate, from the page's table rather than from wherever the pad was: an
   identification is filed at the cell, and the nucleus centre is what every other one carries. */
function tracingIdCoord(t, nid){
  try {
    if (nid && typeof nidToIndex === "function" && typeof NX !== "undefined"){
      var i = nidToIndex(String(nid));
      if (i >= 0) return [NX[i], NY[i], NZ[i]].join(",");
    }
  } catch (_e){}
  return String((t && t.cell_coord) || "");
}

function tracingIdCandidate(t){
  try {
    if (!t || !t.id) return null;
    if (String(t.kind || "").toLowerCase() !== "cell") return null;   // a whole cell, nothing else
    if (t.identified_at) return null;                                 // asked and answered once
    var name = String(t.type || "").trim();
    if (!name || name.toLowerCase() === "traced") return null;
    /* THE PAGE'S OWN GUESS IS NOT HIS CLAIM. */
    if (!TRACING_TYPE_TOUCHED) return null;
    var nuc = String(t.nucleus_id || "").trim(), root = String(t.root_id || "").trim();
    if (!nuc && !root) return null;                                   // nowhere to file it
    if (typeof postReport !== "function") return null;                // no backend on this page
    /* ── AND ONLY WHERE THIS IS A THING THE BACKEND TAKES ──────────────────  2026-09-24
       The page must answer "what is this cell" out of its OWN nucleus tables rather than through
       UJ.cfg.tracing.identityFor. That is a proxy, and it was measured rather than assumed: the two
       tools that answer through the hook are ωJump and χJump — a volume’s nucleus keys and an
       assembly’s key — and neither backend has a `new_identification` to send one to.
       ηJump, βJump and λJump do have one and would be welcome here; they are excluded by the line
       after this instead, because nothing on those pages can say a cell is still unnamed, and
       offering to name a cell somebody has already named is the one thing this must not do. */
    var hook = null;
    try { hook = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.identityFor : null; } catch (_e){}
    if (typeof hook === "function") return null;
    var id = null;
    try { id = tracingIdentityFor(nuc, root); } catch (_e){ return null; }
    if (!id) return null;                        // the page cannot say; guessing would be worse
    if (String(id.name || "").trim()) return null;   // already named, by somebody or something
    return { t: t, name: name,
             nuc: nuc || String(id.nucleusId || ""), root: root || String(id.rootId || ""),
             coord: tracingIdCoord(t, nuc || id.nucleusId) };
  } catch (_e){ return null; }
}

function tracingIdClear(){
  TRACING_ID_OFFER = null;
  var el = document.getElementById("tracingIdOffer");
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
/* Built here rather than in eight pages' markup: the card's own element list is a contract, and
   this is one panel that appears on a press and goes again. It sits directly under
   #tracingStatus, which is where the sentence about the press is. */
function tracingIdHost(){
  var st = document.getElementById("tracingStatus");
  if (!st || !st.parentNode) return null;
  var el = document.getElementById("tracingIdOffer");
  if (!el){
    el = document.createElement("div");
    el.id = "tracingIdOffer";
    el.style.cssText = "margin-top:8px;padding:8px 10px;border:1px solid var(--accent,#40e28c);"
                     + "border-radius:7px;font-size:12px;line-height:1.45";
    st.parentNode.insertBefore(el, st.nextSibling);
  }
  return el;
}

function tracingIdAsk(all){
  tracingIdClear();
  var cands = (all || []).map(tracingIdCandidate).filter(Boolean);
  if (!cands.length) return;
  var c = cands[0], el = tracingIdHost();
  if (!el) return;
  TRACING_ID_OFFER = { c: c, cert: "" };
  var pills = [1, 2, 3, 4, 5].map(function(n){
    return '<button type="button" class="tid-cert" data-val="' + n + '" style="width:32px;'
         + 'height:32px;border-radius:50%;border:1px solid var(--line,#ccc);background:transparent;'
         + 'color:inherit;font-weight:600;cursor:pointer">' + n + '</button>';
  }).join("");
  el.innerHTML =
      '<div><b>Identify this cell as “' + escHtml(c.name) + '”?</b></div>'
    + '<div style="margin-top:3px">You have outlined the whole of it and nothing is on file for it '
    + 'yet — that name is what the “Which cell is it part of?” box above says. One '
    + 'thing is missing: how sure are you? That rating is what settles it if somebody later '
    + 'proposes a different name.</div>'
    + '<div style="display:flex;gap:6px;align-items:center;margin:7px 0">' + pills
    + '<span style="margin-left:6px;opacity:.75">1 = not sure, 5 = certain</span></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button type="button" class="idbtn" id="tracingIdGo" style="width:auto;padding:4px 12px">'
    + 'Identify it</button>'
    + '<button type="button" class="hist-chip" id="tracingIdNo">Not now</button></div>'
    + '<div id="tracingIdSaid" style="margin-top:6px"></div>'
    + (cands.length > 1
        ? '<div style="margin-top:6px;opacity:.75">' + (cands.length - 1) + ' other whole-cell '
          + 'outline' + (cands.length === 2 ? '' : 's') + ' in this press '
          + (cands.length === 2 ? 'is' : 'are') + ' not offered here — one cell at a time, or '
          + 'identify ' + (cands.length === 2 ? 'it' : 'them') + ' from the cell panel as usual.</div>'
        : "");
  [].slice.call(el.querySelectorAll(".tid-cert")).forEach(function(bt){
    bt.addEventListener("click", function(){
      if (!TRACING_ID_OFFER) return;
      TRACING_ID_OFFER.cert = bt.getAttribute("data-val") || "";
      [].slice.call(el.querySelectorAll(".tid-cert")).forEach(function(x){
        var on = x === bt;
        x.style.background = on ? "var(--accent,#40e28c)" : "transparent";
        x.style.color = on ? "var(--on-accent,#000)" : "inherit";
        x.style.borderColor = on ? "var(--accent,#40e28c)" : "var(--line,#ccc)";
      });
      var said = document.getElementById("tracingIdSaid");
      if (said) said.innerHTML = "";
    });
  });
  var go = document.getElementById("tracingIdGo");
  if (go) go.addEventListener("click", tracingIdSubmit);
  var no = document.getElementById("tracingIdNo");
  if (no) no.addEventListener("click", tracingIdClear);
}

function tracingIdSubmit(){
  var o = TRACING_ID_OFFER;
  if (!o) return;
  var said = document.getElementById("tracingIdSaid");
  if (!o.cert){
    if (said) said.innerHTML = '<span style="color:var(--bad,#c33)">Pick how certain you are, '
                             + '1 to 5, before submitting.</span>';
    return;
  }
  var c = o.c, t = c.t;
  var sections = (t.rings || []).length;
  var vol = isFinite(t.volume_um3)
    ? (t.volume_um3 >= 1 ? t.volume_um3.toFixed(2) : t.volume_um3.toFixed(4)) : "";
  /* The row says where the claim came from, in words, before any column is read — the same thing
     tracingRegisterCentre does for an organelle's centre annotation. */
  var comment = "Identified from the whole-cell outline traced on this cell"
    + (sections ? " (" + sections + " contour" + (sections === 1 ? "" : "s")
                + (vol ? ", " + vol + " µm³" : "") + ")" : "")
    + (t.id ? ", structure " + t.id : "") + ".";
  var payload = { type: "new_identification", timestamp: new Date().toISOString(),
                  nucleusId: c.nuc, rootId: c.root, coord: c.coord,
                  identified: (typeof canonSubmitName === "function")
                                ? canonSubmitName(c.name) : c.name,
                  certainty: o.cert,
                  comment: comment,
                  /* No tree was walked, so there is no path. Left empty rather than filled with a
                     sentence: that column means "the questions answered to get here". */
                  path: "",
                  source: "segmentation", fromStructureId: t.id || "" };
  var go = document.getElementById("tracingIdGo");
  if (go){ go.disabled = true; go.textContent = "Identifying…"; }
  var answer = postReport(payload, "Identified — thank you. This cell is now “"
                                   + c.name + "”, credited to you.");
  var landed = function(res){
    if (res && res.ok === false){
      if (go){ go.disabled = false; go.textContent = "Identify it"; }
      if (said) said.innerHTML = '<span style="color:var(--bad,#c33)">It was not recorded — '
                               + 'postReport has said why. Nothing about your outline changed.</span>';
      return;
    }
    /* Remembered on the TRACING, and carried across a re-add, so a second press does not ask again
       (the community index it checks does not refresh for a minute). */
    t.identified_at = new Date().toISOString();
    t.identified_as = payload.identified;
    t.identified_certainty = o.cert;
    try { tracingWrite(TRACINGS_KEPT); } catch (_e){}
    if (go && go.parentNode) go.parentNode.removeChild(go);
    var noBtn = document.getElementById("tracingIdNo");
    if (noBtn && noBtn.parentNode) noBtn.parentNode.removeChild(noBtn);
    if (said) said.innerHTML = "🎉 Identified as “" + escHtml(c.name)
      + "”, certainty " + escHtml(String(o.cert)) + "/5, credited to you. The cell’s name "
      + "changes here in a moment, and anybody who disagrees can propose another — which is why "
      + "the rating matters.";
    TRACING_ID_OFFER = null;
    /* WHAT RENAMES THE CELL. Not a write over the headline: loadCommunityReports is the function
       that promotes a winning community name into #ctHeadline, so this cell is renamed by exactly
       the path an identification made through the guided form renames it by. The delay is the one
       every other submission here uses — Apps Script needs a moment to append the row before a
       GET would see it. */
    setTimeout(function(){
      try {
        var open = (typeof CUR_NUCID !== "undefined") ? CUR_NUCID : null;
        if (typeof loadCommunityReports === "function" && (!open || String(open) === String(c.nuc)))
          loadCommunityReports(c.nuc, (window.CUR_POS || null));
      } catch (_e){}
      try { if (typeof loadClassificationHistory === "function") loadClassificationHistory(c.nuc); }
      catch (_e){}
    }, 2500);
  };
  if (answer === false){ landed({ ok: false }); return; }
  if (answer && typeof answer.then === "function")
    answer.then(landed, function(){ landed({ ok: false }); });
  else landed({ ok: true });
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

/* ── WHAT WAS LAST SENT ──────────────────────────────────────────────────────  2026-09-23
   Søren, on Hesham's rows: "he was able to log it again and again ... It should only be possible to
   log an organelle once and then update the same one if there are changes."

   His structureId never changed -- it was one organelle gaining a version per press, 10 of his 18
   rows carrying nothing new. So this is the fingerprint of a submission as the BACKEND sees it:
   everything that lands in the row, and every contour. NOT the timestamp and NOT the groupId, which
   differ on every press by construction and would make every save look like a change.
   See src/an_unchanged_tracing_is_not_sent_again.py. */
function tracingShareSig(sub){
  try {
    const c = (sub.contours || []).map(function(r){
      return r.z + ":" + r.ringIndex + ":" + (r.points || "");
    }).join("|");
    return [sub.structureId, sub.name, sub.kind, sub.cellType, sub.color,
            sub.nucleusId, sub.rootId, sub.cellCoord, sub.instanceOf, sub.instanceIndex,
            (sub.contours || []).length, c].join("\u0001");
  } catch (_e){ return ""; }
}
/* ── WHAT THE TRACING'S MEASUREMENTS ARE, AT THE MOMENT IT IS SHARED ────────  2026-09-30
   Søren: "I would like that these numbers are saved there, so we can do graphs with them."

   Measured against THE CELL'S OUTLINES THE PAD IS HOLDING, and no others. Not a decision taken
   lightly: the three relational numbers -- nearest organelle, its surface distance, its centroid
   distance -- are about a set, and the cell may have outlines in the dataset that are not on the pad.
   Fetching all of them from Drive on every press would make Add slow for numbers nobody is reading
   yet, so the row carries `measuredSiblings` and the "Measure this cell" button measures against
   everything. A row measured against two siblings is then visibly not a row measured against eleven,
   which is the whole reason that column exists.

   Never throws and never blocks a share: a tracing that cannot be measured is still a tracing. */
function tracingPublishMeasurements(t){
  try {
    if (typeof tracedMeasurements !== "function" || !t || !t.rings || !t.rings.length) return null;
    const key = String(t.nucleus_id || "") + "|" + String(t.root_id || "");
    const as = function(k){
      return { structure_id: k.id, name: k.name || "", kind: k.kind || k.instance_of || "",
               type: k.type || "", instance_index: k.instance_index || "",
               nucleus_id: k.nucleus_id || "", root_id: k.root_id || "", rings: k.rings };
    };
    const list = (TRACINGS_KEPT || []).filter(function(k){
      return k && k.id && k.rings && k.rings.length
          && (String(k.nucleus_id || "") + "|" + String(k.root_id || "")) === key;
    }).map(as);
    /* The tracing being shared may not be in the kept list yet -- a first share puts it there
       afterwards -- and measuring it against a set it is not in would give it no distances at all. */
    if (!list.some(function(k){ return k.structure_id === t.id; })) list.push(as(t));
    const rows = tracedMeasurements(list,
      (typeof window.tracedMeasureOpts === "function") ? window.tracedMeasureOpts()
                                                       : { resNm: [4, 4, 40] }) || [];
    for (let i = 0; i < rows.length; i++){
      if (rows[i].structureId !== t.id) continue;
      const m = {};
      Object.keys(rows[i]).forEach(function(k){ if (k !== "structureId") m[k] = rows[i][k]; });
      return m;
    }
  } catch (_e){}
  return null;
}
/* ── A CELL IS RE-MEASURED WHEN SOMETHING IS ADDED TO IT ─────────────  2026-10-01
   Søren: "do I have to do this constantly or does it do it every time a lysosome is submitted?"

   A tracing carries its own measurements. Its SIBLINGS do not: the nearest organelle, its surface
   distance and its centroid distance are about a SET, and adding a lysosome changes the set. Every
   other organelle in that cell kept the answer it had. So the share schedules this.

   COALESCED -- five organelles added at once are one measurement pass for the cell.
   DELAYED -- Apps Script needs a moment to append the row before a read can see it, the same reason
     refreshUnclassifiedCounts has waited 2.5 s since 2026-08-09. Measuring at once would read an
     index without the new tracing in it and then call it `missing`, which is the alarming half of
     that sentence and would be wrong every single time.
   QUIET -- nothing is said when it works, because nothing happened that anybody asked about. A
     failure is said once, in the card's own line, and names the repair. */
var TRACING_REMEASURE = {}, TRACING_REMEASURE_T = 0, TRACING_REMEASURE_WAIT = 5000;
function tracingRemeasureCell(nuc, root){
  if (typeof window.tracedMeasureCells !== "function") return;
  var nid = String(nuc || ""), rid = String(root || "");
  /* A tracing filed against neither id has no cell to re-measure, and measuring "every tracing
     with no ids" together would invent neighbours for things that share nothing. */
  if (!nid && !rid) return;
  TRACING_REMEASURE[nid + "|" + rid] = { nuc: nid, root: rid };
  if (TRACING_REMEASURE_T) clearTimeout(TRACING_REMEASURE_T);
  TRACING_REMEASURE_T = setTimeout(tracingRemeasureRun, TRACING_REMEASURE_WAIT);
}
async function tracingRemeasureRun(){
  TRACING_REMEASURE_T = 0;
  /* Taken and cleared before the first await, so a share that happens while this is running
     schedules its own pass rather than being dropped into one already half spent. */
  const due = TRACING_REMEASURE; TRACING_REMEASURE = {};
  const keys = Object.keys(due);
  for (let i = 0; i < keys.length; i++){
    const c = due[keys[i]];
    let r;
    try { r = await window.tracedMeasureCells({ nuc: [c.nuc], root: [c.root] }); }
    catch (e){ r = { error: String(e && e.message || e) }; }
    if (r && r.error){
      try { console.warn("[measurements] " + r.error); } catch (_cw){}
      tracingSay("The tracing went up, but its cell\u2019s measurements were not saved \u2014 "
        + r.error + ". \u201cMeasure this cell\u201d on that cell in the list below will do it.",
        true);
      return;
    }
    try { console.log("[measurements] " + (c.nuc || c.root) + ": measured "
          + ((r && r.measured) || 0) + ", saved " + ((r && r.updated) || 0)); } catch (_cl){}
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
                                             areaUm2:t.area_um2, areas:t.areas,
                                             /* the shape and the distances, measured the same way
                                                and for the same reason as the volume -- see
                                                tracingPublishMeasurements above */
                                             measurements:tracingPublishMeasurements(t)});
  if(!sub.contours.length)return false;
  /* NOTHING NEW, NOTHING SENT (2026-09-23). The same test tracingPublish already applies to the
     centre annotation below -- whether it MOVED, not whether anything was pressed -- applied to the
     tracing itself. pending_share is cleared as well, or an unchanged tracing sits in the queue and
     goes out by itself on the next sign-in, which is the same row arriving later instead of now. */
  const sig=tracingShareSig(sub);
  if(sig&&t.shared_sig===sig){
    /* WHY IT DID NOT GO, for the caller (2026-09-23). tracingKeep writes the card's last word from
       `sent === all.length`, and a tracing that was refused as unchanged is not sent -- so pressing
       Add on something already in the dataset answered "It has NOT reached the dataset yet -- sign
       in with Google", which is alarming and the opposite of true. Two reasons not to send, and
       they need different sentences. */
    t.share_nochange=true;
    t.pending_share=false;
    tracingWrite(TRACINGS_KEPT);
    if(!quiet)tracingSay("\u201c"+(t.name||"That tracing")+"\u201d is already in the dataset and "
      +"nothing has changed since, so nothing was sent. Edit the outline or its details and add it "
      +"again to file a new version of it.");
    return false;
  }
  const ok=postReport(Object.assign({timestamp:new Date().toISOString(),groupId:gid},sub),
                      "Tracing added to the dataset \u2014 thank you.");
  if(ok===false)return false;
  t.share_nochange=false;
  t.shared_sig=sig;
  t.pending_share=false;
  t.shared_at=new Date().toISOString();
  /* THE CELL, NOT JUST THIS TRACING (2026-10-01). Scheduled whether or not the backend ends up
     refusing: a refused tracing is simply not in the index, and re-measuring the cell then
     re-confirms the numbers it already had rather than writing anything wrong. Threading a
     cancellation through the refusal promise would buy one avoided read-set and a second place
     for the two paths to disagree. */
  tracingRemeasureCell(t.nucleus_id, t.root_id);
  /* A PROMISE IS NOT A YES, 2026-09-21. λJump, βJump, ηJump and ωJump answer with a promise of
     {ok, error}; the backend can still refuse (a token that lapsed in flight, a deployment that
     does not know the type). A refused tracing goes back on the queue it would otherwise have been
     taken off, so it is sent on the next sign-in, and the card says why it was not. */
  if(ok&&typeof ok.then==="function"){
    ok.then(function(d){
      if(!(d&&d.ok===false))return;
      /* The signature is what says "this is already up there". A refusal means it is not, so it
         goes with the rest or the retry would be declined as an unchanged re-send. */
      t.pending_share=true; t.shared_at=""; t.shared_sig="";
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
      try { lg = UJ.traceloft.loft(tracingLoftRings(byInst[k]), res); } catch (_e){ lg = null; }
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
      siblings.push({ geo: q, tint: pad3DTint(lofts[i].inst), alpha: 1,
                      label: padLoftName(lofts[i]) });
    });

    /* ── WHAT A TRACED STRUCTURE IS CALLED ───────────────────────────────────────  2026-10-04
       Its annotation layer, which on the pad is the organelle: "mitochondrion", "lysosome". Søren,
       on what a shared picture should say: "if there are organelles, then also which organelles."
       The group has carried the name since the layers panel was written; nothing had ever asked it
       for the panel's sake. A layer with no name is left unlabelled rather than called
       "(unnamed layer)" on a picture somebody is about to post. */
    function padLoftName(L){
      var g = (tracingGroups() || []).filter(function(x){ return x.inst === L.inst; })[0];
      var nm = (g && g.layer ? String(g.layer) : "").trim();
      return nm ? (nm.charAt(0).toUpperCase() + nm.slice(1)) : "";
    }
    const drawn = siblings.concat(ghosts.map(function(x){
      return { geo: tracingM3D().prepare(x.mesh.positions, x.mesh.indices,
                                      { unitNm: 1000, frame: frame }),
               /* "cell" or "nucleus", for the panel's own buttons. It was already in hand here and
                  dropped on the way in. 2026-10-03. */
               what: x.what,
               label: x.label || "",
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
    /* ── THE SUBJECT HAS A NAME, AND THE PAD KNOWS THE CELL ──────────────────────────────
       The siblings and the ghosts were labelled from the day the corner block was written and the
       SUBJECT was not — the traced structure, the one thing the picture is of, was the one surface
       that never reached the legend. padLoftName() is sixty lines above.

       And the verdict and the place come off the card's own two fields. #tracingType's title says
       it is "suggested from the nucleus or root ID below, by the same precedence the rest of the
       tool uses: verified, then community-reported, then the MICrONS prediction" — so reading it
       here is reading that precedence rather than inventing a second one. 2026-10-04. */
    var padType = "", padVox = null;
    try {
      var te = document.getElementById("tracingType");
      padType = te && te.value && te.value !== "traced" ? String(te.value) : "";
      var ce = document.getElementById("tracingCellAt");
      var cv = ce && ce.value ? String(ce.value).split(",").map(function(t){
                 return parseInt(t, 10); }) : null;
      if (cv && cv.length === 3 && cv.every(function(n){ return isFinite(n); })) padVox = cv;
      else if (typeof window.tracingNucCentroid === "function"){
        var nc = window.tracingNucCentroid(pad3DIds().nuc);
        if (nc) padVox = [nc.xVox, nc.yVox, nc.zVox];
      }
    } catch (_e){}
    tracingM3D().show(host, geo, { lead: lead, ghosts: drawn, view: PAD3D_VIEW,
                                tint: pad3DTint(lofts[subject].inst),
                                label: padLoftName(lofts[subject]),
                                saveName: (padLoftName(lofts[subject]) || "tracing")
                                            .toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                                about: { verdict: padType, atVox: padVox },
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
    var res = (UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    var v = UJ.traceloft.volume(rings || [], res);
    /* ── AND WHAT SHAPE IT IS ──────────────────────────────────────────────  2026-09-30
       Gary: "could you potentially add a circularity metric to the organelles that are being
       segmented... I also want to have the distance from the organelle centroid to the nucleus
       centroid calculated and displayed for each organelle."

       Attached here rather than fetched at each of the four places that render a volume -- two in
       padVolume, two in tracingVolShow, and two of those four lines are identical, which makes
       them a poor thing to anchor an edit on. Riding along means every place that shows a volume
       shows the shape, including the one-line-each rendering when a pad holds several organelles,
       which is where "for each organelle" actually bites. */
    if (v && UJ.traceloft.shape){
      try { v.shape = UJ.traceloft.shape(rings || [], res); } catch (_e){}
    }
    /* And in three dimensions (2026-09-30): sphericity, elongation and flatness come from the
       lofted mesh, which the pad is building for its preview anyway. */
    if (v && UJ.traceloft.shape3d){
      try { v.shape3d = UJ.traceloft.shape3d(rings || [], res); } catch (_e){}
    }
    return v;
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
/* Two decimals is the whole useful range of a shape descriptor: they all live in (0, 1] except the
   aspect ratio, and a third digit on a hand-clicked outline is noise being reported as measurement. */
function shapeFmt(v){ return (typeof v === "number" && isFinite(v)) ? v.toFixed(2) : "?"; }
/* How far this organelle's centre is from the cell's nucleus, and which nucleus that was. Returns
   "" when the page cannot answer -- ωJump has no nucleus table, and a cell whose id nobody typed
   has no nucleus to be far from. The hook is window.tracingNucCentroid(nucleusId), which µJump
   defines; see src/the_card_says_what_shape_the_organelle_is.py. */
function tracingNucDistSay(shape){
  try {
    if (!shape || !shape.ok || !shape.centroid) return "";
    if (typeof window.tracingNucCentroid !== "function") return "";
    var el = document.getElementById("tracingNucId");
    var nid = el ? (el.value || "").trim() : "";
    if (!nid) return "";
    var nc = window.tracingNucCentroid(nid);
    if (!nc || !isFinite(nc.xVox)) return "";
    var res = (UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    var dx = (shape.centroid.xVox - nc.xVox) * res[0],
        dy = (shape.centroid.yVox - nc.yVox) * res[1],
        dz = (shape.centroid.zVox - nc.zVox) * res[2];
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;
    return " Its centre is " + d.toFixed(2) + " \u00b5m from the "
      + (nc.from || "nucleus") + ".";
  } catch (e){ return ""; }
}
function tracingShapeSay(shape){
  if (!shape || !shape.ok || !shape.atMaxArea) return "";
  var t = shape.atMaxArea, m = shape.median || {};
  var s = " Widest section: circularity " + shapeFmt(t.circularity)
        + ", aspect ratio " + shapeFmt(t.aspectRatio)
        + ", roundness " + shapeFmt(t.roundness)
        + ", solidity " + shapeFmt(t.solidity) + ".";
  if (shape.sections > 1)
    s += " Median over " + shape.sections + " sections: " + shapeFmt(m.circularity) + " / "
       + shapeFmt(m.aspectRatio) + " / " + shapeFmt(m.roundness) + " / " + shapeFmt(m.solidity) + ".";
  return s + tracingNucDistSay(shape);
}
/* THE SOLID, AND WHICH CONVENTION (2026-09-30). Sphericity has two definitions in common use and
   MorphoLibJ's is Wadell's cubed, so a sentence that just says "sphericity 0.73" is a number
   nobody can line up with FIJI. Both are named. Elongation and flatness replace the 2D aspect
   ratio, which is the whole gain of measuring the solid: a cigar and a pancake look alike in one
   section and score opposite ways round here. */
function tracingShape3dSay(d3){
  if (!d3 || !d3.ok) return "";
  return " In 3D: sphericity " + shapeFmt(d3.sphericityWadell) + " (Wadell) / "
       + shapeFmt(d3.sphericityMorphoLibJ) + " (MorphoLibJ), elongation "
       + shapeFmt(d3.elongation) + ", flatness " + shapeFmt(d3.flatness)
       + (d3.solidity3d !== null && d3.solidity3d !== undefined
            ? ", solidity " + shapeFmt(d3.solidity3d) : "") + ".";
}
function tracingVolumeSay(v){
  if (!v) return "";
  if (!v.ok){
    /* One section has no volume, but it still has a shape and a place -- which is the whole of
       what Gary asked for, so it is said here too rather than only once there are two. */
    return v.areaUm2 !== undefined
      ? "Outlined area " + volFmt(v.areaUm2) + " µm² on one section — " + v.reason + "."
        + tracingShapeSay(v.shape)
      : "";
  }
  return "Volume " + volFmt(v.volumeUm3) + " µm³ (Cavalieri, " + v.sections
    + " section" + (v.sections === 1 ? "" : "s") + " every " + Math.round(v.gapNm) + " nm"
    + (v.evenlySpaced ? "" : ", unevenly spaced") + "). "
    + volFmt(v.volumeTrapezoidUm3) + " µm³ between the outermost contours, which is the "
    + "lower bound — the difference is what lies past them."
    + tracingShapeSay(v.shape) + tracingShape3dSay(v.shape3d);
}
/* ── DROP REDUNDANT POINTS, ON THE PAD ───────────────────────────────────────  2026-09-22
   Søren: "I don't see anywhere I can reduce the number of points" -- he was on the pad, and the
   button was in the found panel. The same offer, on the contours he is actually holding. See
   src/the_pad_can_drop_redundant_points_too.py. */
/* Ticking it is a different picture, so the preview is rebuilt. Wired where the button is. */
function padSmoothWire(){
  const el = document.getElementById("tracePadSmoothZ");
  if (!el || el.dataset.wired) return;
  el.dataset.wired = "1";
  el.addEventListener("change", function(){ try { pad3DSoon(); } catch (_e){} });
}
function padThinGain(){
  if (!PAD || !PAD.rings || !PAD.rings.length) return null;
  if (!(window.UJ && UJ.tracing && UJ.tracing.simplifyRings)) return null;
  const r = UJ.tracing.simplifyRings(PAD.rings.map(function(x){
    return { z: x.z, points: x.points };
  }), thinVox("padThinNm"));
  if (!r.before || r.after >= r.before) return null;
  return r;
}
function padThinShow(){
  const btn = document.getElementById("padThin");
  if (!btn) return;
  if (!btn.dataset.wired){ btn.dataset.wired = "1"; btn.addEventListener("click", padThinRun); }
  try { padSmoothWire(); } catch (_e){}
  const row = document.getElementById("padThinNmRow");
  if (row) row.style.display = (PAD && PAD.rings && PAD.rings.length) ? "flex" : "none";
  const nm = document.getElementById("padThinNm");
  if (nm && !nm.dataset.wired){ nm.dataset.wired = "1"; nm.addEventListener("input", padThinShow); }
  const g = padThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \u2192 "
                         + g.after.toLocaleString() + ")";
}
function padThinRun(){
  const g = padThinGain();
  if (!g){ padSay("There is nothing redundant left to drop."); return; }
  const volBefore = tracingVolumeOf(UJ.tracepad.toRings(PAD));
  /* In place, keeping z and the instance: it is the same contour with fewer vertices on it. */
  PAD.rings.forEach(function(r, i){
    const s = g.rings[i];
    if (s && s.points) r.points = s.points;
  });
  const volAfter = tracingVolumeOf(UJ.tracepad.toRings(PAD));
  padPaint();
  padRings();
  const volSay = (volBefore && volAfter && volBefore.ok)
    ? " The volume is " + tracingVolumeSay(volAfter) + " \u2014 it was "
      + tracingVolumeSay(volBefore) + "."
    : "";
  padSay("Dropped " + (g.before - g.after).toLocaleString() + " redundant point"
    + (g.before - g.after === 1 ? "" : "s") + ": " + g.before.toLocaleString() + " \u2192 "
    + g.after.toLocaleString() + ". No point of the outline moved more than " + g.nm
    + " nm." + volSay
    + " Nothing is shared until you press \u201cUse these contours\u201d.");
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
    try { padThinShow(); } catch (_e){}
    return null;
  }
  const v = tracingVolumeOf(all);
  el.textContent = v ? tracingVolumeSay(v) : "";
  /* padVolume runs after every close, every delete and every section change, which is every way
     the contours can change -- so the offer follows them without a hook of its own. */
  try { padThinShow(); } catch (_e){}
  return v;
}
/* The same figure beside the button that submits, because that is where it is being decided. A
   tracing that arrived on a pasted link never passed the pad, so it cannot be padVolume's job. */
/* ── DROP REDUNDANT POINTS ───────────────────────────────────────────────────  2026-09-22
   Søren: "OK, if I paste the neuroglancer state in the tracing, will it reduce the number of points
   and make it a polyline?" -- it did not; the simplification was on the way OUT only. He chose a
   button over doing it on paste, so this is the button. See
   src/a_button_drops_the_redundant_points.py.

   It is offered only when a tenth or more of the points would go, and it hides once they have. The
   volume is recomputed and said: "I pressed a button and my cell got smaller" is the one outcome
   this must not have in silence. */
/* The tolerance the boxes hold, in nanometres -- see src/the_tolerance_is_in_nanometres.py. */
function thinNmOf(id){
  try {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    if (v > 0) return v;
  } catch (_e){}
  try { return UJ.tracing.simplifyDefaultNm(); } catch (_e){}
  return 16;
}
function thinVox(id){
  try { return UJ.tracing.simplifyTolVox(thinNmOf(id)); } catch (_e){ return thinNmOf(id) / 4; }
}
function tracingThinGain(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return null;
  if (!(window.UJ && UJ.tracing && UJ.tracing.simplifyRings)) return null;
  const r = UJ.tracing.simplifyRings(rings.map(function(x){ return { z: x.z, points: x.points }; }),
                                     thinVox("tracingThinNm"));
  /* ANY point, not a tenth of them (2026-09-22): a threshold made this a button that is not there
     when it would do something, and a hidden control cannot be argued with. */
  if (!r.before || r.after >= r.before) return null;
  return r;
}
/* ── DROP REDUNDANT SECTIONS ─────────────────────────────────────────────────  2026-09-23
   Søren: "Can we reduce z-layers that are redundant in addition?" A section on the straight line
   between its neighbours adds nothing to the mesh (which bands straight) or to the volume (a
   trapezoid sum over the sections). See src/redundant_sections_can_go_too.py. */
function tracingThinZGain(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return null;
  if (!(window.UJ && UJ.traceloft && UJ.traceloft.thinSections)) return null;
  const r = UJ.traceloft.thinSections(rings, { nm: thinNmOf("tracingThinNm") });
  if (!r || r.after >= r.before) return null;
  return r;
}
function tracingThinZShow(){
  const btn = document.getElementById("tracingThinZ");
  if (!btn) return;
  if (!btn.dataset.wired){ btn.dataset.wired = "1"; btn.addEventListener("click", tracingThinZRun); }
  const g = tracingThinZGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant sections (" + g.before + " \u2192 " + g.after + ")";
}
function tracingThinZRun(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return;
  const g = tracingThinZGain();
  if (!g){ tracingSay("No section lies close enough to the line between its neighbours to drop."); return; }
  const vb = tracingVolumeOf(rings);
  TRACING_PENDING.rings = g.rings.map(function(r){
    return { z: r.z, points: r.points, inst: r.inst || 0 };
  });
  const gs = tracingGroups();
  if (gs){
    const keep = {};
    g.rings.forEach(function(r){ keep[+r.z] = 1; });
    gs.forEach(function(grp){
      grp.rings = (grp.rings || []).filter(function(r){ return keep[+r.z]; });
    });
  }
  const va = tracingVolumeOf(TRACING_PENDING.rings);
  tracingLayersRender();
  tracingVolShow();
  tracingThinShow();
  tracingThinZShow();
  pad3DSoon();
  /* THE STABLE FIGURE, and a word about the other one. volumeTrapezoidUm3 integrates between the
     outermost contours and does not move when sections go; the headline Cavalieri figure gives
     every section a full slab and therefore does. Measured in thinzcheck.js: a cylinder thinned to
     its two ends keeps its trapezoid volume exactly and DOUBLES its Cavalieri one. */
  let volSay = "";
  if (vb && va && vb.ok && va.ok){
    const b0 = vb.volumeTrapezoidUm3, a0 = va.volumeTrapezoidUm3;
    const moved = b0 ? Math.abs(a0 - b0) / b0 : 0;
    volSay = " Between the outermost contours it is " + volFmt(a0) + " \u00b5m\u00b3, was "
           + volFmt(b0) + " (" + (100 * moved).toFixed(2) + "%). The Cavalieri figure above moves "
           + "more, because every remaining section now stands for a wider slab.";
  }
  tracingSay("Dropped " + (g.before - g.after) + " section" + (g.before - g.after === 1 ? "" : "s")
    + ": " + g.before + " \u2192 " + g.after + ". No contour was further than " + g.worstNm
    + " nm from the line between the sections either side of it." + volSay
    + " Nothing is saved until you add it \u2014 read the link again to get every section back.");
}
function tracingThinShow(){
  const btn = document.getElementById("tracingThin");
  if (!btn) return;
  const row = document.getElementById("tracingThinNmRow");
  const any = !!(TRACING_PENDING && (TRACING_PENDING.rings || []).length);
  if (row) row.style.display = any ? "flex" : "none";
  const nm = document.getElementById("tracingThinNm");
  if (nm && !nm.dataset.wired){
    nm.dataset.wired = "1";
    nm.addEventListener("input", tracingThinShow);
  }
  const g = tracingThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \u2192 "
                         + g.after.toLocaleString() + ")";
  try { tracingThinZShow(); } catch (_e){}
}
function tracingThinRun(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return;
  const g = tracingThinGain();
  if (!g){ tracingSay("There is nothing redundant left to drop."); return; }
  const volBefore = tracingVolumeOf(rings);
  /* The INSTANCE goes with the contour: three mitochondria must stay three. */
  const out = [];
  rings.forEach(function(r, i){
    const s = g.rings[i];
    out.push({ z: r.z, points: (s && s.points) || r.points, inst: r.inst || 0 });
  });
  TRACING_PENDING.rings = out;
  /* The ticked layers hold their own copies, or a re-tick would put the old points back. */
  const gs = tracingGroups();
  if (gs){
    gs.forEach(function(grp){
      grp.rings = (grp.rings || []).map(function(r){
        const s = UJ.tracing.simplifyRings([{ z: r.z, points: r.points }]);
        return { z: r.z, points: s.rings[0].points, inst: r.inst };
      });
    });
  }
  const volAfter = tracingVolumeOf(TRACING_PENDING.rings);
  tracingLayersRender();
  tracingVolShow();
  tracingThinShow();
  pad3DSoon();
  const volSay = (volBefore && volAfter && volBefore.ok)
    ? " The volume is " + tracingVolumeSay(volAfter) + " \u2014 it was "
      + tracingVolumeSay(volBefore) + "."
    : "";
  tracingSay("Dropped " + (g.before - g.after).toLocaleString() + " redundant point"
    + (g.before - g.after === 1 ? "" : "s") + ": " + g.before.toLocaleString() + " \u2192 "
    + g.after.toLocaleString() + ". No point of the outline moved more than " + g.nm
    + " nm." + volSay
    + " Nothing is saved until you add it \u2014 read the link again to get every point back.");
}
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
/* The button lives and dies with the volume line, which is the other thing said about the size of
   what is in hand. Wired once, on the first render that finds it. */
function tracingThinWire(){
  const btn = document.getElementById("tracingThin");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";
  btn.addEventListener("click", tracingThinRun);
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

/* ── THE DESTINATION THAT CANNOT BE FULL ───────────────────────────────────────  2026-10-04
   Søren: *"I just lost 2 hours of work."*

   Every place this card keeps a draft can say no. localStorage has a quota and said so. The account
   needs somebody to be signed in and a network to reach. A FILE ON HIS OWN DISK needs neither, has
   no quota this code can exhaust, and is the only one of the three that is still there after the
   tab is closed, the browser updated, the site data cleared.

   SO IT IS WRITTEN WITHOUT BEING ASKED, the moment anything else refuses, and the banner goes up as
   well rather than instead — a programmatic download is a thing a browser may decline silently, so
   the button has to be there whether or not the automatic one landed.

   AND AGAIN AS THE WORK GROWS. The first version wrote one file per draft per page, which would
   have handed him a file from the minute it first failed and lost the hour he drew afterwards.
   Another twenty-five contours or another five minutes and it writes a fresh one. That is a handful
   of files in a long session, which is the right trade against a handful of hours. */
var DRAFT_ALARM_FOR = "", DRAFT_RESCUED = {};
function draftFileName(d){
  return tracingSafeName((d && d.title) || "tracing") + "_draft_"
       + String((d && d.at) || new Date().toISOString()).replace(/[:.]/g, "-") + ".json";
}
function draftToFile(d){
  try {
    tracingSaveBlob(new Blob([JSON.stringify(d)], { type: "application/json" }), draftFileName(d));
    return true;
  } catch (_e){ return false; }
}
function draftRescue(d, why){
  if (!d || !d.id) return;
  var now = Date.now(), n = (d.rings || []).length, was = DRAFT_RESCUED[d.id];
  if (!was || n - was.n >= 25 || now - was.at >= 300000){
    DRAFT_RESCUED[d.id] = { n: n, at: now };
    draftToFile(d);
  }
  draftAlarmShow(d, why);
}
/* IT STAYS UP UNTIL A SAVE WORKS. padSay's line is one sentence in a status row that the next
   thing to happen overwrites — which is what he saw: it "complained some times", and then the pad
   went on looking normal. This does not go away on its own. */
function draftAlarmShow(d, why){
  var el = document.getElementById("tracingDraftAlarm");
  DRAFT_ALARM_FOR = d.id;
  if (!el) return;
  var n = (d.rings || []).length;
  el.style.display = "";
  el.innerHTML =
    "<b>This tracing is not saved.</b> " + escHtml(String(why || "the browser refused it")) + ", so "
    + "the " + n + " contour" + (n === 1 ? "" : "s") + " on the pad "
    + (draftSignedIn() ? "went to your account, but there is no copy in this browser."
                       : "are only on this pad — and you are not signed in, so there is no "
                         + "copy on your account either.")
    + " <b>A file has been downloaded to this machine.</b> Take another whenever you like; the pad "
    + "reopens from it with <i>Open a draft file</i> below."
    + " <button type=\"button\" id=\"tracingDraftFile\" style=\"margin-left:6px\">"
    + "Save this tracing to a file</button>";
  var b = document.getElementById("tracingDraftFile");
  if (b) b.addEventListener("click", function(){
    var now = draftNow() || d;
    DRAFT_RESCUED[d.id] = { n: (now.rings || []).length, at: Date.now() };
    var okFile = draftToFile(now);
    padSay(okFile ? "Written to your downloads folder."
                  : "The browser would not write the file \u2014 use its own Save page as, or sign in.",
           !okFile);
  });
}
function draftAlarmClear(id){
  if (id && DRAFT_ALARM_FOR && String(id) !== String(DRAFT_ALARM_FOR)) return;
  DRAFT_ALARM_FOR = "";
  var el = document.getElementById("tracingDraftAlarm");
  if (el){ el.style.display = "none"; el.innerHTML = ""; }
}
/* ── AND THE TAB DOES NOT CLOSE QUIETLY ────────────────────────────────────────  2026-10-04
   Only while the alarm is up, so this never nags somebody whose work is kept. Browsers show their
   own wording; what matters is that there is a stop between two hours of contours and a reflex
   Ctrl-W. */
try {
  window.addEventListener("beforeunload", function(e){
    if (!DRAFT_ALARM_FOR) return;
    if (!(typeof PAD !== "undefined" && PAD && PAD.rings && PAD.rings.length)) return;
    e.preventDefault(); e.returnValue = ""; return "";
  });
} catch (_e){}

/* ── A SAVE MUST CONTINUE WHAT IT IS WRITING OVER ──────────────────────────────  2026-10-05
   Søren, on two tracings that ended up holding one set of contours: *"There is some problem with
   the nuclei segmentations here."*

   WHAT THE RECOVERED DATA SHOWS. Draft dmuub74uqjeq1kw belongs to nucleus 61360735 and said so
   correctly, all the way through. Its sheet row records 39 contours and 2041 vertices. At
   21:05:22 on 4 October it was written with 47 contours and 1927 vertices — byte-identical to the
   OTHER nucleus's tracing, which the pad was still carrying. The label was right and the rings
   were somebody else's, and every layer below accepted it: the draft, the Drive file, the row.

   SO THE RULE CANNOT BE ABOUT IDENTITY. A guard comparing nucleus ids would have waved this
   straight through, because the id was never wrong. The thing that was wrong is that a save
   REPLACED work instead of continuing it, and that is a question about the contours themselves.

   CONTINUITY, MEASURED. Drawing adds contours and edits them one at a time; between two autosaves
   1.2 s apart, almost every ring is still the ring it was. Swapping 39 for a disjoint 47 is not
   something a hand does. So each ring gets a cheap signature -- its section, its structure, how
   many points it has and where it starts -- and a save that keeps fewer than half of the stored
   draft's rings is not a continuation of it.

   HALF IS DELIBERATELY GENEROUS. Deleting a structure, or thinning a tracing in z, can legitimately
   drop a lot at once; the cost of a false fork is one extra draft in the list, and the cost of a
   false pass is what this is being written about. It triggers on a replacement, not on an edit.

   AND IT FORKS RATHER THAN REFUSING. Søren, asked: *"Fork to a new draft and tell you."* A refusal
   mid-tracing is its own way to lose work -- it stops the drawing and waits to be noticed. A fork
   never blocks and never overwrites: the new contours are kept under a new id, the old draft is
   left exactly as it was, and the list below shows both. Reconciling two drafts is a cheap problem.
   2026-10-05. */
/* ── WHERE A CONTOUR IS, NOT HOW MANY POINTS IT HAS ──────────────────────────────  2026-10-05
   The first version signed a ring by section, structure, POINT COUNT and first point, and
   tracingpanelcheck.js caught it within the hour: "drop the redundant points" rewrites every ring
   on the pad at once, so every signature changed, the overlap fell to nothing and a perfectly
   ordinary simplification forked the draft. A guard that fires on correct work is a guard somebody
   learns to ignore.

   SO A RING IS WHERE IT IS. Its section, its structure, and the centre of its points. Simplifying
   a contour barely moves its centre; dragging a vertex moves it a little; and the thing this is
   built to catch -- another cell's tracing arriving under this draft's id -- is somewhere else
   entirely. Søren's two nuclei sat 26,000 voxels apart in x, which is a hundred micrometres.

   FOUR MICROMETRES OF TOLERANCE, in the voxel units the pad draws in. Wide enough that no edit of
   one contour is mistaken for a replacement, narrow enough that two different cells never look
   like the same one. */
var RING_NEAR = 1000;
function ringAt(r){
  var p = (r && r.points) || [], i, x = 0, y = 0;
  if (!p.length) return null;
  for (i = 0; i < p.length; i++){ x += p[i][0]; y += p[i][1]; }
  return { k: (r.z) + "/" + (r.inst || 0), x: x / p.length, y: y / p.length };
}
function draftKeeps(stored, d){
  var had = [], have = {}, n = 0, kept = 0, i, a, list, j, near;
  ((stored && stored.rings) || []).forEach(function(r){ var q = ringAt(r); if (q){ had.push(q); n++; } });
  if (!n) return { n: 0, kept: 0, ok: true };
  ((d && d.rings) || []).forEach(function(r){
    var q = ringAt(r); if (!q) return;
    (have[q.k] = have[q.k] || []).push(q);
  });
  for (i = 0; i < had.length; i++){
    a = had[i]; list = have[a.k] || []; near = false;
    for (j = 0; j < list.length; j++){
      if (Math.abs(list[j].x - a.x) <= RING_NEAR && Math.abs(list[j].y - a.y) <= RING_NEAR){
        near = true; break;
      }
    }
    if (near) kept++;
  }
  return { n: n, kept: kept, ok: kept * 2 >= n };
}
function draftFork(d, keeps){
  var was = d.id;
  TRACING_DRAFT_ID = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  d.id = TRACING_DRAFT_ID;
  padSay("These contours are not a continuation of the tracing this draft held — "
    + keeps.kept + " of its " + keeps.n + " contour" + (keeps.n === 1 ? "" : "s")
    + " are still here — so they have been kept as a NEW unfinished tracing instead of written "
    + "over it. Nothing was lost: both are in the list below.", true);
  try { console.warn("[tracing] forked " + was + " -> " + d.id
                    + " (kept " + keeps.kept + "/" + keeps.n + ")"); } catch (_e){}
  return d;
}

/* ── A DRAFT IS NEVER ONLY IN A PLACE THAT CAN REFUSE ──────────────────────────  2026-10-04
   Søren, after two hours of a whole-cell tracing went: *"It had complained some times that it did
   not have enough space in the browser to save my draft. I just lost 2 hours of work."*

   THE ACCOUNT COPY WAS GATED BEHIND THE BROWSER COPY. The line was `if (wrote) draftPush(d, false)`
   under a comment that said "the browser first, always: it is the copy that cannot fail". It can
   fail; it told him so, repeatedly; and because it failed, the one copy that would have survived
   the tab closing was never even attempted. A fallback that only runs when the primary succeeded is
   not a fallback.

   THREE THINGS CHANGED, and every one of them is about the moment the browser says no.

     the account      pushed on every save and FORCED when the local write failed, instead of
                      being skipped. The two-minute throttle exists so drawing does not become a
                      Drive write per second; a failed local save is not drawing.
     a file           a .json straight to the disk. Not storage this code manages, not a quota,
                      not an account — the one destination that cannot be full and does not need
                      anyone to be signed in. Offered the instant the browser refuses, and left on
                      screen until it is taken.
     one key each     the whole list used to be re-serialised into a single key on every autosave,
                      so one tracing too big for the quota took the other forty-nine down with it
                      and nothing could be saved at all until something was deleted. Each draft now
                      has its own key and the index is small: a draft that cannot fit fails alone.

   SPLITTING THE OLD BLOB FREES SPACE RATHER THAN USING MORE. The v2 key held every draft; the
   migration writes each one to its own key and then replaces that key with the small index, so a
   browser that was full before is less full afterwards. The index is written LAST and only when
   every draft got somewhere, because an index naming a draft that is not there is worse than an
   old blob. */
function draftKeyFor(id){ return tracingScopedKey(TRACING_DRAFTS_KEY) + "#" + String(id); }

/* How much this origin is holding, in bytes, counting UTF-16 as the browsers do. null when the
   store is the in-memory one, which has no quota to report. */
function draftRoom(){
  var s, i, k, n = 0;
  try {
    s = tracingStore();
    if (typeof s.length !== "number" || typeof s.key !== "function") return null;
    for (i = 0; i < s.length; i++){ k = s.key(i); n += (String(k).length + String(s.getItem(k) || "").length) * 2; }
  } catch (_e){ return null; }
  return n;
}
function draftMB(n){ return (n / 1048576).toFixed(1) + " MB"; }

var draftStore = (function(){
  function keyOf(id){ return draftKeyFor(id); }
  function putOne(d){
    try { tracingStore().setItem(keyOf(d.id), JSON.stringify(d)); return true; }
    catch (_e){ return false; }
  }
  function getOne(id){
    try {
      var d = JSON.parse(tracingStore().getItem(keyOf(id)) || "null");
      return (d && Array.isArray(d.rings)) ? d : null;
    } catch (_e){ return null; }
  }
  function dropOne(id){ try { tracingStore().removeItem(keyOf(id)); } catch (_e){} }
  /* The index carries only what the list on screen shows, so it stays small enough to write even
     when the store is nearly full -- which is exactly when it has to be written. */
  function brief(d){
    return { id: d.id, title: d.title || "", at: d.at || "", n: (d.rings || []).length,
             nucId: d.nucId || "", rootId: d.rootId || "" };
  }
  function writeIndex(list){
    try { tracingStore().setItem(tracingScopedKey(TRACING_DRAFTS_KEY),
                                 JSON.stringify({ v: 3, index: list.map(brief) })); return true; }
    catch (_e){ return false; }
  }
  /* ONE WAY, AND IT FREES SPACE. Returns the list it split out, or null when there was no old
     blob to split.

     ONCE PER PAGE, WHATEVER HAPPENS. On a browser that is ALREADY full -- which is the one this
     was written for -- the per-draft writes fail, the index is not written, and the old blob stays
     exactly where it was. That is the right outcome: readAll still returns the drafts it parsed,
     so nothing is lost. What would be wrong is trying again on every render, several times a
     second, each time serialising every draft afresh. It is attempted once; if it could not be
     done it is left alone until the next load, by which time deleting a draft may have made room. */
  var SPLIT_TRIED = false;
  function splitOldBlob(){
    var raw = null, old = [], wrote = 0;
    try { raw = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFTS_KEY)) || "null"); }
    catch (_e){ return null; }
    if (!raw || !Array.isArray(raw.drafts)) return null;
    old = raw.drafts.filter(function(d){ return d && d.id && Array.isArray(d.rings); });
    if (SPLIT_TRIED) return old;
    SPLIT_TRIED = true;
    old.forEach(function(d){ if (putOne(d)) wrote++; });
    /* Only when every one of them landed. A half-split index would hide the half that did not. */
    if (wrote === old.length) writeIndex(old);
    return old;
  }
  function readAll(){
    var out = [], idx = null, raw;
    try { raw = JSON.parse(tracingStore().getItem(tracingScopedKey(TRACING_DRAFTS_KEY)) || "null"); }
    catch (_e){ raw = null; }
    if (raw && Array.isArray(raw.drafts)){
      out = splitOldBlob() || [];
    } else if (raw && Array.isArray(raw.index)){
      idx = raw.index;
      idx.forEach(function(b){
        var d = getOne(b.id);
        /* A draft named by the index but not on disk is listed from the index alone rather than
           dropped, so somebody can see that it was there and that something ate it. */
        out.push(d || { id: b.id, title: b.title, at: b.at, missing: true,
                        rings: new Array(Math.max(0, b.n | 0)), pending: [] });
      });
    }
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
  return {
    list: readAll,
    get: function(id){
      var d = getOne(id);
      if (d) return d;
      var m = readAll().filter(function(x){ return x.id === id && !x.missing; });
      return m.length ? m[0] : null;
    },
    put: function(d){
      var list = readAll(), at = -1, i;
      for (i = 0; i < list.length; i++) if (list[i].id === d.id){ at = i; break; }
      /* NOTHING IS DROPPED TO MAKE ROOM. One tracing was lost to a silent overwrite; the answer to
         a full list is not another one. A NEW draft is refused and said so; the ones already in the
         list go on saving. */
      if (at < 0 && list.length >= TRACING_DRAFTS_MAX){
        padSay("There are already " + TRACING_DRAFTS_MAX + " unfinished tracings kept here, so this "
          + "one was not added. Add or discard one below and it will keep itself from then on.",
          true);
        draftRescue(d, "there is no room in the list for another unfinished tracing");
        return false;
      }
      /* A SAVE MUST CONTINUE WHAT IT WRITES OVER. See the block above draftKeeps(): the pad can
         be carrying another tracing's rings while naming this draft correctly, and that is what
         cost the second nucleus its 39 contours. Forked, never refused. 2026-10-05. */
      if (at >= 0){
        var keeps = draftKeeps(list[at], d);
        if (!keeps.ok){ draftFork(d, keeps); at = -1; }
        else list.splice(at, 1, d);
      }
      if (at < 0) list.unshift(d);
      var wrote = putOne(d);
      if (wrote) writeIndex(list);
      /* ── THE ACCOUNT IS TRIED WHETHER OR NOT THE BROWSER TOOK IT ──────────────────────────
         This is the line that cost two hours. It used to read `if (wrote) draftPush(d, false)`,
         so the copy that survives a closed tab was attempted only when the copy that cannot
         survive one had already worked. Forced when the local write failed, because a throttle
         meant for "somebody is drawing" has no business delaying the one remaining copy. */
      draftPush(d, !wrote);
      if (!wrote) draftRescue(d, "this browser is out of storage"
                              + (draftRoom() ? " (it is holding " + draftMB(draftRoom()) + ")" : ""));
      else draftAlarmClear(d.id);
      return wrote;
    },
    drop: function(id){
      var list = readAll().filter(function(d){ return d.id !== id; });
      draftPushDelete(id);
      dropOne(id);
      draftAlarmClear(id);
      return writeIndex(list);
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
      /* THE REST OF THE ANSWER TOO (2026-09-30). It reduced a success to {ok:true}, which is all
         a tracing needs and throws away what a measurement batch replies -- how many rows it
         updated, and which structureIds it could not find. Merged, so every existing `res.ok`
         reads exactly as before. */
      return (d && (d.ok === true || d.status === "ok")) ? Object.assign({ ok: true }, d)
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
  /* ── EVERY STRUCTURE'S OWN KIND, COUNTED ─────────────────────────────────────  2026-10-05
     Søren, with a nucleus and a whole cell on one pad: "it says 2x whole cell mesh". It did, because
     this read the shared #tracingWhat select — which with "name each one separately" ticked shows
     the SELECTED structure's type and nothing about the others — and multiplied it by how many
     structures had contours.

     tracingKindFor(inst) has returned each structure's own kind since separate naming existed, and
     tracingCurrentAll() has used it to file them as separate tracings all along. This was the one
     place still asking the box. With separate naming OFF every structure shares one kind, so the
     old "2 \u00d7 Mitochondrion" comes out of the same arithmetic. */
  const seen = {}, order = [];
  try {
    UJ.tracepad.instances(PAD).filter(function(i){ return i.contours; }).forEach(function(i){
      const w = tracingKindFor(i.inst) || {};
      const nm = String(w.name || "").trim() || "structure";
      if (seen[nm] === undefined){ seen[nm] = 0; order.push(nm); }
      seen[nm]++;
    });
  } catch (_e2){}
  const what = order.map(function(nm){
    return (seen[nm] > 1 ? seen[nm] + " \u00d7 " : "") + nm;
  }).join(" + ");
  const bits = [];
  if (what) bits.push(what);
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
/* -- A RESCUE FILE THAT CANNOT BE REOPENED IS A SOUVENIR -----------------------  2026-10-04
   draftResumeFrom() has always taken a draft OBJECT rather than an id -- the path that fetches one
   from the account needed that -- so a file is a dozen lines on top of it. The draft keeps its own
   id, so carrying on writes back to the same draft rather than growing a second copy of it. */
function draftOpenFile(f){
  var r = new FileReader();
  r.onload = function(){
    var d = null;
    try { d = JSON.parse(String(r.result)); } catch (_e){}
    if (!d || !Array.isArray(d.rings)){
      padSay("That file is not a tracing draft — it should be the .json this card wrote.", true);
      return;
    }
    if (!d.id) d.id = draftCurrentId();
    draftResumeFrom(d);
    padSay(d.rings.length + " contour" + (d.rings.length === 1 ? "" : "s")
      + " back on the pad, from the file.");
  };
  r.onerror = function(){ padSay("That file could not be read.", true); };
  r.readAsText(f);
}
/* ── A DRAFT WITH ITS CONTOURS IN HAND ─────────────────────────  2026-10-05
   The list is an index: a draft that lives on the account carries its counts and not one
   coordinate, which is what makes listing it cheap. Anything that wants the rings has to ask first.

   "Resume it" has always done that, inline. "Save to file" needs exactly the same thing, and a
   second copy of one request is the shape of fault this file has spent the week on -- two
   expressions that agree until one of them is changed. So it is one helper, and both go through it.

   `then` is called with a draft that definitely has rings. It is not called at all when there is
   nothing to call it with, which is the honest answer to "there is no copy of this anywhere I can
   reach". */
function draftWithRings(id, d, then){
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
        then(got);
      })
      .catch(function(e){
        padSay("Could not reach your account to fetch that tracing: "
          + String(e && e.message || e), true);
      });
    return;
  }
  if (!d) return;
  then(d);
}
/* ── AND THE BUTTON THAT PUTS IT THERE ──────────────────────────  2026-10-05
   A file is the one destination with no quota, no sign-in, no deploy and no backend behind it. It
   was written automatically when the browser refused storage and by nothing else, so on the evening
   a whole cell existed in one tab and nowhere else the way to save it was a console command. */
function draftSaveToFile(id){
  const d = id ? draftStore.get(id) : draftRead();
  if (!d && !id){ padSay("There is no unfinished tracing to save.", true); return; }
  draftWithRings(id, d, function(got){
    if (draftToFile(got))
      padSay("Saved to \u201c" + draftFileName(got) + "\u201d \u2014 "
        + ((got.rings || []).length) + " contour"
        + (((got.rings || []).length) === 1 ? "" : "s")
        + ". That file goes back on the pad through \u201cOpen a draft file\u201d below, on any "
        + "machine and with nobody signed in.");
    else
      padSay("That tracing could not be written to a file.", true);
  });
}
function draftRender(){
  /* Wired here rather than where the card is built, because this runs on load whether or not there
     is a draft to list -- and the one moment somebody needs to open a rescue file is when there is
     nothing in the list to show them. Before the early return, for the same reason. */
  var fin = document.getElementById("tracingDraftFileIn");
  if (fin && !fin.getAttribute("data-wired")){
    fin.setAttribute("data-wired", "1");
    fin.addEventListener("change", function(){
      if (fin.files && fin.files[0]) draftOpenFile(fin.files[0]);
    });
  }
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
          /* BEFORE Discard, and on every row including one that is only on the account —
             that one has no contours in the index and is fetched first. 2026-10-05. */
          + '<button type="button" class="hist-chip draftfile" data-id="' + escHtml(d.id) + '" '
            + 'title="Write this unfinished tracing to a .json file. No quota, no sign-in — and '
            + 'it comes back through “Open a draft file” below.">Save to file</button>'
          + '<button type="button" class="hist-chip draftdrop" data-id="' + escHtml(d.id) + '">'
            + 'Discard</button>'
          + '</div>';
      }).join("");
  [].slice.call(bar.querySelectorAll(".draftres")).forEach(function(b){
    b.addEventListener("click", function(){ draftResume(b.dataset.id); });
  });
  [].slice.call(bar.querySelectorAll(".draftfile")).forEach(function(b){
    b.addEventListener("click", function(){ draftSaveToFile(b.dataset.id); });
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
  draftWithRings(id, d, function(got){
    /* ADOPTED HERE AND NOT IN THE HELPER: saving a draft to a file must not make it the one the pad
       is about to write over. The fetch is shared; what each button does with what comes back is
       not. */
    TRACING_DRAFT_ID = got.id || id || TRACING_DRAFT_ID;
    draftResumeFrom(got);
  });
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
/* ── ONE READ OF THE INDEX, SHARED BY EVERYONE WHO WANTS IT ──────────────────  2026-09-23
   Søren: "The loading of the tracings in the dataset is really slow." Measured against his backend
   before changing anything: ?tracings=1 is 3.6 s warm and 27.7 s cold, ONE request, 13 kB -- and
   ?whoami=1, which returns three statements into doGet, is 11.3 s cold, so most of the cold cost is
   Apps Script starting a container rather than this query. There was no fan-out to remove.

   What was slow was waiting for it twice. This function fetched the index when the pad opened and
   tracingBrowse() fetched the identical URL again on every press, ignoring both the answer and this
   cache. So there is one fetch now, and whoever asks while it is in the air waits on the SAME
   promise instead of starting another. See src/the_dataset_list_does_not_wait_for_what_it_has.py. */
var TRACING_INDEX_WAIT = null;
function tracingIndexFetch(){
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return Promise.reject(new Error("this page has no backend configured"));
  if (TRACING_INDEX_WAIT) return TRACING_INDEX_WAIT;
  TRACING_INDEX_WAIT = fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS())
    .then(function(r){ return r.json(); })
    .then(function(d){
      /* An older deployment answers this route with something else entirely. Saying so beats
         quietly keeping an empty list and reporting "nothing has been traced yet". */
      if (!d || !Array.isArray(d.tracings))
        throw new Error("the backend did not answer with a list of tracings");
      TRACING_SHARED = tracingInScope(d.tracings);
      TRACING_INDEX_AT = Date.now();
      tracingReconcileKept();
      TRACING_INDEX_WAIT = null;
      return TRACING_SHARED;
    }, function(e){
      /* NOT cached as an attempt. The old code stamped the clock BEFORE fetching, so one failed
         request left the index un-asked for the minute after the backend came back. */
      TRACING_INDEX_WAIT = null; TRACING_INDEX_AT = 0;
      throw e;
    });
  return TRACING_INDEX_WAIT;
}
/* THE INDEX, FETCHED QUIETLY, because the numbering needs it before he presses anything. Cheap
   enough to do when the pad opens, and a minute's cache keeps it to one request per session of
   work. It fails silently: with no index, tracingNextIndex() starts at 1 and says so, which is a
   label to fix rather than work lost. */
function tracingIndexSoon(){
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return;
  if (Date.now() - TRACING_INDEX_AT < 60000) return;
  try { tracingIndexFetch().catch(function(){}); } catch (e){}
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
  /* ── WHAT IS IN HAND GOES UP FIRST ─────────────────────────────────────────────  2026-09-23
     This used to overwrite the panel with "Reading the dataset’s tracings…" and then fetch the
     same URL tracingIndexSoon() had already fetched when the pad opened -- so every press cost a
     blank panel and 3 to 27 seconds for data the page was holding. The rows go up now and the
     refresh happens behind them; the list is replaced only once newer data has actually arrived. */
  const had = (TRACING_SHARED || []).length;
  if (had) tracingRenderShared();
  else host.innerHTML = '<p class="hint">Reading the dataset’s tracings… one request, a few '
    + "seconds — and up to half a minute if the backend has been idle and has to start up "
    + "again. Measured at 3.6 s warm and 27.7 s cold on 2026-09-23.</p>";
  const at = TRACING_INDEX_AT;
  try {
    await tracingIndexFetch();
    tracingRenderShared();
  } catch (e){
    const why = escHtml(String(e && e.message || e));
    if (had){
      /* A LIST ALREADY UP IS NOT BLANKED. Measured in datasetlistcheck.js before this went in: a
         failed refresh turned ten rows into an error page, throwing away data that was in the
         browser the whole time. The note goes ABOVE the rows, where he is already looking, and says
         how old they are -- "could not refresh" over a list read ten minutes ago is true and
         useful; an empty panel is neither. */
      tracingRenderShared();
      host.insertAdjacentHTML("afterbegin",
        '<p class="hint" style="color:var(--bad)">Could not refresh the list: ' + why
        + ". These are the tracings as they were read "
        + (at ? escHtml(draftWhen(new Date(at).toISOString())) : "earlier") + ".</p>");
    } else {
      host.innerHTML = '<p class="hint" style="color:var(--bad)">Could not read them: ' + why
        + ". If the backend has not been redeployed since 2026-09-17 it does not answer this "
        + "question yet.</p>";
    }
  }
}

/* ── THE DATASET'S TRACINGS, BY CELL ─────────────────────────────────────────  2026-09-21
   The same grouping as the kept list, with three things for the whole cell: open all of it in the
   pad, in Neuroglancer, or as a zip. Groups newest first -- the cell somebody is working on now is
   the one most likely to be wanted -- and inside a cell by kind and number, so Lysosome 1, 2, 3
   read in order. See src/the_tracings_group_by_cell.py. */

/* ── RUNNING A MEASUREMENT, AND SAYING WHAT HAPPENED ────────────────────  2026-09-30
   The progress goes on the button, which is where the eye already is, and the sentence afterwards
   says three numbers: how many were measured, how many rows the sheet updated, and -- the
   interesting one -- how many structures the sheet had no row for. That last is the only thing this
   button can discover that nothing else can: a page and a sheet disagreeing about what exists. */
async function tracingMeasureRun(btn, go, sayEl){
  if (!btn) return;
  const was = btn.textContent, wasDis = btn.disabled;
  btn.disabled = true;
  const say = function(m){
    btn.textContent = m;
    if (sayEl) sayEl.textContent = "";
  };
  let r;
  try { r = await go(say); }
  catch (e){ r = { error: String(e && e.message || e) }; }
  btn.textContent = was; btn.disabled = wasDis;
  let msg;
  if (r && r.error){
    msg = "Nothing was saved \u2014 " + r.error + ".";
    if (r.updated) msg = r.updated + " row" + (r.updated === 1 ? "" : "s") + " had been saved "
                       + "before it stopped. Then: " + r.error + ".";
  } else if (!r || !r.measured){
    msg = "There was nothing to measure \u2014 no outline could be read.";
  } else {
    msg = "Measured " + r.measured + " outline" + (r.measured === 1 ? "" : "s")
        + " and saved " + r.updated + " row" + (r.updated === 1 ? "" : "s") + " to the sheet.";
    if (r.missing && r.missing.length)
      msg += " " + r.missing.length + " had no row in the sheet to write to ("
           + r.missing.slice(0, 3).join(", ") + (r.missing.length > 3 ? ", \u2026" : "")
           + ") \u2014 which means the sheet and this page disagree about what exists.";
    if (r.capped) msg += " " + r.capped + " outline" + (r.capped === 1 ? "" : "s")
                       + " were left unread because of the per-cell read cap.";
  }
  if (sayEl) sayEl.textContent = msg;
  if (typeof tracingSay === "function") tracingSay(msg);
}
/* ── WHAT ONE SPLIT OUTLINE READS AS ───────────────────────  2026-10-08
   One sentence, in one place, so the row in the dataset list, the warning on the cell panel and
   anything later all say the same thing about the same number. "" when the outline is one piece.
   See src/one_tracing_that_is_really_two.py. */
function tracingSplitSay(st, resNm){
  var s;
  try {
    s = UJ.tracing.splitOf((st && (st.rings || st)) || [],
                           resNm || (window.UJ && UJ.cfg && UJ.cfg.res) || null);
  } catch (_e){ return ""; }
  if (!s || !s.split) return "";
  var um = function(nm){ return (Math.round(Number(nm) / 100) / 10) + " \u00b5m"; };
  return "In " + s.clusters.length + " pieces that do not touch: "
    + s.clusters.map(function(c){
        return c.contours + " contour" + (c.contours === 1 ? "" : "s") + " at " + c.centre.join(", ");
      }).join(" and ")
    + " \u2014 " + um(s.gapNm) + " apart, " + (Math.round(s.ratio * 10) / 10)
    + "\u00d7 their own reach.";
}
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
  /* ── ONE BUTTON, NOT TWO ───────────────────────────────────  2026-10-01
     There was a "measure every outline" button here for one day. It was a MIGRATION -- 68 rows
     written before the measurement columns existed -- and Søren ran it: "I got them now... we
     should hide this again." A button for a thing done once is a button that gets pressed by
     mistake, so window.tracedMeasureAll() stays and its button does not; the next dataset that
     needs the migration is reached from the console.

     What remains is per cell, because that is the thing that recurs: a cell's relational numbers
     go stale when another organelle in it is outlined. tracingRemeasureCell() now does that by
     itself after every share, and this button is the manual repair for when it did not. */
  /* ── AND THE ONE QUESTION THE LIST CANNOT ANSWER BY ITSELF ─────  2026-10-08
     The index carries names, counts and cells, not contours, so "is this outline one object" needs
     the geometry — a read per structure. A button, not an automatic scan: it is dozens of Drive
     reads, and a page that spends them without being asked is a page that is slow for everyone who
     did not want this. REPORTS ONLY; nothing is changed by pressing it. */
  const splitBox = '<div style="border:1px solid var(--line);border-radius:7px;padding:8px 10px;'
    + 'margin:6px 0 10px 0">'
    + '<button class="idbtn" id="tracingSplitGo" ' + TRACING_BTN + ' title="Reads every outline\u2019s '
    + 'contours and reports any whose contours sit in two places that do not touch \u2014 one tracing '
    + 'holding two objects. Nothing is changed: this is a list of what to look at.">'
    + 'Check outlines for split structures</button>'
    + ' <label style="font-size:11px;color:var(--mut)"><input type="checkbox" id="tracingSplitMine" '
    + 'checked style="width:auto;vertical-align:-1px"> only ones I have drawn on</label>'
    + '<div class="hint" id="tracingSplitSayEl" style="margin-top:5px"></div>'
    + '<div id="tracingSplitOut"></div></div>';
  host.innerHTML = splitBox
    + '<label>In the dataset, by cell — open one to add to it or correct it</label>'
    + groups.map(function(g, gi){
        const type = (g.items.filter(function(x){ return x.t.cellType; })[0] || { t: {} }).t.cellType || "";
        return '<div ' + TRACING_CELL_BOX + ' data-g="' + gi + '">'
          + '<div ' + TRACING_CELL_ROW + '>' + tracingCellHead(g.nuc, g.root, type, g.items.length, g.coord)
          + '<button class="idbtn tracingcellpad" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell onto the pad, each as its own numbered structure. Adding them back '
            + 'is the next version of each.">Open all in the pad</button>'
          + '<button class="idbtn tracingcellngl" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell in the viewer, each in its own colour, with the cell.">Neuroglancer</button>'
          + '<button class="idbtn tracingcellglb" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell as ONE 3D model (GLB) \u2014 the cell and its nucleus see-through so '
            + 'the organelles inside them show, each in the colour it was drawn in. Micrometres, centred '
            + 'on itself, so it opens inside the viewport in Blender, PowerPoint or any glTF viewer.">'
            + '3D model</button>'
          + '<button class="idbtn tracingcellzip" data-g="' + gi + '" ' + TRACING_BTN + ' title="A zip '
            + 'of this cell: each tracing&rsquo;s contours (JSON), a mesh of each (OBJ, nm), and an '
            + 'index.">Download zip</button>'
          + (typeof window.tracedMeasureCells === "function"
              ? '<button class="idbtn tracedmeasurecell" data-g="' + gi + '" ' + TRACING_BTN
                + ' title="Measures this cell’s outlines together and saves the numbers to the '
                + 'sheet. Worth doing after outlining another organelle here: each organelle’s '
                + 'distance to its nearest neighbour is measured against the others, so a new one '
                + 'makes the old numbers out of date.">Measure this cell</button>' : "")
          + '</div>'
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
                + '<button class="idbtn tracingglb" data-sid="' + escHtml(t.structureId) + '" '
                  + TRACING_BTN + ' title="This one tracing as a 3D model (GLB), solid, in its own '
                  + 'colour. Micrometres, centred on itself.">3D model</button>'
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
  [].slice.call(host.querySelectorAll(".tracingglb")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOneGlb(b.dataset.sid, b); });
  });
  const sidsOf = function(b){ const g = groups[Number(b.dataset.g)];
    return g ? g.items.map(function(x){ return x.t.structureId; }) : []; };
  [].slice.call(host.querySelectorAll(".tracingcellpad")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenCellShared(sidsOf(b), b); });
  });
  [].slice.call(host.querySelectorAll(".tracingcellngl")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellSharedInViewer(sidsOf(b), b); });
  });
  [].slice.call(host.querySelectorAll(".tracingcellglb")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellGlb(groups[Number(b.dataset.g)], b); });
  });
  [].slice.call(host.querySelectorAll(".tracingcellzip")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellZip(groups[Number(b.dataset.g)], b); });
  });
  {
    const go = host.querySelector("#tracingSplitGo");
    if (go) go.addEventListener("click", function(){ tracingSplitRun(go); });
  }
  [].slice.call(host.querySelectorAll(".tracedmeasurecell")).forEach(function(b){
    b.addEventListener("click", function(){
      const g = groups[Number(b.dataset.g)];
      if (!g) return;
      tracingMeasureRun(b, function(say){
        return window.tracedMeasureCells({ nuc: [g.nuc], root: [g.root] }, say);
      });
    });
  });
}

/* The button's half: ask, then write what came back. Each row names the outline, the cell it is
   filed against, and both halves with a coordinate to jump to — because "this one is wrong" is
   only useful if you can get to it. 2026-10-08. */
async function tracingSplitRun(btn){
  const sayEl = document.getElementById("tracingSplitSayEl");
  const out = document.getElementById("tracingSplitOut");
  const say = function(m){ if (sayEl) sayEl.textContent = m; };
  if (typeof window.tracedSplitScan !== "function"){
    say("This page does not have core/tracedoutlines.js loaded, so there is nothing to read.");
    return;
  }
  const mine = document.getElementById("tracingSplitMine");
  /* REPORTER_NAME is what every share writes into the sheet's reporterName, so it is the string
     the index can actually be matched on. Signed out it is empty, and the tick then does nothing
     rather than silently matching everything or nothing \u2014 the label says so. */
  const who = (typeof REPORTER_NAME !== "undefined" && REPORTER_NAME) ? String(REPORTER_NAME) : "";
  const only = (mine && mine.checked && who) ? who : "";
  if (mine) mine.disabled = !who;
  const was = btn ? btn.textContent : "";
  if (btn){ btn.disabled = true; btn.textContent = "Reading\u2026"; }
  if (out) out.innerHTML = "";
  let r;
  try { r = await window.tracedSplitScan(say, { only: only }); }
  catch (e){ r = { error: String(e && e.message || e) }; }
  if (btn){ btn.disabled = false; btn.textContent = was; }
  if (!r || r.error){ say("Nothing was read \u2014 " + ((r && r.error) || "unknown error") + "."); return; }
  const n = (r.rows || []).length;
  say(n
    ? n + " of " + r.looked + " outline" + (r.looked === 1 ? "" : "s") + " are in more than one "
      + "piece. Worst first. Nothing has been changed \u2014 open one in the pad to correct it."
      + (r.unread.length ? " " + r.unread.length + " could not be read." : "")
    : "All " + r.looked + " outline" + (r.looked === 1 ? " is" : "s are") + " one piece."
      + (r.unread.length ? " " + r.unread.length + " could not be read." : ""));
  if (!out || !n) return;
  out.innerHTML = r.rows.map(function(x, i){
    const t = x.t, s = x.split;
    const where = s.clusters.map(function(c){
      return '<button class="idbtn tracingsplitjump" data-at="' + c.centre.join(",") + '" '
        + 'style="padding:1px 7px;font-size:11px" title="Put this piece\u2019s centre in the '
        + 'coordinate boxes.">' + c.contours + ' at ' + c.centre.join(", ") + '</button>';
    }).join(" ");
    return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;'
      + 'border-top:1px solid var(--line);padding:5px 0">'
      + '<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
        + escHtml(t.color || "#3a6b5a") + '"></span>'
      + '<b style="flex:0 0 auto">' + escHtml(t.name || t.structureId) + '</b>'
      + '<span style="opacity:.7;flex:0 0 auto">' + escHtml(tracingCellHeadPlain(t)) + '</span>'
      + '<span style="flex:0 0 auto">' + (Math.round(s.ratio * 10) / 10) + '\u00d7 apart</span>'
      + where
      + '<button class="idbtn tracingsplitopen" data-sid="' + escHtml(t.structureId) + '" '
        + 'style="padding:1px 7px;font-size:11px" title="Open this outline in the pad, as it is, '
        + 'so you can correct it and share the corrected version.">Open in the pad</button>'
      + '</div>';
  }).join("");
  [].slice.call(out.querySelectorAll(".tracingsplitjump")).forEach(function(b){
    b.addEventListener("click", function(){
      const p = String(b.dataset.at || "").split(",");
      ["tracingX", "tracingY", "tracingZ"].forEach(function(id, k){
        const el = document.getElementById(id);
        if (el && p[k] !== undefined) el.value = String(p[k]).trim();
      });
      tracingSay("Coordinate set to " + p.join(", ") + " \u2014 this piece of that outline.");
    });
  });
  [].slice.call(out.querySelectorAll(".tracingsplitopen")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenShared(b.dataset.sid, b); });
  });
}
/* The cell a row is filed against, in one short phrase. tracingCellHead builds the rich version
   for the per-cell headings; this is the same facts without the markup. */
function tracingCellHeadPlain(t){
  const at = (t && (t.cellCoord || t.cell_coord)) || "";
  if (at) return "cell at " + at;
  const nuc = String((t && (t.nucleusId || t.nucleus_id)) || "");
  if (nuc) return "nucleus " + nuc;
  const root = String((t && (t.rootId || t.root_id)) || "");
  return root ? "segment " + root : "no cell";
}


/* The button's half: ask, then write what came back. Each row names the outline, the cell it is
   filed against, and both halves with a coordinate to jump to — because "this one is wrong" is
   only useful if you can get to it. 2026-10-08. */
async function tracingSplitRun(btn){
  const sayEl = document.getElementById("tracingSplitSayEl");
  const out = document.getElementById("tracingSplitOut");
  const say = function(m){ if (sayEl) sayEl.textContent = m; };
  if (typeof window.tracedSplitScan !== "function"){
    say("This page does not have core/tracedoutlines.js loaded, so there is nothing to read.");
    return;
  }
  const mine = document.getElementById("tracingSplitMine");
  /* REPORTER_NAME is what every share writes into the sheet's reporterName, so it is the string
     the index can actually be matched on. Signed out it is empty, and the tick then does nothing
     rather than silently matching everything or nothing — the label says so. */
  const who = (typeof REPORTER_NAME !== "undefined" && REPORTER_NAME) ? String(REPORTER_NAME) : "";
  const only = (mine && mine.checked && who) ? who : "";
  if (mine) mine.disabled = !who;
  const was = btn ? btn.textContent : "";
  if (btn){ btn.disabled = true; btn.textContent = "Reading\u2026"; }
  if (out) out.innerHTML = "";
  let r;
  try { r = await window.tracedSplitScan(say, { only: only }); }
  catch (e){ r = { error: String(e && e.message || e) }; }
  if (btn){ btn.disabled = false; btn.textContent = was; }
  if (!r || r.error){ say("Nothing was read \u2014 " + ((r && r.error) || "unknown error") + "."); return; }
  const n = (r.rows || []).length;
  say(n
    ? n + " of " + r.looked + " outline" + (r.looked === 1 ? "" : "s") + " are in more than one "
      + "piece. Worst first. Nothing has been changed \u2014 open one in the pad to correct it."
      + (r.unread.length ? " " + r.unread.length + " could not be read." : "")
    : "All " + r.looked + " outline" + (r.looked === 1 ? " is" : "s are") + " one piece."
      + (r.unread.length ? " " + r.unread.length + " could not be read." : ""));
  if (!out || !n) return;
  out.innerHTML = r.rows.map(function(x, i){
    const t = x.t, s = x.split;
    const where = s.clusters.map(function(c){
      return '<button class="idbtn tracingsplitjump" data-at="' + c.centre.join(",") + '" '
        + 'style="padding:1px 7px;font-size:11px" title="Put this piece\u2019s centre in the '
        + 'coordinate boxes.">' + c.contours + ' at ' + c.centre.join(", ") + '</button>';
    }).join(" ");
    return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;'
      + 'border-top:1px solid var(--line);padding:5px 0">'
      + '<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
        + escHtml(t.color || "#3a6b5a") + '"></span>'
      + '<b style="flex:0 0 auto">' + escHtml(t.name || t.structureId) + '</b>'
      + '<span style="opacity:.7;flex:0 0 auto">' + escHtml(tracingCellHeadPlain(t)) + '</span>'
      + '<span style="flex:0 0 auto">' + (Math.round(s.ratio * 10) / 10) + '\u00d7 apart</span>'
      + where
      + '<button class="idbtn tracingsplitopen" data-sid="' + escHtml(t.structureId) + '" '
        + 'style="padding:1px 7px;font-size:11px" title="Open this outline in the pad, as it is, '
        + 'so you can correct it and share the corrected version.">Open in the pad</button>'
      + '</div>';
  }).join("");
  [].slice.call(out.querySelectorAll(".tracingsplitjump")).forEach(function(b){
    b.addEventListener("click", function(){
      const p = String(b.dataset.at || "").split(",");
      ["tracingX", "tracingY", "tracingZ"].forEach(function(id, k){
        const el = document.getElementById(id);
        if (el && p[k] !== undefined) el.value = String(p[k]).trim();
      });
      tracingSay("Coordinate set to " + p.join(", ") + " \u2014 this piece of that outline.");
    });
  });
  [].slice.call(out.querySelectorAll(".tracingsplitopen")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenShared(b.dataset.sid, b); });
  });
}
/* The cell a row is filed against, in one short phrase. tracingCellHead builds the rich version
   for the per-cell headings; this is the same facts without the markup. */
function tracingCellHeadPlain(t){
  const at = (t && (t.cellCoord || t.cell_coord)) || "";
  if (at) return "cell at " + at;
  const nuc = String((t && (t.nucleusId || t.nucleus_id)) || "");
  if (nuc) return "nucleus " + nuc;
  const root = String((t && (t.rootId || t.root_id)) || "");
  return root ? "segment " + root : "no cell";
}

/* window.tracedMeasureAll() has no button on purpose -- see "ONE BUTTON, NOT TWO" above. */
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
  /* TOGETHER where core/tracing.js can (2026-09-22, src/the_outlines_come_in_one_request.py). */
  if (UJ.tracing && UJ.tracing.fetchMany){
    try {
      const res = await UJ.tracing.fetchMany(REPORT_ENDPOINT, sids.map(function(s){ return { structureId: s }; }),
        tracingDsQS(), function(d, n){ if (btn) btn.textContent = "reading " + d + " of " + n + "\u2026"; });
      return sids.map(function(s){
        const x = res[s] || { error: "not read" };
        return x.error ? { sid: s, error: x.error } : { sid: s, t: x.t, st: x.st };
      });
    } finally { if (btn){ btn.disabled = false; btn.textContent = label; } }
  }
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
  tracingReserveTab("Reading this cell\u2019s tracings from the dataset, then opening the viewer\u2026");
  const got = await tracingFetchCell(sids, btn);
  const good = got.filter(function(x){ return !x.error; });
  if (!good.length){
    var heldC = tracingHeldTab(); if (heldC) try { heldC.close(); } catch (_e){}
    tracingSay("Could not open that cell's tracings." + tracingFailedSay(got), true); return;
  }
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
      /* Through the one helper, so the two openers cannot record it differently (2026-09-27). */
      tracingNoteOpened(x.st, x.sid);
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
/* ── WHAT GETS LOFTED ────────────────────────────────────────────────────────  2026-09-22
   The rings as drawn, or -- with "smooth between sections" ticked -- an interpolated set that
   curves in z. loft() bands straight between consecutive sections, so this is the only way the
   surface between them becomes anything but flat. Nothing here is saved or measured.
   See src/the_mesh_can_be_smoothed_in_z.py. */
function tracingSmoothZ(){
  try { const el = document.getElementById("tracePadSmoothZ"); return !!(el && el.checked); }
  catch (_e){ return false; }
}
function tracingLoftRings(rings){
  if (!tracingSmoothZ()) return rings;
  try {
    if (UJ.traceloft && UJ.traceloft.interpolate)
      return UJ.traceloft.interpolate(rings, { per: 2 }).rings;
  } catch (_e){}
  return rings;
}
/* The pad's own loft, in nanometres, as OBJ. */
function tracingObjOf(name, rings, res){
  const g = UJ.traceloft.loft(tracingLoftRings(rings), res);
  if (!g || !g.positions || !g.positions.length) return "";
  const out = ["# " + name + " — lofted from its contours by µJump's tracing card; units: nm", "o " + tracingSafeName(name)];
  for (let i = 0; i < g.positions.length; i += 3)
    out.push("v " + g.positions[i].toFixed(1) + " " + g.positions[i + 1].toFixed(1) + " " + g.positions[i + 2].toFixed(1));
  for (let i = 0; i < g.indices.length; i += 3)
    out.push("f " + (g.indices[i] + 1) + " " + (g.indices[i + 1] + 1) + " " + (g.indices[i + 2] + 1));
  return out.join("\n") + "\n";
}
/* ── WHICH THINGS YOU CAN SEE THROUGH ───────────────────  2026-10-10
   Søren: *"If combined, the cell should be transparent to show the organelles inside it."*

   Only the structures that ENCLOSE something are see-through, and only when there is something
   inside them to see: a whole cell exported on its own is solid, because a transparent object
   alone in a scene is just a faint one. The same two kinds the rest of this file treats as "the
   cell rather than something in it", asked once.

   The numbers are the Blender scene's: the cell well back so three organelles read through it,
   the nucleus less so because it is a thing you also want to see the shape of. */
function tracingGlbAlpha(kind, alone){
  var k = String(kind || "").toLowerCase();
  if (alone) return 1;
  if (k === "cell") return 0.22;
  if (k === "nucleus") return 0.4;
  return 1;
}
/* The parts list a GLB is written from, in the order they should be read: the cell, then its
   nucleus, then everything else as it is listed. One place, so the lone and the combined export
   cannot disagree about colour, name or alpha. */
function tracingGlbParts(got, alone){
  var rank = function(k){
    k = String(k || "").toLowerCase();
    return k === "cell" ? 0 : (k === "nucleus" ? 1 : 2);
  };
  var parts = [];
  (got || []).forEach(function(x){
    if (!x || x.error || !x.st || !(x.st.rings || []).length) return;
    var t = x.t || {}, st = x.st;
    var kind = st.kind || t.kind || t.instanceOf || "";
    parts.push({ name: st.name || t.name || x.sid, kind: kind,
                 color: t.color || st.color || "#3a6b5a",
                 alpha: tracingGlbAlpha(kind, alone), rings: st.rings });
  });
  parts.sort(function(a, b){ return rank(a.kind) - rank(b.kind); });
  return parts;
}
function tracingGlbSave(parts, filename){
  var res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
  var bytes = UJ.traceloft.glb(parts, res);
  if (!bytes) return 0;
  tracingSaveBlob(new Blob([bytes], { type: "model/gltf-binary" }), filename);
  return parts.length;
}
/* One tracing, on its own. Solid: there is nothing inside it to look through it at. */
async function tracingOneGlb(sid, btn){
  var label = btn ? btn.textContent : "";
  try {
    if (btn){ btn.disabled = true; btn.textContent = "meshing\u2026"; }
    var x = Object.assign({ sid: sid }, await tracingFetchShared(sid));
    var parts = tracingGlbParts([x], true);
    if (!parts.length) throw new Error("that tracing has no contours to mesh");
    var n = tracingGlbSave(parts, tracingSafeName(parts[0].name) + "__"
                                 + tracingSafeName(sid) + "_um.glb");
    tracingSay(n ? "Saved " + parts[0].name + " as a 3D model (GLB, micrometres, centred on "
                   + "itself). It opens in Blender, PowerPoint or any glTF viewer."
                 : "Nothing could be meshed from that tracing.", !n);
  } catch (e){
    tracingSay("Could not make the 3D model: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}
/* Every tracing of one cell in one file, the cell see-through. */
async function tracingCellGlb(g, btn){
  if (!g || !g.items.length) return;
  var label = btn ? btn.textContent : "";
  try {
    var got = await tracingFetchCell(g.items.map(function(x){ return x.t.structureId; }), btn);
    if (btn){ btn.disabled = true; btn.textContent = "meshing\u2026"; }
    var parts = tracingGlbParts(got, false);
    if (!parts.length) throw new Error("none of this cell\u2019s tracings could be read");
    var cell = tracingSafeName(g.coord ? "cell_at_" + g.coord.split(",").join("_")
                 : (g.nuc ? "nucleus_" + g.nuc : (g.root ? "root_" + g.root : "no_cell")));
    var n = tracingGlbSave(parts, cell + "_um.glb");
    var see = parts.filter(function(q){ return q.alpha < 1; }).length;
    tracingSay("Saved " + cell + "_um.glb \u2014 " + n + " structure" + (n === 1 ? "" : "s")
      + " in one file"
      + (see ? ", with the " + parts.filter(function(q){ return q.alpha < 1; })
                 .map(function(q){ return q.name.toLowerCase(); }).join(" and ")
             + " see-through so what is inside shows." : ".")
      + " Micrometres, centred on itself." + tracingFailedSay(got));
  } catch (e){
    tracingSay("Could not make the 3D model: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
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
  /* BEFORE THE FETCH (2026-09-22): see tracingReserveTab. */
  tracingReserveTab("Reading this tracing from the dataset, then opening the viewer\u2026");
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
    /* Nothing to show in it: a blank tab left open is litter. */
    var held = tracingHeldTab(); if (held) try { held.close(); } catch (_e){}
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
    /* ── AND NUMBER ONE IS THE ONE THAT WAS OPENED ────────────────  2026-10-05
       PAD_EDIT_IDS was emptied here while PAD_EDIT_ID was set, which editOf() reads and idOf() does
       not need — inst 0 takes TRACING_PENDING.id, which is the same string. So it was harmless
       and it was also the only record of WHICH number on the pad came from the dataset, which
       tracingEachAuto() now asks for. Its kind too: a published nucleus stays a nucleus when
       something else is drawn beside it, whatever the box at the top has moved on to saying. */
    PAD_EDIT_ID = st.structureId; PAD_EDIT_IDS = { "0": st.structureId };
    PAD_INST_KIND = {};
    if (st.kind || st.name)
      PAD_INST_KIND["0"] = { value: st.kind || "", kind: st.kind || "", name: st.name || "" };
    /* ── WHAT NUMBER IT IS ALREADY PUBLISHED UNDER ──────────────────────────────  2026-09-19
       Søren: *"I would like that editing it does not increase its number."* It did: the submission
       builder asked for "one more than the highest this cell has" for every structure, including a
       version of one that is already counted in that highest. Remembered here, where the tracing
       itself is in hand, rather than re-derived later from an index that may not have loaded. */
    /* Through the one helper, as "Open all in the pad" does (2026-09-27). */
    tracingNoteOpened(st, sid);
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
    /* ── ONE DECISION, NOT THREE ─────────────────────────  2026-10-06
       This was three independent `if`s — nucleus id, root id, coordinate, three sources with
       nothing requiring them to agree. A tracing carrying a coordinate and no nucleus id moved the
       coordinate to ITS cell and left the two ids naming the last one, which is a row that
       disagrees with itself before a single contour is drawn.

       The three fields are one fact: which cell this is. They arrive together or the ones that did
       not arrive are CLEARED, because an empty box is a question and a stale box is a wrong
       answer. */
    {
      const nucBox = document.getElementById("tracingNucId");
      const rootBox = document.getElementById("tracingRootId");
      const ca = document.getElementById("tracingCellAt");
      const cc = st.cellCoord || t.cellCoord;
      if (nucBox) nucBox.value = st.nucleusId || "";
      if (rootBox) rootBox.value = st.rootId || "";
      if (ca) ca.value = cc ? tracingCoordShow(cc) : "";
    }
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
/* ── A SECOND STRUCTURE TURNS THE ROWS ON ───────────────────────  2026-10-05
   Søren, two days running: *"it says 2x whole cell mesh"*, and then *"the whole cell mesh
   disappeared and the nucleus... became the same as the other cell's nucleus"*.

   ONE BOX FOR THE WHOLE PAD. With "name each one separately" off, tracingKindFor(inst) falls back to
   the single #tracingWhat select for every structure, so a pad holding a nucleus and a whole cell
   files both as whatever that box happens to say — both "Whole cell" on the 4th, both "Nucleus"
   on the 5th. Nothing warned, because one box is a perfectly good answer for a pad holding one
   structure and nothing asked how many it held.

   So the rows turn themselves on. Seeded through tracingSeedKinds(), which is what the tick does by
   hand, so every structure starts as what they all already were and the person changes the ones that
   are something else — on screen, before anything is sent, which is the whole point of the rows.

   `gate` is the submission asking rather than the pad telling: it returns true when it had to turn
   them on at that moment, and the press is refused once so the rows are read before they are used. */
function tracingEachAuto(gate){
  const each = document.getElementById("tracingEachOwn");
  if (!each || each.checked) return false;
  let insts = [];
  try {
    insts = UJ.tracepad.instances(PAD).filter(function(i){ return i.contours; })
                                      .map(function(i){ return i.inst || 0; });
  } catch (_e){ return false; }
  if (insts.length < 2) return false;
  /* ── ONLY WHERE A KIND IS ALREADY DECIDED ────────────────────────────────────────────────
     Two lysosomes drawn on a fresh pad are two structures of one kind, and the single box is the
     right answer for both -- turning the rows on there changes nothing and renumbers them, which
     tracingpanelcheck.js said in four assertions the first time this fired on every pad.

     The case that costs an evening is narrower and has a mark on it: a tracing OPENED from the
     dataset already has a published kind, and anything drawn beside it is something else, because
     a cell has one nucleus and one whole cell. PAD_EDIT_IDS names the opened ones. */
  const opened = insts.filter(function(k){
    return (typeof PAD_EDIT_IDS !== "undefined") && PAD_EDIT_IDS[String(k)];
  });
  if (!opened.length || opened.length === insts.length) return false;
  each.checked = true;
  /* SEEDED WITHOUT DISTURBING WHAT IS ALREADY DECIDED -- tracingSeedKinds() lets the box win, which
     is right for the tick pressed by hand and wrong here: the box describes the structure being
     drawn NOW, and the opened one's kind came off the sheet. */
  const w = tracingWhat(), what = document.getElementById("tracingWhat");
  insts.forEach(function(k){
    if (PAD_INST_KIND[String(k)]) return;
    PAD_INST_KIND[String(k)] = { value: what ? what.value : "", kind: w.kind, name: w.name };
  });
  try { tracingEachRender(true); } catch (_e2){}
  const msg = "There are " + insts.length + " structures on the pad and one of them came from the "
    + "dataset, so each now has its own row — type, colour and name. Check what the new one "
    + "says before"
    + (gate ? " pressing again." : " you add them.");
  try { gate ? tracingSay(msg, true) : padSay(msg, true); } catch (_e3){}
  return true;
}
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
      + '<span class="padswatch" style="width:9px;height:9px;border-radius:2px;background:'
      + escHtml(padInstColour(it.inst)) + '"></span>' + (it.inst + 1)
      /* Its own type on the chip once they can differ -- with the option off the label would be the
         same word repeated down the strip, which is noise. */
      + (tracingEachOwn()
          ? ' <span style="opacity:.75;max-width:90px;overflow:hidden;text-overflow:ellipsis;'
            + 'white-space:nowrap">' + escHtml(tracingKindFor(it.inst).name || "?") + '</span>'
          : '')
      + (it.contours ? '' : ' <span style="opacity:.6">empty</span>')
      /* Nothing drawn yet is nothing to delete, and nothing to go to either. */
      + (it.contours
          ? ' <span class="padx" data-inst="' + it.inst + '" title="Delete this drawing"'
            + ' style="padding:0 2px;opacity:.75">\u00d7</span>'
          : '') + '</button>';
  }).join("");
  [].slice.call(box.querySelectorAll(".padinst")).forEach(function(b){
    b.addEventListener("click", function(ev){
      /* The × asks before it does anything (2026-09-23). Søren: "I should be able to delete one of
         the drawings, but give a warning first." */
      if (ev.target && ev.target.closest && ev.target.closest(".padx")){
        padInstAsk(+b.dataset.inst);
        return;
      }
      /* What is in the type boxes belongs to the one being LEFT, and the one being arrived at puts
         its own there. Storing first is what makes the strip a set of tabs rather than a row of
         buttons that quietly copy one structure's type onto the next. */
      tracingStoreKindOf(PAD.inst);
      UJ.tracepad.setInstance(PAD, +b.dataset.inst);
      tracingShowKindOf(PAD.inst);
      const col = document.getElementById("tracingColor");
      if (col) col.value = padInstColour(PAD.inst);
      padPaint(); padRings();
      /* ...AND GOES TO IT. The tooltip on this chip has said "Go back to this one" since it was
         written; until 2026-09-23 it only changed the selection and left the view where it was,
         which on a cell forty sections deep is the difference between a click and a search. */
      var went = padGoToInst(PAD.inst);
      padSay("Drawing number " + (PAD.inst + 1) + " now — anything you draw joins that one."
        + (went ? (went.moved ? " Moved to it, on section " + went.z + "."
                              : " It is at " + went.at[0] + ", " + went.at[1] + " here.") : "")
        + (tracingEachOwn() ? " The type box above is its own." : ""));
    });
  });
}

/* ── ASKING BEFORE A DRAWING GOES ──────────────────────────────────────────────  2026-09-23
   Søren: "I should be able to delete one of the drawings, but give a warning first."

   It NAMES AND COUNTS. "Delete number 3?" does not say that an afternoon goes with it, so the bar
   says how many contours on how many sections -- the two numbers that say how much work it was.

   AND IT SAYS WHAT IS NOT DELETED. A drawing opened from the dataset still has its rows and its
   file up there; taking it off the pad is taking it out of your hands, not withdrawing it from
   everybody. Somebody who thinks this retracts a published tracing will either not press it when
   they should, or press it believing they have retracted something they have not.

   The bar replaces the strip rather than sitting over it, so nothing is hidden behind it and
   padInstances() puts the strip back whichever button is pressed. */
function padInstAsk(inst){
  const box = document.getElementById("tracePadInsts");
  if (!box || !PAD) return;
  const it = UJ.tracepad.instances(PAD).filter(function(x){ return x.inst === inst; })[0];
  if (!it || !it.contours) return;
  const what = (typeof tracingKindFor === "function" && tracingKindFor(inst).name) || "";
  const shared = (typeof PAD_EDIT_IDS !== "undefined" && PAD_EDIT_IDS[String(inst)]) || "";
  box.innerHTML = '<span style="color:var(--bad)">Delete drawing ' + (inst + 1)
    + (what ? ' \u201c' + escHtml(what) + '\u201d' : '') + '? '
    + it.contours + ' contour' + (it.contours === 1 ? '' : 's') + ' on '
    + it.sections + ' section' + (it.sections === 1 ? '' : 's') + ' would go, and that cannot be '
    + 'undone.</span> '
    + (shared ? '<span class="hint">It stays in the dataset either way \u2014 this only takes it '
                + 'off the pad.</span> ' : '')
    + '<button type="button" class="hist-chip padgo" data-go="' + inst + '" '
    + 'style="color:var(--bad)">Delete it</button> '
    + '<button type="button" class="hist-chip padkeep" data-keep="' + inst + '">Keep it</button>';
  const keep = box.querySelector(".padkeep");
  if (keep) keep.addEventListener("click", function(){
    padInstances();
    padSay("Kept. Nothing was deleted.");
  });
  const go = box.querySelector(".padgo");
  if (go) go.addEventListener("click", function(){
    const gone = UJ.tracepad.deleteInstance(PAD, inst);
    /* Its type, its colour and the dataset tracing it was opened from are keyed by its number, and
       a number that no longer names anything must not go on answering for one. */
    try { delete PAD_INST_KIND[String(inst)]; } catch (_e){}
    try { delete PAD_INST_COLOUR[String(inst)]; } catch (_e){}
    try { delete PAD_EDIT_IDS[String(inst)]; } catch (_e){}
    if (typeof PAD_EDIT_ID !== "undefined" && PAD_EDIT_ID && PAD_EDIT_ID === shared) PAD_EDIT_ID = "";
    tracingShowKindOf(PAD.inst);
    padPaint(); padRings();          // which redraws the strip, the volume, the draft and the 3D
    padSay("Drawing " + (inst + 1) + " deleted \u2014 " + gone + " contour"
      + (gone === 1 ? "" : "s") + " gone. Drawing " + (PAD.inst + 1) + " is the one you are on now."
      + (shared ? " Its tracing in the dataset is untouched." : ""));
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
  const byKey = !!((document.getElementById("tracingNucId").value || "").trim()
                    && UJ.cfg && UJ.cfg.tracing && typeof UJ.cfg.tracing.cellIdsFor === "function");
  if (!root && !nuc && !byKey){
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
                       : also.length ? "cell (" + (also.length + (root ? 1 : 0)) + " segments)" : "root",
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
/* ── THE COVER THAT SAYS IT IS NOT READY ───────────────────────  2026-10-06
   Søren: *"When the tracing pad is loading there should be a loading icon, or else it is
   difficult to know whether to wait or draw."*

   The pad deliberately keeps the PREVIOUS section on screen while the next one fetches -- a blank
   canvas mid-fetch is worse, and that is why padCapture exists. So while it loads the picture is
   showing somewhere you are not, and until now the only thing that said so was one line in a status
   row that also carries the contour count, the last move and every error.

   A cover over the canvas, with the tile count padDraw was already computing. The canvas' parent is
   already position:relative -- #tracePadPan sits in its corner -- so this needs no layout. */
function padBusy(on, msg){
  var el = document.getElementById("tracePadBusy");
  var cv = document.getElementById("tracePad");
  if (!el) return;
  if (on){
    var t = el.querySelector(".padbusytext");
    if (t) t.textContent = msg || "Loading the section\u2026";
    el.style.display = "flex";
    if (cv) cv.style.cursor = "progress";
  } else {
    el.style.display = "none";
    if (cv) cv.style.cursor = "crosshair";
  }
}
/* ── A CONTOUR CAN BE LENT TO THE STRUCTURE YOU ARE DRAWING ─────────  2026-10-06
   Søren: *"if there is a tracing already and we want to copy that to the layer we are tracing,
   it should be added with ctrl+shift+left click."*

   With a tracing opened on the pad beside the one being drawn -- a nucleus under a whole cell, which
   is the case that has cost him two evenings this week -- its contours are right there and retracing
   them by hand is the only way to use them.

   ONE CONTOUR, THE ONE UNDER THE POINTER, onto the structure the pad is on, on this section. A
   vertex or a line of it: either is a way of pointing at the contour you mean, which is the same
   rule padEraseAt uses and for the same reason.

   Refusing to copy a contour onto itself is not pedantry -- a duplicate ring in one structure is two
   identical outlines the volume will integrate twice. */
function padCopyContourAt(e){
  if (!PAD_VIEW || !PAD) return;
  var t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
  var k = PAD_VIEW.pxPerToolVoxel;
  var hit = UJ.tracepad.hitVertex(PAD, t[0], t[1], k) || UJ.tracepad.hitEdge(PAD, t[0], t[1], k);
  if (!hit || hit.ring < 0 || !PAD.rings[hit.ring]){
    padSay("Nothing to copy there \u2014 " + PAD_MOD + "+shift+click ON a contour that belongs to "
      + "another number, and a copy of it joins the one you are drawing.", true);
    return;
  }
  var src = PAD.rings[hit.ring], mine = PAD.inst || 0, from = src.inst || 0;
  if (from === mine){
    padSay("That contour is already part of number " + (mine + 1) + ". Copy one from another "
      + "number \u2014 the nucleus under a whole cell, say.", true);
    return;
  }
  PAD.rings.push({ z: src.z, inst: mine,
                   points: (src.points || []).map(function(p){ return [p[0], p[1]]; }) });
  padPaint(); padRings();
  padSay("Copied " + ((src.points || []).length) + " points from number " + (from + 1)
    + " onto number " + (mine + 1) + ", on this section. Drag its points to fit, or Undo to take "
    + "it back.");
}
/* ── AND THE ZOOM MENU HAS TWO KEYS ───────────────────────────  2026-10-06
   Søren: *"We should also be able to zoom in or out with + or -."* The menu runs from the
   widest view at the top to 8x at the bottom, so + is one step down it.

   THROUGH ITS OWN change EVENT, not by calling padDraw: the menu's handler is where a zoom change
   is decided, and a key with its own route would be a second copy of that decision. */
function padZoomStep(d){
  var sel = document.getElementById("tracePadMip");
  if (!sel || !sel.options.length) return;
  var i = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + d));
  if (i === sel.selectedIndex){
    padSay(d > 0 ? "Already as close as the pad goes." : "Already as wide as the pad goes.");
    return;
  }
  sel.selectedIndex = i;
  sel.dispatchEvent(new Event("change"));
  padSay("Zoom: " + (sel.options[i].textContent || "").trim() + "\u2026");
}
async function padDraw(){
  if (!PAD_CENTRE) return;
  const cv = document.getElementById("tracePad");
  if (PAD_BUSY){ PAD_REDRAW = true; return; }
  PAD_BUSY = true;
  PAD_REDRAW = false;
  const sel = document.getElementById("tracePadMip");
  const pick = String(sel.value).split(":");
  const mip = +pick[0], zoom = +(pick[1] || 1);
  padBusy(true, "Loading the section\u2026");
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
      onProgress: function(d, n){
        if (d < n){
          padSay("Loading the section\u2026 " + d + "/" + n);
          padBusy(true, "Loading the section\u2026 " + d + "/" + n);
        }
      }
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
  padBusy(false);
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
/* ── A CHIP GOES TO WHAT IT NAMES ──────────────────────────────────────────────  2026-09-23
   Søren: "When clicking one of the contours, it should jump to that contour in the EM window, so
   that I don't have to look for it." See src/a_chip_takes_you_to_what_it_names.py.

   The centre of a contour is the mean of its vertices. Not its bounding-box centre: a crescent --
   which is what half the organelles on this pad are -- has a bounding-box centre out in the
   neuropil beside it, and the point of this is to put the thing itself under the cursor. */
function padRingCentre(r){
  if (!r || !r.points || !r.points.length) return null;
  var cx = 0, cy = 0;
  r.points.forEach(function(p){ cx += p[0]; cy += p[1]; });
  return [Math.round(cx / r.points.length), Math.round(cy / r.points.length)];
}
function padGoToRing(ring){
  var r = PAD && PAD.rings && PAD.rings[ring];
  var c = padRingCentre(r);
  if (!c) return null;
  /* A half-drawn contour belongs to the section it is on -- padStep's rule, and the same here. */
  if (PAD.z !== r.z){ PAD.z = r.z; PAD.pending = []; }
  PAD_CENTRE = [c[0], c[1], PAD.z];
  padDraw();
  return c;
}
/* A structure has many contours, so: the one on THIS section if it has one -- and then the z does
   not move, or picking a structure up to carry on drawing it would throw the section away
   underneath you -- otherwise the nearest section it is on. */
function padGoToInst(inst){
  var mine = ((PAD && PAD.rings) || []).filter(function(r){ return (r.inst || 0) === inst; });
  if (!mine.length) return null;
  var here = mine.filter(function(r){ return r.z === PAD.z; });
  var r = here.length ? here[0]
        : mine.slice().sort(function(a, b){
            return Math.abs(a.z - PAD.z) - Math.abs(b.z - PAD.z) || (a.z - b.z); })[0];
  var c = padRingCentre(r);
  if (!c) return null;
  if (PAD.z !== r.z){ PAD.z = r.z; PAD.pending = []; }
  PAD_CENTRE = [c[0], c[1], PAD.z];
  padDraw();
  return { at: c, z: r.z, moved: !here.length };
}
/* One chip per contour on this section. The BODY goes to it; the × on it deletes it. "Delete this
   one" should not mean "Undo until it is gone" -- that is the difference between correcting a
   tracing and starting it again. */
function padRings(){
  try { tracingPasteGhostsSync(); } catch (_e){}
  /* The preview and the draft both follow the contours from here: this is called after every close,
     every delete and every reload of a section, which is every way the set of rings can change. */
  pad3DSoon();
  draftSoon();
  padVolume();
  tracingEachAuto(false);   // a second structure gets the rows, before anything can be filed as one
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
          + 'title="Go to this contour \u2014 it belongs to number ' + ((h.inst || 0) + 1)
          + '. The \u00d7 deletes it.">'
          + '<span class="padswatch" style="display:inline-block;width:8px;height:8px;'
          + 'border-radius:2px;margin-right:4px;background:'
          + escHtml(padInstColour(h.inst || 0)) + '"></span>'
          + (severalHere ? ('#' + ((h.inst || 0) + 1)) : String(n + 1))
          + ' \u00b7 ' + h.points + ' points'
          /* The × was already printed here and already looked like the delete control. Now it is
             one. Inside the button rather than beside it, so the chip stays one chip. */
          + ' <span class="padx" data-ring="' + h.ring + '" title="Delete this contour"'
          + ' style="padding:0 2px;opacity:.75">\u00d7</span></button>';
      }).join(" ");
  [].slice.call(box.querySelectorAll(".padring")).forEach(function(b){
    b.addEventListener("click", function(ev){
      /* WHICH HALF OF THE CHIP. The body goes there, the × deletes -- 2026-09-23. It used to be
         delete either way, which left no way to click a contour at all. */
      var onX = ev.target && ev.target.closest && ev.target.closest(".padx");
      if (onX){
        if (UJ.tracepad.deleteRing(PAD, +b.dataset.ring)){
          padPaint(); padRings();
          padSay("Contour deleted. " + UJ.tracepad.count(PAD).rings + " left.");
        }
        return;
      }
      var c = padGoToRing(+b.dataset.ring);
      if (c) padSay("Moved to that contour, at " + c[0] + ", " + c[1] + ".");
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

/* ── TIPS ACROSS THE TOP OF THE EM PANEL ────────────────────────────────────────  2026-09-22
   Søren: "tips about navigating the tracing panel ... shown in the top of the em panel, and a tick
   in the left side that can turn it off. Also, mix in tips of identifying organelles and how they
   can send suggestions to change the tools to me." See src/the_pad_gives_tips.py.
   {kind, html, when?} -- `when` leaves out a tip about a control this host has trimmed. */
var PAD_TIP_KEY = "jump_pad_tips_off_v1", PAD_TIP_AT = -1, PAD_TIP_TIMER = null;
var PAD_TIP_ATLAS = "http://www.drjastrow.de/WAI/EM/EMAtlas.html";
function padTipCheck(txt){
  return ' <a href="' + PAD_TIP_ATLAS + '" target="_blank" rel="noopener">' + (txt || "Examples in the EM atlas") + '</a>.';
}
function padTipList(){
  var has = function(id){ return function(){ return !!document.getElementById(id); }; };
  var nav = [
    "<b>,</b> and <b>.</b> step back and on through the sections; the box beside the arrows says how many sections a step is.",
    "The zoom menu goes from a whole cell (<b>drawn half size</b>, at the top) to single organelles (<b>drawn 8&times;</b>). Your contours stay put at every zoom.",
    "<b>shift+drag</b> moves the picture, and <b>shift+click</b> centres it where you click. The arrow buttons in the corner move it half a screen.",
    "Drag any point of a contour to move it. " + PAD_RIGHT.charAt(0).toUpperCase() + PAD_RIGHT.slice(1) + " a point to delete it, or a line to put a new point in it.",
    "<b>" + PAD_MOD + "+click</b> on a contour removes the whole contour. <b>Undo</b> takes back the last point, or the last contour.",
    "Clicking: close a contour by clicking its first point again, or press <b>Enter</b>. <b>Esc</b> drops a half-drawn one.",
    "With <b>draw freehand</b> ticked, press, go all the way round, and lift. A pen switches it on by itself.",
    "Lifted the pen too early? Hold <b>alt</b> (option on a Mac) and draw on from where it stopped. End the stroke on the contour to redraw just that stretch.",
    "Several of the same organelle? <b>+ another one</b> starts the next; each gets its own colour and its own number.",
    "Outline a structure on at least two sections, a few apart, and <b>Show it in 3D</b> lofts them into a shape you can turn.",
    "<b>Save draft</b> keeps the contours, the section and the view; the pad also saves as you go, so a closed page is not lost work.",
    "When you are done, <b>Use these contours</b> hands them to the naming fields below the pad, the same place a pasted Neuroglancer link goes."
  ].map(function(h){ return { kind: "nav", html: h }; });
  nav.push({ kind: "nav", when: has("tracePadSeg"),
    html: "<b>show the segmentation</b> paints the cell the boxes below name over the section, so you can see what the automatic segmentation already has, and what it missed." });
  var organ = [
    ["<b>Mitochondria</b>: two membranes, the inner one folded into cristae across a dark matrix. Step a few sections: a mitochondrion is a tube, so its outline moves and changes length.", 0],
    ["<b>Lysosomes</b>: one membrane round dense, mixed contents. Old ones carry lipofuscin: dark granular material with pale lipid droplets.", 0],
    ["<b>Multivesicular bodies</b>: one membrane holding a handful of small round vesicles. Smaller and paler than most lysosomes.", 0],
    ["<b>Rough ER</b>: flat, parallel cisternae dotted with ribosomes. In neurons the stacks are Nissl substance.", 0],
    ["<b>Golgi apparatus</b>: a stack of curved, flattened cisternae with small vesicles at the rims, usually close to the nucleus.", 0],
    ["<b>The nucleus</b>: a double envelope interrupted by pores, dark heterochromatin along it, and the nucleolus as the densest body inside.", 0],
    ["<b>Neuron or glia?</b> A neuron has a large pale nucleus, a prominent nucleolus and Nissl substance; glia have smaller, darker nuclei and little rough ER.", 0],
    ["<b>Microglia</b>: scant dark cytoplasm, an elongated nucleus with a band of heterochromatin, and large dense lysosomes. A perivascular macrophage looks alike: where it sits decides.",
     ' <a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7930431/" target="_blank" rel="noopener">PMC7930431</a>.'],
    ["<b>Centrioles</b>: short cylinders of nine microtubule triplets, often in pairs at right angles. One at the base of a primary cilium is its basal body.", 0],
    ["<b>Synaptic vesicles</b>: clusters of small, clear, round vesicles about 40 nm across, against a dark presynaptic density.", 0],
    ["<b>Peroxisomes</b>: small, round, one membrane, a fine even granular matrix, without the mixed contents of a lysosome.", 0],
    ["<b>Lipid droplets</b>: round and homogeneous with no membrane of their own, pale or grey depending on the fixation.", 0]
  ].map(function(t){ return { kind: "organelle", html: t[0] + (t[1] || padTipCheck()) }; });
  var to = tracingCfg().suggestTo || "soren@grubb.dk";
  var subj = encodeURIComponent("Suggestion for " + (document.title || "the Jump tools").split(/\s+[\u2014-]\s+/)[0]);
  var mail = '<a href="mailto:' + to + "?subject=" + subj + '">' + to + "</a>";
  var suggest = [
    "Something you would change, a gesture you miss, a tip that is wrong? Send it to S\u00f8ren Grubb, " + mail + ", and the tool gets better for everybody.",
    "Found an organelle the list does not have, or a cell type you think is wrong? Mail " + mail + " with the coordinate, and it will be looked at."
  ].map(function(h){ return { kind: "suggest", html: h }; });
  nav = nav.filter(function(t){ return !t.when || t.when(); });
  /* Mixed: pad, organelle, pad, organelle ..., and a suggestion every sixth. */
  var mixed = [], out = [], si = 0;
  for (var i = 0; i < Math.max(nav.length, organ.length); i++){
    if (nav[i]) mixed.push(nav[i]);
    if (organ[i]) mixed.push(organ[i]);
  }
  mixed.forEach(function(t, k){
    out.push(t);
    if (k % 5 === 4) out.push(suggest[si++ % suggest.length]);
  });
  return out;
}
function padTipsOn(){
  var t = document.getElementById("tracePadTips");
  return !!(t && t.checked);
}
function padTipShow(step){
  var el = document.getElementById("tracePadTip");
  if (!el) return;
  var list = padTipList();
  if (!list.length){ el.innerHTML = ""; return; }
  PAD_TIP_AT = PAD_TIP_AT < 0 ? Math.floor(Math.random() * list.length) : (PAD_TIP_AT + (step || 1) + list.length) % list.length;
  el.innerHTML = list[PAD_TIP_AT].html;
}
function padTipsApply(){
  var on = padTipsOn();
  var tip = document.getElementById("tracePadTip"), nx = document.getElementById("tracePadTipNext");
  if (tip) tip.style.display = on ? "" : "none";
  if (nx) nx.style.display = on ? "" : "none";
}
function padTipsStart(){
  var t = document.getElementById("tracePadTips");
  if (!t) return;
  try { t.checked = tracingStore().getItem(PAD_TIP_KEY) !== "1"; } catch (_e){}
  padTipsApply();
  if (padTipsOn()) padTipShow(1);
  if (!PAD_TIP_TIMER) PAD_TIP_TIMER = setInterval(function(){
    var wrap = document.getElementById("tracePadWrap");
    if (!padTipsOn() || !wrap || wrap.style.display === "none" || document.hidden) return;
    padTipShow(1);
  }, 25000);
}
function padTipsWire(){
  var t = document.getElementById("tracePadTips"), nx = document.getElementById("tracePadTipNext");
  if (t && !t.dataset.wired){
    t.dataset.wired = "1";
    t.addEventListener("change", function(){
      try { tracingStore().setItem(PAD_TIP_KEY, t.checked ? "0" : "1"); } catch (_e){}
      padTipsApply();
      if (t.checked) padTipShow(1);
    });
  }
  if (nx && !nx.dataset.wired){
    nx.dataset.wired = "1";
    nx.addEventListener("click", function(){ padTipShow(1); });
  }
}
function padOpen(){
  try { padTipsStart(); } catch (_e){}
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
  try { padTipsWire(); } catch (_e){}
  /* NOT REMEMBERED, unlike the pen. The pen is a fact about the hand doing the drawing and is the
     same every day; this is a trade against one volume\'s download, and starting a session by
     silently fetching 1.7 MB because of something ticked last week is not a kindness. */
  const fine = document.getElementById("tracePadFine");
  if (fine) fine.addEventListener("change", function(){ padFineSet(fine.checked); });
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
    /* BEFORE padErase, which on a PC is ctrl alone and would otherwise delete the contour this
       gesture is asking for a copy of. Left button only, like everything else that draws. */
    if (e.shiftKey && padErase(e) && e.button === 0){
      down = null; dragging = null; padCopyContourAt(e); return;
    }
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
    /* +/- ZOOM (2026-10-06). "=" and "_" are the unshifted keys under + and − on most
       layouts, and the numpad sends its own names; all of them mean the same thing here. */
    if (e.key === "+" || e.key === "=" || e.key === "Add"){ padZoomStep(1); e.preventDefault(); }
    else if (e.key === "-" || e.key === "_" || e.key === "Subtract"){ padZoomStep(-1); e.preventDefault(); }
    else if (e.key === ","){ padStep(-1); e.preventDefault(); }
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
    /* VASCULATURE SITS WITH THE CELL ITSELF, above the organelles: like the whole cell and the
       nucleus it is a whole object you outline because the segmentation has not given you one,
       and unlike every kind below it, it is part of no cell at all (2026-10-08). */
    const vesselOpts=(window.UJ&&UJ.tracing&&UJ.tracing.VESSELS)
      ? ('<optgroup label="Vasculature">'
         + UJ.tracing.VESSELS.map(function(v){
             return '<option value="'+escHtml(v.value)+'">'+escHtml(v.label)+'</option>'; }).join("")
         + '</optgroup>')
      : "";
    what.innerHTML='<optgroup label="The cell itself">'
      +'<option value="__cell">Whole cell \u2014 the cell\u2019s own mesh</option>'
      +'<option value="__nucleus">Nucleus</option></optgroup>'
      +vesselOpts
      +((typeof ORGANELLE_KIND_OPTIONS_HTML!=="undefined")
          ? ORGANELLE_KIND_OPTIONS_HTML : UJ.organelles.optionsHtml())
      +'<optgroup label="Not on the list"><option value="__other">Something else \u2014 type the name</option></optgroup>';
    what.value="__cell";
    what.addEventListener("change",function(){
      document.getElementById("tracingNameRow").style.display=(what.value==="__other")?"":"none";
      if(what.value==="__other")document.getElementById("tracingName").focus();
      /* The vessel box, and the colour that goes with the kind. Picking "Capillary" and getting
         the previous structure's green would make six vessels in one scene unreadable, which is
         the whole reason the colours are declared beside the kinds (2026-10-08). */
      try { tracingVesselSync(); } catch (_ev){}
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
  /* ── READ NOTHING BEFORE THE STORE IS READY ──────────────────────────────────  2026-10-05
     This is the line that would destroy the work if the store answered an empty mirror: the list
     is read into memory here and written back from memory later, so reading [] here means writing
     [] over every kept tracing at the next save. The store refuses to be written before it
     hydrates, which stops the damage; waiting here is what stops the wrong answer. */
  function tracingLoadKept(){
    TRACINGS_KEPT=tracingRead();
    tracingRenderList();
    try { draftRender(); } catch (_e){}
  }
  if (window.UJ && UJ.kv && !UJ.kv.hydrated())
    UJ.kv.ready().then(tracingLoadKept, tracingLoadKept);
  else tracingLoadKept();
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
  /* ── MOVE THE COORDINATE AND THE IDS FOLLOW ───────────────────  2026-10-06
     Søren, asked what the boxes should do when the cell changes: *"Clear them when the cell
     changes."* They used to keep whatever was in them -- "never over something typed", which is
     right for a typo and wrong for a different cell, and is how four structures came to be filed
     under a cell 125 µm from where they were drawn.

     ONLY WHEN THE CELL REALLY CHANGED: the nearest nucleus to the new coordinate has to BE a
     different one. Nudging a coordinate a micrometre within the same cell leaves everything alone,
     and a page with no nucleus table says nothing and changes nothing. */
  (function(){
    const at = document.getElementById("tracingCellAt");
    if (!at) return;
    at.addEventListener("change", function(){
      const v = tracingCellAtVal();
      if (!v) return;
      let c = null;
      try { c = tracingNearestCell(v.split(",").map(Number)); } catch (_e){ return; }
      if (!c || !c.nucleusId) return;
      const nucEl = document.getElementById("tracingNucId");
      const rootEl = document.getElementById("tracingRootId");
      const had = nucEl ? String(nucEl.value || "").trim() : "";
      if (had === String(c.nucleusId)) return;
      if (nucEl) nucEl.value = String(c.nucleusId);
      /* THE ROOT ID IS NOT CARRIED OVER. S\u00f8ren: *"we can't always trust the root ID... many
         different cells share the same root ID."* One belonging to the cell you have left is worse
         than none, and an empty box is read again from the coordinate. */
      if (rootEl) rootEl.value = "";
      try { tracingSuggestType(); } catch (_e){}
      tracingSay(had
        ? "That coordinate is in a different cell \u2014 nucleus " + c.nucleusId + ", "
          + (c.distNm / 1000).toFixed(1) + " \u00b5m away. The nucleus box now says so and the "
          + "fragment box is cleared; read it again if you need it."
        : "Nucleus " + c.nucleusId + " is " + (c.distNm / 1000).toFixed(1)
          + " \u00b5m from that coordinate, and is filled in below.");
    });
  })();
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
    "<style>@keyframes padspin{to{transform:rotate(360deg)}}",
    "@media (prefers-reduced-motion:reduce){#tracePadBusy span:first-child{animation:none}}</style>",
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
    "<!-- A DECODER THE BROWSER DOES NOT HAVE.  2026-10-03. Eyewire II\'s retina serves its finest",
    "     three levels as JPEG XL; Chrome cannot read them, so the pad opens at its 128 nm jpeg level",
    "     where a lysosome is four pixels across. Hidden on every volume that does not need it --",
    "     emtiles says which those are -- and off until asked on the one that does, because the",
    "     decoder is 1.7 MB and a chunk takes 45 ms against the browser\'s 8. -->",
    "<label id=\"tracePadFineWrap\" style=\"display:none;font-size:12px;align-items:center;gap:6px;flex:0 0 auto\" title=\"This volume publishes its finest levels in JPEG XL, which this browser cannot read, so the pad is showing you the coarsest ones it can. Ticking this fetches a JPEG XL decoder (about 1.7 MB, once) and the finer levels appear in the menu on the left. They are slower: about 45 ms a chunk against 8 for the levels you have now, and a view is around twenty chunks. The decoding happens off the page\u2019s own thread, so nothing freezes while it loads.\"><input type=\"checkbox\" id=\"tracePadFine\"> the finest levels (fetches a decoder)</label>",
    "<span class=\"hint\" id=\"tracePadFineSay\" style=\"flex:1 1 100%\"></span>",
    "</div>",
    "<div style=\"position:relative;margin-top:8px;overflow:auto;border:1px solid var(--line);border-radius:7px;background:#111\">",
    "<!-- TIPS, 2026-09-22 (src/the_pad_gives_tips.py): the tick on the left turns them off. -->",
    "<style>#tracePadTipBar a{color:var(--accent);text-decoration:underline}</style>",
    "<div id=\"tracePadTipBar\" style=\"position:sticky;left:0;display:flex;gap:10px;align-items:center;padding:6px 10px;background:var(--panel);color:var(--ink);border-bottom:1px solid var(--line);font-size:12.5px;line-height:1.4\">",
    "<label style=\"font-size:12px;display:flex;align-items:center;gap:5px;flex:0 0 auto;margin:0\" title=\"Tips about the pad, about recognising organelles, and how to suggest a change. Untick to hide them.\"><input type=\"checkbox\" id=\"tracePadTips\" checked> Tips</label>",
    "<span id=\"tracePadTip\" style=\"flex:1 1 auto;min-width:0\"></span>",
    "<button type=\"button\" class=\"idbtn\" id=\"tracePadTipNext\" style=\"flex:0 0 auto;padding:1px 9px\" title=\"Another tip\">&rsaquo;</button>",
    "</div>",
    "<canvas id=\"tracePad\" width=\"560\" height=\"460\" style=\"display:block;cursor:crosshair;touch-action:none\"></canvas>",
    "<!-- THE PAD KEEPS THE PREVIOUS SECTION ON SCREEN WHILE THE NEXT ONE FETCHES, so while it loads",
    "     the picture is of somewhere you are not. This says so, over the picture, where the eye is.",
    "     2026-10-06. -->",
    "<div id=\"tracePadBusy\" style=\"position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:10px;background:rgba(13,17,23,.55);color:#fff;font-size:13px;pointer-events:none;backdrop-filter:blur(1px)\">",
    "<span style=\"width:18px;height:18px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:padspin .8s linear infinite;display:inline-block\"></span>",
    "<span class=\"padbusytext\">Loading the section\u2026</span>",
    "</div>",
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
    "<!-- DROP REDUNDANT POINTS, ON THE PAD.  2026-09-22. Søren, with a screenshot of the pad:",
    "     \"I don't see anywhere I can reduce the number of points\" -- the button had gone in the",
    "     found panel, which only appears after a link is read, and the cell he was holding was here.",
    "     See src/the_pad_can_drop_redundant_points_too.py. -->",
    "<button class=\"idbtn\" id=\"padThin\" style=\"display:none;margin-top:4px\" title=\"A contour drawn with a pen is sampled by the pointer, not by the shape: a straight stretch of membrane arrives as twenty points that two would draw identically. This drops those, moving no point of the outline by more than half a voxel. It changes the contours on the pad — nothing is shared until you press “Use these contours”.\">Drop redundant points</button>",
    "<label id=\"padThinNmRow\" style=\"display:none;font-size:12px;align-items:center;gap:6px;margin-top:4px\" title=\"How far a point may move, in nanometres. 16 nm is half a pixel at the 32 nm level tracings are drawn at — below what the screen showed you. Raise it to drop more; the button says how many before you press it.\">within <input type=\"number\" id=\"padThinNm\" value=\"16\" min=\"1\" max=\"400\" step=\"1\" style=\"width:64px\"> nm</label>",
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
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b class=\"padmod\">Ctrl</b>+shift+click a contour</td><td style=\"padding:3px 0\">Copy that contour onto the number you are drawing, on this section &mdash; the nucleus under a whole cell, say. Its points come with it; drag them to fit. <b>Undo</b> takes it back.</td></tr>",
    "<tr><td style=\"padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top\"><b>+</b> and <b>&minus;</b></td><td style=\"padding:3px 0\">Zoom in and out one step of the &micro;m menu. Your contours stay put at every zoom.</td></tr>",
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
    "<!-- SMOOTH IN Z.  2026-09-22. Søren: \"Can we also interpolate between polylines in z?\" Off by",
    "     default: on, the preview and the OBJ loft an interpolated set that CURVES between sections",
    "     rather than cutting straight across. It changes no volume and saves nothing.",
    "     See src/the_mesh_can_be_smoothed_in_z.py. -->",
    "<label style=\"font-size:12px;display:flex;align-items:center;gap:6px;flex:0 0 auto\" title=\"Rounds the surface between sections instead of cutting straight across, by interpolating contours in z — a Catmull-Rom through four consecutive outlines, so a cell that is round stays round between the sections you drew. It affects the 3D view and the OBJ only: no volume changes, and nothing is saved.\"><input type=\"checkbox\" id=\"tracePadSmoothZ\"> smooth between sections</label>",
    "</div>",
    "<div id=\"tracePad3DHost\" style=\"margin-top:6px\"></div>",
    "</div>",
    "<!-- BELOW THE PAD, NOT ABOVE IT.  2026-09-17. This bar appears by itself, a second or so after the",
    "     first contour is closed, and anything that appears ABOVE the canvas pushes the canvas down",
    "     under a pointer that is in the middle of drawing on it. Caught by tracingpanelcheck.js, whose",
    "     click coordinates went stale the moment the bar arrived -- which is the same thing happening to",
    "     a person, one click at a time. -->",
    "<div id=\"tracingDraftAlarm\" style=\"display:none;margin-top:8px;padding:8px;font-size:12px;border:1px solid var(--bad);border-radius:6px\"></div>",
    "<div id=\"tracingDraftBar\" style=\"display:none;margin-top:8px;font-size:12px\"></div>",
    "<!-- The way back in from a rescue file. It sits beside the list rather than inside it because",
    "     the moment somebody needs it is the moment the list has nothing in it. -->",
    "<div style=\"margin-top:6px;font-size:12px\"><label for=\"tracingDraftFileIn\" style=\"display:inline;margin:0 6px 0 0\">Open a draft file</label>",
    "<input type=\"file\" id=\"tracingDraftFileIn\" accept=\".json,application/json\" style=\"font-size:11px\"></div>",
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
    "<!-- THE VESSEL IT IS PART OF.  2026-10-08. S\u00f8ren: a Vasculature topic whose segments are",
    "     traced without belonging to a cell. The name is what joins segments of one vessel; the",
    "     datalist offers the ones already in the dataset. Hidden for every other kind. -->",
    "<div class=\"row\" id=\"tracingVesselRow\" style=\"gap:8px;margin-top:8px;display:none\">",
    "<div class=\"coord\" style=\"flex:1 1 auto\"><input type=\"text\" id=\"tracingVessel\" list=\"tracingVesselNames\" placeholder=\"Name it to join its segments (optional)\" title=\"Segments of one vessel share this name, so a capillary traced across three sessions is one capillary. Leave it empty and the segment is filed under its kind alone. A vessel is filed against NO cell \u2014 not even the one open on this card.\"></div>",
    "<datalist id=\"tracingVesselNames\"></datalist>",
    "</div>",
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
    "<!-- DROP REDUNDANT POINTS.  2026-09-22. Søren, having asked whether pasting a state would",
    "     reduce the points: it did not, because the simplification was on the way OUT only. He chose",
    "     a button over doing it on the way in -- the contours in the sheet are the record. Shown only",
    "     when there is a tenth or more to gain. See src/a_button_drops_the_redundant_points.py. -->",
    "<button class=\"idbtn\" id=\"tracingThin\" style=\"display:none;margin-top:4px\" title=\"A contour drawn with a pen is sampled by the pointer, not by the shape: a straight stretch of membrane arrives as twenty points that two would draw identically. This drops those, moving no point of the outline by more than half a voxel. Your saved tracing changes only if you add it afterwards — read the link again to get every point back.\">Drop redundant points</button>",
    "<label id=\"tracingThinNmRow\" style=\"display:none;font-size:12px;align-items:center;gap:6px;margin-top:4px\" title=\"How far a point may move, in nanometres. 16 nm is half a pixel at the 32 nm level tracings are drawn at — below what the screen showed you. Raise it to drop more; the button says how many before you press it.\">within <input type=\"number\" id=\"tracingThinNm\" value=\"16\" min=\"1\" max=\"400\" step=\"1\" style=\"width:64px\"> nm</label>",
    "<!-- DROP REDUNDANT SECTIONS.  2026-09-23. Søren: \"Can we reduce z-layers that are redundant",
    "     in addition?\" A section already on the straight line between its neighbours adds nothing to",
    "     the mesh or the volume. Unlike dropping POINTS this moves the Cavalieri figure, so the",
    "     sentence says the stable one. See src/redundant_sections_can_go_too.py. -->",
    "<button class=\"idbtn\" id=\"tracingThinZ\" style=\"display:none;margin-top:4px\" title=\"Drops whole sections whose contour already lies on the straight line between the sections above and below — which is what the mesh and the volume assume between them anyway. Unlike dropping points, this changes which sections the volume is summed over: the figure between the outermost contours stays put, the Cavalieri one moves. Nothing is saved until you add it.\">Drop redundant sections</button>",
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
  try { await padFineOffer(); } catch (_e){}
  return true;
}

/* ── OFFER THE DECODER ONLY WHERE IT WOULD DO SOMETHING ────────────────────────  2026-10-03
   Asked of core/emtiles.js rather than of the dataset row, because emtiles is the thing that
   dropped the levels and the only thing that knows a volume HAD any. On the sixty-seven volumes
   whose levels the browser can already read this leaves the label hidden and does nothing else.

   Hidden rather than absent once ticked: the tick stays on screen so it can be unticked, which is
   how somebody who tried the 16 nm level and found it too slow gets back to the fast one. */
async function padFineOffer(){
  var wrap = document.getElementById("tracePadFineWrap");
  if (!wrap) return false;
  var want = [];
  try { want = await UJ.emtiles.unreadableEncodings(); } catch (_e){ want = []; }
  var can = !!(window.UJ && UJ.jxl && UJ.jxl.supported());
  var offer = (PAD_FINE || (want.indexOf("jxl") >= 0)) && can;
  wrap.style.display = offer ? "flex" : "none";
  return offer;
}

/* The tick itself. Three things happen, in this order, and the order is the point: the decoder has
   to be UP before emtiles is reconfigured, because tracingDecoders() returns null until it is --
   reconfiguring first would quietly set no decoders and leave the menu unchanged, which looks
   exactly like the tick not working. */
async function padFineSet(on){
  var say = document.getElementById("tracePadFineSay");
  var box = document.getElementById("tracePadFine");
  var tell = function(t){ if (say) say.textContent = t || ""; };
  if (on){
    tell("Fetching the JPEG XL decoder (about 1.7 MB, once)\u2026");
    try { await UJ.jxl.start(); }
    catch (e){
      PAD_FINE = false; if (box) box.checked = false;
      tell("The decoder would not load: " + ((e && e.message) || e)
           + " \u2014 the pad is still on the levels it can read.");
      return false;
    }
  }
  PAD_FINE = !!on;
  try { UJ.emtiles.configure(tracingSources()); } catch (_e){}
  try { await padRelabelMips(); } catch (_e){}
  try { await padDraw(); } catch (_e){}
  tell(on
    ? "The finer levels are in the menu on the left. About 45 ms a chunk against 8, and a view is "
      + "around twenty chunks \u2014 decoded off the page\u2019s own thread, so nothing freezes."
    : "Back to the levels the browser reads itself.");
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
/* ── A DEFAULT LOOK FOR THE LINK BOX ─────────────────────────────────────────  2026-09-22
   First in <head>, so any page's own textarea rule wins over it; ωJump has none, and showed the
   browser's bare white box. See src/the_card_styles_its_own_link_box.py. */
function tracingCardDefaultStyle(){
  if (document.getElementById("tracingCardDefaults")) return;
  var st = document.createElement("style");
  st.id = "tracingCardDefaults";
  st.textContent = "textarea{width:100%;box-sizing:border-box;min-height:64px;resize:vertical;"
    + "background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;"
    + "padding:9px 11px;font-family:var(--mono,ui-monospace,monospace);font-size:12px}";
  var head = document.head || document.documentElement;
  head.insertBefore(st, head.firstChild);
}
UJ.tracingcard.mount = function(el){
  try { tracingCardDefaultStyle(); } catch (_e){}
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
