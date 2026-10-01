# -*- coding: utf-8 -*-
u"""A cell is re-measured when you add to it.                                             2026-10-01

Søren, having run the backfill: *"I got them now, do I have to do this constantly or does it do it
every time a lysosome is submitted? If so, we should hide this again."*

Half of it was automatic, and the half that was not is the half that matters. A tracing has carried
its own measurements since yesterday. Its SIBLINGS have not: the three relational numbers -- the
nearest organelle, its surface distance, its centroid distance -- are about a SET, and adding a
lysosome changes the set. Every other organelle in that cell kept the answer it had, with only
`measuredSiblings` to show that the answer was from a smaller world.

Nothing in the backfill button fixed that. It was a migration for 68 rows written before the
columns existed, and it had been pressed, so it was answering a question nobody would ask again.

SO THE SHARE SCHEDULES THE RE-MEASURE, and the button goes. Three things make that safe:

  COALESCED. Adding five organelles at once is five calls and one measurement pass for the cell.
  DELAYED. Apps Script needs a moment to append the row before a read can see it -- the same reason
    refreshUnclassifiedCounts has waited 2.5 s since 2026-08-09. Measuring at once would read an
    index without the new tracing in it and then report it as `missing`, which is the alarming
    half of the sentence and would be wrong every time.
  QUIET. Nothing is said when it works, because nothing happened that he asked about. A failure is
    said once, in the card's own status line, and names the repair -- which is the per-cell button,
    the one he kept.

WHAT IS LEFT OF THE WHOLE-DATASET BUTTON. tracedMeasureAll() stays on window, with no button: it is
a migration, it has been run, and the next dataset that needs one is reached from the console. A
button for a thing done once is a button that will be pressed by mistake.

Check: organellesheetcheck.js.
Run: python3 src/a_cell_is_remeasured_when_you_add_to_it.py, then python3 src/build_stamps.py,
then, from inside wjump-build/, python3 build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


REMEASURE = u'''/* ── A CELL IS RE-MEASURED WHEN SOMETHING IS ADDED TO IT ─────────────  2026-10-01
   Søren: "do I have to do this constantly or does it do it every time a lysosome is submitted?"

   A tracing carries its own measurements. Its SIBLINGS do not: the nearest organelle, its surface
   distance and its centroid distance are about a SET, and adding a lysosome changes the set. Every
   other organelle in that cell kept the answer it had. So the share schedules this.

   COALESCED -- five organelles added at once are one measurement pass for the cell.
   DELAYED -- Apps Script needs a moment to append the row before a read can see it, the same reason
     refreshUnclassifiedCounts has waited 2.5 s since 2026-08-09. Measuring at once would read an
     index without the new tracing in it and then call it `missing`, which is the alarming half of
     that sentence and would be wrong every single time.
   QUIET -- nothing is said when it works, because nothing happened that anybody asked about. A
     failure is said once, in the card's own line, and names the repair. */
var TRACING_REMEASURE = {}, TRACING_REMEASURE_T = 0, TRACING_REMEASURE_WAIT = 5000;
function tracingRemeasureCell(nuc, root){
  if (typeof window.tracedMeasureCells !== "function") return;
  var nid = String(nuc || ""), rid = String(root || "");
  /* A tracing filed against neither id has no cell to re-measure, and measuring "every tracing
     with no ids" together would invent neighbours for things that share nothing. */
  if (!nid && !rid) return;
  TRACING_REMEASURE[nid + "|" + rid] = { nuc: nid, root: rid };
  if (TRACING_REMEASURE_T) clearTimeout(TRACING_REMEASURE_T);
  TRACING_REMEASURE_T = setTimeout(tracingRemeasureRun, TRACING_REMEASURE_WAIT);
}
async function tracingRemeasureRun(){
  TRACING_REMEASURE_T = 0;
  /* Taken and cleared before the first await, so a share that happens while this is running
     schedules its own pass rather than being dropped into one already half spent. */
  const due = TRACING_REMEASURE; TRACING_REMEASURE = {};
  const keys = Object.keys(due);
  for (let i = 0; i < keys.length; i++){
    const c = due[keys[i]];
    let r;
    try { r = await window.tracedMeasureCells({ nuc: [c.nuc], root: [c.root] }); }
    catch (e){ r = { error: String(e && e.message || e) }; }
    if (r && r.error){
      try { console.warn("[measurements] " + r.error); } catch (_cw){}
      tracingSay("The tracing went up, but its cell\\u2019s measurements were not saved \\u2014 "
        + r.error + ". \\u201cMeasure this cell\\u201d on that cell in the list below will do it.",
        true);
      return;
    }
    try { console.log("[measurements] " + (c.nuc || c.root) + ": measured "
          + ((r && r.measured) || 0) + ", saved " + ((r && r.updated) || 0)); } catch (_cl){}
  }
}

'''

edit("core/tracingcard.js", [

 (u"adding to a cell re-measures it",
  u"function tracingPublish(t,quiet){",
  REMEASURE + u"function tracingPublish(t,quiet){"),

 (u"...scheduled once the tracing has gone",
  u"""  t.shared_at=new Date().toISOString();""",
  u"""  t.shared_at=new Date().toISOString();
  /* THE CELL, NOT JUST THIS TRACING (2026-10-01). Scheduled whether or not the backend ends up
     refusing: a refused tracing is simply not in the index, and re-measuring the cell then
     re-confirms the numbers it already had rather than writing anything wrong. Threading a
     cancellation through the refusal promise would buy one avoided read-set and a second place
     for the two paths to disagree. */
  tracingRemeasureCell(t.nucleus_id, t.root_id);"""),

 (u"the whole-dataset button goes, the function stays",
  u"""  /* ── THE BACKFILL, AND THE RE-MEASURE ────────────────────────  2026-09-30
     Two buttons, because there are two occasions. Everything traced before the measurements existed
     has a row with none, which is the whole dataset once; and a cell's relational numbers go stale
     the moment another organelle in it is outlined, which is one cell, often. Neither is a new
     version of anything -- see core/tracedoutlines.js's tracedMeasureAll. */
  host.innerHTML = '<label>In the dataset, by cell — open one to add to it or correct it</label>'
    + (typeof window.tracedMeasureAll === "function"
        ? '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px">'
          + '<button type="button" class="hist-chip" id="tracedMeasureAllBtn" title="Reads every '
            + 'outline in the dataset, measures it — shape, sphericity, the distances to the '
            + 'nucleus and to the nearest organelle — and saves the numbers onto its row in the '
            + 'sheet. It files no new version of any tracing and credits nobody: it only fills in '
            + 'the measurement columns. Do it once for everything traced before the measurements '
            + 'existed.">Measure every outline and save the numbers</button>'
          + '<span class="hint" id="tracedMeasureSay" style="flex:1 1 180px;min-width:0"></span></div>'
        : "")
    + groups.map(function(g, gi){""",
  u"""  /* ── ONE BUTTON, NOT TWO ───────────────────────────────────  2026-10-01
     There was a "measure every outline" button here for one day. It was a MIGRATION -- 68 rows
     written before the measurement columns existed -- and Søren ran it: "I got them now... we
     should hide this again." A button for a thing done once is a button that gets pressed by
     mistake, so window.tracedMeasureAll() stays and its button does not; the next dataset that
     needs the migration is reached from the console.

     What remains is per cell, because that is the thing that recurs: a cell's relational numbers
     go stale when another organelle in it is outlined. tracingRemeasureCell() now does that by
     itself after every share, and this button is the manual repair for when it did not. */
  host.innerHTML = '<label>In the dataset, by cell — open one to add to it or correct it</label>'
    + groups.map(function(g, gi){"""),

 # THE REPLACEMENT CARRIES ITS OWN CONTEXT. edit()'s idempotency guard is `if new in s`, so a pair
 # whose replacement is a bare "}" reports "already there" on every run of every file -- which is
 # exactly what it did the first time this was written, leaving the handler in place while printing
 # a pass. The dead handler's neighbour comes with it, so the guard has something to be about.
 (u"...and so does its handler",
  u"""  const allBtn = document.getElementById("tracedMeasureAllBtn");
  if (allBtn) allBtn.addEventListener("click", function(){
    tracingMeasureRun(allBtn, function(say){ return window.tracedMeasureAll(say); },
                      document.getElementById("tracedMeasureSay"));
  });
}
var TRACING_SHARED_GROUPS = [];""",
  u"""}
/* window.tracedMeasureAll() has no button on purpose -- see "ONE BUTTON, NOT TWO" above. */
var TRACING_SHARED_GROUPS = [];"""),
])
print("\nNow: node organellesheetcheck.js, then python3 src/build_stamps.py,"
      "\nthen, from inside wjump-build/, python3 build_wjump.py")
