"""One paste, one structure type, as many cells as you marked.                       2026-09-10

Søren: *"I have a request that we could make the annotation of organelles in many different cells
in a bulk way with pasting the Neuroglancer code. To make this work, I imagine that we would need
to limit it to one type of organelle per submission and then figure out which cell's mesh the
organelle coordinate is within or which cell's nucleus for organelles related to nuclei. I think it
should be a feature in the Jump tab of uJump perhaps below the cell identification part."*

MOST OF THE FRONT HALF ALREADY EXISTED. Pasting a link with N annotations of one kind has parsed
into N rows since core/organelles.js was written -- markersFromLink() then rowsFromPoints(), lines
included since this morning. The only thing that made it single-cell is that every row was attached
to whichever cell the panel happened to be showing. Bulk is letting each row find its own cell.

FINDING THE CELL, and this is the part that is new. core/segread.js reads the segmentation itself:
one voxel out of minnie65's flat `seg_m1300` gives the ROOT ID of the cell at that point, and one
voxel out of the nucleus volume gives the NUCLEUS ID. Both public, both in the browser, no CAVE
token, no server -- see that file's header for the formats and for what was measured.

NOT the mesh, which is what he suggested and is worth saying why: a point-in-mesh test has to know
which cell to test before it can test it, and there are 144,118 of them. Not nearest-nucleus
either: in a dendrite the nearest nucleus belongs to somebody else.

THE CELL IS THE AUTHORITY, THE NUCLEUS IS A SECOND OPINION. This came out of the measurement rather
than the plan. Nucleus 598774's own recorded centroid reads 0 in the nucleus volume while reading
the correct root id in the cell segmentation -- a nucleus is not convex at 64 nm, and 147 of 891
probes around that point did find it. So a nuclear-kind marker that lands outside every nucleus is
not a failure to resolve; it is a MISPLACED ANNOTATION, and the row says so and starts unticked
rather than being submitted quietly.

WHAT HAPPENS TO A POINT THAT LANDS NOWHERE (his choice, asked and answered):
listed, excluded, with the reason -- "no cell at this point", "outside the volume", "inside nucleus
X but the cell here is Y". Nothing is dropped silently and nothing is guessed at. A row he
disagrees with can be ticked back on by hand; the tool never ticks one for him.

ONE KIND PER SUBMISSION is his constraint and it is the right one: the ontology already decides
whether a kind is one point or two, and a line means base+tip for a cilium and endpoint 1 + endpoint
2 for an NR type II. A mixed paste would make that pairing rule ambiguous.

GROUPED BY CELL ON THE WAY OUT. The backend's organelle_location contract is per structure with a
groupId tying one submission together (see wireOrganelleForm in core/panel.js). A bulk paste is one
submission PER CELL: twelve NR type II across five cells is five groups, not one group of twelve
and not twelve groups of one -- so the read-back on each cell's own panel says "one user logged 3
structures here", which is what actually happened.

Run: python3 src/bulk_organelles_in_one_paste.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCRIPT = [
    ('''<script src="core/organelles.js"></script>''',
     '''<script src="core/organelles.js"></script>
<!-- 2026-09-10: reads one voxel out of the cell and nucleus segmentations, so a pasted marker can
     say which cell it is in. Loaded here because the bulk organelle panel below uses it; nothing
     else in this file does yet. -->
<script src="core/segread.js"></script>''',
     "the page loads the segmentation reader"),
]

MARKUP = [
    ('''<div class="out" id="out" style="display:none"><label>Neuroglancer state URL</label><div class="urlbox" id="url"></div>
<div class="actions"><button class="copy" id="copy">Copy link</button></div></div>
</div>
</div>''',
     '''<div class="out" id="out" style="display:none"><label>Neuroglancer state URL</label><div class="urlbox" id="url"></div>
<div class="actions"><button class="copy" id="copy">Copy link</button></div></div>
</div>
<!-- ── BULK ORGANELLE ANNOTATION ──────────────────────────────────────────  2026-09-10
     Søren: "make the annotation of organelles in many different cells in a bulk way with pasting
     the Neuroglancer code... limit it to one type of organelle per submission and then figure out
     which cell's mesh the organelle coordinate is within... a feature in the Jump tab of uJump
     perhaps below the cell identification part."

     Deliberately its own card, AFTER the cell panel and outside it: everything above is about the
     one cell you are looking at, and this is about however many cells you marked. Collapsed by
     default (<details>, the same pattern the search and random-cell panels use) so it costs
     nothing to anyone who is only jumping to a coordinate. -->
<div class="card" id="bulkOrganCard">
<details id="bulkOrganPanel">
<summary style="cursor:pointer;font-weight:600">Bulk organelle annotation &mdash; one structure type, many cells</summary>
<p class="hint" style="margin-top:8px">Mark the same kind of structure in as many cells as you like in Neuroglancer &mdash; a point, or a <b>line</b> for anything with two ends like a cilium or an NR type II &mdash; then paste the whole address bar here. Each marker is looked up in the segmentation to find which cell it sits in, so you never have to visit the cells one at a time.</p>
<label style="margin-top:10px">Structure &mdash; one kind per submission</label>
<select id="bulkOrganKind"></select>
<label style="margin-top:12px">Neuroglancer link</label>
<textarea id="bulkOrganLink" placeholder="Paste the whole address bar from Neuroglancer, with your annotations on it."></textarea>
<div class="row" style="gap:8px;margin-top:8px">
<div class="coord" style="flex:1 1 auto"><input type="text" id="bulkOrganLayer" placeholder="Annotation layer name (optional &mdash; blank reads every annotation layer)"></div>
<button class="idbtn" id="bulkOrganResolve" style="flex:0 0 auto">Find the cells</button>
</div>
<p class="hint" id="bulkOrganStatus"></p>
<div id="bulkOrganTable" style="margin-top:8px"></div>
<div id="bulkOrganSubmitRow" style="display:none;margin-top:12px">
<label>Comment (optional &mdash; goes on every row)</label>
<input type="text" id="bulkOrganComment" placeholder="e.g. from the L2/3 astrocyte survey">
<button class="idbtn" id="bulkOrganSubmit" style="width:100%;margin-top:10px">Submit</button>
</div>
<div id="bulkOrganThanks"></div>
</details>
</div>
</div>''',
     "the Jump tab has a bulk organelle card"),
]

CODE = [
    ('''document.getElementById("x").value="240640";document.getElementById("y").value="207872";document.getElementById("z").value="21360";''',
     '''/* ── BULK ORGANELLE ANNOTATION ──────────────────────────────────────────────────  2026-09-10
   Søren: "annotation of organelles in many different cells in a bulk way with pasting the
   Neuroglancer code... figure out which cell's mesh the organelle coordinate is within or which
   cell's nucleus for organelles related to nuclei."

   Parsing was never the missing piece -- UJ.organelles.markersFromLink()/rowsFromPoints() have
   turned a pasted link into rows for one kind since they were written. What was missing is the
   answer to "which cell is this point in", and core/segread.js now reads that straight out of the
   segmentation: the root id at the voxel, and the nucleus id at the same voxel.

   THE CELL IS THE AUTHORITY. The root id answers for every organelle kind and was correct at all
   seven points it was checked against; the nucleus read is a second, independent fact. That order
   matters because a nucleus's own recorded centroid can read 0 in the nucleus volume (measured, on
   nucleus 598774) -- so a nucleus lookup alone would have thrown away a cell it had found. */
const BULK_ORGAN_NUCLEAR=(function(){
  /* Which kinds are supposed to be INSIDE a nucleus, asked of the ontology's own grouping rather
     than by listing names here -- so a kind added to the Nucleus group is covered without an edit,
     the same reasoning as isVector() reading `vector` instead of testing for "cilium". */
  const out={};
  (typeof ORGANELLE_GROUPS!=="undefined"?ORGANELLE_GROUPS:[]).forEach(function(g){
    if(g.label!=="Nucleus")return;
    (g.kinds||[]).forEach(function(k){out[k.value]=1;});
  });
  return out;
})();
let BULK_ORGAN_ROWS=[];

/* Same precedence buildAllIdentities() uses -- own-verified, then community, then the MICrONS
   prediction -- so a cell reads here exactly as it reads in the filter and on its own panel. */
function bulkOrganCellName(i){
  if(i<0)return "";
  const ot=OWN_TYPE[i];
  if(ot!==255)return OWN_TYPE_NAMES[ot];
  const covr=(window.__COMM_ROWTYPE)?window.__COMM_ROWTYPE[String(NID[i])]:null;
  if(covr)return covr;
  const t=NT[i];
  return t!==0?CT_NAMES[t-1]:"unclassified";
}

function bulkOrganSetStatus(msg,bad){
  const el=document.getElementById("bulkOrganStatus");
  if(el)el.innerHTML=bad?'<span style="color:var(--bad)">'+escHtml(msg)+'</span>':escHtml(msg);
}

/* Resolve ONE parsed row. Point A is the anchor; a vector kind whose A landed in the extracellular
   space between two cells still has a B worth trying, and saying which end answered is more honest
   than silently averaging them. */
async function bulkOrganResolveRow(row){
  const out={kind:row.kind,a:row.a,b:row.b,use:false,rootId:"0",nucleusId:0,i:-1,via:"",why:""};
  let r=await UJ.segread.resolveAt(row.a);
  let via="point A";
  if(!r.inCell&&row.b){ const r2=await UJ.segread.resolveAt(row.b); if(r2.inCell){r=r2;via="point B";} }
  out.rootId=r.rootId; out.nucleusId=r.nucleusId; out.via=via;
  if(!r.inCell){
    out.why=r.why||"no cell at this point";
    return out;                                     // listed, not ticked, with the reason
  }
  /* The tool's own reverse index first: a root id it already knows names a cell with a nucleus, a
     type and a panel. Only if that fails does the nucleus read stand in. */
  let i=(typeof rootIdToIndex==="function")?rootIdToIndex(r.rootId):-1;
  if(i<0&&r.nucleusId&&typeof nidToIndex==="function")i=nidToIndex(r.nucleusId);
  out.i=i;
  if(i>=0&&r.nucleusId&&String(NID[i])!==String(r.nucleusId)){
    /* Two segmentations disagreeing about the same voxel is worth showing, not resolving by
       preference: it usually means the marker sits on a boundary. */
    out.why="the cell here is nucleus "+NID[i]+" but the point is inside nucleus "+r.nucleusId;
    return out;
  }
  if(BULK_ORGAN_NUCLEAR[row.kind]&&!r.inNucleus){
    out.why="not inside any nucleus \\u2014 check the marker";
    return out;
  }
  out.use=true;
  return out;
}

function bulkOrganRender(){
  const host=document.getElementById("bulkOrganTable");
  const submitRow=document.getElementById("bulkOrganSubmitRow");
  if(!host)return;
  if(!BULK_ORGAN_ROWS.length){host.innerHTML="";if(submitRow)submitRow.style.display="none";return;}
  const cell=function(r){
    if(r.i>=0)return "Nucleus "+NID[r.i]+" &middot; "+escHtml(bulkOrganCellName(r.i));
    if(r.rootId!=="0")return "root "+escHtml(r.rootId)+' <span style="opacity:.7">(no detection)</span>';
    return '<span style="opacity:.7">&mdash;</span>';
  };
  const pt=function(p){return p?p.map(function(v){return Math.round(v);}).join(", "):""; };
  let html='<table style="width:100%;border-collapse:collapse;font-size:12px">'
    +'<tr style="color:var(--mut);text-align:left">'
    +'<th style="padding:4px 6px"></th><th style="padding:4px 6px">Marker</th>'
    +'<th style="padding:4px 6px">Cell</th><th style="padding:4px 6px">Notes</th></tr>';
  BULK_ORGAN_ROWS.forEach(function(r,n){
    const dim=r.use?"":"opacity:.65;";
    html+='<tr style="border-top:1px solid var(--line);'+dim+'">'
      +'<td style="padding:4px 6px;vertical-align:top"><input type="checkbox" class="bulkorgpick" data-n="'+n+'"'+(r.use?" checked":"")+'></td>'
      +'<td style="padding:4px 6px;vertical-align:top;font-family:var(--mono)">'+escHtml(pt(r.a))
        +(r.b?'<br><span style="opacity:.7">'+escHtml(pt(r.b))+'</span>':'')+'</td>'
      +'<td style="padding:4px 6px;vertical-align:top">'+cell(r)+'</td>'
      +'<td style="padding:4px 6px;vertical-align:top">'
        +(r.why?'<span style="color:var(--warn)">'+escHtml(r.why)+'</span>'
               :'<span style="opacity:.7">matched on '+escHtml(r.via)+'</span>')+'</td></tr>';
  });
  html+='</table>';
  const on=BULK_ORGAN_ROWS.filter(function(r){return r.use;});
  const cells={};on.forEach(function(r){cells[r.rootId]=1;});
  html+='<p class="hint" style="margin-top:8px">'+on.length+" of "+BULK_ORGAN_ROWS.length
    +" marker"+(BULK_ORGAN_ROWS.length===1?"":"s")+" ticked, across "+Object.keys(cells).length
    +" cell"+(Object.keys(cells).length===1?"":"s")
    +". Anything unticked is listed with its reason rather than dropped &mdash; tick it back on if you disagree.</p>";
  host.innerHTML=html;
  host.querySelectorAll(".bulkorgpick").forEach(function(cb){
    cb.addEventListener("change",function(){
      BULK_ORGAN_ROWS[Number(cb.dataset.n)].use=cb.checked;
      bulkOrganRender();
    });
  });
  if(submitRow)submitRow.style.display=on.length?"":"none";
}

async function bulkOrganFindCells(){
  const btn=document.getElementById("bulkOrganResolve");
  const kind=document.getElementById("bulkOrganKind").value;
  const link=document.getElementById("bulkOrganLink").value;
  const layer=(document.getElementById("bulkOrganLayer").value||"").trim();
  document.getElementById("bulkOrganThanks").innerHTML="";
  BULK_ORGAN_ROWS=[];bulkOrganRender();
  const parsed=UJ.organelles.markersFromLink(link,layer||null);
  if(!parsed.ok){bulkOrganSetStatus(parsed.error||"That link could not be read.",true);return;}
  if(!parsed.points.length){
    bulkOrganSetStatus("That link has no annotations on it"
      +(layer?' in a layer called "'+layer+'".':". Mark the structures in the viewer first \\u2014 a "
      +"point, or a LINE for anything with two ends \\u2014 then copy the whole address bar."),true);
    return;
  }
  const built=UJ.organelles.rowsFromPoints(kind,parsed.points);
  try{
    UJ.segread.configure({seg:SRC.seg,nuc:SRC.nuc,res:UJ.cfg.res});
  }catch(e){bulkOrganSetStatus(e.message,true);return;}
  btn.disabled=true;
  const t0=Date.now();
  bulkOrganSetStatus("Reading the segmentation for "+built.rows.length+" marker"
    +(built.rows.length===1?"":"s")+"\\u2026");
  /* Six at a time: a cold read is three round trips and a paste of two hundred markers should not
     open two hundred sockets. Everything the reader fetches is cached, so markers in one cell
     after the first are effectively free. */
  const done=await UJ.segread.mapPool(built.rows,6,bulkOrganResolveRow,function(n,total){
    bulkOrganSetStatus("Reading the segmentation \\u2014 "+n+" of "+total+"\\u2026");
  });
  btn.disabled=false;
  BULK_ORGAN_ROWS=done.map(function(r,i){
    if(r&&r.error)return {kind:built.rows[i].kind,a:built.rows[i].a,b:built.rows[i].b,
                          use:false,rootId:"0",nucleusId:0,i:-1,via:"",why:r.error};
    return r;
  });
  const secs=((Date.now()-t0)/1000).toFixed(1);
  bulkOrganSetStatus(built.rows.length+" marker"+(built.rows.length===1?"":"s")+" read in "+secs
    +" s"+(built.odd?" \\u2014 one marker had no partner and is listed with only one end.":"."));
  bulkOrganRender();
}

/* One submission PER CELL, mirroring wireOrganelleForm's groupId/subIndex/subCount convention --
   so a cell's own panel reads "one user logged 3 structures here" rather than three separate
   visits, which is what actually happened. */
function bulkOrganSubmit(){
  const btn=document.getElementById("bulkOrganSubmit");
  const picked=BULK_ORGAN_ROWS.filter(function(r){return r.use;});
  if(!picked.length)return;
  const comment=(document.getElementById("bulkOrganComment").value||"").trim();
  const byCell={};
  picked.forEach(function(r){(byCell[r.rootId]=byCell[r.rootId]||[]).push(r);});
  const stamp=Date.now();
  let posted=0;
  Object.keys(byCell).forEach(function(rootId,ci){
    const rows=byCell[rootId];
    const i=rows[0].i;
    /* A cell with no MICrONS detection carries a BLANK nucleusId and is found by coordinate --
       the same convention the "new cell, no nucleus" organelle rows already use, so the existing
       bulk read-back picks these up with no backend change. */
    const nucId=(i>=0)?String(NID[i]):"";
    const coord=(i>=0)?[NX[i],NY[i],NZ[i]].join(","):rows[0].a.join(",");
    const groupId=(nucId||"nonuc")+"_"+(stamp+ci)+"_org";
    rows.forEach(function(r,si){
      posted++;
      postReport({
        type:"organelle_location",
        timestamp:new Date().toISOString(),
        nucleusId:nucId,rootId:rootId,coord:coord,
        groupId:groupId,subIndex:si+1,subCount:rows.length,
        kind:r.kind,
        pointA:r.a.map(Math.round).join(","),
        pointB:r.b?r.b.map(Math.round).join(","):"",
        identified:"",comment:comment,path:"bulk paste"
      });
    });
  });
  btn.disabled=true;btn.textContent="submitted";
  document.getElementById("bulkOrganThanks").innerHTML=
    '<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">'
    +"Thanks \\u2014 "+posted+" structure"+(posted===1?"":"s")+" logged across "
    +Object.keys(byCell).length+" cell"+(Object.keys(byCell).length===1?"":"s")+".</div>";
}

(function wireBulkOrgan(){
  const kindEl=document.getElementById("bulkOrganKind");
  if(!kindEl)return;
  kindEl.innerHTML=(typeof ORGANELLE_KIND_OPTIONS_HTML!=="undefined")
    ? ORGANELLE_KIND_OPTIONS_HTML : UJ.organelles.optionsHtml();
  kindEl.value="nucleoplasmic_reticulum_2";
  document.getElementById("bulkOrganResolve").addEventListener("click",function(){
    bulkOrganFindCells().catch(function(e){bulkOrganSetStatus(String(e&&e.message||e),true);
      document.getElementById("bulkOrganResolve").disabled=false;});
  });
  document.getElementById("bulkOrganSubmit").addEventListener("click",bulkOrganSubmit);
  /* Re-arm after a submission so a second paste works without a reload. */
  document.getElementById("bulkOrganLink").addEventListener("input",function(){
    const b=document.getElementById("bulkOrganSubmit");
    if(b.disabled){b.disabled=false;b.textContent="Submit";}
  });
})();
document.getElementById("x").value="240640";document.getElementById("y").value="207872";document.getElementById("z").value="21360";''',
     "the bulk panel finds each marker's cell and submits per cell"),
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


edit("ujump.html", SCRIPT + MARKUP + CODE)
print("\nnow: node segreadcheck.js   and   node bulkorgancheck.js")
