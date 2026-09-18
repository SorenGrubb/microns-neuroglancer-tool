/* The Jump card gave back two lines, and kept working.                            2026-09-18

   Søren: *"these layer options could go under the advanced viewer, just beneath the viewer"* and
   *"This could be a mouse-over for the random button instead of taking space."*

   THE THING THAT WILL BE WRONG IF ANYTHING IS whether the layer ticks still count. They moved
   inside a <details> that is CLOSED by default, and a collapsed disclosure hides its contents from
   the eye but not from the DOM — getElementById reaches in exactly as before. That is easy to
   believe and worth proving, because the failure would be silent and total: every Neuroglancer link
   the page writes reads #em/#seg/#nuc, so if a closed <details> broke those reads, every link would
   quietly lose its EM layer and nobody would know until they opened one.

   So this builds a real viewer state with Advanced shut, unticks a box with Advanced still shut,
   and builds another.

   Run: node jumplayoutcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => d.accept().catch(() => {}));
  for (const u of ["**script.google.com/**", "**accounts.google.com/**",
                   "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**bossdb-open-data.s3.amazonaws.com/**"])
    await p.route(u, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("the layer ticks are under the viewer, inside Advanced");
  {
    const where = await p.evaluate(() => {
      const em = document.getElementById("em");
      const sel = document.getElementById("viewer");
      const det = em && em.closest("details");
      return {
        inDetails: !!det,
        sameDetailsAsViewer: !!(det && sel && sel.closest("details") === det),
        summary: det ? (det.querySelector("summary") || {}).textContent : "",
        openByDefault: det ? det.open : null,
        /* "just beneath the viewer": after the select, before the custom-base-state label. */
        afterViewer: !!(sel && em &&
          (sel.compareDocumentPosition(em) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
        beforeBase: !!(em && document.getElementById("base") &&
          (em.compareDocumentPosition(document.getElementById("base"))
            & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
        /* "Takes no room" is a claim about the CARD, so measure the card. Neither offsetParent nor
           the tick's own rect is the test -- a closed <details> in current Chromium hides its
           contents with content-visibility, which leaves both of those looking laid out. What is
           true either way is that opening the disclosure makes the panel taller by the height of
           what is inside it, and that height is what used to be spent unconditionally. */
        detClosedH: Math.round(det.getBoundingClientRect().height)
      };
    });
    ok(where.inDetails && where.sameDetailsAsViewer,
       "the three ticks are inside the same disclosure as the viewer", where.summary.trim());
    ok(where.afterViewer && where.beforeBase,
       "...just beneath the viewer select, above the custom base state");
    ok(where.openByDefault === false, "...which is closed until somebody opens it");
    const grew = await p.evaluate(() => {
      const det = document.getElementById("em").closest("details");
      const before = det.getBoundingClientRect().height;
      det.open = true;
      const after = det.getBoundingClientRect().height;
      det.open = false;
      return { before: Math.round(before), after: Math.round(after) };
    });
    ok(grew.after - grew.before > 60,
       "...so the room they need is only spent when somebody opens it",
       grew.before + " px shut, " + grew.after + " px open");
  }

  console.log("\nand they still count, with the disclosure shut");
  {
    /* THE WHOLE POINT. buildState() reads these three by id; if a closed <details> broke that,
       every Neuroglancer link this page writes would silently lose its EM layer. */
    const built = await p.evaluate(() => {
      const det = document.getElementById("em").closest("details");
      det.open = false;
      let i = -1;
      for (let k = 0; k < NID.length; k++) if (rootId(k)) { i = k; break; }
      jumpToVoxel(NX[i], NY[i], NZ[i]);
      const st = buildState([NX[i], NY[i], NZ[i]]);
      const names = (st.layers || []).map(l => String(l.name || ""));
      return { closed: !det.open, names,
               em: names.some(n => /^EM/.test(n)),
               read: document.getElementById("em").checked };
    });
    ok(built.closed && built.read,
       "the tick reads as checked through a closed disclosure", "checked");
    ok(built.em, "...and the state it builds still has its EM layer",
       built.names.join(", ").slice(0, 60));

    const off = await p.evaluate(() => {
      const det = document.getElementById("em").closest("details");
      det.open = false;
      document.getElementById("em").checked = false;
      let i = -1;
      for (let k = 0; k < NID.length; k++) if (rootId(k)) { i = k; break; }
      const st = buildState([NX[i], NY[i], NZ[i]]);
      const names = (st.layers || []).map(l => String(l.name || ""));
      document.getElementById("em").checked = true;
      return { em: names.some(n => /^EM/.test(n)), names };
    });
    ok(!off.em,
       "...and unticking it through a closed disclosure really drops the layer — the control is "
       + "live, not decorative", off.names.join(", ").slice(0, 60) || "no layers");
  }

  console.log("\nthe random-example sentence is on the button");
  {
    const t = await p.evaluate(() => {
      const btn = document.getElementById("randomOfType");
      const panel = document.getElementById("randomCellPanel");
      const hints = [].slice.call(panel.querySelectorAll("p.hint"))
        .map(e => (e.textContent || "").trim());
      return { title: btn.title || "",
               stillOnPage: hints.some(h => /Great for learning what a cell type/.test(h)),
               hints: hints.length };
    });
    ok(/Great for learning what a cell type/.test(t.title),
       "the button carries it as a tooltip", t.title.slice(0, 50) + "…");
    ok(!t.stillOnPage, "...and it is not also a paragraph taking room", t.hints + " hints left");
  }

  console.log("\nand the coordinate row says why you would use it");
  {
    /* 2026-09-18, Søren: the label described the PIPELINE (jump, nearest cell, neighbours, two
       meshes) -- all of which is visible the moment it happens -- and the paste trick was a line of
       its own. A label answers "why would I type here"; a fact about one box belongs on that box. */
    const c = await p.evaluate(() => {
      const x = document.getElementById("x");
      const lab = x.closest(".row").previousElementSibling;
      const card = x.closest(".card") || document.body;
      const hints = [].slice.call(card.querySelectorAll("p.hint"))
        .map(e => (e.textContent || "").trim());
      return { label: (lab && lab.textContent || "").trim(),
               title: x.title || "",
               yTitle: document.getElementById("y").title || "",
               orphan: hints.some(h => /^Or paste/.test(h)) };
    });
    ok(/paste one from Neuroglancer/.test(c.label) && /cell type/.test(c.label),
       "the label says what pasting a coordinate gets you", c.label);
    ok(!/nearest cell|neighbours|in 3D/.test(c.label),
       "...and no longer lists what the page will show you anyway");
    ok(/splits itself/.test(c.title) && !c.yTitle,
       "the paste trick is on the x box, which is the box it is about",
       c.title.slice(0, 44) + "…");
    ok(!c.orphan, "...and not also a line under the row");
  }

  console.log("\nand the specialist line is in the badge that already says where the name came from");
  {
    /* 2026-09-18, Søren: "This is very specific information for advanced users ... Could that be a
       part of the mouseover for the grey MICrONS prediction next to the name?" The m-type IS the
       MICrONS prediction at a finer grain, so a cell WITH one must carry it on that label. */
    const m = await p.evaluate(async () => {
      /* A predicted neuron, which is what has an Allen m-type at all. */
      let i = -1;
      for (let k = 0; k < NID.length; k++){
        if (!rootId(k)) continue;
        const p2 = [NX[k], NY[k], NZ[k]];
        const mt = mtypeInfo(p2[0], p2[1], p2[2]);
        if (mt && mt.name){ i = k; break; }
      }
      if (i < 0) return { skip: true };
      jumpToVoxel(NX[i], NY[i], NZ[i]);
      await new Promise(r => setTimeout(r, 600));
      const head = document.getElementById("ctHeadline");
      const small = head && head.querySelector("small");
      const panel = document.getElementById("nucpanel");
      const metas = [].slice.call(panel.querySelectorAll(".meta"))
        .map(e => (e.textContent || "").trim());
      return { small: small ? small.textContent.trim() : "", title: (small && small.title) || "",
               stillALine: metas.some(t => /^Allen m-type/.test(t)),
               warnKept: metas.some(t => /Broad class and fine m-type disagree/.test(t)),
               voxelWording: metas.some(t => /nearest nucleus at voxel/.test(t)),
               nearest: metas.find(t => /nearest nucleus/.test(t)) || "" };
    });
    ok(m.skip || /Allen m-type/.test(m.title),
       "the grey prediction label's tooltip carries the fine subtype",
       m.skip ? "no predicted m-type in this build" : m.title.slice(0, 46) + "…");
    ok(m.skip || !m.stillALine, "...and it is no longer a line under the name");
    /* The DISAGREEMENT warning is not specialist trivia — it is the page saying do not trust the
       headline — so it must not have been swept up with the line above it. */
    ok(m.skip || !/disagree/.test(m.title) || m.warnKept,
       "...while a broad/fine disagreement would still be a visible warning, not a tooltip");
    ok(m.skip || !m.voxelWording, "the nearest-nucleus line no longer says 'at voxel'",
       m.nearest.slice(0, 50));
  }

  console.log("\nthe neighbours fold, and the jump is where it is about");
  {
    const ord = await p.evaluate(async () => {
      let i = -1;
      for (let k = 0; k < NID.length; k++) if (rootId(k)) { i = k; break; }
      jumpToVoxel(NX[i], NY[i], NZ[i]);
      await new Promise(r => setTimeout(r, 600));
      const panel = document.getElementById("nucpanel");
      const det = panel.querySelector("details.neigh");
      const conn = document.getElementById("connPanel");
      const nearest = [].slice.call(panel.querySelectorAll(".meta"))
        .find(e => /nearest nucleus/.test(e.textContent || ""));
      const jump = panel.querySelector("button.jump");
      return {
        folded: !!det, open: det ? det.open : null,
        summary: det ? (det.querySelector("summary") || {}).textContent.trim() : "",
        rows: det ? det.querySelectorAll(".nrow").length : 0,
        /* "just above the connectivity" */
        beforeConn: !!(det && conn &&
          (det.compareDocumentPosition(conn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
        afterVote: !!(det && document.getElementById("rootIdPanel") &&
          (document.getElementById("rootIdPanel").compareDocumentPosition(det)
            & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
        /* The jump button and the nearest line are asserted in the next block -- they left this
           panel for the card under the coordinate boxes on 2026-09-18. */
        strayJump: !!jump, strayNearest: !!nearest,
        tt: det ? getComputedStyle(det.querySelector("summary")).textTransform : "",
        shouts: det ? getComputedStyle(det.querySelector("summary")).textTransform === "uppercase"
                    : true,
        cls: det ? det.className : "",
        /* The two sections below it are the reference: same classes, therefore same look. */
        sameAsSiblings: (() => {
          const sib = panel.querySelector("#cellContactsPanel details, #tripartitePanel details");
          if (!sib || !det) return false;
          const a = det.className.split(/\s+/).sort().join(" ");
          const b2 = sib.className.split(/\s+/).sort().join(" ");
          return a === b2;
        })(),
        connRule: conn ? getComputedStyle(conn).borderTopWidth : "",
        ruleBelow: !!conn && parseFloat(getComputedStyle(conn).borderTopWidth) > 0
      };
    });
    ok(ord.folded && ord.open === false,
       "the three neighbours are a disclosure, closed", ord.summary);
    /* 2026-09-18, Søren: "I Don't think the 3 nearest neighboring cells should be all caps. Also,
       there should be a grey line below it like the rest." Both came from hand-styling this summary
       to keep the look of the <h4> it replaced, in a row of sentence-case labels. Asserted against
       the SIBLING sections rather than against literal values: what has to be true is that it looks
       like them, and a hardcoded font-size would pass while they drifted. */
    ok(!ord.shouts, "...not shouting at a row of sentence-case labels",
       "text-transform: " + ord.tt);
    ok(ord.sameAsSiblings,
       "...styled by the same two classes the sections around it use", ord.cls);
    ok(ord.ruleBelow,
       "...and Connectivity carries the rule that separates it from them, like every other section",
       ord.connRule);
    ok(ord.rows === 3, "...with the three rows still inside it", ord.rows + " rows");
    ok(ord.beforeConn && ord.afterVote,
       "...sitting between the propose/vote panel and Connectivity");
    ok(!ord.strayJump && !ord.strayNearest,
       "...and neither the jump button nor the nearest line is left in this panel");
  }

  console.log("\nthe lookup's answer is under the boxes, and it does not go stale");
  {
    const line = await p.evaluate(async () => {
      let i = -1;
      for (let k = 0; k < NID.length; k++) if (rootId(k)) { i = k; break; }
      jumpToVoxel(NX[i], NY[i], NZ[i]);
      await new Promise(r => setTimeout(r, 600));
      const el = document.getElementById("nearestLine");
      const row = document.getElementById("x").closest(".row");
      const panel = document.getElementById("nucpanel");
      return { text: (el.textContent || "").trim(),
               shown: el.style.display !== "none",
               /* "just below the coordinate window" */
               afterRow: (row.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
               outsidePanel: !panel.contains(el),
               inPanelStill: /nearest nucleus/.test(panel.textContent || ""),
               hasButton: !!el.querySelector("button.jump"),
               lineH: Math.round(el.getBoundingClientRect().height),
               btnH: (() => { const bt = el.querySelector("button.jump");
                              return bt ? Math.round(bt.getBoundingClientRect().height) : 0; })() };
    });
    ok(line.shown && /nearest nucleus/.test(line.text),
       "the lookup's answer appears under the coordinate boxes", line.text.slice(0, 50));
    ok(line.afterRow && line.outsidePanel,
       "...directly below the row it answers, on the card rather than in the panel");
    ok(!line.inPanelStill, "...and not also still inside the identity panel");
    ok(line.hasButton, "...with the jump button on it");
    /* "MAKE IT LOOK NICE" is a size claim: a full-size .jump button dropped into a 12 px
       monospace line would set that line's height and read as a mistake. */
    ok(line.lineH <= 26, "...small enough not to set the height of the line it sits on",
       "line " + line.lineH + " px, button " + line.btnH + " px");

    /* THE HAZARD. The line is outside the panel now, so replacing the panel does not clear it —
       and a panel with no nearest MICrONS nucleus leaving the old text up would have the card
       state a nucleus id and a distance for a cell that is no longer on screen. */
    const stale = await p.evaluate(async () => {
      const panel = document.getElementById("nucpanel");
      renderUserReportedCell({ pos: [NX[0], NY[0], NZ[0]], dist: 0, identified: "Astrocyte",
                               reporterName: "Someone", rootId: "1", nucRootId: "2" }, panel);
      await new Promise(r => setTimeout(r, 300));
      const a = document.getElementById("nearestLine");
      const afterUser = { txt: (a.textContent || "").trim(), shown: a.style.display !== "none" };
      renderMergedSubCell({ pos: [NX[0], NY[0], NZ[0]], dist: 0, identified: "Pericyte",
                            parentNucleusId: String(NID[0]), subRootId: "3" }, panel);
      await new Promise(r => setTimeout(r, 300));
      const b2 = document.getElementById("nearestLine");
      return { afterUser, afterMerged: { txt: (b2.textContent || "").trim(),
                                         shown: b2.style.display !== "none" } };
    });
    ok(!stale.afterUser.shown && !stale.afterUser.txt,
       "a user-reported cell clears it — it has no nucleus detection to be nearest to",
       stale.afterUser.txt || "empty");
    ok(!stale.afterMerged.shown && !stale.afterMerged.txt,
       "...and so does a merged sub-cell, whose nucleus is the fused detection",
       stale.afterMerged.txt || "empty");
  }

  console.log("\nand one word is gone");
  {
    const also = await p.evaluate(() => {
      const t = document.body.textContent || "";
      return { also: /Also log an organelle/.test(t), plain: /Log an organelle here/.test(t) };
    });
    /* Only rendered panels carry it, so a page with none on screen proves nothing either way —
       what must never be true is that the old wording is anywhere. */
    ok(!also.also, "nothing says \"Also log an organelle\" any more");
  }

  ok(errors.length === 0, "no script errors", errors.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
