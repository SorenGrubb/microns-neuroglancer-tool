/* Tips across the top of the tracing pad's EM panel, with a tick to turn them off.     2026-09-22

   Søren: "We need a tip function where tips about navigating the tracing panel are shown in the
   top of the em panel, and a tick in the left side that can turn it off. Also, mix in tips of
   identifying organelles and how they can send suggestions to change the tools to me."

   Run: node padtipscheck.js [page ...]     (default ujump.html wjump.html ljump.html xjump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["ujump.html", "wjump.html", "ljump.html", "xjump.html"];
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const pg of PAGES){
    console.log("\n" + pg);
    const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
    const errors = [];
    p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
    await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await p.goto("file://" + page_(pg));
    await p.waitForTimeout(3500);
    const g = await p.evaluate(() => {
      const d = document.getElementById("tracingPanel"); if (d) d.open = true;
      document.getElementById("tracePadWrap").style.display = "";
      const bar = document.getElementById("tracePadTipBar"), cv = document.getElementById("tracePad");
      if (!bar) return { bar: false };
      try { padTipsStart(); } catch (e){ return { bar: true, err: String(e) }; }
      const tick = document.getElementById("tracePadTips"), tip = document.getElementById("tracePadTip");
      const all = padTipList().map(t => t.html);
      const first = tip.innerHTML;
      document.getElementById("tracePadTipNext").click();
      const second = tip.innerHTML;
      /* Above the picture, in the same frame. */
      const frame = cv.parentElement;
      const above = bar.parentElement === frame && bar.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING;
      /* Left side: the tick comes before the text. */
      const leftTick = tick.getBoundingClientRect().left < tip.getBoundingClientRect().left;
      tick.checked = false; tick.dispatchEvent(new Event("change", { bubbles: true }));
      const offShown = tip.offsetParent !== null, tickShown = tick.offsetParent !== null;
      const stored = tracingStore().getItem("jump_pad_tips_off_v1");
      return { bar: true, first, second, above: !!above, leftTick, offShown, tickShown, stored, n: all.length,
               kinds: padTipList().reduce((o, t) => (o[t.kind] = (o[t.kind] || 0) + 1, o), {}),
               mail: all.filter(h => /mailto:soren@grubb\.dk/.test(h)).length,
               organRef: all.filter(h => /drjastrow\.de|ncbi\.nlm\.nih\.gov/.test(h)).length,
               segTick: !!document.getElementById("tracePadSeg"),
               segTips: all.filter(h => /show the segmentation/i.test(h)).length };
    });
    if (!g.bar){ ok(false, "a tip bar in the EM panel"); await p.close(); continue; }
    ok(!g.err, "tips start", g.err || "ok");
    ok(g.above, "the bar is across the top of the EM panel, above the section");
    ok(g.leftTick, "...with its tick on the left");
    ok(g.first && g.second && g.first !== g.second, "a tip shows, and › moves to another", (g.first || "").replace(/<[^>]+>/g, "").slice(0, 70));
    ok((g.kinds.nav || 0) >= 8 && (g.kinds.organelle || 0) >= 8 && (g.kinds.suggest || 0) >= 1,
       "navigating, identifying organelles, and suggestions are all among them", JSON.stringify(g.kinds));
    ok(g.mail >= 1, "...and the suggestion tip mails Søren", g.mail);
    ok(g.organRef >= 8, "...and organelle tips point to where to check them", g.organRef);
    ok(g.segTick || g.segTips === 0, "no tip about a control this page does not have", "segmentation tick " + g.segTick + ", tips about it " + g.segTips);
    ok(!g.offShown && g.tickShown, "unticked, the tips go and the tick stays, to turn them back on");
    ok(g.stored === "1", "...and it is remembered", g.stored);
    ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
    await p.close();
  }
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
