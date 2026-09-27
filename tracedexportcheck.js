/* The whole cell and the nucleus travel too — into the view, and into the notebook.   2026-09-26

   Søren, having outlined an endothelial cell's whole cell, nucleus, primary cilium and centrioles
   in ηJump:

       "I tried to download the colab notebook for this cell. While it included primary cilium and
        centrioles, the nucleus and whole cell mesh were not included in the notebook - I want them
        in. They also did not show up in the Neuroglancer window after filtering for them"

   TWO CAUSES, AND BOTH ARE THE SAME MISTAKE FROM DIFFERENT SIDES: a whole cell and a nucleus are
   FILTER CRITERIA on this panel, and were nothing else.

   THE NOTEBOOK sent TRACINGS_KEPT — what the pad happens to be holding in this browser. The
   tracing card's own heading says so ("kept tracings, by cell — these go into the 3D export"), and
   the cilium and centrioles were kept because he had just drawn them. The whole cell and the
   nucleus were saved, shared, and in the dataset; nothing had loaded them back into this tab, so
   nothing sent them. His answer: always read them from the dataset.

   THE VIEW was set to "All outlined organelles", which by deliberate design excludes the two kinds
   that are not organelles — a whole cell is a hundred times the contours of a lysosome, so they get
   pickers of their own. He had ticked "whole cell (traced)" and "nucleus (traced)", which decides
   WHICH CELLS MATCH and nothing about what is drawn. His answer: an "Everything outlined" option,
   and ticking either criterion moves the picker to it.

   WHAT IS ASSERTED
     the picker
       - it offers "Everything outlined", counting whole cells, nuclei and organelles together
       - ticking "whole cell (traced)" moves the picker to it
       - ...and a picker the user has already set for themselves is left alone
       - "__everything" really draws all three kinds, in one view
       - "__all" still means organelles only — the old behaviour is not quietly changed
     the notebook
       - tracedStructuresForCells returns a cell's outlines from the DATASET, with geometry
       - ...matched by nucleus id or by root id, whichever the tracer had
       - ...and never another cell's
       - the notebook carries the whole cell and the nucleus with nothing kept in the browser
       - ...and what IS kept still wins, because it may hold edits the dataset has not seen

   Run: node tracedexportcheck.js [page.html]      (default hjump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const PAGE = process.argv[2] || "hjump.html";

/* One cell, outlined four ways — his cell, in miniature. The whole cell and the nucleus are filed
   against the ROOT id (a tracer who started from a coordinate inside a process has no nucleus id);
   the organelles against the NUCLEUS id, so the match has to work from either. */
const ROOT = "6475165144", NUC = "31244059", OTHER_ROOT = "999000111";
const ring = (z, n) => ({ z: z, points: Array.from({ length: n }, (_, k) => [1000 + k, 2000 + k]) });
const STRUCTS = [
  { structureId: "s_cell", kind: "cell",     name: "Whole cell",   rootId: ROOT, nucleusId: "",  color: "#4ade80", n: 3 },
  { structureId: "s_nuc",  kind: "nucleus",  name: "Nucleus",      rootId: ROOT, nucleusId: "",  color: "#6366f1", n: 2 },
  { structureId: "s_cil",  kind: "cilium",   name: "Primary cilium", rootId: "", nucleusId: NUC, color: "#facc15", n: 2 },
  { structureId: "s_cen",  kind: "centriole", name: "Centrioles",  rootId: "",  nucleusId: NUC, color: "#f97316", n: 1 },
  { structureId: "s_away", kind: "cell",     name: "Somebody else’s cell", rootId: OTHER_ROOT, nucleusId: "", color: "#fff", n: 2 }
];
const INDEX = STRUCTS.map(s => ({ structureId: s.structureId, kind: s.kind, instanceOf: s.kind,
  name: s.name, color: s.color, rootId: s.rootId, nucleusId: s.nucleusId,
  tracedBy: "Søren Grubb", contours: s.n, sections: s.n }));
/* "x,y;x,y;…" — core/tracing.js's decodePoints reads this and nothing else. A JSON array here
   produces a structure with no contours on it, which reads exactly like a backend that lost them. */
const enc = pts => pts.map(p => p.join(",")).join(";");
const rowsFor = s => Array.from({ length: s.n }, (_, i) => ({
  structureId: s.structureId, kind: s.kind, instanceOf: s.kind, name: s.name, color: s.color,
  rootId: s.rootId, nucleusId: s.nucleusId, reporterName: "Søren Grubb",
  z: 400 + i, points: enc(ring(400 + i, 6).points) }));

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1050 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**googleapis.com/**"])
    await p.route(h, r => r.abort());

  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url());
    const H = { "Access-Control-Allow-Origin": "*" };
    const J = o => route.fulfill({ status: 200, contentType: "application/json", headers: H,
                                   body: JSON.stringify(o) });
    if (u.searchParams.get("tracings") === "1"){
      const one = u.searchParams.get("structureId");
      const many = u.searchParams.get("structureIds");
      if (one){
        const s = STRUCTS.filter(x => x.structureId === one)[0];
        return J({ tracings: s ? [{ structureId: one, rows: rowsFor(s) }] : [] });
      }
      if (many){
        const want = many.split(",");
        return J({ tracings: STRUCTS.filter(x => want.indexOf(x.structureId) >= 0)
                     .map(x => ({ structureId: x.structureId, rows: rowsFor(x) })) });
      }
      return J({ tracings: INDEX });
    }
    return J({ ok: true, identities: [], organelles: [], reports: [], rows: [], newCells: [] });
  });

  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(6000);

  /* ── the picker ───────────────────────────────────────────────────────────────────────── */
  console.log("the outline picker");
  const picker = await p.evaluate(async () => {
    const sel = document.getElementById("filterOrganSeg");
    if (!sel) return { none: true };
    if (typeof fillOrganSegKinds === "function") await fillOrganSegKinds();
    await new Promise(r => setTimeout(r, 400));
    return { none: false,
             values: [].map.call(sel.options, o => o.value),
             labels: [].map.call(sel.options, o => o.textContent) };
  });
  ok(!picker.none, "the page has an outline picker", picker.none ? "no #filterOrganSeg" : "yes");
  const everyAt = picker.none ? -1 : picker.values.indexOf("__everything");
  ok(everyAt >= 0, "it offers “Everything outlined”",
     picker.none ? "-" : picker.values.join(" | "));
  ok(everyAt >= 0 && /\b5\b/.test(picker.labels[everyAt] || ""),
     "...counting whole cells, nuclei and organelles together — all five here",
     everyAt >= 0 ? picker.labels[everyAt] : "-");

  console.log("\nand it follows what you filtered for");
  const followed = await p.evaluate(async () => {
    const sel = document.getElementById("filterOrganSeg");
    const box = [].slice.call(document.querySelectorAll(".forganelle"))
                  .filter(e => e.value === "__traced_cell")[0];
    if (!sel || !box) return { none: true };
    sel.value = "";                              // untouched, as the page loads
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const moved = sel.value;
    /* And now a picker the user has set on purpose, which must be left where they put it. */
    sel.value = "cilium"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    const other = [].slice.call(document.querySelectorAll(".forganelle"))
                    .filter(e => e.value === "__traced_nucleus")[0];
    if (other){ other.checked = true; other.dispatchEvent(new Event("change", { bubbles: true })); }
    await new Promise(r => setTimeout(r, 300));
    return { none: false, moved: moved, kept: sel.value };
  });
  ok(!followed.none && followed.moved === "__everything",
     "ticking “whole cell (traced)” moves the picker to it",
     followed.none ? "no checkbox" : (followed.moved || "(left empty)"));
  ok(!followed.none && followed.kept === "cilium",
     "...and a picker you have set yourself is left where you put it",
     followed.none ? "-" : followed.kept);

  console.log("\nand __everything draws all three kinds");
  const drew = await p.evaluate(async ([root, nuc]) => {
    const kinds = async function(pick){
      const ls = await buildTracedOrganelleLayers({ nuc: [nuc], root: [root] }, pick,
                                                  function(){}, { quiet: true });
      return (ls || []).map(l => String(l.name || ""));
    };
    return { every: await kinds("__everything"), all: await kinds("__all"),
             cells: await kinds("__cells") };
  }, [ROOT, NUC]);
  const has = (a, s) => a.some(x => new RegExp(s, "i").test(x));
  ok(has(drew.every, "cell") && has(drew.every, "nucleus")
       && (has(drew.every, "cilium") || has(drew.every, "centriole")),
     "“Everything outlined” draws the whole cell, the nucleus and the organelles",
     drew.every.join(" | ") || "(no layers)");
  ok(!has(drew.all, "whole cell") && (has(drew.all, "cilium") || has(drew.all, "centriole")),
     "...and “all organelles” still means organelles only",
     drew.all.join(" | ") || "(no layers)");
  ok(has(drew.cells, "cell"), "...and “whole cells” still draws those",
     drew.cells.join(" | ") || "(no layers)");

  /* ── the dataset's own outlines, for the notebook ─────────────────────────────────────── */
  console.log("\nthe outlines the dataset holds");
  const got = await p.evaluate(async ([root, nuc, other]) => {
    if (typeof tracedStructuresForCells !== "function") return { missing: true };
    const r = await tracedStructuresForCells({ nuc: [nuc], root: [root] }, function(){});
    return { missing: false,
             names: (r.tracings || []).map(t => String(t.name || "")),
             kinds: (r.tracings || []).map(t => String(t.kind || "")),
             rings: (r.tracings || []).map(t => ((t.rings || []).length)),
             ids: (r.tracings || []).map(t => String(t.root_id || t.nucleus_id || "")),
             capped: r.capped || 0,
             other: (r.tracings || []).some(t => String(t.root_id || "") === other) };
  }, [ROOT, NUC, OTHER_ROOT]);
  ok(!got.missing, "core offers tracedStructuresForCells", got.missing ? "it does not" : "yes");
  ok(!got.missing && got.kinds.indexOf("cell") >= 0 && got.kinds.indexOf("nucleus") >= 0,
     "it returns the whole cell and the nucleus, which nothing had kept",
     got.missing ? "-" : got.kinds.join(", ") || "(nothing)");
  ok(!got.missing && got.kinds.indexOf("cilium") >= 0 && got.kinds.indexOf("centriole") >= 0,
     "...and the organelles beside them, matched on the other id",
     got.missing ? "-" : got.kinds.join(", "));
  ok(!got.missing && got.rings.length > 0 && got.rings.every(n => n > 0),
     "...each with its geometry, not just its name",
     got.missing ? "-" : got.rings.join("/") + " rings");
  ok(!got.missing && !got.other, "...and never a cell this export is not about",
     got.missing ? "-" : (got.other ? "somebody else's came too" : "only this cell's"));

  /* ── and into the notebook ────────────────────────────────────────────────────────────── */
  console.log("\nand into the notebook");
  const nb = await p.evaluate(async ([root, nuc]) => {
    if (!window.UJ || !UJ.blender) return { missing: true };
    /* THE REAL PATH, downloadNotebook — not buildNotebook. The dataset read, the merge and the
       "this was fetched for these cells" mark all live in downloadNotebook, so a check that built
       the notebook by hand would be testing its own arithmetic. The blob is caught on its way to
       the anchor and read back; nothing is downloaded.

       THE CELL IS THE SHAPE ηJUMP REALLY SENDS: nucleus_id null, because H01 publishes no nucleus
       volume and the notebook fetches a nucleus mesh with that field — and trace_nucleus_id beside
       it, the cell_bodies object its tracings are actually filed under. Asking only the first two
       questions is what lost the organelles. */
    const clicks = HTMLAnchorElement.prototype.click;
    const mkurl = URL.createObjectURL;
    const mk = async function(kept){
      let caught = null;
      URL.createObjectURL = function(bl){ caught = bl; return "blob:stub"; };
      HTMLAnchorElement.prototype.click = function(){};
      try {
        await UJ.blender.downloadNotebook({
          datasetId: "t", datasetLabel: "t", emSource: "", segSource: "",
          boxNM: { xmin: 0, xmax: 1e9, ymin: 0, ymax: 1e9, zmin: 0, zmax: 1e9 },
          boxLabel: "Box 1", cells: [{ type: "endothelial", root_id: root, nucleus_id: null, trace_nucleus_id: nuc }],
          tracings: kept, resNm: [8, 8, 33],
          include: { em: false, seg: false, meshes: true, nuclei: false, vasc: false } });
      } finally {
        URL.createObjectURL = mkurl; HTMLAnchorElement.prototype.click = clicks;
      }
      return caught ? await caught.text() : "(nothing was written)";
    };
    const bare = await mk([]);
    /* What the pad is holding wins: same structure id, geometry the dataset has not seen. */
    const edited = await mk([{ id: "s_cell", structureId: "s_cell", kind: "cell",
                               name: "Whole cell (edited here)", type: "cell", root_id: root,
                               nucleus_id: "", traced_by: "Søren Grubb",
                               rings: [{ z: 401, points: [[5, 5], [6, 6], [7, 7]] }] }]);
    return { missing: false, bare: bare, edited: edited };
  }, [ROOT, NUC]);
  ok(!nb.missing, "the notebook module is loaded", nb.missing ? "it is not" : "yes");
  /* Matched on the python dict the notebook actually writes, not on the words appearing anywhere
     in it — the notebook's own prose says "nucleus" a dozen times, and a check that passes on the
     documentation is a check that passes on an empty TRACINGS list. */
  const inNb = (s, n) => new RegExp("'name': '" + n + "'").test(s);
  ok(!nb.missing && inNb(nb.bare, "Whole cell"),
     "the notebook carries the whole cell with nothing kept in the browser",
     nb.missing ? "-" : (inNb(nb.bare, "Whole cell") ? "it is in TRACINGS" : "still missing"));
  ok(!nb.missing && inNb(nb.bare, "Nucleus"), "...and the nucleus",
     nb.missing ? "-" : (inNb(nb.bare, "Nucleus") ? "it is in TRACINGS" : "still missing"));
  ok(!nb.missing && inNb(nb.bare, "Primary cilium") && inNb(nb.bare, "Centrioles"),
     "...without losing the organelles it already carried",
     nb.missing ? "-" : (inNb(nb.bare, "Primary cilium") && inNb(nb.bare, "Centrioles")
                         ? "both in TRACINGS" : "one or both missing"));
  ok(!nb.missing && !inNb(nb.bare, "Somebody else’s cell"),
     "...and not a cell the export is not about", nb.missing ? "-" : "only this cell's");
  ok(!nb.missing && inNb(nb.edited, "Whole cell \\(edited here\\)") && !inNb(nb.edited, "Whole cell"),
     "...and a tracing open in the pad wins over the dataset's copy of it",
     nb.missing ? "-" : (/edited here/.test(nb.edited) ? "the edited one travelled"
                                                       : "the dataset's copy won"));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
