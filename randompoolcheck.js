/* A random example of a type is still that type.                                   2026-09-09

   Søren, on πJump: "When clicking the random button, it should only show Glia cells that have not
   been given a different name by community reports."

   Drives the REAL rebuildTypePools() lifted out of each shipped page (pagefn.js) over a
   six-nucleus dataset covering every way a cell can disagree with its prediction: own-verified,
   merged breakdown, community rename, community agreement.

   Run: node randompoolcheck.js  */
const vm = require("vm");
const { fnText, source } = require("./pagefn.js");

const PAGES = ["ujump.html", "djump.html", "pjump.html"];
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

for (const page of PAGES){
  console.log(page);
  const ctx = vm.createContext({ console, String, Object, Array });

  /* 0 glia, predicted, untouched                    -> in the glia pool
     1 glia, predicted, community says "Astrocyte"   -> OUT (the whole request)
     2 glia, predicted, community says "Glia"        -> IN  (agreement is not disagreement)
     3 glia, predicted, own-verified Astrocyte       -> OUT (already worked)
     4 no prediction, nothing said                   -> unassigned
     5 no prediction, community says "Microglia"     -> NOT unassigned any more            */
  Object.assign(ctx, {
    N: 6,
    CT_NAMES: ["glia"],
    IDX_BY_TYPE: { glia: [] },
    UNASSIGNED_IDX: [],
    NT:       [1, 1, 1, 1, 0, 0],
    OWN_TYPE: [255, 255, 255, 0, 255, 255],
    OWN_TYPE_NAMES: ["Astrocyte"],
    NID: [100, 101, 102, 103, 104, 105],
    NX: [0,0,0,0,0,0], NY: [0,0,0,0,0,0], NZ: [0,0,0,0,0,0],
    mergedInfo: () => null,
    inRegion: () => true,
    window: { __COMM_ROWTYPE: { "101": "Astrocyte", "102": "Glia", "105": "Microglia" } }
  });
  vm.runInContext(fnText(page, "commTypeForIndex") + "\n"
                + fnText(page, "sameTypeName") + "\n"
                + fnText(page, "rebuildTypePools"), ctx);
  vm.runInContext("rebuildTypePools()", ctx);

  const glia = ctx.IDX_BY_TYPE.glia, un = ctx.UNASSIGNED_IDX;
  ok(glia.indexOf(0) >= 0, "an untouched prediction is still an example");
  ok(glia.indexOf(1) < 0, "a cell the community renamed is not", "nucleus 101 → Astrocyte");
  ok(glia.indexOf(2) >= 0, "a community report that AGREES keeps the cell", '"Glia" vs "glia"');
  ok(glia.indexOf(3) < 0, "an own-verified contradiction is still excluded");
  ok(glia.length === 2, "so the pool holds exactly the two that are still glia", glia.join(","));
  ok(un.indexOf(4) >= 0, "a cell nobody has named is unassigned");
  ok(un.indexOf(5) < 0, "a cell the community named is not", "nucleus 105 → Microglia");

  /* Before the fetch lands there is no map at all, and the pools must be whole rather than empty --
     otherwise every count would read 0 for the first second of every page load. */
  ctx.window.__COMM_ROWTYPE = null;
  vm.runInContext("rebuildTypePools()", ctx);
  ok(ctx.IDX_BY_TYPE.glia.length === 3,
     "with no community map yet, only the old two rules apply", ctx.IDX_BY_TYPE.glia.join(","));

  /* ...which is exactly why the fetch has to re-run this. */
  const src = source(page);
  ok(/ALL_IDENTITIES=null;[\s\S]{0,2000}?rebuildTypePools\(\)/.test(src),
     "the community fetch rebuilds the pools");
  ok(/ALL_IDENTITIES=null;[\s\S]{0,2500}?populateRandomTypeSelect\(\)/.test(src),
     "...and the dropdown, so its counts follow");
  /* ...without dropping the chosen type. This used to assert a hand-carry at THIS call site, which
     read the value before calling and wrote it back after. That was right while nothing else did
     it, and wrong from 2026-09-18: populateRandomTypeSelect awaits two whole-sheet reads, so a
     pre-await value forced back afterwards overwrites a type the person chose while they were in
     flight — the very bug, one layer up. The keeping now lives in the one function that owns the
     assignment, one statement before it, which is the only position that survives the await.
     Asserted as adjacency rather than mere presence: `const wasType` somewhere in the file would
     pass while the read sat at the top of the function and lost the race. Behaviour is checked by
     randomtypecheck.js, which drives the race itself; this is the structural half. */
  ok(/const wasType=randomTypeSelect\.value;\s*\n\s*randomTypeSelect\.innerHTML=opts;/.test(src),
     "...without dropping the chosen type — read one statement before the rebuild");
  ok(!/wasType&&el\.querySelector/.test(src),
     "...and the old hand-carry, which would force a stale value back over it, is gone");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
