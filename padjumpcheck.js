/* A chip on the pad takes you to what it names, and a drawing can be deleted — after a warning.
                                                                                      2026-09-23
   Søren, with a screenshot of the two strips:
     "When clicking one of the contours, it should jump to that contour in the EM window, so that I
      don't have to look for it."
     "Also, I should be able to delete one of the drawings, but give a warning first."

   WHAT THE CHIPS DID. The "On this section:" chip was a delete button end to end -- the whole chip,
   not the × on it -- so there was no way to click a contour at all, and the way to find one was to
   look for it. The "Drawing:" chip switched which structure you are drawing and promised, in its
   own tooltip, "Go back to this one", which it did not do: it changed the selection and left the
   view where it was. And a whole drawing could not be deleted at all, only unpicked contour by
   contour.

   SO THE CLICK AND THE DELETE ARE SEPARATED, on both strips. The body of a chip GOES THERE; the ×
   on it deletes. That way round on purpose: a click that goes somewhere is undone by looking back,
   and a click that deletes is not.

   WHAT IS ASSERTED:
     - a contour chip's body centres the view on that contour, and deletes nothing
     - ...its × deletes that one contour, and no other
     - a drawing chip goes to that drawing: its section AND its place on the section
     - ...and when it is already on this section, the z does not move
     - a drawing's × does NOT delete on the first click: it warns, naming the drawing and what
       would go
     - ...confirming deletes every contour of it, on every section, and nothing of its neighbours
     - ...and Keep cancels, losing nothing
     - deleting the drawing you are on leaves you on a real one
     - a drawing opened from the dataset says, in the warning, that the dataset's copy stays
     - the numbers of the surviving drawings do not shift under them

   Run: node padjumpcheck.js */
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

  const got = await p.evaluate(async () => {
    /* No EM, no tiles: every assertion here is about PAD.z and PAD_CENTRE, which is where "jump to
       it" actually lives. padDraw is the thing that would go to the network. */
    let draws = 0;
    padDraw = async function(){ draws++; };

    /* A square contour of `r` voxels about (cx, cy). */
    const ring = (cx, cy, r) => [[cx-r,cy-r],[cx+r,cy-r],[cx+r,cy+r],[cx-r,cy+r]];

    const setup = () => {
      document.getElementById("tracingPanel").open = true;
      document.getElementById("tracePadWrap").style.display = "";
      PAD = UJ.tracepad.create();
      PAD.z = 18000;
      PAD_INST_KIND = {}; PAD_INST_COLOUR = {}; PAD_EDIT_IDS = {};
      /* structure 0: two contours on this section, far apart
         structure 1: one contour here
         structure 2: nothing here — it lives two sections down */
      PAD.rings = [
        { z: 18000, points: ring(200000, 120000, 300), inst: 0 },
        { z: 18000, points: ring(260000, 160000, 300), inst: 0 },
        { z: 18002, points: ring(201000, 121000, 300), inst: 0 },
        { z: 18000, points: ring(230000, 140000, 300), inst: 1 },
        { z: 18004, points: ring(290000, 190000, 300), inst: 2 },
        { z: 18006, points: ring(291000, 191000, 300), inst: 2 }
      ];
      PAD.inst = 0;
      PAD_CENTRE = [250000, 150000, PAD.z];
      /* Enough of a view to hit-test and paint against: 20 voxels per pixel, 560 px across,
         centred wherever PAD_CENTRE is. toolAt and pxAt are each other's inverse, which is all
         anything here asks of them. */
      PAD_VIEW = { w: 560, h: 560, vw: 560, vh: 560, zoom: 1, pxPerToolVoxel: 1 / 20,
                   toolAt: (x, y) => [PAD_CENTRE[0] + (x - 280) * 20, PAD_CENTRE[1] + (y - 280) * 20],
                   pxAt: (t) => [(t[0] - PAD_CENTRE[0]) / 20 + 280, (t[1] - PAD_CENTRE[1]) / 20 + 280] };
      padInstances(); padRings();
    };
    const chips = () => [].slice.call(document.querySelectorAll("#tracePadRings .padring"));
    const insts = () => [].slice.call(document.querySelectorAll("#tracePadInsts .padinst"));
    /* The × within a chip, however it ends up being marked. */
    const xOf = (chip) => chip.querySelector(".padx, .chipx, [data-x]");
    const say = () => String((document.getElementById("tracePadSay") || {}).textContent || "");
    const nRings = () => PAD.rings.length;
    const ringsOf = (i) => PAD.rings.filter(r => (r.inst || 0) === i).length;
    const state = () => ({ z: PAD.z, centre: PAD_CENTRE.slice(), n: nRings(), inst: PAD.inst });

    const out = {};

    /* ── a contour chip's body goes there ─────────────────────────────────────────── */
    setup();
    out.chipCount = chips().length;
    out.hasX = !!xOf(chips()[0]);
    const before = state();
    /* the SECOND contour on this section belongs to structure 0 and sits at (260000, 160000) */
    chips()[1].click();
    out.bodyClick = { ...state(), was: before.centre, deleted: before.n - nRings() };

    /* ── ...and its × deletes just that one ───────────────────────────────────────── */
    setup();
    const x1 = xOf(chips()[1]);
    if (x1) x1.click();
    out.xClick = { n: nRings(), inst0: ringsOf(0), inst1: ringsOf(1), say: say().slice(0, 90) };

    /* ── a drawing chip goes to that drawing ──────────────────────────────────────── */
    setup();
    const i2 = insts().filter(b => b.dataset.inst === "2")[0];
    if (i2) i2.click();
    out.instJump = { ...state(), chip: !!i2 };

    /* ── ...and one already on this section does not move z ───────────────────────── */
    setup();
    const i1 = insts().filter(b => b.dataset.inst === "1")[0];
    if (i1) i1.click();
    out.instHere = { ...state() };

    /* ── the × on a drawing warns first ───────────────────────────────────────────── */
    setup();
    const ix = xOf(insts().filter(b => b.dataset.inst === "2")[0]);
    out.instHasX = !!ix;
    if (ix) ix.click();
    out.warned = { n: nRings(), inst2: ringsOf(2),
                   text: String(document.getElementById("tracePadInsts").textContent || "")
                           + " | " + say() };

    /* ── ...Keep cancels ──────────────────────────────────────────────────────────── */
    const keep = document.querySelector("#tracePadInsts .padkeep, #tracePadInsts [data-keep]");
    if (keep) keep.click();
    out.kept = { n: nRings(), inst2: ringsOf(2),
                 chipsBack: insts().length };

    /* ── ...and confirming deletes the whole drawing ──────────────────────────────── */
    setup();
    const ix2 = xOf(insts().filter(b => b.dataset.inst === "2")[0]);
    if (ix2) ix2.click();
    const go = document.querySelector("#tracePadInsts .padgo, #tracePadInsts [data-go]");
    out.hasConfirm = !!go;
    if (go) go.click();
    out.deleted = { n: nRings(), inst0: ringsOf(0), inst1: ringsOf(1), inst2: ringsOf(2),
                    say: say().slice(0, 120),
                    numbers: insts().map(b => b.dataset.inst).join(",") };

    /* ── deleting the one you are on ──────────────────────────────────────────────── */
    setup();
    UJ.tracepad.setInstance(PAD, 2); padInstances(); padRings();
    const ix3 = xOf(insts().filter(b => b.dataset.inst === "2")[0]);
    if (ix3) ix3.click();
    const go3 = document.querySelector("#tracePadInsts .padgo, #tracePadInsts [data-go]");
    if (go3) go3.click();
    out.deletedSelected = { inst: PAD.inst, exists: PAD.rings.some(r => (r.inst || 0) === PAD.inst)
                                                   || UJ.tracepad.instances(PAD).some(i => i.inst === PAD.inst) };

    /* ── one that came from the dataset says so ───────────────────────────────────── */
    setup();
    PAD_EDIT_IDS = { "2": "lysosome_1789996455594__i1" };
    padInstances();
    const ix4 = xOf(insts().filter(b => b.dataset.inst === "2")[0]);
    if (ix4) ix4.click();
    out.fromDataset = String(document.getElementById("tracePadInsts").textContent || "") + " | " + say();

    return out;
  });

  console.log("a contour chip");
  ok(got.chipCount === 3, "three contours on this section", got.chipCount);
  ok(got.hasX, "the chip carries a × of its own", got.hasX);
  ok(got.bodyClick.deleted === 0,
     "clicking the body deletes NOTHING — that is what the × is for", got.bodyClick.deleted + " gone");
  ok(got.bodyClick.centre[0] === 260000 && got.bodyClick.centre[1] === 160000,
     "...it centres the view on that contour", got.bodyClick.centre.join(",")
       + "  (was " + got.bodyClick.was.join(",") + ")");
  ok(got.xClick.n === 5 && got.xClick.inst0 === 2,
     "the × deletes that one contour and no other", got.xClick.n + " left, structure 1 has " + got.xClick.inst0);

  console.log("\na drawing chip");
  ok(got.instJump.z === 18004,
     "goes to the section that drawing is on", "z " + got.instJump.z);
  ok(got.instJump.centre[0] === 290000 && got.instJump.centre[1] === 190000,
     "...and to its place on it", got.instJump.centre.join(","));
  ok(got.instHere.z === 18000 && got.instHere.centre[0] === 230000,
     "one already on this section centres without moving z",
     "z " + got.instHere.z + " at " + got.instHere.centre.join(","));

  console.log("\ndeleting a drawing");
  ok(got.instHasX, "the drawing chip carries a × too", got.instHasX);
  ok(got.warned.n === 6 && got.warned.inst2 === 2,
     "the first click deletes NOTHING", got.warned.n + " contours still there");
  /* Named, and counted: "delete number 3" on its own does not say that seven minutes of tracing
     goes with it. The strip shows drawing 2 as "3" (inst + 1), and it holds 2 contours on 2
     sections. */
  ok(/delete/i.test(got.warned.text) && /\b3\b/.test(got.warned.text)
       && /2 contour/i.test(got.warned.text) && /2 section/i.test(got.warned.text),
     "...it warns, naming the drawing and counting what would go", got.warned.text.slice(0, 200));
  ok(got.kept.n === 6 && got.kept.inst2 === 2 && got.kept.chipsBack >= 3,
     "Keep cancels and the strip comes back",
     got.kept.n + " contours, " + got.kept.chipsBack + " chips");
  ok(got.hasConfirm, "the warning offers a way to go through with it", got.hasConfirm);
  ok(got.deleted.inst2 === 0, "confirming deletes every contour of it, on every section",
     got.deleted.inst2 + " left of it");
  ok(got.deleted.inst0 === 3 && got.deleted.inst1 === 1,
     "...and nothing of its neighbours", "structure 1: " + got.deleted.inst0
       + ", structure 2: " + got.deleted.inst1);
  ok(got.deleted.numbers === "0,1",
     "...and the survivors keep their own numbers", got.deleted.numbers);
  ok(got.deletedSelected.exists,
     "deleting the drawing you are on leaves you on a real one", "now on " + got.deletedSelected.inst);
  ok(/dataset/i.test(got.fromDataset),
     "one opened from the dataset warns that the dataset's copy stays",
     got.fromDataset.slice(0, 200));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
