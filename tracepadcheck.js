/* The polygon tool's own rules.                                                   2026-09-17

   core/tracepad.js is the state behind the pad in µJump's Trace a cell card -- the tool Søren
   asked for after finding that no viewer a pasted link can reach has one. It holds no DOM, so this
   drives the real module and asserts the decisions that make it usable or not:

     - a click near the first vertex CLOSES the contour, and that is how you are meant to close it;
     - two vertices are not a contour, so a stray double-click leaves a line in nothing;
     - stepping a section abandons a half-drawn contour rather than carrying it, because a ring
       whose vertices come from two sections still meshes and nothing downstream can see it;
     - Undo takes back the last vertex mid-contour and the last contour ON THIS SECTION between
       them -- never one from a section you cannot see;
     - and what comes out is exactly the shape ringsFromLink() produces, so a drawn tracing and a
       pasted one are indistinguishable from there on.

   Run: node tracepadcheck.js */
const fs = require("fs");
const vm = require("vm");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

const sandbox = { console, JSON, Math, Number, String, Array, Object, isFinite, Date };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(core("tracepad.js"), "utf8"), sandbox);
const P = sandbox.UJ.tracepad;

/* One canvas pixel is one voxel of the drawn scale; at 32 nm/px against the tool's 4 nm voxel
   that is 0.125 px per tool voxel, which is the number the page passes in. Using the real one
   matters: with 1.0 the close radius would be eighty times tighter than it is on screen. */
const PX = 4 / 32;

console.log("closing a contour by clicking the first vertex");
{
  const p = P.create(500);
  P.addVertex(p, 1000, 2000, PX);
  P.addVertex(p, 1200, 2000, PX);
  P.addVertex(p, 1200, 2200, PX);
  ok(p.pending.length === 3 && p.rings.length === 0, "three clicks, three vertices, no contour yet",
     p.pending.length);
  ok(P.nearFirst(p, 1004, 2004, PX), "...and the pointer back on the first vertex is 'near' it",
     "4 tool voxels at 32 nm/px is half a pixel");
  const r = P.addVertex(p, 1004, 2004, PX);
  ok(r.closed === true, "...so clicking it closes the contour rather than adding a vertex");
  ok(p.rings.length === 1 && p.pending.length === 0, "the contour is kept and the pending one is empty",
     p.rings.length + " rings");
  ok(p.rings[0].points.length === 3 && p.rings[0].z === 500,
     "...with its three vertices, on the section it was drawn on",
     p.rings[0].points.length + " points at z " + p.rings[0].z);
  ok(String(p.rings[0].points[0]) === "1000,2000",
     "...and the first vertex is the one clicked, not the click that closed it",
     String(p.rings[0].points[0]));
}

console.log("\nthe close radius is in PIXELS, so it follows the zoom");
{
  const p = P.create(0);
  [[0, 0], [400, 0], [400, 400]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  /* 60 tool voxels = 240 nm. At 32 nm/px that is 7.5 px -- inside the radius. At 8 nm/px the same
     distance is 30 px, well outside it: zoomed in, you have to click closer, which is right. */
  ok(P.nearFirst(p, 60, 0, 4 / 32), "at 32 nm/px, 60 voxels away is still the first vertex");
  ok(!P.nearFirst(p, 60, 0, 4 / 8), "...and at 8 nm/px it is not", "the same click, four times the zoom");
  ok(!P.nearFirst(p, 400, 0, 4 / 32), "a click on the SECOND vertex never closes anything");
}

console.log("\ntwo vertices are not a contour");
{
  const p = P.create(0);
  P.addVertex(p, 0, 0, PX);
  P.addVertex(p, 100, 0, PX);
  ok(P.nearFirst(p, 0, 0, PX) === false,
     "with two down, the first vertex is not yet a close target — a stray click is a vertex",
     "MIN_VERTICES = " + P.MIN_VERTICES);
  ok(P.closeRing(p) === false && p.rings.length === 0,
     "...and Enter cannot close it either", p.rings.length + " rings");
  ok(p.pending.length === 2, "...nothing was thrown away", p.pending.length);
}

console.log("\nstepping a section abandons a half-drawn contour");
{
  const p = P.create(500);
  [[0, 0], [100, 0], [100, 100]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  P.addVertex(p, 5, 5, PX);
  P.addVertex(p, 90, 5, PX);
  P.setZ(p, 505);
  ok(p.pending.length === 0,
     "the two vertices drawn on 500 do not follow to 505 — a ring across two sections meshes, "
     + "and nothing downstream can see that it is wrong", p.pending.length);
  ok(p.rings.length === 1 && p.rings[0].z === 500, "...and the contour already closed stays where it is",
     "z " + p.rings[0].z);
  ok(p.z === 505, "...and the pad is on the new section", p.z);
}

console.log("\nwhat Undo takes back");
{
  const p = P.create(500);
  [[0, 0], [100, 0], [100, 100]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  P.setZ(p, 505);
  [[1, 1], [101, 1], [101, 101]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  P.addVertex(p, 2, 2, PX);
  ok(P.undo(p) === "vertex" && p.pending.length === 0,
     "mid-contour, Undo takes the last vertex");
  ok(P.undo(p) === "ring" && p.rings.length === 1,
     "...and with nothing pending it takes the last contour", p.rings.length + " left");
  ok(p.rings[0].z === 500,
     "...the one on THIS section, never one from a section you cannot see", "z " + p.rings[0].z);
  const empty = P.create(900);
  ok(P.undo(empty) === "", "Undo on an empty section does nothing and says so");
  ok(P.undo(p) === "", "...and so does Undo when this section has nothing left on it", p.rings.length);
}

console.log("\nout in the same shape a pasted link gives");
{
  const p = P.create(510);
  [[0, 0], [100, 0], [100, 100]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  P.setZ(p, 500);
  [[1, 1], [101, 1], [101, 101]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  [[5, 5], [50, 5], [50, 50]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  const rings = P.toRings(p);
  ok(rings.length === 3, "every contour comes out", rings.length);
  ok(String(rings.map(r => r.z)) === "500,500,510",
     "...sorted by section, whatever order they were drawn in", String(rings.map(r => r.z)));
  ok(rings.every(r => "z" in r && Array.isArray(r.points) && Array.isArray(r.points[0])),
     "...in {z, points:[[x,y],...]} — the shape ringsFromLink returns, so nothing downstream "
     + "can tell a drawn contour from a pasted one");
  ok(rings[0].points.length === 3 && rings[0].points[0].length === 2,
     "...two numbers per point, with the section carried once on the ring",
     rings[0].points[0].length);
  const c = P.count(p);
  ok(c.rings === 3 && c.sections === 2 && c.onThisSection === 2,
     "and the counter says what the card shows", JSON.stringify(c));
}

console.log("\nclearing one section leaves the others");
{
  const p = P.create(500);
  [[0, 0], [10, 0], [10, 10]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  P.setZ(p, 505);
  [[0, 0], [10, 0], [10, 10]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  P.addVertex(p, 3, 3, PX);
  P.clearSection(p);
  ok(p.rings.length === 1 && p.rings[0].z === 500 && p.pending.length === 0,
     "the section you are on is cleared, the ones you are not are untouched",
     p.rings.length + " ring at z " + p.rings[0].z);
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
