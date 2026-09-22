/* What the bounding-box panel writes into the Blender notebook.                       2026-09-22

   Søren, on an export limited to one cell: "I found that there was another nucleus with lysosomes
   also included, which was way outside the bounding box and disturbed the rotation part of the
   video. That needs to not happen." The panel sent every tracing the page had kept, whatever cell
   it belonged to and wherever it was.

   Now a tracing travels only when it belongs to a cell in the export or lies inside the box, and
   it travels with its KIND and without a colour -- colour_policy.py in the notebook decides the
   colours (nbcolourcheck.py drives that half).

   Run: node nbexportcheck.js */
const fs = require("fs"), vm = require("vm"), path = require("path");
const core = require("./corepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

const sandbox = { console, JSON, Math, Number, String, Array, Object, isFinite, Date, RegExp };
sandbox.window = sandbox;
sandbox.document = { documentElement: {}, createElement: () => ({ style: {} }) };
sandbox.getComputedStyle = () => ({ getPropertyValue: () => "" });
vm.createContext(sandbox);
sandbox.UJ = {};
vm.runInContext(fs.readFileSync(core("blenderexport.js"), "utf8"), sandbox);
const B = sandbox.UJ.blender;

/* One microglia at 300 um, in a 60 um box round it; a second cell 400 um away. */
const RES = [4, 4, 40];
const ring = (x, y, z) => ({ z: z, points: [[x, y], [x + 40, y], [x + 40, y + 40], [x, y + 40]] });
const boxNM = { xmin: 290000 * 4, xmax: 300000 * 4, ymin: 150000 * 4, ymax: 160000 * 4,
                zmin: 17800 * 40, zmax: 17900 * 40 };
const opts = {
  datasetId: "ujump", datasetLabel: "MICrONS minnie65", boxNM: boxNM, boxLabel: "Box 1",
  emSource: "gs://x/em", segSource: "gs://x/seg", nucSource: "precomputed://https://x/nuc",
  resNm: RES, brand: { name: "uJump", accent: "#27e0b3" },
  include: { em: true, seg: true, meshes: true, nuclei: true, vasc: false },
  cells: [{ type: "Microglia", root_id: "864691135345326066", nucleus_id: "292554", group: "292554" },
          { type: "Microglia", root_id: "864691135719809841", nucleus_id: null, group: "292554" }],
  tracings: [
    { name: "Lysosome 1", kind: "lysosome", type: "Microglia", nucleus_id: "292554", color: "#40e28c",
      rings: [ring(295700, 151400, 17840), ring(295700, 151400, 17843)] },
    { name: "Lysosome 2", kind: "lysosome", type: "Microglia", nucleus_id: "", color: "#d8e240",
      rings: [ring(295000, 151000, 17850), ring(295000, 151000, 17853)] },
    /* Another cell's, 400 um away and outside the box -- the one that disturbed the turntable. */
    { name: "Lysosome 1", kind: "lysosome", type: "Microglia", nucleus_id: "521491", color: "#40e28c",
      rings: [ring(195000, 51000, 12000), ring(195000, 51000, 12003)] }
  ]
};
const nb = B.buildNotebook(opts);
const params = nb.cells.filter(c => c.metadata && c.metadata.ujump === "params")
                 .map(c => c.source.join(""))[0];

console.log("the tracings that travel");
const block = (params.split("TRACINGS = [")[1] || "").split("\n]")[0];
const names = (block.match(/'name': '[^']*'/g) || []);
ok(names.length === 2, "the two inside the box, and not the third", names.join(" | "));
ok(!/521491/.test(params), "...the cell 400 um away is left out entirely", /521491/.test(params) ? "still there" : "gone");
ok(/'nucleus_id': '292554'/.test(params), "...the one filed against this cell is kept by its id");

console.log("\nwhat each one carries");
ok(/'kind': 'lysosome'/.test(params), "the kind, which is what the colours are decided from");
ok(!/'color': '#40e28c'/.test(params), "...and NO colour: the notebook's colour_policy decides",
   /'color'/.test(params) ? "a colour is still written" : "none");

console.log("\nand the cells");
ok((params.match(/'group': '292554'/g) || []).length === 2,
   "both root ids of the one cell carry its group, so they are one colour",
   (params.match(/'group'/g) || []).length + " groups");

console.log("\nnothing else changed");
ok(/TRACINGS = \[/.test(params) && /CELLS = \[/.test(params), "the params cell is still the params cell");
const none = B.buildNotebook(Object.assign({}, opts, { tracings: [] }));
ok(/TRACINGS = \[\]/.test(none.cells.filter(c => c.metadata && c.metadata.ujump === "params")[0].source.join("")),
   "an export with no tracings writes an empty list, as before");

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
