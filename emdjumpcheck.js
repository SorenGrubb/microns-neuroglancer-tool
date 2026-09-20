/* δJump can draw its own EM, and skips the level that is not there.                 2026-09-20

   First slice of the tracing card's port to δJump, and emljumpcheck.js's sibling. The pad draws
   one section of EM *in the page*, so before any of the card exists the page has to be able to
   fetch and stretch its own imagery — the part most likely to be quietly wrong, because it depends
   on a bucket, a scale list, a chunk layout and two contrast numbers, none of which this repo
   controls.

   WHAT WAS MEASURED LIVE, from grubblab.com, before any of this was written:

     - `gs://v1dd_imagery/image/aligned_image` is raw, uint8, 1 channel, UNSHARDED, eight scales;
     - the FIRST of those, `key: "placeholder"` at 4.85 nm with a 2048×2048×128 chunk, returns
       **404 at its own voxel_offset and 404 at the origin** — an entry with no bytes behind it;
     - `9.7_9.7_45` returns a full 262,144-byte chunk at 16 positions spread across the tissue;
     - the sections are **45 nm**, not 40, and four scales keep them.

   THE TRAP THIS CHECK EXISTS FOR. The placeholder's z is 45 nm, the same as the real scales, so
   emtiles' "only levels that keep a section" filter cannot tell it apart — and since the index IS
   the mip, δJump's mip 0 would be the dead level and every draw would come back blank, exactly the
   way πJump fails. The page names it through skipScales; nothing else can.

   THIS CHECK CANNOT REACH THAT BUCKET — the sandbox has no egress, and a check that needed one
   would be a check that fails on a train. So the network is answered from the real volume's
   measured shape: the same info file, the placeholder 404ing the way it really does, and chunks of
   the right size full of plausible bytes. What is under test is the PAGE.

   Run: node emdjumpcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* V1DD's real info, read from the bucket on 2026-09-20 — ALL EIGHT SCALES, placeholder first,
   because the whole point is what happens to the first one. Trimming it would test a volume this
   page will never meet. */
const INFO = { type: "image", data_type: "uint8", num_channels: 1, scales: [
  { key: "placeholder",    resolution: [4.85, 4.85, 45],   size: [573952, 573952, 17664],
    voxel_offset: [-17408, -17408, 0], chunk_sizes: [[2048, 2048, 128]], encoding: "raw" },
  { key: "9.7_9.7_45",     resolution: [9.7, 9.7, 45],     size: [286976, 286976, 17664],
    voxel_offset: [-8704, -8704, 0],   chunk_sizes: [[128, 128, 16]],    encoding: "raw" },
  { key: "19.4_19.4_45",   resolution: [19.4, 19.4, 45],   size: [143488, 143488, 17664],
    voxel_offset: [-4352, -4352, 0],   chunk_sizes: [[64, 64, 64]],      encoding: "raw" },
  { key: "38.8_38.8_45",   resolution: [38.8, 38.8, 45],   size: [71744, 71744, 17664],
    voxel_offset: [-2176, -2176, 0],   chunk_sizes: [[64, 64, 64]],      encoding: "raw" },
  { key: "77.6_77.6_45",   resolution: [77.6, 77.6, 45],   size: [35872, 35872, 17664],
    voxel_offset: [-1088, -1088, 0],   chunk_sizes: [[64, 64, 64]],      encoding: "raw" },
  { key: "155.2_155.2_90", resolution: [155.2, 155.2, 90], size: [17936, 17936, 8832],
    voxel_offset: [-544, -544, 0],     chunk_sizes: [[128, 128, 64]],    encoding: "raw" },
  { key: "310.4_310.4_180", resolution: [310.4, 310.4, 180], size: [8968, 8968, 4416],
    voxel_offset: [-272, -272, 0],     chunk_sizes: [[128, 128, 64]],    encoding: "raw" },
  { key: "620.8_620.8_360", resolution: [620.8, 620.8, 360], size: [4484, 4484, 2208],
    voxel_offset: [-136, -136, 0],     chunk_sizes: [[128, 128, 64]],    encoding: "raw" }
] };

/* A real nucleus coordinate from δJump's own browse button, in its 9/9/45 voxel frame. Used
   rather than the volume's nominal centre because the nominal centre is padding: the first
   sampling run picked coordinates off `size` and hit empty chunks eight times out of nine. */
const CELL = [70556, 70763, 10196];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**script.google.com/**", "**accounts.google.com/**",
                   "**cdnjs.cloudflare.com/**", "**api.em.brain.allentech.org/**"])
    await p.route(h, r => r.abort());

  /* The volume, answered locally. The placeholder 404s exactly as it does live, so a page that
     forgot skipScales fails here the way it would fail in a browser rather than passing quietly. */
  let chunkHits = 0, placeholderHits = 0;
  await p.route("**storage.googleapis.com/v1dd_imagery/image/**", route => {
    const u = route.request().url();
    if (/\/info$/.test(u))
      return route.fulfill({ status: 200, contentType: "application/json",
                             body: JSON.stringify(INFO) });
    if (/\/placeholder\//.test(u)) { placeholderHits++; return route.fulfill({ status: 404, body: "" }); }
    const m = /\/(\d[\d.]*_[\d.]+_\d+)\//.exec(u);
    const sc = INFO.scales.find(s => s.key === (m && m[1]));
    if (!sc) return route.fulfill({ status: 404, body: "" });
    chunkHits++;
    const ch = sc.chunk_sizes[0], n = ch[0] * ch[1] * ch[2];
    const buf = Buffer.allocUnsafe(n);
    /* A gradient across x, so a wrongly-stretched canvas is visibly different from a correctly
       stretched one rather than being grey either way.

       IT HAS TO CROSS THIS DATASET'S WINDOW. Written first as `i % chunkWidth`, which is 0-63 at
       the two coarse levels — every value below lo=115, so the whole canvas clamped to black and
       the draw looked like a volume of 404s. A stub whose values sit outside the window under
       test cannot show the difference between a correct draw and no draw at all. 100-159 spans
       115-144 at every chunk width, and is about where V1DD's real tissue lives (60-173). */
    for (let i = 0; i < n; i++) buf[i] = 100 + ((i % ch[0]) % 60);
    return route.fulfill({ status: 200, contentType: "application/octet-stream", body: buf });
  });
  /* ── THE NUCLEUS VOLUME, ANSWERED LOCALLY ────────────────  2026-09-20
     Its real shape, from djump.html's own note: uint32, mip 0 at 77.6×77.6×45 nm,
     23232×14784×17600, offset 1143/1872/17. Every chunk comes back filled with the id of the
     cell this check shows, so a correct read paints and a wrong grid paints nothing — which is
     the whole question on a page whose frame (9/9/45), imagery (9.7) and nucleus volume (77.6)
     are three different grids that have to agree through nanometres. */
  const NUC_INFO_STUB = { type: "segmentation", data_type: "uint32", num_channels: 1, scales: [
    { key: "77.6_77.6_45.0", resolution: [77.6, 77.6, 45], size: [23232, 14784, 17600],
      voxel_offset: [1143, 1872, 17], chunk_sizes: [[256, 256, 256]],
      encoding: "compressed_segmentation", compressed_segmentation_block_size: [64, 64, 64] } ] };
  /* WHAT THIS STUB CANNOT DO, AND WHY THAT IS SAID HERE RATHER THAN PAPERED OVER.
     The real volume is compressed_segmentation, and writing an encoder for it to satisfy a test
     would be more code than the feature. So these chunks are NOT decodable: the overlay fetches
     them, fails to find the id, and reports "the nucleus is not on this plane" — which is the
     honest answer for a plane that does not contain it, and is what this asserts.

     THE PAINT ITSELF WAS MEASURED AGAINST THE REAL BUCKET, in Søren's browser on 2026-09-20,
     driving this exact path — emtiles.drawSection then segpaint.paint with seg:"" — on the
     5P-ET cell at 95086/88093/6130:

         nucleus 308149, 248×134 at 77.6 nm/px, z 6130
         painted 8,512 px from 2 chunks

     A first version of this stub said 64³ chunks and "raw", which was wrong three ways (key,
     chunk size, encoding) and produced one fetch and nothing painted. A stub that misdescribes
     the volume tests a volume nobody has. */
  let nucPaintId = 0, nucChunkHits = 0;
  await p.route("**storage.googleapis.com/v1dd_imagery/v1dd_nuclei/**", route => {
    const u = route.request().url();
    if (/\/info$/.test(u))
      return route.fulfill({ status: 200, contentType: "application/json",
                             body: JSON.stringify(NUC_INFO_STUB) });
    nucChunkHits++;
    const n = 64 * 64 * 64;
    const buf = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) buf.writeUInt32LE(nucPaintId >>> 0, i * 4);
    return route.fulfill({ status: 200, contentType: "application/octet-stream", body: buf });
  });

  await p.goto("file://" + page_("djump.html"));
  await p.waitForTimeout(6000);

  console.log("djump.html\n\nthe page carries the stack the pad is built from");
  {
    const got = await p.evaluate(() => ({
      mods: ["segread", "segpaint", "organellelink", "emtiles", "tracepad", "traceloft",
             "nucmesh", "tracing"].filter(m => !!(window.UJ && UJ[m])),
      emtiles: !!(window.UJ && UJ.emtiles && UJ.emtiles.drawSection),
      conf: typeof emConfigure === "function",
      win: typeof EM_WINDOW !== "undefined" ? EM_WINDOW : null,
      shader: typeof EM_SHADER_CONTROLS !== "undefined"
              ? EM_SHADER_CONTROLS.normalized.range : null
    }));
    ok(got.mods.length === 8, "all eight tracing modules are loaded",
       got.mods.length + ": " + got.mods.join(", "));
    ok(got.emtiles, "...and emtiles can draw a section", got.emtiles);
    ok(got.conf, "...and the page has one place that points the reader at its dataset", got.conf);
    /* ONE WINDOW PER DATASET. Søren tuned 115–144 against this EM in Spelunker on 2026-08-20 and
       every viewer link this page builds uses it; the pad reads the same object, so the section
       drawn here and the section drawn there cannot drift apart. */
    ok(got.win && got.shader && got.win.lo === got.shader[0] && got.win.hi === got.shader[1],
       "...and the pad's window IS the one the viewer links use, not a second opinion",
       got.win ? got.win.lo + "–" + got.win.hi + " from EM_SHADER_CONTROLS " + got.shader.join("–")
               : "(none)");
    ok(got.win && got.win.lo === 115 && got.win.hi === 144,
       "...which is Søren's tuned 115–144", got.win ? got.win.lo + "–" + got.win.hi : "(none)"
       + "  <- emtiles defaults to minnie65's 86–172; V1DD's tissue spans about 38 levels");
  }

  console.log("\nand mip 0 is a level that serves bytes");
  {
    const got = await p.evaluate(async () => {
      if (!emConfigure()) return { err: "emConfigure said no" };
      const out = {};
      for (const m of [0, 1, 2, 3, 9]) {
        const s = await UJ.emtiles.scaleAt(m);
        out["mip" + m] = { key: s.scale.key, nm: s.scale.resolution[0],
                           sectionNm: s.sectionNm, slab: s.slab, count: s.count };
      }
      return out;
    });
    ok(!got.err, "emConfigure answered", got.err || "yes");
    if (!got.err) {
      /* THE ONE THAT MATTERS. Unskipped, mip 0 is the placeholder, every chunk 404s and the pad
         draws a flat grey rectangle with nothing in the console to say why. */
      ok(got.mip0.key === "9.7_9.7_45",
         "mip 0 is the real finest level, not the placeholder", got.mip0.key
         + "  <- its z is 45 nm like the real scales, so only the page can know it is empty");
      ok(got.mip1.key === "19.4_19.4_45" && got.mip2.key === "38.8_38.8_45",
         "...and the levels above it follow", got.mip1.key + ", " + got.mip2.key);
      ok(got.mip0.count === 4, "...four levels keep a section, out of eight in the file",
         got.mip0.count);
      ok(got.mip9.key === "77.6_77.6_45",
         "...and asking past the end gives the coarsest that is still one section", got.mip9.key);
      /* 45 nm, not 40. Every caption that says "one 40 nm section" is µJump's sentence. */
      ok(got.mip0.sectionNm === 45 && got.mip0.slab === 1,
         "...and a section here is 45 nm, one plane deep",
         got.mip0.sectionNm + " nm, slab " + got.mip0.slab);
    }
  }

  console.log("\nand it draws this dataset, at a coordinate that has tissue in it");
  {
    const got = await p.evaluate(async (CELL) => {
      if (!emConfigure()) return { err: "emConfigure said no" };
      const cv = document.createElement("canvas");
      cv.width = 400; cv.height = 300;
      let view = null, err = null;
      try {
        view = await UJ.emtiles.drawSection(cv, {
          centre: CELL, w: 400, h: 300, mip: 0, lo: EM_WINDOW.lo, hi: EM_WINDOW.hi });
      } catch (e) { err = String(e.message || e).slice(0, 140); }
      if (err) return { err };
      const d = cv.getContext("2d").getImageData(0, 0, 400, 300).data;
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; }
      return { mip: view.mip, nm: view.nmPerPx || view.nm, min, max };
    }, CELL);
    ok(!got.err, "a section draws", got.err || "no error");
    if (!got.err) {
      ok(got.nm === 9.7, "...at 9.7 nm, which is mip 0 once the placeholder is gone", got.nm + " nm");
      /* A volume whose chunks all 404 draws one flat value, and nothing says so. That is exactly
         what δJump would have done at mip 0 without skipScales. */
      ok(got.min !== got.max, "...with real pixels on it, not a uniform fill", got.min + "–" + got.max);
      ok(chunkHits > 0, "...fetched by name, which is the unsharded path", chunkHits + " chunks");
      ok(placeholderHits === 0, "...and nothing was ever asked of the dead level", placeholderHits
         + " requests  <- a skip that only filtered the menu would still fetch from it");
    }
  }

  console.log("\nand the window it passes is the one that reaches the canvas");
  {
    /* Drawing the same data twice, once with this page's numbers and once with the shared default,
       must not produce the same canvas — if it does, the page is not passing anything and nobody
       would see an error. */
    const got = await p.evaluate(async (CELL) => {
      const draw = async opts => {
        const cv = document.createElement("canvas");
        cv.width = 200; cv.height = 150;
        await UJ.emtiles.drawSection(cv, Object.assign(
          { centre: CELL, w: 200, h: 150, mip: 0 }, opts));
        const d = cv.getContext("2d").getImageData(0, 0, 200, 150).data;
        let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { sum += d[i]; n++; }
        return Math.round(sum / n);
      };
      return { ours: await draw({ lo: EM_WINDOW.lo, hi: EM_WINDOW.hi }), theirs: await draw({}) };
    }, CELL);
    ok(got.ours !== got.theirs,
       "this page's window changes the picture, so it is really being used",
       "ours " + got.ours + " vs the shared default " + got.theirs);
  }

  /* ── THE TRACING CARD ─────────────────────────────────────────────────────  2026-09-20
     Stage E. λJump proved the shared card works for a host that has LESS than µJump; δJump is the
     opposite edge — it has nearly all of it, and what is asserted here is that the module's
     DEFAULTS are still right when the host can answer. Two ticks, one kept and one removed, in
     one dataset: that pair is the whole test. */
  console.log("\nand it carries the shared tracing card");
  {
    const got = await p.evaluate(() => ({
      wrapper: !!document.getElementById("tracingCard"),
      filled: !!(document.getElementById("tracingCard") || {}).firstElementChild,
      wired: !!(window.UJ && UJ.tracingcard && UJ.tracingcard._wired),
      pad: !!document.getElementById("tracePad"),
      keys: [TRACING_KEY, TRACING_DRAFTS_KEY, TRACING_DRAFT_KEY, TRACING_PEN_KEY],
      src: (function(){ try { return tracingSources(); } catch (e){ return { err: String(e) }; } })(),
      segTick: !!document.getElementById("tracePadSeg"),
      segSay: !!document.getElementById("tracePadSegSay"),
      ghosts: !!document.getElementById("tracePadGhosts"),
      pasteGhosts: !!document.getElementById("tracingPasteGhosts"),
      meshBase: !!(UJ.cfg.mesh && (UJ.cfg.mesh.meshBase || UJ.cfg.mesh.meshBaseAlt)),
      /* A real nucleus id out of this page's own table, so the identity lookup is asked a
         question it can actually answer. */
      ident: (function(){
        try { return tracingIdentityFor(String(NID[0]), ""); }
        catch (e){ return "threw: " + e; }
      })(),
      hook: !!(UJ.cfg.tracing && UJ.cfg.tracing.identityFor),
      mips: [...document.querySelectorAll("#tracePadMip option")].map(o => o.textContent)
    }));
    ok(got.wrapper && got.filled, "the module built the card into δJump's wrapper",
       got.wrapper + "/" + got.filled);
    ok(got.wired && got.pad, "...and wired it, so the pad is a pad", got.wired + "/" + got.pad);
    ok(got.keys.every(k => /^djump_/.test(k)),
       "...reading and writing δJump's own storage, not µJump's", got.keys.join(", "));

    /* THE SOURCES, AND THE ONE FIELD THAT HAD TO TRAVEL WITH THEM. The card configures emtiles
       itself in four places when it finds it unconfigured; if skipScales did not come through,
       whether mip 0 was the dead level would depend on whether the cell card or the pad got
       there first. */
    ok(got.src && got.src.em === "precomputed://gs://v1dd_imagery/image/aligned_image" && !got.src.seg,
       "...pointed at V1DD's imagery, with no segmentation to point at",
       JSON.stringify({ em: got.src.em, seg: got.src.seg, nuc: got.src.nuc }));
    ok(got.src && (got.src.skipScales || []).indexOf("placeholder") >= 0,
       "...and carrying the skip, so the pad cannot configure the reader onto the dead level",
       JSON.stringify(got.src && got.src.skipScales));

    /* ONE TICK GOES AND ONE STAYS, on the same page, for measured reasons. */
    ok(!got.segTick && !got.segSay,
       "the segmentation tick is gone — V1DD's is graphene behind a CAVE login, not a volume "
       + "segread can read", "tick " + got.segTick + ", its status line " + got.segSay);
    ok(got.meshBase && got.ghosts && got.pasteGhosts,
       "...while the see-through cell STAYS, because the meshes are public",
       "meshBase " + got.meshBase + ", pad tick " + got.ghosts + ", paste tick " + got.pasteGhosts
       + "  <- only the root→fragment manifest needs a token, and so does this page's 3D already");

    /* NO HOOK, AND AN ANSWER ANYWAY. δJump's tables are named what the module already reads. */
    ok(!got.hook, "no identityFor hook is configured", got.hook);
    ok(got.ident && typeof got.ident === "object" && got.ident.nucleusId,
       "...and the module's own body identifies a δJump cell from δJump's tables",
       JSON.stringify(got.ident).slice(0, 120));

    /* 9.7 nm, not 8 — and 38.8 at the top, where µJump has 32. Every one of the six labels was
       minnie65's until padRelabelMips computed them from this volume's scale list. */
    ok(/^22 µm across — 38.8 nm data/.test(got.mips[0] || ""),
       "the widest zoom level says what this volume actually is", got.mips[0]);
    ok(/^11 µm — 19.4 nm data/.test(got.mips[1] || "")
       && /^5\.4 µm — 9\.7 nm data/.test(got.mips[2] || ""),
       "...and so do the rest", (got.mips[1] || "") + " | " + (got.mips[2] || ""));
    /* ", slower to load" is a claim about minnie65's chunk geometry — 64 px wide at 32 nm against
       128 at 16. V1DD chunks 64 at both of its coarse levels, so the widest view is not slower. */
    ok(!/slower to load/.test(got.mips[0] || ""),
       "...without µJump's warning about chunk counts, which is not true here", got.mips[0]);
  }

  console.log("\nand the pad opens on a real cell and draws it");
  {
    const got = await p.evaluate(async (CELL) => {
      document.getElementById("tracingPanel").open = true;
      document.getElementById("tracingX").value = String(CELL[0]);
      document.getElementById("tracingY").value = String(CELL[1]);
      document.getElementById("tracingZ").value = String(CELL[2]);
      document.getElementById("tracePadOpen").click();
      await new Promise(r => setTimeout(r, 7000));
      const cv = document.getElementById("tracePad");
      let min = 255, max = 0;
      if (cv) {
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; }
      }
      return { open: document.getElementById("tracePadWrap").style.display !== "none",
               z: (document.getElementById("tracePadZ") || {}).textContent, min, max,
               asked: (typeof PAD_VIEW !== "undefined" && PAD_VIEW) ? PAD_VIEW.windowAsked : null,
               intro: (typeof tracingIntro === "function") ? tracingIntro() : null,
               cvWidth: (document.getElementById("tracePad") || {}).width || null,
               menuUm: (function(){ const o = document.querySelector("#tracePadMip option:checked");
                 const m = o && /^([\d.]+) \u00b5m/.exec(o.textContent); return m ? +m[1] : null; })(),
               capUm: (function(){ const el = document.getElementById("tracePadZ");
                 const m = el && /([\d.]+) \u00b5m across/.exec(el.textContent); return m ? +m[1] : null; })() };
    }, CELL);
    ok(got.open, "the pad opens", got.open);
    /* 19.4 nm because the menu's SELECTED option is "1:1", one level above the finest — µJump's
       same default, and on this volume it puts about 14 µm across the pad, which is a soma. The
       number is this dataset's own: µJump's mip 1 is 16 nm and λJump's is 8. */
    ok(/19\.4 nm data/.test(got.z || "") && new RegExp("z " + CELL[2]).test(got.z || ""),
       "...at the coordinate it was given, on this volume's own default level", got.z);
    ok(got.min !== got.max, "...with a real section drawn on it", got.min + "–" + got.max);
    /* ── THE MENU AND THE CAPTION DESCRIBE THE SAME PICTURE ──────  2026-09-20
       They did not. padRelabelMips ran only at mount, where the pad is display:none and the
       canvas still has the 560 the markup gives it; the pad then sizes itself to the card. Menu
       "11 µm", caption "13.9 µm across", one picture. Both are computed now, from the width the
       draw actually used, so they agree at any window size — which is why this compares them to
       each other rather than to a number written here. */
    ok(got.menuUm !== null && got.capUm !== null && Math.abs(got.menuUm - got.capUm) <= 0.6,
       "...and the zoom menu says the width the pad really drew",
       "menu " + got.menuUm + " µm vs caption " + got.capUm + " µm, canvas " + got.cvWidth + " px");
    /* ── STRETCHED WITH V1DD's WINDOW, NOT minnie65's ──────────  2026-09-20
       The pad's drawSection call passed no lo and no hi until today, so every dataset got
       emtiles' 86/172. δJump's tissue lives in 115–144 — a band 29 levels wide sitting almost
       entirely INSIDE the old window, so the picture would have been washed out rather than
       clipped: the failure λJump made obvious would have been quiet here. Reading what the pad
       ASKED FOR, because EM_WINDOW was right on λJump the whole time and simply never arrived. */
    ok(got.intro && /CAVE token/.test(got.intro),
       "...and the card says why a visitor without a token traces every cell here", got.intro
       + "  <- a function, because with a token this page IS in \u00b5Jump's position");
    ok(got.asked && got.asked[0] === 115 && got.asked[1] === 144,
       "...stretched with V1DD's own window", JSON.stringify(got.asked)
       + "  <- emtiles' default 86–172 is three times as wide as this stain");
  }

  /* ── ONE PLANE OF THE EM ON THE CELL CARD ──────────────────  2026-09-20
     Søren: *"Looks great, but I don't see the EM preview in dJump."* Stage E gave the page the EM
     stack and the tracing card; the cell card itself still had no section on it. The block is
     λJump's, read out of its page rather than retyped, with a table of measured differences. */
  console.log("\nand the cell card shows one plane of it");
  {
    /* The id the card is about, read before it draws, so the stub above can fill its chunks with
       it. Painting a constant the page never asks for would prove only that bytes arrived. */
    nucPaintId = await p.evaluate(CELL => {
      /* showNucleus does exactly this: nearest() on the coordinate, then NID at that index. */
      try { return Number(NID[nearest(CELL[0], CELL[1], CELL[2]).i]) || 0; } catch (e) { return 0; }
    }, CELL);
    const got = await p.evaluate(async (CELL) => {
      showNucleus(CELL);
      await new Promise(r => setTimeout(r, 4500));
      const cv = document.getElementById("emPlaneCv");
      let stats = null;
      if (cv) {
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let min = 255, max = 0;
        for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; }
        stats = { w: cv.width, h: cv.height, min, max, title: cv.title,
                  scaleUm: cv.dataset ? cv.dataset.scaleUm : null };
      }
      return { box: !!document.getElementById("emPlaneBox"),
               tick: !!document.getElementById("emPlaneOn"),
               /* V1DD's segmentation is graphene behind a CAVE login, so there is no second tick
                  here any more than there is on λJump — for a different reason, same decision. */
               segTick: !!document.getElementById("emPlaneSeg"),
               segLabel: (function(){ const l = document.querySelector('label[for="emPlaneSeg"]');
                 return l ? l.textContent.trim() : null; })(),
               segKey: typeof EM_PLANE_SEG_KEY !== "undefined" ? EM_PLANE_SEG_KEY : null,
               segCfg: (function(){ try {
                 if (!UJ.segpaint.configured())
                   UJ.segpaint.configure({ seg: "", nuc: SRC.nuc, res: UJ.cfg.res });
                 /* read it back the way the draw would use it */
                 return { seg: "", nuc: SRC.nuc };
               } catch (e){ return { err: String(e).slice(0, 60) }; } })(),
               say: (document.getElementById("emPlaneSay") || {}).textContent,
               key: typeof EM_PLANE_KEY !== "undefined" ? EM_PLANE_KEY : null,
               stats };
    }, CELL);
    ok(got.box && got.tick, "the card carries the section, with its own switch",
       "box:" + got.box + " tick:" + got.tick);
    /* ── ONE OF THE TWO LAYERS µJUMP PAINTS ────────────────  2026-09-20
       Søren: *"The EM preview in dJump should also be able to show segmentation."* The port left
       the overlay out because V1DD's CELL segmentation is graphene behind a CAVE login — true,
       and it was only true of half of it. The NUCLEUS volume is plain public precomputed, and
       this page already hands it to the viewer as SRC.nuc.

       The tick says "nucleus", not "segmentation", because it paints one of the two layers and a
       control that overstates what it does is what this card has been removing all day. */
    ok(got.segTick, "the section can paint this cell's nucleus", got.segTick);
    ok(/nucleus/i.test(got.segLabel || "") && !/segmentation/i.test(got.segLabel || ""),
       "...and the tick says nucleus rather than segmentation, which is what it paints",
       JSON.stringify(got.segLabel));
    ok(got.segKey === "djump_panel_emseg", "...remembered under this page's own key", got.segKey);
    /* segpaint only reaches for CFG.seg when it is handed a `root`. Configured with seg:"" it
       cannot ask for the volume this dataset keeps behind a login, whatever it is passed. */
    ok(got.segCfg && got.segCfg.seg === "" && /v1dd_nuclei/.test(got.segCfg.nuc || ""),
       "...from the nucleus volume alone, with no cell segmentation configured at all",
       JSON.stringify(got.segCfg));
    ok(got.key === "djump_panel_emplane", "...remembered under this page's own key", got.key);
    if (!got.stats) { ok(false, "the canvas is there", "no #emPlaneCv"); }
    else {
      ok(got.stats.min !== got.stats.max, "...drawn, with real pixels on it",
         got.stats.min + "–" + got.stats.max);
      /* 248 px at 77.6 nm is 19.2 µm — the same tissue µJump shows, at the same ~15 chunks.
         300 px, λJump's number, would have been 23.3 µm and about 24. */
      ok(got.stats.w === 248 && got.stats.h === 134,
         "...248x134, which is 19.2 µm of tissue at this volume's 77.6 nm level",
         got.stats.w + "x" + got.stats.h
         + "  <- V1DD has no 64 nm level, so the pixel count moves instead of the mip");
      ok(/19\.2 µm across at 77\.6 nm\/px/.test(got.stats.title || ""),
         "...and says so", (got.stats.title || "").slice(0, 46));
      /* 45 nm, not 40, and still ONE section: all four usable V1DD levels keep 45 nm z. */
      ok(/One 45 nm section\./.test(got.stats.title || "")
         && !/averages/.test(got.stats.title || ""),
         "...one 45 nm section, with no slab caveat because none is true here",
         "  <- µJump must warn that its 64 nm level averages two 40 nm sections");
      ok(got.stats.scaleUm === "5", "...under a round scale bar", got.stats.scaleUm + " µm");
    }
    /* Either outcome is honest: nothing to say when the overlay is off or has painted, and
       "not on this plane" when it read the volume and this plane has no such voxel — which is
       what the undecodable stub above produces, and what a real off-plane cell produces too.
       What would NOT be honest is a silent canvas, and that is what this rules out. */
    ok(!got.say || /not on this plane/.test(got.say),
       "...and the section says nothing, or says honestly that the nucleus is elsewhere",
       JSON.stringify(got.say) + "  <- " + nucChunkHits + " nucleus chunk(s) fetched for id "
       + nucPaintId);
    ok(nucChunkHits > 0, "...having actually gone to the nucleus volume for it",
       nucChunkHits + " chunk(s)  <- an overlay that never fetches cannot be said to be off");

    /* ── WHERE IT SITS ────────────────────────────────  2026-09-20
       Søren, the moment he saw it live: *"This could be more compact."* It had been appended
       after the two-column block, so it landed under BOTH columns — a 688 px box around a 260 px
       canvas, with 428 px of empty row beside it, under a top view that already had 165 px of
       empty column beneath it. Two holes that fill each other.

       ASSERTED AS GEOMETRY rather than as markup, the way λJump's was: what was wrong is how it
       looked, and a selector would go on passing through any restyling that put the gap back. */
    const laid = await p.evaluate(() => {
      const box = document.getElementById("emPlaneBox");
      const panel = document.getElementById("nucpanel");
      const layer = [...panel.querySelectorAll("svg")]
                      .find(s => /Leptomeninges/.test(s.textContent || ""));
      const top = [...panel.querySelectorAll("svg")]
                    .find(s => /Top view/.test(s.textContent || ""));
      if (!box || !layer || !top) return { skip: !box ? "no emPlaneBox" : "no diagram" };
      const b = box.getBoundingClientRect(), l = layer.getBoundingClientRect(),
            t = top.getBoundingClientRect();
      return { boxLeft: Math.round(b.left), boxTop: Math.round(b.top),
               boxBottom: Math.round(b.bottom),
               layerRight: Math.round(l.right), layerBottom: Math.round(layer.parentNode.getBoundingClientRect().bottom),
               topLeft: Math.round(t.left), topBottom: Math.round(t.bottom) };
    });
    if (laid.skip) { ok(false, "the section's placement could be measured", laid.skip); }
    else {
      ok(laid.boxLeft >= laid.layerRight,
         "...beside the layer diagram, not underneath it",
         "section starts at " + laid.boxLeft + ", the layers end at " + laid.layerRight);
      ok(laid.boxTop >= laid.topBottom,
         "...stacked under the top view, in its column",
         "section top " + laid.boxTop + " vs top view bottom " + laid.topBottom);
      /* The point of stacking it there: the right column now ends where the left one does
         instead of 175 px further down the page. 40 px of slack for font metrics. */
      ok(Math.abs(laid.boxBottom - laid.layerBottom) < 40,
         "...so the two columns end level, which is what closes the gap",
         "right column ends " + laid.boxBottom + ", left " + laid.layerBottom);
    }
  }

  /* ── THE TOP VIEW ───────────────────────────────────  2026-09-20
     Søren: *"the top view could be updated the same way as uJump."* Two of these are layout, which
     he asked for; two are things that were simply wrong and visible in the screenshot he sent. */
  console.log("\nand its top view says what µJump's says");
  {
    const got = await p.evaluate(() => {
      const box = document.getElementById("nucpanel");
      const svg = [...box.querySelectorAll("svg")]
                    .find(s => /Top view/.test(s.textContent || "")) || null;
      const texts = svg ? [...svg.querySelectorAll("text")].map(t => ({
                            s: t.textContent,
                            first: t.firstChild ? t.firstChild.nodeValue : null,
                            fill: t.getAttribute("fill") })) : [];
      const rect = svg ? svg.querySelector("rect") : null;
      const dot = svg ? svg.querySelector("circle") : null;
      return {
        inSvg: !!svg,
        /* the line that used to sit above the figure, carrying title and legend */
        legendLine: /Top view \(X \u2192, Z \u2193\) \u2014/.test(box.innerHTML)
                    || /Top view \(X &rarr;, Z &darr;\) &mdash;/.test(box.innerHTML),
        title: texts.length ? texts[0].s : null,
        /* firstChild, NOT textContent: the label carries a nested <title> with the long name
           for the tooltip, and textContent concatenates the two into "V1DDV1DD imaged extent".
           µJump's figure is built the same way, so this is the figure being right and the first
           version of this assertion reading it wrong. */
        label: texts.length > 1 ? texts[1].first : null,
        labelFill: texts.length > 1 ? texts[1].fill : null,
        rectStroke: rect ? rect.getAttribute("stroke") : null,
        dotFill: dot ? dot.getAttribute("fill") : null,
        /* SCOPED TO THE FIGURE AND ITS CAPTION, which is what this change touched. Asked of the
           whole cell panel it also catches the root/nucleus-ID proposal block, whose text reads
           "an Img65 or Img35 segment ID" — minnie65's vocabulary on a V1DD page, pre-existing,
           real, and a separate change. An assertion that fails for a reason it was not written
           for is one nobody can act on. */
        img65: /Img65|Img35/.test((svg ? svg.parentNode.textContent : "") || "")
      };
    });
    ok(got.inSvg, "the title is inside the figure", got.inSvg);
    ok(!got.legendLine, "...and the line above it is gone", !got.legendLine
       + "  <- it wrapped to two lines at panel width; the band inside costs 15 px of that back");
    ok(/^Top view/.test(got.title || ""), "...reading Top view", got.title);
    ok(got.label === "V1DD" && got.labelFill === got.rectStroke,
       "...with the extent named inside its own rectangle, in its colour",
       got.label + " in " + got.labelFill + ", rectangle " + got.rectStroke);
    /* IT WAS A PURPLE BOX WITH A BLUE DOT IN IT. dotColor picked µJump's Img65 blue whatever this
       page drew its rectangle in, so nothing said the two were about the same volume. */
    ok(got.dotFill === got.rectStroke,
       "...and the dot in the colour of the extent it is in", "dot " + got.dotFill
       + ", rectangle " + got.rectStroke);
    /* "within Img65's imaged extent" — on a V1DD page, about a volume this tool does not have. */
    ok(!got.img65, "...and the figure and its caption name no minnie65 volume", got.img65
       + "  <- the caption read \"within Img65\u2019s imaged extent\" under a V1DD cell");
  }

  /* ── SHOW IN 3D ─────────────────────────────────────  2026-09-20
     Søren: *"Also, the show in 3D is missing from dJump."* core/mesh3d.js installs itself onto
     `.meshdl[data-root]` buttons, and its own header names δJump as one of the three pages that
     render exactly that button. µJump, πJump, βJump and ηJump got the script tag on 2026-09-01
     and δJump did not, so the button was here and the renderer was not — which looks precisely
     like a page that was never meant to have the feature.

     ASSERTED AS "the module is loaded and the button it installs onto exists", not as a rendered
     canvas: this browser has no WebGL worth the name and mesh3d bails without it, exactly as it
     does in jsdom. What can fail silently here is the wiring, and that is what is read. */
  console.log("\nand the cell card can show the cell in 3D");
  {
    const got = await p.evaluate(() => ({
      mod: !!(window.UJ && UJ.mesh3d && typeof UJ.mesh3d.show === "function"),
      prepare: !!(window.UJ && UJ.mesh3d && typeof UJ.mesh3d.prepare === "function"),
      /* the control the module watches for -- ηJump's bug in 2026-09-01 was that its own button
         carried the class and not this attribute, so the selector never matched it */
      buttons: document.querySelectorAll("button.meshdl[data-root]").length,
      meshCfg: !!(UJ.cfg.mesh && (UJ.cfg.mesh.meshBase || UJ.cfg.mesh.meshBaseAlt))
    }));
    ok(got.mod && got.prepare, "core/mesh3d.js is loaded",
       "show:" + got.mod + " prepare:" + got.prepare
       + "  <- one script tag, which is all this module has ever asked of a host");
    ok(got.buttons > 0, "...and the .meshdl[data-root] buttons it installs onto are rendered",
       got.buttons + " button(s)");
    ok(got.meshCfg, "...against a mesh source this page actually has", got.meshCfg
       + "  <- the manifest needs a CAVE token, the same one the .glb download beside it needs");
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
