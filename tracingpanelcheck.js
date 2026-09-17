/* A traced cell starts as a paste.                                                 2026-09-16

   Drives the REAL tracing card in the REAL µJump page: paste a link of contours, keep it, and
   check it reaches the Blender notebook the panel writes. Only `postReport` and `alert` are
   replaced; everything between the textarea and the notebook is the shipped code.

   THE ASSERTION THAT MATTERS is the last section: a kept tracing appears in the params cell of the
   notebook the Blender button writes, with its coordinates intact. That is the whole feature —
   trace a cell the segmentation does not have, and get it in the .blend — and it is the one thing
   no unit test of either half can see.

   AND IT MUST WORK SIGNED OUT. Sharing a tracing needs a sign-in and a backend redeploy that has
   not happened; the export needs neither. If "Keep it" ever starts demanding either, this fails.

   Run: node tracingpanelcheck.js  */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A contour as BrainSharer's polygon tool writes one: the collection holds ids, the geometry is
   ordinary line annotations, everything flat with parentAnnotationId. */
function polygon(cx, cy, z, r, n, id){
  const pts = [];
  for (let i = 0; i < n; i++){
    const t = 2 * Math.PI * i / n;
    pts.push([Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), z]);
  }
  const lines = pts.map((p, i) => ({ type: "line", id: id + "_l" + i, parentAnnotationId: id,
                                     pointA: p, pointB: pts[(i + 1) % n] }));
  return [{ type: "polygon", id, source: pts[0],
            childAnnotationIds: lines.map(l => l.id) }].concat(lines);
}
function link(annotations){
  return "https://neuroglancer.example/#!" + encodeURIComponent(JSON.stringify(
    { layers: [{ type: "annotation", name: "annotation", annotations }] }));
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.addInitScript(() => {
    window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m));
    try { localStorage.removeItem("ujump_tracings_v1"); } catch (e) {}
  });
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("where it sits");
  const placed = await p.evaluate(() => {
    const card = document.getElementById("tracingCard");
    const jump = document.querySelector('[data-tabpanel="jump"]');
    const bulk = document.getElementById("bulkOrganCard");
    return { exists: !!card, inJump: !!(card && jump && jump.contains(card)),
             afterBulk: !!(card && bulk &&
               (bulk.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
             collapsed: !!(card && !card.querySelector("details").open),
             types: document.querySelectorAll("#tracingType option").length,
             module: typeof UJ !== "undefined" && !!UJ.tracing };
  });
  ok(placed.exists && placed.inJump, "the card is in the Jump tab");
  ok(placed.afterBulk, "...under the bulk organelle card");
  ok(placed.collapsed, "...collapsed, so it costs a coordinate lookup nothing");
  ok(placed.module, "core/tracing.js is loaded by the page");
  ok(placed.types > 20, "the cell types are the ontology's own leaf names",
     placed.types + " options");

  await p.evaluate(() => { document.getElementById("tracingPanel").open = true; });

  console.log("\nthe card's own coordinate");
  {
    const c = await p.evaluate(async () => {
      window.__opened = [];
      window.open = (u) => { window.__opened.push(u); return null; };
      const X = document.getElementById("tracingX"), Y = document.getElementById("tracingY"),
            Z = document.getElementById("tracingZ"), S = document.getElementById("tracingStatus");
      const out = {};
      out.fields = !!X && !!Y && !!Z;

      /* Pasting the whole triple into x, the way the main coordinate box does it. */
      X.value = "240700, 207900, 21400";
      X.dispatchEvent(new Event("input", { bubbles: true }));
      out.split = [X.value, Y.value, Z.value].join("/");

      window.CUR_POS = null;
      document.getElementById("tracingOpen").click();
      out.typedOpens = window.__opened.length;
      try { out.typedAt = String(JSON.parse(decodeURIComponent(
        (window.__opened[0] || "").split("#!")[1] || "")).position); } catch (e) { out.typedAt = ""; }

      /* Half-filled: he is mid-type, and opening somewhere else would look identical to opening in
         the right place until two sections into a tracing. */
      window.__opened = [];
      Z.value = "";
      window.CUR_POS = [240640, 207872, 21360];
      document.getElementById("tracingOpen").click();
      out.halfOpens = window.__opened.length;
      out.halfSays = S.innerText;

      /* Cleared, it follows the cell on screen -- and the boxes say so. */
      X.value = Y.value = Z.value = "";
      document.getElementById("tracingPanel").open = false;
      document.getElementById("tracingPanel").open = true;
      await new Promise(r => setTimeout(r, 0));   // <details> fires `toggle` asynchronously
      out.filled = [X.value, Y.value, Z.value].join(",");
      return out;
    });
    ok(c.fields, "the card has x, y and z boxes of its own");
    ok(c.split === "240700/207900/21400",
       "...and pasting x, y, z into x splits it, like the main coordinate box", c.split);
    ok(c.typedOpens === 1 && c.typedAt === "240700,207900,21400",
       "a typed coordinate opens the viewer with no cell on screen at all \u2014 which is what "
       + "\u201cthe button doesn\u2019t work\u201d was", c.typedAt);
    ok(c.halfOpens === 0 && /all three/i.test(c.halfSays),
       "two boxes of three opens nothing and says so, rather than quietly going somewhere else",
       c.halfSays.slice(0, 60));
    ok(c.filled === "240640,207872,21360",
       "cleared and reopened, the boxes fill from the cell on screen", c.filled);
  }

  console.log("\nthe button that gives him somewhere to draw");
  {
    const v = await p.evaluate(() => {
      window.__opened = [];
      window.open = (u) => { window.__opened.push(u); return null; };
      window.CUR_POS = null;
      ["tracingX", "tracingY", "tracingZ"].forEach(i => { document.getElementById(i).value = ""; });
      document.getElementById("tracingOpen").click();
      const refused = document.getElementById("tracingStatus").innerText;
      window.CUR_POS = [240640, 207872, 21360];
      document.getElementById("tracingOpen").click();
      const u = window.__opened[window.__opened.length - 1] || "";
      let s = null;
      try { s = JSON.parse(decodeURIComponent(u.split("#!")[1] || "")); } catch (e) {}
      return { refused: refused, n: window.__opened.length, base: u.split("#!")[0], state: s };
    });
    ok(/has to open somewhere/i.test(v.refused) && v.n === 1,
       "with nothing on screen it says where to start, and opens nothing",
       v.refused.slice(0, 55));
    const ann = ((v.state && v.state.layers) || []).filter(l => l.type === "annotation");
    const tr = ann.find(l => l.name === "tracing");
    ok(!!tr, "the link carries an annotation layer called tracing");
    ok(!!tr && tr.tool === "annotatePoint",
       "...with the POINT tool live \u2014 no viewer a link can reach has a polygon tool "
       + "(measured 2026-09-17), and a point is one ctrl+click per vertex against a line's two",
       tr && tr.tool);
    ok(!!tr && Array.isArray(tr.annotations) && tr.annotations.length === 0,
       "...and empty, so everything that comes back is his");
    ok(!!v.state && !!v.state.selectedLayer && v.state.selectedLayer.layer === "tracing",
       "...and selected, so the tools are on screen rather than three clicks away");
    ok(!ann.some(l => /cortical layers/i.test(l.name || "")),
       "the Cortical layers bands are NOT on it \u2014 they are lines, and would chain into his contours");
    ok(!!v.state && v.state.layout === "xy",
       "the layout is a section, not a section plus a 3D pane",
       v.state && JSON.stringify(v.state.layout));
    ok(String(v.state && v.state.position) === "240640,207872,21360",
       "...centred where he was", String(v.state && v.state.position));
    ok(/^https?:\/\//.test(v.base), "and it opens the viewer chosen at the top of the tab", v.base);
  }

  console.log("\nthe polygon tool, clicked");
  {
    /* The EM fetch is stubbed: what is under test here is the TOOL -- which click drops a vertex,
       which one closes, what a drag does, where the contours end up. emtilescheck.js drives the
       real reader over a synthetic volume, and the live bucket was measured by hand. The stub's
       mapping is the real one's shape: 32 nm/px against the tool's 4 nm voxel is 8 tool voxels a
       pixel. */
    await p.evaluate(() => {
      UJ.emtiles.configure = () => ({});
      UJ.emtiles.configured = () => true;
      window.__drawn = 0;
      UJ.emtiles.drawSection = async (cv, o) => {
        window.__drawn++;
        const g = cv.getContext("2d");
        g.fillStyle = "#444"; g.fillRect(0, 0, cv.width, cv.height);
        const k = 8;
        const x0 = o.centre[0] - (cv.width >> 1) * k, y0 = o.centre[1] - (cv.height >> 1) * k;
        return { mip: 2, mips: 3, nmPerPx: 32, z: o.centre[2], w: cv.width, h: cv.height, chunks: 1,
                 toolAt: (px, py) => [Math.round(x0 + px * k), Math.round(y0 + py * k), o.centre[2]],
                 pxAt: (t) => [Math.round((t[0] - x0) / k), Math.round((t[1] - y0) / k)],
                 pxPerToolVoxel: 1 / k };
      };
      ["tracingX", "tracingY", "tracingZ"].forEach((id, i) => {
        document.getElementById(id).value = [240640, 207872, 21360][i];
      });
      window.CUR_POS = null;
      document.getElementById("tracePadOpen").click();
    });
    await p.waitForTimeout(250);
    const opened = await p.evaluate(() => ({
      shown: document.getElementById("tracePadWrap").style.display !== "none",
      drawn: window.__drawn, z: PAD.z }));
    ok(opened.shown && opened.drawn === 1, "the pad opens and draws the section once",
       opened.drawn + " draws");
    ok(opened.z === 21360, "...on the section in the coordinate boxes", opened.z);

    /* page.mouse does not scroll, and this card is a long way down a very long page: a box
       read without this is a real rectangle in page coordinates that no click can reach. */
    await p.locator("#tracePad").scrollIntoViewIfNeeded();
    await p.waitForTimeout(80);
    const box = await p.locator("#tracePad").boundingBox();
    const click = async (x, y) => {
      await p.mouse.move(box.x + x, box.y + y);
      await p.mouse.down(); await p.mouse.up();
      await p.waitForTimeout(20);
    };
    await click(120, 120); await click(240, 120); await click(240, 240);
    const three = await p.evaluate(() => ({ pending: PAD.pending.length, rings: PAD.rings.length,
                                            first: String(PAD.pending[0] || "") }));
    ok(three.pending === 3 && three.rings === 0, "three clicks are three vertices, not a contour yet",
       three.pending + " vertices");
    ok(/^\d+,\d+$/.test(three.first),
       "...stored as a TOOL voxel, so panning and zooming cannot move it", three.first);

    /* Back on the first vertex: the click that closes. Two pixels off, because nobody lands on it. */
    await click(122, 118);
    const closed = await p.evaluate(() => ({ pending: PAD.pending.length, rings: PAD.rings.length,
                                             z: PAD.rings[0] && PAD.rings[0].z,
                                             n: PAD.rings[0] && PAD.rings[0].points.length,
                                             say: document.getElementById("tracePadSay").innerText }));
    ok(closed.rings === 1 && closed.pending === 0,
       "clicking the first vertex again CLOSES the contour \u2014 the gesture the card tells him about",
       closed.rings + " contour");
    ok(closed.n === 3, "...with the three vertices, not a fourth where he clicked to close", closed.n);
    ok(closed.z === 21360, "...on this section", closed.z);

    /* A DRAG PANS and must not leave a vertex behind. */
    await p.mouse.move(box.x + 300, box.y + 300);
    await p.mouse.down();
    await p.mouse.move(box.x + 340, box.y + 330, { steps: 4 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    const panned = await p.evaluate(() => ({ pending: PAD.pending.length, drawn: window.__drawn }));
    ok(panned.pending === 0, "a drag pans and leaves no vertex behind", panned.pending + " pending");
    ok(panned.drawn === 2, "...and it redraws the section at the new centre", panned.drawn + " draws");

    /* On a section, and round again. */
    await p.evaluate(() => document.getElementById("tracePadNext").click());
    await p.waitForTimeout(200);
    const stepped = await p.evaluate(() => ({ z: PAD.z, step: document.getElementById("tracePadStep").value }));
    ok(stepped.z === 21365 && stepped.step === "5", "the step button moves five sections on", stepped.z);

    await click(120, 120); await click(240, 120); await click(240, 240); await click(121, 121);
    const two = await p.evaluate(() => UJ.tracepad.count(PAD));
    ok(two.rings === 2 && two.sections === 2, "a second contour, on the second section",
       JSON.stringify(two));

    /* And out, into exactly the place a pasted link lands. */
    await p.evaluate(() => document.getElementById("tracePadUse").click());
    const used = await p.evaluate(() => ({
      rings: TRACING_PENDING ? TRACING_PENDING.rings.length : 0,
      zs: TRACING_PENDING ? String(TRACING_PENDING.rings.map(r => r.z)) : "",
      shown: document.getElementById("tracingFound").style.display !== "none",
      say: document.getElementById("tracingStatus").innerText }));
    ok(used.rings === 2 && used.zs === "21360,21365",
       "\u201cUse these contours\u201d hands them to the same place a pasted link does", used.zs);
    ok(used.shown && /from the pad/.test(used.say),
       "...the naming fields appear, and it says where they came from", used.say.slice(0, 60));

    /* One section is not a surface -- the same rule the paste path has. */
    await p.evaluate(() => {
      PAD.rings = PAD.rings.filter(r => r.z === 21360);
      document.getElementById("tracePadUse").click();
    });
    const flat = await p.evaluate(() => document.getElementById("tracePadSay").innerText);
    ok(/at least two sections/.test(flat), "one section is refused, as it is on the paste path",
       flat.slice(0, 50));

    await p.evaluate(() => { document.getElementById("tracePadClose").click();
                             TRACING_PENDING = null;
                             document.getElementById("tracingFound").style.display = "none"; });
  }

  console.log("\nreading a pasted outline");
  const read = await p.evaluate(async ({ url }) => {
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    return { status: document.getElementById("tracingStatus").innerText,
             shown: document.getElementById("tracingFound").style.display !== "none",
             pending: typeof TRACING_PENDING !== "undefined" && TRACING_PENDING
                      ? TRACING_PENDING.rings.length : 0 };
  }, { url: link(polygon(1000, 2000, 500, 40, 12, "a")
        .concat(polygon(1005, 2005, 505, 38, 12, "b"),
                polygon(1010, 2010, 510, 30, 12, "c"))) });
  ok(read.pending === 3, "three polygons become three contours", read.pending);
  ok(/3 contours from polygons on 3 sections/.test(read.status),
     "...and it says what it found, AND which shape it read it from \u2014 the same link is "
     + "organelle markers to the bulk card and a contour to this one", read.status);
  ok(/z 500.510/.test(read.status), "...including the section range", read.status);
  ok(read.shown, "...and the naming fields appear");

  console.log("\na ring of points, read by the page");
  {
    const dots = (cx, cy, z, r, n, tag) => {
      const out = [];
      for (let i = 0; i < n; i++){
        const t = 2 * Math.PI * i / n;
        out.push({ type: "point", id: tag + i,
                   point: [Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), z] });
      }
      return out;
    };
    const pr = await p.evaluate(({ url }) => {
      document.getElementById("tracingLink").value = url;
      document.getElementById("tracingRead").click();
      return { status: document.getElementById("tracingStatus").innerText,
               shown: document.getElementById("tracingFound").style.display !== "none",
               rings: (typeof TRACING_PENDING !== "undefined" && TRACING_PENDING)
                      ? TRACING_PENDING.rings.length : 0,
               verts: (typeof TRACING_PENDING !== "undefined" && TRACING_PENDING)
                      ? TRACING_PENDING.rings[0].points.length : 0 };
    }, { url: link(dots(1000, 2000, 500, 40, 12, "d5")
          .concat(dots(1005, 2005, 505, 38, 12, "d6"))) });
    ok(pr.rings === 2 && pr.verts === 12,
       "two rings of twelve ctrl+clicks are two contours \u2014 the tool every viewer has",
       pr.rings + " rings of " + pr.verts);
    ok(/from 24 points/.test(pr.status),
       "...and the page says it counted points, not lines or polygons", pr.status);
    ok(pr.shown, "...and it offers to keep it");
  }

  console.log("\na single section is refused");
  const one = await p.evaluate(({ url }) => {
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    return { status: document.getElementById("tracingStatus").innerText,
             shown: document.getElementById("tracingFound").style.display !== "none" };
  }, { url: link(polygon(1000, 2000, 500, 40, 12, "solo")) });
  ok(/at least two sections/.test(one.status),
     "one contour is a flat outline with no surface to close", one.status);
  ok(!one.shown, "...and it does not offer to keep it");

  console.log("\nkeeping it, signed out");
  const kept = await p.evaluate(async ({ url }) => {
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
    window.__alerts = [];
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    document.getElementById("tracingName").value = "astrocyte at the glia limitans";
    document.getElementById("tracingColor").value = "#40e28c";
    document.getElementById("tracingNucId").value = "253863";
    const sel = document.getElementById("tracingType");
    sel.value = [...sel.options].map(o => o.value).find(v => /astrocyte/i.test(v)) || "traced";
    document.getElementById("tracingKeep").click();
    return { kept: TRACINGS_KEPT.length, alerts: window.__alerts.length,
             stored: JSON.parse(localStorage.getItem("ujump_tracings_v1") || "[]").length,
             status: document.getElementById("tracingStatus").innerText,
             list: document.getElementById("tracingList").innerText.replace(/\s+/g, " ").trim(),
             cleared: document.getElementById("tracingLink").value === "" };
  }, { url: link(polygon(1000, 2000, 500, 40, 12, "k1")
        .concat(polygon(1005, 2005, 505, 38, 12, "k2"))) });
  ok(kept.kept === 1, "the tracing is kept", kept.kept);
  ok(kept.alerts === 0, "SIGNED OUT, and nothing asked him to sign in — the export does not "
     + "wait for the backend", kept.alerts + " alerts");
  ok(kept.stored === 1, "...and it survives a reload", kept.stored + " in localStorage");
  ok(/2 contours on 2 sections/.test(kept.list),
     "...and the list says what it holds", kept.list.slice(0, 80));
  ok(kept.cleared, "...and the box is cleared, ready for the next one");
  ok(/will be in the next Blender download/.test(kept.status),
     "...and it says where it went", kept.status);

  console.log("\nand it reaches the notebook the Blender button writes");
  const inNb = await p.evaluate(() => {
    const nb = UJ.blender.buildNotebook({
      datasetId: UJ.cfg.id, datasetLabel: UJ.cfg.label,
      emSource: UJ.cfg.em.emSource, segSource: UJ.cfg.em.segSource, nucSource: UJ.cfg.em.nucSource,
      boxNM: { xmin: 0, xmax: 1000, ymin: 0, ymax: 1000, zmin: 0, zmax: 1000 },
      cells: [{ type: "astrocyte", root_id: "864691135", nucleus_id: "1" }],
      include: { em: true, seg: true, meshes: true, nuclei: true },
      tracings: TRACINGS_KEPT
    });
    const c = nb.cells.find(x => x.metadata && x.metadata.ujump === "params");
    const src = Array.isArray(c.source) ? c.source.join("") : c.source;
    return { src: src.slice(src.indexOf("TRACINGS"), src.indexOf("TRACINGS") + 700) };
  });
  ok(/TRACINGS = \[/.test(inNb.src), "TRACINGS is in the params cell",
     inNb.src.split("\\n")[0]);
  ok(/astrocyte at the glia limitans/.test(inNb.src), "...carrying the name he gave it");
  ok(/'nucleus_id': '253863'/.test(inNb.src), "...and the nucleus he tied it to");
  ok(/'color': '#40e28c'/.test(inNb.src), "...and the colour he picked");
  ok(/'traced_by': ''/.test(inNb.src),
     "...and traced_by is EMPTY, because he was signed out when he kept it — a blank is honest, "
     + "a guessed name would not be");
  ok(/'z': 500, 'points': \[\[1040,2000\]/.test(inNb.src),
     "...with the contour's own coordinates, in the tool's voxels",
     (inNb.src.match(/'z': 500[^\]]{0,40}/) || [""])[0]);

  console.log("\nan export with nothing traced is unchanged");
  const empty = await p.evaluate(() => {
    const nb = UJ.blender.buildNotebook({
      datasetId: UJ.cfg.id, datasetLabel: UJ.cfg.label,
      emSource: UJ.cfg.em.emSource, segSource: UJ.cfg.em.segSource, nucSource: UJ.cfg.em.nucSource,
      boxNM: { xmin: 0, xmax: 1000, ymin: 0, ymax: 1000, zmin: 0, zmax: 1000 },
      cells: [{ type: "astrocyte", root_id: "864691135", nucleus_id: "1" }],
      include: { em: true, seg: true, meshes: true, nuclei: true }
    });
    const c = nb.cells.find(x => x.metadata && x.metadata.ujump === "params");
    const src = Array.isArray(c.source) ? c.source.join("") : c.source;
    return /TRACINGS = \[\]/.test(src);
  });
  ok(empty, "TRACINGS is an empty list, not a missing name — which is a NameError in Colab");

  console.log("\nsharing needs a sign-in, and says so once");
  const shared = await p.evaluate(({ url }) => {
    window.__alerts = []; window.__posted = [];
    window.postReport = (x) => { window.__posted.push(x); return true; };
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    document.getElementById("tracingName").value = "second tracing";
    document.getElementById("tracingShare").click();
    const out = { alerts: window.__alerts.length, posted: window.__posted.length };
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "t.t.t";
    GOOGLE_EXP = Math.floor(Date.now() / 1000) + 3600;
    window.__alerts = [];
    document.getElementById("tracingShare").click();
    out.after = window.__posted.length;
    out.rows = window.__posted.map(x => ({ t: x.type, z: x.z, n: x.name, sid: x.structureId,
                                           gid: x.groupId,
                                           pts: (x.points || "").split(";").length }));
    /* A SECOND share of the same tracing. Same structureId, new groupId -- that pair is what the
       backend keys "this replaces the older version" on, so a re-share after tracing five more
       sections is a correction rather than a rival tracing of the same cell. */
    window.__posted = [];
    document.getElementById("tracingShare").click();
    out.again = window.__posted.map(x => ({ sid: x.structureId, gid: x.groupId }));
    return out;
  }, { url: link(polygon(2000, 3000, 600, 25, 10, "s1")
        .concat(polygon(2005, 3005, 610, 24, 10, "s2"))) });
  ok(shared.alerts === 1 && shared.posted === 0,
     "signed out, ONE warning and nothing posted", shared.alerts + " alerts, " + shared.posted + " posts");
  ok(shared.after === 2, "signed in, one row per contour", shared.after + " rows");
  ok(shared.rows.every(r => r.t === "traced_structure"), "...of the traced_structure type");
  ok(String(shared.rows.map(r => r.z)) === "600,610", "...one per section",
     String(shared.rows.map(r => r.z)));
  ok(shared.rows.every(r => r.pts === 10), "...with all ten points of each contour");
  ok(shared.rows.every(r => r.sid && r.sid === shared.rows[0].sid),
     "...every row carrying the SAME structureId, which is how they find each other again",
     shared.rows[0].sid);
  ok(shared.rows.every(r => r.gid && r.gid === shared.rows[0].gid),
     "...and the same groupId, one per act of sharing", shared.rows[0].gid);
  ok(shared.again.length === 2 && shared.again[0].sid === shared.rows[0].sid,
     "sharing it again keeps the structureId \u2014 it is the same cell",
     shared.again.length && shared.again[0].sid);
  ok(shared.again.length === 2 && shared.again[0].gid !== shared.rows[0].gid,
     "...with a NEW groupId, which is what makes it a new version rather than a duplicate",
     shared.again.length && shared.again[0].gid);

  console.log("\nkeeping the same tracing twice");
  {
    const twice = await p.evaluate(({ url }) => {
      const before = TRACINGS_KEPT.length;
      document.getElementById("tracingLink").value = url;
      document.getElementById("tracingRead").click();
      document.getElementById("tracingName").value = "astrocyte at the glia limitans";
      document.getElementById("tracingKeep").click();
      return { before: before, after: TRACINGS_KEPT.length,
               ids: TRACINGS_KEPT.map(t => t.id),
               stored: JSON.parse(localStorage.getItem("ujump_tracings_v1") || "[]").length };
    }, { url: link(polygon(1000, 2000, 500, 44, 12, "r1")
          .concat(polygon(1005, 2005, 505, 42, 12, "r2"),
                  polygon(1010, 2010, 510, 40, 12, "r3"))) });
    ok(twice.after === twice.before,
       "keeping a fuller tracing of a cell already kept REPLACES it \u2014 it used to be in the "
       + "Blender scene twice", twice.before + " -> " + twice.after);
    ok(twice.ids.every(i => !!i) && new Set(twice.ids).size === twice.ids.length,
       "...and every kept tracing has an id of its own", twice.ids.join(", "));
    ok(twice.stored === twice.after, "...with storage saying the same", twice.stored);
  }

  console.log("\nremoving one");
  const gone = await p.evaluate(() => {
    const n = TRACINGS_KEPT.length;
    document.querySelector(".tracingdrop").click();
    return { before: n, after: TRACINGS_KEPT.length,
             stored: JSON.parse(localStorage.getItem("ujump_tracings_v1") || "[]").length };
  });
  ok(gone.after === gone.before - 1 && gone.stored === gone.after,
     "Remove takes it out of the export and out of storage",
     gone.before + " -> " + gone.after);

  const newErrors = errors.filter(e => !/atob/.test(e));
  ok(newErrors.length === 0, "the page still loads with no new errors",
     newErrors.join(" | ") || "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
