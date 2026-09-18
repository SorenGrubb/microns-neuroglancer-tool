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
      window.__em.draws.push({ centre: o.centre.slice(), w: o.w, h: o.h, mip: o.mip,
                               slabOk: !!o.slabOk });
      if (o.onProgress) o.onProgress(1, 4);
      if (window.__em.hold)
        await new Promise(r => { window.__em.release = r; });
      const ctx = cv.getContext("2d");
      cv.width = o.w; cv.height = o.h;
      ctx.fillStyle = "#222"; ctx.fillRect(0, 0, o.w, o.h);
      /* The REAL scale list, so the numbers this check reads back are the ones the page will show.
         Index 3 is only reachable with slabOk; without it the module clamps to index 2, and the
         stub clamps the same way so that a page which forgot slabOk fails here rather than
         silently drawing a quarter of the tissue. */
      const SCALES = [[8, 40], [16, 40], [32, 40], [64, 80], [128, 160]];
      const top = o.slabOk ? SCALES.length - 1 : 2;
      const i = Math.max(0, Math.min(top, o.mip | 0));
      const nm = SCALES[i][0], secNm = SCALES[i][1];
      return { mip: i, nmPerPx: nm, zoom: 1, effNmPerPx: nm,
               sectionNm: secNm, slab: Math.round(secNm / 40),
               umAcross: o.w * nm / 1000, z: o.centre[2], w: o.w, h: o.h,
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
        shownW: Math.round(cv.getBoundingClientRect().width),
        shownH: Math.round(cv.getBoundingClientRect().height),
        rowFlex: getComputedStyle(row).display
      };
    });
    ok(lay.box && lay.cv, "the cell panel has an EM section canvas");
    ok(lay.besideModel, "...in the column beside the cortical-layer model",
       "2 columns, model " + lay.modelH + " tall");
    ok(lay.inSameColumnAsTopView && lay.underTopView,
       "...stacked UNDER the top view, not as a third column that would wrap");
    /* DRAWN AT 300, SHOWN AT 260. The backing store is wider than the display so the view can
       cover 19 um of tissue without the canvas becoming wider than the two diagrams it is lined up
       under — "how much tissue" and "how much room" are different questions (2026-09-18). */
    ok(lay.cvW === 300 && lay.cvH === 162,
       "...drawn 300 px wide, for tissue rather than for room", lay.cvW + "x" + lay.cvH);
    ok(Math.abs(lay.shownW - 260) <= 1,
       "...and displayed at the same 260 the model and the top view are",
       lay.shownW + " px on screen");
    ok(Math.abs(lay.shownH - 140) <= 2,
       "...keeping the top view's proportion, so the three read as one column",
       lay.shownH + " px tall");
    /* The space it fills was already empty: one 320-tall model against 140+140 stacked. Asserting
       the arithmetic rather than a screenshot, because "without too much wasted space" is a claim
       about THIS ratio and nothing else about the page. */
    ok(lay.modelH >= 2 * lay.shownH && lay.modelH <= 2 * lay.shownH + 60,
       "...so the panel grows by almost nothing — the stack fits the model's own height",
       lay.modelH + " vs " + Math.round(2 * lay.shownH));
  }

  console.log("\nthe top view above it is a figure, not a picture with a sentence on top");
  {
    /* 2026-09-18, Søren: "have Top view as a title in the diagram and then img35 and img65 written
       in the diagram ... they should have the same colors as the regions they represent. Then we
       can remove the top line." He had waved the labels off an hour earlier and came back with the
       piece that was missing — the TITLE moves in too, so the line above has nothing left on it.
       Half the idea saved nothing; the whole idea saves a caption that wrapped to two lines. */
    const fig = await p.evaluate(() => {
      const box = document.getElementById("emPlaneBox");
      const col = box.parentElement;
      const svg = col.querySelector("svg");
      const texts = [].slice.call(svg.querySelectorAll("text"))
        /* firstChild, not textContent: each label carries a nested <title> with the long dataset
           name, so textContent is "Img65Img65 (minnie65)". */
        .map(t => ({ s: (t.firstChild && t.firstChild.nodeValue) || t.textContent,
                     full: t.textContent, fill: t.getAttribute("fill") || "",
                     y: parseFloat(t.getAttribute("y")) }));
      const rects = [].slice.call(svg.querySelectorAll("rect"))
        .map(r => ({ stroke: r.getAttribute("stroke"),
                     y0: parseFloat(r.getAttribute("y")),
                     y1: parseFloat(r.getAttribute("y")) + parseFloat(r.getAttribute("height")) }));
      return { texts, rects,
               vb: svg.getAttribute("viewBox"),
               /* Anything between the top of the column and the figure would be the line that
                  was supposed to go. */
               aboveIt: [].slice.call(col.children).indexOf(svg),
               colText: (col.textContent || "").slice(0, 40) };
    });
    ok(fig.aboveIt === 0, "the figure is the first thing in the column — nothing above it",
       fig.colText.trim().slice(0, 30));
    const title = fig.texts.find(t => /Top view/.test(t.s));
    ok(!!title && title.y <= 15,
       "...with 'Top view' as a title inside it", title ? title.s : "no title");
    const l65 = fig.texts.find(t => t.s.trim() === "Img65");
    const l35 = fig.texts.find(t => t.s.trim() === "Img35");
    ok(!!l65 && !!l35, "...and both dataset names written in the figure",
       [l65 && l65.s, l35 && l35.s].filter(Boolean).join(" / "));
    /* THE COLOURS ARE THE POINT: the dot is already drawn in the colour of the extent it is in, so
       a name in that same colour is what makes the dot readable without a key. A label in the
       wrong colour would be worse than no label. */
    const r65 = fig.rects.find(r => r.stroke === (l65 || {}).fill);
    const r35 = fig.rects.find(r => r.stroke === (l35 || {}).fill);
    ok(!!r65 && !!r35 && r65.stroke !== r35.stroke,
       "...each in the colour of the region it names", (l65 || {}).fill + " / " + (l35 || {}).fill);
    /* Opposite inside edges, because the two extents overlap and two labels on the same edge would
       collide inside the overlap for some cells and not others. */
    ok(!!r65 && Math.abs(l65.y - r65.y1) < 8 && !!r35 && Math.abs(l35.y - r35.y0) < 12,
       "...on opposite inside edges, so they cannot collide where the extents overlap",
       "Img65 at its bottom, Img35 at its top");
    /* The map must not have been squeezed to make room for the title. */
    const h = Number(String(fig.vb).split(/\s+/)[3]);
    ok(h === 155, "the viewBox grew by the title band rather than the map shrinking to fit it",
       "viewBox height " + h);
  }

  console.log("\nit draws this cell, and paints THIS cell's ids");
  {
    const got = await p.evaluate(() => window.__em);
    ok(got.draws.length === 1, "one section drawn, not one per render", got.draws.length);
    /* 18-20 um across, which is what he asked for after seeing 8.3: a soma AND what it sits among,
       rather than a soma filling the frame. Asserted as the micron figure, not as a mip index --
       the number is the requirement and the level is just how it is met. */
    ok(got.draws[0] && got.draws[0].slabOk === true,
       "...reaching past the section-only levels, which it must ask for explicitly", "slabOk");
    const umWide = await p.evaluate(() => {
      const cv = document.getElementById("emPlaneCv");
      return { um: Number((/([\d.]+)\s*\u00b5m/.exec(cv.title || "") || [])[1] || 0),
               bar: Number(cv.dataset.scaleUm || 0) };
    });
    ok(umWide.um >= 18 && umWide.um <= 20,
       "...showing 18-20 µm of tissue, the amount he asked for", umWide.um + " µm");
    /* 2026-09-18, Søren: "Just add a scalebar instead of writing how wide it is." A ROUND number,
       not a fixed fraction of the view: "30% of the width" would read 5.76 µm here and something
       else on the next cell, and a scale bar whose label needs two decimals is one nobody uses. */
    ok([0.5, 1, 2, 5, 10, 20, 50, 100].indexOf(umWide.bar) >= 0,
       "...with a scale bar of a round length drawn on it", umWide.bar + " µm bar");
    ok(umWide.bar > 0 && umWide.bar <= umWide.um / 3 + 0.001,
       "...no longer than a third of the view, so it reads as a scale and not a ruler",
       umWide.bar + " of " + umWide.um + " µm");
    ok(got.paints.length === 1, "the segmentation is painted over it", got.paints.length);
    /* 2026-09-18, Søren: "a bit too bright, can we turn it down by like 20%." 0.4 x 0.8. Asserted
       as the number because the overlay's job is to say WHERE the segmentation thinks the cell is;
       at 0.4 it was also deciding what the membranes underneath look like, and that is the tick
       beside it's job to turn off rather than the paint's job to prevent. */
    ok(got.paints[0] && Math.abs(got.paints[0].alpha - 0.32) < 1e-9,
       "...at 0.32, a fifth down from the 0.4 it was", got.paints[0] && got.paints[0].alpha);
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
    /* THE CAPTION NO LONGER SAYS THE WIDTH — the bar on the picture does (2026-09-18, Søren:
       "Just add a scalebar instead of writing how wide it is"). What is left on that line is only
       what a bar cannot say: still loading, switched off, went wrong. On an ordinary cell it is
       empty, which is a row of the panel back. */
    ok(!/µm|\u00b5m/.test(cap.said || ""),
       "...and the caption has stopped repeating the width in words", JSON.stringify(cap.said));
    ok(cap.rows === 1, "...still one line, because a second one is pure panel height", cap.rows);
    ok(/magenta/.test(cap.title) && /nm\/px/.test(cap.title),
       "...with the colour key and the resolution on the canvas itself, where they cost nothing",
       cap.title.slice(0, 60) + "…");
    /* IT SAYS WHAT ONE PLANE IS. At this level the volume averages two 40 nm sections, which is
       right for recognising a cell and wrong for tracing one — so the picture says so rather than
       letting a reader assume the pad and the panel show the same thing. */
    ok(/averages 2 of the 40 nm sections/.test(cap.title) && /tracing pad/.test(cap.title),
       "...and admits the plane is two sections averaged, not one section",
       /averages[^.]*\./.exec(cap.title) ? /averages[^.]*\./.exec(cap.title)[0] : cap.title);
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

  console.log("\nthe overlay has its own switch");
  {
    /* Søren: "there should also be an option to turn off the segmentation". Two questions, two
       ticks: the section costs a FETCH, the paint costs a LOOK — a cell filled solid magenta is the
       right picture for "is this the cell I think it is" and the wrong one for "what is the
       membrane doing there". So unticking the overlay must still draw the EM. */
    const off = await p.evaluate(async () => {
      window.__em.draws = []; window.__em.paints = [];
      const seg = document.getElementById("emPlaneSeg");
      seg.checked = false;
      seg.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      return { draws: window.__em.draws.length, paints: window.__em.paints.length,
               shown: document.getElementById("emPlaneCv").style.display !== "none",
               said: (document.getElementById("emPlaneSay") || {}).textContent || "",
               stored: localStorage.getItem("ujump_panel_emseg"),
               sectionStill: localStorage.getItem("ujump_panel_emplane") };
    });
    ok(off.draws === 1 && off.shown,
       "unticking the overlay still draws the EM — it is the paint that is off, not the section",
       off.draws + " draw, canvas " + (off.shown ? "shown" : "hidden"));
    ok(off.paints === 0, "...and nothing is painted over it", off.paints + " paints");
    ok(/segmentation off/.test(off.said), "...and the caption says which of the two is off", off.said);
    const barStill = await p.evaluate(() =>
      Number((document.getElementById("emPlaneCv") || { dataset: {} }).dataset.scaleUm || 0));
    ok(barStill > 0, "...and the scale bar is still on the section", barStill + " µm bar");
    ok(off.stored === "0" && off.sectionStill !== "0",
       "...remembered on its OWN key, so turning the overlay off does not turn the section off",
       "seg=" + off.stored + ", section=" + off.sectionStill);

    const back = await p.evaluate(async () => {
      window.__em.draws = []; window.__em.paints = [];
      const seg = document.getElementById("emPlaneSeg");
      seg.checked = true;
      seg.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      return { paints: window.__em.paints.length };
    });
    ok(back.paints === 1, "ticking it again paints", back.paints + " paint");
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
