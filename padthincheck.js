/* The pad offers to drop redundant points, where he was actually looking.              2026-09-22

   Søren, with a screenshot of the PAD — "Volume 3615 µm³ … 176 contour(s) kept" — "I don't see
   anywhere I can reduce the number of points".

   The button had gone in the found panel, which only appears after a link is READ. The cell he was
   holding was on the pad, which had nothing. This runs on the pad.

   Run: node padthincheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  /* A pen-drawn cell put straight into the pad's own ring store, which is what closing a contour
     leaves behind. No EM is fetched: the offer is about the contours, not about the picture. */
  const seed = await p.evaluate(() => {
    PAD = UJ.tracepad.create({ z: 17800 });
    for (let s = 0; s < 10; s++){
      for (let i = 0; i < 1; i++){
        const pts = [];
        for (let v = 0; v < 260; v++){
          const a = 2 * Math.PI * v / 260;
          pts.push([Math.round(295000 + 350 * Math.cos(a)), Math.round(151000 + 350 * Math.sin(a))]);
        }
        PAD.rings.push({ z: 17800 + s, points: pts, inst: 0 });
      }
    }
    padVolume();
    const btn = document.getElementById("padThin");
    return { rings: PAD.rings.length,
             points: PAD.rings.reduce((a, r) => a + r.points.length, 0),
             has: !!btn, shown: !!(btn && btn.style.display !== "none"),
             label: btn ? btn.textContent.trim() : "",
             vol: (tracingVolumeOf(UJ.tracepad.toRings(PAD)) || {}).volumeUm3 };
  });

  console.log("a pen-drawn cell on the pad");
  ok(seed.rings === 10, "ten contours in hand", seed.rings);
  ok(seed.has, "the pad has the button at all — the thing that was missing", seed.has);
  ok(seed.shown, "...and it is showing, there being points to drop", seed.shown);
  ok(/redundant/i.test(seed.label) && /\d/.test(seed.label),
     "...with the numbers on it before it is pressed", seed.label);

  const after = await p.evaluate(async () => {
    const before = PAD.rings.reduce((a, r) => a + r.points.length, 0);
    const volBefore = (tracingVolumeOf(UJ.tracepad.toRings(PAD)) || {}).volumeUm3;
    document.getElementById("padThin").click();
    await new Promise(r => setTimeout(r, 400));
    const btn = document.getElementById("padThin");
    return { before: before, after: PAD.rings.reduce((a, r) => a + r.points.length, 0),
             rings: PAD.rings.length,
             zs: PAD.rings.map(r => r.z).join(","),
             volBefore: volBefore,
             volAfter: (tracingVolumeOf(UJ.tracepad.toRings(PAD)) || {}).volumeUm3,
             say: (document.getElementById("tracePadSay") || {}).textContent || "",
             shown: !!(btn && btn.style.display !== "none") };
  });

  console.log("\nand pressing it");
  ok(after.after < after.before / 2, "drops more than half the points",
     after.before + " -> " + after.after);
  ok(after.rings === 10, "...without losing a contour", after.rings);
  ok(after.zs === Array.from({ length: 10 }, (_, i) => 17800 + i).join(","),
     "...or moving one off its section", after.zs);
  const dv = Math.abs(after.volAfter - after.volBefore) / after.volBefore;
  ok(dv < 0.005, "...and the volume is unchanged",
     after.volBefore.toPrecision(6) + " → " + after.volAfter.toPrecision(6)
     + " µm³ (" + (100 * dv).toFixed(3) + "%)");
  ok(/Dropped [\d,]+ redundant point/.test(after.say) && /Use these contours/.test(after.say),
     "...saying what it did, and that nothing is shared yet", after.say.slice(0, 160));
  ok(!after.shown, "...and it stops offering", after.shown);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
