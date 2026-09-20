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

/* Lee16's real info, as read from the bucket on 2026-09-20 — ALL TEN SCALES, which is the point.
   This was trimmed to four at first and the EM-plane assertions below failed for it: emtiles
   clamps a mip to the scale list it is given, so a four-scale stub makes mip 4 mean 32 nm and the
   page looks like it asked for the wrong level. A stub shorter than the volume tests a volume
   nobody has.

   The shape that matters: Lee16 downsamples in X AND Y ONLY. Every one of its ten scales keeps
   40 nm sections, where minnie65's 64 nm level averages two — which is why λJump reaches 64 nm as
   a plain mip 4 and µJump needs emtiles' slabOk escape hatch to get there at all. */
const INFO = {
  type: "image", data_type: "uint8", num_channels: 1,
  scales: Array.from({ length: 10 }, (_, i) => ({
    key: (4 << i) + "_" + (4 << i) + "_40", encoding: "raw",
    resolution: [4 << i, 4 << i, 40],
    size: [Math.max(1, 163840 >> i), Math.max(1, 163840 >> i), 822], voxel_offset: [0, 0, 0],
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
      shader: typeof EM_SHADER_CONTROLS !== "undefined"
              ? EM_SHADER_CONTROLS.normalized.range : null,
      /* The layer a built link carries. It had neither shaderControls nor tab:"rendering", so
         Neuroglancer opened Lee16 on its own flat 0-255 default with the control that would fix
         it not even the panel on screen. */
      layer: (function(){ try { var L = buildState([0,0,0]).layers[0];
                                return { tab: L.tab, sc: L.shaderControls
                                         ? L.shaderControls.normalized.range : null }; }
                          catch (e){ return { err: String(e).slice(0,60) }; } })(),
      conf: typeof emConfigure === "function"
    }));
    ok(got.mods.length >= 6, "the tracing modules are loaded", got.mods.join(", "));
    ok(got.emtiles, "...and emtiles can draw a section", got.emtiles);
    ok(got.conf, "...and the page has one place that points the reader at its dataset", got.conf);
    /* MEASURED, NOT COPIED: 2–98% of 480,000 pixels over three sections of the real volume. */
    /* ── 27–240, AND WHY IT IS NOT 44–238 ───────────────────  2026-09-20
       It was 44–238, this volume's measured 2-98%. Søren looked at the pad and said the contrast
       was "totally off", with the Rendering panel beside it reading 27 → 240. Re-measured on
       1,048,576 real pixels its 1% is 30 and its 99% is 240 — the same window to within three
       levels. What each one throws away, on that sample:

           86-172 (emtiles' minnie65 default)   11.5% black   48.2% white
           44-238                                2.1% black    1.7% white
           27-240                                0.9% black    1.2% white */
    ok(got.win && got.win.lo === 27 && got.win.hi === 240,
       "...and its own contrast window, not µJump's",
       (got.win ? got.win.lo + "–" + got.win.hi : "(none)")
       + "  <- emtiles defaults to minnie65's 86–172, which clips 59.7% of this tissue flat");
    /* ONE WINDOW PER DATASET, the shape µJump and δJump already had. A second literal would be a
       second opinion, and nothing would notice the two had drifted. */
    ok(got.shader && got.win && got.win.lo === got.shader[0] && got.win.hi === got.shader[1],
       "...written once, so the viewer links and the pad cannot disagree",
       got.shader ? "EM_SHADER_CONTROLS " + got.shader.join("–") : "(no shader controls)");
    /* AND THE LINKS CARRY IT. µJump and δJump have put shaderControls on their image layer all
       along; λJump had neither that nor tab:"rendering", so a link it built opened Lee16 on
       Neuroglancer's flat 0-255 default, with the control that would fix it not on screen. */
    ok(got.layer && got.layer.sc && got.layer.sc[0] === 27 && got.layer.sc[1] === 240,
       "...and a link this page builds opens already stretched", JSON.stringify(got.layer));
    ok(got.layer && got.layer.tab === "rendering",
       "...on the panel that can change it", got.layer && got.layer.tab);
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

  console.log("\nand the cell card shows one plane of it");
  {
    /* SLICE 2. The pad was the plan and the measurement changed it: the pad's code is scattered
       across nineteen regions of ujump.html, ~1,450 lines interleaved with unrelated code. The EM
       plane is already marked there for extraction (@emplane), 272 contiguous lines, so it is the
       piece that was ready. */
    const got = await p.evaluate(async () => {
      showCell(0, 0);
      await new Promise(r => setTimeout(r, 2200));
      const cv = document.getElementById("emPlaneCv");
      let stats = null;
      if (cv) {
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let min = 255, max = 0;
        for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; }
        stats = { min, max };
      }
      return { box: !!document.getElementById("emPlaneBox"),
               tick: !!document.getElementById("emPlaneOn"),
               segTick: !!document.getElementById("emPlaneSeg"),
               shown: cv && cv.style.display, title: cv ? cv.title : "",
               scaleUm: cv ? cv.dataset.scaleUm : null, stats,
               say: (document.getElementById("emPlaneSay") || {}).textContent };
    });
    ok(got.box && got.tick, "the card carries the section, with its own switch",
       "box:" + got.box + " tick:" + got.tick);
    /* LEE16 HAS NO SEGMENTATION VOLUME — its own Colab card says so. µJump's version of this panel
       is half segmentation overlay; porting that half would have put a tick on the page that can
       never do anything, and a "segmentation off" status line about a thing that does not exist. */
    ok(!got.segTick, "...and NOT the segmentation tick µJump has", got.segTick
       + "  <- Lee16's release is image only; a control that can never act is worse than none");
    ok(got.shown === "block" && got.stats && got.stats.min !== got.stats.max,
       "...drawn, with real pixels on it",
       got.shown + " " + (got.stats ? got.stats.min + "–" + got.stats.max : "(none)"));
    /* 300 px at 64 nm is 19.2 µm — the width Søren asked for when this was built on µJump. µJump
       needs emtiles' slabOk to reach 64 nm because minnie65 averages two 40 nm sections there;
       Lee16 downsamples in x and y only, so mip 4 is 64 nm AND a true single section. */
    ok(/19\.2 µm across at 64 nm\/px/.test(got.title),
       "...19.2 µm of tissue, at 64 nm", got.title.slice(0, 46));
    ok(/One 40 nm section\./.test(got.title) && !/averages/.test(got.title),
       "...and called one section, because here it really is one",
       "  <- µJump must warn that its 64 nm level averages two; all ten Lee16 scales keep 40 nm z");
    ok(got.scaleUm === "5", "...under a round scale bar", got.scaleUm + " µm");
    ok(!got.say, "...and nothing left to say once it is drawn", JSON.stringify(got.say));

    /* WHERE IT SITS, which Søren asked about the moment he saw it live: *"This can be arranged
       more compact."* It had landed in a row of its own under the depth ruler, which left ~200 px
       of empty background beside the ruler AND margins either side of the picture. The paragraph
       and the section are now a stack beside the ruler, so both gaps close.

       Asserted as GEOMETRY rather than as markup: what was wrong was how it looked, and a
       selector would go on passing through any restyling that put the gap back. */
    const laid = await p.evaluate(() => {
      const box = document.getElementById("emPlaneBox");
      const svg = document.querySelector("#panel .card svg[aria-label^='Depth of this nucleus']");
      if (!box || !svg) return { skip: !box ? "no emPlaneBox" : "no depth ruler" };
      const b = box.getBoundingClientRect(), r = svg.getBoundingClientRect();
      return { boxLeft: Math.round(b.left), rulerRight: Math.round(r.right),
               boxTop: Math.round(b.top), rulerBottom: Math.round(r.bottom) };
    });
    if (laid.skip) {
      ok(false, "the section's placement could be measured", laid.skip);
    } else {
      ok(laid.boxLeft >= laid.rulerRight,
         "...beside the depth ruler, not underneath it",
         "section starts at " + laid.boxLeft + ", ruler ends at " + laid.rulerRight);
      ok(laid.boxTop < laid.rulerBottom,
         "...level with it, so the space beside the ruler is used rather than left empty",
         "section top " + laid.boxTop + " vs ruler bottom " + laid.rulerBottom);
    }
  }

  /* ── THE TRACING CARD, WHICH IS THE POINT OF ALL OF THE ABOVE ─────────────  2026-09-20
     Stage D of the core/tracingcard.js extraction: λJump is the first page other than µJump to
     load the module, which is the only thing that turns "moved into core/" into "shared".

     A shared card on a dataset that has less than minnie65 is where this gets interesting. Lee16
     is IMAGE ONLY, and three parts of the card assume otherwise. What is asserted here is that
     each one is ABSENT rather than broken — a tick that cannot work is removed, an identity the
     dataset cannot predict is null, and a zoom menu labelled for the wrong volume is relabelled
     from this one's own scale list. */
  console.log("\nand it carries the shared tracing card, trimmed to what this dataset has");
  {
    const got = await p.evaluate(() => ({
      wrapper: !!document.getElementById("tracingCard"),
      filled: !!(document.getElementById("tracingCard") || {}).firstElementChild,
      wired: !!(window.UJ && UJ.tracingcard && UJ.tracingcard._wired),
      pad: !!document.getElementById("tracePad"),
      /* The four keys are top-level `const`s in the module, so they are reachable by name. */
      keys: [TRACING_KEY, TRACING_DRAFTS_KEY, TRACING_DRAFT_KEY, TRACING_PEN_KEY],
      src: (function(){ try { return tracingSources(); } catch (e){ return { err: String(e) }; } })(),
      segTick: !!document.getElementById("tracePadSeg"),
      segSay: !!document.getElementById("tracePadSegSay"),
      ghosts: !!document.getElementById("tracePadGhosts"),
      penTick: !!document.getElementById("tracePadPen"),
      ident: (function(){ try { return tracingIdentityFor("1", ""); } catch (e){ return "threw: " + e; } })(),
      mips: [...document.querySelectorAll("#tracePadMip option")].map(o => o.textContent)
    }));
    ok(got.wrapper && got.filled, "the module built the card into λJump's wrapper",
       got.wrapper + "/" + got.filled);
    ok(got.wired && got.pad, "...and wired it, so the pad is a pad", got.wired + "/" + got.pad);

    /* THE ONE THAT WOULD HAVE COST REAL WORK. Unset, the module falls back to µJump's keys and
       the two tools share one list of tracings and one set of drafts. storagekeycheck.js reports
       four collisions by name the moment these are removed — verified by removing them. */
    ok(got.keys.every(k => /^ljump_/.test(k)),
       "...reading and writing λJump's own storage, not µJump's", got.keys.join(", "));

    ok(got.src && got.src.em === "precomputed://s3://open-neurodata/lee/lee16/image" && !got.src.seg,
       "...pointed at Lee16's imagery, with no segmentation to point at",
       JSON.stringify(got.src));

    /* REMOVED, NOT DISABLED. Both ticks need a volume this release does not contain. A greyed
       control is a promise it will work later; there is nothing to come. */
    ok(!got.segTick && !got.segSay,
       "...so the pad does not offer to paint a segmentation that does not exist",
       "tick " + got.segTick + ", its status line " + got.segSay);
    ok(!got.ghosts,
       "...nor to fetch cell and nucleus meshes this dataset has none of", got.ghosts
       + "  <- λJump has no UJ.cfg.mesh at all, which is a statement in its config");
    ok(got.penTick, "...while the controls that need only imagery stay", got.penTick);

    /* NULL IS THE ANSWER, NOT A FAILURE. No prediction tables exist for Lee16, so the community
       identity line stays away rather than claiming a type nobody predicted. Before stage B this
       threw inside a click handler. */
    ok(got.ident === null, "...and a cell here has no predicted identity to report",
       JSON.stringify(got.ident));

    /* THE MENU WAS DESCRIBING minnie65. Its six labels were hand-written for a volume whose
       finest scale is 8 nm; Lee16's is 4 nm, so every one of them was one step out — the page
       said "32 nm data" while drawing 16. Computed now from this volume's own scale list.
       µJump's labels come out of the same arithmetic byte-identical to the typed ones, which is
       what says this is the same calculation and not a second opinion. */
    ok(/^9 µm across — 16 nm data/.test(got.mips[0] || ""),
       "the widest zoom level says what this volume actually is", got.mips[0]);
    ok(/^4\.5 µm — 8 nm data/.test(got.mips[1] || "") && /^2\.2 µm — 4 nm data/.test(got.mips[2] || ""),
       "...and so do the rest", (got.mips[1] || "") + " | " + (got.mips[2] || ""));
    /* ", slower to load" is a fact about minnie65's chunk geometry: 64 px wide at 32 nm against
       128 at 16. Lee16 chunks 512 at every scale, so its widest view is not slower and the
       warning would be untrue. Checked against the chunk sizes, not assumed. */
    ok(!/slower to load/.test(got.mips[0] || ""),
       "...without µJump's warning about chunk counts, which is not true here", got.mips[0]);
  }

  /* ── THE PAD DRAWS WITH THIS PAGE'S WINDOW ────────────────  2026-09-20
     The bug Søren reported, asserted where it happened. The pad's drawSection call passed no lo
     and no hi, so every dataset got emtiles' 86/172 — minnie65's — and on this tissue that clips
     11.5% of the picture to black and 48.2% to white. µJump could never have shown it: its own
     window IS 86/172.

     AND CHECKING EM_WINDOW WOULD NOT HAVE CAUGHT IT. EM_WINDOW was right the whole time; it simply
     never reached the canvas. So this reads what the pad ASKED FOR. */
  console.log("\nand the pad stretches with it, which is the thing that was wrong");
  {
    const got = await p.evaluate(async () => {
      document.getElementById("tracingPanel").open = true;
      document.getElementById("tracingX").value = "81920";
      document.getElementById("tracingY").value = "81920";
      document.getElementById("tracingZ").value = "411";
      document.getElementById("tracePadOpen").click();
      await new Promise(r => setTimeout(r, 7000));
      return { asked: (typeof PAD_VIEW !== "undefined" && PAD_VIEW) ? PAD_VIEW.windowAsked : null,
               fn: (typeof tracingWindow === "function") ? tracingWindow() : null,
               intro: (typeof tracingIntro === "function") ? tracingIntro() : null };
    });
    ok(got.fn && got.fn.lo === 27 && got.fn.hi === 240,
       "the card reads this page's window", JSON.stringify(got.fn));
    ok(got.intro && /image only/.test(got.intro),
       "the card opens by saying why EVERY cell here is traced by hand", got.intro
       + "  <- \u00b5Jump's \"for a cell the segmentation does not have\" implies this dataset has one");
    ok(got.asked && got.asked[0] === 27 && got.asked[1] === 240,
       "...and the pad's own draw asked for it", JSON.stringify(got.asked)
       + "  <- it asked for nothing at all until 2026-09-20, and got minnie65's 86–172");
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
