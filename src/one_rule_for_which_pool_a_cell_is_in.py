# -*- coding: utf-8 -*-
u"""One rule for which pool a cell is in.                                               2026-09-27

Søren, the day after "Not in H01 — named here" went in:

    "if i choose a bounding box around that cell and click the filter to show it, there are no
     matches. If I don't click it, it shows 1 match, that cell."

THE REGION BOX WAS INNOCENT. It is identical in both of his screenshots, corners and all; what
differs between them is the ENDOTHELIAL CELL tick. So the category the filter had just started
offering him matched nothing, and the box got the blame.

THE BUCKET RULE WAS WRITTEN TWICE. rebuildTypePools files a cell under `added:<name>` where the
community named a cell H01 never listed, and under h01SplitFor's resolved name where a community
identification resolves something H01 merged. The checkbox carries that key as its value, with that
pool's count beside it. And runFilter compared the ticked values against `typeName(i)` — H01's own
label, which for an added cell is `not-in-h01`. A checkbox whose label and count come from a pool,
tested against something that is not the pool.

Measured: ticking "Endothelial cell 1" gave **0 of 47,449 cells match (0.0%)**.

IT WAS ALREADY BROKEN FOR MICROGLIA, and had been since the split pools existed. A microglia/opc
cell the community has resolved is filed under "microglia", the checkbox says "Microglia 1", and
`typeName(i)` says "microglia/opc" — so ticking it found nothing then either. Nobody hit it because
ALWAYS_SHOW_TYPES keeps both pools on screen at zero and there was nothing resolved yet to tick.
Yesterday's change did not introduce this fault; it made it reachable.

SO THERE IS ONE FUNCTION. poolOf(i) answers it, rebuildTypePools files by it, and runFilter tests
against it — and the check asserts the thing that makes a second copy impossible to get away with:
every cell, all 47,449, is in the pool poolOf names for it.

This is the third time in four days that one rule in two places has cost a bug report — celltypeLink
had three argument orders on 2026-09-26, the notebook's tracings had four call sites on 2026-09-26.
The pattern is worth naming: when a value decides what a control OFFERS and separately what a query
MATCHES, those had better be the same expression.

Check: hjnewcellcheck.js, extended first; 2 of its assertions failed before this went in.
Run: python3 src/one_rule_for_which_pool_a_cell_is_in.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("hjump.html", [
 (u"one function names the pool",
  u"""/* Rebuilt once the community identities arrive (see buildIdentityFilterUI). Before that fetch
   resolves HJUMP_IDENTITY_BY_NID is null, hjumpIdentityOf() returns "", and this produces exactly
   H01's own pools -- so the page is correct at first paint and simply gets more specific. */
function rebuildTypePools(){""",
  u"""/* ── WHICH POOL A CELL IS IN, ONCE ───────────────────────────────────────────  2026-09-27
   Søren: "if i choose a bounding box around that cell and click the filter to show it, there are
   no matches." The box was innocent — it is identical in both of his screenshots; the ENDOTHELIAL
   CELL tick is what differed.

   This rule lived in two places: rebuildTypePools filed a cell under `added:<name>` or under
   h01SplitFor's resolved name, and runFilter tested the ticked values against typeName(i) — H01's
   own label, which for an added cell is `not-in-h01`. A checkbox whose label and count come from a
   pool, matched against something that is not the pool. Measured: 0 of 47,449.

   It was already wrong for microglia and had been since the split pools existed; nothing had
   resolved one yet, so nobody could tick it. See src/one_rule_for_which_pool_a_cell_is_in.py. */
function poolOf(i){
  const own=addedPoolFor(i);
  if(own) return own;
  let split;
  /* HJUMP_IDENTITY_BY_NID is a `let` declared further down and null until its fetch lands, so this
     is asked through a try and answers H01's own name until the identities arrive — which is what
     rebuildTypePools did with its `haveIdent` flag, for the same reason. */
  try { if(HJUMP_IDENTITY_BY_NID) split=h01SplitFor(hjumpIdentityOf(i)); } catch(_tdz){}
  return split||typeName(i);
}
/* Rebuilt once the community identities arrive (see buildIdentityFilterUI). Before that fetch
   resolves HJUMP_IDENTITY_BY_NID is null, hjumpIdentityOf() returns "", and this produces exactly
   H01's own pools -- so the page is correct at first paint and simply gets more specific. */
function rebuildTypePools(){"""),

 (u"...and the lists file by it",
  u"""    const split=haveIdent?h01SplitFor(hjumpIdentityOf(i)):undefined;
    /* A cell H01 never listed has no published call to be measured against, so the name somebody
       gave it is not an override of anything — it is the only name it has, and it is what the
       cell is filed under. A published cell's pool is still H01's, moved only by h01SplitFor
       (2026-09-26). */
    const own=addedPoolFor(i);
    if(own&&!IDX_BY_TYPE[own]){ IDX_BY_TYPE[own]=[]; ADDED_POOLS.push(own); }
    const bucket=own||split||t;
    if(IDX_BY_TYPE[bucket]) IDX_BY_TYPE[bucket].push(i);""",
  u"""    /* A cell H01 never listed has no published call to be measured against, so the name somebody
       gave it is not an override of anything — it is the only name it has, and it is what the
       cell is filed under. A published cell's pool is still H01's, moved only by h01SplitFor
       (2026-09-26). */
    /* THROUGH poolOf, and `own` read back out of its answer rather than computed a second time:
       two expressions for one rule is the bug this is the fix for (2026-09-27). */
    const bucket=poolOf(i);
    const own=(bucket.indexOf(ADDED_POOL)===0)?bucket:"";
    /* And "was it moved by a community identification" is read back out of the same answer, so
       the unassigned test below cannot disagree with the pool either. */
    const split=(!own&&bucket!==t)?bucket:undefined;
    if(own&&!IDX_BY_TYPE[own]){ IDX_BY_TYPE[own]=[]; ADDED_POOLS.push(own); }
    if(IDX_BY_TYPE[bucket]) IDX_BY_TYPE[bucket].push(i);"""),

 (u"...and the flag nothing reads any more is gone",
  u"""function rebuildTypePools(){
  let haveIdent=false;
  try { haveIdent=!!HJUMP_IDENTITY_BY_NID; } catch(_tdz){ haveIdent=false; }
  D.CT_NAMES.forEach(function(t){ IDX_BY_TYPE[t]=[]; });""",
  u"""function rebuildTypePools(){
  /* `haveIdent` lived here and is gone: poolOf asks that question now, in one place, and a flag
     read nowhere is a flag that drifts (2026-09-27). */
  D.CT_NAMES.forEach(function(t){ IDX_BY_TYPE[t]=[]; });"""),

 (u"...and the filter tests against it",
  u"""    if(tSet&&!tSet.has(typeName(i)))continue;""",
  u"""    /* poolOf, not typeName: the ticked value IS a pool key, and for an added or a
       community-resolved cell that is not H01's own label (2026-09-27). */
    if(tSet&&!tSet.has(poolOf(i)))continue;"""),
])
print("\nNow: python3 src/build_stamps.py")
