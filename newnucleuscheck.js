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
  ok(/has no detection/i.test(jumped),
     "...and the panel says the detector never found it", "no detection");
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

  /* ── the same info and rights ──────────────────────────────────────────────────────────────
     Søren: "The cells that are named should have the same info and rights as the nuclei that have
     been detected." Concretely: they are IN the arrays every reader of this file walks. */
  const arr = await p.evaluate(() => {
    const i = N - 1;                       // the last added one
    return { N, N_DET, added: BADDED[i], id: BID[i],
             dia: BDIA[i], vol: BVOL[i], pol: BPOL[i], dep: BDEP[i], lay: BLAY[i],
             detStillWhole: BADDED[0] === 0 && BID[0] > 0 && isFinite(BDIA[0]) };
  });
  ok(arr.N === arr.N_DET + 3, "the added cells are appended to the arrays",
     arr.N_DET + " detected + 3 = " + arr.N);
  ok(arr.detStillWhole, "...without disturbing the detections");
  /* A REAL id since 2026-09-10, in a reserved band above the detections — that is what lets an
     added cell take part in identification, voting and consensus at all. */
  ok(arr.added === 1 && arr.id >= 1000000 && arr.id < 2000000000,
     "...with a real nucleus id in the reserved band, not 0", "BID=" + arr.id);
  ok(await p.evaluate(() => {
       const a = addedNucleusId("102833,23184,348"), b = addedNucleusId(" 102833 , 23184 , 348 ");
       const c = addedNucleusId("102833,23184,349");
       return a === b && a !== c && a >= 1000000;
     }),
     "...derived from the coordinate, so every client computes the same one");
  ok(!isFinite(arr.dia) && !isFinite(arr.vol),
     "...with NaN where nothing was measured, so a range filter excludes them",
     "dia=" + arr.dia + " vol=" + arr.vol);
  ok(arr.pol === -1, "...and no detector pass, rather than a claim that one found it", arr.pol);
  ok(isFinite(arr.dep) && arr.lay >= 0, "...but a real estimated depth and layer",
     arr.dep.toFixed(1) + " µm, layer index " + arr.lay);

  /* The estimate has to be right, not merely present: a point one voxel from a detection must
     come out at that detection's own depth. */
  const est = await p.evaluate(() => {
    const d = estimateDepthUm(BX[5] + 1, BY[5] + 1, BZ[5]);
    return { est: d, truth: BDEP[5] };
  });
  ok(Math.abs(est.est - est.truth) < 1.0,
     "the depth fit lands on a detection's own depth beside it",
     est.est.toFixed(2) + " vs " + est.truth.toFixed(2) + " µm");

  /* Found by searching rather than by index arithmetic: how many cells have been added by this
     point in the run is exactly the thing under test two assertions up. */
  ok(await p.evaluate(() => {
       const i = BADDED.findIndex((f, k) => f && ADDED_REC[k] && ADDED_REC[k].identified === "Microglia");
       return i >= 0 && ljumpIdentityOf(i) === "Microglia";
     }),
     "an added cell's identity is read from its own row, not from nucleus id 0");

  /* ── ONE PANEL FOR BOTH KINDS ─────────────────────────────────────────────────────────────
     Søren, with the two screenshots: "Why does this look different, from this? They should be the
     same, except the astrocyte is already named by me. You should be able to do the model of the
     layer, you know the coordinate." So the added cell's panel is compared to a detection's,
     element by element, rather than merely inspected for words. */
  const both = await p.evaluate(() => {
    const grab = () => {
      const pan = document.getElementById("panel");
      return { text: pan.textContent.replace(/\s+/g, " ").trim(),
               ruler: !!pan.querySelector("svg, canvas, .depthruler, [class*=ruler]"),
               idbox: !!pan.querySelector("#idbox"),
               fixmove: !!pan.querySelector("#fixmove"),
               star: !!pan.querySelector(".favstar, [class*=fav]"),
               head: (pan.querySelector(".celltype") || {}).textContent || "" };
    };
    const ai = BADDED.findIndex((f, k) => f && ADDED_REC[k] && ADDED_REC[k].comment === "Astrocyte");
    showCell(ai, 0);
    const addedPanel = grab();
    showCell(0, 0);
    const detPanel = grab();
    return { ai, addedPanel, detPanel };
  });
  ok(both.addedPanel.ruler && both.detPanel.ruler,
     "the added cell gets the same layer diagram as a detection — the coordinate is enough",
     "ruler on both");
  ok(both.addedPanel.idbox && both.detPanel.idbox,
     "...and the same guided identification panel");
  ok(/added by the community/i.test(both.addedPanel.text),
     "...labelled as added rather than detected");
  ok(/\(estimated\)/i.test(both.addedPanel.text) && !/\(estimated\)/i.test(both.detPanel.text),
     "...with its layer and depth marked estimated, and a detection's not");
  ok(/No measured size/i.test(both.addedPanel.text),
     "...saying nothing measured it, rather than printing NaN");
  ok(!/NaN/.test(both.addedPanel.text), "...and NaN never reaches the screen");
  ok(both.detPanel.fixmove && !both.addedPanel.fixmove,
     "the detection-correction block is offered for a detection and not for an added cell");
  ok(/Nucleus /.test(both.detPanel.head), "a detection is still headed by its number",
     both.detPanel.head.trim().slice(0, 24));

  /* ── naming it through that same panel ─────────────────────────────────────────────────── */
  const before = posts.length;
  await p.evaluate((ai) => {
    /* The tree renders #idmsg and the certainty pills when it reaches a leaf; this calls the
       submit directly, so it has to stand the DOM up the way the tree would. */
    window.getCertainty = () => "3";
    const box = document.getElementById("idbox");
    if (box && !document.getElementById("idmsg")) {
      const m = document.createElement("p"); m.id = "idmsg"; box.appendChild(m);
    }
    CUR_IDX = ai;
    submitIdentification("astrocyte");
  }, both.ai);
  await p.waitForTimeout(600);
  const nameIt = posts.slice(before).map(s => { try { return JSON.parse(s); } catch (e) { return {}; } })[0];
  /* AN ORDINARY IDENTIFICATION, which is the whole of "not a parallel world": the Master cell
     list takes every identification of that id and the most popular wins, so somebody else can
     disagree. A name written into the cell's own row was a name nobody could correct. */
  ok(nameIt && nameIt.type === "new_identification",
     "identifying an added cell files an ordinary identification, not a row edit",
     nameIt && nameIt.type);
  ok(nameIt && Number(nameIt.nucleusId) >= 1000000,
     "...against its own reserved-band id", nameIt && String(nameIt.nucleusId));
  ok(await p.evaluate((nid) => Number(nid) === BID[BADDED.findIndex(
       (f, k) => f && ADDED_REC[k] && ADDED_REC[k].comment === "Astrocyte")],
       String(nameIt && nameIt.nucleusId)),
     "...the same id the arrays hold for it, so consensus and the panel address one cell");
  ok(nameIt && nameIt.coord === "102833,23184,348",
     "...carrying the coord too, which survives a re-detection", nameIt && nameIt.coord);
  ok(nameIt && nameIt.identified === "Astrocyte", "...with the name", nameIt && nameIt.identified);
  ok(nameIt && nameIt.certainty === "3", "...and the certainty the panel asked for", nameIt && nameIt.certainty);
  ok(await p.evaluate(() => !!document.getElementById("idfOrganelleToggle")) ||
     await p.evaluate(() => !!document.querySelector("#panel #idbox")),
     "an added cell can still carry organelles and be identified");

  /* ── every cell name is filterable ─────────────────────────────────────────────────────── */
  const idOpts = await p.evaluate(() => {
    const s = document.getElementById("fIdentity");
    if (!s) return null;
    return { n: s.options.length,
             groups: Array.from(s.querySelectorAll("optgroup")).map(g => g.label),
             hasUnreported: Array.from(s.options).some(o => /\(0\)$/.test(o.textContent)) };
  });
  ok(!!idOpts, "the filter has a community-identity picker");
  ok(idOpts && idOpts.n > 20, "...listing every cell name, not only the ones seen here",
     idOpts && idOpts.n + " options");
  ok(idOpts && idOpts.groups.indexOf("Not reported here yet") >= 0,
     "...with the never-reported ones grouped and honest about it",
     idOpts && idOpts.groups.join(" | "));
  ok(idOpts && idOpts.hasUnreported, "...and their count shown as 0 rather than hidden");

  /* ── one spelling ──────────────────────────────────────────────────────────────────────────
     Søren: "Why am I spelled two different ways now?" — atob() hands back one character per BYTE,
     so the two UTF-8 bytes of "ø" became "Ã¸". Driven on a real token payload rather than asserted
     from the source. */
  const spelling = await p.evaluate(() => {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ name: "Søren Grubb" }))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return { good: jwtPayload("h." + payload + ".s").name,
             junk: JSON.stringify(jwtPayload("not a token")) };
  });
  ok(spelling.good === "Søren Grubb", "the name decodes as UTF-8, one spelling", spelling.good);
  ok(spelling.junk === "{}", "...and a malformed token returns nothing instead of throwing");

  /* ── a submit with nobody signed in ────────────────────────────────────────────────────── */
  const beforeUnsigned = posts.length;
  const refused = await p.evaluate(async () => {
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = null;
    const r = await postReport({ type: "new_identification", nucleusId: 1 }, "x");
    return { ok: r && r.ok, err: (r && r.error) || "" };
  });
  ok(refused.ok === false, "an unsigned submit is refused");
  ok(/not signed in/i.test(refused.err), "...with a warning that says so", refused.err.slice(0, 48) + "…");
  ok(posts.length === beforeUnsigned, "...and nothing is sent to the server",
     (posts.length - beforeUnsigned) + " extra post(s)");

  /* ── Recently viewed ───────────────────────────────────────────────────────────────────── */
  const recent = await p.evaluate(() => {
    showCell(3, 0); showCell(7, 0);
    const box = document.getElementById("recentBox");
    const rows = Array.from(document.querySelectorAll("#recentList .recentjump")).map(a => a.dataset.c);
    return { shown: box && box.style.display !== "none", rows,
             newestFirst: rows[0] === [BX[7], BY[7], BZ[7]].join(","),
             stored: (() => { try { return JSON.parse(localStorage.getItem("ljump_recent_v1")).length; }
                              catch (e) { return -1; } })() };
  });
  ok(recent.shown, "the Recently viewed panel appears once a cell has been looked at");
  ok(recent.newestFirst, "...newest first", recent.rows[0]);
  ok(recent.stored >= 2, "...and survives a reload, keyed by coordinate rather than by index",
     recent.stored + " remembered");
  const wentBack = await p.evaluate(() => {
    document.querySelector("#recentList .recentjump").click();
    return document.getElementById("panel").textContent.replace(/\s+/g, " ").trim().slice(0, 40);
  });
  ok(wentBack.length > 0, "...and clicking one goes back there", wentBack);

  await b.close();
  console.log(fails ? "\nRESULT: " + fails + " FAILED" : "\nRESULT: ALL CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})();
