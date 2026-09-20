/* A rule that ships in core/ has to be styled on every page that loads it.         2026-09-20

   Found while planning the port of this week's µJump work to the other tools:
   `.chist-panel>summary>h4{margin:0}` was added to ujump.html, and the fold it styles was added to
   `core/panel.js` — which δJump, πJump, λJump and βJump all load. So four tools were rendering the
   new folding cell history *unstyled* from the moment it was pushed: the <h4> keeps its 8px bottom
   margin inside the <summary> and shoves the rotating triangle off the heading's baseline. The
   feature worked and looked like a mistake.

   THIS IS THE SHAPE OF THE WHOLE PORT, IN ONE LINE. Anything in core/ reaches five tools the
   instant it is pushed; the CSS it needs does not, because every page carries its own copy of the
   stylesheet. So this checks the pairing rather than the line: a page that carries the history
   panel must carry the rules that make it legible.

   Static, on purpose — no browser. The question is whether two files agree, and reading them is
   the whole of it.

   Run: node chistfoldcheck.js */
const fs = require("fs");
const path = require("path");
const page = require("./pagepath.js");

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };

const PAGES = ["ujump.html", "djump.html", "pjump.html", "ljump.html", "hjump.html",
               "bjump.html", "index.html"];
const read = f => fs.readFileSync(page(f), "utf8");

/* The fold itself lives in core/panel.js. If it ever stops being a <details>, these rules stop
   being needed and this check should be the thing that says so rather than quietly passing. */
const panel = fs.readFileSync(path.join(page.dir(), "core", "panel.js"), "utf8");
ok("core/panel.js renders the history as a fold",
   /<details class="chist-panel/.test(panel),
   "if this goes, the rules below are dead weight and this check is the reminder");

console.log("\n--- every page with the history panel can style its fold ---");
PAGES.forEach(f => {
  const s = read(f);
  if (!/\.chist-panel\{/.test(s)) return;            // index.html has no cell panel
  /* ηJump carries the .chist-* block — it was built from µJump's chrome — but renders no history
     at all: it does not load core/panel.js, and `chist-` appears nowhere in it outside the
     stylesheet. Asserting the pairing there would encode "ηJump has a cell history" as a fact.
     When it joins the shared stack this exemption is the thing that should fail. */
  if (!/<script src="core\/panel\.js">/.test(s)){
    ok(f + ": (no core/panel.js — renders no history, so nothing to pair)", true,
       "remove this exemption when it joins the shared stack");
    return;
  }
  ok(f + ": the <h4> in the summary has its margin removed",
     /\.chist-panel>summary>h4\{margin:0\}/.test(s),
     "without it the triangle sits off the heading's baseline");
  /* The triangle and the summary typography come from .rv-panel, which the fold also asks for. */
  ok(f + ": ...and .rv-panel supplies the triangle", /\.rv-panel summary\{/.test(s),
     "the fold is <details class=\"chist-panel rv-panel\">");
});

const bad = R.filter(x => !x).length;
console.log(bad ? "\n*** " + bad + " OF " + R.length + " FAILED ***"
                : "\nRESULT: ALL " + R.length + " CHECKS PASSED");
process.exit(bad ? 1 : 0);
