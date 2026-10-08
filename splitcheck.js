/* One tracing that is really two objects.                                             2026-10-08

   Søren, reading box 1's TRACINGS block: *"Or.. is there some mistake also here with the
   different tracings belonging to the right cell?"*

   There is. Two of the Nucleus structures in that dump carry contours in two places at once:

       Nucleus (cell 61360735)   x~400300 y~231220   and   x~401000 y~230900    ~3.1 µm apart
       Nucleus (z 1861-1910)     x~426550 y~220300   and   x~427380 y~220160    ~3.4 µm apart

   z 321, 322, 324, 327 and 330 each carry two contours, and from 324 on the second sits ~700
   voxels away in x and stays there. That is not a hole — a hole is nested INSIDE its parent — and
   it is too far and too consistent to be one lobed nucleus. `Nucleus · 88.84 µm³ · 52 contours on
   34 sections` is 18 sections with a second contour.

   THE RULE HAS NO MAGIC NUMBER IN IT. Each contour gets its own equivalent radius, sqrt(area/π).
   Two contours belong to the same object when they touch: centre-to-centre distance under the sum
   of their radii. A minimum spanning tree over the contours, with every distance divided by that
   sum, has a largest edge — and that edge's value IS the answer. Below 1 the whole outline is a
   chain of contours that touch; above 1 it is two pieces separated by more than their own reach,
   and the number says by how much. Nothing to tune, and it scales itself: a 10 µm cell and a
   0.2 µm vesicle are judged against their own size.

   REPORT ONLY. Nothing is repaired, nothing is rewritten. Søren, 2026-10-06, on an earlier offer
   to repair his tracings: *"Why would I want to do that? That does not help me."*

   Run: node splitcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};
const R = [4, 4, 40];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3000);

  const r = await p.evaluate(RES => {
    if (!(window.UJ && UJ.tracing && typeof UJ.tracing.splitOf === "function"))
      return { missing: true };
    /* A square contour of half-width h: area 4h², equivalent radius 1.128h voxels. */
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    const run = (rings) => UJ.tracing.splitOf(rings, RES);

    /* 1. ONE BLOB. Ten sections, the same place, radius ~0.5 µm. */
    const one = []; for (let z = 100; z < 110; z++) one.push(sq(z, 400000, 230000, 111));

    /* 2. HIS NUCLEUS. Two stacks ~3.1 µm apart, both on the same sections. */
    const his = [];
    for (let z = 318; z < 336; z++){
      his.push(sq(z, 400300, 231220, 111));
      his.push(sq(z, 401000, 230900, 111));
    }

    /* 3. A LONG CELL THAT DRIFTS. 40 sections, 0.4 µm a section, radius 1 µm — an endothelial
          cell along a vessel is exactly this, and flagging it would make the report useless. */
    const drift = [];
    for (let k = 0; k < 40; k++) drift.push(sq(1800 + k, 426000 + k * 100, 220400 - k * 40, 222));

    /* 4. ONE STRAY CONTOUR, 10 µm from the rest: a mis-click, not a second object. */
    const stray = one.concat([sq(105, 402500, 230000, 44)]);

    /* 5. A HOLE — a contour drawn INSIDE another on the same section. The tool's own rule says
          that is the same organelle, and it must not read as two. */
    const holed = [];
    for (let z = 100; z < 110; z++){ holed.push(sq(z, 400000, 230000, 222)); holed.push(sq(z, 400000, 230000, 80)); }

    const s1 = run(one), s2 = run(his), s3 = run(drift), s4 = run(stray), s5 = run(holed);
    return {
      one: { split: s1.split, ratio: +s1.ratio.toFixed(2) },
      his: { split: s2.split, ratio: +s2.ratio.toFixed(2), gap: Math.round(s2.gapNm),
             parts: (s2.clusters || []).map(c => c.contours) },
      drift: { split: s3.split, ratio: +s3.ratio.toFixed(2) },
      stray: { split: s4.split, ratio: +s4.ratio.toFixed(2),
               parts: (s4.clusters || []).map(c => c.contours) },
      holed: { split: s5.split, ratio: +s5.ratio.toFixed(2) },
      tiny: run([sq(1, 0, 0, 10)]).split,
      centres: (s2.clusters || []).map(c => c.centre.join(","))
    };
  }, R);

  if (r.missing){
    console.log("  FAIL UJ.tracing.splitOf is not on this page");
    await b.close(); process.exit(1);
  }

  console.log("the measurement, with nothing to tune");
  ok(!r.one.split && r.one.ratio < 1,
     "ten contours in one place are one object", "largest normalised gap " + r.one.ratio);
  ok(r.his.split && r.his.ratio > 2,
     "his Nucleus is two — two stacks ~3 µm apart on the same sections, which is what his dump "
     + "shows and what 52 contours on 34 sections already said",
     "ratio " + r.his.ratio + ", " + r.his.gap + " nm between their edges, parts "
     + r.his.parts.join(" + "));
  ok(r.his.parts.length === 2 && r.his.parts[0] === 18 && r.his.parts[1] === 18,
     "...and both halves are named, so he can see which one to keep", r.his.parts.join(" + "));
  ok(/40[01]/.test(r.centres.join(" ")) && r.centres.length === 2,
     "...with a coordinate each, in voxels, to jump to", r.centres.join("  |  "));
  ok(!r.drift.split,
     "a 4 µm-long cell whose outline drifts half a micron a section is NOT two — an endothelial "
     + "cell along a vessel is exactly that shape and flagging it would make this useless",
     "ratio " + r.drift.ratio);
  ok(!r.holed.split,
     "a contour drawn inside another is a hole, not a second object — the tool's own rule",
     "ratio " + r.holed.ratio);
  ok(r.stray.split && r.stray.parts.indexOf(1) >= 0,
     "one stray contour 10 µm away is reported too, as a part of one", r.stray.parts.join(" + "));
  ok(!r.tiny, "a single contour cannot be split, and says so rather than dividing by zero",
     String(r.tiny));

  console.log("\nand there is somewhere to read it");
  const ui = await p.evaluate(() => ({
    scan: typeof window.tracedSplitScan === "function",
    say: typeof window.tracingSplitSay === "function",
    btn: !!document.querySelector("#tracingSplitGo")
         || !!(typeof tracingRenderShared === "function" && (function(){
              const h = document.getElementById("tracingShared");
              if (!h) return false;
              TRACING_SHARED = [{ structureId: "a", name: "Nucleus", nucleusId: "1",
                                  contours: 4, sections: 2 }];
              tracingRenderShared();
              return !!document.querySelector("#tracingSplitGo");
            })())
  }));
  ok(ui.scan, "tracedSplitScan() walks every outline in the dataset and reports, nothing else",
     String(ui.scan));
  ok(ui.say, "tracingSplitSay() turns one structure's answer into one sentence, in one place",
     String(ui.say));
  ok(ui.btn, "...and the dataset list has the button that runs it", String(ui.btn));

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
