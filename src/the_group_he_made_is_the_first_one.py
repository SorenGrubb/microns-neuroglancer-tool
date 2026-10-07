# -*- coding: utf-8 -*-
u"""The pool he made himself is the first one in the box.                                2026-10-07

Søren: *"Great, now it finds the endothelial cells. Now, give me the option to filter for them also
again, I don't understand why you removed it."*

NOTHING WAS REMOVED, AND SAYING SO WITHOUT A MEASUREMENT WOULD HAVE BEEN A GUESS. Loaded with his
own added cell, ηJump builds the tick exactly as designed: rebuildTypePools files it under
`added:Endothelial cell`, typeGroups appends a group called "Not in H01 - named here",
renderTypeCheckboxes draws it with its count. Measured in the browser:

    #filterTypes   scrollHeight 470   clientHeight 228   the tick 436 px down

A box 228 px tall holding 470 px of list, with the group he made at the very bottom of it and no
scrollbar drawn until the pointer is inside. Half of ηJump's cell types have been below the fold
since the box was given a max-height, and the half below is the half he adds himself -- every pool
in it exists because somebody named a cell H01 never listed.

So the fix is not to restore a tick. It is to stop hiding it:

  1. typeGroups() puts the added group FIRST. H01's vocabulary has not changed in a year and does
     not need the best seat; the group that changes every time he reports a cell does. The
     random-example dropdown reads the same function, so the two lists cannot disagree about it.
  2. The box gets room for a few more rows -- min(46vh, 320px) rather than a flat 230px -- so the
     fold is not in the middle of a group on a laptop screen.

WHAT IS NOT CHANGED: the pools themselves, their keys, their counts, poolOf, rebuildTypePools, or
the order of H01's own five groups among themselves. This is where the list is drawn, not what is
in it.

Check: addedpoolvisiblecheck.js (new)
Run: python3 src/the_group_he_made_is_the_first_one.py
     python3 src/build_stamps.py
     node addedpoolvisiblecheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


OLD_GROUPS = u'''/* TYPE_GROUPS is H01's own vocabulary and cannot name a type nobody has proposed yet. */
function typeGroups(){
  if(!ADDED_POOLS.length) return TYPE_GROUPS;
  return TYPE_GROUPS.concat([{ label:"Not in H01 \\u2014 named here", types:ADDED_POOLS.slice() }]);
}'''

NEW_GROUPS = u'''/* TYPE_GROUPS is H01's own vocabulary and cannot name a type nobody has proposed yet. */
/* \\u2500\\u2500 AND IT GOES FIRST \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500  2026-10-07
   S\\u00f8ren: "give me the option to filter for them also again, I don't understand why you removed
   it." It had not been removed. It was last in a list 470 px long inside a box 228 px tall, 436 px
   down, with no scrollbar drawn until the pointer is inside the box -- so for him it did not exist.

   H01's five groups have been the same five for a year and are findable by habit. This group
   changes every time somebody names a cell H01 never listed, which is the only reason anyone opens
   this box looking for something new. It gets the top. */
function typeGroups(){
  if(!ADDED_POOLS.length) return TYPE_GROUPS;
  return [{ label:"Not in H01 \\u2014 named here", types:ADDED_POOLS.slice() }].concat(TYPE_GROUPS);
}'''

OLD_BOX = u'''<div style="max-height:230px;overflow-y:auto;border:1px solid var(--line);border-radius:7px;padding:8px 10px;margin-top:8px" id="filterTypes"></div>'''

NEW_BOX = u'''<div style="max-height:min(46vh,320px);overflow-y:auto;border:1px solid var(--line);border-radius:7px;padding:8px 10px;margin-top:8px" id="filterTypes" title="Scrolls \\u2014 there are more cell types below than fit here."></div>'''

edit("hjump.html", [
    (u"the added group goes first", OLD_GROUPS, NEW_GROUPS),
    (u"and the box has room for a few more rows", OLD_BOX, NEW_BOX),
])
print("done")
