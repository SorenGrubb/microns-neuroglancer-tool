/* The pad's "Show it in 3D" builds on a page.                                          2026-09-22

   Søren, on ωJump: "Could not build the preview: undefined is not an object (evaluating
   'tracingM3D().prepare')". ωJump inlines the tracing card's modules one by one and core/mesh3d.js
   -- the renderer the preview draws with -- was never among them, so there was no renderer at all.

   Run: node pad3dcheck.js [page.html]      (default wjump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "wjump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(4000);
  const d3 = await p.evaluate(async () => {
    const m3 = (typeof tracingM3D === "function") ? tracingM3D() : null;
    document.getElementById("tracingPanel").open = true;
    PAD = UJ.tracepad.create();
    const ring = (z, d) => ({ z, inst: 0, points: [[10000 - d, 10000 - d], [10000 + d, 10000 - d], [10000 + d, 10000 + d], [10000 - d, 10000 + d]] });
    PAD.rings = [ring(800, 200), ring(805, 240), ring(810, 200)];
    document.getElementById("tracePadWrap").style.display = "";
    const g = document.getElementById("tracePadGhosts"); if (g) g.checked = false;
    PAD3D_ON = true; PAD3D_MESHES = null;
    try { await pad3DDraw(); } catch (e){ return { m3: !!m3, err: String(e) }; }
    const host = document.getElementById("tracePad3DHost");
    return { m3: !!(m3 && m3.prepare), note: (host && host.textContent || "").slice(0, 160),
             canvas: !!(host && host.querySelector("canvas")) };
  });
  console.log(PAGE + "\n");
  ok(d3.m3, "the page has the renderer the preview draws with", d3.m3);
  ok(!/not a function|Could not build|undefined/.test(d3.note || d3.err || ""), "the preview builds", d3.note || d3.err || "ok");
  ok(d3.canvas, "...and draws a canvas", d3.canvas);
  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
