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
  /* Every edge of a closed surface is shared by exactly two triangles. The caps are fans and the
     bands are quads split in two, so this is the whole test of "is it closed" in one line. */
  const edges = {};
  for (let t = 0; t + 2 < g.indices.length; t += 3){
    const v = [g.indices[t], g.indices[t+1], g.indices[t+2]];
    for (let k = 0; k < 3; k++){
      const a = v[k], b = v[(k+1)%3];
      const p = [Math.round(g.positions[a*3]*1e3), Math.round(g.positions[a*3+1]*1e3),
                 Math.round(g.positions[a*3+2]*1e3)].join(",");
      const q = [Math.round(g.positions[b*3]*1e3), Math.round(g.positions[b*3+1]*1e3),
                 Math.round(g.positions[b*3+2]*1e3)].join(",");
      const key = p < q ? p + "|" + q : q + "|" + p;
      edges[key] = (edges[key] || 0) + 1;
    }
  }
  const odd = Object.keys(edges).filter(k => edges[k] !== 2);
  ok(odd.length === 0, "and every edge is shared by exactly two triangles, so it is watertight",
     odd.length + " unshared edge(s)");
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
    /* Signed volume of a closed triangle mesh, by the divergence theorem -- the same measure
       blender/trace_mesh.py's mesh_volume_um3 uses, in nm here. */
    let vol = 0;
    for (let t = 0; t + 2 < g.indices.length; t += 3){
      const a = vert(g, g.indices[t]), b = vert(g, g.indices[t + 1]), c = vert(g, g.indices[t + 2]);
      vol += (a[0] * (b[1] * c[2] - c[1] * b[2])
            - a[1] * (b[0] * c[2] - c[0] * b[2])
            + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
    }
    const loftUm3 = Math.abs(vol) / 1e9;
    ok(Math.abs(loftUm3 - v.volumeTrapezoidUm3) / v.volumeTrapezoidUm3 < 0.05,
       "the lofted surface and the trapezoid agree — two independent sums over one tracing",
       loftUm3.toFixed(3) + " vs " + v.volumeTrapezoidUm3.toFixed(3) + " µm³");
  }
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
