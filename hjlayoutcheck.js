/* ηJump: the EM section sits beside the layer wedge, and the IDs below both.           2026-09-21

   Søren: "I would prefer the EM next to the model and the other things below, like for the other
   tools." The section was stacked under the wedge in the left column, with the IDs beside them.

   Run: node hjlayoutcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("hjump.html"));
  await p.waitForTimeout(4000);
  const got = await p.evaluate(async () => {
    jumpToIndex(0);
    await new Promise(r => setTimeout(r, 800));
    const em = document.getElementById("emPlaneBox");
    const wedge = em && [...document.querySelectorAll("#nucpanel svg")].filter(s => /L1|pia/i.test(s.textContent))[0];
    const ids = document.querySelector("#nucpanel .ids");
    if (!em || !wedge || !ids) return { skip: [!!em, !!wedge, !!ids].join("/") };
    const e = em.getBoundingClientRect(), w = wedge.getBoundingClientRect(), i = ids.getBoundingClientRect();
    return { eL: Math.round(e.left), wR: Math.round(w.right), eT: Math.round(e.top), wT: Math.round(w.top),
             iT: Math.round(i.top), eB: Math.round(e.bottom), wB: Math.round(w.bottom) };
  });
  console.log("hjump.html\n");
  if (got.skip) ok(false, "the panel has its wedge, section and IDs", got.skip);
  else {
    ok(got.eL >= got.wR && Math.abs(got.eT - got.wT) < 80, "the EM section is beside the layer wedge", JSON.stringify(got));
    ok(got.iT >= Math.max(got.eB, got.wB) - 2, "...and the IDs are below both", got.iT + " vs " + Math.max(got.eB, got.wB));
  }
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
