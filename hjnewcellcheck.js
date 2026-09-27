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

   AND THEN THE CELL IS A CELL (2026-09-24, second pass). Søren, having reported one: *"I just
   reported a cell, then pressed Jump to it and it took me to another cell, the nearest cell which
   is 27 µm away..."* — because the button filled the coordinate boxes and re-ran the search, and
   the search only knows the 47,447 rows in the embedded table. The cell he had just added was not
   one of them, so "the nearest cell" was a stranger 27 µm away, which is exactly what the offer
   had said a moment earlier.

   λJump hit this and answered it properly — its own comment says the separate hand-built card
   "had none of the tool on it" — so an added nucleus JOINS THE ARRAYS there, and every reader that
   walks 0..N-1 finds it without being told. ηJump's nearest(), kNearest(), contacts, type pools,
   browse picker and random pickers are all such readers. So: the same rights here.

     - reporting a cell grows the table by one
     - nearest() at that coordinate returns the added cell, not a stranger
     - "Jump to it" opens THAT cell
     - the panel carries the name that was proposed, and does not credit H01 with it
     - ...nor prints a soma volume, spininess or synapse count nothing measured
     - ...and says where it came from instead
     - the layer is marked as estimated, because no layer volume was sampled for it
     - a second jump to that coordinate no longer offers to report a cell there
     - the added cell is in the unassigned pool, which is where an unnamed cell belongs

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
      const hit = [].filter.call(t.options, o => /endothelial/i.test(o.value))[0];
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
  ok(/endothelial/i.test(sent.listed), "the cell joins the list without a reload",
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

  /* ── and then it is a cell ────────────────────────────────────────────────────────────── */
  console.log("\nand then the cell you added is the cell you go to");
  const joined = await p.evaluate(async (pos) => {
    const r = nearest(pos[0], pos[1], pos[2]);
    return { N: N, tab: (typeof N_TAB === "number" ? N_TAB : null),
             hitDistNm: Math.round(r.dist), hitI: r.i,
             added: (typeof HADDED !== "undefined" && HADDED) ? !!HADDED[r.i] : null,
             body: (typeof HSB !== "undefined") ? String(HSB[r.i]) : "",
             unassigned: (typeof UNASSIGNED_IDX !== "undefined")
                         && UNASSIGNED_IDX.indexOf(r.i) >= 0,
             /* Which pool the filter put it in, and what that pool is called on screen. */
             pools: (typeof IDX_BY_TYPE !== "undefined")
                    ? Object.keys(IDX_BY_TYPE).filter(k => (IDX_BY_TYPE[k] || []).indexOf(r.i) >= 0)
                    : [],
             boxes: [].map.call(document.querySelectorAll("#filterTypes label"),
                                e => (e.textContent || "").replace(/\s+/g, " ").trim()),
             picker: [].map.call(
                (document.getElementById("randomTypeSelect") || { options: [] }).options,
                o => (o.textContent || "").trim()) };
  }, FAR.pos);
  ok(joined.tab !== null && joined.N === joined.tab + 1,
     "reporting a cell grows the table by one",
     joined.tab === null ? "N_TAB is not defined — the table cannot tell its own rows apart"
                         : joined.N + " rows, table has " + joined.tab);
  ok(joined.hitDistNm < 1000, "nearest() at that coordinate finds the added cell, not a stranger",
     (joined.hitDistNm / 1000).toFixed(2) + " µm away");
  ok(joined.added === true, "...and the row knows it was added rather than published",
     String(joined.added));
  ok(Number(joined.body) > 49376, "...under the id derived from its coordinate", joined.body);
  /* ── AND IT IS FILED UNDER THE NAME IT WAS GIVEN ────────────────────────────  2026-09-26
     Søren: "the endothelial cell did not get its own category in the filter, it is just called
     cell not in H01's list. That should be fixed."

     "Endothelial cell" is not an H01 cell type — H01's nearest is "blood-vessel-cell" — so there
     was no pool for it to join and every named added cell landed in one heap. A cell H01 never
     listed has no published call to be measured against; the name somebody gave it is the only
     name it has, so that is what it is filed under.

     This replaces an assertion written on 2026-09-24 ("...and it is in the unassigned pool"). It
     was right about an added cell with no type on it and wrong about this one: the cell under test
     was reported AS an astrocyte, and a cell somebody has named is not one nobody has identified.
     The unnamed case is asserted below in its place. */
  ok(joined.pools.some(k => /endothelial/i.test(k)) && joined.pools.indexOf("not-in-h01") < 0,
     "the added cell is filed under the name it was reported with, not in one heap",
     joined.pools.join(", ") || "(no pool at all)");
  ok(joined.boxes.some(t => /endothelial/i.test(t) && /\b1\b/.test(t)),
     "...and the filter offers that name as its own tickable category",
     joined.boxes.filter(t => /endothelial|not in H01/i.test(t)).join(" | ") || "(not offered)");
  ok(joined.picker.some(t => /endothelial/i.test(t)),
     "...and “Browse a cell” can draw one",
     joined.picker.filter(t => /endothelial|not in H01/i.test(t)).join(" | ") || "(not listed)");
  ok(!joined.unassigned,
     "...and it is no longer among the cells nobody has identified — somebody just did",
     joined.unassigned ? "still counted as unassigned" : "out of that pool");

  /* The other half of the same rule: a cell reported with no type at all IS unassigned, and that
     is the one "Cell not in H01's list" exists to name. */
  const noName = await p.evaluate(async () => {
    const pos = [262528, 201573, 3999];
    HJ_NEW_CELLS = (HJ_NEW_CELLS || []).concat([{ coord: pos.join(","), rootId: "",
      identified: "", comment: "", reporterName: "Søren Grubb",
      timestamp: new Date().toISOString() }]);
    absorbAddedCells();
    await new Promise(r => setTimeout(r, 300));
    const i = nearest(pos[0], pos[1], pos[2]).i;
    return { pools: Object.keys(IDX_BY_TYPE).filter(k => (IDX_BY_TYPE[k] || []).indexOf(i) >= 0),
             unassigned: UNASSIGNED_IDX.indexOf(i) >= 0 };
  });
  ok(noName.pools.indexOf("not-in-h01") >= 0,
     "a cell reported with no type is what “Cell not in H01’s list” names",
     noName.pools.join(", ") || "(no pool)");
  ok(noName.unassigned, "...and it is in the unassigned pool, where an unnamed cell belongs",
     String(noName.unassigned));

  /* ── AND TICKING THAT CATEGORY FINDS IT ─────────────────────────────────────  2026-09-27
     Søren, the day after the pool went in: "if i choose a bounding box around that cell and click
     the filter to show it, there are no matches. If I don't click it, it shows 1 match, that cell."
     The region box was the same in both of his screenshots; what differed was the ENDOTHELIAL CELL
     tick. So the category the filter offers found nothing.

     The bucket rule was written twice. rebuildTypePools files a cell under `added:<name>` (or under
     h01SplitFor's resolved name), and the checkbox carries that key as its value — while the filter
     compared it against typeName(i), which for an added cell is `not-in-h01`. A checkbox whose
     label and count come from a pool must match the cells in that pool; one function decides it
     now, and these two assertions are why. */
  const ticked = await p.evaluate(async () => {
    const box = [].slice.call(document.querySelectorAll(".ftype"))
                  .filter(e => /^added:/.test(e.value) || /endothelial/i.test(e.value))[0];
    if (!box) return { none: true };
    [].slice.call(document.querySelectorAll(".ftype:checked,.flayer:checked,.fidentity:checked,.forganelle:checked"))
      .forEach(e => { e.checked = false; });
    box.checked = true;
    const reg = document.getElementById("filterRegionOn");
    if (reg) reg.checked = false;
    document.getElementById("filterRun").click();
    await new Promise(r => setTimeout(r, 1500));
    return { none: false, value: box.value,
             n: (FILTER && FILTER.rows) ? FILTER.rows.length : -1,
             added: (FILTER && FILTER.rows && FILTER.rows.length)
                    ? !!HADDED[FILTER.rows[0]] : null,
             say: (document.getElementById("filterStatus") || {}).textContent || "" };
  });
  ok(!ticked.none, "the filter offers the added cell's own category as a tickable type",
     ticked.none ? "no such checkbox" : ticked.value);
  ok(!ticked.none && ticked.n === 1 && ticked.added === true,
     "...and ticking it finds that cell",
     ticked.none ? "-" : ticked.n + " match(es) — " + (ticked.say || "").slice(0, 70));

  /* The same fault from the other side, and it predates the added cells: a microglia/opc cell the
     community has resolved is filed under "microglia", the checkbox says so with a count, and the
     filter compared "microglia" against H01's own "microglia/opc". One rule, both callers. */
  const agree = await p.evaluate(async () => {
    if (typeof poolOf !== "function") return { missing: true };
    const out = { missing: false, bad: [] };
    for (let i = 0; i < N; i++){
      const p = poolOf(i);
      if (!(IDX_BY_TYPE[p] || []).length || (IDX_BY_TYPE[p] || []).indexOf(i) < 0){
        out.bad.push(i + " -> " + p);
        if (out.bad.length > 3) break;
      }
    }
    return out;
  });
  ok(!agree.missing, "one function decides which pool a cell is in",
     agree.missing ? "the filter and the lists still each have their own copy" : "poolOf");
  ok(!agree.missing && (agree.bad || []).length === 0,
     "...so every cell is in the pool that function names — all 47,449 of them",
     (agree.bad || []).length ? "not in its own pool: " + agree.bad.join(", ") : "every one");

  const opened = await p.evaluate(async () => {
    const btn = document.querySelector("#newCellList .jump");
    if (!btn) return { none: true };
    btn.click();
    await new Promise(r => setTimeout(r, 1400));
    const panel = document.getElementById("nucpanel");
    const txt = (panel.textContent || "").replace(/\s+/g, " ");
    const head = (document.getElementById("ctHeadline") || {}).textContent || "";
    return { txt: txt, head: head.replace(/\s+/g, " ").trim(),
             body: (typeof CUR_NUCID !== "undefined") ? String(CUR_NUCID) : "",
             cta: !!document.querySelector("#newCellCta button"),
             nan: /NaN/.test(txt) };
  });
  ok(!opened.none, "the list offers to jump to it", opened.none ? "no button" : "offered");
  ok(!opened.none && Number(opened.body) > 49376,
     "...and the cell that opens IS the added one", opened.none ? "-" : opened.body);
  ok(!opened.none && /endothelial/i.test(opened.head),
     "...headlined with the name that was proposed for it", opened.head.slice(0, 90) || "(no headline)");
  ok(!opened.none && !/H01 published classification/i.test(opened.head),
     "...and H01 is not credited with a call it never made", opened.head.slice(0, 90));
  ok(!opened.none && /not in H01|added|reported/i.test(opened.txt),
     "...the panel says where the cell came from instead",
     (opened.txt.match(/[^.]*(not in H01|added by|reported)[^.]*/i) || ["(said nothing)"])[0].slice(0, 120));
  ok(!opened.none && !opened.nan,
     "...and prints no NaN where H01 measured nothing", opened.nan ? "NaN on the card" : "clean");
  ok(!opened.none && !/µm³/.test(opened.txt.split("3 nearest")[0] || ""),
     "...no soma volume, because nothing measured this soma",
     /µm³/.test((opened.txt.split("3 nearest")[0] || "")) ? "printed one anyway" : "none printed");
  ok(!opened.none && /estimated/i.test(opened.txt),
     "...and its layer is marked as estimated, not sampled",
     /estimated/i.test(opened.txt) ? "marked" : "claimed as sampled");
  ok(!opened.none && !opened.cta,
     "a coordinate that now has a cell is no longer asked to report one",
     opened.cta ? "offered again" : "not offered");

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
