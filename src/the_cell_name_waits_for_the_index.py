# -*- coding: utf-8 -*-
u"""The cell name waits for the index, and a saved tracing refreshes it.                  2026-09-24

Søren, of a macrophage whose panel reads "TRACED ON THIS CELL — Whole cell · 587 µm³, 71 contours":
"This macrophage does not show the whole cell trace when opening in Neuroglancer. Why?"

MEASURED ON THE LIVE SITE, in his own browser, before changing anything. The deployed code is
current, tracedKindHas("__traced_cell", "285856", "") answers TRUE, the layer builds -- 4,201 line
annotations, since ngl.microns-explorer.org takes no polylines -- and a simulated click produces a
683,174-character URL whose layers are `EM | segmentation | nuclei | Cortical layers [156] | traced
whole cell (1) [4201]`. The feature works. So what he saw was the handler DECLINING, and there are
exactly two ways it does that.

ONE: THE INDEX IS READ ONCE, AT PAGE LOAD, and nothing invalidates it. Trace a cell, press "Add to
the dataset", then click its name in the same tab: the set was fetched before the tracing existed,
tracedKindHas says no, and the ↗ falls through to the plain link. The panel's own "Traced on this
cell" section does not behave that way -- its cache is a minute old at worst -- which is why the
card could list the outline while the link beside it ignored it.

TWO: IT DECLINES WHILE THE INDEX IS STILL IN FLIGHT. That fetch is slow -- 3.6 s warm and 27.7 s
cold, measured on 2026-09-23 -- so a click in the first seconds of a page gets the plain link and
no explanation. Cheap for an untraced cell is the whole point of asking the in-memory set first,
but "I do not know yet" was being treated as "no".

SO: not-yet-known is no longer no. When the set has never loaded, the click takes the tab (which
must happen inside the click or the browser blocks it) and waits for the index before deciding. A
cell that turns out to have nothing traced opens exactly the link it would have opened anyway, so
the cost of waiting is paid only on the first click of a page. When the set IS loaded and says no,
nothing changes: no request, no delay.

AND A SAVE REFRESHES IT, after the same 2.5 s every other submission on these pages waits before
re-reading -- Apps Script needs a moment to append the row. That also puts the new outline into the
filter's Whole cell / Nucleus counts without a reload.

Check: celllinktracingcheck.js, extended; both new assertions failed before this went in.
Run: python3 src/the_cell_name_waits_for_the_index.py, then python3 src/build_stamps.py, then
python3 wjump-build/build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracedoutlines.js", [
 (u"not yet known is not the same as no",
  u"""    /* Asked of the index already in memory, so an untraced cell costs nothing: no request, no
       delay, and the anchor behaves exactly as it did before any of this existed. */
    if (typeof tracedKindHas !== "function") return;
    if (!tracedKindHas("__traced_cell", nuc, root) && !tracedKindHas("__traced_nucleus", nuc, root)) return;
    e.preventDefault();
    var href = a.href, win = null;
    try { win = window.open("", "_blank"); } catch (_e){}      // at the click, or it is a popup
    var ext = a.querySelector(".ext"), was = ext ? ext.innerHTML : "";
    if (ext) ext.innerHTML = "\\u2026";
    tracedCellNameLayers(nuc, root).then(function(layers){""",
  u"""    /* Asked of the index already in memory, so an untraced cell costs nothing: no request, no
       delay, and the anchor behaves exactly as it did before any of this existed.

       BUT NOT-YET-KNOWN IS NOT NO (2026-09-24). Søren: "This macrophage does not show the whole
       cell trace when opening in Neuroglancer." Measured on the live site, the cell's outline was
       in the index and the layer built; what he hit was this test running before the index had
       arrived. That fetch takes 3.6 s warm and 27.7 s cold, so the first clicks of a page were
       answered "no" by a set that had not been read yet. When it has never loaded the click takes
       the tab and waits for it; a cell that turns out to have nothing traced then opens exactly the
       link it would have opened anyway. See src/the_cell_name_waits_for_the_index.py. */
    if (typeof tracedKindHas !== "function") return;
    var known = (typeof TRACED_KIND_SETS !== "undefined") && !!TRACED_KIND_SETS;
    if (known && !tracedKindHas("__traced_cell", nuc, root)
              && !tracedKindHas("__traced_nucleus", nuc, root)) return;
    e.preventDefault();
    var href = a.href, win = null;
    try { win = window.open("", "_blank"); } catch (_e){}      // at the click, or it is a popup
    var ext = a.querySelector(".ext"), was = ext ? ext.innerHTML : "";
    if (ext) ext.innerHTML = "\\u2026";
    var ready = known || typeof tracedKindSets !== "function"
      ? Promise.resolve() : tracedKindSets().then(function(){}, function(){});
    ready.then(function(){ return tracedCellNameLayers(nuc, root); }).then(function(layers){"""),
])

edit("core/tracingcard.js", [
 (u"a saved tracing refreshes the index it is now in",
  u"""  tracingFlushSoon();
  /* LAST, and after tracingSay: the offer sits under the card's own sentence about the press, and
     tracingPendingClear() above would have removed it if it had been built first (2026-09-24). */
  try { tracingIdAsk(all); } catch (_e){}""",
  u"""  tracingFlushSoon();
  /* ── AND THE TRACED-OUTLINE INDEX IS NOW OUT OF DATE ────────────────  2026-09-24
     Søren, of a macrophage he had just traced: "This macrophage does not show the whole cell trace
     when opening in Neuroglancer." core/tracedoutlines.js reads that index ONCE, at page load, and
     nothing invalidated it — so the cell name's ↗ was asking a set fetched before this tracing
     existed. The delay is the one every other submission here uses: Apps Script needs a moment to
     append the row before a re-read would see it. Refreshing rather than merely clearing, because
     the filter's Whole cell / Nucleus counts read the same set and should gain this cell too. */
  setTimeout(function(){
    try {
      if (typeof window.tracedKindsRefresh === "function") window.tracedKindsRefresh(true);
      else if (typeof tracedKindSets === "function") tracedKindSets(true);
    } catch (_e){}
  }, 2500);
  /* LAST, and after tracingSay: the offer sits under the card's own sentence about the press, and
     tracingPendingClear() above would have removed it if it had been built first (2026-09-24). */
  try { tracingIdAsk(all); } catch (_e){}"""),
])
