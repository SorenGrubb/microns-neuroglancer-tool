/* A line annotation is a marker too.                                               2026-09-10

   Søren: "When I pasted a link into this with a new annotation tab and a line annotation it did not
   find any markers in the link. It worked if I put in point annotations, but for structures like NR
   type II and primary cilia it would be helpful if it could recognize line annotations."

   Drives the REAL markersFromLink()/rowsFromPoints() out of core/organelles.js against Neuroglancer
   state built here in the shapes Neuroglancer actually writes — point, line, axis-aligned bounding
   box, ellipsoid — rather than against a description of them.

   Run: node organellelinecheck.js  */
const fs = require("fs");
const vm = require("vm");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* The module writes `window.UJ = window.UJ || {}` and then refers to a BARE `UJ` — which resolves
   through the global object in a browser. So the sandbox has to BE its own window, not merely
   contain one, or the second line throws ReferenceError. */
const sandbox = { console, JSON, Math, Number, Array, String, isFinite,
                  decodeURIComponent, encodeURIComponent };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
/* ONTOLOGY FIRST. isVector() asks the ontology whether a kind takes two points; without it every
   kind looks like a single point and a cilium quietly stops pairing — which is exactly how the
   first run of this file "passed" the point tests and failed the vector ones. */
vm.runInContext(fs.readFileSync(core("ontology.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(core("organelles.js"), "utf8"), ctx);
const O = sandbox.UJ.organelles;

function link(annotations, name){
  const state = { layers: [{ type: "annotation", name: name || "annotation", annotations }] };
  return "https://neuroglancer.example/#!" + encodeURIComponent(JSON.stringify(state));
}

console.log("what the parser can see");
const P = { type: "point", point: [10, 20, 30] };
const L = { type: "line", pointA: [100, 200, 300], pointB: [140, 240, 302] };
const BOX = { type: "axis_aligned_bounding_box", pointA: [1, 1, 1], pointB: [3, 3, 5] };
const ELL = { type: "ellipsoid", center: [7, 8, 9], radii: [2, 2, 2] };
const JUNK = { type: "line", pointA: [1, 2], pointB: "nope" };

let r = O.markersFromLink(link([P]));
ok(r.ok && r.points.length === 1 && Array.isArray(r.points[0]),
   "a point is still a bare [x,y,z], as every existing caller expects", JSON.stringify(r.points[0]));

r = O.markersFromLink(link([L]));
ok(r.ok && r.points.length === 1, "a LINE is found at all — the whole bug", r.points.length + " marker(s)");
ok(r.points[0] && r.points[0].a && r.points[0].b, "...as one marker with two ends",
   JSON.stringify(r.points[0]));
ok(r.seen && r.seen.line === 1, "...and counted as a line", JSON.stringify(r.seen));

r = O.markersFromLink(link([BOX]));
ok(r.points.length === 1 && r.points[0].b, "a bounding box is its two corners, one marker");
r = O.markersFromLink(link([ELL]));
ok(r.points.length === 1 && Array.isArray(r.points[0]), "an ellipsoid is its centre, one point");
r = O.markersFromLink(link([JUNK]));
ok(r.points.length === 0 && r.seen.unreadable === 1,
   "an annotation with no readable coordinates is counted, not guessed at");

r = O.markersFromLink(link([P, L, ELL]));
ok(r.points.length === 3, "a mixed layer keeps every one, in order",
   r.points.map(m => Array.isArray(m) ? "pt" : "line").join(","));

/* Layer filtering is what lets a page say "the markers are in the wrong layer" — it must survive. */
r = O.markersFromLink(link([L], "cilia"), "somewhere-else");
ok(r.ok && r.points.length === 0, "the layer filter still applies to lines");

console.log("\nwhat a marker becomes");
/* nucleoplasmic_reticulum_2 and cilium are the ontology's vector kinds — the two he named. */
let g = O.rowsFromPoints("nucleoplasmic_reticulum_2", O.markersFromLink(link([L])).points);
ok(g.rows.length === 1 && !g.odd, "one line makes ONE complete NR type II row, with no odd marker",
   JSON.stringify(g));
ok(String(g.rows[0].a) === "100,200,300" && String(g.rows[0].b) === "140,240,302",
   "...end A and end B in the order they were drawn");

g = O.rowsFromPoints("cilium", O.markersFromLink(link([L, L])).points);
ok(g.rows.length === 2 && g.rows.every(x => x.a && x.b), "two lines make two complete cilia");

/* A line for a kind that is a single point: one structure, one row, at the middle of the line. */
g = O.rowsFromPoints("centriole", O.markersFromLink(link([L])).points);
ok(g.rows.length === 1, "a line logged as a POINT kind makes one row, not two");
ok(String(g.rows[0].a) === "120,220,301" && g.rows[0].b === null,
   "...at the line's midpoint, rounded to a whole voxel", String(g.rows[0].a));

/* Mixed: a line completes itself; loose points still pair in click order. */
const P2 = { type: "point", point: [1, 1, 1] }, P3 = { type: "point", point: [2, 2, 2] };
g = O.rowsFromPoints("cilium", O.markersFromLink(link([L, P2, P3])).points);
ok(g.rows.length === 2, "a line and a pair of points make two rows", JSON.stringify(g.rows.length));
ok(String(g.rows[0].b) === "140,240,302" && String(g.rows[1].a) === "1,1,1",
   "...the line's own ends stay together, and the points pair with each other");

console.log("\nnothing about points changed");
const FLAT = [[1,1,1],[2,2,2],[3,3,3],[4,4,4],[5,5,5]];
g = O.rowsFromPoints("centriole", FLAT);
ok(g.rows.length === 5 && g.odd === false, "five points, five point-kind rows");
g = O.rowsFromPoints("cilium", FLAT);
ok(g.rows.length === 3 && g.odd === true, "five points, three cilia and an odd marker flagged");
ok(g.rows[2].a && g.rows[2].b === null, "...the odd one kept as a half-filled row, not dropped");
g = O.rowsFromPoints("cilium", FLAT.slice(0, 4));
ok(g.rows.length === 2 && g.odd === false, "four points, two complete cilia");
ok(O.rowsFromPoints("centriole", []).rows.length === 0
   && O.rowsFromPoints("centriole", null).rows.length === 0, "no markers, no rows");
g = O.rowsFromPoints("nonsense", FLAT);
ok(g.rows.length === 5, "an unknown kind is still treated as flat");

/* ── ωJump carries its own inlined copy ────────────────────────────────────────────────────
   build_wjump.py inlines core/organelles.js, but reseed's guard currently refuses to rewrite
   wjump.html (the served page holds lines the generator does not produce yet), so the copy is
   patched in place from the same generator. Two copies of one rule is a drift risk, so the rule
   here is that they must be the SAME TEXT — which is exactly what would break first. */
const wj = fs.readFileSync(require("./pagepath.js")("wjump.html"), "utf8");
const cj = fs.readFileSync(core("organelles.js"), "utf8");
const cut = (src, name) => {
  const at = src.indexOf("function " + name + "(");
  return at < 0 ? null : src.slice(at, src.indexOf("\n  }", at));
};
console.log("\nthe two copies say the same thing");
for (const fn of ["markersFromLink", "rowsFromPoints", "markerEnds", "midpoint"]) {
  const a = cut(cj, fn), b = cut(wj, fn);
  ok(!!a && !!b && a.trim() === b.trim(),
     "\u03c9Jump's inlined " + fn + "() matches core/organelles.js",
     (!a || !b) ? "missing from one of them" : (a.trim() === b.trim() ? "identical" : "DRIFTED"));
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
