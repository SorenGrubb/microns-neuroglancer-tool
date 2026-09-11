"""An NR runs through the nucleus, not inside it.                                     2026-09-11

Søren, with three NR type II he had just marked in glia-limitans astrocytes, all three resolving to
no cell at all:

    "Now I found 3 new NR type II inside some glia limitans astrocytes that have been identified
     and have nucleus meshes but are missing root ID meshes because they are in the top of the
     dataset, where only nuclei have been segmented. No cells are identified by the bulk
     annotation. By definition, NRs are not inside the nucleus meshes, but are going through them.
     How do we deal with that?"

Three separate faults, one of which is a mistake I wrote yesterday.

## 1. The biology was wrong, and it was wrong about the exact kind he cares about

Yesterday's rule flagged any Nucleus-group kind that did not read INSIDE a segmented nucleus as
"not inside any nucleus -- check the marker". For a nucleoplasmic reticulum that is exactly
backwards. A type II NR is an invagination of BOTH nuclear membranes carrying a "diffusion-
accessible cytoplasmic core" into the nucleus, complete with its own nuclear pore complexes and
lamina (Jorgens et al., *Front. Cell Dev. Biol.* 2022, doi:10.3389/fcell.2022.914286 --
https://www.frontiersin.org/journals/cell-and-developmental-biology/articles/10.3389/fcell.2022.914286/full).
A nucleus segmentation labels NUCLEOPLASM. The tubule's core is cytoplasm, so it is excluded from
the nucleus by construction: a correctly placed NR type II marker reads 0 in the nucleus volume
every single time. Type I, invaginating only the inner membrane, is no better off, and a nuclear
pore is in the membrane itself.

So the Nucleus group splits in two. NUCLEOPLASM kinds (nucleolus, chromatin) really must be inside
a nucleus and it is worth saying when they are not. ENVELOPE kinds (nuclear pore, NR type I, NR
type II) sit in or through the membrane and reading 0 there is the expected result, not a warning.

## 2. The cell segmentation stops before the nucleus segmentation does

Measured on his three markers, all six endpoints: rootId 0 AND nucleusId 0, in both volumes, with
the nucleus chunk present and decoding cleanly -- so the volumes cover this tissue and there is
genuinely nothing labelled at those voxels. Both cells are in µJump's own table
(nucleus 253863 at index 84947, nucleus 445951 at index 21105), both with NO root id and NO MICrONS
prediction. Exactly what he described.

Probing outward found the nuclei at 188 nm (253863) and 92-181 nm (445951) -- one nucleus each, no
ambiguity. So the answer is a LADDER, every rung of which reads real segmentation:

    1. cell segmentation at the point            -> the root id, the cell
    2. nucleus segmentation at the point         -> the nucleus id, the cell
    3. nucleus segmentation NEAR the point       -> the wall the marker is in
    4. nothing                                   -> listed, and not tickable at all

Rung 3 is `UJ.segread.nearestNucleus`, and it is not the "nearest nucleus" shortcut rejected
elsewhere: that one compares a point to a list of CENTROIDS and in a dendrite names another cell.
This reads the segmentation within a radius smaller than the structures involved. At 188 nm the
voxel it finds is the wall of the tubule the marker is in.

Rung 3 is decisive for an ENVELOPE kind -- that is where such a structure is supposed to be, so the
row is ticked. For anything else it is evidence, not proof, so the row is listed with the distance
and left for him to tick.

## 3. A marker with no cell could be ticked, and submitted

His screenshot shows the first row ticked with Cell "--" and the summary reading "across 1 cell" --
counting rootId "0" as a cell. Submitting would have posted a row with rootId "0" attached to
nothing. "Tick it back on if you disagree" is right for a row the tool resolved and flagged; it is
meaningless for a row with nothing to attach to. Those checkboxes are now disabled, the submit path
skips them regardless, and the cell count counts resolved cells rather than distinct rootIds.

Also: cells are now grouped by CELL, not by root id. His markers 2 and 3 are both nucleus 445951
with no root id -- under the old grouping they shared the key "0" with every other unresolved row.

Run: python3 src/an_nr_is_in_the_wall_not_the_nucleus.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

KINDS = [
    ('''const BULK_ORGAN_NUCLEAR=(function(){
  /* Which kinds are supposed to be INSIDE a nucleus, asked of the ontology's own grouping rather
     than by listing names here -- so a kind added to the Nucleus group is covered without an edit,
     the same reasoning as isVector() reading `vector` instead of testing for "cilium". */
  const out={};
  (typeof ORGANELLE_GROUPS!=="undefined"?ORGANELLE_GROUPS:[]).forEach(function(g){
    if(g.label!=="Nucleus")return;
    (g.kinds||[]).forEach(function(k){out[k.value]=1;});
  });
  return out;
})();''',
     '''/* ── WHERE A NUCLEAR STRUCTURE ACTUALLY SITS ─────────────────────────────────────  2026-09-11
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
  (typeof ORGANELLE_GROUPS!=="undefined"?ORGANELLE_GROUPS:[]).forEach(function(g){
    if(g.label!=="Nucleus")return;
    (g.kinds||[]).forEach(function(k){ if(!BULK_ORGAN_ENVELOPE[k.value])out[k.value]=1; });
  });
  return out;
})();
/* How far out rung 3 of the ladder will look, in nanometres. His three markers found their nucleus
   at 92-188 nm; a micrometre is well inside one cell and well short of the next nucleus. */
const BULK_ORGAN_NEAR_NM=1000;''',
     "the ontology splits into envelope and nucleoplasm kinds"),
]

RESOLVE = [
    ('''async function bulkOrganResolveRow(row){
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
}''',
     '''/* ── THE LADDER ───────────────────────────────────────────────────────────────────  2026-09-11
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
    let i=(typeof rootIdToIndex==="function")?rootIdToIndex(hit.r.rootId):-1;
    if(i<0&&hit.r.nucleusId&&typeof nidToIndex==="function")i=nidToIndex(hit.r.nucleusId);
    out.i=i; out.cellKey=hit.r.rootId;
    if(i>=0&&hit.r.nucleusId&&String(NID[i])!==String(hit.r.nucleusId)){
      /* Two segmentations disagreeing about one voxel is worth showing, not resolving by
         preference: it usually means the marker sits on a boundary. */
      out.warn="the cell here is nucleus "+NID[i]+" but the point is inside nucleus "+hit.r.nucleusId;
      return out;
    }
    if(BULK_ORGAN_NUCLEOPLASM[row.kind]&&!hit.r.inNucleus){
      out.warn="not inside any nucleus \\u2014 check the marker";
      return out;
    }
    out.use=true;
    return out;
  }

  if(hit&&hit.rung===2){
    out.nucleusId=hit.r.nucleusId; out.via=hit.via;
    out.i=(typeof nidToIndex==="function")?nidToIndex(hit.r.nucleusId):-1;
    out.cellKey="nuc:"+hit.r.nucleusId;
    out.note="inside the nucleus \\u2014 no cell segmentation here";
    out.use=true;
    return out;
  }

  /* ── rung 3 ── */
  let near=null;
  for(const e of ends){
    const n=await UJ.segread.nearestNucleus(e[1],BULK_ORGAN_NEAR_NM);
    if(!n.nucleusId)continue;
    if(!near||n.distanceNm<near.distanceNm){ near=n; near.via=e[0]; }
  }
  if(!near){
    out.warn=lastWhy||"no cell and no nucleus within "
      +(BULK_ORGAN_NEAR_NM/1000).toFixed(1)+" \\u00b5m";
    return out;
  }
  if(near.others.length){
    /* Between two nuclei is genuinely ambiguous and picking the closer one would be a coin toss
       dressed up as a measurement. */
    out.warn="between nuclei "+near.nucleusId+" and "+near.others.join(", ")
      +" \\u2014 too close to call";
    return out;
  }
  out.nucleusId=near.nucleusId; out.via=near.via; out.distNm=near.distanceNm;
  out.i=(typeof nidToIndex==="function")?nidToIndex(near.nucleusId):-1;
  out.cellKey="nuc:"+near.nucleusId;
  if(BULK_ORGAN_ENVELOPE[row.kind]){
    out.note="in the wall of the nucleus, "+near.distanceNm+" nm away \\u2014 where this structure belongs";
    out.use=true;
  }else{
    out.warn="no cell segmented here; the nearest nucleus is "+near.distanceNm+" nm away";
  }
  return out;
}''',
     "the resolver climbs a ladder instead of giving up at the first rung"),
]

RENDER = [
    ('''  const cell=function(r){
    if(r.i>=0)return "Nucleus "+NID[r.i]+" &middot; "+escHtml(bulkOrganCellName(r.i));
    if(r.rootId!=="0")return "root "+escHtml(r.rootId)+' <span style="opacity:.7">(no detection)</span>';
    return '<span style="opacity:.7">&mdash;</span>';
  };''',
     '''  const cell=function(r){
    if(r.i>=0)return "Nucleus "+NID[r.i]+" &middot; "+escHtml(bulkOrganCellName(r.i));
    if(r.rootId&&r.rootId!=="0")return "root "+escHtml(r.rootId)+' <span style="opacity:.7">(no detection)</span>';
    if(r.nucleusId)return "Nucleus "+r.nucleusId+' <span style="opacity:.7">(no detection)</span>';
    return '<span style="opacity:.7">&mdash;</span>';
  };''',
     "a cell known only by its nucleus is still named"),

    ('''  BULK_ORGAN_ROWS.forEach(function(r,n){
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
  const cells={};on.forEach(function(r){cells[r.rootId]=1;});''',
     '''  BULK_ORGAN_ROWS.forEach(function(r,n){
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
  const cells={};on.forEach(function(r){cells[r.cellKey]=1;});''',
     "a row with no cell cannot be ticked, and the count counts cells"),
]

SUBMIT = [
    ('''  const picked=BULK_ORGAN_ROWS.filter(function(r){return r.use;});
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
    const coord=(i>=0)?[NX[i],NY[i],NZ[i]].join(","):rows[0].a.join(",");''',
     '''  /* `r.cellKey` as well as `r.use`: a disabled checkbox cannot be ticked through the UI, but this
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
  Object.keys(byCell).forEach(function(cellKey,ci){
    const rows=byCell[cellKey];
    const i=rows[0].i;
    /* A cell the segmentation knows only as a nucleus carries a BLANK rootId -- which is what the
       top of this volume is: nuclei segmented, cells not. The nucleus id is the key the read-back
       uses, and it is present either way. */
    const rootId=(rows[0].rootId&&rows[0].rootId!=="0")?rows[0].rootId:"";
    const nucId=(i>=0)?String(NID[i]):(rows[0].nucleusId?String(rows[0].nucleusId):"");
    const coord=(i>=0)?[NX[i],NY[i],NZ[i]].join(","):rows[0].a.join(",");''',
     "cells are grouped by cell, and a nucleus-only cell posts a blank root id"),
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


edit("ujump.html", KINDS + RESOLVE + RENDER + SUBMIT)
print("\nnow: node segreadcheck.js   and   node bulkorgancheck.js")
