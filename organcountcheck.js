/* Six logged points for three lysosomes is three lysosomes.                         2026-09-19

   Søren, with the cell panel still in front of him: *"it has not been fixed that it says there are
   6x lysosomes, when there are only really 3."*

   He had outlined three lysosomes on one microglia. Each outline had registered its own centre
   twice — once when it was first added and once after it was edited — so the sheet held six
   `organelle_location` rows, and the panel counted rows.

   YESTERDAY'S TWO FIXES WERE BOTH ABOUT THE FUTURE: the page stopped sending a second centre, and
   the backend stopped keeping one. Neither says anything about six rows already written, so the
   line went on saying six until somebody ran tidyTracingCentres by hand. This is the third place,
   and the one that makes the housekeeping optional: `fromStructureId` names the outline a centre
   came from, so two rows carrying the same one are one organelle, and the later supersedes.

   WHAT MUST NOT COLLAPSE is the point of the whole dataset: two people who place a point on the
   same lysosome BY EYE are two opinions, and agreeing is the measurement. Those rows carry no
   fromStructureId, and the last case here is that they survive.

   Driven on the real page with a stubbed backend, because this is one list read by three renderers
   (the summary count, the folded rows, the Organelles section header) and asserting one of them
   would let the other two drift.

   Run: node organcountcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* One `organelle_location` row as doGet hands it back: one group per submission, one structure in
   it, with the columns the tracing card writes. */
function centreRow(sid, n, version, by){
  return { groupId: sid + "-v" + version, subCount: 1,
    comment: "Volumetric centre of the outlined “Lysosome " + n + "” (3.39 µm³, "
             + "20 sections), registered from the segmentation rather than placed by hand.",
    structures: [{ kind: "lysosome", pointA: (295844 + version) + ",151391,17862", pointB: "",
                   source: "segmentation", fromStructureId: sid,
                   by: by || "Søren Grubb" }] };
}
/* And one placed by hand: no outline behind it, so no fromStructureId. */
function handRow(kind, pt, by){
  return { groupId: "h" + pt, subCount: 1, comment: "",
    structures: [{ kind: kind, pointA: pt, pointB: "", source: "", fromStructureId: "",
                   by: by || "" }] };
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  /* Answer the panel's one fetch with this payload and let it render. PANEL_TRACINGS is emptied
     first: the Organelles section pairs against it, and a previous case's outlines left standing
     would pair with this case's points. */
  const render = groups => p.evaluate(async g => {
    /* #commReports is made by showNucleus, which needs a cell and a network. The panel only ever
       looks it up by id, so the div is enough — and a harness that had to search a real cell first
       would be testing the search. Rebuilt each time so nothing survives between cases. */
    var old = document.getElementById("commReports");
    if (old) old.remove();
    var oldOrgan = document.getElementById("cellOrganelles");
    if (oldOrgan) oldOrgan.remove();
    document.body.insertAdjacentHTML("beforeend", '<div id="commReports"></div>');
    const payload = { ok: true, reports: [], mergedGroups: [], notNucleusReports: [],
                      organelleGroups: g };
    const real = window.fetch;
    window.fetch = () => Promise.resolve({ status: 200, ok: true,
      text: () => Promise.resolve(JSON.stringify(payload)),
      json: () => Promise.resolve(payload) });
    PANEL_TRACINGS = []; PANEL_ORGAN_ANNS = null; PANEL_ORGAN_RINGS = {};
    let err = "";
    try { loadCommunityReports("521491", [295844, 151391, 17862]); }
    catch (e){ err = String(e && e.message || e); }
    await new Promise(r => setTimeout(r, 250));
    window.fetch = real;
    const el = document.getElementById("commReports");
    const organ = document.getElementById("cellOrganDetails");
    const fold = el ? el.querySelector("details.rv-panel") : null;
    return { err: err,
             text: el ? el.textContent : "",
             head: fold ? fold.querySelector("summary").textContent : "",
             rows: fold ? fold.querySelectorAll(".meta").length : -1,
             organHead: organ ? organ.querySelector("summary").textContent : "" };
  }, groups);

  console.log("three lysosomes, each having registered its centre twice");
  {
    const g = [];
    ["lys-1", "lys-2", "lys-3"].forEach((sid, i) => { g.push(centreRow(sid, i + 1, 0));
                                                      g.push(centreRow(sid, i + 1, 1)); });
    const r = await render(g);
    ok(!r.err, "the panel renders", r.err || "no error");
    ok(/3× lysosome/.test(r.head), "it says 3× lysosome", r.head.trim());
    ok(!/6×/.test(r.head), "...and nowhere says 6× anything — his whole complaint",
       r.head.trim());
    ok(/1 person has/.test(r.head), "...logged by one person, because it was one person",
       r.head.trim());
    ok(r.rows === 3, "three rows behind the fold, not six", r.rows);
    ok(/0 outlined, 3 logged/i.test(r.organHead),
       "...and the Organelles section counts them the same way, not 6 logged",
       r.organHead.trim());
  }

  console.log("\nthe newest of the two is the one kept");
  {
    /* Append-only sheet, so the later row is the current answer — the same rule centreRowFor_ uses
       at the other end. The second version's x is 295845. */
    const r = await render([centreRow("lys-1", 1, 0), centreRow("lys-1", 1, 1)]);
    ok(/295845/.test(r.text) && !/295844,/.test(r.text),
       "the row shows the centre as it was last registered", /295845/.test(r.text)
         ? "295845" : r.text.slice(0, 60));
  }

  console.log("\nhis own six rows, exactly as the deployed backend returns them");
  {
    /* Read off the live endpoint on 2026-09-19, after he had hard-refreshed repeatedly and then
       deleted rows by hand without the count moving. The id of the outline is in `source`, and
       `fromStructureId` is empty — these rows predate the split of those two columns. Keying only
       on fromStructureId collapsed nothing, and testing /segment/ on `source` made every one of
       them look hand-placed, so the panel listed six points beside three outlines it refused to
       pair them with. Both halves are in this fixture. */
    const REAL = [
      ["295844,151391,17862", "lysosome_1789846306269"],
      ["295844,151391,17862", "lysosome_1789846306269"],
      ["295974,151346,17838", "lysosome_1789846306269__i1"],
      ["295974,151346,17838", "lysosome_1789846306269__i1"],
      ["295812,151370,17901", "lysosome_1789846306269__i1__i2"],
      ["295813,151358,17899", "lysosome_1789846306269__i1__i2"]
    ].map(([pt, sid], i) => ({ groupId: "r" + i, subCount: 1, comment: "",
      structures: [{ kind: "lysosome", pointA: pt, pointB: "",
                     source: sid, fromStructureId: "", by: "Søren Grubb" }] }));
    const r = await render(REAL);
    ok(/3× lysosome/.test(r.head), "three lysosomes, from six rows with an empty column",
       r.head.trim());
    ok(r.rows === 3, "...three rows behind the fold", r.rows);
    ok(/0 outlined, 3 logged/i.test(r.organHead),
       "...and three in the Organelles section, not six", r.organHead.trim());
    const fromOutline = await p.evaluate(() =>
      (PANEL_ORGAN_ANNS || []).filter(a => a.fromSegmentation).length);
    ok(fromOutline === 3,
       "...each known to have come from an outline, not from somebody's eye", fromOutline);
  }

  console.log("\nand two people pointing at the same organelle by hand stay two");
  {
    /* The measurement this whole dataset is for. These rows carry no fromStructureId — nothing
       computed them from an outline — so nothing may collapse them. */
    const r = await render([handRow("lysosome", "1,2,3", "A"), handRow("lysosome", "1,2,3", "B"),
                            handRow("lysosome", "9,9,9", "A")]);
    ok(/3× lysosome/.test(r.head), "three hand-placed points are three", r.head.trim());
    ok(/2 people have/.test(r.head), "...from two people", r.head.trim());
    ok(r.rows === 3, "...and three rows", r.rows);
  }

  console.log("\nan outline's centre and a hand-placed point are still two things");
  {
    const r = await render([centreRow("lys-1", 1, 0), centreRow("lys-1", 1, 1),
                            handRow("lysosome", "5,5,5", "Someone Else")]);
    ok(/2× lysosome/.test(r.head), "the traced one collapses, the placed one does not",
       r.head.trim());
    ok(r.rows === 2, "...two rows", r.rows);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
