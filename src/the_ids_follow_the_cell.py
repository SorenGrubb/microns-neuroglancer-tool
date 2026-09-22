# -*- coding: utf-8 -*-
u"""The tracing card's id boxes follow the cell you look up, as its coordinate boxes do.   2026-09-22

Søren, with a χJump screenshot: "Segmentation still does not work in xJump". The pad sat on Purkinje
cell pc_2 -- its coordinate had followed the lookup -- while the fragment box still held
22910044733443, a fragment of granule cell grc_3500 from an earlier lookup, 440 µm away. The overlay
painted grc_3500's 99 fragments, rightly found none there, and said so: the segmentation read was
correct (checked live: every scale of cb2's segmentation answers pc_2's own fragment at that point);
the boxes were stale. Since 2026-09-17 the coordinate boxes follow a lookup (tracingFillPos); the id
boxes only ever filled while empty, so the first cell's ids stayed for every cell after it.

Now whenever the coordinate boxes follow a lookup, the ids follow too, and the cell box gets the
cell's centre: the page's CUR_NUCID / CUR_ROOT, or UJ.cfg.tracing.cellOnScreen() where a page has
one (χJump: its key; no fragment). Deferred a tick, because pages set CUR_POS before their ids. Not
while the pad is open with contours on it -- those belong to the cell they were drawn on -- and not
on a page that has no idea of a cell's ids at all (nothing to follow with).

Check: idsfollowcheck.js. χJump's half: xjump-build/src/xjump_card_follows_the_found_cell.py.
Run: python3 src/the_ids_follow_the_cell.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "core/tracingcard.js")
s = io.open(P, encoding="utf-8").read(); b = s


def edit(name, old, new):
    global s
    if new in s: print("  already there: " + name); return
    assert s.count(old) == 1, "%s: %d" % (name, s.count(old))
    s = s.replace(old, new, 1); print("  ok: " + name)


edit(u"the ids follow when the coordinate does",
     u'''  els.forEach(function(e, i){ e.value = want[i]; });
  TRACING_POS_AUTO = want.join(",");
  if (say) say.textContent = "From the cell you looked up.";''',
     u'''  els.forEach(function(e, i){ e.value = want[i]; });
  TRACING_POS_AUTO = want.join(",");
  if (say) say.textContent = "From the cell you looked up.";
  /* The ids with it, a tick later: pages set CUR_POS before their ids (2026-09-22). */
  clearTimeout(TRACING_IDS_SOON);
  TRACING_IDS_SOON = setTimeout(function(){ try { tracingFollowIds(); } catch (_e){} }, 0);''')

edit(u"...by this",
     u'''var TRACING_POS_AUTO = "";''',
     u'''var TRACING_POS_AUTO = "";
/* ── THE IDS FOLLOW THE CELL TOO ─────────────────────────────────────────────────  2026-09-22
   Søren, on χJump: "Segmentation still does not work in xJump" -- the pad was on one cell and the
   fragment box held another's, from an earlier lookup, so the overlay looked for the wrong cell.
   See src/the_ids_follow_the_cell.py. */
var TRACING_IDS_SOON = null;
function tracingIdsOnScreen(){
  try {
    var f = UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.cellOnScreen;
    if (typeof f === "function") return f() || null;
  } catch (_e){ return null; }
  var hasN = typeof CUR_NUCID !== "undefined", hasR = typeof CUR_ROOT !== "undefined";
  if (!hasN && !hasR) return null;              // a page with no idea of a cell's ids
  return { nuc: hasN && CUR_NUCID ? String(CUR_NUCID) : "", root: hasR && CUR_ROOT ? String(CUR_ROOT) : "" };
}
function tracingFollowIds(){
  var ids = tracingIdsOnScreen();
  var nucEl = document.getElementById("tracingNucId"), rootEl = document.getElementById("tracingRootId");
  if (!ids || !nucEl || !rootEl) return false;
  var want = [String(ids.nuc || ""), String(ids.root || "")];
  if (nucEl.value.trim() === want[0] && rootEl.value.trim() === want[1]) return false;
  /* Contours on an open pad were drawn on the cell these boxes name. */
  var wrap = document.getElementById("tracePadWrap");
  if (typeof PAD !== "undefined" && PAD && (PAD.rings || []).length && wrap && wrap.style.display !== "none"){
    var say = document.getElementById("tracingPosSay");
    if (say) say.textContent = "The cell and fragment boxes still name the cell on the pad — it has contours on it.";
    return false;
  }
  nucEl.value = want[0]; rootEl.value = want[1];
  var at = document.getElementById("tracingCellAt");
  if (at && window.CUR_POS && window.CUR_POS.length === 3)
    at.value = window.CUR_POS.map(function(n){ return Math.round(n); }).join(", ");
  try { tracingSuggestType(); } catch (_e){}
  return true;
}''')
if s != b: io.open(P, "w", encoding="utf-8").write(s)

# ...and the overlay goes ahead on a cell's key alone. On χJump the fragment box is now empty after
# a lookup and there is no nucleus volume, so "nothing to paint" came first although the host can
# name every fragment of the cell from its key.
s = io.open(P, encoding="utf-8").read(); b = s
edit(u"the overlay paints a cell known by its key alone",
     u'''  if (!root && !nuc){
    padSegSay("Nothing to paint''',
     u'''  const byKey = !!((document.getElementById("tracingNucId").value || "").trim()
                    && UJ.cfg && UJ.cfg.tracing && typeof UJ.cfg.tracing.cellIdsFor === "function");
  if (!root && !nuc && !byKey){
    padSegSay("Nothing to paint''')
if s != b: io.open(P, "w", encoding="utf-8").write(s)

# The count said one more than the cell has when the fragment box is empty.
s = io.open(P, encoding="utf-8").read(); b = s
edit(u"the segment count, with or without a fragment in the box",
     u'''also.length ? "cell (" + (also.length + 1) + " segments)"''',
     u'''also.length ? "cell (" + (also.length + (root ? 1 : 0)) + " segments)"''')
if s != b: io.open(P, "w", encoding="utf-8").write(s)
