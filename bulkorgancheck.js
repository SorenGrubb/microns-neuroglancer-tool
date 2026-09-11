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
  const run = await p.evaluate(async ({ url, cells }) => {
    /* The fixture. Five markers:
         0,1  -> cell A, cleanly inside it and inside its nucleus     -> ticked
         2    -> cell B, inside it and inside its nucleus             -> ticked
         3    -> no cell at all (extracellular space)                 -> listed, not ticked
         4    -> inside cell C but NOT inside any nucleus             -> listed, not ticked
       Keyed by the marker's x so the fixture cannot drift from the order of the rows. */
    const byX = {
      10: { rootId: cells[0].root, nucleusId: Number(cells[0].nuc), inCell: true,  inNucleus: true },
      20: { rootId: cells[0].root, nucleusId: Number(cells[0].nuc), inCell: true,  inNucleus: true },
      30: { rootId: cells[1].root, nucleusId: Number(cells[1].nuc), inCell: true,  inNucleus: true },
      40: { rootId: "0",           nucleusId: 0,                    inCell: false, inNucleus: false,
            why: "nothing segmented there" },
      50: { rootId: cells[2].root, nucleusId: 0,                    inCell: true,  inNucleus: false }
    };
    UJ.segread.configure = () => ({});
    UJ.segread.resolveAt = async (v) => byX[v[0]] || { rootId: "0", nucleusId: 0,
                                                       inCell: false, inNucleus: false, why: "no fixture" };
    window.__posted = [];
    window.postReport = (payload) => { window.__posted.push(payload); return true; };

    document.getElementById("bulkOrganKind").value = "nucleoplasmic_reticulum_2";
    document.getElementById("bulkOrganLink").value = url;
    document.getElementById("bulkOrganLayer").value = "";
    await bulkOrganFindCells();

    const rows = [...document.querySelectorAll("#bulkOrganTable tr")].slice(1);
    return {
      nRows: rows.length,
      ticked: [...document.querySelectorAll(".bulkorgpick")].map(c => c.checked),
      text: rows.map(r => r.innerText.replace(/\s+/g, " ").trim()),
      summary: document.querySelector("#bulkOrganTable p").innerText,
      submitShown: document.getElementById("bulkOrganSubmitRow").style.display !== "none",
      /* A top-level `let` in a classic script is NOT a window property — it lives in the shared
         global lexical environment, so the bare name resolves and window.NAME does not. */
      state: BULK_ORGAN_ROWS.map(r => ({ use: r.use, root: r.rootId, i: r.i, why: r.why }))
    };
  }, { url: link([[[10,1,1],[11,1,1]], [[20,1,1],[21,1,1]], [[30,1,1],[31,1,1]],
                  [[40,1,1],[41,1,1]], [[50,1,1],[51,1,1]]]), cells });

  ok(run.nRows === 5, "five line annotations make five rows, not ten", run.nRows + " rows");
  ok(String(run.ticked) === "true,true,true,false,false",
     "the three that resolved are ticked and the two that did not are NOT", String(run.ticked));
  ok(/no cell at this point|nothing segmented/.test(run.text[3]),
     "the marker in empty space says why", run.text[3].slice(-60));
  ok(/not inside any nucleus/.test(run.text[4]),
     "an NR type II outside every nucleus is called out, not filed", run.text[4].slice(-60));
  ok(/Nucleus /.test(run.text[0]) && run.text[0].indexOf(cells[0].nuc) >= 0,
     "a resolved row names the cell it found", run.text[0].slice(0, 70));
  ok(/3 of 5 markers ticked, across 2 cells/.test(run.summary),
     "the summary counts markers AND cells", run.summary.split(".")[0]);
  ok(run.submitShown, "submit appears once something is tickable");

  console.log("\nwhat gets submitted");
  const sent = await p.evaluate(() => {
    document.getElementById("bulkOrganComment").value = "from the survey";
    bulkOrganSubmit();
    return { posted: window.__posted, thanks: document.getElementById("bulkOrganThanks").innerText };
  });
  ok(sent.posted.length === 3, "exactly the three ticked rows are posted", sent.posted.length + " posts");
  ok(sent.posted.every(x => x.type === "organelle_location"),
     "...as organelle_location rows, the contract that already exists");
  ok(sent.posted.every(x => x.kind === "nucleoplasmic_reticulum_2"),
     "...all of one kind, which is the whole constraint");
  const groups = {};
  sent.posted.forEach(x => { (groups[x.groupId] = groups[x.groupId] || []).push(x); });
  ok(Object.keys(groups).length === 2, "ONE GROUP PER CELL, not one per marker and not one overall",
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
  ok(/3 structures logged across 2 cells/.test(sent.thanks), "and it says what it did", sent.thanks.trim());

  console.log("\nwhen he disagrees with the tool");
  const retick = await p.evaluate(async () => {
    /* Tick the "not inside any nucleus" row back on: it is his call, not the tool's. */
    const boxes = [...document.querySelectorAll(".bulkorgpick")];
    boxes[4].checked = true;
    boxes[4].dispatchEvent(new Event("change", { bubbles: true }));
    const summary = document.querySelector("#bulkOrganTable p").innerText;
    window.__posted = [];
    document.getElementById("bulkOrganSubmit").disabled = false;
    bulkOrganSubmit();
    return { summary, posted: window.__posted.length,
             roots: [...new Set(window.__posted.map(x => x.rootId))].length };
  });
  ok(/4 of 5 markers ticked, across 3 cells/.test(retick.summary),
     "ticking a flagged row back on updates the counts", retick.summary.split(".")[0]);
  ok(retick.posted === 4 && retick.roots === 3,
     "...and it is submitted, in its own cell's group", retick.posted + " posts / " + retick.roots + " cells");

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

  const newErrors = errors.filter(e => !/atob/.test(e));   // the known vascdata11 blob, pre-existing
  ok(newErrors.length === 0, "the page still loads with no new errors", newErrors.join(" | ") || "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
