/* A rule that ships in core/ has to be styled on every page that loads it.         2026-09-20

   Found while planning the port of this week's µJump work to the other tools:
   `.chist-panel>summary>h4{margin:0}` was added to ujump.html, and the fold it styles was added to
   `core/panel.js` — which δJump, πJump, λJump and βJump all load. So four tools were rendering the
   new folding cell history *unstyled* from the moment it was pushed: the <h4> keeps its 8px bottom
   margin inside the <summary> and shoves the rotating triangle off the heading's baseline. The
   feature worked and looked like a mistake.

   THIS IS THE SHAPE OF THE WHOLE PORT, IN ONE LINE. Anything in core/ reaches six tools the
   instant it is pushed; the CSS it needs does not, because every page carries its own copy of the
   stylesheet. So this checks the pairing rather than the line: a page that carries the history
   panel must carry the rules that make it legible.

   THE PAIRING RUNS BOTH WAYS, since 2026-09-20. ηJump used to be exempted here: it carried the
   whole .chist-* block, inherited from µJump's chrome, and rendered no history at all — it did not
   load core/panel.js, and `chist-` appeared nowhere in it outside the stylesheet. It joined that
   afternoon (src/hjump_gets_a_cell_history.py), so the exemption is gone and replaced by its
   opposite: a page carrying these rules must be a page that can render the thing they style.
   Styling for a panel that does not exist is not harmless — it is how a page comes to look
   finished from the inside while showing nothing.

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
  /* THE OTHER DIRECTION. These rules style a panel only core/panel.js draws, so a page carrying
     them and not loading it is carrying dead CSS for a feature its users cannot see — which is
     exactly the state ηJump sat in for a month. */
  ok(f + ": carries these rules AND the file that renders what they style",
     /<script src="core\/panel\.js">/.test(s),
     "without it these are styling for a panel the page never draws");
  ok(f + ": the <h4> in the summary has its margin removed",
     /\.chist-panel>summary>h4\{margin:0\}/.test(s),
     "without it the triangle sits off the heading's baseline");
  /* The triangle and the summary typography come from .rv-panel, which the fold also asks for. */
  ok(f + ": ...and .rv-panel supplies the triangle", /\.rv-panel summary\{/.test(s),
     "the fold is <details class=\"chist-panel rv-panel\">");
  /* ── AND THE BUTTON IN IT CAN ACTUALLY RESTORE ──────────────  2026-09-20
     core/panel.js draws "Restore this version" inside this panel and calls restoreClassification()
     behind a `typeof` guard. On a page without one the button asks "Restore the cell to this
     earlier classification?", the user says yes, it disables itself, prints "Submitting…" — and
     submits nothing. ηJump sat in that state because it never loaded core/report.js, which is
     where that function lives.

     THE SAME PAIRING THIS FILE IS ABOUT, one layer down: a page that draws the panel must carry
     the file that makes its controls work, not only the CSS that makes it legible. Checked as the
     script tag, because the function is a plain global and this check does not open a browser. */
  ok(f + ": ...and loads the file that makes its Restore button work",
     /<script src="core\/report\.js">/.test(s),
     "core/report.js defines restoreClassification; without it the button confirms and does nothing");
});

const bad = R.filter(x => !x).length;
console.log(bad ? "\n*** " + bad + " OF " + R.length + " FAILED ***"
                : "\nRESULT: ALL " + R.length + " CHECKS PASSED");
process.exit(bad ? 1 : 0);
