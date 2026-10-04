/* The 3D panel's view, as a picture you can put in a paper.                           2026-10-03

   Søren: *"Can we make a button to export the view of the show in 3D as an image with scalebar or
   as a movie that rotates 360 degrees with the current view?"* — a PNG and an animated GIF, from a
   fifth icon in the corner strip.

   THE SCALE BAR IS THE WHOLE RISK. A picture of a cell is pleasant; a picture of a cell with a bar
   under it is a measurement, and a measurement that is wrong is worse than no measurement at all —
   it will be read off a figure by somebody who was not here. So most of this file is about one
   number: how many nanometres a pixel is worth.

   IT IS COMPUTED WHERE THE CAMERA IS, not beside it. The visible height at the model's own centre
   plane is 2·dist·tan(FOV/2) in model units, and a model unit is `geo.span` nanometres. Every one
   of those three lives in core/mesh3d.js, so nmPerPx() lives there too and this module asks. A
   second copy of FOV in a second file is the fault this codebase has had more than any other, and
   it would be a particularly bad one here: it would be wrong by a constant, which looks right.

   WHAT IS ASSERTED, AND WHY EACH:
     the bar's own arithmetic   a nice round number, 15-35% of the frame, and its pixel length is
                                exactly its nanometre length divided by nmPerPx
     the bar is really drawn    a horizontal run of light pixels that long, found in the PNG
     it follows the camera      halving the distance halves nmPerPx, so the same bar is twice as
                                long in pixels, or the next number down is chosen
     the gif is a gif           GIF89a, the right logical size, the right number of frames
     the view survives          a turn puts the camera back where it was

   Run: node shotcheck.js */
const { chromium } = require("playwright");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A cell 100 µm across, so the arithmetic below has a known answer. */
const BALL = `((R,cx,cy,cz) => { const P=[],I=[],NU=24,NV=16;
  for (let i=0;i<=NV;i++) for (let j=0;j<=NU;j++){ const th=i/NV*Math.PI, ph=j/NU*Math.PI*2;
    P.push(cx+R*Math.sin(th)*Math.cos(ph), cy+R*Math.cos(th), cz+R*Math.sin(th)*Math.sin(ph)); }
  for (let i=0;i<NV;i++) for (let j=0;j<NU;j++){ const a=i*(NU+1)+j,b=a+1,c=a+NU+1,d=c+1;
    I.push(a,c,b,b,c,d); }
  return { positions:new Float32Array(P), indices:new Uint32Array(I) }; })`;

const SETUP = `(() => {
  const M = UJ.mesh3d, ball = ${BALL}, h = document.getElementById("h"); h.innerHTML = "";
  const cell = ball(50, 0, 0, 0);
  const g = M.prepare(cell.positions, cell.indices, { unitNm: 1000 });
  window.__v = {};
  M.show(h, g, { what: "cell", view: window.__v });
  return { span: g.span, dist: window.__v.dist };
})()`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"] });
  const p = await b.newPage({ viewport: { width: 820, height: 560 },
                              reducedMotion: "no-preference" });
  p.on("pageerror", e => console.log("PAGEERROR " + e.message));
  await p.setContent('<!doctype html><meta charset="utf-8"><style>'
    + ':root{--bg:#0d1117;--panel:#161b22;--line:#2a313c;--ink:#e6edf3;--mut:#8b949e;'
    + '--accent:#27e0b3;--bad:#f85149}body{margin:0;background:var(--bg)}'
    + '#h{width:620px;height:320px}.logo{display:none}</style>'
    /* The mark every page in this family wears, in the markup they all write it in: the tool's own
       letter in the accent colour and the word in the ink. core/mesh3dshot.js reads it off the page
       rather than carrying a picture of one, so the harness has to have it for there to be
       anything to read. Hidden, because this check is about the exported file, not the layout. */
    + '<h1 class="logo"><span class="mu">\u00b5</span><span class="jm">Jump</span></h1>'
    + '<div id="h"></div>');
  await p.addScriptTag({ path: core("mesh3d.js") });
  await p.addScriptTag({ path: core("mesh3dshot.js") });
  /* The encoder is handed in rather than fetched: this page is about:blank, and a check that
     needed the network to encode a GIF would be a check that fails on a train. It is the same
     bytes core/vendor/gifenc.js holds, read here with node. */
  await p.evaluate("UJ.mesh3dshot.configure({ gifSrc: " 
    + JSON.stringify(require("fs").readFileSync(core("vendor/gifenc.js"), "utf8")) + " })");

  console.log("how many nanometres a pixel is worth");
  const geo = await p.evaluate(SETUP);
  const scale = await p.evaluate(`(() => {
    const f = UJ.mesh3d.frame();
    if (!f) return null;
    /* The same number, derived here from the three things it is made of, so this check is not
       simply asking the code to agree with itself. */
    return { w: f.w, h: f.h, nmPerPx: f.nmPerPx,
             byHand: 2 * window.__v.dist * Math.tan(0.9 / 2) * ${geo.span} / f.h };
  })()`);
  ok(!!scale, "the panel can hand out a frame at all", scale ? scale.w + "x" + scale.h : "no frame");
  ok(scale && Math.abs(scale.nmPerPx - scale.byHand) / scale.byHand < 0.001,
     "...and says what a pixel is worth, matching 2·dist·tan(FOV/2)·span ÷ height worked out here",
     scale ? scale.nmPerPx.toFixed(1) + " vs " + scale.byHand.toFixed(1) + " nm/px" : "");

  console.log("\nthe bar is a round number, and it is the length it says");
  const bar = await p.evaluate(`(() => {
    const f = UJ.mesh3d.frame();
    const b = UJ.mesh3dshot.barFor(f.nmPerPx, f.w);
    return { nm: b.nm, px: b.px, label: b.label, frac: b.px / f.w, nmPerPx: f.nmPerPx };
  })()`);
  ok(/^(1|2|5)(0*)$/.test(String(bar.nm / 1000)) || /^(1|2|5)(0*)$/.test(String(bar.nm / 1)),
     "the bar is 1, 2 or 5 times a power of ten — the numbers a reader expects on a figure",
     bar.label);
  ok(bar.frac > 0.12 && bar.frac < 0.40,
     "...and takes a sensible share of the width", Math.round(bar.frac * 100) + "%");
  ok(Math.abs(bar.px - bar.nm / bar.nmPerPx) < 1,
     "...and its PIXEL length is its nanometre length divided by what a pixel is worth. This is "
     + "the assertion the whole file exists for: a bar that is drawn a different length from the "
     + "one it is labelled with is a lie somebody will measure off a figure.",
     bar.px + " px for " + bar.label);

  console.log("\nand it follows the camera");
  const follow = await p.evaluate(`(() => {
    const was = UJ.mesh3d.frame();
    const b1 = UJ.mesh3dshot.barFor(was.nmPerPx, was.w);
    window.__v.dist = window.__v.dist / 2;             // zoom in by two
    const now = UJ.mesh3d.frame();
    const b2 = UJ.mesh3dshot.barFor(now.nmPerPx, now.w);
    window.__v.dist = window.__v.dist * 2;
    return { was: was.nmPerPx, now: now.nmPerPx, b1: b1.label, b2: b2.label,
             px1: b1.px, px2: b2.px, nm1: b1.nm, nm2: b2.nm };
  })()`);
  ok(Math.abs(follow.now - follow.was / 2) / follow.was < 0.01,
     "closing in by two halves what a pixel is worth",
     follow.was.toFixed(1) + " -> " + follow.now.toFixed(1) + " nm/px");
  ok(follow.nm2 < follow.nm1 || follow.px2 > follow.px1,
     "...so the bar either names a smaller number or draws longer — what it must NOT do is stay "
     + "the same picture with the same label",
     follow.b1 + " (" + follow.px1 + " px) -> " + follow.b2 + " (" + follow.px2 + " px)");

  console.log("\nthe picture really has the bar in it");
  const png = await p.evaluate(`(async () => {
    const blob = await UJ.mesh3dshot.imageBlob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    const sig = Array.from(buf.slice(0, 8)).join(",");
    /* Decode it back and look for the bar: the longest horizontal run of pixels in the page's own
       INK, in the bottom fifth, which is where it is drawn. Ink rather than "light", because the
       bar takes the theme's colour -- near-white on the dark theme, near-black on the light one --
       and a check that looked for white would quietly stop finding it on half the pages. */
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    const hex = parseInt(ink.replace("#", ""), 16);
    const ir = (hex >> 16) & 255, ig = (hex >> 8) & 255, ib = hex & 255;
    let best = 0;
    for (let y = Math.floor(c.height * 0.80); y < c.height; y++){
      let run = 0;
      for (let x = 0; x < c.width; x++){
        const i = (y * c.width + x) * 4;
        const isInk = Math.abs(d[i] - ir) < 24 && Math.abs(d[i+1] - ig) < 24
                   && Math.abs(d[i+2] - ib) < 24;
        run = isInk ? run + 1 : 0;
        if (run > best) best = run;
      }
    }
    const f = UJ.mesh3d.frame();
    const b = UJ.mesh3dshot.barFor(f.nmPerPx, f.w);
    URL.revokeObjectURL(url);
    return { sig: sig, w: img.width, h: img.height, bytes: buf.length, run: best, want: b.px };
  })()`);
  ok(png.sig === "137,80,78,71,13,10,26,10", "it is a PNG", png.sig);
  ok(png.w === scale.w && png.h === scale.h,
     "...the size of the panel's own frame", png.w + "x" + png.h);
  ok(Math.abs(png.run - png.want) <= 3,
     "...with a bar drawn in it exactly as long as barFor said. Measured off the decoded picture, "
     + "not off the code that drew it.",
     png.run + " px of bar found, " + png.want + " expected");

  console.log("\nand the turn is a gif");
  const gif = await p.evaluate(`(async () => {
    const yaw0 = window.__v.yaw;
    const t0 = performance.now();
    const blob = await UJ.mesh3dshot.turnBlob({ frames: 24 });
    const ms = Math.round(performance.now() - t0);
    const b = new Uint8Array(await blob.arrayBuffer());
    const sig = String.fromCharCode.apply(null, b.slice(0, 6));
    const w = b[6] | (b[7] << 8), h = b[8] | (b[9] << 8);
    /* COUNTED BY WALKING THE BLOCKS, not by looking for 0x2C in the bytes. The first version did
       the latter and reported 568 frames for a 24-frame turn, because 0x2C is a perfectly ordinary
       byte inside LZW data -- an assertion that cannot fail is not an assertion. */
    let n = 0, i = 13;
    if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));     // global colour table
    const skipSubBlocks = () => { while (i < b.length && b[i]) i += b[i] + 1; i++; };
    while (i < b.length && b[i] !== 0x3B){
      if (b[i] === 0x21){ i += 2; skipSubBlocks(); }          // extension: label, then sub-blocks
      else if (b[i] === 0x2C){
        n++;
        const flags = b[i + 9];
        i += 10;
        if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1));  // local colour table
        i++;                                                  // LZW minimum code size
        skipSubBlocks();
      } else break;                                           // not a structure we understand
    }
    return { sig: sig, w: w, h: h, n: n, bytes: b.length, ms: ms,
             yawBack: Math.abs((window.__v.yaw || 0) - yaw0) < 1e-9 };
  })()`);
  ok(gif.sig === "GIF89a", "it is a GIF", gif.sig);
  ok(gif.w === scale.w && gif.h === scale.h, "...the size of the panel", gif.w + "x" + gif.h);
  ok(gif.n === 24, "...with every frame of the turn in it, and no more",
     gif.n + " frames for the 24 asked for");
  ok(gif.bytes > 5000 && gif.bytes < 4000000,
     "...and a size somebody can actually send", (gif.bytes / 1048576).toFixed(2) + " MB in "
     + gif.ms + " ms");
  ok(gif.yawBack,
     "the camera is put back where it was — a turn is an export, not a navigation",
     gif.yawBack ? "same yaw" : "the model was left turned");

  /* ── WHAT IS IN THE PICTURE, SAID ON THE PICTURE ─────────────────────────────────────────
     Søren: *"we also need to have a tool logo in the lower right corner and the cell name and
     organelle names in the top left corner. Make sure it does not overcrowd the image."*

     The panel knows what it is drawing — every surface carries a `what` and now a `label` — so the
     caption and the corner block are the same list, read once. The cap is what keeps the promise
     about overcrowding: four lines and then a count, never more. */
  console.log("\nthe picture says what is in it");
  const legend = await p.evaluate(`(() => {
    const M = UJ.mesh3d, ball = ${BALL}, h = document.getElementById("h"); h.innerHTML = "";
    const cell = ball(50,0,0,0), nuc = ball(8,12,6,0);
    const gc = M.prepare(cell.positions, cell.indices, { unitNm: 1000 });
    const gn = M.prepare(nuc.positions, nuc.indices,
                         { unitNm: 1000, frame: { mid: gc.mid, span: gc.span } });
    window.__v = {};
    M.show(h, gc, { what: "cell", label: "Cell 864691135194795306", alpha: 0.3, view: window.__v,
                    ghosts: [{ geo: gn, what: "nucleus", label: "Nucleus 485387",
                               tint: M.NUC_TINT, alpha: 1 }] });
    return { legend: M.legend().map(q => q.label), caption: UJ.mesh3dshot.captionFor() };
  })()`);
  ok(legend.legend.length === 2 && /864691135194795306/.test(legend.legend[0]),
     "the panel hands back what it is drawing, in the words the caller gave it",
     legend.legend.join(" / "));
  ok(/864691135194795306/.test(legend.caption) && /485387/.test(legend.caption),
     "...and the caption names the cell and what is in it", legend.caption.slice(0, 110));

  const marks = await p.evaluate(`(async () => {
    const blob = await UJ.mesh3dshot.imageBlob();
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    const hx = parseInt(ink.replace("#",""), 16);
    const near = (i) => Math.abs(d[i] - ((hx>>16)&255)) < 40 && Math.abs(d[i+1] - ((hx>>8)&255)) < 40
                     && Math.abs(d[i+2] - (hx&255)) < 40;
    /* How much ink is in each corner, as a share of that corner's pixels. A block of type is a few
       per cent; an empty corner is none. */
    const inked = (x0, y0, x1, y1) => {
      let n = 0, t = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++){ t++; if (near((y*c.width+x)*4)) n++; }
      return n / t;
    };
    const W = c.width, H = c.height;
    URL.revokeObjectURL(url);
    return { topLeft: inked(0, 0, Math.round(W*0.45), Math.round(H*0.22)),
             bottomRight: inked(Math.round(W*0.62), Math.round(H*0.82), W, H),
             topRight: inked(Math.round(W*0.70), 0, W, Math.round(H*0.14)),
             middle: inked(Math.round(W*0.3), Math.round(H*0.35), Math.round(W*0.7), Math.round(H*0.65)) };
  })()`);
  ok(marks.topLeft > 0.004,
     "the cell's name and what is in it are written in the top-left corner",
     (marks.topLeft * 100).toFixed(2) + "% of that corner is ink");
  ok(marks.bottomRight > 0.004,
     "...and the tool's own wordmark in the bottom-right, read off the page's own logo rather than "
     + "a picture of one copied in here",
     (marks.bottomRight * 100).toFixed(2) + "%");
  ok(marks.topLeft < 0.12 && marks.bottomRight < 0.12,
     "...and neither of them is a wall of text. Søren: \"Make sure it does not overcrowd the "
     + "image.\" Four lines and then a count, never more.",
     "top-left " + (marks.topLeft * 100).toFixed(1) + "%, bottom-right "
       + (marks.bottomRight * 100).toFixed(1) + "%");

  console.log("\nand the button that does it");
  const btn = await p.evaluate(`(() => {
    const h = document.getElementById("h");
    const t = h.querySelectorAll(".m3d-tool");
    const save = h.querySelector(".m3d-save");
    if (save) save.click();
    const menu = h.querySelector(".m3d-saves");
    return { n: t.length, has: !!save,
             title: save ? save.getAttribute("title") : "",
             choices: menu ? [].slice.call(menu.querySelectorAll("button"))
                               .map(e => e.textContent.trim()) : [] };
  })()`);
  ok(btn.has, "there is a save button in the strip", btn.n + " buttons");
  ok(btn.choices.length === 4,
     "...and it offers four things: save the picture, save the turn, share each",
     btn.choices.join(" / ") || "no menu");
  ok(/picture|png/i.test(btn.choices.join(" ")) && /turn|gif|rotat/i.test(btn.choices.join(" ")),
     "...the picture and the turn", btn.choices.join(" / "));
  ok(btn.choices.filter(t => /share/i.test(t)).length === 2,
     "...and both of them can be shared, because X and Bluesky animate a GIF and LinkedIn tends to "
     + "flatten one — which to send is a decision per post",
     btn.choices.filter(t => /share/i.test(t)).join(" / ") || "no share entries");

  /* ── THE THREE PLACES, AND WHAT CAN ACTUALLY CARRY A PICTURE ─────────────────────────────
     Not one of them takes an image through a link. Asserted here because it is the fact the whole
     design turns on, and because a composer URL that quietly stopped matching would leave the
     desktop route opening a 404 with the caption on the clipboard and no way to tell. */
  console.log("\nand the three places it can go");
  const share = await p.evaluate(`(() => {
    const S = UJ.mesh3dshot;
    const names = S.nets().map(n => n.name);
    const urls = S.nets().map(n => S.composerUrl(n.key, "hello world"));
    return { names: names, urls: urls };
  })()`);
  ok(/bluesky/i.test(share.names.join(" ")) && /linkedin/i.test(share.names.join(" "))
     && /\bX\b/.test(share.names.join(" ")),
     "Bluesky, LinkedIn and X", share.names.join(", "));
  ok(share.urls.every(u => /^https:\/\//.test(u)),
     "...each with a composer to open", share.urls.map(u => u.split("/")[2]).join(", "));
  ok(/hello%20world|hello\+world/.test(share.urls.join(" ")),
     "...and the caption travels in the ones that take text", 
     share.urls.filter(u => /hello/.test(u)).length + " of 3 carry it");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
