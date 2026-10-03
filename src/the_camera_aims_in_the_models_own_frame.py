# -*- coding: utf-8 -*-
u"""The camera's aim goes through the model matrix, not around it.                       2026-10-03

Søren, with the nucleus isolated in µJump's cell card and an empty panel: *"When I isolate the
nucleus it disappear from the view. When I press zoom, it does not focus on the cell soma."*

`view.target` is a point in the frame's own units, and paint() turned it into a translation by
dividing each component by `geo.span`. But the model is drawn through `norm = modelScale(1/span)`,
and modelScale is diag(s, -s, s): THE Y IS FLIPPED, because the data's y runs down and WebGL's runs
up. So the vertices went through the flip and the aim did not. A nucleus `d` above the box's centre
was drawn `d` BELOW it and the camera was sent `d` above -- twice the offset apart, with the camera
parked a nucleus-radius from where it was looking. Empty panel.

A ROUND TEST CELL HIDES THIS COMPLETELY. The offset is what the error is proportional to, and a
nucleus near the middle of its bounding box has almost none. Søren's cell is a pyramidal cell: a
500 µm apical dendrite puts the box's centre 200 µm from the soma, and 200 µm of error at a camera
distance of 0.02 model units is not a near miss. mesh3disocheck.js now builds that shape and counts
the blue pixels: 0 before this, which is what he saw.

AND THE ARITHMETIC IS NOT REPEATED. The translation is built from `norm`'s own diagonal rather than
from a second copy of 1/span with a minus sign typed in front of the y -- a value decided by one
expression and matched by a second is the fault this file has had more than any other, and it would
be especially easy here, where the second copy would look right and be wrong only on cells whose
nucleus sits well off the middle.

WHAT I SHOULD HAVE ASSERTED THE FIRST TIME. "The camera moved and it came in" are statements about
two numbers, and both numbers were right while the panel was empty. The new assertion is that the
nucleus is ON SCREEN -- blue pixels, counted.

Check: mesh3disocheck.js.
Run: python3 src/the_camera_aims_in_the_models_own_frame.py
     python3 src/build_stamps.py
     node mesh3disocheck.js
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

 (u"the aim goes through the same matrix the vertices do",
  u'''      var base = tg ? mul(translate(-tg[0] / (geo.span || 1), -tg[1] / (geo.span || 1),
                                    -tg[2] / (geo.span || 1)), norm)
                    : norm;''',
  u'''      /* ── THROUGH `norm`, NOT AROUND IT ───────────────────────────────────────  2026-10-03
         `norm` is modelScale(1/span) and modelScale is diag(s, -s, s): the y is flipped, because
         the data's y runs down and WebGL's runs up. Dividing the target by the span by hand took
         the scale and missed the flip, so a nucleus `d` above the box's centre was DRAWN `d`
         below it and the camera was sent `d` above -- twice the offset apart, with the camera
         parked a nucleus-radius from where it was looking. Søren: "When I isolate the nucleus it
         disappear from the view."

         A round test cell hides it entirely: the error is proportional to the offset, and his is
         a pyramidal cell whose 500 µm apical dendrite puts the box centre 200 µm from the soma.

         Taken off norm's own diagonal rather than rewritten, so the scale and the flip have one
         source. A second copy here would look right and be wrong only on the cells that need it
         most. */
      var base = tg ? mul(translate(-tg[0] * norm[0], -tg[1] * norm[5], -tg[2] * norm[10]), norm)
                    : norm;'''),
])
print("\nNow: python3 src/build_stamps.py, then node mesh3disocheck.js")
