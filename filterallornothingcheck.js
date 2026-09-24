/* All of them, or the JSON — not a quiet handful.                                     2026-09-24

   Søren: "I asked that if the Filter and show fails to make a neuroglancer instance with all of the
   whole cell segmentations, it would offer the user to download a json instead to paste themselves
   into Neuroglancer. However, what it does now is give an error message and then open Neuroglancer
   with fewer whole cell segmentations. That was not the point."

   He is right, and the two halves were working against each other. buildTracedOrganelleLayers had a
   budget of its own — FILTER_TRACE_BUDGET, 1,200,000 characters — and DROPPED whole outlines to
   stay under it, so by the time the link was composed it always fitted. The offer measures the
   composed link, so the offer never fired: the view opened, short of the outlines he asked for,
   with a toast about it.

   A budget that makes the link fit by leaving things out is exactly the behaviour the offer exists
   to replace. So the builder now builds everything it was asked for, and the caller measures: it
   opens when all of it fits, and hands over the state when it does not. Nothing in between.

   WHAT IS ASSERTED:
     - outlines too big for one link: NOTHING is opened, and the offer appears
     - ...and the state it hands over carries EVERY outline, not the ones that happened to fit
     - ...and nothing claims some were left out
     - when they all fit, it opens, with all of them, and says nothing

   Run: node filterallornothingcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* Six whole cells, sixty contours each, forty points a contour. As line annotations — which is what
   µJump's viewer takes — that is about 2.6 million characters, comfortably past the 1,200,000 the
   builder used to allow itself, which is what made it drop some. */
const CELLS = 6, RINGS = 60, PTS = 40;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });

  let INDEX = [], ROWS = {};
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("tracings") !== "1") return route.abort();
    const sid = u.searchParams.get("structureId") || u.searchParams.get("structureIds");
    if (sid) return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ tracings: String(sid).split(",").map(s => ({ structureId: s, rows: ROWS[s] || [] })) }) });
    return route.fulfill({ status: 200, contentType: "application/json",
                           body: JSON.stringify({ tracings: INDEX }) });
  });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(6000);

  /* Cells the preview really matched: an outline on a cell the filter never returns proves nothing. */
  const nucs = await p.evaluate(async () => {
    document.getElementById("filterRun").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000){
      await new Promise(r => setTimeout(r, 300));
      const v = document.getElementById("filterViewerAll");
      if (v && !v.disabled) break;
    }
    const m = UJ.stepthrough.currentMatches() || [];
    return m.map(x => { const r = x.row;
      return r.space === "MS" ? String(r.subRef.nucleusId || "")
           : (r.space === "N" ? String(NID[r.i]) : ""); }).filter(Boolean).slice(0, 12);
  });
  if (nucs.length < CELLS){ console.log("too few matched cells: " + nucs.length); process.exit(1); }
  console.log(PAGE + "\nseeding " + CELLS + " whole cells of " + RINGS + " contours on "
              + nucs.slice(0, CELLS).join(", ") + "\n");

  INDEX = []; ROWS = {};
  for (let c = 0; c < CELLS; c++){
    const sid = "wc" + c;
    INDEX.push({ structureId: sid, kind: "cell", instanceOf: "", name: "Whole cell",
                 nucleusId: nucs[c], color: "#40e28c" });
    ROWS[sid] = [];
    for (let z = 0; z < RINGS; z++){
      const pts = [];
      for (let i = 0; i < PTS; i++){
        const a = 2 * Math.PI * i / PTS;
        pts.push(Math.round(100000 + c * 9000 + 1200 * Math.cos(a)) + ","
               + Math.round(140000 + 1200 * Math.sin(a)));
      }
      ROWS[sid].push({ structureId: sid, kind: "cell", instanceOf: "", name: "Whole cell",
                       color: "#40e28c", nucleusId: nucs[c], ringIndex: 0,
                       z: 20000 + z, points: pts.join(";") });
    }
  }
  /* This viewer takes no polylines, so a contour of forty points is forty line annotations. That
     is the number that has to survive: anything less means an outline was left out. */
  const WANT = CELLS * RINGS * PTS;

  const press = async (limit) => p.evaluate(async (limit) => {
    window.__opened = null; window.__toasts = []; window.__savedBlob = null;
    window.open = function(u){ if (u) window.__opened = u;
      const tab = { opener: null, close: function(){} };
      Object.defineProperty(tab, "location", {
        get(){ return { set href(v){ window.__opened = v; }, get href(){ return window.__opened; } }; },
        set(v){ window.__opened = String(v); } });
      return tab; };
    if (typeof showSubmitToast === "function"){
      const real = showSubmitToast;
      window.showSubmitToast = function(okFlag, msg){ window.__toasts.push(String(msg || "")); };
      try { showSubmitToast = window.showSubmitToast; } catch (_e){}
    }
    /* A long-but-openable link still asks "this may load slowly"; Playwright dismisses an
       unstubbed dialog, which reads here as "it did not open". */
    window.confirm = function(m){ window.__confirms = (window.__confirms || []).concat(String(m || "")); return true; };
    const realURL = URL.createObjectURL;
    URL.createObjectURL = function(blob){ window.__savedBlob = blob; return realURL.call(URL, blob); };
    window.JUMP_LINK_MAX = limit;
    const sel = document.getElementById("filterOrganSeg");
    if (sel){
      /* The picker fills itself from the index when it is reached for. */
      if (typeof fillOrganSegKinds === "function"){ FILTER_ORGAN_SEG_FILLED = false; await fillOrganSegKinds(); }
      sel.value = "__cells";
    }
    const old = document.querySelector(".jsonoffer");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    /* Previewed again each time: the button carries state from the last press. */
    if (typeof invalidateFilterResult === "function") invalidateFilterResult();
    document.getElementById("filterRun").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 60000){
      await new Promise(r => setTimeout(r, 300));
      const v = document.getElementById("filterViewerAll");
      if (v && !v.disabled) break;
    }
    await new Promise(r => setTimeout(r, 300));
    const vab = document.getElementById("filterViewerAll");
    try { delete vab.dataset.busy; } catch (_e){}      // the last press may have left it set
    vab.disabled = false;
    vab.click();
    const t1 = Date.now();
    while (Date.now() - t1 < 90000){
      await new Promise(r => setTimeout(r, 250));
      if (window.__opened) break;
      if (document.querySelector(".jsonoffer")) break;
    }
    await new Promise(r => setTimeout(r, 600));
    const panel = document.querySelector(".jsonoffer");
    let out = { opened: window.__opened ? window.__opened.length : 0,
                panel: !!panel, toasts: window.__toasts.slice(),
                pick: sel ? sel.value : "(no picker)" };
    /* How many traced annotations reached the state, whichever way it went. */
    const count = (st) => {
      const traced = (st.layers || []).filter(l => /^traced /.test(l.name || ""));
      return { layers: traced.map(l => l.name),
               anns: traced.reduce((a, l) => a + ((l.annotations || []).length), 0) };
    };
    if (panel){
      const d = [].filter.call(panel.querySelectorAll("button"), x => /download/i.test(x.textContent))[0];
      if (d){
        d.click();
        await new Promise(r => setTimeout(r, 400));
        if (window.__savedBlob){
          const txt = await window.__savedBlob.text();
          try { Object.assign(out, count(JSON.parse(txt)), { chars: txt.length }); } catch (_e){}
        }
      }
      out.text = String(panel.textContent || "");
    } else if (window.__opened){
      const u = window.__opened, k = u.indexOf("#!");
      if (k >= 0){ try { Object.assign(out, count(JSON.parse(decodeURIComponent(u.slice(k + 2))))); } catch (_e){} }
    }
    return out;
  }, limit);

  console.log("more outlines than one link can carry");
  const big = await press(400000);
  ok(big.pick === "__cells", "the whole cells are what was picked", big.pick);
  ok(big.opened === 0, "NOTHING is opened — not a view with fewer cells in it",
     big.opened ? big.opened + " characters opened" : "nothing opened");
  ok(big.panel, "...the JSON is offered instead", big.panel ? "shown" : "no .jsonoffer panel");
  ok((big.anns || 0) >= WANT, "...and the state it hands over carries EVERY outline",
     (big.anns || 0) + " of " + WANT + " annotation(s)");
  ok(!/left\s+\d+\s+outline|out of the view|fewer/i.test((big.toasts || []).join(" ")),
     "...and nothing says some were left out, because none were",
     (big.toasts || []).join(" | ").slice(0, 160) || "(no toast)");

  console.log("\nand when they all fit");
  const fits = await press(50000000);
  ok(fits.opened > 0, "it opens", fits.opened ? fits.opened + " characters" : "nothing opened");
  ok(!fits.panel, "...with no offer, because there is nothing to offer", fits.panel ? "offered anyway" : "no panel");
  ok((fits.anns || 0) >= WANT, "...and every outline is in it",
     (fits.anns || 0) + " of " + WANT + " annotation(s)");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
