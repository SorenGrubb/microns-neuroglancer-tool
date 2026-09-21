/* λJump's bulk organelle card: a marker goes to the nearest nucleus, and you confirm it.   2026-09-21

   Søren: "Let's build the ljump cell nucleus marker." Lee16 is image only -- no segmentation, no
   nucleus volume -- so the ladder's three segmentation rungs have nothing to read, and the card was
   left off λJump. It has what ωJump's volumes without a segmentation have: a table of nucleus
   positions. So a marker goes to the nearest nucleus within 10 µm, offered UNTICKED with its
   distance (evidence, not proof), and not at all when a second nucleus is nearly as close.

   Checked against the page's own table, with the expected answer worked out here independently:

     - the card is on the page, under the cell card, and says how it finds a cell here;
     - a marker 2 µm from a nucleus: that nucleus, unticked, "2.0 µm away";
     - a marker halfway between two close nuclei: "too close to call", not tickable;
     - a marker with no nucleus within 10 µm: listed with its reason, not tickable;
     - ticked by hand and submitted, signed in: filed under the nucleus id, at the nucleus's voxel,
       with no segment -- the ids λJump's own identifications use.

   Run: node ljbulkcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [], posts = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => d.dismiss());
  for (const h of ["**accounts.google.com/**", "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**",
                   "**gstatic.com/**", "**amazonaws.com/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", route => {
    const req = route.request();
    if (req.method() === "POST"){ try { posts.push(JSON.parse(req.postData())); } catch (e){}
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: '{"ok":true}' }); }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
                           body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [] }) });
  });
  await p.goto("file://" + page_("ljump.html"));
  await p.waitForTimeout(4000);

  console.log("the card");
  const m = await p.evaluate(() => {
    const k = document.getElementById("bulkOrganCard"), t = document.getElementById("tracingCard");
    return { card: !!(k && k.querySelector("#bulkOrganResolve")),
             before: !!(k && t && (k.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)),
             intro: k ? k.querySelector("p.hint").textContent : "" };
  });
  ok(m.card, "the bulk organelle card is on λJump");
  ok(m.before, "...in the same place as on the other tools, above the tracing card");
  ok(/nearest nucleus/.test(m.intro) && !/looked up in the segmentation/.test(m.intro),
     "...and says how it finds a cell here: the nearest nucleus, not a segmentation", m.intro.slice(0, 90));

  /* Worked out here, not by the page: a nucleus, its nearest neighbour, and a far-off point. */
  const plan = await p.evaluate(() => {
    const r = UJ.cfg.res, pos = i => [BX[i], BY[i], BZ[i]];
    const dist = (a, c) => Math.sqrt(((a[0] - c[0]) * r[0]) ** 2 + ((a[1] - c[1]) * r[1]) ** 2 + ((a[2] - c[2]) * r[2]) ** 2);
    const nearestTo = q => { let bi = -1, bd = Infinity, sd = Infinity;
      for (let i = 0; i < N; i++){ const d = dist(q, pos(i)); if (d < bd){ sd = bd; bd = d; bi = i; } else if (d < sd) sd = d; }
      return { i: bi, d: bd, second: sd }; };
    /* A nucleus whose neighbour is 8-18 µm away: close enough to make the midpoint ambiguous. */
    let A = -1, B = -1;
    for (let i = 0; i < N && A < 0; i++){
      for (let j = 0; j < N; j++){ if (i === j) continue; const d = dist(pos(i), pos(j));
        if (d > 8000 && d < 18000 && nearestTo(pos(i)).second >= d - 1){ A = i; B = j; break; } }
    }
    /* 2 µm from A along x, and A still the nearest by a clear margin. */
    const near = [BX[A] + 2000 / r[0], BY[A], BZ[A]];
    const mid = [(BX[A] + BX[B]) / 2, (BY[A] + BY[B]) / 2, (BZ[A] + BZ[B]) / 2];
    /* Far: step away from A until nothing is within 10 µm. */
    let far = null;
    for (let k = 1; k < 400 && !far; k++){ const q = [BX[A] + k * 2500 / r[0], BY[A] + k * 2500 / r[1], BZ[A]];
      if (nearestTo(q).d > 12000) far = q; }
    return { A, B, bid: String(BID[A]), coord: pos(A).join(","), near, mid, far,
             nearD: nearestTo(near), res: r.join(",") };
  });
  ok(plan.A >= 0 && plan.far && plan.nearD.i === plan.A, "a nucleus, a close neighbour and an empty spot were found in the table",
     "nucleus " + plan.bid + " at " + plan.coord + ", res " + plan.res);

  console.log("\nthree markers");
  const got = await p.evaluate(async (pts) => {
    const det = document.getElementById("bulkOrganPanel"); if (det) det.open = true;
    document.getElementById("bulkOrganKind").value = "mitochondria";
    document.getElementById("bulkOrganLink").value = "https://x/#!" + encodeURIComponent(JSON.stringify({ layers: [
      { type: "annotation", name: "m", source: "local://annotations",
        annotations: pts.map((q, i) => ({ type: "point", id: "p" + i, point: q })) }] }));
    await bulkOrganFindCells();
    return { rows: BULK_ORGAN_ROWS.map(r => ({ i: r.i, key: r.cellKey, use: r.use, warn: r.warn })),
             boxes: [...document.querySelectorAll("#bulkOrganTable input[type=checkbox]")].map(c => c.disabled ? "x" : c.checked ? "on" : "off"),
             status: document.getElementById("bulkOrganStatus").textContent };
  }, [plan.near, plan.mid, plan.far]);
  ok(got.rows[0].i === plan.A && got.boxes[0] === "off" && /2\.0 µm away/.test(got.rows[0].warn),
     "2 µm from a nucleus: that nucleus, unticked, with the distance", got.rows[0].warn);
  ok(got.boxes[1] === "x" && /too close to call/.test(got.rows[1].warn),
     "halfway between two: not tickable", got.rows[1].warn);
  ok(got.boxes[2] === "x" && /no nucleus found within 10 µm/.test(got.rows[2].warn),
     "nothing within 10 µm: listed with its reason", got.rows[2].warn);
  ok(!/segmentation/.test(got.status), "...and the status does not claim to read a segmentation", got.status);

  console.log("\nticked by hand, and sent");
  await p.evaluate(() => { GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok"; try { GOOGLE_EXP = 0; } catch (e){}
    const cb = document.querySelector("#bulkOrganTable input.bulkorgpick"); cb.checked = true; cb.dispatchEvent(new Event("change"));
    document.getElementById("bulkOrganSubmit").click(); });
  await p.waitForTimeout(1500);
  const sent = posts.filter(x => x.type === "organelle_location");
  const thanks = await p.evaluate(() => document.getElementById("bulkOrganThanks").textContent);
  ok(sent.length === 1 && String(sent[0].nucleusId) === plan.bid && sent[0].coord === plan.coord && !sent[0].rootId,
     "filed under the nucleus id, at its voxel, with no segment", JSON.stringify(sent[0] || {}).slice(0, 150));
  ok(sent.length === 1 && sent[0].ds === "ljump", "...into λJump's own sheet", sent[0] && sent[0].ds);
  ok(/Thanks/.test(thanks), "...and the card says so once the sheet has answered", thanks.slice(0, 60));
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
