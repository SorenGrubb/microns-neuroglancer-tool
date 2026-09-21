/* ωJump's tracing card: one card over sixty-two volumes.                             2026-09-21

   The card is core/tracingcard.js, as on six other tools. What is ωJump's own, and checked here on
   the LIVE page with the backend and the volumes answered locally:

     - it mounts under Identify;
     - for every one of the 62 volumes, the EM it reads is the EM buildState() puts in the viewer
       link -- the two cannot disagree about which picture a contour is drawn on;
     - on a WEBKNOSSOS volume (Zarr v2, served from fixtures/zarr_fixtures.json at that volume's
       real address), the pad draws the EM and a coordinate reads the segment under it;
     - a uint16 volume is windowed by its own em_range; an isotropic one may draw slab levels;
     - switching volume closes the pad, and the lists are per volume: a tracing filed under another
       volume is not offered here;
     - NOTHING goes into localStorage but the theme -- this page's own rule.

   Run: node wjtracecheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const FX = JSON.parse(fs.readFileSync(__dirname + "/fixtures/zarr_fixtures.json", "utf8"));
const WK = "https://demo.wk1.connectomics.hpccloud.mpg.de/data/zarr/62b17f19010000aa0075d7bb/";
const seg = (x, y, z) => (864691135000000000n + BigInt(x) + 1000n * BigInt(y) + 1000000n * BigInt(z)).toString();

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**gstatic.com/**",
                   "**s3.amazonaws.com/**", "**data-humerus.webknossos.org/**"])
    await p.route(h, r => r.abort());
  const reads = [];
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url());
    reads.push(u.search);
    let body = { ok: true, visited: [], nuclei: [] };
    if (u.searchParams.get("tracings") === "1")
      body = { ok: true, tracings: [
        { structureId: "a", kind: "mitochondria", name: "here", nucleusId: "wk-mk1-f6-l23:3", timestamp: "2026-09-21" },
        { structureId: "b", kind: "lysosome", name: "elsewhere", nucleusId: "jrc_mus-liver:7", timestamp: "2026-09-21" },
        { structureId: "c", kind: "cell", name: "no scope", nucleusId: "", timestamp: "2026-09-21" }] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await p.route(WK + "**", route => {
    const rest = route.request().url().slice(WK.length);           // color/... or segmentation/...
    const key = rest.replace(/^color\//, "wk/color/").replace(/^segmentation\//, "wk/seg/");
    if (!(key in FX)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" },
                           body: Buffer.from(FX[key], "base64") });
  });
  await p.goto("file://" + page_("wjump.html"));
  await p.waitForTimeout(3000);

  console.log("the card");
  const m = await p.evaluate(() => {
    const id = document.getElementById("identify-card"), t = document.getElementById("tracingCard");
    const W = UJ.wjump, bad = [];
    UJ.cfg.datasets.forEach(function(d){
      if (!W.usable(d)) return;
      const st = W.buildState(d.id, [0, 0, 0], [], null, {});
      if (!st || st.layers[0].source !== UJ.cfg.tracing._emOf(d)) bad.push(d.id);
    });
    return { card: !!(t && t.querySelector("#tracePad")),
             under: !!(id && t && (id.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)),
             n: UJ.cfg.datasets.filter(W.usable).length, bad };
  });
  ok(m.card && m.under, "the card is built on the live page, under Identify");
  ok(m.bad.length === 0, "for all " + m.n + " volumes the pad reads the EM the viewer link shows",
     m.bad.join(", ") || "none differ");

  console.log("\na WEBKNOSSOS volume, Zarr, served at its real address");
  const w = await p.evaluate(async () => {
    UJ.app.selectDataset("wk-mk1-f6-l23");
    await new Promise(r => setTimeout(r, 500));
    const src = UJ.cfg.tracing.sources();
    document.getElementById("tracingX").value = "7";
    document.getElementById("tracingY").value = "5";
    document.getElementById("tracingZ").value = "2";
    await tracingResolveAt([7, 5, 2]);
    const root = document.getElementById("tracingRootId").value;
    document.getElementById("tracePadOpen").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !(PAD_VIEW && !PAD_BUSY)) await new Promise(r => setTimeout(r, 200));
    const cv = document.getElementById("tracePad");
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let lo = 255, hi = 0; for (let i = 0; i < px.length; i += 4){ if (px[i] === 24) continue; lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); }
    return { em: src.em, seg: src.seg, res: UJ.cfg.res.join(","), root, lo, hi,
             slab: UJ.cfg.tracing.slabOk(), menu: document.getElementById("tracePadMip").options[1].textContent };
  });
  ok(/^zarr:\/\//.test(w.em) && /segmentation$/.test(w.seg), "its EM and segmentation are the Zarr sources", w.em.slice(-40));
  ok(w.res === "11.24,11.24,30", "the tool frame is this volume's own voxels", w.res);
  ok(w.root === seg(7, 5, 2), "a coordinate reads the segment under it — uint64, through Zarr", w.root);
  ok(w.hi - w.lo > 20, "the pad draws the section", w.lo + "–" + w.hi);
  ok(!w.slab && !/slab/.test(w.menu), "anisotropic: no slab levels offered", w.menu);

  console.log("\nthe volume changes");
  const c = await p.evaluate(async () => {
    const wasOpen = document.getElementById("tracePadWrap").style.display !== "none";
    UJ.app.selectDataset("jrc_mus-lung-2a");
    await new Promise(r => setTimeout(r, 300));
    const src = UJ.cfg.tracing.sources();
    return { wasOpen, closed: document.getElementById("tracePadWrap").style.display === "none",
             root: document.getElementById("tracingRootId").value, u16: src.u16, win: UJ.cfg.tracing.window(),
             slab: UJ.cfg.tracing.slabOk(), scope: tracingScope() };
  });
  ok(c.wasOpen && c.closed, "switching volume closes the pad");
  ok(c.root === "", "...and clears the ids that belonged to the old one");
  ok(c.u16 && c.u16[0] === 32643 && c.win.lo === 0 && c.win.hi === 255,
     "a uint16 volume is windowed by its own em_range, then drawn 0-255", JSON.stringify(c.u16));
  ok(c.slab, "an isotropic volume may draw slab levels");

  console.log("\nper volume");
  const s = await p.evaluate(async () => {
    UJ.app.selectDataset("wk-mk1-f6-l23");
    await new Promise(r => setTimeout(r, 300));
    await tracingBrowse();
    const shown = TRACING_SHARED.map(t => t.structureId).join(",");
    return { shown, filed: tracingScoped(""), keyed: tracingScoped("wk-mk1-f6-l23:3") };
  });
  ok(s.shown === "a", "the dataset list keeps only this volume's tracings", s.shown);
  ok(s.filed === "wk-mk1-f6-l23:" && s.keyed === "wk-mk1-f6-l23:3",
     "a tracing is filed with this volume in its id, and a nucleus key is left as it is", s.filed + " / " + s.keyed);

  console.log("\nnothing in the browser");
  const st = await p.evaluate(async () => {
    document.getElementById("tracingX").value = "7"; document.getElementById("tracingY").value = "5";
    document.getElementById("tracingZ").value = "2";
    document.getElementById("tracePadOpen").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !(PAD_VIEW && !PAD_BUSY)) await new Promise(r => setTimeout(r, 200));
    PAD.rings.push({ z: 2, points: [[1, 1], [6, 1], [6, 4], [1, 4]], inst: 0 });
    draftSave(true);
    const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return { keys, say: document.getElementById("tracePadSay").textContent, drafts: draftStore.list().length };
  });
  ok(st.keys.every(k => k === "ujump_theme"), "localStorage holds the theme and nothing else", st.keys.join(",") || "empty");
  ok(st.drafts === 1, "...while the draft is kept on the page", st.drafts + " draft(s)");
  ok(/keeps no work in the browser/.test(st.say), "and the card says where it went", st.say.slice(0, 80));
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
