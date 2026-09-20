/* λJump can draw its own EM, and knows what this tissue looks like.                 2026-09-20

   First slice of the tracing card's port. The pad draws one section of EM *in the page*, so before
   any of the card exists the page has to be able to fetch and stretch its own imagery — and that
   is the part most likely to be quietly wrong, because it depends on a bucket, an encoding, a
   chunk layout and two contrast numbers, none of which this repo controls.

   WHAT WAS MEASURED LIVE, from grubblab.com, before any of this was written
   (claude/which-datasets-can-be-traced-on.md):

     - `s3://open-neurodata/lee/lee16/image` is raw, uint8, 1 channel, UNSHARDED, 4/8/16/32 nm with
       40 nm sections, and 27 of 27 probe chunks across the volume read 200;
     - a 560×460 section at 8 nm drew in 2138 ms cold, pixel range 0–255;
     - πJump, which was supposed to go first, serves an info file and NOT ONE CHUNK.

   THIS CHECK CANNOT REACH THAT BUCKET — the sandbox has no egress, and a check that needed one
   would be a check that fails on a train. So the network is answered from the real volume's
   measured shape: the same info file, and chunks of the right size full of plausible bytes. What
   is under test is the PAGE — that it loads the eight modules, points the reader at its own
   dataset, and stretches with its own numbers rather than µJump's.

   THE TWO NUMBERS ARE THE POINT. core/emtiles.js defaults its window to lo 86 / hi 172 — minnie65's
   numbers, living in a shared file as though they were everyone's. Lee16's median is 189. A page
   that forgets to pass its own window clips more than half of this tissue to white and looks
   broken in a way no error says anything about.

   Run: node emljumpcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* Lee16's real info, as read from the bucket on 2026-09-20. Trimmed to the four scales that
   matter; the offsets and chunk sizes are the volume's own. */
const INFO = {
  type: "image", data_type: "uint8", num_channels: 1,
  scales: ["4_4_40", "8_8_40", "16_16_40", "32_32_40"].map((key, i) => ({
    key, encoding: "raw", resolution: [4 << i, 4 << i, 40],
    size: [163840 >> i, 163840 >> i, 822], voxel_offset: [0, 0, 0],
    chunk_sizes: [[512, 512, 16]]
  }))
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**script.google.com/**", "**accounts.google.com/**",
                   "**cdnjs.cloudflare.com/**"]) await p.route(h, r => r.abort());

  /* The volume, answered locally. A gradient rather than noise, so a wrongly-stretched canvas is
     visibly different from a correctly-stretched one rather than being grey either way. */
  let chunkHits = 0;
  await p.route("**open-neurodata.s3.amazonaws.com/**", route => {
    const u = route.request().url();
    if (/\/info$/.test(u))
      return route.fulfill({ status: 200, contentType: "application/json",
                             body: JSON.stringify(INFO) });
    chunkHits++;
    const n = 512 * 512 * 16;
    const buf = Buffer.allocUnsafe(n);
    /* 0..255 across x, so every window setting produces a different, checkable picture. */
    for (let i = 0; i < n; i++) buf[i] = (i % 512) >> 1;
    return route.fulfill({ status: 200, contentType: "application/octet-stream", body: buf });
  });
  await p.route("**storage.googleapis.com/**", r => r.abort());

  await p.goto("file://" + page_("ljump.html"));
  await p.waitForTimeout(5000);

  console.log("ljump.html\n\nthe page carries the stack the pad is built from");
  {
    const got = await p.evaluate(() => ({
      mods: ["segread", "segpaint", "organellelink", "emtiles", "tracepad", "traceloft",
             "nucmesh", "tracing"].filter(m => !!(window.UJ && UJ[m])),
      emtiles: !!(window.UJ && UJ.emtiles && UJ.emtiles.drawSection),
      win: typeof EM_WINDOW !== "undefined" ? EM_WINDOW : null,
      conf: typeof emConfigure === "function"
    }));
    ok(got.mods.length >= 6, "the tracing modules are loaded", got.mods.join(", "));
    ok(got.emtiles, "...and emtiles can draw a section", got.emtiles);
    ok(got.conf, "...and the page has one place that points the reader at its dataset", got.conf);
    /* MEASURED, NOT COPIED: 2–98% of 480,000 pixels over three sections of the real volume. */
    ok(got.win && got.win.lo === 44 && got.win.hi === 238,
       "...and its own contrast window, not µJump's",
       got.win ? got.win.lo + "–" + got.win.hi : "(none)"
       + "  <- emtiles defaults to minnie65's 86–172; Lee16's median alone is 189");
  }

  console.log("\nand it draws this dataset, through the unsharded path");
  {
    const got = await p.evaluate(async () => {
      if (!emConfigure()) return { err: "emConfigure said no" };
      const cv = document.createElement("canvas");
      cv.width = 400; cv.height = 300;
      let view = null, err = null;
      try {
        view = await UJ.emtiles.drawSection(cv, {
          centre: [81920, 81920, 411], w: 400, h: 300, mip: 1,
          lo: EM_WINDOW.lo, hi: EM_WINDOW.hi });
      } catch (e) { err = String(e.message || e).slice(0, 140); }
      if (err) return { err };
      const d = cv.getContext("2d").getImageData(0, 0, 400, 300).data;
      let min = 255, max = 0, sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i]; if (v < min) min = v; if (v > max) max = v; sum += v; n++;
      }
      return { mip: view.mip, nm: view.nmPerPx || view.nm,
               src: (UJ.emtiles.source && UJ.emtiles.source()) || null,
               min, max, mean: Math.round(sum / n) };
    });
    ok(!got.err, "a section draws", got.err || "no error");
    if (!got.err) {
      ok(got.nm === 8, "...at 8 nm, which is mip 1 on this volume", got.nm + " nm");
      /* The gradient spans the whole range, so a drawn section must too. A blank canvas — the
         πJump failure mode, where every chunk 404s and the fill is uniform — has min === max. */
      ok(got.min !== got.max, "...with real pixels on it, not a uniform fill",
         got.min + "–" + got.max
         + "  <- a volume whose chunks all 404 draws one flat value, and nothing says so");
      ok(chunkHits > 0, "...fetched by name, which is the unsharded path",
         chunkHits + " chunks  <- minnie65 is sharded; this reader had never drawn one this way");
    }
  }

  console.log("\nand the window it passes is the one that reaches the canvas");
  {
    /* THE ASSERTION THAT CATCHES A FORGOTTEN WINDOW. Drawing the same data twice, once with this
       page's numbers and once with the shared default, must not produce the same canvas — if it
       does, the page is not passing anything and nobody would see an error. */
    const got = await p.evaluate(async () => {
      const draw = async opts => {
        const cv = document.createElement("canvas");
        cv.width = 200; cv.height = 150;
        await UJ.emtiles.drawSection(cv, Object.assign(
          { centre: [81920, 81920, 411], w: 200, h: 150, mip: 1 }, opts));
        const d = cv.getContext("2d").getImageData(0, 0, 200, 150).data;
        let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { sum += d[i]; n++; }
        return Math.round(sum / n);
      };
      return { ours: await draw({ lo: EM_WINDOW.lo, hi: EM_WINDOW.hi }),
               theirs: await draw({}) };
    });
    ok(got.ours !== got.theirs,
       "this page's window changes the picture, so it is really being used",
       "ours " + got.ours + " vs the shared default " + got.theirs);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
