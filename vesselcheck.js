/* A vessel is a thing you trace, and it belongs to no cell.                           2026-10-08

   Søren: *"Under Traced outlines (whole structures) I want a new topic called Vasculature with
   all the possible vascular segments Artery, arteriole, capillary, venule, vein, and one called
   Lymphatic vessel. We should be able to segment them without belonging to a certain cell, and
   they should be possible to include in the filter."*

   And, asked what the two awkward parts should mean:
     - the filter ticks pick WHICH VESSELS are listed, shown and exported — they do not filter the
       cell table, because "does this cell have an artery" is not a question;
     - a vessel is filed against its own name, reused, so segments traced on different days join
       into one vessel.

   THE NAME IS THE JOIN, and it is not a new concept: tracingSeriesLabel already strips a trailing
   number, so "Capillary A 1" and "Capillary A 2" are the series "Capillary A", exactly as three
   lysosomes on a cell are the series "Lysosome". The only thing a vessel changes is that the CELL
   is not part of the series question — there is no cell.

   WHAT IS ASSERTED:
     - the six kinds exist once, with their own colours, and nothing hardcodes the list twice
     - the pad offers them under a Vasculature heading
     - choosing one asks for a vessel name, and offers the names already in the dataset
     - a vessel is filed with NO nucleus id, NO root id and NO cell coordinate, even with a cell
       open on the card
     - ...and it is not an organelle, so it never appears in a cell's Organelles list
     - segments of one named vessel number within that vessel, across cells and sessions
     - the filter lists the vessel kinds, with their own class
     - ...and ticking one does NOT change which cells match

   Run: node vesselcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};
const KINDS = ["artery", "arteriole", "capillary", "venule", "vein", "lymphatic"];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1200 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);

  console.log("the six kinds, in one place");
  const voc = await p.evaluate(KS => {
    const V = (window.UJ && UJ.tracing && UJ.tracing.VESSELS) || null;
    if (!V) return { missing: true };
    return {
      kinds: V.map(v => v.kind),
      labels: V.map(v => v.label),
      values: V.map(v => v.value),
      colours: V.map(v => v.color),
      isVessel: KS.map(k => UJ.tracing.isVessel(k)),
      notCell: [UJ.tracing.isVessel("cell"), UJ.tracing.isVessel("nucleus"),
                UJ.tracing.isVessel("mitochondrion"), UJ.tracing.isVessel("")],
      byValue: !!(UJ.tracing.vesselOf("__capillary") || {}).kind,
      byKind: (UJ.tracing.vesselOf("Lymphatic") || {}).kind || ""
    };
  }, KINDS);
  if (voc.missing){
    console.log("  FAIL UJ.tracing.VESSELS is not on this page");
    await b.close(); process.exit(1);
  }
  ok(voc.kinds.join(",") === KINDS.join(","),
     "artery, arteriole, capillary, venule, vein, lymphatic — in flow order, not alphabetical",
     voc.kinds.join(", "));
  ok(voc.labels[5] === "Lymphatic vessel",
     "...and the sixth reads as he named it", voc.labels[5]);
  ok(voc.colours.every(c => /^#[0-9a-f]{6}$/i.test(c)) && new Set(voc.colours).size === 6,
     "...each with its own colour, so six vessels in a viewer are six vessels",
     voc.colours.join(" "));
  ok(voc.isVessel.every(Boolean) && voc.notCell.every(v => v === false),
     "isVessel() answers for the six and for nothing else", JSON.stringify(voc.notCell));
  ok(voc.byValue && voc.byKind === "lymphatic",
     "...and vesselOf() takes either the pad's value or the stored kind, any casing", voc.byKind);

  console.log("\non the pad");
  const pad = await p.evaluate(() => {
    const w = document.getElementById("tracingWhat");
    if (!w) return { noCard: true };
    const groups = [].slice.call(w.querySelectorAll("optgroup")).map(g => g.label);
    const opts = [].slice.call(w.querySelectorAll('optgroup[label="Vasculature"] option'))
      .map(o => o.value);
    w.value = "__capillary";
    w.dispatchEvent(new Event("change", { bubbles: true }));
    const row = document.getElementById("tracingVesselRow");
    const box = document.getElementById("tracingVessel");
    const shown = !!(row && row.style.display !== "none");
    const what0 = tracingWhat();
    if (box) box.value = "Capillary A";
    const what1 = tracingWhat();
    w.value = "__cell";
    w.dispatchEvent(new Event("change", { bubbles: true }));
    return { groups: groups, opts: opts, shown: shown,
             hidden: !!(row && row.style.display === "none"),
             bare: what0, named: what1,
             list: !!(box && box.getAttribute("list")) };
  });
  if (pad.noCard){
    console.log("  (this page has no tracing card — the pad half is not checked here)");
  } else {
    ok(pad.groups.indexOf("Vasculature") >= 0,
       "the dropdown has a Vasculature heading", pad.groups.join(" | "));
    ok(pad.opts.join(",") === KINDS.map(k => "__" + k).join(","),
       "...with the six under it", pad.opts.join(", "));
    ok(pad.shown && pad.hidden,
       "...and picking one asks for a vessel name, which a whole cell is not asked for",
       pad.shown + " / hidden again " + pad.hidden);
    ok(pad.list, "...offering the vessel names already in the dataset, so reusing one is a click",
       String(pad.list));
    ok(pad.bare.kind === "capillary" && pad.bare.name === "Capillary",
       "an unnamed one is just its kind", JSON.stringify(pad.bare));
    ok(pad.named.kind === "capillary" && pad.named.name === "Capillary A",
       "...and a named one carries the name, which is what joins its segments",
       JSON.stringify(pad.named));
  }

  console.log("\nfiled against no cell at all");
  const filed = await p.evaluate(() => {
    if (typeof tracingCurrentAll !== "function") return { noCard: true };
    /* A cell IS open on the card — that is the case that must not leak into the vessel. */
    document.getElementById("tracingNucId").value = "61360735";
    document.getElementById("tracingRootId").value = "6198781614";
    ["tracingX", "tracingY", "tracingZ"].forEach(function(id, i){
      const el = document.getElementById(id);
      if (el) el.value = [401085, 230736, 380][i];
    });
    const w = document.getElementById("tracingWhat");
    w.value = "__capillary"; w.dispatchEvent(new Event("change", { bubbles: true }));
    const box = document.getElementById("tracingVessel");
    if (box) box.value = "Capillary A";
    const sq = (z, cx, cy, h) => ({ z: z, inst: 0,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    TRACING_PENDING = { rings: [sq(400, 401000, 230000, 60), sq(401, 401010, 230010, 60)] };
    TRACING_BASE_ID = "";
    const out = tracingCurrentAll();
    const t = out[0] || {};
    return { n: out.length, kind: t.kind, name: t.name,
             nuc: t.nucleus_id === undefined ? "(absent)" : t.nucleus_id,
             root: t.root_id === undefined ? "(absent)" : t.root_id,
             at: t.cell_coord === undefined ? "(absent)" : t.cell_coord,
             organelle: (typeof organIsOrganelle === "function")
               ? organIsOrganelle({ kind: "capillary" }) : "(no panel)" };
  });
  if (filed.noCard){
    console.log("  (no tracing card on this page)");
  } else {
    ok(filed.n === 1 && filed.kind === "capillary",
       "it is built as a capillary", filed.kind + " ×" + filed.n);
    ok(filed.nuc === "(absent)" && filed.root === "(absent)" && filed.at === "(absent)",
       "...with no nucleus id, no root id and no cell coordinate, even though a cell was open on "
       + "the card — a vessel is not part of a cell and must not take one's ids",
       "nuc " + filed.nuc + ", root " + filed.root + ", at " + filed.at);
    /* ωJump has no cell panel at all, so there is no Organelles list for a vessel to turn up
       in and nothing to assert. Said rather than silently passed. */
    if (filed.organelle === "(no panel)")
      console.log("  (this page has no cell panel, so there is no Organelles list to keep it out of)");
    else
      ok(filed.organelle === false,
         "...and it is not an organelle, so it never appears in a cell's Organelles list",
         String(filed.organelle));
  }

  console.log("\nsegments of one vessel number within that vessel");
  const num = await p.evaluate(() => {
    if (typeof tracingNextIndex !== "function") return { noCard: true };
    TRACING_SHARED = [
      { structureId: "v1", name: "Capillary A 1", kind: "capillary", instanceOf: "capillary",
        instanceIndex: 1 },
      { structureId: "v2", name: "Capillary A 2", kind: "capillary", instanceOf: "capillary",
        instanceIndex: 2 },
      /* Another vessel of the same kind: its own series, its own numbers. */
      { structureId: "v9", name: "Capillary B 1", kind: "capillary", instanceOf: "capillary",
        instanceIndex: 1 },
      /* And an organelle on a cell, which must not be dragged in by the kind alone. */
      { structureId: "m1", name: "Mitochondrion 1", kind: "mitochondrion",
        instanceOf: "mitochondrion", instanceIndex: 1, nucleusId: "61360735" }
    ];
    TRACINGS_KEPT = [];
    return {
      /* No cell given, and none wanted. */
      a: tracingNextIndex("capillary", "Capillary A", "", "", [], ""),
      b: tracingNextIndex("capillary", "Capillary B", "", "", [], ""),
      c: tracingNextIndex("capillary", "Capillary C", "", "", [], ""),
      /* A cell IS given — it must still not change the answer for a vessel. */
      withCell: tracingNextIndex("capillary", "Capillary A", "61360735", "6198781614", [],
                                 "401085,230736,380")
    };
  });
  if (!num.noCard){
    ok(num.a === 3, "a third segment of Capillary A is 3", String(num.a));
    ok(num.b === 2, "...while Capillary B is on its own count", String(num.b));
    ok(num.c === 1, "...and a vessel nobody has traced starts at 1", String(num.c));
    ok(num.withCell === 3,
       "...and a cell open on the card does not change a vessel's number, because a vessel has "
       + "no cell", String(num.withCell));
  }

  console.log("\nand in the filter, as vessels rather than as a question about cells");
  const filt = await p.evaluate(() => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    UJ.organelleFilter.render(host, { counts: {}, cls: "forganelle" });
    const box = host.querySelector(".fvessel-list");
    const ticks = [].slice.call(host.querySelectorAll(".fvessel")).map(e => e.value);
    const one = host.querySelector('.fvessel[value="capillary"]');
    if (one) one.checked = true;
    return {
      heading: /Vasculature/i.test(host.textContent),
      ticks: ticks,
      separate: !!box,
      inOrganelles: UJ.organelleFilter.checked(host).indexOf("capillary") >= 0,
      asked: typeof UJ.organelleFilter.vesselsChecked === "function"
        ? UJ.organelleFilter.vesselsChecked(host) : null,
      /* The cell-matching rule must be untouched by a ticked vessel. */
      stillMatches: UJ.organelleFilter.matches(["lysosome"], ["lysosome"], "has", null)
    };
  });
  ok(filt.heading && filt.separate,
     "the filter has its own Vasculature list, separate from the organelle ticks",
     filt.heading + " / " + filt.separate);
  ok(filt.ticks.join(",") === KINDS.join(","),
     "...with the six in it", filt.ticks.join(", "));
  ok(filt.inOrganelles === false,
     "...and a ticked vessel is NOT returned as an organelle tick, so it cannot filter the cell "
     + "table — which is what he asked for", String(filt.inOrganelles));
  ok(Array.isArray(filt.asked) && filt.asked.join(",") === "capillary",
     "...it is asked for by its own name", JSON.stringify(filt.asked));
  ok(filt.stillMatches === true, "...and the cell-matching rule is unchanged",
     String(filt.stillMatches));

  console.log("\nand the index groups segments into vessels");
  const idx = await p.evaluate(() => {
    if (typeof tracedVesselsFrom !== "function") return { missing: true };
    const r = tracedVesselsFrom([
      { structureId: "a1", name: "Capillary A 1", kind: "capillary", contours: 10, sections: 8 },
      { structureId: "a2", name: "Capillary A 2", kind: "capillary", contours: 6,  sections: 5 },
      { structureId: "b1", name: "Capillary B 1", kind: "capillary", contours: 4,  sections: 4 },
      { structureId: "v1", name: "Vein of Galen", kind: "vein",      contours: 30, sections: 20 },
      /* Not vessels: they must not appear at all. */
      { structureId: "c1", name: "Whole cell",    kind: "cell",      contours: 99, sections: 50 },
      { structureId: "m1", name: "Mitochondrion 1", kind: "mitochondrion", contours: 3, sections: 2 }
    ]);
    return { names: r.vessels.map(v => v.name),
             segs: r.vessels.map(v => v.segments.length),
             contours: r.vessels.map(v => v.contours),
             counts: r.counts };
  });
  if (!idx.missing){
    ok(idx.names.join(" | ") === "Capillary A | Capillary B | Vein of Galen",
       "two segments called \"Capillary A 1\" and \"Capillary A 2\" are one vessel, because "
       + "tracingSeriesLabel already strips the number \u2014 no new concept",
       idx.names.join(" | "));
    ok(idx.segs.join(",") === "2,1,1" && idx.contours[0] === 16,
       "...and its segments and their contours are added up", idx.segs.join(",")
       + " segments, " + idx.contours.join("/") + " contours");
    ok(idx.counts.capillary === 2 && idx.counts.vein === 1 && !idx.counts.cell
       && !idx.counts.mitochondrion,
       "...the count beside a tick is VESSELS, and a whole cell is not one",
       JSON.stringify(idx.counts));
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
