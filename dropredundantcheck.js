/* "Drop redundant points" — on the contours in hand, when he presses it.               2026-09-22

   Søren: "OK, if I paste the neuroglancer state in the tracing, will it reduce the number of points
   and make it a polyline?"

   It did not, and that was the honest answer: reading a state stores every vertex, and the
   simplification and the polyline shape both happened on the way OUT. So the sheet kept a whole
   cell's full point count however small the link got.

   Asked whether it should apply to what is SAVED, he chose a button rather than doing it on paste:
   the contours in the sheet are the record, and a record is not quietly rewritten on the way in.

   WHAT IS ASSERTED, and why each one is here:
     - nothing happens until it is pressed                 (a button, not a policy)
     - it is offered only when there is something to gain  (not a button that does nothing)
     - it says before -> after BEFORE anything is saved    (a number he can check)
     - the contours in hand really change                  (it is not only a message)
     - the VOLUME after it is within a fraction of a percent of the volume before
                                                            (this is the number the tracing exists for)
     - reading the link again brings the originals back    (it is refusable)
     - the instance each contour belongs to survives       (three mitochondria stay three)

   Run: node dropredundantcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* A pen-drawn cell over 12 sections, and a second blob beside it, as a pasted state. A pasted link
   carries no instance numbers -- the card reads it as one structure -- so what is asserted below is
   that whatever grouping came in is the grouping that comes out. */
const STATE = (() => {
  const anns = [];
  let id = 0;
  for (let inst = 0; inst < 2; inst++)
    for (let s = 0; s < 12; s++){
      const pts = [];
      for (let i = 0; i < 300; i++){
        const a = 2 * Math.PI * i / 300;
        pts.push([Math.round(295000 + inst * 2000 + 400 * Math.cos(a)),
                  Math.round(151000 + 400 * Math.sin(a)), 17800 + s]);
      }
      anns.push({ type: "polyline", id: "p" + (id++), points: pts.concat([pts[0]]) });
    }
  return { dimensions: { x: [4e-9, "m"], y: [4e-9, "m"], z: [4e-8, "m"] },
           position: [295000, 151000, 17806],
           layers: [{ type: "annotation", source: "local://annotations", tab: "annotations",
                      name: "tracing", annotationColor: "#40e28c", annotations: anns }] };
})();

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  const read = await p.evaluate(async (st) => {
    document.getElementById("tracingPanel").open = true;
    document.getElementById("tracingLink").value =
      "https://spelunker.cave-explorer.org/#!" + encodeURIComponent(JSON.stringify(st));
    document.getElementById("tracingRead").click();
    await new Promise(r => setTimeout(r, 1200));
    const btn = document.getElementById("tracingThin");
    return { rings: (TRACING_PENDING && TRACING_PENDING.rings || []).length,
             points: (TRACING_PENDING && TRACING_PENDING.rings || [])
                       .reduce((a, r) => a + r.points.length, 0),
             hasBtn: !!btn, shown: !!(btn && btn.offsetParent !== null),
             label: btn ? btn.textContent.trim() : "",
             vol: JSON.stringify(tracingVolumeOf(TRACING_PENDING.rings) || null),
             insts: [...new Set((TRACING_PENDING.rings || []).map(r => r.inst || 0))] };
  }, STATE);

  console.log("a pen-drawn state, 24 contours over twelve sections");
  ok(read.rings === 24, "the contours are read", read.rings + " contours");
  ok(read.points >= 24 * 250, "...with every vertex, as they always were", read.points + " points");
  ok(read.hasBtn && read.shown, "there is a button offering to drop the redundant ones",
     read.label || "(absent)");
  ok(/redundant/i.test(read.label), "...that says what it does", read.label);

  const after = await p.evaluate(async () => {
    const before = TRACING_PENDING.rings.reduce((a, r) => a + r.points.length, 0);
    const volBefore = tracingVolumeOf(TRACING_PENDING.rings);
    document.getElementById("tracingThin").click();
    await new Promise(r => setTimeout(r, 600));
    const rings = TRACING_PENDING.rings || [];
    return { before: before, after: rings.reduce((a, r) => a + r.points.length, 0),
             nRings: rings.length,
             insts: [...new Set(rings.map(r => r.inst || 0))],
             volBefore: volBefore && volBefore.volumeUm3, volAfter: (tracingVolumeOf(rings) || {}).volumeUm3,
             say: document.getElementById("tracingStatus").innerText,
             btnNow: (() => { const x = document.getElementById("tracingThin");
                              return x ? (x.offsetParent === null ? "hidden" : x.textContent.trim()) : "gone"; })() };
  });

  console.log("\nand pressing it");
  ok(after.after < after.before / 2, "drops more than half the points",
     after.before + " -> " + after.after);
  ok(after.nRings === 24, "...without losing a contour", after.nRings);
  ok(JSON.stringify(after.insts) === JSON.stringify(read.insts),
     "...or the instance grouping it came in with", JSON.stringify(after.insts));
  ok(new RegExp(String(after.before).replace(/\B(?=(\d{3})+(?!\d))/g, ",")).test(after.say)
     && /moved more than [\d.]+ nm/.test(after.say),
     "...saying before → after, before anything is saved", after.say.slice(0, 150));
  const dv = Math.abs(after.volAfter - after.volBefore) / after.volBefore;
  ok(dv < 0.005, "...and the volume the tracing exists to measure is unchanged",
     after.volBefore.toPrecision(6) + " → " + after.volAfter.toPrecision(6)
     + " µm³ (" + (100 * dv).toFixed(3) + "%)");
  ok(after.btnNow === "hidden", "...and it stops offering, there being nothing left to drop",
     after.btnNow);

  console.log("\nand it is refusable");
  const again = await p.evaluate(async () => {
    document.getElementById("tracingRead").click();
    await new Promise(r => setTimeout(r, 1200));
    return { points: (TRACING_PENDING.rings || []).reduce((a, r) => a + r.points.length, 0) };
  });
  ok(again.points === read.points, "reading the link again brings every point back",
     again.points + " of " + read.points);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
