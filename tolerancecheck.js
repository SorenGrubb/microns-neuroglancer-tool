/* The offer shows up on contours of the shape Søren actually makes.                   2026-09-22

   Søren, twice: "I don't see anywhere I can reduce the number of points", then, after the button
   was added to the pad too: "I still don't see the reduce points button, even after pasting a
   link".

   IT WAS HIDING ITSELF, by a rule that was wrong. His contours are CLICKED — "176 contours from
   40165 line annotations … click each vertex round the cell" — not pen strokes, so at half a base
   voxel almost nothing is redundant. Measured on his own 4 nm dataset:

       0.5 voxels (2 nm)    40,128 -> 38,636    3.7%   <- under the 10% threshold: hidden
       4   voxels (16 nm)   40,128 -> 30,738   23.4%

   TWO MISTAKES, and this check is one assertion for each:
     - the tolerance was in DATASET BASE VOXELS, when a tracing is drawn at the 32 nm level where
       one screen pixel is EIGHT voxels. It is in nanometres now, default 16 — half a drawn pixel.
     - the button appeared only at a tenth or more, which made it absent exactly when it would have
       helped. It appears whenever ANY point would go.

   Run: node tolerancecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* His cell: 176 contours, ~228 clicked vertices each, on an irregular outline. */
const CLICKED = () => {
  const rings = [];
  for (let s = 0; s < 176; s++){
    const pts = [];
    for (let i = 0; i < 228; i++){
      const a = 2 * Math.PI * i / 228;
      const wob = 1 + 0.15 * Math.sin(a * 7 + s) + 0.07 * Math.sin(a * 13 + s * 2);
      pts.push([Math.round(295000 + 3000 * wob * Math.cos(a)),
                Math.round(151000 + 3000 * wob * Math.sin(a))]);
    }
    rings.push({ z: 19891 + s * 19, points: pts });
  }
  return rings;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  console.log("the tolerance");
  const tol = await p.evaluate(() => {
    const res = (UJ.cfg && UJ.cfg.res) || null;
    return { res: res, vox16: UJ.tracing.simplifyTolVox(16),
             vox32: UJ.tracing.simplifyTolVox(32),
             dflt: UJ.tracing.simplifyDefaultNm() };
  });
  ok(tol.dflt === 16, "defaults to 16 nm — half a pixel at the 32 nm level a tracing is drawn at",
     tol.dflt + " nm");
  ok(Math.abs(tol.vox16 - 4) < 1e-9,
     "...which on this 4 nm dataset is four base voxels, not half of one",
     "res " + JSON.stringify(tol.res) + " → " + tol.vox16 + " voxels");
  ok(Math.abs(tol.vox32 - 8) < 1e-9, "...and it scales with the dataset", tol.vox32 + " voxels at 32 nm");

  console.log("\nhis own cell, pasted in: 176 clicked contours");
  const got = await p.evaluate((mk) => {
    const rings = (new Function("return " + mk))()();
    document.getElementById("tracingPanel").open = true;
    TRACING_PENDING = { rings: rings.map(r => ({ z: r.z, points: r.points, inst: 0 })), groups: null };
    document.getElementById("tracingFound").style.display = "";
    tracingThinWire(); tracingThinShow();
    const btn = document.getElementById("tracingThin"), row = document.getElementById("tracingThinNmRow");
    const at = (nm) => {
      document.getElementById("tracingThinNm").value = String(nm);
      tracingThinShow();
      return document.getElementById("tracingThin").textContent.trim();
    };
    const l16 = at(16), l32 = at(32);
    at(16);
    return { shown: !!(btn && btn.style.display !== "none"),
             rowShown: !!(row && row.style.display !== "none"),
             l16: l16, l32: l32,
             before: rings.reduce((a, r) => a + r.points.length, 0) };
  }, CLICKED.toString());

  ok(got.shown, "the button is THERE — the whole complaint", got.shown);
  ok(got.rowShown, "...with the nanometre box beside it", got.rowShown);
  const n16 = (got.l16.match(/([\d,]+)\s*→\s*([\d,]+)/) || []).slice(1).map(x => +x.replace(/,/g, ""));
  const n32 = (got.l32.match(/([\d,]+)\s*→\s*([\d,]+)/) || []).slice(1).map(x => +x.replace(/,/g, ""));
  ok(n16.length === 2 && n16[1] < n16[0] * 0.85,
     "at 16 nm it drops a useful share, where half a voxel dropped 3.7%",
     got.l16 + "  (" + (100 * (n16[0] - n16[1]) / n16[0]).toFixed(1) + "%)");
  ok(n32.length === 2 && n32[1] < n16[1],
     "...and turning the box up drops more, answered before anything is pressed",
     got.l32 + "  (" + (100 * (n32[0] - n32[1]) / n32[0]).toFixed(1) + "%)");

  console.log("\nand pressing it");
  const run = await p.evaluate(async () => {
    const before = TRACING_PENDING.rings.reduce((a, r) => a + r.points.length, 0);
    document.getElementById("tracingThin").click();
    await new Promise(r => setTimeout(r, 500));
    return { before, after: TRACING_PENDING.rings.reduce((a, r) => a + r.points.length, 0),
             rings: TRACING_PENDING.rings.length,
             say: document.getElementById("tracingStatus").innerText };
  });
  ok(run.after < run.before && run.rings === 176, "the contours really change, all 176 kept",
     run.before + " -> " + run.after + ", " + run.rings + " contours");
  ok(/moved more than 16 nm/.test(run.say),
     "...and it says the tolerance in nanometres, which is the unit he traces in",
     (run.say.match(/No point[^.]*\./) || ["NOT SAID"])[0]);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
