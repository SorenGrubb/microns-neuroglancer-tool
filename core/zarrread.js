/* core/zarrread.js — a Zarr volume, read as though it were a precomputed one.        2026-09-21

   Søren, on ωJump's volumes: *"Also write a reader for the 41, if possible."*

   core/segread.js and core/emtiles.js read Neuroglancer `precomputed`: an `info` file and chunks
   named by their voxel range. ωJump's volumes are mostly not that. Measured from grubblab.com on
   2026-09-21, the 49 that are Zarr come in four shapes:

     29  WEBKNOSSOS (demo.wk1…, data-humerus…)  Zarr v2, NO compression, order F, chunks
                                                 1x32x32x32, axes c,x,y,z, key "0.i.j.k"
     16  OpenOrganelle                          Zarr v2, zstd, order C, chunks 64-128^3, axes
                                                 z,y,x, key "k/j/i"
      1  OpenOrganelle (jrc_mus-kidney-2)       Zarr v2, BLOSC around zstd, no shuffle
      3  OpenOrganelle (lung-2a, duodenum-1a,   Zarr v3, sharding_indexed: 1024^3 shards of 64^3
         skel-muscle-1)                          chunks, each bytes -> zstd -> crc32c; uint16 for two

   So this file answers the two questions segread asks of a volume, in segread's own terms:

     info(base)              -> { data_type, scales: [{ key, resolution [x,y,z] nm, size, voxel_offset,
                                  chunk_sizes: [[cx,cy,cz]], encoding: "raw", data_type }] }
                                from the OME-Zarr `multiscales` (v0.4 .zattrs, v0.5 zarr.json)
     chunk(base, scale, at)  -> an ArrayBuffer of `raw` voxels, x fastest, CLIPPED to at.end -
                                at.start -- byte for byte what a precomputed raw chunk would be --
                                or null for a chunk that was never written

   and core/segread.js routes any base it was given as `zarr://…` here. Nothing downstream knows.

   WHAT IS NOT PRETENDED
     - OME `translation`: OpenOrganelle's coarser levels carry a half-voxel offset (4 nm at 16 nm).
       It is rounded to whole voxels, which makes it 0 on every level measured. A sub-voxel shift of
       a downsampled picture is not something a tracing pad drawn at that level can show anyway.
     - A channel axis must be size 1 (WEBKNOSSOS writes one). A real multi-channel volume is refused.
     - Codecs: none, zstd, gzip, zlib, blosc(zstd|zlib|gzip, byte-shuffle), crc32c (stripped, not
       verified), bytes (either endianness). Anything else -- lz4 inside blosc, a transpose codec --
       throws with its name, rather than drawing noise.

   The zstd itself is core/fzstd.js (fzstd 0.1.1, MIT): browsers decompress gzip and deflate only.
   configure({ zstd }) swaps it, for checks that run without the file. */
window.UJ = window.UJ || {};
UJ.zarrread = (function(){
  "use strict";

  var OPT = { zstd: null };
  function configure(o){ o = o || {}; if (o.zstd) OPT.zstd = o.zstd; return OPT; }

  /* ── where it is ─────────────────────────────────────────────────────────────────────────── */
  /* zarr://, zarr2:// and zarr3:// are Neuroglancer's own spellings; the version is read from the
     store either way (a v3 array has been found behind a plain "zarr://" in ωJump's own config). */
  function isZarr(src){ return /^zarr[23]?:/.test(String(src || "")); }
  function httpOf(src){
    var s = String(src || "").replace(/^zarr[23]?:(\/\/)?/, "");
    if (s.indexOf("s3://") === 0) s = "https://" + s.slice(5).replace(/^([^/]+)\//, "$1.s3.amazonaws.com/");
    if (s.indexOf("gs://") === 0) s = "https://storage.googleapis.com/" + s.slice(5);
    return s.replace(/\/+$/, "");
  }

  async function getJson(url){
    var r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;
    return await r.json();
  }

  /* ── the volume ─────────────────────────────────────────────────────────────────────────── */
  var INFO = {};
  var UNIT_NM = { nanometer: 1, micrometer: 1000, angstrom: 0.1, millimeter: 1e6 };
  var V2_DTYPE = { "|u1": "uint8", "<u1": "uint8", "|i1": "int8", "<u2": "uint16", ">u2": "uint16",
                   "<u4": "uint32", ">u4": "uint32", "<u8": "uint64", ">u8": "uint64",
                   "<i2": "int16", "<i4": "int32", "<f4": "float32" };
  var BYTES = { uint8: 1, int8: 1, uint16: 2, int16: 2, uint32: 4, int32: 4, float32: 4, uint64: 8 };

  function info(base){
    var http = httpOf(base);
    if (!INFO[http]) INFO[http] = (async function(){
      var v = 2, ms = null, top = await getJson(http + "/.zattrs");
      if (top && top.multiscales) ms = top.multiscales[0];
      else {
        var j = await getJson(http + "/zarr.json");
        if (!j) throw new Error("no Zarr metadata at " + http);
        v = 3;
        var at = j.attributes || {};
        ms = (at.ome && at.ome.multiscales) ? at.ome.multiscales[0]
           : (at.multiscales ? at.multiscales[0] : null);
      }
      if (!ms) throw new Error("no OME multiscales at " + http);
      var names = ms.axes.map(function(a){ return typeof a === "string" ? a : a.name; });
      var ax = { x: names.indexOf("x"), y: names.indexOf("y"), z: names.indexOf("z"),
                 c: names.indexOf("c") };
      if (ax.x < 0 || ax.y < 0 || ax.z < 0) throw new Error("axes " + names.join(",") + " at " + http);
      var unit = 1;
      ms.axes.forEach(function(a){ if (a && a.name === "x" && a.unit && UNIT_NM[a.unit]) unit = UNIT_NM[a.unit]; });
      /* A top-level transform applies to every level (OME 0.5 puts a unit scale there). */
      var topScale = null;
      (ms.coordinateTransformations || []).forEach(function(t){ if (t.scale) topScale = t.scale; });

      var scales = await Promise.all(ms.datasets.map(async function(d){
        var sc = null, tr = null;
        (d.coordinateTransformations || []).forEach(function(t){
          if (t.scale) sc = t.scale; if (t.translation) tr = t.translation; });
        sc = sc || names.map(function(){ return 1; });
        if (topScale) sc = sc.map(function(s, i){ return s * topScale[i]; });
        var url = http + "/" + d.path, a;
        if (v === 2){
          var z = await getJson(url + "/.zarray");
          if (!z) throw new Error("no .zarray at " + url);
          a = { v: 2, shape: z.shape, chunks: z.chunks, dtype: V2_DTYPE[z.dtype] || z.dtype,
                big: String(z.dtype).charAt(0) === ">", order: z.order || "C",
                sep: z.dimension_separator || ".", compressor: z.compressor, filters: z.filters,
                fill: z.fill_value || 0 };
          if (a.filters && a.filters.length) throw new Error("Zarr filters are not read: " + JSON.stringify(a.filters));
        } else {
          var y = await getJson(url + "/zarr.json");
          if (!y) throw new Error("no zarr.json at " + url);
          var outer = y.chunk_grid.configuration.chunk_shape, codecs = y.codecs, shard = null;
          if (codecs.length === 1 && codecs[0].name === "sharding_indexed"){
            var cf = codecs[0].configuration;
            shard = { shape: outer, inner: cf.chunk_shape, index: cf.index_codecs || [],
                      atStart: cf.index_location === "start" };
            codecs = cf.codecs;
          }
          var enc = y.chunk_key_encoding || { name: "default" };
          a = { v: 3, shape: y.shape, chunks: shard ? shard.inner : outer, dtype: y.data_type,
                big: false, order: "C", codecs: codecs, shard: shard,
                keyV2: enc.name === "v2",
                sep: (enc.configuration && enc.configuration.separator) || (enc.name === "v2" ? "." : "/"),
                fill: y.fill_value || 0 };
          codecs.forEach(function(c){ if (c.name === "bytes" && c.configuration && c.configuration.endian === "big") a.big = true; });
        }
        if (ax.c >= 0 && a.shape[ax.c] !== 1) throw new Error("a " + a.shape[ax.c] + "-channel volume is not read");
        if (!BYTES[a.dtype]) throw new Error("data type " + a.dtype + " is not read");
        var pick = function(arr){ return [arr[ax.x], arr[ax.y], arr[ax.z]]; };
        var res = pick(sc).map(function(s){ return s * unit; });
        var off = tr ? pick(tr).map(function(t, i){ return Math.round(t * unit / res[i]); }) : [0, 0, 0];
        return { key: String(d.path), resolution: res, size: pick(a.shape),
                 voxel_offset: off, chunk_sizes: [pick(a.chunks)], encoding: "raw",
                 data_type: a.dtype, _zarr: { url: url, ax: ax, n: names.length, a: a } };
      }));
      return { type: "image", data_type: scales[0].data_type, num_channels: 1, scales: scales,
               _zarr: { version: v, http: http } };
    })();
    return INFO[http];
  }

  /* ── codecs ─────────────────────────────────────────────────────────────────────────────── */
  function zstd(u8){
    var f = OPT.zstd || (typeof fzstd !== "undefined" && fzstd.decompress);
    if (!f) throw new Error("zstd chunk, and core/fzstd.js is not loaded");
    return f(u8);
  }
  async function inflate(u8, kind){
    var s = new Blob([u8]).stream().pipeThrough(new DecompressionStream(kind));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  /* Blosc 1 frame: a 16-byte header, then (unless it was stored as-is) one start offset per block,
     and per block one or more length-prefixed compressed streams. Only what OpenOrganelle writes is
     read -- zstd, zlib or gzip inside, with or without byte shuffle; blosclz and lz4 throw. */
  /* The FORMAT codes in the header -- lz4 and lz4hc share one. */
  var BLOSC_NAMES = ["blosclz", "lz4", "snappy", "zlib", "zstd"];
  async function blosc(u8){
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var flags = u8[2], ts = u8[3] || 1;
    var nbytes = dv.getUint32(4, true), bsize = dv.getUint32(8, true);
    var out = new Uint8Array(nbytes);
    /* MEMCPYED: stored as given, before any shuffle -- c-blosc copies it straight back out. */
    if (flags & 0x02){ out.set(u8.subarray(16, 16 + nbytes)); return out; }
    var comp = BLOSC_NAMES[(flags >> 5) & 7] || ("#" + ((flags >> 5) & 7));
    if (comp !== "zstd" && comp !== "zlib") throw new Error("blosc with " + comp + " inside is not read");
    var nblocks = Math.ceil(nbytes / bsize);
    var split = !(flags & 0x10) && (comp === "blosclz" || comp.indexOf("lz4") === 0) && ts <= 16 && bsize / ts >= 128;
    for (var b = 0; b < nblocks; b++){
      var start = dv.getUint32(16 + 4 * b, true);
      var bl = Math.min(bsize, nbytes - b * bsize);
      var ns = split ? ts : 1, per = bl / ns, p = start, at = b * bsize;
      for (var s = 0; s < ns; s++){
        var cs = dv.getInt32(p, true); p += 4;
        var piece = u8.subarray(p, p + cs); p += cs;
        var dec = (cs === per) ? piece : (comp === "zstd" ? zstd(piece) : await inflate(piece, "deflate"));
        out.set(dec.subarray(0, per), at); at += per;
      }
    }
    return unshuffle(out, ts, flags, bsize);
  }
  function unshuffle(a, ts, flags, bsize){
    if (!(flags & 0x01) || ts <= 1) {
      if (flags & 0x04) throw new Error("blosc bit-shuffle is not read");
      return a;
    }
    var out = new Uint8Array(a.length);
    for (var b0 = 0; b0 < a.length; b0 += bsize){
      var bl = Math.min(bsize, a.length - b0), n = Math.floor(bl / ts);
      for (var j = 0; j < ts; j++)
        for (var i = 0; i < n; i++) out[b0 + i * ts + j] = a[b0 + j * n + i];
      for (var k = n * ts; k < bl; k++) out[b0 + k] = a[b0 + k];      // the leftover tail, as stored
    }
    return out;
  }
  async function decodeV2(u8, a){
    var c = a.compressor;
    if (!c) return u8;
    if (c.id === "zstd") return zstd(u8);
    if (c.id === "gzip") return await inflate(u8, "gzip");
    if (c.id === "zlib") return await inflate(u8, "deflate");
    if (c.id === "blosc") return await blosc(u8);
    throw new Error("Zarr compressor " + c.id + " is not read");
  }
  async function decodeV3(u8, codecs){
    for (var i = codecs.length - 1; i >= 0; i--){
      var n = codecs[i].name;
      if (n === "crc32c") u8 = u8.subarray(0, u8.length - 4);
      else if (n === "zstd") u8 = zstd(u8);
      else if (n === "gzip") u8 = await inflate(u8, "gzip");
      else if (n === "bytes") {}
      else throw new Error("Zarr v3 codec " + n + " is not read");
    }
    return u8;
  }

  /* ── one chunk ──────────────────────────────────────────────────────────────────────────── */
  var CHUNKS = {}, SHARD_INDEX = {};
  function key(a, idx){
    if (a.v === 2) return idx.join(a.sep);
    return a.keyV2 ? idx.join(a.sep) : "c" + a.sep + idx.join(a.sep);
  }
  async function rangeGet(url, a, b){
    var r = await fetch(url, { headers: { Range: b == null ? "bytes=-" + a : "bytes=" + a + "-" + b } });
    if (r.status !== 200 && r.status !== 206) return null;
    return new Uint8Array(await r.arrayBuffer());
  }
  async function shardBytes(z, idx){
    var a = z.a, sh = a.shard, n = z.n;
    var per = sh.shape.map(function(s, i){ return Math.round(s / sh.inner[i]); });
    var outer = idx.map(function(v, i){ return Math.floor(v / per[i]); });
    var inner = idx.map(function(v, i){ return v - outer[i] * per[i]; });
    var url = z.url + "/" + key(a, outer);
    var count = per.reduce(function(p, q){ return p * q; }, 1);
    var crc = sh.index.some(function(c){ return c.name === "crc32c"; }) ? 4 : 0;
    if (!SHARD_INDEX[url]) SHARD_INDEX[url] = (async function(){
      var len = count * 16 + crc;
      var u8 = sh.atStart ? await rangeGet(url, 0, len - 1) : await rangeGet(url, len);
      if (!u8 || u8.length < count * 16) return null;
      return new DataView(u8.buffer, u8.byteOffset, count * 16);
    })();
    var dv = await SHARD_INDEX[url];
    if (!dv) return null;
    var k = 0;
    for (var i = 0; i < n; i++) k = k * per[i] + inner[i];
    var off = dv.getBigUint64(k * 16, true), nb = dv.getBigUint64(k * 16 + 8, true);
    if (off === 0xffffffffffffffffn && nb === 0xffffffffffffffffn) return null;   // never written
    return await rangeGet(url, Number(off), Number(off + nb) - 1);
  }

  /* The chunk at precomputed-style `at` (at.c in x,y,z chunk units, at.start/at.end in voxels),
     as raw x-fastest voxels of the CLIPPED shape. */
  function chunk(base, scale, at){
    var z = scale._zarr;
    if (!z) return Promise.resolve(null);
    var ax = z.ax, a = z.a, n = z.n;
    var idx = []; for (var i = 0; i < n; i++) idx.push(0);
    idx[ax.x] = at.c[0]; idx[ax.y] = at.c[1]; idx[ax.z] = at.c[2];
    var id = z.url + "|" + idx.join(",");
    if (!CHUNKS[id]) CHUNKS[id] = (async function(){
      var u8;
      if (a.shard) u8 = await shardBytes(z, idx);
      else {
        var r = await fetch(z.url + "/" + key(a, idx));
        u8 = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
      }
      if (!u8 || !u8.length) return null;
      u8 = a.v === 2 ? await decodeV2(u8, a) : await decodeV3(u8, a.codecs);
      return relay(u8, a, ax, n, at);
    })();
    return CHUNKS[id];
  }

  /* The decoded chunk is the FULL nominal chunk in the array's own axis order and memory order;
     what segread expects is x fastest and clipped to the volume. */
  function relay(u8, a, ax, n, at){
    var bpv = BYTES[a.dtype];
    var shape = a.chunks, stride = new Array(n), s = 1, i;
    if (a.order === "F") for (i = 0; i < n; i++){ stride[i] = s; s *= shape[i]; }
    else for (i = n - 1; i >= 0; i--){ stride[i] = s; s *= shape[i]; }
    if (u8.length < s * bpv) throw new Error("a Zarr chunk of " + u8.length + " bytes, expected " + s * bpv);
    var ex = at.end[0] - at.start[0], ey = at.end[1] - at.start[1], ez = at.end[2] - at.start[2];
    var sx = stride[ax.x] * bpv, sy = stride[ax.y] * bpv, sz = stride[ax.z] * bpv;
    var out = new Uint8Array(ex * ey * ez * bpv), o = 0;
    for (var zz = 0; zz < ez; zz++)
      for (var yy = 0; yy < ey; yy++){
        var p = zz * sz + yy * sy;
        if (bpv === 1 && sx === 1){ out.set(u8.subarray(p, p + ex), o); o += ex; continue; }
        for (var xx = 0; xx < ex; xx++, p += sx)
          for (var b = 0; b < bpv; b++) out[o++] = u8[p + (a.big ? bpv - 1 - b : b)];
      }
    return out.buffer;
  }

  return { configure: configure, isZarr: isZarr, httpOf: httpOf, info: info, chunk: chunk,
           /* for the check */
           _blosc: blosc, _relay: relay, _key: key };
})();
