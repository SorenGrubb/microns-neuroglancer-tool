# -*- coding: utf-8 -*-
u"""The organelle sheet says what shape it is and how far from the nucleus.              2026-09-30

Gary, to Søren: *"We can then spit out lots of data like how many dystrophic lysosomes or
mitochondria etc there are per cell etc."* and *"I also want to have the distance from the
organelle centroid to the nucleus centroid calculated and displayed for each organelle. These
things should also be downloadable in the Excel sheets."*

ONE ROW PER ORGANELLE, NOT MORE COLUMNS PER CELL. The filter download already widens by one column
set per organelle instance; "how many dystrophic lysosomes per cell" asked of that shape means
counting across columns, which is the wrong axis for the question. So the workbook gains a second
sheet — "Traced organelles" — with a row per outlined structure and the cell's ids on it. Pivot it
and the question answers itself. The Cells sheet is untouched.

WHICH NUCLEUS CENTROID. Søren's choice: the centroid of the cell's own TRACED nucleus outline when
somebody has drawn one, and the MICrONS nucleus-detection centroid otherwise. The two are not the
same measurement — one is a hand-drawn outline's area centroid, the other a detection's centre —
so the sheet carries a column saying which was used rather than mixing them silently.

The traced nucleus is found among the tracings already fetched for these same cells, so preferring
it costs nothing: the read that builds the sheet is the read that would have happened anyway.

SHAPE COMES FROM core/traceloft.js's shape(), computed from the contours on every read rather than
stored — see src/an_organelle_has_a_shape_and_a_distance.py. That is what lets this sheet fill in
for tracings made months ago.

THE SHEET IS ONLY BUILT IF THERE IS SOMETHING TO PUT IN IT. A filter matching cells nobody has
outlined produces one sheet, as before, and the button says so. An outline read is one Drive
request each, so the same cap the notebook export uses applies, and `capped` is reported.

Check: organellesheetcheck.js.
Run: python3 src/the_organelle_sheet_says_what_shape_and_how_far.py, then
python3 src/build_stamps.py, then from inside wjump-build/, python3 build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


ROWS = u'''
/* ── ONE ROW PER OUTLINED STRUCTURE ──────────────────────────────────────────────  2026-09-30
   Gary: "We can then spit out lots of data like how many dystrophic lysosomes or mitochondria etc
   there are per cell etc." and "I also want to have the distance from the organelle centroid to
   the nucleus centroid calculated and displayed for each organelle."

   Takes what tracedStructuresForCells() already returned and turns each one into a flat row: the
   cell it belongs to, what it is, how big it is, ImageJ's four shape descriptors at its widest
   section and as a median over sections, its 3D centroid, and how far that centroid is from the
   cell's nucleus.

   WHICH NUCLEUS. The cell's own traced nucleus outline when one is among these tracings, and
   otherwise whatever `nucCentroid` hands back -- in µJump, the MICrONS nucleus-detection centroid.
   Two different measurements, so the row says which one it used.

   tracedShapeRows(tracings, opts) -> [row]
     opts.resNm       [x,y,z] nm per voxel; defaults to 4/4/40
     opts.nucCentroid function(nucleusId, rootId) -> {xVox,yVox,zVox} or null
     opts.typeOf      function(nucleusId, rootId) -> cell type string, optional

   Pure: it fetches nothing and touches no DOM, so a check can call it with three contours and
   read the answer. */
var TRACED_SHAPE_COLUMNS = [
  "Nucleus ID", "Root ID", "Cell type", "Structure", "Kind", "Instance",
  "Sections", "Volume (\\u00b5m\\u00b3)", "Area at widest section (\\u00b5m\\u00b2)",
  "Perimeter at widest section (\\u00b5m)",
  "Circularity (widest)", "Aspect ratio (widest)", "Roundness (widest)", "Solidity (widest)",
  "Major axis (\\u00b5m)", "Minor axis (\\u00b5m)",
  "Circularity (median)", "Aspect ratio (median)", "Roundness (median)", "Solidity (median)",
  "Centroid X (voxel)", "Centroid Y (voxel)", "Centroid Z (voxel)",
  "Distance to nucleus centroid (\\u00b5m)", "Nucleus centroid from",
  "Traced by", "Structure ID"
];

function tracedShapeRows(tracings, opts){
  opts = opts || {};
  var res = opts.resNm || [4, 4, 40];
  if (!window.UJ || !UJ.traceloft || typeof UJ.traceloft.shape !== "function") return [];
  var list = (tracings || []).filter(function(t){ return t && t.rings && t.rings.length; });
  /* STRICTLY A NUMBER. isFinite("") is true in JavaScript, because Number("") is 0 -- so the first
     version of this turned "no nucleus to measure from" into a distance of 0.000, which reads as
     "this organelle is sitting on the nucleus". Caught by organellesheetcheck.js. */
  var r3 = function(v){ return (typeof v !== "number" || !isFinite(v)) ? "" : Math.round(v * 1000) / 1000; };

  /* The traced nuclei first, keyed by whichever id the tracer filed them under, so an organelle
     can ask for its own cell's nucleus before falling back. */
  var tracedNuc = {};
  list.forEach(function(t){
    var kind = String(t.kind || t.instance_of || "").toLowerCase();
    if (kind !== "nucleus") return;
    var s = UJ.traceloft.shape(t.rings, res);
    if (!s || !s.ok || !s.centroid) return;
    if (t.nucleus_id) tracedNuc["n:" + t.nucleus_id] = s.centroid;
    if (t.root_id) tracedNuc["r:" + t.root_id] = s.centroid;
  });

  var out = [];
  list.forEach(function(t){
    var s = UJ.traceloft.shape(t.rings, res);
    if (!s || !s.ok) return;
    var v = UJ.traceloft.volume(t.rings, res);
    var nid = String(t.nucleus_id || ""), rid = String(t.root_id || "");
    var nc = tracedNuc["n:" + nid] || tracedNuc["r:" + rid] || null;
    var from = nc ? "traced nucleus outline" : "";
    if (!nc && typeof opts.nucCentroid === "function"){
      nc = opts.nucCentroid(nid, rid) || null;
      if (nc) from = "MICrONS nucleus detection";
    }
    var dist = "";
    if (nc && s.centroid){
      var dx = (s.centroid.xVox - nc.xVox) * res[0],
          dy = (s.centroid.yVox - nc.yVox) * res[1],
          dz = (s.centroid.zVox - nc.zVox) * res[2];
      dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;   // nm -> µm
    }
    var top = s.atMaxArea, med = s.median;
    out.push({
      "Nucleus ID": nid, "Root ID": rid,
      "Cell type": (typeof opts.typeOf === "function" ? (opts.typeOf(nid, rid) || "") : (t.type || "")),
      "Structure": t.name || "", "Kind": t.kind || t.instance_of || "",
      "Instance": t.instance_index || "",
      "Sections": s.sections,
      "Volume (\\u00b5m\\u00b3)": (v && v.ok) ? r3(v.volumeUm3) : "",
      "Area at widest section (\\u00b5m\\u00b2)": r3(top.areaUm2),
      "Perimeter at widest section (\\u00b5m)": r3(top.perimeterUm),
      "Circularity (widest)": r3(top.circularity),
      "Aspect ratio (widest)": r3(top.aspectRatio),
      "Roundness (widest)": r3(top.roundness),
      "Solidity (widest)": r3(top.solidity),
      "Major axis (\\u00b5m)": r3(top.majorUm),
      "Minor axis (\\u00b5m)": r3(top.minorUm),
      "Circularity (median)": r3(med.circularity),
      "Aspect ratio (median)": r3(med.aspectRatio),
      "Roundness (median)": r3(med.roundness),
      "Solidity (median)": r3(med.solidity),
      "Centroid X (voxel)": s.centroid ? Math.round(s.centroid.xVox) : "",
      "Centroid Y (voxel)": s.centroid ? Math.round(s.centroid.yVox) : "",
      "Centroid Z (voxel)": s.centroid ? Math.round(s.centroid.zVox) : "",
      "Distance to nucleus centroid (\\u00b5m)": r3(dist),
      "Nucleus centroid from": from,
      "Traced by": t.traced_by || "",
      "Structure ID": t.structure_id || ""
    });
  });
  return out;
}
window.tracedShapeRows = tracedShapeRows;
window.TRACED_SHAPE_COLUMNS = TRACED_SHAPE_COLUMNS;
'''

edit("core/tracedoutlines.js", [
 (u"one row per outlined structure",
  u"/* WHAT THE PAD IS HOLDING WINS. A tracing open here may carry edits the dataset has not seen, so",
  ROWS + u"\n/* WHAT THE PAD IS HOLDING WINS. A tracing open here may carry edits the dataset has not seen, so"),
])

edit("ujump.html", [

 (u"the workbook gains a Traced organelles sheet",
  u'''      const ws=XLSX.utils.aoa_to_sheet(data);
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,"Cells");
      XLSX.writeFile(wb,"microns_filtered_cells.xlsx");
      dlBtn.disabled=false;dlBtn.textContent=dlOrigText;
    },10);''',
  u'''      const ws=XLSX.utils.aoa_to_sheet(data);
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,"Cells");
      /* ── AND A ROW PER OUTLINED ORGANELLE ──────────────────────────────────  2026-09-30
         Gary: "We can then spit out lots of data like how many dystrophic lysosomes or
         mitochondria etc there are per cell etc." That question is asked of ROWS, not of the
         ever-wider organelle columns on the Cells sheet, so it gets its own sheet. Only written
         when there is something to write: a filter matching cells nobody has outlined downloads
         exactly what it downloaded before. See
         src/the_organelle_sheet_says_what_shape_and_how_far.py. */
      addTracedOrganelleSheet(wb,lastResult.matches,function(msg){dlBtn.textContent=msg;})
        .then(function(note){
          XLSX.writeFile(wb,"microns_filtered_cells.xlsx");
          dlBtn.disabled=false;dlBtn.textContent=dlOrigText;
          if(note)reportAlertOnce(note);
        });
    },10);'''),

 (u"...built from the outlines those cells already have",
  u"  const runBtn=document.getElementById(\"filterRun\");",
  u'''  /* THE SECOND SHEET.  2026-09-30
     Reads the outlines for the matched cells -- the same read the Blender/Colab export does, and
     capped the same way, because one Drive request per outline is right for a cell and wrong for
     three hundred -- then hands them to core/tracedoutlines.js's tracedShapeRows(), which is where
     the geometry and the nucleus-distance rule live. Nothing here knows what circularity is.

     The nucleus fallback is µJump's own: nucleus id -> master-array index -> the MICrONS detection
     centroid. tracedShapeRows prefers the cell's traced nucleus outline when one was read, and the
     sheet's "Nucleus centroid from" column says which of the two each row used. */
  async function addTracedOrganelleSheet(wb,matches,say){
    if(typeof tracedShapeRows!=="function"||typeof tracedStructuresForCells!=="function")return "";
    let got;
    try{
      say&&say("Reading outlines\\u2026");
      got=await tracedStructuresForCells(
        {nuc:matches.map(function(m){return rowNucId(m.row);}),
         root:matches.map(function(m){return rowRootId(m.row);})},say);
    }catch(e){ console.warn("[organelle sheet] outlines unavailable",e); return ""; }
    const rows=tracedShapeRows(got.tracings,{
      resNm:[UJ_RX,UJ_RY,UJ_RZ],
      nucCentroid:function(nid){
        const i=nidToIndex(nid);
        return i<0?null:{xVox:NX[i],yVox:NY[i],zVox:NZ[i]};
      },
      typeOf:function(nid){
        const i=nidToIndex(nid);
        return i<0?"":(typeInfo(i)||{}).name||"";
      }
    });
    if(!rows.length)return got.capped?("None of the matched cells has an outline that could be "
      +"read, and "+got.capped+" more were left unread \\u2014 the workbook has the Cells sheet only."):"";
    const aoa=[TRACED_SHAPE_COLUMNS.slice()];
    rows.forEach(function(r){ aoa.push(TRACED_SHAPE_COLUMNS.map(function(c){ return r[c]; })); });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),"Traced organelles");
    return got.capped?("\\u201cTraced organelles\\u201d holds "+rows.length+" outlined structure"
      +(rows.length===1?"":"s")+". "+got.capped+" more were left unread \\u2014 narrow the filter to "
      +"include them."):"";
  }
  const runBtn=document.getElementById("filterRun");'''),
])
print("\nNow: node organellesheetcheck.js, then python3 src/build_stamps.py,"
      "\nthen, from inside wjump-build/, python3 build_wjump.py")
