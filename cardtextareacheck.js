/* The tracing card's link box is a proper box on every page.                           2026-09-22

   Søren, with a screenshot of ωJump: "This looks weird" -- the Neuroglancer link box was the
   browser's bare 2-row textarea, a quarter of the card wide. ωJump styles its inputs and selects
   but has no textarea rule; the other pages do. The card now carries a default of its own, put
   FIRST in <head> so a page's own textarea rule still wins where it has one.

   Run: node cardtextareacheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const pg of ["wjump.html", "ujump.html", "hjump.html", "xjump.html", "ljump.html"]){
    const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
    await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await p.goto("file://" + page_(pg));
    await p.waitForTimeout(3000);
    const m = await p.evaluate(() => {
      const d = document.getElementById("tracingPanel"); if (d) d.open = true;
      const t = document.getElementById("tracingLink"), c = document.getElementById("tracingCard");
      if (!t || !c) return null;
      const s = getComputedStyle(t), tw = t.getBoundingClientRect().width;
      const cw = (t.parentElement || c).getBoundingClientRect().width;
      return { frac: tw / cw, h: t.getBoundingClientRect().height, bg: s.backgroundColor, radius: s.borderRadius };
    });
    if (!m){ ok(false, pg + ": the card's link box is there"); await p.close(); continue; }
    ok(m.frac > 0.9 && m.h >= 60, pg + ": the link box spans the card and is tall enough to read a link in",
       Math.round(m.frac * 100) + "% wide, " + Math.round(m.h) + " px tall, " + m.bg + ", radius " + m.radius);
    await p.close();
  }
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
