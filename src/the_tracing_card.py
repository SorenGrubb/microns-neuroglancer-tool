"""The tracing card, whole.                                                          2026-09-17

Søren: *"Ok, consolidate generators."*

SEVEN generators had grown over this one card in two days, each anchoring on text an earlier one
had inserted. Several were later rewritten by a newer one, so their `old` strings no longer matched
and their `new` strings were no longer in the page; re-running them either refused or -- once --
inserted a duplicate `const openBtn` that broke the page's entire script block. Recovering from that
cost more than the change that caused it.

This file replaces all seven for `ujump.html`. It owns three regions and writes each one whole:

  SCRIPTS  the <script> tags the feature needs
  CARD     everything from <div class="card" id="tracingCard"> to the end of that card
  SCRIPT   the whole tracing script block: the feature, the pad, the preview and the wiring

── SECOND PASS, LATER THE SAME DAY ───────────────────────────────────────────────────────────
Søren, having traced a cell and looked at the card:

    *"I think sharing should not be an option, the meshes made should always be a part of the
    dataset and everybody should be able to use it. Also, other people should be able to add to it
    or edit it. While editing it, there should also be a window below to show the 3D structure
    while it is being generated, so the user can get a view of what it looks like. Preferably also
    with the nucleus and root ID meshes as transparent. Perhaps this should be an option, rather
    than it loading immediately if it is slow to load."*

Three changes, and the reasoning for each sits next to the code it explains:

  ONE BUTTON. Keep and Share became "Add it to the dataset". Signed out it is kept and QUEUED --
    tracingFlush() -- because refusing would be the two-button behaviour wearing one button's
    clothes, and the work would stay on one laptop.

  ANYONE MAY EDIT. A tracing is keyed by its structureId alone now, everywhere: core/tracing.js,
    backend/Code.gs (backend/src_a_tracing_belongs_to_everyone.py) and this card's own browser,
    which lists what is in the dataset and opens one back into the pad. Credit accumulates rather
    than transferring; no version is ever deleted. This REVERSES yesterday's keying, and the
    docstring of the generator that made it says why that was a misreading of "no consensus".

  THE SHAPE AS IT IS DRAWN. core/traceloft.js lofts the contours, core/nucmesh.js fetches the
    nucleus's own mesh (the nuclei volume's mesh directory -- measured when the Colab export was
    written), and core/mesh3d.js grew transparency and a shared frame so three meshes can be drawn
    in one place. Behind a button, and the ghosts behind a checkbox, because the tracing lofts in a
    millisecond and a whole neuron's mesh is megabytes.

The region boundaries moved once, with that pass: SCRIPT used to start at the pad, which left the
feature's own functions -- tracingKeep among them -- owned by no generator at all after the seven
handed over. It now starts at the feature's header comment.

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
<script src="core/tracepad.js"></script>
<script src="core/traceloft.js"></script>
<script src="core/nucmesh.js"></script>'''

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
<!-- THE SHAPE, WHILE IT IS STILL BEING MADE.  2026-09-17. Søren: "there should also be a window
     below to show the 3D structure while it is being generated, so the user can get a view of what
     it looks like. Preferably also with the nucleus and root ID meshes as transparent. Perhaps this
     should be an option, rather than it loading immediately if it is slow to load." Behind a
     button for exactly that reason: the tracing itself lofts in a millisecond, but a whole cell's
     mesh is megabytes and nobody should pay for it per contour. Once open it follows every closed
     contour. -->
<div class="row" style="gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
<button class="idbtn" id="tracePad3D" style="flex:1 1 auto" title="Lofts the contours you have drawn into a surface and draws it here. Not the export's surface -- that one is built by filling each section and running marching cubes, and it is smoother; this is the same silhouette, now.">Show it in 3D</button>
<label style="font-size:12px;display:flex;align-items:center;gap:6px;flex:0 0 auto" title="Fetches the cell's own mesh for the root ID and the nucleus mesh for the nucleus ID, and draws both see-through around your tracing, so you can see where it sits. Megabytes for a whole neuron, which is why it is a choice."><input type="checkbox" id="tracePadGhosts" checked> with the cell and nucleus, see-through</label>
</div>
<div id="tracePad3DHost" style="margin-top:6px"></div>
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
<!-- ONE BUTTON, BECAUSE SHARING IS NOT A CHOICE.  2026-09-17. Søren: "I think sharing should not
     be an option, the meshes made should always be a part of the dataset and everybody should be
     able to use it." There were two buttons here, Keep and Share, and the second one was the half
     that needed a sign-in -- which meant the ordinary path was to press the first and leave the
     work on one laptop. Now finishing a tracing does both. Signed out it is still kept, and it
     goes up on its own the moment you sign in; see tracingFlush() for why that is a queue rather
     than a refusal. -->
<div class="row" style="gap:8px;margin-top:10px">
<button class="idbtn" id="tracingKeep" style="flex:1 1 auto" title="Adds this tracing to the shared dataset, where anyone can use it and anyone can extend it, and keeps it in this page's own 3D export. Needs a Google sign-in to be attributed — without one it waits here until you sign in.">Add it to the dataset &mdash; and to your 3D export</button>
</div>
</div>
<div id="tracingList" style="margin-top:12px"></div>
<!-- THE DATASET'S TRACINGS, TO ADD TO.  2026-09-17. Søren: "other people should be able to add to
     it or edit it." Reading them back is what makes that possible at all: the index costs one
     sheet scan and opens no files, and only the tracing you choose to open is fetched. -->
<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">
<div class="row" style="gap:8px">
<button class="idbtn" id="tracingBrowse" style="flex:1 1 auto" title="Every tracing anyone has added, newest version first. Open one and its contours come into the pad, where you can extend it onto more sections or correct a contour; adding it again is its next version, with your name added to its contributors and nothing of the old one deleted.">Show the tracings in the dataset</button>
</div>
<div id="tracingShared" style="margin-top:8px"></div>
</div>
</details>
</div>
</div>
'''

SCRIPT = '''/* ── TRACING A CELL THE SEGMENTATION DOES NOT HAVE ──────────────────────────────  2026-09-16
   Paste a link of contours, keep it, and it rides into the Blender export as an ordinary cell.

   ONE BUTTON, AND IT DOES BOTH HALVES.  2026-09-17. Søren: *"I think sharing should not be an
   option, the meshes made should always be a part of the dataset and everybody should be able to
   use it."* There were two -- Keep, which was local, and Share, which needed a sign-in -- and the
   predictable result was that the easy one got pressed and the work stayed on one laptop.

   THE EXPORT STILL DOES NOT WAIT FOR THE BACKEND, which is why the local half survives: a tracing
   is written to localStorage first, so the Blender download works signed out, offline, and against
   a backend nobody has redeployed. The share is attempted immediately after, and if there is no
   sign-in it is QUEUED rather than refused -- tracingFlush() sends it the moment one appears.

   NO CONSENSUS, AND NO OWNER EITHER. Nothing votes on a tracing; the newest version of it simply
   is it. But anyone may extend or correct one -- Søren, same message: *"other people should be
   able to add to it or edit it"* -- so credit accumulates instead of transferring, and no version
   is ever deleted. */
const TRACING_KEY="ujump_tracings_v1";
let TRACINGS_KEPT=[];
function tracingRead(){
  try{ const v=JSON.parse(localStorage.getItem(TRACING_KEY)||"[]"); return Array.isArray(v)?v:[]; }
  catch(_e){ return []; }
}
function tracingWrite(list){
  try{ localStorage.setItem(TRACING_KEY,JSON.stringify(list)); }catch(_e){}
}
function tracingSay(msg,bad){
  const el=document.getElementById("tracingStatus");
  if(el)el.innerHTML=bad?'<span style="color:var(--bad)">'+escHtml(msg)+'</span>':escHtml(msg);
}
/* Held between "Read the contours" and "Keep it", so the name and colour are chosen AFTER seeing
   what was found rather than before. */
let TRACING_PENDING=null;

function tracingRenderList(){
  const host=document.getElementById("tracingList");
  if(!host)return;
  if(!TRACINGS_KEPT.length){
    host.innerHTML='<p class="hint">Nothing traced yet. A kept tracing is included in every '
      +'Blender download from this page until you remove it.</p>';
    return;
  }
  host.innerHTML='<label>Kept tracings &mdash; these go into the 3D export</label>'
    +TRACINGS_KEPT.map(function(t,i){
      const sections=new Set((t.rings||[]).map(function(r){return r.z;})).size;
      return '<div style="display:flex;align-items:center;gap:8px;border-top:1px solid var(--line);'
        +'padding:5px 0;font-size:12px">'
        +'<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
          +escHtml(t.color||"#3a6b5a")+'"></span>'
        +'<span style="flex:1 1 auto">'+escHtml(t.name||"traced")
          +' <span style="opacity:.7">&middot; '+escHtml(t.type||"traced")+'</span></span>'
        +'<span style="opacity:.7">'+(t.rings||[]).length+' contour'
          +((t.rings||[]).length===1?"":"s")+' on '+sections+' section'+(sections===1?"":"s")+'</span>'
        /* A tracing that has not reached the dataset says so HERE, where the tracing is, rather
           than in a status line that the next action overwrites. */
        +(t.pending_share
            ?'<span style="color:var(--warn);font-weight:600" title="Kept here, not in the shared '
             +'dataset yet. Sign in with Google and it goes up on its own.">waiting for sign-in</span>'
            :'<span style="opacity:.55" title="In the shared dataset — anyone can open it and add '
             +'to it.">in the dataset</span>')
        +'<button class="idbtn tracingdrop" data-n="'+i+'" style="padding:2px 9px;font-size:12px">'
        +'Remove</button></div>';
    }).join("");
  host.querySelectorAll(".tracingdrop").forEach(function(b){
    b.addEventListener("click",function(){
      TRACINGS_KEPT.splice(Number(b.dataset.n),1);
      tracingWrite(TRACINGS_KEPT);tracingRenderList();
    });
  });
}

function tracingReadLink(){
  const link=document.getElementById("tracingLink").value;
  const layer=(document.getElementById("tracingLayer").value||"").trim();
  document.getElementById("tracingFound").style.display="none";
  TRACING_PENDING=null;
  const r=UJ.tracing.ringsFromLink(link,layer||null);
  if(!r.ok){tracingSay(r.error,true);return;}
  /* The whole paste is ONE structure unless the viewer said otherwise with a Volume. Somebody
     outlining one cell in one layer means one cell; a structure per contour is never wanted. */
  const rings=r.rings;
  const sections=new Set(rings.map(function(x){return x.z;}));
  const named=(r.structures.find(function(s){return s.name;})||{}).name||"";
  TRACING_PENDING={rings:rings};
  if(named)document.getElementById("tracingName").value=named;
  const zs=Array.from(sections).sort(function(a,b){return a-b;});
  const gaps=zs.length>1?Math.round((zs[zs.length-1]-zs[0])/(zs.length-1)):0;
  /* WHICH SHAPE IT READ, in words. The same link is organelle markers to the bulk card and a
     contour to this one -- the box it is pasted into is what decides -- so saying "from 36 points"
     rather than just "3 contours" makes pasting the wrong link into the wrong box visible. */
  const fromWhat={points:"from "+r.seen.points+" points",lines:"from line annotations",
                  polygons:"from polygons",volume:"from a traced volume"};
  const src=fromWhat[(r.structures[0]||{}).from||""]||"";
  tracingSay(rings.length+" contour"+(rings.length===1?"":"s")+(src?" "+src:"")+" on "+sections.size
    +" section"+(sections.size===1?"":"s")+", z "+zs[0]+"\\u2013"+zs[zs.length-1]
    +(gaps?" (about every "+gaps+" section"+(gaps===1?"":"s")+")":"")
    +(r.seen.mixedZ?" \\u2014 "+r.seen.mixedZ+" contour(s) span more than one section, which is "
      +"usually a stray point":""));
  if(sections.size<2){
    tracingSay("Only one section has a contour on it. A flat outline has no surface to close \\u2014 "
      +"outline the cell on at least two sections.",true);
    return;
  }
  document.getElementById("tracingFound").style.display="";
}

/* What the dropdown means, in one place: the value that travels with the tracing and the label
   a person reads. "__cell" and "__nucleus" are this card's own, everything else is the ontology's
   own value, and "__other" is the only one that takes its name from a text box. */
function tracingWhat(){
  const sel=document.getElementById("tracingWhat");
  const v=sel?sel.value:"__other";
  if(v==="__cell")return {kind:"cell",name:"Whole cell"};
  if(v==="__nucleus")return {kind:"nucleus",name:"Nucleus"};
  if(v==="__other"){
    const typed=(document.getElementById("tracingName").value||"").trim();
    return {kind:"other",name:typed};
  }
  /* The label from whichever vocabulary this page carries. µJump defines its own
     ORGANELLE_KIND_BY_VALUE in core/ontology.js and leaves UJ.organelleData unset, so
     UJ.organelles.labelOf() would hand back the raw value -- "nucleoplasmic_reticulum_2" where the
     dropdown says "Nucleoplasmic reticulum type II". Asked of the page first, the module second,
     so this works on a tool that has either. */
  const k=(typeof ORGANELLE_KIND_BY_VALUE!=="undefined")?ORGANELLE_KIND_BY_VALUE[v]:null;
  return {kind:v,name:(k&&k.label)||UJ.organelles.labelOf(v)};
}

function tracingCurrent(){
  if(!TRACING_PENDING)return null;
  const w=tracingWhat();
  const name=w.name;
  if(!name){tracingSay("Type what it is, or pick it from the list \\u2014 the name becomes the "
    +"object's name in Blender.",true);
    document.getElementById("tracingName").focus();return null;}
  const t={name:name,kind:w.kind,type:document.getElementById("tracingType").value||"traced",
           color:document.getElementById("tracingColor").value||"#3a6b5a",
           traced_by:(typeof REPORTER_NAME!=="undefined"&&REPORTER_NAME)||"",
           rings:TRACING_PENDING.rings};
  const nid=(document.getElementById("tracingNucId").value||"").trim();
  if(nid)t.nucleus_id=nid;
  const rid=(document.getElementById("tracingRootId").value||"").trim();
  if(rid)t.root_id=rid;
  /* A STABLE ID, ASSIGNED ONCE.  2026-09-17
     Keep and Share have to be talking about the same structure, and a second Share after tracing
     more sections has to be a new VERSION of this cell rather than a rival to it -- that is what
     the backend's (structureId, reporterEmail, groupId) versioning keys on. Frozen on
     TRACING_PENDING the first time this function gets as far as a name, so renaming afterwards
     renames the same structure instead of forking it.

     Reusing a kept tracing's id when the names match is the working pattern: paste a link covering
     more of the cell you already outlined, same name, share, and the older version is superseded
     rather than duplicated. */
  if(!TRACING_PENDING.id){
    const prior=(TRACINGS_KEPT||[]).filter(function(x){return x&&x.id&&x.name===name;})[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(name);
  }
  t.id=TRACING_PENDING.id;
  return t;
}

/* ── SOMEWHERE TO GO AND DRAW ────────────────────────────────────────────────────  2026-09-17
   Søren: "I don't see any link to a neuroglancer instance anywhere where I can go and use the
   polygon tool to trace a cell." There wasn't one, and the tool the card named does not exist in
   any viewer a link can reach -- see src/a_viewer_to_trace_in.py for what was measured.

   Same state buildState() gives the jump arrow -- his viewer, his layer ticks, this coordinate --
   plus an empty annotation layer with the line tool live. */
/* Where the viewer opens: the card's own boxes, or the cell on screen if they are empty.

   HALF-FILLED IS AN ERROR. Two of three means he is mid-type; falling back to CUR_POS there opens
   a viewer somewhere else that looks exactly like a viewer in the right place, and he finds out two
   sections into a tracing. All three, or none. */
function tracingPos(){
  const val=function(id){const el=document.getElementById(id);return el?String(el.value||"").trim():"";};
  const raw=[val("tracingX"),val("tracingY"),val("tracingZ")];
  const given=raw.filter(function(s){return s!=="";}).length;
  if(given===3){
    const p=raw.map(Number);
    if(!p.every(function(n){return isFinite(n);}))
      return {error:"That coordinate has something in it that is not a number."};
    return {pos:p.map(Math.round)};
  }
  if(given>0)return {error:"All three of x, y and z, or leave them empty to use the cell on screen."};
  if(window.CUR_POS&&window.CUR_POS.length===3)return {pos:window.CUR_POS.slice()};
  return {error:"Type a coordinate above, or search a cell first \\u2014 the viewer has to open somewhere."};
}

/* Pre-fill from the cell on screen, but only when nothing has been typed, so it never overwrites
   him. Runs on load and every time the card is opened, because he may search a cell after opening
   it and the boxes should follow. */
function tracingFillPos(){
  const ids=["tracingX","tracingY","tracingZ"];
  const els=ids.map(function(i){return document.getElementById(i);});
  if(els.some(function(e){return !e;}))return;
  if(els.some(function(e){return String(e.value||"").trim()!=="";}))return;
  if(!(window.CUR_POS&&window.CUR_POS.length===3))return;
  els.forEach(function(e,i){e.value=window.CUR_POS[i];});
}

function tracingOpen(){
  const got=tracingPos();
  if(got.error){tracingSay(got.error,true);return;}
  const pos=got.pos;
  let st;
  try{st=buildState(pos);}catch(e){tracingSay("Could not build a viewer link: "+String(e&&e.message||e),true);return;}
  /* The Cortical layers bands are `line` annotations in a local annotation layer, so leaving them
     on the link he traces over means ringsFromLink() chains them in with his contours into rings
     that span the dataset. They are also a thick grid over the picture he is trying to draw on. */
  st.layers=(st.layers||[]).filter(function(l){
    return !(l&&l.type==="annotation"&&/cortical layers/i.test(String(l.name||"")));});
  st.layers=st.layers.filter(function(l){return !(l&&l.type==="annotation"&&l.name==="tracing");});
  /* annotatePoint, not annotateLine: no viewer a link can reach has a polygon tool (measured
     2026-09-17 -- the MICrONS viewer has four tools and Spelunker's polyline never serialises), and
     of what is left the point tool is one ctrl+click per vertex against the line tool's two, with
     the clicks stored in order. core/tracing.js reads either. */
  st.layers.push({type:"annotation",source:"local://annotations",tool:"annotatePoint",
                  tab:"annotations",name:"tracing",annotations:[]});
  st.selectedLayer={layer:"tracing",visible:true};
  st.layout="xy";   // tracing happens on sections; the 3D pane only takes the width
  const viewerEl=document.getElementById("viewer");
  const base=(viewerEl&&viewerEl.value)||"https://spelunker.cave-explorer.org/";
  window.open(base+"#!"+encodeURIComponent(JSON.stringify(st)),"_blank","noopener");
  tracingSay("Viewer opened at "+pos.join(", ")+", on a layer called \\u201ctracing\\u201d with the point "
    +"tool live. Ctrl+click round the cell, one click per vertex; , and . step a section. There is no "
    +"polygon tool in any viewer a link can reach \\u2014 points are the fast way. Paste the address bar back here.");
}

/* ── ADDING A TRACING IS SHARING IT ─────────────────────────────────────────────  2026-09-17
   One button. The tracing is kept in this page -- so the 3D export works signed out and with no
   backend at all -- and posted to the shared record in the same press.

   SIGNED OUT IT QUEUES, IT DOES NOT REFUSE. Attribution needs a verified Google identity, and
   stopping there would be the old two-button behaviour wearing one button's clothes. So it is kept
   with `pending_share` on it, the list says so, and tracingFlush() sends it as soon as a sign-in
   appears. */
function tracingKeep(){
  const t=tracingCurrent();
  if(!t)return;
  // Keeping the same tracing twice used to put the cell in the Blender scene twice.
  const at=TRACINGS_KEPT.findIndex(function(x){return x&&x.id&&x.id===t.id;});
  const prior=at>=0?TRACINGS_KEPT[at]:null;
  if(prior&&prior.shared_at)t.shared_at=prior.shared_at;
  t.pending_share=true;
  if(at>=0)TRACINGS_KEPT.splice(at,1,t); else TRACINGS_KEPT.push(t);
  tracingWrite(TRACINGS_KEPT);
  TRACING_PENDING=null;
  document.getElementById("tracingFound").style.display="none";
  document.getElementById("tracingLink").value="";
  const sent=tracingPublish(t);
  tracingRenderList();
  tracingSay(sent
    ?'\\u201c'+t.name+'\\u201d is in the dataset and in this page\\u2019s 3D export. Anybody can open '
     +'it from the list at the bottom of this card and add to it \\u2014 that becomes its next '
     +'version, with their name beside yours, and nothing of this one is deleted.'
    :'\\u201c'+t.name+'\\u201d is kept here and in your 3D export. It has NOT reached the dataset yet '
     +'\\u2014 sign in with Google (the account button, top right) and it goes up on its own.');
  tracingFlushSoon();
}

/* Returns whether it went. `quiet` is for the automatic flush, which must not fire a sign-in
   prompt at somebody who did not just press anything. */
function tracingPublish(t,quiet){
  if(!t||!t.rings||!t.rings.length)return false;
  const signedIn=(typeof GOOGLE_VERIFIED!=="undefined"&&GOOGLE_VERIFIED)
                &&(typeof GOOGLE_CREDENTIAL!=="undefined"&&GOOGLE_CREDENTIAL);
  if(!signedIn){
    if(!quiet&&typeof reportGateBlock==="function")reportGateBlock();   // offers the prompt itself
    return false;
  }
  /* ONE POST FOR THE WHOLE TRACING.  2026-09-17
     The geometry no longer goes into the sheet -- the backend writes it to a JSON file in Drive and
     keeps one index row -- so a share is one submission carrying every contour, where it used to be
     one POST per contour. groupId names this act of sharing: it is half of the key the backend
     versions on, and it is in the file's name. */
  const gid="trace_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
  const sub=UJ.tracing.toSubmission(t.rings,{structureId:t.id,name:t.name,kind:t.kind||"",
                                             cellType:t.type,color:t.color,
                                             nucleusId:t.nucleus_id||"",rootId:t.root_id||""});
  if(!sub.contours.length)return false;
  const ok=postReport(Object.assign({timestamp:new Date().toISOString(),groupId:gid},sub),
                      "Tracing added to the dataset \\u2014 thank you.");
  if(ok===false)return false;
  t.pending_share=false;
  t.shared_at=new Date().toISOString();
  tracingWrite(TRACINGS_KEPT);
  return true;
}

var TRACING_FLUSH_TIMER=null;
function tracingPendingCount(){
  return (TRACINGS_KEPT||[]).filter(function(t){return t&&t.pending_share;}).length;
}
function tracingFlush(){
  if(!tracingPendingCount())return 0;
  var n=0;
  TRACINGS_KEPT.forEach(function(t){ if(t&&t.pending_share&&tracingPublish(t,true))n++; });
  if(n){ tracingWrite(TRACINGS_KEPT); tracingRenderList();
         tracingSay(n+" tracing"+(n===1?"":"s")+" went into the dataset now that you are signed in."); }
  return n;
}
/* POLLED, RATHER THAN HOOKED ONTO THE SIGN-IN. A credential arrives in this file from at least
   three places -- Google One Tap, the account chip's own flow, and a token restored on load -- and
   none of them is one event a card can listen to. The timer exists only while something is waiting
   and stops itself the moment nothing is, so signed in with an empty queue it never runs at all. */
function tracingFlushSoon(){
  if(TRACING_FLUSH_TIMER)return;
  TRACING_FLUSH_TIMER=setInterval(function(){
    if(!tracingPendingCount()){clearInterval(TRACING_FLUSH_TIMER);TRACING_FLUSH_TIMER=null;return;}
    tracingFlush();
  },4000);
}
/* ── THE SHAPE, WHILE IT IS STILL BEING MADE ────────────────────────────────────  2026-09-17
   Søren: *"there should also be a window below to show the 3D structure while it is being
   generated, so the user can get a view of what it looks like. Preferably also with the nucleus and
   root ID meshes as transparent. Perhaps this should be an option, rather than it loading
   immediately if it is slow to load."*

   Three things, and they cost wildly different amounts, which is why they are wired differently:

     THE TRACING is lofted by core/traceloft.js -- a millisecond for a forty-section cell -- so it
     is redrawn after every contour, with no ceremony and no asking.

     THE GHOSTS (the cell's own mesh for the root ID, the nucleus's for the nucleus ID) are
     megabytes over the network. They are fetched ONCE per (root, nucleus) pair, kept, and reused
     for every redraw after that; the checkbox turns them off for anyone who does not want to pay
     for them at all. This is the "perhaps this should be an option" he asked for, and the whole
     panel is behind a button for the same reason.

   IT IS NOT THE EXPORT'S SURFACE, and the panel says so. trace_mesh.py fills each section under the
   even-odd rule and marches cubes over the blend, so it treats a contour inside another as a hole
   and smooths across a skipped section. This lofts. On one closed outline per section -- which is
   what tracing a cell looks like -- they agree about the silhouette and differ in smoothness. */
var PAD3D_ON = false, PAD3D_BUSY = false, PAD3D_AT = 0, PAD3D_SOON = null;
var PAD3D_MESHES = null, PAD3D_KEY = "", PAD3D_NOTE = "";
/* The camera, kept across redraws. Without this, closing a contour snapped the view back to its
   starting angle -- which is exactly the moment somebody has just turned the cell to look at the
   part they are drawing. core/mesh3d.js mutates this object as the pointer drags it, so handing the
   same one back is all it takes. */
var PAD3D_VIEW = { yaw: 0.6, pitch: 0.3, dist: 1.9 };

function pad3DHost(){ return document.getElementById("tracePad3DHost"); }

/* The contours in hand: the pad's, or a tracing read from a pasted link if the pad is not the way
   it was made. */
function pad3DRings(){
  if (PAD && PAD.rings && PAD.rings.length) return UJ.tracepad.toRings(PAD);
  if (TRACING_PENDING && TRACING_PENDING.rings) return TRACING_PENDING.rings;
  return [];
}

/* A WebGL context per redraw would be a context leak with a browser-enforced limit -- "too many
   active WebGL contexts: oldest context will be lost" is a real message, and the oldest context on
   this page belongs to somebody's cell panel. Asking a canvas for its context again returns the
   SAME one, so this reaches the outgoing panel's context without the renderer having to hand it
   out. */
function pad3DRelease(){
  const h = pad3DHost(); if (!h) return;
  const cv = h.querySelector("canvas"); if (!cv) return;
  try {
    const gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
    const e = gl && gl.getExtension("WEBGL_lose_context");
    if (e) e.loseContext();
  } catch (_e){}
}

function pad3DIds(){
  const nuc = (document.getElementById("tracingNucId").value || "").trim();
  const root = (document.getElementById("tracingRootId").value || "").trim();
  return { nuc: nuc, root: root, key: root + "|" + nuc };
}

/* Fetched once per pair of ids and kept. Neither failure is fatal: a cell with no mesh and a
   nucleus with none are both ordinary -- tracing is what you do when the segmentation has missed
   something -- so each is reported in the note and the rest still draws. */
async function pad3DGhostMeshes(){
  const ids = pad3DIds();
  if (PAD3D_MESHES && PAD3D_KEY === ids.key) return PAD3D_MESHES;
  const out = [], notes = [];
  if (ids.root && ids.root !== "0" && typeof MeshDL !== "undefined" && MeshDL.fetchCombinedMesh){
    try {
      const m = await MeshDL.fetchCombinedMesh(ids.root, function(f, msg){
        pad3DNote("fetching the cell’s mesh… " + (msg || Math.round((f || 0) * 100) + "%"));
      });
      if (m && m.positions && m.positions.length) out.push({ what: "cell", mesh: m });
      else notes.push("the cell has no mesh to draw");
    } catch (e){ notes.push("the cell’s mesh could not be read: " + String(e && e.message || e)); }
  }
  if (ids.nuc && UJ.nucmesh){
    try {
      if (!UJ.nucmesh.configured()) UJ.nucmesh.configure({ nuc: SRC.nuc });
      pad3DNote("fetching the nucleus’ mesh…");
      const n = await UJ.nucmesh.fetchNucleus(ids.nuc);
      if (n && n.positions.length) out.push({ what: "nucleus", mesh: n });
      else notes.push("nucleus " + ids.nuc + " has no mesh in the nuclei volume");
    } catch (e){ notes.push("the nucleus mesh could not be read: " + String(e && e.message || e)); }
  }
  PAD3D_MESHES = out; PAD3D_KEY = ids.key; PAD3D_NOTE = notes.join("; ");
  return out;
}

function pad3DNote(msg){
  const h = pad3DHost();
  if (h) h.innerHTML = '<p class="hint">' + escHtml(msg) + "</p>";
}

async function pad3DDraw(){
  if (!PAD3D_ON || PAD3D_BUSY) return;
  const host = pad3DHost(); if (!host) return;
  const rings = pad3DRings();
  if (!rings.length){
    pad3DNote("Close a contour and the shape appears here.");
    return;
  }
  PAD3D_BUSY = true;
  try {
    const res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    const g = UJ.traceloft.loft(rings, res);
    let ghosts = [];
    const wantGhosts = !!(document.getElementById("tracePadGhosts") || {}).checked;
    if (wantGhosts) ghosts = await pad3DGhostMeshes();

    /* ONE FRAME FOR ALL THREE, centred on the tracing. A cell mesh is tens of micrometres and a
       tracing is a few, so letting each centre on itself would draw them concentric -- which looks
       right and is a lie about where the tracing sits in the cell. The span is opened out when
       there are ghosts so the surroundings are visible rather than filling the view; the tracing is
       still the subject, and the wheel does the rest. */
    const first = UJ.mesh3d.prepare(g.positions, g.indices, { unitNm: 1 });
    if (first.empty){ pad3DNote("Nothing to draw yet."); PAD3D_BUSY = false; return; }
    const frame = { mid: first.mid, span: first.span * (ghosts.length ? 2.5 : 1) };
    const geo = UJ.mesh3d.prepare(g.positions, g.indices, { unitNm: 1, frame: frame });
    const drawn = ghosts.map(function(x){
      return { geo: UJ.mesh3d.prepare(x.mesh.positions, x.mesh.indices,
                                      { unitNm: 1000, frame: frame }),
               /* The cell fainter than the nucleus: it is the larger surface and the one you are
                  most often looking THROUGH. */
               alpha: x.what === "cell" ? 0.14 : 0.3,
               tint: x.what === "cell" ? [0.55, 0.62, 0.78] : [0.85, 0.62, 0.45] };
    });
    pad3DRelease();
    const um = [0, 1, 2].map(function(i){ return (first.hi[i] - first.lo[i]) / 1000; });
    let lead = "<b>A preview, not the export’s surface.</b> <span class='hint'>The contours "
      + "lofted section to section — " + g.contours + " contour" + (g.contours === 1 ? "" : "s")
      + " on " + g.sections + " section" + (g.sections === 1 ? "" : "s") + ", "
      + um.map(function(v){ return v.toFixed(1); }).join(" × ") + " µm. The Blender export "
      + "fills each section and marches cubes over the stack, which is smoother and treats a "
      + "contour drawn inside another as a hole.</span>";
    if (g.flat)
      lead += "<br><span class='hint'>One section only, so this is a flat outline. Step with "
        + "<b>,</b> or <b>.</b> and go round again to give it a shape.</span>";
    if (drawn.length)
      lead += "<br><span class='hint'>See-through around it: "
        + drawn.map(function(d, i){ return ghosts[i].what; }).join(" and ") + ".</span>";
    if (PAD3D_NOTE && wantGhosts)
      lead += "<br><span class='hint'>" + escHtml(PAD3D_NOTE) + ".</span>";
    UJ.mesh3d.show(host, geo, { lead: lead, ghosts: drawn, view: PAD3D_VIEW,
                                emptyMessage: "Nothing to draw yet." });
  } catch (e){
    pad3DNote("Could not build the preview: " + String(e && e.message || e));
  }
  PAD3D_BUSY = false;
}

/* Coalesced. Closing a contour, deleting one and dragging a point all ask for a redraw, and a drag
   asks on every frame of it; rebuilding the whole loft each time would make the pad stutter on the
   one gesture that has to stay smooth. */
function pad3DSoon(){
  if (!PAD3D_ON) return;
  if (PAD3D_SOON) return;
  const wait = Math.max(0, 250 - (Date.now() - PAD3D_AT));
  PAD3D_SOON = setTimeout(function(){
    PAD3D_SOON = null; PAD3D_AT = Date.now(); pad3DDraw();
  }, wait);
}

/* ── THE DATASET'S TRACINGS, AND ADDING TO ONE ──────────────────────────────────  2026-09-17
   Søren: *"other people should be able to add to it or edit it."*

   The index is one sheet scan on the backend and opens no Drive files, so listing is cheap enough
   to do on a button press; only the tracing you choose to open is fetched. Opening one puts its
   contours in the pad as ordinary contours -- every one of them movable, deletable, extendable,
   because they are the same kind of thing the pad makes -- and keeps its structureId, so adding it
   again is the NEXT VERSION of that tracing rather than a rival to it. Nothing is overwritten: the
   older file and the older row both stay. */
var TRACING_SHARED = [], PAD_EDIT_ID = "";

async function tracingBrowse(){
  const host = document.getElementById("tracingShared");
  if (!host) return;
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT){
    host.innerHTML = '<p class="hint">This page has no backend configured, so there is nothing to '
      + "read yet.</p>";
    return;
  }
  host.innerHTML = '<p class="hint">Reading the dataset’s tracings…</p>';
  try {
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1");
    const d = await r.json();
    TRACING_SHARED = (d && d.tracings) || [];
    tracingRenderShared();
  } catch (e){
    host.innerHTML = '<p class="hint" style="color:var(--bad)">Could not read them: '
      + escHtml(String(e && e.message || e)) + ". If the backend has not been redeployed since "
      + "2026-09-17 it does not answer this question yet.</p>";
  }
}

function tracingRenderShared(){
  const host = document.getElementById("tracingShared");
  if (!host) return;
  if (!TRACING_SHARED.length){
    host.innerHTML = '<p class="hint">Nothing has been traced into the dataset yet. Yours would be '
      + "the first.</p>";
    return;
  }
  /* Newest first: the one somebody is working on now is the one most likely to be wanted. */
  const list = TRACING_SHARED.slice().sort(function(a, b){
    return String(b.timestamp || "").localeCompare(String(a.timestamp || ""));
  });
  host.innerHTML = '<label>In the dataset — open one to add to it or correct it</label>'
    + list.map(function(t, i){
        const who = (t.contributors && t.contributors.length) ? t.contributors.join(", ")
                                                              : (t.tracedBy || "");
        return '<div style="display:flex;align-items:center;gap:8px;border-top:1px solid var(--line);'
          + 'padding:5px 0;font-size:12px;flex-wrap:wrap">'
          + '<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
            + escHtml(t.color || "#3a6b5a") + '"></span>'
          + '<span style="flex:1 1 160px;min-width:0">' + escHtml(t.name || t.structureId)
            + (t.cellType ? ' <span style="opacity:.7">&middot; ' + escHtml(t.cellType) + '</span>' : "")
            + '</span>'
          + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"
            + ((t.contours === 1) ? "" : "s") + " on " + (t.sections || 0) + " section"
            + ((t.sections === 1) ? "" : "s") + '</span>'
          + '<span style="opacity:.7;flex:1 1 140px;min-width:0" title="Everyone who has added a '
            + 'version of this tracing, in the order they first did.">' + escHtml(who)
            + ((t.versions > 1) ? " &middot; v" + t.versions : "") + '</span>'
          + '<button class="idbtn tracingopen" data-sid="' + escHtml(t.structureId) + '" '
            + 'style="padding:2px 9px;font-size:12px;flex:0 0 auto">Open it in the pad</button>'
          + (t.fileUrl ? ' <a href="' + escHtml(t.fileUrl) + '" target="_blank" rel="noopener" '
              + 'style="font-size:12px;opacity:.7" title="The tracing’s own file in Drive">file</a>' : "")
          + '</div>';
      }).join("");
  [].slice.call(host.querySelectorAll(".tracingopen")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenShared(b.dataset.sid, b); });
  });
}

async function tracingOpenShared(sid, btn){
  const label = btn ? btn.textContent : "";
  if (btn){ btn.disabled = true; btn.textContent = "opening…"; }
  try {
    const r = await fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(sid));
    const d = await r.json();
    const t = ((d && d.tracings) || [])[0];
    if (!t) throw new Error("the dataset has no tracing with that id any more");
    if (t.error) throw new Error(t.error);
    const st = UJ.tracing.rowsToStructures(t.rows || [])[0];
    if (!st || !st.rings.length) throw new Error("that tracing came back with no contours on it");

    if (!UJ.emtiles.configured())
      UJ.emtiles.configure({ em: SRC.em, res: UJ.cfg ? UJ.cfg.res : [4, 4, 40] });
    PAD = UJ.tracepad.create();
    PAD.rings = st.rings.map(function(r){
      return { z: Math.round(r.z),
               points: r.points.map(function(p){ return [Math.round(p[0]), Math.round(p[1])]; }) };
    });
    PAD.z = PAD.rings[0].z;
    /* Opened ON the first contour, not at whatever coordinate was in the boxes: the whole point of
       opening somebody's tracing is to see it. */
    const p0 = PAD.rings[0].points;
    let cx = 0, cy = 0;
    p0.forEach(function(p){ cx += p[0]; cy += p[1]; });
    PAD_CENTRE = [Math.round(cx / p0.length), Math.round(cy / p0.length), PAD.z];
    PAD_VIEW = null; PAD_PAINTING = false;
    document.getElementById("tracePadWrap").style.display = "";
    padDraw();

    /* The identity travels with it, so adding a version does not quietly drop the cell type or the
       ids somebody else filled in. */
    PAD_EDIT_ID = st.structureId;
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: st.structureId };
    const what = document.getElementById("tracingWhat");
    if (what){
      const has = [].slice.call(what.options).some(function(o){ return o.value === st.kind; });
      what.value = (st.kind && has) ? st.kind : (st.kind ? "__other" : "__cell");
      document.getElementById("tracingNameRow").style.display =
        (what.value === "__other") ? "" : "none";
      if (what.value === "__other") document.getElementById("tracingName").value = st.name || "";
    }
    if (st.color) document.getElementById("tracingColor").value = st.color;
    if (st.nucleusId) document.getElementById("tracingNucId").value = st.nucleusId;
    if (st.rootId) document.getElementById("tracingRootId").value = st.rootId;
    const typeSel = document.getElementById("tracingType");
    if (typeSel && st.cellType){
      const opt = [].slice.call(typeSel.options).filter(function(o){ return o.value === st.cellType; })[0];
      if (opt){ typeSel.value = st.cellType; TRACING_TYPE_TOUCHED = true; }
    }
    document.getElementById("tracingFound").style.display = "";
    const who = (t.contributors && t.contributors.length) ? t.contributors.join(", ")
                                                          : (t.tracedBy || "somebody");
    tracingSay("“" + (st.name || st.structureId) + "” is in the pad — "
      + st.rings.length + " contour" + (st.rings.length === 1 ? "" : "s") + " by " + who + ", "
      + "version " + (t.versions || 1) + ". Every point can be moved, deleted or added to, and "
      + ", and . step between the sections it was drawn on. Press “Use these contours” and "
      + "then add it again to make your version the current one — nothing of theirs is deleted.");
    if (PAD3D_ON){ PAD3D_MESHES = null; pad3DSoon(); }
  } catch (e){
    tracingSay("Could not open that tracing: " + String(e && e.message || e), true);
  }
  if (btn){ btn.disabled = false; btn.textContent = label; }
}

/* ── THE PAD ─────────────────────────────────────────────────────────────────────  2026-09-17
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
  /* The preview follows the contours from here: this is called after every close, every delete and
     every reload of a section, which is every way the set of rings can change. */
  pad3DSoon();
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
  /* A FRESH PAD IS A FRESH STRUCTURE. Opening the pad after editing somebody's tracing must not
     leave its id attached, or the next cell you draw would be filed as the next version of theirs.
     The ghosts go too: they belong to the ids that were in the boxes. */
  PAD_EDIT_ID = ""; TRACING_PENDING = null; PAD3D_MESHES = null; PAD3D_KEY = "";
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
    /* The panel goes with the pad, and its context is handed back rather than left for the browser
       to reclaim when it runs out. */
    pad3DRelease(); PAD3D_ON = false;
    const h3 = document.getElementById("tracePad3DHost"); if (h3) h3.innerHTML = "";
  });
  const p3 = document.getElementById("tracePad3D");
  if (p3) p3.addEventListener("click", function(){
    PAD3D_ON = !PAD3D_ON;
    p3.textContent = PAD3D_ON ? "Hide the 3D view" : "Show it in 3D";
    if (PAD3D_ON){ PAD3D_AT = 0; pad3DDraw(); }
    else { pad3DRelease(); const h = pad3DHost(); if (h) h.innerHTML = ""; }
  });
  const pg = document.getElementById("tracePadGhosts");
  if (pg) pg.addEventListener("change", function(){ PAD3D_AT = 0; pad3DDraw(); });
  document.getElementById("tracePadUse").addEventListener("click", function(){
    const rings = UJ.tracepad.toRings(PAD);
    const sections = new Set(rings.map(function(r){ return r.z; }));
    if (sections.size < 2){
      padSay("Outline the cell on at least two sections \\u2014 a flat outline has no surface to "
        + "close. Step with , and . and go round again.", true);
      return;
    }
    /* THE ID SURVIVES THE PAD. Editing a tracing opened from the dataset and pressing this must
       produce the NEXT VERSION of it, not a rival; PAD_EDIT_ID is set by tracingOpenShared() and
       cleared by padOpen(), so a pad opened fresh carries nothing. */
    TRACING_PENDING = { rings: rings, id: PAD_EDIT_ID || undefined };
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
      if (wasDrag){ padPaint(); pad3DSoon();
        padSay("Point moved. Right-click a point to delete it, or a line "
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
  /* THERE IS NO SHARE BUTTON ANY MORE. Søren, 2026-09-17: "I think sharing should not be an option,
     the meshes made should always be a part of the dataset." tracingKeep() does both halves. */
  const browse=document.getElementById("tracingBrowse");
  if(browse)browse.addEventListener("click",function(){tracingBrowse();});
  /* Anything left over from a session that ended signed out goes up as soon as one appears. */
  if(tracingPendingCount())tracingFlushSoon();
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
s = replace_region(s, '/* \u2500\u2500 TRACING A CELL THE SEGMENTATION DOES NOT HAVE',
                      '})();\n\n/* \u2500\u2500 BULK ORGANELLE ANNOTATION',
                   SCRIPT + '\n\n/* \u2500\u2500 BULK ORGANELLE ANNOTATION',
                   "the tracing script block, the pad, the preview and the wiring")
io.open(p, "w", encoding="utf-8").write(s)
print("\nnow: node tracingcheck.js && node tracepadcheck.js && node tracingpanelcheck.js")
