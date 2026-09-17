"""A traced cell starts as a paste.                                                  2026-09-16

Stage 1. `trace_mesh.py` already turns contours into a surface and puts it in the Blender scene;
`core/tracing.js` already reads contours out of a Neuroglancer state. This is the panel between
them -- paste a link, see what was found, name it, and it goes in the export.

THE DESIGN DECISION WORTH WRITING DOWN: **the export does not wait for the backend.**

Submitting a tracing to the shared record needs a sign-in AND an Apps Script redeploy that has not
happened yet (the combined leaderboard from 2026-09-09 is still waiting on the same one). Making
the Blender export depend on that would mean Søren cannot use the feature he asked for until a
deployment he has to do by hand. So the panel has two separate actions:

  * **Keep it** -- the tracing lives in the page, and in localStorage, and the Blender download
    includes it. Works signed out, works today, works with no backend at all.
  * **Share it** -- posts one `traced_structure` row per ring, so somebody else can have it. Needs
    the sign-in and the redeploy, and says so rather than failing.

The first is the one that does the work. The second is the one that makes it a community tool, and
it can arrive late without holding anything up.

NO CONSENSUS, ATTRIBUTION ONLY -- Søren, asked directly: *"I don't think the traced structures
should have consensus handling, but it should be marked who traced the structures."* So a kept
tracing carries the signed-in name when there is one, and nothing votes on anything.

WHERE IT SITS: the Jump tab, under the bulk organelle card, collapsed. Same shape as that card for
the same reason -- it is a second thing you do with a pasted link, and it costs nothing to anybody
who is only jumping to a coordinate.

Run: python3 src/a_traced_cell_starts_as_a_paste.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCRIPT = [
    ('''<script src="core/segread.js"></script>''',
     '''<script src="core/segread.js"></script>
<!-- 2026-09-16: contours out of a pasted Neuroglancer state -- BrainSharer's polygon/volume
     collections, or plain line annotations chained end to end. The other half of trace_mesh.py. -->
<script src="core/tracing.js"></script>''',
     "the page loads the contour reader"),
]

MARKUP = [
    ('''<div id="bulkOrganThanks"></div>
</details>
</div>
</div>''',
     '''<div id="bulkOrganThanks"></div>
</details>
</div>
<!-- ── TRACE A CELL THE SEGMENTATION DOES NOT HAVE ─────────────────────────────  2026-09-16
     The top of minnie65 is the case: nuclei are segmented up there and cells are not, so an
     astrocyte at the glia limitans has a nucleus, a name, and nothing for the 3D export to fetch.
     Outline it section by section, paste the link, and it becomes a cell in the Blender file. -->
<div class="card" id="tracingCard">
<details id="tracingPanel">
<summary style="cursor:pointer;font-weight:600">Trace a cell &mdash; outline it, and it joins the 3D export</summary>
<p class="hint" style="margin-top:8px">For a cell the segmentation does not have. Outline it in the viewer section by section &mdash; a <b>polygon</b> if your viewer has the tool, otherwise a ring of <b>line</b> annotations &mdash; then paste the whole address bar here. Two sections is the minimum; every fifth section is about half a percent off the real volume, every fortieth is eleven.</p>
<label style="margin-top:10px">Neuroglancer link</label>
<textarea id="tracingLink" placeholder="Paste the whole address bar, with your contours on it."></textarea>
<div class="row" style="gap:8px;margin-top:8px">
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingLayer" placeholder="Annotation layer name (optional)"></div>
<button class="idbtn" id="tracingRead" style="flex:0 0 auto">Read the contours</button>
</div>
<p class="hint" id="tracingStatus"></p>
<div id="tracingFound" style="display:none;margin-top:8px">
<div class="row" style="gap:8px">
<div class="coord" style="flex:2 1 auto"><input type="text" id="tracingName" placeholder="What is it? e.g. astrocyte at the glia limitans"></div>
<div class="coord" style="flex:0 0 120px"><input type="color" id="tracingColor" value="#3a6b5a" style="width:100%;height:38px;padding:2px"></div>
</div>
<div class="row" style="gap:8px;margin-top:8px">
<select id="tracingType" style="flex:2 1 auto"></select>
<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingNucId" placeholder="Nucleus ID (optional)"></div>
</div>
<div class="row" style="gap:8px;margin-top:10px">
<button class="idbtn" id="tracingKeep" style="flex:1 1 auto">Keep it &mdash; include in the 3D export</button>
<button class="idbtn" id="tracingShare" style="flex:0 0 auto" title="Posts one row per contour to the shared record, so other people can use this tracing. Needs a Google sign-in.">Share</button>
</div>
</div>
<div id="tracingList" style="margin-top:12px"></div>
</details>
</div>
</div>''',
     "the Jump tab has a tracing card"),
]

CODE = [
    ('''/* ── BULK ORGANELLE ANNOTATION ──────────────────────────────────────────────────  2026-09-10''',
     '''/* ── TRACING A CELL THE SEGMENTATION DOES NOT HAVE ──────────────────────────────  2026-09-16
   Paste a link of contours, keep it, and it rides into the Blender export as an ordinary cell.

   THE EXPORT DOES NOT WAIT FOR THE BACKEND. Sharing a tracing needs a sign-in and an Apps Script
   redeploy that has not happened; the 3D export needs neither, so "Keep it" is local (page +
   localStorage) and "Share" is the separate, optional half. Building it the other way round would
   have made the feature unusable until a deployment somebody has to do by hand.

   NO CONSENSUS. A tracing is one person's and carries their name; nothing votes on it. */
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
  tracingSay(rings.length+" contour"+(rings.length===1?"":"s")+" on "+sections.size
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

function tracingCurrent(){
  if(!TRACING_PENDING)return null;
  const name=(document.getElementById("tracingName").value||"").trim();
  if(!name){tracingSay("Give it a name \\u2014 it becomes the object's name in Blender.",true);return null;}
  const t={name:name,type:document.getElementById("tracingType").value||"traced",
           color:document.getElementById("tracingColor").value||"#3a6b5a",
           traced_by:(typeof REPORTER_NAME!=="undefined"&&REPORTER_NAME)||"",
           rings:TRACING_PENDING.rings};
  const nid=(document.getElementById("tracingNucId").value||"").trim();
  if(nid)t.nucleus_id=nid;
  return t;
}

function tracingKeep(){
  const t=tracingCurrent();
  if(!t)return;
  TRACINGS_KEPT.push(t);
  tracingWrite(TRACINGS_KEPT);
  tracingRenderList();
  TRACING_PENDING=null;
  document.getElementById("tracingFound").style.display="none";
  document.getElementById("tracingLink").value="";
  tracingSay('"'+t.name+'" is kept \\u2014 it will be in the next Blender download from this page.');
}

function tracingShare(){
  const t=tracingCurrent();
  if(!t)return;
  if(typeof reportGateBlock==="function"){
    const blocked=reportGateBlock();
    if(blocked){alert(blocked);return;}
  }
  const rows=UJ.tracing.ringsToRows(t.rings,{name:t.name,cellType:t.type,color:t.color,
                                             nucleusId:t.nucleus_id||""});
  let posted=0;
  rows.forEach(function(r,i){
    if(postReport(Object.assign({timestamp:new Date().toISOString(),
                                 subIndex:i+1,subCount:rows.length},r))!==false)posted++;
  });
  if(!posted){tracingSay("Nothing was sent \\u2014 the tracing is still here.",true);return;}
  tracingSay(posted+" contour"+(posted===1?"":"s")+" shared. If the backend has not been "
    +"redeployed since 2026-09-16 it will record them as an unknown type \\u2014 the tracing is "
    +"kept here either way.");
}

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
  TRACINGS_KEPT=tracingRead();
  tracingRenderList();
  document.getElementById("tracingRead").addEventListener("click",function(){
    try{tracingReadLink();}catch(e){tracingSay(String(e&&e.message||e),true);}
  });
  document.getElementById("tracingKeep").addEventListener("click",tracingKeep);
  document.getElementById("tracingShare").addEventListener("click",tracingShare);
})();

/* ── BULK ORGANELLE ANNOTATION ──────────────────────────────────────────────────  2026-09-10''',
     "the page reads, keeps and shares a tracing"),
]

EXPORT = [
    ('''          vascExtent:vascExtent, brand:brand
        });''',
     '''          vascExtent:vascExtent, brand:brand,
          /* WHAT THE PAGE HAS TRACED. Kept locally, so this works signed out and with no backend
             at all -- see the tracing card's own comment on why the export does not wait for a
             redeploy. An empty list is the normal case and costs nothing. */
          tracings:(typeof TRACINGS_KEPT!=="undefined")?TRACINGS_KEPT:[]
        });''',
     "the Blender download carries the kept tracings"),
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


edit("ujump.html", SCRIPT + MARKUP + CODE + EXPORT)
print("\nnow: node tracingcheck.js   and   node tracingpanelcheck.js")
