# -*- coding: utf-8 -*-
u"""The field is dithered, so eight bits can hold a shallow gradient.                    2026-10-04

Søren, with an exported picture: *"The background looks bad because the circles are visible and not
a gradient."*

THE GRADIENT IS SMOOTH; THE BUFFER IT LANDS IN IS NOT. The field spans about thirty-five levels
across six hundred pixels, so each 8-bit level is seventeen pixels wide — and because the falloff is
radial, those steps are concentric CIRCLES. Classic Mach banding, and the eye is unreasonably good
at it: each flat patch looks flatter than it is and every join reads as an edge. Measured along a
line across the field before this: the widest patch of one identical triple was 68 pixels in the
dark theme and 58 in the light one.

A SHALLOW GRADIENT IS THE WORST CASE, which is why this did not show up on anything else here. A
steep one crosses a level every pixel or two and the steps are invisible; this one was deliberately
made subtle — "a panel for judging a shape, and a background with an opinion would be competing with
the thing it is behind" — and subtlety is exactly what banding punishes.

THE FIX IS HALF A LEVEL OF NOISE, added before the value is quantised: the step boundary stops being
a line in the picture and becomes a dither pattern nobody can see. Interleaved gradient noise rather
than the usual `fract(sin(dot(...)))` hash, because this shader is mediump and that hash wants
highp — on a phone it degenerates into its own pattern, which would have traded rings for stripes.

ON THE MESH TOO, not only the field. The depth cue mixes a large smooth surface toward the
background over the same shallow range, and a cell soma is exactly the kind of broad gentle
curvature that bands. One line in each shader, the same line.

Check: mesh3dlightcheck.js.
Run: python3 src/a_gradient_not_a_set_of_rings.py
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


DITHER = u'''    /* ── HALF A LEVEL OF NOISE, BEFORE THE EIGHT BITS ────────────────────────  2026-10-04
       Søren: "The background looks bad because the circles are visible and not a gradient." They
       were: a shallow gradient crosses an 8-bit level every seventeen pixels, and on a radial
       falloff each of those steps is a circle. Half a level of noise moves the boundary off the
       line and into a pattern nobody can see.

       INTERLEAVED GRADIENT NOISE, not the usual fract(sin(dot(p, k))) hash: this shader is mediump
       and that hash wants highp. On a phone it collapses into a pattern of its own, which would
       have traded rings for stripes. This one was designed for mediump and for exactly this job.

       A WHOLE LEVEL WIDE, not half. Half took the widest flat patch from 68 pixels to 10 and no
       further: in the middle of a band the value sits far enough from a boundary that half a level
       cannot carry it across, so the band narrows instead of breaking up. A full level always can,
       and one 255th of noise is not something an eye finds. Measured, both times. */
    "float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }",
'''


edit("core/mesh3d.js", [

 (u"the field is dithered",
  u'''  var FS_BG = [
    "precision mediump float; varying vec2 uv; uniform vec3 bg; uniform float lift;",
    "void main(){",''',
  u'''  var FS_BG = [
    "precision mediump float; varying vec2 uv; uniform vec3 bg; uniform float lift;",
''' + DITHER + u'''    "void main(){",'''),

 (u"...on its way out",
  u'''    "  gl_FragColor = vec4(bg + (bg + vec3(0.06)) * lift * gg, 1.0); }"''',
  u'''    "  vec3 col = bg + (bg + vec3(0.06)) * lift * gg;",
    "  gl_FragColor = vec4(col + (ign(gl_FragCoord.xy) - 0.5) * 2.0 / 255.0, 1.0); }"'''),

 (u"and so is the model",
  u'''    "vec3 lin(vec3 c){ return c * c; }",''',
  u'''    "vec3 lin(vec3 c){ return c * c; }",
''' + DITHER.rstrip("\n") + u'''
'''),

 (u"...on its way out too",
  u'''    "  gl_FragColor = vec4(sqrt(max(col, 0.0)), alpha); }"''',
  u'''    /* The depth cue carries a large smooth surface toward the background over the same shallow
       range the field uses, and a soma is exactly the broad gentle curvature that bands. Applied
       AFTER the sqrt, because that is where the eight bits are. 2026-10-04. */
    "  gl_FragColor = vec4(sqrt(max(col, 0.0)) + (ign(gl_FragCoord.xy) - 0.5) * 2.0 / 255.0, alpha); }"'''),
])
print("\nNow: python3 src/build_stamps.py, then node mesh3dlightcheck.js")
