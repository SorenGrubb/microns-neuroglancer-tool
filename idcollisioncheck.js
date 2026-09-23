/* A second cell with the same NAME does not take the first one's id.                  2026-09-23

   Søren: "one of the arachnoid barrier cells is missing".

   IT WAS OVERWRITTEN. Two rows in the sheet carry the SAME structureId, whole-cell_1790144992280:

     nucleus 286849   140 sections, 176 contours, 30,948 vertices, 3,615 µm³   <- gone from the list
     nucleus 286159   105 sections, 114 contours,  9,322 vertices,   985 µm³   <- shown, as "v2"

   Two different cells, filed as two versions of one structure, so the list shows only the later.
   tracingCurrentAll picked the id like this:

       const prior = TRACINGS_KEPT.filter(x => x && x.id && x.name === label)[0];
       TRACING_PENDING.id = (prior && prior.id) || UJ.tracing.structureId(label);

   Matching on the NAME alone. "Whole cell" is the default name of every cell anybody traces, and
   "Lysosome 1" of every cell's first lysosome — so the second arachnoid barrier cell found the
   first by name and took its id. The intent was right (an edited tracing keeps its id, so it files
   a version rather than a twin); the key was far too weak.

   A structure is identified by its name AND THE CELL IT IS PART OF. A different nucleus or root is
   a different cell, and nothing about it can be a version of the other.

   Run: node idcollisioncheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  const got = await p.evaluate(() => {
    const rings = (n) => {
      const out = [];
      for (let z = 0; z < n; z++){
        const pts = [];
        for (let i = 0; i < 12; i++){
          const a = 2 * Math.PI * i / 12;
          pts.push([Math.round(295000 + 300 * Math.cos(a)), Math.round(151000 + 300 * Math.sin(a))]);
        }
        out.push({ z: 18000 + z, points: pts, inst: 0 });
      }
      return out;
    };
    /* The id is chosen at the top of tracingCurrentAll from TRACING_PENDING and TRACINGS_KEPT. */
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; return !!el; };
    /* A DETERMINISTIC MINT, so this check tests the LOOKUP and nothing else. With the real
       structureId() a fresh id differs from a prior one by its timestamp, which would let this pass
       on minting alone even if the lookup were still matching the wrong cell. Here a fresh id says
       "minted_N" and a reused one says what it was called before, so the two cases cannot be
       confused. structureId's own uniqueness is structureidcheck.js's business. */
    let minted = 0;
    UJ.tracing.structureId = function(){ return "minted_" + (++minted); };
    const idFor = (nuc, root, name, kept) => {
      TRACINGS_KEPT = kept;
      TRACING_PENDING = { rings: rings(4), groups: null };
      TRACING_BASE_ID = "";
      try { PAD_EDIT_ID = ""; PAD_EDIT_IDS = {}; } catch (_e){}
      /* "__cell" is the dropdown value that means a whole cell; it names itself "Whole cell",
         which is the whole point of this check. */
      set("tracingWhat", "__cell");
      set("tracingName", name);
      set("tracingType", "traced");
      set("tracingNucId", nuc);
      set("tracingRootId", root);
      set("tracingX", ""); set("tracingY", ""); set("tracingZ", "");
      const all = tracingCurrentAll();
      return { id: (all[0] && all[0].id) || (TRACING_PENDING && TRACING_PENDING.id) || "",
               name: (all[0] && all[0].name) || "", n: all.length,
               say: (document.getElementById("tracingStatus") || {}).textContent || "" };
    };

    /* Cell A, traced and kept. */
    const A = idFor("286849", "", "Whole cell", []);
    const keptA = [{ id: A.id, name: A.name || "Whole cell", kind: "cell", nucleus_id: "286849",
                     root_id: "", rings: rings(4) }];
    /* Cell B: a DIFFERENT arachnoid barrier cell, same default name. */
    const B = idFor("286159", "", "Whole cell", keptA);
    /* Cell A again, edited: same name AND same nucleus, so it must keep its id. */
    const A2 = idFor("286849", "", "Whole cell", keptA);
    /* And by ROOT id, for a cell with no nucleus. */
    const keptR = [{ id: "whole-cell_r1", name: "Whole cell", kind: "cell", nucleus_id: "",
                     root_id: "864691135345326066", rings: rings(4) }];
    const R1 = idFor("", "864691135345326066", "Whole cell", keptR);
    const R2 = idFor("", "864691136116229028", "Whole cell", keptR);
    return { idA: A.id, idB: B.id, idA2: A2.id, idR1: R1.id, idR2: R2.id,
             nameA: A.name, nA: A.n, sayA: A.say };
  });

  console.log("two arachnoid barrier cells, both called “Whole cell”");
  ok(!!got.idA && !!got.idB, "both get an id", got.idA + " / " + got.idB);
  ok(got.idA !== got.idB,
     "...and they are DIFFERENT: a different nucleus is a different cell",
     got.idA === got.idB ? "BOTH " + got.idA + " — the second overwrites the first" : "distinct");

  console.log("\nand the thing the name-match was for still works");
  ok(got.idA2 === got.idA,
     "the same cell traced again keeps its id, so it files a version rather than a twin",
     got.idA2 + " == " + got.idA);
  ok(got.idR1 === "whole-cell_r1",
     "...matched on the ROOT id too, for a cell with no nucleus", got.idR1);
  ok(got.idR2 !== "whole-cell_r1",
     "...and a different root is a different cell", got.idR2);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
