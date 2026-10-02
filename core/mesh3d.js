/* ── core/mesh3d.js — look at a cell in the page ────────────────────────────────────────────
   Søren, 2026-09-01: "I want to have the Show in 3D for all the other tools with meshes."

   χJump got an in-page 3D view first, because cb2 is the one volume where you assemble a cell and
   need to see whether you have assembled a cell. Every other tool in this family already fetches
   and decodes meshes -- it just had nowhere to put them except a .glb download and PowerPoint.
   This is that renderer, lifted out of xjump_mesh.js and made to not know what it is drawing.

   WHAT IS GENERIC AND WHAT IS NOT
   The renderer takes positions and indices. It knows nothing about precomputed, Draco, sharded
   minishards, graphene, or cb2's legacy manifests -- core/mesh.js already handles every one of
   those and hands back the same {positions, indices}. So the split is: FETCHING stays per tool,
   DRAWING lives here. That is why this file is 300 lines rather than 1,500.

   HOW IT REACHES FIVE TOOLS WITHOUT EDITING FIVE TOOLS
   µJump, δJump and πJump all render their mesh-download control as
   `<button class="idbtn meshdl" data-root="…">`, and βJump's and ηJump's were one attribute away
   from the same. So this module installs ITSELF: it watches for those buttons and puts a
   "Show in 3D" beside each, reading the root id from the attribute that is already there. Every
   tool needs exactly one line added -- the script tag -- and none of them needs its own logic
   touched.

   ηJump was the exception worth recording: its button carried `class="idbtn meshdl"` but no
   `data-root` (it closes over `c3Id(i)` in its own click handler instead), so the selector never
   matched it and no 3D button appeared -- exactly what Søren reported on 2026-09-01. The fix was
   to give it the attribute the other four already had, not to special-case it here.

   That matters more than the line count. These are live pages with months of community data
   behind them; a change that cannot reach inside their handlers cannot break their handlers.

   WHY NO THREE.JS
   Every page in this family is one self-contained file (or a file plus this core/ directory).
   The cost of that discipline is the matrix maths and shaders below; the benefit is that nothing
   breaks because a CDN moved.
   ────────────────────────────────────────────────────────────────────────────────────────── */
window.UJ = window.UJ || {};
UJ.mesh3d = (function(){
  "use strict";

  /* ── geometry ─────────────────────────────────────────────────────────────────────────────
     positions/indices in, a drawable in out. `unitNm` says what one position unit is worth in
     nanometres -- core/mesh.js hands back MICROMETRES (1000), χJump's legacy path hands back
     nanometres (1) -- and it exists so the size the panel prints is a real size rather than a
     number in whatever the caller happened to use.

     `extentNm`, when given, is the volume's own size, and it buys the one check that caught a
     ten-fold error in χJump's mesh transform: NO CELL CAN BE LARGER THAN THE BLOCK IT IS IN.
     Every fixture in that suite was built with the same wrong matrix, so every fixture agreed
     with it; only the volume's own depth disagreed. */
  function prepare(positions, indices, opts){
    var o = opts || {}, unit = o.unitNm || 1;
    var pos = positions instanceof Float32Array ? new Float32Array(positions)
                                                : new Float32Array(positions || []);
    var idx = indices instanceof Uint32Array ? indices : new Uint32Array(indices || []);
    if (!pos.length || !idx.length)
      return { pos: new Float32Array(0), idx: new Uint32Array(0), nrm: new Float32Array(0),
               lo: [0,0,0], hi: [0,0,0], mid: [0,0,0], span: 1, vertices: 0, triangles: 0,
               empty: true };
    /* Into nanometres up front, so everything downstream -- the bbox, the size, the oversize
       check, a point-in-mesh test -- speaks one unit. */
    if (unit !== 1) for (var u = 0; u < pos.length; u++) pos[u] *= unit;

    /* Per-vertex normals by accumulating face normals. Flat shading would be truer to a
       marching-cubes surface, but WebGL 1 has no geometry stage and duplicating every vertex to
       fake it triples the buffer for a cosmetic difference on a shape whose job is to be
       recognised. */
    var nrm = new Float32Array(pos.length);
    for (var t = 0; t + 2 < idx.length; t += 3){
      var a = idx[t]*3, b = idx[t+1]*3, c = idx[t+2]*3;
      if (a >= pos.length || b >= pos.length || c >= pos.length) continue;
      var ux = pos[b]-pos[a], uy = pos[b+1]-pos[a+1], uz = pos[b+2]-pos[a+2];
      var vx = pos[c]-pos[a], vy = pos[c+1]-pos[a+1], vz = pos[c+2]-pos[a+2];
      var nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
      nrm[a]+=nx; nrm[a+1]+=ny; nrm[a+2]+=nz;
      nrm[b]+=nx; nrm[b+1]+=ny; nrm[b+2]+=nz;
      nrm[c]+=nx; nrm[c+1]+=ny; nrm[c+2]+=nz;
    }

    var lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity], i, k;
    for (i = 0; i < pos.length; i += 3)
      for (k = 0; k < 3; k++){
        if (pos[i+k] < lo[k]) lo[k] = pos[i+k];
        if (pos[i+k] > hi[k]) hi[k] = pos[i+k];
      }
    if (!isFinite(lo[0])){ lo = [0,0,0]; hi = [0,0,0]; }

    /* RE-CENTRED IN PLACE, and not as tidiness. A float32 holds seven significant digits; a
       vertex 400 µm into a volume is 4e5 nm, which is fine, but a mesh frame with a large offset
       puts them at 1e11, where float32 steps in units of 8 µm and a 2 µm neurite becomes a
       staircase. lo/hi stay ABSOLUTE, because that is what a caller reports. */
    /* ONE FRAME FOR SEVERAL MESHES.  2026-09-17
       `o.frame` is another geometry's {mid, span}, and it exists because a tracing drawn inside its
       own cell has to be drawn in the CELL'S place, not re-centred into the middle of the picture.
       Without it every mesh centres on itself and three meshes that are inside one another come out
       concentric -- which looks plausible and is a lie. Given a frame, this centres on that mid and
       reports that span, so everything normalises identically. */
    var mid = (o.frame && o.frame.mid) ? o.frame.mid.slice()
            : [(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, (lo[2]+hi[2])/2];
    for (i = 0; i < pos.length; i += 3){
      pos[i] -= mid[0]; pos[i+1] -= mid[1]; pos[i+2] -= mid[2];
    }

    var oversize = null;
    if (o.extentNm) for (var ax = 0; ax < 3; ax++){
      var got = hi[ax] - lo[ax];
      if (got > o.extentNm[ax] * 1.02){
        oversize = { axis: "xyz".charAt(ax), got: got, max: o.extentNm[ax] }; break;
      }
    }
    /* ── THE BOUNDING SPHERE, FOR THE CAMERA ───────────────────────────────────  2026-10-03
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
             oversize: oversize, vertices: pos.length/3, triangles: Math.floor(idx.length/3) };
  }

  /* ── is a point inside this surface? ─────────────────────────────────────────────────────
     Ray casting along +x, odd crossings means inside. Generic because a mesh IS the segment's
     surface, so this answers "which cell contains this nucleus" for any tool that has both. */
  var EPS = 1e-7;
  function crossingsAlongX(px, py, pz, geo){
    var pos = geo.pos, idx = geo.idx, n = 0;
    for (var t = 0; t + 2 < idx.length; t += 3){
      var a = idx[t]*3, b = idx[t+1]*3, c = idx[t+2]*3;
      var ay = pos[a+1], az = pos[a+2], by = pos[b+1], bz = pos[b+2], cy = pos[c+1], cz = pos[c+2];
      var d = (by-ay)*(cz-az) - (bz-az)*(cy-ay);
      if (d > -EPS && d < EPS) continue;
      var u = ((py-ay)*(cz-az) - (pz-az)*(cy-ay)) / d;
      if (u < 0 || u > 1) continue;
      var v = ((by-ay)*(pz-az) - (bz-az)*(py-ay)) / d;
      if (v < 0 || u + v > 1) continue;
      if (pos[a] + u*(pos[b]-pos[a]) + v*(pos[c]-pos[a]) > px) n++;
    }
    return n;
  }
  function pointInGeometry(pt, geo){
    if (!geo || !geo.idx || !geo.idx.length) return false;
    var px = pt[0]-geo.mid[0], py = pt[1]-geo.mid[1], pz = pt[2]-geo.mid[2];
    var hx = (geo.hi[0]-geo.lo[0])/2, hy = (geo.hi[1]-geo.lo[1])/2, hz = (geo.hi[2]-geo.lo[2])/2;
    if (px < -hx || px > hx || py < -hy || py > hy || pz < -hz || pz > hz) return false;
    /* THREE RAYS, MAJORITY WINS. A ray exactly along an edge shared by two triangles is counted
       by both, so the total comes out even and a point plainly inside reads as outside. Marching
       cubes puts vertices on a regular lattice, so an axis-aligned ray meets shared edges
       constantly -- this is the common case, not an exotic one. */
    var e = (geo.span || 1) * 1e-4, votes = 0;
    if (crossingsAlongX(px, py, pz, geo) & 1) votes++;
    if (crossingsAlongX(px, py + e, pz + e*0.6180339, geo) & 1) votes++;
    if (crossingsAlongX(px, py - e*0.7861513, pz + e*1.3110179, geo) & 1) votes++;
    return votes >= 2;
  }
  function nucleiInside(points, geo){
    return (points || []).map(function(p, i){ return { i:i, p:p }; })
      .filter(function(r){ return pointInGeometry(r.p, geo); });
  }

  /* ── the smallest amount of matrix maths that draws a rotatable solid ────────────────────── */
  function mul(a, b){
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++){
      var s = 0; for (var k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
      o[c*4+r] = s;
    }
    return o;
  }
  function perspective(fovy, aspect, near, far){
    var f = 1/Math.tan(fovy/2), o = new Float32Array(16);
    o[0]=f/aspect; o[5]=f; o[10]=(far+near)/(near-far); o[11]=-1; o[14]=2*far*near/(near-far);
    return o;
  }
  function rotY(a){ var c=Math.cos(a),s=Math.sin(a),o=new Float32Array(16);
    o[0]=c;o[2]=-s;o[5]=1;o[8]=s;o[10]=c;o[15]=1;return o; }
  function rotX(a){ var c=Math.cos(a),s=Math.sin(a),o=new Float32Array(16);
    o[0]=1;o[5]=c;o[6]=s;o[9]=-s;o[10]=c;o[15]=1;return o; }
  function translate(x,y,z){ var o=new Float32Array(16);
    o[0]=o[5]=o[10]=o[15]=1;o[12]=x;o[13]=y;o[14]=z;return o; }
  function scale(s){ var o=new Float32Array(16); o[0]=o[5]=o[10]=s; o[15]=1; return o; }
  /* Y IS DOWN IN THE DATA AND UP ON THE SCREEN, and that is the whole of this.

     Søren, 2026-09-01: "When showing the 3D models in xJump they are upside down." They were --
     and so were the ones in µJump, δJump, πJump, ηJump and βJump, which share the other copy of
     this renderer. Neuroglancer and every volume in this family use the image-row convention:
     y increases DOWNWARD, towards the ventral side. WebGL's clip space is the opposite, +y up. So
     geometry handed straight to the GPU is drawn mirrored top-to-bottom, and a Purkinje cell
     appears with its dendritic tree underneath its soma.

     core/mesh.js has corrected for exactly this since it started writing .glb files -- see
     flipYForGLTF() -- and neither in-page renderer ever did. Nobody noticed because a granule cell
     looks much the same either way up; a Purkinje cell does not.

     Corrected in the MODEL MATRIX rather than in the buffers, deliberately. The buffers are also
     what the point-in-mesh nucleus test compares against and what the .glb exporter is handed, and
     both of those want the real frame -- the exporter applies its own flip. Flipping the geometry
     would silently break the join and double-flip every download.

     Safe here for two reasons that are properties of this renderer, not luck: there is no
     CULL_FACE, so reversing the handedness cannot turn faces into holes; and the fragment shader
     is two-sided, so the normals -- which this same matrix transforms, correctly, since
     diag(1,-1,1) is its own inverse-transpose -- stay right. */
  function modelScale(s){
    var o = new Float32Array(16);
    o[0] = s; o[5] = -s; o[10] = s; o[15] = 1;
    return o;
  }

  var VS = [
    "attribute vec3 p; attribute vec3 n;",
    "uniform mat4 mvp; uniform mat4 mv; uniform float rad;",
    "varying vec3 vn; varying float vz; varying float vt;",
    /* How far in front of the camera this fragment is, for the depth cue. The camera looks down
       -z in view space, so the distance is the negated z. */
    /* vt is how far this vertex is from the CENTRE of the structure, 0 at the middle and 1 at
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
    "  vz = -(mv * vec4(p, 1.0)).z;",
    "  gl_Position = mvp * vec4(p, 1.0); }"
  ].join("\n");
  /* Two lights and a rim term. A single headlight flattens a tubular neurite into a silhouette,
     which is exactly the shape information somebody opens this panel to judge. Two-sided, because
     these meshes come from automatic segmentation and their winding is not guaranteed consistent
     -- with culling on, a fragment wound the other way renders as a HOLE, and a hole in a cell is
     precisely what somebody might be looking for. */
  /* `alpha` is 1.0 for everything this file drew before 2026-09-17 and stays that way unless a
     caller asks otherwise -- see the `ghosts` option on draw(). The rim term is multiplied by it
     too: a silhouette at full strength on a 20%-opaque surface reads as a solid outline drawn round
     a ghost, which is exactly the shape confusion transparency is there to avoid. */
  /* ── A THREE-POINT RIG, IN LINEAR LIGHT ───────────────────────────────────────  2026-10-03
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
    "varying vec3 vn; varying float vz; varying float vt;",
    "uniform vec3 tint; uniform float alpha; uniform vec3 bg; uniform vec2 fog;",
    /* -1 parks it outside the model, which is the state every panel is in except during the
       one-and-a-half seconds after a model arrives. */
    "uniform float pulse;",
    "vec3 lin(vec3 c){ return c * c; }",
    "void main(){",
    "  vec3 n = normalize(vn); if (!gl_FrontFacing) n = -n;",
    "  vec3 V = vec3(0.0, 0.0, 1.0);",
    "  vec3 base = lin(tint);",
    /* The sky is cool and the floor is warm and dark: the arrangement a window and a wooden room
       give you, and the reason an unlit side still has a colour. */
    "  vec3 sky = lin(vec3(0.58, 0.72, 1.00)), gnd = lin(vec3(0.40, 0.31, 0.24));",
    "  vec3 amb = mix(gnd, sky, n.y * 0.5 + 0.5) * 0.20;",
    "  vec3 Lk = normalize(vec3( 0.45, 0.62, 0.70));",
    "  vec3 Lf = normalize(vec3(-0.62, -0.18, 0.42));",
    "  vec3 Lb = normalize(vec3(-0.12, 0.38, -0.92));",
    "  vec3 Ck = lin(vec3(1.00, 0.92, 0.78)), Cf = lin(vec3(0.56, 0.71, 1.00)),",
    "       Cb = lin(vec3(0.84, 0.90, 1.00));",
    "  vec3 diff = base * (amb",
    "            + Ck * max(dot(n, Lk), 0.0) * 0.68",
    "            + Cf * max(dot(n, Lf), 0.0) * 0.20",
    "            + Cb * max(dot(n, Lb), 0.0) * 0.14);",
    "  float sp = pow(max(dot(n, normalize(Lk + V)), 0.0), 44.0) * 0.22 * alpha;",
    "  float fr = pow(1.0 - max(dot(n, V), 0.0), 3.2);",
    "  vec3 col = diff + Ck * sp + mix(base, Ck, 0.55) * fr * 0.30 * alpha;",
    /* A gaussian shell rather than a hard edge: a step would alias into a staircase wherever
       the surface runs along the wavefront, which is most of a neurite. 0.075 of the radius is a
       shell a few per cent of the structure thick -- a travelling front rather than a sphere. */
    "  if (pulse > -0.5){",
    "    float d = (vt - pulse) / 0.075;",
    "    float band = exp(-d * d);",
    /* Brighter where the surface faces the light, so the band describes the shape it is crossing
       instead of painting a flat stripe over it. */
    "    col += Ck * band * (0.30 + 0.70 * max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0)) * 1.90 * alpha;",
    "  }",
    "  float f = clamp((vz - fog.x) / max(fog.y - fog.x, 0.0001), 0.0, 1.0);",
    "  col = mix(col, lin(bg), f * 0.45);",
    "  gl_FragColor = vec4(sqrt(max(col, 0.0)), alpha); }"
  ].join("\n");

  /* ── THE FIELD THE MODEL SITS IN ──────────────────────────────────────────────  2026-10-03
     One flat clear colour makes a rectangle; a shallow lift toward the middle makes a space, and
     it costs one triangle. Deliberately slight -- this is a panel for judging a shape, and a
     background with an opinion would be competing with the thing it is behind. The lift is a
     fraction of the page's own background rather than a colour of its own, so it follows the
     light theme and the dark one without knowing which it is in. */
  var VS_BG = [
    "attribute vec2 q; varying vec2 uv;",
    "void main(){ uv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }"
  ].join("\n");
  var FS_BG = [
    "precision mediump float; varying vec2 uv; uniform vec3 bg; uniform float lift;",
    "void main(){",
    "  vec2 d = (uv - vec2(0.5, 0.54)) * vec2(1.0, 1.22);",
    "  float g = smoothstep(0.78, 0.04, length(d));",
    "  gl_FragColor = vec4(bg + (bg + vec3(0.06)) * lift * g, 1.0); }"
  ].join("\n");

  function compile(gl, type, src){
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("shader: " + gl.getShaderInfoLog(s));
    return s;
  }

  var LAST = null, SWEPT = "";
  function draw(canvas, geo, opts){
    var o = opts || {};
    var gl = canvas.getContext("webgl", { antialias:true, alpha:false })
          || canvas.getContext("experimental-webgl", { antialias:true, alpha:false });
    if (!gl) throw new Error("no WebGL");
    /* Past 65,535 vertices the draw needs 32-bit indices. Without the extension it would silently
       wrap and paint a shredded version of the cell -- which looks like a segmentation problem
       rather than a rendering one, so it is checked and said. */
    var big = geo.vertices > 65535;
    if (big && !gl.getExtension("OES_element_index_uint"))
      throw new Error("this cell has " + geo.vertices.toLocaleString() + " vertices and this "
        + "browser cannot index past 65,535 — download the mesh instead");
    /* Asked for once, here, rather than per geometry: a ghost past 65,535 vertices is the common
       case (a whole neuron's mesh), and the extension is either present or it is not. */
    var canBig = big || !!gl.getExtension("OES_element_index_uint");

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    /* Its own program, because a full-screen gradient has no normals, no depth and no model
       matrix, and bolting those onto the mesh shader to share one would cost more than the
       fourteen lines it saves. */
    var bgProg = gl.createProgram();
    gl.attachShader(bgProg, compile(gl, gl.VERTEX_SHADER, VS_BG));
    gl.attachShader(bgProg, compile(gl, gl.FRAGMENT_SHADER, FS_BG));
    gl.linkProgram(bgProg);
    var bgOk = !!gl.getProgramParameter(bgProg, gl.LINK_STATUS);

    function buf(data, target){
      var b = gl.createBuffer();
      gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b;
    }
    /* ── SEVERAL MESHES, ONE OF THEM THE SUBJECT ──────────────────────────────────  2026-09-17
       Søren, on the tracing preview: *"Preferably also with the nucleus and root ID meshes as
       transparent."* So `o.ghosts` is a list of {geo, tint, alpha} drawn AROUND the main geometry:
       prepared in its frame (see prepare's `frame` option), drawn after it with blending on and
       DEPTH WRITES OFF, so a ghost never hides what is inside it and two ghosts never fight over
       which is in front. Depth TESTING stays on, so the solid subject still occludes the parts of
       a ghost behind it, which is what makes "inside" legible at all. */
    function upload(g){
      var b = g.vertices > 65535;
      if (b && !canBig) return null;      // this one cannot be indexed; the rest still draw
      return { pb: buf(g.pos, gl.ARRAY_BUFFER), nb: buf(g.nrm, gl.ARRAY_BUFFER),
               ib: buf(b ? g.idx : new Uint16Array(g.idx), gl.ELEMENT_ARRAY_BUFFER),
               n: g.idx.length, big: b };
    }
    var aP = gl.getAttribLocation(prog, "p"), aN = gl.getAttribLocation(prog, "n");
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN);
    var uMvp = gl.getUniformLocation(prog, "mvp"), uMv = gl.getUniformLocation(prog, "mv"),
        uTint = gl.getUniformLocation(prog, "tint"),
        uAlpha = gl.getUniformLocation(prog, "alpha"),
        uBg = gl.getUniformLocation(prog, "bg"), uFog = gl.getUniformLocation(prog, "fog"),
        uRad = gl.getUniformLocation(prog, "rad"), uPulse = gl.getUniformLocation(prog, "pulse");
    /* One triangle rather than two: it covers the clip cube on its own, and the interpolation
       across it is the same. */
    var bgBuf = buf(new Float32Array([-1,-1, 3,-1, -1,3]), gl.ARRAY_BUFFER);
    var aQ = gl.getAttribLocation(bgProg, "q"),
        uBgC = gl.getUniformLocation(bgProg, "bg"),
        uLift = gl.getUniformLocation(bgProg, "lift");
    var MAIN = upload(geo);
    var GHOSTS = (o.ghosts || []).map(function(g){
      if (!g || !g.geo || g.geo.empty || !g.geo.idx || !g.geo.idx.length) return null;
      var d = upload(g.geo);
      return d ? { d: d, tint: g.tint || null, what: g.what || "",
                   alpha: (g.alpha === undefined ? 0.22 : g.alpha) } : null;
    }).filter(Boolean);
    /* `o.alpha` is the SUBJECT's opacity, 1 unless a caller says otherwise. The cell panel sets
       it below 1 when it has a nucleus to show inside the cell. */
    var ALL = [{ d: MAIN, tint: o.tint || null, what: o.what || "",
                 alpha: (o.alpha === undefined ? 1 : o.alpha) }].concat(GHOSTS);
    gl.enable(gl.DEPTH_TEST);
    function drawOne(d, tint, alpha){
      if (!d) return;
      gl.uniform3fv(uTint, tint);
      gl.uniform1f(uAlpha, alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, d.pb); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, d.nb); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ib);
      gl.drawElements(gl.TRIANGLES, d.n, d.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    }

    var norm = modelScale(1 / (geo.span || 1));
    /* A CAMERA THAT SURVIVES A REDRAW.  2026-09-17. Pass an object as `o.view` and it is used and
       MUTATED in place as the pointer turns the model, so a panel that redraws itself -- the
       tracing preview does, after every contour -- hands the same object back and keeps the angle.
       Left out, each panel starts where it always did. */
    /* ── HOW FAR BACK TO STAND ────────────────────────────────────────────────  2026-10-03
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
    /* ── A LIGHT THROUGH THE STRUCTURE ────────────────────────────────────────  2026-10-03
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
      /* THREE, at Søren's asking, as one event rather than three: "I think it should go at least
         3 times". Back to back, so what ends it is what started it and a second press cannot
         leave two overlapping. */
      var me = ++sweeping, SPAN = 1500, PASSES = 3;
      (function step(){
        if (me !== sweeping) return;                 // a second sweep replaces the first
        var now = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                          : Date.now();
        var k = (now - t0) / SPAN;
        if (k >= PASSES){ PULSE = -1; paint(); return; }
        /* From just outside one end to just outside the other, so the band enters and leaves
           rather than appearing on the surface and vanishing off it. k % 1 restarts it for each
           pass; between passes the band is briefly outside the model, which is the beat that makes
           three passes read as three rather than as one long flicker. */
        PULSE = -0.12 + (k % 1) * 1.24;
        paint();
        requestAnimationFrame(step);
      })();
    }
    /* ── TURNING IT SLOWLY ────────────────────────────────────────────────────  2026-10-03
       A toggle, not a one-shot: "make the model rotate" is a state somebody turns on while they
       look at something else. A drag still works while it runs, because the drag writes the same
       view.yaw this does and the next frame carries on from wherever the hand left it.

       NOT SUPPRESSED BY prefers-reduced-motion, and that is deliberate rather than an oversight:
       the preference is about animation nobody asked for. This one is a button somebody pressed,
       and taking it away would leave them with a control that does nothing. */
    /* ── SHOWING ONE OF THEM ──────────────────────────────────────────────────  2026-10-03
       Søren: "Also a button to only show nucleus or only show root ID". Three states on one
       button, because the strip is meant to stay small.

       BY WHAT A SURFACE IS, not by its colour and not by whether it is the subject: core/empreview
       makes the NUCLEUS the subject and the cell a ghost, the pad does the opposite, and a rule
       about subjects would hide the wrong thing in one of the two.

       A SURFACE WITH NO `what` IS ALWAYS DRAWN. That is the tracing on the pad — the user's own
       work and the reason the panel is open. "Only the nucleus" means the nucleus and the outline
       you drew, not a panel that has quietly thrown the drawing away. */
    var ISO = "all";
    function isoShows(it){
      if (ISO === "cell") return it.what !== "nucleus";
      if (ISO === "nucleus") return it.what !== "cell";
      return true;
    }
    function isoCan(){
      var has = {};
      ALL.forEach(function(it){ if (it.what) has[it.what] = 1; });
      return !!(has.cell && has.nucleus);
    }
    function isoNext(){
      ISO = ISO === "all" ? "cell" : ISO === "cell" ? "nucleus" : "all";
      paint();
      return ISO;
    }

    var spinning = 0;
    function spin(){
      if (spinning){ spinning = 0; return false; }
      var me = ++spinning;
      var last = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                        : Date.now();
      (function step(){
        if (spinning !== me) return;
        var now = (typeof performance !== "undefined" && performance.now) ? performance.now()
                                                                          : Date.now();
        /* Radians a second, not radians a frame: a 120 Hz screen must not turn it twice as fast. */
        view.yaw += (now - last) * 0.00045;
        last = now;
        paint();
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
        else spinning = 0;
      })();
      return true;
    }

    /* ── LOOKING AT THE NUCLEUS ───────────────────────────────────────────────  2026-10-03
       The ghost that says it is one, in model units measured from the frame's mid — which is where
       prepare() put every vertex, so its own lo/hi midpoint IS that offset. Toggles back to the
       whole cell, and remembers the distance it came from rather than guessing one. */
    var wasAt = null;
    function nucleusGeo(){
      var g = (o.ghosts || []).filter(function(x){ return x && x.what === "nucleus" && x.geo; })[0];
      if (g) return g.geo;
      /* core/empreview.js makes the NUCLEUS the subject and the cell the ghost -- what you are
         looking at, and what you look through. A search that only walked the ghosts would miss it
         in the panel most likely to want this button. */
      return (o.what === "nucleus") ? geo : null;
    }
    function lookAtNucleus(){
      var ng = nucleusGeo();
      if (!ng) return false;
      if (wasAt){ view.target = wasAt.target; view.dist = wasAt.dist; wasAt = null; paint(); return false; }
      wasAt = { target: view.target || null, dist: view.dist };
      /* lo/hi are ABSOLUTE and mid is the frame's centre, so the nucleus's own centre relative to
         that frame is its box midpoint minus the frame mid — which is exactly what its vertices
         were shifted by. */
      view.target = [ (ng.lo[0] + ng.hi[0]) / 2 - ng.mid[0],
                      (ng.lo[1] + ng.hi[1]) / 2 - ng.mid[1],
                      (ng.lo[2] + ng.hi[2]) / 2 - ng.mid[2] ];
      var rn = (ng.radius || 0) / (ng.span || geo.span || 1);
      view.dist = Math.max(rn / (Math.tan(0.9 / 2) * 0.70), 0.05);
      paint();
      return true;
    }

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
    var fitted = false;
    var tint = o.tint || themeTint();
    var bg = o.bg || themeBg();

    function paint(){
      var w = canvas.clientWidth || 480, h = canvas.clientHeight || 300;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)){
        canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
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
      /* ── WHAT THE CAMERA IS LOOKING AT ────────────────────────────────────  2026-10-03
         It could only ever orbit the middle of the frame, which is fine for one object and no use
         at all for "zoom in on the nucleus": a nucleus is off-centre in its cell by definition, and
         there was nowhere to put that offset. `view.target` is a point in MODEL units (the same
         units geo.lo/hi are in, measured from the frame's mid), translated out before the rotation
         so the orbit happens around it. Absent, it is the origin and every panel is as it was. */
      var tg = view.target || null;
      var base = tg ? mul(translate(-tg[0] / (geo.span || 1), -tg[1] / (geo.span || 1),
                                    -tg[2] / (geo.span || 1)), norm)
                    : norm;
      var mv = mul(translate(0, 0, -view.dist), mul(rotX(view.pitch), mul(rotY(view.yaw), base)));
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
      gl.uniform2f(uFog, view.dist, view.dist + rnow * 1.30);
      /* 1/radius in MODEL units, so the shader's `length(p) * rad` is 0 at the centre and 1 at
         the furthest vertex. Floored, because a degenerate mesh with every vertex at the centre
         would otherwise divide by zero and light the whole surface at once for ever. */
      gl.uniform1f(uRad, 1 / Math.max(geo.radius || 0, 1e-6));
      gl.uniform1f(uPulse, PULSE);
      /* SORTED BY OPACITY, NOT BY ROLE.  2026-09-17
         Until today the subject was always the solid thing and the ghosts were always the
         see-through ones, so "subject first, ghosts after with depth writes off" was the same
         sentence twice. Søren then asked for the reverse: *"make the other 3D window transparent
         cells and show the nucleus when it is available"* -- the NUCLEUS is solid and the CELL is
         what you see through. Drawing the cell first with depth writes on would have hidden the
         nucleus inside it completely.

         So: everything opaque, in order, writing depth; then everything transparent over it with
         depth writes OFF, so the see-through parts neither hide each other nor hide what is inside
         them. Depth TESTING stays on throughout, which is what keeps "inside" legible. Every
         earlier caller lands in the first branch exactly as before. */
      var opaque = [], clear = [];
      ALL.forEach(function(it){
        if (!isoShows(it)) return;
        (it.alpha >= 1 ? opaque : clear).push(it);
      });
      gl.disable(gl.BLEND); gl.depthMask(true);
      opaque.forEach(function(it){ drawOne(it.d, it.tint || themeTint(), 1); });
      if (clear.length){
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        clear.forEach(function(it){ drawOne(it.d, it.tint || themeTint(), it.alpha); });
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }

    /* ── ONE FINGER TURNS IT, TWO FINGERS ZOOM ────────────────────────────────────  2026-09-17
       Søren: *"It works well on mobile phone, however I want to have the option to zoom in or our
       in the 3D window by using 2 fingers."* A wheel is the only way to zoom this panel had, and a
       phone has no wheel -- so on a phone the model could be turned and never approached.

       Every pointer down on the canvas is tracked rather than just the first, because that is the
       only way to know a second one has arrived. With two down the gesture is a PINCH and nothing
       else: rotation is suspended while it lasts, or the first finger's travel would spin the model
       during every zoom, which feels like a fault in the model rather than in the gesture. Lifting
       back to one finger re-anchors the rotation where that finger IS, so the model does not jump
       by however far the pinch moved it.

       `touch-action:none` on the canvas is what lets any of this happen at all -- without it the
       browser takes the second finger for its own page zoom and the canvas never sees it.

       The wheel keeps working unchanged, and the two cannot interfere: a trackpad pinch arrives as
       a wheel event with ctrlKey, not as two pointers. */
    var down = null, touches = {}, nTouch = 0, pinch = null;
    function gap(){
      var ids = Object.keys(touches);
      if (ids.length < 2) return 0;
      var a = touches[ids[0]], b = touches[ids[1]];
      return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }
    canvas.addEventListener("pointerdown", function(e){
      if (!touches[e.pointerId]) nTouch++;
      touches[e.pointerId] = { x:e.clientX, y:e.clientY };
      if (nTouch >= 2){
        down = null;                       // a pinch is not a drag, however it started
        pinch = { gap: gap() || 1, dist: view.dist };
      } else {
        down = { x:e.clientX, y:e.clientY, yaw:view.yaw, pitch:view.pitch };
      }
      try { canvas.setPointerCapture(e.pointerId); } catch(_e){}
    });
    canvas.addEventListener("pointermove", function(e){
      if (touches[e.pointerId]) touches[e.pointerId] = { x:e.clientX, y:e.clientY };
      if (pinch && nTouch >= 2){
        var g = gap();
        if (g > 0){
          /* Fingers apart is closer, the way every map behaves. Clamped to the same range the
             wheel is, so neither way of zooming can reach somewhere the other cannot. */
          view.dist = Math.max(0.6, Math.min(12, pinch.dist * pinch.gap / g));
          paint();
        }
        return;
      }
      if (!down) return;
      view.yaw = down.yaw + (e.clientX - down.x) * 0.01;
      /* Clamped short of the poles: past them the model appears to spin the wrong way, which
         reads as a bug in the mesh rather than in the camera. */
      view.pitch = Math.max(-1.5, Math.min(1.5, down.pitch + (e.clientY - down.y) * 0.01));
      paint();
    });
    function lift(e){
      if (touches[e.pointerId]){ delete touches[e.pointerId]; nTouch = Math.max(0, nTouch - 1); }
      if (nTouch < 2) pinch = null;
      if (nTouch === 1){
        /* RE-ANCHORED on the finger still down, at the angle the model is at now. Without this the
           model snaps back by the whole distance the remaining finger travelled during the pinch. */
        var id = Object.keys(touches)[0], t = touches[id];
        down = { x:t.x, y:t.y, yaw:view.yaw, pitch:view.pitch };
      } else if (nTouch === 0) down = null;
    }
    canvas.addEventListener("pointerup", lift);
    canvas.addEventListener("pointercancel", lift);
    canvas.addEventListener("wheel", function(e){
      e.preventDefault();
      view.dist = Math.max(0.6, Math.min(12, view.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
      paint();
    }, { passive:false });
    /* The panel is ON the page, so a theme change has to REPAINT it -- CSS cannot reach inside a
       WebGL canvas, and a panel that only re-styled would sit as a black rectangle on a white
       page. */
    var tb = document.getElementById("themeToggleBtn");
    if (tb) tb.addEventListener("click", function(){ setTimeout(paint, 0); });
    paint();
    LAST = { gl: gl, paint: paint, canvas: canvas, sweep: sweep,
             spin: spin, nucleus: lookAtNucleus, iso: isoNext, isoCan: isoCan,
             isoNow: function(){ return ISO; } };
    /* ── ONCE PER MODEL, NOT ONCE PER DRAW ────────────────────────────────────  2026-10-03
       The tracing pad rebuilds this panel after every closed contour. Sweeping on every show()
       would make the animation the thing you watch while drawing rather than something that
       happens when a cell arrives. Keyed on the model: a triangle count and a radius together are
       specific enough that two different cells practically never collide, and insensitive to the
       camera, the tint and the alpha, which are the things that change on a redraw. */
    /* ── THE GHOSTS ARE PART OF THE MODEL ─────────────────────────────────────  2026-10-03
       Søren: "The lightning kinda blimped before the 3D mesh had finished loading." It did, and
       this line is why: show() is called as soon as the SUBJECT is ready — a lofted tracing, which
       takes a millisecond — and the cell and nucleus meshes are megabytes that arrive afterwards
       and call show() again. Keyed on the subject alone, those arrivals were "the same model,
       redrawn", so the light had already been and gone through an outline.

       Counting the ghosts makes the cell landing exactly what it looks like: a new thing to light.
       And a redraw that changes only the camera, the tint or the alpha still changes nothing here,
       which is what keeps the pad from sweeping after every contour. */
    var key = (geo.triangles || 0) + ":" + Math.round((geo.radius || 0) * 10)
            + "|" + (o.ghosts || []).map(function(g){
                return (g && g.geo && g.geo.triangles) || 0; }).join(",");
    if (key !== SWEPT){ SWEPT = key; sweep(); }
    return paint;
  }

  /* The page's own colours, read from CSS so a tool's accent is the colour its cells are drawn
     in without this file knowing which tool it is in. */
  function cssVar(name, fallback){
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e){ return fallback; }
  }
  function hexToRgb(h, fallback){
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim());
    if (!m) return fallback;
    var n = parseInt(m[1], 16);
    return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
  }
  function isLight(){
    var a = document.documentElement.getAttribute("data-theme");
    if (a === "light") return true;
    if (a === "dark") return false;
    try { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches); }
    catch (e){ return false; }
  }
  function themeTint(){ return hexToRgb(cssVar("--accent"), isLight() ? [0.06,0.46,0.44] : [0.15,0.88,0.70]); }
  function themeBg(){ return hexToRgb(cssVar("--bg"), isLight() ? [0.96,0.97,0.98] : [0.06,0.07,0.09]); }

  /* Repaint and count distinct colours in one turn -- the only way to ask "did anything actually
     get painted". readPixels is valid only in the same turn as the draw unless
     preserveDrawingBuffer is on, and keeping a copy of every frame for a panel nobody screenshots
     is a real cost. A second getContext() returns the FIRST context and ignores the attributes,
     so a probe that tries to enable it after the fact silently reads a cleared buffer -- which
     once made a working panel report that it had drawn nothing. */
  /* Run the light through again — for a button, a double-click, or a tool that wants to point
     at the panel. Silent on a page whose panel has gone. */
  function sweepAgain(){ if (LAST && LAST.sweep) LAST.sweep(); }

  /* ── THREE BUTTONS IN THE CORNER ────────────────────────────────────────────────  2026-10-03
     Søren: "there should be a button in the corner of the 3D window to fire it again. Also a button
     to make the model rotate and a button to make it zoom in on the nucleus. You can use icons
     instead of text to make the buttons smaller."

     GLYPHS RATHER THAN SVG: one character each, nothing to fetch, and they take the page's own
     colour and size. Each carries a title and an aria-label, because an icon is a rebus and a
     rebus is not a label.

     THE NUCLEUS BUTTON IS CONDITIONAL, and on the caller SAYING so: a ghost marked
     `what: "nucleus"`, which is the word core/empreview.js already uses for its own parts. Guessing
     from the tint would work today and break the day somebody retunes a colour. */
  function hasNucleus(o){
    /* A nucleus AND something else: one surface filling the frame has nowhere to come in from, and
       a button that can only ever do nothing is worse than no button. Caught by
       mesh3dtoolscheck.js on its first run. 2026-10-03. */
    var others = ((o && o.ghosts) || []).length;
    var isNuc = !!(o && o.what === "nucleus")
             || ((o && o.ghosts) || []).some(function(g){ return g && g.what === "nucleus"; });
    return isNuc && others > 0;
  }
  /* Something to isolate means BOTH are here — a panel holding one surface has nothing to take
     away, and a button that only ever does nothing is worse than no button. */
  function hasBoth(o){
    var has = {};
    if (o && o.what) has[o.what] = 1;
    (o && o.ghosts || []).forEach(function(g){ if (g && g.what) has[g.what] = 1; });
    return !!(has.cell && has.nucleus);
  }
  /* The glyph says what is ON SCREEN, not what the press will do — that way round needs no
     explaining. The title says what the press will do. */
  var ISO_FACE = { all:     ["\u25c9", "Showing the cell and the nucleus",
                             "Showing both. Press to show the cell on its own."],
                   cell:    ["\u25cb", "Showing the cell on its own",
                             "Showing the cell on its own. Press to show the nucleus on its own."],
                   nucleus: ["\u25cf", "Showing the nucleus on its own",
                             "Showing the nucleus on its own. Press to show both again."] };
  function toolsHtml(o){
    var b = function(cls, glyph, label, title){
      return "<button type='button' class='m3d-tool " + cls + "' aria-label='" + esc(label)
           + "' title='" + esc(title) + "'>" + glyph + "</button>";
    };
    return "<div class='m3d-tools'>"
      + b("m3d-spin", "\u27f3", "Turn it slowly",
          "Turns the model slowly so you can see it from every side. Press again to stop. Dragging "
          + "still works while it turns.")
      + b("m3d-sweep", "\u2726", "Run the light through it again",
          "Sends a band of light out from the centre of the structure, three times. It is the "
          + "surface it crosses that lights up, so a gap in it shows as a gap the light goes past.")
      + (hasBoth(o)
          ? b("m3d-iso", ISO_FACE.all[0], ISO_FACE.all[1], ISO_FACE.all[2])
          : "")
      + (hasNucleus(o)
          ? b("m3d-nuc", "\u2299", "Look at the nucleus",
              "Moves the camera onto the nucleus and comes in close. Press again to go back to the "
              + "whole cell.")
          : "")
      + "</div>";
  }
  function wireTools(host, o){
    var stage = host.querySelector(".m3d-stage");
    if (!stage) return;
    var on = function(sel, f){
      var el = stage.querySelector(sel);
      if (el) el.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); f(el); });
    };
    on(".m3d-sweep", function(){ sweepAgain(); });
    on(".m3d-spin", function(el){
      var now = LAST && LAST.spin ? LAST.spin() : false;
      el.setAttribute("aria-pressed", now ? "true" : "false");
      el.classList.toggle("m3d-on", !!now);
    });
    on(".m3d-iso", function(el){
      var now = LAST && LAST.iso ? LAST.iso() : "all";
      var face = ISO_FACE[now] || ISO_FACE.all;
      el.textContent = face[0];
      el.setAttribute("aria-label", face[1]);
      el.setAttribute("title", face[2]);
      el.classList.toggle("m3d-on", now !== "all");
    });
    on(".m3d-nuc", function(el){
      var now = LAST && LAST.nucleus ? LAST.nucleus() : false;
      el.setAttribute("aria-pressed", now ? "true" : "false");
      el.classList.toggle("m3d-on", !!now);
    });
  }

  function probe(){
    if (!LAST) return -1;
    LAST.paint();
    var gl = LAST.gl, c = LAST.canvas;
    var px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    var seen = {}, n = 0;
    for (var i = 0; i < px.length; i += 4){
      var k = px[i] + "," + px[i+1] + "," + px[i+2];
      if (!seen[k]){ seen[k] = 1; n++; }
    }
    return n;
  }

  /* HOW MANY PIXELS ANSWER A QUESTION. probe() above counts distinct colours, which says "did
     anything get drawn"; this says WHAT. The nucleus being blue is a claim about the picture, and
     the only honest way to check a claim about a picture is to look at it. Same one-turn rule as
     probe(): repaint and read in the same turn, because the drawing buffer is not preserved. */
  function probePixels(pred){
    if (!LAST) return -1;
    LAST.paint();
    var gl = LAST.gl, c = LAST.canvas;
    var px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    var n = 0, w = c.width;
    /* x and y as well as the colour, because WHERE a colour is answers a different question from
       whether it is there: a nucleus re-centred on itself rather than left where it sits in its
       cell would paint exactly the same pixels, in the middle. */
    for (var i = 0; i < px.length; i += 4)
      if (pred(px[i], px[i+1], px[i+2], (i / 4) % w, Math.floor((i / 4) / w))) n++;
    return n;
  }

  function esc(s){ return String(s == null ? "" : s)
    .replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  /* ── the panel ─────────────────────────────────────────────────────────────────────────── */
  function show(host, geo, opts){
    var o = opts || {};
    if (!host) return null;
    /* THE STYLESHEET IS NOT COSMETIC HERE, which is why show() now asks for it rather than trusting
       that install() ran. `.m3d-canvas{touch-action:none}` is what lets the canvas see a second
       finger at all -- without it the browser takes the gesture for its own page zoom, and the
       pinch added 2026-09-17 simply never fires. install() injects it, and every tool that reaches
       this panel through a "Show in 3D" button gets it that way; a caller that drives show()
       directly -- the tracing preview does -- had been relying on some OTHER panel having been
       installed first. Idempotent: it guards on its own element id. */
    injectStyle();
    if (!geo || geo.empty){
      host.innerHTML = "<div class='m3d'><div class='m3d-err'>"
        + esc(o.emptyMessage || "No mesh geometry for this cell.") + "</div></div>";
      return null;
    }
    /* A stage round the canvas so the buttons have something to be positioned inside. Every
       selector anywhere else is a descendant one (.m3d-canvas, .m3d-note), so nothing else has to
       know this exists. */
    host.innerHTML = "<div class='m3d'><div class='m3d-stage'>"
      + "<canvas class='m3d-canvas'></canvas>" + toolsHtml(o) + "</div>"
      + "<div class='m3d-note'></div></div>";
    var canvas = host.querySelector(".m3d-canvas"), note = host.querySelector(".m3d-note");
    wireTools(host, o);
    var um = [0,1,2].map(function(i){ return (geo.hi[i]-geo.lo[i]) / 1000; });

    /* The size is printed and labelled, and that is not throat-clearing: a ten-fold error in
       χJump's mesh transform was found by reading this line against the volume's own depth. */
    note.innerHTML = (o.lead ? o.lead + "<br>" : "")
      + "<span class='hint'>" + um.map(function(v){ return v.toFixed(1); }).join(" × ") + " µm · "
      + geo.triangles.toLocaleString() + " triangles · drag to turn, scroll to zoom</span>";
    if (geo.oversize)
      note.innerHTML += "<br><b style='color:var(--bad)'>This cannot be right.</b> "
        + "<span class='hint'>It measures " + (geo.oversize.got/1000).toFixed(1) + " µm along "
        + geo.oversize.axis + ", and the whole volume is only "
        + (geo.oversize.max/1000).toFixed(1) + " µm. Something is wrong with the mesh transform "
        + "rather than with this cell.</span>";

    try { draw(canvas, geo, o); }
    catch (e){
      /* The canvas goes; the note stays. A DIFFERENT class, so anything reading the panel finds
         the size line rather than the failure. */
      var msg = host.ownerDocument.createElement("div");
      msg.className = "m3d-err";
      msg.innerHTML = "Could not draw it here: " + esc(e.message) + ".";
      canvas.parentNode.replaceChild(msg, canvas);
      return null;
    }
    return geo;
  }

  /* ── styles, injected once ───────────────────────────────────────────────────────────────
     Carried here rather than added to five stylesheets, because a module that installs itself
     into pages it cannot edit has to bring its own. Everything is expressed in the host page's
     CSS variables, so it takes on each tool's palette rather than imposing one. */
  var STYLE = ".m3d{margin-top:10px}"
    + ".m3d-canvas{display:block;width:100%;height:300px;border:1px solid var(--line,#333);"
    + "border-radius:10px;background:var(--bg,#111);cursor:grab;touch-action:none}"
    + ".m3d-canvas:active{cursor:grabbing}"
    + ".m3d-note{font-size:12px;color:var(--mut,#888);margin-top:6px;line-height:1.5}"
    + ".m3d-note b{color:var(--ink,#eee)}"
    + ".m3d-err{font-size:12px;color:var(--bad,#e55);line-height:1.5;"
    + "border:1px solid var(--line,#333);border-radius:10px;padding:12px;background:var(--bg,#111)}"
    /* No sizing here on purpose. Søren, 2026-09-01: "the button should be similar size and shape
       as the download 3D model button". Those buttons are sized by INLINE styles that differ per
       tool -- µJump's is `padding:1px 8px;font-size:11px;vertical-align:middle`, βJump's is
       `flex:1;min-width:150px` in a flex row -- so a fixed rule here could only ever match one of
       them. copyShape() below lifts each tool's own sizing off the button it sits beside. */
    + ".m3d-btn{}"
    /* ── THE CORNER BUTTONS ──────────────────────────────────────────────────────  2026-10-03
       The strip is pointer-events:none and only the buttons take pointers, because the canvas
       under it is turned by dragging and pinched to zoom: a strip that swallowed a drag starting
       anywhere near the corner would read as the model sticking. */
    + ".m3d-stage{position:relative}"
    + ".m3d-tools{position:absolute;top:8px;right:8px;display:flex;gap:5px;pointer-events:none}"
    + ".m3d-tool{pointer-events:auto;width:26px;height:26px;line-height:1;display:flex;"
    + "align-items:center;justify-content:center;font-size:14px;cursor:pointer;"
    + "border:1px solid var(--line,#333);border-radius:7px;background:var(--card,#1a1a1a);"
    + "color:var(--ink,#eee);opacity:.62;transition:opacity .15s,background .15s}"
    + ".m3d-tool:hover,.m3d-tool:focus-visible{opacity:1}"
    + ".m3d-tool.m3d-on{opacity:1;border-color:var(--accent,#49b0ff);color:var(--accent,#49b0ff)}"
  function injectStyle(){
    if (document.getElementById("m3d-style")) return;
    var s = document.createElement("style");
    s.id = "m3d-style"; s.textContent = STYLE;
    document.head.appendChild(s);
  }

  /* ── installing itself ───────────────────────────────────────────────────────────────────
     µJump, δJump, πJump and ηJump emit `<button class="idbtn meshdl" data-root="…">` for the
     mesh download, and βJump's is the same shape. So the button this module needs is always
     beside one that already carries the id, and the install is: find those, add a sibling.

     A MutationObserver rather than a one-off pass, because every one of these tools rebuilds its
     cell panel whenever you navigate to another cell -- a single sweep at load would decorate the
     first cell somebody looked at and nothing afterwards.

     `data-m3d` marks a button already dealt with. Without it the observer would re-decorate on
     every mutation, including the ones this module causes, which is a loop. */
  /* The inline properties worth copying from the download button: everything that decides how big
     the button is and how it sits in its row. NOT `display` -- that one is state, not shape, and
     is mirrored live below, because µJump/δJump/πJump render their download button hidden and
     reveal it only once a root id exists. */
  var SHAPE = ["padding","paddingTop","paddingRight","paddingBottom","paddingLeft",
               "fontSize","lineHeight","fontWeight","verticalAlign","borderRadius",
               "flex","flexGrow","flexShrink","flexBasis","minWidth","width",
               "marginLeft","marginRight","marginTop","marginBottom"];
  function copyShape(from, to){
    if (!from || !from.style) return;
    for (var i = 0; i < SHAPE.length; i++){
      var v = from.style[SHAPE[i]];
      if (v) to.style[SHAPE[i]] = v;
    }
  }

  function buttonFor(root, dl){
    var b = document.createElement("button");
    /* The tool's own classes minus `meshdl` -- so it inherits `idbtn` (and anything else the page
       styles its row buttons with) and does NOT match this module's own selector, which would
       otherwise make the observer decorate the button it just created, forever. */
    var cls = (dl && dl.className ? String(dl.className) : "idbtn")
                .replace(/\bmeshdl\b/g, " ").replace(/\s+/g, " ").trim() || "idbtn";
    b.className = cls + " m3d-btn";
    b.type = "button";
    b.textContent = "Show in 3D";
    b.title = "Draw this cell in the page, without leaving it";
    b.setAttribute("data-root", root);
    copyShape(dl, b);
    return b;
  }

  /* ── THE NUCLEUS, AND THE ONE BLUE IT IS ───────────────────────────────────────  2026-09-17
     Søren: *"show the nucleus when it is available? Nucleus should always be blue."*

     Not a new decision -- the export has said so since 2026-09-08, and this is the same value:
     blender/colour_policy.py, NUC_COLOR = "#3a72d8", "red MEANS vessel and blue MEANS nucleus, and
     the cell palette contains neither". A second blue chosen here would quietly make the page and
     the .blend disagree about what a colour means, which is worse than either being wrong alone. */
  var NUC_COLOR = "#3a72d8";
  var NUC_TINT = [0x3a / 255, 0x72 / 255, 0xd8 / 255];
  /* How see-through the cell goes WHEN there is a nucleus in it. Low enough to read a nucleus
     through, high enough that the cell is still a shape rather than a haze. */
  var CELL_ALPHA_WITH_NUCLEUS = 0.30;

  /* The nucleus mesh for a button's `data-nucid`, or null for every ordinary reason there might not
     be one: the tool does not write the attribute, the page has not loaded core/nucmesh.js, the
     volume publishes no meshes, or this nucleus has none. None of those is an error -- they all
     mean "draw the cell the way it was always drawn". */
  function nucleusMeshFor(nucId){
    if (!nucId || nucId === "0") return Promise.resolve(null);
    if (!(window.UJ && UJ.nucmesh && UJ.nucmesh.fetchNucleus)) return Promise.resolve(null);
    try {
      if (!UJ.nucmesh.configured()){
        var src = (UJ.cfg && UJ.cfg.em && UJ.cfg.em.nucSource) || (UJ.cfg && UJ.cfg.nucSource);
        if (!src) return Promise.resolve(null);
        UJ.nucmesh.configure({ nuc: src });
      }
      return UJ.nucmesh.fetchNucleus(nucId).catch(function(){ return null; });
    } catch (e){ return Promise.resolve(null); }
  }

  function install(opts){
    var o = opts || {};
    var fetcher = o.fetch || function(id, onProgress){
      if (!window.UJ || !UJ.mesh || !UJ.mesh.fetchCombinedMesh)
        return Promise.reject(new Error("core/mesh.js is not loaded on this page"));
      return UJ.mesh.fetchCombinedMesh(id, onProgress);
    };
    injectStyle();

    function decorate(dl){
      if (!dl || dl.getAttribute("data-m3d")) return;
      var root = dl.getAttribute("data-root");
      /* "0" is not a cell. βJump writes the segment id straight into the attribute and it is zero
         for a detection with no segmentation behind it -- offering to draw that would send
         somebody to fetch a mesh for a cell that does not exist. */
      if (!root || root === "0") return;
      dl.setAttribute("data-m3d", "1");
      var btn = buttonFor(root, dl);
      var host = document.createElement("div");
      host.className = "m3d-host";
      /* After the ROW the button sits in, not after the button: these panels are flex rows, and a
         300 px canvas dropped inside one lays out as a very tall column. */
      var row = dl.parentNode;
      if (row && row.parentNode) row.parentNode.insertBefore(host, row.nextSibling);
      else if (dl.parentNode) dl.parentNode.appendChild(host);
      /* BEFORE the download button, not after. Søren, 2026-09-01: "the Show in 3D should come
         before the download 3D model". Looking at a cell in the page is the cheap thing you do
         first; downloading a .glb is what you do once you know you want it. */
      dl.parentNode.insertBefore(btn, dl);

      /* MIRROR THE TOOL'S OWN JUDGEMENT, on two counts.

         `disabled`: every one of these tools disables its mesh-download button when it knows
         there is no mesh -- βJump meshes only about half its segments, and says so by disabling.
         Ignoring that would offer a 3D view for cells the page has already worked out do not have
         one, and the person would get a fetch failure instead of a button that was never enabled.

         `display`: µJump, δJump and πJump render the download button HIDDEN and reveal it only
         once at least one root id exists for the cell. A "Show in 3D" that stayed visible beside
         an invisible sibling would be a button for a cell that has nothing to draw.

         Watched rather than read once, because the tools set both as their panels render. */
      function mirror(){
        btn.disabled = !!dl.disabled;
        var d = dl.style ? dl.style.display : "";
        if (btn.style.display !== d) btn.style.display = d;
        if (host.style.display !== d) host.style.display = d;
      }
      mirror();
      if (window.MutationObserver)
        new MutationObserver(mirror).observe(dl, { attributes:true,
                                                   attributeFilter:["disabled","style"] });

      btn.addEventListener("click", function(){
        if (btn.disabled) return;
        btn.disabled = true;
        var label = btn.textContent;
        btn.textContent = "loading…";
        host.innerHTML = "<div class='m3d'><div class='m3d-note'>fetching the mesh…</div></div>";
        fetcher(root, function(frac, msg){
          btn.textContent = msg ? String(msg).slice(0, 22)
                                : "loading… " + Math.round((frac || 0) * 100) + "%";
        }).then(function(m){
          var geo = prepare(m.positions, m.indices,
            { unitNm: o.unitNm === undefined ? 1000 : o.unitNm, extentNm: o.extentNm });
          var lead = o.lead ? o.lead(root, m, geo) : null;
          /* A fragment that did not load is not a footnote. Søren, 2026-09-09, on πJump: "I tried
             Show in 3D and it had not included the root ID I submitted." It had tried; the mesh
             behind that ID is 128 fragments and over 192 MB, and fetchCombinedMesh dropped it and
             drew the rest without a word. Drawing one of two fragments and saying nothing is the
             one outcome that reads as the proposal having been ignored. */
          /* A cell that arrived only because it was decimated says so, in the same place the
             size line is -- the panel is where somebody decides whether to trust what they see. */
          if (m.simplified && m.simplified.length){
            var g = Math.max.apply(null, m.simplified.map(function(s){ return s.gridUm; }));
            var kept = m.simplified.reduce(function(a,s){ return a + (s.toVertices||0); }, 0);
            var from = m.simplified.reduce(function(a,s){ return a + (s.fromVertices||0); }, 0);
            lead = (lead ? lead + "<br>" : "")
              + "<b>Simplified to fit.</b> <span class='hint'>This mesh was too large to download "
              + "whole, so vertices were merged onto a " + g.toFixed(2) + " µm grid ("
              + from.toLocaleString() + " → " + kept.toLocaleString()
              + " vertices). The shape is right; fine detail is not. Open it in Neuroglancer for "
              + "the published geometry.</span>";
          }
          if (m.skipped && m.skipped.length){
            lead = (lead ? lead + "<br>" : "")
              + "<b style='color:var(--bad)'>" + m.skipped.length + " proposed root ID"
              + (m.skipped.length > 1 ? "s are" : " is") + " not drawn here.</b> <span class='hint'>"
              + m.skipped.map(function(s){
                  return esc(s.rootId || "(unknown)") + " — " + esc(s.message); }).join("; ")
              + "</span>";
          }
          /* THE NUCLEUS, WHEN THERE IS ONE. Prepared in the CELL'S frame -- see prepare's
             `frame` option -- because a nucleus centred on itself would sit in the middle of the
             picture rather than where it is in the cell, which looks right and is a lie. */
          var nucId = dl.getAttribute("data-nucid") || "";
          return nucleusMeshFor(nucId).then(function(nm){
            var opts2 = { lead: lead, emptyMessage: "This cell has no mesh geometry to draw." };
            if (nm && nm.positions && nm.positions.length){
              var ng = prepare(nm.positions, nm.indices,
                               { unitNm: 1000, frame: { mid: geo.mid, span: geo.span } });
              if (!ng.empty){
                opts2.ghosts = [{ geo: ng, tint: NUC_TINT, alpha: 1 }];
                /* The cell goes see-through ONLY now that there is something inside it to see --
                   the notebook's rule, and for its reason: transparency with nothing behind it
                   costs contrast and shows nothing. */
                opts2.alpha = CELL_ALPHA_WITH_NUCLEUS;
                opts2.lead = (lead ? lead + "<br>" : "")
                  + "<span class='hint'>Nucleus " + esc(nucId) + " is drawn in "
                  + "<b style='color:" + NUC_COLOR + "'>blue</b>, and the cell around it is "
                  + "see-through so you can see it. Blue always means nucleus here and in the "
                  + "Blender export.</span>";
              }
            }
            show(host, geo, opts2);
          });
        }).catch(function(e){
          host.innerHTML = "<div class='m3d'><div class='m3d-err'>Could not load the mesh: "
            + esc(e && e.message ? e.message : e) + "</div></div>";
        }).then(function(){ btn.disabled = false; btn.textContent = label; });
      });
    }

    function sweep(){
      var all = document.querySelectorAll(o.selector || ".meshdl[data-root]");
      Array.prototype.forEach.call(all, decorate);
    }
    sweep();
    if (window.MutationObserver){
      var mo = new MutationObserver(function(){ sweep(); });
      mo.observe(document.body || document.documentElement,
                 { childList:true, subtree:true });
    }
    return { sweep: sweep };
  }

  /* Auto-install on a page that has core/mesh.js, unless the page says not to. χJump sets
     UJ.mesh3dNoAutoInstall because it drives the panel from its own assembly UI rather than from
     a download button. */
  function autoInstall(){
    if (window.UJ && UJ.mesh3dNoAutoInstall) return;
    if (!(window.UJ && UJ.mesh && UJ.mesh.fetchCombinedMesh)) return;
    install({});
  }
  if (typeof document !== "undefined"){
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", autoInstall);
    else autoInstall();
  }

  return { prepare: prepare, draw: draw, show: show, install: install, probe: probe,
           sweep: sweepAgain,
           probePixels: probePixels, NUC_TINT: NUC_TINT, NUC_COLOR: NUC_COLOR,
           pointInGeometry: pointInGeometry, nucleiInside: nucleiInside,
           injectStyle: injectStyle, themeTint: themeTint, themeBg: themeBg };
})();
