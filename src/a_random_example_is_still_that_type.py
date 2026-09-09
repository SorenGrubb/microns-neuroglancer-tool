"""A random example of a type is not a cell the community has renamed.               2026-09-09

Søren, on πJump: *"When clicking the random button, it should only show Glia cells that have not
been given a different name by community reports."* His screenshot: "Glia (49)" selected, and the
cell that came back is one HE had already named Astrocyte.

WHERE IT COMES FROM. rebuildTypePools() decides who is a random example of a MICrONS-predicted
class, and it already knows about two kinds of disagreement:

    if(ot!==255){ if(OWN_TYPE_NAMES[ot]===name) ... }        // own-verified overrides
    else{ const mg=mergedInfo(i); if(mg){ ... }              // merged-nucleus breakdowns

Both were added for the same reason: a pool called "pericyte" that returns a verified smooth
muscle cell is lying about what it is. The third kind of disagreement -- a COMMUNITY report --
was never in this loop, because when it was written the community map did not exist yet.

So the loop learns the third one, using the same precedence buildAllIdentities() uses:
own-verified > merged breakdown > community > prediction. A cell whose community name matches the
prediction stays (it is still an example of that class, now with a second opinion agreeing); one
named something else is out.

THE COUNT FIXES ITSELF. pickCount() reads IDX_BY_TYPE[key].length, so "Glia (49)" becomes the
number the button can actually return. A pool whose label and contents disagreed would just be the
same bug wearing a number.

AND UNASSIGNED, one line up, for the same reason. A nucleus MICrONS made no prediction for but the
community HAS named is not one that "still needs a first identification" -- which is what the
button offers and what the hint under it promises. It makes "Random unassigned cell" and "Random
community-identified cell" disjoint, which is plainly what the two buttons are for.

THE REBUILD. rebuildTypePools() runs at load, and the community fetch resolves after it, so
without a re-run the pools would keep their pre-community contents for the life of the page --
exactly the trap the filter checkboxes were in this morning. ensureCommunityOverride() already
rebuilds those; it now rebuilds these too, and the dropdown keeps its selection across the rebuild.

Run: python3 src/a_random_example_is_still_that_type.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

POOLS = [
    ('''function rebuildTypePools(){
  UNASSIGNED_IDX.length=0;
  for(const n of CT_NAMES)IDX_BY_TYPE[n].length=0;
  for(let i=0;i<N;i++){const t=NT[i];if(t===0){if(OWN_TYPE[i]===255&&!mergedInfo(i)&&inRegion(NX[i],NY[i],NZ[i]))UNASSIGNED_IDX.push(i);}else{
    const name=CT_NAMES[t-1],ot=OWN_TYPE[i];
    if(ot!==255){if(OWN_TYPE_NAMES[ot]===name)IDX_BY_TYPE[name].push(i);}
    else{const mg=mergedInfo(i);if(mg){if(mg.some(m=>m.type===name))IDX_BY_TYPE[name].push(i);}else IDX_BY_TYPE[name].push(i);}
  }}
}''',
     '''/* The community's name for a nucleus, in the same space as CT_NAMES and OWN_TYPE_NAMES (see
   commToRowType(), which translates it on the way into the map). Null until the report fetch
   lands -- which is why ensureCommunityOverride() re-runs the pools when it does. */
function commTypeForIndex(i){
  const m=window.__COMM_ROWTYPE;
  if(!m)return null;
  const t=m[String(NID[i])];
  return t?String(t):null;
}
/* Case-insensitive, because the two sides come from different places: CT_NAMES is whatever the
   dataset published ("glia"), and a community name is whatever the report form wrote ("Glia").
   Comparing them exactly would treat an agreeing report as a disagreement and empty the pool. */
function sameTypeName(a,b){return String(a||"").toLowerCase()===String(b||"").toLowerCase();}
function rebuildTypePools(){
  UNASSIGNED_IDX.length=0;
  for(const n of CT_NAMES)IDX_BY_TYPE[n].length=0;
  /* THREE KINDS OF DISAGREEMENT, not two. This loop has always dropped a nucleus whose
     own-verified type contradicts the MICrONS prediction, and one whose merged-nucleus breakdown
     does -- both added because a pool called "pericyte" that returns a verified smooth muscle cell
     is lying about what it is. A COMMUNITY report was never checked, because the community map did
     not exist when this was written. Søren, 2026-09-09: "it should only show Glia cells that have
     not been given a different name by community reports."

     Precedence is buildAllIdentities()'s: own-verified > merged breakdown > community >
     prediction. A community name that AGREES with the prediction keeps the cell in the pool -- it
     is still an example of that class, with a second opinion behind it. */
  for(let i=0;i<N;i++){const t=NT[i];
    const cn=commTypeForIndex(i);
    /* A cell the community has named is not one that "still needs a first identification", which
       is what the Random-unassigned button offers and what the hint under it promises. Excluding
       it here is also what makes that button and "Random community-identified cell" disjoint. */
    if(t===0){if(OWN_TYPE[i]===255&&!mergedInfo(i)&&!cn&&inRegion(NX[i],NY[i],NZ[i]))UNASSIGNED_IDX.push(i);}else{
    const name=CT_NAMES[t-1],ot=OWN_TYPE[i];
    if(ot!==255){if(OWN_TYPE_NAMES[ot]===name)IDX_BY_TYPE[name].push(i);}
    else{const mg=mergedInfo(i);if(mg){if(mg.some(m=>m.type===name))IDX_BY_TYPE[name].push(i);}
         else if(!cn||sameTypeName(cn,name))IDX_BY_TYPE[name].push(i);}
  }}
}''',
     "a renamed cell leaves its prediction's pool"),
]

REBUILD = [
    ('''    try{
      if(typeof window.buildFilterTypeCheckboxes==="function")window.buildFilterTypeCheckboxes();
      if(typeof window.buildNearTypeCheckboxes==="function")window.buildNearTypeCheckboxes();
    }catch(_e2){}''',
     '''    try{
      if(typeof window.buildFilterTypeCheckboxes==="function")window.buildFilterTypeCheckboxes();
      if(typeof window.buildNearTypeCheckboxes==="function")window.buildNearTypeCheckboxes();
    }catch(_e2){}
    /* The random-example pools, for the same reason and with the same timing problem:
       rebuildTypePools() runs at load, this fetch resolves after it, and IDX_BY_TYPE would
       otherwise keep its pre-community contents -- so "Glia (49)" would go on offering the cells
       somebody has since named Astrocyte. The dropdown is rebuilt from the pools, so its counts
       follow; its SELECTION is carried across by hand, since rebuilding an option list drops it
       and silently resetting the type somebody just chose is worse than a stale count. */
    try{
      if(typeof rebuildTypePools==="function")rebuildTypePools();
      const rts=document.getElementById("randomTypeSelect");
      const wasType=rts?rts.value:"";
      if(typeof populateRandomTypeSelect==="function"){
        Promise.resolve(populateRandomTypeSelect()).then(function(){
          const el=document.getElementById("randomTypeSelect");
          if(el&&wasType&&el.querySelector('option[value="'+wasType.replace(/"/g,'\\\\"')+'"]'))el.value=wasType;
        }).catch(function(){});
      }
    }catch(_e3){}''',
     "the pools and the dropdown are rebuilt too"),
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


for page in PAGES:
    edit(page, POOLS + REBUILD)
print("\nnow: node randompoolcheck.js")
