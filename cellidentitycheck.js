/* The coordinate is the cell.                                                         2026-10-06

   Søren: *"For these cells I told you the nucleus and rootID are useless, because the vasculature
   segmentation is crap. Therefor I am tracing those myself and reporting what cell is there. I want
   you to fix that when whole cell meshes and nucleus meshes are traced for a cell that has been
   newly reported with a coordinate for the cell center, that is what defines the cell and not the
   faulty rootID or nucleus ID."*

   HIS ROWS WERE NEVER WRONG. The panel read them wrongly, and it was one line:

       return nuc ? "n:" + nuc : (root ? "r:" + root : (coord ? "c:" + coord : ""));

   Nucleus first, root second, coordinate LAST. Four structures reported at 427087, 220193, 1940
   therefore appeared inside cell 394673650's panel, which is 125 µm away, on the strength of a
   nucleus id the segmentation had got wrong.

   AND IT WAS FIVE LINES, NOT ONE: the same `nuc || root` test, with no coordinate in it at all,
   written out again in tracingBareOf, twice in tracingNextIndex, and once in tracingCurrentAll.
   That is why the second cell's FIRST centriole came back named "Centriole / centrosome 2".

   EVERY NUMBER HERE IS HIS. The two cells, their centres, the kinds and the counts are the ones out
   of his sheet on the evening of 6 October.

   Run: node cellidentitycheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* His ten rows. The four at the end carry the same junk nucleus id as the first four and sit
   125 µm away, at their own reported centre. */
const A = { nuc: "394673650", root: "6475165144", at: "402334,232283,479" };
const B = { nuc: "394673650", root: "6475165144", at: "427087,220193,1940" };
const C = { nuc: "38762771",  root: "6198781614", at: "426863,220507,2024" };
const SHARED = [
  { structureId: "primary-cilium-base-tip_1790279760231_w92v", name: "Primary cilium (base + tip)",
    kind: "cilium", instanceOf: "cilium", instanceIndex: 1, timestamp: "2026-10-06T19:42:11Z",
    cellType: "Endothelial cell", nucleusId: A.nuc, rootId: A.root, cellCoord: A.at },
  { structureId: "whole-cell_1790370589006_pb15", name: "Whole cell", kind: "cell",
    timestamp: "2026-10-06T19:42:11Z", cellType: "Endothelial cell",
    nucleusId: A.nuc, rootId: A.root, cellCoord: A.at },
  { structureId: "nucleus_1790453685825_dkdr", name: "Nucleus", kind: "nucleus",
    timestamp: "2026-10-06T19:42:12Z", cellType: "Endothelial cell",
    nucleusId: A.nuc, rootId: A.root, cellCoord: A.at },
  { structureId: "centriole-centrosome_1790454525224_u8as", name: "Centriole / centrosome",
    kind: "centriole", instanceOf: "centriole", instanceIndex: 1, timestamp: "2026-10-06T19:17:02Z",
    cellType: "Endothelial cell", nucleusId: A.nuc, rootId: A.root, cellCoord: A.at },
  { structureId: "nucleus_1790886647285_qf2b", name: "Nucleus", kind: "nucleus",
    timestamp: "2026-10-06T19:59:08Z", cellType: "Endothelial cell",
    nucleusId: C.nuc, rootId: C.root, cellCoord: C.at },
  { structureId: "centriole-centrosome_1791311483003_rqtp__i1", name: "Centriole / centrosome",
    kind: "centriole", instanceOf: "centriole", instanceIndex: 1, timestamp: "2026-10-06T19:58:13Z",
    cellType: "Endothelial cell", nucleusId: C.nuc, rootId: C.root, cellCoord: C.at },
  /* ── THE CELL HE REPORTED HIMSELF ──────────────────────────────────────────────────────── */
  { structureId: "nucleus_1791311494766_j6b2", name: "Nucleus", kind: "nucleus",
    timestamp: "2026-10-06T20:35:53Z", cellType: "Endothelial cell",
    nucleusId: B.nuc, rootId: B.root, cellCoord: B.at },
  { structureId: "centriole-centrosome_1791315243496_dxqr__i1", name: "Centriole / centrosome 2",
    kind: "centriole", instanceOf: "centriole", instanceIndex: 2, timestamp: "2026-10-06T20:34:03Z",
    cellType: "Endothelial cell", nucleusId: B.nuc, rootId: B.root, cellCoord: B.at },
  { structureId: "centriole-centrosome_1791315495090_khqx__i2", name: "Primary cilium (base + tip)",
    kind: "cilium", instanceOf: "cilium", instanceIndex: 1, timestamp: "2026-10-06T20:38:15Z",
    cellType: "Endothelial cell", nucleusId: B.nuc, rootId: B.root, cellCoord: B.at },
  { structureId: "centriole-centrosome_1791318953251_jltv9__i3", name: "Whole cell", kind: "cell",
    timestamp: "2026-10-06T20:35:53Z", cellType: "Endothelial cell",
    nucleusId: B.nuc, rootId: B.root, cellCoord: B.at }
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);
  await p.evaluate(rows => { window.TRACING_SHARED = TRACING_SHARED = rows; }, SHARED);

  console.log("the panel that showed one cell's structures inside another's");
  {
    const r = await p.evaluate(() => {
      const gs = tracingGroupByCell(TRACING_SHARED, t => t.nucleusId, t => t.rootId, t => t.cellCoord);
      return gs.map(g => ({ key: g.key, coord: g.coord, nuc: g.nuc,
                            n: g.items.length,
                            what: g.items.map(x => x.t.name).join(", ") }));
    });
    ok(r.length === 3,
       "THREE CELLS, not two — two reported centres 125 µm apart are two cells however much their "
       + "nucleus ids agree, and the panel showed cell 394673650 holding eight tracings when four "
       + "of them were somewhere else entirely",
       r.length + " groups: " + r.map(g => g.n).join(" + "));
    ok(r.every(g => /^c:/.test(g.key)),
       "...keyed on the coordinate, which is the thing Søren reports and the only identity a "
       + "vascular cell has that he trusts", r.map(g => g.key).join("  "));
    const atB = r.filter(g => g.coord === "427087,220193,1940")[0];
    ok(!!atB && atB.n === 4,
       "...so the four he reported at 427087, 220193, 1940 are their own cell",
       atB ? atB.n + " tracings: " + atB.what : "no group there");
    const atA = r.filter(g => g.coord === "402334,232283,479")[0];
    ok(!!atA && atA.n === 4,
       "...and cell 394673650 is back to its own four", atA ? atA.n + " tracings" : "no group there");
  }

  console.log("\nand the heading says where, before it says what the segmentation claims");
  {
    const r = await p.evaluate(() =>
      tracingCellHead("394673650", "6475165144", "Endothelial cell", 4, "427087,220193,1940")
        .replace(/<[^>]+>/g, ""));
    ok(/Endothelial cell.{0,12}cell at 427087, 220193, 1940.{0,12}nucleus 394673650/.test(r),
       "the place comes first and the ids follow as a claim", r.slice(0, 95));
  }

  console.log("\nand the numbering counts siblings of THIS cell");
  {
    const r = await p.evaluate(() => ({
      /* The second cell already has ONE centriole of its own (the __i1 row). Its next is 2 —
         but ONLY because of that one, not because cell A also has one. */
      bAgain: tracingNextIndex("centriole", "Centriole / centrosome", "394673650", "6475165144",
                               [], "427087,220193,1940"),
      /* Cell C has one centriole, so its next is 2 as well, and the eight rows on A and B are
         nothing to do with it. */
      cNext: tracingNextIndex("centriole", "Centriole / centrosome", "38762771", "6198781614",
                              [], "426863,220507,2024"),
      /* A cell nobody has traced starts at 1, however many centrioles the junk nucleus id has. */
      fresh: tracingNextIndex("centriole", "Centriole / centrosome", "394673650", "6475165144",
                              [], "500000,500000,900")
    }));
    ok(r.fresh === 1,
       "A NEWLY REPORTED CELL STARTS AT 1 — this is the line that made the second cell's FIRST "
       + "centriole come back as \"Centriole / centrosome 2\": the numbering counted the other "
       + "cell's centriole as its sibling because they share a junk nucleus id",
       "next centriole on an untraced coordinate: " + r.fresh);
    /* 3, not 2: that cell's one centriole carries instanceIndex 2 — the artefact of the very bug
       this change fixes, written into the sheet before it was fixed. The allocator answers "one
       more than the highest this CELL carries", and the highest it carries is 2. Renumbering
       somebody's published structures is not this change's job. */
    ok(r.bAgain === 3,
       "...a cell whose one centriole is published as number 2 answers 3, because the allocator "
       + "never reuses a number a published structure already has", String(r.bAgain));
    ok(r.cNext === 2, "...and so does the third cell, from its own one", String(r.cNext));
  }

  console.log("\nand nothing is refused");
  {
    const r = await p.evaluate(() => {
      document.getElementById("tracingPanel").open = true;
      PAD = UJ.tracepad.create();
      PAD.rings = [{ z: 1941, inst: 0, points: [[427000,220100],[427200,220100],[427200,220300]] },
                   { z: 1943, inst: 0, points: [[427000,220100],[427200,220100],[427200,220300]] }];
      PAD.z = 1941; PAD.inst = 0;
      TRACING_BASE_ID = ""; PAD_EDIT_ID = ""; PAD_EDIT_IDS = {}; PAD_INST_KIND = {};
      TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD) };
      TRACINGS_KEPT = [];
      document.getElementById("tracingEachOwn").checked = false;
      document.getElementById("tracingWhat").value = "__nucleus";
      document.getElementById("tracingType").value = "Endothelial cell";
      /* His state exactly: a coordinate he reported, and a nucleus id the segmentation got wrong. */
      document.getElementById("tracingNucId").value = "394673650";
      document.getElementById("tracingRootId").value = "6475165144";
      document.getElementById("tracingCellAt").value = "427087, 220193, 1940";
      document.getElementById("tracingFound").style.display = "";
      window.tracingNucCentroid = function(nid){
        return nid === "394673650" ? { xVox: 402334, yVox: 232283, zVox: 479, from: "nucleus" } : null;
      };
      const all = tracingCurrentAll() || [];
      return { n: all.length, coord: (all[0] || {}).cell_coord,
               status: (document.getElementById("tracingStatus") || {}).textContent || "",
               note: (document.getElementById("tracingAtSay") || {}).textContent || "" };
    });
    ok(r.n === 1,
       "A VASCULAR TRACING IS FILED, nucleus id 125 µm away and all — for an hour on 6 October this "
       + "refused, which would have blocked every tracing Søren is doing, because the ids being "
       + "wrong is WHY he is tracing these by hand",
       r.n + " structure");
    ok(!/two different cells|nothing has been added/i.test(r.status),
       "...and the status line does not say it was refused",
       JSON.stringify(r.status.slice(0, 70)));
    ok(/124\.7 µm/.test(r.note) && /the coordinate is what files this tracing/i.test(r.note),
       "...but the disagreement is said once, beside the coordinate box it is about",
       r.note.slice(0, 110));
  }

  console.log("\nand the one definition is one definition");
  {
    const r = await p.evaluate(() => ({
      coordBeatsNucleus: tracingSameCell({ at: "1,2,3", nuc: "x" }, { at: "1,2,3", nuc: "y" }),
      coordSplitsOneNucleus: tracingSameCell({ at: "1,2,3", nuc: "x" }, { at: "9,9,9", nuc: "x" }),
      spacingIsNotIdentity: tracingSameCell({ at: "1, 2, 3" }, { at: "1,2,3" }),
      nucleusWhenNoCoord: tracingSameCell({ nuc: "x", root: "r" }, { nuc: "x", root: "q" }),
      nucleusSplitsOneRoot: tracingSameCell({ nuc: "x", root: "r" }, { nuc: "y", root: "r" }),
      rootOnlyLast: tracingSameCell({ root: "r" }, { root: "r" }),
      nothingIsNotAMatch: tracingSameCell({}, {}),
      scopeIsNotACell: tracingCellOf({ nucleusId: "janelia:" }).nuc
    }));
    ok(r.coordBeatsNucleus === true && r.coordSplitsOneNucleus === false,
       "the coordinate decides when both have one, in both directions",
       r.coordBeatsNucleus + " / " + r.coordSplitsOneNucleus);
    ok(r.spacingIsNotIdentity === true,
       "...and spacing is formatting, not identity — the box shows \"1, 2, 3\" and the sheet stores "
       + "\"1,2,3\"", String(r.spacingIsNotIdentity));
    ok(r.nucleusWhenNoCoord === true && r.nucleusSplitsOneRoot === false,
       "...the nucleus decides next, and splits a shared root id",
       r.nucleusWhenNoCoord + " / " + r.nucleusSplitsOneRoot);
    ok(r.rootOnlyLast === true, "...and a root id is evidence only when there is nothing else");
    ok(r.nothingIsNotAMatch === false,
       "...while two tracings filed against nothing are not thereby the same cell");
    ok(r.scopeIsNotACell === "",
       "...and ωJump's \"<volume>:\" is a scope, not a nucleus", JSON.stringify(r.scopeIsNotACell));
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
