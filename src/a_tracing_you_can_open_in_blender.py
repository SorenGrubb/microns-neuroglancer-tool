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
      built.push({ name: String(q.name || "structure"), color: q.color,
                   alpha: (q.alpha === undefined || q.alpha === null) ? 1 : Number(q.alpha),
                   positions: g.positions, indices: g.indices });
    });
    if (!built.length) return null;
    /* ONE CENTRE FOR THE WHOLE FILE, in nanometres, so the parts stay assembled. */
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    built.forEach(function(q){
      for (var i = 0; i < q.positions.length; i += 3)
        for (var k = 0; k < 3; k++){
          var v = q.positions[i + k];
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
        var x = (q.positions[i] - mid[0]) / NM_PER_UM;
        /* THE FLIP. */
        var y = -(q.positions[i + 1] - mid[1]) / NM_PER_UM;
        var z = (q.positions[i + 2] - mid[2]) / NM_PER_UM;
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
NEW_RET = (GLB + u'''  return { loft: loft, volume: volume, shape: shape, shape3d: shape3d, glb: glb,''')

edit("core/traceloft.js", [
    (u"the GLB writer, beside the lofter that feeds it", OLD_RET, NEW_RET),
])
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
async function tracingOneGlb(sid, btn){
  var label = btn ? btn.textContent : "";
  try {
    if (btn){ btn.disabled = true; btn.textContent = "meshing\\u2026"; }
    var x = Object.assign({ sid: sid }, await tracingFetchShared(sid));
    var parts = tracingGlbParts([x], true);
    if (!parts.length) throw new Error("that tracing has no contours to mesh");
    var n = tracingGlbSave(parts, tracingSafeName(parts[0].name) + "__"
                                 + tracingSafeName(sid) + "_um.glb");
    tracingSay(n ? "Saved " + parts[0].name + " as a 3D model (GLB, micrometres, centred on "
                   + "itself). It opens in Blender, PowerPoint or any glTF viewer."
                 : "Nothing could be meshed from that tracing.", !n);
  } catch (e){
    tracingSay("Could not make the 3D model: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}
/* Every tracing of one cell in one file, the cell see-through. */
async function tracingCellGlb(g, btn){
  if (!g || !g.items.length) return;
  var label = btn ? btn.textContent : "";
  try {
    var got = await tracingFetchCell(g.items.map(function(x){ return x.t.structureId; }), btn);
    if (btn){ btn.disabled = true; btn.textContent = "meshing\\u2026"; }
    var parts = tracingGlbParts(got, false);
    if (!parts.length) throw new Error("none of this cell\\u2019s tracings could be read");
    var cell = tracingSafeName(g.coord ? "cell_at_" + g.coord.split(",").join("_")
                 : (g.nuc ? "nucleus_" + g.nuc : (g.root ? "root_" + g.root : "no_cell")));
    var n = tracingGlbSave(parts, cell + "_um.glb");
    var see = parts.filter(function(q){ return q.alpha < 1; }).length;
    tracingSay("Saved " + cell + "_um.glb \\u2014 " + n + " structure" + (n === 1 ? "" : "s")
      + " in one file"
      + (see ? ", with the " + parts.filter(function(q){ return q.alpha < 1; })
                 .map(function(q){ return q.name.toLowerCase(); }).join(" and ")
             + " see-through so what is inside shows." : ".")
      + " Micrometres, centred on itself." + tracingFailedSay(got));
  } catch (e){
    tracingSay("Could not make the 3D model: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}
async function tracingCellZip(g, btn){'''

edit("core/tracingcard.js", [
    (u"the two makers and the one alpha rule",
     u"async function tracingCellZip(g, btn){", MAKERS),
    (u"the combined button on the cell row",
     u'''          + '<button class="idbtn tracingcellzip" data-g="' + gi + '" ' + TRACING_BTN + ' title="A zip '
            + 'of this cell: each tracing&rsquo;s contours (JSON), a mesh of each (OBJ, nm), and an '
            + 'index.">Download zip</button>\'''',
     u'''          + '<button class="idbtn tracingcellglb" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell as ONE 3D model (GLB) \\u2014 the cell and its nucleus see-through so '
            + 'the organelles inside them show, each in the colour it was drawn in. Micrometres, centred '
            + 'on itself, so it opens inside the viewport in Blender, PowerPoint or any glTF viewer.">'
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
                  + 'colour. Micrometres, centred on itself.">3D model</button>\''''),
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
])
print("done 2")
