/* core/emtiles.js — one section of EM, in the page.                                   2026-09-17

   Søren: *"A polygon tool is much easier for the user. Can you try to implement it?"* No viewer a
   pasted link can reach has one (measured 2026-09-17: the MICrONS viewer offers point, bounding
   box, line and ellipsoid; Spelunker's polyline never enters the state; BrainSharer's needs an
   account and ignores a pasted link). The only way to give him one is to draw the section here and
   put the tool on it — which needs the EM imagery in the page.

   WHAT THE SOURCE ACTUALLY IS, read live from its own info on 2026-09-17:

       type image, uint8, 1 channel, 11 scales
       8x8x40     size 212992 x 180224 x 13088   offset 13824,13824,14816   chunk 128x128x32
       16x16x40   size 106496 x  90112 x 13088   offset  6912, 6912,14816   chunk 128x128x32
       32x32x40   size  53248 x  45056 x 13088   offset  3456, 3456,14816   chunk  64x 64x64
       64x64x80   <- z halves from here on
       encoding "raw", sharding neuroglancer_uint64_sharded_v1
                       (identity hash, preshift 9 / minishard 6 / shard 14, both gzipped)

   Three things follow, and each one decides something here:

   - **raw, not jpeg.** The chunk a shard read returns IS the voxel data, x fastest then y then z.
     No image decode, and one byte per voxel.
   - **Sharded, exactly like the segmentation.** So this module fetches NOTHING itself: it asks
     core/segread.js, whose sharded reader is already written, already cached by URL and range, and
     already measured against this bucket. Duplicating six hundred lines of Morton codes and
     delta-encoded minishard offsets to fetch a different volume from the same bucket would be the
     worst kind of copy.
   - **Only mips 0-2 keep 40 nm sections.** From 64x64x80 the z axis downsamples too, so a
     "section" becomes an averaged slab and the z index stops meaning the tool's z. A tracing is
     section by section, so this module refuses to go coarser than mip 2. That is a correctness
     limit, not a quality preference.

   MEASURED COST, cold, on the live bucket: about 1.5 s for one chunk at every usable level (three
   range requests and two gunzips each; 8 nm 1698 ms, 16 nm 1441 ms, 32 nm 1571 ms). A chunk holds
   32 sections at mip 0/1 and 64 at mip 2, so the second section of a tracing is free, and so is
   every section after it in the same block.

   16 nm IS THE DEFAULT, and the reason is counter-intuitive enough to write down: a 560x460 window
   costs ~30 chunks at 8 nm AND at 16 nm, but ~90 at 32 nm, because the 32 nm level's chunks are 64
   voxels wide against the other two's 128. The level that shows the most tissue is the slowest to
   show it. 16 nm puts about 9 um across the canvas, which is a soma.

   Run: node emtilescheck.js */
var UJ = UJ || {};
UJ.emtiles = (function(){
  "use strict";

  var CFG = null;

  /* The tool's frame is 4/4/40 nm; this volume's finest is 8/8/40. Everything converts through
     nanometres rather than assuming any two grids agree -- the same rule segread.js follows, and
     for the same reason: they do not agree, and a factor of two is invisible until it is wrong. */
  function configure(cfg){
    CFG = { em: UJ.segread._httpBase(cfg.em), res: cfg.res || [4, 4, 40] };
    return CFG;
  }
  function configured(){ return !!CFG; }

  /* Mips whose z resolution is still the finest one. See the header: past that a section is a
     slab. Returned coarsest-first is not wanted -- the index IS the mip, so the caller can say
     "mip 2" and mean it. */
  function sectionScales(info){
    var fineZ = info.scales[0].resolution[2];
    return info.scales.filter(function(s){ return s.resolution[2] === fineZ; });
  }

  async function scaleAt(mip){
    var info = await UJ.segread._getInfo(CFG.em);
    var usable = sectionScales(info);
    var i = Math.max(0, Math.min(usable.length - 1, mip | 0));
    return { scale: usable[i], mip: i, count: usable.length };
  }

  /* Tool voxel -> this scale's voxel, and back. Kept as two functions rather than one factor
     because rounding belongs with the direction it is rounding for: into the grid we floor, out
     of it we return the voxel's own corner and let the caller place things inside it. */
  function toScale(scale, tool){
    return [0, 1, 2].map(function(i){
      return Math.floor(tool[i] * CFG.res[i] / scale.resolution[i]);
    });
  }
  function toTool(scale, v){
    return [0, 1, 2].map(function(i){
      return Math.round(v[i] * scale.resolution[i] / CFG.res[i]);
    });
  }

  /* ── one section into a canvas ───────────────────────────────────────────────────────────────
     `centre` is a TOOL voxel; `w`/`h` are canvas pixels and one canvas pixel is one voxel of the
     chosen scale, so the mip IS the zoom. Returns the mapping the caller needs to turn a click
     back into a tool voxel -- there is no second place that knows it. */
  async function drawSection(canvas, opts){
    if (!CFG) throw new Error("emtiles.configure() first");
    /* 16 nm by default. Not the finest, and deliberately not the coarsest either: measured on the
       real scale list, a 560x460 window costs ~30 chunks at 8 or 16 nm and ~90 at 32, because the
       32 nm level's chunks are 64 voxels wide against the other two's 128. The coarsest level shows
       the most tissue and is the most expensive to show it. */
    var got = await scaleAt(opts.mip == null ? 1 : opts.mip);
    var scale = got.scale;
    var w = Math.max(16, opts.w | 0), h = Math.max(16, opts.h | 0);
    var c = toScale(scale, opts.centre);
    var x0 = c[0] - (w >> 1), y0 = c[1] - (h >> 1), z = c[2];

    var ch = scale.chunk_sizes[0], off = scale.voxel_offset || [0, 0, 0];
    var cz = Math.floor((z - off[2]) / ch[2]);
    var cx0 = Math.floor((x0 - off[0]) / ch[0]), cx1 = Math.floor((x0 + w - 1 - off[0]) / ch[0]);
    var cy0 = Math.floor((y0 - off[1]) / ch[1]), cy1 = Math.floor((y0 + h - 1 - off[1]) / ch[1]);

    var want = [];
    for (var iy = cy0; iy <= cy1; iy++)
      for (var ix = cx0; ix <= cx1; ix++)
        want.push([ix, iy, cz]);

    var lo = opts.lo == null ? 86 : opts.lo, hi = opts.hi == null ? 172 : opts.hi;
    var span = Math.max(1, hi - lo);
    var ctx = canvas.getContext("2d");
    canvas.width = w; canvas.height = h;
    var img = ctx.createImageData(w, h);
    /* Anything never fetched stays this grey rather than black: outside the volume and "still
       loading" should not look like tissue, and should not look like each other either. */
    for (var p = 0; p < w * h; p++){
      img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = 24;
      img.data[p * 4 + 3] = 255;
    }

    var grid = [0, 1, 2].map(function(i){ return Math.ceil(scale.size[i] / ch[i]); });
    var done = 0;
    await UJ.segread.mapPool(want, opts.concurrency || 6, async function(cc){
      var buf = null;
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
        var a = new Uint8Array(buf);
        var sx = off[0] + cc[0] * ch[0], sy = off[1] + cc[1] * ch[1];
        var lz = z - (off[2] + cc[2] * ch[2]);
        var plane = lz * ch[0] * ch[1];
        for (var yy = 0; yy < ch[1]; yy++){
          var py = sy + yy - y0;
          if (py < 0 || py >= h) continue;
          var row = plane + yy * ch[0];
          for (var xx = 0; xx < ch[0]; xx++){
            var px = sx + xx - x0;
            if (px < 0 || px >= w) continue;
            var v = (a[row + xx] - lo) * 255 / span;
            v = v < 0 ? 0 : v > 255 ? 255 : v;
            var o = (py * w + px) * 4;
            img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
          }
        }
      }
      done++;
      if (opts.onProgress) try { opts.onProgress(done, want.length); } catch (_e){}
    });

    ctx.putImageData(img, 0, 0);
    /* The mapping, returned rather than remembered: canvas pixel -> tool voxel, and the reverse,
       both anchored on the same x0/y0 this call actually drew from. */
    var view = {
      mip: got.mip, mips: got.count, nmPerPx: scale.resolution[0],
      z: opts.centre[2], w: w, h: h, chunks: want.length,
      toolAt: function(px, py){
        return toTool(scale, [x0 + px, y0 + py, z]);
      },
      pxAt: function(tool){
        var v = toScale(scale, tool);
        return [v[0] - x0, v[1] - y0];
      },
      /* How many canvas pixels one tool voxel is, for hit-testing a vertex in tool coordinates. */
      pxPerToolVoxel: CFG.res[0] / scale.resolution[0]
    };
    return view;
  }

  return { configure: configure, configured: configured, drawSection: drawSection,
           scaleAt: scaleAt, sectionScales: sectionScales, _toScale: toScale, _toTool: toTool };
})();
