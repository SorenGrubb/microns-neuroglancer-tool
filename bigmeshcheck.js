/* A large pinky100 mesh arrives simplified instead of being refused.               2026-09-09

   Søren: "Yes, maybe the fragments are large for pJump, please fix it."

   Drives the REAL clusterDecimate() and fetchLegacyMesh() lifted out of core/mesh.js (pagefn.js)
   against synthetic fragments, with the byte thresholds shrunk in the vm context so a 64 MB rule
   can be tested with a few hundred bytes. The SHIPPED constants are asserted separately, so
   shrinking them here cannot hide a change to the real ones.

   What has to hold:
     * a small mesh is untouched -- byte-for-byte the published geometry
     * a large one arrives, decimated, and says so
     * fragments decoded independently agree on shared boundary vertices (no cracks)
     * the volume survives decimation well enough to still be worth showing

   Run: node bigmeshcheck.js  */
const vm = require("vm");
const { fnText, constText, source } = require("./pagefn.js");

let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* ── the shipped numbers, before anything is stubbed ─────────────────────────────────────────── */
console.log("core/mesh.js constants");
const src = source("core/mesh.js");
const num = n => { const m = new RegExp("const " + n + "=([0-9*]+)").exec(src);
                   return m ? Function("return " + m[1])() : null; };
const CEIL = num("LEGACY_MAX_BYTES"), SIMP = num("LEGACY_SIMPLIFY_ABOVE"), G0 = num("LEGACY_GRID_START_NM");
ok(CEIL === 1536 * 1048576, "the refusal ceiling is 1.5 GB, not 192 MB", CEIL && (CEIL / 1048576) + " MB");
ok(SIMP === 64 * 1048576, "simplification starts at 64 MB", SIMP && (SIMP / 1048576) + " MB");
ok(SIMP < CEIL, "...well below the ceiling, so there is room to simplify before refusing");
ok(G0 === 200, "the first grid is 0.2 µm", G0 + " nm");

/* ── a cube, one fragment per face ───────────────────────────────────────────────────────────── */
const S = 10000;                                  // 10 µm cube, in nm, as the format stores them
const CORNERS = [[0,0,0],[S,0,0],[S,S,0],[0,S,0],[0,0,S],[S,0,S],[S,S,S],[0,S,S]];
const FACES = [[0,1,2,3],[4,6,5],[4,7,6],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
/* outward-facing quads: -z, +z (as two tris), then the four sides */
const QUADS = [[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
function fragmentFor(quad){
  const verts = quad.map(i => CORNERS[i]);
  const nv = 4;
  const buf = new ArrayBuffer(4 + nv * 12 + 6 * 4);
  const dv = new DataView(buf);
  dv.setUint32(0, nv, true);
  verts.forEach((p, k) => { dv.setFloat32(4 + k * 12, p[0], true);
                            dv.setFloat32(8 + k * 12, p[1], true);
                            dv.setFloat32(12 + k * 12, p[2], true); });
  [0,1,2, 0,2,3].forEach((v, k) => dv.setUint32(4 + nv * 12 + k * 4, v, true));
  return new Uint8Array(buf);
}
const FRAGS = QUADS.map(fragmentFor);

function signedVolumeUm3(positions, indices){   // divergence theorem, positions in µm
  let v = 0;
  for (let t = 0; t < indices.length; t += 3){
    const a = indices[t]*3, b = indices[t+1]*3, c = indices[t+2]*3;
    v += (positions[a]*(positions[b+1]*positions[c+2]-positions[c+1]*positions[b+2])
        - positions[a+1]*(positions[b]*positions[c+2]-positions[c]*positions[b+2])
        + positions[a+2]*(positions[b]*positions[c+1]-positions[c]*positions[b+1])) / 6;
  }
  return Math.abs(v);
}

function ctxWith(simplifyAbove, ceiling){
  const ctx = vm.createContext({ console, Map, Math, Error, Number, DataView, Object,
    Float32Array, Uint32Array, Int32Array, Uint8Array, ArrayBuffer, Promise, JSON, String });
  ctx.LEGACY_MAX_BYTES = ceiling;
  ctx.LEGACY_SIMPLIFY_ABOVE = simplifyAbove;
  ctx.LEGACY_GRID_START_NM = G0;
  ctx.LEGACY_PARALLEL = 2;
  ctx.useAlt = false;
  ctx.mb = b => Math.round(b / 1048576) + " MB";
  ctx.objUrl = s => "u:" + s;
  ctx.isRootKnownNotFound = () => false;
  ctx.markRootNotFound = () => {};
  ctx.fetch = async (u) => {
    if (u === "u:R:0") return { ok: true, text: async () => JSON.stringify({ fragments: FRAGS.map((_, i) => "f" + i) }) };
    const i = Number(u.slice(3));
    const f = FRAGS[i];
    return { ok: true, arrayBuffer: async () => f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) };
  };
  vm.runInContext(fnText("core/mesh.js", "clusterDecimate") + "\n"
                + fnText("core/mesh.js", "decodeLegacyFragment") + "\n"
                + fnText("core/mesh.js", "fetchLegacyMesh"), ctx);
  return ctx;
}

(async () => {
  /* ── the simplifier on its own ─────────────────────────────────────────────────────────────── */
  console.log("\nclusterDecimate");
  const c = ctxWith(1e12, 1e12);
  c.v1 = new Float32Array([10,10,10,  40,40,40,  1000,1000,1000]);
  c.i1 = new Uint32Array([0,1,2]);
  let d = vm.runInContext("clusterDecimate(v1,i1,100)", c);
  ok(d.verts.length / 3 === 2, "two vertices in one 100 nm cell become one", d.verts.length / 3);
  ok(d.idx.length === 0, "...and the triangle that lost a corner is dropped", d.idx.length);
  ok(d.verts[0] === 50 && d.verts[1] === 50 && d.verts[2] === 50,
     "the representative is the CELL CENTRE, so independent fragments cannot disagree",
     [d.verts[0], d.verts[1], d.verts[2]].join(","));

  /* Two "fragments" that share a boundary vertex, decoded separately, must place it identically --
     the crack test, and the reason the representative is a centre rather than a kept vertex. */
  c.vA = new Float32Array([  0,0,0,  90,10,10,  200,0,0]);
  c.vB = new Float32Array([ 10,90,10, 30,30,30,  400,0,0]);
  const a = vm.runInContext("clusterDecimate(vA,new Uint32Array([0,1,2]),100)", c);
  const b = vm.runInContext("clusterDecimate(vB,new Uint32Array([0,1,2]),100)", c);
  ok(a.verts[0] === b.verts[0] && a.verts[1] === b.verts[1] && a.verts[2] === b.verts[2],
     "two fragments snap a shared cell to the same point");

  /* ── the fetch: small mesh untouched ───────────────────────────────────────────────────────── */
  console.log("\nfetchLegacyMesh — a small mesh");
  const small = ctxWith(1e12, 1e12);
  small.out = null;
  await vm.runInContext('fetchLegacyMesh("R",null,true).then(function(m){out=m;})', small);
  const m0 = small.out;
  ok(!!m0 && m0.simplified === null, "an ordinary cell is not simplified");
  ok(!!m0 && m0.positions.length / 3 === 24, "...and keeps every vertex", m0 && m0.positions.length / 3);
  const v0 = signedVolumeUm3(m0.positions, m0.indices);
  ok(Math.abs(v0 - 1000) < 1, "...and measures the cube exactly (1000 µm³)", v0.toFixed(2));

  /* ── the fetch: over the budget ────────────────────────────────────────────────────────────── */
  console.log("\nfetchLegacyMesh — over the budget");
  const big = ctxWith(100, 1e12);          // 100 bytes: tripped by the second fragment
  big.out = null;
  await vm.runInContext('fetchLegacyMesh("R",null,true).then(function(m){out=m;})', big);
  const m1 = big.out;
  ok(!!m1, "it arrives instead of throwing");
  ok(!!m1 && !!m1.simplified, "...and reports that it was simplified");
  ok(!!m1 && m1.simplified && m1.simplified.gridUm >= G0 / 1000,
     "...naming the grid it used", m1 && m1.simplified && m1.simplified.gridUm + " µm");
  ok(!!m1 && m1.simplified && m1.simplified.fromVertices === 24,
     "...and how many vertices it started from", m1 && m1.simplified && m1.simplified.fromVertices);
  ok(!!m1 && m1.positions.length / 3 <= 24, "...ending with no more than it started with",
     m1 && m1.positions.length / 3);

  /* UNIFORM, which is what coarsen()'s retro-pass exists for: fragment 0 was decoded before the
     budget was crossed, so if it were left alone its vertices would sit off the grid. */
  const g = m1.simplified.gridUm;
  let offGrid = 0;
  for (let k = 0; k < m1.positions.length; k++){
    const r = m1.positions[k] / g - 0.5;
    if (Math.abs(r - Math.round(r)) > 1e-4) offGrid++;
  }
  ok(offGrid === 0, "every vertex sits on the same grid, early fragments included", offGrid + " off-grid");

  const v1 = signedVolumeUm3(m1.positions, m1.indices);
  ok(v1 > 0 && Math.abs(v1 - 1000) / 1000 < 0.15,
     "the volume survives decimation well enough to be worth showing", v1.toFixed(1) + " µm³");

  /* ── the ceiling still refuses ─────────────────────────────────────────────────────────────── */
  console.log("\nfetchLegacyMesh — past the ceiling");
  const huge = ctxWith(10, 40);
  huge.err = null;
  await vm.runInContext('fetchLegacyMesh("R",null,true).then(function(){},function(e){err=e;})', huge);
  ok(!!huge.err, "a mesh past the ceiling is still refused");
  ok(!!huge.err && /Neuroglancer/.test(huge.err.message),
     "...and is told where to look instead", huge.err && huge.err.message.slice(0, 60));
  ok(!!huge.err && !/no coarser level/.test(huge.err.message),
     "...without the old claim that nothing could be done");

  /* ── the fields have to REACH the page ─────────────────────────────────────────────────────
     computeVolume() and downloadRoot() destructure a named list of fields out of
     fetchCombinedMesh() and rebuild the object. `skipped` was added upstream this morning and not
     named here, so the tooltip that reads it could never have said anything. A named destructure
     is exactly where a new field goes to die, so both are driven rather than read. */
  console.log("\ncomputeVolume / downloadRoot pass them through");
  const pctx = vm.createContext({ console, Map, Math, Error, Number, Object, Promise, JSON, String,
    Float32Array, Uint32Array, Int32Array });
  pctx.CFG = {};
  pctx.extraImg65RootIds = () => [];
  pctx.fetchMesh = async () => ({ positions: new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,1]),
    indices: new Uint32Array([0,1,2, 0,1,3, 0,2,3, 1,2,3]), lod: 0, numLods: 1, bytes: 9,
    simplified: { gridUm: 0.4, fromVertices: 99, toVertices: 4 } });
  pctx.saveGlb = (geo, o) => ({ filename: o.filename + ".glb", vertices: geo.positions.length / 3 });
  vm.runInContext(fnText("core/mesh.js", "fetchCombinedMesh") + "\n"
                + fnText("core/mesh.js", "volumeOf") + "\n"
                + fnText("core/mesh.js", "computeVolume") + "\n"
                + fnText("core/mesh.js", "downloadRoot"), pctx);
  pctx.vol = null; pctx.dl = null;
  await vm.runInContext('computeVolume("A").then(function(x){vol=x;})', pctx);
  await vm.runInContext('downloadRoot("A").then(function(x){dl=x;})', pctx);
  ok(!!pctx.vol && !!pctx.vol.simplified && pctx.vol.simplified.length === 1,
     "computeVolume hands `simplified` to the page");
  ok(!!pctx.vol && Array.isArray(pctx.vol.skipped),
     "...and `skipped`, which it was silently dropping until now");
  ok(!!pctx.dl && /_simplified0p4um/.test(pctx.dl.filename),
     "a simplified .glb carries it in its filename", pctx.dl && pctx.dl.filename);

  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
