/* ηJump can draw its own EM: JPEG chunks, through a bucket that sends no CORS headers.   2026-09-21

   Stage G of the tracing card's port, and embjumpcheck.js's sibling. What ηJump adds is the
   ENCODING: every H01 image chunk is a JPEG — measured on the live bucket, a 128x128x64 chunk at
   16 nm is one grey image 128 wide and 8192 tall, the z sections stacked vertically. So this check
   serves REAL JPEGs, written by Pillow in exactly that geometry, and the page has to decode them.
   A page that read the bytes as raw would draw the compressed stream as pixels: noise, not the
   gradient, and the title's window would be nonsense.

   Everything else is βJump's: the JSON API as the only route (the plain URL is refused and
   counted), sharded files built with the module's own Morton code, Range honoured. The real
   imagery's shard data is NOT gzip'd (data_encoding null) and neither is this stub's.

   THE VOLUME'S REAL SHAPE, read through the JSON API on 2026-09-21:
       4nm_raw  jpeg, sharded — 4 / 8 / 16 / 32 nm keep 33 nm sections, 64 nm is 66 nm deep
       c3       uint64 compressed_segmentation, sharded — 8 / 16 / 32 nm at 33 nm, then 64 at 66
   One simplification, said: this stub shards with 0 / 0 / 0 bits, so a level is one `0.shard`.

   Run: node emhjumpcheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const vm = require("vm");
const zlib = require("zlib");
const { execFileSync } = require("child_process");
const page_ = require("./pagepath.js");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

const sb = { console, Math, Number, String, Array, Map, BigInt, Promise, Uint32Array, DataView,
             ArrayBuffer, isFinite, setTimeout };
sb.window = sb;
vm.runInContext(fs.readFileSync(core("segread.js"), "utf8"), vm.createContext(sb));
const SR = sb.UJ.segread;

const SH0 = h => ({ "@type": "neuroglancer_uint64_sharded_v1", hash: "identity", preshift_bits: 0,
                    minishard_bits: 0, shard_bits: 0, data_encoding: h ? "gzip" : null,
                    minishard_index_encoding: "gzip" });
const EM_LEVELS = [[4, 33, [1031784, 712800, 5293], [128, 128, 16]],
                   [8, 33, [515892, 356400, 5293], [128, 128, 32]],
                   [16, 33, [257946, 178200, 5293], [128, 128, 64]],
                   [32, 33, [128973, 89100, 5293], [64, 64, 64]],
                   [64, 66, [64487, 44550, 2647], [64, 64, 64]]];
const INFO = { type: "image", data_type: "uint8", num_channels: 1,
  scales: EM_LEVELS.map(([r, z, size, ch]) => ({
    key: r.toFixed(1) + "x" + r.toFixed(1) + "x" + z.toFixed(1), resolution: [r, r, z], size,
    chunk_sizes: [ch], encoding: "jpeg", sharding: SH0(false) })) };
const SEG_INFO = { type: "segmentation", data_type: "uint64", num_channels: 1,
  scales: EM_LEVELS.slice(1).map(([r, z, size, ch]) => ({
    key: r.toFixed(1) + "x" + r.toFixed(1) + "x" + z.toFixed(1), resolution: [r, r, z], size,
    chunk_sizes: [ch], encoding: "compressed_segmentation",
    compressed_segmentation_block_size: [8, 8, 4], sharding: SH0(true) })) };

const BUCKET = "/storage/v1/b/h01-release/o/";
const JAPI = "https://storage.googleapis.com" + BUCKET;
const EM_OBJ = "data/20210601/4nm_raw/", SEG_OBJ = "data/20210601/c3/";

/* A real JPEG: `nx` wide, ny*nz tall, grey, value (x*4) & 255 — a gradient across x that spans the
   byte, so the 29–212 stretch has something to do. Pillow writes it; the browser decodes it. */
const JPEGS = {};
function jpegFor(nx, ny, nz){
  const k = nx + "x" + ny + "x" + nz;
  if (!JPEGS[k]) JPEGS[k] = execFileSync("python3", ["-c",
    "import sys,io\nfrom PIL import Image\nnx,h=int(sys.argv[1]),int(sys.argv[2])\n"
    + "im=Image.new('L',(nx,h))\nim.putdata([(x*4)&255 for y in range(h) for x in range(nx)])\n"
    + "b=io.BytesIO(); im.save(b,'JPEG',quality=92); sys.stdout.buffer.write(b.getvalue())",
    String(nx), String(ny * nz)]);
  return JPEGS[k];
}

function u64(buf, i, v){ buf.writeBigUInt64LE(BigInt(v), i * 8); }
function shardOf(entries){
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const payload = Buffer.concat(entries.map(e => e.data)), n = entries.length;
  const mi = Buffer.alloc(n * 24); let prev = 0n, at = 0, cur = 0;
  for (let i = 0; i < n; i++){ u64(mi, i, entries[i].key - prev); prev = entries[i].key; }
  for (let i = 0; i < n; i++){ u64(mi, n + i, at - cur); cur = at + entries[i].data.length;
                               u64(mi, 2 * n + i, entries[i].data.length); at += entries[i].data.length; }
  const miGz = zlib.gzipSync(mi);
  const sh = Buffer.concat([Buffer.alloc(16), payload, miGz]);
  sh.writeBigUInt64LE(BigInt(payload.length), 0);
  sh.writeBigUInt64LE(BigInt(payload.length + miGz.length), 8);
  return sh;
}
function csegChunk(shape, block, id){
  const grid = [0, 1, 2].map(i => Math.ceil(shape[i] / block[i]));
  const nB = grid[0] * grid[1] * grid[2], nV = block[0] * block[1] * block[2];
  const valWords = Math.ceil(nV / 32), chan = 1, vb = chan + 2 * nB, tb = vb + nB * valWords;
  const d = new Uint32Array(tb + 2);
  d[0] = chan;
  for (let b = 0; b < nB; b++){ d[chan + 2 * b] = (tb - chan) | (1 << 24); d[chan + 2 * b + 1] = vb + b * valWords - chan; }
  const B = BigInt(id);
  d[tb] = Number(B & 0xffffffffn) >>> 0; d[tb + 1] = Number(B >> 32n) >>> 0;
  return Buffer.from(d.buffer);
}
/* Every chunk within reach of the cell, at the level's own grid, one z row of chunks. */
function around(sc, cellVox){
  const ch = sc.chunk_sizes[0], grid = [0, 1, 2].map(i => Math.ceil(sc.size[i] / ch[i]));
  const v = [0, 1, 2].map(i => Math.floor(cellVox[i] * [8, 8, 33][i] / sc.resolution[i]));
  const c = [0, 1, 2].map(i => Math.floor(v[i] / ch[i]));
  const out = [];
  for (let y = c[1] - 3; y <= c[1] + 3; y++) for (let x = c[0] - 4; x <= c[0] + 4; x++)
    out.push({ c: [x, y, c[2]], key: SR._compressedMorton([x, y, c[2]], grid), ch });
  return out;
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**script.google.com/**", "**accounts.google.com/**",
                   "**cdnjs.cloudflare.com/**", "**gstatic.com/**"]) await p.route(h, r => r.abort());

  let plainHits = 0;
  await p.route("**storage.googleapis.com/h01-release/data/20210601/4nm_raw/**",
                r => { plainHits++; return r.abort(); });
  await p.route("**storage.googleapis.com/h01-release/**", r => r.abort());

  const ACAO = { "access-control-allow-origin": "*" };
  let emHits = 0, jpegServed = 0, segHits = 0, cellVox = null, segFill = "";
  const emShards = {}, segShards = {};
  await p.route("**storage.googleapis.com/storage/v1/b/h01-release/o/**", async route => {
    const u = new URL(route.request().url());
    const name = decodeURIComponent(u.pathname.slice(BUCKET.length));
    if (u.searchParams.get("alt") !== "media") return route.fulfill({ status: 404, body: "" });
    const isEm = name.indexOf(EM_OBJ) === 0, isSeg = name.indexOf(SEG_OBJ) === 0;
    if (!isEm && !isSeg) return route.fulfill({ status: 404, body: "" });
    const rest = name.slice((isEm ? EM_OBJ : SEG_OBJ).length), info = isEm ? INFO : SEG_INFO;
    if (isEm) emHits++; else segHits++;
    if (rest === "info")
      return route.fulfill({ status: 200, contentType: "application/json", headers: ACAO,
                             body: JSON.stringify(info) });
    const m = /^([^/]+)\/0\.shard$/.exec(rest);
    const sc = m && info.scales.find(s => s.key === m[1]);
    if (!sc || !cellVox || (isSeg && !segFill)) return route.fulfill({ status: 404, body: "" });
    const key = sc.key + "|" + cellVox.join(",") + (isSeg ? "|" + segFill : "");
    const store = isEm ? emShards : segShards;
    if (!store[key]) store[key] = shardOf(around(sc, cellVox).map(e => ({
      key: e.key,
      data: isEm ? jpegFor(e.ch[0], e.ch[1], e.ch[2])
                 : zlib.gzipSync(csegChunk(e.ch, sc.compressed_segmentation_block_size, segFill)) })));
    const buf = store[key];
    const rg = /bytes=(\d+)-(\d+)/.exec(route.request().headers()["range"] || "");
    if (!rg) return route.fulfill({ status: 200, headers: ACAO, body: buf });
    const a = Number(rg[1]), z = Number(rg[2]);
    if (isEm && a >= 16 && buf[a] === 0xff && buf[a + 1] === 0xd8) jpegServed++;
    return route.fulfill({ status: 206, headers: ACAO, body: buf.slice(a, z + 1) });
  });

  await p.goto("file://" + page_("hjump.html"));
  await p.waitForTimeout(6000);

  console.log("hjump.html\n\nthe page carries the stack, and names the bucket that has no CORS");
  {
    const got = await p.evaluate(() => ({
      mods: ["segread", "segpaint", "organellelink", "emtiles", "tracepad", "traceloft",
             "nucmesh", "tracing"].filter(m => !!(window.UJ && UJ[m])),
      conf: typeof emConfigure === "function",
      win: typeof EM_WINDOW !== "undefined" ? EM_WINDOW : null,
      url: UJ.segread._urlOf("https://storage.googleapis.com/h01-release/data/20210601/4nm_raw", "info"),
      cell: [HX[0], HY[0], HZ[0]], seg: c3Id(0)
    }));
    ok(got.mods.length === 8, "all eight tracing modules are loaded", got.mods.join(", "));
    ok(got.conf, "...and one place points the reader at this dataset");
    ok(got.win && got.win.lo === 29 && got.win.hi === 212,
       "...with the window measured on H01's EM, 2–98%", got.win && got.win.lo + "–" + got.win.hi);
    ok(got.url === JAPI + encodeURIComponent(EM_OBJ + "info") + "?alt=media",
       "h01-release is read through the JSON API from the moment the page loads", got.url);
    cellVox = got.cell; segFill = got.seg;
  }

  console.log("\nthe levels, off the volume's own info");
  {
    const got = await p.evaluate(async () => {
      if (!emConfigure()) return { err: "emConfigure said no" };
      const out = {};
      for (const m of [0, 4]){
        const s = await UJ.emtiles.scaleAt(m, m === 4);
        out["mip" + m] = { key: s.scale.key, slab: s.slab, count: s.count };
      }
      return out;
    });
    ok(!got.err, "emConfigure answered", got.err || "yes");
    if (!got.err){
      ok(got.mip0.key === "4.0x4.0x33.0" && got.mip0.slab === 1 && got.mip0.count === 4,
         "mip 0 is 4 nm, one 33 nm section, and four levels keep one",
         got.mip0.key + ", slab " + got.mip0.slab + ", " + got.mip0.count + " levels");
      ok(got.mip4.key === "64.0x64.0x66.0" && got.mip4.slab === 2,
         "mip 4 with slabOk is the 64 nm level, and it averages TWO sections",
         got.mip4.key + ", slab " + got.mip4.slab);
    }
  }

  console.log("\nthe cell card shows one plane of it, decoded from JPEG, with the cell painted");
  {
    const got = await p.evaluate(async () => {
      showCell(0);
      const t0 = Date.now(); let cv, say;
      while (Date.now() - t0 < 30000){
        await new Promise(r => setTimeout(r, 200));
        cv = document.getElementById("emPlaneCv");
        say = (document.getElementById("emPlaneSay") || {}).textContent;
        if (cv && cv.title && !/reading|…/.test(say || "")) break;
      }
      if (!cv) return { none: true };
      /* The EM underneath, read with the overlay off, so the gradient can be looked at directly. */
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let magenta = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] - d[k + 1] > 25 && d[k + 2] - d[k + 1] > 25) magenta++;
      const tick = document.getElementById("emPlaneSeg");
      tick.click();
      const t1 = Date.now();
      while (Date.now() - t1 < 15000){
        await new Promise(r => setTimeout(r, 200));
        say = (document.getElementById("emPlaneSay") || {}).textContent;
        if (!/reading|…/.test(say || "")) break;
      }
      const e = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      /* A decoded gradient climbs left to right along a row; raw JPEG bytes read as pixels do not.
         Counted over the middle row, as the share of steps that go the right way. */
      const row = Math.floor(cv.height / 2) * cv.width * 4;
      let up = 0, down = 0, mn = 255, mx = 0;
      for (let x = 1; x < cv.width; x++){
        const a0 = e[row + (x - 1) * 4], a1 = e[row + x * 4];
        if (a1 > a0 + 2) up++; else if (a1 < a0 - 2) down++;
        mn = Math.min(mn, a1); mx = Math.max(mx, a1);
      }
      tick.click();                                    // leave it as the user had it
      return { w: cv.width, h: cv.height, title: cv.title, magenta, total: cv.width * cv.height,
               up, down, mn, mx, lab: tick.closest("label").textContent.trim(),
               key: typeof EM_PLANE_KEY !== "undefined" ? EM_PLANE_KEY : null,
               segKey: typeof EM_PLANE_SEG_KEY !== "undefined" ? EM_PLANE_SEG_KEY : null };
    });
    ok(!got.none, "the card has an EM section on it");
    if (!got.none){
      ok(got.w === 300 && got.h === 162, "...300×162, µJump's size", got.w + "×" + got.h);
      ok(jpegServed > 0, "...built from JPEG chunks", jpegServed + " JPEG chunk(s) served");
      ok(got.mx - got.mn > 100 && got.up > got.down * 3,
         "...DECODED, not read as raw bytes: the gradient climbs across the section",
         got.mn + "–" + got.mx + ", " + got.up + " steps up / " + got.down + " down");
      ok(/averages 2 of the 33 nm sections/.test(got.title || ""),
         "...and its title says the plane is a two-section slab", (got.title || "").slice(0, 110));
      ok(got.lab === "cell" && got.magenta > got.total * 0.5,
         "...and the cell is painted over it, from c3",
         got.magenta + " of " + got.total + " px  <- c3 " + segFill + ", " + segHits + " c3 read(s)");
      ok(got.key === "hjump_panel_emplane" && got.segKey === "hjump_panel_emseg",
         "...both switches remembered under this page's own keys", got.key + ", " + got.segKey);
    }
  }

  console.log("\nthe tracing card");
  {
    const got = await p.evaluate(() => {
      const src = tracingSources();
      return {
        filled: !!(document.getElementById("tracingCard") || {}).firstElementChild,
        src: { em: src.em, seg: src.seg, nuc: src.nuc },
        segTick: !!document.getElementById("tracePadSeg"),
        ghostTick: !!document.getElementById("tracePadGhosts"),
        keys: [UJ.cfg.tracing.lsKey, UJ.cfg.tracing.draftsKey, UJ.cfg.tracing.draftKey,
               UJ.cfg.tracing.penKey]
      };
    });
    ok(got.filled, "the card is built into its wrapper");
    ok(/4nm_raw/.test(got.src.em) && /\/c3$/.test(got.src.seg) && !got.src.nuc,
       "...reading H01's imagery and c3, and no nucleus volume", JSON.stringify(got.src));
    ok(got.segTick && got.ghostTick, "...keeping the segmentation tick and the ghosts",
       got.segTick + " / " + got.ghostTick);
    ok(got.keys.every(k => /^hjump_/.test(k)), "...under four keys of ηJump's own", got.keys.join(", "));
  }

  console.log("\nthe pad draws a true 33 nm section, decoded the same way");
  {
    const got = await p.evaluate(async (c) => {
      document.getElementById("tracingPanel").open = true;
      ["tracingX", "tracingY", "tracingZ"].forEach((id, i) => {
        document.getElementById(id).value = String(c[i]); });
      document.getElementById("tracePadOpen").click();
      const t0 = Date.now();
      while (Date.now() - t0 < 30000){
        await new Promise(r => setTimeout(r, 200));
        if (typeof PAD_VIEW !== "undefined" && PAD_VIEW) break;
      }
      const cv = document.getElementById("tracePad");
      if (!cv || typeof PAD_VIEW === "undefined" || !PAD_VIEW) return { none: true };
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let mn = 255, mx = 0;
      for (let i = 0; i < d.length; i += 4){ mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); }
      return { nm: PAD_VIEW.nmPerPx, slab: PAD_VIEW.slab, mn, mx };
    }, cellVox);
    ok(!got.none, "the pad opens on a section");
    if (!got.none){
      ok(got.slab === 1, "...one 33 nm section, never the slab the card shows",
         got.nm + " nm/px, slab " + got.slab);
      ok(got.mx - got.mn > 100, "...with real pixels on it", got.mn + "–" + got.mx);
    }
  }

  console.log("\nevery byte came the way a browser allows");
  ok(emHits > 0, "reads went through the JSON API", emHits + " EM request(s), " + segHits + " c3");
  ok(plainHits === 0, "...and none went to the public URL the bucket refuses",
     plainHits + " plain request(s)");
  ok(errors.length === 0, "the page still loads with no new errors", errors.join(" | ") || "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
