# -*- coding: utf-8 -*-
u"""A link too big to open says what it would cost on a viewer that reads polylines.     2026-09-23

Søren, having tried dropping points and then dropping sections: "ok, that did not work. Can you do
something else to this segmentation that makes it work with Neuroglancer?" -- and, alongside: "Or
removing sections worked, I just did not get under the limit for Neuroglancer."

HIS ACTUAL FILE, run through the whole pipeline (Arachnoid barrier cell 1: 40,165 line annotations,
read as 176 contours on 140 sections, 40,233 points):

                              as LINES            as POLYLINES
    nothing dropped           6,150k  over        1,266k  FITS
    points at 16 nm           4,734k  over          979k  FITS
    points at 32 nm           3,774k  over          785k  FITS
    points at 64 nm           2,760k  over          581k  FITS

and dropping SECTIONS does nothing for him at all:

    100-400 nm tolerance      140 -> 140 sections   (nothing is redundant in z)
    800 nm                    140 -> 136            2,735k, still over, volume +0.05%
    1,600 nm                  140 -> 110            2,225k, STILL OVER, volume +1.56%

An arachnoid barrier cell changes shape between sections 800 nm apart; there is no redundancy in z
to find. So no amount of thinning gets a LINE link under 2,097,152, and the cell already fits
UNTOUCHED as polylines. The viewer was the whole problem, and every reduction offered to him was
beside the point.

SO THE CARD PRICES THE ALTERNATIVE INSTEAD OF LEAVING HIM TO WORK IT OUT. When a link is refused and
the chosen viewer cannot read polylines, the same state is measured as polylines and the sentence
carries both figures and the verdict -- "1,266k on Spelunker, which would open as a link". Where
even that does not fit, it says so rather than sending him on a second fruitless errand.

The copy/download buttons were already the answer for staying on his own viewer: its {} editor takes
the JSON with no URL and no cap, which is what he was doing by hand before any of this.

Check: oversizecheck.js.
Run: python3 src/an_oversized_link_prices_the_other_viewer.py, then python3 src/build_stamps.py
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
 (u"what it would cost as polylines",
  u'''  if (url.length > TRACING_LINK_MAX){
    tracingStateOffer(JSON.stringify(st),
      "That is more than a tab can be opened with (" + kc + "; the browser refuses past 2,097,152 "
      + "and shows about:blank#blocked). Paste the state into Neuroglancer instead \\u2014 its {} "
      + "button takes it \\u2014 or open one structure at a time." + shapeSay, true);
    return;
  }''',
  u'''  if (url.length > TRACING_LINK_MAX){
    /* PRICE THE ALTERNATIVE (2026-09-23). Søren spent an evening dropping points and then sections
       off a cell that already fitted as polylines and could never fit as lines -- so rather than
       tell him again that this viewer cannot read them, the same state is measured the other way
       and the answer is in the sentence. See src/an_oversized_link_prices_the_other_viewer.py. */
    let elseSay = "";
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
  }'''),
])
