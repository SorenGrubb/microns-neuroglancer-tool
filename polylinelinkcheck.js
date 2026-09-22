/* The viewer link carries POLYLINES, one per contour, not a line per edge.            2026-09-22

   Søren: "It seems that even though we have succesfully reduced the number of points with the
   polyline, it still uses the old JSON code with line annotations to open in Neuroglancer, if you
   can confirm that, please build a new JSON code with the polyline annotations to open in
   Neuroglancer instead."

   Confirmed: tracingRingLines wrote one {type:"line"} per EDGE, so a 26-vertex contour was 26
   annotations of two points each -- 52 coordinates where the contour has 26. Joining the loose
   lines on the way IN (lines_that_nearly_meet_are_one_contour.py) never touched the way OUT.

   MEASURED IN HIS OWN BROWSER, spelunker.cave-explorer.org, 2026-09-22: a state carrying
   {"type":"polyline","id":"pl_0","points":[[x,y,z]x8]} in a #! link loads, is typed POLYLINE in
   the layer, and comes back out of viewer.state.toJSON() with its eight points in order. So the
   viewer takes them; the id is still mandatory (a state with none loads an empty layer, silently).

   A ring is written CLOSED -- the first vertex repeated as the last -- because a polyline draws
   the segments between consecutive points and nothing more, and because that is the shape
   Spelunker itself writes, which is why core/tracing.js's ringFrom drops the repeat on the way in.

   Run: node polylinelinkcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

const RINGS = (sections, perSection, verts) => {
  const rings = [];
  for (let s = 0; s < sections; s++)
    for (let c = 0; c < perSection; c++){
      const pts = [];
      for (let i = 0; i < verts; i++){
        const a = 2 * Math.PI * i / verts;
        pts.push([Math.round(295000 + c * 800 + 200 * Math.cos(a)),
                  Math.round(151000 + 200 * Math.sin(a))]);
      }
      rings.push({ z: 17800 + s, points: pts });
    }
  return rings;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  console.log("one cell, 40 sections x 2 contours x 26 vertices");
  const got = await p.evaluate(async (mk) => {
    const rings = (new Function("return " + mk))()(40, 2, 26);
    document.getElementById("tracingPanel").open = true;
    const opened = [], saved = window.open;
    window.open = u => { opened.push(u); return { closed: false, opener: null,
      location: { set href(v){ opened.push(v); }, get href(){ return ""; } } }; };
    let threw = "";
    try { tracingViewerOpen([{ name: "Cell", color: "#40e28c", rings: rings }], null, {}); }
    catch (e){ threw = "THREW " + e.message; }
    await new Promise(r => setTimeout(r, 2000));
    window.open = saved;
    const url = opened.slice().sort((a, b) => b.length - a.length)[0] || "";
    const st = JSON.parse(decodeURIComponent(url.split("#!")[1] || "") || "{}");
    const lyr = (st.layers || []).filter(l => l.type === "annotation" && l.annotations)[0] || {};
    const anns = lyr.annotations || [];
    /* The same contours written the old way, for the size comparison. */
    let lineLen = 0;
    if (typeof tracingRingLines === "function"){
      const st2 = JSON.parse(JSON.stringify(st));
      (st2.layers || []).forEach(l => { if (l.annotations) l.annotations = tracingRingLines(rings, "t0"); });
      lineLen = encodeURIComponent(JSON.stringify(st2)).length;
    }
    /* And read straight back, so the round trip is the check and not a claim about it. */
    let back = null;
    try { back = UJ.tracing.ringsFromLink(url); } catch (e){ back = { error: String(e.message) }; }
    return { threw: threw, n: anns.length, nrings: rings.length,
             types: [...new Set(anns.map(a => a.type))],
             allIds: anns.length > 0 && anns.every(a => a && a.id),
             uniqueIds: new Set(anns.map(a => a.id)).size,
             first: anns[0] ? { type: anns[0].type, id: anns[0].id, np: (anns[0].points || []).length,
                                head: (anns[0].points || [])[0],
                                tail: (anns[0].points || []).slice(-1)[0] } : null,
             len: encodeURIComponent(JSON.stringify(st)).length, lineLen: lineLen,
             backRings: back && back.rings ? back.rings.length : -1,
             backSeen: back && back.seen, backOk: !!(back && back.ok),
             backFirst: back && back.rings && back.rings[0]
                        ? { z: back.rings[0].z, np: back.rings[0].points.length } : null };
  }, RINGS.toString());

  ok(!got.threw, "it builds a link", got.threw || "no throw");
  ok(got.types.length === 1 && got.types[0] === "polyline",
     "every annotation is a polyline, not a line", got.types.join("/") || "none");
  ok(got.n === got.nrings, "one annotation per contour, not one per edge",
     got.n + " annotations for " + got.nrings + " contours");
  ok(got.allIds && got.uniqueIds === got.n,
     "...each with an id of its own, which Neuroglancer drops an annotation for not having",
     got.uniqueIds + " distinct ids");
  ok(!!got.first && got.first.np === 27,
     "...26 vertices written as 27 points: the ring closed by repeating the first",
     got.first && got.first.np);
  ok(!!got.first && JSON.stringify(got.first.head) === JSON.stringify(got.first.tail),
     "...and the last point IS the first", got.first && JSON.stringify([got.first.head, got.first.tail]));
  ok(got.lineLen > 0 && got.len < got.lineLen / 2,
     "the link is less than half what the lines cost",
     Math.round(got.len / 1000) + "k vs " + Math.round(got.lineLen / 1000) + "k characters");

  console.log("\nand core/tracing.js reads its own output back");
  ok(got.backOk && got.backRings === got.nrings,
     "the same contours come back", got.backRings + " of " + got.nrings);
  ok(!!got.backSeen && got.backSeen.polylines === got.nrings && !got.backSeen.lines,
     "...read as polylines, with no line to chain", JSON.stringify(got.backSeen));
  ok(!!got.backFirst && got.backFirst.np === 26,
     "...with the closing repeat dropped again, so the ring is stored open once more",
     got.backFirst && got.backFirst.np);

  console.log("\nan organelle's outline, on the row's own arrow");
  const org = await p.evaluate(() => {
    if (typeof organOverlayInto !== "function" || typeof ORGAN_SHOW_NEXT === "undefined")
      return { missing: true };
    ORGAN_SHOW_NEXT = { name: "Lysosome 1", color: "#c83232", point: [1020, 2020, 101],
                        rings: [{ z: 101, points: [[1000, 2000], [1040, 2000], [1040, 2040], [1000, 2040]] }] };
    const st = { layers: [] };
    organOverlayInto(st, [1020, 2020, 101]);
    return { anns: (st.layers[0] || {}).annotations || null };
  });
  if (org.missing) console.log("  --   this page has no organelle overlay; organjumpcheck.js covers it");
  else {
    const anns = org.anns || [];
    const poly = anns.filter(a => a.type === "polyline");
    ok(poly.length === 1 && anns.filter(a => a.type === "point").length === 1,
       "one polyline for the outline and one point for the centre",
       anns.map(a => a.type).join("/") || "none");
    ok(!!poly[0] && poly[0].points.length === 5,
       "...four vertices closed into five points", poly[0] && poly[0].points.length);
  }

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
