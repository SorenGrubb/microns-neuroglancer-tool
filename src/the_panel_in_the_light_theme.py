# -*- coding: utf-8 -*-
u"""The corner buttons and the field, in the light theme.                                2026-10-03

Søren, with a screenshot: *"The buttons don't work in light mode and the ambient ligt also looks
bad in light mode"*.

TWO FAULTS, AND THE LAMPS ARE NOT ONE OF THEM. Rendered calm -- after the sweep has finished; a
screenshot taken during it catches the travelling light and is a picture of the sweep, not of the
lighting -- the same mesh comes out all but identical in the two themes. Measuring that first is
what kept this to two changes instead of a retuned shader.

1. THE FALLBACK WAS A COLOUR. `background:var(--card,#1a1a1a)`. Of the eight pages this module
   installs itself into, `--card` is declared on exactly two -- χJump and ωJump. The other six
   (µ δ λ η β π) call that colour `--panel`. So six pages took the fallback, and the fallback is a
   literal dark grey: in the dark theme near enough the panel colour that nobody noticed, in the
   light theme a charcoal square carrying a `var(--ink)` glyph, which in the light theme is
   #1f2328. Dark on dark, contrast ratio 1.08 where 3.0 is the floor for an icon.

   The fix is not to declare `--card` on six pages. It is that a file which cannot see the theme
   has no business naming a colour: the fallback becomes the OTHER variable, and `--bg` behind
   that, both of which all eight pages declare. The literal that remains is now unreachable on
   any real page and is there only so the rule is still valid CSS in a harness.

   And the resting opacity goes .62 -> .82. At .62 the whole button -- border, fill and glyph --
   is mixed 38% into the canvas behind it, which on the dark theme is a soft touch and on a white
   field is most of the contrast gone before the glyph is even drawn.

2. THE LIGHT FIELD WAS A LIT STAGE INSIDE OUT. The background gradient brightens the middle and
   falls off to the page colour at the edges; on the light theme the sign was flipped and the
   amplitude was almost nothing, so the middle was a faintly grey smudge and the rim was white.
   That is the wrong way round. A light field is shaped by SHADOW AT ITS EDGES; a dark field is
   shaped by LIGHT IN ITS MIDDLE. Both come to the same sentence -- the middle is the lit part --
   which is what mesh3dlightcheck.js asserts, in both themes at once.

   WHICH WAY ROUND IS READ OFF THE SIGN OF THE LIFT, in the shader, rather than passed beside it.
   A second uniform saying "and vignette this one" is a value decided by one expression and matched
   by a second, which is the shape of about seven bugs in this codebase so far. A negative lift
   means a light field, and a light field vignettes: one line, nothing to keep in step.

Check: mesh3dlightcheck.js.
Run: python3 src/the_panel_in_the_light_theme.py
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

 (u"the button takes the page's own colour, all the way down",
  u'''    + ".m3d-tool{pointer-events:auto;width:26px;height:26px;line-height:1;display:flex;"
    + "align-items:center;justify-content:center;font-size:14px;cursor:pointer;"
    + "border:1px solid var(--line,#333);border-radius:7px;background:var(--card,#1a1a1a);"
    + "color:var(--ink,#eee);opacity:.62;transition:opacity .15s,background .15s}"''',
  u'''    /* ── THE FALLBACK IS A VARIABLE, NOT A COLOUR ──────────────────────────────  2026-10-03
       `var(--card,#1a1a1a)` was a statement about the theme made by a file that cannot see the
       theme. `--card` is declared on χJump and ωJump; the other six pages call the same colour
       `--panel`, so six of eight took that literal dark grey -- invisible in the dark theme,
       and in the light theme a charcoal square under a #1f2328 glyph. Søren: "The buttons don't
       work in light mode". The chain ends at `--bg`, which all eight declare, so the colour is
       always the page's own; the literal at the end is unreachable on any real page and is there
       so the rule is still valid CSS in a harness.

       AND .82 RATHER THAN .62. The opacity mixes the whole button -- border, fill and glyph --
       into the canvas behind it, which on a dark field is a soft touch and on a white one is most
       of the contrast gone before the glyph is drawn. */
    + ".m3d-tool{pointer-events:auto;width:26px;height:26px;line-height:1;display:flex;"
    + "align-items:center;justify-content:center;font-size:14px;cursor:pointer;"
    + "border:1px solid var(--line,#333);border-radius:7px;"
    + "background:var(--card,var(--panel,var(--bg,#1a1a1a)));"
    + "color:var(--ink,#eee);opacity:.82;transition:opacity .15s,background .15s}"'''),

 (u"a light field vignettes where a dark field glows",
  u'''  var FS_BG = [
    "precision mediump float; varying vec2 uv; uniform vec3 bg; uniform float lift;",
    "void main(){",
    "  vec2 d = (uv - vec2(0.5, 0.54)) * vec2(1.0, 1.22);",
    "  float g = smoothstep(0.78, 0.04, length(d));",
    "  gl_FragColor = vec4(bg + (bg + vec3(0.06)) * lift * g, 1.0); }"
  ].join("\\n");''',
  u'''  var FS_BG = [
    "precision mediump float; varying vec2 uv; uniform vec3 bg; uniform float lift;",
    "void main(){",
    "  vec2 d = (uv - vec2(0.5, 0.54)) * vec2(1.0, 1.22);",
    "  float g = smoothstep(0.78, 0.04, length(d));",
    /* ── WHICH WAY ROUND, FROM THE SIGN OF THE LIFT ──────────────────────────  2026-10-03
       A dark field is shaped by light in its middle; a light field is shaped by shadow at its
       edges. The light theme had the dark theme's gradient with the sign flipped, which put a
       grey smudge behind the specimen and left the rim white -- a lit stage inside out, and what
       Søren meant by "the ambient ligt also looks bad in light mode".

       READ OFF THE SIGN rather than passed beside it. A second uniform saying "and vignette this
       one" would be a value decided by one expression and matched by a second, which is the shape
       of most of the bugs this file has had. Negative lift means a light field, and a light field
       vignettes. */
    "  float gg = lift < 0.0 ? 1.0 - g : g;",
    "  gl_FragColor = vec4(bg + (bg + vec3(0.06)) * lift * gg, 1.0); }"
  ].join("\\n");'''),

 (u"and the light theme's shadow has an amplitude worth seeing",
  u'''        /* Lifted on a dark field, where there is room above the background to lift into; barely
           at all on a light one, where the same lift would wash out to paper. */
        gl.uniform1f(uLift, isLight() ? -0.05 : 0.55);''',
  u'''        /* Lifted on a dark field, where there is room above the background to lift into;
           NEGATIVE on a light one, which the shader reads as "vignette" rather than "glow" -- so
           this is shadow laid along the edges and not murk poured into the middle. -0.05 was the
           amount that made the light panel look dirty rather than lit: a departure you could
           measure (13 of 255) and not one you could see as deliberate. 2026-10-03. */
        gl.uniform1f(uLift, isLight() ? -0.13 : 0.55);'''),
])
print("\\nNow: python3 src/build_stamps.py, then node mesh3dlightcheck.js")
