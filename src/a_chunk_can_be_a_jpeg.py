# -*- coding: utf-8 -*-
u"""core/emtiles.js reads a JPEG chunk as well as a raw one.                      2026-09-21

Stage G of the tracing card's port, first slice: the one thing ηJump needed that no other tool
did. The header of this module says "raw, not jpeg" as its second finding about minnie65, and H01
is the dataset where that stops being true.

── WHAT H01's IMAGERY IS, READ THROUGH THE JSON API FROM grubblab.com ON 2026-09-21 ──────

    gs://h01-release/data/20210601/4nm_raw   uint8, 13 scales, encoding "jpeg", SHARDED
                                             (identity hash, minishard index gzip, data NOT gzip'd)
    4 / 8 / 16 / 32 nm keep 33 nm sections; 64 nm is 66 nm deep

A 16 nm chunk (128x128x64), fetched through core/segread.js's sharded reader at four cells from
the page's own table: ~300 kB each, bytes `ff d8` — a JPEG — and it decodes to an image
**128 wide and 8192 tall**, grey (R = G = B on every pixel). 8192 = 128 x 64: the z sections are
stacked vertically, one 128x128 slice under the next. So pixel (x, y + ny*z) IS voxel (x, y, z),
x fastest then y then z — **exactly the order a raw chunk already has**. Decoding and taking one
channel turns a JPEG chunk into the array the rest of drawSection already reads, and nothing
downstream of that line changes.

── HOW ─────────────────────────────────────────────────────────────────────────────────

`createImageBitmap` on a Blob, drawn into a canvas, R channel kept. The browser's own decoder: no
library, nothing to fetch. Decoded chunks are kept in a WeakMap keyed by the ArrayBuffer segread
hands back — segread caches that buffer by URL and range and returns the SAME object every time,
so a chunk is decoded once per page and the memory goes when segread's does.

An edge chunk is smaller than chunk_sizes says. A raw chunk there has always been read with the
full stride (a pre-existing simplification this leaves alone); a JPEG chunk says its own width and
height, so it is re-laid into a full-size array — voxels outside the volume stay 0 — rather than
read with the wrong stride.

`configure({decodeJpeg})` replaces the decoder, for a check running where there is no browser.

Run: python3 src/a_chunk_can_be_a_jpeg.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)


HDR_OLD = u'''   CONFIGURE takes { em, res, skipScales }.'''
HDR_NEW = u'''   JPEG CHUNKS TOO, since 2026-09-21. H01's imagery is `encoding: "jpeg"`: each chunk is one grey
   JPEG, chunk_x wide and chunk_y x chunk_z tall, the z sections stacked vertically — which is the
   raw order, x fastest then y then z. So a JPEG chunk is decoded (the browser's own decoder), one
   channel is kept, and it is read exactly as a raw one. See decodeChunk().

   CONFIGURE takes { em, res, skipScales, decodeJpeg }.'''

CFG_OLD = u'''            skipScales: (cfg.skipScales || []).slice() };
    return CFG;
  }'''
CFG_NEW = u'''            skipScales: (cfg.skipScales || []).slice(),
            /* A replacement JPEG decoder, (ArrayBuffer) -> Promise<{data, width, height}> with one
               byte per pixel. For a check running where there is no browser; a page passes none. */
            decodeJpeg: cfg.decodeJpeg || null };
    return CFG;
  }

  /* ── ONE JPEG CHUNK INTO THE RAW LAYOUT ──────────────────────────────────────────────  2026-09-21
     Measured on H01's 16 nm level: a 128x128x64 chunk is a 128x8192 grey JPEG, slice z at rows
     [128z, 128z+128). Pixel (x, y + ny*z) is voxel (x, y, z), which is the raw order already.

     Decoded once per chunk: segread returns the SAME ArrayBuffer for a chunk every time it is
     asked (it caches by URL and range), so a WeakMap on that buffer is a cache with no key to get
     wrong and nothing to evict by hand. */
  var JPEG_SEEN = (typeof WeakMap !== "undefined") ? new WeakMap() : null;
  async function browserJpeg(buf){
    var bm = await createImageBitmap(new Blob([buf], { type: "image/jpeg" }));
    var W = bm.width, H = bm.height, cv;
    if (typeof OffscreenCanvas !== "undefined") cv = new OffscreenCanvas(W, H);
    else { cv = document.createElement("canvas"); cv.width = W; cv.height = H; }
    var g = cv.getContext("2d");
    g.drawImage(bm, 0, 0);
    if (bm.close) try { bm.close(); } catch (_e){}
    var rgba = g.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H);
    for (var k = 0, j = 0; k < out.length; k++, j += 4) out[k] = rgba[j];
    return { data: out, width: W, height: H };
  }
  /* -> a Uint8Array laid out exactly as a raw chunk of `ch` would be. `shape` is the chunk's real
     extent (smaller than ch at the volume's edge), which a JPEG's own width and height report. */
  async function decodeChunk(buf, scale, ch, shape){
    if (String(scale.encoding || "raw") !== "jpeg") return new Uint8Array(buf);
    if (JPEG_SEEN && JPEG_SEEN.has(buf)) return JPEG_SEEN.get(buf);
    var img = await ((CFG && CFG.decodeJpeg) || browserJpeg)(buf);
    var nx = img.width, ny = shape[1], nz = Math.round(img.height / Math.max(1, ny));
    var a;
    if (nx === ch[0] && ny === ch[1] && nz === ch[2]) a = img.data;
    else {
      a = new Uint8Array(ch[0] * ch[1] * ch[2]);
      for (var z = 0; z < Math.min(nz, ch[2]); z++)
        for (var y = 0; y < Math.min(ny, ch[1]); y++){
          var src = (z * ny + y) * nx, dst = (z * ch[1] + y) * ch[0];
          a.set(img.data.subarray(src, src + Math.min(nx, ch[0])), dst);
        }
    }
    if (JPEG_SEEN) JPEG_SEEN.set(buf, a);
    return a;
  }'''

DRAW_OLD = u'''      var buf = null;
      if (cc[0] >= 0 && cc[1] >= 0 && cc[2] >= 0
          && cc[0] < grid[0] && cc[1] < grid[1] && cc[2] < grid[2]){
        var start = [off[0] + cc[0] * ch[0], off[1] + cc[1] * ch[1], off[2] + cc[2] * ch[2]];
        buf = await UJ.segread._chunkBuf(CFG.em, scale, {
          c: cc, grid: grid, start: start,
          end: [0, 1, 2].map(function(i){ return Math.min(start[i] + ch[i], off[i] + scale.size[i]); }),
          local: [0, 0, 0], shape: ch
        });
      }
      if (buf){
        var a = new Uint8Array(buf);'''
DRAW_NEW = u'''      var buf = null, shape = ch;
      if (cc[0] >= 0 && cc[1] >= 0 && cc[2] >= 0
          && cc[0] < grid[0] && cc[1] < grid[1] && cc[2] < grid[2]){
        var start = [off[0] + cc[0] * ch[0], off[1] + cc[1] * ch[1], off[2] + cc[2] * ch[2]];
        var end = [0, 1, 2].map(function(i){ return Math.min(start[i] + ch[i], off[i] + scale.size[i]); });
        shape = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
        buf = await UJ.segread._chunkBuf(CFG.em, scale, {
          c: cc, grid: grid, start: start, end: end, local: [0, 0, 0], shape: ch
        });
      }
      if (buf){
        /* Raw bytes as they come; a JPEG chunk decoded into the same layout first. */
        var a = await decodeChunk(buf, scale, ch, shape);'''

EXP_OLD = u'''  return { configure: configure, configured: configured, drawSection: drawSection,
           scaleAt: scaleAt, sectionScales: sectionScales, _toScale: toScale, _toTool: toTool };'''
EXP_NEW = u'''  return { configure: configure, configured: configured, drawSection: drawSection,
           scaleAt: scaleAt, sectionScales: sectionScales, _toScale: toScale, _toTool: toTool,
           _decodeChunk: decodeChunk };'''

print("core/emtiles.js")
edit("core/emtiles.js", [
    (u"the header says a chunk may be a JPEG", HDR_OLD, HDR_NEW),
    (u"a JPEG chunk is decoded into the raw layout", CFG_OLD, CFG_NEW),
    (u"...and drawSection reads it through that", DRAW_OLD, DRAW_NEW),
    (u"...exported for the check", EXP_OLD, EXP_NEW),
], marker=u"ONE JPEG CHUNK INTO THE RAW LAYOUT")
