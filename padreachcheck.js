/* The pad reaches as far as the volume's single-section levels go.                    2026-09-21

   Søren, on ηJump: "Things are just bigger in the human, so the maximum 12 µm across is too small".
   The pad's zoom menu is six fixed levels, mip 2 at its widest -- minnie65's 32 nm, but on H01,
   whose levels are 4 / 8 / 16 / 32 nm, only 16 nm. Every level that still keeps one section is
   offered now, so H01 gets its 32 nm (twice as wide), and µJump's menu, whose next level is a slab,
   is unchanged.

   Run: node padreachcheck.js [page.html]      (default hjump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "hjump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
/* H01's EM levels, as emhjumpcheck.js serves them: 4/8/16/32 nm at 33 nm sections, 64 nm a slab. */
const LV = [[4, 33, [1031784, 712800, 5293], [128, 128, 16]], [8, 33, [515892, 356400, 5293], [128, 128, 32]],
            [16, 33, [257946, 178200, 5293], [128, 128, 64]], [32, 33, [128973, 89100, 5293], [64, 64, 64]],
            [64, 66, [64487, 44550, 2647], [64, 64, 64]]];
const H01 = { type: "image", data_type: "uint8", num_channels: 1, scales: LV.map(([r, z, size, ch]) => ({
  key: r.toFixed(1) + "x" + r.toFixed(1) + "x" + z.toFixed(1), resolution: [r, r, z], size, chunk_sizes: [ch], encoding: "jpeg",
  sharding: { "@type": "neuroglancer_uint64_sharded_v1", hash: "identity", preshift_bits: 0, minishard_bits: 0, shard_bits: 0,
              data_encoding: null, minishard_index_encoding: "gzip" } })) };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**script.google.com/**", "**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**gstatic.com/**"])
    await p.route(h, r => r.abort());
  await p.route("**storage.googleapis.com/**", route => {
    const u = decodeURIComponent(route.request().url());
    if (/h01-release/.test(u) && /4nm_raw\/info/.test(u))
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(H01) });
    return route.abort();
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);
  const got = await p.evaluate(async () => {
    const r = await padRelabelMips();
    const o = [].slice.call(document.getElementById("tracePadMip").options);
    return { r, vals: o.map(x => x.value), labels: o.map(x => x.textContent) };
  });
  console.log(PAGE + "\n");
  if (PAGE === "hjump.html"){
    ok(got.vals[1] === "3:1", "the widest level drawn 1:1 is H01's 32 nm, the coarsest that keeps one section", got.vals.join(","));
    ok(/^18 µm — 32 nm data/.test(got.labels[1]), "...labelled with what it shows", got.labels[1]);
    /* 2026-09-22, from a phone: "This is still too small to segment the cell, we need a larger view also". */
    ok(got.vals[0] === "3:0.5", "above it, the same level drawn at half size", got.vals[0]);
    ok(/^36 µm across — 32 nm data, drawn half size/.test(got.labels[0]), "...36 µm across on a 560 px pad", got.labels[0]);
    const phone = await p.evaluate(async () => {
      document.getElementById("tracePad").width = 320;
      await padRelabelMips();
      const o = [].slice.call(document.getElementById("tracePadMip").options);
      return { vals: o.map(x => x.value), labels: o.map(x => x.textContent) };
    });
    ok(/^20 µm across/.test(phone.labels[0]) && phone.vals.filter(v => v === "3:0.5").length === 1,
       "...20 µm on a 320 px phone pad, and a relabel does not add it twice", phone.labels[0] + " / " + phone.vals.join(","));
    const drawn = await p.evaluate(async () => {
      document.getElementById("tracingPanel").open = true;
      PAD = UJ.tracepad.create();
      document.getElementById("tracePadWrap").style.display = "";
      document.getElementById("tracePadMip").value = "3:0.5";
      PAD_CENTRE = [100000, 80000, 2000];
      try { await padDraw(); } catch (e){ return { err: String(e) }; }
      return PAD_VIEW ? { zoom: PAD_VIEW.zoom, um: PAD_VIEW.umAcross, w: PAD_VIEW.w, vw: PAD_VIEW.vw } : { err: "no view" };
    });
    ok(drawn.zoom === 0.5 && drawn.vw === drawn.w * 2, "the pad draws at half size", JSON.stringify(drawn));
    ok(!got.vals.includes("4:1"), "...and not the 64 nm slab", got.vals.join(","));
  } else {
    /* Only H01's info is served here; on another page the volume is unread and the menu is the
       fixed six, which proves nothing either way. */
    ok(true, "(only hjump.html's volume is served by this check)");
  }
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
