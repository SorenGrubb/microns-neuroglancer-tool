/* The whole-cell and nucleus ticks work on EVERY tool, not just µJump.               2026-09-24

   Søren: "The whole cell and nucleus filter should work on all the tools. Does it?"

   It did not. Measured across the family the morning he asked:

     ujump    extraGroups=2  tracedKindCounts=2  tracedKindHas=1
     djump    0              0                   0
     pjump    0              0                   0
     hjump    0              0                   0
     bjump    0              0                   0
     ljump    0              0                   0
     wjump    0              0                   0
     xjump    0              0                   0

   One tool out of eight. The two kinds live in the traced-structures index, and every other
   tool's filter builds its `have` list out of organelle reports alone, so the checkboxes were
   not offered and could not have been answered if they had been.

   WHAT IS ASSERTED, on whichever page is named:
     - the filter list offers a traced whole cell and a traced nucleus
     - the counts are CELLS, and two outlines of one cell count once
     - ticking the whole cell and asking "has" matches exactly the cells that carry one
     - ...and they are the right cells, by this page's own ids
     - ticking the nucleus matches its one cell
     - "not annotated yet" matches all the others
     - ticking nothing still means "has anything" — which is the 93 he saw, and was right

   ωJump cannot preview from a file:// page (its nuclei come out of a volume this harness blocks),
   so only its list is driven here; its matching is checked in wjump-build/wjtracedkindcheck.js,
   which calls W.filterNuclei directly.

   Run: node tracedkindalltoolscheck.js [page.html]      (default ujump.html)
        for p in ujump djump pjump hjump bjump ljump xjump wjump; do node tracedkindalltoolscheck.js $p.html; done */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
const NAME = PAGE.replace(/\.html$/, "");

/* Each tool names its own controls. `read` is how a matched row gives up the id a tracing on this
   page would be filed under -- the same per-page question organoutlinecheck.js answers. */
const CFG = {
  ujump: { box: "filterOrganelleBox", mode: "filterOrganelle",     ready: "filterViewerAll", read: "MS" },
  djump: { box: "filterOrganelleBox", mode: "filterOrganelle",     ready: "filterViewerAll", read: "MS" },
  pjump: { box: "filterOrganelleBox", mode: "filterOrganelle",     ready: "filterViewerAll", read: "MS" },
  hjump: { box: "filterOrganelles",   mode: "filterOrganelleMode", ready: "filterViewer",    read: "H"  },
  ljump: { box: "fOrganellesBox",     mode: "fOrganelleMode",      ready: "filterViewerAll", read: "T"  },
  bjump: { box: "fOrganellesBox",     mode: "fOrganelleMode",      ready: "filterViewerAll", read: "T"  },
  xjump: { box: "filterOrganelleBox", mode: "filterOrganelleMode", ready: "filterViewerAll", read: "X"  },
  wjump: { box: "f-organelles",       mode: "f-organelle-mode",    ready: null,              read: null }
}[NAME];
if (!CFG){ console.log("no configuration for " + PAGE); process.exit(1); }

let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });

  let INDEX = [];
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("tracings") !== "1") return route.abort();
    const sid = u.searchParams.get("structureId") || u.searchParams.get("structureIds");
    if (sid) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ tracings: String(sid).split(",").map(s => ({ structureId: s, rows: [] })) }) });
    return route.fulfill({ status: 200, contentType: "application/json",
                           body: JSON.stringify({ tracings: INDEX }) });
  });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(6000);

  /* ── the cells this page can actually return ──────────────────────────────────────────────
     Taken from its own preview rather than from its table: a cell the filter never matches is
     no evidence either way, and seeding one would blame the product for leaving it out. */
  const preview = async (ticks, mode) => p.evaluate(async ([ticks, mode, CFG]) => {
    const box = document.getElementById(CFG.box);
    if (box && ticks)
      box.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = ticks.indexOf(cb.value) >= 0; });
    const sel = document.getElementById(CFG.mode);
    if (sel && mode !== null) sel.value = mode;
    ["invalidateFilterResult", "invalidateFilter", "invalidatePreview"].forEach(f => {
      if (typeof window[f] === "function") try { window[f](); } catch (_e){}
    });
    document.getElementById("filterRun").click();
    const t0 = Date.now();
    if (CFG.ready){
      while (Date.now() - t0 < 60000){
        await new Promise(r => setTimeout(r, 300));
        const v = document.getElementById(CFG.ready);
        if (v && (CFG.read === "H" ? v.getAttribute("href") : !v.disabled)) break;
      }
    }
    await new Promise(r => setTimeout(r, 800));
    /* FILTER.rows, not FILTER.shown: `shown` is the capped list the table draws, so reading it
       would report 200 matches whatever the filter did. */
    if (CFG.read === "H") return (FILTER.rows || []).map(i => String(HSB[i]));
    const m = (UJ.stepthrough.currentMatches() || []);
    if (CFG.read === "X") return m.map(x => x.row && x.row.key).filter(Boolean);
    if (CFG.read === "T") return m.map(x => (typeof BID !== "undefined" && BID[x.row.i]) ? String(BID[x.row.i]) : "")
                                  .filter(Boolean);
    return m.map(x => { const r = x.row;
      return r.space === "MS" ? String(r.subRef.nucleusId || "")
           : (r.space === "N" ? String(NID[r.i]) : ""); }).filter(Boolean);
  }, [ticks, mode, CFG]);

  /* TWO BASELINES, and they are different questions. `all` is every row the page can return, which
     is what "not annotated yet" is the complement of. `anything` is "has ANY annotation" with
     nothing ticked -- the number Søren read as 93. On a page whose organelle reports this harness
     blocks, `anything` is honestly 0; the assertion on it is that seeding two tracings does not
     change it, not that it is large. */
  let A = "", B = "", all = [], anything = [];
  if (CFG.read){
    all = await preview([], "");
    anything = await preview([], "has");
    A = all[0]; B = all[1];
    if (!A || !B){ console.log("the preview matched no usable cells: " + JSON.stringify(all.slice(0, 5))); process.exit(1); }
  }
  console.log(PAGE + (CFG.read ? "\n(" + all.length + " rows; " + anything.length
                                 + " with any annotation — the “93”)\n" : "\n"));

  /* One cell outlined TWICE, to prove the count is cells and not tracings. */
  INDEX = CFG.read
    ? [{ structureId: "wc1",  kind: "cell",    name: "Whole cell", nucleusId: A, color: "#40e28c" },
       { structureId: "wc1b", kind: "cell",    name: "Whole cell", nucleusId: A, color: "#40e28c" },
       { structureId: "wc2",  kind: "cell",    name: "Whole cell", nucleusId: B, color: "#40e28c" },
       { structureId: "nu1",  kind: "nucleus", name: "Nucleus",    nucleusId: A, color: "#78dadd" }]
    : [{ structureId: "wc1",  kind: "cell",    name: "Whole cell", nucleusId: "a", color: "#40e28c" },
       { structureId: "wc1b", kind: "cell",    name: "Whole cell", nucleusId: "a", color: "#40e28c" },
       { structureId: "wc2",  kind: "cell",    name: "Whole cell", nucleusId: "b", color: "#40e28c" },
       { structureId: "nu1",  kind: "nucleus", name: "Nucleus",    nucleusId: "a", color: "#78dadd" }];

  const labels = await p.evaluate(async (CFG) => {
    if (typeof tracedKindsRefresh === "function") await tracedKindsRefresh(true);
    await new Promise(r => setTimeout(r, 800));
    const host = document.getElementById(CFG.box);
    const lab = v => {
      const cb = host && host.querySelector('input[value="' + v + '"]');
      return cb ? (cb.closest("label") || {}).textContent.trim() : null;
    };
    return { cell: lab("__traced_cell"), nuc: lab("__traced_nucleus") };
  }, CFG);

  console.log("the list");
  ok(!!labels.cell, "offers a traced whole cell", labels.cell || "(absent)");
  ok(!!labels.nuc, "...and a traced nucleus", labels.nuc || "(absent)");
  ok(/\b2\b/.test(labels.cell || ""), "...counted as CELLS: two cells, one of them outlined twice",
     labels.cell || "-");
  ok(/\b1\b/.test(labels.nuc || ""), "...and one nucleus", labels.nuc || "-");

  if (CFG.read){
    console.log("\nfiltering on it");
    const hasCell = await preview(["__traced_cell"], "has");
    ok(hasCell.length === 2, "ticking the whole cell and asking “has” matches the two that carry one",
       hasCell.length + ": " + hasCell.slice(0, 6).join(","));
    ok(hasCell.indexOf(A) >= 0 && hasCell.indexOf(B) >= 0, "...and they are the right two, by this page's own ids",
       "wanted " + A + "," + B + " — got " + hasCell.slice(0, 6).join(","));
    const hasNuc = await preview(["__traced_nucleus"], "has");
    ok(hasNuc.length === 1 && hasNuc[0] === A, "...the nucleus one matches its one cell",
       hasNuc.length + ": " + hasNuc.slice(0, 6).join(","));
    const notCell = await preview(["__traced_cell"], "not");
    ok(notCell.length === all.length - 2, "“not annotated yet” matches all the others",
       notCell.length + " of " + all.length);
    /* "Has anything" keeps everything it had, and may have gained the two traced cells — an
       outline IS an annotation, so a cell that had none before and has been outlined since
       belongs in that answer. What it must not do is lose a cell, or gain a third. */
    const again = await preview([], "has");
    const lost = anything.filter(id => again.indexOf(id) < 0);
    const gained = again.filter(id => anything.indexOf(id) < 0);
    ok(lost.length === 0, "and ticking nothing still means “has anything” — nothing lost",
       again.length + " (was " + anything.length + ")"
         + (lost.length ? ", lost " + lost.slice(0, 4).join(",") : ""));
    ok(gained.every(id => id === A || id === B),
       "...and the only cells it can have gained are the two just outlined",
       gained.length ? gained.slice(0, 4).join(",") : "none");
  }

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
