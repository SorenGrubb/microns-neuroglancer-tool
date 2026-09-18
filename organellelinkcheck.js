/* An annotation and a segmentation of the same organelle.                          2026-09-18

   Søren: *"the annotations are coupled with the segmentations where the annotation coordinate is
   within the 3D volume of the segmentation"* — and, on the traced centre, *"this should be more
   precise than the manually annotated, so it should replace it."*

   The rule is geometry, so it is checked as geometry: against shapes whose answers are known by
   hand, and against core/traceloft.js — which computes the volume of the same contours by a
   different route — so the area weighting cannot drift from the number shown beside it.

   THE TWO THINGS THAT WILL BE WRONG IF ANYTHING IS:

     1. the z tolerance. A tracing is contours every fifth section, so a point one section past the
        last contour is outside the SAMPLING, not outside the organelle. Half a step either side,
        because that is the tissue an end section stands for in Cavalieri's estimator — the same
        estimator the volume beside it comes from. Measured at both ends and just past them.
     2. the even-odd rule. A contour drawn inside another is a hole, here as in the volume and in
        the Blender export. A point in the hole of a nucleoplasmic reticulum is not in the nucleus.

   Run: node organellelinkcheck.js */
const fs = require("fs"), { JSDOM } = require("jsdom");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

const dom = new JSDOM("<!doctype html><html><body></body></html>",
  { runScripts: "outside-only", url: "https://grubblab.com/" });
const w = dom.window;
w.UJ = {};
w.eval(fs.readFileSync("core/organellelink.js", "utf8"));
w.eval(fs.readFileSync("core/traceloft.js", "utf8"));
const L = w.UJ.organellelink, LOFT = w.UJ.traceloft;

/* A square of side `s` centred on (cx, cy), wound whichever way is asked for — a contour drawn by
   hand has whatever winding the hand went round in, and nothing here may depend on it. */
function square(cx, cy, s, z, reverse){
  const h = s / 2;
  const p = [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
  return { z: z, points: reverse ? p.slice().reverse() : p };
}

console.log("a point in a box, and a point beside it");
{
  /* 200 voxels square, on z 100 / 105 / 110 — the every-fifth-section case the card recommends. */
  const rings = [square(1000, 2000, 200, 100), square(1000, 2000, 200, 105),
                 square(1000, 2000, 200, 110)];
  ok(L.inside([1000, 2000, 105], rings), "the middle of it is inside");
  ok(L.inside("1000,2000,105", rings), "...given as the \"x,y,z\" string a report is written in");
  ok(!L.inside([1000, 2400, 105], rings), "a point beside it is not", "400 voxels away in y");
  ok(L.inside([1090, 2090, 100], rings), "just inside a corner is inside");
  ok(!L.inside([1110, 2000, 105], rings), "just outside an edge is not");
  ok(L.sectionStep([100, 105, 110]) === 5, "the section step is read off the contours",
     L.sectionStep([100, 105, 110]));
}

console.log("\nthe z tolerance: half a step, at each end");
{
  const rings = [square(1000, 2000, 200, 100), square(1000, 2000, 200, 105),
                 square(1000, 2000, 200, 110)];
  ok(L.inside([1000, 2000, 100], rings), "the first traced section is inside");
  ok(L.inside([1000, 2000, 110], rings), "and so is the last");
  ok(L.inside([1000, 2000, 98], rings),
     "two sections before the first is still inside — half a step of 5 is 2.5");
  ok(L.inside([1000, 2000, 112], rings), "...and two past the last");
  ok(!L.inside([1000, 2000, 96], rings),
     "four before the first is outside — the tolerance is half a step, not a whole one");
  ok(!L.inside([1000, 2000, 120], rings), "...and ten past the last is well outside");
  /* THE MEDIAN, NOT THE MEAN. One accidental jump must not widen the tolerance for the object. */
  const jumpy = [square(1000, 2000, 200, 100), square(1000, 2000, 200, 105),
                 square(1000, 2000, 200, 110), square(1000, 2000, 200, 150)];
  ok(L.sectionStep([100, 105, 110, 150]) === 5,
     "one jump of forty does not become the step", L.sectionStep([100, 105, 110, 150]));
  ok(!L.inside([1000, 2000, 170], jumpy),
     "...so the far end keeps a 2.5-section tolerance, not a twenty-section one");
}

console.log("\na contour inside another is a hole");
{
  /* A 400-voxel square with a 100-voxel square inside it: the ring is organelle, the middle is
     not. Both windings, because winding must not decide this. */
  const rings = [square(1000, 2000, 400, 100), square(1000, 2000, 100, 100, true),
                 square(1000, 2000, 400, 105), square(1000, 2000, 100, 105, true)];
  ok(L.inside([1150, 2000, 100], rings), "a point in the wall is inside the organelle");
  ok(!L.inside([1000, 2000, 100], rings), "a point in the hole is NOT", "the even-odd rule");
  ok(!L.inside([1300, 2000, 100], rings), "and a point outside both is not either");
}

console.log("\nthe volumetric centre");
{
  const rings = [square(1000, 2000, 200, 100), square(1000, 2000, 200, 105),
                 square(1000, 2000, 200, 110)];
  const c = L.centre(rings);
  ok(c && c.point[0] === 1000 && c.point[1] === 2000,
     "a box centres on its middle", c && c.point.join(","));
  ok(c && c.point[2] === 105, "...including in z, weighted by area", c && c.point[2]);
  ok(c && c.inside === true, "...and it says the centre is on the object");

  /* Sections of DIFFERENT sizes: the centre must move towards the big end, and by the amount the
     areas say, not by the section count. Areas 100², 200², 300² at z 0/10/20 → weighted z =
     (0*1e4 + 10*4e4 + 20*9e4) / 14e4 = 15.71 → 16. */
  const taper = [square(0, 0, 100, 0), square(0, 0, 200, 10), square(0, 0, 300, 20)];
  const t = L.centre(taper);
  ok(t && t.point[2] === 16, "a tapered stack centres where the area is, not in the middle section",
     t && t.point[2] + " (area-weighted 15.71, section-count 10)");

  /* OFFSET SECTIONS: the x centre is the area-weighted mean of the section centres. */
  const lean = [square(0, 0, 200, 0), square(400, 0, 200, 10)];
  const ln = L.centre(lean);
  ok(ln && ln.point[0] === 200, "two equal sections centre between them", ln && ln.point[0]);

  /* A CENTROID CAN FALL OUTSIDE ITS OWN OBJECT, and saying so is the point of `inside`. A C-shape
     built from three sections whose middle one is displaced far to one side. */
  const cShape = [square(0, 0, 100, 0), square(1000, 0, 100, 10), square(0, 0, 100, 20)];
  const cc = L.centre(cShape);
  ok(cc && cc.inside === false,
     "when the centroid lands off the object it says so rather than pretending",
     cc && cc.point.join(",") + " inside=" + cc.inside);
}

console.log("\nthe weighting agrees with the volume shown beside it");
{
  /* core/traceloft.js computes the volume of these same contours by its own route (Cavalieri over
     per-section areas). If this module's areas were wrong — the hole rule, the winding, the
     shoelace — the two would disagree. Same contours, two independent sums. */
  const rings = [square(1000, 2000, 400, 100), square(1000, 2000, 100, 100, true),
                 square(1000, 2000, 400, 105), square(1000, 2000, 100, 105, true)];
  const v = LOFT.volume(rings, [4, 4, 40]);
  /* By hand: (400² − 100²) voxels² = 150,000 voxel² × (4 nm)² = 2,400,000 nm² = 2.4 µm² a section. */
  ok(v.ok && Math.abs(v.perSection[0].areaUm2 - 2.4) < 1e-6,
     "the loft measures the holed section at 2.4 µm² — by hand, (400²−100²)·16 nm²",
     v.ok && v.perSection[0].areaUm2.toFixed(4));
  const c = L.centre(rings);
  ok(c && c.point[0] === 1000 && c.point[1] === 2000,
     "and the centre of a ring with a hole in it is still its middle", c && c.point.join(","));
  /* The hole must actually be subtracted, not ignored: an off-centre hole moves the centroid away
     from itself, and by a computable amount. Solid 400² at (0,0) minus 200² at (100,0):
     x = (160000·0 − 40000·100) / 120000 = −33.3 → −33. */
  const off = [square(0, 0, 400, 0), square(100, 0, 200, 0, true),
               square(0, 0, 400, 5), square(100, 0, 200, 5, true)];
  const oc = L.centre(off);
  ok(oc && oc.point[0] === -33,
     "an off-centre hole pulls the centroid away from itself, by the amount the areas say",
     oc && oc.point[0] + " (by hand −33.3)");
}

console.log("\npairing: every annotation and every segmentation, exactly once");
{
  const mito = { kind: "mitochondrion",
                 rings: [square(1000, 2000, 200, 100), square(1000, 2000, 200, 105)] };
  const lyso = { kind: "lysosome",
                 rings: [square(5000, 5000, 200, 100), square(5000, 5000, 200, 105)] };
  const anns = [
    { kind: "mitochondrion", pointA: "1000,2000,102" },     // inside the mito
    { kind: "lysosome", pointA: "5000,5000,100" },          // inside the lyso
    { kind: "mitochondrion", pointA: "9000,9000,100" },     // nowhere near either
    { kind: "lysosome", pointA: "1000,2000,102" }           // inside the MITO, but a lysosome
  ];
  const r = L.pair(anns, [mito, lyso]);
  ok(r.paired.length === 2, "both segmentations found an annotation", r.paired.length);
  ok(r.paired[0].annotations.length === 1 && r.paired[0].annotations[0].kind === "mitochondrion",
     "...its own", r.paired[0].annotations[0].pointA);
  ok(r.untracedAnnotations.length === 2,
     "the one nowhere near anything is left over", r.untracedAnnotations.length);
  ok(r.untracedAnnotations.some(a => a.kind === "lysosome" && a.pointA === "1000,2000,102"),
     "...AND a lysosome inside a mitochondrion's outline, which is not the same organelle",
     "kinds have to agree");
  const any = L.pair(anns, [mito, lyso], { anyKind: true });
  ok(any.untracedAnnotations.length === 1,
     "...unless the caller says kinds do not matter", any.untracedAnnotations.length);
  const none = L.pair([], [mito]);
  ok(none.unannotatedTracings.length === 1 && !none.paired.length,
     "a segmentation nobody has annotated comes back as one", none.unannotatedTracings.length);
}

console.log("\nwhat a new segmentation supersedes");
{
  const rings = [square(1000, 2000, 200, 100), square(1000, 2000, 200, 105)];
  const anns = [
    { kind: "mitochondrion", pointA: "1000,2000,102", by: "somebody" },
    { kind: "mitochondrion", pointA: "1080,2080,100", by: "somebody else" },
    { kind: "mitochondrion", pointA: "4000,4000,100", by: "another cell's" },
    { kind: "lysosome", pointA: "1000,2000,102", by: "a different organelle" }
  ];
  const s = L.superseded(rings, anns, "mitochondrion");
  ok(s.length === 2, "the manual points inside it are the ones it replaces", s.length);
  ok(s.every(a => a.kind === "mitochondrion"),
     "...of its own kind only, so a lysosome in the same place keeps its place");
  ok(!s.some(a => a.pointA === "4000,4000,100"),
     "...and one outside it is untouched, however sure somebody was");
}

console.log("\nand nothing at all is nothing, not a crash");
{
  ok(L.centre([]) === null, "no contours, no centre");
  ok(L.centre([{ z: 1, points: [[0, 0], [1, 1]] }]) === null,
     "two points are not a contour", "under three vertices");
  ok(L.inside([0, 0, 0], []) === false, "nothing contains a point");
  ok(L.inside("not a point", [{ z: 0, points: [[0, 0], [1, 0], [1, 1]] }]) === false,
     "an unreadable coordinate is outside everything rather than inside something");
  ok(L.parsePoint("1000, 2000, 30").join(",") === "1000,2000,30",
     "a coordinate with spaces reads the way it is written and copied");
  ok(L.parsePoint([1, 2, 3]).join(",") === "1,2,3", "...and so does one already in an array");
  const r = L.pair(null, null);
  ok(r.paired.length === 0 && r.untracedAnnotations.length === 0,
     "pairing nothing with nothing is empty, not an error");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
process.exit(fails ? 1 : 0);
