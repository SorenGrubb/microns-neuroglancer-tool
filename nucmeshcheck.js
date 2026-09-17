/* The nucleus's own mesh, read out of the nuclei bucket.                            2026-09-17

   core/nucmesh.js exists because core/mesh.js binds to one bucket and one format per page, and the
   nuclei are a second bucket in a second format. blender/make_colab_notebook.py measured that
   format live when the export was written: the nucleus source's info declares
   `"mesh": "mesh_mip_0_err_40"`, manifests for four real nuclei returned 2-8 fragments each, and it
   is NEUROGLANCER_LEGACY_MESH -- single resolution, no Draco, no LODs.

   Driven here against a fake fetch that serves bytes in exactly that layout, because the assertions
   worth making are about the decode and about what happens when a nucleus has no mesh -- neither of
   which needs the network, and both of which are how this file will actually fail.

   Run: node nucmeshcheck.js */
const fs = require("fs");
const vm = require("vm");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A legacy fragment, byte for byte as the spec has it: uint32 count, float32 xyz in ABSOLUTE
   NANOMETRES, uint32 indices to the end. Built with an odd leading offset on purpose -- see the
   .slice() in the decoder; a Float32Array view on an unaligned byte offset throws in every
   browser, and this is the fixture that would catch it coming back. */
function fragment(verts, idx, pad){
  const head = 4, body = verts.length * 4, tail = idx.length * 4;
  const buf = new ArrayBuffer((pad || 0) + head + body + tail);
  const dv = new DataView(buf, pad || 0);
  dv.setUint32(0, verts.length / 3, true);
  verts.forEach((v, i) => dv.setFloat32(head + i * 4, v, true));
  idx.forEach((v, i) => dv.setUint32(head + body + i * 4, v, true));
  return new Uint8Array(buf, pad || 0);
}

const SERVED = {};
function serve(url, body, type){
  SERVED[url] = { ok: true, status: 200,
                  json: async () => body,
                  arrayBuffer: async () => body.buffer.slice(body.byteOffset,
                                                             body.byteOffset + body.byteLength) };
}
const asked = [];
const sandbox = { console, JSON, Math, Number, String, Array, Object, isFinite, Date,
                  Float32Array, Uint32Array, Uint8Array, DataView, Promise,
                  fetch: async (u) => { asked.push(u);
                    return SERVED[u] || { ok: false, status: 404,
                                          json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }; } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(core("nucmesh.js"), "utf8"), sandbox);
const N = sandbox.UJ.nucmesh;

const NUC = "precomputed://https://bossdb-open-data.s3.amazonaws.com/iarpa_microns/minnie/minnie65/nuclei";
const BASE = "https://bossdb-open-data.s3.amazonaws.com/iarpa_microns/minnie/minnie65/nuclei/";

(async function(){

console.log("the source is a URL again, whatever shape it arrived in");
{
  ok(N._httpBase(NUC) === BASE, "precomputed:// is stripped and a slash added", N._httpBase(NUC));
  ok(N._httpBase("precomputed://gs://bucket/vol") === "https://storage.googleapis.com/bucket/vol/",
     "and a gs:// bucket becomes its HTTPS host", N._httpBase("precomputed://gs://bucket/vol"));
}

console.log("\na nucleus with a mesh comes back in micrometres");
{
  N.configure({ nuc: NUC });
  serve(BASE + "info", { mesh: "mesh_mip_0_err_40" });
  const MB = BASE + "mesh_mip_0_err_40/";
  serve(MB + "373879:0", { fragments: ["373879:0:0", "373879:0:1"] });
  SERVED[MB + "373879:0:0"] = { ok: true, arrayBuffer: async () =>
    fragment([0, 0, 0, 1000, 0, 0, 0, 1000, 0], [0, 1, 2]).buffer };
  SERVED[MB + "373879:0:1"] = { ok: true, arrayBuffer: async () =>
    fragment([0, 0, 2000, 1000, 0, 2000, 0, 1000, 2000], [0, 1, 2]).buffer };
  const m = await N.fetchNucleus("373879");
  ok(!!m && m.fragments === 2, "both fragments are read", m && m.fragments);
  ok(m.positions.length === 18 && m.indices.length === 6,
     "...and concatenated into one mesh", m.positions.length / 3 + " vertices");
  ok(m.positions[3] === 1, "NANOMETRES IN, MICROMETRES OUT -- 1000 nm is 1 µm", m.positions[3]);
  /* The second fragment's indices are shifted by the first's vertex count. Without that, both
     fragments' triangles would point at the first three vertices and the nucleus would be a flat
     sliver -- which draws, which is why it is asserted rather than eyeballed. */
  ok(m.indices[3] === 3 && m.indices[5] === 5,
     "...with the second fragment's indices shifted past the first's vertices",
     Array.from(m.indices).join(","));
}

console.log("\nthe decode is the format, not an approximation of it");
{
  const f = N._decodeFragment(fragment([1, 2, 3], [0, 0, 0], 3));
  ok(f.verts[0] === 1 && f.verts[2] === 3,
     "an unaligned byte offset decodes anyway -- the .slice() earns its keep", f.verts.join(","));
  let threw = "";
  try { N._decodeFragment(fragment([1, 2, 3], [7, 0, 0])); } catch (e){ threw = e.message; }
  ok(/out of range/.test(threw), "an index past the vertex count is refused, not drawn", threw);
  threw = "";
  try { N._decodeFragment(new Uint8Array([1, 2])); } catch (e){ threw = e.message; }
  ok(/shorter than its own header/.test(threw), "and so is a fragment with no header", threw);
}

console.log("\nno mesh is an answer, not a failure");
{
  const m = await N.fetchNucleus("999999");     // no manifest served for this one
  ok(m === null, "a nucleus with no manifest comes back null, so the cell still draws without it");
  ok(await N.fetchNucleus("") === null && await N.fetchNucleus("0") === null,
     "...as do no id at all and the zero id, which is not a nucleus");

  /* A volume that publishes no meshes has no `mesh` key at all. Worth its own case because the
     obvious probe -- asking for an info file INSIDE the mesh directory -- 404s even where the
     meshes exist, which is exactly the wrong answer to draw a conclusion from. */
  N.configure({ nuc: "precomputed://https://example.test/plain" });
  serve("https://example.test/plain/info", { type: "segmentation" });
  ok(await N.fetchNucleus("1") === null, "a volume with no mesh directory says no, once");
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);
})();
