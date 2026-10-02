# -*- coding: utf-8 -*-
u"""A button offered where it can do nothing is worse than no button.                    2026-10-03

mesh3dtoolscheck.js caught this the first time it ran: a panel showing ONLY a nucleus still offered
"look at the nucleus". The test for whether to offer it asked "is there a nucleus here", and the
answer was yes — it is the only thing here. Pressing it would have found no ghost marked as one and
returned false, so the button would have sat there doing nothing, which is the failure mode this
whole strip is supposed to avoid.

TWO HALVES, because the first draft had both wrong in opposite directions.

  OFFERED when there is a nucleus AND something else to come in FROM. One surface filling the frame
  has nowhere to zoom to.

  FOUND wherever it is. core/empreview.js makes the NUCLEUS the subject and the cell a ghost — the
  nucleus is what you are looking at and the cell is what you look through — so a search that only
  walked the ghosts would have missed it in the one panel most likely to want the button. It looks
  at the ghosts first and then at the subject.

Run: python3 src/a_button_that_does_nothing_is_worse.py, then node mesh3dtoolscheck.js
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


edit("core/mesh3d.js", [

 (u"offered only where there is somewhere to come in from",
  u'''  function hasNucleus(o){
    if (o && o.what === "nucleus") return true;
    return (o && o.ghosts || []).some(function(g){ return g && g.what === "nucleus"; });
  }''',
  u'''  function hasNucleus(o){
    /* A nucleus AND something else: one surface filling the frame has nowhere to come in from, and
       a button that can only ever do nothing is worse than no button. Caught by
       mesh3dtoolscheck.js on its first run. 2026-10-03. */
    var others = ((o && o.ghosts) || []).length;
    var isNuc = !!(o && o.what === "nucleus")
             || ((o && o.ghosts) || []).some(function(g){ return g && g.what === "nucleus"; });
    return isNuc && others > 0;
  }'''),

 (u"...and found whichever of the two it is",
  u'''    function nucleusGeo(){
      var g = (o.ghosts || []).filter(function(x){ return x && x.what === "nucleus" && x.geo; })[0];
      return g ? g.geo : null;
    }''',
  u'''    function nucleusGeo(){
      var g = (o.ghosts || []).filter(function(x){ return x && x.what === "nucleus" && x.geo; })[0];
      if (g) return g.geo;
      /* core/empreview.js makes the NUCLEUS the subject and the cell the ghost -- what you are
         looking at, and what you look through. A search that only walked the ghosts would miss it
         in the panel most likely to want this button. */
      return (o.what === "nucleus") ? geo : null;
    }'''),
])
print("\nNow: node mesh3dtoolscheck.js")
