# -*- coding: utf-8 -*-
u"""A tracing you can open in Blender, one or all of them.                              2026-10-10

Søren, on the dataset list: *"There should also be an option to download the tracing as a 3D
model. Either as a lone 3D model or as a combined 3D model of all in that cell. If combined, the
cell should be transparent to show the organelles inside it."*

The zip has carried an OBJ per tracing since it was built, and an OBJ is one object with no colour
and no transparency -- so "all of them in one file, with the cell see-through" is not something
five of them can be made into. GLB is: one binary file, several meshes, a material each, alpha on
the ones that enclose something. It opens in Blender, in PowerPoint, in any web viewer, and it is
the format the Blender notebook already hands back.

THREE THINGS THAT ARE EASY TO GET WRONG AND SILENT WHEN YOU DO:

  Y. Neuroglancer's y increases DOWNWARD -- y=0 is the pia -- and glTF is Y-up, so a model fed
     straight through opens upside down. core/mesh.js learned this in August (Søren reported it)
     and carries a long comment about it; mirroring one axis also flips triangle winding, so each
     triangle's last two indices swap back. The same two corrections apply here, because these
     contours are in the same frame as those meshes.

  UNITS. The OBJ in the zip is nanometres and stays nanometres -- it is documented in that zip's
     README and something may already read it. For a GLB that is the wrong choice: a 15 µm cell
     becomes 15,000 units across and sits 1.6 MILLION units from the origin, which in Blender's
     default viewport is an invisible speck past the clip plane. So the GLB is MICROMETRES,
     centred on its own middle -- the unit the Blender notebook already standardised on -- and the
     voxel it was moved from travels in asset.extras so the coordinate is not lost.

  THE ORDER OF ALPHA. A transparent cell with solid organelles inside it only reads correctly if
     the cell is the transparent one. Whole cell and nucleus enclose things; organelles do not.
     The cell is 0.22, the nucleus 0.4, everything else solid -- and a lone export of an enclosing
     structure is solid too, because there is nothing inside it to see.

A THIRD GLB WRITER, AND WHY. core/mesh.js and core/synmesh.js each have one. Both are
single-mesh, material-less, and fed Draco-decoded typed arrays with their own flip already
applied; neither can write what this needs, and converting them to call this one is a separate
job with its own checks on two download paths I would be changing blind. So this is written once,
in core/traceloft.js beside the lofter that produces its input, and the honest note is here: there
are now three, and the other two are the ones to fold in next.

Check: glbcheck.js (new)
Run: python3 src/a_tracing_you_can_open_in_blender.py
     python3 src/build_stamps.py
     node glbcheck.js
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
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


GLB = u'''  /* ── CONTOURS TO A GLB, SEVERAL AT ONCE ─────────────────  2026-10-10
     Søren: *"an option to download the tracing as a 3D model. Either as a lone 3D model or as a
     combined 3D model of all in that cell. If combined, the cell should be transparent to show
     the organelles inside it."*

     Here rather than in the card because the input is this file's own output: loft() turns a
     contour stack into positions and indices, and this is the next step. One call writes one
     tracing or a whole cell's worth.

     parts: [{name, rings, color, alpha}] -- or {name, positions, indices, ...} for geometry
     already in hand. resNm scales voxels to nanometres. Returns a Uint8Array.

     MICROMETRES, CENTRED. Nanometres would put a 15 µm cell 15,000 units across and 1.6 million
     units from the origin -- past Blender's default clip plane, so the file opens on an empty
     grid and looks broken. One offset for the whole file, so a combined export stays assembled,
     and the voxel it was moved from is written into asset.extras.

     Y IS FLIPPED, winding with it. Neuroglancer's y increases downward and glTF is Y-up; a model
     fed straight through opens upside down, which core/mesh.js found out the hard way in August.

     THERE ARE NOW THREE GLB WRITERS in this project -- core/mesh.js and core/synmesh.js have one
     each. Theirs are single-mesh and material-less and take Draco-decoded arrays with their own
     flip already applied, so neither could write this; folding them into this one is a real job
     with its own checks and is not done. Said out loud rather than left to be rediscovered.
     See src/a_tracing_you_can_open_in_blender.py. */
  function hexRgb(c){
    var s = String(c || "").trim().replace(/^#/, "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-f]{6}$/i.test(s)) return [0.6, 0.6, 0.6];
    /* sRGB to linear, because glTF baseColorFactor is linear and a hex pasted straight in comes
       out washed out next to anything rendered properly. */
    return [0, 2, 4].map(function(i){
      var v = parseInt(s.substr(i, 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
  }
  function glb(parts, resNm){
    var res = (Array.isArray(resNm) && resNm.length === 3) ? resNm : [1, 1, 1];
    var built = [];
    (parts || []).forEach(function(q){
      if (!q) return;
      var g = (q.positions && q.indices) ? q : null;
      if (!g){
        try { g = loft(q.rings || [], res); } catch (_e){ g = null; }
      }
      if (!g || !g.positions || !g.positions.length || !g.indices || !g.indices.length) return;
      /* NANOMETRES PER UNIT of this part's own numbers. The lofter's output is nanometres, so
         1 is the default and every existing caller is unchanged; core/mesh.js's is micrometres,
         so its parts say 1000. Declared per part rather than per file because one file holds
         both \u2014 three sources, two frames. 2026-10-10. */
      var sc = Number(q.scaleToNm);
      if (!(sc > 0)) sc = 1;
      built.push({ name: String(q.name || "structure"), color: q.color,
                   alpha: (q.alpha === undefined || q.alpha === null) ? 1 : Number(q.alpha),
                   scale: sc, positions: g.positions, indices: g.indices });
    });
    if (!built.length) return null;
    /* ONE CENTRE FOR THE WHOLE FILE, in nanometres, so the parts stay assembled. */
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    built.forEach(function(q){
      for (var i = 0; i < q.positions.length; i += 3)
        for (var k = 0; k < 3; k++){
          var v = q.positions[i + k] * q.scale;
          if (v < lo[k]) lo[k] = v;
          if (v > hi[k]) hi[k] = v;
        }
    });
    var mid = [0, 1, 2].map(function(k){ return (lo[k] + hi[k]) / 2; });
    var NM_PER_UM = 1000;
    var chunks = [], accessors = [], bufferViews = [], meshes = [], nodes = [], materials = [];
    var off = 0;
    var push = function(bytes, target){
      var pad = (4 - (off % 4)) % 4;
      if (pad){ chunks.push(new Uint8Array(pad)); off += pad; }
      var view = { buffer: 0, byteOffset: off, byteLength: bytes.byteLength };
      if (target) view.target = target;
      bufferViews.push(view);
      chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      off += bytes.byteLength;
      return bufferViews.length - 1;
    };
    built.forEach(function(q, qi){
      var n = q.positions.length / 3;
      var pos = new Float32Array(q.positions.length);
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (var i = 0; i < q.positions.length; i += 3){
        var x = (q.positions[i] * q.scale - mid[0]) / NM_PER_UM;
        /* THE FLIP. */
        var y = -(q.positions[i + 1] * q.scale - mid[1]) / NM_PER_UM;
        var z = (q.positions[i + 2] * q.scale - mid[2]) / NM_PER_UM;
        pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
        if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x;
        if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y;
        if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z;
      }
      /* ...and the winding back, or every face is lit from inside. */
      var idx = new Uint32Array(q.indices.length);
      for (var t = 0; t + 2 < q.indices.length; t += 3){
        idx[t] = q.indices[t]; idx[t + 1] = q.indices[t + 2]; idx[t + 2] = q.indices[t + 1];
      }
      var ivRef = push(idx, 34963), pvRef = push(pos, 34962);
      accessors.push({ bufferView: ivRef, componentType: 5125, count: idx.length, type: "SCALAR" });
      accessors.push({ bufferView: pvRef, componentType: 5126, count: n, type: "VEC3",
                       min: mn, max: mx });
      var rgb = hexRgb(q.color), a = Math.max(0, Math.min(1, q.alpha));
      materials.push({ name: q.name,
        doubleSided: true,
        alphaMode: a < 1 ? "BLEND" : "OPAQUE",
        pbrMetallicRoughness: { baseColorFactor: [rgb[0], rgb[1], rgb[2], a],
                                metallicFactor: 0, roughnessFactor: 0.75 } });
      meshes.push({ name: q.name, primitives: [{ attributes: { POSITION: qi * 2 + 1 },
                                                 indices: qi * 2, material: qi, mode: 4 }] });
      nodes.push({ mesh: qi, name: q.name });
    });
    var binLength = off;
    var json = {
      asset: { version: "2.0", generator: "grubblab tracing card",
               extras: { units: "micrometres", yFlipped: true,
                         centreVoxel: [Math.round(mid[0] / res[0]), Math.round(mid[1] / res[1]),
                                       Math.round(mid[2] / res[2])],
                         centreNm: mid.map(function(v){ return Math.round(v); }),
                         note: "Moved to the origin and scaled to micrometres so it opens inside "
                             + "a default viewport; y is negated for glTF's Y-up. centreVoxel is "
                             + "where it came from, in this tool's voxels." } },
      scene: 0, scenes: [{ nodes: nodes.map(function(_, i){ return i; }) }],
      nodes: nodes, meshes: meshes, materials: materials,
      accessors: accessors, bufferViews: bufferViews,
      buffers: [{ byteLength: binLength }]
    };
    var jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    var jPad = (4 - (jsonBytes.length % 4)) % 4;
    if (jPad){
      var padded = new Uint8Array(jsonBytes.length + jPad);
      padded.set(jsonBytes); padded.fill(0x20, jsonBytes.length);
      jsonBytes = padded;
    }
    var binPad = (4 - (binLength % 4)) % 4;
    var total = 12 + 8 + jsonBytes.length + 8 + binLength + binPad;
    var out = new Uint8Array(total), dv = new DataView(out.buffer);
    var o = 0;
    dv.setUint32(o, 0x46546C67, true); o += 4;     // "glTF"
    dv.setUint32(o, 2, true); o += 4;
    dv.setUint32(o, total, true); o += 4;
    dv.setUint32(o, jsonBytes.length, true); o += 4;
    dv.setUint32(o, 0x4E4F534A, true); o += 4;     // "JSON"
    out.set(jsonBytes, o); o += jsonBytes.length;
    dv.setUint32(o, binLength + binPad, true); o += 4;
    dv.setUint32(o, 0x004E4942, true); o += 4;     // "BIN"
    chunks.forEach(function(c){ out.set(c, o); o += c.byteLength; });
    return out;
  }
'''

OLD_RET = u'''  return { loft: loft, volume: volume, shape: shape, shape3d: shape3d,'''
NEW_RET = (GLB + u'''  return { loft: loft, volume: volume, shape: shape, shape3d: shape3d,
           glb: glb, glbParts: glbParts, blenderPy: blenderPy,''')

# ── THE INSERT-THEN-EDIT TRAP, AND WHY THIS IS ONE INSERTION ──────  2026-10-10
# edit()'s guard is `if new in s`, and `new` here is the WHOLE inserted block. An edit made INSIDE
# that block afterwards changes it, the guard stops matching, and the next run inserts a SECOND
# copy -- which in JavaScript WINS, because a later function declaration overwrites the earlier.
# That is exactly what happened here: the unit fix went into the first copy and the page ran the
# second, so glbcheck.js went red with the symptom of a bug that had already been fixed, and the
# file on disk looked correct to grep.
#
# So the block is written FINAL and inserted once, and the insertion is guarded on the function's
# own signature, which nothing edits. The assertions below are the part that matters: if a fourth
# copy ever appears, this says so instead of the browser quietly running the wrong one.
_P = os.path.join(HERE, "core/traceloft.js")
if u"function glb(parts, resNm){" in io.open(_P, encoding="utf-8").read():
    print("core/traceloft.js\n  already there: the GLB writer")
else:
    edit("core/traceloft.js", [
        (u"the GLB writer, beside the lofter that feeds it", OLD_RET, NEW_RET),
    ])
_t = io.open(_P, encoding="utf-8").read()
assert _t.count(u"function glb(parts, resNm){") == 1, \
    "core/traceloft.js has %d copies of glb()" % _t.count(u"function glb(parts, resNm){")
assert _t.count(u"function hexRgb(c){") == 1, "core/traceloft.js has two hexRgb()"
assert _t.count(u"q.scale") == 5, "the glb() in core/traceloft.js is not the scaled one"
print("done 1")

# ── 2. the two buttons, and the one rule about alpha ──────────────────────────────────────────
MAKERS = u'''/* ── WHICH THINGS YOU CAN SEE THROUGH ───────────────────  2026-10-10
   Søren: *"If combined, the cell should be transparent to show the organelles inside it."*

   Only the structures that ENCLOSE something are see-through, and only when there is something
   inside them to see: a whole cell exported on its own is solid, because a transparent object
   alone in a scene is just a faint one. The same two kinds the rest of this file treats as "the
   cell rather than something in it", asked once.

   The numbers are the Blender scene's: the cell well back so three organelles read through it,
   the nucleus less so because it is a thing you also want to see the shape of. */
/* THE ONE SENTENCE ABOUT A MISSING IMPORTER.  2026-10-10. Søren, after finding his own
   Blender had no glTF entry: *"if my blender is missing it, then other people are also
   missing it. it should be plug and play."* It cannot be plug and play — nothing but a
   .blend opens Blender by double-click — but it can stop being a puzzle. The remedy is one
   tick, so the page says it rather than leaving each person to work it out: on the button
   before the click, and in the line after it. ONE string, so the two cannot drift. */
var TRACING_GLTF_HELP = "If Blender has no glTF 2.0 under File \\u203a Import, tick Import-Export: glTF 2.0 format in Edit \\u203a Preferences \\u203a Add-ons \\u2014 or use Blender script, which needs no add-on.";
function tracingGlbAlpha(kind, alone){
  var k = String(kind || "").toLowerCase();
  if (alone) return 1;
  if (k === "cell") return 0.22;
  if (k === "nucleus") return 0.4;
  return 1;
}
/* The parts list a GLB is written from, in the order they should be read: the cell, then its
   nucleus, then everything else as it is listed. One place, so the lone and the combined export
   cannot disagree about colour, name or alpha. */
function tracingGlbParts(got, alone){
  var rank = function(k){
    k = String(k || "").toLowerCase();
    return k === "cell" ? 0 : (k === "nucleus" ? 1 : 2);
  };
  var parts = [];
  (got || []).forEach(function(x){
    if (!x || x.error || !x.st || !(x.st.rings || []).length) return;
    var t = x.t || {}, st = x.st;
    var kind = st.kind || t.kind || t.instanceOf || "";
    parts.push({ name: st.name || t.name || x.sid, kind: kind,
                 color: t.color || st.color || "#3a6b5a",
                 alpha: tracingGlbAlpha(kind, alone), rings: st.rings });
  });
  parts.sort(function(a, b){ return rank(a.kind) - rank(b.kind); });
  return parts;
}
function tracingGlbSave(parts, filename){
  var res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
  var bytes = UJ.traceloft.glb(parts, res);
  if (!bytes) return 0;
  tracingSaveBlob(new Blob([bytes], { type: "model/gltf-binary" }), filename);
  return parts.length;
}
/* One tracing, on its own. Solid: there is nothing inside it to look through it at. */
async function tracingOneGlb(sid, btn, fmt){
  var label = btn ? btn.textContent : "";
  try {
    if (btn){ btn.disabled = true; btn.textContent = "meshing\\u2026"; }
    var x = Object.assign({ sid: sid }, await tracingFetchShared(sid));
    var parts = tracingGlbParts([x], true);
    if (!parts.length) throw new Error("that tracing has no contours to mesh");
    var base = tracingSafeName(parts[0].name) + "__" + tracingSafeName(sid) + "_um";
    var n = (fmt === "py") ? tracingPySave(parts, base + "_blender.py", parts[0].name)
                           : tracingGlbSave(parts, base + ".glb");
    tracingSay(n ? ((fmt === "py")
                    ? "Saved " + parts[0].name + " as a Blender script \\u2014 open it in "
                      + "Blender\\u2019s Scripting tab and press Run. Micrometres."
                    : "Saved " + parts[0].name + " as a 3D model (GLB, micrometres, centred on "
                      + "itself). Blender: File \\u203a Import \\u203a glTF 2.0. " + TRACING_GLTF_HELP)
                 : "Nothing could be meshed from that tracing.", !n);
  } catch (e){
    tracingSay("Could not make the 3D model: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}
/* Every tracing of one cell in one file, the cell see-through. */
async function tracingCellGlb(g, btn, fmt){
  if (!g || !g.items.length) return;
  var label = btn ? btn.textContent : "";
  try {
    var got = await tracingFetchCell(g.items.map(function(x){ return x.t.structureId; }), btn);
    if (btn){ btn.disabled = true; btn.textContent = "meshing\\u2026"; }
    var parts = tracingGlbParts(got, false);
    if (!parts.length) throw new Error("none of this cell\\u2019s tracings could be read");
    /* THE SEGMENTATION FIRST, so the see-through cell is the outermost thing in the file and the
       list reads from the outside in. */
    var missed = [];
    if (btn) btn.textContent = "fetching the cell\\u2026";
    var segs = await tracingSegParts(g, missed);
    parts = segs.concat(parts);
    if (btn) btn.textContent = "meshing\\u2026";
    var cell = tracingSafeName(g.coord ? "cell_at_" + g.coord.split(",").join("_")
                 : (g.nuc ? "nucleus_" + g.nuc : (g.root ? "root_" + g.root : "no_cell")));
    var title = g.coord ? ("cell at " + g.coord) : (g.nuc ? ("nucleus " + g.nuc)
                 : (g.root ? ("segment " + g.root) : "traced structures"));
    var n = (fmt === "py") ? tracingPySave(parts, cell + "_um_blender.py", title)
                           : tracingGlbSave(parts, cell + "_um.glb");
    var see = parts.filter(function(q){ return q.alpha < 1; }).length;
    tracingSay("Saved " + cell + (fmt === "py" ? "_um_blender.py" : "_um.glb")
      + " \\u2014 " + n + " structure" + (n === 1 ? "" : "s")
      + " in one file"
      + (see ? ", with the " + parts.filter(function(q){ return q.alpha < 1; })
                 .map(function(q){ return q.name.toLowerCase(); }).join(" and ")
             + " see-through so what is inside shows." : ".")
      + " Micrometres, centred on itself."
      + ((fmt === "py") ? "" : " " + TRACING_GLTF_HELP)
      + (missed.length ? " Could not fetch " + missed.join(", ") + "." : "")
      + tracingFailedSay(got));
  } catch (e){
    tracingSay("Could not make the 3D model: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}
async function tracingCellZip(g, btn){'''

if u"async function tracingCellGlb(" in io.open(
        os.path.join(HERE, "core/tracingcard.js"), encoding="utf-8").read():
    MAKERS_PAIRS = []
    print("core/tracingcard.js\n  already there: the two makers and the one alpha rule")
else:
    MAKERS_PAIRS = [(u"the two makers and the one alpha rule",
                     u"async function tracingCellZip(g, btn){", MAKERS)]
_BTN_PAIRS = [] if u'class="idbtn tracingcellglb"' in io.open(
        os.path.join(HERE, "core/tracingcard.js"), encoding="utf-8").read() else [
    (u"the combined button on the cell row",
     u'''          + '<button class="idbtn tracingcellzip" data-g="' + gi + '" ' + TRACING_BTN + ' title="A zip '
            + 'of this cell: each tracing&rsquo;s contours (JSON), a mesh of each (OBJ, nm), and an '
            + 'index.">Download zip</button>\'''',
     u'''          + '<button class="idbtn tracingcellglb" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell as ONE 3D model (GLB) \\u2014 the cell and its nucleus see-through so '
            + 'the organelles inside them show, each in the colour it was drawn in. Micrometres, centred '
            + 'on itself, so it opens inside the viewport in Blender, PowerPoint or any glTF viewer. '
            + escHtml(TRACING_GLTF_HELP) + '">'
            + '3D model</button>'
          + '<button class="idbtn tracingcellzip" data-g="' + gi + '" ' + TRACING_BTN + ' title="A zip '
            + 'of this cell: each tracing&rsquo;s contours (JSON), a mesh of each (OBJ, nm), and an '
            + 'index.">Download zip</button>\''''),
    (u"...and the lone one on every tracing",
     u'''                + '<button class="idbtn tracingngl" data-sid="' + escHtml(t.structureId) + '" '
                  + TRACING_BTN + ' title="Open this tracing in the viewer, as an annotation layer in '
                  + 'its own colour — without taking it onto your pad.">Neuroglancer</button>\'''',
     u'''                + '<button class="idbtn tracingngl" data-sid="' + escHtml(t.structureId) + '" '
                  + TRACING_BTN + ' title="Open this tracing in the viewer, as an annotation layer in '
                  + 'its own colour — without taking it onto your pad.">Neuroglancer</button>'
                + '<button class="idbtn tracingglb" data-sid="' + escHtml(t.structureId) + '" '
                  + TRACING_BTN + ' title="This one tracing as a 3D model (GLB), solid, in its own '
                  + 'colour. Micrometres, centred on itself. ' + escHtml(TRACING_GLTF_HELP)
                  + '">3D model</button>'''),
    (u"...both wired",
     u'''  [].slice.call(host.querySelectorAll(".tracingngl")).forEach(function(b){
    b.addEventListener("click", function(){ tracingSharedInViewer(b.dataset.sid, b); });
  });''',
     u'''  [].slice.call(host.querySelectorAll(".tracingngl")).forEach(function(b){
    b.addEventListener("click", function(){ tracingSharedInViewer(b.dataset.sid, b); });
  });
  [].slice.call(host.querySelectorAll(".tracingglb")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOneGlb(b.dataset.sid, b); });
  });'''),
    (u"...and the cell's one wired beside the zip",
     u'''  [].slice.call(host.querySelectorAll(".tracingcellzip")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellZip(groups[Number(b.dataset.g)], b); });
  });''',
     u'''  [].slice.call(host.querySelectorAll(".tracingcellglb")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellGlb(groups[Number(b.dataset.g)], b); });
  });
  [].slice.call(host.querySelectorAll(".tracingcellzip")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellZip(groups[Number(b.dataset.g)], b); });
  });'''),
]
edit("core/tracingcard.js", MAKERS_PAIRS + _BTN_PAIRS)
print("done 2")

# ── 4. and the segmentation travels with the combined one ─────────────────────────────────────
NUCS = u'''/* ── THE COMMUNITY'S NUCLEUS IDS, THE OTHER HALF OF THE SAME PANEL ──  2026-10-10
   The propose/vote panel takes four segTypes — img65, img35, nucleus65, nucleus35 — off one
   `?rootIds=<nucleus>` read. tracingExtraRootsFor() above asks the page for the ROOT half, which
   each page filters to its own segmentation's name; nothing asked for the nucleus half, because
   until now nothing combined nucleus meshes. Anything whose segType begins "nucleus" is one,
   which is dataset-agnostic in the way a hardcoded "nucleus65" would not be.
   See src/a_tracing_you_can_open_in_blender.py. */
var TRACING_PROPOSED_NUCS = {};
function tracingProposedNucsFor(nuc){
  nuc = String(nuc || "");
  if (!nuc || typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT)
    return Promise.resolve([]);
  if (!TRACING_PROPOSED_NUCS[nuc]){
    TRACING_PROPOSED_NUCS[nuc] = fetch(REPORT_ENDPOINT + "?rootIds=" + encodeURIComponent(nuc)
                                       + tracingDsQS())
      .then(function(r){ return r.json(); })
      .then(function(d){
        var seen = {}; seen[nuc] = 1;
        var out = [];
        ((d && d.rootIds) || []).forEach(function(x){
          var id = String((x && x.rootId) || ""), st = String((x && x.segType) || "");
          if (!id || seen[id] || st.indexOf("nucleus") !== 0) return;
          seen[id] = 1; out.push(id);
        });
        return out;
      }, function(){ delete TRACING_PROPOSED_NUCS[nuc]; return []; });
  }
  return TRACING_PROPOSED_NUCS[nuc];
}
/* ── THE PUBLISHED MESHES, FOR THE COMBINED EXPORT ONLY ─────────  2026-10-10
   Søren: *"it would be nice if it opens the 3D model together with the RootID and Nucleus ID
   also, and that root ID is transparent to show the nucleus and organelles... That is only for
   the 3D model for all, not for the individual organelle ones."*

   Best-effort, every one of them: a cell with no mesh in the snapshot, a dataset with no nucleus
   volume, a page without core/mesh.js — all ordinary, and none of them is a reason to withhold
   the tracings he actually drew. What could not be fetched is named in the line afterwards rather
   than thrown, because a file silently missing its cell looks like a file that never had one. */
async function tracingSegParts(g, missed){
  var out = [];
  var root = String((g && g.root) || ""), nuc = String((g && g.nuc) || "");
  if (root && window.UJ && UJ.mesh && typeof UJ.mesh.fetchCombinedMesh === "function"){
    try {
      var extra = [];
      try { extra = (await tracingExtraRootsFor(nuc, root)) || []; } catch (_ex){ extra = []; }
      var m = await UJ.mesh.fetchCombinedMesh(root, null, false, extra);
      if (m && m.positions && m.positions.length)
        /* MICROMETRES — core/mesh.js's own frame, stated at its nm -> µm line. */
        out.push({ name: "Cell (segmentation)", kind: "cell", color: "#ff3b3b", alpha: 0.15,
                   scaleToNm: 1000, positions: m.positions, indices: m.indices });
    } catch (e){ missed.push("the cell mesh (" + String(e && e.message || e) + ")"); }
  }
  if (nuc && window.UJ && UJ.nucmesh && typeof UJ.nucmesh.fetchNucleus === "function"
      && (typeof UJ.nucmesh.configured !== "function" || UJ.nucmesh.configured())){
    var ids = [nuc];
    try { ((await tracingProposedNucsFor(nuc)) || []).forEach(function(x){ ids.push(x); }); }
    catch (_en){}
    var pos = [], idx = [], base = 0;
    for (var i = 0; i < ids.length; i++){
      try {
        var nm = await UJ.nucmesh.fetchNucleus(ids[i]);
        if (!nm || !nm.positions || !nm.positions.length) continue;
        for (var a = 0; a < nm.positions.length; a++) pos.push(nm.positions[a]);
        for (var b2 = 0; b2 < nm.indices.length; b2++) idx.push(nm.indices[b2] + base);
        base += nm.positions.length / 3;
      } catch (e2){ missed.push("nucleus " + ids[i]); }
    }
    /* ONE STRUCTURE, as he asked: a proposed nucleus id is another piece of THIS nucleus, not a
       second object. Exactly what fetchCombinedMesh already does for proposed root ids. */
    if (pos.length)
      /* NANOMETRES — core/nucmesh.js returns the legacy fragment vertices unscaled. */
      out.push({ name: "Nucleus (segmentation)", kind: "nucleus", color: "#3a72d8", alpha: 0.35,
                 scaleToNm: 1, positions: new Float32Array(pos), indices: new Uint32Array(idx) });
  }
  return out;
}
/* One tracing, on its own. Solid: there is nothing inside it to look through it at. */'''

OLD_ONE = u'''/* One tracing, on its own. Solid: there is nothing inside it to look through it at. */'''

# Guarded on the signature, and counted afterwards -- see the note above part 1.
_C = os.path.join(HERE, "core/tracingcard.js")
if u"async function tracingSegParts(" in io.open(_C, encoding="utf-8").read():
    print("core/tracingcard.js\n  already there: the proposed nucleus ids and the published meshes")
else:
    edit("core/tracingcard.js", [
        (u"the proposed nucleus ids, and the published meshes", OLD_ONE, NUCS),
    ])
_c = io.open(_C, encoding="utf-8").read()
for _fn in [u"async function tracingCellGlb", u"async function tracingOneGlb",
            u"function tracingGlbAlpha", u"function tracingGlbParts",
            u"function tracingGlbSave", u"async function tracingSegParts",
            u"function tracingProposedNucsFor"]:
    assert _c.count(_fn) == 1, "core/tracingcard.js has %d copies of %s" % (_c.count(_fn), _fn)
assert u"tracingSegParts(g, missed" in _c.split(u"async function tracingCellGlb")[1][:1600], \
    "tracingCellGlb does not fetch the segmentation"
print("done 4")

# ── 5. and a form that needs no importer at all ───────────────────────────────────────────────
# Søren: *"I see now that .glb does not open naturally in Blender"* — and, asked which of three
# things it was: *"dragging did not work and no option in the import"*. That is his glTF add-on
# switched off; one tick in Edit > Preferences > Add-ons puts it back, and the file was never the
# problem. But an export that only works when an add-on happens to be enabled is an export that
# fails this way again on the next machine, so there is a second download that depends on nothing
# Blender ships disabled: a Python script. Scripting tab, Run.
#
# It also carries two things a GLB cannot: a COLLECTION per kind, and viewport transparency — so
# the cell is see-through in the solid view he actually works in, not only in a render.
#
# AXES. The glTF importer maps glTF (x, y, z) to Blender (x, -z, y), and the GLB is written with
# glTF-y = -y_data. So an imported GLB lands at Blender (x, -z, -y) in data terms, and this script
# writes exactly that — the two downloads of one cell must not disagree about which way is up.
# Cortical depth (y, pia at zero) therefore runs down Blender's Z with the pia at the top.
BPY = u'''  /* ── THE SAME SCENE AS A BLENDER SCRIPT ─────────────────  2026-10-10
     Søren: *"I see now that .glb does not open naturally in Blender"* — his glTF add-on is
     switched off, which one tick in Preferences fixes. The file was fine. But an export that
     works only when an add-on happens to be enabled is one that fails this way again, so this is
     the same parts list as a Python script: Scripting tab, Run, no importer involved.

     It carries two things the GLB cannot — a collection per kind, and transparency set for the
     VIEWPORT, so the cell is see-through in the solid shading he works in rather than only in a
     render. Blender renamed that property in 4.2 (EEVEE Next), so both names are set, each in its
     own try: a script that dies on an AttributeError leaves half a scene behind.

     AXES. The glTF importer maps glTF (x, y, z) to Blender (x, -z, y), and glb() writes
     glTF-y = -y. So an imported GLB lands at Blender (x, -z, -y) in this data's terms, and this
     writes exactly that — two downloads of one cell must not disagree about which way is up.
     See src/a_tracing_you_can_open_in_blender.py. */
  function blenderPy(parts, resNm, meta){
    var b = glbParts(parts, resNm);
    if (!b) return "";
    var m = meta || {};
    var n3 = function(v){ return (Math.round(v * 1000) / 1000); };
    var L = [];
    L.push("# " + (m.title || "Traced structures") + " — written by the tracing card on "
           + new Date().toISOString().slice(0, 10) + ".");
    L.push("# Blender: Scripting tab → Open → Run. No add-on, no File › Import.");
    L.push("#          or from a terminal:  blender --python " + (m.file || "this_file.py"));
    L.push("# One Blender unit is one MICROMETRE. The scene is centred on itself; it came from");
    L.push("# voxel " + b.centreVoxel.join(", ") + " in this tool's frame.");
    L.push("# Axes are Blender's: X = x, Y = -z, Z = -y, which is where the .glb of the same cell");
    L.push("# lands after import — cortical depth runs down Z with the pia at the top.");
    L.push("# This file fetches nothing and runs nothing: it is vertices, faces and materials.");
    L.push("import bpy");
    L.push("");
    L.push("def _mat(name, rgba):");
    L.push("    m = bpy.data.materials.new(name)");
    L.push("    m.use_nodes = True");
    L.push("    bsdf = m.node_tree.nodes.get('Principled BSDF')");
    L.push("    if bsdf is not None:");
    L.push("        try: bsdf.inputs['Base Color'].default_value = rgba");
    L.push("        except Exception: pass");
    L.push("        try: bsdf.inputs['Alpha'].default_value = rgba[3]");
    L.push("        except Exception: pass");
    L.push("    m.diffuse_color = rgba            # the colour the solid viewport uses");
    L.push("    if rgba[3] < 1.0:");
    L.push("        # Blender 4.2 renamed this when EEVEE Next landed. Both, each in its own try.");
    L.push("        try: m.blend_method = 'BLEND'");
    L.push("        except Exception: pass");
    L.push("        try: m.surface_render_method = 'BLENDED'");
    L.push("        except Exception: pass");
    L.push("        try: m.show_transparent_back = False");
    L.push("        except Exception: pass");
    L.push("    return m");
    L.push("");
    L.push("def _coll(name):");
    L.push("    c = bpy.data.collections.get(name)");
    L.push("    if c is None:");
    L.push("        c = bpy.data.collections.new(name)");
    L.push("        bpy.context.scene.collection.children.link(c)");
    L.push("    return c");
    L.push("");
    L.push("def _add(name, group, rgba, verts, faces):");
    L.push("    me = bpy.data.meshes.new(name)");
    L.push("    me.from_pydata(verts, [], faces)");
    L.push("    me.validate()");
    L.push("    me.update()");
    L.push("    for p in me.polygons:");
    L.push("        p.use_smooth = True");
    L.push("    ob = bpy.data.objects.new(name, me)");
    L.push("    ob.data.materials.append(_mat(name, rgba))");
    L.push("    _coll(group).objects.link(ob)");
    L.push("    return ob");
    L.push("");
    b.parts.forEach(function(q){
      var v = [];
      for (var i = 0; i < q.xyz.length; i += 3)
        v.push("(" + n3(q.xyz[i]) + "," + n3(-q.xyz[i + 2]) + "," + n3(-q.xyz[i + 1]) + ")");
      var f = [];
      for (var t = 0; t + 2 < q.indices.length; t += 3)
        f.push("(" + q.indices[t] + "," + q.indices[t + 1] + "," + q.indices[t + 2] + ")");
      var rgb = q.rgb;
      L.push("_add(" + pyStr(q.name) + ", " + pyStr(q.group) + ", ("
             + n3(rgb[0]) + "," + n3(rgb[1]) + "," + n3(rgb[2]) + "," + q.alpha + "), [");
      L.push(v.join(","));
      L.push("], [");
      L.push(f.join(","));
      L.push("])");
      L.push("");
    });
    L.push("print('" + b.parts.length + " structure(s) added — micrometres, centred on "
           + b.centreVoxel.join(", ") + "')");
    return L.join("\\n") + "\\n";
  }
  function pyStr(s){
    return "'" + String(s == null ? "" : s).replace(/\\\\/g, "\\\\\\\\").replace(/'/g, "\\\\'")
      .replace(/[\\r\\n]+/g, " ") + "'";
  }
'''

# glb() and blenderPy() must agree about geometry, units, centring and colour, so the part of
# glb() that decides all four is split out and both call it. Two writers that each work it out is
# how two downloads of one cell come to disagree about which way is up.
OLD_G = u'''  function glb(parts, resNm){
    var res = (Array.isArray(resNm) && resNm.length === 3) ? resNm : [1, 1, 1];
    var built = [];'''
NEW_G = BPY + u'''  /* WHAT BOTH WRITERS AGREE ON: the geometry, the unit, the centre and the colour. Returns
     {parts:[{name, group, rgb, alpha, xyz, indices}], centreVoxel} with xyz already in
     micrometres relative to the file's own centre, y NOT yet flipped — each writer applies its
     own axis convention to the same numbers. 2026-10-10. */
  function glbParts(parts, resNm){
    var res = (Array.isArray(resNm) && resNm.length === 3) ? resNm : [1, 1, 1];
    var built = [];'''

edit("core/traceloft.js", [
    (u"one preparation, two writers", OLD_G, NEW_G),
])
print("done 5")

# ── 6. the button for it, beside the GLB ──────────────────────────────────────────────────────
SAVEPY = u'''function tracingPySave(parts, filename, title){
  var res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
  var txt = UJ.traceloft.blenderPy(parts, res, { title: title || "", file: filename });
  if (!txt) return 0;
  tracingSaveBlob(new Blob([txt], { type: "text/x-python" }), filename);
  return parts.length;
}
function tracingGlbSave(parts, filename){'''

_C6 = os.path.join(HERE, "core/tracingcard.js")
_have = io.open(_C6, encoding="utf-8").read()
_P6 = []
if u"function tracingPySave" not in _have:
    _P6.append((u"the Blender-script saver beside the GLB one",
                u"function tracingGlbSave(parts, filename){", SAVEPY))
if u'class="idbtn tracingcellpy"' in _have:
    print("core/tracingcard.js\n  already there: the Blender-script buttons")
else:
    edit("core/tracingcard.js", _P6 + [
        (u"the script button on the cell row",
         u'''          + '<button class="idbtn tracingcellzip" data-g="' + gi + '" ' + TRACING_BTN + ' title="A zip ''',
         u'''          + '<button class="idbtn tracingcellpy" data-g="' + gi + '" ' + TRACING_BTN + ' title="The '
                + 'same scene as a Blender Python script \\u2014 Scripting tab, Open, Run. No add-on and no '
                + 'File \\u203a Import, so it works even where the glTF importer is switched off, and it '
                + 'carries a collection per kind and viewport transparency, which a .glb cannot.">'
                + 'Blender script</button>'
              + '<button class="idbtn tracingcellzip" data-g="' + gi + '" ' + TRACING_BTN + ' title="A zip '''),
        (u"...and on every tracing",
         u'''                + '<button class="idbtn tracingglb" data-sid="' + escHtml(t.structureId) + '" '
                      + TRACING_BTN + ' title="This one tracing as a 3D model (GLB), solid, in its own '
                      + 'colour. Micrometres, centred on itself. ' + escHtml(TRACING_GLTF_HELP)
                      + '">3D model</button>''',
         u'''                + '<button class="idbtn tracingglb" data-sid="' + escHtml(t.structureId) + '" '
                      + TRACING_BTN + ' title="This one tracing as a 3D model (GLB), solid, in its own '
                      + 'colour. Micrometres, centred on itself. ' + escHtml(TRACING_GLTF_HELP)
                      + '">3D model</button>'
                    + '<button class="idbtn tracingpy" data-sid="' + escHtml(t.structureId) + '" '
                      + TRACING_BTN + ' title="The same one tracing as a Blender Python script \\u2014 '
                      + 'Scripting tab, Open, Run. No importer involved.">Blender script</button>\''''),
        (u"...both wired too",
         u'''  [].slice.call(host.querySelectorAll(".tracingglb")).forEach(function(b){
        b.addEventListener("click", function(){ tracingOneGlb(b.dataset.sid, b); });
      });''',
         u'''  [].slice.call(host.querySelectorAll(".tracingglb")).forEach(function(b){
        b.addEventListener("click", function(){ tracingOneGlb(b.dataset.sid, b); });
      });
      [].slice.call(host.querySelectorAll(".tracingpy")).forEach(function(b){
        b.addEventListener("click", function(){ tracingOneGlb(b.dataset.sid, b, "py"); });
      });'''),
        (u"...and the cell's script button",
         u'''  [].slice.call(host.querySelectorAll(".tracingcellglb")).forEach(function(b){
        b.addEventListener("click", function(){ tracingCellGlb(groups[Number(b.dataset.g)], b); });
      });''',
         u'''  [].slice.call(host.querySelectorAll(".tracingcellglb")).forEach(function(b){
        b.addEventListener("click", function(){ tracingCellGlb(groups[Number(b.dataset.g)], b); });
      });
      [].slice.call(host.querySelectorAll(".tracingcellpy")).forEach(function(b){
        b.addEventListener("click", function(){ tracingCellGlb(groups[Number(b.dataset.g)], b, "py"); });
      });'''),
    ])
# ── AND COUNTED, LIKE EVERY OTHER INSERT IN THIS FILE ────────────  2026-10-10
# Twice now an edit() whose `new` was the whole inserted block stopped matching after something
# else touched that block, and the next run quietly added a second copy. In JavaScript the second
# copy WINS, so the symptom is a fix that is present in the file and absent in the browser. These
# counts are cheap and they turn that into a loud failure.
_c = io.open(os.path.join(HERE, "core/tracingcard.js"), encoding="utf-8").read()
for _what, _n in [(u'class="idbtn tracingcellglb"', 1), (u'class="idbtn tracingcellpy"', 1),
                  (u'class="idbtn tracingglb"', 1), (u'class="idbtn tracingpy"', 1),
                  (u'querySelectorAll(".tracingcellglb")', 1),
                  (u'querySelectorAll(".tracingcellpy")', 1),
                  (u'querySelectorAll(".tracingglb")', 1),
                  (u'querySelectorAll(".tracingpy")', 1),
                  (u"function tracingPySave", 1)]:
    assert _c.count(_what) == _n, "core/tracingcard.js has %d of %s, wanted %d" % (
        _c.count(_what), _what, _n)
print("done 6")
