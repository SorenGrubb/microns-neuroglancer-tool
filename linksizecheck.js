/* A long tracing still opens in the viewer, and a very long one can be pasted.        2026-09-22

   Søren, on a whole cell traced over 151 sections: "I don't get it, why won't it open it, I can add
   it to a JSON in Neuroglancer and see it there. The vertices are not the same as annotation points,
   and there are not that many annotation points. So, could we try to let it open it?"

   MEASURED IN HIS OWN BROWSER, on spelunker.cave-explorer.org, 2026-09-22:
     - 40,000 line annotations, a 5.83 million character URL: the viewer loads all 40,000.
     - the same state with the `id` left off each annotation: the layer loads with ZERO in it, in
       silence. Neuroglancer drops an annotation that has no id, so the ids are not optional.
   The refusal was at 1.5M characters, which is four times tighter than what Chrome and the viewer
   actually take. It opens now, and above the new cap the state can be copied or downloaded to
   paste into Neuroglancer's own JSON editor -- which is what he was doing by hand.

   Run: node linksizecheck.js */
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
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  const got = await p.evaluate(async () => {
    document.getElementById("tracingPanel").open = true;
    /* 151 sections x 12 contours: the size that is long NOW. Since 2026-09-22 a contour is one
       polyline and not one line per edge (src/the_viewer_link_is_polylines.py), so the cell that
       used to make this link takes a quarter of the characters and no longer reaches the
       threshold -- the threshold is what is under test, so the fixture grew to meet it. */
    const rings = [];
    for (let s = 0; s < 151; s++){
      for (let c = 0; c < 12; c++){
        const pts = [];
        for (let i = 0; i < 26; i++){
          const a = 2 * Math.PI * i / 26;
          pts.push([Math.round(295000 + c * 300 + 200 * Math.cos(a)), Math.round(151000 + 200 * Math.sin(a))]);
        }
        rings.push({ z: 17800 + s, points: pts });
      }
    }
    const struct = { name: "Whole cell", color: "#40e28c", rings: rings };
    const opened = [];
    const saved = window.open;
    /* The card opens a blank tab first when it has community root ids to fold in, then sets its
       location -- so both are captured. */
    window.open = u => { opened.push(u); return { closed: false, opener: null,
      location: { set href(v){ opened.push(v); }, get href(){ return ""; } } }; };
    let say = "";
    try { tracingViewerOpen([struct], null, { nuc: "286849", root: "" }); } catch (e){ say = "THREW " + e.message; }
    await new Promise(r => setTimeout(r, 2500));
    window.open = saved;
    say = say || document.getElementById("tracingStatus").innerText;
    const url = opened.slice().sort((a, b) => b.length - a.length)[0] || "";
    const json = decodeURIComponent((url.split("#!")[1] || "")) || "";
    let anns = [];
    try { anns = (JSON.parse(json).layers || []).filter(l => l.annotations).reduce((a, l) => a.concat(l.annotations), []); } catch (e){}
    return { n: opened.length, len: url.length, say: say,
             anns: anns.length, allIds: anns.every(a => a && a.id), first: anns[0] || null,
             hasCopy: !!document.getElementById("tracingCopyState") };
  });
  console.log("a whole cell, traced over 151 sections");
  ok(got.n >= 1, "it opens the viewer rather than refusing", got.n + " tab(s): " + got.say.slice(0, 90));
  ok(got.len > 1500000, "...with the long link it used to refuse", Math.round(got.len / 1000) + "k characters");
  ok(got.anns === 151 * 12, "...carrying every contour, one polyline each",
     got.anns + " annotations");
  ok(got.allIds, "...each with an id, which Neuroglancer drops an annotation for not having",
     JSON.stringify(got.first));
  ok(/long/i.test(got.say) && /paste|copy/i.test(got.say),
     "...and it says the link is a long one and how to paste it instead", got.say.slice(0, 120));
  ok(got.hasCopy, "...with a button that puts the JSON on the clipboard", got.hasCopy);

  console.log("\nand one bigger than any browser takes");
  const huge = await p.evaluate(async () => {
    const rings = [];
    for (let s = 0; s < 400; s++)
      for (let c = 0; c < 16; c++){
        const pts = [];
        for (let i = 0; i < 40; i++) pts.push([295000 + c * 300 + i, 151000 + i]);
        rings.push({ z: 17800 + s, points: pts });
      }
    const opened = [], saved = window.open;
    window.open = u => { opened.push(u); return { location: { set href(v){ opened.push(v); } } }; };
    tracingViewerOpen([{ name: "Enormous", color: "#40e28c", rings: rings }], null, {});
    await new Promise(r => setTimeout(r, 400));
    window.open = saved;
    return { n: opened.length, say: document.getElementById("tracingStatus").innerText,
             hasCopy: !!document.getElementById("tracingCopyState"),
             hasDl: !!document.getElementById("tracingSaveState") };
  });
  ok(huge.n === 0, "it stops rather than opening a tab that cannot hold it", huge.n + " tab(s)");
  ok(huge.hasCopy && huge.hasDl, "...and offers the JSON to copy or to download",
     "copy " + huge.hasCopy + ", download " + huge.hasDl);
  ok(/paste/i.test(huge.say), "...saying what to do with it", huge.say.slice(0, 120));

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
