# -*- coding: utf-8 -*-
u"""The 3D window gets a lighting rig, and a camera that fills the frame.                2026-10-03

Søren, with a link to Amy Sterling's scifi-ui: *"I really like what Amy Robinson Sterling is doing.
Can we use some of her graphics to make the 3D windows look nicer?"* — and then, when I reached for
corner readouts: *"I didn't mean to use the text in the corners of the 3D screen, I meant to make
the meshes and lights look as nice as she does."*

NOTHING HERE IS HERS. Her repository carries no licence, and Søren's instruction was "make
something inspired by her work, don't take her work." This is our own renderer, improved by
ordinary graphics: a three-point rig, hemispheric ambient, a specular lobe, a Fresnel rim, depth
cue, and lighting done in linear light. The only thing taken from her is the standard she set by
making hers look like something somebody lit on purpose.

WHAT IT LOOKED LIKE, rendered and measured rather than recalled. A neuron-shaped subject in a
640x420 panel, before: the model covered 54% of the frame's height and 10% of its width, and the
whole picture spanned 23 of 255 grey levels. Lit by five lines:

    key  = max(dot(n, L1), 0)
    fill = max(dot(n, L2), 0) * 0.35
    rim  = pow(1 - abs(n.z), 3) * 0.35
    out  = tint * (0.18 + key*0.75 + fill) + rim*alpha

Two Lambert lobes, a white rim, a constant ambient, written straight out as sRGB. That is not a
lighting rig; it is enough light to see the silhouette. Every number below is in the check.

FOUR CHANGES, in the order they matter.

1. THE CAMERA FILLS THE FRAME. The old distance was a constant 1.9 for every model and every panel
   shape, so a tall thin neurite in a wide panel used about a tenth of the width and half the
   height. Now the distance is computed from the model's own radius and the canvas's aspect, to
   fill 88% of the tighter axis. Measured from the BOUNDING SPHERE, not the box, because the
   bounding sphere is the one quantity that does not change as you turn the model — fitting to the
   projected box would make the subject breathe in and out while you drag it, which reads as a
   fault in the model.

   `prepare` now reports `radius`, because it already walks every vertex and the radius is free
   there; computing it in draw() would be a second pass over a million vertices for a number the
   first pass could have handed over.

   A caller that sets `view.dist` still gets exactly what it asked for, and the wheel and the pinch
   still own it after the first frame. The fit decides the START, which is the thing nobody could
   set sensibly before because it depends on a canvas that did not exist yet.

2. LIGHT IN LINEAR SPACE. Adding and multiplying light values that are already gamma-encoded is
   wrong twice over: midtones come out muddy and a sum of two lights is darker than it should be.
   Squaring in and square-rooting out is gamma 2.0 rather than true sRGB — within a percent over
   the range that matters here, and one instruction instead of five on a mediump mobile GPU.

3. A RIG RATHER THAN TWO LAMPS. Key, fill and back, with a hemispheric ambient: the shadow side is
   lit by a cool sky above and a warm dark floor below instead of by a flat 0.18 of the object's
   own colour. That one change is most of what separates "rendered" from "shaded", because it is
   what puts any colour at all in the half of the object no lamp reaches.

   Plus a Blinn-Phong highlight, which is what makes a membrane read as wet rather than as clay,
   and a Fresnel rim tinted toward the key instead of white — white desaturates a tinted surface
   and reads as an outline drawn round it.

4. DEPTH CUE AND A FIELD TO SIT IN. Far fragments mix toward the background, so a neurite going
   away stops competing with one coming forward; and the background is a shallow radial lift
   instead of one flat colour, so the panel reads as a space rather than as a rectangle.

WHAT IS DELIBERATELY NOT CHANGED: `tint`. Colour here is IDENTITY — blue means nucleus, in this
panel, in the cell card, on the pad and in the Blender export, where blender/colour_policy.py
reserves hues 200-250 for it. A "gold on blue" look that recoloured the objects would be a
prettier picture of a different cell. The lamps are warm and cool; the objects keep their meaning.

ALPHA STILL SCALES THE RIM AND NOW THE SPECULAR TOO, for the reason the old comment gives: a
highlight at full strength on a 20%-opaque ghost reads as a solid surface, which is the exact shape
confusion transparency exists to avoid.

Check: mesh3dlookcheck.js, written red first, which measures the picture rather than looking at it.
Regression: m3dnuccheck.js (it counts blue pixels and asserts the nucleus is blue), m3dpinchcheck,
bigmeshcheck, nucmeshcheck, tracingpanelcheck.
Run: python3 src/the_3d_window_gets_a_lighting_rig.py, then node mesh3dlookcheck.js,
     then python3 src/build_stamps.py
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

 (u"prepare reports the radius it already has the vertices for",
  u'''    return { pos: pos, idx: idx, nrm: nrm, lo: lo, hi: hi, mid: mid, centred: true,
             span: (o.frame && o.frame.span)
                     || Math.max(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) || 1,
             oversize: oversize, vertices: pos.length/3, triangles: Math.floor(idx.length/3) };''',
  u'''    /* ── THE BOUNDING SPHERE, FOR THE CAMERA ───────────────────────────────────  2026-10-03
       Taken here because this loop has already touched every vertex and the radius is free at
       this point; asking for it in draw() would be a second pass over a million vertices for a
       number the first pass could simply have handed over. Measured AFTER the re-centring above,
       so on a ghost sharing another mesh's frame it is the distance from THAT centre -- which is
       what the camera has to cover.

       A sphere rather than the box, and that is the whole reason this exists: the radius does not
       change as the model turns, so a camera fitted to it holds still while you drag. A fit to the
       projected box would make the subject breathe in and out, which reads as a fault in the
       model rather than in the camera. */
    var r2 = 0;
    for (i = 0; i < pos.length; i += 3){
      var d2 = pos[i]*pos[i] + pos[i+1]*pos[i+1] + pos[i+2]*pos[i+2];
      if (d2 > r2) r2 = d2;
    }
    return { pos: pos, idx: idx, nrm: nrm, lo: lo, hi: hi, mid: mid, centred: true,
             span: (o.frame && o.frame.span)
                     || Math.max(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) || 1,
             radius: Math.sqrt(r2),
             oversize: oversize, vertices: pos.length/3, triangles: Math.floor(idx.length/3) };'''),

 (u"the vertex shader carries view-space depth",
  u'''  var VS = [
    "attribute vec3 p; attribute vec3 n;",
    "uniform mat4 mvp; uniform mat4 mv; varying vec3 vn;",
    "void main(){ vn = normalize((mv * vec4(n, 0.0)).xyz);",
    "  gl_Position = mvp * vec4(p, 1.0); }"
  ].join("\\n");''',
  u'''  var VS = [
    "attribute vec3 p; attribute vec3 n;",
    "uniform mat4 mvp; uniform mat4 mv; varying vec3 vn; varying float vz;",
    /* How far in front of the camera this fragment is, for the depth cue. The camera looks down
       -z in view space, so the distance is the negated z. */
    "void main(){ vn = normalize((mv * vec4(n, 0.0)).xyz);",
    "  vz = -(mv * vec4(p, 1.0)).z;",
    "  gl_Position = mvp * vec4(p, 1.0); }"
  ].join("\\n");'''),

 (u"the lighting rig replaces the two lamps",
  u'''  var FS = [
    "precision mediump float; varying vec3 vn; uniform vec3 tint; uniform float alpha;",
    "void main(){ vec3 n = normalize(vn); if (!gl_FrontFacing) n = -n;",
    "  float key  = max(dot(n, normalize(vec3( 0.4, 0.6, 0.8))), 0.0);",
    "  float fill = max(dot(n, normalize(vec3(-0.5,-0.3, 0.4))), 0.0) * 0.35;",
    "  float rim  = pow(1.0 - abs(n.z), 3.0) * 0.35;",
    "  gl_FragColor = vec4(tint * (0.18 + key * 0.75 + fill) + rim * alpha, alpha); }"
  ].join("\\n");''',
  u'''  /* ── A THREE-POINT RIG, IN LINEAR LIGHT ───────────────────────────────────────  2026-10-03
     Søren: *"make the meshes and lights look as nice as she does."* What was here before was two
     Lambert lobes, a white rim and a constant 0.18 ambient, summed in gamma space. That is enough
     light to read a silhouette by and not enough to make a surface look like a surface.

     LINEAR, which is the unglamorous half and does the most. Light adds linearly and sRGB does
     not, so summing gamma-encoded lamps makes midtones muddy and makes two lights darker than two
     lights should be. Squared in, square-rooted out: gamma 2.0 rather than true sRGB, within about
     a percent across the range that matters here and one instruction instead of five on a mediump
     mobile GPU.

     HEMISPHERIC AMBIENT is the single change that separates "shaded" from "rendered". The half of
     an object no lamp reaches was the object's own colour at 18%, which is grey mud; now it is lit
     by a cool sky above and a warm dark floor below, so the shadow side has a colour and a
     direction in it.

     SPECULAR, because a membrane is wet and clay is not. FRESNEL RIM tinted toward the key rather
     than white: white desaturates whatever it is drawn on and reads as an outline round the
     object instead of light coming past it.

     DEPTH CUE toward the background, so a neurite going away stops competing with one coming
     forward. `fog` is (near, far) in view-space units, computed per paint from the camera distance
     and the model's own radius -- so it follows a zoom instead of being a constant that is right
     at one distance.

     THE OBJECT'S COLOUR IS NOT TOUCHED. `tint` is identity here: blue means nucleus, in this
     panel, in the cell card, on the pad and in blender/colour_policy.py, which reserves hues
     200-250 for it. The lamps are warm and cool; what they light keeps its meaning.

     ALPHA SCALES THE RIM AND THE SPECULAR. The old note gives the reason for the rim and it is the
     same for the highlight: a full-strength specular on a 20%-opaque ghost reads as a solid
     surface, which is the exact shape confusion transparency is there to avoid. */
  var FS = [
    "precision mediump float;",
    "varying vec3 vn; varying float vz;",
    "uniform vec3 tint; uniform float alpha; uniform vec3 bg; uniform vec2 fog;",
    "vec3 lin(vec3 c){ return c * c; }",
    "void main(){",
    "  vec3 n = normalize(vn); if (!gl_FrontFacing) n = -n;",
    "  vec3 V = vec3(0.0, 0.0, 1.0);",
    "  vec3 base = lin(tint);",
    /* The sky is cool and the floor is warm and dark: the arrangement a window and a wooden room
       give you, and the reason an unlit side still has a colour. */
    "  vec3 sky = lin(vec3(0.58, 0.72, 1.00)), gnd = lin(vec3(0.40, 0.31, 0.24));",
    "  vec3 amb = mix(gnd, sky, n.y * 0.5 + 0.5) * 0.34;",
    "  vec3 Lk = normalize(vec3( 0.45, 0.62, 0.70));",
    "  vec3 Lf = normalize(vec3(-0.62, -0.18, 0.42));",
    "  vec3 Lb = normalize(vec3(-0.12, 0.38, -0.92));",
    "  vec3 Ck = lin(vec3(1.00, 0.92, 0.78)), Cf = lin(vec3(0.56, 0.71, 1.00)),",
    "       Cb = lin(vec3(0.84, 0.90, 1.00));",
    "  vec3 diff = base * (amb",
    "            + Ck * max(dot(n, Lk), 0.0) * 0.86",
    "            + Cf * max(dot(n, Lf), 0.0) * 0.34",
    "            + Cb * max(dot(n, Lb), 0.0) * 0.26);",
    "  float sp = pow(max(dot(n, normalize(Lk + V)), 0.0), 40.0) * 0.30 * alpha;",
    "  float fr = pow(1.0 - max(dot(n, V), 0.0), 3.2);",
    "  vec3 col = diff + Ck * sp + Ck * fr * 0.40 * alpha;",
    "  float f = clamp((vz - fog.x) / max(fog.y - fog.x, 0.0001), 0.0, 1.0);",
    "  col = mix(col, lin(bg), f * 0.45);",
    "  gl_FragColor = vec4(sqrt(max(col, 0.0)), alpha); }"
  ].join("\\n");

  /* ── THE FIELD THE MODEL SITS IN ──────────────────────────────────────────────  2026-10-03
     One flat clear colour makes a rectangle; a shallow lift toward the middle makes a space, and
     it costs one triangle. Deliberately slight -- this is a panel for judging a shape, and a
     background with an opinion would be competing with the thing it is behind. The lift is a
     fraction of the page's own background rather than a colour of its own, so it follows the
     light theme and the dark one without knowing which it is in. */
  var VS_BG = [
    "attribute vec2 q; varying vec2 uv;",
    "void main(){ uv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }"
  ].join("\\n");
  var FS_BG = [
    "precision mediump float; varying vec2 uv; uniform vec3 bg; uniform float lift;",
    "void main(){",
    "  vec2 d = (uv - vec2(0.5, 0.54)) * vec2(1.0, 1.22);",
    "  float g = smoothstep(0.78, 0.04, length(d));",
    "  gl_FragColor = vec4(bg + (bg + vec3(0.06)) * lift * g, 1.0); }"
  ].join("\\n");'''),

 (u"the background program is built beside the mesh one",
  u'''    gl.useProgram(prog);

    function buf(data, target){''',
  u'''    gl.useProgram(prog);

    /* Its own program, because a full-screen gradient has no normals, no depth and no model
       matrix, and bolting those onto the mesh shader to share one would cost more than the
       fourteen lines it saves. */
    var bgProg = gl.createProgram();
    gl.attachShader(bgProg, compile(gl, gl.VERTEX_SHADER, VS_BG));
    gl.attachShader(bgProg, compile(gl, gl.FRAGMENT_SHADER, FS_BG));
    gl.linkProgram(bgProg);
    var bgOk = !!gl.getProgramParameter(bgProg, gl.LINK_STATUS);

    function buf(data, target){'''),

 (u"the mesh program learns two more uniforms",
  u'''    var uMvp = gl.getUniformLocation(prog, "mvp"), uMv = gl.getUniformLocation(prog, "mv"),
        uTint = gl.getUniformLocation(prog, "tint"),
        uAlpha = gl.getUniformLocation(prog, "alpha");''',
  u'''    var uMvp = gl.getUniformLocation(prog, "mvp"), uMv = gl.getUniformLocation(prog, "mv"),
        uTint = gl.getUniformLocation(prog, "tint"),
        uAlpha = gl.getUniformLocation(prog, "alpha"),
        uBg = gl.getUniformLocation(prog, "bg"), uFog = gl.getUniformLocation(prog, "fog");
    /* One triangle rather than two: it covers the clip cube on its own, and the interpolation
       across it is the same. */
    var bgBuf = buf(new Float32Array([-1,-1, 3,-1, -1,3]), gl.ARRAY_BUFFER);
    var aQ = gl.getAttribLocation(bgProg, "q"),
        uBgC = gl.getUniformLocation(bgProg, "bg"),
        uLift = gl.getUniformLocation(bgProg, "lift");'''),

 (u"the camera starts fitted to the model and the panel",
  u'''    var view = o.view || {};
    if (view.yaw === undefined) view.yaw = 0.6;
    if (view.pitch === undefined) view.pitch = 0.3;
    if (view.dist === undefined) view.dist = 1.9;''',
  u'''    /* ── HOW FAR BACK TO STAND ────────────────────────────────────────────────  2026-10-03
       It was 1.9 for every model and every panel, so a tall thin neurite in a wide panel used
       about a tenth of the width and half the height, and a squat one in a narrow panel ran off
       both sides. Neither is a judgement anybody made; it is what one constant does to a set of
       shapes that differ.

       Fitted instead, from the model's own bounding-sphere radius and the panel's aspect: far
       enough that the sphere fits inside the narrower of the two half-angles, divided by FILL so
       it stops short of the edge. The radius is measured once in prepare() and is rotation
       invariant, so this holds still while the model turns.

       `rn` is the radius in NORMALISED units, because norm scales the model by 1/span before the
       camera sees it -- and it is taken over the ghosts too, since a cell drawn see-through
       around a tracing is usually the larger of the two and framing to the tracing alone would
       put the cell off the edges. */
    var FOV = 0.9, FILL = 0.88;
    function fitDist(aspect){
      var rn = (geo.radius || 0) / (geo.span || 1);
      (o.ghosts || []).forEach(function(g){
        if (g && g.geo && g.geo.radius)
          rn = Math.max(rn, g.geo.radius / (g.geo.span || geo.span || 1));
      });
      if (!(rn > 0)) rn = 0.5;
      var tv = Math.tan(FOV / 2);
      var th = Math.atan(tv * Math.max(aspect, 0.0001));
      var half = Math.min(FOV / 2, th);
      return rn / (Math.tan(half) * FILL);
    }
    var view = o.view || {};
    if (view.yaw === undefined) view.yaw = 0.6;
    if (view.pitch === undefined) view.pitch = 0.3;
    /* Only the START. A caller that names a distance gets it, and the wheel and the pinch own it
       from the first gesture onwards -- the fit answers the question nobody could answer before,
       which is where to stand before a canvas exists to measure. */
    var fitted = false;'''),

 (u"and the paint applies it, the field and the fog",
  u'''      gl.viewport(0, 0, canvas.width, canvas.height);
      var b2 = o.bg || themeBg();
      gl.clearColor(b2[0], b2[1], b2[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var mv = mul(translate(0, 0, -view.dist), mul(rotX(view.pitch), mul(rotY(view.yaw), norm)));
      gl.uniformMatrix4fv(uMvp, false, mul(perspective(0.9, w/h, 0.01, 100), mv));
      gl.uniformMatrix4fv(uMv, false, mv);''',
  u'''      gl.viewport(0, 0, canvas.width, canvas.height);
      var b2 = o.bg || themeBg();
      /* The fit needs the canvas, so it happens on the first paint rather than at setup -- at
         setup the panel is often still display:none and measures 0 by 0. */
      if (!fitted){ fitted = true; if (view.dist === undefined) view.dist = fitDist(w / h); }
      if (view.dist === undefined) view.dist = 1.9;
      gl.clearColor(b2[0], b2[1], b2[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      /* The field first, with depth off so it cannot occlude anything and writes nothing. */
      if (bgOk){
        gl.useProgram(bgProg);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
        gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
        /* The mesh program's two attribute arrays are still enabled, and Chrome refuses a draw
           while any enabled array has no buffer behind it -- "no buffer is bound to enabled
           attribute", once per frame, and the gradient silently never appears. Off for the
           background, on again for the mesh. */
        gl.disableVertexAttribArray(aP); gl.disableVertexAttribArray(aN);
        gl.enableVertexAttribArray(aQ);
        gl.vertexAttribPointer(aQ, 2, gl.FLOAT, false, 0, 0);
        gl.uniform3fv(uBgC, b2);
        /* Lifted on a dark field, where there is room above the background to lift into; barely
           at all on a light one, where the same lift would wash out to paper. */
        gl.uniform1f(uLift, isLight() ? -0.05 : 0.55);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(aQ);
        gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
        gl.useProgram(prog);
        gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN);
      }
      var mv = mul(translate(0, 0, -view.dist), mul(rotX(view.pitch), mul(rotY(view.yaw), norm)));
      gl.uniformMatrix4fv(uMvp, false, mul(perspective(FOV, w/h, 0.01, 100), mv));
      gl.uniformMatrix4fv(uMv, false, mv);
      gl.uniform3fv(uBg, b2);
      /* ── THE CUE IS FOR WHAT IS BEHIND, NOT FOR EVERYTHING ────────────────  2026-10-03
         It started at the NEAR face, so a fragment at the model's own centre was already a quarter
         of the way to the background and every colour in the picture was diluted toward it. On a
         nucleus seen through a see-through cell that cost the blue entirely: m3dnuccheck.js, which
         asserts that blue means nucleus, fell from 218 qualifying pixels to 6, and the picture
         still looked fine. Measured, not noticed.

         From the CENTRE instead: the front half is untouched and the back half recedes, which is
         what a depth cue is for. Ranged on this model at this zoom rather than on a fixed slab the
         model may not be standing in. */
      var rnow = Math.max((geo.radius || 0) / (geo.span || 1), 0.05);
      gl.uniform2f(uFog, view.dist, view.dist + rnow * 1.30);'''),
])
print("\nNow: node mesh3dlookcheck.js, then python3 src/build_stamps.py")
