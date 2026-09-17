/* A traced cell starts as a paste.                                                 2026-09-16

   Drives the REAL tracing card in the REAL µJump page: paste a link of contours, keep it, and
   check it reaches the Blender notebook the panel writes. Only `postReport` and `alert` are
   replaced; everything between the textarea and the notebook is the shipped code.

   THE ASSERTION THAT MATTERS is the last section: a kept tracing appears in the params cell of the
   notebook the Blender button writes, with its coordinates intact. That is the whole feature —
   trace a cell the segmentation does not have, and get it in the .blend — and it is the one thing
   no unit test of either half can see.

   AND IT MUST WORK SIGNED OUT. Sharing a tracing needs a sign-in and a backend redeploy that has
   not happened; the export needs neither. If "Keep it" ever starts demanding either, this fails.

   Run: node tracingpanelcheck.js  */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A contour as BrainSharer's polygon tool writes one: the collection holds ids, the geometry is
   ordinary line annotations, everything flat with parentAnnotationId. */
function polygon(cx, cy, z, r, n, id){
  const pts = [];
  for (let i = 0; i < n; i++){
    const t = 2 * Math.PI * i / n;
    pts.push([Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), z]);
  }
  const lines = pts.map((p, i) => ({ type: "line", id: id + "_l" + i, parentAnnotationId: id,
                                     pointA: p, pointB: pts[(i + 1) % n] }));
  return [{ type: "polygon", id, source: pts[0],
            childAnnotationIds: lines.map(l => l.id) }].concat(lines);
}
function link(annotations){
  return "https://neuroglancer.example/#!" + encodeURIComponent(JSON.stringify(
    { layers: [{ type: "annotation", name: "annotation", annotations }] }));
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.addInitScript(() => {
    window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m));
    try { localStorage.removeItem("ujump_tracings_v1"); } catch (e) {}
  });
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("where it sits");
  const placed = await p.evaluate(() => {
    const card = document.getElementById("tracingCard");
    const jump = document.querySelector('[data-tabpanel="jump"]');
    const bulk = document.getElementById("bulkOrganCard");
    return { exists: !!card, inJump: !!(card && jump && jump.contains(card)),
             afterBulk: !!(card && bulk &&
               (bulk.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
             collapsed: !!(card && !card.querySelector("details").open),
             types: document.querySelectorAll("#tracingType option").length,
             module: typeof UJ !== "undefined" && !!UJ.tracing };
  });
  ok(placed.exists && placed.inJump, "the card is in the Jump tab");
  ok(placed.afterBulk, "...under the bulk organelle card");
  ok(placed.collapsed, "...collapsed, so it costs a coordinate lookup nothing");
  ok(placed.module, "core/tracing.js is loaded by the page");
  ok(placed.types > 20, "the cell types are the ontology's own leaf names",
     placed.types + " options");

  await p.evaluate(() => { document.getElementById("tracingPanel").open = true; });

  console.log("\nreading a pasted outline");
  const read = await p.evaluate(async ({ url }) => {
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    return { status: document.getElementById("tracingStatus").innerText,
             shown: document.getElementById("tracingFound").style.display !== "none",
             pending: typeof TRACING_PENDING !== "undefined" && TRACING_PENDING
                      ? TRACING_PENDING.rings.length : 0 };
  }, { url: link(polygon(1000, 2000, 500, 40, 12, "a")
        .concat(polygon(1005, 2005, 505, 38, 12, "b"),
                polygon(1010, 2010, 510, 30, 12, "c"))) });
  ok(read.pending === 3, "three polygons become three contours", read.pending);
  ok(/3 contours on 3 sections/.test(read.status), "...and it says what it found", read.status);
  ok(/z 500.510/.test(read.status), "...including the section range", read.status);
  ok(read.shown, "...and the naming fields appear");

  console.log("\na single section is refused");
  const one = await p.evaluate(({ url }) => {
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    return { status: document.getElementById("tracingStatus").innerText,
             shown: document.getElementById("tracingFound").style.display !== "none" };
  }, { url: link(polygon(1000, 2000, 500, 40, 12, "solo")) });
  ok(/at least two sections/.test(one.status),
     "one contour is a flat outline with no surface to close", one.status);
  ok(!one.shown, "...and it does not offer to keep it");

  console.log("\nkeeping it, signed out");
  const kept = await p.evaluate(async ({ url }) => {
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
    window.__alerts = [];
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    document.getElementById("tracingName").value = "astrocyte at the glia limitans";
    document.getElementById("tracingColor").value = "#40e28c";
    document.getElementById("tracingNucId").value = "253863";
    const sel = document.getElementById("tracingType");
    sel.value = [...sel.options].map(o => o.value).find(v => /astrocyte/i.test(v)) || "traced";
    document.getElementById("tracingKeep").click();
    return { kept: TRACINGS_KEPT.length, alerts: window.__alerts.length,
             stored: JSON.parse(localStorage.getItem("ujump_tracings_v1") || "[]").length,
             status: document.getElementById("tracingStatus").innerText,
             list: document.getElementById("tracingList").innerText.replace(/\s+/g, " ").trim(),
             cleared: document.getElementById("tracingLink").value === "" };
  }, { url: link(polygon(1000, 2000, 500, 40, 12, "k1")
        .concat(polygon(1005, 2005, 505, 38, 12, "k2"))) });
  ok(kept.kept === 1, "the tracing is kept", kept.kept);
  ok(kept.alerts === 0, "SIGNED OUT, and nothing asked him to sign in — the export does not "
     + "wait for the backend", kept.alerts + " alerts");
  ok(kept.stored === 1, "...and it survives a reload", kept.stored + " in localStorage");
  ok(/2 contours on 2 sections/.test(kept.list),
     "...and the list says what it holds", kept.list.slice(0, 80));
  ok(kept.cleared, "...and the box is cleared, ready for the next one");
  ok(/will be in the next Blender download/.test(kept.status),
     "...and it says where it went", kept.status);

  console.log("\nand it reaches the notebook the Blender button writes");
  const inNb = await p.evaluate(() => {
    const nb = UJ.blender.buildNotebook({
      datasetId: UJ.cfg.id, datasetLabel: UJ.cfg.label,
      emSource: UJ.cfg.em.emSource, segSource: UJ.cfg.em.segSource, nucSource: UJ.cfg.em.nucSource,
      boxNM: { xmin: 0, xmax: 1000, ymin: 0, ymax: 1000, zmin: 0, zmax: 1000 },
      cells: [{ type: "astrocyte", root_id: "864691135", nucleus_id: "1" }],
      include: { em: true, seg: true, meshes: true, nuclei: true },
      tracings: TRACINGS_KEPT
    });
    const c = nb.cells.find(x => x.metadata && x.metadata.ujump === "params");
    const src = Array.isArray(c.source) ? c.source.join("") : c.source;
    return { src: src.slice(src.indexOf("TRACINGS"), src.indexOf("TRACINGS") + 700) };
  });
  ok(/TRACINGS = \[/.test(inNb.src), "TRACINGS is in the params cell",
     inNb.src.split("\\n")[0]);
  ok(/astrocyte at the glia limitans/.test(inNb.src), "...carrying the name he gave it");
  ok(/'nucleus_id': '253863'/.test(inNb.src), "...and the nucleus he tied it to");
  ok(/'color': '#40e28c'/.test(inNb.src), "...and the colour he picked");
  ok(/'traced_by': ''/.test(inNb.src),
     "...and traced_by is EMPTY, because he was signed out when he kept it — a blank is honest, "
     + "a guessed name would not be");
  ok(/'z': 500, 'points': \[\[1040,2000\]/.test(inNb.src),
     "...with the contour's own coordinates, in the tool's voxels",
     (inNb.src.match(/'z': 500[^\]]{0,40}/) || [""])[0]);

  console.log("\nan export with nothing traced is unchanged");
  const empty = await p.evaluate(() => {
    const nb = UJ.blender.buildNotebook({
      datasetId: UJ.cfg.id, datasetLabel: UJ.cfg.label,
      emSource: UJ.cfg.em.emSource, segSource: UJ.cfg.em.segSource, nucSource: UJ.cfg.em.nucSource,
      boxNM: { xmin: 0, xmax: 1000, ymin: 0, ymax: 1000, zmin: 0, zmax: 1000 },
      cells: [{ type: "astrocyte", root_id: "864691135", nucleus_id: "1" }],
      include: { em: true, seg: true, meshes: true, nuclei: true }
    });
    const c = nb.cells.find(x => x.metadata && x.metadata.ujump === "params");
    const src = Array.isArray(c.source) ? c.source.join("") : c.source;
    return /TRACINGS = \[\]/.test(src);
  });
  ok(empty, "TRACINGS is an empty list, not a missing name — which is a NameError in Colab");

  console.log("\nsharing needs a sign-in, and says so once");
  const shared = await p.evaluate(({ url }) => {
    window.__alerts = []; window.__posted = [];
    window.postReport = (x) => { window.__posted.push(x); return true; };
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    document.getElementById("tracingName").value = "second tracing";
    document.getElementById("tracingShare").click();
    const out = { alerts: window.__alerts.length, posted: window.__posted.length };
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "t.t.t";
    GOOGLE_EXP = Math.floor(Date.now() / 1000) + 3600;
    window.__alerts = [];
    document.getElementById("tracingShare").click();
    out.after = window.__posted.length;
    out.rows = window.__posted.map(x => ({ t: x.type, z: x.z, n: x.name,
                                           pts: (x.points || "").split(";").length }));
    return out;
  }, { url: link(polygon(2000, 3000, 600, 25, 10, "s1")
        .concat(polygon(2005, 3005, 610, 24, 10, "s2"))) });
  ok(shared.alerts === 1 && shared.posted === 0,
     "signed out, ONE warning and nothing posted", shared.alerts + " alerts, " + shared.posted + " posts");
  ok(shared.after === 2, "signed in, one row per contour", shared.after + " rows");
  ok(shared.rows.every(r => r.t === "traced_structure"), "...of the traced_structure type");
  ok(String(shared.rows.map(r => r.z)) === "600,610", "...one per section",
     String(shared.rows.map(r => r.z)));
  ok(shared.rows.every(r => r.pts === 10), "...with all ten points of each contour");

  console.log("\nremoving one");
  const gone = await p.evaluate(() => {
    const n = TRACINGS_KEPT.length;
    document.querySelector(".tracingdrop").click();
    return { before: n, after: TRACINGS_KEPT.length,
             stored: JSON.parse(localStorage.getItem("ujump_tracings_v1") || "[]").length };
  });
  ok(gone.after === gone.before - 1 && gone.stored === gone.after,
     "Remove takes it out of the export and out of storage",
     gone.before + " -> " + gone.after);

  const newErrors = errors.filter(e => !/atob/.test(e));
  ok(newErrors.length === 0, "the page still loads with no new errors",
     newErrors.join(" | ") || "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
