/* πJump draws its own EM, from the bucket that has it, and carries the tracing card.  2026-09-21

   Søren: "The tracing does not exist of pJump, why?" -- because its EM source,
   gs://microns_public_datasets/pinky100_v0/son_of_alignment_v15_rechunked, serves an info file
   and no chunks (404 at every probe, 2026-09-20 and -21, from grubblab.com). The same volume, with
   its chunks, is gs://neuroglancer/pinky100_v0/son_of_alignment_v15_rechunked: identical info,
   every probed chunk 200 and full of tissue.

   Checked on the page, with both buckets answered here the way they answer live -- the old one
   with its info and 404s, the new one with its info and chunks:
     - every viewer link, the Colab notebook and the pad read the new bucket; nothing reads the old;
     - the EM stack is loaded and the pad's window is Søren's [33,231];
     - a section draws at a real cell, from the new bucket, at 4 nm = mip 0, 40 nm sections;
     - the tracing card is built, on πJump's own storage keys, with a segmentation to paint;
     - the pad opens on the cell and draws it;
     - the cell card shows one plane of the EM, 300x162 at 64 nm, under its own switches.

   Run: node empjumpcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* pinky100's real info, read from both buckets on 2026-09-21 (they are identical). */
const RES = [4, 8, 16, 32, 64, 128, 256, 512];
const SIZE = [[90000, 53500], [45000, 26750], [22500, 13375], [11250, 6688], [5625, 3344], [2813, 1672], [1407, 836], [704, 418]];
const OFF = [[35000, 31000], [17500, 15500], [8750, 7750], [4375, 3875], [2187, 1937], [1093, 968], [546, 484], [273, 242]];
const INFO = { type: "image", data_type: "uint8", num_channels: 1, scales: RES.map((r, k) => ({
  key: r + "_" + r + "_40", resolution: [r, r, 40], size: [SIZE[k][0], SIZE[k][1], 2176],
  voxel_offset: [OFF[k][0], OFF[k][1], 1], chunk_sizes: [[256, 256, 16]], encoding: "raw" })) };
const OLD = "microns_public_datasets/pinky100_v0/son_of_alignment_v15_rechunked";
const NEW = "neuroglancer/pinky100_v0/son_of_alignment_v15_rechunked";
/* The neighbour of nucleus 13776 in Søren's screenshot, in πJump's 4/4/40 frame. */
const CELL = [48000, 73540, 1531];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  /* The segmentation half of the section is its own question (segpaint has its own checks);
     off here, so this check is about the imagery. */
  await p.addInitScript(() => { try { localStorage.setItem("pjump_panel_emseg", "0"); } catch (e){} });
  for (const h of ["**script.google.com/**", "**accounts.google.com/**", "**cdnjs.cloudflare.com/**",
                   "**td.princeton.edu/**", "**gstatic.com/**"])
    await p.route(h, r => r.abort());
  let newHits = 0, oldHits = 0;
  await p.route("**storage.googleapis.com/**", route => {
    const u = route.request().url();
    const isOld = u.indexOf(OLD) >= 0, isNew = u.indexOf(NEW) >= 0;
    if (!isOld && !isNew) return route.abort();
    if (/\/info$/.test(u)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(INFO) });
    if (isOld){ oldHits++; return route.fulfill({ status: 404, body: "" }); }   /* as it really does */
    newHits++;
    const n = 256 * 256 * 16, buf = Buffer.allocUnsafe(n);
    /* A gradient across Søren's window, so a draw and a no-draw look different. */
    for (let i = 0; i < n; i++) buf[i] = 40 + ((i % 256) % 180);
    return route.fulfill({ status: 200, contentType: "application/octet-stream", body: buf });
  });
  await p.goto("file://" + page_("pjump.html"));
  await p.waitForTimeout(6000);

  console.log("pjump.html\n\nthe imagery is read from the bucket that has it");
  {
    const got = await p.evaluate(({ OLD, NEW }) => {
      let st = null; try { st = buildState([48000, 73540, 1531]); } catch (e){ st = { err: String(e) }; }
      const img = ((st && st.layers) || []).filter(l => l.type === "image").map(l => String(l.source));
      let cc = ""; try { cc = cellContactsViewerBase().SRC_EM; } catch (e){ cc = "threw"; }
      const code = [...document.scripts].filter(s => !s.src).map(s => s.textContent).join("\n")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      return { em: SRC.em, em35: SRC.em35, colab: UJ.cfg.em.emSource, img, cc,
               oldInCode: code.split(OLD).length - 1 };
    }, { OLD, NEW });
    ok(got.em.indexOf(NEW) >= 0 && got.em35.indexOf(NEW) >= 0, "SRC.em and SRC.em35 are the bucket with chunks", got.em);
    ok(got.img.length > 0 && got.img.every(s => s.indexOf(NEW) >= 0), "...so every viewer link's EM layer is", got.img.join(", "));
    ok(got.cc.indexOf(NEW) >= 0, "...and the cell-contacts viewer's", got.cc);
    ok(got.colab === "gs://" + NEW, "...and the Colab notebook's", got.colab);
    ok(got.oldInCode === 0, "nothing on the page still reads the copy with no chunks", got.oldInCode + " place(s)");
  }

  console.log("\nthe page carries the stack the pad is built from");
  {
    const got = await p.evaluate(() => ({
      mods: ["segread", "segpaint", "organellelink", "emtiles", "tracepad", "traceloft", "nucmesh", "tracing"]
        .filter(m => !!(window.UJ && UJ[m])),
      conf: typeof emConfigure === "function",
      win: typeof EM_WINDOW !== "undefined" ? EM_WINDOW : null,
      shader: EM_SHADER_CONTROLS.normalized.range }));
    ok(got.mods.length === 8, "all eight tracing modules are loaded", got.mods.join(", "));
    ok(got.conf, "...and one place points the reader at pinky100", got.conf);
    ok(got.win && got.win.lo === got.shader[0] && got.win.hi === got.shader[1] && got.win.lo === 33 && got.win.hi === 231,
       "the pad's window is the viewer links' own, Søren's 33–231", got.win && got.win.lo + "–" + got.win.hi);
  }

  console.log("\nit draws a section at a real cell");
  {
    newHits = 0; oldHits = 0;
    const got = await p.evaluate(async (CELL) => {
      if (!emConfigure()) return { err: "emConfigure said no" };
      const s0 = await UJ.emtiles.scaleAt(0);
      const cv = document.createElement("canvas"); cv.width = 200; cv.height = 120;
      try {
        const v = await UJ.emtiles.drawSection(cv, { centre: CELL, w: 200, h: 120, mip: 0, zoom: 1,
                                                     lo: EM_WINDOW.lo, hi: EM_WINDOW.hi });
        const d = cv.getContext("2d").getImageData(0, 0, 200, 120).data;
        let min = 255, max = 0; for (let i = 0; i < d.length; i += 4){ min = Math.min(min, d[i]); max = Math.max(max, d[i]); }
        return { key: s0.scale.key, sectionNm: s0.sectionNm, count: s0.count, nm: v.nmPerPx, min, max };
      } catch (e){ return { err: String(e && e.message || e) }; }
    }, CELL);
    ok(!got.err, "a section draws", got.err || "yes");
    ok(got.key === "4_4_40" && got.sectionNm === 40, "...mip 0 is 4 nm, one 40 nm section", got.key + ", " + got.sectionNm + " nm");
    ok(got.min !== got.max, "...with real pixels on it", got.min + "–" + got.max);
    ok(newHits > 0 && oldHits === 0, "...fetched from gs://neuroglancer/, never from the empty copy", newHits + " new, " + oldHits + " old");
  }

  console.log("\nit carries the shared tracing card");
  {
    const got = await p.evaluate(() => ({
      filled: !!(document.getElementById("tracingCard") || {}).firstElementChild,
      wired: !!(UJ.tracingcard && UJ.tracingcard._wired), pad: !!document.getElementById("tracePad"),
      keys: [TRACING_KEY, TRACING_DRAFTS_KEY, TRACING_DRAFT_KEY, TRACING_PEN_KEY],
      src: tracingSources(), segTick: !!document.getElementById("tracePadSeg"),
      ident: (function(){ try { return tracingIdentityFor(String(NID[0]), ""); } catch (e){ return "threw: " + e; } })() }));
    ok(got.filled && got.wired && got.pad, "the module built and wired the card", got.filled + "/" + got.wired + "/" + got.pad);
    ok(got.keys.every(k => /^pjump_/.test(k)), "...on πJump's own storage, not µJump's", got.keys.join(", "));
    ok(got.src.em.indexOf(NEW) >= 0 && /pinky100_v185\/seg/.test(got.src.seg) && /pinky100-nuclei/.test(got.src.nuc),
       "...pointed at pinky100's imagery, segmentation and nuclei", JSON.stringify(got.src).slice(0, 160));
    ok(got.segTick, "...so the pad offers to paint the cell", got.segTick);
    ok(got.ident && typeof got.ident === "object" && got.ident.nucleusId, "...and a traced cell is identified from this page's tables",
       JSON.stringify(got.ident).slice(0, 120));
  }

  console.log("\nthe pad opens on the cell and draws it");
  {
    newHits = 0;
    const got = await p.evaluate(async (CELL) => {
      document.getElementById("tracingPanel").open = true;
      ["tracingX", "tracingY", "tracingZ"].forEach((id, k) => document.getElementById(id).value = String(CELL[k]));
      document.getElementById("tracePadOpen").click();
      await new Promise(r => setTimeout(r, 6000));
      const cv = document.getElementById("tracePad");
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let min = 255, max = 0; for (let i = 0; i < d.length; i += 4){ min = Math.min(min, d[i]); max = Math.max(max, d[i]); }
      return { open: document.getElementById("tracePadWrap").style.display !== "none",
               z: (document.getElementById("tracePadZ") || {}).textContent, min, max };
    }, CELL);
    ok(got.open, "the pad opens", got.open);
    ok(new RegExp("z " + CELL[2]).test(got.z || ""), "...on the cell's section", (got.z || "").slice(0, 90));
    ok(got.min !== got.max && newHits > 0, "...with a real section drawn on it", got.min + "–" + got.max + ", " + newHits + " chunks");
  }

  console.log("\nthe cell card shows one plane of it");
  {
    const got = await p.evaluate(async (CELL) => {
      showNucleus(CELL);
      await new Promise(r => setTimeout(r, 4000));
      const cv = document.getElementById("emPlaneCv");
      let stats = null;
      if (cv){
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let min = 255, max = 0; for (let i = 0; i < d.length; i += 4){ min = Math.min(min, d[i]); max = Math.max(max, d[i]); }
        stats = { w: cv.width, h: cv.height, min, max, title: cv.title };
      }
      return { tick: !!document.getElementById("emPlaneOn"),
               seg: (document.querySelector('label[for="emPlaneSeg"]') || {}).textContent,
               keys: [EM_PLANE_KEY, EM_PLANE_SEG_KEY], ids: EM_PLANE_LAST,
               say: (document.getElementById("emPlaneSay") || {}).textContent, stats };
    }, CELL);
    ok(got.tick && /segmentation/.test(got.seg || ""), "the section is there, with its switch and a segmentation switch",
       got.tick + ", " + (got.seg || "").trim());
    ok(got.keys.join(",") === "pjump_panel_emplane,pjump_panel_emseg", "...remembered under πJump's own keys", got.keys.join(", "));
    ok(got.ids && got.ids.nuc && got.ids.root !== undefined, "...and it knows the cell's root and nucleus", JSON.stringify(got.ids && { root: got.ids.root, nuc: got.ids.nuc }));
    ok(got.stats && got.stats.w === 300 && got.stats.h === 162 && got.stats.min !== got.stats.max,
       "...drawn, 300×162, with real pixels", JSON.stringify(got.stats && { w: got.stats.w, h: got.stats.h, min: got.stats.min, max: got.stats.max }));
    ok(got.stats && /at 64 nm\/px/.test(got.stats.title) && /One 40 nm section\./.test(got.stats.title),
       "...at 64 nm, one 40 nm section", got.stats && got.stats.title.slice(0, 80));
  }

  /* Søren, 2026-09-21: "These could be next to each other" -- the section beside the top view. */
  console.log("\nthe section sits beside the top view");
  {
    const laid = await p.evaluate(() => {
      const box = document.getElementById("emPlaneBox");
      const svg = [...document.querySelectorAll("#nucpanel svg")].filter(s => /Top view/.test(s.textContent))[0];
      if (!box || !svg) return { skip: (!box ? "no section" : "no top view") };
      const a = svg.getBoundingClientRect(), c = box.getBoundingClientRect();
      return { topRight: Math.round(a.right), boxLeft: Math.round(c.left), topTop: Math.round(a.top), boxTop: Math.round(c.top) };
    });
    ok(!laid.skip && laid.boxLeft >= laid.topRight && Math.abs(laid.boxTop - laid.topTop) < 60,
       "the section is to the right of the top view, on the same row", JSON.stringify(laid));
  }

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
