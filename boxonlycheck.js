/* A per-box notebook carries that box, and not the one next to it.                    2026-10-07

   Søren, with two boxes side by side in ηJump's Filter-and-show: *"When I download the Blender
   file for each of the boxes, they seem to contain more than their own data, but also data from
   the other boxes."*

   WHERE IT GOT IN. core/blenderexport.js asks the dataset for every outline filed against the
   export's cells (datasetTracingsFor, 2026-09-26) and marks each one `for_export = 1`. The filter
   below it then opened with

       if (t && t.for_export) return true;

   on the reasoning, written into the file, that those outlines are "BY CONSTRUCTION THEIRS:
   tracedStructuresForCells was handed these cells' ids and returned only what matched one of
   them". That construction is the `nucleus or root` test this week has already been spent
   removing from eight other places. His vascular cells all share root 6198781614 — which is the
   whole reason he traces them by hand — so the fetch for box 1's cells returns box 2's outlines
   too, each one flagged, each one waved past both the id test AND the box test below it.

   WHAT IS ASSERTED:
     - an outline fetched for a cell in ANOTHER box does not travel in this box's notebook
     - ...and the one in this box still does
     - a cell matched only by a shared root id is not enough to carry an outline out of the box
     - ...while a nucleus id or a coordinate still is, even for an outline just outside it
     - the notebook says how many it left behind, because a filter without a remainder is an
       invisible change
     - an outline with no geometry to judge is still kept, as it was

   Run: node boxonlycheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* Two of his cells, ~125 µm apart, one in each box, sharing one root id. Voxels at 4/4/40 nm. */
const R = [4, 4, 40];
const A = [401085, 230736, 380];          // box 1
const B = [427087, 220193, 1940];         // box 2
const ROOT = "6198781614";
const BOX1 = { xmin: 398472 * 4, xmax: 408844 * 4, ymin: 227782 * 4, ymax: 232124 * 4,
               zmin: 181 * 40, zmax: 972 * 40 };
const ring = (z, x, y, r) => ({ z: z, points: [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]] });

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3000);

  const has = await p.evaluate(() => !!(window.UJ && UJ.blender && UJ.blender.buildNotebook));
  if (!has){
    console.log("  (this page has no Blender export — nothing to check)");
    await b.close(); process.exit(0);
  }

  const r = await p.evaluate(({ A, B, ROOT, BOX1, R, ring }) => {
    const sq = new Function("return " + ring)();
    /* ηJump's own cell shape: H01 publishes no nucleus volume, so nucleus_id is null and the id
       its tracings are filed under travels as trace_nucleus_id. */
    const cells = [{ type: "Endothelial cell", root_id: ROOT, nucleus_id: null,
                     trace_nucleus_id: "61360735", cell_coord: A.join(",") }];
    /* As tracedStructuresForCells returns them: camelCase, with rings, flagged by the fetch. */
    const mk = (name, nid, at, pt, flag) => ({
      name: name, kind: "cell", type: "traced", nucleusId: nid, rootId: ROOT,
      cellCoord: at.join(","), for_export: flag ? 1 : 0,
      rings: [sq(pt[2], pt[0], pt[1], 300), sq(pt[2] + 1, pt[0], pt[1], 320)]
    });
    const tracings = [
      mk("Whole cell HERE", "61360735", A, A, true),
      mk("Whole cell NEXT DOOR", "394673650", B, B, true),
      mk("Nucleus NEXT DOOR", "394673650", B, B, true)
    ];
    /* Just outside box 1 but filed against THIS cell by nucleus id — the case the box test alone
       would throw away. */
    const edge = mk("Cilium AT THE EDGE", "61360735", A, [BOX1.xmax / 4 + 60, A[1], A[2]], true);
    /* No geometry at all: nothing to judge it by, so it is kept rather than dropped in silence. */
    const blind = { name: "Outline WITH NO CONTOURS", kind: "cell", type: "traced",
                    nucleusId: "61360735", rootId: ROOT, cellCoord: A.join(","),
                    for_export: 1, rings: [] };

    const run = (trs) => {
      const nb = UJ.blender.buildNotebook({
        datasetId: "hjump", datasetLabel: "ηJump", emSource: "", segSource: "",
        boxNM: BOX1, boxLabel: "Box 1", cells: cells, tracings: trs, resNm: R,
        datasetTracings: false,
        include: { em: true, seg: true, meshes: true, nuclei: false, vasc: false }
      });
      const src = JSON.stringify(nb);
      return { has: (n) => src.indexOf(n) >= 0, src: src };
    };

    const one = run(tracings);
    const two = run(tracings.concat([edge]));
    const three = run([blind]);
    const said = (one.src.match(/[^"]*left out[^"]*/) || [""])[0];
    return {
      here: one.has("Whole cell HERE"),
      nextDoor: one.has("Whole cell NEXT DOOR") || one.has("Nucleus NEXT DOOR"),
      edge: two.has("Cilium AT THE EDGE"),
      blind: three.has("Outline WITH NO CONTOURS"),
      said: said,
      why: (typeof UJ.tracing.sameCellWhy === "function")
        ? [UJ.tracing.sameCellWhy({ root: ROOT }, { root: ROOT }),
           UJ.tracing.sameCellWhy({ nuc: "1", root: ROOT }, { nuc: "1", root: ROOT }),
           UJ.tracing.sameCellWhy({ at: "1,2,3" }, { at: "1,2,3" }),
           UJ.tracing.sameCellWhy({ at: "1,2,3" }, { at: "9,9,9" })].join("/")
        : "(no sameCellWhy)"
    };
  }, { A, B, ROOT, BOX1, R, ring: ring.toString() });

  console.log("box 1's notebook, with box 2's cell sharing its root id");
  ok(r.here, "the outline of the cell in THIS box travels", String(r.here));
  ok(!r.nextDoor,
     "the outlines of the cell 125 µm away do not — they were fetched because the two cells share "
     + "root " + ROOT + ", which is exactly why he traced them by hand",
     r.nextDoor ? "still in the notebook" : "left out");
  ok(r.edge,
     "...while an outline filed against THIS cell by its nucleus id still travels even when its "
     + "centre is just outside the box, because it is this cell's and a tight box is not a claim "
     + "about where a cell ends", String(r.edge));
  ok(r.blind, "...and one with no contours to judge is kept, not dropped in silence", String(r.blind));

  console.log("\nand the notebook says what it left behind");
  ok(/2 .*left out/.test(r.said), "the two that did not travel are counted in the written cell",
     r.said || "(said nothing)");

  console.log("\nand the one definition names its own evidence");
  ok(r.why === "root/nuc/at/",
     "UJ.tracing.sameCellWhy says WHICH of coordinate, nucleus or root carried a match, so "
     + "\"the same cell\" is still one rule and a root-only match can be weighed differently",
     r.why);

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
