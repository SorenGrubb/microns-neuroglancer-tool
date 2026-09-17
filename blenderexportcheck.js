/* core/blenderexport.js writes the TESTED notebook, with only the panel's cell swapped.
   2026-09-07

   The whole design of that file is "carry the notebook verbatim, replace one cell". If that
   property quietly stops holding -- a stale regeneration, a params cell that fails to match, a
   substitution that lands in the wrong place -- what comes out still looks like a perfectly good
   notebook and runs happily against the TEST cells and the TEST box. Somebody would only find out
   after paying for a Colab run.

   So this check compares the generated notebook against blender/ujump_blender_scene.ipynb cell by
   cell, and insists that exactly one differs.

   Run: node blenderexportcheck.js
*/
const fs = require("fs"), { JSDOM } = require("jsdom");
let bad = 0;
function ok(name, cond, detail){
  if (!cond) bad++;
  console.log((cond ? "PASS " : "*** FAIL *** ") + name + (detail ? "  <- " + detail : ""));
}

const dom = new JSDOM("<!doctype html><html><body></body></html>",
  { runScripts: "outside-only", url: "https://grubblab.com/" });
const w = dom.window;
const saved = [];
w.URL.createObjectURL = (b) => { saved.push(b); return "blob:stub"; };
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function(){};
try { w.eval(fs.readFileSync("core/blenderexport.js", "utf8")); }
catch (e) { console.log("*** core/blenderexport.js did not evaluate: " + e.message); process.exit(1); }
const B = w.UJ.blender;

const OPTS = {
  datasetId: "minnie65", datasetLabel: "µJump", boxLabel: "Box 2",
  emSource: "gs://iarpa_microns/minnie/minnie65/em",
  segSource: "gs://iarpa_microns/minnie/minnie65/seg_m1300",
  nucSource: "precomputed://https://bossdb-open-data.s3.amazonaws.com/iarpa_microns/minnie/minnie65/nuclei",
  boxNM: { xmin: 670000, xmax: 730000, ymin: 570000, ymax: 630000, zmin: 735000, zmax: 765000 },
  cells: [
    { type: "23P", root_id: "864691135275621605", nucleus_id: "190151" },
    { type: "astrocyte", root_id: "864691136380797141", nucleus_id: "204873" }
  ],
  colors: { "23P": "#8a3b2a", "astrocyte": "#5a4a7a" },
  include: { em: true, seg: true, meshes: true, nuclei: true }
};

console.log("--- the surface ---");
["buildNotebook", "downloadNotebook", "filenameFor"].forEach(n =>
  ok("UJ.blender." + n + " is callable", typeof B[n] === "function"));

const nb = B.buildNotebook(OPTS);
const ref = JSON.parse(fs.readFileSync("blender/ujump_blender_scene.ipynb", "utf8"));

console.log("\n--- it is the tested notebook ---");
ok("same number of cells", nb.cells.length === ref.cells.length,
   nb.cells.length + " vs " + ref.cells.length + " in blender/ujump_blender_scene.ipynb");

/* Jupyter's `source` is an array of lines here and a single string in the generator's output, so
   compare the joined text -- the difference is a serialisation convention, not content. */
const text = c => Array.isArray(c.source) ? c.source.join("") : String(c.source);
const differing = [];
for (let i = 0; i < Math.min(nb.cells.length, ref.cells.length); i++){
  if (text(nb.cells[i]) !== text(ref.cells[i])) differing.push(i);
}
ok("exactly one cell differs from it", differing.length === 1,
   differing.length ? "cells " + differing.join(", ") : "none differ, which means the panel's "
   + "values were NOT substituted");
ok("...and it is the one tagged params",
   differing.length === 1 && nb.cells[differing[0]].metadata
   && nb.cells[differing[0]].metadata.ujump === "params",
   differing.length === 1 ? JSON.stringify(nb.cells[differing[0]].metadata) : "n/a");

/* The four embedded modules are the point of shipping the notebook whole. */
["blend_scene.py", "glb_write.py", "em_plan.py", "em_fetch.py"].forEach(m => {
  const cell = nb.cells.find(c => text(c).startsWith("%%writefile /content/" + m));
  ok(m + " is embedded", !!cell && text(cell).length > 2000,
     cell ? Math.round(text(cell).length / 1024) + " KB" : "missing");
});
ok("every line of it is a real line, not one giant string",
   nb.cells.every(c => Array.isArray(c.source)),
   "Jupyter's own convention; a joined string works in most readers but not all");

/* ── THE PAGE'S PARAMS CELL MUST NOT DROP A NAME ────────────────────────────────  2026-09-16
   The bug this is for, twice now. core/blenderexport.js REPLACES the notebook's params cell, so
   any capitalised name that cell assigned and this one does not is a name the rest of the notebook
   can no longer see -- a NameError at runtime, often inside a try, often reported as an absence.
   It cost the vasculature its vessels on 2026-09-05 and TRACINGS its whole section on 2026-09-16.

   notebookcheck.py has a cleverer version of this (a Python AST, "covers every global the other
   cells READ") and it runs over the NOTEBOOK's own params cell -- the one that was right both
   times. This is the same idea pointed at the replacement, where the mistakes actually happen. */
console.log("\n--- the page's params cell drops no name the notebook's own defines ---");
{
  const shipped = JSON.parse(fs.readFileSync("blender/ujump_blender_scene.ipynb", "utf8"));
  const own = text(shipped.cells.find(c => c.metadata && c.metadata.ujump === "params"));
  const mine = text(nb.cells.find(c => c.metadata && c.metadata.ujump === "params"));
  const assigned = (src) => {
    const out = new Set();
    src.split("\n").forEach(l => {
      const m = /^([A-Z][A-Z0-9_]*)\s*=[^=]/.exec(l);
      if (m) out.add(m[1]);
    });
    return out;
  };
  /* Only the names another cell actually READS. PALETTE is assigned in the notebook's params cell
     and used nowhere but that cell -- it builds COLORS there -- so the page dropping it costs
     nothing, and requiring it would be a rule about style rather than about breakage. */
  let others = "";
  shipped.cells.forEach(c => {
    if (c.cell_type === "code" && !(c.metadata && c.metadata.ujump === "params"))
      others += "\n" + text(c);
  });
  const a = assigned(own), b = assigned(mine);
  const needed = [...a].filter(n => new RegExp("\\b" + n + "\\b").test(others));
  const missing = needed.filter(n => !b.has(n)).sort();
  ok("every name the notebook's params cell assigns AND another cell reads, the page assigns too",
     missing.length === 0,
     missing.length ? missing.join(", ") + " \u2014 a NameError waiting in Colab"
                    : needed.length + " names read elsewhere, all present");
}

console.log("\n--- the params cell says what the panel decided ---");
const P = text(nb.cells.find(c => c.metadata && c.metadata.ujump === "params"));
ok("the four switches, as Python booleans",
   /'em':\s+True,/.test(P) && /'segmentation':\s+True,/.test(P)
   && /'cell_3d_model':\s+True,/.test(P) && /'nuclei':\s+True,/.test(P));
ok("both matched cells, with their nucleus ids",
   ["864691135275621605", "190151", "864691136380797141", "204873"]
     .every(v => P.indexOf(v) > 0),
   P.split("\n").filter(l => l.indexOf("root_id") >= 0).length + " cell lines");
/* AND NO COLOURS. The panel used to emit COLORS = {'23P': '#8a3b2a', ...} -- a type map -- and a
   box round an arteriole then painted seven smooth muscle cells one red, indistinguishable from
   the vessel they wrap. blend_scene.py decides now (colour_policy.py), from how many cells there
   are and which two colours are reserved; the params cell emits an EMPTY map, which has to exist
   because the manifest cell reads it, and which blend_scene reads as "nothing was pinned". */
ok("an empty colour map, because the scene decides", /COLORS = \{\}/.test(P),
   P.split("\n").filter(l => l.indexOf("COLORS") >= 0)[0]);
ok("the emitted Python quotes consistently", P.indexOf('"') < 0,
   "one style throughout, the notebook's own");
ok("the three sources", P.indexOf("minnie65/em") > 0 && P.indexOf("seg_m1300") > 0
   && P.indexOf("/nuclei") > 0);

/* NANOMETRES IN, MICROMETRES OUT -- the one unit conversion in the file, and the one that would
   put the box a thousand times too far away without anyone noticing until the fetch came back
   empty. */
ok("the box is converted from nanometres to micrometres",
   P.indexOf("EM_BOX_UM      = ((670, 570, 735), (730, 630, 765))") > 0,
   P.split("\n").filter(l => l.indexOf("EM_BOX_UM") >= 0)[0]);
ok("...as a manual box, not a guess around a cell",
   /EM_BOX_MODE\s+= 'manual'/.test(P));

console.log("\n--- switches off ---");
const off = text(B.buildNotebook(Object.assign({}, OPTS,
  { include: { em: true, seg: false, meshes: true, nuclei: false } }))
  .cells.find(c => c.metadata && c.metadata.ujump === "params"));
ok("segmentation off comes through as False", /'segmentation':\s+False,/.test(off));
ok("nuclei off comes through as False", /'nuclei':\s+False,/.test(off));
ok("...and the ones left on are still True",
   /'em':\s+True,/.test(off) && /'cell_3d_model':\s+True,/.test(off));

console.log("\n--- a cell with no nucleus ---");
const nonuc = text(B.buildNotebook(Object.assign({}, OPTS,
  { cells: [{ type: "23P", root_id: "864691135275621605" }] }))
  .cells.find(c => c.metadata && c.metadata.ujump === "params"));
ok("a missing nucleus id is Python None, not the string 'undefined'",
   nonuc.indexOf("'nucleus_id': None") > 0 && nonuc.indexOf("undefined") < 0,
   nonuc.split("\n").filter(l => l.indexOf("root_id") >= 0)[0]);

console.log("\n--- the download ---");
const name = B.downloadNotebook(OPTS);
ok("it names the file after the dataset and the box", name === "minnie65_Box_2_blender.ipynb", name);
ok("...and it made a blob to save", saved.length === 1, saved.length + " blob(s)");
ok("the notebook's own colab name matches",
   nb.metadata.colab && nb.metadata.colab.name === "minnie65_Box_2_blender.ipynb",
   nb.metadata.colab && nb.metadata.colab.name);

/* The panel's notebook, on disk, so notebookcheck.py can run its cells. A params cell that is
   valid JavaScript but invalid PYTHON would pass everything above and fail in Colab; the only
   honest way to rule that out is to execute it. See the chain in README-CHECKS.md. */
fs.writeFileSync("/tmp/panel_notebook.ipynb", JSON.stringify(nb, null, 1));
console.log("\nwrote /tmp/panel_notebook.ipynb  ->  python3 blender/notebookcheck.py "
            + "/tmp/panel_notebook.ipynb");

/* STALENESS IS ALREADY COVERED, and worth saying so rather than checking twice: buildNotebook
   parses the embedded copy, so if core/blenderexport.js were regenerated from an older notebook
   -- or not regenerated at all -- the "exactly one cell differs" check above would see many
   differences, not one, and fail with the cell numbers. Re-run python3 src/core_blenderexport.py
   after editing the notebook or any of the four Python modules it embeds. */

console.log("\n" + (bad ? "*** " + bad + " FAILED ***" : "RESULT: ALL CHECKS PASSED"));
process.exit(bad ? 1 : 0);
