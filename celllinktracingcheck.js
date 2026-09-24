/* The cell's name opens the cell WITH its outline.                                    2026-09-24

   Søren, with a screenshot of an arachnoid barrier cell whose panel says "TRACED ON THIS CELL —
   Whole cell · 675 µm³, 69 contours on 59 sections": "When the cell has a whole cell or nucleus
   segmentation, it should load that when opening Neuroglancer by clicking the cell name."

   It did not. celltypeLink() built a plain href off the cell's position and nothing else, so the
   ↗ beside the name opened the segmentation alone — the one view of that cell that leaves out the
   work he had just done on it. The outline was reachable from three other places on the page and
   not from the obvious one.

   WHY THE IDS RIDE ON THE ANCHOR rather than being read off CUR_NUCID when it is clicked: this
   same link is drawn for sub-cells of a merged detection, for user-reported cells, and for the
   identification result — the name on screen is not always the cell the panel is open on. An
   anchor with no ids is left exactly as it was.

   WHAT IS ASSERTED:
     - the headline anchor carries the cell's own ids
     - clicking it opens a view that has the traced whole cell in it, with contours
     - ...and the nucleus outline too, when there is one
     - the cell's own layers are still there — this adds, it does not replace
     - a cell nobody has traced opens exactly the link it always did, with no extra request
     - a middle-click / ctrl-click is left to the browser

   Run: node celllinktracingcheck.js [page.html]      (default ujump.html) */
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

  let INDEX = [], ROWS = {}, reads = 0;
  const ring = (z, x0, y0) => ({ z: z, ringIndex: 0,
    points: [[x0, y0], [x0 + 60, y0], [x0 + 60, y0 + 60], [x0, y0 + 60]].map(q => q.join(",")).join(";") });
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("tracings") !== "1") return route.abort();
    const sid = u.searchParams.get("structureId") || u.searchParams.get("structureIds");
    if (sid){
      reads++;
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ tracings: String(sid).split(",").map(s => ({ structureId: s, rows: ROWS[s] || [] })) }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json",
                           body: JSON.stringify({ tracings: INDEX }) });
  });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(6000);

  /* Two real cells of this page: one that will be traced, one that will not. */
  const cells = await p.evaluate(() => ({
    A: { nuc: String(NID[0]), pos: [NX[0], NY[0], NZ[0]] },
    B: { nuc: String(NID[1]), pos: [NX[1], NY[1], NZ[1]] }
  }));
  console.log(PAGE + "\ntraced cell " + cells.A.nuc + ", untraced cell " + cells.B.nuc + "\n");

  INDEX = [
    { structureId: "wc1", kind: "cell",    name: "Whole cell", nucleusId: cells.A.nuc, color: "#40e28c" },
    { structureId: "nu1", kind: "nucleus", name: "Nucleus",    nucleusId: cells.A.nuc, color: "#78dadd" }
  ];
  ROWS = {
    wc1: [{ structureId: "wc1", kind: "cell", instanceOf: "", name: "Whole cell", color: "#40e28c",
            nucleusId: cells.A.nuc, ringIndex: 0, z: ring(1000).z, points: ring(1000, 5000, 6000).points }],
    nu1: [{ structureId: "nu1", kind: "nucleus", instanceOf: "", name: "Nucleus", color: "#78dadd",
            nucleusId: cells.A.nuc, ringIndex: 0, z: ring(1001).z, points: ring(1001, 5100, 6100).points }]
  };

  const show = async (c) => p.evaluate(async (c) => {
    if (typeof tracedKindsRefresh === "function") await tracedKindsRefresh(true);
    document.getElementById("x").value = c.pos[0];
    document.getElementById("y").value = c.pos[1];
    document.getElementById("z").value = c.pos[2];
    document.getElementById("go").click();
    await new Promise(r => setTimeout(r, 2500));
    const a = document.querySelector("#ctHeadline a") || document.querySelector(".celltype a");
    return a ? { has: true, nuc: a.dataset.nuc || "", root: a.dataset.root || "",
                 cls: a.className || "", href: (a.getAttribute("href") || "").slice(0, 30) } : { has: false };
  }, c);

  /* The anchor is target="_blank", so an UNINTERCEPTED click opens a popup and never navigates
     the harness away; an intercepted one goes through the stubbed window.open instead. That is
     the difference this reads, and it is the difference that matters. */
  const popups = [];
  p.on("popup", pg => { popups.push(pg.url()); pg.close().catch(() => {}); });

  const click = async (mods, waitMs) => p.evaluate(async ([mods, waitMs]) => {
    window.__opened = null;
    window.open = function(u){
      /* The real code opens a blank tab FIRST and navigates it, so BOTH shapes are recorded:
         window.open(url) and win.location.href = url on the tab it got back. */
      if (u) window.__opened = u;
      const tab = { opener: null };
      Object.defineProperty(tab, "location", {
        get(){ return { set href(v){ window.__opened = v; }, get href(){ return window.__opened; } }; },
        set(v){ window.__opened = String(v); }
      });
      return tab;
    };
    const a = document.querySelector("#ctHeadline a") || document.querySelector(".celltype a");
    if (!a) return { none: true };
    a.dispatchEvent(new MouseEvent("click", Object.assign({ bubbles: true, cancelable: true }, mods || {})));
    const t0 = Date.now();
    while (Date.now() - t0 < (waitMs || 20000) && !window.__opened) await new Promise(r => setTimeout(r, 150));
    const u = window.__opened;
    if (!u) return { none: true };
    const k = u.indexOf("#!");
    if (k < 0) return { url: u.slice(0, 60), layers: [], anns: 0 };
    let st = null;
    try { st = JSON.parse(decodeURIComponent(u.slice(k + 2))); } catch (e){ return { bad: true, url: u.slice(0, 60) }; }
    const traced = (st.layers || []).filter(l => /^traced /.test(l.name || ""));
    return { layers: (st.layers || []).map(l => l.name || l.type),
             traced: traced.map(l => l.name),
             anns: traced.reduce((a, l) => a + ((l.annotations || []).length), 0) };
  }, [mods, waitMs]);

  const A = await show(cells.A);
  console.log("the traced cell");
  ok(A.has, "its name is a link", A.has ? A.href + "…" : "(no anchor)");
  ok(A.has && A.nuc === cells.A.nuc, "...carrying the cell's own nucleus id",
     A.nuc || "(none)");
  const opened = await click(null);
  ok(!opened.none && !opened.bad, "clicking it opens a view", opened.none ? "nothing opened" : (opened.url || "ok"));
  ok(!!(opened.traced || []).some(n => /whole cell/i.test(n)),
     "...with the traced whole cell in it", (opened.traced || []).join(" | ") || "(no traced layers)");
  ok(!!(opened.traced || []).some(n => /nucleus/i.test(n)),
     "...and the traced nucleus", (opened.traced || []).join(" | ") || "(none)");
  ok((opened.anns || 0) > 0, "...drawn, not empty", (opened.anns || 0) + " annotation(s)");
  ok((opened.layers || []).length > (opened.traced || []).length,
     "...on top of the layers the link always had — this adds, it does not replace",
     (opened.layers || []).join(" | ").slice(0, 120));

  console.log("\nand a cell nobody has traced");
  await show(cells.B);
  const readsBefore = reads, popsBefore = popups.length;
  const plain = await click(null, 3000);
  await p.waitForTimeout(700);
  ok(plain.none, "opens the plain link, untouched — the page does not step in",
     plain.none ? "not intercepted" : "intercepted: " + (plain.traced || []).join(","));
  ok(popups.length > popsBefore, "...and the browser really opened it",
     (popups.length - popsBefore) + " tab(s)");
  ok(reads === readsBefore, "...without reading a single outline file",
     (reads - readsBefore) + " read(s)");

  console.log("\nand the browser keeps its own shortcuts");
  await show(cells.A);
  const ctrl = await click({ ctrlKey: true }, 3000);
  ok(ctrl.none, "ctrl+click on a traced cell is left alone — the browser opens the plain link",
     ctrl.none ? "not intercepted" : "intercepted");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
