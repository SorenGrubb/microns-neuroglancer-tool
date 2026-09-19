# -*- coding: utf-8 -*-
u"""Editing it keeps its number.                                                 2026-09-19

Søren: *"I have started to make some lysosomes, but now because I have edited one of the lysosomes
twice, it is now called Lysosome 5 and the other one Lysosome 3 because I have edited it once. I
would like that editing it does not increase its number."*

His card, in his own screenshot: **Lysosome 1**, **Lysosome 3**, **Lysosome 5** — three lysosomes
on one microglia, numbered as if there were five.

WHAT DOES IT. `tracingCurrentAll` asks `tracingNextIndex()` for a number for EVERY structure it is
about to submit, and that function answers "one more than the highest this cell already has" — by
reading the dataset index, which already contains the very tracing being edited. So a version is
numbered as though it were a new organelle, and the numbers run away:

    trace A                         -> nothing exists      -> Lysosome 1
    trace B                         -> highest is 1        -> Lysosome 2
    trace C                         -> highest is 2        -> Lysosome 3
    edit B, add it back             -> highest is 3        -> Lysosome 4
    edit C, add it back             -> highest is 4        -> Lysosome 5

THE ID ALREADY KNOWS. The submission builder ends with

    t.id = TRACING_PENDING.id + (g.inst ? ("__i" + g.inst) : "");

and the comment above it says exactly what is needed here: *"The first structure keeps the bare id,
so editing a shared tracing and adding it back is still a version of THAT tracing."* The identity was
right all along; only the label was re-derived. So: a structure whose id is already in the dataset
keeps the number it was published under, and only genuinely new ones take a fresh one.

TWO SOURCES, BECAUSE ONE OF THEM CAN BE ABSENT. `tracingOpenShared` has the tracing in its hand and
stashes its number (TRACING_EDIT_INDEX); the shared index is consulted after that. The stash covers
the case the index cannot — not deployed, offline, never browsed — and the index covers the one the
stash cannot: a draft of an edit, resumed after a reload, where the page was never told what it is a
version of within this session.

A NEW STRUCTURE ON THE SAME PAD IS STILL NEW. Opening somebody's lysosome and drawing a second
organelle beside it submits two: the first keeps its number, the second takes the next free one.
That is why the reuse is per structure and not a flag on the submission.

Run: python3 src/editing_it_keeps_its_number.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    # ── the stash, filled where the tracing is actually in hand ──────────────────────────────
    (u'''    PAD_EDIT_ID = st.structureId;
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: st.structureId };''',
     u'''    PAD_EDIT_ID = st.structureId;
    /* ── WHAT NUMBER IT IS ALREADY PUBLISHED UNDER ──────────────────────────────  2026-09-19
       Søren: *"I would like that editing it does not increase its number."* It did: the submission
       builder asked for "one more than the highest this cell has" for every structure, including a
       version of one that is already counted in that highest. Remembered here, where the tracing
       itself is in hand, rather than re-derived later from an index that may not have loaded. */
    TRACING_EDIT_INDEX[String(st.structureId)] = Math.round(Number(st.instanceIndex) || 0);
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: st.structureId };''',
     "opening a tracing remembers the number it already has"),

    # ── the lookup ───────────────────────────────────────────────────────────────────────────
    (u'''function tracingNextIndex(kind, label, nuc, root){''',
     u'''/* Numbers of tracings opened for editing this session, by structureId. Filled by
   tracingOpenShared, which has the tracing in its hand; read by tracingCurrentAll below. */
var TRACING_EDIT_INDEX = {};
/* THE NUMBER A STRUCTURE IS ALREADY PUBLISHED UNDER, or 0 for one that is new. The stash first
   because it cannot be stale and does not depend on the index having loaded; the shared index
   second because it survives a reload, which the stash does not -- a draft of an edit resumed
   tomorrow has no memory of what it is a version of, and the index does. */
function tracingPublishedIndex(structureId){
  var id = String(structureId || "");
  if (!id) return 0;
  if (TRACING_EDIT_INDEX[id] > 0) return TRACING_EDIT_INDEX[id];
  var found = 0;
  (TRACING_SHARED || []).forEach(function(t){
    if (t && String(t.structureId || "") === id && Number(t.instanceIndex) > 0)
      found = Math.round(Number(t.instanceIndex));
  });
  return found;
}
function tracingNextIndex(kind, label, nuc, root){''',
     "...and there is one place that answers what number a structure already has"),

    # ── the numbering, which now asks before allocating ──────────────────────────────────────
    (u'''  const first={}, taken={}, count={};
  groups.forEach(function(g){
    const k=seriesKey(g.w);
    count[k]=(count[k]||0)+1;
    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid);
  });

  if(!TRACING_PENDING.id){
    const label=groups[0].w.name;
    const prior=(TRACINGS_KEPT||[]).filter(function(x){return x&&x.id&&x.name===label;})[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);
  }

  return groups.map(function(g){
    const k=seriesKey(g.w);
    const n=(taken[k]||0); taken[k]=n+1;
    const index=first[k]+n;
    const several=(count[k]>1)||(first[k]>1);''',
     u'''  /* THE ID IS SETTLED FIRST, because it is what decides whether a structure is new. It used to
     be assigned after the numbering, which was harmless only while the numbering did not care. */
  if(!TRACING_PENDING.id){
    const label=groups[0].w.name;
    const prior=(TRACINGS_KEPT||[]).filter(function(x){return x&&x.id&&x.name===label;})[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);
  }
  /* The same expression the submission ends with, hoisted so the numbering can use it: the first
     structure keeps the bare id, which is what makes an edited tracing a version of itself. */
  const idOf=function(g){ return TRACING_PENDING.id+(g.inst?("__i"+g.inst):""); };

  /* ── A VERSION KEEPS ITS NUMBER ─────────────────────────────────────────────────  2026-09-19
     Søren: *"because I have edited one of the lysosomes twice, it is now called Lysosome 5... I
     would like that editing it does not increase its number."* Every structure used to be handed
     "one more than the highest this cell carries", including one that IS that highest. Three
     lysosomes came out numbered 1, 3 and 5.

     Only genuinely new structures draw from the fresh numbers now, so a new organelle traced beside
     an edited one still gets the next free one rather than inheriting anything. */
  const first={}, taken={}, count={}, keep={};
  groups.forEach(function(g){
    const k=seriesKey(g.w);
    count[k]=(count[k]||0)+1;
    const has=tracingPublishedIndex(idOf(g));
    if(has){ keep[g.inst]=has; return; }
    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid);
  });

  return groups.map(function(g){
    const k=seriesKey(g.w);
    const mine=keep[g.inst]||0;
    let index, several;
    if(mine){
      index=mine;
      /* It was published WITH a number, so it keeps one: dropping it on a re-add would rename
         "Lysosome 3" to "Lysosome" and make the same object look like a different one. */
      several=(mine>1)||(count[k]>1);
    } else {
      const n=(taken[k]||0); taken[k]=n+1;
      index=first[k]+n;
      several=(count[k]>1)||(first[k]>1);
    }''',
     "a structure already in the dataset keeps the number it was published under"),
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


edit("ujump.html", PAIRS)
print("\nnow: node tracingnumbercheck.js && node tracingpanelcheck.js && python3 src/build_stamps.py")
