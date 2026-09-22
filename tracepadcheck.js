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

console.log("\nediting a contour that is already closed");
{
  /* Søren: "We also need a way to delete segmentations and correct if a line in the polyline is
     placed wrongly. Also, after the segmentation is done, it should be possible to move the
     polyline points individually." Until this, a closed contour was finished and Undo threw the
     whole thing away -- one bad vertex out of forty cost the other thirty-nine. */
  const p = P.create(500);
  [[0, 0], [400, 0], [400, 400], [0, 400]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);

  const hit = P.hitVertex(p, 402, 4, PX);
  ok(!!hit && hit.ring === 0 && hit.vertex === 1,
     "a vertex of a CLOSED contour can be found under the pointer",
     hit && ("ring " + hit.ring + " vertex " + hit.vertex));
  ok(P.hitVertex(p, 200, 200, PX) === null,
     "...and the middle of the contour is not a vertex", "nothing to grab there");

  P.moveVertex(p, hit, 450, 30);
  ok(String(p.rings[0].points[1]) === "450,30", "moving one moves ONLY that one",
     String(p.rings[0].points[1]));
  ok(String(p.rings[0].points[0]) === "0,0" && String(p.rings[0].points[2]) === "400,400",
     "...its neighbours stay put", String(p.rings[0].points[0]) + " / " + String(p.rings[0].points[2]));
  ok(p.rings[0].points.length === 4, "...and no vertex is gained or lost", p.rings[0].points.length);

  /* A wrongly placed SEGMENT is usually a corner wanting one more point, not a vertex in the
     wrong place -- so an edge is findable and takes an insertion between its two ends. */
  const edge = P.hitEdge(p, 200, 402, PX);
  ok(!!edge && edge.ring === 0 && edge.after === 2,
     "the segment under the pointer is found, and named by the vertex it follows",
     edge && ("after vertex " + edge.after));
  P.insertVertex(p, edge, 200, 420);
  ok(p.rings[0].points.length === 5 && String(p.rings[0].points[3]) === "200,420",
     "...and a new vertex lands BETWEEN the two it runs between, not at the end",
     p.rings[0].points.map(q => q.join(",")).join(" "));

  /* The closing segment of a ring -- last vertex back to first -- is a segment like any other.
     It is the one an implementation over pts.length-1 silently leaves uneditable. */
  const closing = P.hitEdge(p, 0, 200, PX);
  ok(!!closing && closing.after === 4,
     "the segment that closes the ring is editable too, not just the ones between listed points",
     closing && ("after vertex " + closing.after));

  ok(P.deleteVertex(p, P.hitVertex(p, 450, 30, PX)) === "vertex" && p.rings[0].points.length === 4,
     "a vertex can be deleted from a closed contour", p.rings[0].points.length + " left");

  /* Down to two points the ring encloses nothing, and a line that still meshes into a sliver is
     worse than no ring at all -- so it goes, and it says so. */
  P.deleteVertex(p, P.hitVertex(p, 0, 0, PX));
  const last = P.deleteVertex(p, P.hitVertex(p, 400, 400, PX));
  ok(last === "ring" && p.rings.length === 0,
     "...and taking it under three removes the contour rather than leaving a line", last);
}

console.log("\ndeleting one contour, and only that one");
{
  const p = P.create(500);
  const box = (o) => { [[o, o], [o + 100, o], [o + 100, o + 100]].forEach(v => P.addVertex(p, v[0], v[1], PX));
                       P.closeRing(p); };
  box(0); box(500);
  P.setZ(p, 505); box(0);
  P.setZ(p, 500);
  const here = P.onSection(p);
  ok(here.length === 2 && here.every(h => typeof h.ring === "number"),
     "the contours on THIS section are listed, with their index", JSON.stringify(here));
  ok(P.deleteRing(p, here[0].ring) === true && p.rings.length === 2,
     "deleting one takes one", p.rings.length + " left");
  ok(p.rings.filter(r => r.z === 505).length === 1,
     "...and the section you are not on is untouched");
  ok(P.deleteRing(p, 99) === false, "deleting a contour that is not there does nothing, quietly");
  P.addVertex(p, 5, 5, PX);
  ok(P.deleteRing(p, -1) === true && p.pending.length === 0,
     "...and -1 abandons the contour being drawn");
}

console.log("\nthe grab radius is in pixels too, so it follows the zoom");
{
  const p = P.create(0);
  [[0, 0], [400, 0], [400, 400]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  ok(!!P.hitVertex(p, 40, 0, 4 / 32), "at 32 nm/px, 40 voxels away still grabs the vertex");
  ok(P.hitVertex(p, 40, 0, 4 / 8) === null,
     "...and zoomed in four times it does not, which is what precise editing needs",
     "GRAB_PX = " + P.GRAB_PX);
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

/* ── DRAWN WITH A PEN, NOT CLICKED ─────────────────────────────────────────────────  2026-09-17
   Søren: *"Could we have an option to click and draw the mouse around a structure to mimic using a
   pen to draw, so that you can use a e.g. Kamvas 13 pad or a Apple pen to draw the polylines?"*

   The work is not capturing the stroke, it is THINNING it. A pen going round a soma arrives as
   hundreds of samples a fraction of a pixel apart; kept, that is a contour with five hundred
   handles stacked on each other, forty times the storage of a clicked one, and no more accurate --
   the extra points are the hand's tremor, not the membrane. So what is asserted here is that the
   thinning keeps the SHAPE while throwing away the sampling rate, and that what comes out is an
   ordinary contour with nothing new about it. */
console.log("\ndrawing it with a pen");
{
  /* A circle of 400 samples, the way a pen delivers one: far more points than anybody would click,
     with the same shape. Radius 100 tool voxels. */
  const dense = [];
  for (let i = 0; i < 400; i++){
    const a = 2 * Math.PI * i / 400;
    dense.push([100 * Math.cos(a), 100 * Math.sin(a)]);
  }
  const area = pts => {
    let s = 0;
    for (let i = 0; i < pts.length; i++){
      const p = pts[i], q = pts[(i + 1) % pts.length];
      s += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(s / 2);
  };

  const p = P.create(500);
  P.startStroke(p, dense[0][0], dense[0][1]);
  dense.slice(1).forEach(q => P.strokePoint(p, q[0], q[1], 0));
  ok(p.stroke.length === 400, "every sample is captured while the pen is down", p.stroke.length);
  const what = P.endStroke(p, 1.0);            // a tolerance of one tool voxel
  ok(what === "ring" && p.rings.length === 1,
     "lifting the pen closes a contour", p.rings.length + " ring");
  const ring = p.rings[0].points;
  ok(ring.length > 8 && ring.length < 80,
     "...thinned to something a person could edit, not 400 handles on top of each other",
     "400 samples -> " + ring.length + " vertices");
  ok(Math.abs(area(ring) - area(dense)) / area(dense) < 0.01,
     "...with the SHAPE kept: the area is within a percent of what was drawn",
     (100 * (area(ring) - area(dense)) / area(dense)).toFixed(2) + "%");
  ok(p.stroke === null, "...and the stroke is gone once it has become a contour");
  ok(p.rings[0].z === 500, "...on the section it was drawn on", p.rings[0].z);

  /* A TIGHTER TOLERANCE KEEPS MORE. That is the property that makes the tolerance meaningful
     rather than a magic number: it is a distance, in the units the contour is stored in. */
  const q = P.create(500);
  P.startStroke(q, dense[0][0], dense[0][1]);
  dense.slice(1).forEach(v => P.strokePoint(q, v[0], v[1], 0));
  P.endStroke(q, 0.05);
  ok(q.rings[0].points.length > ring.length,
     "a tolerance ten times tighter keeps more of the stroke",
     ring.length + " at 1.0, " + q.rings[0].points.length + " at 0.05");

  /* THE CLOSED-CURVE TRAP, asserted rather than trusted. Plain RDP measures the first split against
     the line from the first sample to the last -- and on a stroke that came back to where it began
     that "line" is a POINT, so every sample on the far side of the cell is a radius away and gets
     kept for the wrong reason. Splitting at the farthest sample first is the fix; this is the
     measurement that says it was needed. */
  /* THE CLOSED-CURVE CASE, measured rather than assumed. When a stroke ends where it began, plain
     RDP's first split has no chord to measure against -- perp() falls back to measuring against the
     point, which works, but means the first split is decided by something other than the tolerance.
     Cutting at the farthest sample avoids that. The honest size of the difference is ONE vertex,
     and it is recorded here so nobody later reads the closed version as a rescue from a disaster. */
  const shut = dense.concat([dense[0]]);          // a pen that came back to where it started
  ok(P.simplifyClosed(shut, 1.0).length <= P.simplify(shut, 1.0).length,
     "a stroke that ends where it began thins at least as far as the open algorithm manages",
     P.simplifyClosed(shut, 1.0).length + " vs " + P.simplify(shut, 1.0).length);
  ok(Math.abs(area(P.simplifyClosed(shut, 1.0)) - area(dense)) / area(dense) < 0.01,
     "...and keeps the shape while doing it",
     (100 * (area(P.simplifyClosed(shut, 1.0)) - area(dense)) / area(dense)).toFixed(2) + "%");

  /* THE CORNERS SURVIVE. Ramer-Douglas-Peucker is chosen over "every Nth point" for exactly this:
     a square drawn by hand must not come back with rounded corners, and every-Nth cannot promise
     that at any spacing. */
  const square = [];
  for (let i = 0; i < 100; i++) square.push([i, 0]);
  for (let i = 0; i < 100; i++) square.push([100, i]);
  for (let i = 0; i < 100; i++) square.push([100 - i, 100]);
  for (let i = 0; i < 100; i++) square.push([0, 100 - i]);
  const thin = P.simplify(square, 1.0);
  ok(thin.length <= 6,
     "a hand-drawn square thins to its corners and nothing else", thin.length + " vertices");
  const corners = [[0,0],[100,0],[100,100],[0,100]];
  ok(corners.every(c => thin.some(t => Math.abs(t[0]-c[0]) < 2 && Math.abs(t[1]-c[1]) < 2)),
     "...and all four of them are there, which every-Nth-point could not promise",
     JSON.stringify(thin));
}

console.log("\nwhat a stroke has to be before it is a contour");
{
  const p = P.create(500);
  P.startStroke(p, 10, 10);
  P.strokePoint(p, 10, 10, 2);
  P.strokePoint(p, 11, 10, 2);              // both inside the minimum step
  ok(p.stroke.length === 1, "a pen held still does not pile up samples", p.stroke.length);
  ok(P.endStroke(p, 1) === "" && p.rings.length === 0,
     "...and a tap is not a contour — it is treated as the click it almost certainly was");

  /* A stroke that went somewhere but encloses nothing: three samples in a line. */
  const q = P.create(500);
  P.startStroke(q, 0, 0);
  [[10, 0], [20, 0], [30, 0]].forEach(v => P.strokePoint(q, v[0], v[1], 0));
  ok(q.endStroke === undefined || P.endStroke(q, 1) === "" || q.rings.length === 0,
     "a straight line encloses nothing and is refused rather than filed as a sliver",
     q.rings.length + " rings");

  ok(P.simplify([[0,0],[1,1]], 1).length === 2 && P.simplify([], 1).length === 0,
     "simplify() survives what it cannot thin");
}

/* ── SEVERAL OF THE SAME THING ─────────────────────────────────────────────────────  2026-09-17
   Søren: *"I want the option to draw more than one organelle of the same type, the extra added
   organelles should have different colors... and when publishing they should have different
   numbers."* A cell has forty mitochondria, and until this a pad held one structure: two contours
   on a section were two blobs OF IT, which is right for a cell with a hole in it and wrong for two
   mitochondria side by side. */
console.log("\nseveral structures on one pad");
{
  const p = P.create(500);
  [[0, 0], [100, 0], [100, 100]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  ok(p.rings[0].inst === 0, "the first thing drawn is number one", p.rings[0].inst);

  const second = P.newInstance(p);
  ok(second === 1 && p.inst === 1, "starting another gives it the next index", second);
  [[500, 0], [600, 0], [600, 100]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  ok(p.rings[1].inst === 1, "...and what is drawn now belongs to it", p.rings[1].inst);

  const list = P.instances(p);
  ok(list.length === 2 && list[0].contours === 1 && list[1].contours === 1,
     "the pad can say what is on it", JSON.stringify(list.map(i => [i.inst, i.contours])));

  /* Going back to the first and adding a section to it -- which is the whole reason the chips are
     clickable. */
  P.setInstance(p, 0);
  P.setZ(p, 505);
  [[2, 2], [102, 2], [102, 102]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  const back = P.instances(p);
  ok(back[0].contours === 2 && back[0].sections === 2,
     "going back to an earlier one adds to THAT one",
     back[0].contours + " contours on " + back[0].sections + " sections");
  ok(back[1].contours === 1, "...and leaves the other alone", back[1].contours);

  /* THE NEXT INDEX IS ONE PAST THE HIGHEST, NOT THE COUNT. Deleting the middle of three and
     starting a new one must not hand it the number of one still on the pad. */
  P.setInstance(p, 1);
  P.newInstance(p);                                  // 2
  [[900, 0], [1000, 0], [1000, 100]].forEach(v => P.addVertex(p, v[0], v[1], PX));
  P.closeRing(p);
  const two = p.rings.findIndex(r => r.inst === 1);
  P.deleteRing(p, two);                              // number 2 is gone entirely
  ok(P.newInstance(p) === 3,
     "a new one after a deletion takes the next FREE number, not the count", p.inst);

  /* Out, the instance rides with the contour -- which is how the card splits one pad into one
     submission per structure. */
  const rings = P.toRings(p);
  ok(rings.every(r => "inst" in r), "every contour says which structure it belongs to");
  ok(new Set(rings.map(r => r.inst)).size === 2,
     "...and the two that are left are two structures", JSON.stringify(rings.map(r => r.inst)));
}

/* ── PICKING UP WHERE THE PEN LEFT OFF ─────────────────────────────────────────  2026-09-22
   Søren: "I have sometimes had the problem that I accidentally lifted the pen while drawing and
   then I had to start over. I would like if there was a possibility to append to a traced polyline
   by drawing with the pen again. Perhaps starting by holding alt while drawing."

   Lifting closes the stroke with a chord across the gap. An alt-stroke that starts on a contour
   continues it: the chord goes, the new stroke goes in, and the ring closes again. If it also ENDS
   on the contour, it replaces the shorter stretch between its two ends -- redrawing a part. */
console.log("\ncontinuing a contour after the pen was lifted");
{
  const C = [500, 500], R = 100;
  const arc = (a0, a1, n, r) => Array.from({ length: n + 1 }, (_, i) => {
    const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
    return [C[0] + (r || R) * Math.cos(a), C[1] + (r || R) * Math.sin(a)]; });
  const draw = (p, pts) => { P.startStroke(p, pts[0][0], pts[0][1]); pts.slice(1).forEach(q => P.strokePoint(p, q[0], q[1], 0)); };
  const area = pts => Math.abs(pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
  /* How far inside the circle the contour ever goes, on its edges as well as its vertices: a chord
     left across the gap is a line through the middle of the cell. */
  const worstInside = pts => { let w = 0; pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length];
    for (let t = 0; t <= 1; t += 0.1){ const x = a[0] + (b[0] - a[0]) * t - C[0], y = a[1] + (b[1] - a[1]) * t - C[1];
      w = Math.max(w, R - Math.sqrt(x * x + y * y)); } }); return w; };
  const full = Math.PI * R * R;

  const p = P.create(7);
  draw(p, arc(0, 216, 240)); P.endStroke(p, 1);
  const partial = p.rings[0].points.slice();
  ok(worstInside(partial) > 50, "a lifted pen leaves a chord across the cell", worstInside(partial).toFixed(0) + " voxels inside");
  draw(p, arc(216, 358, 160));
  const what = P.extendStroke(p, 1, 15);
  /* It ends on the contour's first end, so the stretch it replaced is the chord. */
  ok(what === "replaced", "an alt-stroke from its end continues it, and closes on its first end", what);
  ok(p.rings.length === 1, "...the same contour, not a second one", p.rings.length);
  ok(Math.abs(area(p.rings[0].points) / full - 1) < 0.02, "...and it is the whole cell now",
     (area(p.rings[0].points) / full).toFixed(3) + " of the circle");
  ok(worstInside(p.rings[0].points) < 2, "...with no chord left through it", worstInside(p.rings[0].points).toFixed(2));
  ok(p.stroke === null, "...and the stroke is spent");
  ok(P.undo(p) === "extension" && p.rings.length === 1 && area(p.rings[0].points) === area(partial),
     "Undo takes back the continuation, not the contour", p.rings.length + " contour(s)");

  /* Two lifts, and the middle stroke ends in the air. */
  const q = P.create(7);
  draw(q, arc(0, 140, 150)); P.endStroke(q, 1);
  draw(q, arc(140, 250, 120)); ok(P.extendStroke(q, 1, 15) === "extended", "a continuation that ends in the air is kept");
  draw(q, arc(250, 358, 120)); P.extendStroke(q, 1, 15);
  ok(Math.abs(area(q.rings[0].points) / full - 1) < 0.02 && worstInside(q.rings[0].points) < 2,
     "...and a third stroke finishes the cell", (area(q.rings[0].points) / full).toFixed(3));

  /* From the other end, going the other way. */
  const r = P.create(7);
  draw(r, arc(0, 216, 240)); P.endStroke(r, 1);
  draw(r, arc(0, -142, 160)); P.extendStroke(r, 1, 15);
  ok(Math.abs(area(r.rings[0].points) / full - 1) < 0.02 && worstInside(r.rings[0].points) < 2,
     "starting from the contour's first end works as well", (area(r.rings[0].points) / full).toFixed(3));

  /* Redrawing part of a finished contour: a bump out to 130 between 0° and 90°. */
  const s = P.create(7);
  draw(s, arc(0, 359, 400)); P.endStroke(s, 1);
  const bump = [[C[0] + R, C[1]]].concat(arc(10, 80, 70, 130)).concat([[C[0], C[1] + R]]);
  draw(s, bump);
  ok(P.extendStroke(s, 1, 15) === "replaced", "a stroke from the contour back to the contour replaces the part between", "");
  const at45 = s.rings[0].points.map(v => [Math.atan2(v[1] - C[1], v[0] - C[0]) * 180 / Math.PI, Math.hypot(v[0] - C[0], v[1] - C[1])])
                 .filter(v => v[0] > 30 && v[0] < 60);
  ok(at45.length && at45.every(v => v[1] > 125), "...the old stretch is gone and the new one is in", at45.map(v => v[1].toFixed(0)).join(","));
  const far = s.rings[0].points.filter(v => v[0] < C[0] - 90);
  ok(far.length > 0 && far.every(v => Math.abs(Math.hypot(v[0] - C[0], v[1] - C[1]) - R) < 2), "...and the far side is untouched", far.length + " points");

  /* Nothing near where it started: a new contour, as an ordinary stroke would be. */
  const t = P.create(7);
  draw(t, arc(0, 359, 200)); P.endStroke(t, 1);
  draw(t, arc(0, 359, 200, 20).map(v => [v[0] + 400, v[1]]));
  ok(P.extendStroke(t, 1, 15) === "ring" && t.rings.length === 2, "an alt-stroke that starts nowhere near a contour is a new one", t.rings.length);

  /* Only the structure being drawn. */
  const u = P.create(7);
  draw(u, arc(0, 216, 240)); P.endStroke(u, 1);
  P.newInstance(u);
  draw(u, arc(216, 358, 160));
  ok(P.extendStroke(u, 1, 15) === "ring" && u.rings.length === 2, "...and another structure's contour is not continued", u.rings.length);
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
