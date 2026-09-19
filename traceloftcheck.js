/* The surface the preview draws while you are still drawing it.                     2026-09-17

   core/traceloft.js joins a stack of hand-drawn contours into a triangle mesh so the pad can show
   the shape as it is made. It is NOT trace_mesh.py -- the export still builds the real surface by
   filling and marching cubes -- so the properties worth asserting are the ones that decide whether
   the preview is honest about the silhouette:

     - the joined band does not TWIST: a contour drawn clockwise and its neighbour anticlockwise
       must still be joined vertex-to-nearest-vertex, not back to front;
     - a contour clicked densely on one side and sparsely on the other still corresponds, because
       resampling is by arc length rather than by index;
     - the stack is CLOSED: every contour with no neighbour above or below gets a cap, so the
       preview is a solid rather than an open tube somebody would read as a hole in their tracing;
     - a contour drawn INSIDE another is a HOLE, and the hole is in the surface and not only in the
       arithmetic: the mesh still closes and its SIGNED volume subtracts (added 2026-09-19, when it
       did neither -- see the last section);
     - it is in nanometres, absolute, in the frame the cell's own mesh arrives in -- a preview in
       the wrong place next to a ghost is worse than no preview;
     - and it survives the shapes a real tracing has: one section, a skipped section, two contours
       on one section, a three-point triangle.

   Run: node traceloftcheck.js */
const fs = require("fs");
const vm = require("vm");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

const sandbox = { console, JSON, Math, Number, String, Array, Object, isFinite, Date,
                  Float32Array, Uint32Array };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(core("traceloft.js"), "utf8"), sandbox);
const L = sandbox.UJ.traceloft;

const RES = [4, 4, 40];                        // µJump's own voxel, nm
/* A circle of n points, centred where asked, going anticlockwise unless told otherwise. */
function circle(cx, cy, r, n, clockwise){
  const out = [];
  for (let i = 0; i < n; i++){
    const a = (clockwise ? -1 : 1) * 2 * Math.PI * i / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}
function tri(g){ return g.indices.length / 3; }
function vert(g, i){ return [g.positions[i*3], g.positions[i*3+1], g.positions[i*3+2]]; }
/* Every edge of a closed surface is shared by exactly two triangles. The caps are fans (or, where
   a contour has holes cut out of it, an ear-clipped polygon) and the bands are quads split in two,
   so this is the whole test of "is it closed" in one number. Keyed on the rounded POSITION rather
   than on the vertex index, because the caps and the bands each push their own copies of the same
   points. */
function unsharedEdges(g){
  const edges = {};
  const key = i => [Math.round(g.positions[i*3]*1e3), Math.round(g.positions[i*3+1]*1e3),
                    Math.round(g.positions[i*3+2]*1e3)].join(",");
  for (let t = 0; t + 2 < g.indices.length; t += 3){
    const v = [g.indices[t], g.indices[t+1], g.indices[t+2]];
    for (let k = 0; k < 3; k++){
      const p = key(v[k]), q = key(v[(k+1)%3]);
      const e = p < q ? p + "|" + q : q + "|" + p;
      edges[e] = (edges[e] || 0) + 1;
    }
  }
  return Object.keys(edges).filter(k => edges[k] !== 2).length;
}
/* Signed volume of a closed triangle mesh, by the divergence theorem -- the same measure
   blender/trace_mesh.py's mesh_volume_um3 uses. Positions are nm, so the answer is µm³.
   SIGNED, deliberately and not absolute: a hole is a hole here only if its triangles face the
   other way and subtract, and taking the modulus per triangle would hide exactly that. */
function signedVolumeUm3(g){
  let v = 0;
  for (let t = 0; t + 2 < g.indices.length; t += 3){
    const a = vert(g, g.indices[t]), b = vert(g, g.indices[t+1]), c = vert(g, g.indices[t+2]);
    v += (a[0] * (b[1] * c[2] - c[1] * b[2])
        - a[1] * (b[0] * c[2] - c[0] * b[2])
        + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return v / 1e9;
}
/* "The same number", for two sums of the same triangles added up in a different order. Not ===:
   floating-point addition is not associative, and reordering the contours reorders the emission,
   which moved one of these answers by a single unit in the last place (0.45769090159742121 against
   ...110). A tolerance of 1e-12 relative is far below anything a tracing could mean and far above
   what reassociation can cost, so it says "identical" without asserting something that is merely
   true today. */
function sameNumber(a, b){ return a === b || Math.abs(a - b) <= 1e-12 * Math.abs(a || 1); }
/* The longest RUNG: the longest edge that runs from one section to the next. A twisted band shows
   up here and almost nowhere else -- the surface still closes, still meshes and still has the right
   triangle count; it simply has rungs running clear across the cell.

   Edges within one section are excluded deliberately, and not as a convenience: a cap is a fan from
   the centroid, so its spokes are one radius long by construction, and counting them would drown
   the signal in a number that is the same whatever the band does. */
function longestEdge(g){
  let worst = 0;
  for (let t = 0; t + 2 < g.indices.length; t += 3){
    const p = [vert(g, g.indices[t]), vert(g, g.indices[t+1]), vert(g, g.indices[t+2])];
    for (let k = 0; k < 3; k++){
      const a = p[k], b = p[(k+1)%3];
      if (a[2] === b[2]) continue;
      worst = Math.max(worst, Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]));
    }
  }
  return worst;
}

console.log("a stack of circles is a tube, in nanometres, where it was drawn");
{
  const rings = [
    { z: 500, points: circle(1000, 2000, 50, 24) },
    { z: 505, points: circle(1000, 2000, 50, 24) },
    { z: 510, points: circle(1000, 2000, 50, 24) }
  ];
  const g = L.loft(rings, RES);
  ok(g.sections === 3 && g.contours === 3, "three sections, three contours",
     g.sections + " / " + g.contours);
  ok(tri(g) > 0, "it has triangles", tri(g) + " triangles");
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.positions.length; i += 3)
    for (let k = 0; k < 3; k++){
      lo[k] = Math.min(lo[k], g.positions[i+k]); hi[k] = Math.max(hi[k], g.positions[i+k]);
    }
  ok(Math.abs(lo[0] - (1000-50)*4) < 1 && Math.abs(hi[0] - (1000+50)*4) < 1,
     "x is the tool voxel times the voxel size, absolute",
     lo[0].toFixed(0) + ".." + hi[0].toFixed(0) + " nm");
  ok(lo[2] === 500*40 && hi[2] === 510*40, "and z likewise, section by section",
     lo[2] + ".." + hi[2] + " nm");
  ok(Math.abs((hi[0]-lo[0]) - 400) < 2, "which makes it 0.4 µm across, as drawn",
     ((hi[0]-lo[0])/1000).toFixed(2) + " µm");
}

console.log("\nwinding: a contour drawn the other way round must not twist the band");
{
  const same = L.loft([{ z: 0, points: circle(0, 0, 100, 32) },
                       { z: 1, points: circle(0, 0, 100, 32) }], [1, 1, 1]);
  const flipped = L.loft([{ z: 0, points: circle(0, 0, 100, 32) },
                          { z: 1, points: circle(0, 0, 100, 32, true) }], [1, 1, 1]);
  ok(longestEdge(flipped) < longestEdge(same) * 1.2,
     "a clockwise neighbour joins like an anticlockwise one",
     "same " + longestEdge(same).toFixed(1) + " vs flipped " + longestEdge(flipped).toFixed(1));
  ok(longestEdge(flipped) < 40,
     "...and no edge runs across the cell, which is what a twist looks like",
     longestEdge(flipped).toFixed(1) + " units on a 200-unit circle");
  ok(L._signedArea(L._orient(circle(0, 0, 10, 8, true))) > 0,
     "orient() makes a clockwise ring anticlockwise");
}

console.log("\nstarting points: two contours clicked from different corners still correspond");
{
  const A = circle(0, 0, 100, 32);
  const B = A.slice(11).concat(A.slice(0, 11));          // same ring, started a third of the way on
  const g = L.loft([{ z: 0, points: A }, { z: 1, points: B }], [1, 1, 1]);
  ok(longestEdge(g) < 40, "the start offset is found rather than assumed to be zero",
     longestEdge(g).toFixed(1));
  ok(L._bestOffset(L._resample(A, L.N), L._resample(B, L.N)) !== 0,
     "and it is genuinely a non-zero offset, so the test is testing something",
     L._bestOffset(L._resample(A, L.N), L._resample(B, L.N)));
}

console.log("\nvertex counts: nine points against forty is the ordinary case");
{
  const g = L.loft([{ z: 0, points: circle(0, 0, 100, 9) },
                    { z: 1, points: circle(0, 0, 100, 40) }], [1, 1, 1]);
  ok(longestEdge(g) < 60, "a coarse contour joins a fine one without a fan of long edges",
     longestEdge(g).toFixed(1));
  ok(L._resample(circle(0, 0, 100, 9), 64).length === 64,
     "both are resampled to the same count");
  /* BY ARC LENGTH, not by index: a contour with its clicks bunched on one side has vertices that
     mean nothing comparable any other way. Half the points in a tenth of the perimeter. */
  const bunched = circle(0, 0, 100, 40).slice(0, 4)
    .concat(circle(0, 0, 100, 8).slice(1));
  const r = L._resample(bunched, 64);
  let minStep = Infinity, maxStep = 0;
  for (let i = 0; i < r.length; i++){
    const a = r[i], b = r[(i+1) % r.length];
    const d = Math.hypot(a[0]-b[0], a[1]-b[1]);
    minStep = Math.min(minStep, d); maxStep = Math.max(maxStep, d);
  }
  ok(maxStep / minStep < 3, "and the resampled points are evenly spaced along the perimeter",
     "step " + minStep.toFixed(1) + ".." + maxStep.toFixed(1));
}

console.log("\nthe stack is closed: an open tube reads as a hole in the tracing");
{
  const g = L.loft([{ z: 0, points: circle(0, 0, 100, 20) },
                    { z: 1, points: circle(0, 0, 100, 20) }], [1, 1, 1]);
  ok(g.capped === 2, "both ends are capped", g.capped + " caps");
  ok(unsharedEdges(g) === 0, "and every edge is shared by exactly two triangles, so it is watertight",
     unsharedEdges(g) + " unshared edge(s)");
}

console.log("\nthe shapes a real tracing actually has");
{
  const one = L.loft([{ z: 7, points: circle(0, 0, 100, 12) }], [1, 1, 1]);
  ok(one.flat === true && tri(one) > 0,
     "one section is drawn as a flat outline, and says it is flat rather than claiming a solid",
     tri(one) + " triangles");

  const gap = L.loft([{ z: 0, points: circle(0, 0, 100, 12) },
                      { z: 40, points: circle(0, 0, 100, 12) }], [1, 1, 1]);
  ok(gap.sections === 2 && tri(gap) > 0, "a skipped section is bridged rather than refused",
     tri(gap) + " triangles over 40 sections");

  /* Two contours on one section: the pad allows it, so the preview has to. Nearest centroid wins,
     and the one with no partner is capped -- which draws a branch as a stub, not as a sheet
     joining both. */
  const split = L.loft([
    { z: 0, points: circle(0, 0, 50, 12) },
    { z: 1, points: circle(0, 0, 50, 12) },
    { z: 1, points: circle(500, 0, 50, 12) }
  ], [1, 1, 1]);
  ok(split.contours === 3, "two contours on one section are both kept", split.contours);
  ok(longestEdge(split) < 200,
     "...and the far one is capped rather than joined across the gap to the near one",
     longestEdge(split).toFixed(0) + " units, against 500 between the centroids");

  const three = L.loft([{ z: 0, points: [[0,0],[10,0],[10,10]] },
                        { z: 1, points: [[0,0],[10,0],[10,10]] }], [1, 1, 1]);
  ok(tri(three) > 0, "a three-point triangle -- the least the pad will close -- still lofts",
     tri(three) + " triangles");

  ok(L.loft([], RES).sections === 0 && L.loft(null, RES).positions.length === 0,
     "and nothing traced yet is an empty mesh, not a throw");
  ok(L.loft([{ z: 0, points: [[5,5],[5,5],[5,5]] }], RES).positions.length === 0,
     "a contour with no perimeter at all is dropped rather than divided by zero");
}

/* ── HOW MUCH OF IT THERE IS ───────────────────────────────────────────────────────  2026-09-17
   Søren: *"We need to calculate the organelle volumes also and add the volumes to the data for the
   cell when submitting."* The estimator is Cavalieri's, and the way to check an estimator is
   against shapes whose volume is arithmetic -- which is the same discipline blender/tracemeshcheck.py
   uses on the export's own reconstruction, one layer further down.

   The sphere is the case that matters: it is the only one here whose ends taper the way a cell's
   do, so it is where the end-slab convention earns its keep or does not. */
console.log("\nvolume: against shapes whose answer is arithmetic");
{
  const R = [4, 4, 40];                                  // µJump's voxel, nm
  const uM = 1000 / 4;                                   // one µm in x/y tool voxels
  const uZ = 1000 / 40;                                  // one µm in sections

  /* A cylinder 1 µm across and 2 µm tall, traced on its own flat ends. The trapezoid is EXACT
     here by construction, and Cavalieri is one slab over -- which is not a bug, it is the
     convention, and it is the right one for anything that tapers. Said out loud so nobody
     "fixes" it later against a cylinder. */
  {
    const rings = [];
    for (let z = 0; z <= 2 * uZ; z += 5) rings.push({ z: z, points: circle(0, 0, 0.5 * uM, 200) });
    const v = L.volume(rings, R);
    const truth = Math.PI * 0.25 * 2;
    ok(Math.abs(v.volumeTrapezoidUm3 - truth) / truth < 0.002,
       "a cylinder traced end to end: the trapezoid is the true volume",
       v.volumeTrapezoidUm3.toFixed(4) + " vs " + truth.toFixed(4) + " µm³");
    const slab = 5 * 40 / 1000;
    ok(Math.abs(v.volumeUm3 - (truth + Math.PI * 0.25 * slab)) / truth < 0.002,
       "...and Cavalieri is exactly one slab more, because each end owns half a gap beyond itself",
       v.volumeUm3.toFixed(4) + " µm³");
    ok(v.gapNm === 200 && v.evenlySpaced,
       "...and it reports the spacing it was traced at", v.gapNm + " nm");
  }

  /* A sphere of radius 1 µm, sampled at three spacings. THIS is the number the card quotes. */
  {
    const truth = 4 / 3 * Math.PI;
    const sample = (everyNth) => {
      const rings = [];
      for (let k = -Math.floor(uZ / everyNth); k <= Math.floor(uZ / everyNth); k++){
        const z = k * everyNth;
        const h = z / uZ;                                  // µm from the equator
        const r = Math.sqrt(Math.max(0, 1 - h * h));
        if (r <= 0) continue;
        rings.push({ z: z, points: circle(0, 0, r * uM, 256) });
      }
      return L.volume(rings, R);
    };
    const fine = sample(1), five = sample(5), forty = sample(10);
    const off = v => 100 * (v.volumeUm3 - truth) / truth;
    ok(Math.abs(off(fine)) < 0.5,
       "a sphere traced on every section is within half a percent",
       off(fine).toFixed(2) + "% (" + fine.volumeUm3.toFixed(3) + " vs " + truth.toFixed(3) + " µm³)");
    ok(Math.abs(off(five)) < 2,
       "...every fifth section, still within two — which is the sampling the card recommends",
       off(five).toFixed(2) + "%");
    ok(Math.abs(off(forty)) > Math.abs(off(five)),
       "...and coarser sampling is worse, in the direction the card says",
       "every 10th: " + off(forty).toFixed(1) + "%");
    ok(five.volumeTrapezoidUm3 < five.volumeUm3,
       "the trapezoid is always the lower bound: it cannot include what is past the last contour",
       five.volumeTrapezoidUm3.toFixed(3) + " < " + five.volumeUm3.toFixed(3));
  }

  /* A HOLE IS A HOLE. The even-odd rule, the same one trace_mesh.py fills with. */
  {
    const tube = [];
    for (let z = 0; z <= 10; z += 5){
      tube.push({ z: z, points: circle(0, 0, 1.0 * uM, 128) });
      tube.push({ z: z, points: circle(0, 0, 0.5 * uM, 128) });     // drawn INSIDE the first
    }
    const v = L.volume(tube, R);
    const solid = L.volume(tube.filter((r, i) => i % 2 === 0), R);
    const ratio = v.volumeUm3 / solid.volumeUm3;
    ok(Math.abs(ratio - 0.75) < 0.01,
       "a contour inside another is a HOLE — an annulus is three quarters of the disc",
       ratio.toFixed(3));
    /* Two contours SIDE BY SIDE are two objects and add, which is the other half of even-odd. */
    const two = [];
    for (let z = 0; z <= 10; z += 5){
      two.push({ z: z, points: circle(0, 0, 0.5 * uM, 64) });
      two.push({ z: z, points: circle(5 * uM, 0, 0.5 * uM, 64) });
    }
    const v2 = L.volume(two, R);
    const one = L.volume(two.filter((r, i) => i % 2 === 0), R);
    ok(Math.abs(v2.volumeUm3 / one.volumeUm3 - 2) < 0.01,
       "...while two contours side by side are two objects, and add", (v2.volumeUm3 / one.volumeUm3).toFixed(3));
  }

  /* What it refuses to guess. */
  {
    const flat = L.volume([{ z: 3, points: circle(0, 0, uM, 32) }], R);
    ok(flat.ok === false && /no depth/.test(flat.reason),
       "one section has no volume, and says so rather than returning zero", flat.reason);
    ok(Math.abs(flat.areaUm2 - Math.PI) / Math.PI < 0.01,
       "...but its AREA is real, and is given", flat.areaUm2.toFixed(3) + " µm²");
    ok(L.volume([], R).ok === false, "and nothing traced is not a volume of nothing");
  }

  /* The two estimates come from the contours; the loft comes from the same contours by a different
     route. They are independent arithmetic on one tracing, so they have to agree -- if they ever
     stop, one of the two is wrong and this says so before a number reaches anybody. */
  {
    const rings = [];
    for (let z = -20; z <= 20; z += 5){
      const h = z / uZ, r = Math.sqrt(Math.max(0.01, 1 - h * h));
      rings.push({ z: z, points: circle(0, 0, r * uM, 96) });
    }
    const v = L.volume(rings, R);
    const g = L.loft(rings, R);
    const loftUm3 = Math.abs(signedVolumeUm3(g));
    ok(Math.abs(loftUm3 - v.volumeTrapezoidUm3) / v.volumeTrapezoidUm3 < 0.05,
       "the lofted surface and the trapezoid agree — two independent sums over one tracing",
       loftUm3.toFixed(3) + " vs " + v.volumeTrapezoidUm3.toFixed(3) + " µm³");
  }
}

/* ── A CONTOUR INSIDE ANOTHER IS A HOLE, IN THE MESH TOO ───────────────────────────  2026-09-19
   Søren: *"If I draw one contour inside another, it should subtract the inside from the outside, so
   that the inner one becomes a hole. This hole should also exist in the 3D mesh."*

   volume() had subtracted since the day it was written and trace_mesh.py had filled even-odd since
   the day IT was written; loft() gave the inner contour its own tube. So the assertions that matter
   are about the SURFACE: that it still closes, and that its signed volume subtracts. Signed rather
   than absolute — a hole whose triangles faced the wrong way would ADD, and would pass any test
   that took the modulus per triangle.

   The annulus is the one shape here whose answer is arithmetic from two radii, so it is the shape
   to ask: a 1 µm circle with a 0.5 µm circle inside it is three quarters of the disc, on every
   section, and the mesh has to say so too. */
console.log("\na hole is a hole in the surface, not only in the arithmetic");
{
  const R = [4, 4, 40], uM = 1000 / 4;
  const holed = [], solid = [];
  for (let z = 0; z <= 10; z += 5){
    holed.push({ z: z, points: circle(0, 0, 1.0 * uM, 128) });
    holed.push({ z: z, points: circle(0, 0, 0.5 * uM, 128) });     // drawn INSIDE the first
    solid.push({ z: z, points: circle(0, 0, 1.0 * uM, 128) });
  }
  const g = L.loft(holed, R), s = L.loft(solid, R);
  ok(g.holes === 3, "the inner contour is recognised as a hole on every section", g.holes + " holes");
  ok(unsharedEdges(g) === 0,
     "the surface with a hole through it is still watertight", unsharedEdges(g) + " unshared edge(s)");
  const ratio = signedVolumeUm3(g) / signedVolumeUm3(s);
  ok(Math.abs(ratio - 0.75) < 0.01,
     "and the mesh encloses three quarters of the solid — the hole SUBTRACTS", ratio.toFixed(4));
  const trap = L.volume(holed, R).volumeTrapezoidUm3;
  ok(Math.abs(signedVolumeUm3(g) - trap) / trap < 0.05,
     "...which is the same answer volume() gets from the contours, by the other route",
     signedVolumeUm3(g).toFixed(3) + " vs " + trap.toFixed(3) + " µm³");
  /* The preview used to loft the inner contour as a second tube, which ADDED. Worth asserting
     against the old behaviour by name, because the symptom was a plausible-looking picture. */
  ok(signedVolumeUm3(g) < signedVolumeUm3(s),
     "...and not a second tube standing inside the first, which is what it used to be",
     signedVolumeUm3(g).toFixed(3) + " < " + signedVolumeUm3(s).toFixed(3) + " µm³");

  /* WHICHEVER WAS DRAWN FIRST. Søren, 2026-09-19: *"if you draw the inner circle before the outer
     circle will it still be a hole?"* Nothing here sorts by area or trusts the order: nestOf()
     asks how many rings CONTAIN each ring, which is a property of the geometry. Asserted on every
     number this file computes, to the last digit — an order that changed the answer by a rounding
     error would be a bug hiding in a tolerance. */
  {
    const reversed = holed.slice().reverse();                  // the hole drawn before its outline
    const gr = L.loft(reversed, R);
    ok(gr.holes === g.holes && gr.indices.length === g.indices.length
       && unsharedEdges(gr) === 0 && sameNumber(signedVolumeUm3(gr), signedVolumeUm3(g)),
       "drawing the hole BEFORE the outline gives the identical mesh",
       signedVolumeUm3(gr).toFixed(6) + " vs " + signedVolumeUm3(g).toFixed(6) + " µm³");
    ok(L.volume(reversed, R).volumeUm3 === L.volume(holed, R).volumeUm3,
       "...and the identical volume, to the bit, which is where the tracer would notice",
       L.volume(reversed, R).volumeUm3.toFixed(6) + " µm³");
  }

  /* THE COMMON CASE IS NOT THE END SECTIONS. A nucleus inside a soma starts and stops inside the
     stack, where the outer is never capped — so the cavity is closed by the hole's OWN disc,
     reversed, rather than by anything being cut out. Different code path, same requirement. */
  const mid = [];
  for (let z = 0; z <= 20; z += 5){
    mid.push({ z: z, points: circle(0, 0, 1.0 * uM, 64) });
    if (z > 0 && z < 20) mid.push({ z: z, points: circle(0, 0, 0.5 * uM, 64) });
  }
  const gm = L.loft(mid, R);
  ok(gm.holes === 3 && unsharedEdges(gm) === 0,
     "a hole that begins and ends inside the stack is a closed cavity",
     gm.holes + " holes, " + unsharedEdges(gm) + " unshared edge(s)");
  const cavity = Math.PI * 0.25 * (10 * 40 / 1000);          // the hole's own cylinder, µm³
  const gmSolid = L.loft(mid.filter(r => r.points.length === 64 && r.z % 5 === 0
                                         && Math.hypot(r.points[0][0], r.points[0][1]) > 0.75 * uM), R);
  ok(Math.abs((signedVolumeUm3(gmSolid) - signedVolumeUm3(gm)) - cavity) / cavity < 0.02,
     "...and what it removes is its own volume, not more and not less",
     (signedVolumeUm3(gmSolid) - signedVolumeUm3(gm)).toFixed(4) + " vs " + cavity.toFixed(4) + " µm³");

  /* Two holes in one outline need two bridges into one polygon, and a hole inside a hole is SOLID
     again — the vesicle in the vacuole. Both are even-odd rather than special cases, and both have
     to close. */
  const twoHoles = [], nested = [];
  for (let z = 0; z <= 5; z += 5){
    twoHoles.push({ z: z, points: circle(0, 0, 1.0 * uM, 96) });
    twoHoles.push({ z: z, points: circle(-0.4 * uM, 0, 0.2 * uM, 48) });
    twoHoles.push({ z: z, points: circle(0.4 * uM, 0, 0.2 * uM, 48) });
    nested.push({ z: z, points: circle(0, 0, 1.0 * uM, 96) });
    nested.push({ z: z, points: circle(0, 0, 0.6 * uM, 96) });
    nested.push({ z: z, points: circle(0, 0, 0.3 * uM, 96) });
  }
  const g2 = L.loft(twoHoles, R), g3 = L.loft(nested, R);
  const t2 = L.volume(twoHoles, R).volumeTrapezoidUm3, t3 = L.volume(nested, R).volumeTrapezoidUm3;
  ok(unsharedEdges(g2) === 0 && Math.abs(signedVolumeUm3(g2) - t2) / t2 < 0.02,
     "two holes in one outline: two bridges, one polygon, still watertight",
     signedVolumeUm3(g2).toFixed(4) + " vs " + t2.toFixed(4) + " µm³");
  ok(g3.holes === 2 && unsharedEdges(g3) === 0 && Math.abs(signedVolumeUm3(g3) - t3) / t3 < 0.02,
     "a ring inside a hole is solid again — the vesicle inside the vacuole",
     signedVolumeUm3(g3).toFixed(4) + " vs " + t3.toFixed(4) + " µm³");
  /* Three deep, drawn innermost outwards — the order somebody tracing a vesicle they spotted first
     would actually produce, and the one where "the first ring is the outline" would come apart. */
  const g3r = L.loft(nested.slice().reverse(), R);
  ok(g3r.holes === 2 && g3r.indices.length === g3.indices.length
     && sameNumber(signedVolumeUm3(g3r), signedVolumeUm3(g3)),
     "...however deep the nesting, and whichever end of it was drawn first",
     g3r.indices.length / 3 + " triangles either way, "
     + signedVolumeUm3(g3r).toPrecision(17) + " vs " + signedVolumeUm3(g3).toPrecision(17));

  /* Not a circle. The bridge has to find its way round a squashed outline with an off-centre hole,
     because a hand-drawn contour is never the shape the algorithm was tested on. */
  const blob = (cx, cy, rx, ry, n, ph) => {
    const o = [];
    for (let i = 0; i < n; i++){
      const a = 2 * Math.PI * i / n + ph;
      o.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return o;
  };
  const odd = [];
  for (let z = 0; z <= 5; z += 5){
    odd.push({ z: z, points: blob(0, 0, 1.2 * uM, 0.6 * uM, 73, 0.3) });
    odd.push({ z: z, points: blob(0.4 * uM, 0.1 * uM, 0.25 * uM, 0.2 * uM, 31, 1.1) });
  }
  const go = L.loft(odd, R), to = L.volume(odd, R).volumeTrapezoidUm3;
  ok(unsharedEdges(go) === 0 && Math.abs(signedVolumeUm3(go) - to) / to < 0.02,
     "an off-centre hole in a squashed outline, which is what a hand does",
     signedVolumeUm3(go).toFixed(4) + " vs " + to.toFixed(4) + " µm³");

  /* SUBTRACTING AND ADDING ON THE SAME SECTION: a cell with a hole in it, and another cell drawn
     beside it. The hole subtracts from its own outline and the neighbour adds, which is the whole
     of even-odd in one fixture and the case a real tracing of two organelles produces.

     It is also where pairing BY PARITY earns its keep: the bands are matched once over the
     outlines and once over the holes, so greedy nearest-centroid can never run a band from a hole
     to the outline of the cell next door. That is asserted here only as far as the answer shows
     it -- the surface closes and the volume is outer minus hole plus neighbour, neither of which
     survives a band joining the wrong two rings. */
  const beside = [];
  for (let z = 0; z <= 5; z += 5){
    beside.push({ z: z, points: circle(0, 0, 1.0 * uM, 64) });
    beside.push({ z: z, points: circle(0.1 * uM, 0, 0.3 * uM, 64) });      // a hole in it
    beside.push({ z: z, points: circle(1.6 * uM, 0, 0.3 * uM, 64) });      // a cell next door
  }
  const gb = L.loft(beside, R), tb = L.volume(beside, R).volumeTrapezoidUm3;
  ok(gb.holes === 2 && gb.contours === 6, "one outline, one hole in it, one cell beside it",
     gb.contours + " contours, " + gb.holes + " holes");
  ok(unsharedEdges(gb) === 0 && Math.abs(signedVolumeUm3(gb) - tb) / tb < 0.02,
     "...and the mesh is outline minus hole plus neighbour, closed",
     signedVolumeUm3(gb).toFixed(4) + " vs " + tb.toFixed(4) + " µm³");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
