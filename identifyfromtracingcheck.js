/* Outlining a whole cell is identifying it.                                           2026-09-24

   Søren: "When submitting a whole cell segmentation for an unclassified cell, where you specify
   which cell it is, you should be prompted of how certain you are and then the cell should change
   name to the name you put in and you should be credited with the identification. It is tedious
   that I have to both identify the cell when I input segmentation and then afterwards also
   identify it again."

   He is right that it was said twice. The tracing card already asks which cell this is -- the
   #tracingType dropdown, which is the identification tree's own leaf list -- and writes it into
   the tracing's row as `cellType`. But that column is a label on the outline; it is not an
   identification of the cell, so the headline kept saying "Unclassified", nobody was credited,
   and the only way to fix that was to walk the guided identification afterwards and say the same
   thing again.

   The one thing the tracing card does NOT have is how sure he is. An identification without a
   certainty is not one this dataset accepts -- the 1-5 rating is what breaks ties between
   competing names (see core/panel.js's tally) -- so that is the one question the offer asks.

   WHAT IS ASSERTED:
     - saving a whole-cell outline on an unclassified cell offers to identify it, by the name picked
     - it will not submit without a certainty
     - pressing it posts ONE new_identification carrying the name, the certainty and both ids
     - ...with a comment saying it came from the outline, so the row explains itself
     - ...and the panel is asked to re-read the community names, which is what renames the cell
     - saving the same outline again does not ask again
     - a cell that already has a name is not asked about at all
     - an ORGANELLE outline is not: a lysosome is not a claim about the cell
     - nothing is offered when the type was filled in by the page rather than chosen

   Run: node identifyfromtracingcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(4000);

  /* A cell this dataset genuinely has no name for, and one it does — found in the page's own
     tables rather than chosen by hand, so the check cannot drift from what the tool believes. */
  const cells = await p.evaluate(() => {
    let unknown = null, known = null;
    for (let i = 0; i < NID.length && (!unknown || !known); i++){
      const own = (typeof OWN_TYPE !== "undefined") ? OWN_TYPE[i] : 255;
      const comm = (window.__COMM_ROWTYPE || {})[String(NID[i])];
      if (!unknown && !NT[i] && own === 255 && !comm) unknown = String(NID[i]);
      if (!known && NT[i]) known = String(NID[i]);
    }
    return { unknown, known };
  });
  if (!cells.unknown || !cells.known){ console.log("no usable cells: " + JSON.stringify(cells)); process.exit(1); }
  console.log("unclassified cell " + cells.unknown + ", classified cell " + cells.known + "\n");

  const drive = async (arg) => p.evaluate(([arg]) => {
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "x";
    if (!window.__SENT){
      window.__SENT = [];
      window.__REREAD = [];
      postReport = function(pl){ window.__SENT.push(pl); return Promise.resolve({ ok: true }); };
      tracingRegisterCentre = function(){ return false; };   // its own path, its own rule
      loadCommunityReports = function(nid){ window.__REREAD.push(String(nid)); };
    }
    const ringsFor = (n, x0) => {
      const out = [];
      for (let z = 0; z < n; z++){
        const pts = [];
        for (let i = 0; i < 24; i++){
          const a = 2 * Math.PI * i / 24;
          pts.push([Math.round(x0 + 900 * Math.cos(a)), Math.round(151000 + 900 * Math.sin(a))]);
        }
        out.push({ z: 18000 + z, points: pts, inst: 0 });
      }
      return out;
    };
    TRACING_PENDING = { rings: ringsFor(arg.n || 20, arg.x0 || 295000) };
    TRACING_BASE_ID = "";
    try { PAD_EDIT_ID = ""; PAD_EDIT_IDS = {}; } catch (_e){}
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set("tracingWhat", arg.what); set("tracingName", arg.name);
    set("tracingType", arg.type); set("tracingNucId", arg.nuc);
    set("tracingRootId", arg.root || "");
    set("tracingX", ""); set("tracingY", ""); set("tracingZ", "");
    TRACING_TYPE_TOUCHED = !!arg.touched;
    const before = window.__SENT.length;
    tracingKeep();
    const panel = document.getElementById("tracingIdOffer");
    return { posted: window.__SENT.length - before,
             offer: panel ? (panel.textContent || "").replace(/\s+/g, " ").trim() : null,
             pills: panel ? panel.querySelectorAll(".tid-cert").length : 0,
             go: !!(panel && panel.querySelector("#tracingIdGo")) };
  }, [arg]);

  const WHOLE = { what: "__cell", name: "Whole cell", type: "Arachnoid barrier cell", touched: true };

  console.log("a whole cell outlined on a cell nobody has named");
  const a = await drive(Object.assign({}, WHOLE, { nuc: cells.unknown, n: 20, x0: 295000 }));
  ok(!!a.offer, "the card offers to identify it", a.offer ? a.offer.slice(0, 120) : "(no offer)");
  ok(!!a.offer && /arachnoid barrier cell/i.test(a.offer),
     "...by the name that was picked", (a.offer || "").slice(0, 120));
  ok(a.pills === 5, "...and asks how certain, 1 to 5", a.pills + " pill(s)");

  /* Guarded, so a missing panel reports every assertion below as a failure rather than throwing
     on the first click and hiding the rest. */
  const noCert = await p.evaluate(() => {
    const go = document.getElementById("tracingIdGo"), panel = document.getElementById("tracingIdOffer");
    if (!go) return { posted: 0, said: "(no offer)", none: true };
    const before = window.__SENT.length;
    go.click();
    return { posted: window.__SENT.length - before,
             said: (panel.textContent || "").replace(/\s+/g, " ") };
  });
  ok(noCert.posted === 0, "it will not submit without a certainty", noCert.posted + " post(s)");
  ok(/certain/i.test(noCert.said), "...and says so", noCert.said.slice(-110));

  const sub = await p.evaluate(async () => {
    const before = window.__SENT.length, reread = window.__REREAD.length;
    const pill = document.querySelector('.tid-cert[data-val="4"]');
    const go = document.getElementById("tracingIdGo");
    if (!pill || !go) return { posted: 0, last: null, rereads: [], said: "(no offer)", none: true };
    pill.click();
    go.click();
    /* The re-read that renames the cell is deliberately delayed — Apps Script needs a moment to
       append the row before a GET would see it — so this waits for it rather than pretending the
       rename is synchronous. */
    await new Promise(r => setTimeout(r, 3200));
    const panel = document.getElementById("tracingIdOffer");
    return { posted: window.__SENT.length - before, last: window.__SENT[window.__SENT.length - 1] || null,
             rereads: window.__REREAD.slice(reread),
             said: ((panel && panel.textContent) || "").replace(/\s+/g, " ") };
  });
  console.log("\nand submitting it");
  ok(sub.posted === 1, "posts exactly one report", sub.posted + " post(s)");
  const L = sub.last || {};
  ok(L.type === "new_identification", "...a new identification, since nothing was on file", L.type || "(none)");
  ok(String(L.identified || "").toLowerCase() === "arachnoid barrier cell",
     "...carrying the name", L.identified || "(none)");
  ok(String(L.certainty) === "4", "...and the certainty he picked", String(L.certainty));
  ok(String(L.nucleusId) === cells.unknown, "...filed against the cell", L.nucleusId || "(none)");
  ok(/outline|traced|segmentation/i.test(String(L.comment || "")),
     "...with a comment saying where the identification came from",
     String(L.comment || "").slice(0, 130) || "(none)");
  ok(sub.posted === 1 && !sub.none,
     "...and it goes through postReport, which is what attaches the credit",
     sub.none ? "no offer to press" : "one post");
  ok(sub.rereads.indexOf(cells.unknown) >= 0,
     "the panel is asked to re-read the community names — which is what renames the cell",
     sub.rereads.join(",") || "(not asked)");
  ok(/thank|identified|named/i.test(sub.said), "...and the card says it landed", sub.said.slice(-120));

  console.log("\nand it is not asked twice");
  const b2 = await drive(Object.assign({}, WHOLE, { nuc: cells.unknown, n: 20, x0: 295000 }));
  ok(!b2.offer, "saving the same outline again does not offer again", b2.offer ? b2.offer.slice(0, 90) : "no offer");

  console.log("\nthe cases it must stay out of");
  const known = await drive(Object.assign({}, WHOLE, { nuc: cells.known, n: 20, x0: 296000 }));
  ok(!known.offer, "a cell that already has a name is not asked about",
     known.offer ? known.offer.slice(0, 90) : "no offer");
  const organ = await drive({ what: "__other", name: "Lysosome 1", type: "Microglia",
                              nuc: cells.unknown, n: 12, x0: 297000, touched: true });
  ok(!organ.offer, "an organelle outline is not a claim about the cell",
     organ.offer ? organ.offer.slice(0, 90) : "no offer");
  const untouched = await drive(Object.assign({}, WHOLE, { nuc: cells.unknown, n: 20, x0: 298000, touched: false }));
  ok(!untouched.offer, "and a type the PAGE filled in is never submitted as his identification",
     untouched.offer ? untouched.offer.slice(0, 90) : "no offer");
  /* ωJump and χJump answer "what is this cell" through UJ.cfg.tracing.identityFor, and neither
     backend has a new_identification to send one to. The rule is asserted here rather than by
     loading those two pages, because it IS the rule: a host that answers the identity question
     itself is a host this offer stays out of. */
  const hooked = await p.evaluate(async () => {
    UJ.cfg = UJ.cfg || {}; UJ.cfg.tracing = UJ.cfg.tracing || {};
    UJ.cfg.tracing.identityFor = function(){ return { name: "", how: "not named yet",
                                                      via: "x", nucleusId: "1", rootId: "" }; };
  });
  const viaHook = await drive(Object.assign({}, WHOLE, { nuc: cells.unknown, n: 20, x0: 299000 }));
  await p.evaluate(() => { delete UJ.cfg.tracing.identityFor; });
  ok(!viaHook.offer, "a tool whose host answers the identity question is left out of this entirely",
     viaHook.offer ? viaHook.offer.slice(0, 90) : "no offer");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
