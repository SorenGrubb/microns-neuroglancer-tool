/* The viewer tab is taken at the click, not after the fetch.                         2026-09-22

   Søren, on the kept list's Neuroglancer button: "the Neuroglancer window is still blocked. Why?"

   Because a browser only allows window.open in the turn the click happened in. The pad's own
   button opens straight away and works; the list's buttons read the tracing from the dataset
   first, so their window.open landed a fetch later and Chrome blocked it as a pop-up.

   So the tab is RESERVED at the click -- opened blank, with a line saying what is coming -- and
   sent to the link once the geometry is in. This drives the real handlers with a fetch that
   resolves on a later turn and asserts the open happened before it.

   Run: node popuptabcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  const got = await p.evaluate(async () => {
    document.getElementById("tracingPanel").open = true;
    /* One tracing in the dataset, answered a turn later, the way the backend does. */
    const rows = [];
    for (let s = 0; s < 3; s++)
      for (let i = 0; i < 12; i++)
        rows.push({ structureId: "s1", name: "Whole cell", kind: "cell", nucleusId: "286849",
                    z: 700 + s, ringIndex: 0,
                    points: Array.from({ length: 12 }, (_, k) =>
                      Math.round(5000 + 100 * Math.cos(k / 2)) + "," + Math.round(4000 + 100 * Math.sin(k / 2))).join(";") });
    const savedFetch = window.fetch;
    window.fetch = async () => { await new Promise(r => setTimeout(r, 120));
      return { json: async () => ({ tracings: [{ structureId: "s1", name: "Whole cell", nucleusId: "286849", rows: rows }] }) }; };
    const opened = [];
    let afterClick = false;
    const savedOpen = window.open;
    window.open = (u) => { const w = { closed: false, opener: {}, document: { write(){}, close(){} },
                                       location: { set href(v){ w.__href = v; }, get href(){ return w.__href || ""; } } };
      opened.push({ url: String(u || ""), afterClick, win: w }); return w; };
    /* The click's turn: everything synchronous the handler does. */
    const done = tracingSharedInViewer("s1", null);
    afterClick = true;
    await done;
    await new Promise(r => setTimeout(r, 200));
    window.open = savedOpen; window.fetch = savedFetch;
    return { n: opened.length,
             first: opened[0] ? { url: opened[0].url.slice(0, 40), afterClick: opened[0].afterClick } : null,
             sent: opened[0] ? String(opened[0].win.__href || "").slice(0, 60) : "",
             later: opened.filter(o => o.afterClick).length };
  });
  console.log("a tracing read from the dataset, then looked at");
  ok(got.n >= 1, "a tab is opened", got.n);
  ok(got.first && got.first.afterClick === false,
     "...in the turn the click happened in, which is the only turn a browser allows",
     JSON.stringify(got.first));
  ok(/#!/.test(got.sent), "...and it is sent to the viewer link once the contours are in", got.sent);
  ok(got.later === 0, "...and nothing is opened after the fetch, which is what was blocked", got.later);

  console.log("\nand when the browser blocks it anyway");
  const blocked = await p.evaluate(async () => {
    const savedOpen = window.open;
    window.open = () => null;                     // what a pop-up blocker returns
    try { tracingViewerOpen([{ name: "x", color: "#40e28c",
      rings: [{ z: 700, points: [[10, 10], [90, 10], [90, 90]] },
              { z: 705, points: [[10, 10], [90, 10], [90, 90]] }] }], null, {}); } catch (e){}
    await new Promise(r => setTimeout(r, 300));
    window.open = savedOpen;
    return { say: document.getElementById("tracingStatus").innerText,
             copy: !!document.getElementById("tracingCopyState") };
  });
  ok(/blocked|pop-?up/i.test(blocked.say), "it says the browser blocked the tab", blocked.say.slice(0, 120));
  ok(blocked.copy, "...and offers the JSON to paste instead", blocked.copy);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
