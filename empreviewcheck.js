/* A coordinate becomes a picture.                                                  2026-10-02

   Søren: *"when pasting a coordinate, the EM view in a around 20µm wide image shows for that
   coordinate and the EM view is a neuroglancer link and the coordinate is written in the top left
   corner and there is a scalebar. There should also be buttons to add the 3D view of the
   segmentation next to the em view of the nearest cell with a segmentation at that coordinate and
   the nucleus of the cell."*

   Every one of those is a separate assertion here, because every one of them is a separate thing
   that can quietly not be true: a canvas can be drawn with no bar on it, a bar can be drawn with
   the wrong length, a link can point at the page it is on.

   THE EM IS NOT FETCHED FROM GOOGLE. The chunk requests are intercepted and answered with bytes
   this file generates, so the check runs offline, in a second, and tests THIS code rather than the
   network. What it cannot test that way -- whether the tissue looks right -- is not a thing a check
   can test anyway.

   Run: node empreviewcheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what
                             + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const src = fs.readFileSync(page_("ujump.html"), "utf8");
  console.log("\nujump.html, as a file");
  ok(/<script src="core\/empreview\.js"><\/script>/.test(src), "core/empreview.js is loaded");
  ok(src.indexOf('src="core/empreview.js"') < src.indexOf('src="core/forum.js"'),
     "...before core/forum.js, which opens one per coordinate");
  ok(/window\.emPreviewHost=function\(\)/.test(src), "...and the page answers what it needs");

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });

  /* ── THE DATASET, ANSWERED LOCALLY ────────────────────────────────────────────────────────
     An `info` that describes a small single-scale volume, and a chunk endpoint that answers every
     request with flat grey. Enough for drawSection to do its arithmetic and paint something; the
     point is the arithmetic, the marks and the wiring, not the tissue. */
  let chunkCount = 0;
  await p.route("**storage.googleapis.com/**", async r => {
    const url = r.request().url();
    if (/\/info$/.test(url)){
      return r.fulfill({ status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ type: "image", data_type: "uint8", num_channels: 1,
          scales: [{ key: "8_8_40", resolution: [8, 8, 40], size: [100000, 100000, 30000],
                     voxel_offset: [0, 0, 0], chunk_sizes: [[512, 512, 16]], encoding: "raw" },
                   { key: "16_16_40", resolution: [16, 16, 40], size: [50000, 50000, 30000],
                     voxel_offset: [0, 0, 0], chunk_sizes: [[512, 512, 16]], encoding: "raw" },
                   { key: "32_32_40", resolution: [32, 32, 40], size: [25000, 25000, 30000],
                     voxel_offset: [0, 0, 0], chunk_sizes: [[512, 512, 16]], encoding: "raw" },
                   { key: "64_64_40", resolution: [64, 64, 40], size: [12500, 12500, 30000],
                     voxel_offset: [0, 0, 0], chunk_sizes: [[512, 512, 16]], encoding: "raw" }] }) });
    }
    chunkCount++;
    /* 512*512*16 bytes of mid-grey, which is what a raw uint8 chunk is. */
    return r.fulfill({ status: 200, contentType: "application/octet-stream",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: Buffer.alloc(512 * 512 * 16, 128) });
  });
  await p.route("**script.google.com/**", r => r.fulfill({ status: 200,
    contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [],
                           rows: [], newCells: [], posts: [] }) }));
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**googleapis.com/oauth**",
                   "**gstatic.com/**", "**raw.githubusercontent.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("\nthe module is there and knows what it needs");
  const have = await p.evaluate(() => {
    const h = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;
    return { mod: !!(window.UJ && UJ.empreview && typeof UJ.empreview.open === "function"),
             host: !!h, em: (h || {}).em || "", seg: (h || {}).seg || "",
             nuc: (h || {}).nuc || "", win: JSON.stringify((h || {}).window || null),
             res: ((h || {}).res || []).join(",") };
  });
  ok(have.mod, "UJ.empreview.open exists");
  ok(have.host, "...and µJump answers emPreviewHost()");
  ok(/minnie65\/em$/.test(have.em), "...with the EM source", have.em);
  ok(!!have.seg && !!have.nuc, "...the segmentation and the nuclei volumes",
     have.seg.slice(-24) + " / " + have.nuc.slice(-24));
  ok(have.res === "4,4,40", "...and the voxel size", have.res);
  ok(/"lo":\d+/.test(have.win),
     "...plus the one contrast window this page sends Neuroglancer, read not copied", have.win);
  if (!have.mod){ console.log("\n" + (fails || 1) + " FAILED"); await b.close(); process.exit(1); }

  console.log("\na coordinate draws about twenty micrometres of tissue");
  const drew = await p.evaluate(async () => {
    const r = [UJ_RX, UJ_RY, UJ_RZ], bb = window.MINNIE65_EM_BB;
    const mid = (a, b2) => (a + b2) / 2;
    const pos = [Math.round(mid(bb.xmin, bb.xmax) / r[0]), Math.round(mid(bb.ymin, bb.ymax) / r[1]),
                 Math.round(mid(bb.zmin, bb.zmax) / r[2])];
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    window.__slot = slot; window.__pos = pos;
    await UJ.empreview.open(slot, pos);
    const cv = slot.querySelector(".emp-cv");
    const a = slot.querySelector(".emp-link");
    /* Is anything actually painted? A canvas left untouched is transparent black everywhere. */
    let painted = false;
    try {
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4000) if (d[i] > 0){ painted = true; break; }
    } catch (_e){ painted = null; }
    return { pos: pos.join(", "), w: cv ? cv.width : 0, h: cv ? cv.height : 0,
             scaleUm: cv ? cv.dataset.scaleUm : "", coord: cv ? cv.dataset.coord : "",
             href: a ? a.getAttribute("href") : "", target: a ? a.getAttribute("target") : "",
             painted: painted,
             cellBtn: !!slot.querySelector(".emp-cell"), nucBtn: !!slot.querySelector(".emp-nuc"),
             say: (slot.querySelector(".emp-say") || {}).textContent || "" };
  });
  ok(drew.w === 300 && drew.h === 162, "the canvas is the 300x162 window", drew.w + "x" + drew.h);
  ok(drew.painted === true, "...and tissue was actually painted into it", String(drew.painted));
  ok(/\d+ µm across/.test(drew.say) || /µm across/.test(drew.say),
     "...and it says how much tissue that is", drew.say);
  ok(/^(19|19\.2|20|18)/.test(drew.say) || /1[89]\.?\d* µm/.test(drew.say),
     "...which is about the twenty micrometres he asked for", drew.say);

  console.log("\nthe two marks are ON the picture, not beside it");
  ok(drew.coord === drew.pos, "the coordinate is stamped top-left",
     drew.coord + "  (wanted " + drew.pos + ")");
  ok(Number(drew.scaleUm) > 0, "...and a scale bar is drawn, of a round number of µm",
     drew.scaleUm + " µm");
  ok(Number(drew.scaleUm) <= 20 / 3 + 0.01,
     "...no longer than a third of the view, so it is a bar and not a ruler", drew.scaleUm);

  console.log("\nand the picture is the Neuroglancer link");
  ok(/^https?:\/\//.test(drew.href || ""), "the canvas is wrapped in a link",
     (drew.href || "").slice(0, 50));
  ok(/#!/.test(drew.href || ""), "...carrying a viewer state", (drew.href || "").length + " chars");
  ok(drew.target === "_blank", "...opening in its own tab", drew.target);
  const sameState = await p.evaluate(() => {
    /* The picture must open the SAME view the sentence's link does -- both volumes' imagery and
       segmentation -- rather than a second state built here that could drift from it. */
    const a = window.__slot.querySelector(".emp-link").getAttribute("href");
    const b2 = UJ.jumplink.url(UJ.jumplink.scan(window.__pos.join(", ")));
    return a === b2;
  });
  ok(sameState, "...and it is the one core/jumplink.js builds, not a second one");

  /* ── AND IT REALLY OPENS ───────────────────────────────────────────────────────────────
     Søren: "clicking the resulting image preview should bring you to Neuroglancer." An anchor that
     is present and does nothing looks identical, from the outside, to one that works -- so this
     clicks the canvas and catches the tab, rather than reading the href and hoping. */
  console.log("\nand clicking the picture really opens that tab");
  {
    /* The viewer is answered with a stub so the popup LANDS -- on the context, not the page, or the
       popup is not covered and resolves to chrome-error, which says nothing about this code. */
    await p.context().route("**ngl.microns-explorer.org/**", r => r.fulfill({ status: 200,
      contentType: "text/html", body: "<html><body>viewer</body></html>" }));
    const popup = p.waitForEvent("popup", { timeout: 4000 }).catch(() => null);
    await p.evaluate(() => window.__slot.querySelector(".emp-cv").click());
    const tab = await popup;
    ok(!!tab, "clicking the canvas opens a tab", tab ? "it did" : "nothing opened");
    if (tab){
      const u = tab.url();
      ok(/ngl\.microns-explorer|spelunker|neuroglancer/.test(u),
         "...at a Neuroglancer", u.slice(0, 46));
      ok(/#!/.test(u), "...carrying the state", u.length + " chars");
      await tab.close();
    }
  }

  /* ── THE SEGMENTATION, WHEN THE POST NAMED A CELL ──────────────────────────────────────
     Søren: "if a nucleus or root ID is written, then the EM should also show segmentation." */
  console.log("\nan id in the post paints the cell onto the tissue");
  {
    let segFetched = 0;
    /* A SEGMENTATION THAT DECODES. uint64 raw, so a chunk is 8 bytes a voxel -- 512x512x16 would be
       32 MB per chunk, so the fixture uses 64x64x16 and fills it with ONE id, the root the post
       names. A fixture that 404s would leave the paint failing, and then "the marks survive the
       overlay" would be true for the wrong reason: there would be no overlay. */
    const SEGW = 64, SEGH = 64, SEGD = 16;
    const segChunk = (id) => {
      const b = Buffer.alloc(SEGW * SEGH * SEGD * 8);
      for (let i = 0; i < SEGW * SEGH * SEGD; i++) b.writeBigUInt64LE(BigInt(id), i * 8);
      return b;
    };
    const segInfo = () => JSON.stringify({ type: "segmentation", data_type: "uint64",
      num_channels: 1,
      scales: [8, 16, 32, 64].map(res => ({ key: res + "_" + res + "_40", resolution: [res, res, 40],
                 /* BIG ENOUGH TO CONTAIN THE TEST COORDINATE. The centre of minnie65 is about
                    962,000 nm in x, which is outside a volume declared 800 µm wide -- and segpaint,
                    unlike drawSection, simply finds no chunk there and reports "not on this plane".
                    A fixture smaller than the place it is asked about tests nothing. */
                 size: [3000000 / res, 3000000 / res, 30000], voxel_offset: [0, 0, 0],
                 chunk_sizes: [[SEGW, SEGH, SEGD]], encoding: "raw" })) });
    const segRoute = async r => {
      const url = r.request().url();
      if (!/seg_m1300|nucle/.test(url)) return r.fallback();
      segFetched++;
      if (/\/info$/.test(url))
        /* EVERY SCALE THE EM HAS, so segpaint can pick the 64 nm one the view is drawn at. Offering
           only the finest made it answer "not on this plane" -- which is a real message for a real
           situation, and useless as a fixture: it means no pixels were blended, and then "the marks
           survive the overlay" passes without there having been an overlay. */
        return r.fulfill({ status: 200, contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" }, body: segInfo() });
      return r.fulfill({ status: 200, contentType: "application/octet-stream",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: segChunk(/nucle/.test(url) ? "253863" : "864691135570733037") });
    };
    await p.route("**storage.googleapis.com/**", segRoute);
    /* The nuclei volume is on bossdb's S3, which the blanket abort above would otherwise swallow. */
    await p.route("**bossdb-open-data.s3.amazonaws.com/**", segRoute);
    const withIds = await p.evaluate(async () => {
      const slot = document.createElement("div");
      document.body.appendChild(slot);
      window.__slot2 = slot;
      await UJ.empreview.open(slot, window.__pos,
        { ids: { root: "864691135570733037", nuc: "253863" } });
      const cv = slot.querySelector(".emp-cv");
      return { say: (slot.querySelector(".emp-say") || {}).textContent || "",
               coord: cv ? cv.dataset.coord : "", scale: cv ? cv.dataset.scaleUm : "" };
    });
    ok(segFetched > 0, "the segmentation volume is read when ids are given",
       segFetched + " request(s)");
    ok(!!withIds.coord, "THE COORDINATE SURVIVES THE OVERLAY — segpaint rewrites the whole canvas, "
       + "so the marks have to go on after it", withIds.coord || "it was painted over");
    ok(Number(withIds.scale) > 0, "...and so does the scale bar", withIds.scale);
    ok(/cell in magenta/.test(withIds.say),
       "...and the overlay was actually blended onto the pixels, not just attempted", withIds.say);
    ok(/nucleus in blue/.test(withIds.say),
       "...with the nucleus named too, since the post gave one", withIds.say);

    /* And with no ids, nothing is asked of the segmentation at all. */
    segFetched = 0;
    await p.evaluate(async () => {
      const slot = document.createElement("div");
      document.body.appendChild(slot);
      await UJ.empreview.open(slot, [window.__pos[0] + 900, window.__pos[1], window.__pos[2]]);
    });
    ok(segFetched === 0,
       "a post that names no cell asks nothing of the segmentation", segFetched + " request(s)");
  }

  console.log("\nthe 3D is a second click, and says what it will fetch");
  ok(drew.cellBtn && drew.nucBtn, "both buttons are there",
     "cell " + drew.cellBtn + ", nucleus " + drew.nucBtn);
  const titles = await p.evaluate(() => ({
    cell: window.__slot.querySelector(".emp-cell").getAttribute("title") || "",
    nuc: window.__slot.querySelector(".emp-nuc").getAttribute("title") || "",
    cellTxt: window.__slot.querySelector(".emp-cell").textContent,
    nucTxt: window.__slot.querySelector(".emp-nuc").textContent,
    drawn: !!window.__slot.querySelector(".emp-3d canvas")
  }));
  ok(/only fetched when you press/.test(titles.cell),
     "...and the cell button says the mesh is only fetched on press", titles.cell.slice(-44));
  ok(!titles.drawn, "nothing 3D is drawn before either is pressed", titles.drawn);
  ok(/3D/.test(titles.cellTxt) && /nucleus/i.test(titles.nucTxt),
     "...and they say which is which", titles.cellTxt + " / " + titles.nucTxt);

  /* ── WHAT IS SOLID, AND WHAT THE CAMERA DOES ────────────────────────────────────────────
     Søren: "I don't see the nucleus inside the cell", and "When I turned the cell in the 3D view
     and then clicked its nucleus, then suddenly the center of the 3D view changed."

     Both were in drawMeshes: the CELL was the lead, which mesh3d draws opaque, so the nucleus was
     behind it; and every redraw built a fresh camera. Driven here through the real module, with
     two tiny meshes, because neither is visible in markup. */
  console.log("\nthe nucleus is the solid one and the cell is see-through");
  const meshes = await p.evaluate(() => {
    /* A cube, as positions+indices, at a size and offset the caller picks. */
    const cube = (s2, off) => {
      const o = off || [0, 0, 0], P2 = [];
      [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].forEach(c => {
        P2.push(o[0] + c[0] * s2, o[1] + c[1] * s2, o[2] + c[2] * s2); });
      const I = [0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1,
                 1,5,6, 1,6,2, 2,6,7, 2,7,3, 3,7,4, 3,4,0];
      return { positions: new Float32Array(P2), indices: new Uint32Array(I) };
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    window.__3d = host;
    /* What show() was handed, rather than what the pixels look like: the arrangement IS the fix. */
    const calls = [];
    const M = (window.UJ.mesh3dCore && UJ.mesh3dCore.prepare) ? UJ.mesh3dCore : UJ.mesh3d;
    const realShow = M.show;
    M.show = function(h, geo, o){ calls.push({ o: o, geo: geo }); return realShow.apply(this, arguments); };

    /* The cell alone first — the button order anybody uses. */
    UJ.empreview._draw(host, [{ what: "cell", mesh: cube(40), unitNm: 1000 }]);
    const first = calls[calls.length - 1];
    /* Turn it, the way a pointer would. */
    host.__empView.yaw = 1.234; host.__empView.pitch = 0.777; host.__empView.dist = 2.5;
    /* Then the nucleus. */
    UJ.empreview._draw(host, [{ what: "cell", mesh: cube(40), unitNm: 1000 },
                              { what: "nucleus", mesh: cube(8000, [16000, 16000, 16000]), unitNm: 1 }]);
    const second = calls[calls.length - 1];
    M.show = realShow;
    const tintOf = c => (c.o.tint || []).join(",");
    return {
      calls: calls.length,
      firstGhosts: (first.o.ghosts || []).length,
      secondGhosts: (second.o.ghosts || []).length,
      secondGhostAlpha: ((second.o.ghosts || [])[0] || {}).alpha,
      firstTint: tintOf(first), secondTint: tintOf(second),
      sameView: first.o.view === second.o.view,
      viewKept: JSON.stringify(second.o.view)
    };
  });
  ok(meshes.calls === 2, "two draws: the cell, then the cell and its nucleus", meshes.calls);
  ok(meshes.firstGhosts === 0, "the cell alone is the subject, with nothing around it",
     meshes.firstGhosts + " ghost(s)");
  ok(meshes.secondGhosts === 1,
     "ONCE THE NUCLEUS IS THERE IT IS THE SUBJECT and the cell becomes the thing you look through",
     meshes.secondGhosts + " ghost(s)");
  ok(meshes.secondGhostAlpha === 0.14,
     "...at the fainter of the two alphas, being the larger surface", meshes.secondGhostAlpha);
  ok(meshes.firstTint !== meshes.secondTint,
     "...and the subject's colour changes with it", meshes.firstTint + " -> " + meshes.secondTint);
  /* BLUE MEANS b > r AND b > g, not three particular digits: NUC_TINT is 0.227/0.447/0.847 and
     asserting "0.23" made this check fail over a rounding it has no opinion about. */
  const t = meshes.secondTint.split(",").map(Number);
  ok(t[2] > t[0] && t[2] > t[1],
     "...to the blue a nucleus is everywhere else in these tools",
     t.map(x => Math.round(x * 100) / 100).join(", "));

  console.log("\nand the angle you turned to survives adding it");
  ok(meshes.sameView,
     "the SAME camera object is handed back, which is what mesh3d mutates in place");
  ok(/1\.234/.test(meshes.viewKept) && /0\.777/.test(meshes.viewKept),
     "...so the yaw and pitch you turned to are still there after the redraw", meshes.viewKept);

  console.log("\nnothing is read for a coordinate nobody asked about");
  const lazy = await p.evaluate(async () => {
    /* ITS OWN SLOT, not a count of every picture on the page: the sections above deliberately open
       more, and a global count would make this assertion about them instead. */
    const before = window.__slot.querySelectorAll(".emp").length;
    UJ.empreview.close(window.__slot);
    return { before: before, after: window.__slot.querySelectorAll(".emp").length };
  });
  ok(lazy.before === 1 && lazy.after === 0, "close() puts the picture away",
     lazy.before + " -> " + lazy.after);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300) || "none");
  await p.close();
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
