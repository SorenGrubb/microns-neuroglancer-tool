/* A row per outlined organelle, with its shape and its distance from the nucleus.  2026-09-30

   Gary: "We can then spit out lots of data like how many dystrophic lysosomes or mitochondria etc
   there are per cell etc." and "I also want to have the distance from the organelle centroid to
   the nucleus centroid calculated and displayed for each organelle. These things should also be
   downloadable in the Excel sheets."

   That question is asked of ROWS. The Cells sheet widens by a column set per organelle instance,
   so counting dystrophic lysosomes per cell there means counting across columns — the wrong axis.
   Hence a second sheet, one row per outlined structure, which pivots.

   THE NUCLEUS IS NOT ONE THING. Søren's rule: the centroid of the cell's own TRACED nucleus
   outline when somebody has drawn one, the MICrONS nucleus-detection centroid otherwise. Those are
   different measurements — a hand-drawn outline's area centroid versus a detection's centre — so
   the row says which it used, and this check asserts both paths and the preference between them.

   WHAT IS ASSERTED:
     - tracedShapeRows() turns a tracing into one row, with the shape descriptors on it
     - a 4 µm offset in x comes back as 4 µm, through the voxel sizes
     - a cell with a traced nucleus measures against THAT, and says so
     - a cell without one falls back to the detection centroid, and says so
     - a cell with neither leaves the distance blank rather than guessing
     - the column list and the row keys are the same set, in the same order
     - ujump.html appends the sheet, and only when there are rows

   Run: node organellesheetcheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const src = fs.readFileSync(page_("ujump.html"), "utf8");
  console.log("\nujump.html, as a file");
  ok(/addTracedOrganelleSheet/.test(src), "the download builds a Traced organelles sheet");
  ok(/book_append_sheet\(wb,XLSX\.utils\.aoa_to_sheet\(aoa\),"Traced organelles"\)/.test(src),
     "...appended to the same workbook as Cells");
  ok(/if\(!rows\.length\)return/.test(src),
     "...and not written at all when nothing was outlined");

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.fulfill({ status: 200,
    contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [],
                           rows: [], newCells: [] }) }));
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**raw.githubusercontent.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  const r = await p.evaluate(() => {
    if (typeof tracedShapeRows !== "function" || !window.TRACED_SHAPE_COLUMNS)
      return { missing: true };
    const ring = (cx, cy, r, z) => ({ z: z, points: (() => {
      const o = []; for (let i = 0; i < 128; i++){ const t = 2 * Math.PI * i / 128;
        o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return o; })() });
    /* Voxels: x/y at 4 nm, z at 40 nm. A 1,000-voxel offset in x is 4,000 nm = 4 µm. */
    const RES = [4, 4, 40];
    const stack = (cx, cy, rad) => [ring(cx, cy, rad, 10), ring(cx, cy, rad, 11), ring(cx, cy, rad, 12)];

    const lyso = { name: "Lysosome 1", kind: "lysosome", instance_index: 1, traced_by: "Gary",
                   nucleus_id: "111", root_id: "999", structure_id: "sid-lyso",
                   rings: stack(1000, 0, 40) };
    const nuc  = { name: "Nucleus", kind: "nucleus", nucleus_id: "111", root_id: "999",
                   structure_id: "sid-nuc", rings: stack(0, 0, 300) };
    const lone = { name: "Mitochondrion 1", kind: "mitochondrion", instance_index: 1,
                   nucleus_id: "222", structure_id: "sid-mito", rings: stack(500, 0, 30) };
    const orphan = { name: "Mitochondrion 2", kind: "mitochondrion", nucleus_id: "333",
                     structure_id: "sid-orphan", rings: stack(0, 0, 30) };
    /* Two more on cell 111, chosen so that NEAREST BY SURFACE and NEAREST BY CENTROID are
       different organelles -- a big one whose edge nearly touches the lysosome while its centre is
       8 µm away, and a small one whose centre is closer but whose edge is not. If the sheet named
       only one neighbour, one of these two true answers would be missing. */
    const big   = { name: "Big vacuole", kind: "vacuole", nucleus_id: "111", root_id: "999",
                    structure_id: "sid-big", rings: stack(1000, 2000, 1800) };
    const small = { name: "Small vesicle", kind: "vesicle", nucleus_id: "111", root_id: "999",
                    structure_id: "sid-small", rings: stack(1000, 700, 30) };
    /* A whole-cell outline encloses everything, so its distance to each organelle is a property of
       the tracing, not of the cell. It must never be named as a neighbour. */
    const whole = { name: "Whole cell", kind: "cell", nucleus_id: "111", root_id: "999",
                    structure_id: "sid-cell", rings: stack(0, 0, 3000) };

    const detection = { "222": { xVox: 0, yVox: 0, zVox: 11 } };
    const rows = tracedShapeRows([lyso, nuc, lone, orphan, big, small, whole], {
      resNm: RES,
      nucCentroid: nid => detection[nid] || null,
      typeOf: nid => (nid === "111" ? "microglia" : "")
    });
    const by = {};
    rows.forEach(x => { by[x["Structure ID"]] = x; });
    return { missing: false, n: rows.length, by, cols: window.TRACED_SHAPE_COLUMNS,
             keys: rows.length ? Object.keys(rows[0]) : [] };
  });

  if (r.missing) {
    ok(false, "the page exposes tracedShapeRows() and TRACED_SHAPE_COLUMNS", "it does not");
  } else {
    const L = r.by["sid-lyso"] || {}, M = r.by["sid-mito"] || {}, O = r.by["sid-orphan"] || {},
          Nu = r.by["sid-nuc"] || {};
    console.log("\nthe rows");
    ok(r.n === 7, "one row per outlined structure, nucleus and whole cell included", r.n + " rows");
    ok(L["Structure"] === "Lysosome 1" && L["Kind"] === "lysosome" && L["Instance"] === 1,
       "the organelle is named, typed and numbered",
       [L["Structure"], L["Kind"], L["Instance"]].join(" / "));
    ok(L["Cell type"] === "microglia", "...and carries the cell's type", L["Cell type"]);
    ok(Math.abs(L["Circularity (widest)"] - 1) < 0.01 && Math.abs(L["Aspect ratio (widest)"] - 1) < 0.01,
       "a round organelle is circular and as wide as it is long",
       "circ " + L["Circularity (widest)"] + ", AR " + L["Aspect ratio (widest)"]);
    ok(L["Sections"] === 3, "...over three sections", L["Sections"]);

    console.log("\nthe distance, and which nucleus it is from");
    ok(Math.abs(L["Distance to nucleus centroid (µm)"] - 4) < 0.02,
       "1,000 voxels of x at 4 nm each is 4 µm", L["Distance to nucleus centroid (µm)"]);
    ok(L["Nucleus centroid from"] === "traced nucleus outline",
       "...measured from the cell's own traced nucleus, because it has one",
       L["Nucleus centroid from"]);
    ok(Math.abs(M["Distance to nucleus centroid (µm)"] - 2) < 0.02,
       "a cell with no traced nucleus falls back to the detection centroid",
       M["Distance to nucleus centroid (µm)"]);
    ok(M["Nucleus centroid from"] === "MICrONS nucleus detection", "...and says so",
       M["Nucleus centroid from"]);
    ok(O["Distance to nucleus centroid (µm)"] === "" && O["Nucleus centroid from"] === "",
       "a cell with neither leaves it blank rather than guessing",
       JSON.stringify([O["Distance to nucleus centroid (µm)"], O["Nucleus centroid from"]]));
    ok(Math.abs(Nu["Distance to nucleus centroid (µm)"]) < 0.01,
       "the nucleus is zero from itself", Nu["Distance to nucleus centroid (µm)"]);

    /* Surface to surface is a different question from centre to centre, and on these shapes the
       two pick different neighbours -- which is why both are named. */
    console.log("\nsurface to surface");
    ok(Math.abs(L["Distance to nucleus surface (µm)"] - 2.64) < 0.02,
       "organelle to nucleus surface: 1000 - 40 - 300 voxels at 4 nm is 2.64 µm",
       L["Distance to nucleus surface (µm)"]);
    ok(M["Distance to nucleus surface (µm)"] === "",
       "...blank when nobody outlined the nucleus — a detection centroid has no surface",
       JSON.stringify(M["Distance to nucleus surface (µm)"]));
    ok(L["Nearest organelle (by surface)"] === "Big vacuole",
       "the nearest organelle by SURFACE is the big one whose edge is close",
       L["Nearest organelle (by surface)"]);
    ok(Math.abs(L["Distance to its surface (µm)"] - 0.64) < 0.02,
       "...2000 - 40 - 1800 voxels is 0.64 µm", L["Distance to its surface (µm)"]);
    ok(Math.abs(L["Distance to its centroid (µm)"] - 8) < 0.02,
       "...while that same pair's centroids are 8 µm apart", L["Distance to its centroid (µm)"]);
    ok(L["Nearest organelle (by centroid)"] === "Small vesicle",
       "the nearest by CENTROID is a different organelle",
       L["Nearest organelle (by centroid)"]);
    ok(Math.abs(L["Distance to that centroid (µm)"] - 2.8) < 0.02,
       "...700 voxels is 2.8 µm", L["Distance to that centroid (µm)"]);
    ok(L["Nearest organelle (by surface)"] !== "Whole cell"
       && L["Nearest organelle (by centroid)"] !== "Whole cell",
       "the whole-cell outline is never the neighbour, though it surrounds everything");
    ok(O["Nearest organelle (by surface)"] === "" && O["Distance to its surface (µm)"] === "",
       "the only organelle of its cell has no neighbour, and says nothing rather than zero",
       JSON.stringify([O["Nearest organelle (by surface)"], O["Distance to its surface (µm)"]]));

    /* ── THE 3D DESCRIPTORS ─────────────────────────────────────────────────  2026-09-30
       Gary's Claude: circularity becomes sphericity (two conventions, both named), aspect ratio
       splits into elongation and flatness, solidity carries over. And: "these metrics will also be
       good for nuclei and soma" -- they always were, because the sheet writes a row per OUTLINED
       STRUCTURE whatever its kind, which is asserted here rather than assumed. */
    console.log("\nin three dimensions");
    /* These fixtures are three sections of a circle at 40 nm apart -- 320 nm across and 80 nm
       thick, which is a DISC, not a sphere, and the numbers have to say so. Asserting 1 here would
       have been asserting the fixture I had in mind rather than the one I built. */
    ok(L["Sphericity (Wadell)"] > 0.6 && L["Sphericity (Wadell)"] < 0.8,
       "a three-section outline is a squat disc, and its sphericity says so",
       L["Sphericity (Wadell)"]);
    ok(Math.abs(L["Sphericity (MorphoLibJ, 36\u03c0V\u00b2/S\u00b3)"]
                - Math.pow(L["Sphericity (Wadell)"], 3)) < 0.002,
       "...and MorphoLibJ's convention is that cubed, so FIJI numbers line up",
       L["Sphericity (MorphoLibJ, 36\u03c0V\u00b2/S\u00b3)"]);
    ok(Math.abs(L["Elongation (3D)"] - 1) < 0.05 && L["Flatness (3D)"] > 3,
       "...round in plane, so elongation 1, and flat through z, so flatness well above 1",
       L["Elongation (3D)"] + " / " + L["Flatness (3D)"]);
    ok(Math.abs(L["Solidity (3D)"] - 1) < 0.05, "...and convex", L["Solidity (3D)"]);
    ok(L["Mesh volume (\u00b5m\u00b3)"] > 0 && L["Mesh surface area (\u00b5m\u00b2)"] > 0,
       "the mesh volume and surface it was measured from are reported beside it",
       L["Mesh volume (\u00b5m\u00b3)"] + " µm³, " + L["Mesh surface area (\u00b5m\u00b2)"] + " µm²");
    ok(Nu["Sphericity (Wadell)"] !== "" && Nu["Elongation (3D)"] !== "",
       "the NUCLEUS gets every metric an organelle gets",
       "sphericity " + Nu["Sphericity (Wadell)"] + ", elongation " + Nu["Elongation (3D)"]);
    const W = r.by["sid-cell"] || {};
    ok(W["Sphericity (Wadell)"] !== "" && W["Circularity (widest)"] !== "",
       "...and so does the whole cell / soma outline",
       "sphericity " + W["Sphericity (Wadell)"] + ", circularity " + W["Circularity (widest)"]);

    console.log("\nthe columns");
    ok(r.cols.length === r.keys.length && r.cols.every((c, i) => c === r.keys[i]),
       "the column list and the row keys are the same set in the same order",
       r.cols.length + " columns, " + r.keys.length + " keys");
    for (const want of ["Circularity (widest)", "Aspect ratio (widest)", "Roundness (widest)",
                        "Solidity (widest)", "Circularity (median)",
                        "Distance to nucleus centroid (µm)", "Nucleus centroid from",
                        "Distance to nucleus surface (µm)", "Nearest organelle (by surface)",
                        "Distance to its surface (µm)", "Distance to its centroid (µm)",
                        "Nearest organelle (by centroid)", "Distance to that centroid (µm)",
                        "Sphericity (Wadell)", "Sphericity (MorphoLibJ, 36\u03c0V\u00b2/S\u00b3)",
                        "Elongation (3D)", "Flatness (3D)", "Solidity (3D)",
                        "Mesh volume (\u00b5m\u00b3)", "Mesh surface area (\u00b5m\u00b2)"])
      ok(r.cols.indexOf(want) >= 0, "“" + want + "” is a column");
  }

  /* The displaying half. tracingVolumeOf() carries the shape along with the volume, so every
     place that already renders a volume renders the shape too -- including the one-line-each
     rendering a pad uses when it holds several organelles, which is where "for each organelle"
     actually bites. */
  console.log("\nwhat the card says");
  const card = await p.evaluate(() => {
    if (typeof tracingVolumeOf !== "function" || typeof tracingVolumeSay !== "function")
      return { missing: true };
    const ring = (cx, cy, r, z) => ({ z: z, points: (() => {
      const o = []; for (let i = 0; i < 128; i++){ const t = 2 * Math.PI * i / 128;
        o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return o; })() });
    const rings = [ring(1000, 0, 40, 10), ring(1000, 0, 40, 11), ring(1000, 0, 40, 12)];
    const v = tracingVolumeOf(rings);
    const before = tracingVolumeSay(v);
    /* With a nucleus to measure from, and with the id the pad would be holding. */
    const el = document.getElementById("tracingNucId");
    const had = el ? el.value : null;
    let withNuc = "";
    if (el) {
      window.__realHook = window.tracingNucCentroid;
      window.tracingNucCentroid = () => ({ xVox: 0, yVox: 0, zVox: 11, from: "test nucleus" });
      el.value = "12345";
      withNuc = tracingVolumeSay(tracingVolumeOf(rings));
      window.tracingNucCentroid = window.__realHook;
      el.value = had;
    }
    return { missing: false, hasShape: !!(v && v.shape && v.shape.ok), before, withNuc,
             hook: typeof window.tracingNucCentroid === "function" };
  });
  if (card.missing) {
    ok(false, "the page defines tracingVolumeOf() and tracingVolumeSay()", "it does not");
  } else {
    ok(card.hasShape, "the volume result carries the shape with it");
    ok(/circularity/.test(card.before) && /aspect ratio/.test(card.before),
       "the volume sentence names circularity and aspect ratio",
       card.before.slice(card.before.indexOf("Widest")).slice(0, 110) || card.before.slice(0, 90));
    ok(/Median over 3 sections/.test(card.before), "...and the median over the sections",
       /Median[^.]*\./.exec(card.before) ? RegExp.lastMatch : "(absent)");
    ok(!/from the/.test(card.before),
       "...with no distance when there is no nucleus id to measure from");
    ok(/4\.00 µm from the test nucleus/.test(card.withNuc),
       "...and the distance, named by which nucleus, once there is one",
       /centre is[^.]*\./.exec(card.withNuc) ? RegExp.lastMatch : "(absent)");
    ok(card.hook, "µJump answers where a nucleus is");
  }

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await p.close();
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
