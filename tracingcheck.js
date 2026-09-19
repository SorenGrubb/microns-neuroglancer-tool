/* Contours out of a pasted link.                                                   2026-09-16

   core/tracing.js reads a traced cell out of a Neuroglancer state and turns it into rows a
   spreadsheet can hold. This drives the REAL module against states built here in the two shapes it
   has to read:

     * BrainSharer's polygon tool -- POLYGON and VOLUME collections whose geometry is ordinary line
       annotations, everything in one flat list joined by parentAnnotationId / childAnnotationIds.
       Built to match their `annotationToJson`, which writes `type` as the lowercased enum name.
     * loose LINE annotations in the stock viewer, which has no polygon tool, joined end to end.

   AND THE ROUND TRIP, which is the one that matters for storage: rings -> rows -> structures ->
   TRACINGS, with the coordinates arriving unchanged at the other end. A tracing that survives the
   paste and dies in the sheet is worth nothing.

   Run: node tracingcheck.js  */
const fs = require("fs");
const vm = require("vm");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

const sandbox = { console, JSON, Math, Number, String, Array, Object, isFinite, Date,
                  decodeURIComponent, encodeURIComponent };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(core("ontology.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(core("organelles.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(core("tracing.js"), "utf8"), ctx);
const T = sandbox.UJ.tracing;
const O = sandbox.UJ.organelles;

function link(annotations, name){
  const state = { layers: [{ type: "annotation", name: name || "annotation", annotations }] };
  return "https://neuroglancer.example/#!" + encodeURIComponent(JSON.stringify(state));
}
function circle(cx, cy, z, r, n){
  const pts = [];
  for (let i = 0; i < (n || 12); i++){
    const t = 2 * Math.PI * i / (n || 12);
    pts.push([Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), z]);
  }
  return pts;
}
/* A polygon, as the fork serialises one: the collection carries only ids, the geometry is lines. */
let uid = 0;
function polygonOf(points, id){
  const pid = id || ("poly" + (++uid));
  const lines = [];
  for (let i = 0; i < points.length; i++){
    lines.push({ type: "line", id: pid + "_l" + i, parentAnnotationId: pid,
                 pointA: points[i], pointB: points[(i + 1) % points.length] });
  }
  return { poly: { type: "polygon", id: pid, source: points[0],
                   childAnnotationIds: lines.map(l => l.id) }, lines };
}

/* A POLYLINE, AS SPELUNKER ACTUALLY WRITES ONE.                                     2026-09-18
   Not invented: this is the shape Søren pasted out of Spelunker, with his own numbers. One
   annotation, `points` in order, in the tool's 4/4/40 voxels, CLOSED -- the last point repeats the
   first. It matters that the fixture is the real thing, because the claim being corrected here is a
   claim about what that viewer emits, and a fixture I made up could agree with a reader I also made
   up while both disagreed with the viewer. */
const SPELUNKER_POLYLINE = {
  points: [[171061.96875, 139285.984375, 23865],
           [170833.96875, 140035.984375, 23865],
           [171292.96875, 140569.984375, 23865],
           [171697.96875, 140452.984375, 23865],
           [172063.96875, 139777.984375, 23865],
           [171748.96875, 139309.984375, 23865],
           [171226.96875, 139240.984375, 23865],
           [171061.96875, 139285.984375, 23865]],
  type: "polyline",
  id: "2eb771b002c65ba2629ca7ec9904a638e0662915"
};

console.log("a polyline out of Spelunker, exactly as it arrives");
{
  const r = T.ringsFromLink(link([SPELUNKER_POLYLINE]));
  ok(r.ok, "the link reads", r.error || "ok");
  ok(r.seen.polylines === 1, "...as one polyline", r.seen.polylines);
  ok(r.structures.length === 1 && r.structures[0].rings.length === 1,
     "...one structure, one contour",
     r.structures.length + " structure(s), "
     + (r.structures[0] ? r.structures[0].rings.length : 0) + " ring(s)");
  const ring = r.structures[0].rings[0];
  /* EIGHT POINTS IN, SEVEN OUT. The closing repeat is dropped -- a ring is stored open here and
     every consumer closes it itself, so keeping the repeat would give two lengths for one contour
     and a zero-length edge in the mesh. */
  ok(ring.points.length === 7,
     "the closing repeat is dropped: 8 points in, 7 kept", ring.points.length);
  ok(ring.z === 23865, "...on the section it was drawn on", ring.z);
  ok(ring.points[0][0] === 171061.96875 && ring.points[0][1] === 139285.984375,
     "...starting at the first vertex, unrounded", ring.points[0].join(", "));
  ok(r.seen.mixedZ === 0, "...and nothing about it looks like two sections", r.seen.mixedZ);
}

console.log("\nand a polyline behaves like the other shapes");
{
  /* Two contours on two sections, which is what a tracing is. */
  const a = { type: "polyline", id: "pa", points: circle(1000, 2000, 100, 80, 10) };
  const b = { type: "polyline", id: "pb", points: circle(1010, 2005, 105, 76, 10) };
  const r = T.ringsFromLink(link([a, b]));
  ok(r.structures.length === 1 && r.structures[0].rings.length === 2,
     "two polylines in one layer are two contours of ONE structure",
     r.structures.length + " structure(s)");
  const zs = r.structures[0].rings.map(x => x.z).sort((m, n) => m - n);
  ok(zs.join(",") === "100,105", "...one per section", zs.join(", "));
  /* An UNCLOSED polyline is still a contour: a ring is closed by whoever draws it, and somebody
     who stops one vertex short means the same shape. */
  const open = { type: "polyline", id: "po", points: circle(1000, 2000, 100, 80, 6) };
  const r2 = T.ringsFromLink(link([open]));
  ok(r2.structures.length === 1 && r2.structures[0].rings[0].points.length === 6,
     "...and one left unclosed is read as the ring it is",
     r2.structures[0] ? r2.structures[0].rings[0].points.length + " points" : "nothing");
  /* A stray point in the same layer must not become a phantom contour once a shape is present. */
  const r3 = T.ringsFromLink(link([SPELUNKER_POLYLINE,
                                   { type: "point", id: "stray", point: [1, 2, 23865] }]));
  ok(r3.structures.length === 1 && r3.structures[0].rings.length === 1,
     "a stray point beside a polyline does not invent a second contour",
     r3.structures[0].rings.length + " ring(s)");
}

console.log("\na polygon, as BrainSharer writes one");
{
  const p = polygonOf(circle(1000, 2000, 500, 40, 12));
  const r = T.ringsFromLink(link([p.poly].concat(p.lines)));
  ok(r.ok, "the link reads", r.error);
  ok(r.rings.length === 1, "one polygon is one ring", r.rings.length + " rings");
  ok(r.rings[0].z === 500, "...on the section it was drawn on", r.rings[0].z);
  ok(r.rings[0].points.length === 12,
     "...with every vertex, and the closing repeat dropped", r.rings[0].points.length + " points");
  ok(r.seen.polygons === 1 && r.seen.lines === 12,
     "...and it says what it saw", JSON.stringify(r.seen));
  ok(String(r.rings[0].points[0]) === String([1040, 2000]),
     "the coordinates are the tool's own voxels, untouched", String(r.rings[0].points[0]));
}

console.log("\na volume, which is what names a structure");
{
  const a = polygonOf(circle(1000, 2000, 500, 40, 10), "pa");
  const b = polygonOf(circle(1000, 2000, 505, 35, 10), "pb");
  const vol = { type: "volume", id: "v1", description: "astrocyte at the glia limitans",
                source: [1000, 2000, 500], childAnnotationIds: ["pa", "pb"] };
  const r = T.ringsFromLink(link([vol, a.poly, b.poly].concat(a.lines, b.lines)));
  ok(r.structures.length === 1, "one volume is one structure", r.structures.length);
  ok(r.structures[0].rings.length === 2, "...holding both its polygons");
  ok(r.structures[0].name === "astrocyte at the glia limitans",
     "...and carrying the name the tracer gave it", r.structures[0].name);
  ok(String(r.structures[0].rings.map(x => x.z)) === "500,505",
     "...on the two sections", String(r.structures[0].rings.map(x => x.z)));

  /* A polygon outside every volume must not vanish -- somebody drew it. */
  const c = polygonOf(circle(3000, 4000, 510, 20, 8), "pc");
  const r2 = T.ringsFromLink(link([vol, a.poly, b.poly, c.poly].concat(a.lines, b.lines, c.lines)));
  ok(r2.structures.length === 2, "a polygon in no volume is still a structure of its own",
     r2.structures.length + " structures");
  ok(r2.rings.length === 3, "...and all three rings come back", r2.rings.length);
}

console.log("\nloose lines, in a viewer with no polygon tool");
{
  const pts = circle(1000, 2000, 500, 40, 8);
  const lines = pts.map((p, i) => ({ type: "line", id: "L" + i,
                                     pointA: p, pointB: pts[(i + 1) % pts.length] }));
  const r = T.ringsFromLink(link(lines));
  ok(r.ok && r.rings.length === 1, "eight lines end to end make one ring",
     r.ok ? r.rings.length + " rings" : r.error);
  ok(r.rings[0].points.length === 8, "...of eight points", r.rings[0].points.length);
  ok(r.structures[0].from === "lines", "...and it says how it read them", r.structures[0].from);

  /* Drawn out of order -- which is what actually happens -- must give the same ring. */
  const shuffled = [lines[3], lines[0], lines[6], lines[1], lines[7], lines[2], lines[5], lines[4]];
  const r2 = T.ringsFromLink(link(shuffled));
  ok(r2.rings.length === 1 && r2.rings[0].points.length === 8,
     "lines drawn in any order still chain into one ring",
     r2.rings.length + " rings of " + (r2.rings[0] || {}).points?.length);

  /* Two sections of loose lines: two rings, each on its own z. */
  const p2 = circle(1000, 2000, 520, 30, 6);
  const more = p2.map((p, i) => ({ type: "line", id: "M" + i,
                                   pointA: p, pointB: p2[(i + 1) % p2.length] }));
  const r3 = T.ringsFromLink(link(lines.concat(more)));
  ok(r3.rings.length === 2 && String(r3.rings.map(x => x.z)) === "500,520",
     "two sections of lines are two rings, in section order",
     String(r3.rings.map(x => x.z)));
}

console.log("\na ring of points, which is the only tool every viewer has");
{
  /* Measured 2026-09-17 on ngl.microns-explorer.org: the toolbox is point / bounding box / line /
     ellipsoid, and nothing else. No polygon anywhere a pasted link can reach. Points come back in
     the order they were clicked, so a ring drawn one way round needs no chaining. */
  const pts = (cx, cy, z, r, n) => circle(cx, cy, z, r, n).map((p, i) =>
    ({ type: "point", id: "p" + z + "_" + i, point: p }));
  const r = T.ringsFromLink(link(pts(1000, 2000, 500, 40, 14)
    .concat(pts(1005, 2005, 505, 38, 14), pts(1010, 2010, 510, 30, 14))));
  ok(r.ok === true && r.rings.length === 3, "three rings of points are three contours",
     r.rings.length);
  ok(r.rings.every(x => x.points.length === 14), "...every vertex kept", r.rings[0].points.length);
  ok(r.structures[0].from === "points", "...and it says it read them as points",
     r.structures[0].from);
  ok(String(r.rings[0].points[0]) === String(circle(1000, 2000, 500, 40, 14)[0].slice(0, 2)),
     "...in the order they were clicked, which is what makes them a ring at all",
     String(r.rings[0].points[0]));

  const two = T.ringsFromLink(link(pts(1000, 2000, 500, 40, 3).concat(pts(1000, 2000, 505, 40, 2))));
  ok(two.ok === true && two.rings.length === 1,
     "a section with two points is not a contour; three is", two.rings.length);

  /* A stray line in a point tracing must not suppress the points: one segment never chains. */
  const stray = T.ringsFromLink(link(pts(1000, 2000, 500, 40, 8)
    .concat(pts(1005, 2005, 505, 38, 8),
            [{ type: "line", id: "oops", pointA: [1, 1, 500], pointB: [9, 9, 500] }])));
  ok(stray.ok === true && stray.rings.length === 2 && stray.structures[0].from === "points",
     "a stray line left behind does not suppress a point tracing", stray.rings.length + " rings");

  /* And a stray point in a line tracing must not invent a vertex: lines win when they chain.
     Built as LOOSE lines (no parentAnnotationId) -- polygonOf's carry one, and a line inside a
     polygon is that polygon's geometry rather than a contour of its own. */
  const ringLines = (cx, cy, z, n, tag) => {
    const q = circle(cx, cy, z, 40, n);
    return q.map((p, i) => ({ type: "line", id: tag + i, pointA: p, pointB: q[(i + 1) % q.length] }));
  };
  const mixed = T.ringsFromLink(link(ringLines(1000, 2000, 500, 10, "ma")
    .concat(ringLines(1005, 2005, 505, 10, "mb"),
            [{ type: "point", id: "stray", point: [7000, 7000, 500] }])));
  ok(mixed.ok === true && (mixed.structures[0] || {}).from === "lines"
     && mixed.rings.every(x => x.points.every(p => p[0] < 2000)),
     "a stray point left behind does not get into a line tracing",
     (mixed.structures[0] || {}).from + ", " + mixed.rings.length + " rings");
}

console.log("\ntwo contours on one section");
{
  const a = polygonOf(circle(1000, 2000, 500, 40, 8), "qa");
  const b = polygonOf(circle(9000, 2000, 500, 40, 8), "qb");
  const r = T.ringsFromLink(link([a.poly, b.poly].concat(a.lines, b.lines)));
  ok(r.rings.length === 2 && r.rings[0].z === r.rings[1].z,
     "both are kept, both on the same section — a process that split, or a hole");
  const rows = T.ringsToRows(r.rings, { name: "two blobs" });
  ok(String(rows.map(x => x.ringIndex)) === "0,1",
     "...and they are numbered within their section, so a row knows which it is",
     String(rows.map(x => x.ringIndex)));
}

console.log("\nthe round trip through the sheet");
{
  const a = polygonOf(circle(1000, 2000, 500, 40, 16), "ra");
  const b = polygonOf(circle(1010, 2005, 520, 38, 16), "rb");
  const vol = { type: "volume", id: "v9", description: "traced astrocyte",
                source: [1000, 2000, 500], childAnnotationIds: ["ra", "rb"] };
  const r = T.ringsFromLink(link([vol, a.poly, b.poly].concat(a.lines, b.lines)));
  const rows = T.ringsToRows(r.rings, { name: "traced astrocyte", cellType: "astrocyte",
                                        color: "#3a6b5a", nucleusId: "253863", stamp: 1 });
  ok(rows.length === 2, "one row per ring", rows.length + " rows");
  ok(rows.every(x => x.type === "traced_structure"), "...of one report type");
  ok(rows[0].structureId === rows[1].structureId && /traced-astrocyte_1/.test(rows[0].structureId),
     "...sharing a readable structure id", rows[0].structureId);
  ok(rows[0].points.split(";").length === 16, "...with the points in one cell",
     rows[0].points.length + " chars for 16 points");
  ok(rows[0].points.length < 400, "...small enough that a sheet cell is never the limit",
     rows[0].points.length + " chars");

  /* Back out, as a reader of the sheet would get them -- reporterName is what the backend adds. */
  const back = T.rowsToStructures(rows.map(x => Object.assign({ reporterName: "Søren Grubb" }, x)));
  ok(back.length === 1, "the rows reassemble into one structure", back.length);
  ok(back[0].sections === 2, "...over both sections", back[0].sections);
  ok(back[0].tracedBy === "Søren Grubb",
     "...marked with who traced it, which is the whole provenance model", back[0].tracedBy);
  ok(String(back[0].rings[0].points[0]) === String(r.rings[0].points[0]),
     "...and the coordinates came back UNCHANGED",
     String(back[0].rings[0].points[0]) + " vs " + String(r.rings[0].points[0]));

  const tr = T.toTracings(back);
  ok(tr.length === 1 && tr[0].rings.length === 2, "and it becomes a TRACINGS entry", tr.length);
  ok(tr[0].traced_by === "Søren Grubb" && tr[0].type === "astrocyte"
     && tr[0].color === "#3a6b5a" && tr[0].nucleus_id === "253863",
     "...with trace_mesh.py's own key names, so nothing translates it again",
     JSON.stringify({ t: tr[0].type, b: tr[0].traced_by, c: tr[0].color, n: tr[0].nucleus_id }));
  ok(Object.prototype.hasOwnProperty.call(tr[0].rings[0], "z")
     && Array.isArray(tr[0].rings[0].points),
     "...in the {z, points} shape trace_mesh takes");
}

console.log("\ntwo people, one cell");
{
  /* THIS BLOCK ASSERTED THE OPPOSITE FOR ONE DAY, and the reversal is the interesting part.
     Yesterday's reading of *"I don't think the traced structures should have consensus handling,
     but it should be marked who traced the structures"* was that a tracing is one person's, so the
     same structureId from two people had to be two structures. S\u00f8ren, 2026-09-17: *"the meshes made
     should always be a part of the dataset and everybody should be able to use it. Also, other
     people should be able to add to it or edit it."* The earlier instruction was about CONSENSUS,
     not about ownership -- and there is still none here: nothing votes, nothing is averaged, the
     newest share simply IS the geometry. What had to stop was a second editor forking the object
     instead of extending it. */
  const rows = [
    { structureId: "s1", name: "astrocyte", z: 500, ringIndex: 0, points: "1,1;9,1;9,9",
      reporterName: "S\u00f8ren Grubb" },
    { structureId: "s1", name: "astrocyte", z: 505, ringIndex: 0, points: "2,2;8,2;8,8",
      reporterName: "S\u00f8ren Grubb" },
    { structureId: "s1", name: "astrocyte", z: 510, ringIndex: 0, points: "3,3;7,3;7,7",
      reporterName: "Somebody Else" }
  ];
  const back = T.rowsToStructures(rows);
  ok(back.length === 1, "one structureId is ONE structure, whoever drew on it", back.length);
  ok(back[0].rings.length === 3, "...holding everybody's contours", back[0].rings.length);
  ok(back[0].tracedBy === "Somebody Else",
     "...attributed to the latest hand, which is where the newest geometry came from",
     back[0].tracedBy);
  ok(back[0].contributors.join(" / ") === "S\u00f8ren Grubb / Somebody Else",
     "...and nobody's credit is erased by the next person's edit", back[0].contributors.join(", "));
  ok(back[0].structureId === "s1", "...and it still says which cell it is of");

  /* EVERY contributor reaches the notebook. `traced_by` is the provenance field trace_mesh.py
     writes into the scene, and a tracing three people extended has three authors. */
  const tr = T.toTracings(back);
  ok(tr[0].traced_by === "S\u00f8ren Grubb, Somebody Else",
     "...and the Blender manifest names all of them", tr[0].traced_by);

  /* A structure read once and fed back in must not split or lose its name -- rowsToStructures reads
     reporterName, toTracings writes traced_by, and a re-read has to agree with the first. */
  const again = T.rowsToStructures(T.ringsToRows(back[0].rings,
      { structureId: "s1", name: "astrocyte" })
    .map(r => Object.assign({ tracedBy: "S\u00f8ren Grubb" }, r)));
  ok(again.length === 1 && again[0].tracedBy === "S\u00f8ren Grubb",
     "and a round trip through the rows again is stable, on tracedBy as well as reporterName");

  /* A later share that names the cell type fills in what an earlier one left blank, and a blank in
     a later row never wipes a value an earlier one carried. */
  const filled = T.rowsToStructures([
    { structureId: "s2", name: "", z: 1, points: "1,1;2,1;2,2", reporterName: "A" },
    { structureId: "s2", name: "pericyte", cellType: "Pericyte", nucleusId: "99",
      z: 2, points: "1,1;2,1;2,2", reporterName: "B" },
    { structureId: "s2", name: "", cellType: "", z: 3, points: "1,1;2,1;2,2", reporterName: "C" }
  ]);
  ok(filled[0].name === "pericyte" && filled[0].cellType === "Pericyte"
     && filled[0].nucleusId === "99",
     "a later editor's blank never wipes what an earlier one filled in",
     JSON.stringify({ n: filled[0].name, t: filled[0].cellType, nu: filled[0].nucleusId }));
}

/* ── SEVERAL OF THE SAME THING ─────────────────────────────────────────────────────  2026-09-17
   Søren: *"the extra added organelles should have different colors... and when publishing they
   should have different numbers."* The storage half: a submission says which one it is, the palette
   is the export's own, and a name carries the number only when there is more than one. */
console.log("\nseveral of the same type");
{
  const sub = T.toSubmission([{ z: 0, points: [[0,0],[10,0],[10,10]] }],
    { structureId: "m3", name: "Mitochondrion 3", kind: "mitochondrion",
      instanceIndex: 3, instanceOf: "mitochondrion" });
  ok(sub.instanceIndex === 3 && sub.instanceOf === "mitochondrion",
     "a submission says which one of several it is, and of what",
     sub.instanceOf + " " + sub.instanceIndex);
  const alone = T.toSubmission([{ z: 0, points: [[0,0],[10,0],[10,10]] }], { name: "Nucleus" });
  ok(alone.instanceIndex === undefined,
     "...and the only one of its kind carries no number, rather than a 1 nobody asked for");

  ok(T.instanceName("Mitochondrion", 3, true) === "Mitochondrion 3",
     "the number goes on the NAME, which is what a person reads on the sheet and in Blender");
  ok(T.instanceName("Nucleus", 1, false) === "Nucleus",
     '...and one of a kind keeps its plain label — "Nucleus 1" is a strange way to say there '
     + "is one");

  /* THE PALETTE IS THE EXPORT'S. blender/colour_policy.py reserves hues 335-25 for vessels and
     200-250 for nuclei so that red MEANS vessel and blue MEANS nucleus; a palette invented here
     would put a mitochondrion in nucleus blue on the pad and something else in the .blend. */
  const hue = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; return h < 0 ? h + 360 : h;
  };
  ok(T.INSTANCE_COLOURS.length >= 10, "there are enough colours to tell a handful apart",
     T.INSTANCE_COLOURS.length);
  ok(T.INSTANCE_COLOURS.every(c => { const h = hue(c); return !(h >= 335 || h <= 25); }),
     "...none of them in the vessels' hues, because red MEANS vessel");
  ok(T.INSTANCE_COLOURS.every(c => { const h = hue(c); return !(h >= 200 && h <= 250); }),
     "...and none in the nuclei's, because blue MEANS nucleus");
  ok(Math.abs(hue(T.instanceColour(0)) - hue(T.instanceColour(1))) > 40,
     "the first two are far apart in hue, because most tracings are two or three",
     hue(T.instanceColour(0)).toFixed(0) + "° vs " + hue(T.instanceColour(1)).toFixed(0) + "°");
  ok(T.instanceColour(0) === T.instanceColour(T.INSTANCE_COLOURS.length),
     "...and it wraps rather than running out");

  /* Back out: the number survives a round trip, so the cell panel has something to order by. */
  const back = T.rowsToStructures([
    { structureId: "m3", name: "Mitochondrion 3", instanceIndex: 3, instanceOf: "mitochondrion",
      z: 0, points: "0,0;10,0;10,10", reporterName: "Søren Grubb" }]);
  ok(back[0].instanceIndex === 3 && back[0].instanceOf === "mitochondrion",
     "...and it comes back out of the rows", back[0].instanceOf + " " + back[0].instanceIndex);
  ok(T.toTracings(back)[0].instance_index === 3,
     "...and reaches the Blender manifest, so the outliner says which one it is");
}

console.log("\nrows out of order, which a sheet gives no guarantee against");
{
  const rows = [
    { structureId: "s", name: "x", z: 520, ringIndex: 0, points: "1,1;2,1;2,2" },
    { structureId: "s", name: "x", z: 500, ringIndex: 1, points: "5,5;6,5;6,6" },
    { structureId: "s", name: "x", z: 500, ringIndex: 0, points: "3,3;4,3;4,4" }
  ];
  const back = T.rowsToStructures(rows);
  ok(String(back[0].rings.map(r => r.z + ":" + r.ringIndex)) === "500:0,500:1,520:0",
     "they come back sorted by section, then by ring within it",
     String(back[0].rings.map(r => r.z + ":" + r.ringIndex)));
}

console.log("\nthe bands \u00b5Jump puts on its own links are not contours");
{
  /* buildLayerAnnotationLayers() draws the pia/white-matter boundaries as `line` annotations in a
     local annotation layer called "Cortical layers". They are indistinguishable, shape-wise, from
     a hand-drawn contour segment -- so before 2026-09-17 a link carrying both came back as rings
     that chained his outline to a band spanning the dataset, and MESHED, which is the failure mode
     this project cares about most: wrong, and it still produces an object. */
  const bands = { type: "annotation", name: "Cortical layers", annotations: [
    { type: "line", id: "b1", pointA: [0, 0, 500], pointB: [90000, 1000, 500] },
    { type: "line", id: "b2", pointA: [90000, 1000, 500], pointB: [90000, 90000, 505] },
    { type: "line", id: "b3", pointA: [90000, 90000, 505], pointB: [0, 0, 505] }
  ]};
  const m1 = polygonOf(circle(1000, 2000, 500, 40, 16), "t1");
  const m2 = polygonOf(circle(1005, 2005, 505, 38, 16), "t2");
  const mine = { type: "annotation", name: "tracing",
                 annotations: [m1.poly, m2.poly].concat(m1.lines, m2.lines) };
  const url = (layers) => "https://neuroglancer.example/#!"
    + encodeURIComponent(JSON.stringify({ layers: layers }));

  const both = T.ringsFromLink(url([bands, mine]));
  ok(both.ok === true && both.rings.length === 2,
     "a link with the bands AND a tracing gives back the tracing only",
     both.rings.length + " rings");
  ok(both.ok && both.rings.every(r => r.points.every(p => p[0] < 2000 && p[1] < 3000)),
     "...every point is his cell's, not a band's corner at 90000");

  /* Without a "tracing" layer there is no preference to exercise -- the bands must still be out. */
  const loose = { type: "annotation", name: "annotation",
                  annotations: [m1.poly, m2.poly].concat(m1.lines, m2.lines) };
  const noName = T.ringsFromLink(url([bands, loose]));
  ok(noName.ok === true && noName.rings.length === 2,
     "and with the layer called anything else, the bands are still not read",
     noName.rings.length + " rings");

  const only = T.ringsFromLink(url([bands]));
  ok(only.ok === false && /no annotation layer/.test(only.error || ""),
     "a link carrying nothing BUT the bands says it has no annotation layer, rather than meshing them",
     only.error);

  /* The layer box still wins when he fills it in -- the preference is a default, not a rule. */
  const named = T.ringsFromLink(url([bands, mine, loose]), "annotation");
  ok(named.ok === true && named.rings.length === 2,
     "naming a layer by hand still overrides all of it", named.rings.length + " rings");
}

/* ── A LAYER IS A STRUCTURE ────────────────────────────────────────────────────────  2026-09-19
   Søren: *"If there is more than one annotation channel in the neuroglancer link, it should be
   suggested that there are more than one organelle."*

   Everything readable used to be poured into ONE structure, so a cell, a mitochondrion and a
   nucleus drawn in three channels came back as a single object with all of it in it -- which meshed,
   which is the failure mode this project cares about most. The reader now says three, tagged, and
   the card can take them apart. */
console.log("\nseveral annotation layers are several structures");
{
  const lay = (name, cx, cy) => ({ type: "annotation", name: name, annotations: [
    { type: "polyline", id: name + "0", points: circle(cx, cy, 100, 60, 16) },
    { type: "polyline", id: name + "1", points: circle(cx, cy, 105, 58, 16) }
  ]});
  const url = layers => "https://neuroglancer.example/#!"
    + encodeURIComponent(JSON.stringify({ layers: layers }));

  const r = T.ringsFromLink(url([lay("cell", 1000, 2000),
                                 lay("mitochondrion", 1400, 2000),
                                 lay("nucleus", 1000, 2400)]));
  ok(r.ok && r.structures.length === 3,
     "three channels are three structures, not one object with everything in it",
     r.structures.length + " structure(s)");
  ok(r.structures.map(s => s.layer).join(",") === "cell,mitochondrion,nucleus",
     "...each tagged with the layer it came from", r.structures.map(s => s.layer).join(", "));
  ok(r.structures.every(s => s.rings.length === 2) && r.rings.length === 6,
     "...with its own contours, and the flat list still has all of them",
     r.structures.map(s => s.rings.length).join("+") + " = " + r.rings.length);
  ok(r.layers.length === 3 && r.layers[1].sections === 2,
     "...and the link reports its layers, with how much is on each",
     JSON.stringify(r.layers[1]));

  /* THE "tracing" PREFERENCE IS A HINT NOW. It used to read that layer and NOTHING ELSE, which is
     exactly the case being asked about: a link with a tracing layer beside two organelle layers
     came back as the tracing alone, silently. The reader reports; the card decides. */
  const both = T.ringsFromLink(url([lay("tracing", 1000, 2000), lay("mitochondrion", 1400, 2000)]));
  ok(both.structures.length === 2,
     "a “tracing” layer no longer suppresses the others", both.structures.length + " structure(s)");
  ok(both.preferred === "tracing",
     "...it says which one it would have preferred, and leaves the choosing to the card",
     JSON.stringify(both.preferred));
  ok(T.ringsFromLink(url([lay("a", 1000, 2000)])).preferred === "",
     "...and says nothing when there is no such layer");

  /* Within a layer the old rule still holds, and a Volume still overrules it. Both are asserted
     above in their own sections; this is the one that says the layer loop did not break them. */
  const one = T.ringsFromLink(url([lay("cell", 1000, 2000)]));
  ok(one.structures.length === 1 && one.structures[0].rings.length === 2,
     "one cell in one layer is still one cell", one.structures.length + " structure(s)");
  const named = T.ringsFromLink(url([lay("a", 1000, 2000), lay("b", 5000, 2000)]), "b");
  ok(named.structures.length === 1 && named.structures[0].layer === "b",
     "and naming a layer by hand still reads that one alone", named.structures[0].layer);
}

console.log("\nwhat it refuses, and what it says");
{
  const bad = [
    ["", "nothing pasted"],
    ["not a link", "does not look like"],
    ["https://x/#!%7Bbroken", "not valid JSON"]
  ];
  bad.forEach(function(b){
    const r = T.ringsFromLink(b[0]);
    ok(!r.ok && new RegExp(b[1]).test(r.error), 'refuses "' + b[0].slice(0, 18) + '"', r.error);
  });
  const noLayer = T.ringsFromLink("https://x/#!" + encodeURIComponent(JSON.stringify(
    { layers: [{ type: "image", name: "em" }] })));
  ok(!noLayer.ok && /no annotation layer/.test(noLayer.error),
     "a link with no annotation layer says so", noLayer.error);
  const empty = T.ringsFromLink(link([{ type: "point", id: "p", point: [1, 2, 3] }]));
  ok(!empty.ok && /no contours on it/.test(empty.error) && /three to a section/.test(empty.error),
     "one point in an annotation layer says what is missing, and how many it needs", empty.error);
  const named = T.ringsFromLink(link([], "contours"), "somewhere-else");
  ok(!named.ok && /called "somewhere-else"/.test(named.error),
     "and a layer name that matches nothing names itself", named.error);
}

/* ── the two decoders must agree ─────────────────────────────────────────────────────────────────
   core/tracing.js carries its own copy of markersFromLink's first eight lines, because
   core/organelles.js is inlined into ωJump by a generator whose guard refuses to rewrite the page.
   Duplication that is known and tested beats a hand edit in a file no generator can write -- but
   only if it is actually tested. */
console.log("\nthe two link decoders say the same thing");
{
  /* About DECODING only. What the two then look FOR is deliberately different -- a link carrying a
     single point annotation is a fine answer for markersFromLink and has no contour on it at all
     -- so agreement past this point would be a bug, not a property. */
  const cases = ["", "not a link", "https://x/#!%7Bbroken"];
  cases.forEach(function(c){
    const a = O.markersFromLink(c), b = T.ringsFromLink(c);
    ok(a.ok === false && b.ok === false && a.error === b.error,
       'both refuse "' + String(c).slice(0, 18) + '" identically', a.error);
  });
  /* They used to disagree about ANY link of loose points: markers to one, nothing to the other.
     Since 2026-09-17 points are how a cell is traced, so the general claim is gone on purpose --
     the same link is markers in the bulk organelle box and a contour in the tracing box, and the
     box it is pasted into is what decides. What still separates them is shape: a contour needs
     three points on one SECTION and at least two sections, which a scattered marker list does not
     have, and the status line says which shape it read. */
  const pointOnly = link([{ type: "point", id: "p", point: [1, 2, 3] }]);
  ok(O.markersFromLink(pointOnly).ok === true && T.ringsFromLink(pointOnly).ok === false,
     "...while ONE loose point is a marker and still not a contour",
     "three to a section is what a contour needs");
  const scattered = link([1, 2, 3, 4, 5, 6].map((i) =>
    ({ type: "point", id: "m" + i, point: [1000 + i * 50, 2000, 500 + i * 10] })));
  ok(O.markersFromLink(scattered).ok === true && T.ringsFromLink(scattered).ok === false,
     "...and six markers on six different sections are six markers, not a tracing",
     "one per section chains into nothing");
  const shared = ["nothing pasted", "that does not look like a Neuroglancer link"];
  shared.forEach(function(msg, i){
    const a = O.markersFromLink(i === 0 ? "" : "not a link");
    const b = T.ringsFromLink(i === 0 ? "" : "not a link");
    ok(a.error === msg && b.error === msg, "...word for word: " + msg);
  });
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
