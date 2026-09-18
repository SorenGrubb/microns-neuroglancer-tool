# -*- coding: utf-8 -*-
"""The chosen type survives the rebuild.                                        2026-09-18

Søren: *"When having pressed random cell, it switches back to l2/3 pyramidal neuron. It should stay
on the selected cell type. It used to work fine."*

WHAT ACTUALLY HAPPENS. populateRandomTypeSelect() ends with

    randomTypeSelect.innerHTML = opts;

and assigning innerHTML to a <select> throws away every <option> it had, including the one the
person had chosen. The browser then selects the first option of the new list -- which in minnie65 is
"L2/3 pyramidal neuron (23P)", exactly the type he saw come back.

WHY IT ONLY BITES NOW, AND ONLY SOMETIMES. Nothing in the "Random example" click path rebuilds the
list. But populateRandomTypeSelect is `async`, and the two fire-and-forget calls that run at page
load (the vascdata9 patch block and the own-corrections block) each await getCommunityConsensus()
and fetchIdentifiedMergedSubs() -- two whole-sheet reads of a live Apps Script backend. On a cold
cache those resolve seconds after the page looks finished. The person expands "Or browse a random
cell", picks a type, clicks, and THEN the late rebuild lands and silently puts the picker back to
the top of the list. It used to work fine because the sheet used to be small enough that both reads
had resolved before anyone could reach the control. Nothing was broken; the backend got slower, and
a latent bug came within reach of a human hand.

That timing also explains why it looks like the CLICK did it. The click and the reset are neighbours
in time, not cause and effect -- the jump itself used the right type, and it is the NEXT click that
would draw from the wrong pool.

WHERE THE FIX GOES. In the one function that owns the assignment, not in its callers. There is
already a hand-carry at one call site (ensureCommunityOverride's, which reads the value before
calling and writes it back after) -- written the day this was noticed from the other direction, and
correct, but it only protects the one path that remembered to do it; the two init calls did not, and
a future caller would not either. Reading the value INSIDE the function, immediately before the
assignment, protects every caller including the ones that don't exist yet -- and it is the only
place that is still correct across the await, since the person may have changed the picker while the
two fetches were in flight.

ηJump's renderRandomTypeSelect() has done exactly this since it was written (`const was=sel.value;
... if(was) sel.value=was;`); this brings the three big pages into line with it.

Applied to all three pages that carry this picker. δJump and πJump have the identical line -- their
build scripts have been data-only since 2026-09-06, so the logic no longer arrives from µJump and
each page has to be edited in its own right.

Run: python3 src/the_chosen_type_survives_the_rebuild.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD = '''  randomTypeSelect.innerHTML=opts;
  window.RAND_POOLS=RP;'''

NEW = '''  /* THE CHOSEN TYPE SURVIVES THE REBUILD, 2026-09-18 (Søren: "When having pressed random cell, it
     switches back to l2/3 pyramidal neuron. It should stay on the selected cell type.").
     Assigning innerHTML to a <select> discards every option, so the browser falls back to the
     first one -- "L2/3 pyramidal neuron (23P)" in minnie65. Read HERE, one statement before the
     assignment, rather than at the top of this function or in a caller: this function awaits two
     whole-sheet backend reads before it gets this far, and the person can have chosen a type while
     those were in flight. That gap is also why the bug only surfaced now -- the two fire-and-forget
     calls at page load resolve seconds late on a cold cache, long after the control is reachable,
     which makes the reset look like the "Random example" click did it. A previously chosen type
     that no longer exists (its pool emptied) simply isn't found, and the first option stands. */
  const wasType=randomTypeSelect.value;
  randomTypeSelect.innerHTML=opts;
  if(wasType){
    for(let oi=0;oi<randomTypeSelect.options.length;oi++){
      if(randomTypeSelect.options[oi].value===wasType){randomTypeSelect.selectedIndex=oi;break;}
    }
  }
  window.RAND_POOLS=RP;'''

# ── AND THE HAND-CARRY THAT USED TO STAND IN FOR IT COMES OUT ─────────────────────────────────
# ensureCommunityOverride() has carried the selection across its own call since the day this was
# first noticed from the other direction. It reads the value BEFORE calling and writes it back after
# the promise resolves -- which was right when nothing else did it, and is wrong now: the two whole-
# sheet reads happen in between, so forcing back a pre-await value overwrites a type the person
# chose while they were in flight. That is the same wrong answer as the bug itself, arriving by the
# same route, one layer up. Left in place it would mean the fix worked everywhere except on the one
# path somebody had already thought about.
OLD_CARRY = '''       rebuildTypePools() runs at load, this fetch resolves after it, and IDX_BY_TYPE would
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
    }catch(_e3){}'''

NEW_CARRY = '''       rebuildTypePools() runs at load, this fetch resolves after it, and IDX_BY_TYPE would
       otherwise keep its pre-community contents -- so "Glia (49)" would go on offering the cells
       somebody has since named Astrocyte. The dropdown is rebuilt from the pools, so its counts
       follow; its SELECTION is kept by populateRandomTypeSelect itself.
       THE HAND-CARRY THAT USED TO BE HERE IS GONE, 2026-09-18. It read the value BEFORE calling,
       then wrote it back after the promise resolved -- which protected this one path and, once the
       rebuild learnt to keep its own selection, actively broke it: two whole-sheet reads happen in
       between, and forcing back a pre-await value overwrites a type the person chose while they
       were in flight. That is the same wrong answer, arriving by the same route, one layer up. */
    try{
      if(typeof rebuildTypePools==="function")rebuildTypePools();
      if(typeof populateRandomTypeSelect==="function"){
        Promise.resolve(populateRandomTypeSelect()).catch(function(){});
      }
    }catch(_e3){}'''

PAIRS = [
    (OLD, NEW, "the picker keeps the type somebody chose"),
    (OLD_CARRY, NEW_CARRY, "...and the stale hand-carry that would undo it is gone"),
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


for page in ("ujump.html", "djump.html", "pjump.html"):
    edit(page, PAIRS)
print("\nnow: node randomtypecheck.js && python3 src/build_stamps.py")
