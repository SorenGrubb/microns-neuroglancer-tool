/* The filter reads what the count reads.                                           2026-09-10

   Søren: "In uJump, when I filter for astrocytes near the glia limitans, I can see that they have
   NR type II in many of them, but if I tick this box, it finds 0 results. Why?"

   Because on 2026-09-09 the COUNT beside the checkbox learned to read the embedded own-verified
   snapshot (ORGANDATA.HOLES = astrocyte holes = NR type II, ORGANDATA.PLUGS = microglia plugs) and
   the MATCHER did not — it named centriole and cilium by hand and sent every other kind to the
   sparse community map, which holds exactly ONE NR-II report in the whole dataset. 191 on the
   label, 1 findable, 0 once his other filters applied.

   So this file drives BOTH halves, out of the shipped pages, over ONE fixture, and asserts they
   agree. Not "the matcher looks right" — the number on the checkbox and the number of rows the
   matcher accepts have to be the same number, which is the promise the count's own tooltip makes.

   The count comes out whole via pagefn.fnText(). The matcher is a block inside runFilter() (25 kB,
   DOM-bound, unliftable), so it is SLICED out of the page by its own first and last lines and run
   as written — the page's text, not a retyped copy; a drift in either would fail the slice.

   Run: node organellefiltercheck.js  */
const vm = require("vm");
const { fnText, source } = require("./pagefn.js");

const PAGES = ["ujump.html", "djump.html", "pjump.html"];
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* ── the matcher, as the page writes it ─────────────────────────────────────────────────────── */
const HEAD = 'const orgNid=String(rowNucId(row)||"");';
const TAIL = 'const organelleMatch=';
function matcherText(page) {
  const s = source(page);
  const a = s.indexOf(HEAD);
  const b = s.indexOf(TAIL, a);
  if (a < 0 || b < 0) return null;
  return s.slice(a, b);
}

/* ── one fixture, six cells ─────────────────────────────────────────────────────────────────────
   0  astrocyte, embedded HOLE, nobody reported anything   <- the cells he is looking at
   1  astrocyte, embedded HOLE, and an NR-II report too    <- must count ONCE, not twice
   2  microglia, embedded PLUG only
   3  nothing at all
   4  a community NR-II report and no embedded hole        <- the one that used to be findable
   5  own-verified cilium, nothing else                                                         */
const HOLES = { "0": [[[1, 1, 1], [2, 2, 2]]], "1": [[[3, 3, 3], [4, 4, 4]]] };
const PLUGS = { "2": [[9, 9, 9]] };
const NID   = [100, 101, 102, 103, 104, 105];
const ORG_MAP = {
  "101": [{ kind: "nucleoplasmic_reticulum_2" }],
  "104": [{ kind: "nucleoplasmic_reticulum_2" }]
};
const HASCIL = { "5": true };

for (const page of PAGES) {
  console.log(page);
  const dense = page === "ujump.html";   /* only µJump ships a non-empty snapshot */

  /* ---- the real count ---------------------------------------------------------------------- */
  const cctx = vm.createContext({ console, String, Number, Object, Array });
  cctx.window = cctx;
  cctx.ORGANDATA = { PLUGS: dense ? PLUGS : {}, HOLES: dense ? HOLES : {} };
  cctx.NID = NID;
  /* The count's own centriole/cilium half reads arrays this fixture does not need to exercise;
     the kinds under test are the two dense maps and the community map. */
  cctx.N = 6;
  cctx.OWN_HASCENT = []; cctx.OWN_HASCIL = [];
  cctx.ST_HASCENT = []; cctx.ST_HASCIL = [];
  vm.runInContext(fnText(page, "ujumpOrganelleCounts"), cctx);
  const counts = vm.runInContext("ujumpOrganelleCounts(" + JSON.stringify(ORG_MAP) + ")", cctx);
  const countNR = counts.nucleoplasmic_reticulum_2 || 0;
  const countPlug = counts.microglia_plug || 0;

  /* ---- the real matcher -------------------------------------------------------------------- */
  const body = matcherText(page);
  ok(!!body, "the matcher block is still where this check slices it");
  if (!body) continue;
  ok(/denseHas/.test(body), "...and it names denseHas", "the fix is in the page");

  const mctx = vm.createContext({ console, String, Number, Object, Array });
  mctx.window = mctx;
  mctx.ORG_MAP = ORG_MAP;
  mctx.ORGANDATA = cctx.ORGANDATA;
  mctx.rowNucId = row => NID[row.i];
  mctx.holesForNucIdx = i => mctx.ORGANDATA.HOLES[String(i)] || null;
  mctx.plugsForNucIdx = i => mctx.ORGANDATA.PLUGS[String(i)] || null;
  /* The block is written inside runFilter's per-row closure, which has already computed hasCent,
     hasCil, row and organelleKinds. Wrapping it in a function with exactly those four names runs
     the page's own text in the page's own scope shape. */
  vm.runInContext(
    "function match(row,hasCent,hasCil,organelleKinds){\n" + body + "\nreturn hasKind;\n}", mctx);
  const match = (i, kinds) =>
    mctx.match({ i: i, space: "N" }, false, !!HASCIL[String(i)], kinds || []);

  const nrRows = [0, 1, 2, 3, 4, 5].filter(i => match(i, ["nucleoplasmic_reticulum_2"]));
  const plugRows = [0, 1, 2, 3, 4, 5].filter(i => match(i, ["microglia_plug"]));

  if (dense) {
    console.log("  -- µJump ships 190 holes and 69 plugs; this fixture stands in for them");
    ok(match(0, ["nucleoplasmic_reticulum_2"]),
       "a cell with an EMBEDDED hole and no report matches NR type II  ← the whole bug",
       "cell 0");
    ok(match(2, ["microglia_plug"]), "...and an embedded plug matches microglia plug", "cell 2");
    ok(nrRows.join(",") === "0,1,4",
       "the NR-II filter returns embedded, embedded+reported, and reported", nrRows.join(","));
    ok(countNR === 3, "and the COUNT on the checkbox says three", String(countNR));
    ok(countNR === nrRows.length,
       "COUNT === ROWS THE FILTER RETURNS — the promise the tooltip makes",
       countNR + " vs " + nrRows.length);
    ok(countPlug === plugRows.length,
       "...the same for microglia plugs", countPlug + " vs " + plugRows.length);
    ok(!match(3, ["nucleoplasmic_reticulum_2"]), "a cell with nothing on it still matches nothing");
    ok(match(0, []), "“annotated with anything at all” sees the embedded hole too",
       "ticking nothing must not find fewer cells than ticking everything");
    ok(match(2, []), "...and the embedded plug");
    ok(!match(3, []), "...and still not the empty cell");
  } else {
    /* δJump and πJump carry the same code over an EMPTY snapshot. Zero is the honest answer for
       them, and the code must reach it without throwing on a missing map. */
    ok(nrRows.join(",") === "1,4",
       "with an empty snapshot only the reported cells match, as before", nrRows.join(","));
    ok(countNR === nrRows.length, "count and filter still agree at " + countNR);
    ok(plugRows.length === 0 && countPlug === 0, "no plugs either way");
    ok(!match(0, ["nucleoplasmic_reticulum_2"]) && !match(0, []),
       "an index with no entry is a clean miss, not a throw");
  }

  /* A row that is not in nucdata space has no index into the snapshot at all. */
  ok(mctx.match({ i: 0, space: "ST" }, false, false, ["nucleoplasmic_reticulum_2"]) === false,
     "a standalone row cannot borrow nucdata index 0's hole", "row.space check holds");

  /* The community half must survive untouched — this is what used to be the ONLY half. */
  ok(match(4, ["nucleoplasmic_reticulum_2"]), "a community report alone still matches");
  ok(match(5, ["cilium"]) === true, "own-verified cilium still matches through denseHas");
  ok(match(5, ["centriole"]) === false, "...and does not leak into centriole");
}

/* ── the two halves name the same sources ───────────────────────────────────────────────────────
   The failure was not a typo, it was two lists. If a kind is ever taught to the count and not to
   denseHas, this is what says so. */
console.log("\nboth halves name the same dense sources");
for (const page of PAGES) {
  const src = source(page);
  const cnt = fnText(page, "ujumpOrganelleCounts");
  const mat = matcherText(page);
  for (const k of ["microglia_plug", "nucleoplasmic_reticulum_2"]) {
    ok(cnt.indexOf(k) >= 0 && mat.indexOf(k) >= 0,
       page + ": " + k + " is named by the count AND the matcher");
  }
  ok(/ORGANDATA\.PLUGS/.test(cnt) && /plugsForNucIdx/.test(mat),
     page + ": both reach the plug snapshot");
  ok(/ORGANDATA\.HOLES/.test(cnt) && /holesForNucIdx/.test(mat),
     page + ": both reach the hole snapshot");
  ok(src.indexOf(HEAD) === src.lastIndexOf(HEAD),
     page + ": exactly one matcher in the page", "no second copy to drift");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
