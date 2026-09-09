/* The volume button after a compute that was not saved, and the panel that waits.   2026-09-09

   Drives the REAL decorateMeshVolButtons()/volRowFor()/reloadRootIdPanelWhen() text lifted out of
   each shipped page (pagefn.js), against a hand-built DOM small enough to reason about. Three
   claims, all from Søren's πJump report:

     1. a volume computed while signed out leaves a button to save it with
     2. a cell whose proposed fragment can never be fetched does not offer "Recalculate" forever
     3. the propose panel re-reads until the row is there, not after a fixed 1500 ms

   Run: node rootidvolcheck.js  */
const vm = require("vm");
const { fnText } = require("./pagefn.js");

const PAGES = ["ujump.html", "djump.html", "pjump.html"];
let fails = 0;
function ok(cond, what){ console.log((cond ? "  ok   " : "  FAIL ") + what); if (!cond) fails++; }

/* ── the fetch half: a root ID that cannot be fetched comes back by name ────────────────────────
   The real fetchCombinedMesh() from core/mesh.js, run against a stub fetchMesh where one of two
   candidates throws -- πJump's 648518346341354380, whose mesh is 128 fragments and over 192 MB.
   Dropping it and drawing the rest is right; dropping it silently is what made Søren conclude his
   proposal had been ignored. */
(async function meshHalf(){
  console.log("core/mesh.js");
  const mctx = vm.createContext({ console, Error, Float32Array, Uint32Array, Promise, String });
  mctx.CFG = {};
  mctx.extraImg65RootIds = () => ["B"];
  mctx.fetchMesh = async (id) => {
    if (id === "B") throw new Error("mesh is larger than 192 MB (128 fragments).");
    return { positions: new Float32Array([0,0,0]), indices: new Uint32Array([0]), lod: 0, numLods: 1, bytes: 12 };
  };
  vm.runInContext(fnText("core/mesh.js", "fetchCombinedMesh"), mctx);
  mctx.out = null;
  await vm.runInContext('fetchCombinedMesh("A").then(function(m){out=m;})', mctx);
  await new Promise(r => setTimeout(r, 50));
  const m = mctx.out;
  ok(!!m && m.fragmentCount === 1, "an unfetchable candidate does not cost the whole cell");
  ok(!!m && m.skipped && m.skipped.length === 1, "...and it is reported, not only logged");
  ok(!!m && m.skipped[0].rootId === "B", "...by root ID  <- " + (m && m.skipped[0] && m.skipped[0].rootId));
  ok(!!m && /192 MB/.test(m.skipped[0].message), "...with the reason a person can act on");
  ok(!!m && m.mainUnavailable === false, "...and the main root ID is still the main root ID");

  mctx.extraImg65RootIds = () => [];
  mctx.out = null;
  await vm.runInContext('fetchCombinedMesh("A").then(function(m){out=m;})', mctx);
  await new Promise(r => setTimeout(r, 50));
  ok(mctx.out && mctx.out.skipped.length === 0, "nothing skipped on the ordinary path");
})();

/* ── a DOM just big enough ──────────────────────────────────────────────────────────────────── */
function el(cls){
  return { className: cls || "", classList: { contains: c => (" " + (cls||"") + " ").indexOf(" "+c+" ") >= 0 },
           style: {}, dataset: {}, title: "", textContent: "", disabled: false,
           nextElementSibling: null, _kids: [],
           querySelector(sel){ return this._kids.filter(k => k.className.indexOf(sel.replace(".","")) >= 0)[0] || null; },
           closest(){ return this._row || null; } };
}
function scene(opts){
  const btn = el("meshvol");
  btn.dataset.root = "R1"; btn.dataset.nucid = "N1";
  if (opts.volFresh) btn.dataset.volFresh = "1";
  /* What the click handler left behind: hidden when the save went through, still there when the
     gate refused it. Starting from "" in both would let a check pass on a button decorate never
     touched. */
  btn.style.display = opts.display === undefined ? "" : opts.display;
  const row = el("idrow"); row._kids = [btn]; btn._row = row;
  const valSpan = el("idval");
  const volrow = el("idrow volrow"); volrow._kids = [valSpan]; volrow.style.display = "none";
  const host = el("m3d-host");                 // the thing that broke volRowFor in September
  row.nextElementSibling = host; host.nextElementSibling = volrow;
  return { btn, row, volrow, valSpan };
}

for (const page of PAGES){
  console.log(page);
  const ctx = vm.createContext({ console });
  vm.runInContext(fnText(page, "volRowFor") + "\n" + fnText(page, "decorateMeshVolButtons"), ctx);

  function run(known, curFrag, s){
    ctx.window = { _computedVolumesMap: known ? { R1: known } : {} };
    ctx._computedVolumesMap = ctx.window._computedVolumesMap;
    ctx.MeshDL = { currentFragmentCount: () => curFrag };
    ctx.document = { querySelectorAll: () => [s.btn] };
    vm.runInContext("decorateMeshVolButtons()", ctx);
  }

  /* 1. computed while signed out: the button must survive, and say what it is for. */
  let s = scene({ volFresh: true });
  run({ volumeUm3: 305, fragmentCount: 1, combinedFrom: 1, unsaved: true,
        unsavedWhy: "Not saved to the shared record — sign in with Google (top right).",
        skipped: [], timestamp: "2026-09-09" }, 1, s);
  ok(s.btn.style.display === "", "an unsaved volume keeps its button visible");
  ok(s.btn.textContent === "Save volume", "...labelled Save volume, not Compute volume");
  ok(/not saved/i.test(s.btn.title), "...and the tooltip says why");
  ok(/not saved/.test(s.valSpan.textContent), "...and the number is marked not saved");

  /* 2. saved, nothing new proposed: hidden, as before. */
  s = scene({ volFresh: true, display: "none" });
  run({ volumeUm3: 305, fragmentCount: 1, combinedFrom: 1, unsaved: false, skipped: [] }, 1, s);
  ok(s.btn.style.display === "none", "a saved, current volume hides its button");

  /* 3. one more root ID proposed since: Recalculate comes back even though volFresh is set. */
  s = scene({ volFresh: true });
  run({ volumeUm3: 305, fragmentCount: 1, combinedFrom: 1, unsaved: false, skipped: [] }, 2, s);
  ok(s.btn.textContent === "Recalculate", "a newly proposed root ID reopens Recalculate");

  /* 4. THE πJUMP CASE: two root IDs attempted, one refused by the size guard. The compute already
        included everything it ever can, so there is nothing to recalculate -- but the row has to
        say a fragment is missing rather than quietly reporting a one-fragment volume. */
  s = scene({ volFresh: true, display: "none" });
  run({ volumeUm3: 305, fragmentCount: 1, combinedFrom: 2, unsaved: false,
        skipped: [{ rootId: "648518346341354380", message: "mesh is larger than 192 MB (128 fragments)." }] }, 2, s);
  ok(s.btn.style.display === "none", "an unfetchable fragment does not offer an endless Recalculate");
  ok(/1 fragment missing/.test(s.valSpan.textContent), "...and the volume row says a fragment is missing");

  /* 5. the panel waits for the row rather than for a stopwatch. */
  const pctx = vm.createContext({ console, setTimeout, encodeURIComponent });
  pctx.REPORT_ENDPOINT = "https://example.invalid/exec";
  let reads = 0, rendered = 0;
  pctx.loadRootIdPanel = () => { rendered++; };
  pctx.fetch = () => { reads++;
    return Promise.resolve({ json: () => Promise.resolve({ rootIds: reads >= 3 ? [{ rootId: "X" }] : [] }) }); };
  vm.runInContext(fnText(page, "reloadRootIdPanelWhen"), pctx);
  vm.runInContext('reloadRootIdPanelWhen("N1",null,function(l){return l.some(function(x){return x.rootId==="X";});})', pctx);
  const settled = new Promise(r => setTimeout(r, 2600));
  settled.then(() => {
    ok(reads === 3, "the panel re-read until the row appeared (" + reads + " reads)");
    ok(rendered === 1, "...and rendered exactly once, when it was there");
    if (page === PAGES[PAGES.length - 1]){
      console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
      process.exit(fails ? 1 : 0);
    }
  });
}
