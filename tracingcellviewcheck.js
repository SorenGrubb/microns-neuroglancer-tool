/* A cell's Neuroglancer opens on the cell; a tracing's opens on the tracing.          2026-09-21

   Søren: "The neuroglancer instance for the microglia centers on the lysosome and not the cell
   nucleus center. For the lysosome itself, that is fine, but for the microglia it should be on its
   own center."

   Checked: the cell row's Neuroglancer (kept list and dataset list) centres on the cell's centre --
   its cell_coord, or where the page knows its nucleus to be -- while a tracing's own Neuroglancer
   still centres on the tracing.

   Run: node tracingcellviewcheck.js [page.html]      (default ljump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ljump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [];
  let ENC = "", SCOPE = "";
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**accounts.google.com/**", "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**",
                   "**gstatic.com/**", "**amazonaws.com/**", "**td.princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url()), H = { "Access-Control-Allow-Origin": "*" };
    if (u.searchParams.get("tracings")){
      const one = { structureId: "lys_v", name: "Lysosome", kind: "lysosome", nucleusId: SCOPE ? SCOPE + ":" : "", rootId: "",
                    cellCoord: "1000,2000,500", timestamp: "2026-09-21T10:00:00Z", contours: 2, sections: 2 };
      if (u.searchParams.get("structureId"))
        return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ tracings: [Object.assign({}, one, {
          rows: [0, 1].map(k => Object.assign({}, one, { z: 520 + k, ringIndex: 0, points: ENC, reporterName: "S" })) })] }) });
      return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ tracings: [one] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: H,
                           body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [], rootIds: [] }) });
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);
  const has = await p.evaluate(() => typeof tracingRenderList === "function" && !!document.getElementById("tracingList"));
  if (!has){ console.log(PAGE + ": no tracing card"); await b.close(); console.log("\nall good"); process.exit(0); }
  SCOPE = await p.evaluate(() => (typeof tracingScope === "function" && tracingScope()) || "");
  /* The lysosome sits 300 voxels from the cell's centre in x and y, 20 sections in z. */
  ENC = await p.evaluate(() => UJ.tracing.encodePoints([[1290, 2290], [1310, 2290], [1300, 2310]]));

  const posOf = (click) => p.evaluate(async (click) => {
    const opened = [];
    window.open = function(u){ const w = { location: { href: u || "" }, opener: 1 }; opened.push(w); return w; };
    document.querySelector(click).click();
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && !(opened[0] && opened[0].location.href)) await new Promise(r => setTimeout(r, 100));
    const href = opened[0] ? opened[0].location.href : "";
    if (!href) return null;
    const st = JSON.parse(decodeURIComponent(href.slice(href.indexOf("#!") + 2)));
    return (st.position || []).map(Math.round);
  }, click);

  await p.evaluate((SCOPE) => {
    const ring = z => ({ z, points: [[1290, 2290], [1310, 2290], [1300, 2310]] });
    TRACINGS_KEPT = [{ id: "lys_k", name: "Lysosome", kind: "lysosome", nucleus_id: SCOPE ? SCOPE + ":" : "", cell_coord: "1000,2000,500",
                       rings: [ring(520), ring(521)] }];
    tracingRenderList();
  }, SCOPE);
  console.log(PAGE + "\n\nkept list");
  const cellPos = await posOf("#tracingList .tracingcellngl");
  ok(cellPos && cellPos.join(",") === "1000,2000,500", "the cell's Neuroglancer opens on the cell's centre", cellPos && cellPos.join(","));
  const onePos = await posOf("#tracingList .tracingview");
  ok(onePos && onePos[0] > 1200 && onePos[2] >= 520, "...a tracing's own opens on the tracing", onePos && onePos.join(","));

  console.log("\ndataset list");
  await p.evaluate(() => tracingBrowse());
  const dsPos = await posOf("#tracingShared .tracingcellngl");
  ok(dsPos && dsPos.join(",") === "1000,2000,500", "the cell's Neuroglancer opens on the cell's centre", dsPos && dsPos.join(","));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
