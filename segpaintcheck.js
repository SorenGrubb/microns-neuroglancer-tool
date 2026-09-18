/* The segmentation, painted over the section in the pad.                           2026-09-17

   Søren: *"There should be an option to show the segmentation of the root ID and the nucleus ID of
   the cell in the EM window."*

   Two halves, and the first one is where the bodies are buried. `compressed_segmentation` keeps a
   per-block lookup table and a bit-packed index into it, with the offsets counted FROM THE START OF
   THE CHANNEL rather than from the start of the file — read as absolute they decode to a
   plausible-looking nothing rather than to an error, which is how core/segread.js's first version
   got it wrong and only a known nucleus id sitting there to disagree caught it. So the decoder is
   driven over chunks built BY HAND in that format, in both of its shapes: a bit-packed block and a
   single-valued one (bits === 0, which is most of the neuropil).

   The second half is the blend: the right voxels, at the right pixels, in the right colours, over a
   real canvas — and the EM left alone everywhere else. Real canvas, so Playwright rather than jsdom.

   Nothing here touches the network. The chunk reader and the info fetch are stubbed; what is under
   test is the decode, the geometry and the blend, which is all of it that can be wrong quietly.

   Run: node segpaintcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("the module is there, and the page loads it");
  {
    const has = await p.evaluate(() => ({
      mod: typeof UJ.segpaint === "object" && typeof UJ.segpaint.paint === "function",
      plane: typeof UJ.segread._planeMatch === "function",
      tick: !!document.getElementById("tracePadSeg"),
      hook: typeof padSegOverlay === "function"
    }));
    ok(has.mod, "core/segpaint.js is loaded by the page");
    ok(has.plane, "...and segread has the plane decoder it uses");
    ok(has.tick, "the pad has a “show the segmentation” tick");
    ok(has.hook, "...and the pad paints it before it captures its base");
  }

  console.log("\na 64-bit id, split the way the decoder compares it");
  {
    const pairs = await p.evaluate(() => ({
      small: UJ.segpaint.idPair("730537"),
      real: UJ.segpaint.idPair("864691135499287571"),
      junk: UJ.segpaint.idPair("not an id"),
      blank: UJ.segpaint.idPair("")
    }));
    ok(pairs.small.lo === 730537 && pairs.small.hi === 0,
       "a small id is all in the low word", JSON.stringify(pairs.small));
    /* 864691135499287571 = 0x0BFFFFFF_C69B5AD3 — checked against BigInt here rather than trusted. */
    const b = 864691135499287571n;
    ok(pairs.real.lo === Number(b & 0xffffffffn) && pairs.real.hi === Number(b >> 32n),
       "a real root ID splits into the two halves it is made of", JSON.stringify(pairs.real));
    ok(pairs.junk === null && pairs.blank === null,
       "and anything that is not a number is not an id");
  }

  /* ── THE DECODER, OVER CHUNKS BUILT IN THE REAL FORMAT ───────────────────────────────────────
     One channel, one 8x8x8 block, uint64 ids. Word 0 is the channel offset; the block header is two
     words; the lookup table and the bit-packed values follow, and BOTH header offsets are relative
     to the channel, which is the whole trap. */
  console.log("\nthe plane decoder, on a chunk built by hand in that format");
  {
    const got = await p.evaluate(() => {
      const ID = "864691135499287571";
      const want = UJ.segpaint.idPair(ID);
      /* bits = 1: index 0 is background, index 1 is the id. 512 voxels = 16 words of values. */
      const chan = 1, hdr = 1, table = 3, vals = 7;
      const d = new Uint32Array(vals + 16);
      d[0] = chan;
      d[hdr] = (1 << 24) | (table - chan);        // bits 1, table offset channel-relative
      d[hdr + 1] = (vals - chan);                 // values offset, channel-relative
      d[table] = 0; d[table + 1] = 0;             // entry 0 — background
      d[table + 2] = want.lo; d[table + 3] = want.hi;   // entry 1 — the cell
      /* A 4x4 square on z = 0 only, so a wrong z would show up as an empty plane. */
      const set = (x, y, z) => { const i = x + 8 * (y + 8 * z);
                                 d[vals + (i >>> 5)] |= (1 << (i & 31)); };
      for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) set(x, y, 0);
      const m0 = UJ.segread._planeMatch(d.buffer, [8, 8, 8], [8, 8, 8], 0, 2, [want]);
      const m1 = UJ.segread._planeMatch(d.buffer, [8, 8, 8], [8, 8, 8], 1, 2, [want]);
      const other = UJ.segread._planeMatch(d.buffer, [8, 8, 8], [8, 8, 8], 0, 2,
                                           [UJ.segpaint.idPair("12345")]);
      /* bits === 0: the whole block is one value, and one lookup has to answer all 64 voxels. */
      const e = new Uint32Array(5);
      e[0] = 1; e[1] = 0; e[2] = 0;               // bits 0, table at channel-relative 0 -> word 1
      e[1] = (0 << 24) | (3 - 1);                 // table at word 3
      e[2] = 0;
      e[3] = want.lo; e[4] = want.hi;
      const flat = UJ.segread._planeMatch(e.buffer, [8, 8, 8], [8, 8, 8], 3, 2, [want]);
      const count = (m) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; };
      return { n0: count(m0), n1: count(m1), nOther: count(other), nFlat: count(flat),
               corner: m0[2 + 8 * 2], outside: m0[0], edge: m0[6 + 8 * 2],
               which: m0[3 + 8 * 3] };
    });
    ok(got.n0 === 16, "the 16 voxels that carry the id are the 16 it finds", got.n0);
    ok(got.corner === 1 && got.which === 1,
       "...marked 1-based into the wanted list, so two ids can share one pass", got.which);
    ok(got.outside === 0 && got.edge === 0, "...and nothing beside them");
    ok(got.n1 === 0, "a different z in the same chunk is a different plane", got.n1);
    ok(got.nOther === 0, "an id that is not in the block is not found", got.nOther);
    ok(got.nFlat === 64, "a single-valued block answers all 64 of its voxels at once", got.nFlat);
  }

  console.log("\nthe scale it reads at is the coarsest one that is still not coarser than the screen");
  {
    const s = await p.evaluate(() => {
      const info = { scales: [
        { resolution: [8, 8, 40], size: [100, 100, 100], key: "8_8_40" },
        { resolution: [16, 16, 40], size: [50, 50, 100], key: "16_16_40" },
        { resolution: [32, 32, 40], size: [25, 25, 100], key: "32_32_40" },
        /* z coarsens here: a "section" becomes an averaged slab and its index stops meaning the
           tool's z, which is why this one must never be chosen. */
        { resolution: [64, 64, 80], size: [13, 13, 50], key: "64_64_80" }
      ] };
      return { at8: UJ.segpaint.pickScale(info, 8).key,
               at16: UJ.segpaint.pickScale(info, 16).key,
               at20: UJ.segpaint.pickScale(info, 20).key,
               at999: UJ.segpaint.pickScale(info, 999).key,
               at2: UJ.segpaint.pickScale(info, 2).key };
    });
    ok(s.at8 === "8_8_40" && s.at16 === "16_16_40",
       "an exact match is taken, not the one below it", s.at8 + " / " + s.at16);
    ok(s.at20 === "16_16_40", "...and between two levels, the finer one", s.at20);
    ok(s.at999 !== "64_64_80",
       "a very coarse screen still never gets a level whose z is a slab", s.at999);
    ok(s.at2 === "8_8_40", "...and magnified past the data, the finest there is", s.at2);
  }

  /* ── THE BLEND, ON A REAL CANVAS ─────────────────────────────────────────────────────────────
     One voxel per pixel, so a pixel that should be tinted has an exact address and a wrong offset
     by one shows up. The chunk reader and the info fetch are the only stubs. */
  console.log("\nthe blend: the right pixels, the right colours, the EM left alone elsewhere");
  {
    const px = await p.evaluate(async () => {
      const ID = "864691135499287571", NID = "264317";
      const build = (idStr, words) => {
        const want = UJ.segpaint.idPair(idStr);
        const chan = 1, hdr = 1, table = 3, vals = table + 2 * words;
        const d = new Uint32Array(vals + 16);
        d[0] = chan;
        d[hdr] = (1 << 24) | (table - chan);
        d[hdr + 1] = (vals - chan);
        if (words === 1){ d[table] = 0; d[table + 1] = want.lo; }
        else { d[table] = 0; d[table + 1] = 0; d[table + 2] = want.lo; d[table + 3] = want.hi; }
        const set = (x, y) => { const i = x + 8 * y; d[vals + (i >>> 5)] |= (1 << (i & 31)); };
        for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) set(x, y);
        return d.buffer;
      };
      const cellBuf = build(ID, 2), nucBuf = build(NID, 1);

      const info = (dt) => ({ data_type: dt, scales: [{ resolution: [8, 8, 40],
        size: [8, 8, 8], key: "8_8_40", chunk_sizes: [[8, 8, 8]], voxel_offset: [0, 0, 0],
        compressed_segmentation_block_size: [8, 8, 8] }] });
      UJ.segread._getInfo = async (base) => info(/nucle/i.test(base) ? "uint32" : "uint64");
      UJ.segread._chunkBuf = async (base) => (/nucle/i.test(base) ? nucBuf : cellBuf);
      UJ.segpaint.configure({ seg: "https://example/seg", nuc: "https://example/nuclei",
                              res: [4, 4, 40] });

      const cv = document.createElement("canvas");
      cv.width = 16; cv.height = 16;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "rgb(128,128,128)"; ctx.fillRect(0, 0, 16, 16);
      /* effNmPerPx 8 against an 8 nm volume: one voxel is one pixel, so voxel (2,2) is pixel
         (2,2) and an off-by-one is visible rather than plausible. */
      const view = { w: 16, h: 16, effNmPerPx: 8, z: 0, toolAt: () => [0, 0, 0] };
      const out = await UJ.segpaint.paint(cv, view, { root: ID, nuc: NID, alpha: 0.5 });
      const at = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data;
                             return [d[0], d[1], d[2]]; };
      return { out: { ok: out.ok, painted: out.painted,
                      cell: out.cell && out.cell.painted, nuc: out.nucleus && out.nucleus.painted },
               inside: at(3, 3), outside: at(0, 0), justOut: at(6, 3), lastIn: at(5, 5) };
    });
    ok(px.out.ok && px.out.painted > 0, "it paints", JSON.stringify(px.out));
    ok(px.outside.join(",") === "128,128,128",
       "the EM is untouched where the cell is not", px.outside.join(","));
    ok(px.justOut.join(",") === "128,128,128",
       "...including the pixel just past its edge, so nothing is off by one", px.justOut.join(","));
    /* Cell magenta then nucleus blue at alpha 0.5 over grey: the nucleus is painted second and
       wins where they overlap, which is the right order — a nucleus is inside its cell. */
    ok(px.inside.join(",") !== "128,128,128" && px.inside[2] > px.inside[1],
       "and where the cell and its nucleus are, the blue is on top", px.inside.join(","));
    ok(px.lastIn.join(",") !== "128,128,128",
       "the far corner of the square is painted too", px.lastIn.join(","));
    ok(px.out.cell === px.out.nuc && px.out.cell === 16,
       "each volume painted its own 16 voxels", px.out.cell + " / " + px.out.nuc);
  }

  console.log("\nand a cell the segmentation has not got is an answer, not a failure");
  {
    const none = await p.evaluate(async () => {
      UJ.segread._chunkBuf = async () => null;      // cloud-volume never wrote an empty block
      const cv = document.createElement("canvas");
      cv.width = 16; cv.height = 16;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "rgb(128,128,128)"; ctx.fillRect(0, 0, 16, 16);
      const view = { w: 16, h: 16, effNmPerPx: 8, z: 0, toolAt: () => [0, 0, 0] };
      const out = await UJ.segpaint.paint(cv, view, { root: "864691135499287571" });
      const d = ctx.getImageData(3, 3, 1, 1).data;
      return { ok: out.ok, painted: out.painted, pixel: [d[0], d[1], d[2]].join(",") };
    });
    ok(none.ok === true && none.painted === 0,
       "a missing chunk is background, not an error — and the count says so",
       JSON.stringify(none));
    ok(none.pixel === "128,128,128", "...and the section is left exactly as it was", none.pixel);
  }

  console.log("\nno ids, nothing painted, and it says which");
  {
    const bare = await p.evaluate(async () => {
      const cv = document.createElement("canvas");
      cv.width = 8; cv.height = 8;
      const view = { w: 8, h: 8, effNmPerPx: 8, z: 0, toolAt: () => [0, 0, 0] };
      const out = await UJ.segpaint.paint(cv, view, {});
      return out;
    });
    ok(bare.ok === false && /no root ID or nucleus ID/.test(bare.why),
       "with neither id it declines and says so rather than fetching", bare.why);
  }

  /* ── WHAT IT DID, WHERE A TOAST CANNOT WIPE IT ───────────────────────────────────  2026-09-18
     Søren: *"I got this error message, and the segmentation would not load."* The error was about a
     volume save — an unrelated request — and it landed in the pad's shared status line, which is
     where the overlay had been saying what it did. So whatever the tick had told him was gone
     before he could read it, and "would not load" was the only thing left to conclude. The overlay
     now has a line of its own, and says a number per volume: the difference between "not in this
     window" and "not in the segmentation at all" is the difference between a wrong coordinate and a
     cell that has to be traced by hand. */
  console.log("\nthe overlay says what it did, in its own line");
  {
    const say = await p.evaluate(async () => {
      const el = document.getElementById("tracePadSegSay");
      const status = document.getElementById("tracePadSay");
      const box = document.getElementById("tracePadSeg");
      const out = { own: !!el, separate: !!(el && status && el !== status) };
      /* No ids: the one case that used to write into the status line and be overwritten. */
      document.getElementById("tracingRootId").value = "";
      document.getElementById("tracingNucId").value = "";
      box.checked = true;
      window.PAD_VIEW = { w: 8, h: 8, effNmPerPx: 8, z: 0, toolAt: () => [0, 0, 0] };
      await padSegOverlay();
      out.noIds = el.textContent;
      /* Now with an id, against a volume that has nothing there. */
      UJ.segread._getInfo = async () => ({ data_type: "uint64", scales: [{ resolution: [8, 8, 40],
        size: [8, 8, 8], key: "8_8_40", chunk_sizes: [[8, 8, 8]], voxel_offset: [0, 0, 0],
        compressed_segmentation_block_size: [8, 8, 8] }] });
      UJ.segread._chunkBuf = async () => null;
      UJ.segpaint.configure({ seg: "https://example/seg", nuc: "https://example/nuclei",
                              res: [4, 4, 40] });
      document.getElementById("tracingRootId").value = "864691134517067096";
      const cv = document.getElementById("tracePad");
      cv.width = 8; cv.height = 8;
      await padSegOverlay();
      out.empty = el.textContent;
      out.emptyBad = el.style.color;
      /* And the tick turned off clears its own line rather than leaving a stale sentence. */
      box.checked = false;
      await padSegOverlay();
      out.off = el.textContent;
      return out;
    });
    ok(say.own && say.separate,
       "the segmentation has a line of its own, not the one every toast writes to");
    ok(/root ID or nucleus ID/.test(say.noIds),
       "with no ids it says which box to fill, and stays said", say.noIds.slice(0, 80));
    ok(/864691134517067096/.test(say.empty) && /nothing here/.test(say.empty),
       "when the volume has nothing there it says so, per volume, with the id",
       say.empty.slice(0, 110));
    ok(/hand tracing/.test(say.empty),
       "...and names the reason that matters: a cell the segmentation has not got");
    ok(say.emptyBad !== "", "...marked as the answer it is", say.emptyBad || "(not marked)");
    ok(say.off === "", "and unticking clears it rather than leaving a stale sentence",
       JSON.stringify(say.off));
  }

  ok(errors.length === 0, "no script errors", errors.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
