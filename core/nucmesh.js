/* core/nucmesh.js — the nucleus's own mesh, straight out of the nuclei bucket.       2026-09-17

   Søren, on the tracing preview: *"Preferably also with the nucleus and root ID meshes as
   transparent."* The root ID's mesh has been fetchable in the browser since core/mesh.js was
   written. The nucleus's has not, for one reason: core/mesh.js binds itself to UJ.cfg.mesh — one
   bucket, one sharding, one format per page — and the nuclei live in a different bucket in a
   different format. So this is the second reader, and it is small because the format is small.

   MEASURED, NOT ASSUMED. blender/make_colab_notebook.py recorded it on the day the export was
   written: the MICrONS nucleus source's info declares `"mesh": "mesh_mip_0_err_40"`, and manifests
   for four real nuclei returned 2–8 fragments each at 29–197 KB. It is NEUROGLANCER_LEGACY_MESH —
   single resolution, no Draco, no LODs — which is also why probing for an info file inside that
   mesh directory 404s and means nothing. The directory name is read from the volume's own info
   here rather than hard-coded, so a dataset that names it something else still works.

     manifest   <base>/<meshDir>/<id>:0     -> {"fragments": [name, ...]}
     fragment   <base>/<meshDir>/<name>     -> uint32   vertex count
                                               float32  xyz * count, ABSOLUTE NANOMETRES
                                               uint32   triangle indices, to the end

   POSITIONS COME BACK IN MICROMETRES, like UJ.mesh.fetchCombinedMesh's, so a caller holding a cell
   mesh and a nucleus mesh has two things in one frame and one unit. The decode is deliberately the
   same arithmetic as core/mesh.js's decodeLegacyFragment, including the .slice() — the byte offset
   after the header is not guaranteed to be four-aligned, and a Float32Array view on an unaligned
   offset throws in every browser.

   A nucleus with no mesh is not an error worth shouting about: it returns null, and the caller
   draws the cell without it.

   Run: node nucmeshcheck.js */
(typeof window !== "undefined" ? window : global).UJ =
  (typeof window !== "undefined" ? window : global).UJ || {};
UJ.nucmesh = (function(){
  "use strict";

  var CFG = null, INFO = null;

  /* The same "precomputed://" stripping core/segread.js does, kept here rather than imported so
     this file can be loaded on a page that has no segread. */
  function httpBase(src){
    var s = String(src || "").replace(/^precomputed:\/\//, "").replace(/\/+$/, "");
    if (/^gs:\/\//.test(s)) s = "https://storage.googleapis.com/" + s.slice(5);
    return s + "/";
  }

  function configure(cfg){
    CFG = { base: httpBase((cfg || {}).nuc || (cfg || {}).base || "") };
    INFO = null;
    return CFG;
  }
  function configured(){ return !!(CFG && CFG.base); }

  async function meshDir(){
    if (INFO !== null) return INFO;
    var r = await fetch(CFG.base + "info");
    if (!r.ok) throw new Error("the nuclei volume has no info file (" + r.status + ")");
    var j = await r.json();
    /* `mesh` is a directory NAME relative to the volume, not a URL and not a boolean. A volume
       with no meshes simply has no such key, which is the ordinary case for a segmentation. */
    INFO = j && j.mesh ? String(j.mesh) : "";
    return INFO;
  }

  function decodeFragment(u8){
    if (u8.length < 4) throw new Error("fragment shorter than its own header");
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var nv = dv.getUint32(0, true);
    var vBytes = nv * 12;
    if (4 + vBytes > u8.length)
      throw new Error("fragment claims " + nv + " vertices but holds " + u8.length + " bytes");
    var rest = u8.length - 4 - vBytes;
    if (rest % 12) throw new Error("index block is " + rest + " bytes, not whole triangles");
    var verts = new Float32Array(u8.buffer.slice(u8.byteOffset + 4, u8.byteOffset + 4 + vBytes));
    var idx = new Uint32Array(u8.buffer.slice(u8.byteOffset + 4 + vBytes,
                                              u8.byteOffset + u8.length));
    for (var k = 0; k < idx.length; k++)
      if (idx[k] >= nv) throw new Error("index " + idx[k] + " out of range for " + nv + " vertices");
    return { verts: verts, idx: idx };
  }

  /* Fragments are concatenated with their indices shifted, which is all "combining" a legacy mesh
     amounts to: they are separate pieces of one surface in one absolute frame. */
  async function fetchNucleus(nucleusId, onProgress){
    if (!configured()) throw new Error("core/nucmesh.js was never configured");
    var id = String(nucleusId || "").trim();
    if (!id || id === "0") return null;
    var dir = await meshDir();
    if (!dir) return null;                       // this volume publishes no meshes
    var mb = CFG.base + dir.replace(/^\/+|\/+$/g, "") + "/";
    var r = await fetch(mb + id + ":0");
    if (!r.ok) return null;                      // no manifest: this nucleus has no mesh
    var man = await r.json();
    var frags = (man && man.fragments) || [];
    if (!frags.length) return null;
    var parts = [], n = 0;
    for (var i = 0; i < frags.length; i++){
      if (onProgress) onProgress(i / frags.length, "nucleus mesh " + (i + 1) + "/" + frags.length);
      var fr = await fetch(mb + frags[i]);
      if (!fr.ok) continue;
      var buf = new Uint8Array(await fr.arrayBuffer());
      try { parts.push(decodeFragment(buf)); } catch (e){ /* one bad fragment is a gap, not a stop */ }
    }
    if (!parts.length) return null;
    parts.forEach(function(p){ n += p.verts.length; });
    var pos = new Float32Array(n), idx = [], at = 0, base = 0;
    parts.forEach(function(p){
      /* NANOMETRES IN, MICROMETRES OUT — the unit core/mesh.js hands back, so the caller has one
         frame for the cell, the nucleus and the tracing. */
      for (var k = 0; k < p.verts.length; k++) pos[at + k] = p.verts[k] / 1000;
      for (var t = 0; t < p.idx.length; t++) idx.push(p.idx[t] + base);
      at += p.verts.length; base += p.verts.length / 3;
    });
    return { positions: pos, indices: new Uint32Array(idx), fragments: parts.length };
  }

  return { configure: configure, configured: configured, fetchNucleus: fetchNucleus,
           _decodeFragment: decodeFragment, _httpBase: httpBase, _meshDir: meshDir };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = (typeof window !== "undefined" ? window : global).UJ.nucmesh;
