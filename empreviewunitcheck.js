/* The cell and the nucleus are in the same units.                                    2026-10-03

   Søren, with three screenshots of the Discussion's EM preview: *"When I press the cell here in 3D
   this is what I get, looks good. However, when I press and its nucleus, this is what I get. It
   moves far away and I don't see a nucleus, even when I look closely"*.

   The panel had been saying so: `0.0 × 0.0 × 0.0 µm · 21,208 triangles` — a real mesh with a
   bounding box that rounds to zero at one decimal place. core/nucmesh.js converts to MICROMETRES
   on the way out ("the unit core/mesh.js hands back"); core/empreview.js read it as nanometres and
   drew the nucleus a thousand times too small. And because drawMeshes builds ONE frame across both
   meshes — so the nucleus sits in the cell's place rather than centred on itself — a nucleus at
   1/1000 scale sits essentially at the absolute origin, hundreds of micrometres from the cell, and
   the joint box stretches to cover the gap. That is the "moves far away": the frame, not the
   camera.

   SO THIS CHECKS THE AGREEMENT, NOT THE PICTURE. A screenshot test would have passed a nucleus
   drawn at the wrong scale as long as something was on screen, and the thing on screen was the
   cell. What is asserted is that a mesh of a known size, in the units its real source returns,
   comes out of prepare() that size — and that the two meshes end up in a frame whose span is the
   CELL's, not the distance from the origin to the cell.

   The meshes are stubbed at the two fetch functions, so this drives the real drawMeshes with real
   geometry and no network. Sizes are chosen to be unmistakable: a 200 µm cell and a 10 µm nucleus,
   placed 300 µm from the origin, which is where a real minnie cell sits.

   Run: node empreviewunitcheck.js */
const { chromium } = require("playwright");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A ball of radius R micrometres centred at (cx,cy,cz) micrometres, as both real sources hand
   one back: positions in MICROMETRES, indices uint32. */
const BALL = `((R, cx, cy, cz) => {
  const P = [], I = [], NU = 20, NV = 14;
  for (let i = 0; i <= NV; i++) for (let j = 0; j <= NU; j++){
    const th = i/NV*Math.PI, ph = j/NU*Math.PI*2;
    P.push(cx + R*Math.sin(th)*Math.cos(ph), cy + R*Math.cos(th), cz + R*Math.sin(th)*Math.sin(ph));
  }
  for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++){
    const a = i*(NU+1)+j, b = a+1, c = a+NU+1, d = c+1; I.push(a,c,b, b,c,d);
  }
  return { positions: new Float32Array(P), indices: new Uint32Array(I) };
})`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"] });
  const p = await b.newPage({ viewport: { width: 820, height: 620 },
                              reducedMotion: "no-preference" });
  p.on("pageerror", e => console.log("PAGEERROR " + e.message));
  await p.setContent('<!doctype html><meta charset="utf-8">'
    + '<style>:root{--bg:#0b0d12;--ink:#e9e9e9;--line:#2a3042;--accent:#49b0ff;--card:#11141c;'
    + '--mut:#8b93a7;--bad:#e55}body{margin:0;background:var(--bg)}#h{width:700px;height:360px}'
    + '</style><div id="h"></div>');
  await p.addScriptTag({ path: core("mesh3d.js") });
  await p.addScriptTag({ path: core("empreview.js") });

  console.log("both sources hand back micrometres, and the panel reads them that way");
  const r = await p.evaluate(`(() => {
    const ball = ${BALL};
    /* 300 µm from the origin, which is where a real minnie cell sits — and the distance that
       turned a unit mistake into "the model moved far away". */
    const cell = ball(100, 300, 400, 500);     // 200 µm across
    const nuc  = ball(5,   303, 402, 500);     //  10 µm across, inside it and off-centre
    const parts = [{ what: "cell", mesh: cell, unitNm: 1000 },
                   { what: "nucleus", mesh: nuc, unitNm: 1000 }];
    /* The module's own drawMeshes, reached through its export, with the real mesh3d underneath. */
    UJ.empreview._draw(document.getElementById("h"), parts);
    const note = document.querySelector(".m3d-note").textContent;
    /* And the two geometries as prepare() makes them, which is what the panel actually draws. */
    const raw = parts.map(q => UJ.mesh3d.prepare(q.mesh.positions, q.mesh.indices,
                                                 { unitNm: q.unitNm }));
    const um = g => [0,1,2].map(i => (g.hi[i] - g.lo[i]) / 1000);
    return { note: note,
             cellUm: um(raw[0]).map(v => Math.round(v)),
             nucUm:  um(raw[1]).map(v => Math.round(v * 10) / 10) };
  })()`);

  ok(r.nucUm[0] >= 9 && r.nucUm[0] <= 11,
     "a 10 µm nucleus comes out 10 µm — read as nanometres it was 0.01, which the panel "
     + "printed as 0.0 and nobody read",
     r.nucUm.join(" × ") + " µm");
  ok(r.cellUm[0] >= 190 && r.cellUm[0] <= 210,
     "...and the cell is still the size it was", r.cellUm.join(" × ") + " µm");

  /* The note is the line that was telling the truth the whole time. */
  ok(!/\b0\.0 × 0\.0 × 0\.0\b/.test(r.note),
     "the panel no longer reports a zero-sized model", r.note.slice(0, 60));
  ok(/\d/.test(r.note) && /µm/.test(r.note), "...and still says how big it is", r.note.slice(0, 60));

  /* ── THE FRAME IS THE CELL'S, NOT THE DISTANCE TO THE ORIGIN ───────────────────────────────
     This is the assertion that would have caught the original bug on its own. drawMeshes puts
     both meshes in ONE frame so the nucleus is drawn where it sits; with the nucleus a thousand
     times too small that frame stretched from the origin out to the cell, which is 300 µm away
     and half again as big as the cell itself. */
  const span = await p.evaluate(`(() => {
    const ball = ${BALL};
    const cell = ball(100, 300, 400, 500), nuc = ball(5, 303, 402, 500);
    const raw = [UJ.mesh3d.prepare(cell.positions, cell.indices, { unitNm: 1000 }),
                 UJ.mesh3d.prepare(nuc.positions,  nuc.indices,  { unitNm: 1000 })];
    const lo = raw[0].lo.slice(), hi = raw[0].hi.slice();
    raw.forEach(q => { for (let i = 0; i < 3; i++){
      if (q.lo[i] < lo[i]) lo[i] = q.lo[i];
      if (q.hi[i] > hi[i]) hi[i] = q.hi[i]; } });
    return Math.max(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) / 1000;
  })()`);
  ok(span >= 190 && span <= 215,
     "the frame the two share is the cell's own size — with the nucleus mis-scaled it reached "
     + "from the origin to the cell instead, which is what made the cell a speck",
     Math.round(span) + " µm");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
