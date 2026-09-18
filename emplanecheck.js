/* A single plane of EM, beside the cortical-layer model.                           2026-09-18

   Søren: *"there is a single plane of the EM data with the segmentation loaded when you view the
   cell next to the cortical layers model, under the top view, but it may slow things down, so it
   should be possible to turn it off. Try to make it look nice without too much wasted space."*

   Driven on the real page. The imagery bucket is not reachable from here, so the two modules that
   would fetch it (UJ.emtiles, UJ.segpaint) are replaced with recording stubs — which is the right
   seam anyway: what has to be right is WHICH cell's ids are handed to the overlay, WHEN a fetch is
   allowed to start, and whether a slow one can paint over a newer panel. None of that is about the
   bytes.

   THE THING THAT WILL BE WRONG IF ANYTHING IS the ids. Three of the four panels that draw this
   diagram are not showNucleus, and CUR_ROOT/CUR_NUCID are stale in all three. Reading them would
   paint the previous cell's segmentation over this cell's EM — in the right colours, with no error,
   and completely wrong. So the check files a cell, then a DIFFERENT kind of panel, and asserts what
   the overlay was asked for.

   Run: node emplanecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* Replaces the two fetching modules with recorders. `hold` makes a draw hang until released, which
   is how a stale paint is provoked without waiting on a real network. */
const STUB = () => {
  window.__em = { draws: [], paints: [], release: null };
  UJ.emtiles = {
    configured: () => true,
    configure: () => {},
    drawSection: async (cv, o) => {
      window.__em.draws.push({ centre: o.centre.slice(), w: o.w, h: o.h, mip: o.mip });
      if (o.onProgress) o.onProgress(1, 4);
      if (window.__em.hold)
        await new Promise(r => { window.__em.release = r; });
      const ctx = cv.getContext("2d");
      cv.width = o.w; cv.height = o.h;
      ctx.fillStyle = "#222"; ctx.fillRect(0, 0, o.w, o.h);
      return { mip: o.mip, nmPerPx: 32, zoom: 1, effNmPerPx: 32,
               umAcross: o.w * 32 / 1000, z: o.centre[2], w: o.w, h: o.h,
               toolAt: () => o.centre.slice(), pxAt: () => [0, 0], pxPerToolVoxel: 1 };
    }
  };
  UJ.segpaint = {
    configured: () => true,
    configure: () => {},
    paint: async (cv, view, o) => {
      window.__em.paints.push({ root: o.root || "", nuc: o.nuc || "", alpha: o.alpha });
      return { ok: true, painted: 1234, cell: { painted: 1234 }, nucleus: null };
    }
  };
};

const settle = (p, ms) => p.waitForTimeout(ms);

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => d.accept().catch(() => {}));
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());
  await p.route("**bossdb-open-data.s3.amazonaws.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);
  await p.evaluate(STUB);

  /* A real cell, reached the way a person reaches one. */
  const shown = await p.evaluate(() => {
    let i = -1;
    for (let k = 0; k < NID.length; k++) if (rootId(k)) { i = k; break; }
    jumpToVoxel(NX[i], NY[i], NZ[i]);
    return { i, nuc: String(NID[i]), root: String(rootId(i)) };
  });
  await settle(p, 900);

  console.log("it is where he asked for it");
  {
    const lay = await p.evaluate(() => {
      const box = document.getElementById("emPlaneBox");
      const cv = document.getElementById("emPlaneCv");
      if (!box || !cv) return { box: !!box, cv: !!cv };
      const col = box.parentElement;
      const svgs = [].slice.call(col.querySelectorAll("svg"));
      const row = col.parentElement;
      const cols = [].slice.call(row.children);
      /* The model is the OTHER column's svg; the top view is the one above the section. */
      const model = cols.indexOf(col) === 0 ? null : cols[0].querySelector("svg");
      return {
        box: true, cv: true,
        inSameColumnAsTopView: svgs.length === 1,
        underTopView: !!(svgs[0] &&
          (svgs[0].compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
        besideModel: !!model && cols.length === 2,
        modelH: model ? model.viewBox.baseVal.height : 0,
        cvW: cv.width, cvH: cv.height,
        rowFlex: getComputedStyle(row).display
      };
    });
    ok(lay.box && lay.cv, "the cell panel has an EM section canvas");
    ok(lay.besideModel, "...in the column beside the cortical-layer model",
       "2 columns, model " + lay.modelH + " tall");
    ok(lay.inSameColumnAsTopView && lay.underTopView,
       "...stacked UNDER the top view, not as a third column that would wrap");
    ok(lay.cvW === 260 && lay.cvH === 140,
       "...the same 260 wide as the two diagrams, and half the model's height",
       lay.cvW + "x" + lay.cvH);
    /* The space it fills was already empty: one 320-tall model against 140+140 stacked. Asserting
       the arithmetic rather than a screenshot, because "without too much wasted space" is a claim
       about THIS ratio and nothing else about the page. */
    ok(lay.modelH >= 2 * lay.cvH && lay.modelH <= 2 * lay.cvH + 60,
       "...so the panel grows by almost nothing — the stack fits the model's own height",
       lay.modelH + " vs " + (2 * lay.cvH));
  }

  console.log("\nit draws this cell, and paints THIS cell's ids");
  {
    const got = await p.evaluate(() => window.__em);
    ok(got.draws.length === 1, "one section drawn, not one per render", got.draws.length);
    ok(got.draws[0] && got.draws[0].mip === 2,
       "...at 32 nm, which is a soma across rather than the inside of a nucleus", "mip 2");
    ok(got.paints.length === 1, "the segmentation is painted over it", got.paints.length);
    ok(got.paints[0] && got.paints[0].root === shown.root && got.paints[0].nuc === shown.nuc,
       "...with the root and nucleus of the cell on screen",
       got.paints[0] ? got.paints[0].root + " / " + got.paints[0].nuc : "nothing");
    const cap = await p.evaluate(() => {
      const say = document.getElementById("emPlaneSay");
      const line = say.parentElement;                       // the whole caption row
      const cv = document.getElementById("emPlaneCv");
      const one = Math.round(parseFloat(getComputedStyle(line).lineHeight)) || 18;
      return { said: say.textContent, rows: Math.round(line.getBoundingClientRect().height / one),
               title: cv.title || "" };
    });
    ok(/µm|µm/.test(cap.said || ""), "...and the caption says how much tissue that is", cap.said);
    /* ONE ROW. Every extra row of this caption is a row of empty background beside the model — the
       whole reason the section fits under the top view at all is that it costs almost no height. */
    ok(cap.rows === 1, "...on a single line, because a second one is pure panel height", cap.rows);
    ok(/magenta/.test(cap.title) && /nm\/px/.test(cap.title),
       "...with the colour key and the resolution on the canvas itself, where they cost nothing",
       cap.title.slice(0, 60) + "…");
  }

  console.log("\nevery panel paints what IT knows, not what the globals hold");
  {
    /* The trap is not staleness — all four panels set CUR_ROOT/CUR_NUCID before building their
       markup. It is that CUR_NUCID means "the MICrONS nucleus DETECTION this panel is about", and
       the community panels set it to null on purpose because they are not about one. A user-
       reported cell's nucleus id lives in CUR_NUC_ROOT; reading CUR_NUCID here would paint no
       nucleus and report no problem, which is the kind of wrong nobody notices. */
    const other = await p.evaluate(async () => {
      window.__em.draws = []; window.__em.paints = [];
      const panel = document.getElementById("nucpanel");
      renderUserReportedCell({ pos: [NX[0], NY[0], NZ[0]], dist: 0, identified: "Astrocyte",
                               reporterName: "Someone", rootId: "111111111111111111",
                               nucRootId: "222222", certainty: 3 }, panel);
      await new Promise(r => setTimeout(r, 900));
      return { paints: window.__em.paints, curNuc: String(CUR_NUCID), curRoot: String(CUR_ROOT) };
    });
    ok(other.paints.length === 1, "the user-reported panel draws one too", other.paints.length);
    ok(other.paints[0] && other.paints[0].root === "111111111111111111",
       "...with the reporter's root id", other.paints[0] ? other.paints[0].root : "nothing");
    ok(other.curNuc === "null" && other.paints[0] && other.paints[0].nuc === "222222",
       "...and its nucleus painted from the REPORT, which CUR_NUCID is deliberately null for",
       "CUR_NUCID=" + other.curNuc + ", painted " + (other.paints[0] || {}).nuc);
    ok(!other.paints.some(x => x.root === shown.root),
       "...and nothing of the cell that was on screen before it", shown.root);

    /* A merged sub-cell has no nucleus id of its own — only its PARENT's, which is the fused
       detection covering several real cells. Painting that would outline all of them as if they
       were this one, in this one's colour. */
    const merged = await p.evaluate(async () => {
      window.__em.draws = []; window.__em.paints = [];
      const panel = document.getElementById("nucpanel");
      renderMergedSubCell({ pos: [NX[0], NY[0], NZ[0]], dist: 0, identified: "Pericyte",
                            parentNucleusId: String(NID[0]), subCount: 3,
                            subRootId: "999999999999999999" }, panel);
      await new Promise(r => setTimeout(r, 900));
      return { paints: window.__em.paints, parent: String(NID[0]) };
    });
    ok(merged.paints.length === 1 && merged.paints[0].root === "999999999999999999",
       "a merged sub-cell paints its own root id",
       merged.paints[0] ? merged.paints[0].root : "nothing");
    ok(merged.paints[0] && !merged.paints[0].nuc,
       "...and NOT the fused parent nucleus, which covers several other cells",
       "parent " + merged.parent + ", painted nucleus " +
       (merged.paints[0] && merged.paints[0].nuc ? merged.paints[0].nuc : "none"));
  }

  console.log("\na slow section cannot paint over a newer cell");
  {
    const stale = await p.evaluate(async () => {
      window.__em.draws = []; window.__em.paints = []; window.__em.hold = true;
      const panel = document.getElementById("nucpanel");
      let i = -1, j = -1;
      for (let k = 0; k < NID.length; k++) if (rootId(k)) { if (i < 0) i = k; else { j = k; break; } }
      jumpToVoxel(NX[i], NY[i], NZ[i]);
      await new Promise(r => setTimeout(r, 500));      // its draw is now held
      const heldFor = window.__em.draws.length;
      jumpToVoxel(NX[j], NY[j], NZ[j]);                 // a newer panel, while the old draw hangs
      await new Promise(r => setTimeout(r, 500));
      window.__em.hold = false;
      if (window.__em.release) window.__em.release();   // the stale one finally returns
      await new Promise(r => setTimeout(r, 600));
      return { heldFor, paints: window.__em.paints.map(x => x.root),
               newer: String(rootId(j)), older: String(rootId(i)) };
    });
    ok(stale.heldFor === 1, "the first cell's section was in flight", stale.heldFor + " started");
    ok(stale.paints.indexOf(stale.older) < 0,
       "...and when it finally returned it painted NOTHING — a newer cell is on screen",
       stale.paints.join(", ") || "no paint from the stale draw");
  }

  console.log("\nand it can be turned off, and stays off");
  {
    const off = await p.evaluate(async () => {
      window.__em.draws = []; window.__em.paints = [];
      const box = document.getElementById("emPlaneOn");
      box.checked = false;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const cv = document.getElementById("emPlaneCv");
      return { hidden: cv.style.display === "none", stored: localStorage.getItem("ujump_panel_emplane") };
    });
    ok(off.hidden, "unticking it hides the section");
    ok(off.stored === "0", "...and the choice is written down", off.stored);

    const nextCell = await p.evaluate(async () => {
      window.__em.draws = []; window.__em.paints = [];
      let n = 0, seen = [];
      for (let k = 0; k < NID.length && seen.length < 3; k++) if (rootId(k)) seen.push(k);
      jumpToVoxel(NX[seen[2]], NY[seen[2]], NZ[seen[2]]);
      await new Promise(r => setTimeout(r, 900));
      const cv = document.getElementById("emPlaneCv");
      const ticked = document.getElementById("emPlaneOn").checked;
      return { draws: window.__em.draws.length, hidden: cv.style.display === "none", ticked };
    });
    ok(nextCell.draws === 0,
       "...so the NEXT cell fetches nothing at all — which is the whole point of the switch",
       nextCell.draws + " draws");
    ok(!nextCell.ticked && nextCell.hidden, "...and the box comes back unticked");

    const backOn = await p.evaluate(async () => {
      const box = document.getElementById("emPlaneOn");
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      const cv = document.getElementById("emPlaneCv");
      return { draws: window.__em.draws.length, shown: cv.style.display !== "none",
               stored: localStorage.getItem("ujump_panel_emplane") };
    });
    ok(backOn.draws === 1 && backOn.shown && backOn.stored === "1",
       "ticking it again draws the section that was skipped", backOn.draws + " draw");
  }

  console.log("\nnothing outside minnie65 pretends to have imagery");
  {
    const outside = await p.evaluate(async () => {
      window.__em.draws = []; window.__em.paints = [];
      const panel = document.getElementById("nucpanel");
      const bb = window.MINNIE65_EM_BB;
      const far = [Math.round((bb.xmax + 400000) / UJ_RX), Math.round(bb.ymin / UJ_RY),
                   Math.round(bb.zmin / UJ_RZ)];
      renderUserReportedCell({ pos: far, dist: 0, identified: "Astrocyte",
                               reporterName: "Someone", rootId: "3", nucRootId: "4" }, panel);
      await new Promise(r => setTimeout(r, 700));
      const cv = document.getElementById("emPlaneCv");
      return { draws: window.__em.draws.length, hidden: cv && cv.style.display === "none",
               said: (document.getElementById("emPlaneSay") || {}).textContent };
    });
    ok(outside.draws === 0 && outside.hidden,
       "a point outside the imaged volume draws nothing", outside.draws + " draws");
    ok(/outside/i.test(outside.said || ""), "...and says why rather than showing grey", outside.said);
  }

  ok(errors.length === 0, "no script errors", errors.slice(0, 3).join(" | ") || "none");
  await p.close();

  /* IT SAYS WHY IT IS NOT THERE. The first time this section "did not show", the cause was a page
     deployed three minutes before the feature existed — which no in-page message can help. But a
     core/*.js that 404s on the server looks identical from the outside and is worth a sentence:
     a feature that vanishes silently costs a round trip to diagnose, every time. */
  console.log("\nand when its reader is missing it says so instead of vanishing");
  {
    const q = await b.newPage();
    q.on("dialog", d => d.accept().catch(() => {}));
    await q.route("**script.google.com/**", r => r.abort());
    await q.route("**accounts.google.com/**", r => r.abort());
    await q.route("**cdnjs.cloudflare.com/**", r => r.abort());
    await q.route("**core/emtiles.js", r => r.abort());          // the module 404s
    await q.goto("file://" + page_("ujump.html"));
    await q.waitForTimeout(5000);
    await q.evaluate(() => {
      let i = -1;
      for (let k = 0; k < NID.length; k++) if (rootId(k)) { i = k; break; }
      jumpToVoxel(NX[i], NY[i], NZ[i]);
    });
    await q.waitForTimeout(1200);
    const gone = await q.evaluate(() => ({
      box: !!document.getElementById("emPlaneBox"),
      say: (document.getElementById("emPlaneSay") || {}).textContent || "",
      disabled: !!(document.getElementById("emPlaneOn") || {}).disabled,
      canvas: (document.getElementById("emPlaneCv") || { style: {} }).style.display
    }));
    ok(gone.box, "the section is still in the panel rather than silently absent");
    ok(/core\/emtiles\.js/.test(gone.say) && /Ctrl-Shift-R/.test(gone.say),
       "...naming the file that did not arrive, and what to do about it", gone.say.slice(0, 70));
    ok(gone.disabled && gone.canvas === "none",
       "...with the tick disabled and no empty grey box pretending to be imagery");
    await q.close();
  }

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
