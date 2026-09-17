/* A traced cell starts as a paste.                                                 2026-09-16

   Drives the REAL tracing card in the REAL µJump page: paste a link of contours, keep it, and
   check it reaches the Blender notebook the panel writes. Only `postReport` and `alert` are
   replaced; everything between the textarea and the notebook is the shipped code.

   THE ASSERTION THAT MATTERS is the last section: a kept tracing appears in the params cell of the
   notebook the Blender button writes, with its coordinates intact. That is the whole feature —
   trace a cell the segmentation does not have, and get it in the .blend — and it is the one thing
   no unit test of either half can see.

   AND IT MUST WORK SIGNED OUT. Since 2026-09-17 there is one button and it shares as well as keeps
   -- Søren: *"I think sharing should not be an option, the meshes made should always be a part of
   the dataset"* -- but the LOCAL half still must not wait for a sign-in or a backend, or the export
   stops working for anyone who has not signed in. Signed out, the tracing is kept and QUEUED; the
   queue goes out by itself when a sign-in appears, and this drives that.

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

  console.log("\nwhat it is comes from the list, not a text box");
  {
    const l = await p.evaluate(() => {
      const w = document.getElementById("tracingWhat");
      const row = document.getElementById("tracingNameRow");
      const opts = [...w.options];
      const set = (v) => { w.value = v; w.dispatchEvent(new Event("change", { bubbles: true })); };
      const out = { n: opts.length,
                    groups: [...w.querySelectorAll("optgroup")].map(g => g.label),
                    first: opts.slice(0, 2).map(o => o.value).join(","),
                    last: opts[opts.length - 1].value };
      set("__cell");    out.cellBox = row.style.display !== "none";
      out.cellWhat = tracingWhat();
      set("__nucleus"); out.nucWhat = tracingWhat();
      set("__other");   out.otherBox = row.style.display !== "none";
      document.getElementById("tracingName").value = "a thing with no name";
      out.otherWhat = tracingWhat();
      const organ = opts.map(o => o.value)
        .find(v => v && v.indexOf("__") !== 0 && /lyso/.test(v)) || "";
      if (organ){ set(organ); out.organBox = row.style.display !== "none";
                  out.organWhat = tracingWhat(); }
      return out;
    });
    ok(l.n > 40, "the whole organelle ontology is on the list", l.n + " options");
    ok(l.first === "__cell,__nucleus",
       "...with the whole cell and its nucleus first, because they are not organelles", l.first);
    ok(l.groups[0] === "The cell itself" && l.groups[l.groups.length - 1] === "Not on the list",
       "...the ontology's own groups in between, unchanged",
       l.groups.length + " groups: " + l.groups.slice(0, 3).join(" / ") + " \u2026");
    ok(l.last === "__other", "...and 'something else' last of all", l.last);
    ok(!l.cellBox && l.otherBox && l.organBox === false,
       "the text box appears for 'something else' and for NOTHING else",
       "cell " + l.cellBox + ", other " + l.otherBox + ", organelle " + l.organBox);
    ok(l.cellWhat.kind === "cell" && l.cellWhat.name === "Whole cell",
       "the whole cell is its own kind", JSON.stringify(l.cellWhat));
    ok(l.nucWhat.kind === "nucleus" && l.nucWhat.name === "Nucleus",
       "...and so is the nucleus", JSON.stringify(l.nucWhat));
    ok(l.organWhat && /lyso/.test(l.organWhat.kind) && /^[A-Z]/.test(l.organWhat.name)
       && l.organWhat.name !== l.organWhat.kind,
       "an organelle carries the ontology's VALUE and its LABEL \u2014 not the value twice, which is "
       + "what a module-level labelOf() would have given on this page",
       JSON.stringify(l.organWhat));
    ok(l.otherWhat.kind === "other" && l.otherWhat.name === "a thing with no name",
       "...and only 'something else' takes its name from what was typed",
       JSON.stringify(l.otherWhat));
  }

  console.log("\nthe two id boxes say which is which, even when full");
  {
    const lab = await p.evaluate(() => {
      const labelFor = (id) => {
        const box = document.getElementById(id).closest("div").parentElement;
        const l = box.querySelector("label");
        return l ? l.textContent.trim() : "";
      };
      document.getElementById("tracingRootId").value = "864691135570733037";
      document.getElementById("tracingNucId").value = "";
      return { nuc: labelFor("tracingNucId"), root: labelFor("tracingRootId"),
               rootShows: document.getElementById("tracingRootId").value !== "" };
    });
    ok(/nucleus id/i.test(lab.nuc), "the nucleus box has a LABEL, not just a placeholder", lab.nuc);
    ok(/root id/i.test(lab.root),
       "...and so does the root box \u2014 which is the one that had none, because a filled input "
       + "hides its placeholder and the only words on the row named the other box", lab.root);
    ok(lab.rootShows, "...with the root id still in it", "filled");
  }

  console.log("\nthe cell type is suggested from the id, by the tool's own precedence");
  {
    /* A REAL cell out of the page's own arrays, not a stub: the point of the suggestion is that it
       agrees with what the cell panel and the filter say about the same nucleus, and only the real
       data can show that. */
    const t = await p.evaluate(() => {
      let i = -1;
      for (let k = 0; k < N && i < 0; k++) if (NT[k] !== 0) i = k;
      if (i < 0) return { skip: true };
      const out = { nid: String(NID[i]), expect: CT_NAMES[NT[i] - 1], root: rootId(i) };
      TRACING_TYPE_TOUCHED = false;
      document.getElementById("tracingNucId").value = out.nid;
      document.getElementById("tracingRootId").value = "";
      tracingSuggestType();
      out.picked = document.getElementById("tracingType").value;
      out.say = document.getElementById("tracingTypeSay").innerText;

      /* The same cell, reached by its ROOT id instead. */
      document.getElementById("tracingType").value = "traced";
      document.getElementById("tracingNucId").value = "";
      document.getElementById("tracingRootId").value = out.root || "";
      tracingSuggestType();
      out.byRoot = document.getElementById("tracingType").value;
      out.rootSay = document.getElementById("tracingTypeSay").innerText;

      /* A type chosen by hand is never overwritten. */
      TRACING_TYPE_TOUCHED = true;
      document.getElementById("tracingType").value = "traced";
      tracingSuggestType();
      out.afterTouch = document.getElementById("tracingType").value;
      out.touchSay = document.getElementById("tracingTypeSay").innerText;

      /* An id no cell has says so rather than guessing. */
      TRACING_TYPE_TOUCHED = false;
      document.getElementById("tracingNucId").value = "999999999";
      document.getElementById("tracingRootId").value = "";
      tracingSuggestType();
      out.unknownSay = document.getElementById("tracingTypeSay").innerText;

      document.getElementById("tracingNucId").value = "";
      document.getElementById("tracingRootId").value = "";
      document.getElementById("tracingTypeSay").textContent = "";
      return out;
    });
    /* TWO VOCABULARIES, JOINED BY THE CODE IN PARENTHESES. MICrONS records "6P-CT"; this list
       carries the identification tree's leaf, "Layer 6 CT pyramidal neuron (6P-CT)". Asserting the
       raw name would have failed on every neuron in the volume -- asserting the join is the thing
       that has to keep working. */
    const joined = (picked, micro) => picked === micro || picked.indexOf("(" + micro + ")") >= 0;
    ok(!t.skip && joined(t.picked, t.expect),
       "a nucleus ID selects the leaf that carries the page's own MICrONS code for that cell",
       t.picked + "  <- " + t.expect + ", nucleus " + t.nid);
    ok(/nucleus /.test(t.say) && /prediction|verified|community/.test(t.say),
       "...and says which id it came from AND which of the three sources \u2014 a guess without its "
       + "provenance is worse than no guess", t.say);
    ok(joined(t.byRoot, t.expect) && /root id/i.test(t.rootSay),
       "the same cell reached by its ROOT id gives the same answer",
       t.byRoot + " \u2014 " + t.rootSay.slice(0, 44));
    ok(t.afterTouch === "traced" && /is on file as/.test(t.touchSay),
       "a type chosen by hand is never overwritten \u2014 it is told, not corrected",
       t.afterTouch + " \u2014 " + t.touchSay.slice(0, 40));
    ok(/No cell in this dataset/.test(t.unknownSay),
       "an id no cell has says so, rather than leaving the last suggestion standing", t.unknownSay);

    /* THE OTHER ID COMES FREE.  Søren: "the nucleus ID should also be put in, because you know that
       this root ID is associated with this nucleus ID because the cell has been identified." The
       case that prompted it: a coordinate inside a process reads a root id and NOTHING in the
       nucleus volume, because the nucleus is elsewhere entirely. */
    const back = await p.evaluate(() => {
      let i = -1;
      for (let k = 0; k < N && i < 0; k++) if (NT[k] !== 0 && rootId(k)) i = k;
      TRACING_TYPE_TOUCHED = false;
      const nuc = document.getElementById("tracingNucId"), root = document.getElementById("tracingRootId");
      nuc.value = ""; root.value = rootId(i);
      tracingSuggestType();
      const out = { fromRoot: nuc.value, expectNuc: String(NID[i]),
                    say: document.getElementById("tracingTypeSay").innerText };
      /* And the other way round. */
      nuc.value = String(NID[i]); root.value = "";
      TRACING_TYPE_TOUCHED = false;
      tracingSuggestType();
      out.fromNuc = root.value; out.expectRoot = rootId(i);
      /* Never over a value that is already there. */
      nuc.value = "123"; root.value = rootId(i);
      tracingSuggestType();
      out.kept = nuc.value;
      nuc.value = ""; root.value = "";
      document.getElementById("tracingTypeSay").textContent = "";
      return out;
    });
    ok(back.fromRoot === back.expectNuc,
       "a root ID fills in the nucleus ID, because the record already ties them together",
       back.fromRoot + " from the root");
    ok(/filled in from the record/.test(back.say), "...and says where it came from", back.say.slice(-60));
    ok(back.fromNuc === back.expectRoot, "...and a nucleus ID fills in the root ID", back.fromNuc);
    ok(back.kept === "123", "...but never over something already there", back.kept);
  }

  console.log("\nwhat is already at that coordinate");
  {
    const r = await p.evaluate(async () => {
      /* The read itself is core/segread.js's, live-proven against the real bucket and covered by
         segreadcheck.js; what is under test here is what the CARD does with the answer. */
      UJ.segread.configure = () => ({});
      UJ.segread.resolveAt = async () => ({ rootId: "864691135234029401", nucleusId: 253863,
                                            inCell: true, inNucleus: true });
      const nuc = document.getElementById("tracingNucId"), root = document.getElementById("tracingRootId");
      nuc.value = ""; root.value = "";
      await tracingResolveAt([240640, 207872, 21360]);
      const filled = { nuc: nuc.value, root: root.value,
                       say: document.getElementById("tracingAtSay").innerText };
      /* Typed by hand, it must survive a second resolve. */
      nuc.value = "999"; root.value = "888";
      await tracingResolveAt([240640, 207872, 21360]);
      filled.keptNuc = nuc.value; filled.keptRoot = root.value;
      /* And nothing there is an answer, not a silence. */
      UJ.segread.resolveAt = async () => ({ rootId: "0", nucleusId: 0,
                                            inCell: false, inNucleus: false });
      nuc.value = ""; root.value = "";
      await tracingResolveAt([1, 2, 3]);
      filled.emptySay = document.getElementById("tracingAtSay").innerText;
      filled.emptyNuc = nuc.value;
      return filled;
    });
    ok(r.nuc === "253863" && r.root === "864691135234029401",
       "the nucleus and the cell at that coordinate fill themselves in",
       r.nuc + " / " + r.root);
    ok(/nucleus 253863/.test(r.say) && /cell 864691135234029401/.test(r.say),
       "...and the card says what it found, so a prefilled id is not just a number", r.say);
    ok(r.keptNuc === "999" && r.keptRoot === "888",
       "a value typed by hand is never overwritten", r.keptNuc + " / " + r.keptRoot);
    ok(r.emptyNuc === "" && /Nothing is segmented/.test(r.emptySay),
       "and nothing there is said out loud \u2014 it is usually the reason for tracing at all",
       r.emptySay.slice(0, 60));
  }

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

    /* Søren: *"make a list of all the possible commands with an explanation of what they do."* In
       the card, not in a message, because the status line above it is written over by the next
       thing that happens. The modifier names are filled in at runtime, so this also asserts that
       nobody is being told to press a key their keyboard does not have. */
    const help = await p.evaluate(() => {
      const box = document.getElementById("tracePadHelp");
      if (!box) return null;
      return { rows: box.querySelectorAll("tr").length,
               mods: [].slice.call(box.querySelectorAll(".padmod")).map(e => e.textContent).join("|"),
               rights: [].slice.call(box.querySelectorAll(".padright")).map(e => e.textContent).join("|"),
               mac: PAD_MAC, note: (document.getElementById("padHelpMac") || {}).textContent || "",
               text: box.textContent };
    });
    ok(help && help.rows >= 15, "every gesture is listed in the card itself",
       help && help.rows + " of them");
    ok(help && help.mods && (help.mods.indexOf("Ctrl") >= 0) === !help.mac,
       "...with the modifier named for this machine, not for the one it was written on",
       help && help.mods);
    ok(help && help.rights && /right-click/.test(help.rights) === !help.mac,
       "...and \u201cright-click\u201d only where there is a right button", help && help.rights);
    ok(help && /whole/.test(help.text) && /Undo/.test(help.text) && /Step a section/i.test(help.text),
       "...covering the whole-contour remove, Undo and stepping, not only the clicks");
    ok(help && /Mac/.test(help.note),
       "...and the page says which machine it thinks it is on, so a wrong guess is visible",
       help && help.note.slice(0, 60));

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

    /* ── CORRECTING A CONTOUR THAT IS ALREADY CLOSED ────────────────────────────  2026-09-17
       Søren: "we also need a way to delete segmentations and correct if a line in the polyline is
       placed wrongly... after the segmentation is done, it should be possible to move the polyline
       points individually." Driven here through real pointer events, because the half that can go
       wrong is which gesture the canvas decides a drag was. */
    const before = await p.evaluate(() => ({
      pts: PAD.rings[0].points.map(q => q.join(",")).join(" "), rings: PAD.rings.length,
      drawn: window.__drawn }));

    /* Drag the first vertex of the first contour on this section. */
    const v0 = await p.evaluate(() => {
      const r = PAD.rings.filter(x => x.z === PAD.z)[0];
      const q = PAD_VIEW.pxAt([r.points[0][0], r.points[0][1], PAD.z]);
      return { x: q[0], y: q[1], was: r.points[0].join(",") };
    });
    await p.mouse.move(box.x + v0.x, box.y + v0.y);
    await p.mouse.down();
    await p.mouse.move(box.x + v0.x + 40, box.y + v0.y + 24, { steps: 5 });
    await p.mouse.up();
    await p.waitForTimeout(80);
    const moved = await p.evaluate(() => {
      const r = PAD.rings.filter(x => x.z === PAD.z)[0];
      return { now: r.points[0].join(","), n: r.points.length, rings: PAD.rings.length,
               say: document.getElementById("tracePadSay").innerText,
               drawn: window.__drawn };
    });
    ok(moved.now !== v0.was, "a drag that starts ON a vertex moves that vertex",
       v0.was + " -> " + moved.now);
    ok(moved.n === 3, "...and adds none", moved.n + " points");
    ok(moved.rings === before.rings, "...and loses no contour", moved.rings);
    ok(/Point moved/.test(moved.say), "...and says so", moved.say.slice(0, 40));
    ok(moved.drawn === before.drawn,
       "...and does NOT pan: a grab is a grab, not a drag of the field",
       "still " + moved.drawn + " section draws");

    /* Right-click a segment: a new point in the middle of it, which is what "a line placed
       wrongly" actually needs. */
    const mid = await p.evaluate(() => {
      const r = PAD.rings.filter(x => x.z === PAD.z)[0];
      const a = r.points[0], b = r.points[1];
      const q = PAD_VIEW.pxAt([Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), PAD.z]);
      return { x: q[0], y: q[1], n: r.points.length };
    });
    await p.mouse.move(box.x + mid.x, box.y + mid.y);
    await p.mouse.down({ button: "right" });
    await p.mouse.up({ button: "right" });
    await p.waitForTimeout(60);
    const inserted = await p.evaluate(() => {
      const r = PAD.rings.filter(x => x.z === PAD.z)[0];
      return { n: r.points.length, say: document.getElementById("tracePadSay").innerText };
    });
    ok(inserted.n === mid.n + 1, "right-clicking a line puts a point in the middle of it",
       mid.n + " -> " + inserted.n);
    ok(/drag it where it belongs/.test(inserted.say), "...and says what to do with it",
       inserted.say.slice(0, 44));

    /* Right-click a vertex: gone. */
    const onV = await p.evaluate(() => {
      const r = PAD.rings.filter(x => x.z === PAD.z)[0];
      const q = PAD_VIEW.pxAt([r.points[1][0], r.points[1][1], PAD.z]);
      return { x: q[0], y: q[1], n: r.points.length };
    });
    await p.mouse.move(box.x + onV.x, box.y + onV.y);
    await p.mouse.down({ button: "right" });
    await p.mouse.up({ button: "right" });
    await p.waitForTimeout(60);
    const deleted = await p.evaluate(() => {
      const r = PAD.rings.filter(x => x.z === PAD.z)[0];
      return { n: r.points.length, say: document.getElementById("tracePadSay").innerText };
    });
    ok(deleted.n === onV.n - 1, "right-clicking a point deletes that point", onV.n + " -> " + deleted.n);
    ok(/Point deleted/.test(deleted.say), "...and says so", deleted.say.slice(0, 30));

    /* And a contour has its own delete, so "remove this one" is not "Undo until it is gone". */
    const chips = await p.evaluate(() => {
      const list = document.getElementById("tracePadRings");
      return { n: list.querySelectorAll(".padring").length, text: list.innerText.trim(),
               here: PAD.rings.filter(r => r.z === PAD.z).length };
    });
    ok(chips.n === chips.here && chips.n > 0,
       "each contour on this section is listed with its own delete, and only this section's",
       chips.n + " chip(s) for " + chips.here + " contour(s): " + chips.text.slice(0, 40));
    const afterChip = await p.evaluate(() => {
      const was = PAD.rings.length;
      document.querySelector("#tracePadRings .padring").click();
      return { was, now: PAD.rings.length, other: PAD.rings.filter(r => r.z !== PAD.z).length,
               say: document.getElementById("tracePadSay").innerText };
    });
    ok(afterChip.now === afterChip.was - 1, "...and clicking it deletes that contour",
       afterChip.was + " -> " + afterChip.now);
    ok(afterChip.other === 1, "...leaving the other section's contour alone", afterChip.other);

    /* Put it back so the rest of the section's assertions still have two sections to work with. */
    await p.evaluate(() => {
      [[120, 120], [240, 120], [240, 240]].forEach(q => {
        const t = PAD_VIEW.toolAt(q[0], q[1]);
        UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
      });
      UJ.tracepad.closeRing(PAD);
    });

    /* ── THE WHOLE CONTOUR, AND THE MODIFIER THAT IS NOT THE SAME ON A MAC ───────  2026-09-17
       Søren: *"ctrl+ right click should remove all the connected points in a polyline"* and
       *"Make sure that all the commands work for mac also."* The second sentence is what makes the
       first one interesting: CTRL+CLICK IS THE SECONDARY CLICK ON macOS, so binding this to ctrl
       would delete a whole contour every time a Mac user tried to delete a single point. The
       assertions below are the pair -- the modifier works on each platform, and the OTHER
       platform's modifier does not, which is the half that protects Mac users. */
    console.log("  and the whole contour goes on Ctrl, or Cmd on a Mac");
    {
      const erase = await p.evaluate(async ({ mods }) => {
        const cv = document.getElementById("tracePad");
        const box = cv.getBoundingClientRect();
        const fire = (x, y, type, init) => cv.dispatchEvent(new PointerEvent(type, Object.assign(
          { bubbles: true, cancelable: true, clientX: box.left + x, clientY: box.top + y,
            pointerId: 1, button: 0, isPrimary: true }, init)));
        const menu = (x, y, init) => cv.dispatchEvent(new MouseEvent("contextmenu", Object.assign(
          { bubbles: true, cancelable: true, clientX: box.left + x, clientY: box.top + y }, init)));
        const ring = () => PAD.rings.filter(r => r.z === PAD.z)[0];
        const onRing = () => { const p0 = ring().points[0];
                               const q = PAD_VIEW.pxAt([p0[0], p0[1], PAD.z]); return q; };

        /* Built here rather than inherited: five points each, so deleting ONE still leaves a
           contour to count, which is the difference the first assertion rests on. */
        const build = () => {
          PAD.pending = [];
          PAD.rings = PAD.rings.filter(r => r.z !== PAD.z);
          [[[60,60],[160,60],[180,110],[160,160],[60,160]],
           [[300,300],[380,300],[400,340],[380,380],[300,380]]].forEach(pts => {
            pts.forEach(xy => { const t = PAD_VIEW.toolAt(xy[0], xy[1]);
                                UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel); });
            UJ.tracepad.closeRing(PAD);
          });
        };
        build();

        const out = {};
        /* ON A MAC: ctrl is the right-click, so it must delete the POINT, never the contour. */
        PAD_MAC = true; PAD_MOD = "⌘ Cmd";
        let q = onRing(), before = ring().points.length, rings = PAD.rings.length;
        menu(q[0], q[1], { ctrlKey: true });
        out.macCtrl = { points: before + " -> " + (ring() ? ring().points.length : 0),
                        rings: rings + " -> " + PAD.rings.length };
        /* ...and cmd takes the whole thing, on the LEFT button, because cmd+click makes no menu. */
        q = onRing(); rings = PAD.rings.length;
        fire(q[0], q[1], "pointerdown", { metaKey: true });
        fire(q[0], q[1], "pointerup", { metaKey: true });
        out.macCmd = { rings: rings + " -> " + PAD.rings.length,
                       say: document.getElementById("tracePadSay").innerText };

        build();                       // two contours again, to take apart on the PC path
        PAD_MAC = false; PAD_MOD = "Ctrl";
        rings = PAD.rings.length;
        q = onRing();
        menu(q[0], q[1], { ctrlKey: true });
        out.pcCtrl = { rings: rings + " -> " + PAD.rings.length,
                       say: document.getElementById("tracePadSay").innerText };
        /* Cmd means nothing on a PC: it must fall through to putting a vertex down. */
        rings = PAD.rings.length; const pend = PAD.pending.length;
        fire(430, 430, "pointerdown", { metaKey: true });
        fire(430, 430, "pointerup", { metaKey: true });
        out.pcCmd = { rings: rings + " -> " + PAD.rings.length,
                      pending: pend + " -> " + PAD.pending.length };
        PAD.pending = [];
        /* Pointing at nothing removes nothing, and says which key it wanted. */
        menu(500, 30, { ctrlKey: true });
        out.nowhere = { rings: PAD.rings.length,
                        say: document.getElementById("tracePadSay").innerText };
        return out;
      }, { mods: 1 });
      ok(/^(\d+) -> \1$/.test(erase.macCtrl.rings) && !/^(\d+) -> \1$/.test(erase.macCtrl.points),
         "on a Mac, ctrl+click still deletes ONE POINT — it is their right-click, not a modifier",
         "points " + erase.macCtrl.points + ", contours " + erase.macCtrl.rings);
      ok(!/^(\d+) -> \1$/.test(erase.macCmd.rings),
         "...and ⌘ Cmd+click takes the whole contour, on the left button",
         erase.macCmd.rings);
      ok(/all of it/.test(erase.macCmd.say), "...saying that is what happened",
         erase.macCmd.say.slice(0, 40));
      ok(!/^(\d+) -> \1$/.test(erase.pcCtrl.rings),
         "on a PC, ctrl+right-click takes the whole contour", erase.pcCtrl.rings);
      ok(/^(\d+) -> \1$/.test(erase.pcCmd.rings) && !/^(\d+) -> \1$/.test(erase.pcCmd.pending),
         "...while cmd means nothing there and a click is just a click",
         "contours " + erase.pcCmd.rings + ", vertices " + erase.pcCmd.pending);
      ok(/Ctrl\+click a point or a line/.test(erase.nowhere.say),
         "and pointing at nothing removes nothing, naming the key for THIS machine",
         erase.nowhere.say.slice(0, 50));
    }

    /* Back to one contour on each of the two sections, for what follows. */
    await p.evaluate(() => {
      PAD.pending = [];
      PAD.rings = PAD.rings.filter(r => r.z !== PAD.z);
      [[120, 120], [240, 120], [240, 240]].forEach(q => {
        const t = PAD_VIEW.toolAt(q[0], q[1]);
        UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
      });
      UJ.tracepad.closeRing(PAD);
    });

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
    /* The name is no longer typed: it comes from the list, and "something else" is the one
       option that takes a typed one. */
    const w1 = document.getElementById("tracingWhat");
    w1.value = "__other"; w1.dispatchEvent(new Event("change", { bubbles: true }));
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
  ok(/NOT reached the dataset yet/.test(kept.status),
     "...and it says plainly that it is NOT in the dataset yet, rather than implying it is",
     kept.status);
  ok(/waiting for sign-in/.test(kept.list),
     "...and the tracing itself is marked as waiting, where the tracing is");

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

  console.log("\nadding it IS sharing it, and signing out only delays it");
  const shared = await p.evaluate(({ url }) => {
    window.__alerts = []; window.__posted = [];
    window.postReport = (x) => { window.__posted.push(x); return true; };
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    const w2 = document.getElementById("tracingWhat");
    w2.value = "__other"; w2.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("tracingName").value = "second tracing";
    document.getElementById("tracingKeep").click();
    const mine = TRACINGS_KEPT[TRACINGS_KEPT.length - 1];
    const out = { alerts: window.__alerts.length, posted: window.__posted.length,
                  pending: !!mine.pending_share, kept: TRACINGS_KEPT.length,
                  say: document.getElementById("tracingStatus").textContent };
    /* SIGNED IN, THE QUEUE GOES BY ITSELF. This is what the interval does every four seconds while
       anything is waiting; calling it directly is the same code path without the wait. */
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "t.t.t";
    GOOGLE_EXP = Math.floor(Date.now() / 1000) + 3600;
    out.flushed = tracingFlush();
    out.after = window.__posted.length;
    out.stillPending = tracingPendingCount();
    /* ONE POST FOR THE WHOLE TRACING since 2026-09-17: the geometry goes to a Drive file and the
       sheet keeps one index row, so a share that used to be N round trips is one submission
       carrying every contour. */
    out.rows = window.__posted.map(x => ({ t: x.type, n: x.name, sid: x.structureId, gid: x.groupId,
                                           sections: x.sections,
                                           zs: (x.contours || []).map(c => c.z).join(","),
                                           pts: (x.contours || []).map(c => (c.points || "").split(";").length).join(",") }));
    /* Adding the same tracing AGAIN, signed in: same structureId, new groupId -- that pair is what
       the backend versions on, so coming back after tracing five more sections is a correction
       rather than a rival tracing of the same cell. */
    window.__posted = [];
    document.getElementById("tracingLink").value = url;
    document.getElementById("tracingRead").click();
    const w3 = document.getElementById("tracingWhat");
    w3.value = "__other"; w3.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("tracingName").value = "second tracing";
    document.getElementById("tracingKeep").click();
    out.again = window.__posted.map(x => ({ sid: x.structureId, gid: x.groupId }));
    out.sayAgain = document.getElementById("tracingStatus").textContent;
    return out;
  }, { url: link(polygon(2000, 3000, 600, 25, 10, "s1")
        .concat(polygon(2005, 3005, 610, 24, 10, "s2"))) });
  ok(shared.posted === 0 && shared.pending,
     "signed out it is KEPT AND QUEUED, not refused and not posted",
     shared.posted + " posts, pending " + shared.pending);
  ok(shared.alerts === 0,
     "...and nothing pops up at him -- the status line says it, because he did not ask to sign in",
     shared.alerts + " alerts");
  /* TWO went out, not one, and that is worth asserting rather than tolerating: the tracing kept in
     the "signed out" section further up was still owed, and signing in owes it too. A flush that
     only sent the most recent one would strand work exactly where nobody would look for it. */
  ok(shared.flushed === 2 && shared.after === 2,
     "signing in sends EVERYTHING that was waiting, each as one submission",
     shared.flushed + " flushed, " + shared.after + " post(s)");
  ok(shared.stillPending === 0, "...and the queue is empty afterwards", shared.stillPending);
  const row = shared.rows.filter(r => r.n === "second tracing")[0];
  ok(!!row && row.t === "traced_structure", "...of the traced_structure type");
  ok(row.zs === "600,610", "...carrying both contours, each on its own section", row.zs);
  ok(row.sections === 2, "...and saying how many sections that is, for the index row", row.sections);
  ok(row.pts === "10,10", "...with all ten points of each", row.pts);
  ok(!!row.sid, "...a structureId naming the cell", row.sid);
  ok(!!row.gid, "...and a groupId naming this act of sharing — the pair the backend "
     + "versions on, and the pair in the Drive file's name", row.gid);
  ok(shared.again.length === 1 && shared.again[0].sid === row.sid,
     "adding it again is one submission again, keeping the structureId — it is the same cell",
     shared.again.length + " post(s), " + shared.again[0].sid);
  ok(shared.again[0].gid !== row.gid,
     "...with a NEW groupId, which is what makes it a new version rather than a duplicate",
     shared.again[0].gid);
  ok(/in the dataset/.test(shared.sayAgain) && !/NOT reached/.test(shared.sayAgain),
     "...and signed in it says it is in the dataset, not that it is waiting", shared.sayAgain);
  console.log("\nkeeping the same tracing twice");
  {
    const twice = await p.evaluate(({ url }) => {
      const before = TRACINGS_KEPT.length;
      document.getElementById("tracingLink").value = url;
      document.getElementById("tracingRead").click();
      const w3 = document.getElementById("tracingWhat");
      w3.value = "__other"; w3.dispatchEvent(new Event("change", { bubbles: true }));
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

  /* ── THE EM HAS TO MOVE WITH THE OUTLINE ───────────────────────────────────────  2026-09-17
     Søren: *"If I shift click to move the view, it now only moves the segmentation and not the EM
     images."*

     The pad kept the drawn section as a bitmap and put it back under the contours on every repaint,
     and one flag decided whether a given call was CAPTURING that bitmap or RESTORING it. Any
     repaint could flip it -- including the hover repaint in pointermove, which fires on a pointer
     that has barely moved while a pan's fetch is still in the air. Captured mid-fetch, the base was
     the OLD section, and when the new one arrived it was painted straight back over it.

     The stub here is slow ON PURPOSE and paints a colour derived from the centre it was asked for,
     so "which section is on the canvas" is a pixel this check can read. Without the delay and the
     twitch, the bug does not reproduce at all -- which is why it reached him. */
  console.log("\nthe section follows the pan, even with the pointer moving");
  {
    const panned = await p.evaluate(async () => {
      let asked = 0;
      UJ.emtiles.configure = () => ({});
      UJ.emtiles.configured = () => true;
      UJ.emtiles.drawSection = async (cv, o) => {
        asked++;
        const centre = o.centre.slice();
        /* The real reader resets the canvas size before it fetches anything, which CLEARS it --
           part of why a stale base was visible rather than merely wrong. */
        await new Promise(r => setTimeout(r, 40));
        cv.width = o.w; cv.height = o.h;
        const g = cv.getContext("2d");
        g.fillStyle = "rgb(" + (centre[0] % 256) + ",0,0)";
        g.fillRect(0, 0, cv.width, cv.height);
        await new Promise(r => setTimeout(r, 40));
        const k = 8;
        const x0 = centre[0] - (cv.width >> 1) * k, y0 = centre[1] - (cv.height >> 1) * k;
        return { mip: 2, mips: 3, nmPerPx: 32, z: centre[2], w: cv.width, h: cv.height, chunks: 1,
                 toolAt: (px, py) => [Math.round(x0 + px * k), Math.round(y0 + py * k), centre[2]],
                 pxAt: (t) => [Math.round((t[0] - x0) / k), Math.round((t[1] - y0) / k)],
                 pxPerToolVoxel: 1 / k };
      };
      ["tracingX", "tracingY", "tracingZ"].forEach((id, i) => {
        document.getElementById(id).value = [240000, 207872, 21360][i];
      });
      document.getElementById("tracePadOpen").click();
      await new Promise(r => setTimeout(r, 300));
      const cv = document.getElementById("tracePad");
      const read = () => cv.getContext("2d").getImageData(2, 2, 1, 1).data[0];
      const before = read();

      const box = cv.getBoundingClientRect();
      const at = (x, y, type, init) => cv.dispatchEvent(new PointerEvent(type, Object.assign(
        { bubbles: true, clientX: box.left + x, clientY: box.top + y, pointerId: 1, button: 0,
          isPrimary: true }, init || {})));
      /* Shift+click, a hundred pixels left of centre: recentre there. */
      at(120, 120, "pointerdown", { shiftKey: true });
      at(120, 120, "pointerup", { shiftKey: true });
      /* THE TWITCH. One pixel, while the fetch is still out -- the whole bug in one event. */
      await new Promise(r => setTimeout(r, 20));
      at(121, 121, "pointermove", {});
      await new Promise(r => setTimeout(r, 300));
      return { asked: asked, before: before, after: read(),
               centre: PAD_CENTRE.slice(), want: PAD_CENTRE[0] % 256 };
    });
    ok(panned.asked === 2, "shift+click asks for the section at the new centre", panned.asked);
    ok(panned.centre[0] !== 240000, "...and the centre really moved", panned.centre.join(","));
    ok(panned.after === panned.want,
       "the EM ON THE CANVAS is the new section, not the old one restored over it",
       "pixel " + panned.after + ", expected " + panned.want + " (was " + panned.before + ")");
    ok(panned.after !== panned.before,
       "...which is a different picture from the one before the pan, so the test can tell");
  }

  /* ── OPENING SOMEBODY ELSE'S TRACING AND ADDING TO IT ──────────────────────────  2026-09-17
     Søren: *"other people should be able to add to it or edit it."* The whole route, driven in the
     real page against a stubbed backend: list what is in the dataset, open one, find its contours
     in the pad as ordinary editable contours, extend it, and post the result AS THE SAME TRACING.
     The last step is the one with teeth -- a new structureId there would quietly turn every edit
     into a rival copy, and nothing on screen would say so. */
  console.log("\nthe dataset's tracings, and adding to one");
  {
    const browsed = await p.evaluate(async () => {
      const INDEX = { tracings: [{ structureId: "hers_1", name: "Nucleus", kind: "__nucleus",
                                   cellType: "Astrocyte", color: "#aa5522",
                                   nucleusId: "253863", rootId: "864691135570733037",
                                   tracedBy: "Somebody Else", startedBy: "Somebody Else",
                                   contributors: ["Somebody Else"], versions: 2,
                                   sections: 2, contours: 2, vertices: 8,
                                   timestamp: "2026-09-17T09:00:00Z",
                                   fileId: "f1", fileUrl: "https://drive.example/f1" }] };
      const ROWS = [
        { structureId: "hers_1", name: "Nucleus", kind: "__nucleus", cellType: "Astrocyte",
          color: "#aa5522", nucleusId: "253863", rootId: "864691135570733037",
          z: 700, ringIndex: 0, points: "1000,2000;1040,2000;1040,2040;1000,2040",
          reporterName: "Somebody Else" },
        { structureId: "hers_1", name: "Nucleus", kind: "__nucleus", cellType: "Astrocyte",
          color: "#aa5522", nucleusId: "253863", rootId: "864691135570733037",
          z: 705, ringIndex: 0, points: "1005,2005;1035,2005;1035,2035;1005,2035",
          reporterName: "Somebody Else" }
      ];
      window.fetch = async (u) => ({
        ok: true,
        json: async () => (/structureId=/.test(u)
          ? { tracings: [Object.assign({}, INDEX.tracings[0], { rows: ROWS })] }
          : INDEX)
      });
      document.getElementById("tracingBrowse").click();
      await new Promise(r => setTimeout(r, 60));
      const listed = document.getElementById("tracingShared").textContent;
      document.querySelector(".tracingopen").click();
      await new Promise(r => setTimeout(r, 300));
      const out = { listed: listed,
                    rings: PAD.rings.length,
                    zs: PAD.rings.map(r => r.z).join(","),
                    first: PAD.rings[0].points[0].join(","),
                    editing: PAD_EDIT_ID,
                    what: document.getElementById("tracingWhat").value,
                    type: document.getElementById("tracingType").value,
                    nuc: document.getElementById("tracingNucId").value,
                    root: document.getElementById("tracingRootId").value,
                    centre: PAD_CENTRE.join(",") };
      /* Extend it: one more contour on a third section, exactly as the pad would leave it. */
      PAD.z = 710;
      PAD.rings.push({ z: 710, points: [[1010,2010],[1030,2010],[1030,2030],[1010,2030]] });
      window.__posted = [];
      document.getElementById("tracePadUse").click();
      document.getElementById("tracingKeep").click();
      out.posted = window.__posted.map(x => ({ sid: x.structureId, n: (x.contours || []).length,
                                               zs: (x.contours || []).map(c => c.z).join(",") }));
      /* And a pad opened FRESH afterwards must not still be filing into her tracing. */
      document.getElementById("tracingX").value = "1000";
      document.getElementById("tracingY").value = "2000";
      document.getElementById("tracingZ").value = "900";
      document.getElementById("tracePadOpen").click();
      out.afterFresh = PAD_EDIT_ID;
      return out;
    });
    ok(/Somebody Else/.test(browsed.listed) && /v2/.test(browsed.listed),
       "the list names who has worked on it and which version it is on",
       browsed.listed.replace(/\s+/g, " ").slice(0, 90));
    ok(browsed.rings === 2 && browsed.zs === "700,705",
       "opening one puts its contours in the pad, on the sections they were drawn on", browsed.zs);
    ok(browsed.first === "1000,2000", "...with the coordinates unchanged", browsed.first);
    ok(browsed.centre === "1020,2020,700",
       "...and the pad centred on the contour rather than on whatever was in the boxes",
       browsed.centre);
    ok(browsed.editing === "hers_1", "...remembering which tracing is being edited", browsed.editing);
    ok(browsed.what === "__nucleus" && browsed.type === "Astrocyte",
       "...and what it is and which cell, so a version does not drop what she filled in",
       browsed.what + " / " + browsed.type);
    ok(browsed.nuc === "253863" && browsed.root === "864691135570733037",
       "...including both ids", browsed.nuc + " / " + browsed.root);
    ok(browsed.posted.length === 1 && browsed.posted[0].sid === "hers_1",
       "adding it back is HER tracing's next version, not a rival with a new id",
       JSON.stringify(browsed.posted[0]));
    ok(browsed.posted[0].zs === "700,705,710",
       "...carrying her two contours and the one just added", browsed.posted[0].zs);
    ok(browsed.afterFresh === "",
       "and a pad opened fresh afterwards files nothing into her tracing", '"' + browsed.afterFresh + '"');
  }

  /* ── THE PREVIEW ───────────────────────────────────────────────────────────────  2026-09-17
     Søren: *"a window below to show the 3D structure while it is being generated."* Headless
     Chromium may or may not give this page a WebGL context, so what is asserted is everything up to
     the GPU: the loft runs on the pad's own contours, the panel opens on a press and not before,
     the note says what it is, and nothing throws. traceloftcheck.js owns the geometry itself. */
  console.log("\nthe 3D preview");
  {
    const prev = await p.evaluate(async () => {
      document.getElementById("tracingX").value = "1000";
      document.getElementById("tracingY").value = "2000";
      document.getElementById("tracingZ").value = "700";
      document.getElementById("tracePadOpen").click();
      PAD.rings = [
        { z: 700, points: [[1000,2000],[1040,2000],[1040,2040],[1000,2040]] },
        { z: 705, points: [[1005,2005],[1035,2005],[1035,2035],[1005,2035]] }
      ];
      const before = document.getElementById("tracePad3DHost").innerHTML;
      /* The ghosts are megabytes over a network this check has no business using. */
      document.getElementById("tracePadGhosts").checked = false;
      document.getElementById("tracePad3D").click();
      await new Promise(r => setTimeout(r, 400));
      const host = document.getElementById("tracePad3DHost");
      const g = UJ.traceloft.loft(UJ.tracepad.toRings(PAD), UJ.cfg.res);
      return { before: before, after: host.textContent,
               canvas: !!host.querySelector("canvas"),
               label: document.getElementById("tracePad3D").textContent,
               tris: g.indices.length / 3, sections: g.sections };
    });
    ok(prev.before === "", "nothing is drawn until it is asked for -- the meshes are not free");
    ok(prev.tris > 0 && prev.sections === 2,
       "the pad's own contours loft into a surface", prev.tris + " triangles on " + prev.sections
       + " sections");
    ok(/preview, not the export/.test(prev.after),
       "...and the panel says what it is and is not, next to the picture",
       prev.after.replace(/\s+/g, " ").slice(0, 90));
    ok(/lofted section to section/.test(prev.after) && /marches cubes/.test(prev.after),
       "...naming both surfaces, so nobody reads this one as the one they will download");
    ok(/Hide the 3D view/.test(prev.label), "...and the button now closes it", prev.label);
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
