/* core/bulkorgan.js — one paste, one structure type, as many cells as you marked.  2026-09-21

   Moved out of ujump.html, where it was built on 2026-09-10 (see the header below, kept as it was).
   Nothing about what it does changed in the move; bulkorgancheck.js was written first and prints the
   same thing on both sides of it.

   WHAT A HOST PROVIDES, all optional, all defaulting to what µJump has always used:

     UJ.cfg.bulk = {
       sources:        () -> {seg, nuc, res}   what core/segread.js reads      (SRC.seg, SRC.nuc)
       indexOfRoot:    (rootId) -> row                                          (rootIdToIndex)
       indexOfNucleus: (nucleusId) -> row                                       (nidToIndex)
       nucIdOf:        (row) -> the nucleus id a structure is filed under       (NID[row])
       coordOf:        (row) -> "x,y,z" it is filed at                          (NX, NY, NZ)
       label:          (row) -> HTML for the Cell column              ("Nucleus N · <name>")
       name:           (row) -> the cell's type, for that label      (own / community / MICrONS)
       groupByRow:     true -> markers group by CELL (row), not by segment  (off)   2026-09-21
       needsCell:      "why" -> a segment in no cell cannot be ticked       (off)   2026-09-21
       prepare:        (say) -> Promise, awaited before the markers are read  (off)   2026-09-21
       cellNear:       (point) -> Promise<{i, distNm, others} | {i:-1, why}>  (off)   2026-09-21
                       rung 3b: the host's nearest cell, UNTICKED with its distance
       afterSubmit:    (sent) -> what postReport returned for each row       (off)   2026-09-21
     }
   bulkOrganReset() clears the card, for a host whose volume changes under it.

   A DATASET WITH NO NUCLEUS VOLUME has no rung 3 — see the ladder.

   DOM: an empty `<div class="card" id="bulkOrganCard"></div>` where the page wants the card. The
   module fills it on DOMContentLoaded and wires it once; a page that already has the markup keeps
   it. Needs core/organelles.js, core/segread.js, core/ontology.js (for the Nucleus group) loaded
   first, and the host's postReport / reportGateBlock / escHtml. */
var UJ = UJ || {};
var BULK_ORGAN_WIRED = false;
function bulkCfg(){ return (typeof UJ !== "undefined" && UJ.cfg && UJ.cfg.bulk) || {}; }
function bulkSources(){
  var c = bulkCfg();
  if (c.sources){
    var o = (typeof c.sources === "function") ? c.sources() : c.sources;
    return { seg: o.seg || "", nuc: o.nuc || "", res: o.res || UJ.cfg.res };
  }
  return { seg: SRC.seg, nuc: SRC.nuc, res: UJ.cfg.res };
}
function bulkIndexOfRoot(r){
  var c = bulkCfg();
  if (c.indexOfRoot) return c.indexOfRoot(r);
  return (typeof rootIdToIndex === "function") ? rootIdToIndex(r) : -1;
}
function bulkIndexOfNucleus(n){
  var c = bulkCfg();
  if (c.indexOfNucleus) return c.indexOfNucleus(n);
  return (typeof nidToIndex === "function") ? nidToIndex(n) : -1;
}
function bulkNucIdOf(i){
  var c = bulkCfg();
  return c.nucIdOf ? String(c.nucIdOf(i)) : String(NID[i]);
}
function bulkCoordOf(i){
  var c = bulkCfg();
  return c.coordOf ? String(c.coordOf(i)) : [NX[i], NY[i], NZ[i]].join(",");
}
function bulkCellLabel(i){
  var c = bulkCfg();
  return c.label ? c.label(i) : "Nucleus " + NID[i] + " &middot; " + escHtml(bulkOrganCellName(i));
}

/* ── BULK ORGANELLE ANNOTATION ──────────────────────────────────────────────────  2026-09-10
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
/* ── WHERE A NUCLEAR STRUCTURE ACTUALLY SITS ─────────────────────────────────────  2026-09-11
   Søren: "By definition, NRs are not inside the nucleus meshes, but are going through them."

   Right, and definitional. A type II nucleoplasmic reticulum is an invagination of BOTH nuclear
   membranes carrying a diffusion-accessible CYTOPLASMIC core into the nucleus, with its own pore
   complexes and lamina (Jorgens et al., Front. Cell Dev. Biol. 2022, doi:10.3389/fcell.2022.914286).
   A nucleus segmentation labels nucleoplasm, so that core is excluded from it by construction --
   a correctly placed NR type II marker reads 0 in the nucleus volume EVERY time. Type I invaginates
   the inner membrane only and is no better off; a nuclear pore is in the membrane itself.

   Yesterday this file treated the whole Nucleus group as "must be inside a nucleus" and flagged
   all three of his NR type II as misplaced. That was wrong, and wrong about the one kind this
   feature was built for.

   ENVELOPE: in or through the membrane. Reading 0 in the nucleus volume is expected.
   NUCLEOPLASM: everything else in the Nucleus group -- genuinely inside, and worth a flag when a
   marker is not. Derived by subtraction so a kind added to the group defaults to the conservative
   side; move it into ENVELOPE if it belongs in the membrane. */
const BULK_ORGAN_ENVELOPE={nuclear_pore:1,nucleoplasmic_reticulum_1:1,nucleoplasmic_reticulum_2:1};
const BULK_ORGAN_NUCLEOPLASM=(function(){
  const out={};
  /* ωJump ships the generated copy at UJ.organelles.GROUPS rather than the global. 2026-09-21 */
  (typeof ORGANELLE_GROUPS!=="undefined"?ORGANELLE_GROUPS
   :(typeof UJ!=="undefined"&&UJ.organelles&&UJ.organelles.GROUPS)?UJ.organelles.GROUPS:[]).forEach(function(g){
    if(g.label!=="Nucleus")return;
    (g.kinds||[]).forEach(function(k){ if(!BULK_ORGAN_ENVELOPE[k.value])out[k.value]=1; });
  });
  return out;
})();
/* How far out rung 3 of the ladder will look, in nanometres. His three markers found their nucleus
   at 92-188 nm; a micrometre is well inside one cell and well short of the next nucleus. */
const BULK_ORGAN_NEAR_NM=1000;
let BULK_ORGAN_ROWS=[];

/* Same precedence buildAllIdentities() uses -- own-verified, then community, then the MICrONS
   prediction -- so a cell reads here exactly as it reads in the filter and on its own panel. */
function bulkOrganCellName(i){
  if(i<0)return "";
  if(bulkCfg().name)return bulkCfg().name(i);
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
/* ── THE LADDER ───────────────────────────────────────────────────────────────────  2026-09-11
   Every rung reads real segmentation; none of them guesses.

     1  cell segmentation AT the point      -> the root id, and the cell
     2  nucleus segmentation AT the point   -> the nucleus id, and the cell
     3  nucleus segmentation NEAR the point -> the wall the marker is in
     4  nothing                             -> listed, with the reason, and NOT tickable

   Rung 2 exists because the cell segmentation stops before the nucleus segmentation does: at the
   top of minnie65 -- the glia limitans, which is where he is working -- nuclei are segmented and
   cells are not. Both of his astrocytes are in this tool's own table with a nucleus id and no root
   id at all.

   Rung 3 is decisive for an ENVELOPE kind, because that is where such a structure is supposed to
   be. For anything else it is evidence rather than proof, so the row carries the distance and he
   decides. It is NOT the nearest-centroid shortcut rejected in core/segread.js: that compares a
   point to a list of nucleus centres and in a dendrite names a different cell. This reads the
   segmentation itself inside a radius smaller than the structures involved.

   `warn` means the row starts unticked and he can tick it. `note` means the row is ticked and the
   note explains how. No cellKey means there is nothing to attach a structure to at all. */
async function bulkOrganResolveRow(row){
  const out={kind:row.kind,a:row.a,b:row.b,use:false,cellKey:"",rootId:"0",nucleusId:0,i:-1,
             via:"",note:"",warn:"",distNm:0};
  const ends=[["point A",row.a]];
  if(row.b)ends.push(["point B",row.b]);

  /* ── rungs 1 and 2 ── both ends, because a two-ended kind can straddle a boundary and an NR
     type II straddling the nuclear envelope is the normal case rather than the odd one. */
  let hit=null,lastWhy="";
  for(const e of ends){
    const r=await UJ.segread.resolveAt(e[1]);
    lastWhy=r.why||lastWhy;
    if(r.inCell){ hit={r:r,via:e[0],rung:1}; break; }
    if(r.nucleusId&&!hit){ hit={r:r,via:e[0],rung:2}; }
  }

  if(hit&&hit.rung===1){
    out.rootId=hit.r.rootId; out.nucleusId=hit.r.nucleusId; out.via=hit.via;
    let i=bulkIndexOfRoot(hit.r.rootId);
    if(i<0&&hit.r.nucleusId)i=bulkIndexOfNucleus(hit.r.nucleusId);
    out.i=i; out.cellKey=hit.r.rootId;
    /* A CELL OF MANY SEGMENTS IS ONE CELL, 2026-09-21 -- χJump, where the segment is a fragment. */
    if(i>=0&&bulkCfg().groupByRow)out.cellKey="row:"+i;
    if(i<0&&bulkCfg().needsCell){ out.cellKey=""; out.warn=String(bulkCfg().needsCell); return out; }
    if(i>=0&&hit.r.nucleusId&&bulkNucIdOf(i)!==String(hit.r.nucleusId)){
      /* Two segmentations disagreeing about one voxel is worth showing, not resolving by
         preference: it usually means the marker sits on a boundary. */
      out.warn="the cell here is nucleus "+bulkNucIdOf(i)+" but the point is inside nucleus "+hit.r.nucleusId;
      return out;
    }
    if(BULK_ORGAN_NUCLEOPLASM[row.kind]&&!hit.r.inNucleus){
      out.warn="not inside any nucleus \u2014 check the marker";
      return out;
    }
    out.use=true;
    return out;
  }

  if(hit&&hit.rung===2){
    out.nucleusId=hit.r.nucleusId; out.via=hit.via;
    out.i=bulkIndexOfNucleus(hit.r.nucleusId);
    out.cellKey="nuc:"+hit.r.nucleusId;
    out.note="inside the nucleus \u2014 no cell segmentation here";
    out.use=true;
    return out;
  }

  /* ── rung 3 ── */
  let near=null;
  /* A dataset with no nucleus volume has no rung 3: searching one that is not configured fetches
     "/info" off this page's own host and throws. Rows fall through to "nothing here", with the
     reason the reader gave. */
  for(const e of (bulkSources().nuc?ends:[])){
    const n=await UJ.segread.nearestNucleus(e[1],BULK_ORGAN_NEAR_NM);
    if(!n.nucleusId)continue;
    if(!near||n.distanceNm<near.distanceNm){ near=n; near.via=e[0]; }
  }
  /* ── rung 3b: the host's own nearest cell ──  2026-09-21
     ωJump's cells are nucleus POINTS and most of its volumes have no segmentation, so rungs 1-3
     have nothing to read. The nearest found nucleus is evidence, not proof -- the row starts
     unticked with the distance on it, and two candidates close together are not offered at all. */
  if(!near&&bulkCfg().cellNear){
    let best=null,why="";
    for(const e of ends){
      const c=await bulkCfg().cellNear(e[1]);
      if(!c||!(c.i>=0)){ if(c&&c.why)why=c.why; continue; }
      if(!best||c.distNm<best.distNm){ best=c; best.via=e[0]; }
    }
    if(!best){ out.warn=why||lastWhy||"no cell found near this marker"; return out; }
    out.via=best.via; out.distNm=Math.round(best.distNm);
    if(best.others&&best.others.length){
      out.i=-1;
      out.warn="between "+bulkOrganCellName(best.i)+" and "+best.others.join(", ")
        +" \u2014 too close to call";
      return out;
    }
    out.i=best.i; out.cellKey="row:"+best.i;
    out.warn="no segmentation to confirm it \u2014 the nearest nucleus found is "
      +(best.distNm/1000).toFixed(1)+" \u00b5m away. Tick it if this is its cell.";
    return out;
  }
  if(!near){
    out.warn=lastWhy||"no cell and no nucleus within "
      +(BULK_ORGAN_NEAR_NM/1000).toFixed(1)+" \u00b5m";
    return out;
  }
  if(near.others.length){
    /* Between two nuclei is genuinely ambiguous and picking the closer one would be a coin toss
       dressed up as a measurement. */
    out.warn="between nuclei "+near.nucleusId+" and "+near.others.join(", ")
      +" \u2014 too close to call";
    return out;
  }
  out.nucleusId=near.nucleusId; out.via=near.via; out.distNm=near.distanceNm;
  out.i=bulkIndexOfNucleus(near.nucleusId);
  out.cellKey="nuc:"+near.nucleusId;
  if(BULK_ORGAN_ENVELOPE[row.kind]){
    out.note="in the wall of the nucleus, "+near.distanceNm+" nm away \u2014 where this structure belongs";
    out.use=true;
  }else{
    out.warn="no cell segmented here; the nearest nucleus is "+near.distanceNm+" nm away";
  }
  return out;
}

function bulkOrganRender(){
  const host=document.getElementById("bulkOrganTable");
  const submitRow=document.getElementById("bulkOrganSubmitRow");
  if(!host)return;
  if(!BULK_ORGAN_ROWS.length){host.innerHTML="";if(submitRow)submitRow.style.display="none";return;}
  const cell=function(r){
    if(r.i>=0)return bulkCellLabel(r.i);
    if(r.rootId&&r.rootId!=="0")return "root "+escHtml(r.rootId)+' <span style="opacity:.7">(no detection)</span>';
    if(r.nucleusId)return "Nucleus "+r.nucleusId+' <span style="opacity:.7">(no detection)</span>';
    return '<span style="opacity:.7">&mdash;</span>';
  };
  const pt=function(p){return p?p.map(function(v){return Math.round(v);}).join(", "):""; };
  let html='<table style="width:100%;border-collapse:collapse;font-size:12px">'
    +'<tr style="color:var(--mut);text-align:left">'
    +'<th style="padding:4px 6px"></th><th style="padding:4px 6px">Marker</th>'
    +'<th style="padding:4px 6px">Cell</th><th style="padding:4px 6px">Notes</th></tr>';
  BULK_ORGAN_ROWS.forEach(function(r,n){
    const dim=r.use?"":"opacity:.65;";
    /* NO CELL, NO CHECKBOX. "Tick it back on if you disagree" is a sensible offer about a row the
       tool resolved and then flagged; it is meaningless for a row with nothing to attach a
       structure to, and yesterday's version let one be ticked and submitted with rootId "0". */
    const pick=r.cellKey
      ? '<input type="checkbox" class="bulkorgpick" data-n="'+n+'"'+(r.use?" checked":"")+'>'
      : '<input type="checkbox" disabled title="There is no cell at this marker to attach a structure to.">';
    html+='<tr style="border-top:1px solid var(--line);'+dim+'">'
      +'<td style="padding:4px 6px;vertical-align:top">'+pick+'</td>'
      +'<td style="padding:4px 6px;vertical-align:top;font-family:var(--mono)">'+escHtml(pt(r.a))
        +(r.b?'<br><span style="opacity:.7">'+escHtml(pt(r.b))+'</span>':'')+'</td>'
      +'<td style="padding:4px 6px;vertical-align:top">'+cell(r)+'</td>'
      +'<td style="padding:4px 6px;vertical-align:top">'
        +(r.warn?'<span style="color:var(--warn)">'+escHtml(r.warn)+'</span>'
         :r.note?'<span style="opacity:.7">'+escHtml(r.note)+'</span>'
               :'<span style="opacity:.7">matched on '+escHtml(r.via)+'</span>')+'</td></tr>';
  });
  html+='</table>';
  const on=BULK_ORGAN_ROWS.filter(function(r){return r.use&&r.cellKey;});
  /* Counted by CELL, not by root id -- two markers in one nucleus with no root id used to share
     the key "0" with every unresolved row, so the summary said "1 cell" about nothing at all. */
  const cells={};on.forEach(function(r){cells[r.cellKey]=1;});
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
      +(layer?' in a layer called "'+layer+'".':". Mark the structures in the viewer first \u2014 a "
      +"point, or a LINE for anything with two ends \u2014 then copy the whole address bar."),true);
    return;
  }
  const built=UJ.organelles.rowsFromPoints(kind,parsed.points);
  try{
    UJ.segread.configure(bulkSources());
  }catch(e){bulkOrganSetStatus(e.message,true);return;}
  btn.disabled=true;
  if(bulkCfg().prepare){
    try{ await bulkCfg().prepare(function(m){ bulkOrganSetStatus(m); }); }
    catch(e){ btn.disabled=false; bulkOrganSetStatus(String(e&&e.message||e),true); return; }
  }
  const t0=Date.now();
  bulkOrganSetStatus("Reading the segmentation for "+built.rows.length+" marker"
    +(built.rows.length===1?"":"s")+"\u2026");
  /* Six at a time: a cold read is three round trips and a paste of two hundred markers should not
     open two hundred sockets. Everything the reader fetches is cached, so markers in one cell
     after the first are effectively free. */
  const done=await UJ.segread.mapPool(built.rows,6,bulkOrganResolveRow,function(n,total){
    bulkOrganSetStatus("Reading the segmentation \u2014 "+n+" of "+total+"\u2026");
  });
  btn.disabled=false;
  BULK_ORGAN_ROWS=done.map(function(r,i){
    if(r&&r.error)return {kind:built.rows[i].kind,a:built.rows[i].a,b:built.rows[i].b,
                          use:false,rootId:"0",nucleusId:0,i:-1,via:"",why:r.error};
    return r;
  });
  const secs=((Date.now()-t0)/1000).toFixed(1);
  bulkOrganSetStatus(built.rows.length+" marker"+(built.rows.length===1?"":"s")+" read in "+secs
    +" s"+(built.odd?" \u2014 one marker had no partner and is listed with only one end.":"."));
  bulkOrganRender();
}

/* One submission PER CELL, mirroring wireOrganelleForm's groupId/subIndex/subCount convention --
   so a cell's own panel reads "one user logged 3 structures here" rather than three separate
   visits, which is what actually happened. */
function bulkOrganSubmit(){
  const btn=document.getElementById("bulkOrganSubmit");
  /* ── ASK ONCE, BEFORE ANYTHING IS SENT ──────────────────────────────────────────  2026-09-11
     This used to walk straight into the posting loop, so a signed-out submission raised one modal
     per structure and then disabled the button anyway. Nothing is attempted until the gate says
     the write can go out, and the button is left exactly as it was -- his rows are still on
     screen, and pressing Submit again after signing in is all that is needed. */
  if(typeof reportGateBlock==="function"){
    const blocked=reportGateBlock();
    if(blocked){alert(blocked);return;}
  }
  /* `r.cellKey` as well as `r.use`: a disabled checkbox cannot be ticked through the UI, but this
     is the statement that nothing without a cell is ever posted, and it is what the check asserts. */
  const picked=BULK_ORGAN_ROWS.filter(function(r){return r.use&&r.cellKey;});
  if(!picked.length)return;
  const comment=(document.getElementById("bulkOrganComment").value||"").trim();
  /* Grouped by CELL. Two markers in one nucleus that has no root id are one submission, not two
     halves of a group keyed on the string "0". */
  const byCell={};
  picked.forEach(function(r){(byCell[r.cellKey]=byCell[r.cellKey]||[]).push(r);});
  const stamp=Date.now();
  let posted=0;
  const sent=[];
  Object.keys(byCell).forEach(function(cellKey,ci){
    const rows=byCell[cellKey];
    const i=rows[0].i;
    /* A cell the segmentation knows only as a nucleus carries a BLANK rootId -- which is what the
       top of this volume is: nuclei segmented, cells not. The nucleus id is the key the read-back
       uses, and it is present either way. */
    const rootId=(rows[0].rootId&&rows[0].rootId!=="0")?rows[0].rootId:"";
    const nucId=(i>=0)?bulkNucIdOf(i):(rows[0].nucleusId?String(rows[0].nucleusId):"");
    const coord=(i>=0)?bulkCoordOf(i):rows[0].a.join(",");
    const groupId=(nucId||"nonuc")+"_"+(stamp+ci)+"_org";
    rows.forEach(function(r,si){
      /* Counts what actually WENT OUT, not what was attempted -- which is the difference between
         "3 structures logged" and a green message about nothing. */
      const back=postReport({
        type:"organelle_location",
        timestamp:new Date().toISOString(),
        nucleusId:nucId,rootId:(r.rootId&&r.rootId!=="0")?r.rootId:rootId,coord:coord,
        groupId:groupId,subIndex:si+1,subCount:rows.length,
        kind:r.kind,
        pointA:r.a.map(Math.round).join(","),
        pointB:r.b?r.b.map(Math.round).join(","):"",
        identified:"",comment:comment,path:"bulk paste"
      });
      sent.push(back);
      if(back!==false)posted++;
    });
  });
  /* A button that cannot be pressed is only honest once the work is actually done. If nothing
     went out, say so and leave it live rather than reporting a submission that did not happen. */
  if(!posted){
    btn.disabled=false;btn.textContent="Submit";
    document.getElementById("bulkOrganThanks").innerHTML=
      '<div class="idf-flag" style="margin-top:10px">Nothing was sent \u2014 your rows are still '
      +'here. Try Submit again.</div>';
    return;
  }
  btn.disabled=true;btn.textContent="submitted";
  const nCells=Object.keys(byCell).length;
  const thanks=function(n){
    document.getElementById("bulkOrganThanks").innerHTML=
      '<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">'
      +"Thanks \u2014 "+n+" structure"+(n===1?"":"s")+" logged across "
      +nCells+" cell"+(nCells===1?"":"s")+".</div>";
  };
  /* A PROMISE IS NOT A YES, 2026-09-21. Where postReport answers with a promise of {ok, error}
     (λJump, βJump, ηJump, ωJump), the thanks waits for the answers, and a refusal is said -- with
     the server's own reason and Submit live again -- rather than counted. µJump's family answers
     true and reports each post in its own toast, so it is thanked at once as before. */
  const pending=sent.filter(function(x){return x&&typeof x.then==="function";});
  if(!pending.length){ thanks(posted); }
  else{
    btn.textContent="sending\u2026";
    Promise.all(sent.map(function(x){
      if(!(x&&typeof x.then==="function"))return x===false?"not sent":"";
      return x.then(function(d){return d&&d.ok===false?String(d.error||"refused"):"";},
                    function(e){return String(e&&e.message||e||"could not reach the server");});
    })).then(function(errs){
      const bad=errs.filter(Boolean);
      if(!bad.length){ btn.textContent="submitted"; thanks(errs.length); return; }
      btn.disabled=false; btn.textContent="Submit";
      document.getElementById("bulkOrganThanks").innerHTML=
        '<div class="idf-flag" style="margin-top:10px;color:var(--bad)">'
        +(errs.length-bad.length)+" of "+errs.length+" reached the sheet; "+bad.length
        +" did not \u2014 "+escHtml(bad[0])+" Your rows are still here: press Submit again.</div>";
    });
  }
  if(bulkCfg().afterSubmit){ try{ bulkCfg().afterSubmit(sent); }catch(_e){} }
}

/* Empty the card: rows, table, messages and the pasted link. For a host whose volume changes under
   it -- markers pasted for one volume are coordinates in another's voxels on the next. 2026-09-21 */
function bulkOrganReset(){
  BULK_ORGAN_ROWS=[];
  ["bulkOrganLink","bulkOrganComment"].forEach(function(id){
    const e=document.getElementById(id); if(e)e.value=""; });
  ["bulkOrganStatus","bulkOrganThanks"].forEach(function(id){
    const e=document.getElementById(id); if(e)e.innerHTML=""; });
  const b=document.getElementById("bulkOrganSubmit");
  if(b){ b.disabled=false; b.textContent="Submit"; }
  bulkOrganRender();
}

function wireBulkOrgan(){
  const kindEl=document.getElementById("bulkOrganKind");
  if(!kindEl||BULK_ORGAN_WIRED)return;
  BULK_ORGAN_WIRED=true;
  kindEl.innerHTML=(typeof ORGANELLE_KIND_OPTIONS_HTML!=="undefined")
    ? ORGANELLE_KIND_OPTIONS_HTML : UJ.organelles.optionsHtml();
  kindEl.value="nucleoplasmic_reticulum_2";
  document.getElementById("bulkOrganResolve").addEventListener("click",function(){
    bulkOrganFindCells().catch(function(e){bulkOrganSetStatus(String(e&&e.message||e),true);
      document.getElementById("bulkOrganResolve").disabled=false;});
  });
  document.getElementById("bulkOrganSubmit").addEventListener("click",bulkOrganSubmit);
  /* Re-arm after a submission so a second paste works without a reload. Editing the link was the
     only way back in until 2026-09-11, which is no help at all to somebody whose submission was
     refused with the link still correct -- "Find the cells" re-arms it too, and a refused
     submission no longer disables it in the first place. */
  const rearm=function(){
    const b=document.getElementById("bulkOrganSubmit");
    if(b.disabled){b.disabled=false;b.textContent="Submit";}
  };
  document.getElementById("bulkOrganLink").addEventListener("input",rearm);
  document.getElementById("bulkOrganKind").addEventListener("change",rearm);
  document.getElementById("bulkOrganResolve").addEventListener("click",rearm);
}

/* The card's markup, read out of ujump.html as it was on 2026-09-21. */
function bulkOrganHtml(){
  return "<details id=\"bulkOrganPanel\">\n<summary style=\"cursor:pointer;font-weight:600\">Bulk organelle annotation &mdash; one structure type, many cells</summary>\n<p class=\"hint\" style=\"margin-top:8px\">Mark the same kind of structure in as many cells as you like in Neuroglancer &mdash; a point, or a <b>line</b> for anything with two ends like a cilium or an NR type II &mdash; then paste the whole address bar here. Each marker is looked up in the segmentation to find which cell it sits in, so you never have to visit the cells one at a time.</p>\n<label style=\"margin-top:10px\">Structure &mdash; one kind per submission</label>\n<select id=\"bulkOrganKind\"></select>\n<label style=\"margin-top:12px\">Neuroglancer link</label>\n<textarea id=\"bulkOrganLink\" placeholder=\"Paste the whole address bar from Neuroglancer, with your annotations on it.\"></textarea>\n<div class=\"row\" style=\"gap:8px;margin-top:8px\">\n<div class=\"coord\" style=\"flex:1 1 auto\"><input type=\"text\" id=\"bulkOrganLayer\" placeholder=\"Annotation layer name (optional &mdash; blank reads every annotation layer)\"></div>\n<button class=\"idbtn\" id=\"bulkOrganResolve\" style=\"flex:0 0 auto\">Find the cells</button>\n</div>\n<p class=\"hint\" id=\"bulkOrganStatus\"></p>\n<div id=\"bulkOrganTable\" style=\"margin-top:8px\"></div>\n<div id=\"bulkOrganSubmitRow\" style=\"display:none;margin-top:12px\">\n<label>Comment (optional &mdash; goes on every row)</label>\n<input type=\"text\" id=\"bulkOrganComment\" placeholder=\"e.g. from the L2/3 astrocyte survey\">\n<button class=\"idbtn\" id=\"bulkOrganSubmit\" style=\"width:100%;margin-top:10px\">Submit</button>\n</div>\n<div id=\"bulkOrganThanks\"></div>\n</details>\n";
}
/* Fill an empty wrapper, wire once. A page that still carries its own copy keeps it. */
function bulkOrganMount(){
  var w = document.getElementById("bulkOrganCard");
  if (!w) return false;
  if (!w.firstElementChild) w.innerHTML = bulkOrganHtml();
  wireBulkOrgan();
  return true;
}
if (typeof document !== "undefined"){
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bulkOrganMount);
  else bulkOrganMount();
}
