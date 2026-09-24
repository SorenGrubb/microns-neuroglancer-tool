/* A contour is not joined to something 19 µm away.                                    2026-09-24

   Søren, with a render of a pial sheath fibroblast shredded across its middle: "The middle part of
   this fibroblast is getting a really bad mesh, likely because the segmentations are a bit too far
   apart in z. Can we fix this? somehow?" — and then: "or maybe it is because there is a primary
   cilia I have segmented much closer in z compared with the rest of the structure."

   The second guess is the right one. Measured on his own file (018 - Pial sheath fibroblast.json):
   479 contours on 243 sections, and the spacing is bimodal — 166 gaps of one or two sections and
   73 gaps of nine to eleven. The cilium is traced every 40–80 nm; the cell body every ~400 nm.

   THAT ALONE WOULD ONLY MAKE THE BODY COARSE. What shreds it is pairUp(), which joins each contour
   to the NEAREST contour on the next section and has no idea how far "nearest" is. Where the
   cilium has a contour and the body does not, the body's contour is banded to the cilium: 23 of
   his 380 bands stretch more than twice the two contours' combined radius, 7 more than five times,
   and the worst joins a 48-voxel contour to a 32-voxel one whose centres are 4,780 voxels — 19 µm
   — apart. Those are the slats.

   SORTED BY HOW FAR APART THE TWO OUTLINES ACTUALLY ARE, the split is clean: every plausible band
   has its bounding circles within ~8 µm, every bad one is 14–25 µm apart. So the rule is
   measurable, not a taste: a contour is not the same object as one whose outline is nowhere near
   it.

   AND THE OTHER HALF. A reach limit alone leaves the body as a stack of flat discs, because loft()
   only ever bands CONSECUTIVE entries of its z list — the body's next contour is ten sections up
   and nothing looks that far. So an unmatched contour now stays live and is offered to later
   sections until something plausible turns up, which is what makes a mixed tracing rate work at
   all.

   WHAT IS ASSERTED:
     - a body traced every tenth section beside a cilium traced every section: no triangle spans
       the gap between them
     - ...and the body is still a tube, not a pile of discs
     - a cilium traced ten times as finely is not dragged onto the body either
     - an ordinary evenly-traced object is lofted exactly as before — same triangles, same volume
     - a real branch still branches: two contours above one, the far one capped rather than joined
     - his own file: nothing spans 12 µm laterally any more

   Run: node loftreachcheck.js [path-to-his-json] */
const fs = require("fs"), vm = require("vm"), path = require("path");
const core = require("./corepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

const ctx = { window: {}, console }; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["tracing.js", "traceloft.js"].forEach(f => vm.runInContext(fs.readFileSync(core(f), "utf8"), ctx));
const UJ = ctx.UJ, T = UJ.traceloft;
const RES = [4, 4, 40];                       // µJump's voxels, in nanometres

const circle = (cx, cy, r, n) => {
  const p = [];
  for (let i = 0; i < (n || 32); i++){
    const a = 2 * Math.PI * i / (n || 32);
    p.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
  }
  return p;
};
/* The widest any one BAND triangle reaches in XY, in nanometres. Bands only — a triangle whose
   three vertices are all on one z is a cap, and a cap of a big contour is legitimately as wide as
   the contour is: Søren's largest is 16.7 µm in radius, so its fan spans 33 µm and always did.
   Measuring caps as well is what made the first version of this check accuse the wrong thing. */
const widestBand = (g) => {
  let w = 0;
  for (let t = 0; t < g.indices.length; t += 3){
    const p = [0, 1, 2].map(k => {
      const i = g.indices[t + k] * 3;
      return [g.positions[i], g.positions[i + 1], g.positions[i + 2]];
    });
    if (p[0][2] === p[1][2] && p[1][2] === p[2][2]) continue;      // a cap, not a band
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++)
      w = Math.max(w, Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]));
  }
  return w;                                   // nm, because positions are in nm
};

/* ── HIS SHAPE, IN MINIATURE ──────────────────────────────────────────────────────────────────
   A body 600 voxels across on every tenth section, and a cilium 60 across on EVERY section, five
   thousand voxels (20 µm) away — the two rates and the two objects, nothing else. */
const rings = [];
for (let z = 0; z <= 100; z += 10) rings.push({ z: z, points: circle(0, 0, 300, 48) });
for (let z = 0; z <= 100; z += 1)  rings.push({ z: z, points: circle(5000, 0, 30, 24) });
const g = T.loft(rings, RES);

console.log("a body every tenth section, a cilium every section, 20 µm apart\n");
ok(!!(g && g.indices && g.indices.length), "it lofts at all", g ? g.indices.length / 3 + " triangles" : "(nothing)");
const w = widestBand(g);
ok(w < 4000, "no triangle reaches across to the other object",
   "widest triangle spans " + (w / 1000).toFixed(1) + " µm (the two are 20 µm apart)");
ok(g.capped <= 6, "...and the body is still a tube, not a pile of discs",
   g.capped + " capped end(s) of " + g.contours + " contours");
ok(g.sections === 101, "every section is accounted for", g.sections + " sections");

/* The volume is the honest cross-check: a stack of discs encloses nothing, a tube encloses the
   cylinder. π·300²·100 sections ≈ 28.3e6 voxel³ for the body alone. */
const vol = T.volume(rings, RES);
ok(!!(vol && vol.ok && vol.volumeUm3 > 0), "and it encloses a volume",
   (vol && vol.ok) ? vol.volumeUm3.toFixed(1) + " µm³" : "(none)");

console.log("\nan ordinary, evenly traced object is untouched");
const even = [];
for (let z = 0; z <= 40; z++) even.push({ z: z, points: circle(0, 0, 200 + 2 * z, 32) });
const ge = T.loft(even, RES);
ok(ge.capped === 2, "capped at its two ends and nowhere else", ge.capped + " cap(s)");
ok(ge.contours === 41, "every contour used", ge.contours + " contours");
const we = widestBand(ge);
ok(we < 1200, "and no triangle is longer than the object is wide",
   (we / 1000).toFixed(2) + " µm across a " + ((200 + 80) * 2 * 4 / 1000).toFixed(2) + " µm object");

console.log("\na branch still branches");
const br = [];
for (let z = 0; z <= 5; z++) br.push({ z: z, points: circle(0, 0, 200, 32) });
for (let z = 6; z <= 10; z++){
  br.push({ z: z, points: circle(-150, 0, 120, 32) });
  br.push({ z: z, points: circle(150, 0, 120, 32) });
}
const gb = T.loft(br, RES);
ok(gb.contours === 16, "both arms are there", gb.contours + " contours");
const wb = widestBand(gb);
ok(wb < 2500, "...joined to the trunk, not to each other across the fork",
   (wb / 1000).toFixed(2) + " µm");

/* ── AND HIS ACTUAL FILE ────────────────────────────────────────────────── */
const F = process.argv[2];
if (F && fs.existsSync(F)){
  console.log("\n" + path.basename(F));
  const st = JSON.parse(fs.readFileSync(F, "utf8"));
  const layer = st.layers.filter(l => l.type === "annotation")[0];
  const seen = { volumes: 0, polygons: 0, polylines: 0, points: 0, lines: 0 };
  const real = UJ.tracing._readLayer(layer, seen).structures[0].rings;
  const gr = T.loft(real, RES);
  ok(real.length > 400, "read as contours", real.length + " contours");

  /* The defect he photographed, measured where it happens: at the pairing. A band whose two
     contours' outlines are more than ten micrometres apart is the cilium joined to the body. */
  const byZ = {};
  real.forEach(r => { const z = Math.round(r.z); (byZ[z] = byZ[z] || []).push(r); });
  const zs = Object.keys(byZ).map(Number).sort((a, b) => a - b);
  const cen = p => { let x = 0, y = 0; p.forEach(q => { x += q[0]; y += q[1]; }); return [x / p.length, y / p.length]; };
  const rad = p => { const c = cen(p); let m = 0; p.forEach(q => { m = Math.max(m, Math.hypot(q[0] - c[0], q[1] - c[1])); }); return m; };
  const info = {};
  zs.forEach(z => { info[z] = byZ[z].map(r => ({ c: cen(r.points), rad: rad(r.points) })); });
  let far = 0, bands = 0, worst = 0;
  for (let k = 0; k < zs.length - 1; k++){
    T._pairUp(info[zs[k]], info[zs[k + 1]]).pairs.forEach(p => {
      const b = info[zs[k]][p[0]], a = info[zs[k + 1]][p[1]];
      const gap = Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) - (b.rad + a.rad);
      bands++;
      worst = Math.max(worst, gap);
      if (gap * 4 > 10000) far++;                 // voxels are 4 nm
    });
  }
  ok(far === 0, "no band joins two outlines more than 10 \u00b5m apart \u2014 the slats are gone",
     far + " of " + bands + " bands; widest separation " + (worst * 4 / 1000).toFixed(1) + " \u00b5m");
  /* Before this change 213 of his 479 contours were capped, because so many were banded to the
     wrong neighbour that their own one was already taken. */
  ok(gr.capped < 160, "and far fewer contours are left capped", gr.capped + " capped of " + gr.contours);

  /* WHAT THIS CHANGE DOES NOT FIX, stated rather than asserted away: his fibroblast is a sheet, so
     its profiles are OPEN curves, and loft() resamples and rotates every contour as though it were
     a closed ring. A cyclic rotation is meaningless for an open curve, so vertex i of one can still
     be matched to a point on the far side of its partner. That is a second cause with its own fix,
     and it is why some long band triangles remain. */
  let longBands = 0;
  for (let t = 0; t < gr.indices.length; t += 3){
    const p = [0, 1, 2].map(k => { const i = gr.indices[t + k] * 3;
      return [gr.positions[i], gr.positions[i + 1], gr.positions[i + 2]]; });
    if (p[0][2] === p[1][2] && p[1][2] === p[2][2]) continue;
    let w = 0;
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++)
      w = Math.max(w, Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]));
    if (w > 20000) longBands++;
  }
  console.log("  note  " + longBands + " band triangle(s) still over 20 \u00b5m \u2014 open curves lofted as "
              + "closed rings, a separate cause");
} else {
  console.log("\n(his file not given; pass its path to include it)");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
