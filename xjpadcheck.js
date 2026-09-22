/* χJump: the pad's 3D view draws, and "show the segmentation" paints the whole cell.     2026-09-21

   Søren, on χJump: "It has problems with tracing and showing in 3D. Only shows 1 fragment of the
   segmentation." Two faults, both checked here:

     3D     the pad's preview called UJ.mesh3d.prepare -- core/mesh3d.js's renderer -- and χJump's
            UJ.mesh3d is its own, which has no prepare: "Could not build the preview: UJ.mesh3d.prepare
            is not a function". χJump's own renderer must still be χJump's afterwards.
     CELL   a cb2 fragment is chunk-bounded, so one is a square of cell; the cell is every fragment
            of its assembly. The overlay asked the host for the cell by FRAGMENT alone, and the
            fragment under the pointer need not be listed in the cell the card is filed under. It
            asks with the cell's key as well now, and paints every fragment of that cell.

   Run: node xjpadcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("xjump.html"));
  await p.waitForTimeout(5000);

  console.log("xjump.html\n\nthe pad's 3D view");
  const d3 = await p.evaluate(async () => {
    const own = !!(UJ.mesh3d && UJ.mesh3d.coverage && UJ.mesh3d.downloadGlb);
    document.getElementById("tracingPanel").open = true;
    PAD = UJ.tracepad.create();
    const ring = (z, d) => ({ z, inst: 0, points: [[10000 - d, 10000 - d], [10000 + d, 10000 - d], [10000 + d, 10000 + d], [10000 - d, 10000 + d]] });
    PAD.rings = [ring(800, 200), ring(805, 240), ring(810, 200)];
    document.getElementById("tracePadWrap").style.display = "";
    const g = document.getElementById("tracePadGhosts"); if (g) g.checked = false;
    PAD3D_ON = true; PAD3D_MESHES = null;
    try { await pad3DDraw(); } catch (e){ return { own, err: String(e) }; }
    const host = document.getElementById("tracePad3DHost");
    return { own, note: (host && host.textContent || "").slice(0, 160), canvas: !!(host && host.querySelector("canvas")) };
  });
  ok(!/not a function|Could not build/.test(d3.note || d3.err || ""), "the preview builds", d3.note || d3.err || "ok");
  ok(d3.canvas, "...and draws a canvas", d3.canvas);
  ok(d3.own, "χJump's own 3D renderer is still χJump's", d3.own);

  console.log("\nthe segmentation, the whole cell");
  const seg = await p.evaluate(async () => {
    const all = UJ.xjump.seedListAll().filter(r => r.whole);
    const row = all.filter(r => UJ.xjump.seedSegments(r).length > 3)[0];
    if (!row) return { skip: 1 };
    const segs = UJ.xjump.seedSegments(row).map(String);
    let got = null;
    const saved = UJ.segpaint.paint;
    UJ.segpaint.paint = async function(cv, view, o){ got = o; return { cell: { painted: 1, chunks: 1, nmPerVoxel: 32 } }; };
    try { UJ.segpaint.configured = UJ.segpaint.configured || (() => true); } catch (e){}
    PAD_VIEW = PAD_VIEW || { x0: 0, y0: 0, w: 10, h: 10, z: 1, mip: 0 };
    /* The cell by its key, and a fragment under the pointer that its list does not carry. */
    document.getElementById("tracingNucId").value = row.key;
    document.getElementById("tracingRootId").value = "99999999999999";
    const box = document.getElementById("tracePadSeg"); if (box) box.checked = true;
    try { await padSegOverlay(); } catch (e){}
    UJ.segpaint.paint = saved;
    const painted = got ? [String(got.root)].concat((got.rootAlso || []).map(String)) : [];
    return { n: segs.length, covered: segs.filter(s => painted.indexOf(s) >= 0).length, key: row.key };
  });
  if (seg.skip) ok(true, "(no seed with fragments to test)");
  else ok(seg.covered === seg.n, "every fragment of " + seg.key + " is painted, not only the one at the pointer",
          seg.covered + " of " + seg.n);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 300) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
