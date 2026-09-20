/* Three things that fold, and which of them starts open.                            2026-09-20

   Søren: *"We should also be able to collapse the cell history and the cell identity cards, but by
   default they should be expanded."* Asked which part of the identity card, he chose **everything
   below the name**. And, separately: *"The bulk organelle annotation should be moved into the log
   an organelle and be collapsed by default there."*

   So the three are not the same rule, and the differences are the point:

     - the CELL HISTORY and the IDENTITY CARD start **open** and remember what he last did with
       them, because collapsing something on one cell and finding it open on the next is how a
       person learns not to bother;
     - the BULK PASTE starts **shut**, every time, because it is a tool reached for occasionally
       and a form that has quietly regrown a 61-item dropdown three cells later is a surprise.

   THE TRAP THIS CHECKS FOR BY NAME: the identity card's summary holds the cell's name, the ↗ to
   Neuroglancer and the favourite star. Inside a <summary>, a click on any of those both does its
   own job AND toggles the fold. The card swallows the toggle for anything clickable, so only bare
   space folds it.

   Run: node cellfoldcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A cell panel as showNucleus leaves it: a tag, a headline with the name and its furniture, and
   the sections underneath. Built by hand because what is under test is the wrapping, not the
   thirty branches that can produce the thing being wrapped. */
const PANEL = `(function(open){
  if (open !== undefined) window.__cellCardOpen = open;
  var p = document.getElementById("cellfoldprobe");
  if (p) p.remove();
  document.body.insertAdjacentHTML("beforeend", '<div class="nuc" id="cellfoldprobe"></div>');
  p = document.getElementById("cellfoldprobe");
  p.innerHTML = '<span class="tag">verified identification</span>'
    + '<div class="celltype"><a href="https://example.invalid/ngl" id="probeArrow">Microglia \\u2197</a>'
    + '<span class="fav" id="probeStar">\\u2606</span></div>'
    + '<div class="meta" id="probeIds">nucleus 521491</div>'
    + '<div id="probeNeigh">3 nearest neighbouring cells</div>';
  cellCardFold(p);
  return true;
})`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("the identity card folds below its name");
  {
    const got = await p.evaluate(src => {
      // eslint-disable-line no-eval
      eval(src)(undefined);
      const probe = document.getElementById("cellfoldprobe");
      const det = probe.querySelector("details.cellfold");
      const sum = det && det.querySelector("summary");
      return { has: !!det, open: det && det.open,
               summaryHasName: !!(sum && /Microglia/.test(sum.textContent)),
               summaryHasTag: !!(sum && sum.querySelector(".tag")),
               summaryHasArrow: !!(sum && sum.querySelector("#probeArrow")),
               summaryHasStar: !!(sum && sum.querySelector("#probeStar")),
               /* The body is what must be foldable: ids, neighbours, everything after the name. */
               bodyHasIds: !!(det && det.querySelector("div:not(summary) #probeIds")),
               idsInSummary: !!(sum && sum.querySelector("#probeIds")),
               bodyHasNeigh: !!(det && det.querySelector("#probeNeigh")) };
    }, PANEL);
    ok(got.has, "the card is wrapped in a fold", got.has);
    ok(got.open === true, "...and it starts OPEN, which is what he asked for", got.open);
    ok(got.summaryHasTag && got.summaryHasName,
       "the badge and the name are the part you click",
       got.summaryHasTag + "/" + got.summaryHasName);
    ok(got.summaryHasArrow && got.summaryHasStar,
       "...with the arrow and the star, so they are reachable when it is shut",
       got.summaryHasArrow + "/" + got.summaryHasStar);
    ok(!got.idsInSummary && got.bodyHasIds && got.bodyHasNeigh,
       "...and everything below the name is inside the fold",
       "ids in summary: " + got.idsInSummary);
  }

  console.log("\nclicking the arrow or the star does not fold the card");
  {
    /* The trap. Inside a <summary>, a click on a link both follows it and toggles — so opening the
       viewer would collapse the cell you were reading. */
    const got = await p.evaluate(src => {
      // eslint-disable-line no-eval
      eval(src)(true);
      const det = document.getElementById("cellfoldprobe").querySelector("details.cellfold");
      const was = det.open;
      const ev = () => new MouseEvent("click", { bubbles: true, cancelable: true });
      const arrowEv = ev(); document.getElementById("probeArrow").dispatchEvent(arrowEv);
      const starEv = ev(); document.getElementById("probeStar").dispatchEvent(starEv);
      /* Bare space in the summary still folds it: that is the whole affordance. */
      const sum = det.querySelector("summary");
      const bareEv = ev(); sum.dispatchEvent(bareEv);
      return { was: was, arrowStopped: arrowEv.defaultPrevented,
               starStopped: starEv.defaultPrevented, bareStopped: bareEv.defaultPrevented };
    }, PANEL);
    ok(got.arrowStopped === true, "the \u2197 keeps the card open", got.arrowStopped);
    ok(got.starStopped === true, "...and so does the favourite star", got.starStopped);
    ok(got.bareStopped === false, "...while bare space in the header still folds it",
       got.bareStopped);
  }

  console.log("\nand it remembers, so it does not spring open on the next cell");
  {
    const got = await p.evaluate(src => {
      // eslint-disable-line no-eval
      eval(src)(undefined);
      const det = document.getElementById("cellfoldprobe").querySelector("details.cellfold");
      det.open = false;
      det.dispatchEvent(new Event("toggle"));
      const remembered = window.__cellCardOpen;
      eval(src)(undefined);                                  // the next cell
      const next = document.getElementById("cellfoldprobe").querySelector("details.cellfold");
      return { remembered: remembered, nextOpen: next.open };
    }, PANEL);
    ok(got.remembered === false, "closing it is written down", got.remembered);
    ok(got.nextOpen === false, "...and the next cell opens it closed", got.nextOpen);
  }

  console.log("\nthe cell history folds too, and starts open");
  {
    const got = await p.evaluate(() => {
      window.__histOpen = undefined;
      var old = document.getElementById("classHistoryPanel"); if (old) old.remove();
      document.body.insertAdjacentHTML("beforeend", '<div id="classHistoryPanel"></div>');
      renderCellHistory([
        { kind: "annotation", type: "organelle_location", identified: "", status: "recorded",
          reporterName: "Søren Grubb", timestamp: "2026-09-19T21:31:00.000Z",
          note: "Volumetric centre of the outlined “Lysosome”" },
        { kind: "annotation", type: "organelle_location", identified: "", status: "recorded",
          reporterName: "Søren Grubb", timestamp: "2026-09-19T21:40:00.000Z", note: "" }
      ], "521491", "", [1, 2, 3]);
      const el = document.getElementById("classHistoryPanel");
      const det = el.querySelector("details.chist-panel");
      const sum = det && det.querySelector("summary");
      return { has: !!det, open: det && det.open,
               head: sum ? sum.textContent.trim() : "",
               rows: det ? det.querySelectorAll(".chist-row").length : -1,
               rowsInSummary: sum ? sum.querySelectorAll(".chist-row").length : -1 };
    });
    ok(got.has, "the history is a fold", got.has);
    ok(got.open === true, "...open to begin with", got.open);
    ok(/^Cell history \(2\)$/.test(got.head),
       "...under the heading it always had, with its count", JSON.stringify(got.head));
    ok(got.rows === 2 && got.rowsInSummary === 0,
       "...and the entries are inside it, not in the header",
       got.rows + " rows, " + got.rowsInSummary + " in the summary");
  }
  {
    const got = await p.evaluate(() => {
      window.__histOpen = false;
      renderCellHistory([{ kind: "annotation", type: "organelle_location", status: "recorded",
                           reporterName: "S", timestamp: "2026-09-19T21:31:00.000Z" }],
                        "521491", "", [1, 2, 3]);
      const det = document.getElementById("classHistoryPanel").querySelector("details");
      return det && det.open;
    });
    ok(got === false, "...and it remembers being closed, like the card above it", got);
  }

  console.log("\nthe bulk paste is folded, and SHUT every time");
  {
    const got = await p.evaluate(() => {
      const d = document.createElement("div");
      d.innerHTML = organellePasteHtml();
      const det = d.querySelector("details.organ-paste-box");
      const sum = det && det.querySelector("summary");
      const again = document.createElement("div");
      again.innerHTML = organellePasteHtml();
      return { has: !!det, open: det && det.open,
               head: sum ? sum.textContent.trim() : "",
               /* Everything it does must still be in there: the wiring looks these up by id. */
               kind: !!(det && det.querySelector("#organPasteKind")),
               link: !!(det && det.querySelector("#organPasteLink")),
               go: !!(det && det.querySelector("#organPasteGo")),
               note: !!(det && det.querySelector("#organPasteNote")),
               options: det ? det.querySelectorAll("#organPasteKind option").length : -1,
               secondOpen: again.querySelector("details").open };
    });
    ok(got.has, "it is a fold", got.has);
    ok(got.open === false, "...and it is SHUT, so it stops shouting over the rows", got.open);
    ok(/paste a link, get a row per marker/i.test(got.head),
       "...saying what it is for, since that is all you can see of it now",
       JSON.stringify(got.head));
    ok(got.kind && got.link && got.go && got.note,
       "everything it needs is still inside it, under the same ids the wiring uses",
       [got.kind, got.link, got.go, got.note].join("/"));
    ok(got.options === 61, "...including the whole kind list", got.options);
    ok(got.secondOpen === false,
       "...and it is shut the next time too — this one does not remember", got.secondOpen);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
