# -*- coding: utf-8 -*-
u"""A whole cell's tracing opens in the viewer, and a bigger one can be pasted into it.   2026-09-22

Søren, on a cell traced over 151 sections (8,107 contours): "I don't get it, why won't it open it,
I can add it to a JSON in Neuroglancer and see it there. The vertices are not the same as annotation
points, and there are not that many annotation points. So, could we try to let it open it?"

MEASURED IN HIS OWN BROWSER, on spelunker.cave-explorer.org, 2026-09-22 -- rather than reasoned
about, because the number this refusal rests on is a browser's, not ours:

  - a state with 40,000 line annotations, a 5.83 MILLION character URL, navigated and loaded: the
    viewer reports all 40,000. The refusal was at 1.5M, four times tighter than what Chrome and
    Neuroglancer actually take, and his cell needed 2.4M;
  - the same state with the `id` left off each annotation loads a layer with ZERO annotations in
    it, in silence. Neuroglancer drops an annotation that has no id, so shortening the link by
    dropping them is not available. tracingRingLines writes one, and linksizecheck.js asserts it.

So: it opens. Above 1.5M it says the link is a long one, and above 8M -- a size no browser is known
to take -- it does not open a tab at all. Either way the state itself is offered: `copy the JSON`
puts it on the clipboard and `download it` writes a .json, both to be pasted into Neuroglancer's
own {} editor, which is what he had been doing by hand.

Check: linksizecheck.js. Run: python3 src/a_long_tracing_still_opens.py, then
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


edit(u"the state can be copied or downloaded",
     u'''function tracingViewerOpen(structs, say, ids){''',
     u'''/* ── THE STATE, TO PASTE INTO THE VIEWER ITSELF ──────────────────────────────  2026-09-22
   Neuroglancer's {} button takes a pasted state, which is how Søren was opening the tracings a
   link could not carry. The status line offers the same JSON: on the clipboard, or as a file.
   See src/a_long_tracing_still_opens.py. */
var TRACING_STATE_JSON = "";
function tracingStateOffer(json, msg, bad){
  TRACING_STATE_JSON = String(json || "");
  var el = document.getElementById("tracingStatus");
  if (!el){ tracingSay(msg, bad); return; }
  el.innerHTML = (bad ? '<span style="color:var(--bad)">' + escHtml(msg) + "</span>" : escHtml(msg))
    + ' <button type="button" class="hist-chip" id="tracingCopyState">copy the JSON</button>'
    + ' <button type="button" class="hist-chip" id="tracingSaveState">download it</button>';
  var c = document.getElementById("tracingCopyState");
  if (c) c.addEventListener("click", function(){
    var done = function(){ c.textContent = "copied \\u2014 paste it into Neuroglancer\\u2019s {} button"; };
    var no = function(){ c.textContent = "could not copy \\u2014 use download it"; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(TRACING_STATE_JSON).then(done, no);
      else no();
    } catch (_e){ no(); }
  });
  var d = document.getElementById("tracingSaveState");
  if (d) d.addEventListener("click", function(){
    try { tracingSaveBlob(new Blob([TRACING_STATE_JSON], { type: "application/json" }),
                          "neuroglancer_state.json"); d.textContent = "downloaded"; }
    catch (_e){ d.textContent = "could not download it"; }
  });
}
/* How long a viewer link may be. MEASURED, not guessed (2026-09-22, Chrome on
   spelunker.cave-explorer.org): a 5.83M character URL carrying 40,000 line annotations navigates
   and loads in full. Below LONG nothing is said; between LONG and MAX it opens and says the link
   is a long one; above MAX no tab is opened, because a truncated URL opens a viewer missing half
   the cell without saying so. */
var TRACING_LINK_LONG = 1500000, TRACING_LINK_MAX = 8000000;
function tracingViewerOpen(structs, say, ids){''')

edit(u"a long link opens, and says so",
     u'''  if (url.length > 1500000){
    tracingSay("Too many vertices to put in a viewer link (" + Math.round(url.length / 1000)
      + "k characters). Open one structure at a time, or use the Blender export.", true);
    return;
  }''',
     u'''  const kc = Math.round(url.length / 1000) + "k characters";
  if (url.length > TRACING_LINK_MAX){
    tracingStateOffer(JSON.stringify(st),
      "That is more than a viewer link can carry (" + kc + "). Paste the state into Neuroglancer "
      + "instead \\u2014 its {} button takes it \\u2014 or open one structure at a time.", true);
    return;
  }
  if (url.length > TRACING_LINK_LONG){
    /* It opens: 40,000 annotations in a 5.83M character link were measured loading in Chrome. The
       sentence is for the browsers that are tighter, and it is not an error. */
    tracingStateOffer(JSON.stringify(st),
      "Opening a long link (" + kc + "). If the viewer comes up empty, your browser cut it short: "
      + "copy or download the state below and paste it into Neuroglancer\\u2019s {} button.", false);
  }''')

edit(u"...and the note after it does not wipe that",
     u'''  const nucId = (ids && ids.nuc) || "", rootId = (ids && ids.root) || "";''',
     u'''  const wasLong = url.length > TRACING_LINK_LONG;
  const nucId = (ids && ids.nuc) || "", rootId = (ids && ids.root) || "";''')

if s != b: io.open(P, "w", encoding="utf-8").write(s)

# The offer must survive: both sentences below it are written after the tab is opened, and both
# used to overwrite the status line -- taking the two buttons with them.
s = io.open(P, encoding="utf-8").read(); b = s
edit(u"the offer survives the community-roots note",
     u'''      if (extra.length) tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + ".")) + " The cell "''',
     u'''      if (extra.length && !wasLong) tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + ".")) + " The cell "''')
edit(u"...and the closing one",
     u'''  tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + " — " + nStr''',
     u'''  if (wasLong) return;          // the long-link offer, with its two buttons, stays put
  tracingSay((say || ("Opened in the viewer at " + pos.join(", ") + " — " + nStr''')
if s != b: io.open(P, "w", encoding="utf-8").write(s)
