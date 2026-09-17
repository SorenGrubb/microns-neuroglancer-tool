"""A polygon tool, because no viewer has one.                                         2026-09-17

Søren, twice: *"I don't see the polygon tool."* — then *"A polygon tool is much easier for the
user. Can you try to implement it?"*

He is right that it is easier, and measurement has now closed off every way of borrowing one: the
MICrONS viewer has point / bounding box / line / ellipsoid and nothing else, Spelunker's polyline
draws on screen and never enters the state, BrainSharer's real one needs an account and ignores a
pasted link. So the only honest answer is to draw the section in µJump and put the tool on it.

WHICH TURNS OUT TO BE REACHABLE, because of what the EM source is. Read live today: `encoding:
"raw"`, uint8, one channel, sharded `neuroglancer_uint64_sharded_v1` — the same sharding
core/segread.js has read since it was written, and a raw chunk IS the voxel data. So core/emtiles.js
fetches nothing of its own; it asks segread for chunk buffers and blits them. Two new exports here
(`_getInfo`, `_chunkBuf`) are the whole of the change to that file. Duplicating its Morton codes and
delta-encoded minishard offsets to read a different volume from the same bucket would have been the
worst kind of copy.

Measured cold, on the live bucket: 1.7 s for one 128x128x32 chunk at 16 nm. A chunk holds 32
sections at mip 0/1 and 64 at mip 2, so the second section of a tracing is free and so is every
section after it in the same block. The pad defaults to 32 nm, whose chunk is half the bytes and
covers twice the z; outlining a soma does not need 16.

WHAT THE PAD IS. A canvas in the Trace a cell card. Click to drop a vertex, drag to pan, `,`/`.`
to step a section, close the ring, repeat. The state machine is core/tracepad.js and holds no DOM,
so tracepadcheck.js drives the real thing.

THE FIRST VERTEX IS MARKED, which is the other half of what he asked for: *"when you click the
first coordinate it should mark it so pasting is easy."* It is drawn as an open ring rather than a
dot, it lights up when the pointer is near it, and clicking it is what closes the contour — so the
thing you must come back to is visible from the first click rather than guessed at.

AND THE COORDINATE BOXES SELECT ON CLICK, which is the reading of that sentence about the x/y/z
fields: they come pre-filled from the cell on screen, so pasting `x, y, z` over them meant clearing
them first. Clicking one now selects it and a paste replaces it.

Run: python3 src/a_polygon_tool_of_our_own.py
     node tracepadcheck.js && node emtilescheck.js && node tracingpanelcheck.js


SUPERSEDED PAIRS REMOVED, 2026-09-17: the edits below marked here were later rewritten by another
generator, which now owns that text. The reason they were made is still this file's; the
literal is the other file's, so re-running this one is a no-op rather than a second insert.
Superseded: "clicking a coordinate box selects it"
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SEGREAD = [
]


PADCHECK = [
    ('''  console.log("\\nreading a pasted outline");''',
     '''  console.log("\\nthe polygon tool, clicked");
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
    ok(/^\\d+,\\d+$/.test(three.first),
       "...stored as a TOOL voxel, so panning and zooming cannot move it", three.first);

    /* Back on the first vertex: the click that closes. Two pixels off, because nobody lands on it. */
    await click(122, 118);
    const closed = await p.evaluate(() => ({ pending: PAD.pending.length, rings: PAD.rings.length,
                                             z: PAD.rings[0] && PAD.rings[0].z,
                                             n: PAD.rings[0] && PAD.rings[0].points.length,
                                             say: document.getElementById("tracePadSay").innerText }));
    ok(closed.rings === 1 && closed.pending === 0,
       "clicking the first vertex again CLOSES the contour \\u2014 the gesture the card tells him about",
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
       "\\u201cUse these contours\\u201d hands them to the same place a pasted link does", used.zs);
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

  console.log("\\nreading a pasted outline");''',
     "the pad is clicked in a real page"),
]

HTML = [
    ('''<div class="row" style="gap:8px;margin-top:8px">
<button class="idbtn" id="tracingOpen" style="flex:1 1 auto" title="Opens the viewer chosen at the top of the Jump tab, at the coordinate in the boxes above, with an empty annotation layer called &quot;tracing&quot; already selected and the line tool already active.">Open a viewer to trace in</button>
</div>''',
     '''<div class="row" style="gap:8px;margin-top:8px">
<button class="idbtn" id="tracePadOpen" style="flex:1 1 auto" title="Draws the EM section here and gives you a real polygon tool: click each vertex, click the first one again to close. No viewer a link can reach has one.">Trace it here &mdash; polygon tool</button>
<button class="idbtn" id="tracingOpen" style="flex:1 1 auto" title="Opens the viewer chosen at the top of the Jump tab, at the coordinate in the boxes above, with an empty annotation layer called &quot;tracing&quot; already selected and the point tool already active.">Open a viewer instead</button>
</div>
<div id="tracePadWrap" style="display:none;margin-top:10px">
<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
<select id="tracePadMip" style="flex:0 0 auto" title="How much of the section is on the pad. Above 8 nm the number is the data&rsquo;s own resolution; below it the 8 nm voxels are simply drawn larger, which is what putting vertices on a 500 nm organelle needs. Only levels that keep 40 nm sections are used &mdash; coarser ones average several sections into one, and a tracing is section by section. The widest view is also the slowest to load: its chunks are half as wide, so it costs about three times as many (measured 2026-09-17).">
<option value="2:1">18 &micro;m across &mdash; 32 nm data, slower to load</option>
<option value="1:1" selected>9 &micro;m &mdash; 16 nm data, a whole cell</option>
<option value="0:1">4.5 &micro;m &mdash; 8 nm data, full detail</option>
<option value="0:2">2.2 &micro;m &mdash; 8 nm data, drawn 2&times;</option>
<option value="0:4">1.1 &micro;m &mdash; 8 nm data, drawn 4&times;</option>
<option value="0:8">0.6 &micro;m &mdash; 8 nm data, drawn 8&times; (an organelle)</option>
</select>
<button class="idbtn" id="tracePadPrev" style="flex:0 0 auto" title="Back one step (, key)">&#9664;</button>
<span class="hint" id="tracePadZ" style="flex:0 0 auto;min-width:130px;text-align:center">&nbsp;</span>
<button class="idbtn" id="tracePadNext" style="flex:0 0 auto" title="On one step (. key)">&#9654;</button>
<div class="coord" style="flex:0 0 84px" title="How many sections a step moves. Every fifth section is about half a percent off the real volume."><input type="text" id="tracePadStep" inputmode="numeric" value="5"></div>
<button class="idbtn" id="tracePadUndo" style="flex:0 0 auto" title="Takes back the last vertex, or the last closed contour if you have not started one">Undo</button>
</div>
<div style="position:relative;margin-top:8px;overflow:auto;border:1px solid var(--line);border-radius:7px;background:#111">
<canvas id="tracePad" width="560" height="460" style="display:block;cursor:crosshair;touch-action:none"></canvas>
</div>
<div id="tracePadRings" style="margin-top:6px"></div>
<p class="hint" id="tracePadSay" style="margin-top:6px">Click each vertex round the cell. The first one is drawn as a ring &mdash; click it again to close the contour. <b>Shift+click</b> moves the field there, shift+drag or a plain drag pans it, and <b>,</b> and <b>.</b> step a section.<br>
Afterwards: <b>drag a point</b> to move it, <b>right-click a point</b> to delete it, <b>right-click or double-click a line</b> to put a new point in the middle of it.</p>
<div class="row" style="gap:8px;margin-top:6px">
<button class="idbtn" id="tracePadUse" style="flex:1 1 auto">Use these contours</button>
<button class="idbtn" id="tracePadClose" style="flex:0 0 auto">Close the pad</button>
</div>
</div>''',
     "the card carries a tracing pad"),
]

JS = [
    ('''(function wireTracing(){''',
     '''/* ── THE PAD ─────────────────────────────────────────────────────────────────────  2026-09-17
   Søren: "A polygon tool is much easier for the user. Can you try to implement it?" There is none
   to borrow -- see src/a_polygon_tool_of_our_own.py for what was measured -- so the section is
   drawn here and the tool put on it. core/tracepad.js holds the state and knows nothing about the
   DOM; this half draws, and turns a click into a tool voxel through the view core/emtiles.js
   returns. Vertices are stored in TOOL voxels, so changing the zoom or panning never moves one. */
var PAD = null, PAD_VIEW = null, PAD_BUSY = false, PAD_HOVER = null, PAD_CENTRE = null;

function padSay(msg, bad){
  const el = document.getElementById("tracePadSay");
  if (el){ el.textContent = msg; el.style.color = bad ? "var(--bad)" : ""; }
}

async function padDraw(){
  if (!PAD_CENTRE) return;
  const cv = document.getElementById("tracePad");
  if (PAD_BUSY) return;
  PAD_BUSY = true;
  const sel = document.getElementById("tracePadMip");
  const pick = String(sel.value).split(":");
  const mip = +pick[0], zoom = +(pick[1] || 1);
  try{
    /* Fill the card rather than sitting in a black band: the canvas' pixel width IS the number of
       voxels drawn, so it is set from the space available rather than fixed in the markup. Capped,
       because every extra 128 pixels is another column of chunks to fetch. */
    const host = cv.parentElement;
    const wide = Math.max(320, Math.min(880, (host && host.clientWidth ? host.clientWidth - 2 : 560)));
    PAD_VIEW = await UJ.emtiles.drawSection(cv, {
      centre: PAD_CENTRE, mip: mip, zoom: zoom, w: wide, h: cv.height,
      onProgress: function(d, n){ if (d < n) padSay("Loading the section\\u2026 " + d + "/" + n); }
    });
    padPaint();
    padRings();
    padSay(UJ.tracepad.count(PAD).rings + " contour(s) kept, "
      + (PAD.pending.length ? PAD.pending.length + " vertices on this one \\u2014 click the ring to close it"
                            : "click each vertex round the cell"));
  }catch(e){
    padSay("Could not read the EM there: " + String(e && e.message || e), true);
  }
  PAD_BUSY = false;
  padZLabel();
}

/* The EM is drawn once per fetch and kept as the canvas' own bitmap; every repaint of the outline
   redraws it from a copy rather than refetching. */
var PAD_BASE = null;
function padPaint(){
  const cv = document.getElementById("tracePad"), g = cv.getContext("2d");
  if (!PAD_BASE || PAD_BASE.width !== cv.width || PAD_BASE.height !== cv.height){
    PAD_BASE = document.createElement("canvas");
    PAD_BASE.width = cv.width; PAD_BASE.height = cv.height;
  }
  if (!PAD_PAINTING){ PAD_BASE.getContext("2d").drawImage(cv, 0, 0); }
  else { g.drawImage(PAD_BASE, 0, 0); }
  PAD_PAINTING = true;
  if (!PAD_VIEW) return;
  const px = function(t){ return PAD_VIEW.pxAt(t); };
  /* Contours already closed on THIS section, then the one being drawn. */
  PAD.rings.forEach(function(r){
    if (r.z !== PAD.z) return;
    g.beginPath();
    r.points.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.closePath();
    g.strokeStyle = "#40e28c"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "rgba(64,226,140,.14)"; g.fill();
    /* The vertices of a CLOSED contour, because since 2026-09-17 they can be dragged, and a handle
       you cannot see is a handle you do not know you have. */
    r.points.forEach(function(p){
      const q = px([p[0], p[1], PAD.z]);
      g.beginPath(); g.arc(q[0], q[1], 2.5, 0, 6.2832);
      g.fillStyle = "#40e28c"; g.fill();
    });
  });
  /* The one under the pointer, larger, so it is obvious which one a drag would take. */
  if (PAD_HOVER && !PAD.pending.length){
    const h = UJ.tracepad.hitVertex(PAD, PAD_HOVER[0], PAD_HOVER[1], PAD_VIEW.pxPerToolVoxel);
    if (h){
      const v = UJ.tracepad.vertexOf(PAD, h.ring, h.vertex);
      if (v){ const q = px([v[0], v[1], PAD.z]);
        g.beginPath(); g.arc(q[0], q[1], 6, 0, 6.2832);
        g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.stroke(); }
    }
  }
  if (PAD.pending.length){
    g.beginPath();
    PAD.pending.forEach(function(p, i){ const q = px([p[0], p[1], PAD.z]);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.strokeStyle = "#ffd166"; g.lineWidth = 2; g.stroke();
    PAD.pending.forEach(function(p, i){
      const q = px([p[0], p[1], PAD.z]);
      g.beginPath();
      if (i === 0){
        /* THE FIRST VERTEX IS A RING, not a dot, and it lights up when the pointer is on it.
           It is the thing you have to come back to, so it has to be visible from the first click
           rather than remembered. */
        const near = PAD_HOVER && UJ.tracepad.nearFirst(PAD, PAD_HOVER[0], PAD_HOVER[1],
                                                        PAD_VIEW.pxPerToolVoxel);
        g.arc(q[0], q[1], near ? 9 : 6, 0, 6.2832);
        g.strokeStyle = near ? "#ffffff" : "#ffd166";
        g.lineWidth = near ? 3 : 2; g.stroke();
      } else {
        g.arc(q[0], q[1], 2.5, 0, 6.2832);
        g.fillStyle = "#ffd166"; g.fill();
      }
    });
  }
}
var PAD_PAINTING = false;

/* One chip per contour on this section, each with its own delete. "Delete this one" should not
   mean "Undo until it is gone" -- that is the difference between correcting a tracing and starting
   it again. */
function padRings(){
  const box = document.getElementById("tracePadRings");
  if (!box || !PAD) return;
  const here = UJ.tracepad.onSection(PAD);
  if (!here.length){ box.innerHTML = ""; return; }
  box.innerHTML = '<span class="hint">On this section:</span> '
    + here.map(function(h, n){
        return '<button type="button" class="hist-chip padring" data-ring="' + h.ring + '" '
          + 'title="Delete this contour">' + (n + 1) + ' \\u00b7 ' + h.points
          + ' points \\u00d7</button>';
      }).join(" ");
  [].slice.call(box.querySelectorAll(".padring")).forEach(function(b){
    b.addEventListener("click", function(){
      if (UJ.tracepad.deleteRing(PAD, +b.dataset.ring)){
        padPaint(); padRings();
        padSay("Contour deleted. " + UJ.tracepad.count(PAD).rings + " left.");
      }
    });
  });
}

function padZLabel(){
  const el = document.getElementById("tracePadZ");
  if (el) el.textContent = "z " + PAD.z
    + (PAD_VIEW ? "  \\u00b7  " + (Math.round(PAD_VIEW.umAcross * 10) / 10) + " \\u00b5m across  \\u00b7  "
                  + PAD_VIEW.nmPerPx + " nm data" : "");
}

function padStep(dir){
  const n = Math.max(1, parseInt(document.getElementById("tracePadStep").value, 10) || 5);
  PAD.pending = [];                        // a half-drawn contour belongs to the section it is on
  PAD.z += dir * n;
  PAD_CENTRE = [PAD_CENTRE[0], PAD_CENTRE[1], PAD.z];
  PAD_PAINTING = false;
  padDraw();
}

function padOpen(){
  const got = tracingPos();
  if (got.error){ tracingSay(got.error, true); return; }
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure({ em: SRC.em, res: UJ.cfg ? UJ.cfg.res : [4, 4, 40] });
  PAD = UJ.tracepad.create();
  PAD.z = got.pos[2];
  PAD_CENTRE = got.pos.slice();
  PAD_VIEW = null; PAD_PAINTING = false;
  document.getElementById("tracePadWrap").style.display = "";
  padDraw();
  tracingResolveAt(got.pos);
}

/* WHAT THE REST OF THE TOOL WOULD CALL THIS CELL.  2026-09-17
   Søren: "from the root ID or nucleus ID it should suggest what cell type it is based on the cell
   identity." Same precedence as everywhere else in this file -- Grubb et al.'s own verification,
   then the community's report, then the MICrONS prediction -- so the suggestion agrees with what
   the cell panel and the filter say about the same cell, which a second rule here would not.

   Either id gets there: nidToIndex() and rootIdToIndex() are the two reverse maps the Root/Nucleus
   search already builds. */
function tracingIdentityFor(nucId, rootId){
  var i = -1, via = "";
  if (nucId && typeof nidToIndex === "function"){
    i = nidToIndex(String(nucId));
    if (i >= 0) via = "nucleus " + nucId;
  }
  if (i < 0 && rootId && typeof rootIdToIndex === "function"){
    i = rootIdToIndex(String(rootId));
    if (i >= 0) via = "root ID " + rootId;
  }
  if (i < 0) return null;
  if (typeof OWN_TYPE !== "undefined" && OWN_TYPE[i] !== 255)
    return { name: OWN_TYPE_NAMES[OWN_TYPE[i]], how: "verified by Grubb et al.", via: via };
  var comm = (window.__COMM_ROWTYPE || {})[String(NID[i])];
  if (comm) return { name: comm, how: "reported by the community", via: via };
  var t = (typeof NT !== "undefined") ? NT[i] : 0;
  if (t) return { name: CT_NAMES[t - 1], how: "MICrONS\\u2019 prediction", via: via };
  return { name: "", how: "no identity on file", via: via };
}

/* Selected for him, and said out loud WHERE IT CAME FROM: a guess with no provenance is worse than
   no guess, and these three sources are not equally strong. Never overrides a choice made by hand --
   TRACING_TYPE_TOUCHED is set the moment he picks one himself. */
var TRACING_TYPE_TOUCHED = false;
function tracingSuggestType(){
  const sel = document.getElementById("tracingType");
  const say = document.getElementById("tracingTypeSay");
  if (!sel || !say) return;
  const nuc = (document.getElementById("tracingNucId").value || "").trim();
  const root = (document.getElementById("tracingRootId").value || "").trim();
  if (!nuc && !root){ say.textContent = ""; return; }
  let id = null;
  try { id = tracingIdentityFor(nuc, root); } catch (e){ say.textContent = ""; return; }
  if (!id){ say.textContent = "No cell in this dataset has that nucleus ID or root ID."; return; }
  if (!id.name){ say.textContent = "Nothing is on file for that cell yet \\u2014 name its type yourself."; return; }
  /* MATCHING TWO VOCABULARIES.  MICrONS records a subclass code -- "6P-CT" -- while this list
     carries the identification tree's leaf names, and the leaf for that one reads "Layer 6 CT
     pyramidal neuron (6P-CT)". The code in parentheses IS the join, and it is there on every leaf
     that has one, so the second rule below is not a heuristic about text but a use of how the
     ontology was written. Anything with no leaf at all is added under a group of its own rather
     than refused: the cell's own record is a better answer than none, and this field becomes a
     Blender collection name, not a key into the tree. */
  const opts = [].slice.call(sel.options);
  const want = String(id.name);
  let opt = opts.filter(function(o){ return o.value === want; })[0];
  if (!opt) opt = opts.filter(function(o){ return o.value.indexOf("(" + want + ")") >= 0; })[0];
  if (!opt) opt = opts.filter(function(o){ return o.value.toLowerCase() === want.toLowerCase(); })[0];
  if (!opt){
    let grp = sel.querySelector('optgroup[data-own="1"]');
    if (!grp){
      grp = document.createElement("optgroup");
      grp.label = "This cell\\u2019s own record";
      grp.setAttribute("data-own", "1");
      sel.insertBefore(grp, sel.firstChild);
    }
    grp.innerHTML = "";
    opt = document.createElement("option");
    opt.value = want; opt.textContent = want;
    grp.appendChild(opt);
  }
  if (!TRACING_TYPE_TOUCHED){
    sel.value = opt.value;
    say.textContent = "Set to \\u201c" + opt.value + "\\u201d from " + id.via + " \\u2014 " + id.how + ".";
  } else {
    say.textContent = id.via.charAt(0).toUpperCase() + id.via.slice(1) + " is on file as \\u201c"
      + id.name + "\\u201d (" + id.how + ").";
  }
}

/* WHAT IS ALREADY THERE, READ RATHER THAN ASKED FOR.  2026-09-17
   Søren: "If the nucleus or cell mesh already exists at the location put in the coordinates, those
   should be prefilled." core/segread.js answers exactly that from the same segmentation the rest of
   the tool uses, so the two id boxes fill themselves.

   It never overwrites something already typed, and it SAYS what it found: a prefilled id with no
   explanation is a number to distrust, and "nothing is segmented there" is itself the answer when
   the reason for tracing is that the segmentation has missed the cell. */
async function tracingResolveAt(pos){
  const say=document.getElementById("tracingAtSay");
  const nucEl=document.getElementById("tracingNucId"), rootEl=document.getElementById("tracingRootId");
  if(!say||!nucEl||!rootEl)return;
  try{
    UJ.segread.configure({seg:SRC.seg,nuc:SRC.nuc,res:UJ.cfg.res});
  }catch(e){say.textContent="";return;}
  say.textContent="Reading what is at "+pos.join(", ")+"\\u2026";
  try{
    const r=await UJ.segread.resolveAt(pos);
    const bits=[];
    if(r.nucleusId){ if(!nucEl.value.trim())nucEl.value=String(r.nucleusId);
                     bits.push("nucleus "+r.nucleusId); }
    if(r.rootId&&r.rootId!=="0"){ if(!rootEl.value.trim())rootEl.value=String(r.rootId);
                                  bits.push("cell "+r.rootId); }
    say.textContent=bits.length
      ? "At that coordinate: "+bits.join(", ")+" \\u2014 filled in below."
      : "Nothing is segmented at that coordinate, which is usually why you are tracing it.";
    tracingSuggestType();
  }catch(e){ say.textContent="Could not read the segmentation there: "+String(e&&e.message||e); }
}

(function wirePad(){
  const cv = document.getElementById("tracePad");
  if (!cv) return;
  document.getElementById("tracePadOpen").addEventListener("click", padOpen);
  document.getElementById("tracePadPrev").addEventListener("click", function(){ padStep(-1); });
  document.getElementById("tracePadNext").addEventListener("click", function(){ padStep(1); });
  document.getElementById("tracePadMip").addEventListener("change", function(){
    PAD_PAINTING = false; padDraw();
  });
  document.getElementById("tracePadUndo").addEventListener("click", function(){
    UJ.tracepad.undo(PAD); padPaint(); padRings(); padSay("Undone.");
  });
  document.getElementById("tracePadClose").addEventListener("click", function(){
    document.getElementById("tracePadWrap").style.display = "none";
  });
  document.getElementById("tracePadUse").addEventListener("click", function(){
    const rings = UJ.tracepad.toRings(PAD);
    const sections = new Set(rings.map(function(r){ return r.z; }));
    if (sections.size < 2){
      padSay("Outline the cell on at least two sections \\u2014 a flat outline has no surface to "
        + "close. Step with , and . and go round again.", true);
      return;
    }
    TRACING_PENDING = { rings: rings };
    document.getElementById("tracingFound").style.display = "";
    tracingSay(rings.length + " contour" + (rings.length === 1 ? "" : "s") + " from the pad on "
      + sections.size + " sections. Name it below and keep it.");
    document.getElementById("tracingName").focus();
  });

  /* A DRAG PANS, A CLICK DROPS A VERTEX. One pointer, no modes: anything that moved more than a
     few pixels between down and up was a pan, and a pan must not leave a vertex behind. */
  var down = null, moved = false, dragging = null;
  cv.addEventListener("pointerdown", function(e){
    if (!PAD_VIEW) return;
    /* LEFT BUTTON ONLY. A right-click fires pointerdown/pointerup like any other, so without this
       every right-click -- the gesture that deletes a point or adds one to a line -- ALSO dropped a
       new vertex where it was clicked. Caught by tracingpanelcheck.js driving real pointer events
       rather than calling the handlers, which is the whole reason it drives them. */
    if (e.button !== 0){ down = null; dragging = null; return; }
    down = [e.offsetX, e.offsetY]; moved = false;
    /* A DRAG THAT STARTS ON A POINT MOVES THE POINT.  2026-09-17
       Søren: "after the segmentation is done, it should be possible to move the polyline points
       individually." Everywhere else on the canvas a drag still pans, and shift+drag always does,
       so nothing is taken away -- but a visible handle that a drag slides past would be a strange
       thing to draw. */
    if (!e.shiftKey){
      const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
      dragging = UJ.tracepad.hitVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
    } else dragging = null;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", function(e){
    PAD_HOVER = PAD_VIEW ? PAD_VIEW.toolAt(e.offsetX, e.offsetY) : null;
    if (down && (Math.abs(e.offsetX - down[0]) > 3 || Math.abs(e.offsetY - down[1]) > 3)) moved = true;
    if (dragging && PAD_HOVER){
      UJ.tracepad.moveVertex(PAD, dragging, PAD_HOVER[0], PAD_HOVER[1]);
      padPaint();
      return;
    }
    /* The pointer says what a click is about to do, before it does it. */
    if (!down && PAD_VIEW && PAD_HOVER){
      const k = PAD_VIEW.pxPerToolVoxel;
      const onV = UJ.tracepad.hitVertex(PAD, PAD_HOVER[0], PAD_HOVER[1], k);
      const onE = onV ? null : UJ.tracepad.hitEdge(PAD, PAD_HOVER[0], PAD_HOVER[1], k);
      cv.style.cursor = onV ? "grab" : (onE ? "copy" : "crosshair");
      padPaint();
    }
  });
  cv.addEventListener("pointerup", function(e){
    if (e.button !== 0){ down = null; dragging = null; return; }   // see pointerdown
    if (!PAD_VIEW || !down) return;
    const wasPan = moved;
    const from = down; down = null;
    if (dragging){
      const wasDrag = moved;
      dragging = null;
      if (wasDrag){ padPaint(); padSay("Point moved. Right-click a point to delete it, or a line "
        + "to put a new point in the middle of it."); return; }
      /* Pressed and released on a vertex without moving: not a drag, and not a new vertex either --
         a click there means the first vertex when one is being drawn, and nothing otherwise. */
      if (!PAD.pending.length) return;
    }
    /* SHIFT MOVES THE FIELD.  2026-09-17
       Søren: "it should be possible to move the field around using shift+click." Held down, shift
       means "go there" rather than "put a vertex there": a click recentres on the point, a drag
       pans by it. Explicit, so it works mid-contour -- the vertices are in dataset voxels and do
       not move when the view does, which is the whole reason they are stored that way. */
    if (e.shiftKey){
      if (wasPan){
        const a0 = PAD_VIEW.toolAt(from[0], from[1]), b0 = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
        PAD_CENTRE = [PAD_CENTRE[0] - (b0[0] - a0[0]), PAD_CENTRE[1] - (b0[1] - a0[1]), PAD.z];
      } else {
        const t0 = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
        PAD_CENTRE = [t0[0], t0[1], PAD.z];
      }
      PAD_PAINTING = false;
      padDraw();
      padSay("Moved to " + PAD_CENTRE[0] + ", " + PAD_CENTRE[1] + ". "
        + (PAD.pending.length ? PAD.pending.length + " vertices still on this contour." : ""));
      return;
    }
    if (wasPan){
      const a = PAD_VIEW.toolAt(from[0], from[1]), b = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
      PAD_CENTRE = [PAD_CENTRE[0] - (b[0] - a[0]), PAD_CENTRE[1] - (b[1] - a[1]), PAD.z];
      PAD_PAINTING = false;
      padDraw();
      return;
    }
    const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
    const r = UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
    padPaint();
    if (r.closed) padRings();
    padSay(r.closed
      ? UJ.tracepad.count(PAD).rings + " contour(s) \\u2014 step a section with , or . and go round again"
      : (PAD.pending.length === 1
          ? "First vertex marked. Click round the cell, then click that ring again to close."
          : PAD.pending.length + " vertices \\u2014 click the ring to close"));
  });
  cv.addEventListener("dblclick", function(e){
    if (UJ.tracepad.closeRing(PAD)){ padPaint(); padRings(); padSay("Contour closed."); return; }
    padInsertAt(e);
  });
  /* RIGHT-CLICK: delete the point under the pointer, or put one in the middle of the line under it.
     Søren: "correct if a line in the polyline is placed wrongly" -- which is usually a corner
     wanting one more point, not a point in the wrong place, so the segment is a target too. */
  cv.addEventListener("contextmenu", function(e){
    if (!PAD_VIEW) return;
    e.preventDefault();
    const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
    const k = PAD_VIEW.pxPerToolVoxel;
    const v = UJ.tracepad.hitVertex(PAD, t[0], t[1], k);
    if (v){
      const what = UJ.tracepad.deleteVertex(PAD, v);
      padPaint(); padRings();
      padSay(what === "ring"
        ? "That took the contour under three points, so the contour went with it."
        : "Point deleted.");
      return;
    }
    padInsertAt(e);
  });
  function padInsertAt(e){
    if (!PAD_VIEW) return;
    const t = PAD_VIEW.toolAt(e.offsetX, e.offsetY);
    const edge = UJ.tracepad.hitEdge(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
    if (!edge){ padSay("Nothing there to correct \\u2014 right-click a point to delete it, or a line "
      + "to put a new point in it.", true); return; }
    UJ.tracepad.insertVertex(PAD, edge, t[0], t[1]);
    padPaint(); padRings();
    padSay("Point added to that line \\u2014 drag it where it belongs.");
  }
  /* , and . step a section, the same keys Neuroglancer uses, but only while the pad is on screen
     and nothing is being typed into. */
  document.addEventListener("keydown", function(e){
    const wrap = document.getElementById("tracePadWrap");
    if (!wrap || wrap.style.display === "none") return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
    if (e.key === ","){ padStep(-1); e.preventDefault(); }
    else if (e.key === "."){ padStep(1); e.preventDefault(); }
    else if (e.key === "Enter"){ if (UJ.tracepad.closeRing(PAD)){ padPaint(); padSay("Contour closed."); } }
    else if (e.key === "Escape"){ PAD.pending = []; padPaint(); padSay("Contour abandoned."); }
  });
})();

(function wireTracing(){''',
     "the pad is drawn, clicked and stepped"),
]

def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("core/segread.js", SEGREAD)
edit("ujump.html", HTML + JS)
edit("tracingpanelcheck.js", PADCHECK)
print("\nnow: node tracepadcheck.js && node emtilescheck.js && node tracingpanelcheck.js")
