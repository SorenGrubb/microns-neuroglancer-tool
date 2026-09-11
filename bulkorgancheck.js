/* One paste, one structure type, as many cells as you marked.                       2026-09-10

   Søren: "make the annotation of organelles in many different cells in a bulk way with pasting the
   Neuroglancer code... figure out which cell's mesh the organelle coordinate is within."

   Drives the REAL panel in the REAL µJump page — its own parser, its own resolver, its own table,
   its own submit — with only two things replaced: UJ.segread.resolveAt (so the answers are a
   fixture rather than the live MICrONS volumes, which core/segread.js's own checks cover) and
   postReport (so what would have been sent is captured instead). Everything between those two is
   the shipped code.

   The assertion that matters most is the last one: an unticked row is NEVER submitted. He asked
   for unresolved markers to be "listed, excluded, with a reason", and a list that quietly submits
   anyway would be worse than no list.

   Run: node bulkorgancheck.js  */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A Neuroglancer state with N line annotations, the shape he described: one kind, several cells. */
function link(lines, name){
  const state = { layers: [{ type: "annotation", name: name || "annotation",
    annotations: lines.map(l => ({ type: "line", pointA: l[0], pointB: l[1] })) }] };
  return "https://neuroglancer.example/#!" + encodeURIComponent(JSON.stringify(state));
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  /* A real alert() blocks the page and would hang this file. */
  await p.addInitScript(() => { window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m)); });
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("where it sits");
  const placed = await p.evaluate(() => {
    const card = document.getElementById("bulkOrganCard");
    const jump = document.querySelector('[data-tabpanel="jump"]');
    const cell = document.getElementById("cellPanelCard");
    return {
      exists: !!card,
      inJumpTab: !!(card && jump && jump.contains(card)),
      afterCellPanel: !!(card && cell &&
        (cell.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
      collapsed: !!(card && card.querySelector("details") && !card.querySelector("details").open),
      kinds: document.querySelectorAll("#bulkOrganKind option").length,
      defaultKind: document.getElementById("bulkOrganKind").value
    };
  });
  ok(placed.exists && placed.inJumpTab, "the card is in the Jump tab");
  ok(placed.afterCellPanel, "...below the cell identification card, where he asked for it");
  ok(placed.collapsed, "...collapsed by default, so it costs nothing to a coordinate lookup");
  ok(placed.kinds > 50, "the kind list is the whole shared ontology", placed.kinds + " kinds");
  ok(placed.defaultKind === "nucleoplasmic_reticulum_2",
     "and it opens on the kind this was built for", placed.defaultKind);

  /* Open it, as a user does. Everything below reads rendered text, and a closed <details> is
     display:none — innerText on a hidden element is "", which quietly passes nothing. */
  await p.evaluate(() => { document.getElementById("bulkOrganPanel").open = true; });

  /* Ground truth out of the page's OWN table, so rootIdToIndex really resolves these. */
  const cells = await p.evaluate(() => {
    const out = [];
    for (let i = 0; i < N && out.length < 3; i++) {
      const r = rootId(i);
      if (r) out.push({ i, root: r, nuc: String(NID[i]) });
    }
    return out;
  });
  ok(cells.length === 3, "three real cells taken from the page's own data",
     cells.map(c => c.nuc).join(","));

  console.log("\nwhat a paste becomes");
  /* Nuclei with no root id, the glia-limitans case: in µJump's table with a nucleus and no cell.
     253863 and 445951 are the two real ones behind his three markers. */
  const nucOnly = await p.evaluate(() => {
    const out = [];
    for (const nid of [253863, 445951]) {
      const i = nidToIndex(nid);
      out.push({ nid, i, hasRoot: i >= 0 ? !!rootId(i) : null });
    }
    return out;
  });
  ok(nucOnly.every(n => n.i >= 0 && n.hasRoot === false),
     "his two astrocytes are in the table with a nucleus and NO root id",
     nucOnly.map(n => n.nid + "@" + n.i).join(", "));

  const run = await p.evaluate(async ({ url, cells }) => {
    /* Six markers, one per rung of the ladder and one for each way it can refuse.
         10  -> rung 1: inside a cell and its nucleus                      -> ticked
         20  -> rung 1: same cell, second structure                        -> ticked
         30  -> rung 2: no cell segmented, but inside nucleus 253863       -> ticked
         40  -> rung 3: nothing at the point, nucleus 445951 188 nm away   -> ticked (NR is in the wall)
         50  -> rung 3: two nuclei equally close                           -> refused, not tickable
         60  -> nothing within reach at all                                -> refused, not tickable
         70  -> rung 1: in a cell, but the point is inside a DIFFERENT nucleus
                                                                           -> flagged, and tickable
       Keyed by the marker's x so the fixture cannot drift from the row order. */
    const byX = {
      10: { rootId: cells[0].root, nucleusId: Number(cells[0].nuc), inCell: true,  inNucleus: true },
      11: { rootId: cells[0].root, nucleusId: Number(cells[0].nuc), inCell: true,  inNucleus: true },
      20: { rootId: cells[0].root, nucleusId: Number(cells[0].nuc), inCell: true,  inNucleus: true },
      21: { rootId: cells[0].root, nucleusId: Number(cells[0].nuc), inCell: true,  inNucleus: true },
      30: { rootId: "0", nucleusId: 253863, inCell: false, inNucleus: true },
      31: { rootId: "0", nucleusId: 253863, inCell: false, inNucleus: true },
      70: { rootId: cells[1].root, nucleusId: 999999, inCell: true, inNucleus: true },
      71: { rootId: cells[1].root, nucleusId: 999999, inCell: true, inNucleus: true }
    };
    const blank = { rootId: "0", nucleusId: 0, inCell: false, inNucleus: false,
                    why: "nothing segmented there" };
    const nearByX = {
      40: { nucleusId: 445951, distanceNm: 188, others: [] },
      41: { nucleusId: 445951, distanceNm: 260, others: [] },
      50: { nucleusId: 445951, distanceNm: 300, others: [253863] },
      51: { nucleusId: 445951, distanceNm: 320, others: [253863] }
    };
    UJ.segread.configure = () => ({});
    UJ.segread.resolveAt = async (v) => byX[v[0]] || blank;
    UJ.segread.nearestNucleus = async (v) => nearByX[v[0]] || { nucleusId: 0, distanceNm: 0, others: [] };
    /* SIGNED IN. Since 2026-09-11 the panel asks reportGateBlock() once before the first post and
       returns without touching anything if the answer is no -- so a signed-out fixture would test
       the gate (signingatecheck.js does that) instead of the grouping this file is about. */
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "test.credential.jwt";
    GOOGLE_EXP = Math.floor(Date.now() / 1000) + 3600;
    window.__posted = [];
    window.postReport = (payload) => { window.__posted.push(payload); return true; };

    document.getElementById("bulkOrganKind").value = "nucleoplasmic_reticulum_2";
    document.getElementById("bulkOrganLink").value = url;
    document.getElementById("bulkOrganLayer").value = "";
    await bulkOrganFindCells();

    const rows = [...document.querySelectorAll("#bulkOrganTable tr")].slice(1);
    return {
      nRows: rows.length,
      ticked: [...document.querySelectorAll("#bulkOrganTable input[type=checkbox]")].map(c => c.checked),
      disabled: [...document.querySelectorAll("#bulkOrganTable input[type=checkbox]")].map(c => c.disabled),
      text: rows.map(r => r.innerText.replace(/\s+/g, " ").trim()),
      summary: document.querySelector("#bulkOrganTable p").innerText,
      submitShown: document.getElementById("bulkOrganSubmitRow").style.display !== "none",
      /* A top-level `let` in a classic script is NOT a window property — it lives in the shared
         global lexical environment, so the bare name resolves and window.NAME does not. */
      state: BULK_ORGAN_ROWS.map(r => ({ use: r.use, key: r.cellKey, i: r.i, warn: r.warn, note: r.note }))
    };
  }, { url: link([[[10,1,1],[11,1,1]], [[20,1,1],[21,1,1]], [[30,1,1],[31,1,1]],
                  [[40,1,1],[41,1,1]], [[50,1,1],[51,1,1]], [[60,1,1],[61,1,1]],
                  [[70,1,1],[71,1,1]]]), cells });

  ok(run.nRows === 7, "seven line annotations make seven rows, not fourteen", run.nRows + " rows");
  ok(String(run.ticked) === "true,true,true,true,false,false,false",
     "everything the ladder resolved cleanly is ticked; the three it would not are not",
     String(run.ticked));
  ok(String(run.disabled) === "false,false,false,false,true,true,false",
     "a row with NO CELL has no checkbox at all, while a flagged row that HAS one stays tickable",
     String(run.disabled));
  ok(/no cell segmentation here/.test(run.text[2]) && run.text[2].indexOf("253863") >= 0,
     "rung 2: only the nucleus is segmented, and it names the cell", run.text[2].slice(-70));
  ok(/in the wall of the nucleus, 188 nm away/.test(run.text[3]) && run.text[3].indexOf("445951") >= 0,
     "rung 3: an NR type II 188 nm outside the nucleus is IN ITS WALL, not misplaced",
     run.text[3].slice(-70));
  ok(/between nuclei/.test(run.text[4]),
     "two nuclei equally close is reported as ambiguous, not resolved by preference",
     run.text[4].slice(-60));
  ok(/nothing segmented there|no cell and no nucleus/.test(run.text[5]),
     "nothing within reach says so", run.text[5].slice(-60));
  ok(!/not inside any nucleus/.test(run.text.join(" ")),
     "and NO NR is ever called misplaced for being outside a nucleus — it always is",
     "the 2026-09-10 rule, removed");
  ok(/Nucleus /.test(run.text[0]) && run.text[0].indexOf(cells[0].nuc) >= 0,
     "a rung-1 row still names the cell it found", run.text[0].slice(0, 70));
  ok(/4 of 7 markers ticked, across 3 cells/.test(run.summary),
     "the summary counts markers and CELLS — two nucleus-only cells are two, not one",
     run.summary.split(".")[0]);
  ok(run.submitShown, "submit appears once something is tickable");

  console.log("\nwhat gets submitted");
  const sent = await p.evaluate(() => {
    document.getElementById("bulkOrganComment").value = "from the survey";
    bulkOrganSubmit();
    return { posted: window.__posted, thanks: document.getElementById("bulkOrganThanks").innerText };
  });
  ok(sent.posted.length === 4, "exactly the four ticked rows are posted", sent.posted.length + " posts");
  ok(sent.posted.every(x => x.type === "organelle_location"),
     "...as organelle_location rows, the contract that already exists");
  ok(sent.posted.every(x => x.kind === "nucleoplasmic_reticulum_2"),
     "...all of one kind, which is the whole constraint");
  const groups = {};
  sent.posted.forEach(x => { (groups[x.groupId] = groups[x.groupId] || []).push(x); });
  ok(Object.keys(groups).length === 3, "ONE GROUP PER CELL, not one per marker and not one overall",
     Object.keys(groups).length + " groups");
  const big = Object.values(groups).find(g => g.length === 2);
  ok(!!big && big.every(x => x.subCount === 2) && String(big.map(x => x.subIndex)) === "1,2",
     "the cell with two structures counts them 1 of 2 and 2 of 2");
  ok(sent.posted.every(x => x.pointA && x.pointB),
     "a two-ended kind carries both ends, from the line as drawn",
     sent.posted[0].pointA + " -> " + sent.posted[0].pointB);
  ok(sent.posted.every(x => x.comment === "from the survey"), "the comment goes on every row");
  ok(sent.posted.every(x => x.nucleusId && x.coord),
     "each row carries its cell's nucleus id and position, as the panel's own form does");
  ok(!sent.posted.some(x => x.rootId === "0"),
     "NOTHING UNRESOLVED WAS SUBMITTED — the point of listing rather than dropping");
  ok(sent.posted.filter(x => x.rootId === "").length === 2
     && sent.posted.filter(x => x.rootId === "").every(x => x.nucleusId),
     "a cell the segmentation knows only as a nucleus posts a BLANK root id and a real nucleus id",
     "the glia limitans case");
  ok(/4 structures logged across 3 cells/.test(sent.thanks), "and it says what it did", sent.thanks.trim());

  console.log("\nwhen he disagrees with the tool");
  const retick = await p.evaluate(async () => {
    /* Tick the flagged nucleus-disagreement row back on: it is his call, not the tool's. The two
       rows with no cell at all have no checkbox to tick, which is the point. */
    const boxes = [...document.querySelectorAll(".bulkorgpick")];
    boxes[boxes.length - 1].checked = true;
    boxes[boxes.length - 1].dispatchEvent(new Event("change", { bubbles: true }));
    const summary = document.querySelector("#bulkOrganTable p").innerText;
    window.__posted = [];
    document.getElementById("bulkOrganSubmit").disabled = false;
    bulkOrganSubmit();
    return { summary, posted: window.__posted.length,
             groups: [...new Set(window.__posted.map(x => x.groupId))].length,
             boxes: boxes.length };
  });
  ok(/5 of 7 markers ticked, across 4 cells/.test(retick.summary),
     "ticking a flagged row back on updates the counts", retick.summary.split(".")[0]);
  ok(retick.boxes === 5, "only the five rows that HAVE a cell are tickable at all",
     retick.boxes + " enabled checkboxes of 7 rows");
  ok(retick.posted === 5 && retick.groups === 4,
     "...and it is submitted, in its own cell's group", retick.posted + " posts / " + retick.groups + " cells");

  console.log("\nnothing to work with");
  const empties = await p.evaluate(async () => {
    const out = {};
    document.getElementById("bulkOrganLink").value = "https://neuroglancer.example/#!"
      + encodeURIComponent(JSON.stringify({ layers: [{ type: "image", name: "em" }] }));
    await bulkOrganFindCells();
    out.noAnnotations = document.getElementById("bulkOrganStatus").innerText;
    out.noTable = document.getElementById("bulkOrganTable").innerHTML === "";
    document.getElementById("bulkOrganLink").value = "not a link at all";
    await bulkOrganFindCells();
    out.notALink = document.getElementById("bulkOrganStatus").innerText;
    return out;
  });
  ok(/no annotations/i.test(empties.noAnnotations) && /LINE/.test(empties.noAnnotations),
     "a link with no annotations says so and names a line as an option",
     empties.noAnnotations.slice(0, 70));
  ok(empties.noTable, "...and leaves no stale table behind");
  ok(empties.notALink.length > 0, "a string that is not a link is refused, not parsed",
     empties.notALink.slice(0, 60));

  console.log("\nthe rule that was wrong, on a kind it was right about");
  const nucleoplasm = await p.evaluate(async ({ url, cells }) => {
    UJ.segread.resolveAt = async () => ({ rootId: cells[0].root, nucleusId: 0,
                                          inCell: true, inNucleus: false });
    const out = {};
    for (const kind of ["nucleolus", "nucleoplasmic_reticulum_2"]) {
      document.getElementById("bulkOrganKind").value = kind;
      document.getElementById("bulkOrganLink").value = url;
      await bulkOrganFindCells();
      out[kind] = { warn: BULK_ORGAN_ROWS[0].warn, use: BULK_ORGAN_ROWS[0].use };
    }
    return out;
  }, { url: link([[[10,1,1],[11,1,1]]]), cells });
  ok(/not inside any nucleus/.test(nucleoplasm.nucleolus.warn) && !nucleoplasm.nucleolus.use,
     "a NUCLEOLUS inside a cell but outside every nucleus is still flagged — it should be inside",
     nucleoplasm.nucleolus.warn);
  ok(!nucleoplasm.nucleoplasmic_reticulum_2.warn && nucleoplasm.nucleoplasmic_reticulum_2.use,
     "an NR type II in the same place is not — its core is cytoplasm, by definition",
     "doi:10.3389/fcell.2022.914286");


  const newErrors = errors.filter(e => !/atob/.test(e));   // the known vascdata11 blob, pre-existing
  ok(newErrors.length === 0, "the page still loads with no new errors", newErrors.join(" | ") || "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
