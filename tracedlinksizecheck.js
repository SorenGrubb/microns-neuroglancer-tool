/* "Open all matches" does not build a link no tab will take.                          2026-09-23

   Søren, asking for whole cells in Filter and show: "We also have to keep in mind that they may be
   too big for showing in Neuroglancer if we collect all of them."

   He is right, and until now nothing looked. tracedOutlinesOpen() built the URL and opened it:

       var u = url(state);
       if (win){ win.location.href = u; } else window.open(u, "_blank");

   with no measurement anywhere in the path. Past 2,097,152 characters the browser refuses and the
   tab becomes about:blank#blocked — measured in Søren's own browser on 2026-09-22, and the failure
   he spent an evening on. A whole cell is 100–180 contours against a lysosome's dozen, so the
   selection that triggers it is exactly the one he has just asked for.

   THE CAP THAT EXISTED WAS THE WRONG UNIT. FILTER_TRACE_CAP stops at 150 OUTLINES, which was
   about how many Drive files the view would read, not about how long the link would be. 150
   lysosomes is a small link; three of Søren's arachnoid barrier cells is 393 contours and 44,000
   vertices. A cap in outlines cannot see the difference, so the thing it protects against is not
   the thing that breaks.

   So the budget is in CHARACTERS of the encoded annotations, which is what the browser counts, and
   outlines are left out only when they do not fit — with the number said out loud, because a view
   that quietly drew some of them is a lie about what the dataset holds.

   REWRITTEN 2026-09-24. This used to assert the opposite of what it asserts now: "one that does
   not fit is trimmed until it does, and says how many it left out". Søren: "what it does now is
   give an error message and then open Neuroglancer with fewer whole cell segmentations. That was
   not the point." Trimming inside the builder is what stopped the JSON offer from ever firing, so
   the builder no longer trims and the caller measures — see src/all_of_them_or_the_json.py and
   filterallornothingcheck.js, which asserts the new rule end to end.

   WHAT IS ASSERTED:
     - a selection that fits is drawn whole, and nothing is said about size
     - one that does NOT fit is still drawn whole: nothing is left out here
     - ...and it really is over the cap, so the caller has something to decide
     - the shape is the viewer's: a polyline viewer gets polylines, and the same cells cost far less
     - the cost is measured in what a URL counts, which is what the caller measures against

   Run: node tracedlinksizecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

const MAX = 2097152;
/* A viewer known NOT to read polylines, and one that does — both measured in Søren's browser on
   2026-09-22 (src/the_viewer_decides_the_shape.py). */
const LINES_ONLY = "https://ngl.microns-explorer.org/";
const POLYLINE = "https://spelunker.cave-explorer.org/";

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });

  /* The backend, answered locally: an index of traced CELLS and their contours. */
  let INDEX = [], ROWS = {};
  let reads = 0;
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("tracings") !== "1") return route.abort();
    const one = u.searchParams.get("structureId");
    const many = u.searchParams.get("structureIds");
    if (one || many){
      reads++;
      const ids = one ? [one] : String(many).split(",");
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ tracings: ids.map(s => ({ structureId: s, rows: ROWS[s] || [] })) }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json",
                           body: JSON.stringify({ tracings: INDEX }) });
  });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  /* n cells, each of `contours` rings of `pts` points — the shape of a real traced cell, whose
     rings are long and many. */
  const seed = (n, contours, pts) => {
    INDEX = []; ROWS = {};
    for (let c = 0; c < n; c++){
      const sid = "cell" + c;
      INDEX.push({ structureId: sid, kind: "cell", name: "Whole cell",
                   nucleusId: "nuc" + c, color: "#40e28c" });
      const rows = [];
      for (let r = 0; r < contours; r++){
        const P = [];
        for (let i = 0; i < pts; i++)
          P.push([200000 + r * 7 + i * 13, 120000 + r * 11 + i * 17].join(","));
        rows.push({ structureId: sid, kind: "cell", instanceOf: "", name: "Whole cell",
                    color: "#40e28c", nucleusId: "nuc" + c,
                    z: 18000 + r, ringIndex: 0, points: P.join(";") });
      }
      ROWS[sid] = rows;
    }
    return INDEX.map(x => x.nucleusId);
  };

  /* The builder is what every caller uses -- µJump, δJump, πJump and ηJump each in their own
     closure, βJump/λJump/χJump through core/openall.js -- and each then builds its own URL from
     the state it made. So the budget belongs to the builder, and this drives it the way they do. */
  const run = async (base, nucs, opts) => p.evaluate(async ([base, nucs, opts]) => {
    const said = [];
    const realToast = window.showSubmitToast;
    window.showSubmitToast = function(okv, msg){ said.push(String(msg || "")); };
    const el = document.getElementById("viewer");
    const viewerWas = el ? el.value : "";
    if (el) el.value = base;                       // the shape follows the page's viewer
    let layers = [];
    try {
      layers = await buildTracedOrganelleLayers({ nuc: nucs, root: [] }, "__cells",
                                                function(){}, opts || undefined) || [];
    } finally { window.showSubmitToast = realToast; if (el) el.value = viewerWas; }
    const state = { dimensions: { x: [4e-9, "m"], y: [4e-9, "m"], z: [4e-8, "m"] },
                    position: [200000, 120000, 18000], layers: layers.slice() };
    const url = base + "#!" + encodeURIComponent(JSON.stringify(state));
    return { len: url.length, said: said.join(" | "),
             types: [...new Set(layers.flatMap(l => (l.annotations || []).map(a => a.type)))].join(","),
             anns: layers.reduce((a, l) => a + (l.annotations || []).length, 0),
             names: layers.map(l => l.name).join(" | ") };
  }, [base, nucs, opts || null]);

  /* ── it fits ─────────────────────────────────────────────────────────────────────────────── */
  console.log("a selection that fits");
  {
    const nucs = seed(1, 20, 12);
    const r = await run(LINES_ONLY, nucs);
    ok(r.len > 0 && r.len < MAX, "opens, under the cap", Math.round(r.len / 1000) + "k");
    ok(!/left out|too big|opened in/i.test(r.said), "...with nothing said about size", r.said || "(nothing)");
    ok(r.names === "traced whole cell (1)", "...and the cell drawn", r.names);
  }

  /* ── too big, and still whole ───────────────────────────────────────── */
  console.log("\na selection too big for a link");
  {
    const nucs = seed(6, 200, 120);
    const r = await run(LINES_ONLY, nucs);
    ok(r.len > MAX, "it really is over the cap, which is the caller's problem to solve",
       Math.round(r.len / 1000) + "k against " + Math.round(MAX / 1000) + "k");
    ok(r.anns > 0, "...and every outline is still in it", r.anns + " annotation(s)");
    ok(!/left out|left \d+ outline|not one of these/i.test(r.said),
       "...with nothing trimmed and nothing said about trimming \u2014 the offer is what answers this",
       r.said.slice(0, 140) || "(said nothing)");
    ok(r.names === "traced whole cell (6)", "...all six cells", r.names);
  }

  /* ── the same selection, on a viewer that reads polylines ────────────────────── */
  console.log("\nthe same cells, where a contour is one annotation");
  {
    const nucs = seed(3, 180, 120);
    const lines = await run(LINES_ONLY, nucs);
    const poly = await run(POLYLINE, nucs);
    ok(poly.types === "polyline", "a polyline viewer gets polylines", poly.types);
    ok(lines.types === "line", "...and one that reads none gets a line per edge", lines.types);
    ok(poly.anns < lines.anns, "...one annotation per contour rather than one per edge",
       poly.anns + " against " + lines.anns);
    /* The four-to-one S\u00f8ren's own fibroblast shows: 418,811 characters as polylines against
       1,790,053 as lines. Both carry the same three cells; only the shape differs. */
    ok(poly.len * 3 < lines.len, "...and the link is a fraction of the length, for the same cells",
       Math.round(poly.len / 1000) + "k against " + Math.round(lines.len / 1000) + "k");
  }

  /* ── the unit is what a URL counts ───────────────────────────────────── */
  console.log("\ncost is measured in what a URL counts");
  {
    const both = await p.evaluate(() => {
      const a = [{ type: "polyline", id: "x", points: [[1, 2, 3], [4, 5, 6]] }];
      return { cost: tracedOutlinesCost(a), raw: JSON.stringify(a).length };
    });
    ok(both.cost > both.raw,
       "encodeURIComponent is what it counts, not JSON.stringify \u2014 which under-counts by about "
         + "two thirds", both.cost + " encoded against " + both.raw + " raw");
  }

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
