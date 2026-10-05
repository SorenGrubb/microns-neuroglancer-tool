/* Two structures on one pad are two kinds.                                             2026-10-05

   Søren, 5 October: *"I added a whole cell mesh to the [nucleus's tracing] and started drawing it.
   I saved it as a draft, that was fine, it saw the whole cell and nucleus. However, as soon as I
   added it to the dataset, the whole cell mesh disappeared and the nucleus... became the same as
   the other cell's nucleus."*

   AND THE DAY BEFORE, on the same pad: *"it says 2x whole cell mesh"*. Those are the same fault
   seen from two sides, and the title fix that morning made the title honest without touching it.

   ONE BOX FOR THE WHOLE PAD. With "name each one separately" off, `tracingKindFor(inst)` falls back
   to the single #tracingWhat select for EVERY structure. So a pad holding a nucleus and a whole
   cell files both as whatever that box happens to say: both "Whole cell" on the 4th, both "Nucleus"
   on the 5th. The whole cell did not vanish -- it was filed as a nucleus, under the nucleus's own
   structure id, and the nucleus's 60 contours became version 1 of it.

   Nothing warned, because nothing in the card knew it was collapsing two kinds into one: the box is
   a legitimate answer for a pad holding one structure, and the pad never said how many it held.

   SO THIS ASKS WHAT THE SUBMISSION ACTUALLY CONTAINS, through tracingCurrentAll(), which is the one
   function both "Add it to the dataset" and the Neuroglancer link go through. Not what the strip
   draws, not what the title says -- what gets sent.

   Run: node padtwokindscheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);

  /* His pad, built the way it was built: a nucleus already in the dataset, opened for editing, and
     a whole cell drawn beside it. The numbers are his -- 60 contours on 39 sections for the
     nucleus, 47 on 47 for the cell -- so a crossing shows up as a count rather than as a name. */
  const r = await p.evaluate(async () => {
    const out = {};
    const circ = (cx, cy, rad, n) => { const o = [];
      for (let i = 0; i < n; i++){ const a = 2*Math.PI*i/n; o.push([Math.round(cx + rad*Math.cos(a)),
                                                                   Math.round(cy + rad*Math.sin(a))]); }
      return o; };
    const rings = (inst, n, rad, z0) => {
      const a = [];
      for (let k = 0; k < n; k++) a.push({ z: z0 + k * 2, inst: inst, points: circ(401085, 230736, rad, 16) });
      return a;
    };

    document.getElementById("tracingPanel").open = true;
    PAD = UJ.tracepad.create();
    /* inst 0: the nucleus that is already published, opened for editing. */
    PAD.rings = rings(0, 60, 300, 1900).concat(rings(1, 47, 1400, 1900));
    PAD.inst = 1;
    PAD.z = 1900;
    TRACING_BASE_ID = "";
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: "nucleus_1790886647285_qf2" };
    PAD_EDIT_ID = "nucleus_1790886647285_qf2";
    PAD_EDIT_IDS = { "0": "nucleus_1790886647285_qf2" };
    PAD_INST_KIND = {};
    TRACINGS_KEPT = [{ id: "nucleus_1790886647285_qf2", name: "Nucleus", kind: "nucleus",
                       nucleusId: "61360735", rootId: "6198781614" }];

    document.getElementById("tracingType").value = "Endothelial cell";
    document.getElementById("tracingNucId").value = "61360735";
    document.getElementById("tracingRootId").value = "6198781614";
    document.getElementById("tracingFound").style.display = "";

    /* THE BOX SAYS WHOLE CELL, because that is the thing he was drawing when he pressed the
       button. "name each one separately" is OFF, which is how a pad arrives unless somebody has
       gone looking for the tick. */
    document.getElementById("tracingEachOwn").checked = false;
    document.getElementById("tracingWhat").value = "__cell";

    const all = tracingCurrentAll() || [];
    out.refused = all.length === 0;
    out.rowsOn = document.getElementById("tracingEachOwn").checked;
    out.toldHim = (document.getElementById("tracingStatus") || {}).textContent || "";
    out.n = all.length;
    out.kinds = all.map(function(t){ return t.kind; });
    out.names = all.map(function(t){ return t.name; });
    out.counts = all.map(function(t){ return (t.rings || []).length; });
    out.said = (document.getElementById("tracingSay") || {}).textContent || "";

    /* AND THE SAME PAD WITH THE TICK ON, which is the state the rows make possible. Nothing about
       the contours changes; only whether the card can say what each one is. */
    document.getElementById("tracingEachOwn").checked = true;
    PAD_INST_KIND = { "0": { value: "__nucleus", kind: "nucleus", name: "Nucleus" },
                      "1": { value: "__cell", kind: "cell", name: "Whole cell" } };
    const two = tracingCurrentAll() || [];
    out.tickKinds = two.map(function(t){ return t.kind; });
    out.tickCounts = two.map(function(t){ return (t.rings || []).length; });
    return out;
  });

  /* ── AND WHAT THE SUBMISSION IS BUILT FROM ──────────────────────────────────────────────
     TRACING_PENDING is written at five moments -- a pasted link, a resumed draft, either "open in
     the pad", and "Use these contours" -- and at none of the many moments a contour is drawn.
     padRings() refreshes the preview, the volume, the strip, the 3D and the DRAFT, and leaves the
     submission's own copy alone.

     So a tracing opened for editing, drawn on, and then added to the dataset submits the contours
     as they were AT OPEN TIME. The draft is right, because draftNow() reads the pad; the thing that
     reaches Drive is the old geometry under the old id, and nothing says a word.

     THIS IS THE ONE THAT MATCHES THE FILE. nucleus_1790886647285_qf2's Drive file holds contours at
     x 426 000-427 600, y 220 100-220 900 -- nucleus 38762771's neighbourhood -- while its row says
     nucleus 61360735, whose centre is 401085, 230736, 380. Both of its versions are at the same
     place. The new drawing never reached Drive at all. 2026-10-05. */
  const stale = await p.evaluate(() => {
    const out = {};
    const circ = (cx, cy, rad, n) => { const o = [];
      for (let i = 0; i < n; i++){ const a = 2*Math.PI*i/n; o.push([Math.round(cx + rad*Math.cos(a)),
                                                                   Math.round(cy + rad*Math.cos(a))]); }
      return o; };
    const rings = (inst, n, cx, z0) => {
      const a = [];
      for (let k = 0; k < n; k++) a.push({ z: z0 + k * 2, inst: inst, points: circ(cx, 220539, 300, 16) });
      return a;
    };
    PAD = UJ.tracepad.create();
    PAD.rings = rings(0, 60, 426807, 1941);          // the tracing as it was opened
    PAD.z = 1941;
    TRACING_BASE_ID = "";
    PAD_EDIT_ID = "nucleus_1790886647285_qf2";
    PAD_EDIT_IDS = {};
    PAD_INST_KIND = {};
    /* Exactly what tracingOpenShared() leaves behind. */
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: "nucleus_1790886647285_qf2" };
    out.atOpen = TRACING_PENDING.rings.length;

    /* ...and now he draws a whole cell beside it, 47 contours somewhere else entirely. Through
       PAD.rings and padRings(), which is every path a drawn contour takes. */
    PAD.rings = PAD.rings.concat(rings(1, 47, 401085, 1941));
    try { padRings(); } catch (_e){}
    out.onPad = PAD.rings.length;
    out.inPending = (TRACING_PENDING.rings || []).length;

    document.getElementById("tracingWhat").value = "__nucleus";
    document.getElementById("tracingType").value = "Endothelial cell";
    document.getElementById("tracingNucId").value = "61360735";
    const all = tracingCurrentAll() || [];
    out.afterPending = (TRACING_PENDING.rings || []).length;
    out.n = all.length;
    out.counts = all.map(function(t){ return (t.rings || []).length; });
    /* Where the submitted contours actually are, which is the question the sheet could not answer. */
    out.where = all.map(function(t){
      const p0 = ((t.rings || [])[0] || {}).points || [[0,0]];
      return Math.round(p0.reduce(function(s, q){ return s + q[0]; }, 0) / p0.length);
    });
    return out;
  });

  console.log("\na tracing opened in the pad, drawn on, and added to the dataset");
  ok(stale.onPad === 107, "the pad holds both — 60 opened and 47 drawn", stale.onPad + " contours");
  ok(stale.afterPending === 107,
     "AND SO DOES THE SUBMISSION'S OWN COPY — TRACING_PENDING is written when a tracing is opened "
     + "and never again by drawing, so \"Add it to the dataset\" sends the contours as they were at "
     + "open time and the new structure never leaves the browser. The draft is right, because "
     + "draftNow() reads the pad; Drive gets the old geometry under the old id, silently",
     "had " + stale.inPending + " of 107 when the press came, built from "
     + stale.afterPending);
  ok(stale.n === 2 && stale.counts.join(",") === "60,47",
     "...so both structures are submitted, with their own contours",
     stale.n + " structures: " + stale.counts.join(" / "));
  ok(stale.where.join(",") === "426807,401085",
     "...and each one is submitted WHERE IT WAS DRAWN — the Drive file for "
     + "nucleus_1790886647285_qf2 holds contours at x≈426 800 while its row says nucleus "
     + "61360735, whose centre is x=401 085",
     "x ≈ " + stale.where.join(" and "));

  console.log("\na pad holding a nucleus and a whole cell, with one box for both");
  ok(r.refused === true,
     "NOTHING IS FILED WHILE TWO STRUCTURES SHARE ONE TYPE BOX \u2014 with the tick off, "
     + "tracingKindFor() answers for every structure out of the single #tracingWhat select, so on "
     + "4 October both were filed as \"Whole cell\" and on the 5th both as \"Nucleus\", and the "
     + "whole cell S\u00f8ren drew was never in the dataset as a cell at all",
     r.refused ? "refused" : r.n + " went in as " + r.kinds.join(" / "));
  ok(r.rowsOn === true,
     "...the rows are turned on instead, which is the one thing that can say what each one is",
     String(r.rowsOn));
  ok(/its own row/i.test(r.toldHim) && /pressing again/i.test(r.toldHim),
     "...and it says what happened and what to do, rather than refusing in silence",
     JSON.stringify(r.toldHim.slice(0, 110)));

  console.log("\nand with the tick on, which has always worked");
  ok(r.tickKinds.join(",") === "nucleus,cell",
     "each structure is filed as what its own row says", r.tickKinds.join(" / "));
  ok(r.tickCounts.join(",") === "60,47", "...with its own contours", r.tickCounts.join(" / "));

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
