# -*- coding: utf-8 -*-
u"""The viewer tab is reserved when the button is clicked, not after the fetch.          2026-09-22

Søren, on the kept list's Neuroglancer button: "the Neuroglancer window is still blocked. Why?"

A browser allows window.open only in the turn the click happened in. The pad's own "Look at it in
Neuroglancer" opens straight away and works; the LIST's buttons read the tracing out of the dataset
first, so their window.open landed a fetch later and Chrome blocked it as a pop-up -- correctly,
from the browser's point of view: by then nothing it can see is a click.

So the tab is RESERVED at the click. tracingReserveTab() opens it blank, writes one line into it
saying what is coming, and tracingViewerOpen sends that tab to the link when the geometry is in.
Every path that fetches before it opens reserves first -- and because an async function runs
synchronously up to its first await, the reservation is still inside the click.

AND IF THE BROWSER BLOCKS IT ANYWAY (pop-ups off for the site), that is now said out loud, with the
copy/download buttons beside it, rather than a click that appears to do nothing.

Check: popuptabcheck.js. Run: python3 src/the_viewer_tab_is_taken_at_the_click.py, then
python3 src/build_stamps.py
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


edit(u"a tab can be reserved at the click",
     u'''/* How long a viewer link may be.''',
     u'''/* ── THE TAB IS TAKEN AT THE CLICK ───────────────────────────────────────────  2026-09-22
   Søren: "the Neuroglancer window is still blocked. Why?" Because a browser only allows
   window.open in the turn the click happened in, and the list's buttons read the tracing out of
   the dataset first. A caller that will fetch reserves the tab before it does -- an async function
   runs synchronously up to its first await, so the reservation is still inside the click -- and
   tracingViewerOpen sends that tab to the link. See src/the_viewer_tab_is_taken_at_the_click.py. */
var TRACING_HELD_WIN = null;
function tracingReserveTab(msg){
  try { TRACING_HELD_WIN = window.open("", "_blank"); } catch (_e){ TRACING_HELD_WIN = null; }
  if (TRACING_HELD_WIN) try {
    TRACING_HELD_WIN.document.write('<!doctype html><meta charset="utf-8"><title>Opening\\u2026</title>'
      + '<body style="font:14px system-ui;background:#0d1117;color:#e6edf3;padding:24px">'
      + escHtml(msg || "Reading the contours, then opening the viewer\\u2026"));
    TRACING_HELD_WIN.document.close();
  } catch (_e){}
  return TRACING_HELD_WIN;
}
function tracingHeldTab(){ var w = TRACING_HELD_WIN; TRACING_HELD_WIN = null; return w; }
/* Opens the link: the tab reserved at the click if there is one, else a new one. Returns false when
   the browser refused -- pop-ups off -- so the caller can say so rather than look like it did
   nothing. */
function tracingOpenUrl(url){
  var held = tracingHeldTab();
  if (held){
    try { held.opener = null; } catch (_e){}
    try { held.location.href = url; return true; } catch (_e){}
  }
  var w = null;
  try { w = window.open(url, "_blank", "noopener"); } catch (_e){ w = null; }
  return !!w;
}
function tracingSayBlocked(st){
  tracingStateOffer(JSON.stringify(st),
    "Your browser blocked the viewer tab \\u2014 allow pop-ups for this page, or paste the state "
    + "into Neuroglancer\\u2019s {} button:", true);
}
/* How long a viewer link may be.''')

edit(u"the link goes to the tab that was reserved",
     u'''  if (!canExtra) window.open(url, "_blank", "noopener");
  else {
    let win = null;
    try { win = window.open("", "_blank"); } catch (_e){}
    tracingExtraRootsFor(nucId, rootId).then(function(extra){
      let u = url;
      if (tracingAddRootsTo(st, extra)) u = base + "#!" + encodeURIComponent(JSON.stringify(st));
      if (win){ try { win.opener = null; } catch (_e){} win.location.href = u; }
      else window.open(u, "_blank", "noopener");''',
     u'''  if (!canExtra){ if (!tracingOpenUrl(url)){ tracingSayBlocked(st); return; } }
  else {
    /* The tab reserved at the click, or one opened now -- either way it is taken BEFORE the
       community's root IDs are fetched, for the same reason. */
    let win = tracingHeldTab();
    if (!win) try { win = window.open("", "_blank"); } catch (_e){}
    if (!win){ tracingSayBlocked(st); return; }
    tracingExtraRootsFor(nucId, rootId).then(function(extra){
      let u = url;
      if (tracingAddRootsTo(st, extra)) u = base + "#!" + encodeURIComponent(JSON.stringify(st));
      if (win){ try { win.opener = null; } catch (_e){} win.location.href = u; }
      else window.open(u, "_blank", "noopener");''')

edit(u"reading one tracing reserves its tab first",
     u'''async function tracingSharedInViewer(sid, btn){
  const label = btn ? btn.textContent : "";''',
     u'''async function tracingSharedInViewer(sid, btn){
  /* BEFORE THE FETCH (2026-09-22): see tracingReserveTab. */
  tracingReserveTab("Reading this tracing from the dataset, then opening the viewer\\u2026");
  const label = btn ? btn.textContent : "";''')

edit(u"...and so does reading a whole cell's",
     u'''async function tracingCellSharedInViewer(sids, btn){
  if (!sids.length) return;''',
     u'''async function tracingCellSharedInViewer(sids, btn){
  if (!sids.length) return;
  tracingReserveTab("Reading this cell\\u2019s tracings from the dataset, then opening the viewer\\u2026");''')

edit(u"a reserved tab that is never used is closed",
     u'''      { nuc: t.nucleusId || st.nucleusId || "", root: t.rootId || st.rootId || "" });
  } catch (e){
    tracingSay("Could not open that tracing: " + String(e && e.message || e), true);''',
     u'''      { nuc: t.nucleusId || st.nucleusId || "", root: t.rootId || st.rootId || "" });
  } catch (e){
    /* Nothing to show in it: a blank tab left open is litter. */
    var held = tracingHeldTab(); if (held) try { held.close(); } catch (_e){}
    tracingSay("Could not open that tracing: " + String(e && e.message || e), true);''')

edit(u"...and so is the cell's, when there is nothing to open",
     u'''  const got = await tracingFetchCell(sids, btn);
  const good = got.filter(function(x){ return !x.error; });
  if (!good.length){ tracingSay("Could not open that cell's tracings." + tracingFailedSay(got), true); return; }
  const ids = { nuc: "", root: "" };''',
     u'''  const got = await tracingFetchCell(sids, btn);
  const good = got.filter(function(x){ return !x.error; });
  if (!good.length){
    var heldC = tracingHeldTab(); if (heldC) try { heldC.close(); } catch (_e){}
    tracingSay("Could not open that cell's tracings." + tracingFailedSay(got), true); return;
  }
  const ids = { nuc: "", root: "" };''')

if s != b: io.open(P, "w", encoding="utf-8").write(s)
