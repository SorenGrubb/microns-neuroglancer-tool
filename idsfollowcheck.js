/* The tracing card's id boxes follow the cell you look up, as its coordinate boxes do.   2026-09-22

   Søren, with a χJump screenshot: "Segmentation still does not work in xJump". The pad sat on
   Purkinje cell pc_2 (its coordinate had followed the lookup) while the fragment box still held
   22910044733443 -- a fragment of granule cell grc_3500, 440 µm away, from an earlier lookup. The
   overlay painted grc_3500's 99 fragments, correctly found none of them there, and said so. The
   reading was right; the boxes were stale. Since 2026-09-17 the coordinate boxes follow a lookup;
   the id boxes only ever filled when empty.

   Now, whenever the coordinate boxes follow a lookup, the ids follow too -- unless the pad is open
   with contours on it, which belong to the cell they were drawn on.

   Run: node idsfollowcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
async function open(b, page){
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(page));
  await p.waitForTimeout(4000);
  return { p, errors };
}
const boxes = p => p.evaluate(() => ["tracingNucId", "tracingRootId", "tracingCellAt"].map(i => (document.getElementById(i) || {}).value || ""));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  console.log("ujump.html");
  {
    const { p, errors } = await open(b, "ujump.html");
    await p.evaluate(() => { document.getElementById("tracingPanel").open = true;
      document.getElementById("tracingNucId").value = "111"; document.getElementById("tracingRootId").value = "222"; });
    await p.evaluate(() => { CUR_ROOT = "864691135000000001"; CUR_NUCID = "555"; window.CUR_POS = [200000, 150000, 20000]; });
    await p.waitForTimeout(100);
    const got = await boxes(p);
    ok(got[0] === "555" && got[1] === "864691135000000001", "a lookup puts the cell's ids in the boxes, over stale ones", got.join(" | "));
    ok(/200000, ?150000, ?20000/.test(got[2]), "...and its centre in the cell box", got[2]);
    /* Contours on the pad belong to the cell they were drawn on. */
    await p.evaluate(() => { PAD = UJ.tracepad.create(20000); PAD.rings = [{ z: 20000, inst: 0, points: [[1, 1], [9, 1], [9, 9]] }];
      document.getElementById("tracePadWrap").style.display = ""; });
    await p.evaluate(() => { CUR_ROOT = "864691135000000002"; CUR_NUCID = "666"; window.CUR_POS = [210000, 150000, 20000]; });
    await p.waitForTimeout(100);
    const held = await boxes(p);
    ok(held[0] === "555" && held[1] === "864691135000000001", "...but not while the pad has contours on it", held.join(" | "));
    ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
    await p.close();
  }

  console.log("\nxjump.html");
  {
    const { p, errors } = await open(b, "xjump.html");
    const got = await p.evaluate(async () => {
      document.getElementById("tracingPanel").open = true;
      const all = UJ.xjump.seedListAll().filter(r => r.whole && r.pos);
      const a = all[0], c = all[all.length - 1];
      /* The screenshot's state: a fragment of one cell left in the box. */
      document.getElementById("tracingNucId").value = c.key;
      document.getElementById("tracingRootId").value = String(UJ.xjump.seedSegments(c)[0]);
      UJ.app.showFound([{ row: a, nm: 0 }], "");
      await new Promise(r => setTimeout(r, 100));
      return { key: a.key, box: ["tracingNucId", "tracingRootId"].map(i => document.getElementById(i).value) };
    });
    ok(got.box[0] === got.key, "a cell found puts its key in the cell box", got.box[0] + " vs " + got.key);
    ok(got.box[1] === "", "...and clears another cell's fragment from the fragment box", got.box[1] || "(empty)");
    /* With the key alone the overlay still paints the whole cell. */
    const seg = await p.evaluate(async () => {
      let asked = null; const saved = UJ.segpaint.paint;
      UJ.segpaint.paint = async (cv, view, o) => { asked = o; return { cell: { painted: 1, chunks: 1, nmPerVoxel: 32 } }; };
      PAD_VIEW = PAD_VIEW || { x0: 0, y0: 0, w: 10, h: 10, z: 1, mip: 0 };
      const box = document.getElementById("tracePadSeg"); if (box) box.checked = true;
      try { await padSegOverlay(); } catch (e){}
      UJ.segpaint.paint = saved;
      return { n: asked ? 1 + (asked.rootAlso || []).length : 0,
               want: UJ.cfg.tracing.cellIdsFor("", document.getElementById("tracingNucId").value).length,
               say: (document.getElementById("tracePadSegSay") || {}).textContent || "" };
    });
    ok(seg.n > 0 && seg.n === seg.want, "...and the overlay paints every fragment of the cell from its key", seg.n + " of " + seg.want + " " + seg.say.slice(0, 60));
    ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
    await p.close();
  }
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
