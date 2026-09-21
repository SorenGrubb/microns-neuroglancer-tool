/* Tracings are grouped under the cell they were traced in.                            2026-09-21

   Søren: "For the kept tracings, it is confusing that lysosomes from different microglia have the
   same number. What I would like is that they are organized as sub-elements of the cell they were
   traced in, where you can click the neuroglancer next to the microglia and see all of the traced
   organelles for that cell or remove all of them. Same system below for the pad, also where you can
   open all of the tracings for one cell in the pad or in Neuroglancer or download a zip-file with
   all of the files related to that cell."

   Checked on the page, with the backend answered here:
     KEPT      one group per cell; each tracing sits inside its cell; the cell's Neuroglancer opens
               all of that cell's tracings with that cell's ids; "Remove all" asks once more before it
               removes, and removes that cell's tracings only.
     DATASET   one group per cell, and a group for tracings filed with no cell; the cell's
               Neuroglancer opens all of them; "Open all in the pad" puts every one on the pad as its
               own numbered structure, each keeping its own id, type and number, so adding them back
               is the next version of each and not new tracings; "Download zip" holds every tracing's
               contours, a mesh of each, and an index of the cell.

   Run: node tracinggroupcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
const JSZIP = ["/home/claude/.npm-global/lib/node_modules/docx/node_modules/jszip/dist/jszip.min.js",
               "/home/claude/.npm-global/lib/node_modules/pptxgenjs/node_modules/jszip/dist/jszip.min.js"]
              .filter(f => fs.existsSync(f))[0];
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

const A = "521491", B = "600111", RA = "864691135000000001", RB = "864691135000000002";
/* Three on cell A (two lysosomes and a mitochondrion), one lysosome on cell B -- numbered 1 like
   cell A's first, which is the confusion Søren saw -- and one filed with no cell. */
const SHARED = [
  { structureId: "lys_a1", name: "Lysosome 1", kind: "lysosome", instanceIndex: 1, instanceOf: "lysosome",
    nucleusId: A, rootId: RA, cellType: "microglia", color: "#ffaa00", timestamp: "2026-09-20T10:00:00Z",
    contours: 2, sections: 2, versions: 1, contributors: ["S"] },
  { structureId: "lys_a2", name: "Lysosome 2", kind: "lysosome", instanceIndex: 2, instanceOf: "lysosome",
    nucleusId: A, rootId: RA, cellType: "microglia", color: "#00aaff", timestamp: "2026-09-20T11:00:00Z",
    contours: 2, sections: 2, versions: 2, contributors: ["S", "T"] },
  { structureId: "mit_a3", name: "Mitochondrion 3", kind: "mitochondrion", instanceIndex: 3, instanceOf: "mitochondrion",
    nucleusId: A, rootId: RA, cellType: "microglia", color: "#aa00ff", timestamp: "2026-09-20T09:00:00Z",
    contours: 2, sections: 2, versions: 1, contributors: ["S"] },
  { structureId: "lys_b1", name: "Lysosome 1", kind: "lysosome", instanceIndex: 1, instanceOf: "lysosome",
    nucleusId: B, rootId: RB, cellType: "microglia", color: "#11ff11", timestamp: "2026-09-21T08:00:00Z",
    contours: 2, sections: 2, versions: 1, contributors: ["S"] },
  { structureId: "odd_x", name: "Dense body", kind: "other", nucleusId: "", rootId: "", color: "#888888",
    timestamp: "2026-09-19T08:00:00Z", contours: 2, sections: 2, versions: 1, contributors: ["S"] },
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 }, acceptDownloads: true });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  let ENC = {};
  await p.route("**cdnjs.cloudflare.com/**", r => /jszip/.test(r.request().url()) && JSZIP
    ? r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(JSZIP, "utf8") })
    : r.abort());
  for (const h of ["**accounts.google.com/**", "**storage.googleapis.com/**", "**gstatic.com/**", "**amazonaws.com/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", async route => {
    const u = new URL(route.request().url());
    const J = o => route.fulfill({ status: 200, contentType: "application/json",
                                   headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(o) });
    if (u.searchParams.get("tracings")){
      const sid = u.searchParams.get("structureId");
      if (!sid) return J({ tracings: SHARED });
      const t = SHARED.filter(x => x.structureId === sid)[0];
      if (!t) return J({ tracings: [] });
      const rows = [0, 1].map(k => Object.assign({}, t, { z: 19736 + k, ringIndex: 0, points: ENC[sid], reporterName: "S" }));
      return J({ tracings: [Object.assign({}, t, { rows: rows })] });
    }
    return J({ ok: true, tracings: [], reports: [], rootIds: [] });
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(4000);

  const has = await p.evaluate(() => typeof tracingRenderList === "function" && !!document.getElementById("tracingList"));
  if (!has){ console.log(PAGE + ": no tracing card -- nothing to group"); await b.close(); console.log("\nall good"); process.exit(0); }
  const scope = await p.evaluate(() => (typeof tracingScope === "function" && tracingScope()) || "");
  if (scope) SHARED.forEach(t => { if (t.nucleusId) t.nucleusId = scope + ":" + t.nucleusId; });
  const nA = SHARED[0].nucleusId, nB = SHARED[3].nucleusId;
  ENC = await p.evaluate((sids) => {
    const o = {};
    sids.forEach((s, i) => { o[s] = UJ.tracing.encodePoints([[183100 + 90 * i, 119840], [183160 + 90 * i, 119840], [183130 + 90 * i, 119900]]); });
    return o;
  }, SHARED.map(t => t.structureId));

  /* Neuroglancer is asked, not opened: what matters is what it was asked to show. */
  await p.evaluate(() => {
    window.__NGL = [];
    window.tracingViewerOpen = function(structs, say, ids){ window.__NGL.push({ n: structs.length,
      names: structs.map(s => s.name), rings: structs.map(s => (s.rings || []).length), ids: ids || {} }); };
  });

  console.log(PAGE + "\n\nkept tracings");
  const kept = await p.evaluate(([nA, nB]) => {
    const ring = (z) => ({ z: z, points: [[1000, 2000], [1060, 2000], [1030, 2060]] });
    TRACINGS_KEPT = [
      { id: "k1", name: "Lysosome 1", kind: "lysosome", type: "microglia", nucleus_id: nA, root_id: "r1", rings: [ring(1), ring(2)] },
      { id: "k2", name: "Lysosome 1", kind: "lysosome", type: "microglia", nucleus_id: nB, root_id: "r2", rings: [ring(1), ring(2)] },
      { id: "k3", name: "Lysosome 2", kind: "lysosome", type: "microglia", nucleus_id: nA, root_id: "r1", rings: [ring(1), ring(2)] } ];
    tracingRenderList();
    const host = document.getElementById("tracingList");
    const cells = [].slice.call(host.querySelectorAll(".tracingcell"));
    return { cells: cells.length,
             inCell: cells.map(c => c.querySelectorAll(".tracingview").length),
             loose: host.querySelectorAll(".tracingview").length - cells.reduce((s, c) => s + c.querySelectorAll(".tracingview").length, 0),
             headers: cells.map(c => (c.querySelector(".tracingcellhead") || {}).textContent || "") };
  }, [nA, nB]);
  ok(kept.cells === 2, "one group per cell", kept.cells);
  ok(kept.inCell.join(",") === "2,1" && kept.loose === 0, "each tracing sits inside its own cell", kept.inCell.join(",") + ", loose " + kept.loose);
  ok(kept.headers[0].indexOf(nA.split(":").pop()) >= 0, "the cell's header names its nucleus", kept.headers[0].slice(0, 90));

  const kn = await p.evaluate(() => { window.__NGL = [];
    document.querySelector("#tracingList .tracingcell .tracingcellngl").click(); return window.__NGL; });
  ok(kn.length === 1 && kn[0].n === 2,
     "the cell's Neuroglancer opens all of that cell's tracings", JSON.stringify(kn));
  ok(kn[0] && kn[0].ids.nuc === nA && kn[0].ids.root === "r1", "...with that cell's ids", JSON.stringify(kn[0] && kn[0].ids));

  const kd = await p.evaluate(async () => {
    const btn = () => document.querySelector("#tracingList .tracingcell .tracingcelldrop");
    btn().click();
    const after1 = TRACINGS_KEPT.length;
    btn().click();
    await new Promise(r => setTimeout(r, 50));
    return { after1, after2: TRACINGS_KEPT.map(t => t.id), stored: tracingRead().map(t => t.id) };
  });
  ok(kd.after1 === 3, "\"Remove all\" asks once more before it removes anything", kd.after1);
  ok(kd.after2.join(",") === "k2" && kd.stored.join(",") === "k2", "...then removes that cell's tracings, and only those",
     kd.after2.join(",") + " / stored " + kd.stored.join(","));

  console.log("\nin the dataset");
  const ds = await p.evaluate(async () => {
    await tracingBrowse();
    const host = document.getElementById("tracingShared");
    const cells = [].slice.call(host.querySelectorAll(".tracingcell"));
    return { cells: cells.length, rows: cells.map(c => c.querySelectorAll(".tracingopen").length),
             heads: cells.map(c => (c.querySelector(".tracingcellhead") || {}).textContent || ""),
             bits: cells.map(c => [!!c.querySelector(".tracingcellpad"), !!c.querySelector(".tracingcellngl"), !!c.querySelector(".tracingcellzip")]) };
  });
  /* A volume-scoped tool (ωJump) lists only tracings filed under this volume, so one with no cell
     is not among them. */
  ok(ds.cells === (scope ? 2 : 3), "one group per cell" + (scope ? "" : ", and one for tracings with no cell"), ds.cells);
  const iA = ds.heads.findIndex(h => h.indexOf(nA.split(":").pop()) >= 0);
  ok(iA >= 0 && ds.rows[iA] === 3, "cell A holds its three tracings", JSON.stringify(ds.rows));
  ok(ds.bits.every(x => x.every(Boolean)), "each cell offers the pad, Neuroglancer and a zip", JSON.stringify(ds.bits));

  const dn = await p.evaluate(async (iA) => { window.__NGL = [];
    document.querySelectorAll("#tracingShared .tracingcell")[iA].querySelector(".tracingcellngl").click();
    const t0 = Date.now(); while (!window.__NGL.length && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 50));
    return window.__NGL; }, iA);
  ok(dn.length === 1 && dn[0].n === 3 && dn[0].rings.every(n => n === 2), "the cell's Neuroglancer opens all three, with their contours", JSON.stringify(dn));
  ok(dn[0] && dn[0].ids.nuc === nA && dn[0].ids.root === RA, "...with that cell's ids", JSON.stringify(dn[0] && dn[0].ids));

  const pad = await p.evaluate(async (iA) => {
    document.querySelectorAll("#tracingShared .tracingcell")[iA].querySelector(".tracingcellpad").click();
    const t0 = Date.now();
    while (!(typeof PAD_EDIT_IDS !== "undefined" && Object.keys(PAD_EDIT_IDS).length === 3) && Date.now() - t0 < 6000)
      await new Promise(r => setTimeout(r, 50));
    const insts = [...new Set((PAD && PAD.rings || []).map(r => r.inst || 0))].sort();
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: PAD_EDIT_ID || undefined };
    const out = (tracingCurrentAll() || []).map(t => ({ id: t.id, name: t.name, color: t.color, nuc: t.nucleus_id }));
    return { insts, ids: typeof PAD_EDIT_IDS !== "undefined" ? PAD_EDIT_IDS : null, out,
             each: !!(document.getElementById("tracingEachOwn") || {}).checked };
  }, iA);
  ok(pad.insts.join(",") === "0,1,2", "\"Open all in the pad\" puts each one on the pad as its own structure", pad.insts.join(","));
  const byId = {}; pad.out.forEach(t => byId[t.id] = t);
  ok(pad.out.length === 3 && byId.lys_a1 && byId.lys_a2 && byId.mit_a3,
     "adding them back files each as the next version of itself, not as new tracings", pad.out.map(t => t.id).join(", "));
  ok(byId.lys_a1 && byId.lys_a1.name === "Lysosome 1" && byId.lys_a2 && byId.lys_a2.name === "Lysosome 2"
     && byId.mit_a3 && byId.mit_a3.name === "Mitochondrion 3", "...each keeping its own type and number",
     pad.out.map(t => t.name).join(", "));
  ok(byId.lys_a2 && byId.lys_a2.color === "#00aaff", "...and its own colour", byId.lys_a2 && byId.lys_a2.color);
  ok(pad.out.every(t => t.nuc === nA), "...on its own cell", pad.out.map(t => t.nuc).join(","));

  const zip = await p.evaluate(async (iA) => {
    let got = null;
    window.tracingSaveBlob = function(blob, name){ got = { blob, name }; };
    await tracingBrowse();
    document.querySelectorAll("#tracingShared .tracingcell")[iA].querySelector(".tracingcellzip").click();
    const t0 = Date.now(); while (!got && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 50));
    if (!got) return null;
    const z = await JSZip.loadAsync(got.blob);
    const names = Object.keys(z.files);
    const idx = names.filter(n => /cell\.json$/.test(n))[0];
    return { name: got.name, names, index: idx ? JSON.parse(await z.file(idx).async("string")) : null };
  }, iA);
  ok(zip && /\.zip$/.test(zip.name), "\"Download zip\" saves a zip", zip && zip.name);
  ok(zip && zip.names.filter(n => /\.json$/.test(n) && !/cell\.json$/.test(n)).length === 3, "...with each tracing's contours", zip && zip.names.join(", "));
  ok(zip && zip.names.filter(n => /\.obj$/.test(n)).length === 3, "...a mesh of each", zip && zip.names.filter(n => /\.obj$/.test(n)).join(", "));
  ok(zip && zip.index && zip.index.nucleusId === nA && (zip.index.tracings || []).length === 3, "...and an index of the cell",
     zip && JSON.stringify(zip.index && { nuc: zip.index.nucleusId, n: (zip.index.tracings || []).length }));

  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
