"""A named cell has the same info and rights as a detected one.                      2026-09-09

Søren: *"The cells that are named should have the same info and rights as the nuclei that have been
detected."*

Yesterday's change made an added nucleus findable by coordinate, and this morning's gave it a name,
a layer and an organelle form. Both kept it on the side: a separate list, a separate panel, a
separate branch in doJump(). Everything else in the tool -- Filter and show, the Excel export, the
neighbour lists, the dashboard's counts, the random picker -- iterates the 488 detections and never
saw it.

So the added cells go INTO the arrays. λJump keeps eleven parallel arrays indexed 0..N-1 (BX/BY/BZ,
BID, BVOL, BDIA, BDEP, BLAY, BPOL, BTR, BDM) and every one of those readers walks that index range.
Appending to them is what "the same rights" means concretely, and it is a much smaller change than
teaching each reader about a second kind of cell -- which is also how the second kind would keep
being forgotten.

WHAT AN ADDED CELL CARRIES, and what it honestly cannot:

  coordinate      real, the one somebody typed
  depth, layer    ESTIMATED -- plane fit over the nearest detections, majority vote for the layer
                  (see estimateDepthUm/layerFromDepth). Marked estimated wherever it is shown.
  identity        whatever the community named it, exactly as for a detection
  organelles      yes -- keyed by coordinate, as µJump has done since ?newCellOrganelles=1
  volume, diameter    NaN. Nothing measured this nucleus. NaN rather than 0 on purpose: every
                  numeric range filter compares with < and >, and NaN fails both, so an added cell
                  is excluded from "diameter 5-8 µm" instead of arriving as a spurious zero. A cell
                  with no measurement should not match a measurement filter.
  detector pass   -1, meaning no pass found it. It is not "the bright pass"; it is neither.

THREE CONSEQUENCES worth stating rather than discovering:

  * N stops being 488 and starts being 488 + however many have been added. N_DET keeps the
    detector's own count, which is what the prose on the page and the detector-recall arithmetic
    are about.
  * BID is 0 for an added cell. Detection ids run 1..488, so 0 cannot collide -- and
    ljumpIdentityOf(), which keys the Master cell list by BID, would otherwise read every added
    cell's identity off nucleus id 0. It now reads the row's own `identified` instead.
  * doJump()'s separate "is a community cell nearer?" branch is GONE. nearest() finds them now
    because they are in the arrays; keeping the branch would mean two code paths racing to answer
    the same question. showCell() delegates to the added-cell panel by index.

Absorption is idempotent -- it always rebuilds from the first N_DET entries -- so it can run again
after somebody adds or names a cell without compounding.

Run: python3 src/the_same_info_and_rights.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ARRAYS = [
    ('''const N    = D.N;
const BID  = i32("ID");                       // nucleus_id, 1..N in sort order
const BX   = i32("X"), BY = i32("Y"), BZ = i32("Z");   // mip-0 voxels, 4/4/40 nm
const BVOL = Float32Array.from(i32("V"),  function(v){ return v/100; });   // µm³
const BDIA = Float32Array.from(i32("DIA"),function(v){ return v/100; });   // µm''',
     '''/* `let`, not `const`, and N_DET beside N -- because community-added nuclei are appended to every
   one of these arrays once they arrive (see absorbAddedNuclei()). Søren, 2026-09-09: "The cells
   that are named should have the same info and rights as the nuclei that have been detected."
   Every reader in this file walks 0..N-1, so appending is what gives them those rights; N_DET
   keeps the DETECTOR's own count, which is what the page's prose and the recall arithmetic mean. */
let N      = D.N;
const N_DET = D.N;
let BID    = i32("ID");                       // nucleus_id, 1..N_DET in sort order; 0 = added
let BX     = i32("X"), BY = i32("Y"), BZ = i32("Z");   // mip-0 voxels, 4/4/40 nm
let BVOL   = Float32Array.from(i32("V"),  function(v){ return v/100; });   // µm³
let BDIA   = Float32Array.from(i32("DIA"),function(v){ return v/100; });   // µm''',
     "the arrays can grow"),

    ('''const BDEP = Float32Array.from(i32("DEP"),function(v){ return v/10; });    // µm
const BLAY = i32("L");                        // index into D.layers, -1 = unknown
const BPOL = i32("P");                        // 1 = found by the DARK pass
const BTR  = i32("TR");                       // cut by a z face of the ~33 µm slab
const BDM  = i32("DM");                       // in or beside a damaged section''',
     '''let BDEP   = Float32Array.from(i32("DEP"),function(v){ return v/10; });    // µm
let BLAY   = i32("L");                        // index into D.layers, -1 = unknown
let BPOL   = i32("P");                        // 1 = found by the DARK pass, -1 = no pass (added)
let BTR    = i32("TR");                       // cut by a z face of the ~33 µm slab
let BDM    = i32("DM");                       // in or beside a damaged section
/* Provenance, parallel to the arrays above: 1 where the community added the nucleus, and the row
   it came from. Both are empty until absorbAddedNuclei() runs. */
let BADDED = [], ADDED_REC = [];''',
     "...and say which of them were added"),
]

ABSORB = [
    ('''/* Same anisotropic scaling as nearest() -- these coordinates are voxels in the same frame. */
function nearestNewNucleus(vx,vy,vz){''',
     '''/* ── THE SAME RIGHTS: added nuclei join the arrays ────────────────────────────────────────
   Every reader in this file -- nearest(), kNearest(), Filter and show, the Excel export, the
   charts, the random picker -- walks 0..N-1 over the parallel arrays. Teaching each of them about
   a second kind of cell is how the second kind keeps being forgotten; appending is one change that
   reaches all of them at once.

   IDEMPOTENT: always rebuilt from the first N_DET entries, so running again after somebody adds or
   names a cell replaces the tail rather than compounding it.

   Depth is estimated BEFORE N grows, so the plane fit is over detections only -- an added cell must
   never be used to place another added cell. */
function absorbAddedNuclei(){
  const list=(NEW_NUC_CACHE||[]).filter(function(r){return !!newNucCoord(r);});
  const cut=function(a){return Array.prototype.slice.call(a,0,N_DET);};
  const bx=cut(BX),by=cut(BY),bz=cut(BZ),bid=cut(BID),bvol=cut(BVOL),bdia=cut(BDIA),
        bdep=cut(BDEP),blay=cut(BLAY),bpol=cut(BPOL),btr=cut(BTR),bdm=cut(BDM);
  const flags=[],recs=[];
  /* N is pinned to the detector's count for the whole loop: estimateDepthUm() reads it. */
  N=N_DET;
  list.forEach(function(rec){
    const p=newNucCoord(rec);
    bx.push(p[0]);by.push(p[1]);bz.push(p[2]);
    /* 0, because detection ids run 1..N_DET and 0 therefore cannot collide with one. */
    bid.push(0);
    /* NaN, not 0: every numeric range filter here compares with < and >, and NaN fails both -- so
       an added cell is EXCLUDED from "diameter 5 to 8 µm" rather than arriving as a spurious zero.
       Nothing measured this nucleus, and a filter about measurements should not match it. */
    bvol.push(NaN);bdia.push(NaN);
    const dep=estimateDepthUm(p[0],p[1],p[2]);
    bdep.push((dep===null||!isFinite(dep))?NaN:dep);
    const lay=layerFromDepth(dep);
    const li=lay?LAYERS.indexOf(lay):-1;
    blay.push(li);
    /* -1 rather than 0: 0 is the BRIGHT pass, and claiming a pass found it would be a fact about
       the detector that is not true. Neither pass found this nucleus; that is the point of it. */
    bpol.push(-1);
    btr.push(0);bdm.push(0);
    flags.push(1);recs.push(rec);
  });
  BX=bx;BY=by;BZ=bz;BID=bid;BVOL=bvol;BDIA=bdia;BDEP=bdep;BLAY=blay;BPOL=bpol;BTR=btr;BDM=bdm;
  BADDED=[];ADDED_REC=[];
  for(let i=0;i<N_DET;i++){BADDED.push(0);ADDED_REC.push(null);}
  BADDED=BADDED.concat(flags);ADDED_REC=ADDED_REC.concat(recs);
  N=N_DET+list.length;
  /* The identity dropdown counts by walking 0..N-1, so it has to be told the range moved. */
  try{ if(typeof window.__ljumpBuildIdentityDropdown==="function")window.__ljumpBuildIdentityDropdown(); }catch(_e){}
}
/* Same anisotropic scaling as nearest() -- these coordinates are voxels in the same frame. */
function nearestNewNucleus(vx,vy,vz){''',
     "added nuclei join the arrays"),

    ('''function kickNewNuclei(){ fetchNewNuclei().then(function(){ try{wireNewNucleusList();}catch(_e){} }); }''',
     '''function kickNewNuclei(){ fetchNewNuclei().then(function(){
  try{absorbAddedNuclei();}catch(_e0){}
  try{wireNewNucleusList();}catch(_e){}
}); }''',
     "...as soon as they arrive"),
]

DELEGATE = [
    ('''function showCell(i, distNm){
  CUR_IDX=i;''',
     '''function showCell(i, distNm){
  /* An added cell is in these arrays and can be reached by every path a detection can -- nearest(),
     a neighbour click, the filter's results, the random picker. Its panel is different because
     what it HAS is different (no measured diameter, an estimated layer, a provenance line), not
     because it is reached differently. */
  if(BADDED[i]&&ADDED_REC[i]){ showNewNucleus(ADDED_REC[i],distNm||0); return; }
  CUR_IDX=i;''',
     "showCell hands an added cell to its own panel"),

    ('''function ljumpIdentityOf(i){
  const rec=IDENTITY_BY_NID&&IDENTITY_BY_NID[BID[i]];
  return rec&&rec.current?String(rec.current).trim():"";
}''',
     '''function ljumpIdentityOf(i){
  /* An added cell has no detection id -- BID is 0 for it -- so the Master cell list cannot be
     keyed by it, and looking it up anyway would read every added cell's identity off nucleus 0.
     Its identity is the one on its own row, which is what the name-it control writes. */
  if(BADDED[i]&&ADDED_REC[i])return String(ADDED_REC[i].identified||"").trim();
  const rec=IDENTITY_BY_NID&&IDENTITY_BY_NID[BID[i]];
  return rec&&rec.current?String(rec.current).trim():"";
}''',
     "an added cell's identity is its own"),

    ('''  const r=nearest(v[0],v[1],v[2]);
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
  if(r.i<0)return fail("No nucleus found.");''',
     '''  /* ONE SEARCH, not two. This briefly had a second branch asking "is a community-added nucleus
     nearer?" and comparing the two answers by hand. Once the added nuclei are IN the arrays
     (absorbAddedNuclei), nearest() finds them itself and a second path could only disagree with
     the first. Same rights means the same search. */
  const r=nearest(v[0],v[1],v[2]);
  if(r.i<0)return fail("No nucleus found.");''',
     "one search finds either kind"),
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


edit("ljump.html", ARRAYS + ABSORB + DELEGATE)
print("\nnow: node newnucleuscheck.js")
