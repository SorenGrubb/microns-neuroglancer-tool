/* A tracing you can open in Blender, one or all of them.                              2026-10-10

   Søren, looking at the dataset list: *"There should also be an option to download the tracing as
   a 3D model. Either as a lone 3D model or as a combined 3D model of all in that cell. If
   combined, the cell should be transparent to show the organelles inside it."*

   The zip has carried an OBJ per tracing since it was built, but an OBJ is one object with no
   colour and no transparency, so "all of them in one file, with the cell see-through" is not a
   thing you can make out of five of them. GLB is: one binary file, several meshes, a material
   each, alpha on the ones that enclose something.

   THREE THINGS THAT ARE EASY TO GET WRONG AND SILENT WHEN YOU DO:

     Y. Neuroglancer's y increases DOWNWARD and glTF is Y-up, so a model fed straight through
        opens upside down in Blender. core/mesh.js learned this the hard way in August and says
        so in a long comment; the same flip and the same winding swap apply here, because these
        contours are in the same frame.

     UNITS. Nanometres puts a 15 µm cell 15,000 units across and 1.6 MILLION units from the
        origin, which in Blender's default viewport is an invisible speck beyond the clip plane.
        Micrometres, centred on the model's own middle, opens as something you can see. The
        offset that was subtracted travels in the file so the coordinate is not lost.

     THE ORDER OF ALPHA. A transparent cell with solid organelles inside it only reads correctly
        if the cell is the transparent one. Whole cell and nucleus enclose; organelles do not.

   Run: node glbcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3000);

  const has = await p.evaluate(() => !!(window.UJ && UJ.traceloft && UJ.traceloft.glb));
  if (!has){
    console.log("  FAIL UJ.traceloft.glb is not on this page");
    await b.close(); process.exit(1);
  }

  /* A box 2 µm across at x 400000 voxels, and a small one inside it. 4/4/40 nm voxels. */
  const r = await p.evaluate(() => {
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    const res = [4, 4, 40];
    const big = [], small = [];
    for (let z = 400; z <= 410; z++){ big.push(sq(z, 400000, 230000, 250)); }
    for (let z = 403; z <= 406; z++){ small.push(sq(z, 400000, 230000, 60)); }
    const bytes = UJ.traceloft.glb([
      { name: "Whole cell", rings: big, color: "#cddc39", alpha: 0.25 },
      { name: "Lysosome 1", rings: small, color: "#9c27b0" }
    ], res);
    /* Read the glTF JSON chunk back out: the only honest way to assert what is in a GLB. */
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = dv.getUint32(0, true), total = dv.getUint32(8, true);
    const jLen = dv.getUint32(12, true), jTag = dv.getUint32(16, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jLen)));
    const one = UJ.traceloft.glb([{ name: "Lysosome 1", rings: small, color: "#9c27b0" }], res);
    const dv1 = new DataView(one.buffer, one.byteOffset, one.byteLength);
    const j1 = JSON.parse(new TextDecoder().decode(
      one.subarray(20, 20 + dv1.getUint32(12, true))));
    return {
      magic: magic === 0x46546C67, jsonChunk: jTag === 0x4E4F534A, sized: total === bytes.length,
      meshes: (json.meshes || []).map(m => m.name),
      nodes: (json.nodes || []).length,
      mats: (json.materials || []).map(m => ({
        name: m.name, mode: m.alphaMode,
        a: m.pbrMetallicRoughness.baseColorFactor[3],
        /* glTF baseColorFactor is LINEAR, so it is converted back to sRGB before being compared
           with the hex that was drawn with \u2014 a raw comparison would read #9c27b0 as
           #55056f and look like a bug in the colour rather than in the assertion. */
        rgb: m.pbrMetallicRoughness.baseColorFactor.slice(0, 3).map(v => Math.round(255 *
          (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))),
        both: m.doubleSided === true })),
      /* The POSITION accessor's min/max say where the geometry sits and how big it is. */
      bounds: (json.accessors || []).filter(a => a.type === "VEC3").map(a => ({
        min: a.min.map(v => Math.round(v * 100) / 100), max: a.max.map(v => Math.round(v * 100) / 100) })),
      extras: json.asset && json.asset.extras,
      single: (j1.meshes || []).map(m => m.name),
      singleMats: (j1.materials || []).map(m => m.pbrMetallicRoughness.baseColorFactor[3])
    };
  });

  console.log("the file is a GLB a viewer will open");
  ok(r.magic && r.jsonChunk && r.sized,
     "glTF magic, a JSON chunk, and a length that matches the bytes",
     "magic " + r.magic + ", json " + r.jsonChunk + ", length " + r.sized);
  ok(r.meshes.join(" | ") === "Whole cell | Lysosome 1" && r.nodes === 2,
     "both tracings are in it, each its own mesh and node, named as they are named here",
     r.meshes.join(" | "));

  console.log("\nand the cell is the see-through one");
  ok(r.mats.length === 2 && r.mats[0].a === 0.25 && r.mats[0].mode === "BLEND",
     "the whole cell is transparent, which is what makes the organelles inside it visible",
     JSON.stringify(r.mats[0]));
  ok(r.mats[1].a === 1 && r.mats[1].mode === "OPAQUE",
     "...and the organelle inside it is solid", JSON.stringify(r.mats[1]));
  ok(r.mats[1].rgb.join(",") === "156,39,176",
     "...in the colour it was drawn in, so the model matches the pad", r.mats[1].rgb.join(", "));
  ok(r.mats.every(m => m.both),
     "...and both are double-sided, because a lofted contour stack has no outside to prefer",
     JSON.stringify(r.mats.map(m => m.both)));

  console.log("\nand it opens somewhere you can see it");
  const B = r.bounds[0] || { min: [0, 0, 0], max: [0, 0, 0] };
  const span = Math.max(B.max[0] - B.min[0], B.max[1] - B.min[1], B.max[2] - B.min[2]);
  ok(span > 1 && span < 10,
     "a 2 µm box is about 2 units across — micrometres, not the nanometres the OBJ uses, "
     + "because 15,000 units is past Blender's default clip plane",
     span.toFixed(2) + " units across");
  ok(Math.abs(B.min[0]) < span && Math.abs(B.max[0]) < span,
     "...and it sits at the origin rather than 1.6 million units away",
     "x from " + B.min[0] + " to " + B.max[0]);
  ok(r.extras && /400000/.test(JSON.stringify(r.extras.centreVoxel || "")),
     "...with the coordinate it was moved from recorded, so nothing is lost",
     JSON.stringify(r.extras && r.extras.centreVoxel));
  ok(B.min[1] < 0 && B.max[1] > 0 && r.extras && r.extras.yFlipped === true,
     "...and y is flipped for glTF, which core/mesh.js learned in August: Neuroglancer's y "
     + "increases downward and a model fed straight through opens upside down",
     String(r.extras && r.extras.yFlipped));

  console.log("\nand one tracing alone is the same file with one thing in it");
  ok(r.single.join(",") === "Lysosome 1" && r.singleMats.join(",") === "1",
     "a lone organelle is solid — nothing encloses it", r.single.join(",") + " @ " + r.singleMats);

  /* \u2500\u2500 AND IT IS A VALID glTF, NOT ONLY A PLAUSIBLE ONE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     Khronos's own gltf-validator was run against this exact output on 2026-10-10: 0 errors, 0
     warnings, 0 infos, 3 draw calls, 3 materials, 2,432 triangles. It is not a dependency of this
     repo, so what runs here is the structural half \u2014 every alignment and bound the hand-written
     writer could get wrong, which is what a hand-written binary format is for getting wrong. */
  console.log("\nand the binary holds together");
  const v = await p.evaluate(() => {
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    const a = [], c = [];
    for (let z = 400; z <= 410; z++) a.push(sq(z, 400000, 230000, 250));
    for (let z = 403; z <= 406; z++) c.push(sq(z, 400000, 230000, 60));
    const u8 = UJ.traceloft.glb([{ name: "Whole cell", rings: a, color: "#cddc39", alpha: 0.22 },
                                 { name: "Lysosome 1", rings: c, color: "#9c27b0" }], [4, 4, 40]);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const jLen = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jLen)));
    const binHdr = 20 + jLen;
    const binLen = dv.getUint32(binHdr, true), binTag = dv.getUint32(binHdr + 4, true);
    const binAt = binHdr + 8;
    const bad = [];
    if (jLen % 4) bad.push("JSON chunk is not 4-byte aligned");
    if (binLen % 4) bad.push("BIN chunk is not 4-byte aligned");
    if (binTag !== 0x004E4942) bad.push("second chunk is not BIN");
    if (binAt + binLen !== u8.length) bad.push("BIN chunk does not reach the end of the file");
    (json.bufferViews || []).forEach((bv, i) => {
      if ((bv.byteOffset || 0) % 4) bad.push("bufferView " + i + " is not 4-byte aligned");
      if ((bv.byteOffset || 0) + bv.byteLength > json.buffers[0].byteLength)
        bad.push("bufferView " + i + " runs past the buffer");
    });
    const SZ = { 5125: 4, 5126: 4 }, NC = { SCALAR: 1, VEC3: 3 };
    (json.accessors || []).forEach((ac, i) => {
      const need = ac.count * SZ[ac.componentType] * NC[ac.type];
      const bv = json.bufferViews[ac.bufferView];
      if (need !== bv.byteLength)
        bad.push("accessor " + i + " wants " + need + " bytes, its view has " + bv.byteLength);
    });
    /* Every index must name a vertex this primitive has. */
    (json.meshes || []).forEach((m, mi) => {
      const pr = m.primitives[0];
      const ia = json.accessors[pr.indices], pa = json.accessors[pr.attributes.POSITION];
      const bv = json.bufferViews[ia.bufferView];
      const idx = new Uint32Array(u8.buffer, u8.byteOffset + binAt + (bv.byteOffset || 0), ia.count);
      let mx = 0;
      for (let k = 0; k < idx.length; k++) if (idx[k] > mx) mx = idx[k];
      if (mx >= pa.count)
        bad.push("mesh " + mi + " indexes vertex " + mx + " of " + pa.count);
      if (ia.count % 3) bad.push("mesh " + mi + " has " + ia.count + " indices, not a multiple of 3");
    });
    return { bad: bad, tris: (json.accessors || []).filter(a2 => a2.type === "SCALAR")
      .reduce((n, a2) => n + a2.count / 3, 0) };
  });
  ok(v.bad.length === 0,
     "every chunk aligned, every view inside the buffer, every accessor the size its view is, "
     + "and no triangle naming a vertex that is not there",
     v.bad.length ? v.bad.join("; ") : v.tris + " triangles, nothing out of place");

  /* \u2500\u2500 THE SEGMENTATION TRAVELS WITH THE TRACINGS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-10
     S\u00f8ren: *"it would be nice if it opens the 3D model together with the RootID and Nucleus ID
     also, and that root ID is transparent to show the nucleus and organelles. if community
     reported Root ID or nucleus ID exists they should also be a part of it as the same structure
     as the respective ID."* \u2014 and, a moment later: *"That is only for the 3D model for all, not
     for the individual organelle ones."*

     THE UNITS ARE THE TRAP. core/mesh.js hands back MICROMETRES ("nm -> \u00b5m, this file's usual
     frame"), core/nucmesh.js hands back the raw legacy fragment vertices, which are NANOMETRES,
     and the lofter hands back nanometres. Three sources, two frames, one file. A part that
     declares the wrong one lands 1000\u00d7 away \u2014 which in a viewer is not a visible error, it
     is an empty scene with something enormous off-screen. So a part says what its numbers are,
     and this asserts that a published nucleus and a hand-traced one of the SAME object end up on
     top of each other. */
  console.log("\nand three sources in two unit frames land in one place");
  const u = await p.evaluate(() => {
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    /* A traced cube: 500 voxels half-width at 4 nm = 2 µm across, z 400..410 at 40 nm = 0.44 µm.
       Centre 400000, 230000, 405 voxels = 1,600,000 / 920,000 / 16,200 nm. */
    const traced = [];
    for (let z = 400; z <= 410; z++) traced.push(sq(z, 400000, 230000, 500));
    /* The SAME cube, as core/mesh.js would hand it over: micrometres. */
    const um = (x, y, z) => [x / 1000, y / 1000, z / 1000];
    const lo = [1600000 - 2000, 920000 - 2000, 16200 - 220];
    const hi = [1600000 + 2000, 920000 + 2000, 16200 + 220];
    const corners = [];
    for (let i = 0; i < 8; i++)
      corners.push(um((i & 1) ? hi[0] : lo[0], (i & 2) ? hi[1] : lo[1], (i & 4) ? hi[2] : lo[2]));
    const pos = new Float32Array([].concat.apply([], corners));
    const seg = { name: "Cell (segmentation)", color: "#ff3b3b", alpha: 0.15,
                  scaleToNm: 1000, positions: pos,
                  indices: new Uint32Array([0,1,2, 1,3,2, 4,6,5, 5,6,7, 0,2,4, 2,6,4,
                                            1,5,3, 3,5,7, 0,4,1, 1,4,5, 2,3,6, 3,7,6]) };
    const bytes = UJ.traceloft.glb([
      seg, { name: "Whole cell", rings: traced, color: "#cddc39", alpha: 0.22 }], [4, 4, 40]);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const json = JSON.parse(new TextDecoder().decode(
      bytes.subarray(20, 20 + dv.getUint32(12, true))));
    const box = json.accessors.filter(a => a.type === "VEC3").map(a => ({ min: a.min, max: a.max }));
    return { names: json.meshes.map(m => m.name), box: box };
  });
  {
    const a = u.box[0], c = u.box[1];
    const off = (!a || !c) ? 999 : Math.max.apply(null,
      [0, 1, 2].map(k => Math.max(Math.abs(a.min[k] - c.min[k]), Math.abs(a.max[k] - c.max[k]))));
    ok(u.names.length === 2 && off < 0.05,
       "a published mesh in micrometres and a hand-traced one in nanometres, the same object, "
       + "land on top of each other \u2014 a part that lies about its unit is 1000\u00d7 away, which "
       + "looks like an empty scene rather than an error",
       "worst corner differs by " + off.toFixed(3) + " \u00b5m");
  }

  console.log("\nand the combined one brings the segmentation with it");
  const seg = await p.evaluate(async () => {
    if (typeof tracingCellGlb !== "function") return { noCard: true };
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    const rings = [sq(400, 401000, 230000, 60), sq(401, 401010, 230010, 60)];
    /* Everything the export reaches for, stubbed, so nothing leaves the harness. */
    const asked = { roots: null, nucs: [] };
    window.UJ.mesh = window.UJ.mesh || {};
    UJ.mesh.fetchCombinedMesh = async function(root, _p, _f, extra){
      asked.roots = [String(root)].concat(extra || []);
      return { positions: new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,1]),
               indices: new Uint32Array([0,1,2, 0,1,3, 0,2,3, 1,2,3]), rootIds: asked.roots };
    };
    window.UJ.nucmesh = window.UJ.nucmesh || {};
    UJ.nucmesh.configured = function(){ return true; };
    UJ.nucmesh.fetchNucleus = async function(id){
      asked.nucs.push(String(id));
      return { positions: new Float32Array([0,0,0, 100,0,0, 0,100,0, 0,0,100]),
               indices: new Uint32Array([0,1,2, 0,1,3, 0,2,3, 1,2,3]) };
    };
    window.tracingExtraRootsFor = tracingExtraRootsFor = async function(){ return ["777", "888"]; };
    window.tracingProposedNucsFor = tracingProposedNucsFor = async function(){ return ["999"]; };
    window.tracingFetchCell = tracingFetchCell = async function(sids){
      return sids.map(function(sid){
        return { sid: sid, t: { color: "#9c27b0", kind: "lysosome" },
                 st: { name: "Lysosome 1", kind: "lysosome", rings: rings } };
      });
    };
    window.tracingFetchShared = tracingFetchShared = async function(sid){
      return { t: { color: "#9c27b0", kind: "lysosome" },
               st: { name: "Lysosome 1", kind: "lysosome", rings: rings } };
    };
    let got = null;
    const real = UJ.traceloft.glb;
    UJ.traceloft.glb = function(parts, res){ got = parts.map(q => ({
      name: q.name, alpha: q.alpha, scale: q.scaleToNm || 1 })); return real(parts, res); };
    window.tracingSaveBlob = tracingSaveBlob = function(){};
    await tracingCellGlb({ nuc: "405191", root: "864691136051278323",
                           coord: "234624,228032,17512",
                           items: [{ t: { structureId: "o1" } }] }, null);
    const combined = got;
    got = null;
    await tracingOneGlb("o1", null);
    UJ.traceloft.glb = real;
    return { combined: combined, lone: got, asked: asked };
  });
  if (seg.noCard) console.log("  (no tracing card on this page)");
  else {
    const names = (seg.combined || []).map(q => q.name);
    ok(names.indexOf("Cell (segmentation)") >= 0 && names.indexOf("Nucleus (segmentation)") >= 0,
       "the root ID's mesh and the nucleus ID's mesh are in the combined file beside the tracings",
       names.join(" | "));
    const cellSeg = (seg.combined || []).filter(q => q.name === "Cell (segmentation)")[0] || {};
    const nucSeg = (seg.combined || []).filter(q => q.name === "Nucleus (segmentation)")[0] || {};
    ok(cellSeg.alpha < 0.2 && nucSeg.alpha > cellSeg.alpha && nucSeg.alpha < 1,
       "...the root ID most see-through of all, because everything else is inside it, and the "
       + "nucleus less so because its shape is worth seeing",
       "cell " + cellSeg.alpha + ", nucleus " + nucSeg.alpha);
    ok(cellSeg.scale === 1000 && nucSeg.scale === 1,
       "...each declaring its own unit \u2014 core/mesh.js is micrometres, core/nucmesh.js is "
       + "nanometres, and the lofter is nanometres",
       "cell \u00d7" + cellSeg.scale + ", nucleus \u00d7" + nucSeg.scale);
    ok((seg.asked.roots || []).join(",") === "864691136051278323,777,888",
       "...and the community's proposed root IDs are folded into the SAME structure, which is "
       + "what fetchCombinedMesh already does for the viewer and the volume",
       (seg.asked.roots || []).join(", "));
    ok(seg.asked.nucs.join(",") === "405191,999",
       "...with the proposed nucleus IDs likewise part of the one nucleus",
       seg.asked.nucs.join(", "));
    ok((seg.lone || []).length === 1 && seg.lone[0].name === "Lysosome 1",
       "and a lone organelle is still only itself \u2014 S\u00f8ren: \u201cthat is only for the 3D "
       + "model for all, not for the individual organelle ones\u201d",
       (seg.lone || []).map(q => q.name).join(" | "));
  }

  /* \u2500\u2500 AND A FORM THAT NEEDS NO IMPORTER AT ALL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-10
     S\u00f8ren: *"I see now that .glb does not open naturally in Blender"* \u2014 and, asked which of
     the three it was: *"dragging did not work and no option in the import"*. That is his glTF
     add-on switched off, not a fault in the file, and one tick in Preferences fixes it. But an
     export that depends on an add-on being enabled is an export that fails this way again, so
     there is a second download that depends on nothing: a Blender Python script. Scripting tab,
     Run, and the scene is there \u2014 with real materials, viewport transparency (so it looks
     right without rendering), a collection per kind and every object named. */
  console.log("\nand a Blender script that needs no add-on");
  const py = await p.evaluate(() => {
    if (typeof UJ.traceloft.blenderPy !== "function") return { missing: true };
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    const a = [], c = [];
    for (let z = 400; z <= 404; z++) a.push(sq(z, 400000, 230000, 250));
    for (let z = 401; z <= 403; z++) c.push(sq(z, 400000, 230000, 60));
    const txt = UJ.traceloft.blenderPy([
      { name: "Whole cell", kind: "cell", rings: a, color: "#cddc39", alpha: 0.22 },
      { name: "Lysosome 1", kind: "lysosome", rings: c, color: "#9c27b0" }
    ], [4, 4, 40], { title: "cell at 401085, 230736, 380" });
    return { txt: txt, len: txt.length };
  });
  if (py.missing) ok(false, "UJ.traceloft.blenderPy is not on this page");
  else {
    const t = py.txt;
    ok(/^#/.test(t) && /import bpy/.test(t),
       "it is a Python file that starts by saying what it is and imports bpy",
       t.split("\n")[0].slice(0, 80));
    /* `^_add(` — the calls, not the `def _add(` that defines it. */
    const calls = (t.match(/^_add\(/gm) || []).length;
    ok(/from_pydata/.test(t) && calls === 2,
       "...one object per structure, built from its own vertices and faces", calls + " objects");
    ok(/'Whole cell'/.test(t) && /'Lysosome 1'/.test(t),
       "...named as they are named here, so the outliner reads like the list");
    ok(/0\.22/.test(t) && /alpha/i.test(t),
       "...the cell see-through, by the same rule the GLB uses");
    ok(/blend_method|surface_render_method/.test(t) && /try:/.test(t),
       "...set for the VIEWPORT, both the name Blender used before 4.2 and the one after, each "
       + "in a try \u2014 a script that dies on an AttributeError leaves half a scene",
       (t.match(/(blend_method|surface_render_method)/g) || []).join(", "));
    ok(/bpy\.data\.collections\.new/.test(t),
       "...and a collection per kind, which is the thing a GLB cannot carry");
    ok(!/\bexec\b|\beval\b|subprocess|urllib|requests|os\.system/.test(t),
       "...and it fetches nothing and runs nothing: it is vertices, faces and materials, which "
       + "is what makes it safe to hand somebody a script at all",
       "no exec, eval, subprocess or network");
    /* THE TWO DOWNLOADS OF ONE CELL MUST NOT DISAGREE ABOUT WHICH WAY IS UP. The glTF importer
       maps glTF (x, y, z) to Blender (x, -z, y), so a GLB written with glTF-y = -y_data lands at
       Blender (x, -z, -y). The script writes that directly; this measures that they match.
       Verified once outside the harness too: the emitted file parses with Python's own ast. */
    const axes = await p.evaluate(() => {
      const sq = (z, cx, cy, h) => ({ z: z,
        points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
      const a = [];
      for (let z = 400; z <= 410; z++) a.push(sq(z, 400000, 230000, 250));
      const parts = [{ name: "Whole cell", kind: "cell", rings: a, color: "#cddc39", alpha: 0.22 }];
      const txt = UJ.traceloft.blenderPy(parts, [4, 4, 40], {});
      const u8 = UJ.traceloft.glb(parts, [4, 4, 40]);
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const json = JSON.parse(new TextDecoder().decode(
        u8.subarray(20, 20 + dv.getUint32(12, true))));
      const g = json.accessors.filter(x => x.type === "VEC3")[0];
      /* The VERTEX line only: the line after each `_add(` call. The face list below it is
         tuples of integers and would otherwise be measured as geometry. */
      const rows = txt.split("\n");
      const vi = rows.findIndex(l => l.indexOf("_add(") === 0);
      const v = ((rows[vi + 1] || "").match(/\(-?[\d.]+,-?[\d.]+,-?[\d.]+\)/g) || [])
        .map(t2 => t2.slice(1, -1).split(",").map(Number));
      const lo = [0, 1, 2].map(k => Math.min.apply(null, v.map(q => q[k])));
      const hi = [0, 1, 2].map(k => Math.max.apply(null, v.map(q => q[k])));
      return { lo: lo, hi: hi, gmin: g.min, gmax: g.max, n: v.length };
    });
    const near = (a2, b2) => Math.abs(a2 - b2) < 1e-3;
    ok(axes.n > 8
       && near(axes.lo[0], axes.gmin[0]) && near(axes.hi[0], axes.gmax[0])
       && near(axes.lo[1], -axes.gmax[2]) && near(axes.hi[1], -axes.gmin[2])
       && near(axes.lo[2], -axes.gmax[1]) && near(axes.hi[2], -axes.gmin[1]),
       "the script and the GLB of one cell agree about which way is up \u2014 Blender (x, -z, -y) "
       + "is where the importer puts the GLB, so the two downloads cannot contradict each other",
       "script " + axes.lo.map(v2 => Math.round(v2 * 100) / 100).join(",") + " \u2192 "
       + axes.hi.map(v2 => Math.round(v2 * 100) / 100).join(",")
       + "  vs glTF " + axes.gmin.map(v2 => Math.round(v2 * 100) / 100).join(",") + " \u2192 "
       + axes.gmax.map(v2 => Math.round(v2 * 100) / 100).join(","));
    ok(py.len < 400000, "...and it is a text file of a sane size for this fixture",
       Math.round(py.len / 1024) + " kB");
  }

  /* \u2500\u2500 AND THE PAGE SAYS THE REMEDY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-10
     S\u00f8ren: *"if my blender is missing it, then other people are also missing it. it should be
     plug and play."* It cannot be \u2014 nothing but a .blend opens Blender by double-click \u2014
     but it can stop being a puzzle. The one tick that fixes it is on the button and in the line
     after the download, from one string, so a person who hits this never has to diagnose it. */
  console.log("\nand the page says how to fix a Blender that cannot read it");
  const help = await p.evaluate(() => {
    const host = document.getElementById("tracingShared");
    if (!host) return { noList: true };
    TRACING_SHARED = [{ structureId: "c1", name: "Whole cell", kind: "cell",
                        nucleusId: "61360735", rootId: "6198781614",
                        cellCoord: "401085,230736,380", contours: 172, sections: 156 }];
    tracingRenderShared();
    const t = (host.querySelector(".tracingcellglb") || {}).title || "";
    const o = (host.querySelector(".tracingglb") || {}).title || "";
    return { cell: t, one: o,
             one_string: typeof TRACING_GLTF_HELP === "string" && TRACING_GLTF_HELP.length > 40 };
  });
  if (help.noList) console.log("  (no dataset list on this page)");
  else {
    const says = s2 => /Preferences/.test(s2) && /Add-ons/.test(s2) && /glTF 2\.0 format/.test(s2);
    ok(says(help.cell) && says(help.one),
       "both 3D model buttons name the one tick that fixes a Blender with no glTF importer, "
       + "before the click rather than after the puzzle",
       says(help.cell) && says(help.one) ? "both say it" : "cell: " + help.cell.slice(-60));
    ok(help.one_string,
       "...from one string, so the button and the line afterwards cannot drift apart",
       String(help.one_string));
  }

  console.log("\nand the buttons are on the list");
  const ui = await p.evaluate(() => {
    const host = document.getElementById("tracingShared");
    if (!host) return { noList: true };
    TRACING_SHARED = [
      { structureId: "c1", name: "Whole cell", kind: "cell", nucleusId: "61360735",
        rootId: "6198781614", cellCoord: "401085,230736,380", contours: 172, sections: 156 },
      { structureId: "o1", name: "Lysosome 1", kind: "lysosome", instanceOf: "lysosome",
        instanceIndex: 1, nucleusId: "61360735", rootId: "6198781614",
        cellCoord: "401085,230736,380", contours: 8, sections: 6 }
    ];
    tracingRenderShared();
    return { cell: host.querySelectorAll(".tracingcellglb").length,
             rows: host.querySelectorAll(".tracingglb").length };
  });
  if (ui.noList) console.log("  (no dataset list on this page)");
  else {
    ok(ui.cell === 1, "one combined 3D model per cell", String(ui.cell));
    ok(ui.rows === 2, "...and a lone one on every tracing", String(ui.rows));
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
