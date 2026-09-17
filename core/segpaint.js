/* core/segpaint.js — the segmentation, painted over the section in the pad.         2026-09-17

   Søren: *"There should be an option to show the segmentation of the root ID and the nucleus ID of
   the cell in the EM window."*

   The tracing pad draws EM and nothing else, which is right for tracing a cell the segmentation
   does not have — and unhelpful for every other reason to trace. Knowing where the automatic
   segmentation thinks the boundary is tells you whether you are correcting it, extending it, or
   drawing something it never saw. So this paints the cell's own root ID and its nucleus ID over the
   section the pad has just drawn, and nothing else: an overlay of the whole segmentation would be a
   coloured mosaic, and the question is about ONE cell.

   NOTHING HERE FETCHES ON ITS OWN. core/segread.js already reads both volumes — sharded uint64
   compressed_segmentation for the cells, unsharded uint32 for the nuclei — with its caches keyed by
   URL and range, its concurrency pool, and its decoder measured against real data (see its header,
   and the seven cells read back at their nucleus centroids). A second implementation of compressed
   Morton codes here would be a second place for them to be subtly wrong.

   THE GEOMETRY COMES FROM THE VIEW THE PAD ALREADY HAS. `drawSection` returns the mapping it
   actually drew with, so this converts through NANOMETRES against that mapping rather than
   assuming the two volumes share a grid. They do not: the EM's finest is 8x8x40, the segmentation's
   8x8x40, the nuclei's 64x64x40, and the tool's own frame is 4x4x40. Four grids, one unit.

   ONE SEGMENTATION VOXEL IS NOT ONE SCREEN PIXEL, and the code says so rather than hoping. The
   scale is chosen to be the coarsest one no finer than the screen — reading 8 nm voxels to paint a
   32 nm picture is four times the chunks for the same image — and each voxel is then filled as a
   rectangle of however many pixels it covers. Nearest-neighbour, deliberately: this sits under the
   vertices he is placing, and a smoothed boundary invites a vertex on an edge the data has not got.

   Run: node segpaintcheck.js */
window.UJ = window.UJ || {};
UJ.segpaint = (function(){
  "use strict";

  var CFG = null;

  /* The cell magenta and the nucleus blue. #3a72d8 is NUC_COLOR from blender/colour_policy.py —
     the nucleus is blue in the Blender scene, in the pad's 3D window, in the Neuroglancer link and
     here, because a colour that means one thing in four places is worth more than four nice
     colours. The cell is magenta ON PURPOSE: the policy reserves hues 200-250 for nuclei and
     335-25 for vessels, and the contour palette this paints underneath is greens and yellows, so
     ~305 is the one band nothing else in the tool claims. */
  var CELL_COLOR = [224, 108, 212], NUC_COLOR = [58, 114, 216];

  function configure(cfg){
    CFG = { seg: UJ.segread._httpBase(cfg.seg), nuc: UJ.segread._httpBase(cfg.nuc),
            res: cfg.res || [4, 4, 40] };
    return CFG;
  }
  function configured(){ return !!CFG; }

  /* A decimal id string as the two uint32 halves the decoder compares against. Done once per
     overlay, so BigInt is free here and would not be per voxel. */
  function idPair(s){
    var t = String(s == null ? "" : s).trim();
    if (!/^\d+$/.test(t)) return null;
    var b = BigInt(t);
    return { lo: Number(b & 0xffffffffn) >>> 0, hi: Number(b >> 32n) >>> 0 };
  }

  /* The coarsest scale that is still no coarser than the screen, and whose z is still the finest —
     past that a "section" is an averaged slab and its index stops meaning the tool's z, which is
     the same limit core/emtiles.js refuses to cross and for the same reason. */
  function pickScale(info, nmPerPx){
    var fineZ = info.scales[0].resolution[2];
    var usable = info.scales.filter(function(s){ return s.resolution[2] === fineZ; });
    var best = usable[0];
    for (var i = 0; i < usable.length; i++)
      if (usable[i].resolution[0] <= nmPerPx * 1.001) best = usable[i];
    return best;
  }

  /* One volume's worth of the overlay, blended into `px` (a Uint8ClampedArray of w*h*4 already
     holding the EM). Returns how many chunks it looked at and how many voxels it painted, because
     "nothing appeared" has two very different causes — the cell is not in this window, or the
     fetch found nothing — and a caller that cannot tell them apart cannot say anything useful. */
  async function layer(px, view, base, wantIds, colour, alpha, onChunk){
    var info = await UJ.segread._getInfo(base);
    var scale = pickScale(info, view.effNmPerPx);
    var words = /uint64/.test(String(info.data_type || "")) ? 2 : 1;
    var res = scale.resolution, ch = scale.chunk_sizes[0], off = scale.voxel_offset || [0, 0, 0];
    var bs = scale.compressed_segmentation_block_size;
    if (!bs) return { chunks: 0, painted: 0, why: "not a compressed_segmentation volume" };

    /* The window, in nanometres, from the mapping the pad actually drew with. */
    var t0 = view.toolAt(0, 0);
    var nmX0 = t0[0] * CFG.res[0], nmY0 = t0[1] * CFG.res[1], nmZ = view.z * CFG.res[2];
    var perPx = view.effNmPerPx;
    var sx0 = Math.floor(nmX0 / res[0]), sy0 = Math.floor(nmY0 / res[1]);
    var sx1 = Math.ceil((nmX0 + view.w * perPx) / res[0]);
    var sy1 = Math.ceil((nmY0 + view.h * perPx) / res[1]);
    var sz = Math.floor(nmZ / res[2]);

    var grid = [0, 1, 2].map(function(i){ return Math.ceil(scale.size[i] / ch[i]); });
    var cz = Math.floor((sz - off[2]) / ch[2]);
    var cx0 = Math.floor((sx0 - off[0]) / ch[0]), cx1 = Math.floor((sx1 - off[0]) / ch[0]);
    var cy0 = Math.floor((sy0 - off[1]) / ch[1]), cy1 = Math.floor((sy1 - off[1]) / ch[1]);
    var want = [];
    for (var iy = cy0; iy <= cy1; iy++)
      for (var ix = cx0; ix <= cx1; ix++)
        if (ix >= 0 && iy >= 0 && cz >= 0 && ix < grid[0] && iy < grid[1] && cz < grid[2])
          want.push([ix, iy, cz]);

    /* How many screen pixels one voxel of THIS scale covers. At the pad's default (16 nm data,
       zoom 1) and an 8 nm segmentation this is 0.5 and several voxels share a pixel; magnified, it
       is several pixels per voxel and each one is filled. Both directions are the same loop. */
    var stepX = res[0] / perPx, stepY = res[1] / perPx;
    var painted = 0;
    await UJ.segread.mapPool(want, 6, async function(cc){
      var start = [off[0] + cc[0] * ch[0], off[1] + cc[1] * ch[1], off[2] + cc[2] * ch[2]];
      var buf = await UJ.segread._chunkBuf(base, scale, {
        c: cc, grid: grid, start: start,
        end: [0, 1, 2].map(function(i){ return Math.min(start[i] + ch[i], off[i] + scale.size[i]); }),
        local: [0, 0, 0], shape: ch
      });
      if (onChunk) try { onChunk(); } catch (_e){}
      /* A chunk that was never written is background, not a failure — cloud-volume does not write
         the blocks that are entirely empty. See segread's header. */
      if (!buf) return;
      var lz = sz - start[2];
      if (lz < 0 || lz >= ch[2]) return;
      var mask = UJ.segread._planeMatch(buf, ch, bs, lz, words, wantIds);
      for (var yy = 0; yy < ch[1]; yy++){
        var row = yy * ch[0];
        var pyTop = Math.round(((start[1] + yy) * res[1] - nmY0) / perPx);
        var pyBot = Math.round(((start[1] + yy + 1) * res[1] - nmY0) / perPx);
        if (pyBot <= 0 || pyTop >= view.h) continue;
        if (pyBot === pyTop) pyBot = pyTop + 1;                 // a voxel thinner than a pixel
        for (var xx = 0; xx < ch[0]; xx++){
          if (!mask[row + xx]) continue;
          var pxL = Math.round(((start[0] + xx) * res[0] - nmX0) / perPx);
          var pxR = Math.round(((start[0] + xx + 1) * res[0] - nmX0) / perPx);
          if (pxR <= 0 || pxL >= view.w) continue;
          if (pxR === pxL) pxR = pxL + 1;
          var col = colour[mask[row + xx] - 1] || colour[0];
          for (var oy = Math.max(0, pyTop); oy < Math.min(view.h, pyBot); oy++){
            var o0 = oy * view.w;
            for (var ox = Math.max(0, pxL); ox < Math.min(view.w, pxR); ox++){
              var o = (o0 + ox) * 4;
              px[o]     = px[o]     + (col[0] - px[o])     * alpha;
              px[o + 1] = px[o + 1] + (col[1] - px[o + 1]) * alpha;
              px[o + 2] = px[o + 2] + (col[2] - px[o + 2]) * alpha;
              painted++;
            }
          }
        }
      }
    });
    return { chunks: want.length, painted: painted, nmPerVoxel: res[0],
             stepX: stepX, stepY: stepY };
  }

  /* Paints over whatever the canvas already holds — which is the EM the pad has just drawn, so this
     must be called BEFORE the pad captures its base, or the overlay would be wiped by the next
     contour repaint. One getImageData and one putImageData for both volumes together, because two
     round trips through the canvas for one picture is one too many. */
  async function paint(canvas, view, o){
    if (!CFG) throw new Error("segpaint.configure() first");
    o = o || {};
    var alpha = o.alpha == null ? 0.4 : o.alpha;
    var root = idPair(o.root), nuc = idPair(o.nuc);
    if (!root && !nuc) return { ok: false, why: "no root ID or nucleus ID to show" };
    var ctx = canvas.getContext("2d");
    var img = ctx.getImageData(0, 0, view.w, view.h);
    var out = { ok: true, cell: null, nucleus: null };
    var chunks = 0, total = 0;
    var tick = function(){ chunks++; if (o.onProgress) try { o.onProgress(chunks, total); } catch (_e){} };
    if (root)
      out.cell = await layer(img.data, view, CFG.seg, [root], [CELL_COLOR], alpha, tick);
    if (nuc)
      out.nucleus = await layer(img.data, view, CFG.nuc, [nuc], [NUC_COLOR], alpha, tick);
    ctx.putImageData(img, 0, 0);
    out.painted = ((out.cell && out.cell.painted) || 0) + ((out.nucleus && out.nucleus.painted) || 0);
    return out;
  }

  return { configure: configure, configured: configured, paint: paint,
           idPair: idPair, pickScale: pickScale,
           CELL_COLOR: CELL_COLOR, NUC_COLOR: NUC_COLOR,
           /* for the check, which drives the real blend over a real canvas */
           _layer: layer };
})();
