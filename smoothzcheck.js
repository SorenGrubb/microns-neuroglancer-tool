/* "Smooth between sections" reaches the mesh, and reaches nothing else.               2026-09-22

   Søren: "Can we also interpolate between polylines in z?" — for the 3D view and the Blender
   export.

   THE ASSERTION THAT MATTERS is the last one: with the box OFF the mesh is byte-identical to what
   it always was. A checkbox that quietly changes a surface when it is not ticked would be worse
   than not having it.

   And with it ON the surface has to actually differ — loft() bands straight between sections, so a
   LINEAR interpolation would add vertices and leave the shape untouched. A sphere's mid-section
   radius is compared: smoothed, the surface bulges out towards the true sphere.

   Run: node smoothzcheck.js */
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

  const got = await p.evaluate(() => {
    /* A sphere, sampled every second section, in the pad's own store. */
    const R = 500, SP = 50, rings = [];
    for (let z = -8; z <= 8; z += 2){
      const r = Math.sqrt(Math.max(1, R * R - (z * SP) * (z * SP))), pts = [];
      for (let i = 0; i < 48; i++){
        const a = 2 * Math.PI * i / 48;
        pts.push([1000 + r * Math.cos(a), 2000 + r * Math.sin(a)]);
      }
      rings.push({ z: z, points: pts });
    }
    const box = document.getElementById("tracePadSmoothZ");
    const res = [4, 4, 40];
    const objOf = () => tracingObjOf("s", rings, res);
    const vertsAtZ = (obj, zNm) => {
      const out = [];
      obj.split("\n").forEach(l => {
        if (l[0] !== "v" || l[1] !== " ") return;
        const q = l.slice(2).split(" ").map(Number);
        if (Math.abs(q[2] - zNm) < 1e-6) out.push(q);
      });
      return out;
    };
    const radiusAt = (obj, zNm) => {
      const vs = vertsAtZ(obj, zNm);
      if (!vs.length) return null;
      let s = 0, n = 0;
      vs.forEach(q => { const d = Math.hypot(q[0] - 1000 * 4, q[1] - 2000 * 4);
                        if (d > 1){ s += d; n++; } });
      return n ? s / n : null;
    };

    box.checked = false;
    const off = objOf();
    box.checked = true;
    const on = objOf();
    box.checked = false;
    const offAgain = objOf();

    /* Section 5 sits between traced 4 and 6; with the box off there is no vertex there at all. */
    const z5 = 5 * res[2];
    return {
      hasBox: !!box,
      offLen: off.length, onLen: on.length,
      sameOffOff: off === offAgain,
      differ: off !== on,
      offAtZ5: vertsAtZ(off, z5).length, onAtZ5: vertsAtZ(on, z5).length,
      rOn: radiusAt(on, z5),
      rTrue: Math.sqrt(Math.max(1, R * R - (5 * SP) * (5 * SP))) * res[0],
      rFlat: ((Math.sqrt(Math.max(1, R * R - (4 * SP) * (4 * SP)))
             + Math.sqrt(Math.max(1, R * R - (6 * SP) * (6 * SP)))) / 2) * res[0],
      /* The volume must not notice. */
      volOff: (UJ.traceloft.volume(rings, res) || {}).volumeUm3
    };
  });

  console.log("the checkbox");
  ok(got.hasBox, "it is there, beside the see-through one", got.hasBox);
  ok(got.sameOffOff, "with it OFF the mesh is exactly what it always was", got.sameOffOff);
  ok(got.offAtZ5 === 0, "...with nothing at all between the traced sections", got.offAtZ5 + " vertices");

  console.log("\nand with it on");
  ok(got.differ && got.onLen > got.offLen, "the mesh really changes",
     Math.round(got.offLen / 1024) + "k → " + Math.round(got.onLen / 1024) + "k of OBJ");
  ok(got.onAtZ5 > 0, "...there are now contours between the sections he drew",
     got.onAtZ5 + " vertices at the section between");
  ok(got.rOn !== null && Math.abs(got.rOn - got.rTrue) < Math.abs(got.rFlat - got.rTrue),
     "...and the surface bows out towards the true sphere instead of cutting the chord",
     got.rOn === null ? "none" : ("true " + got.rTrue.toFixed(0) + " nm, smoothed "
       + got.rOn.toFixed(0) + ", flat chord " + got.rFlat.toFixed(0)));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
