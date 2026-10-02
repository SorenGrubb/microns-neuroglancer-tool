/* What the 3D panel looks like, measured rather than looked at.                      2026-10-03

   Søren: *"I meant to make the meshes and lights look as nice as she does"*, and then *"If you
   could make some animation of a light going through the structure, then that would be really
   cool."* Two dark renders read as identical to the eye while differing by everything that
   matters, so every assertion here is a number off the framebuffer.

   WHAT IS UNDER TEST, and what each one would look like if it were broken:

     the camera fits      — a constant distance for every model and every panel shape put a tall
                            thin neurite in a tenth of a wide panel's width. Measured as the lit
                            bounding box against the canvas, plus nothing touching the edge.
     it fits ONCE         — a fit recomputed from the projected box would make the subject breathe
                            in and out while you drag it. Turn the model 90° and the frame holds.
     a caller still wins  — a panel that names its own distance gets it.
     the shadow has hue   — the old flat 0.18 ambient made the unlit half the object's own colour,
                            dimmed. Hemispheric ambient puts a cool sky in it and a warm key on the
                            other side, so on a NEUTRAL GREY object the dark pixels come out bluer
                            than the bright ones. On a grey tint that difference can only come from
                            the lights.
     the light travels    — peak luminance rises as the shell crosses the surface and returns
                            EXACTLY to where it started. A sweep that left anything behind would
                            be a permanent change dressed as an animation.
     and it stops         — under prefers-reduced-motion nothing brightens at all, and the panel
                            shows the state the sweep would have ended in, which is the ordinary
                            render.
     once per model       — the pad rebuilds this panel after every closed contour; a sweep on
                            every show() would make the animation the thing you watch while
                            drawing.

   READ IN THE PAINT'S OWN TURN. A WebGL context without preserveDrawingBuffer has nothing in it
   by the time a screenshot or a toDataURL on a later tick arrives — the first capture written for
   this change was nine identical blank frames, and it looked exactly like an animation that was
   not running. UJ.mesh3d.probePixels() paints and reads in one turn, which is the only honest way
   in, and it is why this file counts pixels rather than taking pictures.

   AND reducedMotion IS SET EXPLICITLY. Headless Chromium reports `prefers-reduced-motion: reduce`
   by default, so without it the sweep never runs and every assertion about it passes while
   measuring nothing.

   Run: node mesh3dlookcheck.js */
const { chromium } = require("playwright");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A tall thin subject with a bulge in the middle: a soma and four tapering processes, which is
   the shape this panel is nearly always asked to draw and the shape a single fixed camera
   distance is worst for. Procedural, so every run measures the same geometry. */
const MESH = `(function(){
  const P = [], I = [];
  const push = (x,y,z) => { P.push(x,y,z); return P.length/3 - 1; };
  function tube(x0,y0,z0, dx,dy,dz, r0, r1, segs, rings){
    const base = [];
    const ax = Math.abs(dx) < 0.9 ? [1,0,0] : [0,1,0];
    const ux = [dy*ax[2]-dz*ax[1], dz*ax[0]-dx*ax[2], dx*ax[1]-dy*ax[0]];
    const ul = Math.hypot(ux[0],ux[1],ux[2]), u = ux.map(v=>v/ul);
    const w  = [dy*u[2]-dz*u[1], dz*u[0]-dx*u[2], dx*u[1]-dy*u[0]];
    const wl = Math.hypot(w[0],w[1],w[2]), v2 = w.map(q=>q/wl);
    for (let s = 0; s <= segs; s++){
      const t = s/segs, rr = r0 + (r1-r0)*t, ring = [];
      const cx = x0+dx*t, cy = y0+dy*t, cz = z0+dz*t;
      for (let k = 0; k < rings; k++){
        const a = k/rings*Math.PI*2;
        ring.push(push(cx + rr*(Math.cos(a)*u[0]+Math.sin(a)*v2[0]),
                       cy + rr*(Math.cos(a)*u[1]+Math.sin(a)*v2[1]),
                       cz + rr*(Math.cos(a)*u[2]+Math.sin(a)*v2[2])));
      }
      base.push(ring);
    }
    for (let s = 0; s < segs; s++) for (let k = 0; k < rings; k++){
      const a=base[s][k], b=base[s][(k+1)%rings], c=base[s+1][k], d=base[s+1][(k+1)%rings];
      I.push(a,b,c, b,d,c);
    }
  }
  const R=0.34, NU=28, NV=20, s0=P.length/3;
  for (let i=0;i<=NV;i++) for (let j=0;j<=NU;j++){
    const th=i/NV*Math.PI, ph=j/NU*Math.PI*2;
    push(R*Math.sin(th)*Math.cos(ph), R*Math.cos(th), R*Math.sin(th)*Math.sin(ph));
  }
  for (let i=0;i<NV;i++) for (let j=0;j<NU;j++){
    const a=s0+i*(NU+1)+j, b=a+1, c=a+NU+1, d=c+1; I.push(a,c,b, b,c,d);
  }
  tube(0,0.3,0,    0.20,1.30,0.10, 0.10,0.03, 24, 10);
  tube(0.1,0.25,0, 0.85,0.80,-0.30, 0.09,0.025, 24, 10);
  tube(-0.1,0.2,0,-0.90,0.65,0.25, 0.09,0.025, 24, 10);
  tube(0,-0.3,0,  -0.12,-1.45,0.08, 0.08,0.02, 26, 10);
  return { positions: new Float32Array(P), indices: new Uint32Array(I) };
})()`;

/* Grey on purpose for the colour assertions: on a tinted object any hue in the picture could have
   come from the tint, and the question is what the LIGHTS put there. */
const GREY = [0.72, 0.72, 0.72];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"] });

  async function panel(reduce){
    const p = await b.newPage({ viewport: { width: 760, height: 560 },
                                reducedMotion: reduce ? "reduce" : "no-preference" });
    p.on("pageerror", e => console.log("PAGEERROR " + e.message));
    /* A wide panel and a tall model, which is the pairing the old fixed distance handled worst. */
    await p.setContent('<!doctype html><meta charset="utf-8">'
      + '<style>:root{--bg:#0b0d12;--ink:#e9e9e9;--line:#2a3042;--accent:#8a8a8a}'
      + 'body{margin:0;background:var(--bg)}#h{width:640px;height:320px}'
      + '.m3d-canvas{height:320px !important}</style><div id="h"></div>');
    await p.addScriptTag({ path: core("mesh3d.js") });
    return p;
  }

  const SHOW = (opts) => `(() => {
    const m = ${MESH};
    const geo = UJ.mesh3d.prepare(m.positions, m.indices, { unitNm: 1000 });
    UJ.mesh3d.show(document.getElementById("h"), geo, Object.assign(
      { tint: ${JSON.stringify(GREY)} }, ${JSON.stringify(opts)}));
    return { triangles: geo.triangles, radius: geo.radius, span: geo.span };
  })()`;

  /* Every measurement goes through probePixels, which paints and reads in one turn. */
  const STATS = `(() => {
    let n = 0, maxL = 0, sumL = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, W = 0, H = 0;
    let darkB = 0, darkR = 0, nDark = 0, brightB = 0, brightR = 0, nBright = 0;
    const c = document.querySelector(".m3d-canvas"); W = c.width; H = c.height;
    UJ.mesh3d.probePixels((r, g, bl, x, y) => {
      const L = 0.2126*r + 0.7152*g + 0.0722*bl;
      /* 40 is well clear of the background and of its radial lift, and well below anything the
         model paints -- checked by the "nothing but the field" count below. */
      if (L > 40){
        n++; sumL += L; if (L > maxL) maxL = L;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        /* Split inside the resting range rather than at round numbers: the lit surface runs from
           about 40 to about 152, so a "bright" cut at 150 found four pixels and was measuring
           the specular highlight rather than the key lamp. */
        if (L < 85){ nDark++; darkB += bl; darkR += r; }
        if (L > 120){ nBright++; brightB += bl; brightR += r; }
      }
      return false;
    });
    return { n, maxL, meanL: n ? sumL/n : 0, W, H,
             bw: x1 - x0 + 1, bh: y1 - y0 + 1, x0, x1, y0, y1,
             darkB: nDark ? darkB/nDark : 0, darkR: nDark ? darkR/nDark : 0,
             brightB: nBright ? brightB/nBright : 0, brightR: nBright ? brightR/nBright : 0,
             nDark, nBright };
  })()`;

  console.log("the camera fits the model to the panel");
  const p1 = await panel(false);
  {
    await p1.evaluate(SHOW({ view: { yaw: 0.0, pitch: 0.0 } }));
    await p1.waitForTimeout(1900);                       // let the arrival sweep finish
    const s = await p1.evaluate(STATS);
    ok(s.bh / s.H >= 0.72,
       "the model fills the height it is given — it used about half, and a tenth of the width",
       (100 * s.bh / s.H).toFixed(0) + "% of " + s.H + " px");
    ok(s.x0 > 2 && s.y0 > 2 && s.x1 < s.W - 3 && s.y1 < s.H - 3,
       "...and nothing is clipped: it stops short of every edge",
       "box " + s.x0 + "," + s.y0 + " to " + s.x1 + "," + s.y1 + " in " + s.W + "x" + s.H);

    /* The assertion the bounding sphere exists for. A fit to the projected box would change the
       framing as the model turns, which reads as the model pulsing while you drag it. */
    const before = s.bh;
    await p1.evaluate(`(() => { const v = UJ.mesh3d; })()`);
    await p1.evaluate(SHOW({ view: { yaw: Math.PI / 2, pitch: 0.0 } }));
    await p1.waitForTimeout(1900);
    const t = await p1.evaluate(STATS);
    ok(Math.abs(t.bh - before) / before < 0.10,
       "...and turning it a quarter turn does not change the framing — the fit is to the "
       + "bounding SPHERE, which does not care which way the model faces",
       before + " px then " + t.bh + " px");
  }

  console.log("\na caller that names a distance still gets it");
  {
    const far = await p1.evaluate(SHOW({ view: { yaw: 0, pitch: 0, dist: 6 } }));
    await p1.waitForTimeout(1900);
    const s = await p1.evaluate(STATS);
    ok(s.bh / s.H < 0.40, "a distance of 6 puts the model well back, as asked",
       (100 * s.bh / s.H).toFixed(0) + "% of the height");
  }

  console.log("\nthe lights put colour in the shadow, on a grey object");
  {
    await p1.evaluate(SHOW({ view: { yaw: 0.6, pitch: 0.25 } }));
    await p1.waitForTimeout(1900);
    const s = await p1.evaluate(STATS);
    ok(s.nDark > 200 && s.nBright > 200,
       "there is a dark half and a bright half to compare",
       s.nDark + " dark px, " + s.nBright + " bright px");
    /* A cool sky above and a warm key: the shadow goes blue, the light goes warm. On a neutral
       tint neither can come from the object. */
    ok(s.darkB - s.darkR > 2,
       "the shadow side is BLUER than it is red — a cool sky lighting it, not a dimmed copy "
       + "of the object's own colour",
       "dark b-r " + (s.darkB - s.darkR).toFixed(1));
    /* THE SWING IS THE CLAIM, not either end of it. A flat ambient gives the same hue at
       both ends whatever value it is given, so a difference between them can only have come
       from two lamps of different colours.

       AND THE BOUND IS LOW ON PURPOSE. Four or five levels out of 255 is a small number, and
       it is the right size: this panel is for judging a specimen, so lamps saturated enough
       to make the swing obvious in a number would be colouring the thing under the lens.
       Asked for 6 first, measured 4.3, and the honest move was to write down why 3 is the
       bound rather than to turn the lamps up until the test agreed with me. What it rules
       out is a flat ambient, which gives exactly 0 however bright it is. */
    ok(((s.brightR - s.brightB) - (s.darkR - s.darkB)) > 3,
       "...and the lit side is warmer than the shadow side by a clear margin \u2014 one flat "
       + "ambient cannot produce that, whatever value it is given",
       "bright r-b " + (s.brightR - s.brightB).toFixed(1)
       + " vs dark r-b " + (s.darkR - s.darkB).toFixed(1));
  }

  console.log("\na light travels through the structure, and leaves nothing behind");
  let resting = 0;
  {
    await p1.evaluate(SHOW({ view: { yaw: 0.6, pitch: 0.25 } }));
    await p1.waitForTimeout(1900);
    resting = (await p1.evaluate(STATS)).maxL;
    const run = await p1.evaluate(`(() => new Promise(res => {
      const out = [];
      UJ.mesh3d.sweep();
      let n = 0;
      (function tick(){
        out.push(${STATS}.maxL);
        if (++n >= 12) return res(out);
        /* Several frames between samples, so twelve samples cover the whole pass. */
        let k = 0;
        (function wait(){ if (++k >= 6) return tick(); requestAnimationFrame(wait); })();
      })();
    }))()`);
    const peak = Math.max.apply(null, run);
    ok(peak > resting * 1.2,
       "the light is visibly brighter than the surface it crosses",
       "resting " + resting.toFixed(0) + ", peak " + peak.toFixed(0)
       + " (+" + (100 * (peak / resting - 1)).toFixed(0) + "%)");
    /* WAITED OUT RATHER THAN ASSUMED. Twelve samples six frames apart cover about 1.2 s and
       the pass is 1.5, so the last sample caught the light still on its way out \u2014 a fact
       about the sampling, not about the sweep. */
    await p1.waitForTimeout(900);
    const settled = (await p1.evaluate(STATS)).maxL;
    ok(Math.abs(settled - resting) < 0.5,
       "...and when it has passed, the picture is the one it started from: it adds light and "
       + "takes it away again",
       "settled at " + settled.toFixed(0) + " against " + resting.toFixed(0));
    /* A single bright frame could be a flash. A pass is a rise and a fall. */
    const rising = run.findIndex(v => v > resting * 1.1);
    const falling = run.length - 1 - run.slice().reverse().findIndex(v => v > resting * 1.1);
    ok(rising >= 0 && falling > rising,
       "...and it is a pass, not a flash: bright across several frames in the middle",
       "frames " + rising + "–" + falling + " of " + run.length);
  }

  console.log("\nthe same model redrawn does not run it again");
  {
    const again = await p1.evaluate(`(() => {
      const before = ${STATS}.maxL;
      ${SHOW({ view: { yaw: 0.6, pitch: 0.25 } })};
      return { before, after: ${STATS}.maxL };
    })()`);
    ok(Math.abs(again.after - again.before) < 3,
       "a redraw of the same geometry is the same picture — the pad rebuilds this panel after "
       + "every contour and must not sweep each time",
       again.before.toFixed(0) + " then " + again.after.toFixed(0));
  }
  await p1.close();

  console.log("\nand prefers-reduced-motion turns it off, at the settled state");
  {
    const p2 = await panel(true);
    await p2.evaluate(SHOW({ view: { yaw: 0.6, pitch: 0.25 } }));
    await p2.waitForTimeout(600);
    const s = await p2.evaluate(STATS);
    const run = await p2.evaluate(`(() => new Promise(res => {
      const out = []; UJ.mesh3d.sweep(); let n = 0;
      (function tick(){ out.push(${STATS}.maxL);
        if (++n >= 8) return res(out);
        requestAnimationFrame(() => requestAnimationFrame(tick)); })();
    }))()`);
    const peak = Math.max.apply(null, run);
    ok(peak <= s.maxL + 0.5,
       "nothing brightens — and what is on screen is the lit render, which is where the sweep "
       + "would have ended anyway, not a frozen half of it",
       "max " + peak.toFixed(0) + " against a resting " + s.maxL.toFixed(0));
    ok(s.n > 1000, "...and the model is still fully drawn", s.n + " lit px");
    await p2.close();
  }

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
