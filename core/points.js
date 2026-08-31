/* core/points.js -- how a points total is turned into something a person reads.

   2026-08-31, Søren, twice. First: "Please don't show such a ridiculous number, limit it to whole
   numbers" -- the chip read 1786.5000000000002 pts. That was fixed in core/gamify.js, which six
   of the seven tools load, so six of the seven were fixed. Then, with a screenshot of ωJump still
   reading 1785.5000000000002: "it should be corrected for all tools, also wJump."

   He is right, and the reason is worth writing down rather than just patching: ωJump does not load
   core/gamify.js. It has its own points chip -- its own combinedPoints(), its own levelName(), its
   own render -- because gamify.js also carries a dashboard, a leaderboard and browser storage that
   ωJump deliberately does not want. So "fix the shared module" fixed the module ωJump never used.
   Putting the formatter here, in a file small enough for every tool to load, is what makes "all
   tools" true rather than "all tools I remembered".

   WHY TWO FUNCTIONS, AND WHY THEY ARE NOT THE SAME FUNCTION.

   The points really are fractional. Code.gs awards 0.1 for a computed volume (REPORT_SHEETS_POINTS),
   so a total genuinely can be x.5 -- this was never an integer that got corrupted. What produces
   the long tail is binary floating point: 0.1 has no exact representation, a few hundred of them
   accumulate an error around 1e-13, and combinedPoints() then adds a live figure to a snapshot and
   subtracts a third, which is three more chances to expose it.

     exact(n)  rounds the ARITHMETIC to 2 dp -- finer than any award, so no real value moves, and
               the noise dies at the source. Without this the same digits resurface in the next
               thing that prints a total; the first version of this fix only touched the chip, and
               the leaderboard and dashboard would have kept showing them.
     text(n)   rounds to whole numbers for DISPLAY, which is what was asked for.

   They are separate on purpose. Level thresholds and "N pts to the next level" run on the exact
   value, so rounding for display can never nudge somebody over or under a level they have not
   actually reached. */
window.UJ = window.UJ || {};
UJ.points = (function(){
  function exact(n){ var v = Number(n); return isFinite(v) ? Math.round(v * 100) / 100 : 0; }
  function text(n){ var v = Number(n); return isFinite(v) ? String(Math.round(v)) : "0"; }
  return { exact: exact, text: text };
})();
