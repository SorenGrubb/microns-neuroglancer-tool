/* The 3D panel in the light theme.                                                    2026-10-03

   Søren, with a screenshot: *"The buttons don't work in light mode and the ambient ligt also looks
   bad in light mode"*.

   TWO SEPARATE FAULTS, and only one of them is about light.

   THE BUTTONS. core/mesh3d.js's own stylesheet asked for `background:var(--card,#1a1a1a)`. Of the
   eight pages this module installs itself into, `--card` is declared on exactly TWO — χJump and
   ωJump. The other six (µ δ λ η β π) name that colour `--panel`. So on six pages the fallback was
   taken, and the fallback is a literal dark grey: in the dark theme that is near enough the panel
   colour that nobody noticed, and in the light theme it is a charcoal square carrying a
   `var(--ink)` glyph which in the light theme is #1f2328. Dark on dark. The buttons were there,
   sized and clickable, and invisible: contrast ratio 1.08, where 3.0 is the floor for an icon.

   A LITERAL COLOUR AS THE FALLBACK IS THE BUG, not the missing variable. `var(--card, #1a1a1a)`
   says "if you have no card colour, here is a dark grey" — which is a statement about the theme,
   made by a file that cannot see the theme. The fallback has to be another variable, so that it
   is still the page's own palette that answers.

   THE FIELD. The dark panel has a soft glow behind the model: the background lift, brightest in
   the middle, falling off to the page colour at the edges. The light panel had the same gradient
   with the sign flipped and almost no amplitude -- so the middle was a slightly grey smudge and
   the edges were white, which is a lit stage turned inside out. A light field is shaped by SHADOW
   AT ITS EDGES, not by murk in its middle; a dark field is shaped by light in its middle. Both
   read as "the middle is the lit part", which is the thing asserted below, in both themes at once.

   WHAT IS NOT WRONG, measured before changing anything: the model itself. Rendered calm (after the
   sweep has finished -- a screenshot taken during it catches the travelling light and is not a
   picture of the lighting) the same mesh comes out all but identical in the two themes. The lamps,
   the ambient and the depth cue needed nothing. Measuring first is what kept this to two changes
   instead of a retuned shader.

   Run: node mesh3dlightcheck.js */
const fs = require("fs");
const { chromium } = require("playwright");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* µJump's own two blocks, trimmed to the variables this module reads. `--card` is DELIBERATELY
   absent: that is the state six of the eight pages are in, and a harness that declared it would
   test the two pages where nothing was ever wrong. */
const DARK = ':root{--bg:#0d1117;--panel:#161b22;--line:#2a313c;--ink:#e6edf3;--mut:#8b949e;'
           + '--accent:#27e0b3;--danger:#f85149}:root{--bad:var(--danger)}';
const LIGHT = ':root[data-theme="light"]{--bg:#ffffff;--panel:#f6f8fa;--line:#d0d7de;--ink:#1f2328;'
            + '--mut:#57606a;--accent:#0f766e;--danger:#cf222e}';

const BALL = `((R,cx,cy,cz) => { const P=[],I=[],NU=28,NV=18;
  for (let i=0;i<=NV;i++) for (let j=0;j<=NU;j++){ const th=i/NV*Math.PI, ph=j/NU*Math.PI*2;
    P.push(cx+R*Math.sin(th)*Math.cos(ph), cy+R*Math.cos(th), cz+R*Math.sin(th)*Math.sin(ph)); }
  for (let i=0;i<NV;i++) for (let j=0;j<NU;j++){ const a=i*(NU+1)+j,b=a+1,c=a+NU+1,d=c+1;
    I.push(a,c,b,b,c,d); }
  return { positions:new Float32Array(P), indices:new Uint32Array(I) }; })`;

/* A triangle, parked far enough away to be a few pixels, so the frame IS the field. */
const SPECK = `(() => ({ positions:new Float32Array([0,0,0, 1,0,0, 0,1,0]),
                         indices:new Uint32Array([0,1,2]) }))`;

(async () => {

  /* ── 1. THE FALLBACK IS A VARIABLE, NOT A COLOUR ──────────────────────────────────────────
     Source-level, because it is a rule about where a colour may come from and no rendering can
     state it: a literal fallback that happens to look right in one theme passes every picture. */
  console.log("a shared file names colours the page's way, all the way down");
  let bad = [];
  fs.readdirSync(core("")).filter(f => /\.js$/.test(f)).forEach(f => {
    const s = fs.readFileSync(core(f), "utf8");
    /* var(--something, <anything that is not another var()>) where the thing named is a colour
       that only some of the eight pages declare. --card is the one that caught us; --panel and
       --bg are declared on all eight, so a literal behind THOSE is unreachable and harmless. */
    /* Comments stripped first. The fix left the old rule quoted in a comment, as the reason the
       new one is written the way it is, and a scan that cannot tell a quotation from a rule would
       either lose that note or stay red for ever. */
    const code = s.replace(/\/\*[\s\S]*?\*\//g, " ");
    const re = /var\(\s*--card\s*,\s*([^)]*)\)/g;
    let m;
    while ((m = re.exec(code))) if (!/var\(/.test(m[1])) bad.push(f + ": var(--card," + m[1] + ")");
  });
  ok(bad.length === 0,
     "--card is declared on two of the eight pages, so its fallback has to be the OTHER "
     + "variable the other six use, not a colour picked by a file that cannot see the theme",
     bad.length ? bad.join("; ") : "no literal fallback behind --card");

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"] });
  const p = await b.newPage({ viewport: { width: 760, height: 520 },
                              reducedMotion: "no-preference" });
  p.on("pageerror", e => console.log("PAGEERROR " + e.message));
  await p.setContent('<!doctype html><meta charset="utf-8"><style>' + DARK + LIGHT
    /* TRANSITIONS OFF. The strip fades between .82 and 1 over 150ms, and getComputedStyle
       returns the value mid-fade -- so measuring straight after a click measured the fade and
       called a 5.2:1 glyph 3.75:1. What is asserted here is how a button SETTLES. */
    + '*{transition:none!important}'
    + 'body{margin:0;background:var(--bg)}#h{width:560px;height:320px}</style><div id="h"></div>');
  await p.addScriptTag({ path: core("mesh3d.js") });

  /* ── 2. THE GLYPH CAN BE SEEN, IN EITHER THEME ────────────────────────────────────────────
     Composited, not as authored. The strip sits at opacity .82 over the canvas, so the colour a
     reader meets is the button's colour mixed with whatever the panel painted underneath — which
     is read out of the GL buffer rather than assumed, because the field has a gradient in it. */
  const seen = {};
  for (const theme of ["dark", "light"]) {
    seen[theme] = await p.evaluate(`(() => {
      document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});
      const M = UJ.mesh3d, ball = ${BALL}, h = document.getElementById("h"); h.innerHTML = "";
      const cell = ball(100,0,0,0), nuc = ball(30,22,12,0);
      const gc = M.prepare(cell.positions, cell.indices, { unitNm: 1000 });
      const gn = M.prepare(nuc.positions, nuc.indices, { unitNm: 1000, frame: { mid: gc.mid, span: gc.span } });
      M.show(h, gn, { what: "nucleus", tint: M.NUC_TINT,
                      ghosts: [{ geo: gc, what: "cell", alpha: 0.14 }] });
      const px = v => (String(v).match(/[\\d.]+/g) || []).map(Number).slice(0,3);
      const srgb = c => c.map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
      const L = c => { const s = srgb(c); return 0.2126*s[0]+0.7152*s[1]+0.0722*s[2]; };
      const ratio = (a, b) => { const la = L(a), lb = L(b);
        return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); };
      const cv = h.querySelector(".m3d-canvas"), rc = cv.getBoundingClientRect();
      const under = el => {
        const rb = el.getBoundingClientRect();
        const x = Math.round((rb.left + rb.width/2 - rc.left) * (cv.width / rc.width));
        const y = Math.round(cv.height - (rb.top + rb.height/2 - rc.top) * (cv.height / rc.height));
        let got = null;
        M.probePixels((r,g,bb,qx,qy) => { if (qx === x && qy === y) got = [r,g,bb]; return false; });
        return got || [0,0,0];
      };
      /* ── ALL FOUR, AND IN BOTH STATES ────────────────────────────────────────────────────
         Søren's second screenshot showed the spin and nucleus buttons lit in the accent colour
         and the other two blank: *"Two of the buttons are really hard to see in light mode"*. A
         button that has been pressed takes color:var(--accent) and one that has not takes
         var(--ink), so measuring one button measures one of the two states. The worst of the
         eight is what a reader meets. */
      const all = [].slice.call(h.querySelectorAll(".m3d-tool"));
      h.querySelector(".m3d-spin").click();        // on: accent
      h.querySelector(".m3d-nuc").click();
      const score = el => {
        const bs2 = getComputedStyle(el), u2 = under(el), op2 = parseFloat(bs2.opacity);
        const c2 = c => c.map((v,i) => op2*v + (1-op2)*u2[i]);
        return { glyph: ratio(c2(px(bs2.backgroundColor)), c2(px(bs2.color))),
                 edge: Math.max(ratio(c2(px(bs2.borderTopColor)), u2),
                                ratio(c2(px(bs2.backgroundColor)), u2)) };
      };
      const lit = all.map(score);
      h.querySelector(".m3d-spin").click();        // and back to resting
      h.querySelector(".m3d-nuc").click();
      const rest = all.map(score);
      const worst = k => Math.round(Math.min.apply(null,
        lit.concat(rest).map(q => q[k])) * 100) / 100;

      const btn = h.querySelector(".m3d-tool"), bs = getComputedStyle(btn);
      const u = under(btn), op = parseFloat(bs.opacity);
      const comp = c => c.map((v,i) => op*v + (1-op)*u[i]);
      const bg = px(bs.backgroundColor), fg = px(bs.color), ln = px(bs.borderTopColor);
      return { buttons: all.length,
               opacity: op, under: u,
               glyph: worst("glyph"), edgeWorst: worst("edge"),
               detail: all.map((el, i) => el.className.replace("m3d-tool ", "") + " lit "
                 + lit[i].glyph.toFixed(2) + "/" + lit[i].edge.toFixed(2) + " rest "
                 + rest[i].glyph.toFixed(2) + "/" + rest[i].edge.toFixed(2)),
               first: Math.round(ratio(comp(bg), comp(fg)) * 100) / 100,
               /* A RATIO, not a difference. Relative luminance is compressed at the dark end --
                  a border that is plainly visible on a near-black field is 0.01 apart from it and
                  0.14 apart on a white one, so a difference threshold asks far more of the dark
                  theme than of the light one. Caught by this check's first run, which called the
                  dark theme's perfectly visible border a failure.

                  FILL OR BORDER, WHICHEVER IS DOING THE WORK. They are not doing the same job in
                  the two themes: --panel and --bg are nearly the same colour in the dark theme and
                  the border carries it, while in the light theme the fill is bright against the
                  vignetted corner and the border is nearly the colour of that corner. Asserting on
                  the border alone would have demanded a darker line in the light theme for no
                  reason a reader could see. */
               edge: Math.round(Math.max(ratio(comp(ln), u), ratio(comp(bg), u)) * 100) / 100 };
    })()`);
    const s = seen[theme];
    ok(s.buttons === 4, theme + ": all four buttons are there to be judged", s.buttons);
    if (process.env.M3DDEBUG) console.log("    " + s.detail.join("\n    "));
    ok(s.glyph >= 4.5,
       theme + ": every glyph stands off its own button, pressed and unpressed — 3.0 is the floor "
       + "for an icon under WCAG 1.4.11, and the light theme was managing 1.08",
       "worst of eight: " + s.glyph + ":1");
    /* 1.15 is a DRIFT GUARD, not a standard. WCAG's 3.0 for non-text applies to the glyph, which
       is asserted above; a resting button is meant to be unobtrusive and both themes honestly
       manage 1.17-1.33 here. The bar is set just under that so the day a palette change makes the
       strip vanish into the field, something says so -- it is not an invitation to draw a heavier
       box than the design wants. */
    ok(s.edgeWorst >= 1.15,
       theme + ": ...and the button's edge stands off the field behind it, so it reads as a "
       + "button rather than a glyph floating on the canvas",
       "worst of eight: " + s.edgeWorst + ":1");
  }

  /* ── 3. THE MIDDLE IS THE LIT PART, IN BOTH THEMES ────────────────────────────────────────
     One sentence covering two opposite gradients: the dark field is brightest in the middle
     because light is added there, the light field is brightest in the middle because shadow is
     taken away at the edges. The light panel used to be the other way round -- grey in the middle
     and white at the rim -- which is the look Søren called bad, and is a lit stage inside out. */
  console.log("the field is a stage, not a smudge");
  for (const theme of ["dark", "light"]) {
    const f = await p.evaluate(`(() => {
      document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});
      const M = UJ.mesh3d, h = document.getElementById("h"); h.innerHTML = "";
      const t = ${SPECK}();
      const g = M.prepare(t.positions, t.indices, { unitNm: 1000 });
      /* Far enough that the model is a few pixels and everything measured below is field. */
      M.show(h, g, { what: "cell", view: { dist: 400, yaw: 0, pitch: 0 } });
      const cv = h.querySelector(".m3d-canvas");
      const lum = c => 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
      /* Off-centre vertically so the speck is not in the sample. */
      const cx = Math.round(cv.width*0.5), cy = Math.round(cv.height*0.46);
      let mid = null, cor = null;
      M.probePixels((r,g2,b2,x,y) => {
        if (x === cx && y === cy) mid = [r,g2,b2];
        if (x === 3 && y === 3) cor = [r,g2,b2];
        return false; });
      return { mid: mid, corner: cor, lift: Math.round(lum(mid) - lum(cor)) };
    })()`);
    ok(f.lift >= 14,
       theme + ": the middle of the field is lighter than its corner — the light theme was 13 "
       + "the WRONG way, a grey patch behind the specimen",
       f.lift + " of 255 (" + f.mid.join(",") + " vs " + f.corner.join(",") + ")");
  }

  /* ── AND IT IS A GRADIENT, NOT A SET OF RINGS ─────────────────────────────────────────────
     Søren, with an exported picture: *"The background looks bad because the circles are visible
     and not a gradient."*

     The gradient is real and smooth; the 8-bit buffer it lands in is not. It spans about 35 levels
     across 600 pixels, so each level is seventeen pixels wide — and because the falloff is radial,
     those steps are concentric CIRCLES. Mach banding, and the eye is very good at it: the flat
     patches look flatter than they are and the joins read as edges.

     MEASURED AS THE WIDEST FLAT PATCH along a line that crosses the whole field. Banding gives runs
     of one identical 8-bit triple sixty pixels wide; a dithered gradient gives none longer than a
     few. Counting "steps" instead would pass a picture with the same number of narrower bands. */
  console.log("\nthe field is a gradient, not a set of rings");
  for (const theme of ["dark", "light"]) {
    const band = await p.evaluate(`(() => {
      document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});
      const M = UJ.mesh3d, h = document.getElementById("h"); h.innerHTML = "";
      const t = ${SPECK}();
      const g = M.prepare(t.positions, t.indices, { unitNm: 1000 });
      M.show(h, g, { what: "cell", view: { dist: 600, yaw: 0, pitch: 0 } });
      const cv = h.querySelector(".m3d-canvas");
      const row = Math.round(cv.height * 0.25);
      const line = [];
      M.probePixels((r,g2,b2,x,y) => { if (y === row) line[x] = r + "," + g2 + "," + b2; return false; });
      let best = 1, run = 1;
      for (let i = 1; i < line.length; i++){
        if (line[i] === line[i-1]) run++; else { if (run > best) best = run; run = 1; }
      }
      if (run > best) best = run;
      return { width: line.length, flat: best };
    })()`);
    ok(band.flat <= 8,
       theme + ": no flat patch wider than a few pixels — the steps were 58 to 68 wide, which on a "
       + "radial falloff is a set of visible rings",
       band.flat + " px of one value across " + band.width);
  }

  /* ── AND THE FALLOFF HAS NO CORNER IN IT ──────────────────────────────────────────────────
     Søren, after the dither: *"It is still too clear borders."*

     THE EYE DOES NOT SEE BRIGHTNESS, IT SEES THE CHANGE IN BRIGHTNESS -- and what makes an edge is
     the change in THAT. A field can be perfectly monotonic and still show a ring, if its slope
     stops changing at one radius and resumes at another. So the thing to assert is the SECOND
     difference, as a share of the whole range: a profile that falls 20 levels with no step in the
     slope bigger than a fiftieth of that has nowhere for an edge to be.

     MEASURED ALONG A ROW, NOT IN ANNULI. The first attempt averaged concentric bands and reported a
     slope that collapsed to a tenth partway out -- in BOTH themes, at the same band index, whatever
     the shader did, because past the radius where a circle leaves the top and bottom of a wide
     canvas each band is a different SHAPE and the average is measuring the frame rather than the
     field. A straight run out from the centre, averaged over 37 rows so the dither cancels, has no
     geometry of its own. 2026-10-04. */
  console.log("\nthe falloff has no corner in it");
  for (const theme of ["dark", "light"]) {
    const prof = await p.evaluate(`(() => {
      document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});
      const M = UJ.mesh3d, h = document.getElementById("h"); h.innerHTML = "";
      const t = ${SPECK}();
      const g = M.prepare(t.positions, t.indices, { unitNm: 1000 });
      M.show(h, g, { what: "cell", view: { dist: 900, yaw: 0, pitch: 0 } });
      const cv = h.querySelector(".m3d-canvas");
      const W = cv.width, H = cv.height, N = 20;
      const y0 = Math.round(H*0.46) - 18, y1 = Math.round(H*0.46) + 18, cx = Math.round(W/2);
      const sum = new Array(N).fill(0), cnt = new Array(N).fill(0);
      M.probePixels((r,g2,b2,x,y) => {
        if (y < y0 || y > y1 || x < cx) return false;
        const k = Math.min(N-1, Math.floor((x - cx) / (W - cx) * N));
        sum[k] += 0.2126*r + 0.7152*g2 + 0.0722*b2; cnt[k]++;
        return false; });
      const v = sum.map((s,i) => cnt[i] ? s/cnt[i] : 0);
      const d1 = [], d2 = [];
      for (let i = 1; i < N; i++) d1.push(v[i] - v[i-1]);
      for (let i = 1; i < d1.length; i++) d2.push(Math.abs(d1[i] - d1[i-1]));
      const span = Math.max.apply(null, v) - Math.min.apply(null, v);
      return { span: +span.toFixed(2), bend: +Math.max.apply(null, d2).toFixed(2),
               share: +(Math.max.apply(null, d2) / span).toFixed(3),
               slope: d1.map(x => +x.toFixed(2)) };
    })()`);
    ok(prof.span >= 6 && prof.share <= 0.02,
       theme + ": the slope out from the middle changes smoothly — a kink of more than a fiftieth "
       + "of the range is a radius the eye can find",
       "span " + prof.span + ", worst bend " + prof.bend + " ("
       + (100 * prof.share).toFixed(1) + "%), slope " + prof.slope.join(" "));
  }

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
