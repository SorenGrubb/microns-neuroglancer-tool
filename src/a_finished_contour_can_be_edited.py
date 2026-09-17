"""A finished contour is not finished, and a root id is not a nucleus id.             2026-09-17

Søren, on the card and the pad:

  *"Here it says nucleus ID but it is a root ID. That should be fixed so that we don't call it
  nucleus ID when it is a root ID. Also, from the root ID or nucleus ID it should suggest what cell
  type it is based on the cell identity. We also need a way to delete segmentations and correct if a
  line in the polyline is placed wrongly. Also, after the segmentation is done, it should be
  possible to move the polyline points individually."*

FOUR THINGS, and the first one is a lesson about placeholders.

1. **The label was a placeholder, so the filled box had no label at all.** The two id boxes sat side
   by side, the nucleus one empty and showing "Nucleus ID", the root one holding
   864691135570733037 and showing nothing -- because a filled input hides its placeholder. So the
   only words on the row named the wrong box. They are real labels now, above the fields, and they
   stay visible with a value in them. A placeholder is a hint about what to type, never a name for
   what is there.

2. **The identity is looked up, not asked for.** From either id, by the same precedence everything
   else in this tool uses -- own-verified, then the community's report, then the MICrONS prediction
   -- and the matching entry in "Which cell is it part of?" is selected, with a line saying which of
   the three it came from. A guess presented without its provenance is worse than no guess. It never
   overrides a choice already made by hand.

3. **A closed contour can be corrected.** Drag a vertex to move it, right-click one to delete it,
   right-click or double-click a segment to put a vertex in the middle of it. Until now a closed
   contour was finished and Undo threw the whole thing away, so one bad vertex out of forty cost the
   other thirty-nine. The rules are in core/tracepad.js, which has no DOM in it, and
   tracepadcheck.js drives them -- including that the segment CLOSING a ring is editable like any
   other, which is exactly the one an implementation over `pts.length - 1` leaves out.

4. **A contour can be deleted on its own.** The contours on the section you are on are listed under
   the pad, each with its own delete, so "delete this one" does not mean "undo until it is gone".

WHY A DRAG IS NOT ALWAYS A PAN ANY MORE. It is, unless it starts on a vertex: grabbing a point is
what a person expects from a point they can see, and panning is still there everywhere else on the
canvas and on shift+drag. The pointer says which is about to happen -- `grab` over a vertex, `copy`
over a segment, `crosshair` otherwise -- so the mode is visible before the click, not after it.

Run: python3 src/a_finished_contour_can_be_edited.py
     node tracepadcheck.js && node tracingpanelcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CARD = [
    ('''<div class="row" style="gap:8px;margin-top:8px">
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingNucId" placeholder="Nucleus ID"></div>
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingRootId" placeholder="Root ID (the cell)"></div>
</div>''',
     '''<!-- LABELS, NOT PLACEHOLDERS.  2026-09-17. Søren: "Here it says nucleus ID but it is a root
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
</div>''',
     "the id boxes carry labels that stay visible when filled"),
]

SUGGEST = [
    ('''/* WHAT IS ALREADY THERE, READ RATHER THAN ASKED FOR.  2026-09-17''',
     '''/* WHAT THE REST OF THE TOOL WOULD CALL THIS CELL.  2026-09-17
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

/* WHAT IS ALREADY THERE, READ RATHER THAN ASKED FOR.  2026-09-17''',
     "the cell type is suggested from either id"),

    ('''    say.textContent=bits.length
      ? "At that coordinate: "+bits.join(", ")+" \\u2014 filled in below."
      : "Nothing is segmented at that coordinate, which is usually why you are tracing it.";''',
     '''    say.textContent=bits.length
      ? "At that coordinate: "+bits.join(", ")+" \\u2014 filled in below."
      : "Nothing is segmented at that coordinate, which is usually why you are tracing it.";
    tracingSuggestType();''',
     "reading the coordinate also suggests the type"),

    ('''<label style="margin-top:10px">Which cell is it part of?</label>
<div class="row" style="gap:8px">
<select id="tracingType" style="flex:2 1 auto" title="The cell type this structure belongs to. It becomes the collection the object lands in when the Blender scene is built."></select>
</div>''',
     '''<label style="margin-top:10px">Which cell is it part of?</label>
<div class="row" style="gap:8px">
<select id="tracingType" style="flex:2 1 auto;min-width:0" title="The cell type this structure belongs to. It becomes the collection the object lands in when the Blender scene is built. Suggested from the nucleus or root ID below, by the same precedence the rest of the tool uses: verified, then community-reported, then the MICrONS prediction."></select>
</div>
<p class="hint" id="tracingTypeSay" style="margin-top:4px"></p>''',
     "the card has somewhere to say where the suggestion came from"),

    ('''  ["tracingX","tracingY","tracingZ"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("focus",function(){try{el.select();}catch(_e){}});
  });''',
     '''  ["tracingX","tracingY","tracingZ","tracingNucId","tracingRootId"].forEach(function(id){
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
  if(typeSel)typeSel.addEventListener("change",function(){TRACING_TYPE_TOUCHED=true;});''',
     "an id typed by hand suggests too, and a hand-picked type is never overwritten"),
]

PAD = [
    # a place to list the contours on this section, each with its own delete
    ('''<p class="hint" id="tracePadSay" style="margin-top:6px">''',
     '''<div id="tracePadRings" style="margin-top:6px"></div>
<p class="hint" id="tracePadSay" style="margin-top:6px">''',
     "the pad lists the contours on this section"),

    ('''<b>Shift+click</b> moves the field there, shift+drag or a plain drag pans it, and <b>,</b> and <b>.</b> step a section.</p>''',
     '''<b>Shift+click</b> moves the field there, shift+drag or a plain drag pans it, and <b>,</b> and <b>.</b> step a section.<br>
Afterwards: <b>drag a point</b> to move it, <b>right-click a point</b> to delete it, <b>right-click or double-click a line</b> to put a new point in the middle of it.</p>''',
     "and says how a finished contour is corrected"),

    # closed rings show their vertices, so there is something to grab
    ('''    g.strokeStyle = "#40e28c"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "rgba(64,226,140,.14)"; g.fill();
  });''',
     '''    g.strokeStyle = "#40e28c"; g.lineWidth = 2; g.stroke();
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
  }''',
     "a closed contour shows its points, and the one under the pointer"),

    # the contour list, redrawn with the pad
    ('''    padPaint();
    padSay(UJ.tracepad.count(PAD).rings + " contour(s) kept, "''',
     '''    padPaint();
    padRings();
    padSay(UJ.tracepad.count(PAD).rings + " contour(s) kept, "''',
     "the contour list follows the section"),

    ('''function padZLabel(){''',
     '''/* One chip per contour on this section, each with its own delete. "Delete this one" should not
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

function padZLabel(){''',
     "each contour on this section has its own delete"),

    # grabbing, moving, deleting and inserting
    ('''  var down = null, moved = false;
  cv.addEventListener("pointerdown", function(e){
    if (!PAD_VIEW) return;
    down = [e.offsetX, e.offsetY]; moved = false;
    cv.setPointerCapture(e.pointerId);
  });''',
     '''  var down = null, moved = false, dragging = null;
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
  });''',
     "a drag that starts on a vertex grabs it"),

    ('''  cv.addEventListener("pointermove", function(e){
    PAD_HOVER = PAD_VIEW ? PAD_VIEW.toolAt(e.offsetX, e.offsetY) : null;
    if (down && (Math.abs(e.offsetX - down[0]) > 3 || Math.abs(e.offsetY - down[1]) > 3)) moved = true;
    if (!down && PAD_VIEW && PAD.pending.length) padPaint();
  });''',
     '''  cv.addEventListener("pointermove", function(e){
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
  });''',
     "the vertex follows the pointer, and the cursor says what a click would do"),

    ('''  cv.addEventListener("pointerup", function(e){
    if (!PAD_VIEW || !down) return;
    const wasPan = moved;
    const from = down; down = null;''',
     '''  cv.addEventListener("pointerup", function(e){
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
    }''',
     "letting go of a dragged vertex leaves it where it was dropped"),

    ('''  cv.addEventListener("dblclick", function(){
    if (UJ.tracepad.closeRing(PAD)){ padPaint(); padSay("Contour closed."); }
  });''',
     '''  cv.addEventListener("dblclick", function(e){
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
  }''',
     "right-click deletes a point or adds one to a line"),

    ('''    const r = UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
    padPaint();''',
     '''    const r = UJ.tracepad.addVertex(PAD, t[0], t[1], PAD_VIEW.pxPerToolVoxel);
    padPaint();
    if (r.closed) padRings();''',
     "closing a contour updates the list"),

    ('''  document.getElementById("tracePadUndo").addEventListener("click", function(){
    UJ.tracepad.undo(PAD); padPaint(); padSay("Undone.");
  });''',
     '''  document.getElementById("tracePadUndo").addEventListener("click", function(){
    UJ.tracepad.undo(PAD); padPaint(); padRings(); padSay("Undone.");
  });''',
     "and so does Undo"),
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


edit("ujump.html", CARD + SUGGEST + PAD)
print("\nnow: node tracepadcheck.js && node tracingpanelcheck.js")
