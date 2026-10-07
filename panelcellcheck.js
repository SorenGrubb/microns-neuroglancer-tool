/* A cell panel shows what is traced on THAT cell.                                     2026-10-07

   Søren, looking at cell 61360735's panel: *"This is the cell that I lost the whole cell and nucleus
   trace for, but it appears to have all the organelles and whole cell trace associated with the
   other cells I have traced. What is going on here?"*

   core/panel.js tested, in two places:

       return (nid && String(t.nucleusId || "") === String(nid))
           || (root && String(t.rootId || "") === String(root));

   Nucleus or root, no coordinate. His vascular cells share root 6198781614 — which is the whole
   reason he traces them by hand — so every structure traced on any of them was listed on all of
   their cards. Six entries on that one card came from three different cells, all ~125 µm away.

   THE SAME TEST WAS IN EIGHT PLACES. Five in core/tracingcard.js, fixed on 6 October; two here and
   one in core/blenderexport.js, not fixed, because on the 6th I stopped at the file I was reading.

   Run: node panelcellcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The three cells on his card, and the six tracings it was showing. The volumes are the ones the
   panel printed; the coordinates are the ones the sheet records. */
const THIS_CELL = { nid: "61360735", root: "6198781614", pos: [401085, 230736, 380] };
const TRACINGS = [
  /* ── THIS cell's own: nothing. That is the point — he lost them, and the card looked full. ── */
  /* The cell at 427087, 220193, 1940 */
  { structureId: "jltv9__i3", name: "Whole cell", kind: "cell", volumeUm3: 404.46,
    sections: 153, contours: 167, tracedBy: "Søren Grubb",
    nucleusId: "394673650", rootId: "6198781614", cellCoord: "427087,220193,1940" },
  { structureId: "j6b2", name: "Nucleus", kind: "nucleus", volumeUm3: 66.61,
    sections: 36, contours: 47, tracedBy: "Søren Grubb",
    nucleusId: "394673650", rootId: "6198781614", cellCoord: "427087,220193,1940" },
  { structureId: "dxqr__i1", name: "Centriole / centrosome 2", kind: "centriole",
    instanceOf: "centriole", instanceIndex: 2, volumeUm3: 0.0786, sections: 20, contours: 34,
    tracedBy: "Søren Grubb",
    nucleusId: "394673650", rootId: "6198781614", cellCoord: "427087,220193,1940" },
  { structureId: "khqx__i2", name: "Primary cilium (base + tip) 1", kind: "cilium",
    instanceOf: "cilium", instanceIndex: 1, volumeUm3: 0.0228, sections: 14, contours: 14,
    tracedBy: "Søren Grubb",
    nucleusId: "394673650", rootId: "6198781614", cellCoord: "427087,220193,1940" },
  /* The cell at 426863, 220507, 2024 */
  { structureId: "qf2b", name: "Nucleus", kind: "nucleus", volumeUm3: 74.73,
    sections: 47, contours: 47, tracedBy: "Søren Grubb",
    nucleusId: "38762771", rootId: "6198781614", cellCoord: "426863,220507,2024" },
  { structureId: "rqtp__i1", name: "Centriole / centrosome 1", kind: "centriole",
    instanceOf: "centriole", instanceIndex: 1, volumeUm3: 0.0989, sections: 21, contours: 27,
    tracedBy: "Søren Grubb",
    nucleusId: "38762771", rootId: "6198781614", cellCoord: "426863,220507,2024" },
  /* AND ONE THAT REALLY IS THIS CELL'S, so the check can tell "shows nothing" from "shows the
     right thing". Its coordinate is the card's own VOXEL. */
  { structureId: "mine", name: "Nucleus", kind: "nucleus", volumeUm3: 88.33,
    sections: 39, contours: 60, tracedBy: "Søren Grubb",
    nucleusId: "61360735", rootId: "6198781614", cellCoord: "401085,230736,380" }
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);

  const r = await p.evaluate(({ cell, tracings }) => {
    const out = {};
    /* The panel's own state, as the page sets it when a cell is opened. */
    window.CUR_POS = cell.pos;
    window.CUR_ROOT = CUR_ROOT = cell.root;
    window.PANEL_CUR_NID = PANEL_CUR_NID = cell.nid;
    window.PANEL_TRACINGS = PANEL_TRACINGS = tracings;
    window.PANEL_TRACINGS_AT = PANEL_TRACINGS_AT = Date.now();
    /* The host div the section is inserted after. */
    if (!document.getElementById("commReports")){
      const d = document.createElement("div"); d.id = "commReports";
      document.body.appendChild(d);
    }
    out.hasFn = typeof loadTracedStructures === "function";
    if (!out.hasFn) return out;
    loadTracedStructures(cell.nid, cell.root);
    const host = document.getElementById("tracedOnCell");
    out.html = host ? host.textContent : "";
    /* Which volumes the card ended up printing. */
    out.shows = ["404", "74.73", "66.61", "88.33"].filter(v => (out.html || "").indexOf(v) >= 0);
    out.organelles = (function(){
      try {
        renderOrganelleSection(cell.nid, cell.root);
        const o = document.getElementById("cellOrganelles");
        return o ? o.textContent : "";
      } catch (e){ return "THREW: " + e.message; }
    })();
    return out;
  }, { cell: THIS_CELL, tracings: TRACINGS });

  if (!r.hasFn){
    console.log("  (this page has no cell panel — nothing to check)");
    await b.close(); process.exit(0);
  }

  console.log("the card for cell 61360735, at 401085, 230736, 380");
  ok(r.shows.join(",") === "88.33",
     "ONLY THIS CELL'S TRACING IS LISTED — it was showing a 404 µm³ whole cell and two nuclei from "
     + "cells 125 µm away, because they share root 6198781614 and the test never looked at a "
     + "coordinate",
     "volumes on the card: " + (r.shows.join(", ") || "none"));
  ok(!/404/.test(r.html),
     "...the other cell's whole cell is gone from it", /404/.test(r.html) ? "still there" : "gone");
  ok(!/74\.73|66\.61/.test(r.html),
     "...and so are the two nuclei that belong elsewhere",
     /74\.73|66\.61/.test(r.html) ? "still there" : "gone");

  console.log("\nand it says what it is not showing");
  /* THREE, not six: this section has listed the cell and its nucleus only since 2026-09-18 \u2014
     organelles belong to the Organelles section below, beside the logged points they pair with. So
     of the six, three are countable here and three were never this list's to drop. */
  ok(/3 tracings filed at a different cell centre/.test(r.html),
     "the three it dropped are counted, because until this morning they WERE on this card and a "
     + "filter without a remainder is an invisible change",
     (r.html.match(/\d+ tracings? filed at a different cell centre[^.]*\./) || ["nothing said"])[0]);

  /* \u2500\u2500 THE ORGANELLE HALF, ASKED OF THE FILTER RATHER THAN THE RENDER \u2500\u2500\u2500\u2500\u2500
     renderOrganelleSection() draws nothing without the annotation state and the outline pairing
     this fixture does not build, so an assertion on its HTML passed just as happily with the old
     `nuc || root` test restored \u2014 a check that cannot fail. What changed is the filter, so the
     filter is what is asked. 2026-10-07. */
  console.log("\nand the organelles below it, through the line that changed");
  {
    const s2 = await p.evaluate(tr => ({
      onOtherCells: tr.filter(t => t.instanceOf).map(t => panelSameCell(t, "61360735", "6198781614")),
      mine: panelSameCell({ nucleusId: "61360735", rootId: "6198781614",
                            cellCoord: "401085,230736,380", instanceOf: "centriole" },
                          "61360735", "6198781614")
    }), TRACINGS);
    ok(s2.onOtherCells.length === 3 && s2.onOtherCells.every(v => v === false),
       "the three outlined on other cells are refused by renderOrganelleSection's filter \u2014 the "
       + "second copy of the same test, which listed them because they share root 6198781614",
       JSON.stringify(s2.onOtherCells));
    ok(s2.mine === true,
       "...while an organelle outlined on THIS cell still passes it", String(s2.mine));
  }

  console.log("\nand the one definition is reachable from every file that needs it");
  {
    const s = await p.evaluate(() => ({
      onModule: typeof UJ.tracing.sameCell === "function" && typeof UJ.tracing.cellOf === "function",
      cardDelegates: tracingSameCell({ at: "1,2,3" }, { at: "1, 2, 3" }) === true,
      rootAloneIsNotEnough: UJ.tracing.sameCell(
        UJ.tracing.cellOf({ rootId: "6198781614", cellCoord: "427087,220193,1940" }),
        UJ.tracing.cellOf({ rootId: "6198781614", cellCoord: "401085,230736,380" })) === false,
      rootAloneStillCounts: UJ.tracing.sameCell(
        UJ.tracing.cellOf({ rootId: "6198781614" }),
        UJ.tracing.cellOf({ rootId: "6198781614" })) === true,
      remainderOnlyOnCoord: UJ.tracing.elsewhereByCoord(
        UJ.tracing.cellOf({ cellCoord: "1,2,3" }), UJ.tracing.cellOf({ cellCoord: "9,9,9" })) === true
        && UJ.tracing.elsewhereByCoord(
        UJ.tracing.cellOf({ nucleusId: "a" }), UJ.tracing.cellOf({ nucleusId: "b" })) === false
    }));
    ok(s.onModule, "it is on UJ.tracing, which the card, the panel and the Blender export all load");
    ok(s.cardDelegates,
       "...and the card's tracingSameCell is a delegate, not a sixth implementation");
    ok(s.rootAloneIsNotEnough,
       "...a shared root id does not make two coordinates one cell, which is the whole fault");
    ok(s.rootAloneStillCounts,
       "...but it is still evidence when there is nothing else, so a tracing filed against a "
       + "fragment alone has not been orphaned");
    ok(s.remainderOnlyOnCoord,
       "...and the remainder counts only coordinate disagreements, so \"not shown\" never means "
       + "\"filed against another nucleus\"");
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
