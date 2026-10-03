# -*- coding: utf-8 -*-
u"""How close the 3D panel will let you get, decided once.                               2026-10-03

Søren: *"we can zoom all the way in when using the zoom button"*.

THE PANEL HAD THREE OPINIONS ABOUT ITS OWN LIMITS.

  the wheel    Math.max(0.6, Math.min(12, dist * 1.12 or 0.89))
  the pinch    Math.max(0.6, Math.min(12, pinch.dist * pinch.gap / g))   <- written out again,
               under a comment promising it was "the same range the wheel is"
  the button   Math.max(rn / (Math.tan(0.9 / 2) * 0.70), 0.05)           <- a third floor entirely

A nucleus is a few per cent of the span of the cell it sits in, so the button's distance is around
0.1 to 0.25 -- several times nearer than the nearest point the wheel will admit. The visible
consequence is the one Søren hit: press the button and you are inside the nucleus. The second one
nobody would ever report as a zoom bug, because it reads as the panel jumping: from there,
SCROLLING IN MOVES YOU AWAY. The wheel multiplies by 0.89 and then clamps UP to 0.6, so a request
to come closer lands you more than twice as far out as you were.

ONE FLOOR AT A TIME, AND EVERYTHING OBEYS IT. `nearest` is the floor in force now; `clampDist` is
the only thing that writes a distance. The ordinary floor is 0.6. Framing something smaller than
the model lowers it to exactly the distance that framing chose, so the wheel can follow the button
in and neither can go through the thing you asked to look at. Coming back out puts it back.

AND THE FRAMING DIVIDES BY THE MAIN GEOMETRY'S SPAN, not the nucleus's own. Everything in the
camera is in units of `geo.span` -- `view.target` is divided by it three lines away. A ghost
prepared with the cell's frame reports the cell's span and the two agreed; a ghost prepared without
one reports its own, and the button quietly framed the nucleus from four times too far out. Found
by writing mesh3dzoomcheck.js and getting 1.479 where the arithmetic said 0.059.

THE EIGHTH TIME. A number decided in one place and matched by a copy somewhere else is now the most
common fault in this codebase, so the check ends with a source-level assertion: no hand-written
clamp to the zoom limits survives anywhere in the file.

Check: mesh3dzoomcheck.js.
Run: python3 src/one_floor_at_a_time.py
     python3 src/build_stamps.py
     node mesh3dzoomcheck.js
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

 (u"one function writes the distance",
  u'''    function lookAtNucleus(){''',
  u'''    /* ── HOW CLOSE YOU MAY GET ────────────────────────────────────────────────  2026-10-03
       Søren: "we can zoom all the way in when using the zoom button". The wheel and the pinch each
       carried their own copy of [0.6, 12] -- the pinch's under a comment promising it was the same
       range as the wheel's -- and "look at the nucleus" arrived with a third floor of its own,
       several times nearer. Press it and you were inside the nucleus; scroll in from there and the
       wheel's floor pulled you BACK OUT, which reads as the panel jumping rather than as a limit.

       `nearest` is the floor in force NOW. Framing something smaller than the model lowers it to
       exactly the distance that framing chose -- so the hand can follow the button in, and neither
       can pass through the thing you asked to look at -- and leaving that view puts it back. */
    var DIST_FAR = 12, DIST_NEAR = 0.6, nearest = DIST_NEAR;
    function clampDist(d){ return Math.max(nearest, Math.min(DIST_FAR, d)); }

    function lookAtNucleus(){'''),

 (u"the button obeys the floor it sets",
  u'''      if (wasAt){ view.target = wasAt.target; view.dist = wasAt.dist; wasAt = null; paint(); return false; }''',
  u'''      if (wasAt){
        view.target = wasAt.target; view.dist = wasAt.dist;
        nearest = DIST_NEAR;                  // the ordinary floor comes back with the view
        wasAt = null; paint(); return false;
      }'''),

 (u"...and frames in the camera's own units",
  u'''      var rn = (ng.radius || 0) / (ng.span || geo.span || 1);
      view.dist = Math.max(rn / (Math.tan(0.9 / 2) * 0.70), 0.05);''',
  u'''      /* geo.span, NOT ng.span. Everything the camera does is in units of the main geometry's
         span -- view.target is divided by it three lines up. A ghost prepared with the cell's
         frame reports the cell's span and the two agreed by accident; one prepared without a frame
         reports its own, and this framed the nucleus from four times too far out. 2026-10-03. */
      var rn = (ng.radius || 0) / (geo.span || 1);
      /* 0.70 rather than FILL: a nucleus wants a little of its cell around it to be a nucleus
         IN something rather than a ball. The framing distance also becomes the floor, so the
         wheel can come in to exactly here and no further. */
      var want = rn / (Math.tan(FOV / 2) * 0.70);
      nearest = Math.min(DIST_NEAR, Math.max(want, 0.02));
      view.dist = clampDist(want);'''),

 (u"the pinch stops writing its own limits",
  u'''          /* Fingers apart is closer, the way every map behaves. Clamped to the same range the
             wheel is, so neither way of zooming can reach somewhere the other cannot. */
          view.dist = Math.max(0.6, Math.min(12, pinch.dist * pinch.gap / g));''',
  u'''          /* Fingers apart is closer, the way every map behaves. Through clampDist, so that
             "the same range the wheel is" is a fact rather than a promise made by a comment
             beside a second copy of the numbers. */
          view.dist = clampDist(pinch.dist * pinch.gap / g);'''),

 (u"...and so does the wheel",
  u'''      view.dist = Math.max(0.6, Math.min(12, view.dist * (e.deltaY > 0 ? 1.12 : 0.89)));''',
  u'''      view.dist = clampDist(view.dist * (e.deltaY > 0 ? 1.12 : 0.89));'''),
])
print("\nNow: python3 src/build_stamps.py, then node mesh3dzoomcheck.js")
