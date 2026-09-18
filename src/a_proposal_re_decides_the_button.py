# -*- coding: utf-8 -*-
"""A proposal moves the world, so the volume button has to be decided again.   2026-09-17

Søren, µJump root 864691134517067096 (nucleus 537543), volume already computed at 74 µm³, with
864691136708155314 freshly proposed for the same cell:

  *"I found that this time it did not offer to recalculate volume after I had submitted a new root
  ID."*

WHY "RECALCULATE" EXISTS AT ALL. `decorateMeshVolButtons()` hides the Compute volume button once a
saved volume is current, and shows it again as "Recalculate" when it is not:

    savedFragCount = known.combinedFrom || known.fragmentCount || 1
    curFragCount   = MeshDL.currentFragmentCount(rootId)     // 1 + CUR_EXTRA_ROOTS.length
    stale          = curFragCount > savedFragCount

Proposing a root ID is precisely the event that makes `stale` true: `loadRootIdPanel()` re-reads
`?rootIds=` and fills `CUR_EXTRA_ROOTS`, so the current count goes from 1 to 2 while the saved one
stays at 1.

NOTHING RE-ASKED. `decorateMeshVolButtons()` runs at load, from the click handler, and from a
MutationObserver on #cellPanelCard that fires only for a mutation touching a `.meshvol` — and
`loadRootIdPanel()`'s re-render writes into `#rootIdPanel`, which contains no `.meshvol` at all. So
the panel came back with the proposal listed, `CUR_EXTRA_ROOTS` now held it, every input to `stale`
had changed, and the one function that reads them was never called. The button stayed hidden, which
is the state "there is nothing to recalculate" — the opposite of the truth.

The world moves in exactly one place here: the line that assigns CUR_EXTRA_ROOTS. So that is where
the button is asked again. One call, next to the assignment, guarded because the panel is shared
with pages that decide their buttons differently.

Run: python3 src/a_proposal_re_decides_the_button.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

PAIRS = [
    ('''      CUR_EXTRA_ROOTS=list.map(function(x){return {id:x.rootId,segType:x.segType||"img65"};}).filter(function(o){return o.id;});''',
     '''      CUR_EXTRA_ROOTS=list.map(function(x){return {id:x.rootId,segType:x.segType||"img65"};}).filter(function(o){return o.id;});
      /* ── THE VOLUME BUTTON IS DECIDED AGAIN ───────────────────────────────────  2026-09-17
         Søren: "it did not offer to recalculate volume after I had submitted a new root ID."

         This assignment is the whole of "the world moved". currentFragmentCount() counts
         1 + CUR_EXTRA_ROOTS, decorateMeshVolButtons() compares that against the saved volume's
         combinedFrom to decide between hidden and "Recalculate" — and nothing called it when this
         line ran. The MutationObserver that otherwise re-runs it only fires for a mutation touching
         a .meshvol, and this panel's own re-render contains none, so a proposal landing left every
         input to that decision changed and the decision itself untouched: the button stayed hidden,
         which means "nothing to recalculate", which was exactly wrong.
         Guarded on typeof because #rootIdPanel is shared with call sites on pages that have no
         such button. */
      try{if(typeof decorateMeshVolButtons==="function")decorateMeshVolButtons();}catch(_e){}''',
     "a landed proposal re-decides the volume button"),
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
    edit(page, PAIRS)
print("\nnow: node rootidbackcheck.js")
