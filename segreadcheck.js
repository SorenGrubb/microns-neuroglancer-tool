/* What cell is at this coordinate — the reader, over bytes this file writes.        2026-09-10

   core/segread.js reads one voxel out of a Neuroglancer `precomputed` volume. Against the live
   MICrONS volumes it has been checked in a browser (segreadprobe.html, seven cells out of µJump's
   own table). This file is the part that can run anywhere: it BUILDS both container formats here,
   byte for byte, plants a known value in a known voxel, and makes the REAL module go and find it.

   Writing the format to test the reader is the point. Every one of these was a real failure mode
   while this was being built:

     * compressed_segmentation offsets are CHANNEL-RELATIVE. Read as absolute they decode to a
       plausible 0 rather than throwing — the module's first run returned 0 for a nucleus that was
       demonstrably there, and only a known id sitting beside it caught the lie.
     * a minishard offset is relative to the END OF THE PREVIOUS CHUNK, not to the previous
       offset. Get that wrong and chunk 1 is right while every chunk after it reads a neighbour's
       bytes — which decodes to a wrong id, not to an error. The two-chunk minishard below exists
       entirely for this.
     * a compressed Morton code is not a Morton code: bits of an exhausted dimension are skipped.
     * a missing chunk or shard is BACKGROUND, not a failure. cloud-volume never writes the blocks
       that are empty, so 404 has to mean 0.

   Run: node segreadcheck.js  */
const fs = require("fs");
const vm = require("vm");
const zlib = require("zlib");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* ── a compressed_segmentation chunk, written here ──────────────────────────────────────────
   One block covering the whole chunk, 1 bit per voxel, a two-entry lookup table: value `hi` at
   every voxel whose index has bit 0 set... no — simpler and stricter: `hi` at exactly ONE chosen
   voxel and `lo` everywhere else, so reading the wrong voxel gives the wrong answer. */
function buildChunk(shape, block, words, at, hiValue, loValue){
  return buildChunkOf(shape, block, words, [loValue, hiValue], [{ at: at, slot: 1 }]);
}
/* `table[0]` is the background everywhere; each plant puts its slot at one voxel. Enough bits for
   the table, so two planted values (three slots) really do use 2 bits and exercise the packing.

   MULTI-BLOCK, on purpose. A chunk larger than one block has a block-header array with one entry
   per block in x-fastest order, and the reader has to index into it correctly — untested until a
   chunk here had more than one block. The blocks share a lookup table (the format allows it: the
   offsets simply point at the same place) and each gets its own run of encoded values. */
function buildChunkOf(shape, block, words, table, plants){
  const grid = [Math.ceil(shape[0] / block[0]), Math.ceil(shape[1] / block[1]),
                Math.ceil(shape[2] / block[2])];
  const nBlocks = grid[0] * grid[1] * grid[2];
  const nVox = block[0] * block[1] * block[2];
  const bits = Math.max(1, Math.ceil(Math.log2(table.length)));
  const valWords = Math.ceil(nVox * bits / 32);
  const chan = 1;                                        // header array starts at word 1
  const valsBase = chan + 2 * nBlocks;
  const tableAbs = valsBase + nBlocks * valWords;
  const d = new Uint32Array(tableAbs + table.length * words);
  d[0] = chan;
  for (let b = 0; b < nBlocks; b++){
    d[chan + b * 2]     = (tableAbs - chan) | (bits << 24);          // channel-relative
    d[chan + b * 2 + 1] = (valsBase + b * valWords - chan);
  }
  plants.forEach(p => {
    const bi = Math.floor(p.at[0] / block[0])
             + grid[0] * (Math.floor(p.at[1] / block[1])
             + grid[1] * Math.floor(p.at[2] / block[2]));
    const i = (p.at[0] % block[0])
            + block[0] * ((p.at[1] % block[1]) + block[1] * (p.at[2] % block[2]));
    const bit = i * bits;
    d[valsBase + bi * valWords + (bit >>> 5)] |= (p.slot << (bit & 31));
  });
  table.forEach((v, slot) => {
    if (words === 1) { d[tableAbs + slot] = Number(v) >>> 0; return; }
    const b = BigInt(v);
    d[tableAbs + slot * 2]     = Number(b & 0xffffffffn) >>> 0;
    d[tableAbs + slot * 2 + 1] = Number((b >> 32n) & 0xffffffffn) >>> 0;
  });
  return Buffer.from(d.buffer);
}

/* ── a sharded volume, written here ─────────────────────────────────────────────────────────── */
function u64(buf, i, v){ buf.writeBigUInt64LE(BigInt(v), i * 8); }
function buildShard(entries, minishardBits){
  /* entries: [{key: BigInt chunk id, data: Buffer}] for ONE minishard, ascending by key. */
  const indexBytes = (1 << minishardBits) * 16;
  const payload = Buffer.concat(entries.map(e => e.data));
  const n = entries.length;
  const mi = Buffer.alloc(n * 24);
  let prevKey = 0n;
  for (let i = 0; i < n; i++){ u64(mi, i, entries[i].key - prevKey); prevKey = entries[i].key; }
  /* starts are deltas from the END of the previous chunk — so with the payload laid out
     back to back every delta after the first is ZERO, and a reader that forgets to add the
     previous size lands on the previous chunk. */
  let cursor = 0;
  for (let i = 0; i < n; i++){
    const start = entries.slice(0, i).reduce((a, e) => a + e.data.length, 0);
    u64(mi, n + i, start - cursor);
    cursor = start + entries[i].data.length;
    u64(mi, 2 * n + i, entries[i].data.length);
  }
  const miGz = zlib.gzipSync(mi);
  const shard = Buffer.concat([Buffer.alloc(indexBytes), payload, miGz]);
  shard.writeBigUInt64LE(BigInt(payload.length), 0);                    // minishard 0 index start
  shard.writeBigUInt64LE(BigInt(payload.length + miGz.length), 8);      // ...and end
  return shard;
}

/* ── the module, with the network and the browser's stream API stubbed ───────────────────────── */
function load(routes){
  const sandbox = { console, JSON, Math, Number, String, Array, Map, BigInt, Promise,
                    Uint32Array, DataView, ArrayBuffer, Blob: null, Response: null,
                    DecompressionStream: null, isFinite, setTimeout };
  sandbox.window = sandbox;
  sandbox.DecompressionStream = class { constructor(kind){ this.kind = kind; } };
  sandbox.Blob = class {
    constructor(parts){ this.buf = Buffer.from(parts[0]); }
    stream(){ const b = this.buf; return { pipeThrough(){ return { __gz: b }; } }; }
  };
  sandbox.Response = class {
    constructor(s){ this.s = s; }
    async arrayBuffer(){
      const b = zlib.gunzipSync(this.s.__gz);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    }
  };
  const hits = [];
  sandbox.fetch = async function(url, opts){
    hits.push(url + (opts && opts.headers && opts.headers.Range ? " " + opts.headers.Range : ""));
    const r = routes[url];
    if (!r) return { ok: false, status: 404, async arrayBuffer(){ return new ArrayBuffer(0); } };
    const range = opts && opts.headers && opts.headers.Range;
    let body = r;
    let status = 200;
    if (range){
      const m = /bytes=(\d+)-(\d+)/.exec(range);
      body = r.slice(Number(m[1]), Number(m[2]) + 1);
      status = 206;
    }
    return {
      ok: true, status,
      async json(){ return JSON.parse(r.toString("utf8")); },
      async arrayBuffer(){ return body.buffer.slice(body.byteOffset, body.byteOffset + body.length); }
    };
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(core("segread.js"), "utf8"), ctx);
  return { S: sandbox.UJ.segread, hits };
}

(async () => {

console.log("what the URL rules are");
{
  const { S } = load({});
  ok(S._httpBase("precomputed://gs://bucket/a/b") === "https://storage.googleapis.com/bucket/a/b",
     "gs:// becomes the public https host", S._httpBase("precomputed://gs://bucket/a/b"));
  ok(S._httpBase("precomputed://https://x.example/v/") === "https://x.example/v",
     "an https source loses only the prefix and the trailing slash");
  let threw = "";
  try { S.configure({ seg: "graphene://middleauth+https://x/segmentation/table/t", nuc: "" }); }
  catch (e){ threw = e.message; }
  ok(/supervoxel/.test(threw),
     "a graphene source is REFUSED, not read", threw ? "says why" : "IT ACCEPTED ONE");
}

console.log("\nwhere a voxel lives");
{
  const { S } = load({});
  const scale = { key: "k", size: [1000, 1000, 100], chunk_sizes: [[128, 128, 32]],
                  voxel_offset: [100, 200, 50], resolution: [8, 8, 40] };
  ok(S._chunkOf(scale, [99, 200, 50]) === null, "a voxel before the volume starts is outside");
  ok(S._chunkOf(scale, [1100, 200, 50]) === null, "...and one past its end");
  const at = S._chunkOf(scale, [100 + 128 + 5, 200 + 3, 50 + 32 + 1]);
  ok(String(at.c) === "1,0,1", "the chunk grid is anchored on voxel_offset, not on zero",
     "chunk " + at.c);
  ok(String(at.start) === "228,200,82", "...so the chunk's own name starts there", at.start.join("-"));
  ok(String(at.local) === "5,3,1", "and the voxel's place inside it is what's left over",
     at.local.join(","));

  /* Skipping the bits of an exhausted dimension is the whole difference from a plain Morton code. */
  ok(S._compressedMorton([1, 0, 0], [2, 1, 1]) === 1n,
     "one bit of x, none of y or z, when the grid is 2x1x1");
  ok(S._compressedMorton([0, 1, 0], [2, 2, 1]) === 2n, "x then y, z contributing nothing");
  ok(S._compressedMorton([1, 1, 1], [2, 2, 2]) === 7n, "all three interleaved when all three run");
  ok(S._compressedMorton([3, 0, 0], [8, 2, 2]) === 9n,
     "x keeps going after y and z have run out", String(S._compressedMorton([3, 0, 0], [8, 2, 2])));
}

console.log("\nan unsharded uint32 volume (the nucleus segmentation's shape)");
{
  const base = "https://h/nuc";
  const scale = { key: "64_64_40", size: [512, 512, 64], chunk_sizes: [[8, 8, 8]],
                  voxel_offset: [0, 0, 0], resolution: [64, 64, 40],
                  compressed_segmentation_block_size: [8, 8, 8] };
  const info = Buffer.from(JSON.stringify({ data_type: "uint32", num_channels: 1, scales: [scale] }));
  /* The tool's voxel is 4/4/40 nm; this volume's is 64/64/40. 96 tool-voxels of x = 384 nm = 6. */
  const chunk = buildChunk([8, 8, 8], [8, 8, 8], 1, [6, 2, 3], 730537, 0);
  const { S, hits } = load({ [base + "/info"]: info, [base + "/64_64_40/0-8_0-8_0-8"]: chunk });
  S.configure({ seg: base, nuc: base, res: [4, 4, 40] });

  const hit = await S.nucleusAt([96, 32, 3]);
  ok(hit.nucleusId === 730537, "the planted nucleus id is found through the tool's own voxel grid",
     String(hit.nucleusId));
  const miss = await S.nucleusAt([96, 32, 4]);
  ok(miss.nucleusId === 0, "the very next section is background, not the same id");
  const gone = await S.nucleusAt([96, 32, 40]);
  ok(gone.nucleusId === 0 && /nothing segmented/.test(gone.why),
     "a chunk that was never written reads 0 with a reason, not an error", gone.why);
  const out = await S.nucleusAt([100000, 0, 0]);
  ok(out.nucleusId === 0 && /outside/.test(out.why), "a voxel past the volume says so", out.why);

  const before = hits.length;
  await S.nucleusAt([97, 33, 3]);
  ok(hits.length === before, "a second read in the same chunk goes nowhere near the network",
     (hits.length - before) + " new requests");
}

console.log("\na sharded uint64 volume (the cell segmentation's shape)");
{
  const base = "https://h/seg";
  /* preshift_bits 1 is what puts the two neighbouring chunks in the SAME minishard — which is the
     format's whole point (chunks near each other are read together) and the only arrangement in
     which the offset-delta below can be tested at all. */
  const sharding = { "@type": "neuroglancer_uint64_sharded_v1", data_encoding: "gzip",
                     hash: "identity", minishard_bits: 1, minishard_index_encoding: "gzip",
                     preshift_bits: 1, shard_bits: 4 };
  const scale = { key: "8.0x8.0x40.0", size: [16, 8, 8], chunk_sizes: [[8, 8, 8]],
                  voxel_offset: [0, 0, 0], resolution: [8, 8, 40],
                  compressed_segmentation_block_size: [8, 8, 8], sharding };
  const info = Buffer.from(JSON.stringify({ data_type: "uint64", num_channels: 1, scales: [scale] }));

  /* Grid is 2x1x1, so chunk (0,0,0) is key 0 and chunk (1,0,0) is key 1 — both in minishard 0 of
     shard 0, which is exactly the arrangement that exposes the offset-delta bug: the SECOND chunk
     can only be found if the reader adds the first chunk's size. */
  const A = zlib.gzipSync(buildChunk([8, 8, 8], [8, 8, 8], 2, [1, 1, 1], "864691135741608653", "0"));
  const B = zlib.gzipSync(buildChunk([8, 8, 8], [8, 8, 8], 2, [2, 2, 2], "864691136090135607", "0"));
  ok(A.length !== B.length, "the two chunks differ in size, so a forgotten delta cannot pass",
     A.length + " vs " + B.length + " bytes");
  const shard = buildShard([{ key: 0n, data: A }, { key: 1n, data: B }], 1);

  const { S } = load({ [base + "/info"]: info, [base + "/8.0x8.0x40.0/0.shard"]: shard });
  S.configure({ seg: base, nuc: base, res: [8, 8, 40] });

  const first = await S.segmentAt([1, 1, 1]);
  ok(first.rootId === "864691135741608653", "the first chunk's uint64 root id", first.rootId);
  const second = await S.segmentAt([8 + 2, 2, 2]);
  ok(second.rootId === "864691136090135607",
     "THE SECOND CHUNK — found only by adding the first chunk's size", second.rootId);
  const bg = await S.segmentAt([0, 0, 0]);
  ok(bg.rootId === "0" && /nothing segmented/.test(bg.why),
     "a voxel inside a real chunk but with no cell reads 0", bg.why);

  const { S: S2 } = load({ [base + "/info"]: info });     // no shard file at all
  S2.configure({ seg: base, nuc: base, res: [8, 8, 40] });
  const empty = await S2.segmentAt([1, 1, 1]);
  ok(empty.rootId === "0", "a shard that was never written is empty space, not a crash");
}

console.log("\nboth volumes at once");
{
  const nucBase = "https://h/n", segBase = "https://h/s";
  const nucScale = { key: "n0", size: [8, 8, 8], chunk_sizes: [[8, 8, 8]], voxel_offset: [0, 0, 0],
                     resolution: [8, 8, 40], compressed_segmentation_block_size: [8, 8, 8] };
  const segScale = { key: "s0", size: [8, 8, 8], chunk_sizes: [[8, 8, 8]], voxel_offset: [0, 0, 0],
                     resolution: [8, 8, 40], compressed_segmentation_block_size: [8, 8, 8] };
  const routes = {
    [nucBase + "/info"]: Buffer.from(JSON.stringify({ data_type: "uint32", num_channels: 1, scales: [nucScale] })),
    [segBase + "/info"]: Buffer.from(JSON.stringify({ data_type: "uint64", num_channels: 1, scales: [segScale] })),
    [nucBase + "/n0/0-8_0-8_0-8"]: buildChunk([8, 8, 8], [8, 8, 8], 1, [1, 1, 1], 598774, 0),
    [segBase + "/s0/0-8_0-8_0-8"]: buildChunk([8, 8, 8], [8, 8, 8], 2, [1, 1, 1], "864691135741608653", "0")
  };
  /* The cell chunk plants its id at (1,1,1) and the nucleus chunk at (1,1,1) too; (2,2,2) is
     inside the cell's chunk but is background in both — the shape of nucleus 598774's real
     centroid, which read the right cell and no nucleus at all. */
  const { S } = load(routes);
  S.configure({ seg: segBase, nuc: nucBase, res: [8, 8, 40] });
  const both = await S.resolveAt([1, 1, 1]);
  ok(both.rootId === "864691135741608653" && both.nucleusId === 598774,
     "resolveAt returns the cell AND the nucleus from one call",
     both.rootId + " / " + both.nucleusId);
  ok(both.inCell && both.inNucleus, "...and says plainly that the point is inside both");

  const cellOnly = await S.resolveAt([2, 2, 2]);
  ok(cellOnly.rootId === "0" && cellOnly.nucleusId === 0,
     "a point in neither reads 0 in both, with no guess substituted",
     cellOnly.rootId + " / " + cellOnly.nucleusId);
  ok(cellOnly.inCell === false && cellOnly.inNucleus === false,
     "...which is what lets a panel say why it cannot place a marker");
}

/* ── the nucleus NEAR a point ────────────────────────────────────────────────────────────────
   Søren: "By definition, NRs are not inside the nucleus meshes, but are going through them."

   A type II nucleoplasmic reticulum carries a cytoplasmic core into the nucleus, so the nucleus
   segmentation excludes it and a correctly placed marker reads 0 there every time. Measured on his
   three: all six endpoints blank in both volumes, with the nuclei 92-188 nm away. This is the rung
   of the ladder that finds them — by reading the segmentation outward, not by comparing the point
   to a list of nucleus centres. */
console.log("\nthe nucleus near a point, not the nucleus at it");
{
  const base = "https://h/nuc2";
  const scale = { key: "n", size: [64, 64, 64], chunk_sizes: [[64, 64, 64]], voxel_offset: [0, 0, 0],
                  resolution: [64, 64, 40], compressed_segmentation_block_size: [8, 8, 8] };
  const info = Buffer.from(JSON.stringify({ data_type: "uint32", num_channels: 1, scales: [scale] }));
  /* Nucleus 253863 planted three x-voxels from the query point: 3 x 64 nm = 192 nm, which is the
     distance his own marker sat at. Nothing at the point itself, exactly like a real NR tubule. */
  const chunk = buildChunkOf([64, 64, 64], [8, 8, 8], 1, [0, 253863, 445951],
                             [{ at: [11, 4, 4], slot: 1 }]);
  const { S } = load({ [base + "/info"]: info, [base + "/n/0-64_0-64_0-64"]: chunk });
  S.configure({ seg: base, nuc: base, res: [64, 64, 40] });

  const atPoint = await S.nucleusAt([8, 4, 4]);
  ok(atPoint.nucleusId === 0, "the point itself is blank, as an NR marker always is");

  const near = await S.nearestNucleus([8, 4, 4], 1000);
  ok(near.nucleusId === 253863, "...and the nucleus three voxels away is found", String(near.nucleusId));
  ok(near.distanceNm === 192, "...with the distance it was found at, in nanometres",
     near.distanceNm + " nm");
  ok(near.others.length === 0, "one nucleus nearby is not ambiguous");

  const tooFar = await S.nearestNucleus([8, 4, 4], 100);
  ok(tooFar.nucleusId === 0, "a cap shorter than the distance finds nothing rather than reaching",
     "100 nm cap vs a 192 nm neighbour");

  /* Two nuclei at comparable distance is the case that must NOT be resolved by preference. */
  const both = buildChunkOf([64, 64, 64], [8, 8, 8], 1, [0, 253863, 445951],
                            [{ at: [11, 4, 4], slot: 1 }, { at: [5, 4, 4], slot: 2 }]);
  const { S: S2 } = load({ [base + "/info"]: info, [base + "/n/0-64_0-64_0-64"]: both });
  S2.configure({ seg: base, nuc: base, res: [64, 64, 40] });
  const amb = await S2.nearestNucleus([8, 4, 4], 1000);
  ok(amb.nucleusId === 445951 && amb.others.length === 1 && amb.others[0] === 253863,
     "two nuclei within reach are BOTH reported, nearest first",
     amb.nucleusId + " + " + amb.others.join(","));

  /* The search must not walk out of the volume or into a chunk nobody wrote. */
  const { S: S3 } = load({ [base + "/info"]: info });
  S3.configure({ seg: base, nuc: base, res: [64, 64, 40] });
  const none = await S3.nearestNucleus([8, 4, 4], 1000);
  ok(none.nucleusId === 0, "an unwritten chunk is background, not a crash");
  const edge = await S.nearestNucleus([0, 0, 0], 1000);
  ok(typeof edge.nucleusId === "number", "a point on the volume's corner searches without falling off",
     "found " + edge.nucleusId);
}

/* \u2500\u2500 A VOLUME THIS DATASET DOES NOT HAVE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-09-20
   \u03b4Jump configures `seg: ""` deliberately \u2014 V1DD's cell segmentation is graphene behind a CAVE
   login, and configure() above refuses a graphene:// source outright. The empty string used to
   travel to valueAt, which fetched `"" + "/info"`, got the host's own 404 page and threw
   `no info at  (404)`. Because resolveAt joined the two volumes with `Promise.all`, that took the
   NUCLEUS answer down with it \u2014 and the nucleus volume is plain public precomputed and had read
   perfectly well.

   Measured on the live \u03b4Jump before this was written:

       UJ.segread.configure(tracingSources());          // seg:"", nuc: v1dd_nuclei
       await UJ.segread.resolveAt([95086,88093,6130]);
       -> Error: no info at  (404)

   \u2014 note the missing base in the message, because there was no base. */
/* ── A BUCKET WITHOUT CORS ────────────────────────────────────────────────────────  2026-09-21
   gs://vclem-xh sends no CORS headers; Google's JSON API serves the same objects with them and
   honours Range (206 on a 113 MB shard, measured from grubblab.com). The JSON API wants the WHOLE
   object name as one percent-encoded segment — a probe that encoded only the base and appended
   `/16.0x16.0x30.0/07.shard` drew a flat grey canvas from zero chunks. So this routes the real
   sharded reader to ONLY the JSON-API URLs and makes it find both chunks: a reader that built any
   URL the old way would get 404, which here means empty space, which reads 0. */
console.log("\na bucket without CORS");
{
  const { S } = load({});
  const plain = "https://storage.googleapis.com/vclem-xh/alzheimers/em_clahe";
  ok(S._urlOf(plain, "info") === plain + "/info",
     "no bucket named: the URL is exactly what it always was", S._urlOf(plain, "info"));
  S.useJsonApi("vclem-xh");
  const u = S._urlOf(plain, "16.0x16.0x30.0/07.shard");
  ok(u === "https://storage.googleapis.com/storage/v1/b/vclem-xh/o/"
         + "alzheimers%2Fem_clahe%2F16.0x16.0x30.0%2F07.shard?alt=media",
     "a named bucket goes through the JSON API, with the WHOLE object name encoded", u);
  ok(S._urlOf("https://storage.googleapis.com/v1dd_imagery/image", "info")
       === "https://storage.googleapis.com/v1dd_imagery/image/info",
     "...and only that bucket — V1DD's has CORS and keeps its plain URL");
  const already = "https://storage.googleapis.com/storage/v1/b/vclem-xh/o/x%2Fy";
  ok(S._urlOf(already, "info") === already + "/info",
     "a URL already on the JSON API is left alone, not encoded twice");
  ok(S._urlOf("https://bossdb-open-data.s3.amazonaws.com/v", "info")
       === "https://bossdb-open-data.s3.amazonaws.com/v/info",
     "...as is anything not on storage.googleapis.com");

  const base = "https://storage.googleapis.com/vclem-xh/a/seg";
  const J = k => "https://storage.googleapis.com/storage/v1/b/vclem-xh/o/"
               + encodeURIComponent("a/seg/" + k) + "?alt=media";
  const sharding = { "@type": "neuroglancer_uint64_sharded_v1", data_encoding: "gzip",
                     hash: "identity", minishard_bits: 1, minishard_index_encoding: "gzip",
                     preshift_bits: 1, shard_bits: 4 };
  const scale = { key: "8.0x8.0x40.0", size: [16, 8, 8], chunk_sizes: [[8, 8, 8]],
                  voxel_offset: [0, 0, 0], resolution: [8, 8, 40],
                  compressed_segmentation_block_size: [8, 8, 8], sharding };
  const info = Buffer.from(JSON.stringify({ data_type: "uint64", num_channels: 1, scales: [scale] }));
  const A = zlib.gzipSync(buildChunk([8, 8, 8], [8, 8, 8], 2, [1, 1, 1], "864691135741608653", "0"));
  const B = zlib.gzipSync(buildChunk([8, 8, 8], [8, 8, 8], 2, [2, 2, 2], "864691136090135607", "0"));
  const shard = buildShard([{ key: 0n, data: A }, { key: 1n, data: B }], 1);

  const { S: S2, hits } = load({ [J("info")]: info, [J("8.0x8.0x40.0/0.shard")]: shard });
  S2.useJsonApi("vclem-xh");
  S2.configure({ seg: "precomputed://gs://vclem-xh/a/seg", nuc: "", res: [8, 8, 40] });
  const a = await S2.segmentAt([1, 1, 1]);
  const b = await S2.segmentAt([8 + 2, 2, 2]);
  ok(a.rootId === "864691135741608653" && b.rootId === "864691136090135607",
     "a SHARDED volume reads through the JSON API — both chunks, so Range works on it too",
     a.rootId + " / " + b.rootId);
  ok(hits.length > 0 && hits.every(h => h.indexOf("/storage/v1/b/vclem-xh/o/") > 0),
     "...and every request went that way", hits.length + " request(s)");
}

console.log("\na volume the dataset does not have");
{
  const base = "https://h/x";
  const info = Buffer.from(JSON.stringify({ type: "segmentation", data_type: "uint32",
    num_channels: 1, scales: [{ key: "n", size: [64, 64, 64], chunk_sizes: [[64, 64, 64]],
      voxel_offset: [0, 0, 0], resolution: [64, 64, 40], encoding: "compressed_segmentation",
      compressed_segmentation_block_size: [8, 8, 8] }] }));
  const chunk = buildChunkOf([64, 64, 64], [8, 8, 8], 1, [0, 308149], [{ at: [4, 4, 4], slot: 1 }]);

  const { S, hits } = load({ [base + "/info"]: info, [base + "/n/0-64_0-64_0-64"]: chunk });
  S.configure({ seg: "", nuc: base, res: [64, 64, 40] });

  const seg = await S.segmentAt([4, 4, 4]);
  ok(seg.rootId === "0" && /no flat cell segmentation/.test(seg.why || ""),
     "an unconfigured cell volume is REPORTED, not fetched", JSON.stringify(seg));
  ok(!hits.some(u => /^\/info/.test(u) || u === "/info"),
     "...so nothing was fetched from an empty base",
     hits.filter(u => u.indexOf(base) !== 0).join(",") || "nothing off-base");

  const r = await S.resolveAt([4, 4, 4]);
  ok(Number(r.nucleusId) === 308149,
     "...and the NUCLEUS still answers, which is the half that was being lost",
     JSON.stringify({ nucleusId: r.nucleusId, rootId: r.rootId }));
  ok(/no flat cell segmentation/.test(r.why || ""),
     "...with the cell half's reason carried out to the caller", JSON.stringify(r.why));

  /* The mirror case, so the fix is not one-sided: a page with a segmentation and no nuclei. The
     cell volume is uint64 here \u2014 segmentAt reads TWO words, so reusing the uint32 chunk above
     would assert against a number nobody wrote. */
  const segBase = "https://h/s";
  const segInfo = Buffer.from(JSON.stringify({ type: "segmentation", data_type: "uint64",
    num_channels: 1, scales: [{ key: "s", size: [64, 64, 64], chunk_sizes: [[64, 64, 64]],
      voxel_offset: [0, 0, 0], resolution: [64, 64, 40], encoding: "compressed_segmentation",
      compressed_segmentation_block_size: [8, 8, 8] }] }));
  const segChunk = buildChunkOf([64, 64, 64], [8, 8, 8], 2, ["0", "864691135741608653"],
                                [{ at: [4, 4, 4], slot: 1 }]);
  const { S: S2 } = load({ [segBase + "/info"]: segInfo,
                           [segBase + "/s/0-64_0-64_0-64"]: segChunk });
  S2.configure({ seg: segBase, nuc: "", res: [64, 64, 40] });
  const r2 = await S2.resolveAt([4, 4, 4]);
  ok(String(r2.rootId) === "864691135741608653" && Number(r2.nucleusId) === 0
     && /no nucleus volume/.test(r2.nucWhy || ""),
     "...and the same the other way round: no nuclei volume, cell still read",
     JSON.stringify({ rootId: r2.rootId, nucWhy: r2.nucWhy }));

  /* A volume that is configured and BROKEN is a different thing from one that is absent, and it
     must not take its partner down either. Nothing is routed for this base, so info 404s. */
  const { S: S3 } = load({ [base + "/info"]: info, [base + "/n/0-64_0-64_0-64"]: chunk });
  S3.configure({ seg: "https://h/gone", nuc: base, res: [64, 64, 40] });
  const r3 = await S3.resolveAt([4, 4, 4]);
  ok(Number(r3.nucleusId) === 308149 && /could not be read/.test(r3.why || ""),
     "a configured volume that 404s loses only its own answer",
     JSON.stringify({ nucleusId: r3.nucleusId, why: (r3.why || "").slice(0, 60) }));
}

/* ── A RAW VOLUME, READ WHERE IT REALLY IS ───────────────────────────────────────  2026-09-21
   χJump's cb2 cell segmentation, measured from grubblab.com: `raw` uint64 at 16/16/40 nm, chunks
   256x256x16, voxel_offset z -1280 -- and its `info` is not beside its chunks (the seg/ folder has
   none that the browser may read) but in the mesh store, mesh/nguyen_thomas2022/cb2/info. It also
   sits 1,216 sections below the EM: read at the tool's own z it answers for tissue 48 um away.
   Nine proofread cells read back their own fragment ids at z - 1216, and four of them did NOT at
   z - 1280 (which the metadata implies), so the shift is the viewer's number, not a derived one.

   Three things this reader did not do: decode a raw chunk, take its geometry from another info,
   and read a volume that is displaced from the tool's frame. Each is pinned below on bytes written
   here -- including an EDGE chunk, which a raw reader must index with the chunk's real, clipped
   shape and not the nominal one, or every voxel in it reads its neighbour's value. */
function rawChunk(shape, plants){
  const b = Buffer.alloc(shape[0] * shape[1] * shape[2] * 8);
  for (const [x, y, z, id] of plants)
    b.writeBigUInt64LE(BigInt(id), 8 * (x + shape[0] * (y + shape[1] * z)));
  return b;
}
console.log("\na raw volume, read where it really is");
{
  const scale = { key: "16_16_40", size: [6, 4, 8], chunk_sizes: [[4, 4, 4]],
                  voxel_offset: [0, 0, -32], resolution: [16, 16, 40], encoding: "raw" };
  const info = Buffer.from(JSON.stringify({ type: "segmentation", data_type: "uint64",
                                            num_channels: 1, scales: [scale] }));
  const ID = "8164402790444", EDGE = "19929873776729";
  const routes = {
    "https://h/meshstore/info": info,
    /* chunk 0: x 0-4, y 0-4, z -32..-28 -- a negative range is written "-32--28" */
    "https://h/seg/16_16_40/0-4_0-4_-32--28": rawChunk([4, 4, 4], [[1, 2, 3, ID]]),
    /* the edge chunk: x 4-6 is TWO wide, not four */
    "https://h/seg/16_16_40/4-6_0-4_-32--28": rawChunk([2, 4, 4], [[1, 3, 2, EDGE]])
  };
  const { S } = load(routes);
  /* The tool's frame is 4/4/40; the volume is 16/16/40 and 30 sections below it. */
  S.configure({ seg: "precomputed://https://h/seg", segInfo: "https://h/meshstore",
                segOffsetNm: [0, 0, -30 * 40], nuc: "", res: [4, 4, 40] });
  /* volume voxel (1,2,-29)  <-  tool voxel (4..7, 8..11, 1) */
  const a = await S.segmentAt([5, 9, 1]);
  ok(a.rootId === ID, "a raw uint64 chunk is decoded", a.rootId + (a.why ? " (" + a.why + ")" : ""));
  const bg = await S.segmentAt([5, 9, 2]);
  ok(bg.rootId === "0", "...and the next section is background, not the same id", bg.rootId);
  /* volume voxel (5,3,-30) is local (1,3,2) of the 2-wide edge chunk */
  const e = await S.segmentAt([21, 13, 0]);
  ok(e.rootId === EDGE, "an EDGE chunk is indexed with its real, clipped width", e.rootId);
  const { S: S0 } = load(routes);
  S0.configure({ seg: "precomputed://https://h/seg", segInfo: "https://h/meshstore",
                 nuc: "", res: [4, 4, 40] });
  const shifted = await S0.segmentAt([5, 9, 1]);
  ok(shifted.rootId !== ID, "without the offset the same point reads somewhere else entirely",
     shifted.rootId + " / " + shifted.why);
  const { S: S1 } = load(routes);
  S1.configure({ seg: "precomputed://https://h/seg", segOffsetNm: [0, 0, -1200],
                 nuc: "", res: [4, 4, 40] });
  const noInfo = await S1.segmentAt([5, 9, 1]).catch(e => ({ rootId: "threw", why: e.message }));
  ok(noInfo.rootId !== ID, "...and without the borrowed info there is no geometry to read with",
     noInfo.why);

  /* The plane, for painting: the same two ids, found in one pass over each chunk. */
  const buf = routes["https://h/seg/16_16_40/0-4_0-4_-32--28"];
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  const m = S._planeOf(ab, scale, [0, 0, -32], [4, 4, -28], 3, 2,
                       [{ lo: Number(BigInt(ID) & 0xffffffffn), hi: Number(BigInt(ID) >> 32n) }]);
  ok(m.length === 16 && m[1 + 4 * 2] === 1 && m.reduce((a, b) => a + b, 0) === 1,
     "a raw plane is matched against the wanted ids, one voxel lit", m.length + " px");
  const buf2 = routes["https://h/seg/16_16_40/4-6_0-4_-32--28"];
  const ab2 = buf2.buffer.slice(buf2.byteOffset, buf2.byteOffset + buf2.length);
  const m2 = S._planeOf(ab2, scale, [4, 0, -32], [6, 4, -28], 2, 2,
                        [{ lo: Number(BigInt(EDGE) & 0xffffffffn), hi: Number(BigInt(EDGE) >> 32n) }]);
  ok(m2.length === 16 && m2[1 + 4 * 3] === 1,
     "...and an edge chunk's plane comes back in the NOMINAL layout the painter walks",
     m2.length + " px, lit at " + m2.indexOf(1));
}

console.log("\nhow a batch is run");
{
  const { S } = load({});
  let live = 0, peak = 0;
  const items = Array.from({ length: 25 }, (_, i) => i);
  const seen = [];
  const out = await S.mapPool(items, 6, async (n) => {
    live++; peak = Math.max(peak, live);
    await new Promise(r => setTimeout(r, 1));
    live--;
    return n * 2;
  }, (done) => seen.push(done));
  ok(out.length === 25 && out[24] === 48 && out[0] === 0,
     "every item comes back, in its own place", out.slice(0, 3).join(",") + "…" + out[24]);
  ok(peak <= 6, "no more than six run at once", "peak " + peak);
  ok(seen.length === 25 && seen[24] === 25, "progress counts up once per finished item");

  const mixed = await S.mapPool([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("nope");
    return n;
  });
  ok(mixed[0] === 1 && mixed[2] === 3 && mixed[1] && mixed[1].error === "nope",
     "one failure is reported in its own slot and does not take the batch down",
     JSON.stringify(mixed));
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);

})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
