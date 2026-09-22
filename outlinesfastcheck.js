/* Traced outlines for a filtered set of cells arrive in one request, not one per outline.   2026-09-22

   Søren: "Opening the neuroglancer with 4 filtered cells with 15 traced organelles took a long time.
   Can this be made faster?" core/tracedoutlines.js read the outlines one after another -- fifteen
   cold Apps Script calls in a row, each scanning the sheet and opening one Drive file.

   Now core/tracing.js's fetchMany asks for them together (?structureIds=a,b,c, one request per 25),
   falls back to one request each, SIX AT A TIME, when the deployment is older and answers without
   rows, and keeps what it read for the life of the page, so the second view of the same cells asks
   for nothing. Driven with a fake backend that counts requests and how many are in flight.

   Run: node outlinesfastcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const N = 15;
const ENTRIES = Array.from({ length: N }, (_, i) => ({ structureId: "lyso_" + i, groupId: "g1", kind: "lysosome",
  instanceOf: "lysosome", name: "Lysosome", color: "#40e28c", nucleusId: String(100 + (i % 4)), rootId: "" }));
const rowsOf = e => [{ structureId: e.structureId, name: e.name, kind: e.kind, instanceOf: e.instanceOf,
  nucleusId: e.nucleusId, z: 100, ringIndex: 0, points: "10,10;20,10;20,20" },
  { structureId: e.structureId, name: e.name, kind: e.kind, instanceOf: e.instanceOf,
  nucleusId: e.nucleusId, z: 105, ringIndex: 0, points: "10,10;20,10;20,20" }];
async function run(b, batchOk){
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  const stats = { index: 0, one: 0, many: 0, inFlight: 0, maxInFlight: 0 };
  await p.route("**/*", async r => {
    const u = r.request().url();
    if (/^file:/.test(u)) return r.continue();
    if (!/script\.google\.com/.test(u)) return r.abort();
    const q = new URL(u).searchParams;
    if (q.get("tracings") !== "1") return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    stats.inFlight++; stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    await new Promise(res => setTimeout(res, 150));
    stats.inFlight--;
    let body;
    if (q.get("structureId")){
      stats.one++;
      const e = ENTRIES.find(x => x.structureId === q.get("structureId"));
      body = { tracings: e ? [Object.assign({}, e, { rows: rowsOf(e) })] : [] };
    } else if (q.get("structureIds") && batchOk){
      stats.many++;
      const want = q.get("structureIds").split(",");
      body = { tracings: ENTRIES.filter(e => want.includes(e.structureId)).map(e => Object.assign({}, e, { rows: rowsOf(e) })) };
    } else {
      /* The index -- and what an older deployment answers to structureIds, which it ignores. */
      if (q.get("structureIds")) stats.many++; else stats.index++;
      body = { tracings: ENTRIES };
    }
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);
  const zero = JSON.parse(JSON.stringify(stats));
  const got = await p.evaluate(async () => {
    const t0 = performance.now();
    const layers = await buildTracedOrganelleLayers({ nuc: ["100", "101", "102", "103"], root: [] }, "__all", () => {});
    const ms = performance.now() - t0;
    const again = await buildTracedOrganelleLayers({ nuc: ["100", "101", "102", "103"], root: [] }, "__all", () => {});
    const n = l => l.reduce((s, x) => s + x.annotations.length, 0);
    return { layers: layers.length, anns: n(layers), againAnns: n(again), ms: Math.round(ms), name: layers[0] && layers[0].name };
  });
  await p.close();
  const d = k => stats[k] - zero[k];
  return { got, index: d("index"), one: d("one"), many: d("many"), max: stats.maxInFlight, errors };
}
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  console.log("a deployment that takes structureIds");
  const a = await run(b, true);
  ok(a.got.name === "traced lysosome (" + N + ")" && a.got.anns === N * 6, "all fifteen outlines are drawn",
     a.got.name + ", " + a.got.anns + " lines");
  ok(a.one === 0 && a.many === 1, "...read in ONE request, not fifteen", a.many + " batch, " + a.one + " single");
  ok(a.got.againAnns === a.got.anns, "the same cells again draw the same", a.got.againAnns);
  ok(a.errors.length === 0, "no page errors", a.errors.join(" | ").slice(0, 200) || "none");

  console.log("\nan older deployment, which ignores structureIds");
  const o = await run(b, false);
  ok(o.got.anns === N * 6, "all fifteen are still drawn", o.got.anns + " lines");
  ok(o.one === N, "...one request each", o.one);
  ok(o.max >= 4, "...several at a time, not one after another", "at most " + o.max + " in flight");
  ok(o.got.ms < N * 150 / 2, "...so it takes a fraction of fifteen round trips", o.got.ms + " ms against " + N * 150 + " ms in a row");

  console.log("\nand the second time");
  ok(a.index <= 2, "the index is asked for (once per view)", a.index);
  ok(a.many === 1 && o.one === N, "...but no outline is read twice in one page", "batch " + a.many + ", single " + o.one);
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
