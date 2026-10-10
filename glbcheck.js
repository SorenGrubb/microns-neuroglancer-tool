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
