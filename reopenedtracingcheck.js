/* Opening organelles to add more beside them touches none of them.                    2026-09-27

   Søren: *"when we want to add more organelles of the same type after we have added some of them,
   we want to be able to open them again in the pad and then add more organelles to the cell and
   save the new organelles without doing anything to the previously saved organelles, unless of
   course we have also edited those. I don't want to get a new version of an organelle if there are
   no changes to it. ... I see now that the Lysosome 1 of my tracing is renamed to lysosome 5 and is
   now version 3 even though I have not touched it, I have only opened it in the pad and traced
   other organelles."*

   TWO FAULTS, AND THEY FEED EACH OTHER.

   THE NUMBER. A structure saved when it was the only one of its kind on the pad gets `several =
   false`, which means it is named bare "Lysosome" and **no instance_index is submitted at all**.
   tracingPublishedIndex then answers 0 for it — from TRACING_EDIT_INDEX, which stores
   `Number(instanceIndex) || 0`, and from TRACING_SHARED, which requires `> 0`. The numbering reads
   0 as "this structure is new" and hands it the next free number. "Lysosome" became "Lysosome 5",
   beside the real Lysosome 5. 0 was doing two jobs: "published without a number" and "not
   published".

   THE VERSION. tracingShareSig has refused an unchanged re-send since 2026-09-23, comparing against
   `t.shared_sig` — which is carried across a re-add from the matching entry in TRACINGS_KEPT. A
   tracing OPENED FROM THE DATASET is not in TRACINGS_KEPT: there is no prior, so there is no
   signature, so nothing has anything to compare and every save posts a version. All that machinery
   only ever worked for tracings kept in this browser.

   And they feed each other: the renumbering changes the name, the name is IN the signature, so even
   a seeded signature would have said "changed". Neither fix works without the other.

   WHAT IS ASSERTED
     - a structure published with no number is recognised as published, and keeps having no number
     - ...and one published as "Lysosome 2" comes back as "Lysosome 2"
     - a third organelle drawn beside them gets a number, and not one already taken
     - pressing Add sends ONLY the new one — the two opened ones are not re-sent
     - ...and the card says so rather than looking as though it failed
     - editing one of them and pressing Add sends that one, under its own structureId
     - ...and it keeps its published number rather than being renumbered for having changed

   Run: node reopenedtracingcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const PAGE = process.argv[2] || "ujump.html";

/* Two lysosomes on one cell, as his sheet has them: the first saved alone and therefore carrying
   NO instance index, the second saved when there were two and carrying 2. */
const NUC = "368046", ROOT = "864691135976212035";
/* His cell carries a centre — "centre 218176, 185568, 22154" on the card — and the signature has
   to survive its round trip through tracingCoordShow and tracingCellAtVal, so the fixture has one. */
const CELLAT = "218176,185568,22154";
const enc = pts => pts.map(p => p.join(",")).join(";");
const ring = z => Array.from({ length: 10 }, (_, i) => {
  const a = 2 * Math.PI * i / 10;
  return [Math.round(218176 + 200 * Math.cos(a)), Math.round(185568 + 200 * Math.sin(a))];
});
const STRUCTS = [
  { structureId: "lysosome_A", name: "Lysosome",   idx: "",  color: "#40e28c", n: 4 },
  { structureId: "lysosome_B", name: "Lysosome 2", idx: "2", color: "#bfdd78", n: 3 }
];
const rowsFor = s => Array.from({ length: s.n }, (_, i) => ({
  structureId: s.structureId, kind: "lysosome", instanceOf: s.idx ? "lysosome" : "",
  instanceIndex: s.idx, name: s.name, color: s.color, cellType: "traced",
  nucleusId: NUC, rootId: ROOT, cellCoord: CELLAT, reporterName: "Søren Grubb",
  z: 22150 + i, ringIndex: 0, points: enc(ring(22150 + i)) }));
const INDEX = STRUCTS.map(s => ({ structureId: s.structureId, kind: "lysosome",
  instanceOf: s.idx ? "lysosome" : "", instanceIndex: s.idx, name: s.name, color: s.color,
  cellType: "traced", nucleusId: NUC, rootId: ROOT, cellCoord: CELLAT, tracedBy: "Søren Grubb",
  contours: s.n, sections: s.n }));

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1050 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**googleapis.com/**",
                   "**microns-explorer.org/**", "**princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url()), H = { "Access-Control-Allow-Origin": "*" };
    const J = o => route.fulfill({ status: 200, contentType: "application/json", headers: H,
                                   body: JSON.stringify(o) });
    if (u.searchParams.get("tracings") === "1"){
      const one = u.searchParams.get("structureId"), many = u.searchParams.get("structureIds");
      const pick = ids => STRUCTS.filter(x => ids.indexOf(x.structureId) >= 0)
                            .map(x => ({ structureId: x.structureId, rows: rowsFor(x) }));
      if (one) return J({ tracings: pick([one]) });
      if (many) return J({ tracings: pick(many.split(",")) });
      return J({ tracings: INDEX });
    }
    return J({ ok: true, identities: [], organelles: [], reports: [], rows: [] });
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);

  /* ── open both, and look at what the card thinks they are ─────────────────────────────── */
  console.log("two lysosomes opened from the dataset, one of them never numbered");
  await p.evaluate(ix => { window.__INDEX = ix; }, INDEX);
  const opened = await p.evaluate(async ([nuc, root]) => {
    /* The index has to be in hand: it is what tracingPublishedIndex and tracingNextIndex read. */
    TRACING_SHARED = window.__INDEX;
    await tracingOpenCellShared(["lysosome_A", "lysosome_B"], null);
    await new Promise(r => setTimeout(r, 600));
    const all = tracingCurrentAll();
    return { n: all.length,
             names: all.map(t => String(t.name || "")),
             ids: all.map(t => String(t.id || "")),
             idx: all.map(t => (t.instance_index === undefined ? "-" : String(t.instance_index))),
             editIdx: (typeof TRACING_EDIT_INDEX !== "undefined")
                      ? JSON.stringify(TRACING_EDIT_INDEX) : "(none)",
             known: (typeof TRACING_EDIT_KNOWN !== "undefined")
                    ? JSON.stringify(TRACING_EDIT_KNOWN) : "(no such map)" };
  }, [NUC, ROOT]);
  ok(opened.n === 2, "both come onto the pad as two structures", opened.n + " structure(s)");
  ok(opened.names[0] === "Lysosome",
     "the one published with no number is still called just “Lysosome”",
     opened.names[0] + "  (edit index " + opened.editIdx + ")");
  ok(opened.idx[0] === "-",
     "...and no number is submitted for it, as none was before", opened.idx[0]);
  ok(opened.names[1] === "Lysosome 2" && opened.idx[1] === "2",
     "...and “Lysosome 2” comes back as Lysosome 2", opened.names[1] + " / " + opened.idx[1]);
  ok(opened.ids[0] === "lysosome_A" && opened.ids[1] === "lysosome_B",
     "...each under its own structureId", opened.ids.join(", "));

  /* ── a third one drawn beside them ────────────────────────────────────────────────────── */
  console.log("\nand a third drawn beside them");
  const third = await p.evaluate(async () => {
    const r = PAD.rings[0].points.map(q => [q[0] + 900, q[1] + 900]);
    for (let z = 0; z < 3; z++) PAD.rings.push({ z: 22160 + z, inst: 2, points: r });
    PAD_INST_KIND["2"] = Object.assign({ value: "lysosome" }, tracingWhatOf("lysosome", ""));
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: PAD_EDIT_IDS["0"] };
    const all = tracingCurrentAll();
    return { n: all.length, names: all.map(t => String(t.name || "")),
             ids: all.map(t => String(t.id || "")) };
  });
  ok(third.n === 3, "there are three structures on the pad", third.n + "");
  ok(third.names[0] === "Lysosome" && third.names[1] === "Lysosome 2",
     "...and the two that were opened still have the names they were published under",
     third.names.join(" | "));
  ok(/^Lysosome \d+$/.test(third.names[2]) && third.names[2] !== "Lysosome 2",
     "...while the new one gets a number of its own, and not one already taken",
     third.names[2]);
  ok(third.ids[2] !== "lysosome_A" && third.ids[2] !== "lysosome_B",
     "...under an id of its own", third.ids[2]);

  /* ── pressing Add ─────────────────────────────────────────────────────────────────────── */
  console.log("\npressing Add sends the new one and leaves the others alone");
  const sent = await p.evaluate(async () => {
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "x";
    window.__SENT = [];
    postReport = function(pl){ window.__SENT.push(pl); return Promise.resolve({ ok: true }); };
    tracingKeep();
    await new Promise(r => setTimeout(r, 900));
    const tr = window.__SENT.filter(x => x && x.structureId);
    return { ids: tr.map(x => String(x.structureId)),
             names: tr.map(x => String(x.name || "")),
             say: (document.getElementById("tracingStatus") || {}).textContent || "" };
  });
  ok(sent.ids.length === 1, "exactly one tracing is posted",
     sent.ids.length + " posted: " + (sent.ids.join(", ") || "(nothing)"));
  ok(sent.ids.indexOf("lysosome_A") < 0 && sent.ids.indexOf("lysosome_B") < 0,
     "...and neither of the two that were only opened",
     sent.ids.filter(i => /lysosome_[AB]/.test(i)).join(", ") || "neither");
  ok(/nothing had changed|not changed|only the rest/i.test(sent.say),
     "...and the card says why they did not go",
     sent.say.replace(/\s+/g, " ").slice(0, 150) || "(said nothing)");

  /* ── and editing one of them ──────────────────────────────────────────────────────────── */
  console.log("\nand editing one of them sends that one, still under its own number");
  const edited = await p.evaluate(async () => {
    /* A FRESH PAD SESSION, because tracingKeep clears the pad when it is done — the work is in the
       dataset and the way back to it is to open it again. So: open both once more, move one of
       them, press Add. */
    await tracingOpenCellShared(["lysosome_A", "lysosome_B"], null);
    await new Promise(r => setTimeout(r, 600));
    /* Move every contour of instance 0 — a real change to lysosome_A and nothing else. */
    PAD.rings.forEach(function(r){
      if ((r.inst || 0) === 0) r.points = r.points.map(q => [q[0] + 7, q[1] + 7]);
    });
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: PAD_EDIT_IDS["0"] };
    window.__SENT = [];
    tracingKeep();
    await new Promise(r => setTimeout(r, 900));
    const tr = window.__SENT.filter(x => x && x.structureId);
    return { ids: tr.map(x => String(x.structureId)),
             names: tr.map(x => String(x.name || "")),
             idx: tr.map(x => (x.instanceIndex === undefined || x.instanceIndex === "")
                              ? "-" : String(x.instanceIndex)) };
  });
  ok(edited.ids.length === 1 && edited.ids[0] === "lysosome_A",
     "the edited one is posted, and only it",
     edited.ids.join(", ") || "(nothing posted)");
  ok(edited.names[0] === "Lysosome" && edited.idx[0] === "-",
     "...under the name and number it already had, not renumbered for having changed",
     (edited.names[0] || "-") + " / " + edited.idx[0]);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
