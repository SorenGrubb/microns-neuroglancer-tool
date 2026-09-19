/* The per-dataset totals, at the two widths they are read at.                       2026-09-19

   Søren: *"This looked good on a phone, but looks bad on a computer screen."*

   What he sent a picture of:

       µJump — MICrONS minnie65 1488ηJump — H01 human cortex 5βJump — Alzheimer's vCLEM CA1 136

   `1488ηJump`. Eight datasets, each an `inline-block` with `min-width:150px`, joined with nothing.
   At 360 px every one of them is wider than the line, so each takes a line and it reads like a
   list — which is why it looked right on his phone. At 1000 px three fit on a line with no
   separator, and a name shorter than 150 px lands hard against the previous number.

   SO THE CHECK MEASURES GEOMETRY, not markup. The symptom is two boxes touching, and the only way
   to be sure they do not is to read their rectangles at a width where they share a line. Asserting
   the CSS would be asserting the fix rather than the property: `min-width` is not wrong, and a grid
   is not automatically right.

   Both widths. wjump_demo.html carries its own copy of the block and is edited alongside, but it
   is NOT driven here: it is the offline harness (orgcheck.js says so in as many words -- "it cannot
   render a chip AT ALL"), it has no escHtml of its own, and profileTotalsHtml throws there if ever
   called. Running it would be testing a page nobody opens. Its copy is compared as TEXT instead,
   which is the property that actually matters: the two must not drift.

   Run: node profiletotalscheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* His own numbers, from the screenshot, including the long name that any ellipsis would eat. */
const TOTALS = { combinedPoints: 4376, updated: "2026-09-19T16:57:28Z", perDataset: [
  { ds: "ujump", label: "µJump — MICrONS minnie65", points: 1488 },
  { ds: "hjump", label: "ηJump — H01 human cortex", points: 5 },
  { ds: "bjump", label: "βJump — Alzheimer's vCLEM CA1", points: 136 },
  { ds: "djump", label: "δJump — V1DD (Allen V1 Deep Dive)", points: 7 },
  { ds: "ljump", label: "λJump — Lee16 mouse V1 ssTEM", points: 112 },
  { ds: "wjump", label: "ωJump — OpenOrganelle FIB-SEM", points: 1987 },
  { ds: "pjump", label: "πJump — MICrONS pinky100 Layer 2/3", points: 71 },
  { ds: "xjump", label: "χJump — cb2 cerebellum (fragment assembly)", points: 570 }
]};

/* Render the block on its own and hand back one rectangle per dataset, plus the rectangle of the
   points inside each — which is what says whether the numbers line up or float. */
const MEASURE = (t) => {
  const host = document.createElement("div");
  host.id = "__totals";
  host.style.cssText = "padding:14px";
  host.innerHTML = profileTotalsHtml(t);
  document.body.insertBefore(host, document.body.firstChild);
  const wrap = host.querySelector("h3").nextElementSibling.nextElementSibling;
  const cells = [].slice.call(wrap.children).map(function(el){
    const r = el.getBoundingClientRect();
    const b = el.querySelector("b");
    const br = b ? b.getBoundingClientRect() : null;
    return { text: el.textContent, x: Math.round(r.left), y: Math.round(r.top),
             right: Math.round(r.right), w: Math.round(r.width),
             numRight: br ? Math.round(br.right) : null };
  });
  const out = { n: cells.length, cells: cells, text: host.textContent.replace(/\s+/g, " ") };
  host.remove();
  return out;
};

/* Cells that share a line, left to right. */
function rows(cells){
  const by = {};
  cells.forEach(function(c){ (by[c.y] = by[c.y] || []).push(c); });
  return Object.keys(by).map(function(k){
    return by[k].slice().sort(function(a, b){ return a.x - b.x; });
  });
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  for (const page of ["wjump.html"]){
    console.log("ωJump, at the two widths it is read at");
    for (const [what, width] of [["a phone", 380], ["a laptop", 1000]]){
      const p = await b.newPage({ viewport: { width: width, height: 800 } });
      const errors = [];
      p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
      await p.route("**script.google.com/**", r => r.abort());
      await p.route("**accounts.google.com/**", r => r.abort());
      await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
      await p.goto("file://" + page_(page));
      await p.waitForTimeout(3500);
      const got = await p.evaluate(MEASURE, TOTALS);

      ok(got.n === 8, "on " + what + ": all eight datasets are there, one box each", got.n);
      ok(TOTALS.perDataset.every(d => got.text.indexOf(d.label) >= 0),
         "...with their full names, none cut short",
         /fragment assembly/.test(got.text) ? "including the long one" : "the long one is MISSING");

      /* THE BUG ITSELF. Two boxes on one line with nothing between them is what produced
         "1488ηJump"; a gap of at least 8 px is the difference between a list and a run-on. */
      let worst = Infinity, where = "";
      rows(got.cells).forEach(function(r){
        for (let i = 0; i + 1 < r.length; i++){
          const gap = r[i + 1].x - r[i].right;
          if (gap < worst){ worst = gap; where = r[i].text.trim().slice(-12) + " | "
            + r[i + 1].text.trim().slice(0, 12); }
        }
      });
      const cols = Math.max.apply(null, rows(got.cells).map(function(r){ return r.length; }));
      if (cols > 1)
        ok(worst >= 8, "...and no two of them touch, which is what “1488ηJump” was",
           "narrowest gap " + worst + " px, at “" + where + "”");
      else
        ok(true, "...one per line, so nothing can touch anything", cols + " column");

      if (width < 500)
        ok(cols === 1, "a phone gets one column, which is the layout he already liked", cols);
      else
        ok(cols >= 2, "a laptop gets more than one, rather than a very long thin list", cols);

      /* The numbers line up down each column: that is the whole reason a grid beats floating
         inline-blocks, and it is a property of the rectangles rather than of the CSS. */
      const byCol = {};
      got.cells.forEach(function(c){ (byCol[c.x] = byCol[c.x] || []).push(c.numRight); });
      const ragged = Object.keys(byCol).filter(function(k){
        const v = byCol[k];
        return Math.max.apply(null, v) - Math.min.apply(null, v) > 1;
      });
      ok(ragged.length === 0,
         "...and every column's points share one right edge, so they can be read down the column",
         ragged.length + " ragged column(s) of " + Object.keys(byCol).length);

      ok(errors.length === 0, "...with no errors on the page",
         errors.length ? errors[0] : "none");
      await p.close();
    }
  }
  await b.close();

  /* THE HARNESS COPY, AS TEXT. The block lives in two files and the second one cannot be run, so
     the only thing worth asserting about it is that it says the same thing — a fix applied to one
     and not the other is how two pages start disagreeing about what a layout is. */
  console.log("\nand the offline harness carries the same block rather than the old one");
  {
    const fs = require("fs");
    const body = (f) => {
      const src = fs.readFileSync(page_(f), "utf8");
      const at = src.indexOf("function profileTotalsHtml(t){");
      return at < 0 ? "" : src.slice(at, src.indexOf("\n}", at));
    };
    const live = body("wjump.html"), demo = body("wjump_demo.html");
    ok(live.length > 0 && demo.length > 0, "both files have the function",
       live.length + " / " + demo.length + " chars");
    ok(live === demo, "...and they are the same block, character for character",
       live === demo ? "identical" : "they have drifted");
    /* The OLD MARKUP, not the words: the comment above the fix quotes "min-width:150px" while
       explaining what was wrong with it, so a bare search for that string finds the explanation
       and reports the bug it describes. */
    ok(/grid-template-columns/.test(demo)
       && !/display:inline-block;min-width:150px/.test(demo),
       "...which is the grid, not the inline-blocks that ran together");
  }

  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
