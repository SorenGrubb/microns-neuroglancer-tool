/* A link too big to open prices the viewer that would take it.                        2026-09-23

   Søren, after dropping points and then sections off a cell: "ok, that did not work. Can you do
   something else to this segmentation that makes it work with Neuroglancer?"

   HIS ACTUAL FILE (Arachnoid barrier cell 1, 40,165 line annotations → 176 contours on 140
   sections), measured through the pipeline:

       as LINES, nothing dropped   6,150k  over      as POLYLINES  1,266k  FITS
       as LINES, points at 64 nm   2,760k  over                      581k  FITS
       sections at 1,600 nm        140 → 110, 2,225k STILL over, volume +1.56%

   Nothing in z was redundant — an arachnoid barrier cell changes shape between sections 800 nm
   apart — so no reduction could ever have worked, and the cell already fitted untouched as
   polylines. Every reduction offered to him was beside the point.

   So the refusal now measures the same state the other way and says the answer.

   Run: node oversizecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  /* A cell of his size: 140 sections, 280 vertices each. Over the cap as lines, under as polylines. */
  const mk = (sections, verts) => {
    const rings = [];
    for (let s = 0; s < sections; s++){
      const pts = [];
      for (let i = 0; i < verts; i++){
        const a = 2 * Math.PI * i / verts;
        const wob = 1 + 0.2 * Math.sin(a * 9 + s * 1.7) + 0.1 * Math.sin(a * 17 + s * 3.1);
        pts.push([Math.round(295000 + 3000 * wob * Math.cos(a)),
                  Math.round(151000 + 3000 * wob * Math.sin(a))]);
      }
      rings.push({ z: 19891 + s * 20, points: pts });
    }
    return rings;
  };

  const got = await p.evaluate(async (src) => {
    document.getElementById("tracingPanel").open = true;
    document.getElementById("viewer").value = "https://ngl.microns-explorer.org/";   // lines only
    const rings = (new Function("return " + src))()(140, 280);
    const opened = [], saved = window.open;
    window.open = u => { opened.push(u); return { location: { set href(v){ opened.push(v); } } }; };
    tracingViewerOpen([{ name: "Cell", color: "#40e28c", rings: rings }], null, {});
    await new Promise(r => setTimeout(r, 2500));
    window.open = saved;
    return { tabs: opened.length, say: document.getElementById("tracingStatus").innerText,
             hasCopy: !!document.getElementById("tracingCopyState"),
             hasDl: !!document.getElementById("tracingSaveState") };
  }, mk.toString());

  console.log("a cell too big as lines, on a viewer that only reads lines");
  ok(got.tabs === 0, "no tab is opened onto a link that cannot load", got.tabs + " tab(s)");
  ok(got.hasCopy && got.hasDl, "the JSON is offered to copy or download", "copy and download");
  ok(/\{\} button takes it, with no URL and no limit/.test(got.say),
     "...and the {} editor is named as the way in on THIS viewer",
     (got.say.match(/Paste the state[^.]*\./) || ["NOT SAID"])[0]);
  ok(/As polylines it would be [\d,]+k and WOULD open as a link/.test(got.say),
     "...and the same state is PRICED as polylines, with the verdict",
     (got.say.match(/As polylines[^.]*\./) || ["NOT SAID"])[0]);
  ok(/No contour would be dropped/.test(got.say),
     "...saying nothing would have to be thrown away, which is the whole point",
     /No contour would be dropped/.test(got.say));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
