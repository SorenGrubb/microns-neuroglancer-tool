/* Redundant contour points are dropped on the way to the viewer.                      2026-09-22

   Søren: "Could we reduce the number of annotation points when they seem redundant?"

   A contour drawn with a pen is sampled by the pointer, not by the shape: a straight stretch of
   membrane arrives as twenty points that a line of two would draw identically. On a viewer with no
   polyline type each of those twenty is its own annotation, which is how a whole cell reached the
   2 MiB the browser refuses (see linksizecheck.js).

   WHAT IS ASSERTED, and the reason each one is here:
     - a straight run collapses to its two ends                    (the redundancy he means)
     - no point of the drawn outline moves more than the tolerance (it must not redraw the cell)
     - the enclosed AREA is within a fraction of a percent          (volumes are computed from these)
     - a square keeps its four corners                              (a corner is not redundant)
     - a triangle, and anything under six points, is left alone     (nothing to gain, much to lose)
     - the stored tracing is NOT touched — only what goes in the link

   The tolerance is in VOXELS of the space the contour is stored in, default 0.5 — half a voxel at
   the level it was drawn at, which is below what the screen can show.

   Run: node simplifycheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  const got = await p.evaluate(() => {
    const S = UJ.tracing.simplifyRings;
    function area(pts){
      let a = 0;
      for (let i = 0; i < pts.length; i++){
        const q = pts[i], r = pts[(i + 1) % pts.length];
        a += q[0] * r[1] - r[0] * q[1];
      }
      return Math.abs(a) / 2;
    }
    /* The largest distance from any ORIGINAL point to the simplified outline: what "no point moves
       more than the tolerance" actually means for a polyline. */
    function maxDev(orig, simp){
      let worst = 0;
      for (const q of orig){
        let best = Infinity;
        for (let i = 0; i < simp.length; i++){
          const a = simp[i], c = simp[(i + 1) % simp.length];
          const dx = c[0] - a[0], dy = c[1] - a[1], L2 = dx * dx + dy * dy;
          let t = L2 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = a[0] + t * dx - q[0], ey = a[1] + t * dy - q[1];
          best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
        }
        worst = Math.max(worst, best);
      }
      return worst;
    }

    /* A pen-drawn circle: 400 points where the shape needs a few dozen. */
    const circle = [];
    for (let i = 0; i < 400; i++){
      const a = 2 * Math.PI * i / 400;
      circle.push([Math.round(295000 + 300 * Math.cos(a)), Math.round(151000 + 300 * Math.sin(a))]);
    }
    /* A straight run, sampled every voxel, with one real corner at the end. */
    const straight = [];
    for (let i = 0; i <= 40; i++) straight.push([1000 + i, 2000]);
    for (let i = 1; i <= 40; i++) straight.push([1040, 2000 + i]);
    for (let i = 1; i <= 40; i++) straight.push([1040 - i, 2040]);
    for (let i = 1; i < 40; i++) straight.push([1000, 2040 - i]);

    const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const tri = [[0, 0], [100, 0], [50, 90]];

    const r = S([{ z: 1, points: circle }, { z: 2, points: straight },
                 { z: 3, points: square }, { z: 4, points: tri }], 0.5);
    const kept = r.rings.map(x => x.points);
    /* The input must come back untouched: the tracing on the card is the record. */
    const untouched = circle.length === 400 && straight.length === 160 && square.length === 4;
    return {
      before: r.before, after: r.after,
      nCircle: [circle.length, kept[0].length],
      nStraight: [straight.length, kept[1].length],
      nSquare: [square.length, kept[2].length],
      nTri: [tri.length, kept[3].length],
      devCircle: maxDev(circle, kept[0]), devStraight: maxDev(straight, kept[1]),
      areaCircle: [area(circle), area(kept[0])],
      areaStraight: [area(straight), area(kept[1])],
      squarePts: kept[2], untouched,
      zs: r.rings.map(x => x.z)
    };
  });

  console.log("a pen-drawn circle, 400 points");
  ok(got.nCircle[1] < got.nCircle[0] / 3, "most of them go", got.nCircle.join(" -> "));
  ok(got.devCircle <= 0.5 + 1e-9, "no point of it moves more than half a voxel",
     got.devCircle.toFixed(4) + " voxels");
  ok(Math.abs(got.areaCircle[1] - got.areaCircle[0]) / got.areaCircle[0] < 0.005,
     "...and the area it encloses is unchanged to within half a percent",
     (100 * (got.areaCircle[1] - got.areaCircle[0]) / got.areaCircle[0]).toFixed(3) + "%");

  console.log("\na straight run sampled every voxel");
  ok(got.nStraight[1] === 4, "collapses to its four corners", got.nStraight.join(" -> "));
  ok(got.devStraight <= 0.5 + 1e-9, "...drawing the same outline",
     got.devStraight.toFixed(4) + " voxels");
  ok(Math.abs(got.areaStraight[1] - got.areaStraight[0]) / got.areaStraight[0] < 0.005,
     "...enclosing the same area",
     (100 * (got.areaStraight[1] - got.areaStraight[0]) / got.areaStraight[0]).toFixed(3) + "%");

  console.log("\nand a corner is never redundant");
  ok(got.nSquare[1] === 4 && JSON.stringify(got.squarePts.slice().sort()) ===
     JSON.stringify([[0, 0], [100, 0], [100, 100], [0, 100]].sort()),
     "a square keeps all four", JSON.stringify(got.squarePts));
  ok(got.nTri[1] === 3, "a triangle is left alone — under six points there is nothing to gain",
     got.nTri.join(" -> "));
  ok(got.untouched, "the rings handed in are NOT modified: the card's tracing is the record",
     got.untouched);
  ok(JSON.stringify(got.zs) === "[1,2,3,4]", "every contour keeps its section", JSON.stringify(got.zs));
  ok(got.before === 400 + 160 + 4 + 3 && got.after === got.nCircle[1] + 4 + 4 + 3,
     "and it reports what it dropped, so the card can say so",
     got.before + " -> " + got.after);

  console.log("\nthe link carries the simplified contours");
  const link = await p.evaluate(async () => {
    document.getElementById("tracingPanel").open = true;   // or the card has nowhere to say it
    document.getElementById("viewer").value = "https://ngl.microns-explorer.org/";  // lines
    const rings = [];
    for (let s = 0; s < 20; s++){
      const pts = [];
      for (let i = 0; i < 400; i++){
        const a = 2 * Math.PI * i / 400;
        pts.push([Math.round(295000 + 300 * Math.cos(a)), Math.round(151000 + 300 * Math.sin(a))]);
      }
      rings.push({ z: 17800 + s, points: pts });
    }
    const opened = [], saved = window.open;
    window.open = u => { opened.push(u); return { closed: false, opener: null,
      location: { set href(v){ opened.push(v); }, get href(){ return ""; } } }; };
    tracingViewerOpen([{ name: "Cell", color: "#40e28c", rings: rings }], null, {});
    await new Promise(r => setTimeout(r, 1500));
    window.open = saved;
    const url = opened.slice().sort((a, b) => b.length - a.length)[0] || "";
    const st = JSON.parse(decodeURIComponent(url.split("#!")[1] || "") || "{}");
    const anns = (st.layers || []).filter(l => l.annotations)
                                  .reduce((a, l) => a.concat(l.annotations), []);
    return { n: anns.length, rings: rings.length, per: anns.length / rings.length,
             say: document.getElementById("tracingStatus").innerText };
  });
  ok(link.per < 400 / 3, "a 400-point contour is not 400 line annotations any more",
     link.per.toFixed(0) + " annotations per contour");
  ok(/Redundant points dropped: [\d,]+ \u2192 [\d,]+/.test(link.say)
     && /saved tracing is unchanged/.test(link.say),
     "...and the card says how many, and that the tracing itself is untouched",
     (link.say.match(/Redundant points dropped[^.]*\./) || ["NOT SAID"])[0]);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
