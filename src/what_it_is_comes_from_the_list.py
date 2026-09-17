"""A traced structure says what it is from the list, not from a text box.             2026-09-17

Søren, after tracing a lysosome on nine sections and typing "Lysosome" into a free-text field:
*"Instead of free text, we need it to have a dropdown to select an organelle type like the list we
have for identification of organelles. There should be one option to input an organelle type only
if it does not exist on the list. If it is a nucleus, the user should be able to select nucleus and
if it is the entire cell's mesh, then the user should be able to select that. Those should be in the
top of the list. If the nucleus or cell mesh already exists at the location put in the coordinates,
those should be prefilled."*

Free text was the wrong shape, and it was mine. Every other structure this project records comes
from the ontology -- the organelle card, the bulk paste, the filter and the dashboard all key on the
same kinds -- and a tracing typed "Lysosome" one day and "lysosome" the next is two things to every
one of them. The list was already there: `UJ.organelles.optionsHtml()` renders it <optgroup> by
<optgroup>, and has since the organelle card was built.

FOUR CHANGES.

1. **The list, with the two whole-object answers on top.** "Whole cell -- the cell's own mesh" and
   "Nucleus" first, because they are what somebody outlines when the segmentation has missed a cell
   and they are not organelles. Then the ontology, unchanged. Then, last, "Something else -- type
   the name", the only door to a text box: a kind that has to be typed is a kind the ontology is
   missing, and it should feel like the exception it is.

2. **The kind travels with the tracing.** `kind` is the ontology's own value ("lysosome"), `name` is
   its label, and both go into the shared rows, the read-back and the Blender export.

3. **The cell is read, not asked for.** core/segread.js already answers "what root id and what
   nucleus id are at this voxel" from the same segmentation the rest of the tool uses, so opening
   the pad resolves the coordinate and the two id boxes fill themselves. It never overwrites
   something already typed, and it SAYS what it found -- a prefilled id nobody explains is a number
   to distrust, and "nothing is segmented there" is itself the answer when the reason for tracing is
   that the segmentation has missed the cell.

4. **Magnification, separate from the mip.** The zoom list stopped at 8 nm/px, which is where the
   data stops; a lysosome is about 500 nm, sixty pixels, and he was tracing one. `zoom` draws each
   source voxel as zoom x zoom screen pixels, so the pad can go closer than the data does. It costs
   nothing extra to fetch -- the window in VOXELS shrinks as the magnification grows -- and the
   label says "8 nm data" rather than pretending the resolution improved.

   (Søren, mid-change: *"I see the zoom level is already there. so nevermind that."* The selector
   was; what it could not do was go past the finest mip, which is the case he was in.)

The pad's own markup and pointer handling stay in src/a_polygon_tool_of_our_own.py, which owns that
region. This file touches the tile reader, the row format, the notebook parameters and the CARD.

Run: python3 src/what_it_is_comes_from_the_list.py
     node emtilescheck.js && node tracingcheck.js && node tracingpanelcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# -- core/emtiles.js: magnification on top of the mip --------------------------------------------
EMTILES = [
    ('''    var got = await scaleAt(opts.mip == null ? 1 : opts.mip);
    var scale = got.scale;
    var w = Math.max(16, opts.w | 0), h = Math.max(16, opts.h | 0);
    var c = toScale(scale, opts.centre);
    var x0 = c[0] - (w >> 1), y0 = c[1] - (h >> 1), z = c[2];''',
     '''    var got = await scaleAt(opts.mip == null ? 1 : opts.mip);
    var scale = got.scale;
    /* MAGNIFICATION, SEPARATE FROM THE MIP.  2026-09-17
       The mip list stops at 8 nm/px, and a lysosome is about 500 nm -- sixty pixels, which is not
       enough to put vertices on. `zoom` draws each source voxel as zoom x zoom screen pixels, so
       the canvas can go closer than the data does. Nothing is invented: at zoom 4 you are looking
       at 8 nm voxels four pixels wide, and the label says "8 nm data" rather than pretending the
       resolution improved. It also costs nothing extra to fetch -- the window in VOXELS shrinks as
       the magnification grows, so this is the only kind of zoom here that is free. */
    var zoom = Math.max(1, Math.min(16, opts.zoom | 0 || 1));
    var w = Math.max(16, opts.w | 0), h = Math.max(16, opts.h | 0);
    var vw = Math.max(8, Math.ceil(w / zoom)), vh = Math.max(8, Math.ceil(h / zoom));
    var c = toScale(scale, opts.centre);
    var x0 = c[0] - (vw >> 1), y0 = c[1] - (vh >> 1), z = c[2];''',
     "emtiles takes a magnification"),

    ('''    var cx0 = Math.floor((x0 - off[0]) / ch[0]), cx1 = Math.floor((x0 + w - 1 - off[0]) / ch[0]);
    var cy0 = Math.floor((y0 - off[1]) / ch[1]), cy1 = Math.floor((y0 + h - 1 - off[1]) / ch[1]);''',
     '''    var cx0 = Math.floor((x0 - off[0]) / ch[0]), cx1 = Math.floor((x0 + vw - 1 - off[0]) / ch[0]);
    var cy0 = Math.floor((y0 - off[1]) / ch[1]), cy1 = Math.floor((y0 + vh - 1 - off[1]) / ch[1]);''',
     "the chunks wanted are the ones the VOXEL window covers"),

    ('''        for (var yy = 0; yy < ch[1]; yy++){
          var py = sy + yy - y0;
          if (py < 0 || py >= h) continue;''',
     '''        for (var yy = 0; yy < ch[1]; yy++){
          var py = sy + yy - y0;
          if (py < 0 || py >= vh) continue;''',
     "and the rows it covers are voxel rows"),

    ('''          for (var xx = 0; xx < ch[0]; xx++){
            var px = sx + xx - x0;
            if (px < 0 || px >= w) continue;
            var v = (a[row + xx] - lo) * 255 / span;
            v = v < 0 ? 0 : v > 255 ? 255 : v;
            var o = (py * w + px) * 4;
            img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
          }''',
     '''          for (var xx = 0; xx < ch[0]; xx++){
            var px = sx + xx - x0;
            if (px < 0 || px >= vw) continue;
            var v = (a[row + xx] - lo) * 255 / span;
            v = v < 0 ? 0 : v > 255 ? 255 : v;
            /* One voxel, zoom x zoom pixels. Nearest-neighbour on purpose: this is what he is
               placing vertices on, and a smoothed edge invites a vertex on a boundary that the
               data does not have. */
            for (var ry = 0; ry < zoom; ry++){
              var oy = py * zoom + ry;
              if (oy >= h) break;
              for (var rx = 0; rx < zoom; rx++){
                var ox = px * zoom + rx;
                if (ox >= w) break;
                var o = (oy * w + ox) * 4;
                img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
              }
            }
          }''',
     "a voxel is drawn zoom squared"),

    ('''    var view = {
      mip: got.mip, mips: got.count, nmPerPx: scale.resolution[0],
      z: opts.centre[2], w: w, h: h, chunks: want.length,
      toolAt: function(px, py){
        return toTool(scale, [x0 + px, y0 + py, z]);
      },
      pxAt: function(tool){
        var v = toScale(scale, tool);
        return [v[0] - x0, v[1] - y0];
      },
      /* How many canvas pixels one tool voxel is, for hit-testing a vertex in tool coordinates. */
      pxPerToolVoxel: CFG.res[0] / scale.resolution[0]
    };''',
     '''    var view = {
      mip: got.mip, mips: got.count, nmPerPx: scale.resolution[0], zoom: zoom,
      /* What the pad actually shows, which is the mip's resolution divided by the magnification --
         the number for a scale bar, and NOT the number to call the data's resolution. */
      effNmPerPx: scale.resolution[0] / zoom,
      umAcross: w * scale.resolution[0] / zoom / 1000,
      z: opts.centre[2], w: w, h: h, vw: vw, vh: vh, chunks: want.length,
      toolAt: function(px, py){
        return toTool(scale, [x0 + Math.floor(px / zoom), y0 + Math.floor(py / zoom), z]);
      },
      pxAt: function(tool){
        var v = toScale(scale, tool);
        return [(v[0] - x0) * zoom, (v[1] - y0) * zoom];
      },
      /* How many canvas pixels one tool voxel is, for hit-testing a vertex in tool coordinates. */
      pxPerToolVoxel: CFG.res[0] / scale.resolution[0] * zoom
    };''',
     "the view reports the magnified mapping"),
]

# -- core/tracing.js: the ontology's own value rides with the rows --------------------------------
TRACING = [
    ('''      var row = { type: "traced_structure", structureId: id,
                  name: meta.name || "", cellType: meta.cellType || "",''',
     '''      var row = { type: "traced_structure", structureId: id,
                  name: meta.name || "", kind: meta.kind || "", cellType: meta.cellType || "",''',
     "a row carries the ontology's own value for what it is"),

    ('''      var s = by[key] || (by[key] = { structureId: id, tracedBy: who, name: r.name || "",''',
     '''      var s = by[key] || (by[key] = { structureId: id, tracedBy: who, name: r.name || "",
                                      kind: r.kind || "",''',
     "and it comes back out again"),
]

# -- the notebook's parameters --------------------------------------------------------------------
BLENDER = [
    ('''        lines.push("    {'name': " + pyStr(t.name || "traced")
                   + ", 'type': " + pyStr(t.type || "traced")''',
     '''        lines.push("    {'name': " + pyStr(t.name || "traced")
                   + ", 'kind': " + pyStr(t.kind || "")
                   + ", 'type': " + pyStr(t.type || "traced")''',
     "the notebook's TRACINGS carry the kind"),
]

# -- the card: a list instead of a text box, ids read from the segmentation -----------------------
HTML = [
    ('''<div class="row" style="gap:8px">
<div class="coord" style="flex:2 1 auto"><input type="text" id="tracingName" placeholder="What is it? e.g. astrocyte at the glia limitans"></div>
<div class="coord" style="flex:0 0 120px"><input type="color" id="tracingColor" value="#3a6b5a" style="width:100%;height:38px;padding:2px"></div>
</div>
<div class="row" style="gap:8px;margin-top:8px">
<select id="tracingType" style="flex:2 1 auto"></select>
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingNucId" placeholder="Nucleus ID (optional)"></div>
</div>''',
     '''<label style="margin-top:4px">What did you outline?</label>
<div class="row" style="gap:8px">
<select id="tracingWhat" style="flex:2 1 auto;min-width:0" title="The same ontology the organelle card and the filter use, so a traced lysosome is the same thing as a reported one. The whole cell and its nucleus are at the top because they are what you outline when the segmentation has missed a cell, and they are not organelles."></select>
<div class="coord" style="flex:0 0 120px"><input type="color" id="tracingColor" value="#3a6b5a" style="width:100%;height:38px;padding:2px"></div>
</div>
<div class="row" id="tracingNameRow" style="gap:8px;margin-top:8px;display:none">
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingName" placeholder="Name it &mdash; and tell me, so it can go on the list"></div>
</div>
<label style="margin-top:10px">Which cell is it part of?</label>
<div class="row" style="gap:8px">
<select id="tracingType" style="flex:2 1 auto" title="The cell type this structure belongs to. It becomes the collection the object lands in when the Blender scene is built."></select>
</div>
<div class="row" style="gap:8px;margin-top:8px">
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingNucId" placeholder="Nucleus ID"></div>
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingRootId" placeholder="Root ID (the cell)"></div>
</div>
<p class="hint" id="tracingAtSay" style="margin-top:4px"></p>''',
     "the card asks what it is from the list"),
]

JS = [
    ('''  TRACINGS_KEPT=tracingRead();
  tracingRenderList();''',
     '''  /* THE SAME LIST THE ORGANELLE CARD USES.  2026-09-17
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
  tracingRenderList();''',
     "the what-is-it dropdown is built from the ontology"),

    ('''function tracingCurrent(){
  if(!TRACING_PENDING)return null;
  const name=(document.getElementById("tracingName").value||"").trim();
  if(!name){tracingSay("Give it a name \\u2014 it becomes the object's name in Blender.",true);return null;}
  const t={name:name,type:document.getElementById("tracingType").value||"traced",''',
     '''/* What the dropdown means, in one place: the value that travels with the tracing and the label
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
  const t={name:name,kind:w.kind,type:document.getElementById("tracingType").value||"traced",''',
     "the name and the kind come from the dropdown"),

    ('''  const nid=(document.getElementById("tracingNucId").value||"").trim();
  if(nid)t.nucleus_id=nid;''',
     '''  const nid=(document.getElementById("tracingNucId").value||"").trim();
  if(nid)t.nucleus_id=nid;
  const rid=(document.getElementById("tracingRootId").value||"").trim();
  if(rid)t.root_id=rid;''',
     "the root id travels too"),

    ('''  const rows=UJ.tracing.ringsToRows(t.rings,{structureId:t.id,name:t.name,cellType:t.type,
                                             color:t.color,nucleusId:t.nucleus_id||""});''',
     '''  const rows=UJ.tracing.ringsToRows(t.rings,{structureId:t.id,name:t.name,kind:t.kind||"",
                                             cellType:t.type,color:t.color,
                                             nucleusId:t.nucleus_id||"",rootId:t.root_id||""});''',
     "a shared row carries the kind and the cell"),

    ('''  document.getElementById("tracePadWrap").style.display = "";
  padDraw();
}''',
     '''  document.getElementById("tracePadWrap").style.display = "";
  padDraw();
  tracingResolveAt(got.pos);
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
  }catch(e){ say.textContent="Could not read the segmentation there: "+String(e&&e.message||e); }
}''',
     "the ids are read from the segmentation"),
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


edit("core/emtiles.js", EMTILES)
edit("core/tracing.js", TRACING)
edit("src/core_blenderexport.py", BLENDER)
edit("ujump.html", HTML + JS)
print("\nnow: python3 src/core_blenderexport.py   and   node tracingpanelcheck.js")
