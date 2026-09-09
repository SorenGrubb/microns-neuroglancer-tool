"""An added cell is a real cell: named, placed in a layer, and able to carry organelles.  2026-09-09

Søren: *"Ok, but if I call it an astrocyte, it is an astrocyte. Then that should be the name and I
should also be able to log organelles and see the layer it is in etc..."* and, on the filter panel:
*"While you are at it, also add the cell names here so that I can filter them."*

Right on every count. Yesterday's change made an added nucleus findable; it stopped short of making
it a cell. Four things.

1. NAMING IT, and the backend has had the mechanism all along. Code.gs's new_cell_no_nucleus branch
   supports `append:true`, matching on the row's EXACT stored coord, and its own comment says what
   it is for:

       "identified/certainty/comment are filled the same way ... this is what makes an
        'unclassified, location only' report work: whoever later classifies that cell submits
        through this same flow with append:true, a real identified name and certainty, and this
        fills them into the SAME row rather than silently dropping the classification or creating
        a duplicate."

   It only ever fills blanks, never overwrites. So the panel gets a name-it control that posts
   exactly that -- his existing row gains "Astrocyte" in the `identified` column, no duplicate row,
   no data migration.

   His current row has the word in `comment`, because the form had no identity field until
   yesterday. The control PREFILLS from that comment when it matches an ontology name and says so
   -- offered, not silently promoted. A comment is a comment until somebody says it is the identity.

2. THE LAYER. λJump stores a depth below the TRACED pia per detection (BDEP) and a layer index
   (BLAY) -- both precomputed, neither available for a point the detector never saw. The pial trace
   itself is not on the page, so the depth is estimated from the detections around it: k nearest in
   real µm, a least-squares plane fitted to their depths, evaluated at the new point. Depth below a
   traced surface is locally close to linear in position, which is exactly what a plane fit
   captures and what taking the nearest neighbour's depth does not.

   The layer then comes from the data rather than from a boundary table: the detections closest IN
   DEPTH to the estimate vote. No boundary model to drift, and it cannot invent a layer this
   dataset does not contain.

   Labelled "estimated" on screen, always. A number derived from neighbours must not sit in the
   same tag as one measured against the traced surface.

3. ORGANELLES. core/panel.js already ships organelleFlagHtml()/wireOrganelleFlag() as a
   self-contained pair, and µJump has logged organelles against new cells since ?newCellOrganelles=1
   existed -- keyed by coordinate, since there is no nucleus id. Dropping the pair into this panel
   with ID_CTX pointing at the added cell is the whole change.

4. THE FILTER LISTS EVERY CELL NAME. Its dropdown was built from `named` -- the identities that
   already exist in this dataset's Master cell list -- so a type nobody has reported here yet could
   not be filtered for, and the list on a dataset with 488 nuclei and a handful of identifications
   is nearly empty. Same rule, same words, same fix as µJump/δJump/πJump got this morning ("Even
   though they have not been reported yet, they should be in the list"), in the shape a <select>
   allows: two optgroups, reported and not-yet, every name present and every count honest.

Run: python3 src/an_added_cell_is_a_real_cell.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── depth and layer for a point the detector never saw ──────────────────────────────────────────
DEPTH = [
    ('''/* The panel for a cell the detector never found.''',
     '''/* ── DEPTH AND LAYER FOR A POINT WITH NO DETECTION ────────────────────────────────────────
   Søren, 2026-09-09: "I should ... see the layer it is in."

   BDEP (depth below the traced pia) and BLAY (layer) are precomputed per detection, and the pial
   trace itself does not ship on the page -- so neither exists for a nucleus somebody added. What
   does ship is 488 points that each carry both, all around it.

   Depth below a traced surface is locally close to LINEAR in position, so: take the k nearest
   detections in real micrometres, fit depth = a·x + b·y + c·z + d by least squares over just
   those, and evaluate at the new point. That is meaningfully better than borrowing the nearest
   neighbour's depth, which ignores which way the surface tilts. Falls back to the nearest
   neighbour when the neighbourhood is too small or degenerate (coplanar points make the normal
   equations singular, and a wrong number is worse than an approximate one). */
const DEPTH_FIT_K=14;
function solve4_(A,b){
  /* Gaussian elimination with partial pivoting on a 4x4. Small enough to write out, and writing
     it out beats a dependency for one plane fit. Returns null when singular, which is the
     coplanar-neighbourhood case the caller falls back on. */
  const M=[[A[0][0],A[0][1],A[0][2],A[0][3],b[0]],
           [A[1][0],A[1][1],A[1][2],A[1][3],b[1]],
           [A[2][0],A[2][1],A[2][2],A[2][3],b[2]],
           [A[3][0],A[3][1],A[3][2],A[3][3],b[3]]];
  for(let c=0;c<4;c++){
    let piv=c;
    for(let r=c+1;r<4;r++)if(Math.abs(M[r][c])>Math.abs(M[piv][c]))piv=r;
    if(Math.abs(M[piv][c])<1e-9)return null;
    const t=M[c];M[c]=M[piv];M[piv]=t;
    for(let r=0;r<4;r++){
      if(r===c)continue;
      const f=M[r][c]/M[c][c];
      for(let k=c;k<5;k++)M[r][k]-=f*M[c][k];
    }
  }
  return [M[0][4]/M[0][0],M[1][4]/M[1][1],M[2][4]/M[2][2],M[3][4]/M[3][3]];
}
function nearestDetections_(vx,vy,vz,k){
  const best=[];
  for(let i=0;i<N;i++){
    const dx=(vx-BX[i])*UJ_RX/1000,dy=(vy-BY[i])*UJ_RY/1000,dz=(vz-BZ[i])*UJ_RZ/1000;
    const d2=dx*dx+dy*dy+dz*dz;
    if(best.length<k){best.push({i:i,d2:d2});best.sort(function(a,b){return a.d2-b.d2;});}
    else if(d2<best[k-1].d2){best[k-1]={i:i,d2:d2};best.sort(function(a,b){return a.d2-b.d2;});}
  }
  return best;
}
function estimateDepthUm(vx,vy,vz){
  const near=nearestDetections_(vx,vy,vz,DEPTH_FIT_K);
  if(!near.length)return null;
  if(near.length<6)return BDEP[near[0].i];
  const A=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],b=[0,0,0,0];
  near.forEach(function(o){
    const r=[BX[o.i]*UJ_RX/1000,BY[o.i]*UJ_RY/1000,BZ[o.i]*UJ_RZ/1000,1],y=BDEP[o.i];
    for(let p=0;p<4;p++){ for(let q=0;q<4;q++)A[p][q]+=r[p]*r[q]; b[p]+=r[p]*y; }
  });
  const c=solve4_(A,b);
  if(!c)return BDEP[near[0].i];
  const d=c[0]*(vx*UJ_RX/1000)+c[1]*(vy*UJ_RY/1000)+c[2]*(vz*UJ_RZ/1000)+c[3];
  return isFinite(d)?d:BDEP[near[0].i];
}
/* The layer from the depth, decided by the DATA rather than by a boundary table: the detections
   closest in depth to the estimate vote. Nothing to drift out of date, and it cannot name a layer
   this dataset does not contain. */
function layerFromDepth(depthUm){
  if(depthUm===null||!isFinite(depthUm))return null;
  const near=[];
  for(let i=0;i<N;i++){
    if(BLAY[i]<0)continue;
    near.push({i:i,dd:Math.abs(BDEP[i]-depthUm)});
  }
  if(!near.length)return null;
  near.sort(function(a,b){return a.dd-b.dd;});
  const votes={};
  near.slice(0,15).forEach(function(o){const n=layerName(o.i);votes[n]=(votes[n]||0)+1;});
  let bestName=null,bestN=-1;
  for(const n in votes)if(votes[n]>bestN){bestN=votes[n];bestName=n;}
  return bestName;
}
/* The panel for a cell the detector never found.''',
     "depth and layer are estimated from the neighbours"),
]

# ── the panel: name it, place it, log organelles on it ──────────────────────────────────────────
PANEL = [
    ('''  let h='<div class="card">';
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
}''',
     '''  /* WHOEVER NAMED IT, NAMED IT. Søren: "if I call it an astrocyte, it is an astrocyte." */
  const named=rec.identified||"";
  /* His row has the word in `comment`, because this form had no identity field until yesterday.
     Offered as a prefill rather than promoted silently: a comment is a comment until somebody says
     it is the identity, and one click is a small price for not guessing on a stranger's behalf. */
  let fromComment="";
  try{
    const LN=UJ.ontology.LEAF_NAMES,c=String(rec.comment||"").trim().toLowerCase();
    for(const slug in LN)if(String(LN[slug]).toLowerCase()===c){fromComment=LN[slug];break;}
  }catch(_e){}
  const depthUm=estimateDepthUm(p[0],p[1],p[2]);
  const layerNm=layerFromDepth(depthUm);
  let h='<div class="card">';
  h+='<div class="celltype" id="ctHeadline">'+celltypeLink(p,escHtml(named||"Unnamed cell"))+'</div>';
  h+='<div style="margin-top:6px"><span class="tag none">added by the community</span>'
    +(layerNm?(' <span class="tag non" title="Estimated: this nucleus has no detection, so its '
      +'depth is fitted from the '+DEPTH_FIT_K+' nearest detections and the layer is the majority '
      +'of the detections nearest it in depth.">'+escHtml(layerNm.charAt(0).toUpperCase()+layerNm.slice(1))
      +' (estimated)</span>'):"")
    +(named?"":' <span class="tag none">unnamed</span>')+'</div>';
  h+='<p class="hint" style="margin-top:8px">This nucleus has no detection of its own \\u2014 '
    +'somebody added it because the detector missed it. It is not in the 488 the detector found, so '
    +'it has no measured diameter, volume or detector pass.</p>';
  if(depthUm!==null&&isFinite(depthUm))
    h+='<p class="hint"><b>'+depthUm.toFixed(1)+' \\u00b5m</b> below the traced pia (estimated from '
      +'the nearest detections, not measured against the trace itself).</p>';
  h+='<div class="row" style="margin-top:6px"><div class="coord" style="flex:1">'
    +p.join(", ")+'</div></div>';
  if(rec.reporterName)h+='<p class="hint">Added by '+escHtml(rec.reporterName)
    +(rec.timestamp?(" on "+escHtml(String(rec.timestamp).slice(0,10))):"")+'.</p>';
  if(rec.comment)h+='<p class="hint">&ldquo;'+escHtml(rec.comment)+'&rdquo;</p>';
  if(distNm>0)h+='<p class="hint">'+(distNm/1000).toFixed(1)+' \\u00b5m from the coordinate you typed.</p>';
  /* NAME IT. Posts new_cell_no_nucleus with append:true and this row's EXACT stored coord, which
     Code.gs matches as a string and uses to fill the blank `identified` on the row that is already
     there -- see that branch's own comment: it exists precisely so somebody can classify a
     location-only report later without creating a duplicate. It never overwrites, so a name
     already agreed cannot be changed from here. */
  h+='<div style="margin-top:12px;border-top:1px dashed var(--line);padding-top:10px">';
  if(named){
    h+='<p class="hint" style="margin:0">Identified as <b>'+escHtml(named)+'</b>.</p>';
  }else{
    h+='<label style="display:block">What kind of cell is it?</label>';
    if(fromComment)h+='<p class="hint" style="margin-top:0">The comment on this row says &ldquo;'
      +escHtml(fromComment)+'&rdquo;. Confirm it below to make that the identity.</p>';
    h+='<div class="row"><select id="addnucid" style="flex:2">'
      +'<option value="">Choose a cell type…</option>'+newNucIdOptionsHtml()+'</select>'
      +'<button class="idbtn" id="addnucsave" style="flex:1">Name this cell</button></div>'
      +'<p class="hint" id="addnucmsg"></p>';
  }
  /* Organelles, on a cell with no nucleus id. core/panel.js's pair is self-contained and µJump has
     logged organelles against new cells since ?newCellOrganelles=1 existed -- they key by
     coordinate, which is all a cell with no detection has. */
  if(typeof organelleFlagHtml==="function")h+=organelleFlagHtml();
  h+='</div></div>';
  document.getElementById("panel").innerHTML=h;
  /* ID_CTX is what the organelle form submits against: no nucleus id, a real coordinate. */
  ID_CTX={nucId:"",root:"",pos:p.slice()};
  if(typeof wireOrganelleFlag==="function"){try{wireOrganelleFlag("");}catch(_e2){}}
  const saveEl=document.getElementById("addnucsave");
  if(saveEl){
    const selEl=document.getElementById("addnucid");
    if(fromComment&&selEl)selEl.value=fromComment;
    saveEl.addEventListener("click",function(){
      const msg=document.getElementById("addnucmsg");
      if(!GOOGLE_VERIFIED){ msg.textContent="Sign in first — identifications are attributed."; return; }
      let nm="";
      try{ nm=UJ.ontology.canonSubmitName((selEl&&selEl.value||"").trim())||""; }
      catch(_e3){ nm=(selEl&&selEl.value||"").trim(); }
      if(!nm){ msg.textContent="Pick a cell type first."; return; }
      msg.textContent="sending…";
      postReport({type:"new_cell_no_nucleus",coord:String(rec.coord),identified:nm,
        append:true,timestamp:new Date().toISOString()},"identification").then(function(d){
        if(d&&d.ok){
          rec.identified=nm;              // the cache row, so the list and the panel agree at once
          showNewNucleus(rec,distNm);
          try{wireNewNucleusList();}catch(_e4){}
        }else{ msg.textContent="Could not record that."; }
      }).catch(function(e){ msg.textContent="failed: "+netErr(e); });
    });
  }
}''',
     "an added cell can be named, is placed in a layer, and carries organelles"),
]

# ── every cell name is filterable ───────────────────────────────────────────────────────────────
FILTER = [
    ('''      const named=Object.keys(counts).sort(function(a,b){return a.localeCompare(b);});
      let h='<select id="fIdentity" style="width:100%">';
      h+='<option value="">Not filtering by this</option>';
      h+='<option value="'+LJUMP_UNCLASSIFIED_SENTINEL+'">Unclassified ('+unclassified+')</option>';
      named.forEach(function(name){
        h+='<option value="'+escHtml(name)+'">'+escHtml(name)+' ('+counts[name]+')</option>';
      });
      h+='</select>';''',
     '''      /* EVERY CELL NAME, not only the ones already reported here. Søren, 2026-09-09: "also add
         the cell names here so that I can filter them." This was built from `counts` alone, so on
         a dataset with 488 nuclei and a handful of identifications the list was nearly empty and a
         type nobody had named yet could not be filtered for at all.

         The same rule µJump, δJump and πJump got this morning, in the shape a <select> allows: two
         optgroups rather than a dimmed row. Every name is present, every count is honest, and the
         ones with none say so instead of being absent. */
      const named=Object.keys(counts).sort(function(a,b){return a.localeCompare(b);});
      const rest=[];
      try{
        const LN=UJ.ontology.LEAF_NAMES,seen={};
        named.forEach(function(n){seen[n.toLowerCase()]=1;});
        for(const slug in LN){
          const nm=UJ.ontology.canonSubmitName(LN[slug])||LN[slug];
          if(!nm||seen[nm.toLowerCase()])continue;
          seen[nm.toLowerCase()]=1;rest.push(nm);
        }
        rest.sort(function(a,b){return a.localeCompare(b);});
      }catch(_e){}
      let h='<select id="fIdentity" style="width:100%">';
      h+='<option value="">Not filtering by this</option>';
      h+='<option value="'+LJUMP_UNCLASSIFIED_SENTINEL+'">Unclassified ('+unclassified+')</option>';
      if(named.length){
        h+='<optgroup label="Reported in this dataset">';
        named.forEach(function(name){
          h+='<option value="'+escHtml(name)+'">'+escHtml(name)+' ('+counts[name]+')</option>';
        });
        h+='</optgroup>';
      }
      if(rest.length){
        h+='<optgroup label="Not reported here yet">';
        rest.forEach(function(name){
          h+='<option value="'+escHtml(name)+'" title="No cell in this dataset carries this '
            +'identity yet \\u2014 pick it anyway and it starts matching the moment somebody reports '
            +'one.">'+escHtml(name)+' (0)</option>';
        });
        h+='</optgroup>';
      }
      h+='</select>';''',
     "the filter offers every cell name"),
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


edit("ljump.html", DEPTH + PANEL + FILTER)
print("\nnow: node newnucleuscheck.js")
