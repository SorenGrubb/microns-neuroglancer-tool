/* Which visual area a cell is in, and the Shih lab layers.                          2026-09-28

   Søren, after the Shih lab preprint (How, Danskin, Pedigo, Memke, Stamenkovic, Kleinfeld &
   Shih, "Axons organize into micro-tracts around the cortical vasculature", bioRxiv 2026,
   https://doi.org/10.64898/2026.09.26.754479):

       "I would like to add a layer to uJump filtering with the areameshes and also the
        possibility to add the vascular skeletonizations."
       "Yes, restricting within the areas but we also need to draw the areas to show where they
        are. so both."
       "I don't just want the V1 column, we already have that. I want the areameshes where they
        discern what major area of the visual cortex we are in."

   WHAT THE AREA MESHES ACTUALLY ARE. gs://allen-minnie-phase3/areameshes is a
   neuroglancer_legacy_mesh with four segments, and not one of them is a solid area. Each is a
   RIBBON: a polyline along the pia (y 241-344 um) paired vertex-for-vertex with one along the
   white matter (y 792-952 um), stitched into 2n-2 triangles. Each is the WALL between areas,
   spanning pia to white matter and tilting ~40 um on the way down.

   The four walls meet at ONE point near (x 1135, z 623) um at the pia and radiate outwards in
   four branches -- the "junction of VISp and three higher visual areas" the MICrONS papers
   describe (https://www.nature.com/articles/s41586-025-08790-w). Each mesh carries exactly the
   two branches that bound its own area, which is why adjacent meshes lie on top of each other
   along the branch they share, and why the naive reading -- four closed areas -- makes them look
   like one degenerate loop of near-zero signed area.

   So the classification is: build the four branches at the cell's OWN depth, find the nearest
   one, and read which side of it the cell is on. Not a bounding box and not a fitted plane.

   THE ASSERTION THAT SETTLES WHICH AREA IS V1: the Allen Institute's V1 column is 1,899
   hand-classified cells that are, by construction, inside V1. Every one of them must land in
   area 0 and none in the other three. Nothing else in this file is allowed to be the reason to
   believe the labels; this is.

   WHAT IS ASSERTED:
     - ujump.html carries an areadata block for all 144,118 nuclei
     - all 1,899 Allen V1-column cells are area 0, and none are in areas 1-3
     - the packed per-cell table and the geometric classifier agree cell for cell
     - ...including for a point that is nowhere near a nucleus, which is the ST-row path
     - the filter section exists, with one tick per area, and is remembered open/closed
     - every Shih lab skeleton the state JSON activates is offered as a viewer layer
     - ...and each one builds a layer with the paper's own source and colour
     - the area meshes and the cortical layer meshes are offered too
     - none of the new ticks makes a previewed result go stale (they only add 3D layers)

   Run: node visualareacheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* The ten vascular zones the paper labels by hand, plus the branch-order skeleton Søren picked
   for the capillary bed ("I agree with the skelFinal_Branch_Order. That is very relevant.").
   Sources and colours are read straight out of the state JSON he sent. */
const SKELS = [
  ["skelFinal_PAs_v7_connected",      "#ff2828"],
  ["skelFinal_ACTs_v7",               "#ff8800"],
  ["skelFinal_terminalPAs_v7",        "#aa5500"],
  ["skelFinal_AVs_v7_connected",      "#2266ff"],
  ["skelFinal_CVTs_v7",               "#00ccaa"],
  ["skelFinal_terminalAVs_v7",        "#5588cc"],
  ["skelFinal_PCVs_v7",               "#8822dd"],
  ["skelFinal_deepCVTs_v7",           "#dd44aa"],
  ["skelFinal_terminalPCVs_v7",       "#aa77ee"],
  ["skelFinal_BBs_v7",                "#00ff2a"],
  ["skelFinal_v7_branch_order",       "#dcb928"]
];

(async () => {
  const src = fs.readFileSync(page_("ujump.html"), "utf8");
  console.log("\nujump.html, as a file");
  ok(/id="areadata"/.test(src), "there is an areadata block");
  ok(/id="filterSecArea"/.test(src), "there is a visual-area filter section");
  /* The one array that is handed to persistDetailsOpen -- a section missing from it forgets
     whether it was open the moment the page reloads, which is the sort of thing nobody reports. */
  const persistList = (src.match(/\[("filterSec[^\]]*)\]\.forEach\(id=>persistDetailsOpen/) || [])[1] || "";
  ok(/"filterSecArea"/.test(persistList),
     "...and it is in the remembered-sections list",
     persistList ? persistList.slice(0, 120) : "(no list found)");
  for (const [slug] of SKELS)
    ok(src.indexOf(slug) >= 0, "the state's " + slug + " is in the page");
  ok(src.indexOf("allen-minnie-phase3/areameshes") >= 0, "the area meshes are in the page");
  ok(src.indexOf("layermeshes_smooth_v2") >= 0, "the cortical layer meshes are in the page");

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.fulfill({ status: 200,
    contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [],
                           rows: [], newCells: [] }) }));
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**",
                   "**storage.googleapis.com/**", "**s3.amazonaws.com/**", "**gstatic.com/**",
                   "**googleapis.com/**", "**microns-explorer.org/**",
                   "**raw.githubusercontent.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(6000);

  console.log("\nthe labels");
  const r = await p.evaluate(() => {
    const out = { has: typeof areaOfIndex === "function" && typeof areaAtVox === "function" };
    if (!out.has) return out;
    const AD = JSON.parse(document.getElementById("areadata").textContent);
    out.N = AD.N;
    out.names = AD.NAMES;
    /* every Allen V1-column member */
    const V1 = JSON.parse(document.getElementById("v1columndata").textContent);
    const bin = atob(V1.IB); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const IB = new Uint32Array(u.buffer);
    out.v1 = [0, 0, 0, 0]; out.v1null = 0;
    for (let i = 0; i < IB.length; i++) {
      const a = areaOfIndex(IB[i]);
      if (a === null || a === undefined) out.v1null++; else out.v1[a]++;
    }
    out.v1n = IB.length;
    /* the packed table against the geometry it was built from */
    out.checked = 0; out.disagree = 0; out.firstBad = null;
    for (let i = 0; i < AD.N; i += 97) {
      const want = areaOfIndex(i), got = areaAtVox(NX[i], NY[i], NZ[i]);
      out.checked++;
      if (want !== got) { out.disagree++; if (!out.firstBad) out.firstBad = [i, want, got]; }
    }
    /* a point with no nucleus on it: the ST-row / reported-cell path */
    out.freeV1  = areaAtVox(180000, 200000, 22000);   // deep inside the medial side
    out.freeFar = areaAtVox(400000, 200000, 22000);   // far lateral
    out.counts = [0, 0, 0, 0];
    for (let i = 0; i < AD.N; i++) out.counts[areaOfIndex(i)]++;
    return out;
  });
  if (!r.has) {
    ok(false, "the page exposes areaOfIndex() and areaAtVox()", "it does not");
  } else {
    ok(r.N === 144118, "every nucleus has an area", r.N + " labelled");
    ok(r.v1[0] === r.v1n, "all " + r.v1n + " Allen V1-column cells are area 0",
       "area0=" + r.v1[0] + " area1=" + r.v1[1] + " area2=" + r.v1[2] + " area3=" + r.v1[3] +
       (r.v1null ? " unlabelled=" + r.v1null : ""));
    ok(r.v1[1] + r.v1[2] + r.v1[3] === 0, "...and none of them is in a higher visual area");
    ok(/^V1/.test(r.names[0]), "...which is the one named V1", r.names[0]);
    ok(r.disagree === 0, "the packed table and the geometry agree on all " + r.checked + " sampled cells",
       r.firstBad ? ("cell " + r.firstBad[0] + ": table " + r.firstBad[1] + ", geometry " + r.firstBad[2]) : "no disagreement");
    ok(r.freeV1 === 0, "a free point on the medial side is V1", "area " + r.freeV1);
    ok(r.freeFar !== 0 && r.freeFar !== null, "a free point far lateral is not V1", "area " + r.freeFar);
    ok(r.counts[0] > r.counts[1] + r.counts[2] + r.counts[3],
       "V1 holds more cells than the three higher areas together", r.counts.join(" / "));
  }

  console.log("\nthe panel");
  const q = await p.evaluate(sk => {
    const ticks = Array.from(document.querySelectorAll(".farea")).map(e => e.value).sort();
    const skelTicks = Array.from(document.querySelectorAll(".fshihskel")).map(e => e.value);
    const out = { ticks, skelTicks, layers: null, stale: [] };
    if (typeof shihLayers === "function") {
      out.layers = shihLayers(sk.map(s => s[0]).concat(["__areameshes", "__layermeshes"]));
    }
    /* none of the new ticks may invalidate a previewed result */
    const ids = Array.from(document.querySelectorAll(".fshihskel,#filterAreaMeshOn,#filterLayerMeshOn"))
      .map(e => e.id).filter(Boolean);
    out.ids = ids;
    return out;
  }, SKELS);
  ok(q.ticks.length === 4 && q.ticks.join(",") === "0,1,2,3",
     "there is one tick per area", q.ticks.join(",") || "(none)");
  ok(q.skelTicks.length === SKELS.length,
     "there is one tick per Shih lab skeleton", q.skelTicks.length + " of " + SKELS.length);
  if (!q.layers) {
    ok(false, "the page exposes shihLayers()", "it does not");
  } else {
    for (const [slug, colour] of SKELS) {
      const L = q.layers.find(l => JSON.stringify(l.source || "").indexOf(slug) >= 0);
      ok(!!L, slug + " builds a layer", L ? L.name : "missing");
      if (L) ok(JSON.stringify(L.segmentColors || {}).indexOf(colour) >= 0,
                "...in the paper's colour " + colour,
                JSON.stringify(L.segmentColors || {}));
    }
    const am = q.layers.find(l => JSON.stringify(l.source || "").indexOf("areameshes") >= 0);
    ok(!!am, "the area meshes build a layer", am ? am.name : "missing");
    ok(am && (am.segments || []).length === 4, "...with all four areas selected",
       am ? JSON.stringify(am.segments) : "-");
    const lm = q.layers.find(l => JSON.stringify(l.source || "").indexOf("layermeshes") >= 0);
    ok(!!lm, "the cortical layer meshes build a layer", lm ? lm.name : "missing");
  }
  const staleSafe = await p.evaluate(ids => {
    const S = window.STALE_IGNORE_IDS_FOR_CHECK;
    if (!S) return null;
    return ids.filter(id => !S.has(id));
  }, q.ids.concat(["filterAreaMeshOn", "filterLayerMeshOn"]));
  if (staleSafe === null) ok(false, "the stale-ignore list is readable from a check", "it is not");
  else ok(staleSafe.length === 0, "no viewer-only tick makes a previewed result go stale",
          staleSafe.join(", ") || "none do");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await p.close();
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
