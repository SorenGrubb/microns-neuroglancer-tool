/* βJump can draw its own EM, through a bucket that sends no CORS headers.          2026-09-21

   Stage F of the tracing card's port, and emdjumpcheck.js's sibling. What is different here is the
   ROUTE the bytes take: gs://vclem-xh answers the browser's ordinary public URL with no CORS
   headers, so every request has to go through Google's JSON API instead —

       https://storage.googleapis.com/storage/v1/b/vclem-xh/o/<whole%2Fobject%2Fname>?alt=media

   — with the whole object name as ONE encoded segment. So this check answers ONLY that form. A
   page that built a single URL the old way would be refused here the way a browser refuses it,
   rather than passing because the stub was generous.

   THE VOLUME'S REAL SHAPE, read from its info through the JSON API on 2026-09-20/21:
   uint8, raw, SHARDED, and four levels this page uses — 8 / 16 / 32 nm keep 30 nm sections, 64 nm
   is 60 nm deep. The card draws the 64 nm level, as µJump does, so the stub serves a real sharded
   file for it: compressed Morton keys computed by the module's own function, a gzip'd minishard
   index with delta-encoded offsets, gzip'd chunks, and Range honoured on every read.

   ONE SIMPLIFICATION, SAID: the real 64 nm level shards with preshift 9 / minishard 6 / shard 2;
   this stub uses 0 / 0 / 0 so every chunk lives in one `0.shard`. Sharding arithmetic is proved
   against hand-built shards in segreadcheck.js, including through the JSON API; what this file is
   about is the PAGE. The real layout was read live — 206 on a 113 MB shard of this volume.

   Run: node embjumpcheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const vm = require("vm");
const zlib = require("zlib");
const page_ = require("./pagepath.js");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The module's own Morton code and chunk arithmetic, so the stub files chunks where the reader will
   look for them — and a disagreement is a failure of the page's wiring, not of a second copy. */
const sb = { console, Math, Number, String, Array, Map, BigInt, Promise, Uint32Array, DataView,
             ArrayBuffer, isFinite, setTimeout };
sb.window = sb;
vm.runInContext(fs.readFileSync(core("segread.js"), "utf8"), vm.createContext(sb));
const SR = sb.UJ.segread;

const SH0 = { "@type": "neuroglancer_uint64_sharded_v1", hash: "identity", preshift_bits: 0,
              minishard_bits: 0, shard_bits: 0, data_encoding: "gzip",
              minishard_index_encoding: "gzip" };
const INFO = { type: "image", data_type: "uint8", num_channels: 1, scales: [
  { key: "8.0x8.0x30.0",   resolution: [8, 8, 30],   size: [57344, 55296, 864],
    chunk_sizes: [[128, 128, 32]], encoding: "raw", sharding: SH0 },
  { key: "16.0x16.0x30.0", resolution: [16, 16, 30], size: [28672, 27648, 864],
    chunk_sizes: [[128, 128, 64]], encoding: "raw", sharding: SH0 },
  { key: "32.0x32.0x30.0", resolution: [32, 32, 30], size: [14336, 13824, 864],
    chunk_sizes: [[64, 64, 64]], encoding: "raw", sharding: SH0 },
  { key: "64.0x64.0x60.0", resolution: [64, 64, 60], size: [7168, 6912, 432],
    chunk_sizes: [[64, 64, 64]], encoding: "raw", sharding: SH0 }
] };

const JAPI = "https://storage.googleapis.com/storage/v1/b/vclem-xh/o/";
const OBJ = "alzheimers/em_clahe/";

function u64(buf, i, v){ buf.writeBigUInt64LE(BigInt(v), i * 8); }
/* One shard holding every chunk of one level inside a box of chunk coordinates. */
function buildLevelShard(scale, lo, hi){
  const ch = scale.chunk_sizes[0];
  const grid = [0, 1, 2].map(i => Math.ceil(scale.size[i] / ch[i]));
  const n = ch[0] * ch[1] * ch[2];
  const entries = [];
  for (let z = lo[2]; z <= hi[2]; z++)
    for (let y = lo[1]; y <= hi[1]; y++)
      for (let x = lo[0]; x <= hi[0]; x++){
        /* A gradient across x that spans the whole byte, so the 10–244 stretch has something to do
           and a canvas that was never drawn (flat) cannot pass for one that was. */
        const raw = Buffer.allocUnsafe(n);
        for (let i = 0; i < n; i++) raw[i] = (i % ch[0]) * 4 & 255;
        entries.push({ key: SR._compressedMorton([x, y, z], grid), data: zlib.gzipSync(raw) });
      }
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const payload = Buffer.concat(entries.map(e => e.data));
  const k = entries.length, mi = Buffer.alloc(k * 24);
  let prev = 0n;
  for (let i = 0; i < k; i++){ u64(mi, i, entries[i].key - prev); prev = entries[i].key; }
  let cursor = 0, at = 0;
  for (let i = 0; i < k; i++){
    u64(mi, k + i, at - cursor); cursor = at + entries[i].data.length;
    u64(mi, 2 * k + i, entries[i].data.length); at += entries[i].data.length;
  }
  const miGz = zlib.gzipSync(mi);
  const shard = Buffer.concat([Buffer.alloc(16), payload, miGz]);
  shard.writeBigUInt64LE(BigInt(payload.length), 0);
  shard.writeBigUInt64LE(BigInt(payload.length + miGz.length), 8);
  return { shard, count: k };
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**script.google.com/**", "**accounts.google.com/**",
                   "**cdnjs.cloudflare.com/**"]) await p.route(h, r => r.abort());

  /* THE PLAIN URL IS REFUSED, as a browser refuses it. Counted, so "nothing went that way" is a
     claim this file checks rather than one it assumes. */
  let plainHits = 0;
  await p.route("**storage.googleapis.com/vclem-xh/alzheimers/em_clahe/**", r => { plainHits++; return r.abort(); });
  await p.route("**storage.googleapis.com/vclem-xh/**", r => r.abort());

  let apiHits = 0, rangeHits = 0, shards = {}, cellVox = null;
  await p.route("**storage.googleapis.com/storage/v1/b/vclem-xh/o/**", async route => {
    const u = new URL(route.request().url());
    const name = decodeURIComponent(u.pathname.slice("/storage/v1/b/vclem-xh/o/".length));
    if (name.indexOf(OBJ) !== 0 || u.searchParams.get("alt") !== "media")
      return route.fulfill({ status: 404, body: "" });
    apiHits++;
    const rest = name.slice(OBJ.length);
    if (rest === "info")
      return route.fulfill({ status: 200, contentType: "application/json",
                             headers: { "access-control-allow-origin": "*" },
                             body: JSON.stringify(INFO) });
    const m = /^([^/]+)\/0\.shard$/.exec(rest);
    const sc = m && INFO.scales.find(s => s.key === m[1]);
    if (!sc || !cellVox) return route.fulfill({ status: 404, body: "" });
    if (!shards[sc.key]){
      /* Every chunk within reach of the cell under test, at its own level's grid. */
      const ch = sc.chunk_sizes[0];
      const v = [0, 1, 2].map(i => Math.floor(cellVox[i] * [8, 8, 30][i] / sc.resolution[i]));
      const c = [0, 1, 2].map(i => Math.floor(v[i] / ch[i]));
      shards[sc.key] = buildLevelShard(sc, [c[0] - 4, c[1] - 3, c[2]], [c[0] + 4, c[1] + 3, c[2]]);
    }
    const buf = shards[sc.key].shard;
    const rg = /bytes=(\d+)-(\d+)/.exec(route.request().headers()["range"] || "");
    if (!rg) return route.fulfill({ status: 200, body: buf });
    rangeHits++;
    return route.fulfill({ status: 206, contentType: "application/octet-stream",
                           headers: { "access-control-allow-origin": "*" },
                           body: buf.slice(Number(rg[1]), Number(rg[2]) + 1) });
  });

  await p.goto("file://" + page_("bjump.html"));
  await p.waitForTimeout(6000);

  console.log("bjump.html\n\nthe page carries the stack, and names the bucket that has no CORS");
  {
    const got = await p.evaluate(() => ({
      mods: ["segread", "segpaint", "organellelink", "emtiles", "tracepad", "traceloft",
             "nucmesh", "tracing"].filter(m => !!(window.UJ && UJ[m])),
      conf: typeof emConfigure === "function",
      win: typeof EM_WINDOW !== "undefined" ? EM_WINDOW : null,
      url: UJ.segread._urlOf("https://storage.googleapis.com/vclem-xh/alzheimers/em_clahe", "info"),
      cell: [BX[0], BY[0], BZ[0]]
    }));
    ok(got.mods.length === 8, "all eight tracing modules are loaded", got.mods.join(", "));
    ok(got.conf, "...and one place points the reader at this dataset");
    ok(got.win && got.win.lo === 10 && got.win.hi === 244,
       "...with the window measured on this EM, 2–98%", got.win && got.win.lo + "–" + got.win.hi);
    ok(got.url === JAPI + encodeURIComponent(OBJ + "info") + "?alt=media",
       "vclem-xh is read through the JSON API from the moment the page loads", got.url);
    cellVox = got.cell;
  }

  console.log("\nthe levels, off the volume's own info");
  {
    const got = await p.evaluate(async () => {
      if (!emConfigure()) return { err: "emConfigure said no" };
      const out = {};
      for (const m of [0, 2, 3]){
        const s = await UJ.emtiles.scaleAt(m, m === 3);
        out["mip" + m] = { key: s.scale.key, sectionNm: s.sectionNm, slab: s.slab, count: s.count };
      }
      return out;
    });
    ok(!got.err, "emConfigure answered", got.err || "yes");
    if (!got.err){
      ok(got.mip0.key === "8.0x8.0x30.0" && got.mip0.slab === 1 && got.mip0.count === 3,
         "mip 0 is 8 nm, one 30 nm section, and three levels keep one",
         got.mip0.key + ", slab " + got.mip0.slab + ", " + got.mip0.count + " levels");
      ok(got.mip3.key === "64.0x64.0x60.0" && got.mip3.slab === 2,
         "mip 3 with slabOk is the 64 nm level, and it averages TWO sections",
         got.mip3.key + ", slab " + got.mip3.slab);
    }
  }

  console.log("\nand the cell card shows one plane of it");
  {
    const got = await p.evaluate(async () => {
      showCell(0);
      const t0 = Date.now();
      let cv, say;
      while (Date.now() - t0 < 20000){
        await new Promise(r => setTimeout(r, 200));
        cv = document.getElementById("emPlaneCv");
        say = (document.getElementById("emPlaneSay") || {}).textContent;
        if (cv && cv.title) break;
      }
      if (!cv) return { none: true };
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let mn = 255, mx = 0, flat = 0;
      for (let i = 0; i < d.length; i += 4){ mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); }
      const box = document.getElementById("emPlaneBox"), meta = box && box.nextElementSibling;
      return { w: cv.width, h: cv.height, title: cv.title, say, mn, mx,
               after: meta ? meta.className : null,
               key: typeof EM_PLANE_KEY !== "undefined" ? EM_PLANE_KEY : null };
    });
    ok(!got.none, "the card has an EM section on it");
    if (!got.none){
      ok(got.w === 300 && got.h === 162, "...300×162, µJump's size for µJump's pyramid",
         got.w + "×" + got.h);
      ok(got.mx - got.mn > 100, "...with real pixels on it, not a uniform fill",
         got.mn + "–" + got.mx + "  <- " + rangeHits + " ranged read(s) through the JSON API");
      ok(/averages 2 of the 30 nm sections/.test(got.title || ""),
         "...and its title says the plane is a two-section slab", (got.title || "").slice(0, 110));
      ok(!got.say, "...and nothing left to say once it is drawn", JSON.stringify(got.say));
      ok(got.key === "bjump_panel_emplane", "...remembered under this page's own key", got.key);
      ok(got.after === "meta", "...placed under the location diagrams, above the ids", got.after);
    }
  }

  console.log("\nthe tracing card, with the segmentation this dataset can read");
  {
    const got = await p.evaluate(() => {
      const src = tracingSources();
      return {
        filled: !!(document.getElementById("tracingCard") || {}).firstElementChild,
        src: { em: src.em, seg: src.seg, nuc: src.nuc },
        segTick: !!document.getElementById("tracePadSeg"),
        ghostTick: !!document.getElementById("tracePadGhosts"),
        keys: [UJ.cfg.tracing.lsKey, UJ.cfg.tracing.draftsKey, UJ.cfg.tracing.draftKey,
               UJ.cfg.tracing.penKey],
        intro: (document.getElementById("tracingCard").textContent.match(/segmentation covers only about half[^.]*\./) || [""])[0]
      };
    });
    ok(got.filled, "the card is built into its wrapper");
    ok(/em_clahe/.test(got.src.em) && /segmentation_secgan_16nm/.test(got.src.seg) && !got.src.nuc,
       "...reading this EM and this segmentation, and no nucleus volume",
       JSON.stringify(got.src));
    /* KEPT, unlike on λJump and δJump: this segmentation is precomputed and readable. */
    ok(got.segTick, "...so the pad keeps the tick that paints the cell", got.segTick);
    ok(got.ghostTick, "...and the see-through ghosts, since the meshes are public", got.ghostTick);
    ok(got.keys.every(k => /^bjump_/.test(k)), "...under four keys of βJump's own", got.keys.join(", "));
    ok(!!got.intro, "...and it opens by saying why tracing matters here", got.intro);
  }

  console.log("\nthe pad draws a true 30 nm section through the same route");
  {
    const got = await p.evaluate(async (c) => {
      document.getElementById("tracingPanel").open = true;
      ["tracingX", "tracingY", "tracingZ"].forEach((id, i) => {
        document.getElementById(id).value = String(c[i]); });
      document.getElementById("tracePadOpen").click();
      const t0 = Date.now();
      while (Date.now() - t0 < 20000){
        await new Promise(r => setTimeout(r, 200));
        if (typeof PAD_VIEW !== "undefined" && PAD_VIEW) break;
      }
      const cv = document.getElementById("tracePad");
      if (!cv || typeof PAD_VIEW === "undefined" || !PAD_VIEW) return { none: true };
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let mn = 255, mx = 0;
      for (let i = 0; i < d.length; i += 4){ mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); }
      return { nm: PAD_VIEW.nmPerPx, slab: PAD_VIEW.slab, mn, mx,
               at: (document.getElementById("tracingAtSay") || {}).textContent || "" };
    }, cellVox);
    ok(!got.none, "the pad opens on a section");
    if (!got.none){
      ok(got.slab === 1, "...one 30 nm section, never the slab the card shows",
         got.nm + " nm/px, slab " + got.slab);
      ok(got.mx - got.mn > 100, "...with real pixels on it", got.mn + "\u2013" + got.mx);
    }
  }

  console.log("\nthe ghosts look for this page's mesh reader and nucleus volume, not µJump's");
  {
    const got = await p.evaluate(async (seg) => {
      document.getElementById("tracingNucId").value = String(BID[0]);   // a Hoechst blob number
      document.getElementById("tracingRootId").value = seg;
      PAD3D_MESHES = null; PAD3D_KEY = "";
      let asked = null;
      const real = UJ.mesh.fetchCombinedMesh;
      UJ.mesh.fetchCombinedMesh = async function(root){ asked = String(root); return null; };
      let out = null, err = null;
      try { out = await pad3DGhostMeshes(); } catch (e){ err = String(e && e.message || e); }
      UJ.mesh.fetchCombinedMesh = real;
      return { asked, err, n: out ? out.length : -1, note: PAD3D_NOTE,
               meshdl: typeof MeshDL };
    }, (await p.evaluate(() => { for (let i = 0; i < BSEG.length; i++) if (BSEG[i]) return String(BSEG[i]); return ""; })));
    /* βJump never defines MeshDL; the card used to look only for that, so the cell was never
       asked for and the note blamed an empty box. */
    ok(got.meshdl === "undefined" && !!got.asked,
       "the cell is asked of UJ.mesh on a page that has no MeshDL global",
       "MeshDL " + got.meshdl + ", asked for " + got.asked);
    ok(!/no cell or nucleus ID/.test(got.note || ""),
       "...and the note does not claim the boxes are empty", JSON.stringify(got.note));
    ok(!/nucleus/.test(got.note || ""),
       "...and the blob number in the nucleus box is not sent to a nucleus volume there is none of",
       JSON.stringify(got.note));
  }

  console.log("\nevery byte came the way a browser allows");
  ok(apiHits > 0 && rangeHits > 0, "reads went through the JSON API, with Range",
     apiHits + " request(s), " + rangeHits + " ranged");
  ok(plainHits === 0, "...and none went to the public URL the bucket refuses",
     plainHits + " plain request(s)");
  ok(errors.length === 0, "the page still loads with no new errors", errors.join(" | ") || "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
