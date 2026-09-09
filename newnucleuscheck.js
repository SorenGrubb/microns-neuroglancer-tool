/* A missed nucleus is a cell you can name, and find again.                         2026-09-09

   Søren: "I tried to report a missing nucleus and suggested it was an astrocyte, but it did not
   show up as a new nucleus nor an astrocyte."

   His actual row, read from the live backend before anything was written:

     ?newCells=1&ds=ljump -> {"coord":"102833,23184,348","identified":"","comment":"Astrocyte",
                              "reporterName":"Søren Grubb","timestamp":"2026-09-09T20:34:08.503Z"}

   — which is the whole bug in one line: the word went into `comment` because the form had no
   identity field, and λJump never read the list back at all. That row is the fixture below.

   THE REAL PAGE IN A REAL BROWSER, with only the network stubbed.

   Run: node newnucleuscheck.js  */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => { console.log((c ? "PASS " : "*** FAIL *** ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

const HIS_ROW = { coord: "102833,23184,348", rootId: "", nucRootId: "", identified: "",
                  reporterName: "Søren Grubb", comment: "Astrocyte", certainty: "",
                  timestamp: "2026-09-09T20:34:08.503Z" };
const NEW_CELLS = [
  HIS_ROW,
  { coord: "50000,50000,200", identified: "Microglia", reporterName: "Hesham",
    comment: "", timestamp: "2026-09-08T10:00:00.000Z" },
  /* Unreadable coordinate: cannot be jumped to or matched, so it must be dropped rather than
     counted — otherwise the number on screen is bigger than the list under it. */
  { coord: "not a coordinate", identified: "Pericyte", reporterName: "x", timestamp: "2026-09-07" }
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errs = [], posts = [];
  p.on("pageerror", e => errs.push(String((e && e.stack) || e).split("\n")[0]));
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**script.google.com/**", route => {
    const req = route.request();
    if (req.method() === "POST") {
      posts.push(req.postData() || "");
      return route.fulfill({ status: 200, contentType: "application/json",
                             body: JSON.stringify({ ok: true }) });
    }
    const url = req.url();
    if (/newCells=1/.test(url))
      return route.fulfill({ status: 200, contentType: "application/json",
                             body: JSON.stringify({ newCells: NEW_CELLS }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await p.goto("file://" + page_("ljump.html"));
  await p.waitForTimeout(2200);
  ok(errs.length === 0, "page loads with no JS error", errs[0] || "clean");

  /* The list has to be reachable before anybody has jumped anywhere — it lives in the panel, so
     land on a detection first, which is what a user does. */
  await p.evaluate(() => { if (typeof showCell === "function") showCell(0, 0); });
  await p.waitForTimeout(400);

  /* ── the form asks what it is ──────────────────────────────────────────────────────────── */
  const sel = await p.evaluate(() => {
    const s = document.getElementById("newnucid");
    if (!s) return null;
    return { n: s.options.length,
             hasBlankFirst: s.options[0] && s.options[0].value === "",
             names: Array.from(s.options).map(o => o.value) };
  });
  ok(!!sel, "the missed-nucleus form has an identity picker");
  ok(sel && sel.n > 20, "...populated from the shared ontology", sel && sel.n + " options");
  ok(sel && sel.hasBlankFirst, "...with an optional blank, so it does not force a guess");
  ok(sel && sel.names.indexOf("Astrocyte") >= 0, "...and Astrocyte is one of them");

  /* ── the identity is actually submitted ────────────────────────────────────────────────── */
  await p.evaluate(() => {
    try { GOOGLE_VERIFIED = true; } catch (e) { window.GOOGLE_VERIFIED = true; }
    try { GOOGLE_CREDENTIAL = "test"; } catch (e) {}
    document.getElementById("newnuccoord").value = "1000, 2000, 30";
    document.getElementById("newnucid").value = "Astrocyte";
    document.getElementById("newnuccomment").value = "small, dark";
    document.getElementById("fixnew").click();
  });
  await p.waitForTimeout(700);
  const sent = posts.map(s => { try { return JSON.parse(s); } catch (e) { return {}; } })
                    .filter(o => o.type === "new_cell_no_nucleus")[0];
  ok(!!sent, "clicking Add sends a new_cell_no_nucleus report", posts.length + " post(s)");
  ok(sent && sent.identified === "Astrocyte",
     "...carrying the identity, which is the whole bug", sent && JSON.stringify(sent.identified));
  ok(sent && sent.comment === "small, dark",
     "...and the comment still means what it always meant", sent && sent.comment);
  ok(sent && sent.coord === "1000,2000,30", "...at the coordinate typed", sent && sent.coord);

  /* ── they are findable ─────────────────────────────────────────────────────────────────── */
  const list = await p.evaluate(() => {
    const h = document.getElementById("newnuclist");
    return h ? { text: h.textContent.replace(/\s+/g, " ").trim(),
                 links: Array.from(h.querySelectorAll(".newnucjump")).map(a => a.textContent) } : null;
  });
  ok(!!list, "the form lists the nuclei already added");
  /* Two from the fixture plus the one just submitted; the unreadable one is not counted. */
  ok(list && list.links.length === 3, "...every readable one, and the just-submitted one",
     list && list.links.join(" | "));
  ok(list && list.text.indexOf("Pericyte") < 0,
     "...and a row with an unreadable coordinate is dropped, not counted");
  ok(list && /Astrocyte/.test(list.text),
     "...showing what each one is (his went in as a comment, so that is what shows for it)");

  /* ── jumping lands on the added nucleus, not on a detection ────────────────────────────── */
  const jumped = await p.evaluate(() => {
    document.getElementById("x").value = "102833";
    document.getElementById("y").value = "23184";
    document.getElementById("z").value = "348";
    document.getElementById("go").click();
    const panel = document.getElementById("panel");
    return panel ? panel.textContent.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  });
  ok(/added by the community/i.test(jumped),
     "jumping to his coordinate finds the nucleus he added", jumped.slice(0, 80) + "…");
  ok(/no detection of its own/i.test(jumped),
     "...and the panel says it was not measured by the detector");
  ok(/Søren Grubb/.test(jumped), "...and who added it", "attributed");

  /* A coordinate ON a real detection must still land on the detection. Read from the page's own
     arrays rather than typed here: a hand-picked coordinate is only a guess about where the
     detections are, and the first version of this check guessed (1,1,1), which is outside the
     tissue entirely and genuinely IS nearer an added nucleus. */
  const detection = await p.evaluate(() => {
    document.getElementById("x").value = String(BX[0]);
    document.getElementById("y").value = String(BY[0]);
    document.getElementById("z").value = String(BZ[0]);
    document.getElementById("go").click();
    return document.getElementById("panel").textContent.replace(/\s+/g, " ").trim().slice(0, 120);
  });
  ok(!/added by the community/i.test(detection),
     "a coordinate nearer a real detection still shows the detection", detection.slice(0, 70) + "…");

  await b.close();
  console.log(fails ? "\nRESULT: " + fails + " FAILED" : "\nRESULT: ALL CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})();
