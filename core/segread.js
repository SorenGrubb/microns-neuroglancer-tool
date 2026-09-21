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
    /* ZARR KEEPS ITS MARK, 2026-09-21 -- core/zarrread.js reads it; see isZarrBase. */
    if (/^zarr[23]?:/.test(String(src || ""))){
      var zs = String(src).replace(/^zarr:(?!\/\/)/, "");
      return "zarr:" + ((window.UJ && UJ.zarrread) ? UJ.zarrread.httpOf(zs) : zs.replace(/^zarr[23]?:\/\//, ""));
    }
    var s = String(src || "").replace(/^precomputed:\/\//, "");
    if (s.indexOf("gs://") === 0) s = "https://storage.googleapis.com/" + s.slice(5);
    if (s.indexOf("s3://") === 0) s = "https://" + s.slice(5).replace(/^([^/]+)\//, "$1.s3.amazonaws.com/");
    return s.replace(/\/+$/, "");
  }
  function isGraphene(src){ return /^graphene:\/\//.test(String(src || "")); }

  /* ── A BUCKET WITHOUT CORS ───────────────────────────────────────────────────  2026-09-21
     gs://vclem-xh (βJump's Alzheimer's vCLEM, and ηJump's H01) sends no CORS headers, so the
     browser refuses the ordinary public URL: `TypeError: Failed to fetch`. Google's JSON API serves
     the same object WITH them, and honours Range — measured 206 on a 113 MB shard.

     THE WHOLE OBJECT NAME IS ONE ENCODED SEGMENT there, `/b/<bucket>/o/<a%2Fb%2Fc>?alt=media`, and
     this file appends `/key/shard` to a base — which is why this is a URL BUILDER that sees the full
     path, and not a second base string like βJump's meshBaseAlt. A probe that encoded only the
     base drew a flat grey canvas from zero chunks.

     Named per BUCKET, because CORS is a bucket's property. Module-wide, because core/emtiles.js
     reads through this file's fetchers without ever configuring it. Default: no bucket, and
     urlOf() is `base + "/" + path`, byte for byte what the three call sites built before. */
  var GCS = "https://storage.googleapis.com/";
  var JSON_API = {};
  function useJsonApi(bucket){ if (bucket) JSON_API[String(bucket)] = true; }
  function urlOf(base, path){
    var full = base + "/" + path;
    if (full.indexOf(GCS) !== 0 || full.indexOf(GCS + "storage/v1/") === 0) return full;
    var rest = full.slice(GCS.length), cut = rest.indexOf("/");
    if (cut < 0 || !JSON_API[rest.slice(0, cut)]) return full;
    return GCS + "storage/v1/b/" + rest.slice(0, cut) + "/o/"
         + encodeURIComponent(rest.slice(cut + 1)) + "?alt=media";
  }

  /* ── A VOLUME WHOSE INFO LIVES ELSEWHERE, AND ONE THAT IS DISPLACED ─────────  2026-09-21
     χJump's cb2 segmentation: its chunks are public and CORS-open, its own `info` is not readable
     from a page, and the mesh store's info describes it exactly. And it sits 1,216 sections below
     the EM, so a point read at the tool's own z answers for tissue 48 µm away. Per base, like
     useJsonApi, so segpaint -- which reads through _getInfo/_chunkBuf -- sees the same geometry. */
  var INFO_FROM = {}, OFFSET_NM = {};
  function borrowInfo(base, infoBase){ if (base && infoBase) INFO_FROM[base] = httpBase(infoBase); }
  function setOffsetNm(base, nm){ if (base && nm) OFFSET_NM[base] = [+nm[0] || 0, +nm[1] || 0, +nm[2] || 0]; }
  function offsetNm(base){ return OFFSET_NM[base] || [0, 0, 0]; }

  /* ── caches ──────────────────────────────────────────────────────────────────────────────
     Keyed by the exact thing fetched, so nothing can be served for the wrong coordinate. Held
     for the life of the page: the volumes are immutable published data. */
  var infoCache = {};      // base            -> Promise<info>
  var chunkCache = {};     // chunk url       -> Promise<{shape, blockSize, words, buf}|null>
  var shardEntry = {};     // url|minishard   -> Promise<{start,end}|null>
  var miniIndex  = {};     // url|minishard   -> Promise<index|null>

  function isZarrBase(base){ return String(base || "").indexOf("zarr:") === 0; }
  function zarr(){
    if (!(window.UJ && UJ.zarrread)) throw new Error("a Zarr volume, and core/zarrread.js is not loaded");
    return UJ.zarrread;
  }
  function getInfo(base){
    if (isZarrBase(base)){
      if (!infoCache[base]) infoCache[base] = zarr().info(base);
      return infoCache[base];
    }
    if (!infoCache[base])
      infoCache[base] = fetch(urlOf(INFO_FROM[base] || base, "info"), { cache: "force-cache" }).then(function(r){
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

  /* ── raw ─────────────────────────────────────────────────────────────────  2026-09-21
     x fastest, then y, then z, little-endian, one or two uint32 words per voxel -- indexed with
     the chunk's REAL shape. An edge chunk is clipped to the volume; indexed with the nominal
     chunk size every voxel in it reads a neighbour's value, plausibly, and nothing says so. */
  function realShape(at){ return [0, 1, 2].map(function(i){ return at.end[i] - at.start[i]; }); }
  /* Bytes per voxel: the scale's own data_type where it has one (a Zarr level does), else the
     caller's word count -- a precomputed info says it once, at the top. */
  var BPV = { uint8: 1, int8: 1, uint16: 2, int16: 2, uint32: 4, int32: 4, uint64: 8 };
  function bpvOf(scale, words){ return BPV[scale && scale.data_type] || words * 4; }
  /* The two uint32 halves of voxel i, for any width. */
  function rawPair(buf, i, bpv){
    if (bpv === 8){ var d8 = new Uint32Array(buf); return [d8[2 * i] >>> 0, d8[2 * i + 1] >>> 0]; }
    if (bpv === 4) return [new Uint32Array(buf)[i] >>> 0, 0];
    if (bpv === 2) return [new Uint16Array(buf)[i], 0];
    return [new Uint8Array(buf)[i], 0];
  }
  function rawAt(buf, shape, local, bpv){
    var n = shape[0] * shape[1] * shape[2] * bpv;
    if (buf.byteLength < n) throw new Error("a raw chunk of " + buf.byteLength + " bytes, expected " + n);
    var i = local[0] + shape[0] * (local[1] + shape[1] * local[2]);
    var p = rawPair(buf, i, bpv);
    if (bpv < 8) return String(p[0]);
    return (BigInt(p[1]) * 4294967296n + BigInt(p[0])).toString();
  }
  /* One voxel of a chunk, whichever encoding the scale declares. */
  function valueIn(buf, scale, at, words){
    if (scale.encoding === "raw") return rawAt(buf, realShape(at), at.local, bpvOf(scale, words));
    return decodeAt(buf, at.shape, scale.compressed_segmentation_block_size, at.local, words);
  }

  /* ── ONE WHOLE Z-PLANE, TESTED AGAINST A FEW IDS ────────────────────────────────  2026-09-17
     Søren: *"There should be an option to show the segmentation of the root ID and the nucleus ID
     of the cell in the EM window."*

     decodeAt() above reads ONE voxel, which is right for "what cell is at this coordinate" and
     wrong for painting: a 560-pixel window is a quarter of a million voxels, and a quarter of a
     million calls that each re-derive a block header and allocate a BigInt is not a picture, it is
     a stall.

     So this decodes a plane in one pass, and answers the only question an overlay has: IS THIS
     VOXEL ONE OF THE IDS I CARE ABOUT. The id comparison is on the two uint32 halves, never a
     BigInt and never a string, so nothing is allocated per voxel. The block header is read once per
     8x8x8 block rather than once per voxel, and a single-valued block (bits === 0, which is most of
     them out in the neuropil) answers all 64 of its voxels with one lookup.

     Returns a Uint8Array of chunkShape[0] * chunkShape[1]: 0 for none of them, otherwise 1-based
     into `wanted`. `wanted` is [{lo, hi}] -- see UJ.segpaint.idPair(). */
  function planeMatch(buf, chunkShape, blockSize, lz, words, wanted){
    var d = new Uint32Array(buf);
    var chan = d[0];                               // channel 0's block-header array
    var g0 = Math.ceil(chunkShape[0] / blockSize[0]),
        g1 = Math.ceil(chunkShape[1] / blockSize[1]);
    var bz = Math.floor(lz / blockSize[2]), wz = lz % blockSize[2];
    var out = new Uint8Array(chunkShape[0] * chunkShape[1]);
    var nw = wanted.length;
    if (!nw) return out;
    /* Inlined rather than a call per voxel: at this rate the call itself is the cost. */
    var hitOf = function(table, idx){
      var lo, hi;
      if (words === 1){ lo = d[table + idx] >>> 0; hi = 0; }
      else { lo = d[table + idx * 2] >>> 0; hi = d[table + idx * 2 + 1] >>> 0; }
      for (var k = 0; k < nw; k++) if (wanted[k].lo === lo && wanted[k].hi === hi) return k + 1;
      return 0;
    };
    for (var by = 0; by < g1; by++){
      var y0 = by * blockSize[1];
      var ny = Math.min(blockSize[1], chunkShape[1] - y0);
      if (ny <= 0) continue;
      for (var bx = 0; bx < g0; bx++){
        var x0 = bx * blockSize[0];
        var nx = Math.min(blockSize[0], chunkShape[0] - x0);
        if (nx <= 0) continue;
        var hdr = chan + (bx + g0 * (by + g1 * bz)) * 2;
        var h0 = d[hdr], h1 = d[hdr + 1];
        /* CHANNEL-RELATIVE, exactly as in decodeAt -- read as absolute this decodes to a
           plausible-looking nothing rather than to an error. */
        var table = chan + (h0 & 0xffffff);
        var bits = (h0 >>> 24) & 0xff;
        var vals = chan + (h1 & 0xffffff);
        var yy, xx, orow;
        if (bits === 0){
          var one = hitOf(table, 0);
          if (!one) continue;
          for (yy = 0; yy < ny; yy++){
            orow = (y0 + yy) * chunkShape[0] + x0;
            for (xx = 0; xx < nx; xx++) out[orow + xx] = one;
          }
          continue;
        }
        /* bits is a power of two up to 32 per the format, so an encoded index never straddles a
           word. `1 << 32` is 1 in JavaScript, not 0x100000000, so 32 gets the mask written out. */
        var mask = (bits >= 32) ? 0xffffffff : (((1 << bits) - 1) >>> 0);
        var base = blockSize[0] * blockSize[1] * wz;
        for (yy = 0; yy < ny; yy++){
          var iRow = base + blockSize[0] * yy;
          orow = (y0 + yy) * chunkShape[0] + x0;
          for (xx = 0; xx < nx; xx++){
            var bit = (iRow + xx) * bits;
            var idx = (d[vals + (bit >>> 5)] >>> (bit & 31)) & mask;
            var hit = hitOf(table, idx >>> 0);
            if (hit) out[orow + xx] = hit;
          }
        }
      }
    }
    return out;
  }

  /* A plane of either encoding, always in the NOMINAL chunk layout (chunk_sizes[0]) that
     core/segpaint.js walks -- a clipped raw edge chunk is written into the top-left of it. */
  function planeOf(buf, scale, start, end, lz, words, wanted){
    var ch = scale.chunk_sizes[0];
    if (scale.encoding !== "raw")
      return planeMatch(buf, ch, scale.compressed_segmentation_block_size, lz, words, wanted);
    var sh = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
    var out = new Uint8Array(ch[0] * ch[1]);
    var nw = wanted.length;
    if (!nw || lz < 0 || lz >= sh[2]) return out;
    var bpv = bpvOf(scale, words);
    if (buf.byteLength < sh[0] * sh[1] * sh[2] * bpv) return out;
    var d = bpv === 1 ? new Uint8Array(buf) : bpv === 2 ? new Uint16Array(buf) : new Uint32Array(buf);
    words = bpv === 8 ? 2 : 1;
    /* By the low word: a χJump cell is up to ~300 ids, and 300 comparisons per voxel is the
       quarter-million-voxel stall this function exists to avoid. */
    var byLo = new Map();
    for (var q = 0; q < nw; q++){
      var L = byLo.get(wanted[q].lo);
      if (!L) byLo.set(wanted[q].lo, L = []);
      L.push(q);
    }
    var z0 = sh[0] * sh[1] * lz;
    for (var y = 0; y < sh[1]; y++)
      for (var x = 0; x < sh[0]; x++){
        var i = z0 + x + sh[0] * y, lo, hi;
        if (words === 1){ lo = d[i] >>> 0; hi = 0; } else { lo = d[2 * i] >>> 0; hi = d[2 * i + 1] >>> 0; }
        if (!lo && !hi) continue;
        var cand = byLo.get(lo);
        if (!cand) continue;
        for (var k = 0; k < cand.length; k++)
          if (wanted[cand[k]].hi === hi){ out[y * ch[0] + x] = cand[k] + 1; break; }
      }
    return out;
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
    if (isZarrBase(base)) return await zarr().chunk(base, scale, at);
    var url = urlOf(base, scale.key + "/"
            + at.start[0] + "-" + at.end[0] + "_"
            + at.start[1] + "-" + at.end[1] + "_"
            + at.start[2] + "-" + at.end[2]);
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
    var url = urlOf(base, scale.key + "/"
            + shard.toString(16).padStart(Math.ceil(sh.shard_bits / 4), "0") + ".shard");
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
    /* ...and through the volume's own displacement, if it has one: see OFFSET_NM. */
    var sh = offsetNm(base);
    var v = [0, 1, 2].map(function(i){
      return Math.floor((vox[i] * res[i] + sh[i]) / scale.resolution[i]);
    });
    var at = chunkOf(scale, v);
    if (!at) return { value: "0", why: "outside the volume" };
    var buf = scale.sharding ? await shardedChunk(base, scale, at)
                             : await unshardedChunk(base, scale, at);
    if (!buf) return { value: "0", why: "nothing segmented there" };
    /* A raw volume says how wide its values are in its info; compressed ones are the caller's. */
    if (scale.encoding === "raw" && info.data_type) words = /64/.test(info.data_type) ? 2 : 1;
    var val = valueIn(buf, scale, at, words);
    return { value: val, why: val === "0" ? "nothing segmented there" : "" };
  }

  /* ── public ──────────────────────────────────────────────────────────────────────────────── */
  function configure(cfg){
    if (isGraphene(cfg.seg))
      throw new Error("segread cannot read a graphene:// source: indexing one returns supervoxel "
                    + "ids, not the root ids this tool shows. Point it at a flat segmentation.");
    CFG = { seg: httpBase(cfg.seg), nuc: httpBase(cfg.nuc), res: cfg.res || [4, 4, 40] };
    if (CFG.seg){ borrowInfo(CFG.seg, cfg.segInfo); setOffsetNm(CFG.seg, cfg.segOffsetNm); }
    if (CFG.nuc){ borrowInfo(CFG.nuc, cfg.nucInfo); setOffsetNm(CFG.nuc, cfg.nucOffsetNm); }
    return CFG;
  }
  function configured(){ return !!CFG; }

  async function nucleusAt(vox){
    if (!CFG) throw new Error("segread.configure() first");
    if (!CFG.nuc)
      return { nucleusId: 0, why: "this dataset has no nucleus volume to read" };
    var r = await valueAt(CFG.nuc, 1, vox, CFG.res);
    return { nucleusId: r.value === "0" ? 0 : Number(r.value), why: r.why };
  }
  /* ── A DATASET WITH NO FLAT CELL SEGMENTATION IS NOT A BROKEN ONE ─────  2026-09-20
     δJump configures `seg: ""` ON PURPOSE: V1DD's cell segmentation is graphene behind a CAVE
     login, and configure() above refuses a graphene:// source rather than return supervoxel ids
     dressed as root ids. The empty string went on to valueAt, which fetched `"" + "/info"` — the
     host's own 404 page — and threw `no info at  (404)`, with the base missing from the message
     because there was no base.

     Measured on the live δJump, 2026-09-20. The symptom was two levels away: Søren, *"the cell and
     nucleus segmentation is missing from the 3D window in the tracing"*. padOpen() resolves the
     coordinate to fill the two id boxes, this threw, both boxes stayed empty, and the pad's ghosts
     need an id to be ghosts of. */
  async function segmentAt(vox){
    if (!CFG) throw new Error("segread.configure() first");
    if (!CFG.seg)
      return { rootId: "0", why: "this dataset has no flat cell segmentation to read" };
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
  /* NEITHER HALF MAY COST THE OTHER ITS ANSWER.  2026-09-20. This was a bare `Promise.all`, so
     one volume rejecting — a bucket moved, a login in the way, a dataset that simply has no cell
     segmentation — rejected the pair, and the caller learned nothing about the point INCLUDING
     the half that had read perfectly well. On δJump the nucleus volume is plain public
     precomputed and answered every time; nobody ever saw it.

     Each half is settled on its own now and its failure becomes its own `why`, so a caller can
     say what it read and what it could not in the same sentence. */
  async function resolveAt(vox){
    var pair = await Promise.all([
      segmentAt(vox).catch(function(e){
        return { rootId: "0",
                 why: "the cell segmentation could not be read: " + String(e && e.message || e) };
      }),
      nucleusAt(vox).catch(function(e){
        return { nucleusId: 0,
                 why: "the nucleus volume could not be read: " + String(e && e.message || e) };
      })
    ]);
    return { rootId: pair[0].rootId, nucleusId: pair[1].nucleusId,
             inCell: pair[0].rootId !== "0", inNucleus: pair[1].nucleusId !== 0,
             why: pair[0].why || "", nucWhy: pair[1].why || "" };
  }

  /* ── THE NUCLEUS NEAR A POINT, BY READING RATHER THAN GUESSING ───────────────  2026-09-11
     Søren, on three NR type II he marked in astrocytes at the glia limitans: "By definition, NRs
     are not inside the nucleus meshes, but are going through them."

     He is right, and it is definitional rather than incidental. A type II nucleoplasmic reticulum
     is an invagination of BOTH nuclear membranes carrying a "diffusion-accessible cytoplasmic
     core" into the nucleus (Jorgens/Bermudez et al., Front. Cell Dev. Biol. 2022,
     doi:10.3389/fcell.2022.914286). A nucleus segmentation labels nucleoplasm, so the tubule's
     core is excluded from it -- a marker placed correctly inside an NR type II reads 0 in the
     nucleus volume EVERY TIME. Measured on his three: all six endpoints read 0 in both volumes,
     and a probe found nucleus 253863 at 188 nm from one and 445951 at 92-181 nm from the other
     four.

     So: sample the nucleus volume OUTWARD from the point, on the volume's own grid, nearest first.
     This is not the "nearest nucleus" fallback rejected elsewhere in this file -- that one compares
     a point to a list of CENTROIDS, which in a dendrite names a different cell entirely. This reads
     the actual segmentation within a radius smaller than the structures involved: at 188 nm the
     voxel found is the wall of the tubule the marker is in, not a neighbouring cell.

     AMBIGUITY IS REPORTED, NOT RESOLVED. Once a first id is found the search keeps going a little
     further; a second, different nucleus that close means the marker sits between two nuclei and
     the honest answer is to say so. */
  var OFFSETS = null, OFFSET_KEY = "";
  function offsetsWithin(res, capNm){
    var key = res.join(",") + "|" + capNm;
    if (OFFSETS && OFFSET_KEY === key) return OFFSETS;
    var r = [Math.floor(capNm / res[0]), Math.floor(capNm / res[1]), Math.floor(capNm / res[2])];
    var list = [];
    for (var x = -r[0]; x <= r[0]; x++)
      for (var y = -r[1]; y <= r[1]; y++)
        for (var z = -r[2]; z <= r[2]; z++){
          var d = Math.sqrt(Math.pow(x * res[0], 2) + Math.pow(y * res[1], 2) + Math.pow(z * res[2], 2));
          if (d <= capNm) list.push([x, y, z, d]);
        }
    list.sort(function(a, b){ return a[3] - b[3]; });
    OFFSETS = list; OFFSET_KEY = key;
    return list;
  }

  /* One chunk held open across a whole search. The samples are distance-ordered so they stay in
     one chunk almost always, and a chunk of the nucleus volume is 32.8 x 32.8 x 2.56 um -- far
     larger than any radius this is called with. Without this, a search would await a cached
     promise tens of thousands of times for no reason. */
  async function chunkBuf(base, scale, at){
    return scale.sharding ? await shardedChunk(base, scale, at)
                          : await unshardedChunk(base, scale, at);
  }

  async function nearestNucleus(vox, capNm){
    if (!CFG) throw new Error("segread.configure() first");
    var cap = capNm || 1000;
    var info = await getInfo(CFG.nuc), scale = info.scales[0];
    var nsh = offsetNm(CFG.nuc);
    var v = [0, 1, 2].map(function(i){
      return Math.floor((vox[i] * CFG.res[i] + nsh[i]) / scale.resolution[i]);
    });
    var offs = offsetsWithin(scale.resolution, cap);
    var held = null, heldBuf = null;
    var first = 0, firstD = 0, limit = cap, others = {};
    for (var k = 0; k < offs.length; k++){
      var o = offs[k];
      if (o[3] > limit) break;
      var p = [v[0] + o[0], v[1] + o[1], v[2] + o[2]];
      if (!held || p[0] < held.start[0] || p[0] >= held.end[0]
                || p[1] < held.start[1] || p[1] >= held.end[1]
                || p[2] < held.start[2] || p[2] >= held.end[2]){
        held = chunkOf(scale, p);
        heldBuf = held ? await chunkBuf(CFG.nuc, scale, held) : null;
      }
      if (!held || !heldBuf) continue;              // outside the volume, or an unwritten chunk
      var id = valueIn(heldBuf, scale, { start: held.start, end: held.end, shape: held.shape,
                        local: [p[0] - held.start[0], p[1] - held.start[1], p[2] - held.start[2]] }, 1);
      if (id === "0") continue;
      if (!first){
        first = Number(id); firstD = o[3];
        /* Keep looking a little past the first hit, so "between two nuclei" is detectable. */
        limit = Math.min(cap, o[3] * 1.5 + 128);
        continue;
      }
      if (Number(id) !== first) others[id] = 1;
    }
    return { nucleusId: first, distanceNm: Math.round(firstD),
             others: Object.keys(others).map(Number) };
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

  return { configure: configure, configured: configured, useJsonApi: useJsonApi,
           _urlOf: urlOf,
           nucleusAt: nucleusAt, segmentAt: segmentAt, resolveAt: resolveAt,
           nearestNucleus: nearestNucleus, mapPool: mapPool,
           /* exported for the check, which drives the real decoder over real bytes */
           _decodeAt: decodeAt, _compressedMorton: compressedMorton,
           _chunkOf: chunkOf, _httpBase: httpBase, _planeMatch: planeMatch,
           /* 2026-09-21: either encoding, and a volume's own displacement, for core/segpaint.js */
           _planeOf: planeOf, _offsetNm: offsetNm, borrowInfo: borrowInfo, setOffsetNm: setOffsetNm,
           _rawAt: rawAt,
           /* ── and for core/emtiles.js ──────────────────────────────────────────  2026-09-17
              The EM volume is in the same bucket, with the same sharding, and its chunks are
              `raw` uint8 -- so reading one is this file's job already, and emtiles has no fetch
              of its own. `_chunkBuf` returns the chunk's bytes (gunzipped if the source says so)
              or null for a chunk that was never written; `_getInfo` is the cached info fetch.
              Exported rather than copied: a second implementation of compressed Morton codes and
              delta-encoded minishard offsets is a second place for them to be subtly wrong. */
           _getInfo: getInfo, _chunkBuf: chunkBuf };
})();
