/* A tracing knows the cell it belongs to, by its centre as well as by its ids.          2026-09-21

   Søren, on λJump: "I traced a lysosome of a microglia i had just identified. I had saved it as a
   new cell with the approximate centroid coordinates for the microglia nucleus. But the dataset
   does not contain nucleus ID or root ID, so the lysosome tracing cannot be associated with the
   cell. I think we also need to associate the organelles with the cell centroid coordinates and
   not just the nucleus IDs and root IDs, otherwise, how do we know what cell those organelles are
   from?"

   Lee16 has no segmentation, so nothing filled the two id boxes -- though the page knows every
   nucleus, the detected ones and the added ones, and where each sits. Checked:

     THE BOX      the card has a third box, the cell's centre (x, y, z in voxels);
     FILLED       opening the pad near a nucleus fills its id AND its centre from the page's own
                  nucleus list (an added cell is one of them), where no segmentation can;
     CARRIED      the tracing keeps the centre, sends it as cellCoord, and a draft remembers it;
     GROUPED      a tracing with only a centre is grouped under "cell at x, y, z", not under
                  "Not filed against a cell" -- in the kept list and in the dataset's;
     OPENED       a tracing opened from the dataset brings its centre back into the box.

   Run: node tracingcellcheck.js [page.html]      (default ljump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ljump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [], posts = [];
  let ENC = "", SCOPE = "";
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => d.dismiss());
  for (const h of ["**accounts.google.com/**", "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**", "**s3.amazonaws.com/**",
                   "**gstatic.com/**", "**amazonaws.com/**", "**td.princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", route => {
    const req = route.request(), H = { "Access-Control-Allow-Origin": "*" };
    if (req.method() === "POST"){
      let body = {}; try { body = JSON.parse(req.postData()); } catch (e){}
      posts.push(body);
      return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ ok: true }) });
    }
    const u = new URL(req.url());
    if (u.searchParams.get("tracings")){
      const one = { structureId: "lys_c", name: "Lysosome", kind: "lysosome", cellType: "microglia",
                    nucleusId: SCOPE ? SCOPE + ":" : "", rootId: "", cellCoord: "1200,3400,560", timestamp: "2026-09-21T10:00:00Z", contours: 2, sections: 2 };
      if (u.searchParams.get("structureId") === "lys_nocell"){
        const nc = { structureId: "lys_nocell", name: "Lysosome", kind: "lysosome", nucleusId: SCOPE ? SCOPE + ":" : "", rootId: "", cellCoord: "" };
        return p.evaluate(() => [window.__NOCELL, window.__NOCELLZ]).then(([pts, z]) =>
          route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ tracings: [Object.assign({}, nc, {
            rows: [0, 1].map(k => Object.assign({}, nc, { z: z + k, ringIndex: 0, points: pts, reporterName: "S" })) })] }) }));
      }
      if (u.searchParams.get("structureId"))
        return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ tracings: [Object.assign({}, one, {
          rows: [0, 1].map(k => Object.assign({}, one, { z: 560 + k, ringIndex: 0, points: ENC, reporterName: "S" })) })] }) });
      return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ tracings: [one] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: H,
                           body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [], newCells: [] }) });
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);
  SCOPE = await p.evaluate(() => (typeof tracingScope === "function" && tracingScope()) || "");
  ENC = await p.evaluate(() => UJ.tracing.encodePoints([[1190, 3390], [1210, 3390], [1200, 3410]]));
  await p.evaluate(() => {
    try { GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok"; REPORTER_NAME = "S"; } catch (e){}
    try { if (typeof GOOGLE_EXP !== "undefined") GOOGLE_EXP = 0; } catch (e){}
    try { if (window.UJ && UJ.app && UJ.app.setCredential) UJ.app.setCredential("tok", "a@b.c", 0); } catch (e){}
  });

  console.log(PAGE + "\n\nthe box");
  const box = await p.evaluate(() => !!document.getElementById("tracingCellAt"));
  ok(box, "the card has a box for the cell's centre", box);

  console.log("\nfilled from the page's own nucleus list");
  const fill = await p.evaluate(async () => {
    if (typeof nearest !== "function" || typeof bulkNucIdOf !== "function") return { skip: "no nucleus list on this page" };
    const i = 0, c = bulkCoordOf(i).split(",").map(Number), id = bulkNucIdOf(i);
    ["tracingNucId", "tracingRootId", "tracingCellAt"].forEach(k => { const e = document.getElementById(k); if (e) e.value = ""; });
    await tracingResolveAt([c[0] + 5, c[1] + 5, c[2]]);
    return { want: id, wantAt: c.join(", "), nuc: document.getElementById("tracingNucId").value,
             at: (document.getElementById("tracingCellAt") || {}).value, say: document.getElementById("tracingAtSay").textContent };
  });
  if (fill.skip) ok(true, "(" + fill.skip + ")");
  else {
    ok(fill.nuc === String(fill.want), "the nucleus box is filled with the nearest nucleus", fill.nuc + " (want " + fill.want + ")");
    ok(fill.at === fill.wantAt, "...and the centre box with where it is", fill.at + " (want " + fill.wantAt + ")");
    ok(/nucleus/i.test(fill.say), "...and it says so", fill.say.slice(0, 140));
  }

  console.log("\ncarried");
  const car = await p.evaluate(async () => {
    const ring = z => ({ z, inst: 0, points: [[1190, 3390], [1210, 3390], [1200, 3410]] });
    TRACING_PENDING = { rings: [ring(560), ring(561)] };
    const w = document.getElementById("tracingWhat");
    w.value = [].slice.call(w.options).some(o => o.value === "lysosome") ? "lysosome" : w.options[1].value;
    document.getElementById("tracingNucId").value = "";
    document.getElementById("tracingRootId").value = "";
    document.getElementById("tracingCellAt").value = "1200, 3400, 560";
    document.getElementById("tracingFound").style.display = "";
    PAD_INST_KIND = {}; PAD_INST_COLOUR = {};
    const all = tracingCurrentAll() || [];
    const t = all[0] || {};
    TRACINGS_KEPT = [t]; tracingPublish(t);
    await new Promise(r => setTimeout(r, 800));
    return { coord: t.cell_coord };
  });
  ok(car.coord === "1200,3400,560", "the tracing keeps the centre, as x,y,z", car.coord);
  const sent = posts.filter(x => x.type === "traced_structure").pop() || {};
  ok(sent.cellCoord === "1200,3400,560", "...and sends it as cellCoord", sent.cellCoord);
  const dr = await p.evaluate(() => { try { if (!PAD) PAD = UJ.tracepad.create(); return draftNow(); } catch (e){ return { err: String(e) }; } });
  if (dr && !dr.err) ok(dr.cellAt === "1200, 3400, 560", "...and a draft remembers it", dr.cellAt);

  console.log("\ngrouped");
  const grp = await p.evaluate(async () => {
    tracingRenderList();
    const kh = [...document.querySelectorAll("#tracingList .tracingcellhead")].map(e => e.textContent);
    await tracingBrowse();
    const dh = [...document.querySelectorAll("#tracingShared .tracingcellhead")].map(e => e.textContent);
    return { kh, dh };
  });
  ok(grp.kh.length === 1 && /cell at 1200, 3400, 560/.test(grp.kh[0]) && !/Not filed/.test(grp.kh[0]),
     "a kept tracing with only a centre is grouped under its cell", grp.kh.join(" | "));
  ok(grp.dh.length === 1 && /cell at 1200, 3400, 560/.test(grp.dh[0]), "...and so is one in the dataset", grp.dh.join(" | "));

  console.log("\nopened");
  const op = await p.evaluate(async () => {
    document.getElementById("tracingCellAt").value = "";
    try { await tracingOpenShared("lys_c"); } catch (e){ return { err: String(e) }; }
    return { at: document.getElementById("tracingCellAt").value };
  });
  ok(op.at === "1200, 3400, 560", "a tracing opened from the dataset brings its centre back", op.at || op.err);
  /* One filed against no cell at all -- Søren's λJump lysosome -- looks for its cell when opened. */
  const op2 = await p.evaluate(async () => {
    if (typeof nearest !== "function" || typeof bulkCoordOf !== "function") return { skip: 1 };
    const c = bulkCoordOf(0).split(",").map(Number), id = bulkNucIdOf(0);
    window.__NOCELL = UJ.tracing.encodePoints([[c[0] - 10, c[1] - 10], [c[0] + 10, c[1] - 10], [c[0], c[1] + 10]]);
    window.__NOCELLZ = c[2];
    ["tracingNucId", "tracingCellAt"].forEach(k => document.getElementById(k).value = "");
    try { await tracingOpenShared("lys_nocell"); } catch (e){ return { err: String(e) }; }
    return { want: String(id), nuc: document.getElementById("tracingNucId").value, at: document.getElementById("tracingCellAt").value,
             wantAt: c.join(", ") };
  });
  if (!op2.skip) ok(op2.nuc === op2.want && op2.at === op2.wantAt,
                    "a tracing filed against no cell finds its nearest nucleus when opened", JSON.stringify(op2));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
