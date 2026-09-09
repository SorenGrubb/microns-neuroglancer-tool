"""The depth fit is anchored, and a cell gets its rights the moment it is added.     2026-09-09

Two things the check found on its first run of "the same info and rights".

1. THE PLANE DID NOT PASS THROUGH ITS OWN NEIGHBOURS.

       estimateDepthUm(BX[5]+1, BY[5]+1, BZ[5])  ->  6.63 µm
       BDEP[5]                                   ->  8.30 µm

   One voxel from a detection whose depth is measured, and the estimate was 1.7 µm out. That is
   least squares behaving exactly as least squares does -- a fitted plane minimises error over
   fourteen points and is not required to pass through any of them -- and it is still the wrong
   answer, because right beside a real measurement the real measurement is the answer.

   So the fit now supplies only the GRADIENT and the nearest real measurement supplies the OFFSET:

       depth(p) = BDEP[nearest] + [ plane(p) - plane(p_nearest) ]

   Exact at a neighbour's own position, and still tilt-aware away from it -- which is the whole
   reason for fitting a plane rather than borrowing a depth. Neither half alone was right: the
   plane drifted near a known point, and the bare nearest-neighbour depth ignores which way the
   pial surface tilts.

2. A CELL ADDED IN THIS SESSION HAD TO WAIT FOR A RELOAD.

   absorbAddedNuclei() ran when the fetch landed, and the submit handler pushed the new row into
   the cache without re-running it -- so the cell appeared in the list under the form (which reads
   the cache) but not in the arrays, and therefore not in Filter and show, the export or nearest().
   "The same info and rights as the nuclei that have been detected" cannot mean "after you reload".

Run: python3 src/the_fit_is_anchored_and_rights_are_immediate.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FIT = [
    ('''  const c=solve4_(A,b);
  if(!c)return BDEP[near[0].i];
  const d=c[0]*(vx*UJ_RX/1000)+c[1]*(vy*UJ_RY/1000)+c[2]*(vz*UJ_RZ/1000)+c[3];
  return isFinite(d)?d:BDEP[near[0].i];''',
     '''  const c=solve4_(A,b);
  if(!c)return BDEP[near[0].i];
  const plane=function(x,y,z){return c[0]*(x*UJ_RX/1000)+c[1]*(y*UJ_RY/1000)+c[2]*(z*UJ_RZ/1000)+c[3];};
  /* ── ANCHORED, and the check is why ──────────────────────────────────────────────────────
     A least-squares plane minimises error over the fourteen neighbours and is not required to
     pass through any of them. Measured: one voxel from detection 5, the raw plane said 6.63 µm
     where that detection's own measured depth is 8.30. Right beside a real measurement, the real
     measurement is the answer.

     So the plane contributes only the GRADIENT -- how depth changes as you move -- and the
     nearest real measurement contributes the OFFSET. Exact at a neighbour's own position, still
     tilt-aware away from it. Neither half is right alone: the bare plane drifts near a known
     point, and the bare nearest-neighbour depth ignores which way the pia tilts. */
  const a0=near[0].i;
  const d=BDEP[a0]+(plane(vx,vy,vz)-plane(BX[a0],BY[a0],BZ[a0]));
  return isFinite(d)?d:BDEP[a0];''',
     "the fit is anchored on the nearest real depth"),
]

NOW = [
    ('''        if(NEW_NUC_CACHE)NEW_NUC_CACHE.push({coord:raw.slice(0,3).join(","),identified:ident,
          comment:(commentEl&&commentEl.value||"").trim(),
          reporterName:(typeof REPORTER_NAME!=="undefined"&&REPORTER_NAME)||"",
          timestamp:new Date().toISOString()});
        try{wireNewNucleusList();}catch(_e2){}''',
     '''        if(NEW_NUC_CACHE)NEW_NUC_CACHE.push({coord:raw.slice(0,3).join(","),identified:ident,
          comment:(commentEl&&commentEl.value||"").trim(),
          reporterName:(typeof REPORTER_NAME!=="undefined"&&REPORTER_NAME)||"",
          timestamp:new Date().toISOString()});
        /* AND INTO THE ARRAYS, now rather than on the next reload. Without this the cell appeared
           in the list under the form (which reads the cache) but not in Filter and show, the
           export or nearest() -- and "the same rights as the nuclei that have been detected"
           cannot mean "after you reload". */
        try{absorbAddedNuclei();}catch(_e3){}
        try{wireNewNucleusList();}catch(_e2){}''',
     "a cell added now has its rights now"),
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


edit("ljump.html", FIT + NOW)
print("\nnow: node newnucleuscheck.js")
