/* How close the 3D panel will let you get.                                            2026-10-03

   Søren: *"we can zoom all the way in when using the zoom button"*.

   THE PANEL HAD THREE OPINIONS ABOUT ITS OWN LIMITS. The wheel clamped the distance to [0.6, 12].
   The pinch clamped it to [0.6, 12] — written out a second time, under a comment promising they
   were the same range. And "look at the nucleus" ignored both and went to whatever distance frames
   a nucleus, with its own floor of 0.05.

   A nucleus is a few per cent of the span of the cell it sits in, so that distance is around 0.09:
   six times nearer than the nearest point the wheel will admit. The visible consequence is the one
   Søren hit — press the button and you are inside the nucleus — and a second one nobody would ever
   report as a zoom bug, because it reads as the panel jumping: from there, SCROLLING IN MOVES YOU
   AWAY. The wheel multiplies by 0.89 and then clamps up to 0.6, so a request to come closer lands
   you 6.7 times further out than you were.

   SO THE RULE IS ONE FLOOR AT A TIME, AND EVERYTHING OBEYS IT. The ordinary floor is 0.6. Framing
   something smaller than the model lowers it to exactly the distance that framing chose — so the
   wheel can follow the button in, and neither can go through the thing you asked to look at.
   Coming back out of that view puts the ordinary floor back.

   This is the eighth time in this codebase that a number decided in one place has been matched by
   a copy somewhere else, so the last assertion is a source-level one: the limits are written once.

   Run: node mesh3dzoomcheck.js */
const fs = require("fs");
const { chromium } = require("playwright");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A cell-shaped thing: a big sparse arbour and a small nucleus inside it, which is the ratio that
   makes this bug appear at all. A nucleus the size of its cell frames at a sane distance and
   nothing goes wrong. */
const BALL = `((R,cx,cy,cz) => { const P=[],I=[],NU=20,NV=14;
  for (let i=0;i<=NV;i++) for (let j=0;j<=NU;j++){ const th=i/NV*Math.PI, ph=j/NU*Math.PI*2;
    P.push(cx+R*Math.sin(th)*Math.cos(ph), cy+R*Math.cos(th), cz+R*Math.sin(th)*Math.sin(ph)); }
  for (let i=0;i<NV;i++) for (let j=0;j<NU;j++){ const a=i*(NU+1)+j,b=a+1,c=a+NU+1,d=c+1;
    I.push(a,c,b,b,c,d); }
  return { positions:new Float32Array(P), indices:new Uint32Array(I) }; })`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"] });
  const p = await b.newPage({ viewport: { width: 760, height: 520 },
                              reducedMotion: "no-preference" });
  p.on("pageerror", e => console.log("PAGEERROR " + e.message));
  await p.setContent('<!doctype html><meta charset="utf-8"><style>'
    + ':root{--bg:#0d1117;--panel:#161b22;--line:#2a313c;--ink:#e6edf3;--mut:#8b949e;'
    + '--accent:#27e0b3;--bad:#f85149}body{margin:0;background:var(--bg)}'
    + '#h{width:560px;height:320px}</style><div id="h"></div>');
  await p.addScriptTag({ path: core("mesh3d.js") });

  /* show() is handed OUR view object and keeps using it, so every number below is read out of the
     panel's live camera rather than inferred from a picture. */
  const SETUP = `(() => {
    const M = UJ.mesh3d, ball = ${BALL}, h = document.getElementById("h"); h.innerHTML = "";
    /* 100 across, with a nucleus 4 across sitting off-centre: a cortical cell's proportions. */
    const cell = ball(50,0,0,0), nuc = ball(2,6,3,0);
    const gc = M.prepare(cell.positions, cell.indices, { unitNm: 1000 });
    const gn = M.prepare(nuc.positions, nuc.indices, { unitNm: 1000, frame: { mid: gc.mid, span: gc.span } });
    window.__v = {};
    M.show(h, gc, { what: "cell", alpha: 0.3, view: window.__v,
                    ghosts: [{ geo: gn, what: "nucleus", tint: M.NUC_TINT, alpha: 1 }] });
    return window.__v.dist;
  })()`;
  /* deltaY < 0 is a scroll towards the screen, which every wheel-zoom in the world reads as
     "closer". */
  const WHEEL_IN = `(() => {
    const cv = document.querySelector(".m3d-canvas");
    cv.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
    return window.__v.dist;
  })()`;
  const WHEEL_OUT = `(() => {
    const cv = document.querySelector(".m3d-canvas");
    cv.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    return window.__v.dist;
  })()`;
  const NUC = `(() => { document.querySelector(".m3d-nuc").click(); return window.__v.dist; })()`;

  console.log("the ordinary floor, with nothing framed");
  const start = await p.evaluate(SETUP);
  let d = start, seen = [];
  for (let i = 0; i < 40; i++){ d = await p.evaluate(WHEEL_IN); seen.push(d); }
  ok(Math.abs(d - 0.6) < 1e-6,
     "scrolling in forty times stops at the panel's floor rather than going through the model",
     "fit at " + start.toFixed(2) + ", floor at " + d.toFixed(3));
  let out = d;
  for (let i = 0; i < 60; i++) out = await p.evaluate(WHEEL_OUT);
  ok(Math.abs(out - 12) < 1e-6, "...and out, at the ceiling", out.toFixed(2));

  console.log("framing the nucleus");
  await p.evaluate(SETUP);
  const framed = await p.evaluate(NUC);
  ok(framed < 0.6,
     "the button goes nearer than the hand can — a nucleus is a few per cent of its cell and "
     + "there is no framing it from 0.6",
     framed.toFixed(3));

  /* ── THE ASSERTION THIS WAS WRITTEN FOR ───────────────────────────────────────────────────
     Not "how close", but "which way". A zoom-in that moves you away is wrong at any distance,
     and it is what the three separate opinions about the limits actually produced. */
  const after = await p.evaluate(WHEEL_IN);
  ok(after <= framed + 1e-9,
     "scrolling IN from the framed nucleus does not move you AWAY — it used to jump from 0.09 "
     + "out to 0.6, because the wheel's floor had never heard of the button",
     framed.toFixed(3) + " -> " + after.toFixed(3));

  let near = after;
  for (let i = 0; i < 20; i++) near = await p.evaluate(WHEEL_IN);
  ok(Math.abs(near - framed) < 1e-6,
     "...and scrolling in further leaves you at the framing the button chose, so you cannot pass "
     + "through the thing you asked to look at",
     near.toFixed(3));

  let back = near;
  for (let i = 0; i < 4; i++) back = await p.evaluate(WHEEL_OUT);
  ok(back > near, "...while out still works from there", near.toFixed(3) + " -> " + back.toFixed(3));

  console.log("and coming back out of that view");
  await p.evaluate(SETUP);
  await p.evaluate(NUC);
  const home = await p.evaluate(NUC);          // the button toggles
  ok(home >= 0.6, "the second press puts you back where you were", home.toFixed(2));
  let d2 = home;
  for (let i = 0; i < 40; i++) d2 = await p.evaluate(WHEEL_IN);
  ok(Math.abs(d2 - 0.6) < 1e-6,
     "...and the ordinary floor is back with it, rather than the panel staying willing to go "
     + "inside a nucleus you are no longer looking at",
     d2.toFixed(3));

  /* ── WRITTEN ONCE ─────────────────────────────────────────────────────────────────────────
     The wheel and the pinch each carried their own copy of [0.6, 12], under a comment promising
     they were the same range. They were, until the button arrived with a third opinion. */
  console.log("the limits are named once");
  const src = fs.readFileSync(core("mesh3d.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  const floors = (src.match(/Math\.max\(\s*0\.6\s*,/g) || []).length
               + (src.match(/Math\.min\(\s*12\s*,/g) || []).length;
  ok(floors === 0,
     "no hand-written clamp to the zoom limits — every way of changing the distance goes through "
     + "the one function, so a fourth way cannot arrive with a fourth opinion",
     floors ? floors + " literal clamp(s) left" : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
