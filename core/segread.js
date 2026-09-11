/* ── WHAT CELL IS AT THIS COORDINATE? ──────────────────────────────────────────  2026-09-10

   Søren: "we could make the annotation of organelles in many different cells in a bulk way with
   pasting the Neuroglancer code... figure out which cell's mesh the organelle coordinate is
   within, or which cell's nucleus for organelles related to nuclei."

   This reads a single voxel out of a Neuroglancer `precomputed` volume, in the browser, with no
   server and no CAVE token. Two volumes, two answers:

     nucleusAt(voxel) -> the NUCLEUS id at that point, from minnie65's nucleus segmentation.
     segmentAt(voxel) -> the CELL root id at that point, from the flat segmentation the tool
                         already shows (seg_m1300).

   WHY A VOXEL READ RATHER THAN THE MESH. A point-in-mesh test needs to know which cell to test
   before it can test it, and there are 144,118 of them; nearest-nucleus is only a guess and is
   simply wrong for anything out in a dendrite. The segmentation already holds the answer at every
   voxel -- the same answer Neuroglancer paints -- so the honest thing is to go and read it.

   WHY THIS WORKS WITHOUT A TOKEN. minnie65's `seg_m1300` is a MATERIALISED FLAT segmentation:
   its voxels carry the root ids the tool hands out. A `graphene://` source would not -- indexing
   one returns SUPERVOXEL ids and the root id appears in the voxel data nowhere (that is δJump's
   whole story, see the 2026-09-09 note). So this module is correct for µJump and would be a lie
   on a graphene dataset; configure() refuses one rather than returning supervoxels.

   THE TWO FORMATS, both measured against real data on 2026-09-10:

     NUCLEI  64x64x40 nm, chunks 512x512x64, `compressed_segmentation` uint32, UNSHARDED.
             One GET per chunk. A MISSING CHUNK IS NOT AN ERROR -- cloud-volume never wrote the
             chunks that are entirely background, so 404 means "no nucleus anywhere in this
             block", which is a real answer and is returned as 0.

     SEG     8x8x40 nm, chunks 128x128x32, `compressed_segmentation` uint64, SHARDED
             (neuroglancer_uint64_sharded_v1, identity hash, preshift 9 / minishard 6 / shard 17,
             both indices and the data gzipped). Three range requests and two gunzips per chunk:
             shard index entry -> minishard index -> chunk. A missing shard means empty space.

   VERIFIED, not asserted. Seven cells out of the tool's own embedded table were read back at their
   nucleus centroids: every root id matched (864691136090135607, 864691135373893678,
   864691135194387242, 864691135741608653, 864691135454412650, 864691136908951918) and six of the
   seven nucleus ids did, 730537 among them.

   THE SEVENTH IS THE INTERESTING ONE and it changed the design. Nucleus 598774's stored centroid
   (voxel 334096,273472,20713) reads 0 in the nucleus volume while reading the CORRECT root id in
   the cell segmentation. Probing 891 points around it found 598774 at 147 of them -- so the
   nucleus is there and the reader is right; the recorded centroid simply lands on a voxel the
   nucleus segmentation calls background. A nucleus is not convex at 64 nm.

   So resolveAt() reads BOTH volumes and lets the CELL be the authority: the root id says which
   cell a point is in, for every organelle kind, and the nucleus id is a second, independent fact
   -- "this point is inside nucleus N" -- rather than the only route to an answer. That also makes
   a nucleus read of 0 useful instead of fatal: an NR type II that is not inside any nucleus is a
   misplaced annotation, and worth saying so out loud.

   COST, measured on the same run: ~1.1 s per point for a cold sharded read (three sequential
   round trips), chunks 8-25 kB; a repeat read of the same chunk is 0 ms.

   Everything cacheable is cached BY URL AND RANGE -- shard index entries, minishard indices,
   decoded chunks -- because a batch of organelles from one paste lands in a handful of chunks, and
   the second point in a cell is then free. Batches run through a small concurrency pool rather
   than all at once, so a paste of two hundred markers does not open two hundred sockets.

   OFFSETS ARE CHANNEL-RELATIVE. In compressed_segmentation the block header's lookup-table and
   encoded-value offsets are counted from the START OF THE CHANNEL, not the start of the file.
   Read as absolute they decode to a plausible-looking zero rather than an error -- which is
   exactly what the first run of this module did, and the only reason it was caught is that a
   known nucleus id was sitting there to disagree with it. */
window.UJ = window.UJ || {};
UJ.segread = (function(){
  "use strict";

  var CFG = null;

  /* gs://bucket/path and precomputed://... are the forms the tool's own SRC constants use; the
     browser needs an https one. Kept here so no caller has to know the rule. */
  function httpBase(src){
    var s = String(src || "").replace(/^precomputed:\/\//, "");
    if (s.indexOf("gs://") === 0) s = "https://storage.googleapis.com/" + s.slice(5);
    if (s.indexOf("s3://") === 0) s = "https://" + s.slice(5).replace(/^([^/]+)\//, "$1.s3.amazonaws.com/");
    return s.replace(/\/+$/, "");
  }
  function isGraphene(src){ return /^graphene:\/\//.test(String(src || "")); }

  /* ── caches ──────────────────────────────────────────────────────────────────────────────
     Keyed by the exact thing fetched, so nothing can be served for the wrong coordinate. Held
     for the life of the page: the volumes are immutable published data. */
  var infoCache = {};      // base            -> Promise<info>
  var chunkCache = {};     // chunk url       -> Promise<{shape, blockSize, words, buf}|null>
  var shardEntry = {};     // url|minishard   -> Promise<{start,end}|null>
  var miniIndex  = {};     // url|minishard   -> Promise<index|null>

  function getInfo(base){
    if (!infoCache[base])
      infoCache[base] = fetch(base + "/info", { cache: "force-cache" }).then(function(r){
        if (!r.ok) throw new Error("no info at " + base + " (" + r.status + ")");
        return r.json();
      });
    return infoCache[base];
  }

  async function gunzip(buf){
    var stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).arrayBuffer();
  }
  async function rangeGet(url, a, b){
    var r = await fetch(url, { headers: { Range: "bytes=" + a + "-" + b } });
    if (r.status === 200 || r.status === 206) return await r.arrayBuffer();
    return null;                                   // 404 == nothing written here == background
  }

  /* ── compressed_segmentation ──────────────────────────────────────────────────────────────
     One voxel, not a whole chunk: decoding 128x128x32 values to read one of them would cost far
     more than the fetch did. `words` is 1 for a uint32 volume and 2 for uint64. */
  function decodeAt(buf, chunkShape, blockSize, local, words){
    var d = new Uint32Array(buf);
    var chan = d[0];                               // channel 0's block-header array
    var g = [Math.ceil(chunkShape[0] / blockSize[0]),
             Math.ceil(chunkShape[1] / blockSize[1]),
             Math.ceil(chunkShape[2] / blockSize[2])];
    var b = [Math.floor(local[0] / blockSize[0]),
             Math.floor(local[1] / blockSize[1]),
             Math.floor(local[2] / blockSize[2])];
    var hdr = chan + (b[0] + g[0] * (b[1] + g[1] * b[2])) * 2;
    var h0 = d[hdr], h1 = d[hdr + 1];
    /* CHANNEL-RELATIVE. See the header note -- read as absolute this silently returns 0. */
    var table = chan + (h0 & 0xffffff);
    var bits  = (h0 >>> 24) & 0xff;
    var vals  = chan + (h1 & 0xffffff);
    var idx = 0;
    if (bits > 0){                                 // bits === 0 means the block is one value
      var i = (local[0] % blockSize[0])
            + blockSize[0] * ((local[1] % blockSize[1])
            + blockSize[1] * (local[2] % blockSize[2]));
      var bit = i * bits;
      idx = (d[vals + (bit >>> 5)] >>> (bit & 31)) & ((1 << bits) - 1);
    }
    if (words === 1) return String(d[table + idx] >>> 0);
    var lo = d[table + idx * 2] >>> 0, hi = d[table + idx * 2 + 1] >>> 0;
    return (BigInt(hi) * 4294967296n + BigInt(lo)).toString();
  }

  /* ── where a voxel lives ────────────────────────────────────────────────────────────────── */
  function chunkOf(scale, v){
    var ch = scale.chunk_sizes[0], off = scale.voxel_offset || [0, 0, 0];
    var c = [0, 1, 2].map(function(i){ return Math.floor((v[i] - off[i]) / ch[i]); });
    var grid = [0, 1, 2].map(function(i){ return Math.ceil(scale.size[i] / ch[i]); });
    for (var i = 0; i < 3; i++)
      if (v[i] < off[i] || v[i] >= off[i] + scale.size[i]) return null;   // outside the volume
    var start = [0, 1, 2].map(function(i){ return off[i] + c[i] * ch[i]; });
    return { c: c, grid: grid, start: start,
             end: [0, 1, 2].map(function(i){ return Math.min(start[i] + ch[i], off[i] + scale.size[i]); }),
             local: [0, 1, 2].map(function(i){ return v[i] - start[i]; }),
             shape: ch };
  }

  /* Compressed Morton code: the bits of the three chunk indices interleaved, SKIPPING a dimension
     once its own index can no longer contribute a bit. A plain Morton code would give a different
     number and find a different chunk (or none). */
  function compressedMorton(pos, grid){
    var bits = grid.map(function(g){ return Math.max(0, Math.ceil(Math.log2(Math.max(1, g)))); });
    var code = 0n, out = 0n;
    for (var i = 0; i < 32; i++)
      for (var d = 0; d < 3; d++)
        if (i < bits[d]){
          code |= ((BigInt(pos[d]) >> BigInt(i)) & 1n) << out;
          out += 1n;
        }
    return code;
  }

  /* ── unsharded: one GET ──────────────────────────────────────────────────────────────────── */
  async function unshardedChunk(base, scale, at){
    var url = base + "/" + scale.key + "/"
            + at.start[0] + "-" + at.end[0] + "_"
            + at.start[1] + "-" + at.end[1] + "_"
            + at.start[2] + "-" + at.end[2];
    if (!chunkCache[url]) chunkCache[url] = (async function(){
      var r = await fetch(url);
      if (!r.ok) return null;                      // never written == all background
      return await r.arrayBuffer();
    })();
    return await chunkCache[url];
  }

  /* ── sharded: shard index entry -> minishard index -> chunk ──────────────────────────────── */
  async function shardedChunk(base, scale, at){
    var sh = scale.sharding;
    var key = compressedMorton(at.c, at.grid);
    var hashed = key >> BigInt(sh.preshift_bits);          // identity hash
    var mini  = Number(hashed & ((1n << BigInt(sh.minishard_bits)) - 1n));
    var shard = Number((hashed >> BigInt(sh.minishard_bits)) & ((1n << BigInt(sh.shard_bits)) - 1n));
    var url = base + "/" + scale.key + "/"
            + shard.toString(16).padStart(Math.ceil(sh.shard_bits / 4), "0") + ".shard";
    var indexEnd = (1 << sh.minishard_bits) * 16;          // offsets below are past this
    var ek = url + "|" + mini;

    if (!shardEntry[ek]) shardEntry[ek] = (async function(){
      var buf = await rangeGet(url, mini * 16, mini * 16 + 15);
      if (!buf) return null;                               // no such shard == empty space
      var dv = new DataView(buf);
      var s = dv.getBigUint64(0, true), e = dv.getBigUint64(8, true);
      return (e === s) ? null : { start: s, end: e };
    })();
    var ent = await shardEntry[ek];
    if (!ent) return null;

    if (!miniIndex[ek]) miniIndex[ek] = (async function(){
      var raw = await rangeGet(url, indexEnd + Number(ent.start), indexEnd + Number(ent.end) - 1);
      if (!raw) return null;
      if (sh.minishard_index_encoding === "gzip") raw = await gunzip(raw);
      var dv = new DataView(raw), n = raw.byteLength / 24;
      /* Three delta-encoded uint64 arrays: chunk ids, start offsets, sizes. An offset is relative
         to the END of the previous chunk, not to the previous offset -- get that wrong and every
         chunk after the first reads somebody else's bytes. */
      var ids = new Array(n), starts = new Array(n), sizes = new Array(n);
      var id = 0n, off = 0n;
      for (var i = 0; i < n; i++){ id += dv.getBigUint64(i * 8, true); ids[i] = id; }
      for (var j = 0; j < n; j++){
        off += dv.getBigUint64((n + j) * 8, true);
        starts[j] = off;
        sizes[j] = dv.getBigUint64((2 * n + j) * 8, true);
        off += sizes[j];
      }
      var byId = new Map();
      for (var k = 0; k < n; k++) byId.set(ids[k].toString(), { start: starts[k], size: sizes[k] });
      return byId;
    })();
    var index = await miniIndex[ek];
    if (!index) return null;
    var hit = index.get(key.toString());
    if (!hit) return null;                                 // chunk absent == background

    var curl = url + "#" + hit.start;                      // cache key, not a request
    if (!chunkCache[curl]) chunkCache[curl] = (async function(){
      var raw = await rangeGet(url, indexEnd + Number(hit.start),
                                    indexEnd + Number(hit.start) + Number(hit.size) - 1);
      if (!raw) return null;
      return (sh.data_encoding === "gzip") ? await gunzip(raw) : raw;
    })();
    return await chunkCache[curl];
  }

  /* ── one voxel out of one volume ─────────────────────────────────────────────────────────── */
  async function valueAt(base, words, vox, res){
    var info = await getInfo(base);
    var scale = info.scales[0];
    /* The caller's voxel is in the TOOL's grid (µJump: 4/4/40 nm). Every volume here has its own,
       so convert through nanometres rather than assuming they agree -- the nucleus volume is
       64/64/40 and the segmentation 8/8/40, and neither is the tool's. */
    var v = [0, 1, 2].map(function(i){
      return Math.floor(vox[i] * res[i] / scale.resolution[i]);
    });
    var at = chunkOf(scale, v);
    if (!at) return { value: "0", why: "outside the volume" };
    var buf = scale.sharding ? await shardedChunk(base, scale, at)
                             : await unshardedChunk(base, scale, at);
    if (!buf) return { value: "0", why: "nothing segmented there" };
    var val = decodeAt(buf, at.shape, scale.compressed_segmentation_block_size, at.local, words);
    return { value: val, why: val === "0" ? "nothing segmented there" : "" };
  }

  /* ── public ──────────────────────────────────────────────────────────────────────────────── */
  function configure(cfg){
    if (isGraphene(cfg.seg))
      throw new Error("segread cannot read a graphene:// source: indexing one returns supervoxel "
                    + "ids, not the root ids this tool shows. Point it at a flat segmentation.");
    CFG = { seg: httpBase(cfg.seg), nuc: httpBase(cfg.nuc), res: cfg.res || [4, 4, 40] };
    return CFG;
  }
  function configured(){ return !!CFG; }

  async function nucleusAt(vox){
    if (!CFG) throw new Error("segread.configure() first");
    var r = await valueAt(CFG.nuc, 1, vox, CFG.res);
    return { nucleusId: r.value === "0" ? 0 : Number(r.value), why: r.why };
  }
  async function segmentAt(vox){
    if (!CFG) throw new Error("segread.configure() first");
    var r = await valueAt(CFG.seg, 2, vox, CFG.res);
    return { rootId: r.value, why: r.why };
  }

  /* BOTH volumes, because neither alone is enough -- see the note on nucleus 598774 in the header.
     The cell is the authority (it answers for every organelle kind and it answered correctly at
     all seven test points); the nucleus id is a second, independent fact about the same point.

       rootId    "0" = the point is in no cell at all: outside the tissue, or in the extracellular
                 space between cells. Nothing to attach an organelle to.
       nucleusId 0   = the point is not inside any segmented nucleus. Normal and expected for a
                 mitochondrion; a red flag for an NR type II.

     Deliberately no fallback to "nearest nucleus": a guess that looks like a reading is worse than
     an honest blank, and in a dendrite the nearest nucleus belongs to a different cell. */
  async function resolveAt(vox){
    var pair = await Promise.all([segmentAt(vox), nucleusAt(vox)]);
    return { rootId: pair[0].rootId, nucleusId: pair[1].nucleusId,
             inCell: pair[0].rootId !== "0", inNucleus: pair[1].nucleusId !== 0,
             why: pair[0].why || "" };
  }

  /* A small pool rather than Promise.all: a paste of two hundred markers would otherwise open two
     hundred sockets, and the browser would queue them anyway -- badly, and with no progress to
     report while it did. onProgress is called after each item so a panel can count up. */
  async function mapPool(items, limit, fn, onProgress){
    var out = new Array(items.length), next = 0, done = 0;
    async function worker(){
      for (;;){
        var i = next++;
        if (i >= items.length) return;
        try { out[i] = await fn(items[i], i); }
        catch (e){ out[i] = { error: String(e && e.message || e) }; }
        done++;
        if (onProgress) try { onProgress(done, items.length); } catch (_e){}
      }
    }
    var n = Math.min(limit, items.length) || 0;
    var running = [];
    for (var w = 0; w < n; w++) running.push(worker());
    await Promise.all(running);
    return out;
  }

  return { configure: configure, configured: configured,
           nucleusAt: nucleusAt, segmentAt: segmentAt, resolveAt: resolveAt,
           mapPool: mapPool,
           /* exported for the check, which drives the real decoder over real bytes */
           _decodeAt: decodeAt, _compressedMorton: compressedMorton,
           _chunkOf: chunkOf, _httpBase: httpBase };
})();
