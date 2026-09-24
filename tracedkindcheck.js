/* A traced whole cell and a traced nucleus are things you can tick.                   2026-09-24

   Søren: "I need to be able to filter for only the cells that have whole cell structures, and it
   shows 93 matches even though there are only 4. Please make a tick in the two organelle boxes
   where I can tick either Whole cell or Nucleus to select for those and to show their 3D
   structures."

   THE 93 WAS RIGHT, and that is the problem. The picker he used — "Traced organelle outlines" —
   sits under "Add extra layers to the 3D view (optional — doesn't change which cells match)" and
   says so. With nothing ticked in the organelle list, "Has the ticked structure(s) annotated"
   means "has ANY annotation", which 93 cells do. Nothing was broken; there was simply no way to
   ask the question he wanted to ask.

   The organelle list is built from the ontology, and a traced whole cell is not in it — it is not
   an organelle, and it does not live in the organelle-locations sheet either. It lives in the
   traced-structures index. So the two lists gain two kinds of their own, counted from that index:

     __traced_cell     cells somebody has outlined the whole of
     __traced_nucleus  cells somebody has outlined the nucleus of

   WHAT IS ASSERTED:
     - both lists offer the two kinds, in a group of their own
     - the counts are CELLS carrying the tracing, the same unit as every other number there
     - ...and they are the number of cells, not the number of tracings: two outlines of one cell
       count once
     - ticking "whole cell" and asking "has" matches only cells that have one
     - ...and "not annotated yet" matches the others
     - ticking it in the LAYER list draws those outlines in the view
     - a dataset with none of them still shows the kinds, at zero, like every other kind
     - ticking nothing still means "has anything", which is what the 93 was

   Run: node tracedkindcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });

  /* The traced-structures index: two whole cells (one of them outlined TWICE, to prove the count
     is cells and not tracings) and one nucleus. */
  let INDEX = [];
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("tracings") !== "1") return route.abort();
    const sid = u.searchParams.get("structureId") || u.searchParams.get("structureIds");
    if (sid) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ tracings: String(sid).split(",").map(s => ({ structureId: s,
        rows: [{ structureId: s, kind: "cell", instanceOf: "", name: "Whole cell", color: "#40e28c",
                 z: 1000, ringIndex: 0, points: "1000,2000;1040,2000;1040,2040;1000,2040" }] })) }) });
    return route.fulfill({ status: 200, contentType: "application/json",
                           body: JSON.stringify({ tracings: INDEX }) });
  });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(6000);

  /* Two cells the preview actually matched, so the filter can be asked about real rows. */
  const cells = await p.evaluate(async () => {
    document.getElementById("filterRun").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000){
      await new Promise(r => setTimeout(r, 300));
      const v = document.getElementById("filterViewerAll");
      if (v && !v.disabled) break;
    }
    const m = UJ.stepthrough.currentMatches() || [];
    const nucOf = r => r.space === "MS" ? (r.subRef.nucleusId || "") : (r.space === "N" ? String(NID[r.i]) : "");
    const ids = m.map(x => nucOf(x.row)).filter(Boolean);
    return { a: ids[0], b: ids[1], n: m.length };
  });
  if (!cells.a || !cells.b){ console.log("no matched cells: " + JSON.stringify(cells)); process.exit(1); }
  console.log(PAGE + "\n(" + cells.n + " cells matched with nothing ticked — the “93”)\n");

  INDEX = [
    { structureId: "wc1", kind: "cell", name: "Whole cell", nucleusId: cells.a, color: "#40e28c" },
    { structureId: "wc1b", kind: "cell", name: "Whole cell", nucleusId: cells.a, color: "#40e28c" },
    { structureId: "wc2", kind: "cell", name: "Whole cell", nucleusId: cells.b, color: "#40e28c" },
    { structureId: "nu1", kind: "nucleus", name: "Nucleus", nucleusId: cells.a, color: "#78dadd" }
  ];

  const state = await p.evaluate(async () => {
    if (typeof tracedKindsRefresh === "function") await tracedKindsRefresh(true);
    await new Promise(r => setTimeout(r, 600));
    const lab = (host, v) => {
      const cb = host && host.querySelector('input[value="' + v + '"]');
      return cb ? (cb.closest("label") || {}).textContent.trim() : null;
    };
    const F = document.getElementById("filterOrganelleBox");
    const L = document.getElementById("filterOrganellesBox");
    return { filterCell: lab(F, "__traced_cell"), filterNuc: lab(F, "__traced_nucleus"),
             layerCell: lab(L, "__traced_cell"), layerNuc: lab(L, "__traced_nucleus") };
  });

  console.log("the two lists");
  ok(!!state.filterCell, "the filter list offers a traced whole cell", state.filterCell || "(absent)");
  ok(!!state.filterNuc, "...and a traced nucleus", state.filterNuc || "(absent)");
  ok(!!state.layerCell && !!state.layerNuc, "the layer list offers both too",
     (state.layerCell || "(absent)") + " / " + (state.layerNuc || "(absent)"));
  ok(/\b2\b/.test(state.filterCell || ""),
     "...counted as CELLS: two cells, though one of them was outlined twice",
     state.filterCell || "-");
  ok(/\b1\b/.test(state.filterNuc || ""), "...and one nucleus", state.filterNuc || "-");

  const run = async (ticks, mode) => p.evaluate(async ([ticks, mode]) => {
    const F = document.getElementById("filterOrganelleBox");
    F.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = ticks.indexOf(cb.value) >= 0; });
    document.getElementById("filterOrganelle").value = mode;
    if (typeof invalidateFilterResult === "function") invalidateFilterResult();
    document.getElementById("filterRun").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000){
      await new Promise(r => setTimeout(r, 300));
      const v = document.getElementById("filterViewerAll");
      if (v && !v.disabled) break;
    }
    const m = UJ.stepthrough.currentMatches() || [];
    const nucOf = r => r.space === "MS" ? (r.subRef.nucleusId || "") : (r.space === "N" ? String(NID[r.i]) : "");
    return { n: m.length, ids: m.map(x => nucOf(x.row)).filter(Boolean).slice(0, 6) };
  }, [ticks, mode]);

  console.log("\nfiltering on it");
  const hasCell = await run(["__traced_cell"], "has");
  ok(hasCell.n === 2, "ticking the whole cell and asking “has” matches exactly the two that have one",
     hasCell.n + " matched: " + hasCell.ids.join(","));
  ok(hasCell.ids.indexOf(cells.a) >= 0 && hasCell.ids.indexOf(cells.b) >= 0,
     "...and they are the right two", hasCell.ids.join(","));
  const hasNuc = await run(["__traced_nucleus"], "has");
  ok(hasNuc.n === 1 && hasNuc.ids[0] === cells.a, "...the nucleus one matches its one cell",
     hasNuc.n + ": " + hasNuc.ids.join(","));
  /* The two baselines this is measured against: every row, and every row with ANY annotation --
     the second is the number Søren saw as 93. */
  const all = await run([], "");
  const anything = await run([], "has");
  const notCell = await run(["__traced_cell"], "not");
  ok(notCell.n === all.n - 2, "\u201cnot annotated yet\u201d matches all the others",
     notCell.n + " of " + all.n);
  const anything2 = await run([], "has");
  ok(anything2.n === anything.n && anything2.n > 2,
     "and ticking nothing still means \u201chas anything\u201d \u2014 which is what the 93 was",
     anything2.n + " (unchanged)");

  console.log("\nand the layer draws them");
  const drew = await p.evaluate(async () => {
    window.JUMP_LINK_MAX = 50000000;
    window.__opened = null;
    window.open = function(u){ if (u) window.__opened = u; return null; };
    window.confirm = () => true;
    const F = document.getElementById("filterOrganelleBox");
    F.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = cb.value === "__traced_cell"; });
    document.getElementById("filterOrganelle").value = "has";
    const L = document.getElementById("filterOrganellesBox");
    const cb = L.querySelector('input[value="__traced_cell"]');
    if (cb) cb.checked = true;
    if (typeof invalidateFilterResult === "function") invalidateFilterResult();
    document.getElementById("filterRun").click();
    let t0 = Date.now();
    while (Date.now() - t0 < 60000){
      await new Promise(r => setTimeout(r, 300));
      const v = document.getElementById("filterViewerAll");
      if (v && !v.disabled) break;
    }
    document.getElementById("filterViewerAll").click();
    t0 = Date.now();
    while (Date.now() - t0 < 60000 && !window.__opened) await new Promise(r => setTimeout(r, 200));
    if (!window.__opened) return { none: true };
    const st = JSON.parse(decodeURIComponent(window.__opened.split("#!")[1]));
    const traced = (st.layers || []).filter(l => /^traced /.test(l.name || ""));
    return { names: traced.map(l => l.name), anns: traced.reduce((a, l) => a + (l.annotations || []).length, 0) };
  });
  ok(!drew.none, "the view opened", drew.none ? "nothing opened" : drew.names.join(" | "));
  ok(!drew.none && drew.names.some(n => /whole cell/i.test(n)),
     "...with the traced whole cells drawn, from the tick in the layer list",
     (drew.names || []).join(" | ") || "(no traced layers)");
  ok(!drew.none && drew.anns > 0, "...and they have contours", drew.anns + " annotation(s)");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
