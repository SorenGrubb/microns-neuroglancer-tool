/* λJump: a cell the community added is in "Browse a cell", with its identity.        2026-09-21

   Søren: "why do the cell registered as new by community not show in the list?" -- four added cells
   (three astrocytes, a microglia) were absorbed into the nucleus arrays, identified, and counted by
   Filter and show, but "Browse a cell" was built once, at load, before the added cells arrived, and
   never again: absorbAddedNuclei() told the filter dropdown the range had moved and not this one.

   Run: node ljaddedcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**accounts.google.com/**", "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**", "**amazonaws.com/**", "**gstatic.com/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", async route => {
    const u = new URL(route.request().url()), H = { "Access-Control-Allow-Origin": "*" };
    /* The added cells arrive a moment after the page is up, as they do live. */
    if (u.searchParams.get("newCells")){
      await new Promise(r => setTimeout(r, 1500));
      return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ newCells: [
        { coord: "101409,86471,348", identified: "Microglia", reporterName: "S", comment: "", timestamp: "2026-09-21T20:13:09Z" },
        { coord: "102833,23184,348", identified: "Astrocyte", reporterName: "S", comment: "", timestamp: "2026-09-09T20:34:08Z" } ] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: H,
      body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [], rows: [] }) });
  });
  await p.goto("file://" + page_("ljump.html"));
  await p.waitForTimeout(6000);
  const got = await p.evaluate(() => ({
    added: typeof BADDED !== "undefined" ? BADDED.filter(Boolean).length : -1,
    names: (function(){ const out = []; for (let i = N_DET; i < N; i++) out.push(ljumpIdentityOf(i)); return out; })(),
    opts: [...document.querySelectorAll("#randomTypeSelect option")].map(o => o.textContent),
    uncl: (document.getElementById("unclCount") || {}).textContent }));
  ok(got.added === 2, "the two added cells are in the arrays", got.added);
  ok(got.names.join(",") === "Microglia,Astrocyte", "...identified", got.names.join(","));
  ok(got.opts.some(o => /^Microglia \(1\)/.test(o)) && got.opts.some(o => /^Astrocyte \(1\)/.test(o)),
     "\"Browse a cell\" lists them", got.opts.join(" | "));
  ok(/^488 cells nobody/.test(got.uncl || ""), "...and the unidentified count is still the 488 detections", got.uncl);
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
