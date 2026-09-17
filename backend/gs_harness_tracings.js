/* A hand-traced cell, through the real doPost and doGet.                          2026-09-17

   The `traced_structure` branch is unlike every other writer in Code.gs, and the ways it could go
   wrong are the ways it differs. So this drives the REAL handlers against a fake SpreadsheetApp and
   asserts, in order:

     - the type is CLAIMED. Before today it fell through to the default clause added on 2026-09-02
       and came back "unknown report type", which was the right answer to a missing handler and is
       the wrong one now;
     - section 0 and ring 0 survive. `d.z||""` would have blanked the coordinate of section 0 and
       the FIRST RING OF EVERY SECTION, which is most of them -- a bug that leaves a plausible sheet;
     - nothing else moves. No "Master cell list" row, no vote, no organelle. Søren: *"I don't think
       the traced structures should have consensus handling, but it should be marked who traced the
       structures."* A drawing is not an identity claim;
     - the attribution is the VERIFIED one, not what the client sent;
     - (structureId, reporterEmail) is the key: two people tracing the same cell stay two tracings;
     - a second share of the same tracing SUPERSEDES the first, and the superseded rows stay in the
       sheet;
     - the index costs no contour text, and ?structureId= gives rows core/tracing.js can read back
       without translation.

   Run from backend/:  node gs_harness_tracings.js */
const fs = require("fs"), vm = require("vm"), path = require("path");
const { Spreadsheet } = require("./fake_sheets.js");

const BOOKS = {};
function bookFor(ds){ return BOOKS[ds] || (BOOKS[ds] = new Spreadsheet()); }

const ctx = {
  console, Date, JSON, Object, Array, String, Number, isFinite, Math, RegExp,
  parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  Logger: { log: () => {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 1 } }
};
vm.createContext(ctx);
ctx.SS = () => bookFor(ctx.CURRENT_DS);
ctx.setDsFromRequest = () => {};
ctx.dsConfigError = () => "";
ctx.dsCache = () => ({ remove(){}, get(){ return null; }, put(){} });

vm.runInContext(fs.readFileSync(path.join(__dirname, "Code.gs"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "PointsIndex.gs"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "MasterList.gs"), "utf8"), ctx);

function tokenFor(name, email){
  return "tok:" + Buffer.from(JSON.stringify({ name, email })).toString("base64");
}
ctx.UrlFetchApp = { fetch(url){
  const cred = decodeURIComponent(String(url).split("id_token=")[1] || "");
  if (cred.indexOf("tok:") !== 0) return { getResponseCode: () => 400, getContentText: () => "" };
  const who = JSON.parse(Buffer.from(cred.slice(4), "base64").toString("utf8"));
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({
    aud: ctx.GOOGLE_CLIENT_ID, iss: "accounts.google.com", email_verified: "true",
    email: who.email, name: who.name }) };
} };
const SOREN = tokenFor("Søren Grubb", "soren@grubb.dk");
const OTHER = tokenFor("Somebody Else", "else@x");

let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? "  ok   " : "  FAIL ") + n
                          + (d !== undefined ? "  <- " + d : "")); };

ctx.CURRENT_DS = "ujump";
function post(d){ return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(d) } })); }
function get(params){ return JSON.parse(ctx.doGet({ parameter: params })); }
function sheet(){ return bookFor("ujump").getSheetByName("Traced structures"); }
function col(name){ return sheet().rows[0].indexOf(name); }

/* One share = one groupId, N contour rows. Written the way tracingShare() writes it, including
   ringIndex 0 on every row and a section numbered 0, which is the pair that would have been
   silently blanked. */
function share(cred, sid, gid, rings, extra){
  let i = 0;
  return rings.map(r => post(Object.assign({
    type: "traced_structure", credential: cred, structureId: sid, groupId: gid,
    name: "Lysosome", kind: "lysosome", cellType: "Astrocyte", color: "#40e28c",
    nucleusId: "253863", z: r.z, ringIndex: r.ring || 0, points: r.points,
    pointCount: r.points.split(";").length, subIndex: ++i, subCount: rings.length,
    reporterName: "SOMEBODY ELSE ENTIRELY", reporterEmail: "spoof@x",
    timestamp: "2026-09-17T09:0" + i + ":00.000Z"
  }, extra || {})));
}

console.log("the type is claimed at all");
{
  const r = share(SOREN, "astro_1", "g1", [
    { z: 0,   points: "1040,2000;1060,2000;1060,2030" },
    { z: 0,   points: "900,900;920,900;920,930", ring: 1 },
    { z: 5,   points: "1043,2005;1063,2005;1063,2035" }
  ]);
  ok("every row is accepted", r.every(x => x.ok === true), JSON.stringify(r[0]));
  ok("...not refused as an unknown type",
     !r.some(x => /unknown report type/.test(String(x.error || ""))));
  ok("the sheet exists with one row per contour", !!sheet() && sheet().rows.length === 4,
     sheet() ? sheet().rows.length - 1 + " rows" : "no sheet");
}

console.log("\nsection 0 and ring 0 survive, which `d.z||\"\"` would not");
{
  const z = col("z"), ri = col("ringIndex");
  ok("section 0 is a 0, not a blank", sheet().rows[1][z] === 0, JSON.stringify(sheet().rows[1][z]));
  ok("ring 0 is a 0, not a blank", sheet().rows[1][ri] === 0, JSON.stringify(sheet().rows[1][ri]));
  ok("...and the second ring of that section is 1", sheet().rows[2][ri] === 1,
     JSON.stringify(sheet().rows[2][ri]));
}

console.log("\nwho traced it is the verified identity, never the posted one");
{
  const n = col("reporterName"), e = col("reporterEmail");
  ok("the name is the token's", sheet().rows[1][n] === "Søren Grubb", sheet().rows[1][n]);
  ok("...and the spoofed one is gone", sheet().rows[1][n] !== "SOMEBODY ELSE ENTIRELY");
  ok("...as is the spoofed email", sheet().rows[1][e] === "soren@grubb.dk", sheet().rows[1][e]);
}

console.log("\nand nothing else moved -- no consensus, by instruction");
{
  const book = bookFor("ujump");
  ok("no Master cell list row was created", !book.getSheetByName("Master cell list"));
  ok("no identity sheet was touched",
     !book.getSheetByName("New identifications") && !book.getSheetByName("Confirmations")
     && !book.getSheetByName("Discrepancies"));
  ok("no vote sheet, no organelle row",
     !book.getSheetByName("Identity votes") && !book.getSheetByName("Organelle locations"));
}

console.log("\nthe index: who traced what, without the contours");
{
  const r = get({ tracings: "1" });
  ok("one entry", r.tracings.length === 1, r.tracings.length);
  const t = r.tracings[0];
  ok("...named, typed and coloured as he saved it",
     t.name === "Lysosome" && t.cellType === "Astrocyte"
     && t.color === "#40e28c" && t.nucleusId === "253863", JSON.stringify(t.cellType));
  /* THE ONTOLOGY'S OWN VALUE, not just the label. 2026-09-17: a tracing typed "Lysosome" one day
     and "lysosome" the next is two things to the filter, the dashboard and the organelle card;
     `kind` is what makes a traced lysosome the same thing as a reported one. */
  ok("...and carrying the ontology's own value for what it is", t.kind === "lysosome", t.kind);
  ok("...attributed", t.tracedBy === "Søren Grubb", t.tracedBy);
  ok("...counting 3 contours over 2 sections", t.contours === 3 && t.sections === 2,
     t.contours + " contours, " + t.sections + " sections");
  ok("...and carrying NO contour text, which is the point of an index", !t.rows,
     JSON.stringify(Object.keys(t)));
  ok("reporterEmail is never sent", JSON.stringify(r).indexOf("soren@grubb.dk") < 0);
}

console.log("\nand the rows, when asked for one tracing by id");
{
  const r = get({ tracings: "1", structureId: "astro_1" });
  const rows = r.tracings[0].rows;
  ok("every contour comes back", rows.length === 3, rows.length);
  ok("...in core/tracing.js's own field names, so rowsToStructures reads them unchanged",
     rows.every(x => "structureId" in x && "z" in x && "ringIndex" in x && "points" in x
                     && "reporterName" in x && "kind" in x), JSON.stringify(Object.keys(rows[0])));
  ok("...with the kind on every one of them", rows.every(x => x.kind === "lysosome"), rows[0].kind);
  ok("...with the coordinates untouched", rows[0].points === "1040,2000;1060,2000;1060,2030",
     rows[0].points);
}

console.log("\ntwo people tracing the same cell stay two tracings");
{
  share(OTHER, "astro_1", "g2", [
    { z: 0, points: "500,500;520,500;520,530" },
    { z: 5, points: "505,505;525,505;525,535" }
  ]);
  const r = get({ tracings: "1" });
  ok("two entries under one structureId", r.tracings.length === 2, r.tracings.length);
  ok("...one each", r.tracings.map(t => t.tracedBy).sort().join(" / ") === "Somebody Else / Søren Grubb",
     r.tracings.map(t => t.tracedBy + ":" + t.contours).join(", "));
  ok("...and neither took the other's contours",
     r.tracings.every(t => t.structureId === "astro_1")
     && r.tracings.map(t => t.contours).sort().join() === "2,3",
     r.tracings.map(t => t.contours).join(" and "));
}

console.log("\nsharing it again is a new version, not a duplicate");
{
  const before = sheet().rows.length;
  share(SOREN, "astro_1", "g3", [
    { z: 0,  points: "1041,2001;1061,2001;1061,2031" },
    { z: 5,  points: "1044,2006;1064,2006;1064,2036" },
    { z: 10, points: "1047,2011;1067,2011;1067,2041" },
    { z: 15, points: "1050,2016;1070,2016;1070,2046" }
  ]);
  const r = get({ tracings: "1" });
  const mine = r.tracings.find(t => t.tracedBy === "Søren Grubb");
  ok("still two tracings, not three", r.tracings.length === 2, r.tracings.length);
  ok("his is now the NEWER version only", mine.contours === 4 && mine.sections === 4,
     mine.contours + " contours over " + mine.sections + " sections");
  ok("...and the older version's rows are still in the sheet, deleted by nothing",
     sheet().rows.length === before + 4, sheet().rows.length - 1 + " rows on file");
  ok("the other person's tracing is untouched by his re-share",
     r.tracings.find(t => t.tracedBy === "Somebody Else").contours === 2);
  const rows = get({ tracings: "1", structureId: "astro_1" }).tracings
    .find(t => t.tracedBy === "Søren Grubb").rows;
  ok("...and asking for the rows gives the new version's four, not all eleven", rows.length === 4,
     rows.length);
  ok("...starting from the version he shared last",
     rows[0].points === "1041,2001;1061,2001;1061,2031", rows[0].points);
}

console.log("\nan empty sheet answers, rather than throwing");
{
  ctx.CURRENT_DS = "empty";
  const r = get({ tracings: "1" });
  ok("no sheet is an empty list", Array.isArray(r.tracings) && r.tracings.length === 0);
  ctx.CURRENT_DS = "ujump";
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
