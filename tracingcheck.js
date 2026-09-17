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

console.log("a polygon, as BrainSharer writes one");
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
  /* No consensus handling, by instruction -- so the same structureId traced by two people is two
     tracings. Keyed by id alone, their rings interleaved into one object whose shape depended on
     who posted last: consensus handling arrived at by accident, and invisible, because the result
     still meshes. */
  const rows = [
    { structureId: "s1", name: "astrocyte", z: 500, ringIndex: 0, points: "1,1;9,1;9,9",
      reporterName: "S\u00f8ren Grubb" },
    { structureId: "s1", name: "astrocyte", z: 505, ringIndex: 0, points: "2,2;8,2;8,8",
      reporterName: "S\u00f8ren Grubb" },
    { structureId: "s1", name: "astrocyte", z: 500, ringIndex: 0, points: "3,3;7,3;7,7",
      reporterName: "Somebody Else" }
  ];
  const back = T.rowsToStructures(rows);
  ok(back.length === 2, "the same cell traced by two people is two structures", back.length);
  const mine = back.find(s => s.tracedBy === "S\u00f8ren Grubb");
  const theirs = back.find(s => s.tracedBy === "Somebody Else");
  ok(!!mine && mine.rings.length === 2 && !!theirs && theirs.rings.length === 1,
     "...each holding only its own contours",
     (mine && mine.rings.length) + " and " + (theirs && theirs.rings.length));
  ok(!!mine && mine.structureId === "s1" && !!theirs && theirs.structureId === "s1",
     "...and both still say which cell they are of");

  /* A structure read once and fed back in must not split again -- rowsToStructures reads
     reporterName, toTracings writes traced_by, and a re-read has to agree with the first. */
  const again = T.rowsToStructures(T.ringsToRows(mine.rings, { structureId: "s1", name: "astrocyte" })
    .map(r => Object.assign({ tracedBy: "S\u00f8ren Grubb" }, r)));
  ok(again.length === 1 && again[0].tracedBy === "S\u00f8ren Grubb",
     "and a round trip through the rows again is stable, on tracedBy as well as reporterName");
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
  ok(!empty.ok && /no closed contours/.test(empty.error),
     "an annotation layer with only points says what is missing", empty.error);
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
  const pointOnly = link([{ type: "point", id: "p", point: [1, 2, 3] }]);
  ok(O.markersFromLink(pointOnly).ok === true && T.ringsFromLink(pointOnly).ok === false,
     "...while a link of loose points is a marker list and NOT a contour, as it should be",
     "the one place they are meant to disagree");
  const shared = ["nothing pasted", "that does not look like a Neuroglancer link"];
  shared.forEach(function(msg, i){
    const a = O.markersFromLink(i === 0 ? "" : "not a link");
    const b = T.ringsFromLink(i === 0 ? "" : "not a link");
    ok(a.error === msg && b.error === msg, "...word for word: " + msg);
  });
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
