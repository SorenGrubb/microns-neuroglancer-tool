/* ηJump: a cell H01 never listed can be reported, and identified.                     2026-09-24

   Søren: "We need a way to identify new cells in hJump. We have 'Report a new cell' in µJump. I
   want something similar." — and, a moment later: "Also, when putting in a coordinate, when
   clicking on the numbers they should be marked, and also we need a 'Jump to this nucleus', like
   we have for µJump."

   THREE THINGS, AND TWO OF THEM ARE SMALL.

   The jump button already existed on this page — `Jump to this cell ↗`, at the very bottom of the
   panel under the IDs. µJump moved its own up onto the line that names what it jumps to, at his
   request on 2026-09-18 ("Jump to this nucleus should be next to the nearest nucleus at this
   voxel, just after 'from query', but make it look nice"); ηJump never got that move. The noun
   stays this page's own: its cells are somata with a cell_bodies id, not nuclei.

   The coordinate boxes: µJump selects the x box's contents on focus, because that field also
   accepts a pasted triple. All three are worth it, and this page has three.

   AND THE REPORT. H01's cell_bodies list is not the whole volume — this page's own ID search says
   so in as many words: "H01 has 1,917 somata with no cell-type call that are not loaded here". A
   cell you are looking at may be in none of them. µJump's answer is a `new_cell_no_nucleus` row,
   and λJump's adds a derived id so the cell can be identified, voted on and argued about like any
   other. ηJump gets that, plus the one thing neither of them can do: it reads the c3 segment at
   the reported point, so the cell arrives with a real segment id — a mesh, a volume, a highlight.

   WHAT IS ASSERTED:
     - clicking into x, y or z selects what is there
     - the re-centre button is on the line that names the distance from your query
     - ...and pressing it puts that cell's own voxel in the boxes
     - a coordinate with no soma near it offers to report one, and says how far the nearest is
     - a coordinate on a soma does not
     - the form prefills the coordinate and reads the c3 segment at it
     - ...and says so plainly when the segmentation cannot be read
     - sending posts one new_cell_no_nucleus carrying the coordinate and that segment
     - ...and a new_identification when a type was chosen, on an id no cell body in this table has
     - the cell joins the list without a reload
     - ...and can be identified from there, through this page's own identification flow

   Run: node hjnewcellcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });

  let NEWCELLS = [];
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url()), H = { "Access-Control-Allow-Origin": "*" };
    if (u.searchParams.get("newCells"))
      return route.fulfill({ status: 200, contentType: "application/json", headers: H,
                             body: JSON.stringify({ newCells: NEWCELLS }) });
    return route.fulfill({ status: 200, contentType: "application/json", headers: H,
      body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [], rows: [] }) });
  });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**googleapis.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("hjump.html"));
  await p.waitForTimeout(5000);

  /* ── the coordinate boxes ─────────────────────────────────────────────────────────────── */
  console.log("the coordinate boxes");
  const marked = await p.evaluate(async () => {
    const out = {};
    /* The boxes live in a <details> that is shut on load; an input inside a shut one cannot take
       focus, which is a fact about the harness and not about the page. */
    const cp = document.getElementById("coordPanel"); if (cp) cp.open = true;
    for (const id of ["x", "y", "z"]){
      const el = document.getElementById(id);
      el.value = "123456";
      el.focus(); el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
      out[id] = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    }
    return out;
  });
  ok(marked.x && marked.y && marked.z, "clicking into x, y or z selects what is there",
     JSON.stringify(marked));

  /* ── a cell, and the button that re-centres on it ─────────────────────────────────────── */
  const onCell = await p.evaluate(async () => {
    /* A soma this page really has, offset by a little so there is a query distance to name. */
    const i = 0;
    document.getElementById("x").value = HX[i] + 30;
    document.getElementById("y").value = HY[i] + 30;
    document.getElementById("z").value = HZ[i];
    document.getElementById("go").click();
    await new Promise(r => setTimeout(r, 1200));
    const line = [].slice.call(document.querySelectorAll("#nucpanel .meta"))
      .filter(el => /from your query/.test(el.textContent || ""))[0];
    return { has: !!line,
             btnInLine: !!(line && line.querySelector(".jump")),
             text: line ? (line.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) : "",
             cta: !!document.querySelector("#newCellCta button"),
             own: [HX[i], HY[i], HZ[i]] };
  });
  console.log("\nthe line that names the distance");
  ok(onCell.has, "the panel says how far the cell is from your query", onCell.text || "(no line)");
  ok(onCell.btnInLine, "...and the re-centre button is on it, not buried under the IDs",
     onCell.btnInLine ? "on the line" : "not on the line");
  const recentred = await p.evaluate(async () => {
    const line = [].slice.call(document.querySelectorAll("#nucpanel .meta"))
      .filter(el => /from your query/.test(el.textContent || ""))[0];
    const btn = line && line.querySelector(".jump");
    if (!btn) return { none: true };
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    return { x: document.getElementById("x").value, y: document.getElementById("y").value,
             z: document.getElementById("z").value };
  });
  ok(!recentred.none && String(recentred.x) === String(onCell.own[0])
       && String(recentred.y) === String(onCell.own[1]) && String(recentred.z) === String(onCell.own[2]),
     "...and pressing it puts that cell's own voxel in the boxes",
     recentred.none ? "no button" : [recentred.x, recentred.y, recentred.z].join(", "));
  ok(!onCell.cta, "a coordinate on a soma is not asked to report a new cell",
     onCell.cta ? "offered anyway" : "not offered");

  /* ── nothing near ─────────────────────────────────────────────────────────────────────── */
  console.log("\na coordinate with no soma near it");
  const FAR = await p.evaluate(async () => {
    /* Far from every soma in the table, but inside the volume's own coordinate range. */
    let bestI = 0, best = -1;
    for (let i = 0; i < 400; i++){
      const r = nearest(HX[i] + 12000, HY[i] + 12000, HZ[i]);
      if (r.dist > best){ best = r.dist; bestI = i; }
    }
    const pos = [HX[bestI] + 12000, HY[bestI] + 12000, HZ[bestI]];
    document.getElementById("x").value = pos[0];
    document.getElementById("y").value = pos[1];
    document.getElementById("z").value = pos[2];
    document.getElementById("go").click();
    await new Promise(r => setTimeout(r, 1200));
    const cta = document.querySelector("#newCellCta");
    return { pos: pos, dist: Math.round(nearest(pos[0], pos[1], pos[2]).dist),
             offered: !!(cta && cta.querySelector("button")),
             text: cta ? (cta.textContent || "").replace(/\s+/g, " ").trim() : "" };
  });
  ok(FAR.dist > 10000, "(the fixture really is far from every soma)",
     (FAR.dist / 1000).toFixed(1) + " µm");
  ok(FAR.offered, "it offers to report a new cell", FAR.offered ? "offered" : "(nothing offered)");
  ok(/\d/.test(FAR.text) && /µm|micro/.test(FAR.text),
     "...and says how far the nearest one is", FAR.text.slice(0, 140) || "(said nothing)");

  /* ── the form ─────────────────────────────────────────────────────────────────────────── */
  console.log("\nthe form");
  const form = await p.evaluate(async (pos) => {
    /* The segmentation is not reachable from a file:// harness, so the read is stubbed here and
       its failure is asserted separately below. */
    window.__segAsked = [];
    window.hjSegAt = function(p){ window.__segAsked.push(p.join(",")); return Promise.resolve("7788990011"); };
    const open = document.querySelector("#newCellCta button");
    if (!open) return { open: false, coord: "", asked: [], say: "(nothing offers to open it)" };
    open.click();
    await new Promise(r => setTimeout(r, 900));
    const panel = document.getElementById("newCellPanel");
    return { open: !!(panel && panel.open),
             coord: (document.getElementById("newCellCoord") || {}).value || "",
             asked: window.__segAsked.slice(),
             say: (document.getElementById("newCellSegSay") || {}).textContent || "" };
  }, FAR.pos);
  ok(form.open, "the form opens", form.open ? "open" : "shut");
  ok(form.coord.replace(/\s/g, "") === FAR.pos.join(","), "...with the coordinate already in it",
     form.coord || "(empty)");
  ok(form.asked.length === 1, "...and it reads the segmentation at that point", form.asked.join(" | ") || "(not read)");
  ok(/7788990011/.test(form.say), "...and says which c3 segment is there", form.say.slice(0, 120) || "(said nothing)");

  /* ── sending it ───────────────────────────────────────────────────────────────────────── */
  console.log("\nsending it");
  const sent = await p.evaluate(async () => {
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "x";
    window.__SENT = [];
    postReport = function(pl){ window.__SENT.push(pl); return Promise.resolve({ ok: true }); };
    if (!document.getElementById("newCellSend"))
      return { sent: [], msg: "(no form)", listed: "(no form)" };
    const t = document.getElementById("newCellType");
    if (t){
      const hit = [].filter.call(t.options, o => /astrocyte/i.test(o.value))[0];
      if (hit) t.value = hit.value;
    }
    const c = document.getElementById("newCellComment");
    if (c) c.value = "a soma H01 never listed";
    document.getElementById("newCellSend").click();
    await new Promise(r => setTimeout(r, 900));
    return { sent: window.__SENT.slice(),
             msg: (document.getElementById("newCellMsg") || {}).textContent || "",
             listed: (document.getElementById("newCellList") || {}).textContent || "" };
  });
  const cell = sent.sent.filter(x => x.type === "new_cell_no_nucleus")[0];
  const ident = sent.sent.filter(x => x.type === "new_identification")[0];
  ok(!!cell, "it posts a new_cell_no_nucleus", cell ? "posted" : sent.sent.map(x => x.type).join(",") || "(nothing)");
  ok(!!cell && String(cell.coord).replace(/\s/g, "") === FAR.pos.join(","),
     "...carrying the coordinate", cell ? cell.coord : "-");
  ok(!!cell && String(cell.rootId) === "7788990011",
     "...and the c3 segment read at it, which is what makes it a real cell here", cell ? cell.rootId : "-");
  ok(!!ident, "...and a new_identification, because a type was chosen",
     ident ? ident.identified : "(none posted)");
  ok(!!ident && Number(ident.nucleusId) > 49376,
     "...on an id no cell body in this table has — H01's run 1 to 49,376",
     ident ? String(ident.nucleusId) : "-");
  ok(!!ident && String(ident.rootId) === "7788990011", "...and the same segment",
     ident ? ident.rootId : "-");
  ok(/thank|recorded|added/i.test(sent.msg), "...and the form says it landed", sent.msg.slice(0, 100) || "(said nothing)");
  ok(/astrocyte/i.test(sent.listed), "the cell joins the list without a reload",
     sent.listed.replace(/\s+/g, " ").slice(0, 140) || "(list empty)");

  /* ── and it can be identified ─────────────────────────────────────────────────────────── */
  console.log("\nand it can be identified from there");
  const named = await p.evaluate(async () => {
    const btn = document.querySelector("#newCellList .newcellid");
    if (!btn) return { none: true };
    btn.click();
    await new Promise(r => setTimeout(r, 700));
    return { shown: document.getElementById("idfpanel").classList.contains("show"),
             body: String(ID_CTX.body || ""), seg: String(ID_CTX.seg || ""),
             pos: (ID_CTX.pos || []).join(",") };
  });
  ok(!named.none, "each added cell offers to be identified", named.none ? "no button" : "offered");
  ok(!named.none && named.shown, "...and it opens this page's own identification flow", named.shown);
  ok(!named.none && Number(named.body) > 49376 && named.seg === "7788990011",
     "...on that cell's own ids", named.none ? "-" : named.body + " / " + named.seg);

  /* ── and when the segmentation cannot be read ─────────────────────────────────────────── */
  console.log("\nand when the segmentation cannot be read");
  const noSeg = await p.evaluate(async () => {
    window.hjSegAt = function(){ return Promise.reject(new Error("no network here")); };
    const box = document.getElementById("newCellCoord"), read = document.getElementById("newCellSegRead");
    if (!box || !read) return { say: "(no form)", disabled: false };
    box.value = "1,2,3";
    read.click();
    await new Promise(r => setTimeout(r, 700));
    return { say: (document.getElementById("newCellSegSay") || {}).textContent || "",
             disabled: !!document.getElementById("newCellSend").disabled };
  });
  ok(/could not|not read|unavailable|no segment/i.test(noSeg.say),
     "it says so, rather than pretending", noSeg.say.slice(0, 120) || "(said nothing)");
  ok(!noSeg.disabled, "...and the report can still be sent without it — the coordinate is the claim",
     noSeg.disabled ? "blocked" : "still possible");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
