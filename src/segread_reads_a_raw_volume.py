# -*- coding: utf-8 -*-
u"""core/segread.js reads a `raw` segmentation, with borrowed geometry, where it really is.   2026-09-21

χJump step 1. cb2's cell segmentation, measured in the browser from grubblab.com:

    chunks   nguyen_thomas2022/cb2/seg/16_16_40/<x0-x1_y0-y1_z0-z1>   raw uint64, CORS open, ~200 ms
    info     NOT readable beside them -- seg/info fails in the browser -- but the mesh store's
             mesh/nguyen_thomas2022/cb2/info describes exactly this volume (16/16/40, 256x256x16,
             voxel_offset z -1280), and chunk names built from it are the ones the bucket lists.
    frame    1,216 sections below the EM (xjump_config.js's segTranslateZ, taken from a working
             viewer state). Nine proofread cells -- 3 Purkinje, 2 granule, 3 mossy fibre, 1
             interneuron -- read one of their own fragment ids at z - 1216, 9 of 9. At z - 1280,
             which BossDB's frames imply, 4 of 9 did not.

So three additions, each defaulting to exactly what the reader did before:

  encoding "raw"   decoded by index into the chunk's REAL (clipped) shape; a plane for painting
                   comes back in the nominal layout segpaint walks.
  segInfo/nucInfo  where a volume's info is read from, if not beside its chunks.
  segOffsetNm/     added to a tool point, in nanometres, before it is turned into a voxel of the
  nucOffsetNm      volume -- so a displaced volume is read where the tissue is.

Registered per base, module-wide, for the reason useJsonApi() is: core/segpaint.js reads through
this file's _getInfo and _chunkBuf without configuring it.

segreadcheck.js's new section was written first and failed (threw: no info at https://h/seg).

Run: python3 src/segread_reads_a_raw_volume.py
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

SR = [
 (u"the registries",
  u'''  /* ── caches ─────''',
  u'''  /* ── A VOLUME WHOSE INFO LIVES ELSEWHERE, AND ONE THAT IS DISPLACED ─────────  2026-09-21
     χJump's cb2 segmentation: its chunks are public and CORS-open, its own `info` is not readable
     from a page, and the mesh store's info describes it exactly. And it sits 1,216 sections below
     the EM, so a point read at the tool's own z answers for tissue 48 µm away. Per base, like
     useJsonApi, so segpaint -- which reads through _getInfo/_chunkBuf -- sees the same geometry. */
  var INFO_FROM = {}, OFFSET_NM = {};
  function borrowInfo(base, infoBase){ if (base && infoBase) INFO_FROM[base] = httpBase(infoBase); }
  function setOffsetNm(base, nm){ if (base && nm) OFFSET_NM[base] = [+nm[0] || 0, +nm[1] || 0, +nm[2] || 0]; }
  function offsetNm(base){ return OFFSET_NM[base] || [0, 0, 0]; }

  /* ── caches ─────'''),
 (u"info from where it lives",
  u'''      infoCache[base] = fetch(urlOf(base, "info"), { cache: "force-cache" }).then(function(r){''',
  u'''      infoCache[base] = fetch(urlOf(INFO_FROM[base] || base, "info"), { cache: "force-cache" }).then(function(r){'''),
 (u"raw decoding",
  u'''  /* ── ONE WHOLE Z-PLANE, TESTED AGAINST A FEW IDS ──''',
  u'''  /* ── raw ─────────────────────────────────────────────────────────────────  2026-09-21
     x fastest, then y, then z, little-endian, one or two uint32 words per voxel -- indexed with
     the chunk's REAL shape. An edge chunk is clipped to the volume; indexed with the nominal
     chunk size every voxel in it reads a neighbour's value, plausibly, and nothing says so. */
  function realShape(at){ return [0, 1, 2].map(function(i){ return at.end[i] - at.start[i]; }); }
  function rawAt(buf, shape, local, words){
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
    if (scale.encoding === "raw") return rawAt(buf, realShape(at), at.local, words);
    return decodeAt(buf, at.shape, scale.compressed_segmentation_block_size, at.local, words);
  }

  /* ── ONE WHOLE Z-PLANE, TESTED AGAINST A FEW IDS ──'''),
 (u"a plane of either encoding",
  u'''  /* ── where a voxel lives ──''',
  u'''  /* A plane of either encoding, always in the NOMINAL chunk layout (chunk_sizes[0]) that
     core/segpaint.js walks -- a clipped raw edge chunk is written into the top-left of it. */
  function planeOf(buf, scale, start, end, lz, words, wanted){
    var ch = scale.chunk_sizes[0];
    if (scale.encoding !== "raw")
      return planeMatch(buf, ch, scale.compressed_segmentation_block_size, lz, words, wanted);
    var sh = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
    var out = new Uint8Array(ch[0] * ch[1]);
    var nw = wanted.length;
    if (!nw || lz < 0 || lz >= sh[2]) return out;
    var d = new Uint32Array(buf);
    if (d.length < sh[0] * sh[1] * sh[2] * words) return out;
    var z0 = sh[0] * sh[1] * lz;
    for (var y = 0; y < sh[1]; y++)
      for (var x = 0; x < sh[0]; x++){
        var i = z0 + x + sh[0] * y, lo, hi;
        if (words === 1){ lo = d[i] >>> 0; hi = 0; } else { lo = d[2 * i] >>> 0; hi = d[2 * i + 1] >>> 0; }
        if (!lo && !hi) continue;
        for (var k = 0; k < nw; k++)
          if (wanted[k].lo === lo && wanted[k].hi === hi){ out[y * ch[0] + x] = k + 1; break; }
      }
    return out;
  }

  /* ── where a voxel lives ──'''),
 (u"one voxel reads either encoding, where the volume is",
  u'''    var v = [0, 1, 2].map(function(i){
      return Math.floor(vox[i] * res[i] / scale.resolution[i]);
    });
    var at = chunkOf(scale, v);
    if (!at) return { value: "0", why: "outside the volume" };
    var buf = scale.sharding ? await shardedChunk(base, scale, at)
                             : await unshardedChunk(base, scale, at);
    if (!buf) return { value: "0", why: "nothing segmented there" };
    var val = decodeAt(buf, at.shape, scale.compressed_segmentation_block_size, at.local, words);''',
  u'''    /* ...and through the volume's own displacement, if it has one: see OFFSET_NM. */
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
    var val = valueIn(buf, scale, at, words);'''),
 (u"configure registers them",
  u'''    CFG = { seg: httpBase(cfg.seg), nuc: httpBase(cfg.nuc), res: cfg.res || [4, 4, 40] };
    return CFG;''',
  u'''    CFG = { seg: httpBase(cfg.seg), nuc: httpBase(cfg.nuc), res: cfg.res || [4, 4, 40] };
    if (CFG.seg){ borrowInfo(CFG.seg, cfg.segInfo); setOffsetNm(CFG.seg, cfg.segOffsetNm); }
    if (CFG.nuc){ borrowInfo(CFG.nuc, cfg.nucInfo); setOffsetNm(CFG.nuc, cfg.nucOffsetNm); }
    return CFG;'''),
 (u"the nucleus search reads where the volume is",
  u'''    var v = [0, 1, 2].map(function(i){
      return Math.floor(vox[i] * CFG.res[i] / scale.resolution[i]);
    });
    var offs = offsetsWithin(scale.resolution, cap);''',
  u'''    var nsh = offsetNm(CFG.nuc);
    var v = [0, 1, 2].map(function(i){
      return Math.floor((vox[i] * CFG.res[i] + nsh[i]) / scale.resolution[i]);
    });
    var offs = offsetsWithin(scale.resolution, cap);'''),
 (u"...and in either encoding",
  u'''      var id = decodeAt(heldBuf, held.shape, scale.compressed_segmentation_block_size,
                        [p[0] - held.start[0], p[1] - held.start[1], p[2] - held.start[2]], 1);''',
  u'''      var id = valueIn(heldBuf, scale, { start: held.start, end: held.end, shape: held.shape,
                        local: [p[0] - held.start[0], p[1] - held.start[1], p[2] - held.start[2]] }, 1);'''),
 (u"exported",
  u'''           _chunkOf: chunkOf, _httpBase: httpBase, _planeMatch: planeMatch,''',
  u'''           _chunkOf: chunkOf, _httpBase: httpBase, _planeMatch: planeMatch,
           /* 2026-09-21: either encoding, and a volume's own displacement, for core/segpaint.js */
           _planeOf: planeOf, _offsetNm: offsetNm, borrowInfo: borrowInfo, setOffsetNm: setOffsetNm,'''),
]
print("core/segread.js"); edit("core/segread.js", SR)

SP = [
 (u"a raw volume is painted too",
  u'''    if (!bs) return { chunks: 0, painted: 0, why: "not a compressed_segmentation volume" };''',
  u'''    if (!bs && scale.encoding !== "raw")
      return { chunks: 0, painted: 0, why: "neither a compressed_segmentation nor a raw volume" };'''),
 (u"...where the volume is",
  u'''    var nmX0 = t0[0] * CFG.res[0], nmY0 = t0[1] * CFG.res[1], nmZ = view.z * CFG.res[2];''',
  u'''    /* In the VOLUME's frame: a displaced volume (χJump's cb2 segmentation, 1,216 sections below
       its EM) is read where the tissue is. Zero for every other volume. */
    var vsh = UJ.segread._offsetNm ? UJ.segread._offsetNm(base) : [0, 0, 0];
    var nmX0 = t0[0] * CFG.res[0] + vsh[0], nmY0 = t0[1] * CFG.res[1] + vsh[1],
        nmZ = view.z * CFG.res[2] + vsh[2];'''),
 (u"...one plane of either encoding",
  u'''      var buf = await UJ.segread._chunkBuf(base, scale, {
        c: cc, grid: grid, start: start,
        end: [0, 1, 2].map(function(i){ return Math.min(start[i] + ch[i], off[i] + scale.size[i]); }),
        local: [0, 0, 0], shape: ch
      });''',
  u'''      var end = [0, 1, 2].map(function(i){ return Math.min(start[i] + ch[i], off[i] + scale.size[i]); });
      var buf = await UJ.segread._chunkBuf(base, scale, {
        c: cc, grid: grid, start: start, end: end,
        local: [0, 0, 0], shape: ch
      });'''),
 (u"...matched",
  u'''      var mask = UJ.segread._planeMatch(buf, ch, bs, lz, words, wantIds);''',
  u'''      var mask = UJ.segread._planeOf ? UJ.segread._planeOf(buf, scale, start, end, lz, words, wantIds)
                                     : UJ.segread._planeMatch(buf, ch, bs, lz, words, wantIds);'''),
]
print("core/segpaint.js"); edit("core/segpaint.js", SP)
