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
    /* The light block as well, because the last section below encodes a GIF in both themes and the
       light one is the harder of the two: its field's middle is the page's own white, hard against
       the top of the range. 2026-10-04. */
    + ':root[data-theme="light"]{--bg:#ffffff;--panel:#f6f8fa;--line:#d0d7de;--ink:#1f2328;'
    + '--mut:#57606a;--accent:#0f766e;--bad:#cf222e}'
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

  /* ── WHAT THE PICTURE IS OF, SAID ON THE PICTURE ─────────────────────────────────────────
     Søren, on the exported figure: *"Instead of the cell and nucleus IDs, I want the verdict on the
     cell type and the coordinates of the center of the nucleus. If there are organelles included, I
     want the type(s) of organelles not their numbers."*

     THREE FACTS AND NOT A LIST OF SURFACES. The verdict belongs to the cell, the coordinate to the
     nucleus, and the organelles collapse to their kinds — so this asserts that two mitochondria
     produce the word once, that the cell and the nucleus are not themselves listed as kinds, and
     that the ids do not appear anywhere on the picture or in the caption. The caption reads the
     same three lines, so the post and the figure cannot disagree.

     The overcrowding cap moved with it: three lines, and the third holds at most three kinds
     before it counts. 2026-10-04. */
  console.log("\nthe picture says what it is of");
  const legend = await p.evaluate(`(() => {
    const M = UJ.mesh3d, ball = ${BALL}, h = document.getElementById("h"); h.innerHTML = "";
    const cell = ball(50,0,0,0), nuc = ball(8,12,6,0);
    const gc = M.prepare(cell.positions, cell.indices, { unitNm: 1000 });
    const fr = { unitNm: 1000, frame: { mid: gc.mid, span: gc.span } };
    const gn = M.prepare(nuc.positions, nuc.indices, fr);
    /* Two mitochondria and one lysosome, so "kinds not numbers" has something to collapse. */
    const m1 = ball(4, -20, 10, 5), m2 = ball(4, 22, -12, -6), ly = ball(3, 0, -25, 10);
    const g1 = M.prepare(m1.positions, m1.indices, fr);
    const g2 = M.prepare(m2.positions, m2.indices, fr);
    const gl2 = M.prepare(ly.positions, ly.indices, fr);
    window.__v = {};
    M.show(h, gc, { what: "cell", alpha: 0.3, view: window.__v,
                    about: { verdict: "Pyramidal cell", atVox: [216448, 164096, 21360] },
                    ghosts: [{ geo: gn, what: "nucleus", tint: M.NUC_TINT, alpha: 1 },
                             { geo: g1, label: "Mitochondrion", alpha: 1 },
                             { geo: g2, label: "mitochondrion", alpha: 1 },
                             { geo: gl2, label: "Lysosome", alpha: 1 }] });
    return { L: M.legend(), caption: UJ.mesh3dshot.captionFor() };
  })()`);
  ok(legend.L.verdict === "Pyramidal cell",
     "the panel hands back the VERDICT, not the root id", legend.L.verdict);
  ok(String(legend.L.atVox) === "216448,164096,21360",
     "...and the nucleus's own centre, in voxels", String(legend.L.atVox));
  ok(legend.L.kinds.length === 2 && /^Mitochondrion$/.test(legend.L.kinds[0])
     && /^Lysosome$/.test(legend.L.kinds[1]),
     "...and the organelles as KINDS — two mitochondria are one word, and neither the cell nor the "
     + "nucleus is a kind",
     legend.L.kinds.join(", ") + " (from 5 surfaces)");
  ok(/Pyramidal cell/.test(legend.caption) && /216448, 164096, 21360/.test(legend.caption)
     && /Mitochondrion/.test(legend.caption),
     "...and the caption says the same three things, read off the same call",
     legend.caption.slice(0, 120));
  ok(!/8646911|485387/.test(legend.caption),
     "...and no database key appears on anything somebody is about to post",
     legend.caption.slice(0, 60));

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
     + "image.\" Three lines, and the third holds three kinds before it counts.",
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

  /* ── AND THE GIF IS NOT A SET OF SLABS ────────────────────────────────────────────────────
     Søren, asked where the rings were: the exported PNG and the rotating GIF, not the panel on
     screen. The panel measures clean and so does the PNG; the GIF measured a run of 351 identical
     pixels across a 1240px row, which is a quarter of the picture in one flat colour.

     THE GIF HAS ITS OWN QUANTISER AND IT IS MUCH COARSER THAN EIGHT BITS. gifenc keys every pixel
     by rgb888_to_rgb565 both when it chooses the palette and when it looks one up, so the smallest
     difference it can see is 8 of 255 on red and blue. The field spans eighteen levels. The shader's
     half-level of dither is sized for a framebuffer and is simply invisible here.

     MEASURED IN THE DECODED FILE, not in the canvas it came from — the whole point is that the two
     disagreed. Decode the GIF back into an image, walk a row across the background, and take the
     longest run of one identical pixel. Both themes, because the light one is where it failed
     worst. 2026-10-04. */
  console.log("\nand the turn survives the GIF's own quantiser");
  for (const theme of ["dark", "light"]) {
    const slab = await p.evaluate(`(async () => {
      document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});
      ${SETUP};
      const blob = await UJ.mesh3dshot.turnBlob({ frames: 8, fps: 12 });
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      /* A row above the model and below the two lines of title: field, and nothing else. */
      const d = c.getContext("2d").getImageData(0, Math.round(c.height * 0.22), c.width, 1).data;
      let best = 1, run = 1, k;
      for (k = 1; k < c.width; k++){
        const same = d[k*4] === d[(k-1)*4] && d[k*4+1] === d[(k-1)*4+1]
                  && d[k*4+2] === d[(k-1)*4+2];
        if (same) run++; else { if (run > best) best = run; run = 1; }
      }
      if (run > best) best = run;
      URL.revokeObjectURL(url);
      return { w: c.width, flat: best, bytes: blob.size };
    })()`);
    ok(slab.flat <= 20,
       theme + ": no slab of one colour across the field — undithered it was 234 px (dark) and "
       + "351 px (light) of a 1240 px row",
       slab.flat + " px across " + slab.w + ", " + (slab.bytes / 1048576).toFixed(2) + " MB");
  }
  await p.evaluate(`document.documentElement.removeAttribute("data-theme")`);

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
