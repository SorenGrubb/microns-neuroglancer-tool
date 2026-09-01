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
    var mid = [(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, (lo[2]+hi[2])/2];
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
    return { pos: pos, idx: idx, nrm: nrm, lo: lo, hi: hi, mid: mid, centred: true,
             span: Math.max(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) || 1,
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
    "uniform mat4 mvp; uniform mat4 mv; varying vec3 vn;",
    "void main(){ vn = normalize((mv * vec4(n, 0.0)).xyz);",
    "  gl_Position = mvp * vec4(p, 1.0); }"
  ].join("\n");
  /* Two lights and a rim term. A single headlight flattens a tubular neurite into a silhouette,
     which is exactly the shape information somebody opens this panel to judge. Two-sided, because
     these meshes come from automatic segmentation and their winding is not guaranteed consistent
     -- with culling on, a fragment wound the other way renders as a HOLE, and a hole in a cell is
     precisely what somebody might be looking for. */
  var FS = [
    "precision mediump float; varying vec3 vn; uniform vec3 tint;",
    "void main(){ vec3 n = normalize(vn); if (!gl_FrontFacing) n = -n;",
    "  float key  = max(dot(n, normalize(vec3( 0.4, 0.6, 0.8))), 0.0);",
    "  float fill = max(dot(n, normalize(vec3(-0.5,-0.3, 0.4))), 0.0) * 0.35;",
    "  float rim  = pow(1.0 - abs(n.z), 3.0) * 0.35;",
    "  gl_FragColor = vec4(tint * (0.18 + key * 0.75 + fill) + rim, 1.0); }"
  ].join("\n");

  function compile(gl, type, src){
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("shader: " + gl.getShaderInfoLog(s));
    return s;
  }

  var LAST = null;
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

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    function buf(data, target){
      var b = gl.createBuffer();
      gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b;
    }
    var pb = buf(geo.pos, gl.ARRAY_BUFFER), nb = buf(geo.nrm, gl.ARRAY_BUFFER);
    var ib = buf(big ? geo.idx : new Uint16Array(geo.idx), gl.ELEMENT_ARRAY_BUFFER);
    var aP = gl.getAttribLocation(prog, "p"), aN = gl.getAttribLocation(prog, "n");
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN);
    var uMvp = gl.getUniformLocation(prog, "mvp"), uMv = gl.getUniformLocation(prog, "mv"),
        uTint = gl.getUniformLocation(prog, "tint");
    gl.enable(gl.DEPTH_TEST);

    var norm = modelScale(1 / (geo.span || 1));
    var view = { yaw: 0.6, pitch: 0.3, dist: 1.9 };
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
      gl.clearColor(b2[0], b2[1], b2[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var mv = mul(translate(0, 0, -view.dist), mul(rotX(view.pitch), mul(rotY(view.yaw), norm)));
      gl.uniformMatrix4fv(uMvp, false, mul(perspective(0.9, w/h, 0.01, 100), mv));
      gl.uniformMatrix4fv(uMv, false, mv);
      gl.uniform3fv(uTint, o.tint || themeTint());
      gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.drawElements(gl.TRIANGLES, geo.idx.length, big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    }

    var down = null;
    canvas.addEventListener("pointerdown", function(e){
      down = { x:e.clientX, y:e.clientY, yaw:view.yaw, pitch:view.pitch };
      try { canvas.setPointerCapture(e.pointerId); } catch(_e){}
    });
    canvas.addEventListener("pointermove", function(e){
      if (!down) return;
      view.yaw = down.yaw + (e.clientX - down.x) * 0.01;
      /* Clamped short of the poles: past them the model appears to spin the wrong way, which
         reads as a bug in the mesh rather than in the camera. */
      view.pitch = Math.max(-1.5, Math.min(1.5, down.pitch + (e.clientY - down.y) * 0.01));
      paint();
    });
    canvas.addEventListener("pointerup", function(){ down = null; });
    canvas.addEventListener("pointercancel", function(){ down = null; });
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
    LAST = { gl: gl, paint: paint, canvas: canvas };
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

  function esc(s){ return String(s == null ? "" : s)
    .replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  /* ── the panel ─────────────────────────────────────────────────────────────────────────── */
  function show(host, geo, opts){
    var o = opts || {};
    if (!host) return null;
    if (!geo || geo.empty){
      host.innerHTML = "<div class='m3d'><div class='m3d-err'>"
        + esc(o.emptyMessage || "No mesh geometry for this cell.") + "</div></div>";
      return null;
    }
    host.innerHTML = "<div class='m3d'><canvas class='m3d-canvas'></canvas>"
      + "<div class='m3d-note'></div></div>";
    var canvas = host.querySelector(".m3d-canvas"), note = host.querySelector(".m3d-note");
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
    + ".m3d-btn{}";
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
          show(host, geo, { lead: o.lead ? o.lead(root, m, geo) : null,
                            emptyMessage: "This cell has no mesh geometry to draw." });
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
           pointInGeometry: pointInGeometry, nucleiInside: nucleiInside,
           injectStyle: injectStyle, themeTint: themeTint, themeBg: themeBg };
})();
