/* The four buttons in the corner of the 3D panel.                                    2026-10-03

   Søren, in three messages: *"there should be a button in the corner of the 3D window to fire it
   again. Also a button to make the model rotate and a button to make it zoom in on the nucleus.
   You can use icons instead of text to make the buttons smaller."* And: *"Also a button to only
   show nucleus or only show root ID"*.

   WHAT IS UNDER TEST, and what each one would look like if it were broken:

     they appear only where they do something — the nucleus and isolate buttons need a nucleus and
       need both surfaces. A button that is always there and sometimes does nothing is worse than
       no button, and the version of this that guessed from the TINT instead of being told would
       have passed today and stopped working the day somebody retuned a blue.
     they cannot eat a drag — the canvas under them is turned by dragging and pinched to zoom. A
       strip that swallowed a pointer near the corner would read as the model sticking, not as a
       button being in the way.
     spin actually turns it, and stops — a toggle, measured as the yaw moving and then not.
     the nucleus button moves the camera and comes back — it needed view.target, which the camera
       did not have: before it, there was no way to put anything but the middle of the frame in the
       middle of the picture.
     isolating removes pixels — three states, and the thing taken away really stops being drawn.
       Counted, because "it looks the same" is what a broken filter looks like.
     a tracing is never hidden — "only the nucleus" must not throw away the outline somebody drew.
     THE GHOSTS ARE PART OF THE MODEL — Søren: "The lightning kinda blimped before the 3D mesh had
       finished loading." show() is called as soon as the subject is ready and again when each
       megabyte-sized mesh lands, so a key that counted the subject alone made those arrivals
       "the same model" and the light had already been and gone.

   Icons are read by their aria-label here, not by their glyph: a rebus is not a label, and the
   assertion that each button says what it is in words is the accessible half of "use icons".

   reducedMotion is set explicitly, because headless Chromium reports `reduce` by default and every
   assertion about an animation would otherwise pass while measuring nothing.

   Run: node mesh3dtoolscheck.js */
const { chromium } = require("playwright");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A cell with a nucleus inside it, as both panels draw one: two spheres sharing a frame, the
   nucleus off-centre because a nucleus is. Blue on the nucleus, grey on the cell — the colours
   this family actually uses, so the pixel counts mean what they would mean on screen. */
const BUILD = `(() => {
  const ball = (R, cx, cy, cz, NU, NV) => {
    const P = [], I = [];
    for (let i = 0; i <= NV; i++) for (let j = 0; j <= NU; j++){
      const th = i/NV*Math.PI, ph = j/NU*Math.PI*2;
      P.push(cx + R*Math.sin(th)*Math.cos(ph), cy + R*Math.cos(th), cz + R*Math.sin(th)*Math.sin(ph));
    }
    for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++){
      const a = i*(NU+1)+j, b = a+1, c = a+NU+1, d = c+1; I.push(a,c,b, b,c,d);
    }
    return { positions: new Float32Array(P), indices: new Uint32Array(I) };
  };
  const cellM = ball(5000, 0, 0, 0, 30, 22);
  const nucM  = ball(1900, 1800, 900, 0, 26, 18);
  /* A third shape somewhere else entirely — the user's own outline. It has to be clear of
     the other two, or "is it still drawn" is answered by whichever surface is in front. */
  const trcM  = ball(1200, -3200, -2600, 0, 22, 16);
  const cell = UJ.mesh3d.prepare(cellM.positions, cellM.indices, { unitNm: 1 });
  const frame = { mid: cell.mid, span: cell.span };
  const nuc  = UJ.mesh3d.prepare(nucM.positions, nucM.indices, { unitNm: 1, frame: frame });
  const trace = UJ.mesh3d.prepare(trcM.positions, trcM.indices, { unitNm: 1, frame: frame });
  return { cell, nuc, trace, frame };
})()`;

/* The nucleus is the subject and the cell the ghost, which is the arrangement core/empreview.js
   uses — and the one a rule written about "the subject" would get wrong. */
const SHOW = `(w => {
  const m = ${BUILD};
  UJ.mesh3d.show(document.getElementById("h"), m.nuc, {
    what: "nucleus", tint: UJ.mesh3d.NUC_TINT, view: { yaw: 0.5, pitch: 0.2 },
    ghosts: w === "both" ? [{ geo: m.cell, what: "cell", alpha: 0.30, tint: [0.72,0.72,0.74] }] : []
  });
  return true;
})`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"] });
  const p = await b.newPage({ viewport: { width: 760, height: 560 },
                              reducedMotion: "no-preference" });
  p.on("pageerror", e => console.log("PAGEERROR " + e.message));
  await p.setContent('<!doctype html><meta charset="utf-8">'
    + '<style>:root{--bg:#0b0d12;--ink:#e9e9e9;--line:#2a3042;--accent:#49b0ff;--card:#11141c}'
    + 'body{margin:0;background:var(--bg)}#h{width:620px;height:340px}'
    + '.m3d-canvas{height:340px !important}</style><div id="h"></div>');
  await p.addScriptTag({ path: core("mesh3d.js") });

  /* CALLED, not just evaluated. page.evaluate() given a STRING evaluates it as an expression
     and ignores the argument, so `p.evaluate(SHOW, "both")` handed back the arrow function
     itself and drew nothing — and every assertion about buttons then passed vacuously on an
     empty list, which is the shape of a test that is measuring nothing. */
  const show = (w) => p.evaluate(SHOW + "(" + JSON.stringify(w) + ")");
  const buttons = () => p.evaluate(() =>
    [].map.call(document.querySelectorAll(".m3d-tool"),
                e => e.className.replace("m3d-tool ", "") + "=" + e.getAttribute("aria-label")));
  /* Pixels that are unmistakably the nucleus blue, and pixels that are unmistakably the grey
     cell. Counted through probePixels, which paints and reads in one turn — a WebGL buffer
     without preserveDrawingBuffer has nothing in it by any later tick. */
  const counts = () => p.evaluate(() => {
    let blue = 0, grey = 0;
    UJ.mesh3d.probePixels((r, g, bl) => {
      const L = 0.2126*r + 0.7152*g + 0.0722*bl;
      if (L > 40){ if (bl > r + 20) blue++; else if (Math.abs(bl - r) <= 20) grey++; }
      return false;
    });
    return { blue, grey };
  });

  console.log("the buttons that are there, and the ones that are not");
  {
    await show("both");
    await p.waitForTimeout(400);
    const all = await buttons();
    ok(all.length === 4, "four buttons with both surfaces on the panel", all.length + ": " + all.join(" | "));
    ok(all.every(s => /=[A-Z]/i.test(s) && s.split("=")[1].length > 6),
       "...each saying what it is in words, because an icon is a rebus and a rebus is not a label",
       all.map(s => s.split("=")[1]).join(" / "));
    ok(all.some(s => /^m3d-iso=/.test(s)) && all.some(s => /^m3d-nuc=/.test(s)),
       "...including the isolate and the nucleus one");

    await show("alone");
    await p.waitForTimeout(400);
    const lone = await buttons();
    ok(lone.length === 2 && !lone.some(s => /m3d-iso|m3d-nuc/.test(s)),
       "a panel with one surface offers only spin and sweep — there is nothing to isolate and "
       + "nothing to come in on", lone.join(" | "));
  }

  console.log("\nthey cannot eat a drag");
  {
    await show("both");
    await p.waitForTimeout(400);
    const pe = await p.evaluate(() => {
      const strip = getComputedStyle(document.querySelector(".m3d-tools")).pointerEvents;
      const btn = getComputedStyle(document.querySelector(".m3d-tool")).pointerEvents;
      return { strip, btn };
    });
    ok(pe.strip === "none" && pe.btn === "auto",
       "the strip takes no pointers and the buttons take their own — a drag starting beside a "
       + "button still turns the model", "strip " + pe.strip + ", button " + pe.btn);
  }

  console.log("\nspin turns it, and stops");
  {
    const r = await p.evaluate(`(() => new Promise(res => {
      const el = document.querySelector(".m3d-spin");
      /* The view object is the panel's own; reading yaw off it is reading the thing the renderer
         actually uses, not a proxy for it. */
      const view = { yaw: 0.5, pitch: 0.2 };
      const m = ${BUILD};
      UJ.mesh3d.show(document.getElementById("h"), m.nuc, { what: "nucleus", view,
        ghosts: [{ geo: m.cell, what: "cell", alpha: 0.3 }] });
      const b2 = document.querySelector(".m3d-spin");
      const a = view.yaw;
      b2.click();
      setTimeout(() => {
        const moved = view.yaw;
        b2.click();
        setTimeout(() => res({ a, moved, stopped: view.yaw, pressed: b2.getAttribute("aria-pressed") }),
                   350);
      }, 350);
    }))()`);
    ok(r.moved > r.a + 0.02, "pressing it turns the model", r.a.toFixed(3) + " → " + r.moved.toFixed(3));
    ok(Math.abs(r.stopped - r.moved) < 0.02,
       "...and pressing it again stops it where it is, rather than snapping back",
       r.moved.toFixed(3) + " → " + r.stopped.toFixed(3));
    ok(r.pressed === "false", "...and the button says it is off", r.pressed);
  }

  console.log("\nisolating really takes a surface away");
  {
    await show("both");
    await p.waitForTimeout(400);
    const both = await counts();
    ok(both.blue > 300 && both.grey > 300, "both surfaces are on screen to start with",
       "blue " + both.blue + ", grey " + both.grey);

    const press = () => p.evaluate(() => {
      document.querySelector(".m3d-iso").click();
      const el = document.querySelector(".m3d-iso");
      return { glyph: el.textContent, label: el.getAttribute("aria-label") };
    });
    const s1 = await press(); const c1 = await counts();
    ok(c1.blue < both.blue * 0.05 && c1.grey > both.grey * 0.5,
       "the cell on its own: the nucleus stops being drawn", "blue " + c1.blue + ", grey " + c1.grey);
    ok(/cell/i.test(s1.label), "...and the button says so", s1.glyph + " " + s1.label);

    const s2 = await press(); const c2 = await counts();
    ok(c2.grey < both.grey * 0.25 && c2.blue > both.blue * 0.5,
       "the nucleus on its own: the cell stops being drawn", "blue " + c2.blue + ", grey " + c2.grey);
    ok(/nucleus/i.test(s2.label), "...and the button says so", s2.glyph + " " + s2.label);

    const s3 = await press(); const c3 = await counts();
    ok(Math.abs(c3.blue - both.blue) < both.blue * 0.08
       && Math.abs(c3.grey - both.grey) < both.grey * 0.08,
       "and round again to both, which is the picture it started from",
       "blue " + c3.blue + ", grey " + c3.grey);
    ok(/both/i.test(s3.label) || /and the nucleus/i.test(s3.label),
       "...and says that too", s3.glyph + " " + s3.label);
  }

  console.log("\na tracing is never the thing that gets hidden");
  {
    /* A third surface with no `what` — the user's own outline. "Only the nucleus" must not throw
       away the drawing the panel is open for. */
    const r = await p.evaluate(`(() => {
      const m = ${BUILD};
      UJ.mesh3d.show(document.getElementById("h"), m.trace, {
        what: "", tint: [0.1, 0.9, 0.4], view: { yaw: 0.5, pitch: 0.2 },
        ghosts: [{ geo: m.cell, what: "cell", alpha: 0.3 },
                 { geo: m.nuc, what: "nucleus", alpha: 1, tint: UJ.mesh3d.NUC_TINT }] });
      const green = () => UJ.mesh3d.probePixels((r2, g, b2) => g > r2 + 40 && g > b2 + 40);
      const before = green();
      document.querySelector(".m3d-iso").click();   // cell only
      const cellOnly = green();
      document.querySelector(".m3d-iso").click();   // nucleus only
      const nucOnly = green();
      return { before, cellOnly, nucOnly };
    })()`);
    ok(r.before > 100 && r.cellOnly > r.before * 0.8 && r.nucOnly > r.before * 0.8,
       "the surface with no `what` is drawn in every state — it is the tracing, and hiding it "
       + "would be throwing the work away",
       r.before + " → " + r.cellOnly + " → " + r.nucOnly + " px");
  }

  console.log("\nthe light waits for the mesh");
  {
    /* Søren's blip, as an assertion. Show the subject alone, let its sweep finish, then hand the
       same subject back WITH a ghost: that is a cell mesh landing, and it has to light. */
    const r = await p.evaluate(`(() => new Promise(res => {
      const m = ${BUILD};
      const peak = () => UJ.mesh3d.probePixels((r2, g, b2) => (r2 + g + b2) > 560);
      UJ.mesh3d.show(document.getElementById("h"), m.nuc, { what: "nucleus", view: { yaw: .5, pitch: .2 } });
      setTimeout(() => {
        const quiet = peak();
        UJ.mesh3d.show(document.getElementById("h"), m.nuc, { what: "nucleus", view: { yaw: .5, pitch: .2 },
          ghosts: [{ geo: m.cell, what: "cell", alpha: 0.3 }] });
        let best = 0, n = 0;
        (function tick(){
          best = Math.max(best, peak());
          if (++n >= 10) return res({ quiet, best });
          setTimeout(tick, 160);
        })();
      }, 5000);
    }))()`);
    ok(r.best > r.quiet + 50,
       "a mesh arriving after the subject lights too — the ghosts are part of the model, which "
       + "is what stops the light going off through an outline before the cell has loaded",
       "settled " + r.quiet + " bright px, peak " + r.best);
  }

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
