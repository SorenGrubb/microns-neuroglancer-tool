/* One section of EM, drawn from chunks that say where they came from.             2026-09-17

   core/emtiles.js turns the tool's coordinate into a picture of a section and hands back the
   mapping from canvas pixel to tool voxel. Almost everything it can get wrong is invisible on real
   EM -- a transposed chunk, the wrong z-slice out of a 32-slice block, a window off by one chunk --
   because the result still looks like tissue. So this drives the REAL module over a synthetic
   volume whose every voxel encodes where it is:

       value = (x + 2*y + 4*z) mod 251

   and reads the drawn pixels back. A transpose, a wrong slice or a shifted origin all move that
   number, and each one is asserted by name.

   The scale list is the real one, read live from the source's own info on 2026-09-17:

       8x8x40     size 212992 x 180224 x 13088   offset 13824,13824,14816   chunk 128x128x32
       16x16x40   size 106496 x  90112 x 13088   offset  6912, 6912,14816   chunk 128x128x32
       32x32x40   size  53248 x  45056 x 13088   offset  3456, 3456,14816   chunk  64x 64x64
       64x64x80   <- z halves here, so a "section" stops being one

   Run: node emtilescheck.js */
const fs = require("fs");
const vm = require("vm");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The real scale list, trimmed to the levels that matter plus the first one that halves z. */
const INFO = { type: "image", data_type: "uint8", num_channels: 1, scales: [
  { key: "8x8x40",      resolution: [8, 8, 40],     size: [212992, 180224, 13088],
    voxel_offset: [13824, 13824, 14816], chunk_sizes: [[128, 128, 32]], encoding: "raw" },
  { key: "16x16x40",    resolution: [16, 16, 40],   size: [106496, 90112, 13088],
    voxel_offset: [6912, 6912, 14816],   chunk_sizes: [[128, 128, 32]], encoding: "raw" },
  { key: "32x32x40",    resolution: [32, 32, 40],   size: [53248, 45056, 13088],
    voxel_offset: [3456, 3456, 14816],   chunk_sizes: [[64, 64, 64]],   encoding: "raw" },
  { key: "64x64x80",    resolution: [64, 64, 80],   size: [26624, 22528, 6544],
    voxel_offset: [1728, 1728, 7408],    chunk_sizes: [[64, 64, 64]],   encoding: "raw" },
  { key: "128x128x160", resolution: [128, 128, 160], size: [13312, 11264, 3272],
    voxel_offset: [864, 864, 3704],      chunk_sizes: [[64, 64, 64]],   encoding: "raw" }
] };

const VAL = (x, y, z) => (x + 2 * y + 4 * z) % 251;

/* A canvas with nothing in it but the two calls emtiles makes. Deliberately not a real one: what
   is under test is which byte lands in which pixel, and a real canvas would only hide that. */
function fakeCanvas(){
  const cv = { width: 0, height: 0, _img: null };
  cv.getContext = () => ({
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => { cv._img = img; }
  });
  cv.px = (x, y) => cv._img.data[(y * cv._img.width + x) * 4];
  return cv;
}

const sandbox = { console, JSON, Math, Number, String, Array, Object, isFinite, Date,
                  Uint8Array, Uint8ClampedArray, Promise };
sandbox.window = sandbox;
vm.createContext(sandbox);

/* A stub segread carrying only what emtiles borrows -- and a real mapPool, because the concurrency
   is the module's own and a serial stand-in would not exercise it. */
let fetched = [];
sandbox.UJ = { segread: {
  _httpBase: (s) => String(s).replace(/^precomputed:\/\//, ""),
  _getInfo: async () => INFO,
  _chunkBuf: async (base, scale, at) => {
    fetched.push(scale.key + ":" + at.c.join(","));
    const ch = scale.chunk_sizes[0];
    const a = new Uint8Array(ch[0] * ch[1] * ch[2]);
    for (let z = 0; z < ch[2]; z++)
      for (let y = 0; y < ch[1]; y++)
        for (let x = 0; x < ch[0]; x++)
          a[z * ch[0] * ch[1] + y * ch[0] + x] = sandbox.VALUE_FN
            ? sandbox.VALUE_FN(at.start[0] + x, at.start[1] + y, at.start[2] + z)
            : VAL(at.start[0] + x, at.start[1] + y, at.start[2] + z);
    return a.buffer;
  },
  mapPool: async (items, limit, fn) => {
    const out = new Array(items.length);
    let i = 0;
    const worker = async () => { while (i < items.length){ const k = i++; out[k] = await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }
} };
vm.runInContext(fs.readFileSync(core("emtiles.js"), "utf8"), sandbox);
const E = sandbox.UJ.emtiles;
E.configure({ em: "precomputed://https://example/em", res: [4, 4, 40] });

(async () => {

console.log("only the levels that keep a 40 nm section");
{
  const usable = E.sectionScales(INFO);
  ok(usable.length === 3, "three of the five, stopping before z downsamples", usable.length);
  ok(usable.map(s => s.key).join(" ") === "8x8x40 16x16x40 32x32x40",
     "...the three whose z resolution is still 40 nm", usable.map(s => s.key).join(" "));
  const tooCoarse = await E.scaleAt(9);
  ok(tooCoarse.scale.key === "32x32x40",
     "asking for a coarser one gives the coarsest USABLE one, not a slab — at 64x64x80 a "
     + "'section' averages two, and a tracing is section by section", tooCoarse.scale.key);
  ok(tooCoarse.slab === 1 && tooCoarse.sectionNm === 40,
     "...and it says so: one finest-section per drawn plane",
     tooCoarse.sectionNm + " nm, slab " + tooCoarse.slab);
}

console.log("\n...unless the caller says it is not tracing");
{
  /* slabOk, 2026-09-18. The cell-identity panel wants 18-20 um across a 300 px picture, which at
     32 nm is a 594 px window — sixty chunks for a thumbnail. The coarser levels cost what the
     current view costs, and an 80 nm slab is a fine thing to RECOGNISE a cell in. It is opt-in
     because a tracing must never be moved off a true section by accident. */
  const slab = await E.scaleAt(3, true);
  ok(slab.scale.key === "64x64x80",
     "slabOk reaches the level that section-only refuses", slab.scale.key);
  ok(slab.slab === 2 && slab.sectionNm === 80,
     "...and says exactly what it gave: two finest-sections averaged into one plane",
     slab.sectionNm + " nm, slab " + slab.slab);
  ok(slab.count === 5, "...counting every level, not just the three", slab.count + " levels");
  const still = await E.scaleAt(3);
  ok(still.scale.key === "32x32x40" && still.slab === 1,
     "...while the same call WITHOUT it is unmoved — the pad cannot drift onto a slab",
     still.scale.key);
  /* The z index means a different thing at that level, and toScale must follow it. Tool z is
     40 nm; at 80 nm one plane covers two of them, so the index halves. */
  ok(String(E._toScale(INFO.scales[3], [0, 0, 21360])) === "0,0,10680",
     "...and a tool z of 21360 lands on slab 10680, not on section 21360",
     String(E._toScale(INFO.scales[3], [0, 0, 21360])));
}

console.log("\nthe tool's frame is not the volume's, and everything converts through nanometres");
{
  /* The tool is 4/4/40 nm; the finest EM is 8/8/40. A factor of two, and invisible on real EM. */
  ok(String(E._toScale(INFO.scales[0], [240640, 207872, 21360])) === "120320,103936,21360",
     "tool 4 nm -> mip 0's 8 nm halves x and y and leaves z alone",
     String(E._toScale(INFO.scales[0], [240640, 207872, 21360])));
  ok(String(E._toScale(INFO.scales[2], [240640, 207872, 21360])) === "30080,25984,21360",
     "...and 32 nm divides them by eight", String(E._toScale(INFO.scales[2], [240640, 207872, 21360])));
  ok(String(E._toTool(INFO.scales[2], [30080, 25984, 21360])) === "240640,207872,21360",
     "...and back again lands on the voxel it started from");
  ok(INFO.scales[0].voxel_offset[2] === INFO.scales[2].voxel_offset[2],
     "z offset is the same at every usable level, so the EM z index IS the tool's z",
     INFO.scales[0].voxel_offset[2]);
}

console.log("\none section, drawn");
{
  const cv = fakeCanvas();
  fetched = [];
  const centre = [240640, 207872, 21360];
  /* An identity stretch: what is under test is WHICH voxel landed in which pixel, so the
     display curve must not be in the way. lo 0 / hi 255 makes the drawn byte the raw one. */
  const view = await E.drawSection(cv, { centre, mip: 2, w: 128, h: 96, lo: 0, hi: 255 });
  ok(cv.width === 128 && cv.height === 96, "the canvas is the size asked for",
     cv.width + "x" + cv.height);
  ok(view.nmPerPx === 32 && view.mip === 2, "...at the level asked for", view.nmPerPx + " nm/px");
  ok(view.z === 21360, "...on the section asked for", view.z);

  /* THE CENTRE PIXEL. w>>1, h>>1 is where the requested coordinate lands, and its value has to be
     the synthetic value of that voxel -- not its neighbour, and not a voxel from another slice. */
  const v = E._toScale(INFO.scales[2], centre);
  ok(cv.px(64, 48) === VAL(v[0], v[1], v[2]),
     "the middle pixel is the voxel the caller asked for",
     cv.px(64, 48) + " vs " + VAL(v[0], v[1], v[2]));

  /* A TRANSPOSE is the classic one, and on real EM it looks perfectly plausible. x and y have
     different weights in VAL precisely so that swapping them changes the number. */
  ok(cv.px(65, 48) === VAL(v[0] + 1, v[1], v[2]),
     "one pixel RIGHT is one voxel further in x", cv.px(65, 48) + " vs " + VAL(v[0] + 1, v[1], v[2]));
  ok(cv.px(64, 49) === VAL(v[0], v[1] + 1, v[2]),
     "one pixel DOWN is one voxel further in y — not in x, which is what a transpose gives",
     cv.px(64, 49) + " vs " + VAL(v[0], v[1] + 1, v[2]));

  /* THE WRONG SLICE OUT OF THE BLOCK. A 32x32x40 chunk is 64 sections deep; taking slice 0 of the
     block instead of the one asked for gives a picture of a different section that looks fine. */
  const blockZ = INFO.scales[2].voxel_offset[2]
    + Math.floor((v[2] - INFO.scales[2].voxel_offset[2]) / 64) * 64;
  ok(v[2] !== blockZ, "the section asked for is NOT the first of its block, so this can fail",
     "z " + v[2] + " vs block start " + blockZ);
  ok(cv.px(64, 48) !== VAL(v[0], v[1], blockZ),
     "...and the pixel is that section's, not the block's first slice");

  /* THE WINDOW SPANS CHUNKS, which is the only case where the per-chunk offset arithmetic runs. */
  ok(fetched.length >= 4, "a 128x96 window at 64-voxel chunks spans several", fetched.length
     + " chunks: " + fetched.slice(0, 4).join(" "));
  ok(cv.px(0, 0) === VAL(v[0] - 64, v[1] - 48, v[2]),
     "the top-left pixel belongs to a different chunk and is still the right voxel",
     cv.px(0, 0) + " vs " + VAL(v[0] - 64, v[1] - 48, v[2]));
  ok(cv.px(127, 95) === VAL(v[0] + 63, v[1] + 47, v[2]),
     "...and so does the bottom-right", cv.px(127, 95) + " vs " + VAL(v[0] + 63, v[1] + 47, v[2]));
}

console.log("\nwhat a window costs at each level, which is why 16 nm is the default");
{
  /* Counter-intuitive, and the reason the pad does NOT open at the coarsest level: the 32 nm scale
     chunks 64 voxels wide against the other two's 128, so the level that shows the most tissue
     fetches three times as many chunks to show it. Measured live 2026-09-17: a cold chunk is about
     1.5 s at every level, so chunk COUNT is the whole of the wait. */
  const cost = [];
  for (const mip of [0, 1, 2]){
    const cv = fakeCanvas();
    fetched = [];
    const view = await E.drawSection(cv, { centre: [240640, 207872, 21360], mip, w: 560, h: 460 });
    cost.push({ mip, nm: view.nmPerPx, chunks: view.chunks, asked: fetched.length,
                um: +(560 * view.nmPerPx / 1000).toFixed(1) });
  }
  ok(cost[0].chunks === cost[1].chunks,
     "8 nm and 16 nm cost the same number of chunks \u2014 same chunk size, four times the tissue",
     cost[0].chunks + " and " + cost[1].chunks);
  ok(cost[2].chunks > 2 * cost[1].chunks,
     "...and 32 nm costs about three times either, for twice the field of view",
     cost[2].chunks + " chunks for " + cost[2].um + " um");
  ok(cost[1].um > 8 && cost[1].um < 10,
     "the default level puts about nine micrometres across the pad, which is a soma",
     cost[1].um + " um");
  ok(cost.every(c => c.chunks === c.asked),
     "and the number the view reports is the number of chunks it really asked for \u2014 which is "
     + "what the progress line counts", cost.map(c => c.chunks + "/" + c.asked).join(" "));
}

console.log("\nthe mapping it returns, which is what a click goes through");
{
  const cv = fakeCanvas();
  const centre = [240640, 207872, 21360];
  const view = await E.drawSection(cv, { centre, mip: 2, w: 200, h: 200 });
  const back = view.toolAt(100, 100);
  ok(String(back) === String(centre),
     "the middle pixel maps back to the coordinate the pad was opened at", String(back));
  const px = view.pxAt(centre);
  ok(String(px) === "100,100", "...and that coordinate maps to the middle pixel", String(px));
  /* A vertex placed anywhere must survive the round trip, or a contour would creep as you pan. */
  const spot = view.toolAt(37, 164);
  ok(String(view.pxAt(spot)) === "37,164",
     "a click anywhere round-trips pixel -> voxel -> pixel", String(view.pxAt(spot)));
  ok(Math.abs(view.pxPerToolVoxel - 4 / 32) < 1e-9,
     "and it says how many pixels a tool voxel is, which is what hit-testing the first vertex needs",
     view.pxPerToolVoxel);

  const fine = await E.drawSection(cv, { centre, mip: 0, w: 200, h: 200 });
  ok(Math.abs(fine.pxPerToolVoxel - 4 / 8) < 1e-9,
     "...and it follows the zoom, so the close radius stays the same on screen",
     fine.pxPerToolVoxel);
  ok(String(fine.toolAt(100, 100)) === String(centre),
     "the centre is the centre at every level too", String(fine.toolAt(100, 100)));
}

console.log("\nmagnification, which is the only zoom here that is free");
{
  /* The mip list stops at 8 nm/px; a lysosome is ~500 nm, sixty pixels at that. `zoom` draws each
     source voxel zoom x zoom, so the pad goes closer than the data does -- and because the window
     in VOXELS shrinks as it magnifies, it fetches LESS, not more. */
  const one = fakeCanvas(), four = fakeCanvas();
  fetched = [];
  const v1 = await E.drawSection(one, { centre: [240640, 207872, 21360], mip: 0,
                                        w: 256, h: 256, lo: 0, hi: 255 });
  const c1 = fetched.length;
  fetched = [];
  const v4 = await E.drawSection(four, { centre: [240640, 207872, 21360], mip: 0, zoom: 4,
                                         w: 256, h: 256, lo: 0, hi: 255 });
  const c4 = fetched.length;
  ok(v4.zoom === 4 && v4.nmPerPx === 8 && v4.effNmPerPx === 2,
     "the data stays 8 nm and the SCREEN becomes 2 nm a pixel \u2014 two numbers, not one",
     v4.nmPerPx + " nm data, " + v4.effNmPerPx + " nm/px on screen");
  ok(v4.vw === 64 && v4.vh === 64 && v4.w === 256,
     "...a 256 pixel canvas over a 64 voxel window", v4.vw + " voxels into " + v4.w + " pixels");
  ok(c4 <= c1, "...which costs no more chunks than 1x, and usually fewer",
     c4 + " chunks at 4x against " + c1 + " at 1x");
  ok(Math.abs(v4.umAcross - v1.umAcross / 4) < 1e-9,
     "...and a quarter of the tissue is on screen", v4.umAcross + " um against " + v1.umAcross);

  /* THE FOUR PIXELS OF ONE VOXEL ARE THE SAME VOXEL. A magnification that interpolated would put
     an edge where the data has none, and he is placing vertices on edges. */
  const a0 = four.px(128, 128), b0 = four.px(129, 128), c0 = four.px(128, 129);
  ok(a0 === b0 && a0 === c0, "each voxel is a solid block, not a smoothed one \u2014 a vertex goes on "
     + "a boundary the data has", a0 + "/" + b0 + "/" + c0);
  const vv = E._toScale(INFO.scales[0], [240640, 207872, 21360]);
  ok(a0 === VAL(vv[0], vv[1], vv[2]), "...and it is the right voxel", a0 + " vs " + VAL(vv[0], vv[1], vv[2]));

  /* THE MAPPING FOLLOWS, or a contour drawn zoomed in lands somewhere else when you zoom out. */
  ok(String(v4.toolAt(128, 128)) === "240640,207872,21360",
     "the middle pixel still maps to the coordinate the pad opened at", String(v4.toolAt(128, 128)));
  ok(String(v4.pxAt([240640, 207872, 21360])) === "128,128",
     "...and back", String(v4.pxAt([240640, 207872, 21360])));
  ok(Math.abs(v4.pxPerToolVoxel - 4 / 8 * 4) < 1e-9,
     "...and a tool voxel is four times as many pixels, so the close radius stays put on screen",
     v4.pxPerToolVoxel);
}

console.log("\noutside the volume is grey, not black and not tissue");
{
  const cv = fakeCanvas();
  fetched = [];
  /* Left of the volume's own x offset: those chunks do not exist. */
  const view = await E.drawSection(cv, { centre: [8000, 207872, 21360], mip: 2, w: 64, h: 64 });
  ok(cv.px(0, 0) === 24,
     "a pixel with no chunk behind it is the fill, which looks like neither data nor a hole",
     cv.px(0, 0));
  ok(view.chunks > 0, "...and it still reports how many chunks it went for", view.chunks);
}


console.log("\nthe window can tighten onto the data, and never the other way");
{
  /* Søren, 2026-09-18: the pad and the panel "look too pale/washed out" beside Neuroglancer at the
     same 86->172. The arithmetic is Neuroglancer's; what differs is the DATA. A downsampled level
     has a narrower histogram, so a window chosen for full-resolution tissue is wider than what it
     is stretching and the stretch does less than it looks like it does.

     So: a synthetic plane whose values all sit in [120,150] -- a narrow band inside [86,172], which
     is what averaging produces. Without tighten it must come out grey and flat; with it, the same
     data must span nearly the full range. And a plane that already fills the window must be left
     exactly alone, or this would be a contrast knob pretending to be a fix. */
  const canvas = fakeCanvas();
  sandbox.VALUE_FN = (x, y) => 120 + ((x + y) % 31);          // every value in [120,150]
  const flat = await E.drawSection(canvas, { centre: [240640, 207872, 21360], mip: 2,
                                             w: 64, h: 64 });
  const spread = (cv) => {
    const d = cv._img.data;
    let lo = 255, hi = 0;
    for (let i = 0; i < 64 * 64; i++){ const v = d[i * 4]; if (v < lo) lo = v; if (v > hi) hi = v; }
    return hi - lo;
  };
  const flatSpread = spread(canvas);
  ok(flat.tightened === false && flat.lo === 86 && flat.hi === 172,
     "without it, the window is exactly the one asked for", flat.lo + "-" + flat.hi);
  ok(flatSpread < 110,
     "...and data that only spans 30 of the window's 86 levels comes out flat, which is the "
     + "complaint", "spans " + flatSpread + " of 255");

  const canvas2 = fakeCanvas();
  const tight = await E.drawSection(canvas2, { centre: [240640, 207872, 21360], mip: 2,
                                               w: 64, h: 64, tighten: true });
  ok(tight.tightened === true, "with it, the window moved", tight.lo + "-" + tight.hi);
  ok(tight.lo >= 86 && tight.hi <= 172,
     "...INWARD only — it can never widen past what was asked for, so it cannot lose contrast",
     tight.lo + "-" + tight.hi + " inside 86-172");
  ok(spread(canvas2) > 240,
     "...and the same 30 levels of data now span the picture", "spans " + spread(canvas2) + " of 255");
  ok(String(tight.windowAsked) === "86,172",
     "...while still reporting what it was asked for, so a caption can say both",
     String(tight.windowAsked));

  /* Data that already fills the window: tightening must be a no-op, or every full-resolution
     section would quietly get a different contrast than Neuroglancer gives it. */
  const canvas3 = fakeCanvas();
  sandbox.VALUE_FN = (x, y) => 60 + ((x * 7 + y * 13) % 180);   // 60..239, wider than the window
  const full = await E.drawSection(canvas3, { centre: [240640, 207872, 21360], mip: 2,
                                              w: 64, h: 64, tighten: true });
  ok(full.tightened === false && full.lo === 86 && full.hi === 172,
     "data that already fills the window is left alone — Neuroglancer's numbers, unchanged",
     full.lo + "-" + full.hi);

  /* A nearly-uniform plane (outside the tissue, a blank block) must not be stretched into noise. */
  const canvas4 = fakeCanvas();
  sandbox.VALUE_FN = () => 130;
  const blank = await E.drawSection(canvas4, { centre: [240640, 207872, 21360], mip: 2,
                                               w: 64, h: 64, tighten: true });
  ok(blank.tightened === false,
     "a plane of one value is NOT stretched into pure noise — below 16 levels it keeps the window",
     blank.lo + "-" + blank.hi);
  sandbox.VALUE_FN = null;
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
process.exit(fails ? 1 : 0);

})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
