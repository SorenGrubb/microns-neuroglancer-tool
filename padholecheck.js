/* A contour drawn inside another is a hole — on the pad, where you can see it.      2026-09-19

   Søren: *"If I draw one contour inside another, it should subtract the inside from the outside, so
   that the inner one becomes a hole. This hole should also exist in the 3D mesh."*

   The mesh half of that is traceloftcheck.js. This is the half he was actually looking at when he
   said it: the wash the pad paints under the contours. It used to be one beginPath/fill PER RING,
   so an inner contour was filled ON TOP of the outer one — two overlapping washes where the volume
   figure, the export and now the preview all say there is a hole.

   THE TEST IS PIXELS, not a claim about the code, because "fills even-odd" is exactly the sort of
   thing that is true of the function and false of the canvas: a second fill of the same path, a
   stale composite operation or a path built in the wrong order would all read as correct source.
   So the pad is driven with rings put straight into PAD, painted over a known black canvas, and
   read back with getImageData.

   THE OTHER HALF OF EVEN-ODD IS THAT STRUCTURES DO NOT PUNCH EACH OTHER. Contours are grouped by
   r.inst — the same grouping the 3D preview lofts by and padVolume measures by — so a small
   organelle traced inside a cell's outline, as a SEPARATE structure, is still filled. Getting that
   wrong would be invisible until somebody traced a mitochondrion inside the soma they had just
   outlined, which is the ordinary way to use this pad.

   Nothing here touches the network; the pad is painted from rings handed to it directly, with no
   EM section behind it.

   Run: node padholecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The pad's wash is hexA(colour, 0.14) over whatever is behind it. Over black, "painted" and
   "not painted" are simply "not zero" and "zero" — no colour matching, no tolerance to argue
   about, and it still works whatever padInstColour returns for a given structure. */
const SETUP = `(function(){
  const cv = document.getElementById("tracePad");
  cv.width = 400; cv.height = 400;
  const g = cv.getContext("2d");
  g.fillStyle = "#000000"; g.fillRect(0, 0, cv.width, cv.height);
  PAD_BASE = null; PAD_BASE_READY = false; PAD_HOVER = null;
  /* One canvas pixel per tool voxel, origin at the corner: the mapping does not matter to what is
     under test, and an identity one makes every expectation arithmetic. */
  PAD_VIEW = { pxAt: function(t){ return [t[0], t[1]]; }, pxPerToolVoxel: 1 };
})()`;

/* A square ring, clockwise or not — the fill rule must not care. */
function box(cx, cy, r, cw){
  const p = [[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r]];
  return cw ? p.slice().reverse() : p;
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  /* Paint the given rings and read back the pixels asked for. Returns, for each probe, whether
     anything was painted there at all. */
  async function paint(rings, probes){
    return p.evaluate(([setup, rings, probes]) => {
      // eslint-disable-next-line no-eval
      eval(setup);
      PAD = { z: 0, rings: rings, pending: [], stroke: null, inst: 0 };
      padPaint();
      const cv = document.getElementById("tracePad");
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      return probes.map(function(q){
        const i = (q[1] * cv.width + q[0]) * 4;
        return d[i] + d[i + 1] + d[i + 2] > 0;
      });
    }, [SETUP, rings, probes]);
  }

  console.log("one contour inside another, in the same structure, is a hole");
  {
    const rings = [
      { z: 0, inst: 0, points: box(200, 200, 120) },
      { z: 0, inst: 0, points: box(200, 200, 50) }
    ];
    /* Inside the inner square; between the two; outside both. */
    const got = await paint(rings, [[200, 200], [200, 110], [200, 40]]);
    ok(got[1] === true, "the ring between the two contours is filled", "between: " + got[1]);
    ok(got[0] === false, "...and the middle of the inner contour is NOT — it is a hole",
       "inside the inner: " + got[0]);
    ok(got[2] === false, "...and nothing is painted outside the outer one",
       "outside: " + got[2]);
  }

  console.log("\n...however either of them was drawn round");
  {
    /* The inner one clockwise, the outer one anticlockwise. Even-odd does not count winding, which
       is the reason it is the rule this feature uses everywhere: a tracer drawing a hole has no
       reason to know which way round to draw it. (blender/trace_mesh.py says the same, in the same
       words, one layer down.) */
    const rings = [
      { z: 0, inst: 0, points: box(200, 200, 120) },
      { z: 0, inst: 0, points: box(200, 200, 50, true) }
    ];
    const got = await paint(rings, [[200, 200], [200, 110]]);
    ok(got[0] === false && got[1] === true,
       "a hole drawn the other way round is still a hole",
       "inside " + got[0] + ", between " + got[1]);
  }

  console.log("\n...and whichever of the two was drawn first");
  {
    /* Søren, 2026-09-19: *"if you draw the inner circle before the outer circle will it still be a
       hole?"* It is a fair thing to doubt — "the first one wins" is how a paint program behaves, and
       the pad DID behave that way until today, when the second fill simply landed on top of the
       first. Even-odd asks whether a point is enclosed an odd number of times, which no more
       depends on the order the contours were laid into the path than it does on their winding.
       Asserted rather than reasoned about, because the tracer has no way to know which one the tool
       thinks came first. */
    const outer = { z: 0, inst: 0, points: box(200, 200, 120) };
    const inner = { z: 0, inst: 0, points: box(200, 200, 50) };
    const first = await paint([outer, inner], [[200, 200], [200, 110], [200, 40]]);
    const last = await paint([inner, outer], [[200, 200], [200, 110], [200, 40]]);
    ok(JSON.stringify(first) === JSON.stringify(last),
       "drawing the hole BEFORE the outline gives exactly the same picture",
       "outer first " + first.join("/") + ", inner first " + last.join("/"));
    ok(last[0] === false && last[1] === true,
       "...and it is still the hole that is empty, not the ring", "inside: " + last[0]);
  }

  console.log("\nbut a SEPARATE structure inside a cell's outline is not a hole in it");
  {
    /* The ordinary way to use this pad: outline the cell, then trace a mitochondrion inside it as
       structure number two. Grouping by r.inst -- the same grouping the 3D preview lofts by and
       padVolume measures by -- is what keeps the second one filled. */
    const rings = [
      { z: 0, inst: 0, points: box(200, 200, 120) },
      { z: 0, inst: 1, points: box(200, 200, 50) }
    ];
    const got = await paint(rings, [[200, 200], [200, 110]]);
    ok(got[0] === true, "the organelle traced inside the cell is filled, not punched out",
       "inside the organelle: " + got[0]);
    ok(got[1] === true, "...and so is the cell around it", "between: " + got[1]);
  }

  console.log("\nand two contours side by side are two shapes, as they always were");
  {
    const rings = [
      { z: 0, inst: 0, points: box(110, 200, 60) },
      { z: 0, inst: 0, points: box(290, 200, 60) }
    ];
    const got = await paint(rings, [[110, 200], [290, 200], [200, 200]]);
    ok(got[0] === true && got[1] === true, "both are filled",
       got[0] + " / " + got[1]);
    ok(got[2] === false, "...and the gap between them is not", "gap: " + got[2]);
  }

  console.log("\nand a contour on another section is not painted on this one");
  {
    const rings = [
      { z: 0, inst: 0, points: box(200, 200, 120) },
      { z: 1, inst: 0, points: box(200, 200, 50) }        // the "hole" belongs to the next section
    ];
    const got = await paint(rings, [[200, 200], [200, 110]]);
    ok(got[0] === true && got[1] === true,
       "a contour one section up cannot punch a hole in this one",
       "inside " + got[0] + ", between " + got[1]);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
