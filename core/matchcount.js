/* core/matchcount.js -- what "Preview matches" says once it has some.

   2026-09-09, Søren: "For all of the tools, it would be helpful if the preview matches told me
   how many matches there are after i click it. I noticed that hJump and maybe also bJump doesn't
   do it... Please make it consistent."

   Two of the eight said it in a different place, and the two he named said it in a place he never
   looked. What each tool did before this file:

     µJump  πJump  δJump   on the button:  "1,234 matching cells found"
     χJump               on the button:  "Preview matches — 1,234 cells"
     βJump  λJump         in #filterStatus, a line of text under the panel
     ηJump                in #filterStatus, phrased as a percentage of the volume

   The count belongs ON THE BUTTON -- that was Søren's own call when µJump got it ("it's the
   result of pressing that button, so it belongs there"), and it is the only element all seven
   filter panels share. A line of text below a row of buttons is a line people do not read; that
   is the whole content of his report.

   WHY A FILE RATHER THAN SEVEN EDITS. core/points.js is here for the same reason and says so: a
   fix made in one tool's own copy reaches that tool only, and the next screenshot is the next
   tool still doing the old thing. One wording, one place, and "all of them" is true by
   construction rather than by memory.

   The noun is the caller's, because it is the caller's data: βJump and λJump match NUCLEI and say
   so, everything else matches cells. Form is what has to be consistent, not vocabulary.

   Pages that also keep their own status line keep it -- ηJump's "12 of 220 cells match (5.5%)" is
   worth having and says something the button cannot fit. This is about the button being blank.
*/
window.UJ = window.UJ || {};
UJ.matchcount = (function(){
  var IDLE = "Preview matches";
  var CELLS = { one: "cell", many: "cells" };

  /* The label for n matches, and nothing else -- so a page with an unusual button can build the
     string without inheriting the DOM lookup, and so the wording can be tested on its own. */
  function label(n, noun){
    noun = noun || CELLS;
    var many = noun.many || (noun.one + "s");
    if (!n) return "No matching " + many + " — adjust filters";
    return Number(n).toLocaleString() + " matching "
         + (n === 1 ? noun.one : many) + " found";
  }

  function button(opts){
    var id = (opts && opts.buttonId) || "filterRun";
    return document.getElementById(id);
  }

  /* Says what was found. `noun` is {one, many}; omit it for cells. */
  function set(n, opts){
    var b = button(opts);
    if (!b) return null;
    b.textContent = label(n, opts && opts.noun);
    b.title = n ? "Click again after changing a filter to refresh this count"
                : "Nothing matched these filters";
    return b;
  }

  /* Back to "Preview matches" -- on load, and whenever a filter change makes the last count a
     claim about a query nobody is running any more. A stale number is worse than none: it is the
     same button saying the same thing about different filters. */
  function idle(opts){
    var b = button(opts);
    if (!b) return null;
    b.textContent = (opts && opts.idleText) || IDLE;
    b.title = "Filters changed since the last preview — click to refresh the match count";
    return b;
  }

  /* While it runs. Long filters (µJump's report fetch, βJump's mesh proximity) take a second or
     two, and a button that does not change is a button people click twice. */
  function busy(text, opts){
    var b = button(opts);
    if (!b) return null;
    b.textContent = text || "Filtering…";
    return b;
  }

  return { IDLE: IDLE, label: label, set: set, idle: idle, busy: busy };
})();
