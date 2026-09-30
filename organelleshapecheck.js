/* The shape of a traced organelle, and how far it sits from the nucleus.           2026-09-30

   Gary, to Søren:

       "could you potentially add a circularity metric to the organelles that are being
        segmented? In such a metric, a perfect circle will be 1 because it has the same length
        and width. The reason for this is that in disease, organelles can change shape... We can
        then spit out lots of data like how many dystrophic lysosomes or mitochondria etc there
        are per cell etc."
       "I also want to have the distance from the organelle centroid to the nucleus centroid
        calculated and displayed for each organelle."

   WHICH METRIC, THOUGH. "A perfect circle will be 1 because it has the same length and width" is
   the ASPECT RATIO. The metric everyone calls circularity is 4πA/P², which is 1 for a circle for
   a different reason — it is the most area you can enclose with a given perimeter. They disagree
   sharply on the shapes that matter here: a long thin lysosome scores low on both, but a round
   organelle with a ragged, invaginated membrane scores 1 on aspect ratio and well below 1 on
   circularity. Søren chose the whole FIJI set, so both are computed, with roundness and solidity
   beside them, and by exactly ImageJ's definitions — the point is that a number out of µJump and
   a number off a FIJI ROI can be put in the same column.

       circularity   4πA/P²                     1 = circle; falls with a ragged outline
       aspect ratio  major/minor of the fitted ellipse    1 = as wide as it is long
       roundness     4A/(π·major²)              the reciprocal of aspect ratio, after the fit
       solidity      A / convex hull area       1 = convex; falls with a bite out of the side

   The ellipse is fitted ImageJ's way: from the polygon's central second moments, then scaled so
   the ellipse encloses the same area as the outline. That last step is what makes roundness come
   out at exactly 1 for a square, which is a good thing to see in a check, because it is a real
   property of the definition and not a bug.

   WHAT IS ASSERTED — shapes whose answers are known in closed form:
     - a 256-gon circle: all four descriptors 1
     - a square: circularity π/4, aspect ratio 1, roundness 1, solidity 1
     - a 2:1 ellipse: aspect ratio 2, roundness 0.5, solidity 1, circularity 0.841
     - a 4-pointed star: solidity well below 1 while its aspect ratio stays 1
     - a rotated ellipse: the same numbers as an unrotated one (the fit is rotation-invariant)
     - scale invariance: the same shape at ten times the size gives the same four numbers
     - the summary over sections: the value at the widest section, and the median
     - the 3D centroid of a stack of circles is on their common centre, at mid-depth
     - ...and it is an AREA centroid, not a vertex mean — a contour clicked densely on one side
       must not drag the centre towards the dense side

   Run: node organelleshapecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const near = (a, b, tol) => a !== null && a !== undefined && isFinite(a) && Math.abs(a - b) <= tol;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.fulfill({ status: 200,
    contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [],
                           rows: [], newCells: [] }) }));
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**raw.githubusercontent.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  const r = await p.evaluate(() => {
    if (!window.UJ || !UJ.traceloft || typeof UJ.traceloft.shape !== "function")
      return { missing: true };
    const S = UJ.traceloft.shape;
    /* Voxels in, µm out: 1 voxel = 1 nm on x/y here so the numbers below are readable as-is. */
    const RES = [1, 1, 1];
    const poly = (n, f) => { const o = []; for (let i = 0; i < n; i++) o.push(f(2 * Math.PI * i / n, i)); return o; };
    const circle = (r, cx, cy, n) => poly(n || 256, t => [cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    const ellipse = (a, c, cx, cy, rot) => poly(512, t => {
      const x = a * Math.cos(t), y = c * Math.sin(t), s = Math.sin(rot || 0), k = Math.cos(rot || 0);
      return [cx + x * k - y * s, cy + x * s + y * k];
    });
    const square = s => [[0, 0], [s, 0], [s, s], [0, s]];
    /* Four points pulled out, four pushed in: convex hull much bigger than the shape. */
    const star = poly(64, (t, i) => { const r = (i % 16 < 8) ? 1 : 0.35; return [r * Math.cos(t), r * Math.sin(t)]; });

    const one = (pts, z) => S([{ z: z || 0, points: pts }], RES);
    const out = {};
    out.circle  = one(circle(1, 0, 0)).atMaxArea;
    out.square  = one(square(2)).atMaxArea;
    out.ell     = one(ellipse(2, 1, 0, 0)).atMaxArea;
    out.ellRot  = one(ellipse(2, 1, 5, -7, 0.7)).atMaxArea;
    out.star    = one(star).atMaxArea;
    out.big     = one(ellipse(20, 10, 0, 0)).atMaxArea;

    /* Several sections: a stack whose widest slice is the round one and whose others are long. */
    const stack = [
      { z: 0,  points: ellipse(4, 1, 100, 200) },     // area 4π   ~ 12.57
      { z: 10, points: circle(3, 100, 200) },         // area 9π   ~ 28.27  <- widest
      { z: 20, points: ellipse(4, 1, 100, 200) }
    ];
    const st = S(stack, [1, 1, 10]);
    out.stack = { atMax: st.atMaxArea, median: st.median, sections: st.sections,
                  cx: st.centroid && st.centroid.xVox, cy: st.centroid && st.centroid.yVox,
                  cz: st.centroid && st.centroid.zVox };

    /* An AREA centroid, not a vertex mean: same circle, but half the clicks crowded on the right. */
    const lop = circle(1, 0, 0, 32).concat(poly(96, t => [0.999 * Math.cos(t / 4), 0.999 * Math.sin(t / 4)]));
    out.lopsided = one(circle(1, 0, 0, 32)).centroid;
    out.lopsidedDense = S([{ z: 0, points: lop }], RES).centroid;
    return { missing: false, out };
  });

  if (r.missing) {
    ok(false, "UJ.traceloft.shape() exists", "it does not");
  } else {
    const o = r.out;
    console.log("\na circle");
    ok(near(o.circle.circularity, 1, 0.005), "circularity 1", o.circle.circularity);
    ok(near(o.circle.aspectRatio, 1, 0.005), "aspect ratio 1", o.circle.aspectRatio);
    ok(near(o.circle.roundness, 1, 0.005), "roundness 1", o.circle.roundness);
    ok(near(o.circle.solidity, 1, 0.005), "solidity 1", o.circle.solidity);

    console.log("\na square");
    ok(near(o.square.circularity, Math.PI / 4, 0.002), "circularity π/4 = 0.785", o.square.circularity);
    ok(near(o.square.aspectRatio, 1, 0.01), "aspect ratio 1", o.square.aspectRatio);
    ok(near(o.square.roundness, 1, 0.01), "roundness 1 — a real property of ImageJ's area-matched fit",
       o.square.roundness);
    ok(near(o.square.solidity, 1, 0.005), "solidity 1", o.square.solidity);

    console.log("\na 2:1 ellipse");
    ok(near(o.ell.aspectRatio, 2, 0.01), "aspect ratio 2", o.ell.aspectRatio);
    ok(near(o.ell.roundness, 0.5, 0.01), "roundness 0.5", o.ell.roundness);
    ok(near(o.ell.circularity, 0.8412, 0.005), "circularity 0.841", o.ell.circularity);
    ok(near(o.ell.solidity, 1, 0.005), "solidity 1", o.ell.solidity);
    ok(near(o.ellRot.aspectRatio, 2, 0.01) && near(o.ellRot.circularity, 0.8412, 0.005),
       "...the same when it is rotated and moved",
       "AR " + o.ellRot.aspectRatio + ", circ " + o.ellRot.circularity);
    ok(near(o.big.aspectRatio, o.ell.aspectRatio, 0.01) && near(o.big.circularity, o.ell.circularity, 0.005),
       "...and the same at ten times the size",
       "AR " + o.big.aspectRatio + ", circ " + o.big.circularity);

    console.log("\na star");
    ok(o.star.solidity < 0.7, "solidity well below 1", o.star.solidity);
    ok(near(o.star.aspectRatio, 1, 0.05), "...while the aspect ratio stays 1 — the two see different things",
       o.star.aspectRatio);
    ok(o.star.circularity < 0.6, "...and circularity is low too", o.star.circularity);

    console.log("\nover sections");
    ok(o.stack.sections === 3, "three sections", o.stack.sections);
    ok(near(o.stack.atMax.aspectRatio, 1, 0.02),
       "the widest section is the round one, and that is what atMaxArea reports", o.stack.atMax.aspectRatio);
    ok(near(o.stack.median.aspectRatio, 4, 0.05),
       "...the median over the three is the long one", o.stack.median.aspectRatio);
    ok(near(o.stack.cx, 100, 0.05) && near(o.stack.cy, 200, 0.05),
       "the 3D centroid sits on their common centre", o.stack.cx + ", " + o.stack.cy);
    ok(near(o.stack.cz, 10, 0.2), "...at mid-depth", o.stack.cz);

    console.log("\nthe centroid is an area centroid");
    ok(near(o.lopsided.xVox, 0, 0.02) && near(o.lopsided.yVox, 0, 0.02),
       "a circle's centre is its centre", o.lopsided.xVox + ", " + o.lopsided.yVox);
    ok(near(o.lopsidedDense.xVox, 0, 0.05) && near(o.lopsidedDense.yVox, 0, 0.05),
       "...and clicking three times as densely down one side does not move it",
       o.lopsidedDense.xVox + ", " + o.lopsidedDense.yVox);
  }

  /* ── AND HOW FAR APART TWO OF THEM ARE ──────────────────────────────────────  2026-09-30
     Søren: "Also calculate the shortest distance from the organelle mesh to the nucleus mesh and
     if possible the organelle mesh to the nearest organelle mesh from the same cell and also the
     shortest distance between their centroids."

     Surface to surface, not centre to centre: two organelles of different sizes can have the same
     centroid separation and be touching in one case and microns apart in the other, and for a
     contact question only the surfaces answer.

     MEASURED BETWEEN THE TRACED CONTOURS, so its resolution along z is the section spacing --
     stated here because it is the one honest caveat: the true closest approach between two
     surfaces can fall between two sections, and nothing traced can see it there. The check uses
     shapes whose closest approach is IN plane, where the answer is exact. */
  console.log("\nhow far apart");
  const d = await p.evaluate(() => {
    const T = UJ.traceloft;
    if (typeof T.surfacePoints !== "function" || typeof T.minSurfaceDistNm !== "function")
      return { missing: true };
    const RES = [4, 4, 40];
    const ring = (cx, cy, r, z) => ({ z: z, points: (() => {
      const o = []; for (let i = 0; i < 128; i++){ const t = 2 * Math.PI * i / 128;
        o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return o; })() });
    const stack = (cx, cy, rad) => [ring(cx, cy, rad, 10), ring(cx, cy, rad, 11), ring(cx, cy, rad, 12)];
    const A = T.surfacePoints(stack(0, 0, 300), RES);       // "nucleus", radius 300 vox
    const B = T.surfacePoints(stack(1000, 0, 40), RES);     // organelle, radius 40 vox at x=1000
    const C = T.surfacePoints(stack(1000, 500, 40), RES);   // another, 500 vox away in y
    const far = T.surfacePoints(stack(90000, 0, 40), RES);  // nowhere near
    return { missing: false,
             nPoints: B.length / 3,
             nucSurf: T.minSurfaceDistNm(B, A) / 1000,
             sibSurf: T.minSurfaceDistNm(B, C) / 1000,
             farSurf: T.minSurfaceDistNm(B, far) / 1000,
             self: T.minSurfaceDistNm(B, B) / 1000 };
  });
  if (d.missing) {
    ok(false, "UJ.traceloft.surfacePoints() and minSurfaceDistNm() exist", "they do not");
  } else {
    ok(d.nPoints > 100, "a three-section outline becomes a point cloud", d.nPoints + " points");
    /* 1000 - 40 - 300 = 660 voxels of x, at 4 nm each. */
    ok(Math.abs(d.nucSurf - 2.64) < 0.02,
       "surface to surface: 660 voxels of gap at 4 nm is 2.64 µm", d.nucSurf);
    /* 500 - 40 - 40 = 420 voxels of y. */
    ok(Math.abs(d.sibSurf - 1.68) < 0.02,
       "...and between two organelles, 420 voxels is 1.68 µm", d.sibSurf);
    ok(Math.abs(d.self) < 1e-9, "a structure is zero from itself", d.self);
    ok(Math.abs(d.farSurf - 356) < 1, "...and something far away is far away, not pruned to zero",
       d.farSurf);
  }

  /* ── AND IN THREE DIMENSIONS ────────────────────────────────────────────────  2026-09-30
     Gary's Claude, passed on by Søren: circularity becomes sphericity, aspect ratio splits into
     elongation and flatness, roundness is dropped (it was 1/aspect ratio), solidity carries over.

     TWO SPHERICITY CONVENTIONS ARE IN USE and they are not the same number. Wadell's is
     π^(1/3)(6V)^(2/3)/S; MorphoLibJ's is 36πV²/S³, which is Wadell CUBED, so it spreads low values
     out. Both are reported under their own names, and the exact cube relation between them is
     asserted here so neither can drift.

     ELONGATION AND FLATNESS come from the equivalent ellipsoid's three axes: longest/middle and
     middle/shortest. This is the gain over 2D. A cigar and a pancake can be indistinguishable in
     one section; in 3D the rod scores on elongation and the disc on flatness, and the pair below
     has the same volume and nearly the same sphericity while scoring opposite ways round.

     PHYSICAL UNITS, NOT VOXEL COUNTS -- so the checks use an anisotropic resolution on purpose: a
     sphere drawn as a sphere in NANOMETRES is stretched 10:1 in voxels along z, and if the metrics
     were computed on voxel indices it would read as wildly elongated. That is exactly Gary's
     warning about serial-section datasets, made into an assertion. */
  console.log("\nin three dimensions");
  const t3 = await p.evaluate(() => {
    const T = UJ.traceloft;
    if (typeof T.shape3d !== "function") return { missing: true };
    /* 1 voxel = 1 µm on x/y, and z voxels 10x coarser -- an EM-shaped anisotropy. Shapes below are
       built in PHYSICAL µm and converted to voxels, so anything that forgets the resolution will
       report the sphere as a 10:1 rod. */
    const RES = [1000, 1000, 10000];
    const ZV = 10;                                  // µm per z voxel
    const ring = (cx, cy, rx, ry, zVox, n) => {
      const o = []; const m = n || 96;
      for (let i = 0; i < m; i++){ const t = 2 * Math.PI * i / m;
        o.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
      return { z: zVox, points: o };
    };
    /* An ellipsoid with semi-axes a,b (x,y) and c (z), in µm, sectioned on the z voxel grid. */
    const ellipsoid = (a, bb, c) => {
      const out = []; const nz = Math.floor(c / ZV);
      for (let k = -nz; k <= nz; k++){
        const z = k * ZV, s = Math.sqrt(Math.max(0, 1 - (z * z) / (c * c)));
        if (a * s < 0.3) continue;                  // a degenerate contour is not a contour
        out.push(ring(0, 0, a * s, bb * s, k));
      }
      return out;
    };
    /* A torus about z: every section is an annulus, the inner ring a hole. */
    const torus = (R, r) => {
      const out = []; const nz = Math.floor(r / ZV);
      for (let k = -nz; k <= nz; k++){
        const z = k * ZV, w = Math.sqrt(Math.max(0, r * r - z * z));
        if (w < 0.3) continue;
        out.push(ring(0, 0, R + w, R + w, k));
        out.push(ring(0, 0, R - w, R - w, k));
      }
      return out;
    };
    /* A cube: square contours stacked. Its sphericity is closed-form, π^(1/3)·6^(2/3)/6 =
       0.8060, which is the 0.81 in Gary's reference figure -- so this one assertion ties µJump's
       numbers to his. */
    const cubeRings = (() => {
      const a = 200, out = [];                     // 200 µm on a side
      for (let k = -10; k <= 10; k++){
        const o = [], m = 40, per = m / 4;
        for (let i = 0; i < m; i++){
          const t = i / per, side = Math.floor(t), u = (t - side) * a - a / 2;
          o.push(side === 0 ? [u, -a/2] : side === 1 ? [a/2, u]
               : side === 2 ? [-u, a/2] : [-a/2, -u]);
        }
        out.push({ z: k, points: o });
      }
      return out;
    })();
    const cube = T.shape3d(cubeRings, RES);
    const sphere = T.shape3d(ellipsoid(200, 200, 200), RES);
    const prolate = T.shape3d(ellipsoid(500, 100, 100), RES);   // long in x
    const oblate  = T.shape3d(ellipsoid(500, 500, 100), RES);   // flat in z
    const ring3   = T.shape3d(torus(600, 200), RES);
    const flat    = T.shape3d([ring(0, 0, 100, 100, 0)], RES);  // one section: no solid
    return { missing: false, sphere, prolate, oblate, ring3, flat, cube };
  });

  if (t3.missing) {
    ok(false, "UJ.traceloft.shape3d() exists", "it does not");
  } else {
    const S = t3.sphere, P = t3.prolate, O = t3.oblate, R = t3.ring3;
    console.log("  a sphere");
    ok(S.ok && near(S.elongation, 1, 0.04), "elongation 1", S.elongation);
    ok(near(S.flatness, 1, 0.04),
       "flatness 1 — computed in µm, so a 10:1 anisotropic z does not make it a rod", S.flatness);
    ok(S.sphericityWadell > 0.95, "Wadell sphericity near 1", S.sphericityWadell);
    ok(near(S.sphericityMorphoLibJ, Math.pow(S.sphericityWadell, 3), 1e-6),
       "...and MorphoLibJ's is exactly that cubed", S.sphericityMorphoLibJ);
    ok(near(S.solidity3d, 1, 0.03), "solidity 1 — a sphere is convex", S.solidity3d);
    /* (4/3)π(200)³ = 3.351e7 µm³ */
    ok(Math.abs(S.volumeUm3 / 3.351e7 - 1) < 0.05, "and its volume is a sphere's", S.volumeUm3);

    console.log("  a 5:1 rod and a 5:1 disc");
    ok(near(P.elongation, 5, 0.2), "the rod is elongated 5:1", P.elongation);
    ok(near(P.flatness, 1, 0.05), "...and not flat", P.flatness);
    ok(near(O.flatness, 5, 0.25), "the disc is flat 5:1", O.flatness);
    ok(near(O.elongation, 1, 0.05), "...and not elongated", O.elongation);
    ok(P.sphericityWadell < S.sphericityWadell && O.sphericityWadell < S.sphericityWadell,
       "both are less spherical than the sphere",
       "rod " + P.sphericityWadell + ", disc " + O.sphericityWadell);
    ok(near(P.solidity3d, 1, 0.04) && near(O.solidity3d, 1, 0.04),
       "...but both still convex, so solidity stays 1",
       "rod " + P.solidity3d + ", disc " + O.solidity3d);

    console.log("  a torus");
    ok(R.ok && R.solidity3d < 0.8,
       "solidity falls because of the hole — the donut phenotype", R.solidity3d);
    ok(R.sphericityWadell < 0.8, "...and so does sphericity", R.sphericityWadell);

    console.log("  a cube — against Gary's reference figure");
    const C = t3.cube;
    ok(C.ok && near(C.sphericityWadell, 0.8060, 0.01),
       "sphericity 0.806 = π^(1/3)·6^(2/3)/6, the 0.81 in his figure", C.sphericityWadell);
    ok(near(C.elongation, 1, 0.05) && near(C.flatness, 1, 0.05),
       "elongation and flatness both 1", C.elongation + " / " + C.flatness);
    ok(near(C.solidity3d, 1, 0.03), "solidity 1 — a cube is its own convex hull", C.solidity3d);
    /* His rod 5:1 scores 0.73; a 5:1 prolate ellipsoid scores the same to two decimals. His 5.47
       elongation is a capsule's, not an ellipsoid's — moment ratios depend on the body, which is
       his own caveat that these are not end-to-end lengths. */
    ok(near(P.sphericityWadell, 0.73, 0.02),
       "and the 5:1 rod's sphericity matches his 0.73", P.sphericityWadell);

    console.log("  one section");
    ok(!t3.flat.ok, "a single section is not a solid and says so, rather than reporting zeros",
       t3.flat.reason || JSON.stringify(t3.flat));
  }

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await p.close();
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
