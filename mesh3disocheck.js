/* Showing one surface on its own actually shows it.                                   2026-10-03

   Søren, twice in a row, with the isolate button lit:

     *"When the nucleus has been isolated, it should be centered and zoom should zoom in on it
     instead of where the root ID center was."*
     *"When the mesh is shown alone it should not be transparent."*

   Both are the same mistake made twice: HIDING A SURFACE WAS NOT THE SAME EVENT AS FRAMING ONE,
   and the alpha was decided once, when the panel was built, by a caller who did not know a surface
   could later be on its own.

   THE CAMERA. It orbits the middle of the FRAME, and the frame is the cell's — a nucleus sits
   off-centre in its cell by definition. So "show only the nucleus" left the camera where the cell
   had been and the nucleus stayed a pale blob to one side of an empty panel, which is the first
   screenshot. There was already a button that framed it (⊙), so there were two states where there
   should have been one.

   THE ALPHA. core/empreview.js draws the cell at 0.14 so you can see the nucleus inside it; the
   notebook's rule, written down in this file, is that transparency with nothing behind it costs
   contrast and shows nothing. Hide the nucleus and that is exactly the situation — the second
   screenshot is a whole pyramidal cell drawn at 14%, which on a dark field is a cobweb.

   SO THE RULE IS ABOUT BEING ALONE, not about which surface it is: a surface with a `what`, drawn
   while the other kind is hidden, is drawn solid. A surface with NO `what` keeps its own alpha —
   that is the tracing on the pad, which is the user's own work and is never what isolation is
   about.

   Run: node mesh3disocheck.js */
const { chromium } = require("playwright");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

const BALL = `((R,cx,cy,cz) => { const P=[],I=[],NU=28,NV=18;
  for (let i=0;i<=NV;i++) for (let j=0;j<=NU;j++){ const th=i/NV*Math.PI, ph=j/NU*Math.PI*2;
    P.push(cx+R*Math.sin(th)*Math.cos(ph), cy+R*Math.cos(th), cz+R*Math.sin(th)*Math.sin(ph)); }
  for (let i=0;i<NV;i++) for (let j=0;j<NU;j++){ const a=i*(NU+1)+j,b=a+1,c=a+NU+1,d=c+1;
    I.push(a,c,b,b,c,d); }
  return { positions:new Float32Array(P), indices:new Uint32Array(I) }; })`;

/* The Discussion preview's own arrangement, which is where both screenshots came from: the
   NUCLEUS is the subject and the cell is the 0.14 ghost around it, sharing the cell's frame so the
   nucleus is drawn where it sits rather than re-centred. */
const SETUP = `(() => {
  const M = UJ.mesh3d, ball = ${BALL}, h = document.getElementById("h"); h.innerHTML = "";
  const cell = ball(50, 0, 0, 0), nuc = ball(7, 18, 11, 0);
  const gc = M.prepare(cell.positions, cell.indices, { unitNm: 1000 });
  const gn = M.prepare(nuc.positions, nuc.indices,
                       { unitNm: 1000, frame: { mid: gc.mid, span: gc.span } });
  window.__v = {};
  M.show(h, gn, { what: "nucleus", tint: M.NUC_TINT, view: window.__v,
                  ghosts: [{ geo: gc, what: "cell", alpha: 0.14 }] });
  return { dist: window.__v.dist, target: window.__v.target || null };
})()`;
const CLICK = sel => `(() => { document.querySelector(${JSON.stringify(sel)}).click();
  return { dist: window.__v.dist, target: window.__v.target || null,
           iso: (document.querySelector(".m3d-iso")||{}).textContent,
           nucLit: !!(document.querySelector(".m3d-nuc")||{classList:{contains:()=>false}})
                     .classList.contains("m3d-on") }; })()`;

/* How much of the panel the model actually covers, in pixels that are clearly not the field.
   A 14% ghost on a dark field moves a pixel a little; a solid surface moves it a lot. */
const SOLIDITY = `(() => {
  const M = UJ.mesh3d, cv = document.querySelector(".m3d-canvas");
  let field = null;
  M.probePixels((r,g,b,x,y) => { if (x === 2 && y === 2) field = [r,g,b]; return false; });
  const lum = c => 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
  const fl = lum(field);
  return { strong: M.probePixels((r,g,b) => Math.abs(lum([r,g,b]) - fl) >= 45),
           any:    M.probePixels((r,g,b) => Math.abs(lum([r,g,b]) - fl) >= 8) };
})()`;

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

  console.log("isolating the nucleus is looking at it");
  const start = await p.evaluate(SETUP);
  const cellOnly = await p.evaluate(CLICK(".m3d-iso"));      // all -> cell
  const nucOnly  = await p.evaluate(CLICK(".m3d-iso"));      // cell -> nucleus

  ok(nucOnly.target !== null && Math.hypot.apply(null, nucOnly.target) > 0,
     "the camera moves off the frame's middle and onto the nucleus — the frame is the CELL's, and "
     + "a nucleus is off-centre in its cell by definition",
     nucOnly.target ? nucOnly.target.map(v => Math.round(v/1000) + "µm").join(", ") : "still centred");
  ok(nucOnly.dist < start.dist * 0.5,
     "...and it comes in, instead of staying at the distance that framed the whole cell",
     start.dist.toFixed(2) + " -> " + nucOnly.dist.toFixed(2));
  ok(nucOnly.nucLit,
     "...and the 'look at the nucleus' button says so, because it is now the same state and two "
     + "buttons that disagree about one state are worse than one button",
     nucOnly.nucLit ? "lit" : "dark");

  const back = await p.evaluate(CLICK(".m3d-iso"));          // nucleus -> all
  ok(Math.abs(back.dist - start.dist) < 1e-6 && !back.target,
     "coming back to both puts the camera back where it was, rather than leaving you zoomed into "
     + "a nucleus you are no longer singling out",
     back.dist.toFixed(2) + (back.target ? " (still aimed)" : " (aimed at the middle)"));
  ok(!back.nucLit, "...and the other button follows it back", back.nucLit ? "lit" : "dark");

  /* ── AND THE SURFACE ITSELF ───────────────────────────────────────────────────────────────
     The second screenshot: the whole cell on its own, at the 14% the caller chose so you could
     see a nucleus through it that is no longer there. */
  console.log("\na surface shown alone is shown solid");
  await p.evaluate(SETUP);
  const both = await p.evaluate(SOLIDITY);
  await p.evaluate(CLICK(".m3d-iso"));                       // all -> cell
  const alone = await p.evaluate(SOLIDITY);

  ok(alone.strong > both.strong * 3,
     "the cell on its own is drawn solid — at the alpha it was given it is a cobweb, because that "
     + "alpha exists to let you see the nucleus inside it and the nucleus is hidden",
     both.strong + " px clearly lit with the nucleus there, " + alone.strong + " without it");
  ok(alone.any > 2000,
     "...and it is the same cell, not a smaller one", alone.any + " px drawn");

  await p.evaluate(CLICK(".m3d-iso"));                       // cell -> nucleus
  await p.evaluate(CLICK(".m3d-iso"));                       // nucleus -> all
  const again = await p.evaluate(SOLIDITY);
  ok(Math.abs(again.strong - both.strong) < both.strong * 0.25,
     "and the see-through cell comes back when the nucleus does — the solidity belongs to being "
     + "alone, not to having been pressed",
     both.strong + " -> " + again.strong + " px");

  /* The pad's tracing has no `what`, and isolation is not about it: it is the drawing the panel is
     open for. A rule written in terms of "whatever is visible" would have made it solid too, and
     an outline you can see the cell through is the point of an outline. */
  console.log("\nand the tracing is not what any of this is about");
  const padKept = await p.evaluate(`(() => {
    const M = UJ.mesh3d, ball = ${BALL}, h = document.getElementById("h"); h.innerHTML = "";
    const cell = ball(50,0,0,0), nuc = ball(7,18,11,0), trace = ball(20,-10,-5,0);
    const gc = M.prepare(cell.positions, cell.indices, { unitNm: 1000 });
    const fr = { mid: gc.mid, span: gc.span };
    const gn = M.prepare(nuc.positions, nuc.indices, { unitNm: 1000, frame: fr });
    const gt = M.prepare(trace.positions, trace.indices, { unitNm: 1000, frame: fr });
    M.show(h, gc, { what: "cell", alpha: 0.5, view: {},
                    ghosts: [{ geo: gn, what: "nucleus", alpha: 1 },
                             { geo: gt, alpha: 0.3 }] });       // no what: the tracing
    document.querySelector(".m3d-iso").click();                 // all -> cell
    return UJ.mesh3d.probePixels(() => true) > 0;
  })()`);
  ok(padKept, "a panel holding a tracing still paints with one kind isolated", "painted");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
