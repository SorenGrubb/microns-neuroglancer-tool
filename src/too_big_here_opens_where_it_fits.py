# -*- coding: utf-8 -*-
u"""A link too big for the chosen viewer opens on one that takes it.                     2026-09-23

Søren: "Can't you just measure when it will fail to open and then open with Spelunker instead? It
should be easy for the user."

He is right, and the card was already doing the hard half. It measured the link, knew it was over
2,097,152, and -- since yesterday -- measured the same state as polylines to tell him it would fit.
Having both numbers and then handing him a paragraph was the wrong end of the job.

SO IT OPENS IT. Over the cap, with the chosen viewer unable to read polylines, and the polyline
version under the cap: the state is rebuilt as polylines, the link is pointed at a viewer that
reads them, and the tab reserved at the click is sent there. Nothing is dropped -- his Arachnoid
barrier cell is 6,150k as lines and 1,266k as polylines, and the second one opens.

WHICH VIEWER: the first polyline-capable option the page's own <select id="viewer"> offers, so the
cell lands somewhere he already has in the list rather than somewhere invented; Spelunker if the
page has no list. He does not want to think about it, which is the whole point of the request.

AND IT SAYS SO, PLAINLY, because a link that quietly opens somewhere else is its own bug: which
viewer, why, both sizes, and that his choice in the box is unchanged -- this was one link, not a
setting.

WHERE IT STILL REFUSES: when even the polyline version is over the cap, there is no viewer to send
it to and the {} editor is the way in. That sentence is unchanged.

Measured on his file (Arachnoid barrier cell 1, 40,165 line annotations -> 176 contours):
    as lines      6,150k   over the cap on ngl.microns-explorer.org
    as polylines  1,266k   opens

Check: oversizecheck.js.
Run: python3 src/too_big_here_opens_where_it_fits.py, then python3 src/build_stamps.py
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


edit("core/tracingcard.js", [
 (u"base and url can be re-pointed",
  u'''  const viewerEl0 = document.getElementById("viewer");
  const base = (viewerEl0 && viewerEl0.value)''',
  u'''  const viewerEl0 = document.getElementById("viewer");
  /* `let`, because a link too big for this viewer is re-pointed at one that takes it below
     (2026-09-23, src/too_big_here_opens_where_it_fits.py). */
  let base = (viewerEl0 && viewerEl0.value)'''),
 (u"...the url too",
  u'''  /* base is resolved above, before the layers are written. */
  const url = base + "#!" + encodeURIComponent(JSON.stringify(st));''',
  u'''  /* base is resolved above, before the layers are written. */
  let url = base + "#!" + encodeURIComponent(JSON.stringify(st));'''),
])

edit("core/tracingcard.js", [
 (u"too big here opens where it fits",
  u'''    let elseSay = "";
    try {
      if (UJ.tracing.viewerTakesPolylines && !UJ.tracing.viewerTakesPolylines(base)){
        const alt = JSON.parse(JSON.stringify(st));
        let n = 0;
        (alt.layers || []).forEach(function(l, i){
          if (!l || !l.annotations) return;
          const rs = structs[n] ? structs[n].rings : null; n++;
          if (rs) l.annotations = tracingRingAnns(rs, "t" + i, "https://spelunker.cave-explorer.org/");
        });
        const altLen = ("https://spelunker.cave-explorer.org/#!"
                        + encodeURIComponent(JSON.stringify(alt))).length;
        elseSay = altLen <= TRACING_LINK_MAX
          ? " As polylines it would be " + Math.round(altLen / 1000) + "k and WOULD open as a link "
            + "\\u2014 Spelunker and neuroglancer-demo read them, this viewer does not. No contour "
            + "would be dropped."
          : " It would still be " + Math.round(altLen / 1000) + "k as polylines, so no viewer takes "
            + "it as a link: the {} editor is the way in.";
      }
    } catch (_e){}
    tracingStateOffer(JSON.stringify(st),
      "That is more than a tab can be opened with (" + kc + "; the browser refuses past 2,097,152 "
      + "and shows about:blank#blocked). Paste the state into Neuroglancer instead \\u2014 its {} "
      + "button takes it, with no URL and no limit." + elseSay, true);
    return;
  }''',
  u'''    /* OPEN IT WHERE IT FITS (2026-09-23). Søren: "Can't you just measure when it will fail to
       open and then open with Spelunker instead? It should be easy for the user." The measurement
       was already being made to tell him about it; making it and then not acting on it was the
       wrong end of the job. See src/too_big_here_opens_where_it_fits.py. */
    let elseSay = "", moved = false;
    try {
      if (UJ.tracing.viewerTakesPolylines && !UJ.tracing.viewerTakesPolylines(base)){
        /* One he already has in his own list, if the page offers one. */
        const altBase = (function(){
          try {
            const el = document.getElementById("viewer");
            const hit = el && [].filter.call(el.options, function(o){
              return UJ.tracing.viewerTakesPolylines(o.value);
            })[0];
            if (hit) return hit.value;
          } catch (_e){}
          return "https://spelunker.cave-explorer.org/";
        })();
        const alt = JSON.parse(JSON.stringify(st));
        let n = 0;
        (alt.layers || []).forEach(function(l, i){
          if (!l || !l.annotations) return;
          const rs = structs[n] ? structs[n].rings : null; n++;
          if (rs) l.annotations = tracingRingAnns(rs, "t" + i, altBase);
        });
        const altUrl = altBase + "#!" + encodeURIComponent(JSON.stringify(alt));
        if (altUrl.length <= TRACING_LINK_MAX){
          const wasHost = (function(){ try { return new URL(base).host; } catch (_e){ return base; } })();
          const nowHost = (function(){ try { return new URL(altBase).host; } catch (_e){ return altBase; } })();
          st = alt; base = altBase; url = altUrl; moved = true;
          tracingSay("Too big for " + wasHost + " as line annotations (" + kc + "; a tab cannot be "
            + "opened past 2,097,152 characters), so it opened in " + nowHost + " as polylines, "
            + "where it is " + Math.round(altUrl.length / 1000) + "k. Nothing was dropped. Your "
            + "viewer setting is unchanged \\u2014 this one link went elsewhere because it had to.");
        } else {
          elseSay = " It would still be " + Math.round(altUrl.length / 1000) + "k as polylines, so "
                  + "no viewer takes it as a link: the {} editor is the way in.";
        }
      }
    } catch (_e){}
    if (!moved){
      tracingStateOffer(JSON.stringify(st),
        "That is more than a tab can be opened with (" + kc + "; the browser refuses past 2,097,152 "
        + "and shows about:blank#blocked). Paste the state into Neuroglancer instead \\u2014 its {} "
        + "button takes it, with no URL and no limit." + elseSay, true);
      return;
    }
  }'''),
])

# The sentence above must survive: the closing "Opened in the viewer at ..." would otherwise
# overwrite it whenever the polyline link lands under TRACING_LINK_LONG.
edit("core/tracingcard.js", [
 (u"the moved-viewer flag is visible to the end",
  u'''  if (url.length > TRACING_LINK_MAX){''',
  u'''  let movedViewer = false;
  if (url.length > TRACING_LINK_MAX){'''),
 (u"...set where the move happens",
  u'''          st = alt; base = altBase; url = altUrl; moved = true;''',
  u'''          st = alt; base = altBase; url = altUrl; moved = movedViewer = true;'''),
 (u"...and the closing sentence stands down for it",
  u'''  const wasLong = url.length > TRACING_LINK_LONG;''',
  u'''  /* movedViewer: the sentence saying WHERE it opened and why is the one that must survive. */
  const wasLong = movedViewer || url.length > TRACING_LINK_LONG;'''),
])
