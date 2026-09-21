# -*- coding: utf-8 -*-
u"""core/segread.js and core/emtiles.js read a Zarr volume, through core/zarrread.js.   2026-09-21

Søren: *"Also write a reader for the 41, if possible."* ωJump's volumes are Zarr: WEBKNOSSOS's
uncompressed v2, OpenOrganelle's zstd v2 (one of them blosc) and sharded v3. core/zarrread.js turns
each into what segread already reads -- an `info` and raw chunks -- so the change here is routing:

  segread   a source given as zarr://, zarr2:// or zarr3:// keeps that mark through httpBase, and
            getInfo / the chunk fetch hand it to UJ.zarrread. Everything after -- chunkOf, the
            caches' callers, resolveAt, segpaint, emtiles -- sees a raw volume.
            A raw voxel is 1, 2, 4 or 8 bytes by the scale's data_type (WEBKNOSSOS writes a uint16
            segmentation); it was 4 or 8 only.
  emtiles   a raw EDGE chunk is laid back into the nominal chunk before the section reads it with
            the nominal stride. Precomputed raw had the same fault at the volume's far edges -- an
            edge chunk of 100 voxels read as though it were 128 wide, every row sheared -- and it
            only shows where the tissue meets the end of the block, which is where nobody looked.
            A uint16 EM (two OpenOrganelle blocks) is windowed into 8 bits by configure({u16}),
            the dataset's own em_range, before anything else sees it.

Every change is inert on a volume that is neither Zarr, nor uint16, nor at an edge.

Run: python3 src/segread_reads_zarr.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)

print("core/segread.js")
edit("core/segread.js", [
 (u"a zarr source keeps its mark",
  u'''  function httpBase(src){
    var s = String(src || "").replace(/^precomputed:\\/\\//, "");''',
  u'''  function httpBase(src){
    /* ZARR KEEPS ITS MARK, 2026-09-21 -- core/zarrread.js reads it; see isZarrBase. */
    if (/^zarr[23]?:/.test(String(src || ""))){
      var zs = String(src).replace(/^zarr:(?!\\/\\/)/, "");
      return "zarr:" + ((window.UJ && UJ.zarrread) ? UJ.zarrread.httpOf(zs) : zs.replace(/^zarr[23]?:\\/\\//, ""));
    }
    var s = String(src || "").replace(/^precomputed:\\/\\//, "");'''),
 (u"...and is read by zarrread",
  u'''  function getInfo(base){
    if (!infoCache[base])''',
  u'''  function isZarrBase(base){ return String(base || "").indexOf("zarr:") === 0; }
  function zarr(){
    if (!(window.UJ && UJ.zarrread)) throw new Error("a Zarr volume, and core/zarrread.js is not loaded");
    return UJ.zarrread;
  }
  function getInfo(base){
    if (isZarrBase(base)){
      if (!infoCache[base]) infoCache[base] = zarr().info(base);
      return infoCache[base];
    }
    if (!infoCache[base])'''),
 (u"...chunk by chunk",
  u'''  async function unshardedChunk(base, scale, at){''',
  u'''  async function unshardedChunk(base, scale, at){
    if (isZarrBase(base)) return await zarr().chunk(base, scale, at);'''),
 (u"a raw voxel is 1, 2, 4 or 8 bytes",
  u'''  function rawAt(buf, shape, local, words){
    var d = new Uint32Array(buf);
    var n = shape[0] * shape[1] * shape[2] * words;
    if (d.length < n) throw new Error("a raw chunk of " + buf.byteLength + " bytes, expected " + n * 4);
    var i = local[0] + shape[0] * (local[1] + shape[1] * local[2]);
    if (words === 1) return String(d[i] >>> 0);
    var lo = d[2 * i] >>> 0, hi = d[2 * i + 1] >>> 0;
    return (BigInt(hi) * 4294967296n + BigInt(lo)).toString();
  }
  /* One voxel of a chunk, whichever encoding the scale declares. */
  function valueIn(buf, scale, at, words){
    if (scale.encoding === "raw") return rawAt(buf, realShape(at), at.local, words);''',
  u'''  /* Bytes per voxel: the scale's own data_type where it has one (a Zarr level does), else the
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
    if (scale.encoding === "raw") return rawAt(buf, realShape(at), at.local, bpvOf(scale, words));'''),
 (u"...and a raw plane too",
  u'''    var d = new Uint32Array(buf);
    if (d.length < sh[0] * sh[1] * sh[2] * words) return out;''',
  u'''    var bpv = bpvOf(scale, words);
    if (buf.byteLength < sh[0] * sh[1] * sh[2] * bpv) return out;
    var d = bpv === 1 ? new Uint8Array(buf) : bpv === 2 ? new Uint16Array(buf) : new Uint32Array(buf);
    words = bpv === 8 ? 2 : 1;'''),
 (u"exported",
  u'''           _planeOf: planeOf, _offsetNm: offsetNm, borrowInfo: borrowInfo, setOffsetNm: setOffsetNm,''',
  u'''           _planeOf: planeOf, _offsetNm: offsetNm, borrowInfo: borrowInfo, setOffsetNm: setOffsetNm,
           _rawAt: rawAt,'''),
])

print("core/emtiles.js")
edit("core/emtiles.js", [
 (u"configure takes a uint16 window",
  u'''            skipScales: (cfg.skipScales || []).slice(),''',
  u'''            skipScales: (cfg.skipScales || []).slice(),
            /* A uint16 volume's window, in its own counts, applied before anything else sees it:
               the rest of this module is 8-bit. 2026-09-21, ωJump's two uint16 OpenOrganelle
               blocks, whose tissue is a band ~2,000 counts wide at ~33,000. */
            u16: cfg.u16 || null,'''),
 (u"a raw edge chunk is laid out at the nominal stride, and a uint16 one windowed",
  u'''    if (String(scale.encoding || "raw") !== "jpeg") return new Uint8Array(buf);''',
  u'''    if (String(scale.encoding || "raw") !== "jpeg"){
      /* RAW, AT THE NOMINAL STRIDE. 2026-09-21. An edge chunk is clipped to the volume, and the
         section reads every chunk with the nominal stride -- so an edge chunk read as it came
         sheared every row. Laid back into the nominal chunk here, as a JPEG edge chunk is below. */
      var src;
      if (scale.data_type === "uint16"){
        var w = (CFG && CFG.u16) || [0, 65535], lo16 = w[0], sp = Math.max(1, w[1] - w[0]);
        var s16 = new Uint16Array(buf);
        src = new Uint8Array(s16.length);
        for (var q = 0; q < s16.length; q++){
          var v8 = (s16[q] - lo16) * 255 / sp;
          src[q] = v8 < 0 ? 0 : v8 > 255 ? 255 : v8;
        }
      } else src = new Uint8Array(buf);
      if (shape[0] === ch[0] && shape[1] === ch[1] && shape[2] === ch[2]) return src;
      if (RAW_SEEN && RAW_SEEN.has(buf)) return RAW_SEEN.get(buf);
      var full = new Uint8Array(ch[0] * ch[1] * ch[2]);
      for (var zz = 0; zz < shape[2]; zz++)
        for (var yy = 0; yy < shape[1]; yy++)
          full.set(src.subarray((zz * shape[1] + yy) * shape[0], (zz * shape[1] + yy + 1) * shape[0]),
                   (zz * ch[1] + yy) * ch[0]);
      if (RAW_SEEN) RAW_SEEN.set(buf, full);
      return full;
    }'''),
 (u"...cached like the JPEG ones",
  u'''  async function decodeChunk(buf, scale, ch, shape){''',
  u'''  var RAW_SEEN = (typeof WeakMap !== "undefined") ? new WeakMap() : null;
  async function decodeChunk(buf, scale, ch, shape){'''),
])
