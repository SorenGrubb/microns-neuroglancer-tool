"""A missed nucleus is a cell you can name, and find again.                          2026-09-09

Søren: *"I think we need a similar method of identifying the nuclei in lJump as we have in wJump. It
is very few nuclei we have identified using the detection. Also, I tried to report a missing nucleus
and suggested it was an astrocyte, but it did not show up as a new nucleus nor an astrocyte."*

MEASURED FIRST. His report is in the sheet -- asked the live backend for λJump's own new cells:

    ?newCells=1&ds=ljump  ->  1 row
      {"coord":"102833,23184,348","rootId":"","nucRootId":"","identified":"",
       "reporterName":"Søren Grubb","comment":"Astrocyte","certainty":"",
       "timestamp":"2026-09-09T20:34:08.503Z"}

So nothing was lost, and both halves of what he saw are explained by that one row:

  * **not an astrocyte** -- "Astrocyte" is in `comment`. The form has a free-text comment box and no
    identity field at all, so the word he typed was never an identification. The sheet HAS an
    `identified` column, the backend writes it, and aggregateAll() counts "New cells (no nucleus)"
    as one of the two sheets carrying "a genuine cell-type identified". λJump just never sent one.

  * **not a new nucleus** -- λJump never reads `?newCells=1` back. µJump has done since the mode
    was added (NEW_CELL_REPORTS_CACHE / nearestUserReportedCell / renderUserReportedCell): the
    whole small list is fetched once and matched by COORDINATE PROXIMITY, because a cell with no
    detection has no id to key on. λJump, whose detector finds about 46 % of the cells a direct
    count predicts and whose shortfall is concentrated in exactly the small glial nuclei he is
    adding, was the tool that needed it most and was the one without it.

WHAT THIS DOES

  1. The form gets an identity picker, built from the shared ontology (UJ.ontology.LEAF_NAMES) and
     submitted through canonSubmitName() -- the same name the tool's own identification flow
     submits, so a community-added astrocyte and a detected one are the same string in the sheet.
     The comment box stays, for what it was for: what it looks like.

  2. λJump fetches `?newCells=1&ds=ljump` once and keeps it.

  3. Jump considers them. `nearest()` searches the 488 detections; the community list is searched
     alongside it, and whichever is genuinely closer to the typed coordinate wins. Pasting
     102833,23184,348 now lands on his own added nucleus instead of on whatever detection happens
     to be nearest.

  4. They are findable without knowing the coordinate: the form says how many have been added and
     lists them, each one a link that jumps straight there.

WHAT THIS IS NOT. ωJump's Identify panel is more than this -- a queue that hands everyone the same
nucleus, walks a set in order, and hides existing votes until you decide. This is the layer that has
to exist underneath it: added nuclei that carry an identity and can be found again. The queue is a
separate piece of work and is not in here.

Run: python3 src/a_missed_nucleus_is_a_cell_you_can_find.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FORM = [
    ('''  h+='<div class="row" style="margin-top:6px"><input type="text" id="newnuccomment" '
    +'placeholder="comment (optional) — what it looks like" style="flex:1"></div>';
  h+='<p class="hint" id="fixnewmsg"></p>';''',
     '''  /* AN IDENTITY, not a comment. Søren, 2026-09-09: "I tried to report a missing nucleus and
     suggested it was an astrocyte, but it did not show up as a new nucleus nor an astrocyte." His
     row is in the sheet with identified:"" and comment:"Astrocyte" -- because this form had a
     comment box and no identity field, so the word he typed could never be read as one. The sheet
     has had an `identified` column all along and aggregateAll() counts this sheet as one of the
     two that carry a real cell type.

     Built from the shared ontology and submitted through canonSubmitName(), the same call this
     tool's own identification flow makes, so a community-added astrocyte and a detected one are
     the same string in the sheet rather than two spellings nothing can join. Flat and alphabetical
     because ontology.js publishes no category map; the decision tree is the guided route and this
     is the "I already know what it is" one. */
  h+='<div class="row" style="margin-top:6px"><select id="newnucid" style="flex:1">'
    +'<option value="">What kind of cell is it? (optional)</option>'
    +newNucIdOptionsHtml()+'</select></div>';
  h+='<div class="row" style="margin-top:6px"><input type="text" id="newnuccomment" '
    +'placeholder="comment (optional) — what it looks like" style="flex:1"></div>';
  h+='<p class="hint" id="fixnewmsg"></p>';
  /* Filled in by wireNewNucleusList() once the fetch lands -- so a nucleus added this way can be
     found again by somebody who does not have its coordinate written down. */
  h+='<div id="newnuclist"></div>';''',
     "the form asks what the cell is"),
]

HELPERS = [
    ('''function showCell(i, distNm){''',
     '''/* ── community-added nuclei ───────────────────────────────────────────────────────────────
   λJump's detector is size-tuned at 7.5 µm and finds about 46 % of the cells a direct count
   predicts, with the shortfall concentrated in small glial nuclei (see the About card). So the
   nuclei somebody adds by hand are not an edge case here, they are most of the tissue -- which is
   why this tool needed the read-back µJump has had since the mode existed, and was the one without
   it.

   Matched by COORDINATE PROXIMITY rather than by id, because a cell with no detection has no id to
   key on. Fetched once, eagerly, so it is already cached by the time anybody jumps. */
let NEW_NUC_CACHE=null,NEW_NUC_FETCHED=false;
function newNucCoord(rec){
  const p=String((rec&&rec.coord)||"").split(/[\\s,;]+/).filter(Boolean).map(Number);
  return (p.length>=3&&p.every(isFinite))?p.slice(0,3):null;
}
async function fetchNewNuclei(){
  if(NEW_NUC_CACHE)return NEW_NUC_CACHE;
  if(!REPORT_ENDPOINT)return null;
  try{
    const ds=(UJ&&UJ.cfg&&UJ.cfg.backend&&UJ.cfg.backend.ds)||"";
    const r=await fetch(REPORT_ENDPOINT+"?newCells=1"+(ds?"&ds="+encodeURIComponent(ds):""));
    const d=await r.json();
    if(!d||!d.newCells)return null;
    /* A row with no readable coordinate cannot be jumped to or matched, and keeping it would only
       make the count on screen bigger than the list under it. */
    NEW_NUC_CACHE=d.newCells.filter(function(rec){return !!newNucCoord(rec);});
    return NEW_NUC_CACHE;
  }catch(_e){return null;}
  finally{NEW_NUC_FETCHED=true;}
}
fetchNewNuclei().then(function(){ try{wireNewNucleusList();}catch(_e){} });
/* Same anisotropic scaling as nearest() -- these coordinates are voxels in the same frame. */
function nearestNewNucleus(vx,vy,vz){
  if(!NEW_NUC_CACHE||!NEW_NUC_CACHE.length)return null;
  let best=null,bd=Infinity;
  for(const rec of NEW_NUC_CACHE){
    const p=newNucCoord(rec);
    const dx=(vx-p[0])*UJ_RX,dy=(vy-p[1])*UJ_RY,dz=(vz-p[2])*UJ_RZ;
    const d=dx*dx+dy*dy+dz*dz;
    if(d<bd){bd=d;best=rec;}
  }
  return {rec:best,dist:Math.sqrt(bd)};
}
function newNucIdOptionsHtml(){
  try{
    const LN=UJ.ontology.LEAF_NAMES,out=[];
    for(const slug in LN)out.push(LN[slug]);
    out.sort(function(a,b){return a.localeCompare(b);});
    return out.map(function(nm){
      return '<option value="'+escHtml(nm)+'">'+escHtml(nm)+'</option>';
    }).join("");
  }catch(_e){return "";}
}
/* The list under the form. Rebuilt on every panel render (the form is part of showCell's markup)
   and again when the fetch lands, whichever is later. */
function wireNewNucleusList(){
  const host=document.getElementById("newnuclist");
  if(!host)return;
  if(!NEW_NUC_FETCHED){host.innerHTML='<p class="hint">Checking for nuclei others have added…</p>';return;}
  const list=NEW_NUC_CACHE||[];
  if(!list.length){host.innerHTML='<p class="hint">No nuclei have been added this way yet.</p>';return;}
  const rows=list.slice().sort(function(a,b){
    return String(b.timestamp||"").localeCompare(String(a.timestamp||""));
  }).map(function(rec){
    const p=newNucCoord(rec);
    const who=rec.reporterName?(" &middot; "+escHtml(rec.reporterName)):"";
    const what=rec.identified?escHtml(rec.identified)
      :(rec.comment?('<span style="opacity:.75">'+escHtml(rec.comment)+'</span>'):'<span style="opacity:.6">unnamed</span>');
    return '<div style="font-size:12px;padding:2px 0"><a href="#" class="newnucjump" '
      +'data-x="'+p[0]+'" data-y="'+p[1]+'" data-z="'+p[2]+'">'+p.join(", ")+'</a> &mdash; '
      +what+who+'</div>';
  }).join("");
  host.innerHTML='<p class="hint" style="margin-bottom:2px"><b>'+list.length+'</b> nucle'
    +(list.length===1?"us has":"i have")+' been added this way. Click a coordinate to go there.</p>'
    +'<div style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:6px;'
    +'padding:6px 8px">'+rows+'</div>';
  host.querySelectorAll(".newnucjump").forEach(function(a){
    a.addEventListener("click",function(ev){
      ev.preventDefault();
      document.getElementById("x").value=a.dataset.x;
      document.getElementById("y").value=a.dataset.y;
      document.getElementById("z").value=a.dataset.z;
      document.getElementById("go").click();
    });
  });
}
/* The panel for a cell the detector never found. Deliberately short: there is no layer tag, no
   detector pass and no diameter to show, because nothing measured this nucleus -- somebody said it
   is there. Saying so is the point of the card. */
function showNewNucleus(rec,distNm){
  const p=newNucCoord(rec);
  CUR_IDX=-1;CUR_NUCID="";CUR_ROOT="";
  window.CUR_POS=p.slice();
  window.CUR_CELLTYPE_DISPLAY=rec.identified||null;
  window.CUR_MICRONS_NAME=null;window.CUR_COMMUNITY_TOP_NAME=rec.identified||null;
  let h='<div class="card">';
  h+='<div class="celltype">'+celltypeLink(p,escHtml(rec.identified||"Unnamed cell"))+'</div>';
  h+='<div style="margin-top:6px"><span class="tag none">added by the community</span>'
    +(rec.identified?"":' <span class="tag none">unnamed</span>')+'</div>';
  h+='<p class="hint" style="margin-top:8px">This nucleus has no detection of its own \\u2014 '
    +'somebody added it because the detector missed it. It is not in the 488 the detector found, so '
    +'it has no diameter, layer or pass of its own.</p>';
  h+='<div class="row" style="margin-top:6px"><div class="coord" style="flex:1">'
    +p.join(", ")+'</div></div>';
  if(rec.reporterName)h+='<p class="hint">Added by '+escHtml(rec.reporterName)
    +(rec.timestamp?(" on "+escHtml(String(rec.timestamp).slice(0,10))):"")+'.</p>';
  if(rec.comment)h+='<p class="hint">&ldquo;'+escHtml(rec.comment)+'&rdquo;</p>';
  if(distNm>0)h+='<p class="hint">'+(distNm/1000).toFixed(1)+' \\u00b5m from the coordinate you typed.</p>';
  h+='</div>';
  document.getElementById("panel").innerHTML=h;
}
function showCell(i, distNm){''',
     "λJump reads the added nuclei back"),
]

# THE EAGER FETCH CANNOT RUN AT PARSE TIME, and the check caught it on the first run:
#
#     ReferenceError: Cannot access 'REPORT_ENDPOINT' before initialization
#
# These helpers sit above showCell(), and lambdaJump's `const REPORT_ENDPOINT` is declared BELOW
# them -- so a call made while the script is still being evaluated hits the temporal dead zone and
# throws, taking the rest of that script block with it. muJump calls its equivalent immediately and
# is fine only because its endpoint is declared earlier; copying the shape without copying the
# ordering is what broke it. Deferred to DOMContentLoaded (or the next tick, if the document is
# already parsed), which is after every top-level const in the file has been initialised.
DEFER = [
    ('''fetchNewNuclei().then(function(){ try{wireNewNucleusList();}catch(_e){} });''',
     '''function kickNewNuclei(){ fetchNewNuclei().then(function(){ try{wireNewNucleusList();}catch(_e){} }); }
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",kickNewNuclei);
else setTimeout(kickNewNuclei,0);''',
     "the fetch waits until the page's constants exist"),
]

SUBMIT = [
    ('''    const commentEl=document.getElementById("newnuccomment");
    nmsg.textContent="sending…";
    postReport({
      type:"new_cell_no_nucleus",
      coord:raw.slice(0,3).join(","),
      comment:(commentEl&&commentEl.value||"").trim(),
      timestamp:new Date().toISOString()
    },"missed nucleus").then(function(d){
      nmsg.textContent=(d&&d.ok)?"Thank you — recorded.":"Could not record that.";
      if(d&&d.ok){ coordEl.value=""; if(commentEl)commentEl.value=""; }
    }).catch(function(e){ nmsg.textContent="failed: "+netErr(e); });''',
     '''    const commentEl=document.getElementById("newnuccomment");
    const idEl=document.getElementById("newnucid");
    /* canonSubmitName, not the raw label: the ontology carries several display names that submit
       as one canonical identity, and this form has to agree with the tool's own identification
       flow (see its canonSubmitName call) or the same cell type arrives in the sheet under two
       spellings and nothing can join them. */
    let ident="";
    try{ ident=UJ.ontology.canonSubmitName((idEl&&idEl.value||"").trim())||""; }
    catch(_e){ ident=(idEl&&idEl.value||"").trim(); }
    nmsg.textContent="sending…";
    postReport({
      type:"new_cell_no_nucleus",
      coord:raw.slice(0,3).join(","),
      identified:ident,
      comment:(commentEl&&commentEl.value||"").trim(),
      timestamp:new Date().toISOString()
    },"missed nucleus").then(function(d){
      nmsg.textContent=(d&&d.ok)?"Thank you — recorded.":"Could not record that.";
      if(d&&d.ok){
        coordEl.value=""; if(commentEl)commentEl.value=""; if(idEl)idEl.value="";
        /* Straight into the list under the form, without waiting for a reload -- the row is
           already saved and the cache is the only thing that does not know it yet. Sheets need a
           moment before a re-read would return it, and re-reading to learn what we just sent is
           slower and no more true. */
        if(NEW_NUC_CACHE)NEW_NUC_CACHE.push({coord:raw.slice(0,3).join(","),identified:ident,
          comment:(commentEl&&commentEl.value||"").trim(),
          reporterName:(typeof REPORTER_NAME!=="undefined"&&REPORTER_NAME)||"",
          timestamp:new Date().toISOString()});
        try{wireNewNucleusList();}catch(_e2){}
      }
    }).catch(function(e){ nmsg.textContent="failed: "+netErr(e); });''',
     "the identity is submitted with it"),

    ('''  const an=document.getElementById("fixnew");''',
     '''  /* The form is part of showCell()'s markup, so the list is rebuilt with every panel render --
     and again by the fetch's own .then() when that is the later of the two. */
  try{wireNewNucleusList();}catch(_e){}
  const an=document.getElementById("fixnew");''',
     "the list is drawn with the form"),
]

JUMP = [
    ('''  const r=nearest(v[0],v[1],v[2]);
  if(r.i<0)return fail("No nucleus found.");
  if(r.dist>30000) fail("Nearest nucleus is "+(r.dist/1000).toFixed(1)+" µm away — that coordinate may be outside the tissue, which fills only about 454 × 447 µm of the 655 µm frame.");
  showCell(r.i,r.dist);''',
     '''  const r=nearest(v[0],v[1],v[2]);
  /* A nucleus somebody ADDED counts as a nucleus. Whichever is genuinely closer to the typed
     coordinate wins -- there is no reason a detection should beat a hand-placed nucleus that is
     nearer, and on this dataset most real cells have no detection at all. Before 2026-09-09 the
     community list was not consulted at all, so pasting the coordinate of a cell you had added
     yourself landed on whatever detection happened to be nearest and looked like the report had
     been thrown away. */
  const nn=nearestNewNucleus(v[0],v[1],v[2]);
  if(nn&&(r.i<0||nn.dist<r.dist)){
    if(nn.dist>30000) fail("Nearest nucleus is "+(nn.dist/1000).toFixed(1)+" µm away — that coordinate may be outside the tissue, which fills only about 454 × 447 µm of the 655 µm frame.");
    showNewNucleus(nn.rec,nn.dist);
    return;
  }
  if(r.i<0)return fail("No nucleus found.");
  if(r.dist>30000) fail("Nearest nucleus is "+(r.dist/1000).toFixed(1)+" µm away — that coordinate may be outside the tissue, which fills only about 454 × 447 µm of the 655 µm frame.");
  showCell(r.i,r.dist);''',
     "jumping finds an added nucleus when it is closer"),
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


edit("ljump.html", FORM + HELPERS + DEFER + SUBMIT + JUMP)
print("\nnow: node newnucleuscheck.js")
