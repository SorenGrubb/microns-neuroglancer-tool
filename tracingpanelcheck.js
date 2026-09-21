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

  /* ── THE BOXES FOLLOW THE CELL YOU LOOKED UP ─────────────────────────────────  2026-09-17
     Søren: *"If a cell has been looked up in the cell identity window, that cell's coordinates
     should be in the cells trace coordinate window."* They did once, on opening the card and only
     while empty -- so looking up a SECOND cell left the first one's coordinate sitting there, which
     is the case that matters because it traces the wrong cell without saying anything. */
  console.log("\nthe coordinate follows the cell you look up");
  {
    const follows = await p.evaluate(async () => {
      const box = () => ["tracingX", "tracingY", "tracingZ"]
        .map(i => document.getElementById(i).value).join(",");
      const out = {};
      out.title = document.querySelector("#tracingCard summary").textContent;
      window.CUR_POS = [100, 200, 300];
      out.first = box();
      /* A SECOND cell: the boxes are no longer empty, which is where this used to stop. */
      window.CUR_POS = [400, 500, 600];
      out.second = box();
      out.say = document.getElementById("tracingPosSay").textContent;
      /* Typed by hand: never overwritten, and said out loud rather than silently disagreed with. */
      document.getElementById("tracingX").value = "111";
      document.getElementById("tracingY").value = "222";
      document.getElementById("tracingZ").value = "333";
      window.CUR_POS = [700, 800, 900];
      out.typed = box();
      out.offer = document.getElementById("tracingPosSay").textContent;
      const take = document.getElementById("tracingPosTake");
      out.hasButton = !!take;
      if (take) take.click();
      out.taken = box();
      return out;
    });
    ok(/Trace a cell or organelle/.test(follows.title),
       "the card is called “Trace a cell or organelle”", follows.title.slice(0, 40));
    ok(follows.first === "100,200,300", "a looked-up cell fills the boxes", follows.first);
    ok(follows.second === "400,500,600",
       "...and a SECOND cell replaces it, which is the case that used to stop at the first",
       follows.second);
    ok(/looked up/.test(follows.say), "...saying where the numbers came from", follows.say);
    ok(follows.typed === "111,222,333",
       "a coordinate typed by hand is never overwritten by the next lookup", follows.typed);
    ok(follows.hasButton && /not what is in the boxes/.test(follows.offer),
       "...but the disagreement is said, with a button, rather than left to be discovered",
       follows.offer.slice(0, 60));
    ok(follows.taken === "700,800,900", "...and the button takes the cell on screen", follows.taken);
  }

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
    /* WAS annotatePoint until 2026-09-18, when Søren pasted a Spelunker state proving its polyline
       reaches the link after all. The old note here said "no viewer a link can reach has a polygon
       tool (measured 2026-09-17)" -- that measurement was wrong, and this button now opens
       Spelunker with its polyline armed. See the "drawing viewer is not the viewing viewer" block. */
    ok(!!tr && tr.tool === "annotatePolyline",
       "...with the POLYLINE tool live — Spelunker has one and no viewer has a button for it",
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
      /* A CLEAN PAD FOR EACH STORY.  2026-09-19. Opening the pad at a new coordinate no longer
         replaces what is on it — it carries the contours over and starts the next number, which is
         what a person tracing several organelles in one sitting wants and is why three lysosomes
         were lost before it did (src/a_save_never_takes_work_away.py). This file, though, is one
         page telling a dozen separate stories, and each of them assumes it begins with an empty
         pad. A person gets that by committing or by opening the page; here it is said out loud. */
      if (typeof PAD !== "undefined" && PAD){ PAD.rings = []; PAD.pending = []; PAD.inst = 0; }
      if (typeof TRACING_PENDING !== "undefined") TRACING_PENDING = null;
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

    /* ── DRAWN, NOT CLICKED ──────────────────────────────────────────────────────  2026-09-17
       Søren: *"Could we have an option to click and draw the mouse around a structure to mimic
       using a pen to draw, so that you can use a e.g. Kamvas 13 pad or a Apple pen to draw the
       polylines?"* Driven with a real pointer going round in a circle, because the thing being
       tested is a gesture: press, travel, lift. tracepadcheck.js owns the thinning arithmetic. */
    console.log("  and a stroke is a contour, for a pen or a held-down mouse");
    {
      /* The contours already on the pad are put back afterwards: the sections that follow this
         block count them, and a check that quietly changed the state under the next one would be a
         worse bug than anything it asserts. */
      await p.evaluate(() => {
        window.__keptRings = JSON.stringify(PAD.rings);
        PAD.rings = []; PAD.pending = [];
        document.getElementById("tracePadPen").checked = true;
      });
      const N = 48, R = 90, cx = 300, cy = 260;
      await p.mouse.move(box.x + cx + R, box.y + cy);
      await p.mouse.down();
      for (let i = 1; i <= N; i++){
        const a = 2 * Math.PI * i / N;
        await p.mouse.move(box.x + cx + R * Math.cos(a), box.y + cy + R * Math.sin(a));
      }
      await p.mouse.up();
      await p.waitForTimeout(80);
      const drew = await p.evaluate(() => ({
        rings: PAD.rings.length, pending: PAD.pending.length, stroke: PAD.stroke,
        n: PAD.rings.length ? PAD.rings[PAD.rings.length - 1].points.length : 0,
        say: document.getElementById("tracePadSay").innerText,
        chips: document.querySelectorAll("#tracePadRings .padring").length,
        vol: document.getElementById("tracePadVol").textContent }));
      ok(drew.rings === 1, "one stroke round the structure is one contour", drew.rings + " ring(s)");
      ok(drew.n > 6 && drew.n < 40,
         "...thinned to points a person can still edit, not one per mouse event",
         N + " pointer moves -> " + drew.n + " vertices");
      ok(drew.stroke === null && drew.pending === 0,
         "...and nothing is left half-drawn behind it");
      ok(/Contour drawn/.test(drew.say) && /Drag any of them/.test(drew.say),
         "...it says what it did and that the points can still be moved", drew.say.slice(0, 60));
      ok(drew.chips === 1,
         "...and it is an ORDINARY contour: it has its own delete chip like any other", drew.chips);

      /* A grabbed vertex still wins over starting a stroke, or a drawn contour could never be
         corrected by dragging one of its points -- which is most of what correction is. */
      const vtx = await p.evaluate(() => {
        const r = PAD.rings[0], q = PAD_VIEW.pxAt([r.points[0][0], r.points[0][1], PAD.z]);
        return { x: q[0], y: q[1], before: JSON.stringify(r.points[0]), rings: PAD.rings.length };
      });
      await p.mouse.move(box.x + vtx.x, box.y + vtx.y);
      await p.mouse.down();
      await p.mouse.move(box.x + vtx.x + 25, box.y + vtx.y + 15, { steps: 5 });
      await p.mouse.up();
      await p.waitForTimeout(60);
      const moved2 = await p.evaluate(() => ({
        rings: PAD.rings.length, now: JSON.stringify(PAD.rings[0].points[0]) }));
      ok(moved2.rings === vtx.rings && moved2.now !== vtx.before,
         "dragging one of its points MOVES it rather than starting a new stroke",
         vtx.before + " -> " + moved2.now);

      /* A pen switches it on by itself. pointerType is the browser saying a stylus is on the glass,
         and somebody who has just put a pen to a Kamvas is not asking to place one vertex. */
      const pen = await p.evaluate(async () => {
        document.getElementById("tracePadPen").checked = false;
        const cv = document.getElementById("tracePad");
        const r = cv.getBoundingClientRect();
        const fire = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 7, pointerType: "pen", isPrimary: true,
          button: 0, clientX: r.left + x, clientY: r.top + y }));
        fire("pointerdown", 400, 400);
        const on = document.getElementById("tracePadPen").checked;
        const said = document.getElementById("tracePadSay").innerText;
        fire("pointermove", 430, 400); fire("pointermove", 430, 430);
        fire("pointermove", 400, 430); fire("pointerup", 400, 430);
        return { on: on, said: said, rings: PAD.rings.length };
      });
      ok(pen.on, "a pen on the glass turns freehand on by itself");
      ok(/Pen detected/.test(pen.said), "...and says so rather than changing under him",
         pen.said.slice(0, 50));

      await p.evaluate(() => {
        document.getElementById("tracePadPen").checked = false;   // back to clicking, for the rest
        PAD.rings = JSON.parse(window.__keptRings); PAD.pending = []; PAD.stroke = null;
        padRings();
        /* AND NO DRAFT LEFT BEHIND. padRings() schedules an autosave a second or so out, which is
           right in the product and a race in a check: the draft section further down asserts what
           IT saved, and a save from up here landing in between made this file fail about one run in
           three. The timer is cancelled and the key cleared, so that section starts from nothing. */
        if (typeof TRACING_DRAFT_SOON !== "undefined" && TRACING_DRAFT_SOON){
          clearTimeout(TRACING_DRAFT_SOON); TRACING_DRAFT_SOON = null;
        }
        try { localStorage.removeItem("ujump_tracing_drafts_v2");
              localStorage.removeItem("ujump_tracing_drafts_v2");
      localStorage.removeItem("ujump_tracing_draft_v1"); } catch (e){}
        draftRender();
      });
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
      /* A CLEAN PAD FOR EACH STORY.  2026-09-19. Opening the pad at a new coordinate no longer
         replaces what is on it — it carries the contours over and starts the next number, which is
         what a person tracing several organelles in one sitting wants and is why three lysosomes
         were lost before it did (src/a_save_never_takes_work_away.py). This file, though, is one
         page telling a dozen separate stories, and each of them assumes it begins with an empty
         pad. A person gets that by committing or by opening the page; here it is said out loud. */
      if (typeof PAD !== "undefined" && PAD){ PAD.rings = []; PAD.pending = []; PAD.inst = 0; }
      if (typeof TRACING_PENDING !== "undefined") TRACING_PENDING = null;
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
    /* READ BEFORE THE PRESS, 2026-09-19. The claim is that the volume was on screen BEFORE anything
       was sent, and this used to read it afterwards and get away with it because adding left the
       whole block standing. It does not any more — a card describing a tracing that has gone into
       the dataset is a card describing nothing — so the assertion now takes its evidence at the
       moment it is actually about. */
    const volSayBefore = document.getElementById("tracingVolSay").textContent;
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
                                           vol: x.volumeUm3, method: x.volumeMethod,
                                           low: x.volumeTrapezoidUm3, gap: x.sectionGapNm,
                                           areas: (x.areas || []).length,
                                           zs: (x.contours || []).map(c => c.z).join(","),
                                           pts: (x.contours || []).map(c => (c.points || "").split(";").length).join(",") }));
    out.volSay = volSayBefore;
    /* ...and the block goes when the tracing does: the contours are in the dataset now. */
    out.volSayAfter = document.getElementById("tracingVolSay").textContent;
    out.foundAfter = document.getElementById("tracingFound").style.display;
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
  /* Søren: *"add the volumes to the data for the cell when submitting."* Measured on the page by
     core/traceloft.js, shown before the button is pressed, and carried by the submission -- the
     number stored is the number he saw. traceloftcheck.js is where the estimator itself is checked
     against shapes whose volume is arithmetic. */
  ok(row.vol > 0 && row.method === "cavalieri",
     "the submission carries the volume, and names the estimator",
     row.vol + " µm³ by " + row.method);
  ok(row.low > 0 && row.low < row.vol,
     "...with the lower bound beside it, which is the error bar on a stack of sections",
     row.low + " < " + row.vol);
  ok(row.gap === 400, "...and the spacing it was traced at", row.gap + " nm");
  ok(row.areas === 2, "...and one area per section, for the file", row.areas + " areas");
  ok(/Volume/.test(shared.volSay) && /Cavalieri/.test(shared.volSay),
     "and it was on screen before anything was sent", shared.volSay.slice(0, 70));
  ok(shared.volSayAfter === "" && shared.foundAfter === "none",
     "...and off it afterwards, so the card never quotes a volume for contours it has given away",
     JSON.stringify(shared.volSayAfter) + " / " + JSON.stringify(shared.foundAfter));
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
      /* A CLEAN PAD FOR EACH STORY.  2026-09-19. Opening the pad at a new coordinate no longer
         replaces what is on it — it carries the contours over and starts the next number, which is
         what a person tracing several organelles in one sitting wants and is why three lysosomes
         were lost before it did (src/a_save_never_takes_work_away.py). This file, though, is one
         page telling a dozen separate stories, and each of them assumes it begins with an empty
         pad. A person gets that by committing or by opening the page; here it is said out loud. */
      if (typeof PAD !== "undefined" && PAD){ PAD.rings = []; PAD.pending = []; PAD.inst = 0; }
      if (typeof TRACING_PENDING !== "undefined") TRACING_PENDING = null;
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
      /* A CLEAN PAD FOR EACH STORY.  2026-09-19. Opening the pad at a new coordinate no longer
         replaces what is on it — it carries the contours over and starts the next number, which is
         what a person tracing several organelles in one sitting wants and is why three lysosomes
         were lost before it did (src/a_save_never_takes_work_away.py). This file, though, is one
         page telling a dozen separate stories, and each of them assumes it begins with an empty
         pad. A person gets that by committing or by opening the page; here it is said out loud. */
      if (typeof PAD !== "undefined" && PAD){ PAD.rings = []; PAD.pending = []; PAD.inst = 0; }
      if (typeof TRACING_PENDING !== "undefined") TRACING_PENDING = null;
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
      /* A CLEAN PAD FOR EACH STORY.  2026-09-19. Opening the pad at a new coordinate no longer
         replaces what is on it — it carries the contours over and starts the next number, which is
         what a person tracing several organelles in one sitting wants and is why three lysosomes
         were lost before it did (src/a_save_never_takes_work_away.py). This file, though, is one
         page telling a dozen separate stories, and each of them assumes it begins with an empty
         pad. A person gets that by committing or by opening the page; here it is said out loud. */
      if (typeof PAD !== "undefined" && PAD){ PAD.rings = []; PAD.pending = []; PAD.inst = 0; }
      if (typeof TRACING_PENDING !== "undefined") TRACING_PENDING = null;
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
  /* ── EACH STRUCTURE ITS OWN SURFACE, ITS OWN COLOUR ──────────────────────────────  2026-09-17
     Søren: *"I would like if the different segmented meshes also have different colors in the 3D
     window."* The colour was the visible half. The other half was that every contour on the pad
     went into ONE loft, so a contour of number 2 and a contour of number 3 on the same section were
     lofted TO EACH OTHER across the gap between them — the preview was not three organelles in one
     colour, it was one organelle that does not exist. Both halves are checked: the geometry (two
     separate surfaces, not one bridged one) and the paint (two colours actually on the canvas). */
  console.log("\ntwo structures in the 3D window");
  {
    const two = await p.evaluate(async () => {
      document.getElementById("tracePadGhosts").checked = false;
      window.__padSnap = { rings: PAD.rings.slice(), inst: PAD.inst || 0 };
      /* Two boxes FAR APART on the same two sections. Lofted together they would be joined by a
         bridge running between them; lofted apart they are two boxes and the middle is empty. */
      PAD.rings = [
        { z: 700, inst: 0, points: [[1000,2000],[1200,2000],[1200,2200],[1000,2200]] },
        { z: 705, inst: 0, points: [[1010,2010],[1190,2010],[1190,2190],[1010,2190]] },
        { z: 700, inst: 1, points: [[1600,2000],[1800,2000],[1800,2200],[1600,2200]] },
        { z: 705, inst: 1, points: [[1610,2010],[1790,2010],[1790,2190],[1610,2190]] }
      ];
      UJ.tracepad.setInstance(PAD, 0);
      PAD3D_KEY = null;
      padRings();
      await new Promise(r => setTimeout(r, 900));
      const host = document.getElementById("tracePad3DHost");
      const cols = [padInstColour(0), padInstColour(1)];
      const tints = [padInstTint(0), padInstTint(1)];
      /* The two palette colours differ mostly in the red channel, so "more red than the other" is
         the honest discriminator here rather than a named hue. */
      const redder = tints[1][0] > tints[0][0] ? 1 : 0;
      const a = UJ.mesh3d.probePixels((r, g, bb) => g > 60 && r < g - 30);          // the greener one
      const bPix = UJ.mesh3d.probePixels((r, g, bb) => g > 60 && r >= g - 30);      // the redder one
      /* Printed when it fails, so a calibration problem in this check cannot be mistaken for the
         feature being broken. */
      const lit = UJ.mesh3d.probePixels((r, g, bb) => r + g + bb > 90);
      return { text: host.textContent, cols: cols, tints: tints, redder: redder,
               a: a, b: bPix, lit: lit, canvas: !!host.querySelector("canvas") };
    });
    ok(two.canvas, "the preview redraws with both structures on it");
    ok(two.cols[0] !== two.cols[1], "the two structures have different colours", two.cols.join(" / "));
    ok(/2 structures/.test(two.text) && /each lofted on its own/.test(two.text),
       "...and the panel says each one is lofted on its own",
       two.text.replace(/\s+/g, " ").match(/2 structures[^.]*/)[0].slice(0, 80));
    /* The pixel counts are the assertion that survives a refactor of any of the words above. */
    ok(two.a > 60 && two.b > 60,
       "BOTH COLOURS ARE ACTUALLY ON THE CANVAS — not one colour twice",
       two.a + " px of one, " + two.b + " px of the other, " + two.lit + " px lit at all");
  }

  console.log("...and they are two surfaces, not one bridged together");
  {
    const sep = await p.evaluate(() => {
      const res = UJ.cfg.res;
      const all = UJ.tracepad.toRings(PAD);
      const one = UJ.traceloft.loft(all.filter(r => (r.inst || 0) === 0), res);
      const two = UJ.traceloft.loft(all.filter(r => (r.inst || 0) === 1), res);
      const both = UJ.traceloft.loft(all, res);
      const spanX = (g) => {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < g.positions.length; i += 3){
          if (g.positions[i] < lo) lo = g.positions[i];
          if (g.positions[i] > hi) hi = g.positions[i];
        }
        return hi - lo;
      };
      return { one: Math.round(spanX(one)), two: Math.round(spanX(two)),
               both: Math.round(spanX(both)),
               tris: [one.indices.length / 3, two.indices.length / 3, both.indices.length / 3] };
    });
    ok(sep.one < sep.both / 2.5 && sep.two < sep.both / 2.5,
       "lofted apart, each structure is its own small box; lofted together they span the gap",
       sep.one + " nm and " + sep.two + " nm vs " + sep.both + " nm across");
    ok(sep.tris[0] > 0 && sep.tris[1] > 0,
       "...and both are real surfaces", sep.tris.join(" / ") + " triangles");
  }

  /* LEAVES NO TRACE. This section writes PAD.rings directly and calls padRings(), which schedules a
     draft autosave -- and the draft sections further down are about a draft they made themselves.
     Snapshotting the pad and cancelling the pending autosave is what keeps this check from being
     the reason another one fails, which is a failure that teaches nobody anything. */
  await p.evaluate(() => {
    if (window.TRACING_DRAFT_SOON){ clearTimeout(TRACING_DRAFT_SOON); TRACING_DRAFT_SOON = null; }
    try { localStorage.removeItem("ujump_tracing_drafts_v2");
          localStorage.removeItem("ujump_tracing_drafts_v2");
      localStorage.removeItem("ujump_tracing_draft_v1"); } catch (e) {}
    if (window.__padSnap){ PAD.rings = window.__padSnap.rings; UJ.tracepad.setInstance(PAD, window.__padSnap.inst); }
    PAD3D_KEY = null;
  });


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

  /* ── A DRAFT SURVIVES THE PAGE ─────────────────────────────────────────────────  2026-09-17
     Søren: *"you should be able to save a draft of your progress and continue editing it later
     before submitting."* "Later" is the word that matters, so this RELOADS THE PAGE between saving
     and resuming. Anything less tests a variable, not a draft.

     Last, deliberately: it reloads, so everything before it would have to be set up again. */
  /* ── SEVERAL ORGANELLES OF ONE TYPE ────────────────────────────────────────────  2026-09-17
     Søren: *"I want the option to draw more than one organelle of the same type, the extra added
     organelles should have different colors, so you can distinguish them, and when publishing they
     should have different numbers, also when shown on the cell identity page."*

     A cell has forty mitochondria. All four clauses are asserted here against the real card: they
     are separate on the pad, they are separate colours, they are separate SUBMISSIONS with separate
     volumes and numbers, and the numbers continue from what the cell already has rather than
     restarting at one. */
  console.log("\nseveral organelles of the same type");
  {
    const two = await p.evaluate(async () => {
      UJ.emtiles.configure = () => ({});
      UJ.emtiles.configured = () => true;
      UJ.emtiles.drawSection = async (cv, o) => {
        const g = cv.getContext("2d");
        g.fillStyle = "#444"; g.fillRect(0, 0, cv.width, cv.height);
        const k = 8;
        const x0 = o.centre[0] - (cv.width >> 1) * k, y0 = o.centre[1] - (cv.height >> 1) * k;
        return { mip: 2, mips: 3, nmPerPx: 32, z: o.centre[2], w: cv.width, h: cv.height, chunks: 1,
                 toolAt: (px, py) => [Math.round(x0 + px * k), Math.round(y0 + py * k), o.centre[2]],
                 pxAt: (t) => [Math.round((t[0] - x0) / k), Math.round((t[1] - y0) / k)],
                 pxPerToolVoxel: 1 / k };
      };
      /* THE CELL ALREADY HAS TWO. The third and fourth mitochondrion must be 3 and 4, not 1 and 2 —
         which is the whole reason the page reads the index before numbering. */
      TRACING_SHARED = [
        { structureId: "m1", name: "Mitochondrion 1", kind: "other",
          instanceOf: "other", instanceIndex: 1, nucleusId: "253863", contours: 3,
          sections: 3, volumeUm3: 0.21, color: "#40e28c", tracedBy: "Somebody Else" },
        { structureId: "m2", name: "Mitochondrion 2", kind: "other",
          instanceOf: "other", instanceIndex: 2, nucleusId: "253863", contours: 3,
          sections: 3, volumeUm3: 0.18, color: "#bfdd78", tracedBy: "Somebody Else" },
        /* A DIFFERENT hand-named structure on the SAME cell. Under "something else" everything
           carries the kind "other", so numbering by kind alone would make the next mitochondrion
           the fourth "other" rather than the third mitochondrion. */
        { structureId: "d1", name: "Dense body 1", kind: "other",
          instanceOf: "other", instanceIndex: 1, nucleusId: "253863", contours: 2,
          sections: 2, volumeUm3: 0.03, color: "#9740e2", tracedBy: "Somebody Else" }
      ];
      TRACING_INDEX_AT = Date.now();            // and do not go and fetch over the top of it

      ["tracingX", "tracingY", "tracingZ"].forEach((id, i) => {
        document.getElementById(id).value = [240640, 207872, 41000][i];
      });
      /* A CLEAN PAD FOR EACH STORY.  2026-09-19. Opening the pad at a new coordinate no longer
         replaces what is on it — it carries the contours over and starts the next number, which is
         what a person tracing several organelles in one sitting wants and is why three lysosomes
         were lost before it did (src/a_save_never_takes_work_away.py). This file, though, is one
         page telling a dozen separate stories, and each of them assumes it begins with an empty
         pad. A person gets that by committing or by opening the page; here it is said out loud. */
      if (typeof PAD !== "undefined" && PAD){ PAD.rings = []; PAD.pending = []; PAD.inst = 0; }
      if (typeof TRACING_PENDING !== "undefined") TRACING_PENDING = null;
      document.getElementById("tracePadOpen").click();
      await new Promise(r => setTimeout(r, 200));
      document.getElementById("tracingNucId").value = "253863";

      const draw = (dx) => {
        [[100 + dx, 100], [200 + dx, 100], [200 + dx, 200]].forEach(q => {
          const t = PAD_VIEW.toolAt(q[0], q[1]);
          UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
        });
        UJ.tracepad.closeRing(PAD);
      };
      draw(0); padStep(1); await new Promise(r => setTimeout(r, 150)); draw(0);
      const oneColour = padInstColour(0);
      document.getElementById("tracePadNewInst").click();
      draw(250); padStep(-1); await new Promise(r => setTimeout(r, 150)); draw(250);
      padRings();
      const out = { insts: UJ.tracepad.instances(PAD).length,
                    chips: document.querySelectorAll("#tracePadInsts .padinst").length,
                    colours: [padInstColour(0), padInstColour(1)],
                    oneColour: oneColour,
                    vol: document.getElementById("tracePadVol").innerHTML,
                    ringColours: [].slice.call(
                      document.querySelectorAll("#tracePadRings .padring span"))
                      .map(e => e.style.background) };

      window.__posted = [];
      window.postReport = (x) => { window.__posted.push(x); return true; };
      GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "t.t.t";
      GOOGLE_EXP = Math.floor(Date.now() / 1000) + 3600;
      document.getElementById("tracePadUse").click();
      const w = document.getElementById("tracingWhat");
      w.value = "__other"; w.dispatchEvent(new Event("change", { bubbles: true }));
      document.getElementById("tracingName").value = "Mitochondrion";
      document.getElementById("tracingKeep").click();
      out.posted = window.__posted.map(x => ({ sid: x.structureId, name: x.name,
                                               idx: x.instanceIndex, of: x.instanceOf,
                                               col: x.color, vol: x.volumeUm3,
                                               zs: (x.contours || []).map(c => c.z).join(",") }));
      out.kept = TRACINGS_KEPT.slice(-2).map(t => t.name);
      out.say = document.getElementById("tracingStatus").textContent;
      return out;
    });
    ok(two.insts === 2 && two.chips === 2,
       "two organelles on one pad, and a chip for each", two.insts + " / " + two.chips + " chips");
    ok(two.colours[0] !== two.colours[1],
       "...in different colours, so they can be told apart", two.colours.join(" vs "));
    ok(two.ringColours.length === 2 && two.ringColours[0] !== two.ringColours[1],
       "...and the contour chips wear the colour of the one they belong to",
       two.ringColours.join(" | "));
    ok(/<br>/.test(two.vol) && (two.vol.match(/Volume/g) || []).length === 2,
       "...each with its own volume, not one number over both",
       two.vol.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 80));
    ok(two.posted.length === 2, "one press adds BOTH, as two submissions", two.posted.length);
    ok(two.posted[0].sid !== two.posted[1].sid,
       "...with structureIds of their own — two objects, not two versions of one",
       two.posted.map(x => x.sid).join(" / "));
    ok(two.posted[0].idx === 3 && two.posted[1].idx === 4,
       "...NUMBERED ON FROM WHAT THE CELL ALREADY HAS, not restarted at one",
       two.posted.map(x => x.idx).join(", "));
    ok(two.posted[0].name === "Mitochondrion 3" && two.posted[1].name === "Mitochondrion 4",
       "...and named with the number, which is what a person reads",
       two.posted.map(x => x.name).join(" / "));
    ok(two.posted[0].idx !== 2,
       "...counting the mitochondria on this cell and not the OTHER hand-named structure on it, "
       + "which shares the kind \u201cother\u201d and nothing else", "not " + 2);
    ok(two.posted.every(x => x.of === "__other" || x.of),
       "...saying which kind they are one of, so they can be grouped without parsing a name",
       two.posted[0].of);
    ok(two.posted[0].col !== two.posted[1].col,
       "...each carrying its own colour into the dataset", two.posted.map(x => x.col).join(" / "));
    ok(two.posted[0].vol > 0 && two.posted[1].vol > 0
       && two.posted[0].zs === "41000,41005" && two.posted[1].zs === "41000,41005",
       "...and its own contours and volume", JSON.stringify(two.posted.map(x => x.vol)));
    ok(/2 structures/.test(two.say), "...and it says both went", two.say.slice(0, 60));

    /* ── AND EACH ONE CAN BE A DIFFERENT THING ──────────────────────────────────  2026-09-17
       Søren: *"I would like an option to identify the organelles identities individually, so
       standard is that they are all the same, but if you click a button you can identify them
       individually."* The default is asserted above -- two structures, one type between them. This
       is the button, and the property that makes it safe: turning it on changes nothing about what
       anything IS, it only makes them separately editable. */
    console.log("  and each one can be a different thing");
    {
      const own = await p.evaluate(async () => {
        PAD.rings = []; PAD.pending = []; PAD_INST_KIND = {};
        document.getElementById("tracingEachOwn").checked = false;
        UJ.tracepad.setInstance(PAD, 0);
        padRings();
        const draw = (dx) => {
          [[100 + dx, 100], [200 + dx, 100], [200 + dx, 200]].forEach(q => {
            const t = PAD_VIEW.toolAt(q[0], q[1]);
            UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
          });
          UJ.tracepad.closeRing(PAD);
        };
        const out = {};
        out.rowHiddenAtOne = document.getElementById("tracingEachRow").style.display;
        draw(0); padStep(1); await new Promise(r => setTimeout(r, 150)); draw(0);
        padRings();
        out.rowStillHidden = document.getElementById("tracingEachRow").style.display;
        document.getElementById("tracePadNewInst").click();
        draw(250); padStep(-1); await new Promise(r => setTimeout(r, 150)); draw(250);
        padRings();
        out.rowShown = document.getElementById("tracingEachRow").style.display;

        /* Turn it on: both keep what they already were. */
        const each = document.getElementById("tracingEachOwn");
        const flip = (v) => { each.checked = v;
                              each.dispatchEvent(new Event("change", { bubbles: true })); };
        flip(true);
        out.seeded = [tracingKindFor(0).name, tracingKindFor(1).name];

        /* ── THE BOX YOU PICKED IS THE DEFAULT ───────────────────────────────────  2026-09-17
           Søren: *"if you choose an organelle before pressing Name each one separately, then the
           chosen organelle would be the default in the separate namings."* The first tick always
           did that. The SECOND did not: every structure had a type by then, and the seed only
           filled in structures that had none, so the box the person had just changed was ignored. */
        const w0 = document.getElementById("tracingWhat");
        flip(false);
        w0.value = "lysosome"; w0.dispatchEvent(new Event("change", { bubbles: true }));
        out.boxIs = w0.value;
        flip(true);
        out.afterSecondTick = [].slice.call(document.querySelectorAll("#tracingEachList .eachwhat"))
                                .map(e => e.value);

        /* ── ONE ROW PER DRAWING NUMBER ──────────────────────────────────────────  2026-09-17
           Søren: *"The name each one separately I thought would give me an option to name each
           one, so that there would be one naming for each drawing number."* So the check drives
           what he expected: the rows are simply THERE, one per structure, and the second one is
           changed in its own row without visiting the Drawing strip at all. */
        out.rows = document.querySelectorAll("#tracingEachList .eachwhat").length;
        out.listShown = document.getElementById("tracingEachList").style.display !== "none";
        out.sharedHidden = document.getElementById("tracingWhatRow").style.display === "none";
        out.numbers = [].slice.call(document.querySelectorAll("#tracingEachList .row b"))
                        .map(e => e.textContent.trim());
        const row2 = document.querySelector('#tracingEachList .eachwhat[data-inst="1"]');
        row2.value = "__nucleus"; row2.dispatchEvent(new Event("change", { bubbles: true }));
        out.after = [tracingKindFor(0).name, tracingKindFor(1).name];
        out.chips = [].slice.call(document.querySelectorAll("#tracePadInsts .padinst"))
                      .map(e => e.textContent.replace(/\s+/g, " ").trim());
        /* Each row keeps showing its own, with nothing selected and nothing clicked. */
        out.rowValues = [].slice.call(document.querySelectorAll("#tracingEachList .eachwhat"))
                          .map(e => e.value);
        /* And "something else" opens a name box on THAT row only. */
        const row1 = document.querySelector('#tracingEachList .eachwhat[data-inst="0"]');
        row1.value = "__other"; row1.dispatchEvent(new Event("change", { bubbles: true }));
        const nm1 = document.querySelector('#tracingEachList .eachname[data-inst="0"]');
        nm1.value = "Dense body"; nm1.dispatchEvent(new Event("input", { bubbles: true }));
        out.nameWraps = [].slice.call(document.querySelectorAll("#tracingEachList .eachnamewrap"))
                          .map(e => e.style.display);
        out.named = [tracingKindFor(0).name, tracingKindFor(1).name];
        /* Its own colour, in its own row, without touching the shared picker. */
        const c2 = document.querySelector('#tracingEachList .eachcol[data-inst="1"]');
        c2.value = "#ff0088"; c2.dispatchEvent(new Event("input", { bubbles: true }));
        out.colour = [padInstColour(0), padInstColour(1)];

        /* THE EXCEPTION. The rows now disagree — one "something else", one nucleus — so a person
           has been through them. Toggling the tick off and on again must not hand them both the
           shared box, or an afternoon of naming goes in one mis-click. */
        flip(false); flip(true);
        out.survives = [].slice.call(document.querySelectorAll("#tracingEachList .eachwhat"))
                         .map(e => e.value);

        window.__posted = [];
        window.postReport = (x) => { window.__posted.push(x); return true; };
        document.getElementById("tracePadUse").click();
        document.getElementById("tracingKeep").click();
        out.posted = window.__posted.map(x => ({ name: x.name, kind: x.kind,
                                                 idx: x.instanceIndex, of: x.instanceOf }));
        return out;
      });
      ok(own.rowHiddenAtOne === "none" && own.rowStillHidden === "none",
         "the option is not offered while there is only one thing to name",
         own.rowStillHidden || "hidden");
      ok(own.rowShown === "flex", "...and appears as soon as there are two", own.rowShown);
      ok(own.seeded[0] === own.seeded[1] && !!own.seeded[0],
         "turning it on changes nothing: both keep the type they already had",
         own.seeded.join(" / "));
      ok(own.boxIs === "lysosome" && own.afterSecondTick.join(",") === "lysosome,lysosome",
         "THE ORGANELLE CHOSEN BEFORE THE TICK IS WHAT THE ROWS START AS, second tick included",
         own.afterSecondTick.join(" / "));
      ok(own.rows === 2 && own.listShown && own.sharedHidden,
         "ONE ROW PER DRAWING NUMBER, in place of the single box — what he expected the tick to do",
         own.rows + " rows, shared box hidden: " + own.sharedHidden);
      ok(own.numbers.join(" ") === "#1 #2",
         "...each labelled with its number, in the order they were drawn", own.numbers.join(" "));
      ok(own.after[0] !== own.after[1] && /Nucleus/i.test(own.after[1]),
         "...and changing one row changes only that one, with no trip to the Drawing strip",
         own.after.join(" / "));
      ok(own.rowValues[0] !== own.rowValues[1] && own.rowValues[1] === "__nucleus",
         "...and every row goes on showing its own, all of them visible at once",
         own.rowValues.join(" / "));
      ok(/Nucleus/i.test(own.chips[1]) && !/Nucleus/i.test(own.chips[0]),
         "...which the strip says too, so the pad and the list agree",
         own.chips.join(" | "));
      ok(own.nameWraps[0] === "" && own.nameWraps[1] === "none",
         "\u201csomething else\u201d opens a name box on that row and no other",
         JSON.stringify(own.nameWraps));
      ok(own.named[0] === "Dense body" && /Nucleus/i.test(own.named[1]),
         "...and what is typed there is what that structure is called", own.named.join(" / "));
      ok(own.colour[1].toLowerCase() === "#ff0088" && own.colour[0].toLowerCase() !== "#ff0088",
         "...and a row's colour picker recolours that structure alone", own.colour.join(" / "));
      ok(own.survives.join(",") === "__other,__nucleus",
         "...and once they DO differ, a stray toggle of the tick does not overwrite that work",
         own.survives.join(" / "));
      ok(own.posted.length === 2 && own.posted[0].kind !== own.posted[1].kind,
         "...and they are added as two different things in one press",
         own.posted.map(x => x.kind).join(" / "));
      ok(own.posted[1].name === "Nucleus" || own.posted[1].idx === undefined
         || own.posted[1].of === "__nucleus",
         "...each numbered within its OWN type, so the lone nucleus is not \u201cnumber two\u201d",
         JSON.stringify(own.posted[1]));
    }

    /* ── AND ON THE CELL IDENTITY PAGE ───────────────────────────────────────────
       The last clause of the request, and the one that makes the numbers worth having: a number
       distinguishes things only where they are listed together. */
    const onCell = await p.evaluate(async () => {
      document.body.insertAdjacentHTML("beforeend", '<div id="commReports"></div>');
      window.fetch = async () => ({ ok: true, json: async () => ({ tracings: [
        { structureId: "m2", name: "Mitochondrion 2", instanceOf: "mitochondrion",
          instanceIndex: 2, nucleusId: "253863", contours: 3, sections: 3, volumeUm3: 0.18,
          color: "#bfdd78", contributors: ["Somebody Else"] },
        { structureId: "m1", name: "Mitochondrion 1", instanceOf: "mitochondrion",
          instanceIndex: 1, nucleusId: "253863", contours: 3, sections: 3, volumeUm3: 0.21,
          color: "#40e28c", contributors: ["Søren Grubb"] },
        { structureId: "other", name: "Lysosome", instanceOf: "lysosome", nucleusId: "999",
          contours: 2, sections: 2, volumeUm3: 0.02, color: "#9740e2", tracedBy: "Nobody" }
      ] }) });
      PANEL_TRACINGS = null; PANEL_TRACINGS_AT = 0;
      PANEL_ORGAN_ANNS = []; PANEL_ORGAN_NID = "253863"; PANEL_ORGAN_RINGS = {};
      window.__organOpen = true;
      loadTracedStructures("253863", "");
      await new Promise(r => setTimeout(r, 120));
      /* SINCE 2026-09-18 organelles live in the Organelles section, beside the logged points they
         pair with, rather than in the "Traced on this cell" block -- the same object twice on one
         panel is what that section exists to end. The numbering is what is under test here and it
         is unchanged; only which block reads it out has moved. */
      const box = document.getElementById("cellOrganelles");
      return { html: box ? box.innerHTML : "", text: box ? box.textContent : "" };
    });
    ok(/Organelles/.test(onCell.text),
       "the cell's own panel has a block for the organelles traced on it");
    ok(onCell.text.indexOf("Mitochondrion 1") < onCell.text.indexOf("Mitochondrion 2"),
       "...listed by number, so 1 and 2 read as a set rather than as two unrelated things");
    ok(/0\.21/.test(onCell.text) && /0\.18/.test(onCell.text),
       "...each with its own volume", onCell.text.replace(/\s+/g, " ").slice(0, 110));
    ok(!/Lysosome/.test(onCell.text),
       "...and nothing belonging to another cell", "nucleus 999's lysosome is not here");
    ok(/#40e28c/i.test(onCell.html) && /#bfdd78/i.test(onCell.html),
       "...in the colours they were drawn in");
  }

  console.log("\na draft, put down and picked up after a reload");
  {
    const stub = () => {
      UJ.emtiles.configure = () => ({});
      UJ.emtiles.configured = () => true;
      UJ.emtiles.drawSection = async (cv, o) => {
        const g = cv.getContext("2d");
        g.fillStyle = "#444"; g.fillRect(0, 0, cv.width, cv.height);
        const k = 8;
        const x0 = o.centre[0] - (cv.width >> 1) * k, y0 = o.centre[1] - (cv.height >> 1) * k;
        return { mip: 2, mips: 3, nmPerPx: 32, z: o.centre[2], w: cv.width, h: cv.height, chunks: 1,
                 toolAt: (px, py) => [Math.round(x0 + px * k), Math.round(y0 + py * k), o.centre[2]],
                 pxAt: (t) => [Math.round((t[0] - x0) / k), Math.round((t[1] - y0) / k)],
                 pxPerToolVoxel: 1 / k };
      };
    };
    const saved = await p.evaluate(async ({ src }) => {
      eval("(" + src + ")()");
      document.getElementById("tracingPanel").open = true;
      ["tracingX", "tracingY", "tracingZ"].forEach((id, i) => {
        document.getElementById(id).value = [240640, 207872, 33000][i];
      });
      /* WAITS FOR THE PAD, NOT FOR A STOPWATCH.  2026-09-18
         padDraw() refuses to start while one is already running (PAD_BUSY), so a fixed wait that is
         a little too short does not merely draw early -- it makes the NEXT padStep a no-op, and the
         contour meant for the second section lands on the first. That is a race that passes until
         the run ahead of this section gets slower, and it is what made this section start failing
         with nothing wrong in it. */
      const ready = async () => {
        for (let i = 0; i < 100; i++){
          if (PAD_VIEW && !PAD_BUSY) return true;
          await new Promise(r => setTimeout(r, 50));
        }
        return false;
      };
      /* A CLEAN PAD FOR EACH STORY.  2026-09-19. Opening the pad at a new coordinate no longer
         replaces what is on it — it carries the contours over and starts the next number, which is
         what a person tracing several organelles in one sitting wants and is why three lysosomes
         were lost before it did (src/a_save_never_takes_work_away.py). This file, though, is one
         page telling a dozen separate stories, and each of them assumes it begins with an empty
         pad. A person gets that by committing or by opening the page; here it is said out loud. */
      if (typeof PAD !== "undefined" && PAD){ PAD.rings = []; PAD.pending = []; PAD.inst = 0; }
      if (typeof TRACING_PENDING !== "undefined") TRACING_PENDING = null;
      document.getElementById("tracePadOpen").click();
      await ready();
      /* Two sections, and a half-drawn contour on the second -- a draft that dropped the contour in
         progress would lose the work of whoever was interrupted mid-cell, which is most of them. */
      [[100, 100], [200, 100], [200, 200]].forEach(q => {
        const t = PAD_VIEW.toolAt(q[0], q[1]);
        UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
      });
      UJ.tracepad.closeRing(PAD);
      padStep(1);
      await ready();
      [[110, 110], [210, 110], [210, 210]].forEach(q => {
        const t = PAD_VIEW.toolAt(q[0], q[1]);
        UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
      });
      UJ.tracepad.closeRing(PAD);
      const t = PAD_VIEW.toolAt(300, 300);
      UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
      padRings();
      document.getElementById("tracingNucId").value = "253863";
      document.getElementById("tracingRootId").value = "864691135570733037";
      PAD_EDIT_ID = "hers_1";                       // as if this were an edit of a shared tracing
      /* The autosave is coalesced to about a second; wait for IT rather than for a stopwatch,
         because the point is that nobody has to press the button -- and because a fixed wait is a
         race that passes until the run ahead of it gets slower, which is how this section started
         failing on 2026-09-18 with nothing wrong in it. */
      /* Waits for the autosave to SETTLE, not merely to happen: it fires after every contour, so
         the first value it writes is a half-drawn draft and reading that would assert against a
         state nobody is in. Two identical reads a few hundred ms apart is what "caught up" means,
         and it is not a stopwatch -- a fixed wait is a race that passes until the run ahead of it
         gets slower, which is how this section started failing on 2026-09-18 with nothing wrong
         in it. */
      let raw = null, prev = null, same = 0;
      for (let i = 0; i < 80; i++){
        await new Promise(r => setTimeout(r, 100));
        raw = JSON.stringify(draftRead());
        if (raw && raw === prev){ if (++same >= 4) break; } else same = 0;
        prev = raw;
      }
      return { raw: !!raw, d: raw ? JSON.parse(raw) : null,
               bar: document.getElementById("tracingDraftBar").textContent,
               vol: document.getElementById("tracePadVol").textContent,
               zs: PAD.rings.map(r => r.z).join(",") };
    }, { src: stub.toString() });
    ok(saved.raw && saved.d.rings.length === 2,
       "the pad saves itself as you draw — no button pressed",
       saved.d && saved.d.rings.length + " contours");
    ok(saved.d.pending.length === 1,
       "...including the contour still being drawn", saved.d.pending.length + " vertex");
    ok(saved.d.editId === "hers_1" && saved.d.nucId === "253863",
       "...and WHICH tracing it is, with what has been filled in",
       saved.d.editId + " / " + saved.d.nucId);
    /* "tracings", plural, and with a title on each row since 2026-09-19: the card lists every
       unfinished tracing rather than the one most recently saved. */
    ok(/Unfinished tracings/.test(saved.bar) && /Lysosome/.test(saved.bar),
       "...and the card lists it, by what it is", saved.bar.slice(0, 70));
    /* Søren: *"We need to calculate the organelle volumes also."* ON THE PAD, while drawing -- a
       volume you only see after submitting cannot tell you that you have traced one section too
       few. traceloftcheck.js is where the estimator is checked against arithmetic. */
    ok(/Volume/.test(saved.vol) && /\u00b5m\u00b3/.test(saved.vol),
       "and the volume is on the pad as it is drawn, not only at the end", saved.vol.slice(0, 70));
    ok(/every 200 nm/.test(saved.vol),
       "...with the section spacing it was measured at, which is its error bar");

    await p.reload();
    /* Polled, not timed: the page grew another module today and will grow more, and "4 seconds is
       enough to boot" is a race with the future. The bar appearing IS the page having booted far
       enough for this section to ask anything. */
    /* READ IN THE SAME BREATH AS THE WAIT. Waiting for the bar and then asking about it in a
       second round trip is two moments, and the answer belongs to the first one: the page goes on
       working while the question is in flight. One handle, one moment. */
    const back = await p.waitForFunction(() => {
      var b = document.getElementById("tracingDraftBar");
      if (!(b && b.style.display !== "none" && /Unfinished/.test(b.textContent))) return null;
      return { bar: b.textContent, shown: true,
               resume: !!document.querySelector(".draftres"),
               padShut: document.getElementById("tracePadWrap").style.display === "none" };
    }, { timeout: 30000 }).then(h => h.jsonValue())
      .catch(() => ({ bar: "", shown: false, resume: false, padShut: false }));
    ok(back.shown && back.resume && /Unfinished tracings/.test(back.bar),
       "AFTER A RELOAD the card still offers it", back.bar.slice(0, 70));
    ok(back.padShut, "...without reopening the pad by itself");

    const resumed = await p.evaluate(async ({ src }) => {
      eval("(" + src + ")()");
      document.getElementById("tracingPanel").open = true;
      /* One Resume per row now; this story keeps exactly one draft, so the first is it. */
      document.querySelector(".draftres").click();
      await new Promise(r => setTimeout(r, 400));
      return { rings: PAD.rings.length, zs: PAD.rings.map(r => r.z).join(","),
               pending: PAD.pending.length, z: PAD.z,
               edit: PAD_EDIT_ID, nuc: document.getElementById("tracingNucId").value,
               shown: document.getElementById("tracePadWrap").style.display !== "none",
               say: document.getElementById("tracingStatus").textContent,
               first: PAD.rings[0].points[0].join(",") };
    }, { src: stub.toString() });
    ok(resumed.shown && resumed.rings === 2 && resumed.zs === saved.zs,
       "Resume puts every contour back, on the sections they were drawn on", resumed.zs);
    ok(resumed.first.length > 3, "...with their coordinates", resumed.first);
    ok(resumed.pending === 1, "...and the half-drawn contour with them", resumed.pending);
    ok(resumed.edit === "hers_1" && resumed.nuc === "253863",
       "...still a version of the tracing it was an edit of, and still of that cell",
       resumed.edit + " / " + resumed.nuc);
    ok(/version of a tracing already in the dataset/.test(resumed.say),
       "...and it says which of the two it is", resumed.say.slice(0, 70));

    const finished = await p.evaluate(() => {
      window.__posted = [];
      window.postReport = (x) => { window.__posted.push(x); return true; };
      PAD.pending = [];
      document.getElementById("tracePadUse").click();
      const w = document.getElementById("tracingWhat");
      w.value = "__cell"; w.dispatchEvent(new Event("change", { bubbles: true }));
      document.getElementById("tracingKeep").click();
      /* draftRead() returns the object or null; JSON.stringify(null) is the STRING "null", which
         is what this used to compare against by accident of the old key being read raw. */
      return { draft: draftRead(),
               bar: document.getElementById("tracingDraftBar").style.display,
               edit: PAD_EDIT_ID };
    });
    ok(finished.draft === null,
       "adding it to the dataset ends the draft — the list is where it continues from now",
       String(finished.draft));
    ok(finished.bar === "none", "...and the bar goes with it", finished.bar);
    ok(finished.edit === "", "...and nothing is still being edited", '"' + finished.edit + '"');
  }

  /* ── A RESUMED DRAFT KNOWS WHICH STRUCTURE EACH CONTOUR IS ────────────────────────  2026-09-17
     Søren, with a screenshot of two contours on one section: *"When I resumed this segmentation,
     the second segmentation had the color of the first on and said it was empty."*

     draftNow() wrote `{z, points}` per contour and dropped `inst`. On resume every contour came
     back as `r.inst || 0` — structure one's — so structure one had them all, in its colour, and
     structure two, whose contours had just been handed away, was reported empty. The strip said
     "2 empty" while the section below it listed two contours. Nothing was lost from the FILE; what
     was lost was which of them belonged to what, which is the whole point of drawing two. */
  console.log("\na draft with two structures comes back as two structures");
  {
    const stub = () => {
      UJ.emtiles.configure = () => ({});
      UJ.emtiles.configured = () => true;
      UJ.emtiles.drawSection = async (cv, o) => {
        const g = cv.getContext("2d");
        g.fillStyle = "#444"; g.fillRect(0, 0, cv.width, cv.height);
        const k = 8;
        const x0 = o.centre[0] - (cv.width >> 1) * k, y0 = o.centre[1] - (cv.height >> 1) * k;
        return { mip: 2, mips: 3, nmPerPx: 32, z: o.centre[2], w: cv.width, h: cv.height, chunks: 1,
                 toolAt: (px, py) => [Math.round(x0 + px * k), Math.round(y0 + py * k), o.centre[2]],
                 pxAt: (t) => [Math.round((t[0] - x0) / k), Math.round((t[1] - y0) / k)],
                 pxPerToolVoxel: 1 / k };
      };
    };
    const drew = await p.evaluate(async ({ src }) => {
      eval("(" + src + ")()");
      try { localStorage.removeItem("ujump_tracing_drafts_v2");
          localStorage.removeItem("ujump_tracing_drafts_v2");
      localStorage.removeItem("ujump_tracing_draft_v1"); } catch (e) {}
      document.getElementById("tracingPanel").open = true;
      ["tracingX", "tracingY", "tracingZ"].forEach((id, i) => {
        document.getElementById(id).value = [240640, 207872, 33000][i];
      });
      /* A CLEAN PAD FOR EACH STORY.  2026-09-19. Opening the pad at a new coordinate no longer
         replaces what is on it — it carries the contours over and starts the next number, which is
         what a person tracing several organelles in one sitting wants and is why three lysosomes
         were lost before it did (src/a_save_never_takes_work_away.py). This file, though, is one
         page telling a dozen separate stories, and each of them assumes it begins with an empty
         pad. A person gets that by committing or by opening the page; here it is said out loud. */
      if (typeof PAD !== "undefined" && PAD){ PAD.rings = []; PAD.pending = []; PAD.inst = 0; }
      if (typeof TRACING_PENDING !== "undefined") TRACING_PENDING = null;
      document.getElementById("tracePadOpen").click();
      await new Promise(r => setTimeout(r, 250));
      const ring = (pts) => {
        pts.forEach(q => { const t = PAD_VIEW.toolAt(q[0], q[1]);
                           UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel); });
        UJ.tracepad.closeRing(PAD);
      };
      /* His screenshot exactly: two contours, same section, different structures. */
      ring([[100,100],[200,100],[200,200]]);
      document.getElementById("tracePadNewInst").click();
      await new Promise(r => setTimeout(r, 60));
      ring([[300,300],[380,300],[380,380]]);
      padRings();
      await new Promise(r => setTimeout(r, 1600));      // the autosave, not the button
      const raw = draftRead();
      return { insts: PAD.rings.map(r => r.inst || 0),
               saved: raw && raw.rings.map(r => r.inst),
               savedInst: raw && raw.inst,
               colours: [padInstColour(0), padInstColour(1)] };
    }, { src: stub.toString() });
    ok(drew.insts.join(",") === "0,1",
       "two contours drawn, one per structure", drew.insts.join(","));
    ok(drew.saved && drew.saved.join(",") === "0,1",
       "THE DRAFT CARRIES WHICH STRUCTURE EACH CONTOUR IS — the bug, in one field",
       JSON.stringify(drew.saved));
    ok(drew.savedInst === 1, "...and which one was being drawn", drew.savedInst);
    ok(drew.colours[0] !== drew.colours[1],
       "the two structures have different colours to begin with", drew.colours.join(" / "));

    await p.reload();
    await p.waitForFunction(() => {
      var b = document.getElementById("tracingDraftBar");
      return !!(b && b.style.display !== "none" && /Unfinished/.test(b.textContent));
    }, { timeout: 30000 }).catch(() => {});
    const back = await p.evaluate(async ({ src }) => {
      eval("(" + src + ")()");
      document.getElementById("tracingPanel").open = true;
      /* One Resume per row now; this story keeps exactly one draft, so the first is it. */
      document.querySelector(".draftres").click();
      await new Promise(r => setTimeout(r, 500));
      const chips = [].slice.call(document.querySelectorAll("#tracePadInsts .padinst"));
      const secChips = [].slice.call(document.querySelectorAll("#tracePadRings .padring"));
      return { insts: PAD.rings.map(r => r.inst || 0),
               instances: UJ.tracepad.instances(PAD).map(i => i.inst + ":" + i.contours),
               chipText: chips.map(c => c.textContent.replace(/\s+/g, " ").trim()),
               chipSwatch: chips.map(c => (c.querySelector("span") || {}).style
                 ? c.querySelector("span").style.background : ""),
               secText: secChips.map(c => c.textContent.replace(/\s+/g, " ").trim()),
               secSwatch: secChips.map(c => c.querySelector("span").style.background),
               cur: PAD.inst };
    }, { src: stub.toString() });
    ok(back.insts.join(",") === "0,1",
       "resumed, each contour is still its own structure's", back.insts.join(","));
    ok(back.instances.join(" ") === "0:1 1:1",
       "...so neither structure is empty", back.instances.join(" "));
    ok(!back.chipText.some(t => /empty/.test(t)),
       "...and the strip says so — this is the sentence he read", back.chipText.join(" | "));
    ok(back.secSwatch.length === 2 && back.secSwatch[0] !== back.secSwatch[1],
       "the two contours on the section are drawn in their OWN colours, not both in the first's",
       back.secSwatch.join(" / "));
    ok(back.secText.join(" | ").indexOf("#1") >= 0 && back.secText.join(" | ").indexOf("#2") >= 0,
       "...and each chip says which structure it is, so its number cannot be read as a position",
       back.secText.join(" | "));
    ok(back.cur === 1, "...and the pad is back on the one that was being drawn", back.cur);
  }


  /* ── THE CONTOURS, BACK IN A VIEWER, AND BACK AGAIN ──────────────────────────────  2026-09-17
     Søren: *"We need a way to look at the segmentations in Neuroglancer also."*

     The assertion that matters is the ROUND TRIP. A button that opens a viewer is easy to write and
     easy to get subtly wrong — a coordinate order swapped, a loop left open, two structures in one
     layer — and every one of those mistakes looks like a picture. Reading the link back through
     core/tracing.js, the same parser a person's pasted link goes through, is the only check that
     the picture is of the right thing. */
  console.log("\nthe contours, back in a viewer");
  {
    const trip = await p.evaluate(async () => {
      const opened = [];
      const realOpen = window.open;
      window.open = (u) => { const w = { location: { href: u || "" }, opener: 1 }; opened.push(w); return w; };
      const structs = [
        { name: "Mitochondrion 1", color: "#40e28c", rings: [
          { z: 700, points: [[1000,2000],[1200,2000],[1200,2200],[1000,2200]] },
          { z: 705, points: [[1010,2010],[1190,2010],[1190,2190],[1010,2190]] } ] },
        { name: "Nucleus", color: "#3a72d8", rings: [
          { z: 700, points: [[3000,4000],[3200,4000],[3100,4200]] } ] }
      ];
      tracingViewerOpen(structs, null, { root: "864691135499287571", nuc: "264317" });
      { const t0 = Date.now();   /* the viewer may open its tab first and address it later (2026-09-21) */
        while (Date.now() - t0 < 7000 && !(opened[0] && opened[0].location.href)) await new Promise(r => setTimeout(r, 100)); }
      window.open = realOpen;
      if (!opened.length) return { err: "nothing opened" };
      const url = opened[0].location.href;
      const st = JSON.parse(decodeURIComponent(url.split("#!")[1]));
      const anns = (st.layers || []).filter(l => l.type === "annotation" && l.annotations);
      /* Read it back the way a pasted link is read. */
      const back = anns.map(l => {
        const one = { layers: [l] };
        const r = UJ.tracing.ringsFromLink("https://x/#!" + encodeURIComponent(JSON.stringify(one)));
        return { name: l.name, colour: l.annotationColor,
                 ok: r.ok, rings: (r.rings || []).length,
                 pts: (r.rings || []).map(x => x.points.length).join(","),
                 zs: (r.rings || []).map(x => x.z).join(",") };
      });
      const segs = (st.layers || []).filter(l => l.type === "segmentation");
      const nucL = segs.filter(l => /nucle/i.test((l.name || "") + " " + (l.source || "")))[0];
      const cellL = segs.filter(l => l !== nucL)[0];
      return { url: url.slice(0, 40), layers: anns.map(l => l.name), back: back,
               colours: anns.map(l => l.annotationColor),
               types: anns.map(l => (l.annotations[0] || {}).type),
               pos: st.position && st.position.map(Math.round),
               selected: st.selectedLayer && st.selectedLayer.layer,
               layout: st.layout && (st.layout.type || st.layout),
               cell: cellL && { segs: cellL.segments, alpha: cellL.objectAlpha },
               nuc: nucL && { segs: nucL.segments, alpha: nucL.objectAlpha,
                              col: nucL.segmentColors && nucL.segmentColors["264317"] },
               say: document.getElementById("tracingStatus").textContent };
    });
    ok(!trip.err, "the button builds a viewer link", trip.err || trip.url + "…");
    ok(trip.layers.length === 2 && trip.layers[0] === "Mitochondrion 1" && trip.layers[1] === "Nucleus",
       "ONE ANNOTATION LAYER PER STRUCTURE, named for it", trip.layers.join(" | "));
    ok(trip.colours.join(",").toLowerCase() === "#40e28c,#3a72d8",
       "...each in the colour it was drawn in", trip.colours.join(" / "));
    ok(trip.types.every(t => t === "line"),
       "...as line annotations, which every viewer can draw", trip.types.join(","));
    ok(trip.back.every(b => b.ok), "the link reads back through the same parser a paste goes through",
       trip.back.map(b => b.ok).join(","));
    ok(trip.back[0].rings === 2 && trip.back[0].pts === "4,4",
       "...with the first structure's two contours intact, four vertices each",
       trip.back[0].rings + " rings, " + trip.back[0].pts + " points");
    ok(trip.back[0].zs === "700,705",
       "...on the sections they were drawn on", trip.back[0].zs);
    ok(trip.back[1].rings === 1 && trip.back[1].pts === "3",
       "...and the second structure is its own, not chained onto the first",
       trip.back[1].rings + " ring, " + trip.back[1].pts + " points");
    ok(trip.pos && trip.pos[2] === 700 && Math.abs(trip.pos[0] - 1800) < 900,
       "the viewer lands in the middle of what it is showing, not on a stale box",
       JSON.stringify(trip.pos));
    ok(trip.selected === "Mitochondrion 1", "...with a structure's layer selected", trip.selected);

    /* ── THE NEURON AND ITS NUCLEUS ────────────────────────────────────────────  2026-09-17
       Søren: *"I would like that the neuron and its nucleus are showing in the 3D window when
       opening in Neuroglancer."* buildState() selects segments from CUR_ROOT/CUR_NUCID — the cell
       on the PANEL, which need not be the cell this tracing belongs to — so the tracing's own ids
       have to win, and the layers have to be added when the state has none. */
    ok(/3d/.test(String(trip.layout)), "the link opens with a 3D pane to show them in", trip.layout);
    ok(trip.cell && trip.cell.segs && trip.cell.segs[0] === "864691135499287571",
       "THE CELL is selected in the segmentation layer, from the tracing's own root ID",
       trip.cell && JSON.stringify(trip.cell.segs));
    ok(trip.cell && trip.cell.alpha > 0 && trip.cell.alpha < 1,
       "...see-through, because the contours are inside it", trip.cell && trip.cell.alpha);
    ok(trip.nuc && trip.nuc.segs && trip.nuc.segs[0] === "264317",
       "ITS NUCLEUS is selected in the nuclei layer", trip.nuc && JSON.stringify(trip.nuc.segs));
    ok(trip.nuc && String(trip.nuc.col).toLowerCase() === "#3a72d8",
       "...in blue, here as in the Blender export and the pad's own 3D window", trip.nuc && trip.nuc.col);
    ok(/3D pane/.test(trip.say), "...and the card says so", trip.say.slice(-90));
  }

  console.log("...and a tracing with no cell on it says so rather than showing somebody else's");
  {
    const bare = await p.evaluate(async () => {
      /* The globals buildState() reads are set to a REAL cell, which is the trap: without the
         clear, the viewer would come back showing that cell around contours it has nothing to do
         with, and it would look completely convincing. */
      window.CUR_ROOT = "864691136084075884"; window.CUR_NUCID = "582301";
      const opened = []; const realOpen = window.open;
      window.open = (u) => { const w = { location: { href: u || "" }, opener: 1 }; opened.push(w); return w; };
      tracingViewerOpen([{ name: "Loose contour", color: "#40e28c",
                           rings: [{ z: 5, points: [[0,0],[10,0],[10,10]] }] }], null, {});
      { const t0 = Date.now();   /* the viewer may open its tab first and address it later (2026-09-21) */
        while (Date.now() - t0 < 7000 && !(opened[0] && opened[0].location.href)) await new Promise(r => setTimeout(r, 100)); }
      window.open = realOpen;
      const st = JSON.parse(decodeURIComponent(opened[0].location.href.split("#!")[1]));
      return { segs: (st.layers || []).filter(l => l.type === "segmentation")
                       .map(l => JSON.stringify(l.segments || null)),
               say: document.getElementById("tracingStatus").textContent };
    });
    ok(bare.segs.every(x => x === "null"),
       "no root or nucleus ID means no cell selected, not the one that happened to be on screen",
       bare.segs.join(" | ") || "(no segmentation layers)");
    ok(/No cell or nucleus ID/.test(bare.say), "...and it says why the 3D pane is empty",
       bare.say.slice(-80));
  }

  console.log("...and two structures of the same name still get a layer each");
  {
    const same = await p.evaluate(async () => {
      const opened = []; const realOpen = window.open;
      window.open = (u) => { const w = { location: { href: u || "" }, opener: 1 }; opened.push(w); return w; };
      tracingViewerOpen([
        { name: "Mitochondrion", color: "#40e28c",
          rings: [{ z: 1, points: [[0,0],[10,0],[10,10]] }] },
        { name: "Mitochondrion", color: "#bfdd78",
          rings: [{ z: 1, points: [[50,0],[60,0],[60,10]] }] }
      ]);
      { const t0 = Date.now();   /* the viewer may open its tab first and address it later (2026-09-21) */
        while (Date.now() - t0 < 7000 && !(opened[0] && opened[0].location.href)) await new Promise(r => setTimeout(r, 100)); }
      window.open = realOpen;
      const st = JSON.parse(decodeURIComponent(opened[0].location.href.split("#!")[1]));
      return (st.layers || []).filter(l => l.annotations).map(l => l.name);
    });
    ok(same.length === 2 && same[0] !== same[1],
       "Neuroglancer keys layers by name, so the second gets its number", same.join(" | "));
  }

  /* ── THE ORGANELLES SECTION: WHERE IT IS AND WHAT SHAPE IT IS, TOGETHER ──────────  2026-09-18
     Søren: *"I would like that the organelles are featured in the cell identity as an expandable
     section where the annotations are coupled with the segmentations where the annotation
     coordinate is within the 3D volume of the segmentation."*

     organellelinkcheck.js owns the geometry. This owns the panel: that the two fetches meet, that
     the contours are fetched on opening and not before, and that each of the three kinds of row
     says the right thing. */
  console.log("\nthe organelles section on the cell panel");
  {
    const box = (cx, cy, s, z) => ({ z, points: [[cx-s, cy-s], [cx+s, cy-s], [cx+s, cy+s], [cx-s, cy+s]] });
    const sect = await p.evaluate(async ({ ringsA }) => {
      document.body.insertAdjacentHTML("beforeend", '<div id="commReports"></div>');
      const asked = [];
      window.fetch = async (u) => {
        const s = String(u); asked.push(s);
        if (/structureId=/.test(s))
          return { ok: true, json: async () => ({ tracings: [{ structureId: "m1",
            rows: ringsA.map((r, i) => ({ structureId: "m1", name: "Mitochondrion 1",
              kind: "mitochondrion", nucleusId: "253863", z: r.z, ringIndex: i,
              points: r.points.map(p => p.join(",")).join(";") })) }] }) };
        if (/tracings=1/.test(s)) return { ok: true, json: async () => ({ tracings: [
          { structureId: "m1", name: "Mitochondrion 1", instanceOf: "mitochondrion",
            nucleusId: "253863", contours: 2, sections: 2, volumeUm3: 0.21, color: "#40e28c",
            contributors: ["Søren Grubb"] },
          { structureId: "c1", name: "Whole cell", instanceOf: "cell", nucleusId: "253863",
            contours: 4, sections: 4, volumeUm3: 900, color: "#888888" } ] }) };
        return { ok: true, json: async () => ({}) };
      };
      PANEL_TRACINGS = null; PANEL_TRACINGS_AT = 0; PANEL_ORGAN_RINGS = {};
      window.__organOpen = false;
      /* The annotations arrive with the community reports; two inside the outline and one nowhere
         near it, which is the whole question. */
      PANEL_ORGAN_ANNS = [
        { kind: "mitochondrion", pointA: "1000,2000,100", by: "Søren Grubb" },
        { kind: "mitochondrion", pointA: "1010,2010,105", by: "Somebody Else" },
        { kind: "lysosome", pointA: "9000,9000,100", by: "Somebody Else" }
      ];
      PANEL_ORGAN_NID = "253863";
      loadTracedStructures("253863", "");
      await new Promise(r => setTimeout(r, 120));
      const host = document.getElementById("cellOrganelles");
      const before = { html: host ? host.innerHTML : "", asked: asked.slice(),
                       traced: (document.getElementById("tracedOnCell") || {}).textContent || "" };
      /* Opening it is what fetches the contours. */
      const det = document.getElementById("cellOrganDetails");
      det.open = true; det.dispatchEvent(new Event("toggle"));
      await new Promise(r => setTimeout(r, 250));
      return { before,
               summary: document.querySelector("#cellOrganDetails summary").textContent,
               text: host.textContent.replace(/\s+/g, " "),
               rows: host.querySelectorAll(".organrow").length,
               traceBtns: host.querySelectorAll(".organtrace").length,
               asked: asked.filter(a => /structureId=/.test(a)).length };
    }, { ringsA: [box(1000, 2000, 100, 100), box(1000, 2000, 100, 105)] });

    ok(!/structureId=/.test(sect.before.asked.join(" ")),
       "closed, it costs no Drive read — the index alone draws the list",
       sect.before.asked.length + " call(s), none for contours");
    ok(/Organelles/.test(sect.before.html), "...and the section is there, collapsed");
    ok(sect.asked === 1,
       "opening it reads the contours of this cell's organelles, and only the organelles",
       sect.asked + " (the whole-cell tracing is not one)");
    ok(!/Mitochondrion 1/.test(sect.before.traced),
       "an organelle is no longer listed twice — it has left the “Traced on this cell” block",
       JSON.stringify(sect.before.traced.slice(0, 40)));
    ok(/Whole cell/.test(sect.before.traced),
       "...while the cell itself stays there, because it is the cell, not something inside it");
    ok(/1 outlined, 3 logged, 1 paired/.test(sect.summary),
       "the summary counts what is in it — organelles only, the cell is not one", sect.summary);
    ok(/the traced centre replaces 2 logged point/.test(sect.text),
       "THE OUTLINE'S CENTRE REPLACES THE POINTS INSIDE IT — his rule, on screen",
       (sect.text.match(/the traced centre replaces[^\u2014]*/) || [""])[0].slice(0, 80));
    ok(/Søren Grubb/.test(sect.text) && /Somebody Else/.test(sect.text),
       "...with both of them still named, because an observation is not ours to erase");
    ok(/centre \(1000, 2000, 10[23]\)/.test(sect.text),
       "...and the coordinate it gives instead is the outline's own centre",
       (sect.text.match(/centre \([^)]*\)/) || [""])[0]);
    ok(/Lysosome/.test(sect.text) && /logged, not outlined/.test(sect.text),
       "an annotation with no outline is listed as that");
    ok(sect.traceBtns === 1, "...with the offer to draw one", sect.traceBtns + " button");
    ok(sect.rows === 2, "every annotation and every outline, exactly once", sect.rows + " rows");
  }

  console.log("...and “Segment it” opens the pad on that organelle");
  {
    const opened = await p.evaluate(async () => {
      const btn = document.querySelector("#cellOrganelles .organtrace");
      window.CUR_NUCID = "253863"; window.CUR_ROOT = "864691135570733037";
      btn.click();
      await new Promise(r => setTimeout(r, 300));
      return { x: document.getElementById("tracingX").value,
               y: document.getElementById("tracingY").value,
               z: document.getElementById("tracingZ").value,
               what: document.getElementById("tracingWhat").value,
               nuc: document.getElementById("tracingNucId").value,
               open: document.getElementById("tracingPanel").open,
               say: document.getElementById("tracingStatus").textContent };
    });
    ok(opened.open && opened.x === "9000" && opened.y === "9000" && opened.z === "100",
       "the pad opens AT the annotation, not near it",
       [opened.x, opened.y, opened.z].join(", "));
    ok(opened.what === "lysosome",
       "...with the organelle it is already known to be", opened.what);
    ok(opened.nuc === "253863",
       "...and filed against the same cell, or pairing it back would be a coincidence", opened.nuc);
    ok(/centre becomes/.test(opened.say), "...and says what the outline will be worth",
       opened.say.slice(-70));
  }

  /* ── AN OUTLINE REGISTERS ITS OWN CENTRE ─────────────────────────────────────────  2026-09-18
     Søren: *"When drawing a segmentation of an organelle that does not have an annotation, the
     volumetric center of the segmentation should be registered as an annotation."* — silently, and
     *"more precise than the manually annotated, so it should replace it."*

     Driven through the REAL tracingPublish, because the thing that can be wrong is not the
     arithmetic (organellelinkcheck.js owns that) but WHEN it fires: after the outline and not
     before, once and not twice, for an organelle and not for the cell. */
  console.log("\nan outline registers its own centre");
  {
    const reg = await p.evaluate(async () => {
      const posts = [], quiet = [];
      window.postReport = (x) => { posts.push(x); return true; };
      window.noteSaveResult = (x) => { quiet.push(x); return Promise.resolve(); };
      /* BARE ASSIGNMENTS, not window.X. These are top-level `let`s in the page script, so they live
         in the global LEXICAL environment and are not properties of window -- setting the property
         makes a second variable that `typeof GOOGLE_VERIFIED !== "undefined" && GOOGLE_VERIFIED`
         never reads. The same trap that made rootidbackcheck report an empty CUR_EXTRA_ROOTS while
         the count said two. */
      try { GOOGLE_VERIFIED = true; } catch (e) { window.GOOGLE_VERIFIED = true; }
      try { GOOGLE_CREDENTIAL = "test"; } catch (e) { window.GOOGLE_CREDENTIAL = "test"; }
      try { REPORTER_NAME = "Søren Grubb"; } catch (e) { window.REPORTER_NAME = "Søren Grubb"; }
      const box = (cx, cy, s, z) => ({ z, points: [[cx-s,cy-s],[cx+s,cy-s],[cx+s,cy+s],[cx-s,cy+s]] });
      const mito = { id: "m1", name: "Mitochondrion 1", kind: "mitochondrion", type: "Astrocyte",
                     color: "#40e28c", nucleus_id: "253863", root_id: "8646911355",
                     volume_um3: 0.21,
                     rings: [box(1000, 2000, 100, 100), box(1000, 2000, 100, 110)] };
      const cell = { id: "c1", name: "Whole cell", kind: "cell", type: "Astrocyte",
                     color: "#888888", nucleus_id: "253863", root_id: "8646911355",
                     rings: [box(0, 0, 900, 100), box(0, 0, 900, 110)] };
      const orphan = { id: "o1", name: "Lysosome 1", kind: "lysosome", type: "Astrocyte",
                       color: "#9740e2", nucleus_id: "", root_id: "",
                       rings: [box(5000, 5000, 50, 40), box(5000, 5000, 50, 45)] };
      tracingPublish(mito); tracingPublish(cell); tracingPublish(orphan);
      /* A queued tracing that goes out later must register its centre then, and only then. */
      const again = { id: "m1", name: "Mitochondrion 1", kind: "mitochondrion", type: "Astrocyte",
                      color: "#40e28c", nucleus_id: "253863", root_id: "8646911355",
                      volume_um3: 0.21, centre_registered: true,
                      rings: [box(1000, 2000, 100, 100), box(1000, 2000, 100, 110)] };
      tracingPublish(again);
      return { traced: posts.length, quiet: quiet.slice(),
               kinds: posts.map(x => x.kind), reg: mito.centre_registered };
    });
    ok(reg.traced === 4, "four outlines went into the dataset", reg.traced);
    ok(reg.quiet.length === 1,
       "ONE centre registered — for the organelle, not the cell, and not twice for the same outline",
       reg.quiet.length + " of 4");
    const a = reg.quiet[0] || {};
    ok(a.type === "organelle_location",
       "...as an ordinary annotation, so everything that reads annotations sees it", a.type);
    ok(a.pointA === "1000,2000,105",
       "...at the outline's own volumetric centre", a.pointA);
    ok(a.kind === "mitochondrion" && a.nucleusId === "253863",
       "...of the right organelle, on the right cell", a.kind + " / " + a.nucleusId);
    ok(a.source === "segmentation" && a.fromStructureId === "m1",
       "...saying where it came from, in columns", a.source + " / " + a.fromStructureId);
    ok(/Volumetric centre/.test(a.comment) && /rather than placed by hand/.test(a.comment),
       "...and in words, so the row explains itself in the sheet", a.comment.slice(0, 70));
    ok(a.reporterName === "Søren Grubb",
       "...attributed to whoever drew it", a.reporterName);
    ok(reg.reg === true, "the tracing remembers that its centre went, so a reshare adds no second");
    /* SILENTLY. postReport toasts on success; noteSaveResult does not, and says what the server
       said when it refuses. Three organelles in one press must not be three toasts. */
    ok(!reg.quiet.some(x => x === undefined) && reg.quiet.length === 1,
       "and it went the silent way — no toast of its own beside the tracing's");
  }

  console.log("...and a centroid that lands off its own object says so");
  {
    const off = await p.evaluate(async () => {
      const quiet = [];
      window.postReport = () => true;
      window.noteSaveResult = (x) => { quiet.push(x); return Promise.resolve(); };
      const box = (cx, cy, s, z) => ({ z, points: [[cx-s,cy-s],[cx+s,cy-s],[cx+s,cy+s],[cx-s,cy+s]] });
      /* A C-shape: the middle section displaced far to one side, so the centroid falls in the gap. */
      tracingPublish({ id: "c2", name: "Nucleoplasmic reticulum 1", kind: "nucleoplasmic_reticulum",
                       type: "Astrocyte", nucleus_id: "253863", root_id: "",
                       rings: [box(0, 0, 50, 0), box(2000, 0, 50, 10), box(0, 0, 50, 20)] });
      return quiet[0] || {};
    });
    ok(/centroid lies outside the outline/.test(off.comment || ""),
       "it marks where the organelle is, and says it is not a point ON it",
       (off.comment || "").slice(-90));
  }

  const newErrors = errors.filter(e => !/atob/.test(e));
  console.log("\nthe drawing viewer is not the viewing viewer");
  {
    /* Søren, 2026-09-18: "If it is armed, why does it still produce single point annotations when
       I try?" — with a screenshot of ngl.microns-explorer.org and a state full of loose points. It
       WAS armed; he was in the wrong viewer, because this button was reading the Jump tab's viewer
       picker. That picker answers "which viewer do I want to VIEW a cell in", and its first option
       is the MICrONS viewer for its Share button. Drawing needs a polyline, which only Spelunker
       has, so the two questions are now answered separately. */
    const armed = await p.evaluate(async (viewers) => {
      const out = {};
      const sel = document.getElementById("viewer");
      const realOpen = window.open;
      for (const v of viewers){
        sel.value = v;
        let url = null;
        window.open = u => { url = u; return null; };
        document.getElementById("tracingOpen").click();
        await new Promise(r => setTimeout(r, 120));
        window.open = realOpen;
        if (!url){ out[v] = { none: true }; continue; }
        const st = JSON.parse(decodeURIComponent(url.split("#!")[1]));
        const tl = (st.layers || []).find(l => l && l.name === "tracing");
        out[v] = { host: url.split("#!")[0], tool: tl && tl.tool, tab: tl && tl.tab,
                   selected: st.selectedLayer && st.selectedLayer.layer,
                   say: (document.getElementById("tracingStatus") || {}).textContent || "" };
      }
      return out;
    }, ["https://ngl.microns-explorer.org/", "https://spelunker.cave-explorer.org/",
        "https://neuroglancer-demo.appspot.com/"]);

    const hosts = Object.keys(armed);
    ok(hosts.every(v => /spelunker|cave-explorer/.test(armed[v].host)),
       "whatever viewer is picked for VIEWING, tracing opens Spelunker",
       hosts.map(v => v.replace(/https?:\/\//, "").split("/")[0] + " -> "
                    + armed[v].host.replace(/https?:\/\//, "").split("/")[0]).join(", "));
    ok(hosts.every(v => armed[v].tool === "annotatePolyline"),
       "...with the POLYLINE tool armed — no viewer has a button for it",
       armed[hosts[0]].tool);
    ok(hosts.every(v => armed[v].selected === "tracing" && armed[v].tab === "annotations"),
       "...on the tracing layer, with its annotations tab open");
    /* THE REASON, IN THE PAGE. Silently ignoring his viewer choice would be its own puzzle; the
       toast says which viewer opened and why it is not the one he picked. */
    const say = armed[hosts[0]].say;
    ok(/Spelunker opened/.test(say) && /only one with a polyline/.test(say),
       "...and the page says which viewer it opened, and why not the picked one",
       say.slice(0, 64));
    ok(/close the ring/.test(say), "...including how to close a contour", "close the ring");

    /* AND NOWHERE ELSE. Søren, closing the loop on this: "if you need to use the Spelunker to use
       the poly line, then open the viewer in Spelunker in the segmentation panel only for the
       polyline annotation tool to work for segmentations." Spelunker is the DRAWING viewer, not a
       new default — every other link this page writes, including opening a tracing that already
       exists, still goes to whatever he picked. That boundary is one line of code and would be
       trivially widened by accident, so it is asserted from both sides. */
    const viewing = await p.evaluate(async () => {
      document.getElementById("viewer").value = "https://ngl.microns-explorer.org/";
      let url = null;
      const realOpen = window.open;
      window.open = u => { url = u; return null; };
      tracingViewerOpen([{ name: "Whole cell", color: "#40e28c",
                           rings: [{ z: 100, points: [[9000,9000],[9100,9000],[9100,9100]] }] }],
                        null, { nuc: "", root: "" });
      await new Promise(r => setTimeout(r, 200));
      window.open = realOpen;
      return { host: url ? url.split("#!")[0] : "(nothing opened)" };
    });
    ok(/ngl\.microns-explorer\.org/.test(viewing.host),
       "...while OPENING a tracing that already exists still goes to the picked viewer",
       viewing.host);
  }


  ok(newErrors.length === 0, "the page still loads with no new errors",
     newErrors.join(" | ") || "none");

  await b.close();
  
console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
