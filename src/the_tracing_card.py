"""The tracing card, whole.                                                          2026-09-17

Søren: *"Ok, consolidate generators."*

SEVEN generators had grown over this one card in two days, each anchoring on text an earlier one
had inserted. Several were later rewritten by a newer one, so their `old` strings no longer matched
and their `new` strings were no longer in the page; re-running them either refused or -- once --
inserted a duplicate `const openBtn` that broke the page's entire script block. Recovering from that
cost more than the change that caused it.

This file replaces all seven for `ujump.html`. It owns three regions and writes each one whole:

  SCRIPTS  the three <script> tags the feature needs
  CARD     everything from <div class="card" id="tracingCard"> to the end of that card
  SCRIPT   the pad, the card's wiring, and everything between them

Each is replaced BY REGION rather than by matching a snippet inside it: find where the region
starts, find where it ends, put the whole thing there. A re-run is a no-op because the text is
already what it writes, and there is no anchor left to drift -- the only things it has to find are
the boundaries, which belong to the page around the card rather than to the card.

Verified rather than assumed: gutting both regions out of a copy of the page and running this file
rebuilt it byte for byte.

THE RULE THAT CAME OUT OF IT
  - One generator owns one region, and the region is the WHOLE of a card or a module, never a line
    inside somebody else's insertion.
  - A change to this card is made HERE, by editing the literals below and re-running, not by a new
    generator anchoring into them.
  - The older generators keep their prose, which is the record of why each decision was made. Their
    edits are removed; this file carries the result.

WHAT THE SEVEN WERE, and what each one decided -- the reasoning is in their own docstrings, which
are worth reading before changing the thing they explain:

  a_traced_cell_starts_as_a_paste.py   stage 1: contours out of a pasted Neuroglancer link
  a_tracing_is_shared_as_a_version.py  a stable structureId, and groupId versioning a share
  a_viewer_to_trace_in.py              nowhere to draw; the Cortical layers bands are not contours
  the_tracing_card_has_its_own_coordinate.py  the card's own x/y/z, and half-filled is an error
  a_ring_of_points_is_a_contour.py     no viewer has a polygon tool; points are one click a vertex
  a_polygon_tool_of_our_own.py         so µJump draws the section itself and puts the tool on it
  what_it_is_comes_from_the_list.py    the ontology instead of free text; the cell read, not asked
  a_finished_contour_can_be_edited.py  a closed contour can be corrected; labels, not placeholders

Run: python3 src/the_tracing_card.py
     node tracingcheck.js && node tracepadcheck.js && node tracingpanelcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCRIPTS = '''<script src="core/segread.js"></script>
<script src="core/emtiles.js"></script>
<script src="core/tracepad.js"></script>'''

CARD = '''<div class="card" id="tracingCard">
<details id="tracingPanel">
<summary style="cursor:pointer;font-weight:600">Trace a cell &mdash; outline it, and it joins the 3D export</summary>
<p class="hint" style="margin-top:8px">For a cell the segmentation does not have. Open a viewer and ring the cell with <b>point</b> annotations &mdash; <b>ctrl+click</b> once per vertex, going round one way; a plain click does nothing &mdash; then step a section with <b>,</b> or <b>.</b> and go round again. Paste the whole address bar back here. Three points to a section, two sections minimum; tracing every fifth section comes out about half a percent off the real volume, every fortieth about eleven.</p>
<label style="margin-top:10px">Where to open it <span style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; voxels, the same as the coordinate box at the top of this tab</span></label>
<div class="row"><div class="coord"><input type="text" id="tracingX" inputmode="decimal" placeholder="x"></div><div class="coord"><input type="text" id="tracingY" inputmode="decimal" placeholder="y"></div><div class="coord"><input type="text" id="tracingZ" inputmode="decimal" placeholder="z"></div></div>
<p class="hint" style="margin-top:4px">Or paste <code>x, y, z</code> into the x field &mdash; it splits automatically. Filled in from the cell on screen when you have one.</p>
<div class="row" style="gap:8px;margin-top:8px">
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
</div>
<p class="hint" style="margin-top:6px"><b>There is no polygon tool.</b> Measured 2026-09-17: the MICrONS viewer offers point, bounding box, line and ellipsoid and nothing else; Spelunker adds a <i>polyline</i> that draws on screen but never reaches the link; BrainSharer's polygon tool needs an account and ignores a pasted link. Points are one click per vertex and come back in the order you clicked them, which is why they are what this asks for &mdash; a ring of <b>line</b> annotations is read too, at two clicks a segment.</p>
<label style="margin-top:10px">Neuroglancer link</label>
<textarea id="tracingLink" placeholder="Paste the whole address bar, with your contours on it."></textarea>
<div class="row" style="gap:8px;margin-top:8px">
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingLayer" placeholder="Annotation layer name (optional)" title="Which annotation layer to read. Leave it empty and it does the right thing on its own: a layer called &quot;tracing&quot; (what the button above makes) wins if the link has one, and the Cortical layers bands are never read as contours."></div>
<button class="idbtn" id="tracingRead" style="flex:0 0 auto">Read the contours</button>
</div>
<p class="hint" id="tracingStatus"></p>
<div id="tracingFound" style="display:none;margin-top:8px">
<label style="margin-top:4px">What did you outline?</label>
<div class="row" style="gap:8px">
<select id="tracingWhat" style="flex:2 1 auto;min-width:0" title="The same ontology the organelle card and the filter use, so a traced lysosome is the same thing as a reported one. The whole cell and its nucleus are at the top because they are what you outline when the segmentation has missed a cell, and they are not organelles."></select>
<div class="coord" style="flex:0 0 120px"><input type="color" id="tracingColor" value="#3a6b5a" style="width:100%;height:38px;padding:2px"></div>
</div>
<div class="row" id="tracingNameRow" style="gap:8px;margin-top:8px;display:none">
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingName" placeholder="Name it &mdash; and tell me, so it can go on the list"></div>
</div>
<label style="margin-top:10px">Which cell is it part of?</label>
<div class="row" style="gap:8px">
<select id="tracingType" style="flex:2 1 auto;min-width:0" title="The cell type this structure belongs to. It becomes the collection the object lands in when the Blender scene is built. Suggested from the nucleus or root ID below, by the same precedence the rest of the tool uses: verified, then community-reported, then the MICrONS prediction."></select>
</div>
<p class="hint" id="tracingTypeSay" style="margin-top:4px"></p>
<!-- LABELS, NOT PLACEHOLDERS.  2026-09-17. Søren: "Here it says nucleus ID but it is a root
     ID." It did: these two sat side by side with the nucleus box EMPTY and showing its
     placeholder, and the root box FILLED and therefore showing nothing at all -- so the only
     words on the row named the wrong box. A placeholder is a hint about what to type; it is
     never a name for what is there. -->
<div class="row" style="gap:8px;margin-top:8px">
<div style="flex:1 1 auto;min-width:0">
<label style="margin:0 0 4px">Nucleus ID</label>
<div class="coord"><input type="text" id="tracingNucId" inputmode="numeric" placeholder="none at this coordinate"></div>
</div>
<div style="flex:1 1 auto;min-width:0">
<label style="margin:0 0 4px">Root ID &mdash; the cell</label>
<div class="coord"><input type="text" id="tracingRootId" inputmode="numeric" placeholder="none at this coordinate"></div>
</div>
</div>
<p class="hint" id="tracingAtSay" style="margin-top:4px"></p>
<div class="row" style="gap:8px;margin-top:10px">
<button class="idbtn" id="tracingKeep" style="flex:1 1 auto">Keep it &mdash; include in the 3D export</button>
<button class="idbtn" id="tracingShare" style="flex:0 0 auto" title="Posts one row per contour to the shared record, so other people can use this tracing. Needs a Google sign-in.">Share</button>
</div>
</div>
<div id="tracingList" style="margin-top:12px"></div>
</details>
</div>
</div>
'''

SCRIPT = '''/* ── THE PAD ─────────────────────────────────────────────────────────────────────  2026-09-17
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
/* The parameters are NOT called nucId/rootId by accident: `rootId` is also the name of the page's
   own index-to-root-id function, and a parameter called that shadows it -- which is why the first
   version of this filled the nucleus in from a root id and never the other way round. Caught by the
   check asserting BOTH directions rather than one. */
function tracingIdentityFor(nucIn, rootIn){
  var i = -1, via = "";
  if (nucIn && typeof nidToIndex === "function"){
    i = nidToIndex(String(nucIn));
    if (i >= 0) via = "nucleus " + nucIn;
  }
  if (i < 0 && rootIn && typeof rootIdToIndex === "function"){
    i = rootIdToIndex(String(rootIn));
    if (i >= 0) via = "root ID " + rootIn;
  }
  if (i < 0) return null;
  /* THE OTHER ID COMES FREE.  2026-09-17. Søren: "the nucleus ID should also be put in, because you
     know that this root ID is associated with this nucleus ID because the cell has been identified."
     Exactly so -- the index IS the association, and this dataset stores both sides of it, so once
     either id has found a cell the other one is a lookup rather than a question. It matters most in
     the case that prompted it: a coordinate inside a process reads a root id and NOTHING in the
     nucleus volume, because the nucleus is somewhere else entirely. */
  var pair = { nucleusId: String(NID[i]), rootId: (typeof rootId === "function" ? rootId(i) : "") || "" };
  function answer(name, how){ return { name: name, how: how, via: via,
                                       nucleusId: pair.nucleusId, rootId: pair.rootId }; }
  if (typeof OWN_TYPE !== "undefined" && OWN_TYPE[i] !== 255)
    return answer(OWN_TYPE_NAMES[OWN_TYPE[i]], "verified by Grubb et al.");
  var comm = (window.__COMM_ROWTYPE || {})[String(NID[i])];
  if (comm) return answer(comm, "reported by the community");
  var t = (typeof NT !== "undefined") ? NT[i] : 0;
  if (t) return answer(CT_NAMES[t - 1], "MICrONS\\u2019 prediction");
  return answer("", "no identity on file");
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
  /* Fill in whichever id the cell has and the box does not. Never overwrites: a value already
     there was either read from the segmentation or typed, and both outrank a lookup. */
  const nucEl = document.getElementById("tracingNucId"), rootEl = document.getElementById("tracingRootId");
  const gained = [];
  if (id.nucleusId && !nucEl.value.trim()){ nucEl.value = id.nucleusId; gained.push("nucleus " + id.nucleusId); }
  if (id.rootId && !rootEl.value.trim()){ rootEl.value = id.rootId; gained.push("root ID " + id.rootId); }
  const also = gained.length ? " Its " + gained.join(" and ") + " filled in from the record." : "";
  if (!id.name){ say.textContent = "Nothing is on file for that cell yet \\u2014 name its type yourself." + also; return; }
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
    say.textContent = "Set to \\u201c" + opt.value + "\\u201d from " + id.via + " \\u2014 " + id.how + "." + also;
  } else {
    say.textContent = id.via.charAt(0).toUpperCase() + id.via.slice(1) + " is on file as \\u201c"
      + id.name + "\\u201d (" + id.how + ")." + also;
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

(function wireTracing(){
  const sel=document.getElementById("tracingType");
  if(!sel)return;
  /* The same cell names the identification tree offers, so a traced astrocyte is the same word as
     a detected one and lands in the same Blender collection. */
  const names=(typeof LEAF_NAMES!=="undefined")?Object.keys(LEAF_NAMES).map(function(k){
    return {v:LEAF_NAMES[k],l:LEAF_NAMES[k]};}):[];
  names.sort(function(a,b){return a.l<b.l?-1:1;});
  sel.innerHTML='<option value="traced">(no cell type)</option>'
    +names.map(function(n){return '<option value="'+escHtml(n.v)+'">'+escHtml(n.l)+'</option>';}).join("");
  /* THE SAME LIST THE ORGANELLE CARD USES.  2026-09-17
     Søren: "Instead of free text, we need it to have a dropdown to select an organelle type like
     the list we have for identification of organelles." optionsHtml() is that list, <optgroup> by
     <optgroup>. The two whole-object answers go above it because they are not organelles and are
     the commonest reason to trace anything; "something else" goes last, and is the only door to a
     text box, because a kind that has to be typed is one the ontology is missing. */
  const what=document.getElementById("tracingWhat");
  if(what){
    what.innerHTML='<optgroup label="The cell itself">'
      +'<option value="__cell">Whole cell \\u2014 the cell\\u2019s own mesh</option>'
      +'<option value="__nucleus">Nucleus</option></optgroup>'
      +((typeof ORGANELLE_KIND_OPTIONS_HTML!=="undefined")
          ? ORGANELLE_KIND_OPTIONS_HTML : UJ.organelles.optionsHtml())
      +'<optgroup label="Not on the list"><option value="__other">Something else \\u2014 type the name</option></optgroup>';
    what.value="__cell";
    what.addEventListener("change",function(){
      document.getElementById("tracingNameRow").style.display=(what.value==="__other")?"":"none";
      if(what.value==="__other")document.getElementById("tracingName").focus();
    });
  }
  TRACINGS_KEPT=tracingRead();
  tracingRenderList();
  document.getElementById("tracingRead").addEventListener("click",function(){
    try{tracingReadLink();}catch(e){tracingSay(String(e&&e.message||e),true);}
  });
  const openBtn=document.getElementById("tracingOpen");
  if(openBtn)openBtn.addEventListener("click",tracingOpen);
  /* The same paste-splitter the main coordinate box has, so "240640, 207872, 21360" copied out of
     Neuroglancer's own readout lands in three fields. */
  const tx=document.getElementById("tracingX");
  if(tx)tx.addEventListener("input",function(e){
    const p=String(e.target.value||"").split(/[\\s,]+/).filter(function(s){return s!=="";});
    if(p.length>=3){e.target.value=p[0];
      document.getElementById("tracingY").value=p[1];
      document.getElementById("tracingZ").value=p[2];}
  });
  /* Pre-filled from the cell on screen, so pasting "x, y, z" over them meant clearing them
     first. Søren: "when you click the first coordinate it should mark it so pasting is easy." */
  ["tracingX","tracingY","tracingZ","tracingNucId","tracingRootId"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("focus",function(){try{el.select();}catch(_e){}});
  });
  /* Typing an id in by hand suggests the type too -- the ids are not only ever filled by the
     coordinate read, and somebody who knows the cell should not have to open the pad to get it. */
  ["tracingNucId","tracingRootId"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("change",tracingSuggestType);
  });
  const typeSel=document.getElementById("tracingType");
  if(typeSel)typeSel.addEventListener("change",function(){TRACING_TYPE_TOUCHED=true;});
  const tPanel=document.getElementById("tracingPanel");
  if(tPanel)tPanel.addEventListener("toggle",tracingFillPos);
  tracingFillPos();
  document.getElementById("tracingKeep").addEventListener("click",tracingKeep);
  document.getElementById("tracingShare").addEventListener("click",tracingShare);
})();'''


def replace_region(s, first, last, text, why):
    """Swap out everything from `first` to the END of `last`, inclusive."""
    if text in s:
        print("  already there: " + why)
        return s
    a = s.index(first)
    b = s.index(last, a) + len(last)
    print("  ok: " + why)
    return s[:a] + text + s[b:]


p = os.path.join(HERE, "ujump.html")
s = io.open(p, encoding="utf-8").read()
print("ujump.html")
s = replace_region(s, '<script src="core/segread.js"></script>',
                      '<script src="core/tracepad.js"></script>',
                   SCRIPTS, "the scripts the tracing card needs")
s = replace_region(s, '<div class="card" id="tracingCard">',
                      '<div class="tabpanel" data-tabpanel="filter">',
                   CARD + '<div class="tabpanel" data-tabpanel="filter">',
                   "the card itself")
s = replace_region(s, '/* \u2500\u2500 THE PAD \u2500',
                      '})();\n\n/* \u2500\u2500 BULK ORGANELLE ANNOTATION',
                   SCRIPT + '\n\n/* \u2500\u2500 BULK ORGANELLE ANNOTATION',
                   "the pad and the card's wiring")
io.open(p, "w", encoding="utf-8").write(s)
print("\nnow: node tracingcheck.js && node tracepadcheck.js && node tracingpanelcheck.js")
