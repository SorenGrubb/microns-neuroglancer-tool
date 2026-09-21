/* A save that did not go through says so, on every tool.                             2026-09-21

   Søren chose these two from the list: signed-out submissions that were not refused before they
   went out, and error text that was not red. Checked on each page:

     signed out   the bulk card sends NOTHING, says why (an alert naming sign-in), and leaves
                  Submit live with the rows still there;
     refused      signed in, but the backend answers {ok:false} -- the bulk card does not say
                  "Thanks", says what the server said, and Submit is live again (on the tools whose
                  postReport answers with a promise; µJump's family reports each post in a toast);
                  a tracing the backend refused goes back on the queue that sends it later;
     red          every colour token the page and the core files it loads use is defined, in both
                  themes, and var(--bad) is actually red.

   Run: node refusedsavecheck.js [page.html]        (default ujump.html) */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [], dialogs = [], posts = [];
  let REFUSE = false;
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  for (const h of ["**accounts.google.com/**", "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**",
                   "**gstatic.com/**", "**amazonaws.com/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", route => {
    const req = route.request();
    if (req.method() === "POST"){
      let body = {}; try { body = JSON.parse(req.postData()); } catch (e){}
      posts.push(body);
      return route.fulfill({ status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(REFUSE ? { ok: false, error: "the deployment does not know this type — re-paste Code.gs." } : { ok: true }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
                           body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [] }) });
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);

  /* One ticked row, as "Find the cells" leaves it -- the reading of the segmentation is
     bulkorgancheck's business; this is about what happens when it is sent. */
  const arm = () => p.evaluate(() => {
    const det = document.getElementById("bulkOrganPanel"); if (det) det.open = true;
    BULK_ORGAN_ROWS = [{ kind: "mitochondria", a: [100, 200, 30], b: null, use: true, cellKey: "nuc:5",
                         rootId: "0", nucleusId: 5, i: -1, via: "point A", note: "", warn: "", distNm: 0 }];
    bulkOrganRender();
    document.getElementById("bulkOrganThanks").innerHTML = "";
    const s = document.getElementById("bulkOrganSubmit"); s.disabled = false; s.textContent = "Submit";
  });
  const state = () => p.evaluate(() => ({
    thanks: document.getElementById("bulkOrganThanks").textContent,
    live: !document.getElementById("bulkOrganSubmit").disabled,
    rows: BULK_ORGAN_ROWS.length,
    colour: (function(){ const f = document.querySelector("#bulkOrganThanks .idf-flag"); return f ? getComputedStyle(f).color : ""; })()
  }));

  /* λJump has no bulk card -- Lee16 has no segmentation to find a marker's cell in (2026-09-21,
     bulk-annotation-on-every-tool). Its tracing card is still checked. */
  const hasBulk = await p.evaluate(() => typeof bulkOrganRender === "function" && !!document.getElementById("bulkOrganSubmit"));
  if (!hasBulk) console.log(PAGE + "\n\n(no bulk card on this tool)");
  if (hasBulk){
  console.log(PAGE + "\n\nsigned out");
  await p.evaluate(() => { try { GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = null; } catch (e){} });
  await arm();
  await p.evaluate(() => document.getElementById("bulkOrganSubmit").click());
  await p.waitForTimeout(800);
  const s1 = await state();
  ok(posts.filter(x => x.type === "organelle_location").length === 0, "nothing is sent", posts.length + " POST(s)");
  ok(dialogs.length >= 1 && /sign in/i.test(dialogs[dialogs.length - 1] || ""), "...the page says to sign in",
     (dialogs[dialogs.length - 1] || "no alert").slice(0, 70));
  ok(s1.live && s1.rows === 1 && !/Thanks/.test(s1.thanks), "...and Submit is live, the rows still there", JSON.stringify(s1).slice(0, 90));

  console.log("\nsigned in, and the backend refuses");
  await p.evaluate(() => {
    try { GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok"; } catch (e){}
    try { if (typeof GOOGLE_EXP !== "undefined") GOOGLE_EXP = 0; } catch (e){}
    /* ωJump keeps its credential in its own store. */
    try { if (window.UJ && UJ.app && UJ.app.setCredential) UJ.app.setCredential("tok", "a@b.c", 0); } catch (e){}
  });
  REFUSE = true;
  await arm();
  dialogs.length = 0; posts.length = 0;
  await p.evaluate(() => document.getElementById("bulkOrganSubmit").click());
  await p.waitForTimeout(2500);
  const s2 = await state();
  const promised = await p.evaluate(() => { const x = postReport({ type: "ping" }); return !!(x && typeof x.then === "function"); });
  await p.waitForTimeout(800);
  ok(posts.some(x => x.type === "organelle_location"), "the row is sent", posts.length + " POST(s)");
  if (promised){
    ok(!/Thanks/.test(s2.thanks) && /did not/.test(s2.thanks) && /re-paste Code\.gs/.test(s2.thanks),
       "no \"Thanks\" — it says it did not reach the sheet, and why", s2.thanks.slice(0, 110));
    ok(s2.live, "...and Submit is live again", s2.live);
    ok(/^rgb\((2[0-9]{2}|1[6-9][0-9]),\s*([0-9]{1,2}|1[0-2][0-9]),/.test(s2.colour), "...in red", s2.colour);
  } else ok(true, "(this tool's postReport reports each post in its own toast)");
  }
  await p.evaluate(() => {
    try { GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok"; } catch (e){}
    try { if (typeof GOOGLE_EXP !== "undefined") GOOGLE_EXP = 0; } catch (e){}
    /* ωJump keeps its credential in its own store. */
    try { if (window.UJ && UJ.app && UJ.app.setCredential) UJ.app.setCredential("tok", "a@b.c", 0); } catch (e){}
  });
  REFUSE = true;
  const promised2 = await p.evaluate(() => { const x = postReport({ type: "ping" }); return !!(x && typeof x.then === "function"); });
  if (promised2){

    console.log("\na refused tracing goes back on the queue");
    const t = await p.evaluate(async () => {
      const t = { id: "chk_1", name: "Lysosome 1", kind: "lysosome", type: "", color: "#ff0000",
                  nucleus_id: "5", root_id: "", rings: [{ z: 3, points: [[1, 1], [9, 1], [9, 9]], inst: 0 }] };
      TRACINGS_KEPT.push(t);
      const went = tracingPublish(t);
      const before = t.pending_share;
      await new Promise(r => setTimeout(r, 1500));
      return { went, before, after: t.pending_share,
               say: (document.getElementById("tracingSay") || document.getElementById("tracingMsg") || { textContent: "" }).textContent };
    });
    ok(t.went && t.before === false && t.after === true, "sent, refused, and queued again", JSON.stringify(t).slice(0, 80));
  }

  console.log("\nred is red, and every colour is defined");
  /* Every var(--x) with no fallback, in the page and in the core files it loads. */
  const html = fs.readFileSync(page_(PAGE), "utf8");
  const srcs = [...html.matchAll(/<script src="(core\/[^"]+)"/g)].map(m => m[1]);
  let all = html; for (const s of srcs){ try { all += fs.readFileSync(require("path").join(require("path").dirname(page_(PAGE)), s), "utf8"); } catch (e){} }
  const used = [...new Set([...all.matchAll(/var\(--([\w-]{2,})\s*\)/g)].map(m => m[1]))];
  for (const theme of ["dark", "light"]){
    const missing = await p.evaluate(([used, theme]) => {
      document.documentElement.setAttribute("data-theme", theme);
      const cs = getComputedStyle(document.documentElement);
      return used.filter(n => !cs.getPropertyValue("--" + n).trim());
    }, [used, theme]);
    ok(missing.length === 0, "every token used is defined in the " + theme + " theme", missing.join(", ") || used.length + " tokens");
  }
  const bad = await p.evaluate(() => { const e = document.createElement("span"); e.style.color = "var(--bad)"; document.body.appendChild(e);
    const c = getComputedStyle(e).color; e.remove(); return c; });
  ok(/^rgb\((2[0-9]{2}|1[6-9][0-9]),\s*([0-9]{1,2}|1[0-2][0-9]),/.test(bad), "var(--bad) is red", bad);
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
