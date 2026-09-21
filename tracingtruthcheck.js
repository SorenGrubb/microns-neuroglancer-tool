/* The card says what is true about where a tracing is.                              2026-09-21

   Søren, looking at πJump's card: "What is the purpose of the 'with cell and nucleus see through'
   tick down there? I understand that it is needed with the 3D view above. also, why is only one of
   the lysosomes shown in the dataset?"

   Three lysosomes said "in the dataset"; the dataset had one. The backend lost two rows to a race on
   a tab that did not exist yet (backend/gs_harness_race.js) -- and the card could not tell,
   because on µJump, δJump and πJump postReport answered `true` before the server had answered at
   all. Checked here:

     THE ANSWER    postReport hands back the server's answer (a promise), so a refused tracing goes
                   back on the queue on these three tools as it already did on the others;
     THE INDEX     a kept tracing marked "in the dataset" that the dataset does not have is put back
                   on the queue when the dataset's list is read -- which is what repairs the two
                   lysosomes already lost. One sent in the last minute is left alone: its row may
                   not be readable yet.
     THE TICK      "with the cell and nucleus, see-through" under the kept tracings belongs to the 3D
                   preview of a PASTED link. It is shown only when the contours in hand came from a
                   pasted link; for contours from the pad, the pad's own tick above is the one.

   Run: node tracingtruthcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [], posts = [];
  let INDEX = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => d.dismiss());
  for (const h of ["**accounts.google.com/**", "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**",
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
    if (u.searchParams.get("tracings"))
      return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ tracings: INDEX }) });
    return route.fulfill({ status: 200, contentType: "application/json", headers: H,
                           body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [] }) });
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);
  const has = await p.evaluate(() => typeof tracingRenderList === "function" && !!document.getElementById("tracingList"));
  if (!has){ console.log(PAGE + ": no tracing card"); await b.close(); console.log("\nall good"); process.exit(0); }
  const scope = await p.evaluate(() => (typeof tracingScope === "function" && tracingScope()) || "");
  const N = scope ? scope + ":13829" : "13829";
  await p.evaluate(() => {
    try { GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok"; REPORTER_NAME = "S"; } catch (e){}
    try { if (typeof GOOGLE_EXP !== "undefined") GOOGLE_EXP = 0; } catch (e){}
    try { if (window.UJ && UJ.app && UJ.app.setCredential) UJ.app.setCredential("tok", "a@b.c", 0); } catch (e){}
  });

  console.log(PAGE + "\n\nthe answer");
  const promised = await p.evaluate(() => { const x = postReport({ type: "ping" }); return !!(x && typeof x.then === "function"); });
  ok(promised, "postReport hands back the server's answer, so the card can hear a refusal", promised);

  console.log("\nthe index");
  const old = "2026-09-21T20:05:42.917Z";
  INDEX = [{ structureId: "lys__i1", name: "Lysosome 2", nucleusId: N, rootId: "648518346349530654" }];
  const rec = await p.evaluate(async ([N, old]) => {
    const ring = z => ({ z, points: [[1, 1], [9, 1], [9, 9]] });
    TRACINGS_KEPT = [
      { id: "lys", name: "Lysosome 1", kind: "lysosome", nucleus_id: N, rings: [ring(1), ring(2)], pending_share: false, shared_at: old },
      { id: "lys__i1", name: "Lysosome 2", kind: "lysosome", nucleus_id: N, rings: [ring(1), ring(2)], pending_share: false, shared_at: old },
      { id: "lys__i2", name: "Lysosome 3", kind: "lysosome", nucleus_id: N, rings: [ring(1), ring(2)], pending_share: false, shared_at: old },
      { id: "fresh", name: "Lysosome 4", kind: "lysosome", nucleus_id: N, rings: [ring(1), ring(2)], pending_share: false,
        shared_at: new Date().toISOString() } ];
    tracingWrite(TRACINGS_KEPT); tracingRenderList();
    window.__flushes = 0;
    const realFlush = window.tracingFlushSoon; window.tracingFlushSoon = function(){ window.__flushes++; };
    await tracingBrowse();
    await new Promise(r => setTimeout(r, 300));
    window.tracingFlushSoon = realFlush;
    const byId = {}; TRACINGS_KEPT.forEach(t => byId[t.id] = t.pending_share);
    return { byId, flushes: window.__flushes,
             waiting: document.getElementById("tracingList").textContent.split("waiting for sign-in").length - 1 };
  }, [N, old]);
  ok(rec.byId.lys === true && rec.byId.lys__i2 === true, "the two the dataset does not have go back on the queue", JSON.stringify(rec.byId));
  ok(rec.byId.lys__i1 === false, "...the one it has stays in the dataset", rec.byId.lys__i1);
  ok(rec.byId.fresh === false, "...and one sent in the last minute is left alone -- its row may not be readable yet", rec.byId.fresh);
  ok(rec.flushes > 0, "...and the queue is asked to send them", rec.flushes);

  console.log("\nthe tick");
  const tick = await p.evaluate(() => {
    const row = () => { const t = document.getElementById("tracingPasteGhosts");
      const l = t && (t.closest("label") || t); return l ? getComputedStyle(l).display !== "none" : null; };
    const ring = (z, inst) => ({ z, inst: inst || 0, points: [[1000, 2000], [1060, 2000], [1030, 2060]] });
    /* From the pad: its contours are on the pad and in hand. */
    PAD = UJ.tracepad.create(); PAD.rings = [ring(5), ring(6)];
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD) };
    document.getElementById("tracingFound").style.display = "";
    tracingEachRender(true);
    const fromPad = row();
    /* From a pasted link: contours in hand, nothing on the pad. */
    PAD.rings = [];
    TRACING_PENDING = { rings: [ring(5), ring(6)] };
    tracingEachRender(true);
    const fromPaste = row();
    return { fromPad, fromPaste };
  });
  if (tick.fromPad === null) ok(true, "(no see-through tick on this tool -- it has no meshes)");
  else {
    ok(tick.fromPad === false, "contours from the pad: the lower tick is not shown -- the pad's own is the one", tick.fromPad);
    ok(tick.fromPaste === true, "contours from a pasted link: it is, beside the preview it controls", tick.fromPaste);
  }

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
