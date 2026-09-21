/* The filtered cells bring their outlines — on every tool that has "Open all matches".   2026-09-21

   µJump's own check for this (filterorgansegcheck.js) lives outside this folder, so this one was
   written first and run on µJump BEFORE the outline code moved into core/tracedoutlines.js, and
   after; then on δJump and πJump, which gained it.

   Driven end to end: a real Preview, a real press of "Open all matches", and the URL handed to
   window.open decoded and read back. The backend is answered locally with four tracings:

     s1  a lysosome filed against cell A's NUCLEUS id             -> must be drawn
     s2  a mitochondrion filed against cell B's ROOT id            -> must be drawn
     s3  a lysosome filed against a nucleus no cell here has        -> must NOT be read
     s4  a traced CELL, against cell A                              -> not an organelle; not read

   The one thing it exists to catch is WHICH outlines get in — matching on one id alone silently
   drops half the dataset in the way that looks like "nobody has traced these".

   ηJump's "Open all in Neuroglancer" is a link, not a button: there the press is a click on the
   link, and a view with no outlines picked is the link's own href (added 2026-09-21, same day).

   Run: node organoutlinecheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};
const PAGE = process.argv[2] || "ujump.html";
const LINK = /hjump/.test(PAGE);   // ηJump: #filterViewer is an <a>, its matches are FILTER.rows
/* βJump and λJump: a nucleus table (BID), built their "Open all" on 2026-09-21 in core/openall.js.
   λJump has no segmentation, so its second cell is found and filed by nucleus too. */
const TABLE = /bjump|ljump/.test(PAGE);

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**princeton.edu/**"])
    await p.route(h, r => r.abort());

  let INDEX = [], ROWS = {};
  const reads = [];
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("tracings") !== "1") return route.abort();
    const sid = u.searchParams.get("structureId");
    reads.push({ sid: sid || "(index)", ds: u.searchParams.get("ds") || "" });
    const body = sid ? { tracings: [{ rows: ROWS[sid] || [] }] } : { tracings: INDEX };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(6000);

  /* THE CELLS COME FROM THE FILTER, not from the file: a cell the preview did not match has no
     business in the view, and taking one from the table blames the product for leaving it out. */
  const cells = await p.evaluate(async ([LINK, TABLE]) => {
    document.getElementById("filterRun").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000){
      await new Promise(r => setTimeout(r, 300));
      const v = document.getElementById(LINK ? "filterViewer" : "filterViewerAll");
      if (v && (LINK ? v.getAttribute("href") : !v.disabled)) break;
    }
    window.__ran = true;
    if (LINK){
      /* The rows the link was built for, by the page's own ids: cell body and c3 segment. */
      const rows = FILTER.shown || [];
      let A = null, B = null;
      for (const i of rows){
        if (!A){ A = { nuc: String(HSB[i]), root: String(c3Id(i)) }; continue; }
        if (!B && String(c3Id(i)) !== A.root){ B = { root: String(c3Id(i)) }; break; }
      }
      return { A, B, n: rows.length, ds: (UJ.cfg.backend && UJ.cfg.backend.ds) || "" };
    }
    const m = UJ.stepthrough.currentMatches() || [];
    let A = null, B = null;
    if (TABLE){
      const segOf = i => (typeof BSEG !== "undefined" && BSEG[i]) ? String(BSEG[i]) : "";
      for (const x of m){
        const i = x.row.i;
        if (!A && BID[i]){ A = { nuc: String(BID[i]), root: segOf(i) }; continue; }
        if (A && !B){
          if (segOf(i) && segOf(i) !== A.root){ B = { root: segOf(i) }; break; }
          if (typeof BSEG === "undefined" && BID[i] && String(BID[i]) !== A.nuc){ B = { nuc: String(BID[i]) }; break; }
        }
      }
      return { A, B, n: m.length, ds: (UJ.cfg.backend && UJ.cfg.backend.ds) || "" };
    }
    /* The filter's own rule for a row's two ids (rowNucId/rowRootId live in its closure). */
    const nucOf = r => r.space === "MS" ? (r.subRef.nucleusId || "") : (r.space === "N" ? String(NID[r.i]) : "");
    const rootOf = r => r.space === "MS" ? (r.subRef.subRootId || "") : (r.space === "N" ? (rootId(r.i) || "") : "");
    for (const x of m){
      const nid = nucOf(x.row), rid = rootOf(x.row);
      if (!A && nid){ A = { nuc: String(nid), root: String(rid || "") }; continue; }
      if (A && !B && rid && String(rid) !== A.root){ B = { root: String(rid) }; }
      if (A && B) break;
    }
    return { A, B, n: m.length, ds: (UJ.cfg.backend && UJ.cfg.backend.ds) || "" };
  }, [LINK, TABLE]);
  if (!cells.A || !cells.B){ console.log("the preview matched no usable cells: " + JSON.stringify(cells)); process.exit(1); }
  const B_FILED = cells.B.root ? { rootId: cells.B.root } : { nucleusId: cells.B.nuc };
  const B_BY = cells.B.root ? "ROOT id" : "NUCLEUS id (another cell; this dataset has no segmentation)";
  const ring = (z, x0, y0) => ({ z, points: [[x0, y0], [x0 + 40, y0], [x0 + 40, y0 + 40], [x0, y0 + 40]]
                                               .map(q => q.join(",")).join(";") });
  const row = (sid, kind, f, r, extra) => Object.assign({ structureId: sid, kind, instanceOf: kind,
      name: kind + " 1", color: "#ff0000", z: r.z, points: r.points, ringIndex: 0 }, f, extra || {});
  INDEX = [
    { structureId: "s1", kind: "lysosome", instanceOf: "lysosome", nucleusId: cells.A.nuc, color: "#ff0000" },
    Object.assign({ structureId: "s2", kind: "mitochondria", instanceOf: "mitochondria", color: "#00ff00" }, B_FILED),
    { structureId: "s3", kind: "lysosome", instanceOf: "lysosome", nucleusId: "999999999", color: "#ff0000" },
    { structureId: "s4", kind: "cell", nucleusId: cells.A.nuc }
  ];
  ROWS = {
    s1: [row("s1", "lysosome", { nucleusId: cells.A.nuc }, ring(100, 1000, 2000))],
    s2: [row("s2", "mitochondria", B_FILED, ring(200, 3000, 4000)),
         row("s2", "mitochondria", B_FILED, ring(201, 3000, 4000), { ringIndex: 1 })]
  };

  console.log(PAGE + "\n\nthe picker");
  const pick = await p.evaluate(async () => {
    const sel = document.getElementById("filterOrganSeg");
    if (!sel) return { none: true };
    sel.dispatchEvent(new Event("focus"));
    await new Promise(r => setTimeout(r, 800));
    return { opts: [...sel.options].map(o => o.value + "=" + o.textContent) };
  });
  ok(!pick.none, "Filter and show has the traced-outline picker");
  if (pick.none){ await b.close(); console.log("\n1 FAILED"); process.exit(1); }
  ok(pick.opts.some(o => /^lysosome=.*\(2 outlined\)/.test(o)),
     "...listing the kinds that have been outlined, with how many", pick.opts.join(" | "));
  ok(!pick.opts.some(o => /^cell=/.test(o)), "...and not a traced cell, which is not an organelle");

  const openAll = async (want) => p.evaluate(async ([want, LINK]) => {
    window.__opened = null;
    window.open = function(u){ if (u) window.__opened = u; return null; };
    window.confirm = function(){ return true; };
    /* A link nobody stopped would open itself: take its href as the view instead, once. */
    if (LINK && !window.__linkTap){
      window.__linkTap = true;
      document.addEventListener("click", function(e){
        const a = e.target.closest && e.target.closest("#filterViewer");
        if (a && !e.defaultPrevented){ e.preventDefault(); window.__opened = a.href; }
      });
    }
    if (!window.__ran){
      document.getElementById("filterRun").click();
      const t0 = Date.now();
      while (Date.now() - t0 < 60000){
        await new Promise(r => setTimeout(r, 300));
        const v = document.getElementById("filterViewerAll");
        if (v && !v.disabled) break;
      }
      window.__ran = true;
    }
    document.getElementById("filterOrganSeg").value = want;
    document.getElementById(LINK ? "filterViewer" : "filterViewerAll").click();
    const t1 = Date.now();
    while (Date.now() - t1 < 60000 && !window.__opened) await new Promise(r => setTimeout(r, 200));
    if (!window.__opened) return { none: true };
    const st = JSON.parse(decodeURIComponent(window.__opened.split("#!")[1]));
    const own = st.layers.filter(l => !/^traced /.test(l.name || ""));
    const pts = own.filter(l => l.type === "annotation")
                   .reduce((a, l) => a + (l.annotations || []).filter(x => x.type === "point").length, 0);
    const segs = own.filter(l => l.type === "segmentation").map(l => l.name + ":" + (l.segments || []).length);
    return { pts, segs, ngroups: own.filter(l => / \u2014 nuclei \(/.test(l.name || "")).length,
             layers: st.layers.filter(l => /^traced /.test(l.name || "")).map(l => ({
      name: l.name, n: (l.annotations || []).length, color: l.annotationColor,
      types: [...new Set((l.annotations || []).map(a => a.type))].join(",") })) };
  }, [want, LINK]);

  console.log("\nall outlined organelles");
  reads.length = 0;
  const all = await openAll("__all");
  ok(!all.none, "Open all matches produced a view");
  if (!all.none){
    const lys = all.layers.find(l => /^traced lysosome/i.test(l.name));
    const mit = all.layers.find(l => /^traced mitochondri/i.test(l.name));
    ok(!!lys && lys.n === 4 && lys.types === "line" && lys.color === "#ff0000",
       "the lysosome filed by NUCLEUS id is drawn: one ring, four lines, in its colour",
       JSON.stringify(lys || null));
    ok(!!mit && mit.n === 8, "the mitochondrion filed by " + B_BY + " is drawn: two rings, eight lines",
       JSON.stringify(mit || null));
    ok(all.layers.length === 2, "...one layer per kind, and nothing else", all.layers.map(l => l.name).join(" | "));
    if (TABLE){
      ok(all.pts === cells.n, "the view has a point on every matched nucleus", all.pts + " of " + cells.n);
      ok(all.ngroups >= 1, "...in one layer per community identity", all.ngroups + " layer(s)");
      if (/bjump/.test(PAGE))
        ok(all.segs.some(x => /^Segmentation \(SECGAN 16nm\) \(\d+\):\d+$/.test(x)),
           "...and the matched cells' segments", all.segs.join(" | "));
    }
  }
  const sids = reads.map(r => r.sid);
  ok(sids.includes("s1") && sids.includes("s2"), "both were read", sids.join(","));
  ok(!sids.includes("s3"), "the outline of a cell that did not match is never read");
  ok(!sids.includes("s4"), "...nor a traced cell");
  if (cells.ds && cells.ds !== "ujump")
    ok(reads.every(r => r.ds === cells.ds), "every read names this dataset, " + cells.ds,
       [...new Set(reads.map(r => r.ds || "(none)"))].join(","));

  console.log("\none kind");
  reads.length = 0;
  const one = await openAll("lysosome");
  ok(!one.none && one.layers.length === 1 && /lysosome/i.test(one.layers[0].name),
     "picking lysosome draws lysosomes only", one.none ? "no view" : one.layers.map(l => l.name).join(" | "));
  ok(!reads.some(r => r.sid === "s2"), "...and never reads the mitochondrion");

  console.log("\nnone");
  reads.length = 0;
  const none = await openAll("");
  ok(!none.none && none.layers.length === 0 && !reads.some(r => r.sid !== "(index)"),
     "\"None — points only\" draws no outlines and reads none", none.none ? "no view" : none.layers.length + " layers");
  ok(errors.length === 0, "the page still loads with no new errors", errors.join(" | ") || "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
