# -*- coding: utf-8 -*-
u"""A measurement that was measuring itself, and what was left after it.                 2026-10-04

Søren, after the dither: *"It is still too clear borders."*

THE FIRST ANSWER TO THAT WAS WRONG, and that is the part of this file worth reading. I averaged the
field in twenty concentric bands from the middle outward, got a slope that steepened to -3.3 and
then collapsed to -0.3, and concluded that `smoothstep(0.78, 0.04, length(d))` was drawing a ring
where its flat outer end began.

THE COLLAPSE WAS THE FRAME, NOT THE FIELD. It appeared at the same band index with a Gaussian in
place, in both themes, whatever the shader did — because the canvas is wide, and past the radius
where a circle leaves the top and bottom edge, each further "band" is a crescent rather than an
annulus. The average was reporting its own geometry. Measured honestly — a straight run out from
the centre along a band of 37 rows, so the dither cancels and no pixel is counted at a radius it is
not at — smoothstep's profile is as smooth as the Gaussian's. Neither has a kink worth 1% of its
range. There was never a cliff to remove.

SO THE GAUSSIAN IS NOT A FIX FOR WHAT HE SAW. It is kept for two smaller reasons that did survive:

  no end to arrive at   exp(-k·d²) is smooth at every order everywhere and is still falling at the
                        corner of the frame. There is no radius at which anything changes, by
                        construction rather than by measurement — which is not a claim the eye can
                        contradict later.
  a fifth less to band  at k = 3.2 the field crosses 18 levels in the light theme and 9 in the dark
                        where smoothstep crossed 23 and 11. A fifth fewer 8-bit boundaries is a
                        fifth less for the dither to hide.

WHAT HE IS SEEING IS STILL NOT REPRODUCED. The field leaves this shader with no flat patch wider
than 2px and no kink, in both themes, at the sizes the panel uses. Whatever is quantising it is
downstream of the shader — a colour-managed display transform, a viewer, a screenshot — and that is
a question for him with a picture, not something to guess at a third time.

Check: mesh3dlightcheck.js, "the falloff has no corner in it" — the profile's SECOND difference as
a share of its range, measured along a row rather than in annuli. Shown failing first, on a falloff
with a deliberate corner at 0.25: 6.5% and 6.7% against a 2% bar.

Run: python3 src/a_falloff_with_no_edge.py
     python3 src/build_stamps.py
     node mesh3dlightcheck.js
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

 (u"the falloff has no ends",
  u'''    "  float g = smoothstep(0.78, 0.04, length(d));",''',
  u'''    /* ── A GAUSSIAN, BECAUSE IT NEVER ARRIVES ANYWHERE ───────────────────────  2026-10-04
       Søren, after the banding was dithered away: "It is still too clear borders."

       AND THE FIRST ANSWER TO THAT WAS WRONG, which is worth more here than the right one. I
       averaged the field in concentric bands, read a slope that fell to -3.3 and then collapsed to
       -0.3 partway out, and concluded that smoothstep's flat ends were drawing a ring. They were
       not. The same collapse appeared at the same band index with a Gaussian in place, in both
       themes — because past the radius where a circle leaves the top and bottom of a wide canvas,
       every further band is a different SHAPE, and the average was measuring the frame. Measured
       instead along a straight run out from the middle, smoothstep's slope is as smooth as this
       one's: neither has a kink worth 1% of its range.

       SO THIS IS NOT A FIX FOR WHAT HE SAW, and the record should not pretend otherwise. It is
       kept for two smaller reasons that did survive the measurement. exp(-k·d²) is smooth at every
       order everywhere and is still falling at the corner of the frame, so there is no radius at
       which anything changes, by construction rather than by measurement. And at k = 3.2 the range
       it crosses is a fifth shallower than smoothstep's — 18 levels against 23 in the light theme,
       9 against 11 in the dark — which is a fifth fewer 8-bit boundaries for the dither to hide.

       What he is seeing has not been reproduced here. The field leaves this shader with no flat
       patch wider than 2px and no kink; whatever is quantising it is downstream. */
    "  float g = exp(-3.2 * dot(d, d));",'''),
])
print("\nNow: python3 src/build_stamps.py, then node mesh3dlightcheck.js")
