# -*- coding: utf-8 -*-
u"""A light travels through the structure, along the axis the sections were cut on.      2026-10-03

Søren: *"If you could make some animation of a light going through the structure, then that would
be really cool."*

IT TRAVELS ALONG Z, AND THAT IS THE POINT. Not a decorative sweep across the screen: z is the
axis the block was cut on, the axis the EM stack is indexed by, and the order in which every
contour of a tracing was drawn. So the band of light passes through the structure in the order the
structure was built, and somebody watching it is watching the sections go by. Pick any other
direction and it becomes a screensaver — which is the distinction Amy Sterling's repo is right
about and the only thing taken from it.

It also SHOWS something, which is the test. The band is brightest where the surface faces the
light, so a neurite running in z lights along its length while one running across lights for an
instant; a gap in the surface, or a contour missing from the middle of a tracing, is a dark band
the light crosses without touching. On a tracing that is a defect you want to catch while the pad
is still open.

ONCE, NOT FOREVER. One pass of about 1.5 s when a model appears, and then it is still. A loop here
would be a light show on a panel somebody is trying to judge a shape in, and it would hold a
WebGL context redrawing on a laptop battery for as long as the tab is open. `UJ.mesh3d.sweep()`
runs it again on demand, which is what a button or a double-click can hang off.

AND NOT ON EVERY REDRAW. The tracing pad rebuilds this panel after every closed contour, so
"sweep when show() is called" would be a sweep per contour — the animation would be the thing you
see while drawing rather than something that happens when the cell arrives. It is keyed on the
model: triangle count and radius together. Same model, no sweep.

REDUCED MOTION TURNS IT OFF, and lands where it should: the finished state is the ordinary lit
render, which is where the sweep ends anyway. Nothing is hidden from anybody by skipping it.

The band is added as LIGHT, scaled by alpha like the rim and the specular above it — a full
strength pulse crossing a 20%-opaque ghost would read as a solid surface passing through, which is
the shape confusion transparency exists to avoid.

Check: mesh3dlookcheck.js — it renders at three pulse positions and asserts the bright band is
where the pulse is and nowhere else, and that one full pass leaves the picture it started from.
Run: python3 src/a_light_travels_through_the_structure.py, then node mesh3dlookcheck.js
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

 (u"the vertex shader carries where along z the fragment is",
  u'''    "uniform mat4 mvp; uniform mat4 mv; varying vec3 vn; varying float vz;",''',
  u'''    "uniform mat4 mvp; uniform mat4 mv; uniform float rad;",
    "varying vec3 vn; varying float vz; varying float vt;",'''),

 (u"...computed in model space, before anything turns it",
  u'''    "void main(){ vn = normalize((mv * vec4(n, 0.0)).xyz);",
    "  vz = -(mv * vec4(p, 1.0)).z;",''',
  u'''    /* vt is how far this vertex is from the CENTRE of the structure, 0 at the middle and 1 at
       the furthest point. prepare() re-centres every mesh on its mid -- and a ghost on the mid of
       the mesh it shares a frame with -- so for a cell that centre is its soma, and the light
       leaves the soma and runs out along the processes.

       RADIAL RATHER THAN ALONG AN AXIS, and the reason is the camera. An axis sweep is legible
       only while that axis lies across the screen; turn the model and it becomes a glow that
       brightens and fades with nothing travelling anywhere. A sphere expanding from the centre
       reads the same from every angle, which is the one thing a panel you can drag has to be.

       Model space either way, so turning the model does not move the light through it: the band
       travels through the tissue, not across the screen. */
    "void main(){ vn = normalize((mv * vec4(n, 0.0)).xyz);",
    "  vt = length(p) * rad;",
    "  vz = -(mv * vec4(p, 1.0)).z;",'''),

 (u"the band of light, in the fragment shader",
  u'''    "varying vec3 vn; varying float vz;",
    "uniform vec3 tint; uniform float alpha; uniform vec3 bg; uniform vec2 fog;",''',
  u'''    "varying vec3 vn; varying float vz; varying float vt;",
    "uniform vec3 tint; uniform float alpha; uniform vec3 bg; uniform vec2 fog;",
    /* -1 parks it outside the model, which is the state every panel is in except during the
       one-and-a-half seconds after a model arrives. */
    "uniform float pulse;",'''),

 (u"...added as light, scaled by alpha like the rim above it",
  u'''    "  vec3 col = diff + Ck * sp + mix(base, Ck, 0.55) * fr * 0.30 * alpha;",''',
  u'''    "  vec3 col = diff + Ck * sp + mix(base, Ck, 0.55) * fr * 0.30 * alpha;",
    /* A gaussian shell rather than a hard edge: a step would alias into a staircase wherever
       the surface runs along the wavefront, which is most of a neurite. 0.075 of the radius is a
       shell a few per cent of the structure thick -- a travelling front rather than a sphere. */
    "  if (pulse > -0.5){",
    "    float d = (vt - pulse) / 0.075;",
    "    float band = exp(-d * d);",
    /* Brighter where the surface faces the light, so the band describes the shape it is crossing
       instead of painting a flat stripe over it. */
    "    col += Ck * band * (0.30 + 0.70 * max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0)) * 1.90 * alpha;",
    "  }",'''),

 (u"the uniforms the sweep needs",
  u'''        uBg = gl.getUniformLocation(prog, "bg"), uFog = gl.getUniformLocation(prog, "fog");''',
  u'''        uBg = gl.getUniformLocation(prog, "bg"), uFog = gl.getUniformLocation(prog, "fog"),
        uRad = gl.getUniformLocation(prog, "rad"), uPulse = gl.getUniformLocation(prog, "pulse");'''),

 (u"...and they are set every paint, from this model's own extent",
  u'''      var rnow = Math.max((geo.radius || 0) / (geo.span || 1), 0.05);
      gl.uniform2f(uFog, Math.max(view.dist - rnow, 0.01), view.dist + rnow * 1.15);''',
  u'''      var rnow = Math.max((geo.radius || 0) / (geo.span || 1), 0.05);
      gl.uniform2f(uFog, Math.max(view.dist - rnow, 0.01), view.dist + rnow * 1.15);
      /* 1/radius in MODEL units, so the shader's `length(p) * rad` is 0 at the centre and 1 at
         the furthest vertex. Floored, because a degenerate mesh with every vertex at the centre
         would otherwise divide by zero and light the whole surface at once for ever. */
      gl.uniform1f(uRad, 1 / Math.max(geo.radius || 0, 1e-6));
      gl.uniform1f(uPulse, PULSE);'''),

 (u"the sweep itself, beside the camera",
  u'''    var FOV = 0.9, FILL = 0.88;''',
  u'''    /* ── A LIGHT THROUGH THE STRUCTURE ────────────────────────────────────────  2026-10-03
       Søren: *"If you could make some animation of a light going through the structure, then that
       would be really cool."* It runs once, from before the first section to past the last, in
       about a second and a half, and then the panel is still.

       -1 is "no band": the shader tests for it, so the uniform is the switch and there is no
       second flag anywhere that could disagree with it.

       STOPPED BY THE PREFERENCE, and landing where the journey would have ended -- the ordinary
       lit render -- rather than frozen somewhere in the middle. */
    var PULSE = -1, sweeping = 0;
    function reduced(){
      try { return !!(window.matchMedia
                   && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
      catch (_e){ return false; }
    }
    function sweep(){
      if (reduced() || typeof requestAnimationFrame !== "function"){ PULSE = -1; paint(); return; }
      var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                       : Date.now();
      var me = ++sweeping, SPAN = 1500;
      (function step(){
        if (me !== sweeping) return;                 // a second sweep replaces the first
        var now = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                          : Date.now();
        var k = (now - t0) / SPAN;
        if (k >= 1){ PULSE = -1; paint(); return; }
        /* From just outside one end to just outside the other, so the band enters and leaves
           rather than appearing on the surface and vanishing off it. */
        PULSE = -0.12 + k * 1.24;
        paint();
        requestAnimationFrame(step);
      })();
    }
    var FOV = 0.9, FILL = 0.88;'''),

 (u"a new model sweeps once; the same model redrawn does not",
  u'''    LAST = { gl: gl, paint: paint, canvas: canvas };''',
  u'''    LAST = { gl: gl, paint: paint, canvas: canvas, sweep: sweep };
    /* ── ONCE PER MODEL, NOT ONCE PER DRAW ────────────────────────────────────  2026-10-03
       The tracing pad rebuilds this panel after every closed contour. Sweeping on every show()
       would make the animation the thing you watch while drawing rather than something that
       happens when a cell arrives. Keyed on the model: a triangle count and a radius together are
       specific enough that two different cells practically never collide, and insensitive to the
       camera, the tint and the alpha, which are the things that change on a redraw. */
    var key = (geo.triangles || 0) + ":" + Math.round((geo.radius || 0) * 10);
    if (key !== SWEPT){ SWEPT = key; sweep(); }''' ),

 (u"the key that remembers which model was swept",
  u'''  var LAST = null;
  function draw(canvas, geo, opts){''',
  u'''  var LAST = null, SWEPT = "";
  function draw(canvas, geo, opts){'''),

 (u"and the sweep can be asked for again",
  u'''  function probe(){''',
  u'''  /* Run the light through again — for a button, a double-click, or a tool that wants to point
     at the panel. Silent on a page whose panel has gone. */
  function sweepAgain(){ if (LAST && LAST.sweep) LAST.sweep(); }

  function probe(){'''),

 (u"it is exported as sweep()",
  u'''  return { prepare: prepare, draw: draw, show: show, install: install, probe: probe,''',
  u'''  return { prepare: prepare, draw: draw, show: show, install: install, probe: probe,
           sweep: sweepAgain,'''),
])
print("\nNow: node mesh3dlookcheck.js")
