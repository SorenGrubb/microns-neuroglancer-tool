/* A row may not disagree with itself about which cell it is.                          2026-10-06

   Søren, four structures filed under a cell 125 µm from where they were drawn: *"now it mixed two
   different tracings completely.... WE NEED TO FIX THIS! WHAT IS GOING ON???"*

   nucleus_1791311494766_j6b2 and three others carry nucleusId 394673650 and rootId 6475165144,
   whose own centre is 402334, 232283, 479 — while their cellCoord, and their contours, are at
   427087, 220193, 1940. Cell 394673650's panel then showed two whole cells, two nuclei, two
   centrioles and two cilia.

   THE COORDINATE WAS RIGHT THE WHOLE TIME, which is why the obvious test is the wrong one: "are the
   contours near the cell coordinate?" passes all four. The row disagrees with ITSELF — its
   coordinate names one place and its nucleus id names a cell a hundred micrometres from there.

   AND NOT THROUGH THE ROOT ID. Søren: *"in h01 we can't always trust the root ID... many different
   cells share the same root ID... more important is the cell location, which is put as close to the
   nucleus center as possible."*

   THE NUMBERS BELOW ARE HIS. Nothing here is a toy: the two cells, their centres and the distance
   between them are the ones out of his sheet.

   Run: node cellidentitycheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* His two cells, as the sheet records them. */
const CELLS = `window.__CELLS = {
  "394673650": { xVox: 402334, yVox: 232283, zVox:  479, from: "nucleus" },
  "38762771":  { xVox: 426863, yVox: 220507, zVox: 2024, from: "nucleus" }
};`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3500);

  /* The page's own nucleus table needs the network, so the two hooks the guard reads are stood in
     for with his two cells. They are the SAME hooks µJump defines — window.tracingNucCentroid for
     "where is this nucleus" and tracingNearestCell for "which cell is at this coordinate" — so what
     is under test is the guard, not the table. */
  await p.evaluate(CELLS + `
    window.tracingNucCentroid = function(nid){ return window.__CELLS[String(nid)] || null; };
    window.tracingNearestCell = tracingNearestCell = function(pos){
      var best = null, bd = 1e18;
      Object.keys(window.__CELLS).forEach(function(k){
        var c = window.__CELLS[k];
        var dx = (pos[0]-c.xVox)*4, dy = (pos[1]-c.yVox)*4, dz = (pos[2]-c.zVox)*40;
        var d = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (d < bd){ bd = d; best = { nucleusId: k, coord: [c.xVox,c.yVox,c.zVox], distNm: d, label: "" }; }
      });
      return (best && best.distNm <= 10000) ? best : null;
    };
  `);

  const setUp = (nuc, root, at) => `(function(){
    document.getElementById("tracingPanel").open = true;
    PAD = UJ.tracepad.create();
    PAD.rings = [{ z: 1941, inst: 0, points: [[427000,220100],[427200,220100],[427200,220300],[427000,220300]] },
                 { z: 1943, inst: 0, points: [[427000,220100],[427200,220100],[427200,220300],[427000,220300]] }];
    PAD.z = 1941; PAD.inst = 0;
    TRACING_BASE_ID = ""; PAD_EDIT_ID = ""; PAD_EDIT_IDS = {}; PAD_INST_KIND = {};
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD) };
    TRACINGS_KEPT = [];
    document.getElementById("tracingEachOwn").checked = false;
    document.getElementById("tracingWhat").value = "__nucleus";
    document.getElementById("tracingType").value = "Endothelial cell";
    document.getElementById("tracingNucId").value = ${JSON.stringify(nuc)};
    document.getElementById("tracingRootId").value = ${JSON.stringify(root)};
    document.getElementById("tracingCellAt").value = ${JSON.stringify(at)};
    document.getElementById("tracingFound").style.display = "";
    var all = tracingCurrentAll() || [];
    return { n: all.length, said: (document.getElementById("tracingStatus")||{}).textContent || "" };
  })()`;

  console.log("the submission that started this");
  {
    /* His exact state: the coordinate of one cell, the ids of another. */
    const r = await p.evaluate(setUp("394673650", "6475165144", "427087, 220193, 1940"));
    ok(r.n === 0,
       "NOTHING IS FILED when the coordinate and the nucleus id name two different cells — four "
       + "structures went into cell 394673650 this way, whose own centre is 125 µm from where they "
       + "were drawn", r.n + " structures");
    /* 124.7 µm, not the ~99 a glance at the x column gives: dy is 48 µm and dz, at 40 nm a
       section, is another 58. Measured by the guard rather than estimated by me. */
    ok(/124\.7 µm/.test(r.said),
       "...and it says how far apart they are, in three dimensions and measured rather than "
       + "asserted", r.said.slice(0, 95));
    ok(/38762771/.test(r.said),
       "...and names the cell the coordinate is actually at, so the repair is one paste",
       /38762771/.test(r.said) ? "offers nucleus 38762771" : "offers nothing");
  }

  console.log("\nand the submissions that must still go through");
  {
    const r = await p.evaluate(setUp("38762771", "6198781614", "427087, 220193, 1940"));
    ok(r.n === 1, "the same contours under the RIGHT nucleus are filed", r.n + " structure");
  }
  {
    /* 1.6 µm out, which is a coordinate placed by hand at a nucleus centre. */
    const r = await p.evaluate(setUp("38762771", "", "426863, 220507, 2024"));
    ok(r.n === 1,
       "...and a coordinate a micrometre or two off its nucleus is the ordinary case, not a "
       + "disagreement — a guard that refuses correct work is a guard somebody switches off",
       r.n + " structure");
  }
  {
    const r = await p.evaluate(setUp("", "6475165144", "427087, 220193, 1940"));
    ok(r.n === 1,
       "...and with no nucleus id there is nothing to disagree with, so it goes", r.n + " structure");
  }
  {
    const r = await p.evaluate(`(function(){
      var keep = window.tracingNucCentroid;
      window.tracingNucCentroid = undefined;
      var out = ${setUp("394673650", "6475165144", "427087, 220193, 1940")};
      window.tracingNucCentroid = keep;
      return out;
    })()`);
    ok(r.n === 1,
       "...and a page with no nucleus table says nothing and files it — ωJump has none, and a guard "
       + "that guesses is worse than one that is quiet", r.n + " structure");
  }

  console.log("\nand moving the coordinate moves the ids");
  {
    const r = await p.evaluate(() => {
      const out = {};
      const nuc = document.getElementById("tracingNucId");
      const root = document.getElementById("tracingRootId");
      const at = document.getElementById("tracingCellAt");
      nuc.value = "394673650"; root.value = "6475165144";
      at.value = "427087, 220193, 1940";
      at.dispatchEvent(new Event("change"));
      out.nuc = nuc.value; out.root = root.value;
      out.said = (document.getElementById("tracingStatus") || {}).textContent || "";
      /* AND A NUDGE WITHIN ONE CELL CHANGES NOTHING. */
      root.value = "6198781614";
      at.value = "427090, 220196, 1941";
      at.dispatchEvent(new Event("change"));
      out.nucAfter = nuc.value; out.rootAfter = root.value;
      return out;
    });
    ok(r.nuc === "38762771",
       "a coordinate in another cell refills the nucleus box with that cell", r.nuc);
    ok(r.root === "",
       "...and CLEARS the fragment box rather than carrying over one belonging to the cell you "
       + "left — Søren: \"many different cells share the same root ID\"",
       JSON.stringify(r.root));
    ok(/different cell/i.test(r.said) && /38762771/.test(r.said),
       "...out loud, because a box that changes itself in silence is its own hazard",
       r.said.slice(0, 90));
    ok(r.nucAfter === "38762771" && r.rootAfter === "6198781614",
       "...while a nudge of a few voxels inside one cell leaves both alone",
       r.nucAfter + " / " + r.rootAfter);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
