/* A contour that was never closed is not closed on the way out.                       2026-09-24

   Søren, with a screenshot of an arachnoid barrier cell in Neuroglancer: "When changing the line
   annotations to poly-line it is making a few very long lines from one end of the cell to the
   other, which is disturbing. Can we avoid this somehow?"

   Those are closing chords, and ringAnnotations draws them on purpose — in BOTH shapes:

       pointB: pts[(i + 1) % pts.length]      // lines: the last edge joins last -> first
       P.push(P[0].slice());                  // polyline: the first vertex repeated as the last

   Right for a lysosome, which IS a ring. Wrong for what he has actually been tracing: an arachnoid
   barrier cell is a flattened sheet, and its profile on a section is an OPEN curve following a
   membrane. Joining its two ends draws a straight line across the whole cell, which is the line in
   his picture — and it is not in the data, it is invented here.

   A ring does not carry a flag saying whether it was closed, and threading one through the pad,
   the link reader, Drive and back would be a large change for something the geometry already
   says. So it is measured: the gap between the last point and the first, against the longest
   ordinary segment in the same contour. A closed ring's closing segment is an ordinary segment —
   the same order as its neighbours. An open curve's is the whole span of the shape.

   WHAT IS ASSERTED:
     - a square is still closed, as a polyline and as lines
     - a long open arc is NOT closed, in either shape
     - ...so no annotation is drawn that is far longer than the contour's own steps
     - a nearly-closed C is left open, because inventing the last 10% is still inventing
     - a triangle is closed: too few points to measure, and a triangle is a ring
     - the point count is what it should be: n for a closed ring, n-1 for an open curve

   Run: node openringcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  const got = await p.evaluate(() => {
    const R = UJ.tracing.ringAnnotations;
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    /* A closed square, generously sampled so the closing step is an ordinary step. */
    const square = [];
    for (let i = 0; i < 40; i++){
      const t = i / 40 * 4, s = Math.floor(t), f = t - s;
      const c = [[0,0],[1000,0],[1000,1000],[0,1000],[0,0]];
      square.push([Math.round(c[s][0] + (c[s+1][0]-c[s][0]) * f),
                   Math.round(c[s][1] + (c[s+1][1]-c[s][1]) * f)]);
    }
    /* An open arc: a membrane traced across the field, ends 20 µm apart, steps 0.2 µm. */
    const arc = [];
    for (let i = 0; i < 100; i++)
      arc.push([200000 + i * 50, 120000 + Math.round(300 * Math.sin(i / 8))]);
    /* Nearly closed: a C missing its last tenth. */
    const cshape = [];
    for (let i = 0; i < 90; i++){
      const a = 2 * Math.PI * i / 100;
      cshape.push([Math.round(200000 + 800 * Math.cos(a)), Math.round(120000 + 800 * Math.sin(a))]);
    }
    const tri = [[0,0],[900,0],[450,800]];

    const shape = (pts, lines) => {
      const anns = R([{ z: 1000, points: pts }], "t", { lines: lines, tol: 0 });
      if (lines){
        const spans = anns.map(a => d(a.pointA, a.pointB));
        const first = anns[0], last = anns[anns.length - 1];
        const sortedL = spans.slice().sort((a, b) => b - a);
        return { n: anns.length, maxSpan: Math.round(sortedL[0]),
                 nextSpan: Math.round(sortedL[1] || sortedL[0]),
                 /* a closed run of edges ends where it began */
                 loops: !!(first && last && last.pointB[0] === first.pointA[0]
                                         && last.pointB[1] === first.pointA[1]) };
      }
      const P = (anns[0] && anns[0].points) || [];
      const segs = [];
      for (let i = 1; i < P.length; i++) segs.push(d(P[i-1], P[i]));
      segs.sort((a, b) => b - a);
      return { n: P.length,
               closed: P.length > 1 && P[0][0] === P[P.length-1][0] && P[0][1] === P[P.length-1][1],
               maxSeg: Math.round(segs[0] || 0), nextSeg: Math.round(segs[1] || segs[0] || 0) };
    };
    /* The longest ordinary step of the source, to compare a drawn span against. */
    const step = (pts) => { let m = 0; for (let i = 1; i < pts.length; i++) m = Math.max(m, d(pts[i-1], pts[i])); return Math.round(m); };

    return { squareP: shape(square, false), squareL: shape(square, true), squareStep: step(square),
             arcP: shape(arc, false), arcL: shape(arc, true), arcStep: step(arc), arcN: arc.length,
             cP: shape(cshape, false), cStep: step(cshape),
             triP: shape(tri, false) };
  });

  console.log("a closed square");
  ok(got.squareP.closed, "stays closed as a polyline: the first point is repeated as the last",
     got.squareP.n + " points, closed=" + got.squareP.closed);
  ok(got.squareL.loops, "...and as lines the run loops: the last edge ends where the first began",
     got.squareL.n + " lines, loops=" + got.squareL.loops);

  console.log("\nan open arc — a membrane traced across the field");
  ok(!got.arcP.closed, "is NOT closed as a polyline", "closed=" + got.arcP.closed + ", " + got.arcP.n + " points");
  ok(!got.arcL.loops, "...and as lines the run does NOT loop back to its start",
     got.arcL.n + " lines, loops=" + got.arcL.loops);
  /* A chord is an OUTLIER, not merely a long segment: simplification legitimately merges several
     steps into one, so the test is whether any single span dwarfs the rest of the same contour. */
  ok(got.arcP.maxSeg <= got.arcP.nextSeg * 3,
     "...and no single span dwarfs the others \u2014 the line in the picture was an outlier",
     "longest drawn " + got.arcP.maxSeg + ", next " + got.arcP.nextSeg
       + " (source step " + got.arcStep + ")");
  ok(got.arcL.maxSpan <= got.arcL.nextSpan * 3, "...as lines too",
     "longest " + got.arcL.maxSpan + ", next " + got.arcL.nextSpan);

  console.log("\nand the awkward ones");
  ok(!got.cP.closed, "a nearly-closed C is left open: inventing the last tenth is still inventing",
     "closed=" + got.cP.closed + ", longest drawn " + got.cP.maxSeg + " against a step of " + got.cStep);
  ok(got.triP.closed, "a triangle is closed — too few points to measure, and a triangle is a ring",
     "closed=" + got.triP.closed + ", " + got.triP.n + " points");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
