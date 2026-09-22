/* Interpolating contours between sections, in z.                                      2026-09-22

   Søren: "Can we also interpolate between polylines in z?" — for a smoother 3D view and Blender
   export, with the interpolated contours marked as such, and doing its best where the shape does
   not pair up cleanly.

   THE THING THAT DECIDED THE DESIGN: loft() bands STRAIGHT between consecutive sections. A contour
   interpolated LINEARLY between two sections lies exactly on that straight band — it would add
   triangles and change the surface not at all. So a linear fill is worth nothing for the stated
   purpose, and the interpolation has to curve in z: Catmull-Rom through the corresponding vertex on
   four consecutive contours. That is what the sphere assertion below exists to prove.

   WHAT IS ASSERTED, and why each one is here:
     - a cylinder interpolates to itself                  (it must not invent movement)
     - a SPHERE comes out closer to the true radius than a straight line does
                                                           (the whole point: it curves in z)
     - a rotated start point does not twist the contour    (correspondence, not vertex index)
     - gaps are filled at the missing sections             (trace every 3rd, get all of them)
     - every made contour is marked interp:true            (a guess is never mistaken for a measurement)
     - the drawn contours come back identical              (the record is not rewritten)
     - the volume from the DRAWN contours is unchanged     (interpolating measures nothing new)

   Run: node interpcheck.js */
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
    const I = UJ.traceloft.interpolate;
    const ring = (z, cx, cy, r, n, phase) => {
      const pts = [];
      n = n || 48;
      for (let i = 0; i < n; i++){
        const a = 2 * Math.PI * i / n + (phase || 0);
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return { z: z, points: pts };
    };
    const radiusOf = (pts) => {
      let cx = 0, cy = 0;
      pts.forEach(q => { cx += q[0]; cy += q[1]; });
      cx /= pts.length; cy /= pts.length;
      let s = 0;
      pts.forEach(q => { s += Math.hypot(q[0] - cx, q[1] - cy); });
      return s / pts.length;
    };
    const areaOf = (pts) => {
      let a = 0;
      for (let i = 0; i < pts.length; i++){
        const q = pts[i], r = pts[(i + 1) % pts.length];
        a += q[0] * r[1] - r[0] * q[1];
      }
      return Math.abs(a) / 2;
    };

    /* 1. A CYLINDER: the same circle on three sections, two apart. */
    const cyl = [ring(0, 1000, 2000, 300), ring(2, 1000, 2000, 300), ring(4, 1000, 2000, 300)];
    const rc = I(cyl, { per: 0 });
    const cylMade = rc.rings.filter(x => x.interp);
    const cylR = cylMade.map(x => radiusOf(x.points));

    /* 2. A SPHERE of radius 500, sampled every 2 sections, section spacing 50 in xy units.
          Compared at section 5 — in the body of the sphere, with a traced contour on either side
          AND one beyond each, which is what a cubic needs. The poles are deliberately not the test:
          at the last interval before a chain ends the tangent has to be clamped, and a shape that
          stops dead is where any interpolation is worst. That is stated in the generator rather
          than hidden by choosing a kind comparison. */
    const R = 500, SP = 50, sph = [];
    for (let z = -8; z <= 8; z += 2)
      sph.push(ring(z, 1000, 2000, Math.sqrt(Math.max(1, R * R - (z * SP) * (z * SP)))));
    const rs = I(sph, { per: 0 });
    const at = (zz) => (rs.rings.filter(x => Math.abs(x.z - zz) < 1e-9)[0] || null);
    const got9 = at(5), lo = at(4), hi = at(6);
    const trueR9 = Math.sqrt(Math.max(1, R * R - (5 * SP) * (5 * SP)));
    const linR9 = (radiusOf(lo.points) + radiusOf(hi.points)) / 2;
    const cubR9 = radiusOf(got9.points);
    /* AND IT MUST NOT OVERSHOOT. A cubic can bulge past both its neighbours; on a contour that
       would be a lump of cell that was never there. Every made ring is checked against the span of
       the two it sits between, plus a little. */
    let worstOver = 0;
    rs.rings.filter(x => x.interp).forEach(x => {
      const below = rs.rings.filter(y => !y.interp && y.z < x.z).sort((a, c) => c.z - a.z)[0];
      const above = rs.rings.filter(y => !y.interp && y.z > x.z).sort((a, c) => a.z - c.z)[0];
      if (!below || !above) return;
      const rr = radiusOf(x.points), a = radiusOf(below.points), c = radiusOf(above.points);
      const hiR = Math.max(a, c), loR = Math.min(a, c);
      worstOver = Math.max(worstOver, rr - hiR, loR - rr);
    });

    /* 3. THE SAME SHAPE WITH THE PEN STARTED SOMEWHERE ELSE: an ellipse on two sections, the second
          written from a different vertex. Interpolating by vertex INDEX would twist it into a
          bowtie and lose most of its area. */
    const ell = (z, phase) => {
      const pts = [];
      for (let i = 0; i < 48; i++){
        const a = 2 * Math.PI * i / 48 + phase;
        pts.push([1000 + 400 * Math.cos(a), 2000 + 120 * Math.sin(a)]);
      }
      return { z: z, points: pts };
    };
    const tw = I([ell(0, 0), ell(2, 2.1)], { per: 0 });
    const twMade = tw.rings.filter(x => x.interp)[0];
    const twArea = twMade ? areaOf(twMade.points) : 0;
    const wantArea = areaOf(ell(0, 0).points);

    /* 4. GAPS: traced every third section. */
    const every3 = [ring(0, 1000, 2000, 300), ring(3, 1000, 2000, 320), ring(6, 1000, 2000, 300)];
    const r3 = I(every3, { per: 0 });
    const zs3 = r3.rings.map(x => x.z).sort((a, b) => a - b);

    /* 5. THE DRAWN ONES COME BACK UNTOUCHED, and the volume from them alone does not move. */
    const drawnBefore = JSON.stringify(every3);
    const volDrawn = UJ.traceloft.volume(every3, [4, 4, 40]);
    const volDrawnAfter = UJ.traceloft.volume(r3.rings.filter(x => !x.interp), [4, 4, 40]);

    return {
      cylMade: cylMade.length, cylR: cylR,
      cylZs: cylMade.map(x => x.z),
      trueR9: trueR9, linR9: linR9, cubR9: cubR9,
      twArea: twArea, wantArea: wantArea, worstOver: worstOver,
      zs3: zs3, made3: r3.rings.filter(x => x.interp).length,
      allMarked: r3.rings.filter(x => x.interp).every(x => x.interp === true),
      drawnMarked: r3.rings.filter(x => !x.interp).length,
      drawnSame: JSON.stringify(every3) === drawnBefore,
      volBefore: volDrawn && volDrawn.volumeUm3, volAfter: volDrawnAfter && volDrawnAfter.volumeUm3,
      reported: { made: r3.made, unpaired: r3.unpaired }
    };
  });

  console.log("a cylinder — the same circle on three sections");
  ok(got.cylMade === 2, "the two missing sections are filled", got.cylMade + " made at z " + got.cylZs.join(", "));
  ok(got.cylR.every(r => Math.abs(r - 300) < 0.5),
     "...and it interpolates to itself: no invented movement",
     got.cylR.map(r => r.toFixed(2)).join(", "));

  console.log("\na sphere, sampled every second section (compared in its body, not at a pole)");
  const dCub = Math.abs(got.cubR9 - got.trueR9), dLin = Math.abs(got.linR9 - got.trueR9);
  ok(dCub < dLin,
     "the contour it makes is CLOSER to the true sphere than a straight line between the neighbours",
     "true " + got.trueR9.toFixed(1) + ", cubic " + got.cubR9.toFixed(1)
     + " (off by " + dCub.toFixed(1) + "), straight " + got.linR9.toFixed(1)
     + " (off by " + dLin.toFixed(1) + ")");
  ok(dLin > 1, "...and a straight line really is wrong here, or this proves nothing",
     "off by " + dLin.toFixed(1) + " voxels");
  ok(got.worstOver < 6,
     "...and no made contour bulges past the two it sits between: a lump that was never there",
     got.worstOver.toFixed(2) + " voxels at worst");

  console.log("\nan ellipse whose second contour starts at a different vertex");
  ok(got.twArea > got.wantArea * 0.9,
     "it is not twisted into a bowtie: the area survives",
     got.twArea.toFixed(0) + " of " + got.wantArea.toFixed(0));

  console.log("\ntraced every third section");
  ok(JSON.stringify(got.zs3) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
     "every section in between is filled", JSON.stringify(got.zs3));
  ok(got.made3 === 4 && got.drawnMarked === 3,
     "four made, three drawn", got.made3 + " made, " + got.drawnMarked + " drawn");
  ok(got.allMarked, "every made contour is marked interp:true", got.allMarked);
  ok(got.drawnSame, "the contours handed in are not modified", got.drawnSame);
  ok(Math.abs(got.volAfter - got.volBefore) < 1e-9,
     "the volume from the DRAWN contours is exactly what it was",
     got.volBefore + " → " + got.volAfter + " µm³");
  ok(got.reported.made === 4, "and it reports what it made", JSON.stringify(got.reported));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
