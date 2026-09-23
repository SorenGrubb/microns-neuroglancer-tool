# -*- coding: utf-8 -*-
u""""Show the tracings in the dataset" does not wait for what it already has.             2026-09-23

Søren: "The loading of the tracings in the dataset is really slow."

MEASURED FIRST, against his live backend from his own browser, because the obvious guess was wrong.
I expected a fan-out -- one request per tracing from an undeployed ?structureIds= batch. It is not
that:

    ?tracings=1    27.7 s cold, 3.6 s warm, 13 kB, ONE request, 18 tracings
    ?whoami=1      11.3 s cold, 2.0 s warm

?whoami=1 returns three statements after the first line of doGet, so nine of those cold seconds are
Apps Script starting a container and have nothing to do with this query. The query itself is one
sheet scan of 13 kB and opens no Drive files. There is no fan-out to remove and nothing on the
backend worth cutting.

WHAT IS ACTUALLY SLOW IS THE WAITING, and most of it is for data the page already had.
tracingIndexSoon() fetches that exact URL when the pad opens -- so the numbering knows what the cell
already carries -- keeps it in TRACING_SHARED and caches it for a minute. tracingBrowse() then:

    host.innerHTML = "Reading the dataset's tracings…";     <- throws the list away
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS());   <- asks again

ignoring both the data and the cache. Every press bought a blank panel and 3 to 27 seconds for
something already in the page. Three more things followed from the same shape:

  - it never wrote TRACING_INDEX_AT, so the next pad open fetched it a third time;
  - two presses (or a press landing on top of tracingIndexSoon's own request) made two requests;
  - a refresh that FAILED replaced a perfectly good list with an error -- measured in the check as
    10 rows to 0. The data was in the page the whole time.

THE FIX IS NOT A FASTER REQUEST, it is not blocking on one. What is in hand goes up immediately, the
refresh happens behind it, and the list is replaced only when newer data has actually arrived. One
shared in-flight promise means overlapping asks join it instead of queueing a second request, and
every reader writes TRACING_INDEX_AT so the next one can skip.

AND WHEN THERE IS NOTHING IN HAND -- the first press on a fresh page -- it still has to wait, so it
says how long: "up to half a minute if the backend has been idle and has to start up". Søren sat in
front of "Reading the dataset's tracings…" with no idea whether 27 seconds meant working or broken.
The number is measured, not guessed.

A FAILURE NO LONGER DESTROYS THE LIST. The error goes ABOVE the rows, which stay, and says when they
were read -- because "could not refresh" over yesterday's list is true and useful, and an empty
panel is neither.

TRACING_INDEX_AT = 0 on failure, deliberately: the old code set it before fetching, so a backend that
was down for one request stayed un-asked for a minute afterwards.

Check: datasetlistcheck.js, written first; it reproduced all six (blank panel, list thrown away, two
requests for one answer, cache not written, a failed refresh blanking the list, nothing said about
how long).
Run: python3 src/the_dataset_list_does_not_wait_for_what_it_has.py, then python3 src/build_stamps.py,
then python3 wjump-build/src/build_wjump.py and python3 xjump-build/src/build_xjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


OLD_SOON = u'''function tracingIndexSoon(){
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return;
  if (Date.now() - TRACING_INDEX_AT < 60000) return;
  TRACING_INDEX_AT = Date.now();
  try {
    fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS())
      .then(function(r){ return r.json(); })
      .then(function(d){ if (d && d.tracings){ TRACING_SHARED = tracingInScope(d.tracings);
                                               tracingReconcileKept(); } })
      .catch(function(){});
  } catch (e){}
}'''

NEW_SOON = u'''/* ── ONE READ OF THE INDEX, SHARED BY EVERYONE WHO WANTS IT ──────────────────  2026-09-23
   Søren: "The loading of the tracings in the dataset is really slow." Measured against his backend
   before changing anything: ?tracings=1 is 3.6 s warm and 27.7 s cold, ONE request, 13 kB -- and
   ?whoami=1, which returns three statements into doGet, is 11.3 s cold, so most of the cold cost is
   Apps Script starting a container rather than this query. There was no fan-out to remove.

   What was slow was waiting for it twice. This function fetched the index when the pad opened and
   tracingBrowse() fetched the identical URL again on every press, ignoring both the answer and this
   cache. So there is one fetch now, and whoever asks while it is in the air waits on the SAME
   promise instead of starting another. See src/the_dataset_list_does_not_wait_for_what_it_has.py. */
var TRACING_INDEX_WAIT = null;
function tracingIndexFetch(){
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return Promise.reject(new Error("this page has no backend configured"));
  if (TRACING_INDEX_WAIT) return TRACING_INDEX_WAIT;
  TRACING_INDEX_WAIT = fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS())
    .then(function(r){ return r.json(); })
    .then(function(d){
      /* An older deployment answers this route with something else entirely. Saying so beats
         quietly keeping an empty list and reporting "nothing has been traced yet". */
      if (!d || !Array.isArray(d.tracings))
        throw new Error("the backend did not answer with a list of tracings");
      TRACING_SHARED = tracingInScope(d.tracings);
      TRACING_INDEX_AT = Date.now();
      tracingReconcileKept();
      TRACING_INDEX_WAIT = null;
      return TRACING_SHARED;
    }, function(e){
      /* NOT cached as an attempt. The old code stamped the clock BEFORE fetching, so one failed
         request left the index un-asked for the minute after the backend came back. */
      TRACING_INDEX_WAIT = null; TRACING_INDEX_AT = 0;
      throw e;
    });
  return TRACING_INDEX_WAIT;
}
/* THE INDEX, FETCHED QUIETLY, because the numbering needs it before he presses anything. Cheap
   enough to do when the pad opens, and a minute's cache keeps it to one request per session of
   work. It fails silently: with no index, tracingNextIndex() starts at 1 and says so, which is a
   label to fix rather than work lost. */
function tracingIndexSoon(){
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return;
  if (Date.now() - TRACING_INDEX_AT < 60000) return;
  try { tracingIndexFetch().catch(function(){}); } catch (e){}
}'''

OLD_BROWSE = u'''  host.innerHTML = '<p class="hint">Reading the dataset’s tracings…</p>';
  try {
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1" + tracingDsQS());
    const d = await r.json();
    TRACING_SHARED = tracingInScope((d && d.tracings) || []);
    tracingRenderShared();
    if (d && Array.isArray(d.tracings)) tracingReconcileKept();
  } catch (e){
    host.innerHTML = '<p class="hint" style="color:var(--bad)">Could not read them: '
      + escHtml(String(e && e.message || e)) + ". If the backend has not been redeployed since "
      + "2026-09-17 it does not answer this question yet.</p>";
  }
}'''

NEW_BROWSE = u'''  /* ── WHAT IS IN HAND GOES UP FIRST ─────────────────────────────────────────────  2026-09-23
     This used to overwrite the panel with "Reading the dataset’s tracings…" and then fetch the
     same URL tracingIndexSoon() had already fetched when the pad opened -- so every press cost a
     blank panel and 3 to 27 seconds for data the page was holding. The rows go up now and the
     refresh happens behind them; the list is replaced only once newer data has actually arrived. */
  const had = (TRACING_SHARED || []).length;
  if (had) tracingRenderShared();
  else host.innerHTML = '<p class="hint">Reading the dataset’s tracings… one request, a few '
    + "seconds — and up to half a minute if the backend has been idle and has to start up "
    + "again. Measured at 3.6 s warm and 27.7 s cold on 2026-09-23.</p>";
  const at = TRACING_INDEX_AT;
  try {
    await tracingIndexFetch();
    tracingRenderShared();
  } catch (e){
    const why = escHtml(String(e && e.message || e));
    if (had){
      /* A LIST ALREADY UP IS NOT BLANKED. Measured in datasetlistcheck.js before this went in: a
         failed refresh turned ten rows into an error page, throwing away data that was in the
         browser the whole time. The note goes ABOVE the rows, where he is already looking, and says
         how old they are -- "could not refresh" over a list read ten minutes ago is true and
         useful; an empty panel is neither. */
      tracingRenderShared();
      host.insertAdjacentHTML("afterbegin",
        '<p class="hint" style="color:var(--bad)">Could not refresh the list: ' + why
        + ". These are the tracings as they were read "
        + (at ? escHtml(draftWhen(new Date(at).toISOString())) : "earlier") + ".</p>");
    } else {
      host.innerHTML = '<p class="hint" style="color:var(--bad)">Could not read them: ' + why
        + ". If the backend has not been redeployed since 2026-09-17 it does not answer this "
        + "question yet.</p>";
    }
  }
}'''

edit("core/tracingcard.js", [
 (u"one shared read of the index", OLD_SOON, NEW_SOON),
 (u"the list goes up before the network answers", OLD_BROWSE, NEW_BROWSE),
])
