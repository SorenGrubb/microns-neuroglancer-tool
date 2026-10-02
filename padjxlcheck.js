/* The tick that goes and fetches a JPEG XL decoder.                                  2026-10-03

   Eyewire II's retina publishes 16, 32 and 64 nm as JPEG XL. Chrome cannot read them, so
   core/emtiles.js drops those levels and the pad opens at the volume's 128 nm jpeg level — where a
   lysosome is four pixels across. Søren: *"Lazy + opt-in, in a Worker"*.

   jxlcheck.js covers the decoder's protocol and emtilescheck.js covers the decoders hook. This
   file covers the part that is only true on a real page: that the tick is OFFERED where it would
   help and nowhere else, that ticking it changes what the mip menu says, and the one thing here
   that would be expensive rather than visible —

   THE CHUNK IS COPIED BEFORE IT IS HANDED TO THE WORKER. core/segread.js caches a chunk's
   ArrayBuffer by URL and range, and core/emtiles.js caches the decoded plane in a WeakMap keyed on
   that same buffer. A transfer detaches it, so the next read of that chunk — the one the cache
   exists to make free — would get zero bytes, and the second section of a tracing would come back
   blank with nothing in the console. Asserted by handing it a buffer and checking the original is
   still there afterwards.

   NO WASM IS FETCHED HERE. UJ.jxl's worker seam is stood in for; whether jxl-oxide decodes JPEG XL
   is jxl-oxide's business and is measured, not asserted.

   Run: node padjxlcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The retina's own scale list, read live from its info on 2026-10-03: five levels, the finest
   three jxl and the coarsest two jpeg, every one of them keeping a 40 nm section. */
const EW2 = { type: "image", data_type: "uint8", num_channels: 1, scales: [
  ["16_16_40", [16, 16, 40], [81920, 81920, 2064], "jxl"],
  ["32_32_40", [32, 32, 40], [40960, 40960, 2064], "jxl"],
  ["64_64_40", [64, 64, 40], [20480, 20480, 2064], "jxl"],
  ["128_128_40", [128, 128, 40], [10240, 10240, 2064], "jpeg"],
  ["256_256_40", [256, 256, 40], [5120, 5120, 2064], "jpeg"]
].map(([key, resolution, size, encoding]) => ({
  key, resolution, size, encoding, voxel_offset: [0, 0, 1], chunk_sizes: [[128, 128, 16]] })) };

/* minnie65's, near enough: every level raw, so nothing is unreadable and the tick must stay away. */
const PLAIN = { type: "image", data_type: "uint8", num_channels: 1, scales: [
  ["8_8_40", [8, 8, 40], [212992, 180224, 13088]],
  ["16_16_40", [16, 16, 40], [106496, 90112, 13088]],
  ["32_32_40", [32, 32, 40], [53248, 45056, 13088]]
].map(([key, resolution, size]) => ({
  key, resolution, size, encoding: "raw", voxel_offset: [0, 0, 0], chunk_sizes: [[128, 128, 32]] })) };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 1200 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const u of ["**script.google.com/**", "**accounts.google.com/**",
                   "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**"])
    await p.route(u, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  /* The page's own emtiles, pointed at a fixture info and with the draw stubbed out: what is
     under test is the menu and the tick, and a real draw would try to fetch a megabyte of
     chunks from a bucket this check has deliberately cut off. */
  const setup = async (info) => p.evaluate((inf) => {
    window.__drew = 0;
    window.padDraw = async function(){ window.__drew++; };
    UJ.segread._getInfo = async () => inf;
    PAD_FINE = false;
    const box = document.getElementById("tracePadFine");
    if (box) box.checked = false;
    UJ.emtiles.configure(tracingSources());
    /* The menu is rebuilt from the scale list, so it has to start from the markup's own six
       options or a previous section's additions would be read as this one's. */
    const sel = document.getElementById("tracePadMip");
    /* The markup's own three, verbatim: padRelabelMips rewrites a label by MATCHING the shape
       "N µm — N nm data" and replacing it, so an option seeded with anything else is left alone
       and the menu would look unchanged for a reason that has nothing to do with the decoder. */
    sel.innerHTML =
      '<option value="2:1">18 µm across — 32 nm data, slower to load</option>'
    + '<option value="1:1" selected>9 µm — 16 nm data, a whole cell</option>'
    + '<option value="0:1">4.5 µm — 8 nm data, full detail</option>';
    return true;
  }, info);

  const menu = () => p.evaluate(() =>
    [].map.call(document.getElementById("tracePadMip").options, o => o.textContent).join(" | "));
  const shown = () => p.evaluate(() => {
    const w = document.getElementById("tracePadFineWrap");
    return w ? w.style.display : "(absent)";
  });

  console.log("a volume whose levels the browser reads is not offered a decoder");
  {
    await setup(PLAIN);
    await p.evaluate(() => padRelabelMips());
    ok(await shown() === "none", "the tick stays hidden — there is nothing it would fix",
       await shown());
    ok(await p.evaluate(() => UJ.emtiles.unreadableEncodings()).then(r => r.length === 0),
       "...because emtiles says every encoding here is one it can read");
  }

  console.log("\nthe retina is, and the menu says what it can and cannot show");
  {
    await setup(EW2);
    await p.evaluate(() => padRelabelMips());
    ok(await shown() === "flex", "the tick appears", await shown());
    ok((await p.evaluate(() => UJ.emtiles.unreadableEncodings())).join() === "jxl",
       "...because jxl is listed and nothing configured can decode it");
    const m0 = await menu();
    ok(/128 nm data/.test(m0) && !/16 nm data/.test(m0),
       "...and the menu offers 128 nm, which is the finest level it can really read",
       m0.slice(0, 90));
  }

  console.log("\nticking it boots the decoder and the finer levels appear");
  {
    const before = await p.evaluate(() => window.__drew);
    const said = await p.evaluate(async () => {
      /* The worker seam, stood in for: this is the protocol jxlcheck.js drives in full. */
      UJ.jxl._reset();
      UJ.jxl._workerFactory(function(){
        const w = { postMessage(m){ setTimeout(() => w.onmessage({ data: m.t === "boot"
          ? { t: "ready", v: "0.12.6-stub" }
          : { t: "ok", id: m.id, data: new Uint8Array(1), width: 1, height: 1 } }), 0); } };
        return w;
      });
      document.getElementById("tracePadFine").checked = true;
      await padFineSet(true);
      return document.getElementById("tracePadFineSay").textContent;
    });
    ok(await p.evaluate(() => UJ.jxl.ready()), "the decoder is up", await p.evaluate(() => UJ.jxl.version()));
    ok(await p.evaluate(() => !!(tracingSources().decoders || {}).jxl),
       "...and the sources the pad configures emtiles with now carry a jxl decoder");
    const m1 = await menu();
    ok(/16 nm data/.test(m1), "...so the menu has the finest level in it now", m1.slice(0, 90));
    ok(await p.evaluate(() => window.__drew) > before, "...and the section was redrawn",
       (await p.evaluate(() => window.__drew)) - before + " draw(s)");
    ok(/45 ms a chunk/.test(said), "...and it says what that costs, in the numbers it was measured at",
       said.slice(0, 80));
  }

  console.log("\nthe chunk handed to the worker is a COPY");
  {
    const got = await p.evaluate(async () => {
      let sawLen = -1, sawSame = null;
      const real = UJ.jxl.decode;
      const mine = new ArrayBuffer(64);
      UJ.jxl.decode = async (b) => { sawLen = b.byteLength; sawSame = (b === mine);
                                     return { data: new Uint8Array(1), width: 1, height: 1 }; };
      await tracingDecoders().jxl(mine);
      UJ.jxl.decode = real;
      return { sawLen, sawSame, stillThere: mine.byteLength };
    });
    ok(got.sawSame === false, "the decoder is handed a different buffer", "same? " + got.sawSame);
    ok(got.sawLen === 64 && got.stillThere === 64,
       "...with the same bytes, and the ORIGINAL is not detached — segread and emtiles both "
       + "cache it, and a detached chunk reads as zero bytes on the next section",
       got.sawLen + " handed over, " + got.stillThere + " left behind");
  }

  console.log("\nand unticking puts the pad back on the levels the browser reads");
  {
    await p.evaluate(async () => {
      document.getElementById("tracePadFine").checked = false;
      await padFineSet(false);
    });
    ok(await p.evaluate(() => (tracingSources().decoders === null)),
       "no decoders in the sources any more");
    ok(await shown() === "flex",
       "...but the tick is still on screen, so it can be ticked again", await shown());
    ok((await p.evaluate(() => UJ.emtiles.unreadableEncodings())).join() === "jxl",
       "...and emtiles is back to calling jxl unreadable");
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
