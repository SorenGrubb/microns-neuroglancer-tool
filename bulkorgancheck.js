/* Bulk organelle annotation: one paste, one kind, many cells.                     2026-09-21

   Written BEFORE the card was moved out of ujump.html into core/bulkorgan.js, and run on both sides
   of the move: the extraction is correct when this prints the same thing afterwards. Then run on
   every other tool that carries the card, each with its own idea of what a cell is.

   WHAT IS STUBBED, AND WHY THAT IS ENOUGH. The segmentation reader. core/segread.js is proved
   against hand-built volumes in segreadcheck.js and against the live buckets by hand; what is
   under test here is the LADDER and the SUBMISSION — which rung each marker lands on, which rows
   are tickable, how rows group into cells, and what is posted. So resolveAt and nearestNucleus
   answer from a table keyed by coordinate, and postReport records what it was handed.

   Four markers, one of each outcome:
     A, B   inside the same cell (rung 1)             -> ticked, ONE submission of two structures
     C      nothing within reach                      -> listed with its reason, NOT tickable
     D      no cell, inside a nucleus (rung 2)        -> ticked, keyed on the nucleus
   On a dataset with no nucleus volume, D has nothing to land on and must be listed like C.

   Run: node bulkorgancheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* What a cell IS on each page, asked the way the page itself asks: (index) -> the ids the card
   should post, and the voxel it should post them at. `nuc` says whether the dataset has a nucleus
   volume, which decides what marker D means. */
const HOSTS = {
  "ujump.html": { nuc: true,
    cell: "i => ({ root: rootId(i), nucId: String(NID[i]), coord: [NX[i],NY[i],NZ[i]].join(',') })",
    pick: "() => { for (let i = 0; i < NID.length; i++) if (rootId(i)) return i; return -1; }" },
  "djump.html": { nuc: true, rootless: true,
    cell: "i => ({ root: '', nucId: String(NID[i]), coord: [NX[i],NY[i],NZ[i]].join(',') })",
    pick: "() => 0" },
  "pjump.html": { nuc: true,
    cell: "i => ({ root: rootId(i), nucId: String(NID[i]), coord: [NX[i],NY[i],NZ[i]].join(',') })",
    pick: "() => { for (let i = 0; i < NID.length; i++) if (rootId(i)) return i; return -1; }" },
  "bjump.html": { nuc: false,
    cell: "i => ({ root: String(BSEG[i]), nucId: String(BID[i]), coord: [BX[i],BY[i],BZ[i]].join(',') })",
    pick: "() => { for (let i = 0; i < BID.length; i++) if (BSEG[i] && BSRC[i] === 1) return i; return -1; }" },
  "hjump.html": { nuc: false,
    cell: "i => ({ root: c3Id(i), nucId: String(HSB[i]), coord: [HX[i],HY[i],HZ[i]].join(',') })",
    pick: "() => 0" }
};

const PAGE = process.argv[2] || "ujump.html";
const H = HOSTS[PAGE];
if (!H) { console.log("no host description for " + PAGE); process.exit(2); }

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**script.google.com/**", "**accounts.google.com/**", "**cdnjs.cloudflare.com/**",
                   "**storage.googleapis.com/**", "**s3.amazonaws.com/**", "**gstatic.com/**",
                   "**princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(6000);

  console.log(PAGE + "\n\nthe card is there");
  const setup = await p.evaluate(({ cellSrc, pickSrc }) => {
    const cellOf = eval(cellSrc), pick = eval(pickSrc);
    const i = pick(), j = (i + 1) % 50;
    return { card: !!document.getElementById("bulkOrganCard"),
             kinds: (document.querySelectorAll("#bulkOrganKind option") || []).length,
             i, j, A: cellOf(i), J: cellOf(j) };
  }, { cellSrc: H.cell, pickSrc: H.pick });
  ok(setup.card, "the bulk card is on the page");
  ok(setup.kinds > 50, "...with the organelle kinds to choose from", setup.kinds);
  if (!setup.card){ await b.close(); console.log("\n" + (fails) + " FAILED"); process.exit(1); }

  console.log("\none paste, four markers, every rung");
  const got = await p.evaluate(async ({ A, J, i, j, nuc, rootless }) => {
    const PA = [101, 201, 301], PB = [102, 202, 302], PC = [103, 203, 303], PD = [104, 204, 304];
    const k = v => v.map(Math.round).join(",");
    const T = {};
    /* rung 1: in the cell. Where the dataset has no readable cell segmentation (δJump), rung 1 is
       never reached and the nucleus answers instead — which is the point of rung 2. */
    T[k(PA)] = T[k(PB)] = rootless
      ? { rootId: "0", nucleusId: Number(A.nucId), inCell: false, inNucleus: true, why: "" }
      : { rootId: A.root, nucleusId: nuc ? Number(A.nucId) : 0, inCell: true,
          inNucleus: nuc, why: "" };
    T[k(PC)] = { rootId: "0", nucleusId: 0, inCell: false, inNucleus: false,
                 why: "nothing segmented there" };
    T[k(PD)] = nuc ? { rootId: "0", nucleusId: Number(J.nucId), inCell: false, inNucleus: true, why: "" }
                   : { rootId: "0", nucleusId: 0, inCell: false, inNucleus: false,
                       why: "this dataset has no flat cell segmentation to read" };
    const configured = [];
    UJ.segread.configure = function(c){ configured.push(c); return c; };
    UJ.segread.resolveAt = async function(v){ return T[k(v)] || { rootId: "0", nucleusId: 0, inCell: false, inNucleus: false, why: "?" }; };
    UJ.segread.nearestNucleus = async function(){ return { nucleusId: 0, distanceNm: 0, others: [] }; };

    const st = { layers: [{ type: "annotation", name: "marks", annotations:
      [PA, PB, PC, PD].map((pt, n) => ({ type: "point", id: "m" + n, point: pt })) }] };
    document.getElementById("bulkOrganPanel").open = true;
    document.getElementById("bulkOrganKind").value = "mitochondria";
    document.getElementById("bulkOrganLink").value =
      "https://viewer.example/#!" + encodeURIComponent(JSON.stringify(st));
    document.getElementById("bulkOrganResolve").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 10000){
      await new Promise(r => setTimeout(r, 100));
      if (/read in/.test(document.getElementById("bulkOrganStatus").textContent)) break;
    }
    const rows = [...document.querySelectorAll("#bulkOrganTable tr")].slice(1);
    const boxes = rows.map(tr => { const c = tr.querySelector("input"); return c ? (c.disabled ? "disabled" : c.checked ? "on" : "off") : "none"; });
    const summary = (document.querySelector("#bulkOrganTable p.hint") || {}).textContent || "";

    const sent = [];
    window.reportGateBlock = function(){ return null; };
    window.postReport = function(r){ sent.push(r); return true; };
    try { if (typeof reportGateBlock !== "undefined") reportGateBlock = window.reportGateBlock; } catch (_e) {}
    try { postReport = window.postReport; } catch (_e) {}
    document.getElementById("bulkOrganComment").value = "a survey";
    document.getElementById("bulkOrganSubmit").click();
    return { status: document.getElementById("bulkOrganStatus").textContent, boxes, summary,
             texts: rows.map(tr => tr.textContent.replace(/\s+/g, " ").trim()),
             sent, thanks: document.getElementById("bulkOrganThanks").textContent,
             configured: configured.map(c => ({ seg: String(c.seg || ""), nuc: String(c.nuc || "") })) };
  }, { A: setup.A, J: setup.J, i: setup.i, j: setup.j, nuc: H.nuc, rootless: !!H.rootless });

  ok(/4 markers read in/.test(got.status), "all four markers were read", got.status);
  ok(got.boxes.length === 4, "one row per marker", got.boxes.join(","));
  ok(got.boxes[0] === "on" && got.boxes[1] === "on", "the two in the cell are ticked", got.boxes.slice(0, 2).join(","));
  ok(got.boxes[2] === "disabled", "the one with nothing under it cannot be ticked at all", got.boxes[2]);
  if (H.nuc) ok(got.boxes[3] === "on", "the one inside a nucleus is ticked, keyed on the nucleus", got.boxes[3]);
  else ok(got.boxes[3] === "disabled",
          "with no nucleus volume, a marker outside every cell has nothing to land on", got.boxes[3]);
  ok(/across (1|2) cells?/.test(got.summary), "the summary counts cells, not markers", got.summary.slice(0, 60));

  console.log("\nwhat is submitted");
  const bySub = {};
  got.sent.forEach(r => { (bySub[r.groupId] = bySub[r.groupId] || []).push(r); });
  const groups = Object.values(bySub);
  const expect = H.nuc ? 3 : 2;
  ok(got.sent.length === expect, "one row per ticked structure", got.sent.length + " sent, " + expect + " expected");
  const cellA = groups.find(g => g.length === 2) || [];
  ok(cellA.length === 2 && cellA.every(r => r.subCount === 2) && cellA[0].subIndex === 1 && cellA[1].subIndex === 2,
     "the two in one cell are ONE submission of two", cellA.map(r => r.subIndex + "/" + r.subCount).join(" "));
  const a = cellA[0] || {};
  ok(a.nucleusId === setup.A.nucId && (a.rootId || "") === (H.rootless ? "" : setup.A.root) && a.coord === setup.A.coord,
     "...filed against the cell's own ids, at its own coordinate",
     JSON.stringify({ nucleusId: a.nucleusId, rootId: a.rootId, coord: a.coord }));
  ok(a.type === "organelle_location" && a.kind === "mitochondria" && a.path === "bulk paste"
     && a.comment === "a survey" && a.pointA === "101,201,301",
     "...as organelle_location rows of the kind picked, with the marker and the comment",
     JSON.stringify({ type: a.type, kind: a.kind, path: a.path, pointA: a.pointA }));
  if (H.nuc){
    const d = groups.find(g => g.length === 1 && g[0].pointA === "104,204,304");
    ok(!!d && d[0].nucleusId === setup.J.nucId && !d[0].rootId,
       "the nucleus-only row carries the nucleus and a BLANK root", d ? JSON.stringify({ n: d[0].nucleusId, r: d[0].rootId }) : "missing");
  }
  ok(!got.sent.some(r => r.pointA === "103,203,303"), "the row with no cell is never posted");
  ok(/Thanks/.test(got.thanks), "...and it says what went", got.thanks.slice(0, 70));
  ok(got.configured.length > 0 && (!H.nuc || got.configured[0].nuc), "the reader is pointed at this dataset",
     JSON.stringify(got.configured[0] || null));
  ok(errors.length === 0, "the page still loads with no new errors", errors.join(" | ") || "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
