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

   JPEG CHUNKS TOO, since 2026-09-21. H01's imagery is `encoding: "jpeg"`: each chunk is one grey
   JPEG, chunk_x wide and chunk_y x chunk_z tall, the z sections stacked vertically — which is the
   raw order, x fastest then y then z. So a JPEG chunk is decoded (the browser's own decoder), one
   channel is kept, and it is read exactly as a raw one. See decodeChunk().

   CONFIGURE takes { em, res, skipScales, decodeJpeg }. skipScales names scale keys this volume lists but does
   not serve — V1DD opens its list with `key: "placeholder"`, which 404s — and defaults to none, so
   a page that passes nothing behaves exactly as before.

   Run: node emtilescheck.js */
var UJ = UJ || {};
UJ.emtiles = (function(){
  "use strict";

  var CFG = null;

  /* The tool's frame is 4/4/40 nm; this volume's finest is 8/8/40. Everything converts through
     nanometres rather than assuming any two grids agree -- the same rule segread.js follows, and
     for the same reason: they do not agree, and a factor of two is invisible until it is wrong. */
  function configure(cfg){
    CFG = { em: UJ.segread._httpBase(cfg.em), res: cfg.res || [4, 4, 40],
            /* ── SCALES THE PAGE SAYS ARE NOT REALLY THERE ─────────  2026-09-20
               V1DD's list opens with `key: "placeholder"`, 4.85 nm, chunk 2048×2048×128, and 404s
               at its own voxel_offset AND at the origin — an entry with no bytes behind it. Its z
               is 45 nm like the real scales, so sectionScales() keeps it, and since the index IS
               the mip, δJump's mip 0 would be the dead one.

               NOT GUESSED HERE. Nothing in an info file marks a scale as empty; the only honest
               test is to fetch one, and a module that probed every scale on every configure would
               cost a round trip per level to learn something the page already knows. So the page
               names the keys, beside the source it is describing. Skip nothing by default. */
            skipScales: (cfg.skipScales || []).slice(),
            /* A uint16 volume's window, in its own counts, applied before anything else sees it:
               the rest of this module is 8-bit. 2026-09-21, ωJump's two uint16 OpenOrganelle
               blocks, whose tissue is a band ~2,000 counts wide at ~33,000. */
            u16: cfg.u16 || null,
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
  var RAW_SEEN = (typeof WeakMap !== "undefined") ? new WeakMap() : null;
  async function decodeChunk(buf, scale, ch, shape){
    if (String(scale.encoding || "raw") !== "jpeg"){
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
    }
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
  }

  /* The scale list with those entries removed, in the order the volume gave them. Applied BEFORE
     anything computes a finest-z or indexes a mip, so every later number counts real scales only.
     Refuses to empty the list: a skipScales that matched everything is a typo, and one dead mip is
     a better failure than no imagery at all. */
  function realScales(info){
    var skip = (CFG && CFG.skipScales) || [];
    if (!skip.length) return info.scales;
    var kept = info.scales.filter(function(s){ return skip.indexOf(s.key) < 0; });
    return kept.length ? kept : info.scales;
  }
  function configured(){ return !!CFG; }

  /* Mips whose z resolution is still the finest one. See the header: past that a section is a
     slab. Returned coarsest-first is not wanted -- the index IS the mip, so the caller can say
     "mip 2" and mean it. */
  function sectionScales(info){
    var all = realScales(info);
    var fineZ = all[0].resolution[2];
    return all.filter(function(s){ return s.resolution[2] === fineZ; });
  }

  /* ── slabOk: THE COARSER LEVELS, FOR CALLERS THAT ARE NOT TRACING ──────────────────  2026-09-18
     The header's refusal to go past 32 nm stands for what this module was written for: a tracing is
     section by section, and from 64x64x80 a "section" is two sections averaged together, so the z
     index stops meaning the tool's z. That is a correctness limit for TRACING.

     It is not a limit on looking. The cell-identity panel draws one plane to recognise a cell by,
     and Søren asked for 18-20 um across it -- which at 32 nm would be a 594x321 window and 60 chunks,
     for a picture 260 px wide. At 64 nm the same 19.2 um is 15 chunks: exactly what its 8.3 um view
     cost before, measured against the real chunk grid. The tissue area is fixed and the chunk area
     is fixed, so a wider view at a finer scale costs strictly more chunks for the same picture; the
     only cheap way out is to read data that is already downsampled.

     So this is opt-in and says what it gave you: `sectionNm` is the z resolution actually read and
     `slab` is how many finest-sections that averages. A caller that needs one true section does not
     pass slabOk and cannot be moved off a section by accident -- which is why this is a parameter
     and not a wider default. */
  async function scaleAt(mip, slabOk){
    var info = await UJ.segread._getInfo(CFG.em);
    var usable = slabOk ? realScales(info) : sectionScales(info);
    var i = Math.max(0, Math.min(usable.length - 1, mip | 0));
    /* realScales, not info.scales: on δJump scales[0] is the placeholder, and a `slab` count
       measured against a level that does not exist would be wrong on every page it is shown. */
    var fineZ = realScales(info)[0].resolution[2];
    return { scale: usable[i], mip: i, count: usable.length,
             sectionNm: usable[i].resolution[2],
             slab: Math.round(usable[i].resolution[2] / fineZ) };
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
    var got = await scaleAt(opts.mip == null ? 1 : opts.mip, opts.slabOk);
    var scale = got.scale;
    /* MAGNIFICATION, SEPARATE FROM THE MIP.  2026-09-17
       The mip list stops at 8 nm/px, and a lysosome is about 500 nm -- sixty pixels, which is not
       enough to put vertices on. `zoom` draws each source voxel as zoom x zoom screen pixels, so
       the canvas can go closer than the data does. Nothing is invented: at zoom 4 you are looking
       at 8 nm voxels four pixels wide, and the label says "8 nm data" rather than pretending the
       resolution improved. It also costs nothing extra to fetch -- the window in VOXELS shrinks as
       the magnification grows, so this is the only kind of zoom here that is free. */
    /* HALF AND QUARTER SIZE, 2026-09-22 (src/the_pad_can_draw_half_size.py): below 1 the window
       holds more voxels than the canvas has pixels, and each k x k block is drawn as its mean. */
    var zr = +opts.zoom || 1;
    var zoom = zr >= 1 ? Math.max(1, Math.min(16, zr | 0)) : (1 / zr <= 2.5 ? 0.5 : 0.25);
    var w = Math.max(16, opts.w | 0), h = Math.max(16, opts.h | 0);
    var vw = Math.max(8, Math.ceil(w / zoom)), vh = Math.max(8, Math.ceil(h / zoom));
    var c = toScale(scale, opts.centre);
    var x0 = c[0] - (vw >> 1), y0 = c[1] - (vh >> 1), z = c[2];

    var ch = scale.chunk_sizes[0], off = scale.voxel_offset || [0, 0, 0];
    var cz = Math.floor((z - off[2]) / ch[2]);
    var cx0 = Math.floor((x0 - off[0]) / ch[0]), cx1 = Math.floor((x0 + vw - 1 - off[0]) / ch[0]);
    var cy0 = Math.floor((y0 - off[1]) / ch[1]), cy1 = Math.floor((y0 + vh - 1 - off[1]) / ch[1]);

    var want = [];
    for (var iy = cy0; iy <= cy1; iy++)
      for (var ix = cx0; ix <= cx1; ix++)
        want.push([ix, iy, cz]);

    var lo = opts.lo == null ? 86 : opts.lo, hi = opts.hi == null ? 172 : opts.hi;
    /* Read first, window second. The raw plane and its histogram are kept so the window can be
       chosen from the picture rather than assumed before it arrives -- see the tighten block. */
    var raw = new Uint8Array(vw * vh), seen = new Uint8Array(vw * vh);
    var hist = new Uint32Array(256), nSeen = 0;
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
      var buf = null, shape = ch;
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
        var a = await decodeChunk(buf, scale, ch, shape);
        var sx = off[0] + cc[0] * ch[0], sy = off[1] + cc[1] * ch[1];
        var lz = z - (off[2] + cc[2] * ch[2]);
        var plane = lz * ch[0] * ch[1];
        for (var yy = 0; yy < ch[1]; yy++){
          var py = sy + yy - y0;
          if (py < 0 || py >= vh) continue;
          var row = plane + yy * ch[0];
          for (var xx = 0; xx < ch[0]; xx++){
            var px = sx + xx - x0;
            if (px < 0 || px >= vw) continue;
            /* The RAW value, kept. Windowing used to happen right here, one voxel at a time, which
               made it impossible to choose the window from the picture -- you cannot look at a
               histogram you have already thrown away. See the tighten block below. */
            var o1 = py * vw + px;
            raw[o1] = a[row + xx];
            seen[o1] = 1;
            hist[a[row + xx]]++;
            nSeen++;
          }
        }
      }
      done++;
      if (opts.onProgress) try { opts.onProgress(done, want.length); } catch (_e){}
    });

    /* ── THE WINDOW MAY TIGHTEN ONTO THE DATA ───────────────────────────────────────  2026-09-18
       Søren: "The EM section and the trace a cell EM should have a similar contrast as for the
       Neuroglancer session ... they look too pale/washed out. The Neuroglancer contrast setting
       that works well is 86->172."

       The arithmetic here IS Neuroglancer's: normalized(range=[86,172]) maps x to (x-86)/86 and
       clamps, which is what the mapping below does. Same formula, same numbers, paler picture --
       so the difference is not the window, it is what the window is applied TO. Neuroglancer at a
       soma-sized zoom renders the finest level it can; this module reads a downsampled one, and
       averaging pulls a histogram in from both ends. A window chosen to bracket full-resolution
       tissue is then WIDER than the data it is stretching, and the stretch does less than it looks
       like it does. Every level below the finest is pale for the same reason, the coarsest most.

       So the window may narrow onto what was actually read -- never widen. lo can only rise and hi
       can only fall, so this cannot reduce contrast below what the fixed window already gave, and
       on data that fills [86,172] it does nothing at all. The percentiles are 0.5/99.5 rather than
       min/max because one fold artefact or one lumen at 255 would otherwise undo the whole thing.

       Opt-in: a caller that wants the literal window it asked for still gets it. */
    var loUsed = lo, hiUsed = hi;
    if (opts.tighten && nSeen > 0){
      var want1 = Math.floor(nSeen * 0.005), want2 = Math.floor(nSeen * 0.995);
      var acc = 0, pLo = 0, pHi = 255, i1;
      for (i1 = 0; i1 < 256; i1++){ acc += hist[i1]; if (acc > want1){ pLo = i1; break; } }
      acc = 0;
      for (i1 = 0; i1 < 256; i1++){ acc += hist[i1]; if (acc >= want2){ pHi = i1; break; } }
      var l2 = Math.max(lo, pLo), h2 = Math.min(hi, pHi);
      /* A plane that is nearly one value -- outside the tissue, a blank block -- would otherwise
         be stretched into pure noise. Below this width the fixed window is the safer picture. */
      if (h2 - l2 >= 16){ loUsed = l2; hiUsed = h2; }
    }
    var spanUsed = Math.max(1, hiUsed - loUsed);

    if (zoom < 1){
      /* The MEAN of each k x k block, not one voxel of it: a membrane one voxel wide would
         otherwise vanish or survive depending on where the block boundary fell. */
      var kk = Math.round(1 / zoom);
      for (var hy = 0; hy < h; hy++){
        for (var hx = 0; hx < w; hx++){
          var sum = 0, cnt = 0;
          for (var dy = 0; dy < kk; dy++){
            var vy = hy * kk + dy; if (vy >= vh) break;
            for (var dx = 0; dx < kk; dx++){
              var vx = hx * kk + dx; if (vx >= vw) break;
              var oh = vy * vw + vx;
              if (seen[oh]){ sum += raw[oh]; cnt++; }
            }
          }
          if (!cnt) continue;
          var vm = (sum / cnt - loUsed) * 255 / spanUsed;
          vm = vm < 0 ? 0 : vm > 255 ? 255 : vm;
          var oo = (hy * w + hx) * 4;
          img.data[oo] = img.data[oo + 1] = img.data[oo + 2] = vm;
        }
      }
    } else
    for (var py2 = 0; py2 < vh; py2++){
      for (var px2 = 0; px2 < vw; px2++){
        var o2 = py2 * vw + px2;
        if (!seen[o2]) continue;
        var v = (raw[o2] - loUsed) * 255 / spanUsed;
        v = v < 0 ? 0 : v > 255 ? 255 : v;
        /* One voxel, zoom x zoom pixels. Nearest-neighbour on purpose: this is what he is
           placing vertices on, and a smoothed edge invites a vertex on a boundary that the
           data does not have. */
        for (var ry = 0; ry < zoom; ry++){
          var oy = py2 * zoom + ry;
          if (oy >= h) break;
          for (var rx = 0; rx < zoom; rx++){
            var ox = px2 * zoom + rx;
            if (ox >= w) break;
            var o = (oy * w + ox) * 4;
            img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
          }
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    /* The mapping, returned rather than remembered: canvas pixel -> tool voxel, and the reverse,
       both anchored on the same x0/y0 this call actually drew from. */
    var view = {
      mip: got.mip, mips: got.count, nmPerPx: scale.resolution[0], zoom: zoom,
      /* What one drawn plane actually IS. slab === 1 is a true section; 2 means the level averages
         two of them, and a caller that says so in its tooltip is telling the truth about its
         picture. Always present, so nothing has to know whether slabOk was passed. */
      sectionNm: got.sectionNm, slab: got.slab,
      /* The window this call ACTUALLY used, which is the one asked for unless tighten narrowed it
         onto the data. Returned so a caption can show it: a picture whose contrast was chosen for
         it should be able to say what was chosen. */
      lo: loUsed, hi: hiUsed, windowAsked: [lo, hi], tightened: (loUsed !== lo || hiUsed !== hi),
      /* What the pad actually shows, which is the mip's resolution divided by the magnification --
         the number for a scale bar, and NOT the number to call the data's resolution. */
      effNmPerPx: scale.resolution[0] / zoom,
      umAcross: w * scale.resolution[0] / zoom / 1000,
      z: opts.centre[2], w: w, h: h, vw: vw, vh: vh, chunks: want.length,
      toolAt: function(px, py){
        return toTool(scale, [x0 + Math.floor(px / zoom), y0 + Math.floor(py / zoom), z]);
      },
      pxAt: function(tool){
        var v = toScale(scale, tool);
        return [(v[0] - x0) * zoom, (v[1] - y0) * zoom];
      },
      /* How many canvas pixels one tool voxel is, for hit-testing a vertex in tool coordinates. */
      pxPerToolVoxel: CFG.res[0] / scale.resolution[0] * zoom
    };
    return view;
  }

  return { configure: configure, configured: configured, drawSection: drawSection,
           scaleAt: scaleAt, sectionScales: sectionScales, _toScale: toScale, _toTool: toTool,
           _decodeChunk: decodeChunk };
})();
