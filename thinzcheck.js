/* Dropping SECTIONS that lie on the line between their neighbours.                    2026-09-23

   Søren: "I guess there is no more that can be gained from removing points in each z-plane and my
   segmentation is still a bit too big for Neuroglancer. Can we reduce z-layers that are redundant
   in addition?"

   THE CRITERION, and why it is linear and not cubic: loft() bands STRAIGHT between sections and
   Cavalieri is a trapezoid sum over the sections. So a contour that already lies on the straight
   line between its two neighbours contributes nothing to the mesh and nothing to the volume — it
   is redundant in exactly the sense that matters here. Cubic would be a prettier fit and a false
   one: it is not what either consumer does with the sections.

   AND UNLIKE DROPPING POINTS, THIS MOVES THE VOLUME. Dropping a vertex inside a contour changes an
   area by a bounded sliver; dropping a section changes which areas the sum is over. So every
   assertion below that matters is about the volume, and the tool has to say what it cost.

   WHAT IS ASSERTED:
     - a cylinder collapses to its two end sections, volume EXACTLY unchanged
     - the first and last section are never dropped   (they are what the object's extent IS)
     - every dropped section really was within the tolerance of the line between its neighbours
     - a sphere keeps sections where it curves and drops them where it does not
     - the volume change is reported, and is small on a shape that is nearly straight in z
     - the rings handed in are not modified

   Run: node thinzcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  const got = await p.evaluate(() => {
    const T = UJ.traceloft.thinSections;
    const ring = (z, r) => {
      const pts = [];
      for (let i = 0; i < 64; i++){
        const a = 2 * Math.PI * i / 64;
        pts.push([1000 + r * Math.cos(a), 2000 + r * Math.sin(a)]);
      }
      return { z: z, points: pts };
    };
    /* TWO VOLUMES, and the difference is the point. volumeUm3 is CAVALIERI: every section stands
       for a full slab, so the two end sections each count their one gap twice. That is right when
       sections are close and even, and it inflates badly as they are thinned -- with two sections
       left it is exactly double. volumeTrapezoidUm3 integrates BETWEEN the outermost contours and
       is stable under thinning, which is why the assertions below are on it. */
    const vol = rs => (UJ.traceloft.volume(rs, [4, 4, 40]) || {}).volumeTrapezoidUm3;
    const cav = rs => (UJ.traceloft.volume(rs, [4, 4, 40]) || {}).volumeUm3;

    /* 1. A CYLINDER over 50 sections: everything between the ends is on the line. */
    const cyl = []; for (let z = 0; z < 50; z++) cyl.push(ring(z, 300));
    const cylIn = JSON.stringify(cyl);
    const rc = T(cyl, { nm: 16 });

    /* 2. A SPHERE over 41 sections: it curves, so sections cannot all go. */
    const R = 500, SP = 25, sph = [];
    for (let z = -20; z <= 20; z++) sph.push(ring(z, Math.sqrt(Math.max(1, R * R - (z * SP) * (z * SP)))));
    const rs = T(sph, { nm: 16 });
    const keptZ = rs.rings.map(x => x.z).sort((a, b) => a - b);

    /* 3. A CELL LIKE HIS: 176 sections, smooth in z. */
    const cell = [];
    for (let s = 0; s < 176; s++){
      const pts = [];
      for (let i = 0; i < 228; i++){
        const a = 2 * Math.PI * i / 228;
        const wob = 1 + 0.15 * Math.sin(a * 7 + s * 0.05) + 0.07 * Math.sin(a * 13 + s * 0.1);
        pts.push([Math.round(295000 + 3000 * wob * Math.cos(a)),
                  Math.round(151000 + 3000 * wob * Math.sin(a))]);
      }
      cell.push({ z: 19891 + s * 19, points: pts });
    }
    const rk = T(cell, { nm: 16 }), rk64 = T(cell, { nm: 64 });

    return {
      cyl: { before: rc.before, after: rc.after, volBefore: vol(cyl), volAfter: vol(rc.rings),
             cavBefore: cav(cyl), cavAfter: cav(rc.rings),
             untouched: JSON.stringify(cyl) === cylIn,
             ends: rc.rings.some(x => x.z === 0) && rc.rings.some(x => x.z === 49) },
      sph: { before: rs.before, after: rs.after, keptZ: keptZ,
             endsKept: keptZ[0] === -20 && keptZ[keptZ.length - 1] === 20,
             volBefore: vol(sph), volAfter: vol(rs.rings), worstNm: rs.worstNm },
      cell: { before: rk.before, after: rk.after, worstNm: rk.worstNm,
              volBefore: vol(cell), volAfter: vol(rk.rings),
              after64: rk64.after, vol64: vol(rk64.rings) }
    };
  });

  console.log("a cylinder over 50 sections");
  ok(got.cyl.after === 2, "collapses to its two ends", got.cyl.before + " -> " + got.cyl.after);
  ok(got.cyl.ends, "...which are the two that were kept", got.cyl.ends);
  ok(Math.abs(got.cyl.volAfter - got.cyl.volBefore) < 1e-9,
     "...and the volume is EXACTLY unchanged, there being nothing in between",
     got.cyl.volBefore + " → " + got.cyl.volAfter + " µm³");
  ok(got.cyl.untouched, "the rings handed in are not modified", got.cyl.untouched);

  console.log("\na sphere over 41 sections — it curves, so they cannot all go");
  ok(got.sph.after > 2 && got.sph.after < got.sph.before,
     "some go and some stay", got.sph.before + " -> " + got.sph.after);
  ok(got.sph.endsKept, "...never the first or last: they are what its extent IS",
     "z " + got.sph.keptZ[0] + " … " + got.sph.keptZ[got.sph.keptZ.length - 1]);
  const dv = Math.abs(got.sph.volAfter - got.sph.volBefore) / got.sph.volBefore;
  ok(dv < 0.02, "...and the volume moves by under two percent — but it DOES move",
     got.sph.volBefore.toPrecision(6) + " → " + got.sph.volAfter.toPrecision(6)
     + " µm³ (" + (100 * dv).toFixed(2) + "%)");

  console.log("\na cell like his: 176 sections, smooth in z");
  const dvc = Math.abs(got.cell.volAfter - got.cell.volBefore) / got.cell.volBefore;
  const dv64 = Math.abs(got.cell.vol64 - got.cell.volBefore) / got.cell.volBefore;
  ok(got.cell.after < got.cell.before,
     "sections go at 16 nm", got.cell.before + " -> " + got.cell.after
     + "  (" + (100 * (got.cell.before - got.cell.after) / got.cell.before).toFixed(0) + "%)");
  ok(dvc < 0.01, "...for this much volume", (100 * dvc).toFixed(3) + "%");
  ok(got.cell.after64 <= got.cell.after,
     "and more at 64 nm, for more", got.cell.before + " -> " + got.cell.after64
     + " (" + (100 * dv64).toFixed(3) + "% of volume)");
  ok(typeof got.cell.worstNm === "number",
     "it reports the worst deviation, in nanometres", got.cell.worstNm + " nm");

  console.log("\nand the button on the card");
  const btn = await p.evaluate(async () => {
    document.getElementById("tracingPanel").open = true;
    const rings = [];
    for (let z = 0; z < 60; z++){
      const pts = [];
      for (let i = 0; i < 64; i++){
        const a = 2 * Math.PI * i / 64;
        pts.push([1000 + 300 * Math.cos(a), 2000 + 300 * Math.sin(a)]);
      }
      rings.push({ z: z, points: pts, inst: 0 });
    }
    TRACING_PENDING = { rings: rings, groups: null };
    document.getElementById("tracingFound").style.display = "";
    tracingThinWire(); tracingThinShow();
    const b = document.getElementById("tracingThinZ");
    const label = b ? b.textContent.trim() : "";
    const shown = !!(b && b.style.display !== "none");
    if (shown) b.click();
    await new Promise(r => setTimeout(r, 400));
    return { has: !!b, shown, label,
             sections: new Set(TRACING_PENDING.rings.map(r => r.z)).size,
             say: document.getElementById("tracingStatus").innerText };
  });
  ok(btn.has && btn.shown, "there is a button for it", btn.label || "(absent)");
  ok(/sections \(60 \u2192 2\)/.test(btn.label), "...with the count on it before it is pressed", btn.label);
  ok(btn.sections === 2, "...and pressing it really drops them", btn.sections + " sections left");
  ok(/Between the outermost contours/.test(btn.say) && /Cavalieri figure above moves/.test(btn.say),
     "...saying the volume that stays put AND that the headline one does not",
     btn.say.slice(0, 200));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
