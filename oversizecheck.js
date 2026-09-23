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
    return { tabs: opened.length, urls: opened,
             say: document.getElementById("tracingStatus").innerText,
             hasCopy: !!document.getElementById("tracingCopyState"),
             hasDl: !!document.getElementById("tracingSaveState") };
  }, mk.toString());

  console.log("a cell too big as lines, on a viewer that only reads lines");
  /* Søren, 2026-09-23: "Can't you just measure when it will fail to open and then open with
     Spelunker instead? It should be easy for the user." So it opens, rather than explaining. */
  ok(got.tabs >= 1, "a tab IS opened \u2014 it is not refused", got.tabs + " tab(s)");
  const dest = (got.urls || []).filter(u => /#!/.test(u)).pop() || "";
  ok(/spelunker\.cave-explorer\.org|neuroglancer-demo\.appspot\.com/.test(dest),
     "...pointed at a viewer that reads polylines", dest.split("/#!")[0] || "(none)");
  ok(!/ngl\.microns-explorer/.test(dest),
     "...and NOT at the one that cannot open it", dest.split("/#!")[0] || "(none)");
  ok(dest.length <= 2097152, "...with a link under the cap", Math.round(dest.length / 1000) + "k");
  const anns = (() => {
    try {
      const st = JSON.parse(decodeURIComponent(dest.split("#!")[1]));
      return (st.layers || []).filter(l => l.annotations)
                              .reduce((a, l) => a.concat(l.annotations), []);
    } catch (e){ return []; }
  })();
  ok(anns.length > 0 && anns.every(a => a.type === "polyline"),
     "...carrying polylines, which is what made it fit",
     anns.length + " annotations, " + [...new Set(anns.map(a => a.type))].join("/"));
  ok(anns.length === 140, "...every contour of it, nothing dropped", anns.length + " of 140");
  ok(/Too big for ngl\.microns-explorer\.org as line annotations/.test(got.say)
     && /so it opened in \S+ as polylines/.test(got.say),
     "and it SAYS where it went and why, because a silent redirect is its own bug",
     (got.say.match(/Too big for[^.]*\./) || ["NOT SAID"])[0]);
  ok(/Nothing was dropped/.test(got.say) && /viewer setting is unchanged/.test(got.say),
     "...that nothing was lost, and that his choice in the box still stands",
     (got.say.match(/Nothing was dropped[^.]*\.[^.]*\./) || ["NOT SAID"])[0]);

  console.log("\nand a cell too big even as polylines");
  const huge = await p.evaluate(async (src) => {
    document.getElementById("viewer").value = "https://ngl.microns-explorer.org/";
    const rings = (new Function("return " + src))()(900, 700);
    const opened = [], saved = window.open;
    window.open = u => { opened.push(u); return { location: { set href(v){ opened.push(v); } } }; };
    tracingViewerOpen([{ name: "Enormous", color: "#40e28c", rings: rings }], null, {});
    await new Promise(r => setTimeout(r, 2500));
    window.open = saved;
    return { tabs: opened.filter(u => /#!/.test(u)).length,
             say: document.getElementById("tracingStatus").innerText,
             hasCopy: !!document.getElementById("tracingCopyState") };
  }, mk.toString());
  ok(huge.tabs === 0, "no tab: there is nowhere to send it", huge.tabs + " link(s)");
  ok(/still be [\d,]+k as polylines, so no viewer takes it as a link/.test(huge.say),
     "...and it says the alternative was measured and does not fit either",
     (huge.say.match(/It would still be[^.]*\./) || ["NOT SAID"])[0]);
  ok(huge.hasCopy && /\{\} editor is the way in/.test(huge.say),
     "...leaving the {} editor, with the JSON to copy", huge.hasCopy);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
