/* ωJump's bulk organelle card, and the traced outlines in its Filter and show.        2026-09-21

   Checked on the LIVE page, with the backend and the one WEBKNOSSOS volume answered locally
   (fixtures/zarr_fixtures.json, served at that volume's real address; in the fixture every voxel is
   its own segment, seg(x,y,z)).

     a volume WITH a segmentation   a marker in the segment a found nucleus sits in -> that nucleus,
                                    ticked; a marker in a segment with no nucleus -> not tickable
     a volume without               the nearest found nucleus within 10 µm -> offered UNTICKED with
                                    its distance; nearly equidistant -> not tickable; far -> nothing
     filed as                       the nucleus key, at the nucleus's voxel -- what ωJump's own
                                    organelle form files
     signed out                     nothing is sent, and the page says why
     switching volume               empties the card
     Open all matches               with a kind picked, the matched nuclei's outlines come as a layer

   Run: node wjbulkcheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const FX = JSON.parse(fs.readFileSync(__dirname + "/fixtures/zarr_fixtures.json", "utf8"));
const WK = "https://demo.wk1.connectomics.hpccloud.mpg.de/data/zarr/62b17f19010000aa0075d7bb/";
const seg = (x, y, z) => (864691135000000000n + BigInt(x) + 1000n * BigInt(y) + 1000000n * BigInt(z)).toString();

const NUCLEI = {
  "wk-mk1-f6-l23": [{ id: "wk-mk1-f6-l23:1", pos: [7 * 11.24, 5 * 11.24, 2 * 30], tally: [], totalVotes: 0 }],
  "jrc_mus-liver": [{ id: "jrc_mus-liver:1", pos: [10000, 10000, 10000], tally: [{ label: "hepatocyte", n: 2 }], totalVotes: 2 },
                    { id: "jrc_mus-liver:2", pos: [30000, 10000, 10000], tally: [], totalVotes: 0 }]
};
const link = pts => "https://neuroglancer-demo.appspot.com/#!" + encodeURIComponent(JSON.stringify({
  layers: [{ type: "annotation", name: "m", source: "local://annotations",
             annotations: pts.map((p, i) => ({ type: "point", id: "p" + i, point: p })) }] }));

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [], dialogs = [], posts = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**gstatic.com/**",
                   "**s3.amazonaws.com/**", "**data-humerus.webknossos.org/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", route => {
    const req = route.request();
    if (req.method() === "POST"){
      try { posts.push(JSON.parse(req.postData())); } catch (e){}
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    }
    const u = new URL(req.url());
    let body = { ok: true, visited: [], nuclei: NUCLEI[u.searchParams.get("dataset")] || [] };
    if (u.searchParams.get("tracings") === "1"){
      const sid = u.searchParams.get("structureId");
      body = sid
        ? { ok: true, tracings: [{ rows: [{ structureId: "t1", kind: "mitochondria", instanceOf: "mitochondria",
              name: "m1", color: "#00ff00", z: 1250, ringIndex: 0, nucleusId: "jrc_mus-liver:1",
              points: "1200,1200;1260,1200;1260,1260;1200,1260" }] }] }
        : { ok: true, tracings: [
            { structureId: "t1", kind: "mitochondria", instanceOf: "mitochondria", nucleusId: "jrc_mus-liver:1", color: "#00ff00" },
            { structureId: "t2", kind: "mitochondria", instanceOf: "mitochondria", nucleusId: "wk-mk1-f6-l23:1", color: "#00ff00" }] };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await p.route(WK + "**", route => {
    const rest = route.request().url().slice(WK.length);
    const key = rest.replace(/^color\//, "wk/color/").replace(/^segmentation\//, "wk/seg/");
    if (!(key in FX)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" },
                           body: Buffer.from(FX[key], "base64") });
  });
  await p.goto("file://" + page_("wjump.html"));
  await p.waitForTimeout(3000);

  const find = async (ds, pts) => p.evaluate(async ([ds, url]) => {
    if (UJ.app.dataset() !== ds){ UJ.app.selectDataset(ds); }
    const t0 = Date.now();
    while (Date.now() - t0 < 5000 && !(UJ.app.state().nuclei || []).some(n => n.id.indexOf(ds + ":") === 0))
      await new Promise(r => setTimeout(r, 100));
    document.getElementById("bulkOrganPanel").open = true;
    document.getElementById("bulkOrganKind").value = "mitochondria";
    document.getElementById("bulkOrganLink").value = url;
    await bulkOrganFindCells();
    return { rows: BULK_ORGAN_ROWS.map(r => ({ i: r.i, key: r.cellKey, use: r.use, warn: r.warn, root: r.rootId })),
             status: document.getElementById("bulkOrganStatus").textContent,
             boxes: [...document.querySelectorAll("#bulkOrganTable input[type=checkbox]")].map(c => c.disabled ? "x" : c.checked ? "on" : "off") };
  }, [ds, link(pts)]);

  console.log("the card");
  const m = await p.evaluate(() => {
    const t = document.getElementById("tracingCard"), k = document.getElementById("bulkOrganCard");
    return { card: !!(k && k.querySelector("#bulkOrganResolve")),
             under: !!(t && k && (t.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING)),
             picker: !!document.getElementById("filterOrganSeg") };
  });
  ok(m.card && m.under, "the bulk card is built on the live page, under the tracing card");
  ok(m.picker, "Filter and show has the traced-outline picker");

  console.log("\na volume with a segmentation (WEBKNOSSOS, Zarr)");
  const w = await find("wk-mk1-f6-l23", [[7, 5, 2], [3, 3, 1]]);
  ok(w.rows[0].i === 0 && w.rows[0].use && w.rows[0].root === seg(7, 5, 2),
     "a marker in the segment a found nucleus sits in is filed to that nucleus, ticked", JSON.stringify(w.rows[0]));
  ok(!w.rows[1].key && w.boxes[1] === "x" && /no nucleus has been found in this segment/.test(w.rows[1].warn),
     "a marker in a segment with no nucleus found cannot be ticked", w.rows[1].warn);

  console.log("\nsigned out");
  const so = await p.evaluate(() => { document.getElementById("bulkOrganSubmit").click(); return document.getElementById("bulkOrganSubmit").disabled; });
  ok(dialogs.length === 1 && /Sign in with Google first/.test(dialogs[0]) && posts.length === 0 && !so,
     "nothing is sent, the page says why, and Submit stays live", dialogs[0]);

  console.log("\nsigned in");
  await p.evaluate(() => UJ.app.setCredential("tok", "a@b.c", 0));
  await p.evaluate(() => document.getElementById("bulkOrganSubmit").click());
  await p.waitForTimeout(500);
  const wp = posts.filter(x => x.type === "organelle_location");
  ok(wp.length === 1 && wp[0].nucleusId === "wk-mk1-f6-l23:1" && wp[0].coord === "7,5,2"
     && wp[0].rootId === seg(7, 5, 2) && wp[0].kind === "mitochondria" && wp[0].path === "bulk paste",
     "filed under the nucleus key, at the nucleus's voxel, with the segment", JSON.stringify(wp[0] || {}).slice(0, 160));

  console.log("\na volume without one (OpenOrganelle, 8 nm)");
  const l = await find("jrc_mus-liver", [[1500, 1250, 1250], [2437, 1250, 1250], [1250, 1250, 6000]]);
  ok(l.rows[0].i === 0 && !l.rows[0].use && l.boxes[0] === "off" && /2\.0 µm away/.test(l.rows[0].warn),
     "the nearest found nucleus within 10 µm is offered, unticked, with its distance", l.rows[0].warn);
  ok(l.boxes[1] === "x" && /too close to call/.test(l.rows[1].warn),
     "two nearly equidistant nuclei: not tickable", l.rows[1].warn);
  ok(l.boxes[2] === "x" && /no nucleus found within 10 µm/.test(l.rows[2].warn),
     "nothing within 10 µm: listed with its reason", l.rows[2].warn);
  posts.length = 0;
  await p.evaluate(() => {
    const cb = document.querySelector("#bulkOrganTable input.bulkorgpick");
    cb.checked = true; cb.dispatchEvent(new Event("change"));
    document.getElementById("bulkOrganSubmit").click();
  });
  await p.waitForTimeout(500);
  const lp = posts.filter(x => x.type === "organelle_location");
  ok(lp.length === 1 && lp[0].nucleusId === "jrc_mus-liver:1" && lp[0].coord === "1250,1250,1250" && lp[0].rootId === "",
     "ticked by hand, it is filed under that nucleus, with no segment", JSON.stringify(lp[0] || {}).slice(0, 160));

  console.log("\nthe volume changes");
  const r = await p.evaluate(async () => {
    UJ.app.selectDataset("wk-mk1-f6-l23");
    await new Promise(r => setTimeout(r, 300));
    return { rows: BULK_ORGAN_ROWS.length, link: document.getElementById("bulkOrganLink").value,
             table: document.getElementById("bulkOrganTable").innerHTML };
  });
  ok(r.rows === 0 && r.link === "" && r.table === "", "switching volume empties the card");

  console.log("\nOpen all matches, with the outlines");
  const o = await p.evaluate(async () => {
    UJ.app.selectDataset("jrc_mus-liver");
    const t0 = Date.now();
    while (Date.now() - t0 < 5000 && !(UJ.app.state().nuclei || []).some(n => n.id.indexOf("jrc_mus-liver:") === 0))
      await new Promise(r => setTimeout(r, 100));
    document.getElementById("f-run").click();
    await new Promise(r => setTimeout(r, 200));
    const opened = [];
    window.open = function(u){ const w = { location: { href: u || "" } }; opened.push(w); return w; };
    const sel = document.getElementById("filterOrganSeg");
    sel.value = "__all";
    document.getElementById("f-open").click();
    const t1 = Date.now();
    while (Date.now() - t1 < 5000 && !(opened[0] && opened[0].location.href)) await new Promise(r => setTimeout(r, 100));
    const href = opened[0] ? opened[0].location.href : "";
    const st = href ? JSON.parse(decodeURIComponent(href.slice(href.indexOf("#!") + 2))) : { layers: [] };
    const L = st.layers.filter(x => /^traced /.test(x.name));
    return { n: opened.length, names: st.layers.map(x => x.name), traced: L.map(x => x.name),
             first: L[0] ? L[0].annotations[0] : null, dims: st.dimensions };
  });
  ok(o.n === 1 && o.traced.length === 1 && /mitochondri/.test(o.traced[0]),
     "the matched nucleus's outline comes as one layer, and one tab is opened", o.traced.join(",") || o.names.join(","));
  ok(o.first && o.first.pointA.join(",") === "1200,1200,1250",
     "its contour is in the volume's voxels, as the link declares", o.first && o.first.pointA.join(","));
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
