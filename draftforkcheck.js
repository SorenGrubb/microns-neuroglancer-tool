/* A save may not replace a tracing it did not continue.                              2026-10-05

   Søren, 4 October: two tracings, one set of contours. Draft dmuub74uqjeq1kw belongs to nucleus
   61360735 and said so correctly the whole way through; its sheet row records 39 contours and 2041
   vertices; at 21:05:22 it was written with 47 contours and 1927 vertices, byte-identical to the
   OTHER nucleus's tracing, which the pad was still carrying.

   SO THIS REPLAYS THAT, and the fixture is the shape of the real thing rather than a toy: a draft
   holding one tracing, then a save under the same id carrying a disjoint set of rings. The pad's
   nucleus id is CORRECT in both — that is the point. An identity guard, which is the guard I first
   proposed, passes this test while the work is destroyed.

   Run: node draftforkcheck.js [page.html]      (default ujump.html) */
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

  const r = await p.evaluate(async () => {
    const out = {};
    try { localStorage.clear(); } catch (_e){}
    window.__realPush = draftPush; draftPush = () => true;   // the account is not what is under test

    /* Rings at a given z range, so two tracings can be made genuinely disjoint. */
    const rings = (z0, n, tag) => {
      const a = [];
      for (let k = 0; k < n; k++){
        const pts = [];
        for (let j = 0; j < 40; j++) pts.push([100000 + tag * 50000 + k * 7 + j, 200000 + k * 11 - j]);
        a.push({ z: z0 + k * 2, inst: 0, points: pts });
      }
      return a;
    };
    const draft = (id, rs) => ({ v: 2, id: id, title: "Nucleus · Endothelial cell",
                                 at: new Date().toISOString(), rings: rs, pending: [],
                                 z: rs[0].z, used: true,
                                 nucId: "61360735", rootId: "6198781614" });

    /* The second nucleus's own work: 39 contours. */
    const mine = draft("the_real_one", rings(1941, 39, 0));
    out.first = draftStore.put(mine);
    out.firstBack = (draftStore.get("the_real_one") || { rings: [] }).rings.length;

    /* Normal drawing: one more contour, everything else the same. Must NOT fork. */
    const grown = draft("the_real_one", rings(1941, 40, 0));
    out.grew = draftStore.put(grown);
    out.grewId = grown.id;
    out.grewBack = (draftStore.get("the_real_one") || { rings: [] }).rings.length;

    /* An edit that moves half of them is still an edit. Must NOT fork. */
    const edited = draft("the_real_one", rings(1941, 40, 0).map((r, i) =>
      i % 2 ? { z: r.z, inst: 0, points: r.points.map(p => [p[0] + 3, p[1] - 2]) } : r));
    out.edited = draftStore.put(edited);
    out.editedId = edited.id;

    /* AND SIMPLIFYING IS AN EDIT TOO, which the first version of this guard got wrong: it signed a
       ring by its POINT COUNT, so "drop the redundant points" rewrote every ring at once and forked
       a draft somebody was in the middle of. tracingpanelcheck.js caught it. A guard that fires on
       correct work is a guard people learn to ignore. */
    const thinned = draft("the_real_one", rings(1941, 40, 0).map(r =>
      ({ z: r.z, inst: 0, points: r.points.filter((_, k) => k % 4 === 0) })));
    out.thinned = draftStore.put(thinned);
    out.thinnedId = thinned.id;
    out.thinnedPts = thinned.rings[0].points.length;

    /* AND NOW THE REAL EVENT: the pad is carrying the OTHER nucleus's 47 contours, under this
       draft's id, with this draft's nucleus id on it. */
    const theirs = draft("the_real_one", rings(1941, 47, 1));
    out.n_before = draftStore.list().length;
    out.swapped = draftStore.put(theirs);
    out.swappedId = theirs.id;
    out.forked = theirs.id !== "the_real_one";
    out.survivor = (draftStore.get("the_real_one") || { rings: [] }).rings.length;
    out.newOne = out.forked ? (draftStore.get(theirs.id) || { rings: [] }).rings.length : 0;
    out.n_after = draftStore.list().length;
    out.said = (document.getElementById("tracePadSay") || {}).textContent || "";
    out.nucOfBoth = [(draftStore.get("the_real_one") || {}).nucId,
                     (draftStore.get(theirs.id) || {}).nucId].join(" / ");

    draftPush = window.__realPush;
    return out;
  });

  console.log("while the drawing continues");
  ok(r.first === true && r.firstBack === 39, "a tracing is kept", r.firstBack + " contours");
  ok(r.grew === true && r.grewId === "the_real_one" && r.grewBack === 40,
     "...one more contour writes to the same draft, as drawing must",
     r.grewBack + " contours, id " + r.grewId);
  ok(r.edited === true && r.editedId === "the_real_one",
     "...and editing half of them is still the same draft — the bar is deliberately generous, "
     + "because the cost of a false fork is one extra row in a list",
     "id " + r.editedId);

  ok(r.thinned === true && r.thinnedId === "the_real_one",
     "...and so is dropping three points in four from every contour on the pad — the first version "
     + "of this guard forked on exactly that",
     "id " + r.thinnedId + ", " + r.thinnedPts + " points left per ring");

  console.log("\nand when the pad is carrying somebody else's rings");
  ok(r.forked, "the save does NOT write over the tracing it did not continue",
     r.forked ? "forked to " + r.swappedId : "OVERWROTE the_real_one");
  ok(r.survivor === 40,
     "...the 40 contours that were there are untouched — this is the assertion the real event "
     + "failed, and 39 contours of somebody's evening went with it",
     r.survivor + " contours still kept");
  ok(r.newOne === 47, "...and the new rings are kept too, not thrown away", r.newOne + " contours");
  ok(r.n_after === r.n_before + 1, "...so the list has both",
     r.n_before + " -> " + r.n_after + " drafts");
  ok(/not a continuation/i.test(r.said) && /new/i.test(r.said),
     "...and it says so, rather than doing it quietly", r.said.slice(0, 130));
  ok(r.nucOfBoth === "61360735 / 61360735",
     "and the nucleus id was RIGHT on both all along — which is why a guard comparing ids, the "
     + "one I first proposed, would have passed while the work was destroyed", r.nucOfBoth);

  ok(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
