/* The cell goes to the viewer with the cell on it.                                    2026-10-07

   Søren, looking at the endothelial cell he traced by hand: *"When there exist a nucleus and a
   whole cell mesh, then they should be shown also in the neuroglancer and not just the
   organelles."*

   "Show the cell with all 2 organelles" opened a viewer with two organelles floating in nothing.
   For a cell whose c3 segmentation is trustworthy that is forgivable — tracingShowCellIn puts the
   published mesh in the 3D pane and the organelles sit inside it. For HIS cells it is not: the
   vasculature segmentation is why he traced the whole cell and the nucleus by hand in the first
   place, so the only true outline of that cell was the one thing the button left behind.

   WHAT IS ASSERTED:
     - the button hands the whole cell and the nucleus to the viewer, ahead of the organelles
     - ...and says so on its face, so the picture is known before the click
     - their contours are fetched with the organelles' when the section is opened
     - an organelle is still an organelle: the Organelles list does not grow a whole cell
     - a cell with no hand-traced body still offers the organelles alone, worded as before

   Run: node showallbodycheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A square contour, so centre() has real geometry to work with. */
const sq = (z, x, y, r) => ({ z: z, points: [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]] });
const CELL = { nid: "61360735", root: "6198781614", pos: [401085, 230736, 380] };
const AT = CELL.pos.join(",");
const TRACINGS = [
  { structureId: "whole", name: "Whole cell", kind: "cell", color: "#cddc39",
    volumeUm3: 428, sections: 156, contours: 172, tracedBy: "Søren Grubb",
    nucleusId: CELL.nid, rootId: CELL.root, cellCoord: AT,
    rings: [sq(379, 401085, 230736, 400), sq(380, 401085, 230736, 420), sq(381, 401085, 230736, 400)] },
  { structureId: "nuc", name: "Nucleus", kind: "nucleus", color: "#4caf50",
    volumeUm3: 88.84, sections: 34, contours: 52, tracedBy: "Søren Grubb",
    nucleusId: CELL.nid, rootId: CELL.root, cellCoord: AT,
    rings: [sq(379, 401085, 230736, 150), sq(380, 401085, 230736, 160)] },
  { structureId: "cent", name: "Centriole / centrosome 1", kind: "centriole", instanceOf: "centriole",
    instanceIndex: 1, color: "#9c27b0", volumeUm3: 0.0923, sections: 20, contours: 34,
    tracedBy: "Søren Grubb", nucleusId: CELL.nid, rootId: CELL.root, cellCoord: AT,
    rings: [sq(413, 401786, 230544, 20), sq(414, 401786, 230544, 22)] },
  { structureId: "cil", name: "Primary cilium (base + tip) 1", kind: "cilium", instanceOf: "cilium",
    instanceIndex: 1, color: "#ff9800", volumeUm3: 0.0167, sections: 14, contours: 14,
    tracedBy: "Søren Grubb", nucleusId: CELL.nid, rootId: CELL.root, cellCoord: AT,
    rings: [sq(399, 401778, 230633, 12), sq(400, 401778, 230633, 14)] }
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);

  const setUp = await p.evaluate(({ cell, tracings }) => {
    window.CUR_POS = cell.pos;
    window.CUR_ROOT = CUR_ROOT = cell.root;
    window.PANEL_CUR_NID = PANEL_CUR_NID = cell.nid;
    window.PANEL_TRACINGS = PANEL_TRACINGS = tracings;
    window.PANEL_TRACINGS_AT = PANEL_TRACINGS_AT = Date.now();
    if (!document.getElementById("commReports")){
      const d = document.createElement("div"); d.id = "commReports";
      document.body.appendChild(d);
    }
    return { hasPanel: typeof renderOrganelleSection === "function",
             hasViewer: typeof organShowAllInViewer === "function" };
  }, { cell: CELL, tracings: TRACINGS });

  if (!setUp.hasPanel || !setUp.hasViewer){
    console.log("  (this page has no cell panel with a viewer opener — nothing to check)");
    await b.close(); process.exit(0);
  }

  console.log("the button under the organelle list");
  const r = await p.evaluate(cell => {
    window.__OPENED = null;
    window.tracingViewerOpen = tracingViewerOpen = function(structs, say, ids){
      window.__OPENED = { names: (structs || []).map(s => s.name),
                          kinds: (structs || []).map(s => s.kind || ""),
                          say: String(say || ""), ids: ids || null };
    };
    window.__organOpen = true;
    renderOrganelleSection(cell.nid, cell.root);
    const host = document.getElementById("cellOrganelles");
    const btn = host && host.querySelector(".organshowall");
    const label = btn ? (btn.textContent || "").replace(/\s+/g, " ").trim() : "";
    if (btn) btn.click();
    return { label: label,
             listed: host ? (host.textContent || "") : "",
             opened: window.__OPENED };
  }, CELL);

  const names = (r.opened && r.opened.names) || [];
  ok(names.indexOf("Whole cell") >= 0 && names.indexOf("Nucleus") >= 0,
     "the whole cell and the nucleus he traced go to the viewer with the organelles — for a "
     + "vascular cell the published mesh is the thing he was working around, so leaving his own "
     + "outline behind leaves the organelles floating in nothing",
     names.join(", ") || "(the button opened nothing)");
  ok(names[0] === "Whole cell" && names[1] === "Nucleus",
     "...and ahead of them, so the viewer's selected layer is the cell rather than a centriole",
     names.join(", ") || "(nothing)");
  ok(names.length === 4, "...and the organelles are still all there", String(names.length));
  ok(/whole cell/i.test(r.label) && /nucleus/i.test(r.label),
     "...and the button says so before it is pressed", r.label || "(no button)");

  console.log("\nand the lists below stay what they were");
  ok(!/Whole cell/.test(r.listed),
     "the Organelles section still does not list the whole cell — it is the cell, and it is listed "
     + "with the cell", /Whole cell/.test(r.listed) ? "listed as an organelle" : "not listed");

  console.log("\nand a cell with nothing of its own hand-traced");
  const bare = await p.evaluate(cell => {
    window.__OPENED = null;
    PANEL_TRACINGS = PANEL_TRACINGS.filter(t => t.instanceOf);
    renderOrganelleSection(cell.nid, cell.root);
    const host = document.getElementById("cellOrganelles");
    const btn = host && host.querySelector(".organshowall");
    const label = btn ? (btn.textContent || "").replace(/\s+/g, " ").trim() : "";
    if (btn) btn.click();
    return { label: label, names: (window.__OPENED && window.__OPENED.names) || [] };
  }, CELL);
  ok(bare.names.length === 2 && !/whole cell|nucleus/i.test(bare.label),
     "offers the organelles alone, worded as it always was — nothing is promised that is not there",
     bare.label || "(no button)");

  console.log("\nand their contours are asked for with the organelles'");
  const asked2 = await p.evaluate(({ cell, tracings }) => {
    const seen = [];
    window.organFetchRings = organFetchRings = function(nid, root, trs){
      (trs || []).forEach(t => seen.push(String(t.structureId)));
    };
    /* Without rings in hand, so the fetch is the only way they could arrive. */
    PANEL_TRACINGS = tracings.map(t => { const c = Object.assign({}, t); delete c.rings; return c; });
    PANEL_ORGAN_RINGS = {};
    window.__organOpen = true;
    renderOrganelleSection(cell.nid, cell.root);
    return seen;
  }, { cell: CELL, tracings: TRACINGS });
  ok(asked2.indexOf("whole") >= 0 && asked2.indexOf("nuc") >= 0,
     "opening the section reads the whole cell's and the nucleus's contours too, or the button "
     + "would have nothing of theirs to hand over", asked2.join(", ") || "(nothing asked for)");

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
