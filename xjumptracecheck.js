/* χJump's tracing card, against a cb2 served here.                                  2026-09-21

   The card is core/tracingcard.js, as on five other tools. What is χJump's own, and checked:

     - it mounts, on the live page, with χJump's storage keys and its id labels;
     - a coordinate reads the FRAGMENT there, from a raw uint64 segmentation whose info is in the
       mesh store and which sits 1,216 sections below the EM -- served here so that a read at any
       other z, or through seg/info, finds nothing;
     - the fragment is known to be part of a proofread cell, whose KEY goes in the cell box and
       whose type is offered;
     - the segmentation tick paints the whole cell's fragments, not only the one under the point;
     - the pad draws the EM, with the 4 nm level skipped (26 MB chunks);
     - the BULK card (step 3): markers on two fragments of one cell are ONE cell, filed under its
       key with each marker's own fragment; a marker on a fragment no cell contains cannot be ticked;
     - NOTHING in localStorage but the theme and the open tab -- the build's rule, which it cannot
       see the card keep, because the card's store is behind tracingStore().

   Run: node xjumptracecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};
const BOSS = "https://bossdb-open-data.s3.amazonaws.com/";
/* pc_0 of the embedded seeds: soma at voxel (110319, 95553, 258). Two of its own fragments. */
const POS = [110319, 95553, 258], FRAG = "8164402790444", OTHER = "7107617751130";
/* A fragment in no proofread cell: the seg chunks from x 30000 on hold it. */
const LOOSE = "123456789";
const EMINFO = { type: "image", data_type: "uint8", num_channels: 1, scales: [
  { key: "4_4_40",  resolution: [4, 4, 40],  size: [249600, 230400, 1200], voxel_offset: [0, 0, 0], chunk_sizes: [[64, 64, 25]], encoding: "raw" },
  { key: "8_8_40",  resolution: [8, 8, 40],  size: [124800, 115200, 1200], voxel_offset: [0, 0, 0], chunk_sizes: [[64, 64, 25]], encoding: "raw" },
  { key: "16_16_40", resolution: [16, 16, 40], size: [62400, 57600, 1200], voxel_offset: [0, 0, 0], chunk_sizes: [[64, 64, 25]], encoding: "raw" },
  { key: "32_32_40", resolution: [32, 32, 40], size: [31200, 28800, 1200], voxel_offset: [0, 0, 0], chunk_sizes: [[64, 64, 25]], encoding: "raw" }] };
const SEGINFO = { type: "segmentation", data_type: "uint64", num_channels: 1, scales: [
  { key: "16_16_40", resolution: [16, 16, 40], size: [62464, 57600, 1248], voxel_offset: [0, 0, -1280],
    chunk_sizes: [[64, 64, 16]], encoding: "raw" }] };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  const hits = { em4: 0, em: 0, seg: 0, segWrongZ: 0, segInfoBeside: 0 };
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**gstatic.com/**", "**script.google.com/**"])
    await p.route(h, r => r.abort());
  await p.route(BOSS + "**", route => {
    const u = route.request().url().slice(BOSS.length);
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (u === "nguyen_thomas2022/cb2/em/info")
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(EMINFO) });
    if (u === "mesh/nguyen_thomas2022/cb2/info")
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(SEGINFO) });
    if (u === "nguyen_thomas2022/cb2/seg/info"){ hits.segInfoBeside++; return route.abort(); }
    let m = /^nguyen_thomas2022\/cb2\/em\/(\d+)_\d+_40\/(\d+)-(\d+)_(\d+)-(\d+)_(\d+)-(\d+)$/.exec(u);
    if (m){
      if (m[1] === "4") hits.em4++; else hits.em++;
      const n = (m[3] - m[2]) * (m[5] - m[4]) * (m[7] - m[6]);
      const buf = Buffer.alloc(n);
      for (let i = 0; i < n; i++) buf[i] = 40 + ((i * 37) % 180);        // texture, in the window
      return route.fulfill({ status: 200, headers: cors, body: buf });
    }
    m = /^nguyen_thomas2022\/cb2\/seg\/16_16_40\/(\d+)-(\d+)_(\d+)-(\d+)_(-?\d+)-(-?\d+)$/.exec(u);
    if (m){
      hits.seg++;
      const z0 = +m[5], z1 = +m[6];
      /* Only the sections the soma is on, once shifted: 258 - 1216 = -958. */
      if (!(z0 <= -958 && -958 < z1)){ hits.segWrongZ++; return route.fulfill({ status: 404, headers: cors, body: "" }); }
      const sx = m[2] - m[1], sy = m[4] - m[3], sz = z1 - z0;
      const buf = Buffer.alloc(sx * sy * sz * 8);
      if (+m[1] >= 30000){
        for (let i = 0; i < sx * sy * sz; i++) buf.writeBigUInt64LE(BigInt(LOOSE), 8 * i);
        return route.fulfill({ status: 200, headers: cors, body: buf });
      }
      for (let i = 0; i < sx * sy * sz; i++)
        buf.writeBigUInt64LE(BigInt((i % sx) < 4 ? OTHER : FRAG), 8 * i);   // a strip of another fragment of the same cell
      return route.fulfill({ status: 200, headers: cors, body: buf });
    }
    return route.fulfill({ status: 404, headers: cors, body: "" });
  });

  await p.goto("file://" + page_("xjump.html"));
  await p.waitForTimeout(5000);

  console.log("the card");
  const m = await p.evaluate(() => ({
    card: !!document.querySelector("#tracingCard #tracePad"),
    under: (function(){ const c = document.getElementById("cellPanelCard"), t = document.getElementById("tracingCard");
      return !!(c && t && (c.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)); })(),
    keys: [UJ.cfg.tracing.lsKey, UJ.cfg.tracing.draftsKey, UJ.cfg.tracing.draftKey, UJ.cfg.tracing.penKey],
    labels: [...document.querySelectorAll("#tracingCard label")].map(l => l.textContent).filter(t => /Cell|Fragment|Nucleus|Root/.test(t)),
    ghost: !!document.getElementById("tracePadGhosts"),
    types: [...document.querySelectorAll("#tracingType option")].map(o => o.value)
  }));
  ok(m.card, "the card is built on the live page");
  ok(m.under, "...under The cell");
  ok(m.keys.every(k => /^xjump_/.test(k)), "...with χJump's own storage keys", m.keys.join(" "));
  ok(m.labels.some(t => /^Cell/.test(t)) && m.labels.some(t => /^Fragment/.test(t)) && !m.labels.some(t => /Nucleus ID|Root ID/.test(t)),
     "the id boxes are called Cell and Fragment", m.labels.join(" | "));
  ok(!m.ghost, "no mesh-ghost tick: χJump's meshes are not core/mesh.js's");
  ok(m.types.includes("Purkinje cell") && m.types.includes("Granule cell"), "the proofread types are offered",
     m.types.join(", "));

  console.log("\na coordinate on a proofread Purkinje cell");
  const r = await p.evaluate(async (POS) => {
    document.getElementById("tracingX").value = POS[0];
    document.getElementById("tracingY").value = POS[1];
    document.getElementById("tracingZ").value = POS[2];
    await tracingResolveAt(POS);
    return { root: document.getElementById("tracingRootId").value, cell: document.getElementById("tracingNucId").value,
             type: document.getElementById("tracingType").value, say: document.getElementById("tracingAtSay").textContent };
  }, POS);
  ok(r.root === FRAG, "the fragment under the point is read", r.root + " — " + r.say);
  ok(hits.segInfoBeside === 0, "...with the info from the mesh store, never seg/info");
  ok(hits.seg > 0 && hits.segWrongZ === 0, "...at the soma's own sections, 1,216 below the EM",
     hits.seg + " read(s), " + hits.segWrongZ + " elsewhere");
  ok(r.cell === "cb2/htem/pc_0", "the cell's KEY goes in the cell box", r.cell);
  ok(r.type === "Purkinje cell", "...and its type is offered", r.type);

  console.log("\nthe pad");
  const d = await p.evaluate(async () => {
    document.getElementById("tracePadOpen").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !(PAD_VIEW && !PAD_BUSY)) await new Promise(r => setTimeout(r, 200));
    const cv = document.getElementById("tracePad");
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let lo = 255, hi = 0; for (let i = 0; i < px.length; i += 4 * 97){ lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); }
    const menu = [...document.querySelectorAll("#tracePadMip option")].map(o => o.textContent.split(" — ")[0] + " " + (o.textContent.match(/(\d+) nm data/) || [])[1]);
    /* The segmentation tick: the whole cell, in magenta. */
    const tick = document.getElementById("tracePadSeg"); tick.checked = true;
    PAD_VIEW = PAD_VIEW; await padDraw();
    return { drawn: !!PAD_VIEW, lo, hi, menu, segSay: document.getElementById("tracePadSegSay").textContent };
  });
  ok(d.drawn && d.hi - d.lo > 50, "the EM section is drawn", d.lo + "–" + d.hi);
  ok(hits.em > 0 && hits.em4 === 0, "...from 8 nm and coarser, never the 26 MB 4 nm chunks", hits.em + " / " + hits.em4);
  ok(!d.menu.some(x => / 4$/.test(x)), "...and the zoom menu does not offer 4 nm data", d.menu.join(" | "));
  ok(/cell \(\d+ segments\)/.test(d.segSay) && !/nothing here/.test(d.segSay),
     "the segmentation tick paints the whole cell, all its fragments", d.segSay);

  console.log("\nthe cell on screen");
  const f = await p.evaluate(async () => {
    document.getElementById("tracingX").value = ""; document.getElementById("tracingY").value = "";
    document.getElementById("tracingZ").value = "";
    UJ.app.goTo ? null : null;
    document.getElementById("x").value = "84852"; document.getElementById("y").value = "105421";
    document.getElementById("z").value = "211";
    document.getElementById("go").click();
    await new Promise(r => setTimeout(r, 1500));
    return { cur: window.CUR_POS, box: ["tracingX", "tracingY", "tracingZ"].map(i => document.getElementById(i).value).join(",") };
  });
  ok(f.cur && f.cur.length === 3, "looking up a cell sets the coordinate the card follows", JSON.stringify(f.cur));
  ok(f.box === (f.cur || []).join(","), "...and the card's boxes take it", f.box);
  console.log("\nthe bulk card");
  const k = await p.evaluate(async (a) => {
    const [POS, FRAG, OTHER] = a;
    const st = { dimensions: { x: [4e-9, "m"], y: [4e-9, "m"], z: [4e-8, "m"] }, layers: [
      { type: "annotation", name: "m", source: "local://annotations", annotations: [
        { type: "point", id: "a", point: POS },                               // on FRAG
        { type: "point", id: "b", point: [110084, POS[1], POS[2]] },           // on OTHER, same cell
        { type: "point", id: "c", point: [130000, POS[1], POS[2]] } ] }] };    // on a loose fragment
    const det = document.getElementById("bulkOrganPanel"); if (det) det.open = true;
    document.getElementById("bulkOrganKind").value = "mitochondria";
    document.getElementById("bulkOrganLink").value = "https://x/#!" + encodeURIComponent(JSON.stringify(st));
    document.getElementById("bulkOrganResolve").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && BULK_ORGAN_ROWS.length < 3) await new Promise(r => setTimeout(r, 200));
    const rows = BULK_ORGAN_ROWS.map(r => ({ use: r.use, key: r.cellKey, root: r.rootId, warn: r.warn,
                                             cell: r.i >= 0 ? bulkNucIdOf(r.i) : "" }));
    const posts = [];
    window.postReport = function(pl){ posts.push(pl); return true; };
    document.getElementById("bulkOrganSubmit").click();
    return { rows, posts: posts.map(x => ({ nuc: x.nucleusId, root: x.rootId, g: x.groupId, n: x.subCount, kind: x.kind })),
             table: document.getElementById("bulkOrganTable").textContent };
  }, [POS, FRAG, OTHER]);
  ok(k.rows.length === 3, "three markers read", k.rows.length);
  ok(k.rows[0].use && k.rows[1].use && k.rows[0].key === k.rows[1].key && k.rows[0].cell === "cb2/htem/pc_0",
     "two markers on two fragments of pc_0 are ONE cell", JSON.stringify(k.rows.slice(0, 2)));
  ok(!k.rows[2].use && !k.rows[2].key && /not part of any cell/.test(k.rows[2].warn),
     "a marker on a fragment no cell contains cannot be ticked, and says why", k.rows[2].warn);
  ok(/1 cell\b/.test(k.table), "...and the summary counts one cell", (k.table.match(/\d+ of \d+[^.]*/) || [""])[0]);
  ok(k.posts.length === 2 && k.posts.every(x => x.nuc === "cb2/htem/pc_0" && x.n === 2 && x.kind === "mitochondria")
     && k.posts[0].g === k.posts[1].g,
     "submitted as one group, filed under the cell's key", JSON.stringify(k.posts));
  ok(k.posts.length === 2 && k.posts[0].root === FRAG && k.posts[1].root === OTHER,
     "...each row with its own fragment", k.posts.map(x => x.root).join(", "));

  /* NOTHING IN THE BROWSER, 2026-09-21. χJump's build allows two localStorage keys, the theme and
     the open tab, because no work may live in the browser. The card keeps its store behind
     tracingStore(), which the build's literal scan cannot see -- so it is checked here, by use. */
  console.log("\nnothing in the browser");
  const nb = await p.evaluate(async (POS) => {
    ["tracingX", "tracingY", "tracingZ"].forEach((id, k) => document.getElementById(id).value = POS[k]);
    if (document.getElementById("tracePadWrap").style.display === "none") document.getElementById("tracePadOpen").click();
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !(PAD_VIEW && !PAD_BUSY)) await new Promise(r => setTimeout(r, 200));
    PAD.rings.push({ z: POS[2], points: [[POS[0], POS[1]], [POS[0] + 40, POS[1]], [POS[0] + 40, POS[1] + 40]], inst: 0 });
    draftSave(true);
    const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return { keys, say: document.getElementById("tracePadSay").textContent, drafts: draftStore.list().length,
             keep: UJ.cfg.tracing.keepLocal };
  }, POS);
  ok(nb.keys.every(k => k === "ujump_theme" || k === "xjump_active_tab"),
     "localStorage holds the theme and the open tab, and nothing else", nb.keys.join(",") || "empty");
  ok(nb.drafts >= 1, "...while the draft is kept on the page", nb.drafts + " draft(s)");
  ok(/keeps no work in the browser/.test(nb.say), "and the card says where it went", nb.say.slice(0, 90));
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
