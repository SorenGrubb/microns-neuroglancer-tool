/* core/zarrread.js — ωJump's four Zarr shapes, read as precomputed.                  2026-09-21

   The stores are written by fixtures/make_zarr_fixtures.py with the REAL encoders (zstandard,
   numcodecs.Blosc), and every voxel's value says where it is, so a wrong axis, a wrong stride or a
   wrong chunk key reads a DIFFERENT number rather than a plausible one:

       em(x,y,z)  = (x + 3y + 7z) % 256      em16 = 30000 + x + 10y + 100z
       seg(x,y,z) = 864691135000000000 + x + 1000y + 1000000z

   Checked through core/segread.js -- the reader every card uses -- as well as directly, so what is
   proven is that a `zarr://` source works end to end, not that a helper returns something.

   Run: node zarrreadcheck.js */
const fs = require("fs"), vm = require("vm"), zlib = require("zlib");
const core = require("./corepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const FX = JSON.parse(fs.readFileSync(__dirname + "/fixtures/zarr_fixtures.json", "utf8"));
const H = "https://h/";
const em = (x, y, z) => (x + 3 * y + 7 * z) % 256;
const em16 = (x, y, z) => 30000 + x + 10 * y + 100 * z;
const seg = (x, y, z) => (864691135000000000n + BigInt(x) + 1000n * BigInt(y) + 1000000n * BigInt(z)).toString();

function load(){
  const hits = [];
  const sb = { console, JSON, Math, Number, String, Array, Map, BigInt, Promise, Uint8Array, Uint16Array,
               Uint32Array, DataView, ArrayBuffer, WeakMap, Error, isFinite, setTimeout };
  sb.window = sb; sb.self = sb;
  sb.fetch = async (url, opts) => {
    const range = opts && opts.headers && opts.headers.Range;
    hits.push(url + (range ? " " + range : ""));
    const p = url.startsWith(H) ? url.slice(H.length) : null;
    if (p === null || !(p in FX)) return { ok: false, status: 404, async json(){ return null; }, async arrayBuffer(){ return new ArrayBuffer(0); } };
    let b = Buffer.from(FX[p], "base64"), status = 200;
    if (range){
      let m = /bytes=-(\d+)/.exec(range);
      if (m) b = b.slice(b.length - Number(m[1]));
      else { m = /bytes=(\d+)-(\d+)/.exec(range); b = b.slice(Number(m[1]), Number(m[2]) + 1); }
      status = 206;
    }
    return { ok: true, status, async json(){ return JSON.parse(b.toString()); },
             async arrayBuffer(){ return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } };
  };
  vm.createContext(sb);
  for (const f of ["fzstd.js", "zarrread.js", "segread.js", "emtiles.js"])
    vm.runInContext(fs.readFileSync(core(f), "utf8"), sb);
  return { Z: sb.UJ.zarrread, S: sb.UJ.segread, E: sb.UJ.emtiles, hits };
}
/* Every voxel of one chunk, read back through the precomputed-shaped result. */
async function chunkMatches(Z, base, scale, c, fn, bpv){
  const ch = scale.chunk_sizes[0];
  const start = [0, 1, 2].map(i => scale.voxel_offset[i] + c[i] * ch[i]);
  const end = [0, 1, 2].map(i => Math.min(start[i] + ch[i], scale.voxel_offset[i] + scale.size[i]));
  const buf = await Z.chunk(base, scale, { c, start, end });
  if (!buf) return { ok: false, why: "null" };
  const sh = [0, 1, 2].map(i => end[i] - start[i]);
  const v = bpv === 1 ? new Uint8Array(buf) : bpv === 2 ? new Uint16Array(buf) : null;
  if (buf.byteLength !== sh[0] * sh[1] * sh[2] * bpv) return { ok: false, why: "size " + buf.byteLength + " for " + sh.join("x") };
  for (let z = 0; z < sh[2]; z++) for (let y = 0; y < sh[1]; y++) for (let x = 0; x < sh[0]; x++){
    const got = v[x + sh[0] * (y + sh[1] * z)], want = fn(start[0] + x, start[1] + y, start[2] + z);
    if (got !== want) return { ok: false, why: "at " + [start[0] + x, start[1] + y, start[2] + z] + " read " + got + ", want " + want };
  }
  return { ok: true, why: sh.join("x") + " voxels" };
}

(async () => {
  console.log("WEBKNOSSOS: v2, c,x,y,z, order F, uncompressed");
  {
    const { Z } = load();
    const inf = await Z.info("zarr:" + H + "wk/color");
    const s = inf.scales[0];
    ok(s.resolution.join() === "11.24,11.24,30" && s.size.join() === "10,6,5" && s.chunk_sizes[0].join() === "4,4,4",
       "the channel axis is dropped and x,y,z come out in that order", s.resolution + " / " + s.size + " / " + s.chunk_sizes[0]);
    const a = await chunkMatches(Z, "zarr:" + H + "wk/color", s, [1, 0, 1], em, 1);
    ok(a.ok, "an inner chunk: every voxel where it belongs", a.why);
    const e = await chunkMatches(Z, "zarr:" + H + "wk/color", s, [2, 1, 1], em, 1);
    ok(e.ok, "an EDGE chunk: clipped to the volume, x still fastest", e.why);
  }

  console.log("\nOpenOrganelle: v2, z,y,x, order C, zstd");
  {
    const { Z } = load();
    const inf = await Z.info("zarr:" + H + "oo");
    ok(inf.scales.length === 2 && inf.scales[1].resolution.join() === "16,16,16" && inf.scales[1].voxel_offset.join() === "0,0,0",
       "two levels; the half-voxel translation rounds to no offset", inf.scales.map(s => s.key + ":" + s.resolution[0] + "@" + s.voxel_offset).join(" "));
    const a = await chunkMatches(Z, "zarr:" + H + "oo", inf.scales[0], [2, 1, 1], em, 1);
    ok(a.ok, "zstd, and the axes turned round", a.why);
    const b = await chunkMatches(Z, "zarr:" + H + "oo", inf.scales[1], [1, 0, 0], em, 1);
    ok(b.ok, "...on the coarser level too", b.why);
  }

  console.log("\nOpenOrganelle: blosc around zstd (jrc_mus-kidney-2's shape), and with byte shuffle");
  {
    const { Z } = load();
    const inf = await Z.info("zarr:" + H + "oob");
    const a = await chunkMatches(Z, "zarr:" + H + "oob", inf.scales[0], [0, 1, 1], em, 1);
    ok(a.ok, "blosc(zstd), no shuffle", a.why);
    const inf2 = await Z.info("zarr:" + H + "oobs");
    ok(inf2.scales[0].data_type === "uint16", "a uint16 level says so", inf2.scales[0].data_type);
    const b = await chunkMatches(Z, "zarr:" + H + "oobs", inf2.scales[0], [1, 1, 1], em16, 2);
    ok(b.ok, "blosc(zstd) WITH byte shuffle, uint16, compressed for real", b.why);
  }

  console.log("\nOpenOrganelle: v3, sharded, uint16, bytes -> zstd -> crc32c");
  {
    const { Z, hits } = load();
    const inf = await Z.info("zarr:" + H + "oo3");
    const s = inf.scales[0];
    ok(s.chunk_sizes[0].join() === "4,4,4", "the INNER chunk is the chunk", s.chunk_sizes[0].join());
    const a = await chunkMatches(Z, "zarr:" + H + "oo3", s, [2, 1, 0], em16, 2);
    ok(a.ok, "an inner chunk out of a shard, through its index", a.why);
    const b = await chunkMatches(Z, "zarr:" + H + "oo3", s, [0, 0, 1], em16, 2);
    ok(b.ok, "...another, in a different shard", b.why);
    const m = await Z.chunk("zarr:" + H + "oo3", s, { c: [1, 1, 0], start: [4, 4, 0], end: [8, 6, 4] });
    ok(m === null, "an inner chunk the index marks as never written is null, not garbage");
    ok(hits.some(h => / bytes=-\d+$/.test(h)) && hits.every(h => !/\/c\/\d+\/\d+\/\d+$/.test(h)),
       "the index is read by a suffix range and no shard is ever fetched whole",
       hits.filter(h => /\/c\//.test(h)).length + " shard request(s), all ranged");
  }

  console.log("\nthrough core/segread.js, as every card reads");
  {
    const { S, hits } = load();
    S.configure({ seg: "zarr://https://h/wk/seg", nuc: "", res: [11.24, 11.24, 30] });
    const r1 = await S.segmentAt([7, 5, 2]);
    ok(r1.rootId === seg(7, 5, 2), "a uint64 WEBKNOSSOS segmentation reads its own voxel", r1.rootId);
    const r0 = await S.segmentAt([1, 1, 4]);
    ok(r0.rootId === "0", "an unwritten chunk is background", r0.rootId + " / " + r0.why);
    ok(hits.every(h => h.indexOf("/info") < 0), "...and no precomputed info was ever asked for");
    S.configure({ seg: "zarr://https://h/wk/seg16", nuc: "", res: [11.24, 11.24, 30] });
    const r2 = await S.segmentAt([9, 3, 4]);
    ok(r2.rootId === String(em16(9, 3, 4)), "a uint16 one too — two bytes a voxel, not four", r2.rootId);
    const { S: S3 } = load();
    S3.configure({ seg: "zarr3://https://h/oo3", nuc: "", res: [8, 8, 8] });
    const r3 = await S3.segmentAt([9, 5, 3]);
    ok(r3.rootId === String(em16(9, 5, 3)), "zarr3:// through a shard", r3.rootId);
    const { S: S4 } = load();
    S4.configure({ seg: "zarr://s3://h-bucket/x", nuc: "" });
    ok(S4._httpBase("zarr://s3://bkt/a/b/") === "zarr:https://bkt.s3.amazonaws.com/a/b",
       "zarr://s3:// keeps its mark and becomes the bucket's https", S4._httpBase("zarr://s3://bkt/a/b/"));
  }

  console.log("\nthrough core/emtiles.js: an edge chunk, and a uint16 window");
  {
    const { E, Z } = load();
    E.configure({ em: "zarr://https://h/oobs", res: [8, 8, 8], u16: [30000, 32000] });
    const inf = await Z.info("zarr:" + H + "oobs"), s = inf.scales[0];
    /* chunk (1,1,0): x 16..24, y 16..20, z 0..16 -- 8 x 4 x 16 of a 16^3 stride */
    const buf = await Z.chunk("zarr:" + H + "oobs", s, { c: [1, 1, 0], start: [16, 16, 0], end: [24, 20, 16] });
    const a = await E._decodeChunk(buf, s, [16, 16, 16], [8, 4, 16]);
    const want = (x, y, z) => Math.floor((em16(16 + x, 16 + y, z) - 30000) * 255 / 2000);
    const at = (x, y, z) => a[x + 16 * (y + 16 * z)];
    ok(a.length === 4096 && at(7, 3, 5) === want(7, 3, 5) && at(0, 0, 0) === want(0, 0, 0),
       "an 8x4 edge chunk is laid into the 16x16 stride, and 16 bits are windowed to 8",
       at(7, 3, 5) + " / " + want(7, 3, 5));
    ok(at(8, 0, 0) === 0 && at(0, 4, 0) === 0, "...with the part outside the volume left empty", at(8, 0, 0) + "," + at(0, 4, 0));
  }

  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
