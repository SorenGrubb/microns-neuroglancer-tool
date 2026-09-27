# -*- coding: utf-8 -*-
u"""Opening an organelle is not changing it.                                            2026-09-27

Søren:

    "when we want to add more organelles of the same type after we have added some of them, we want
     to be able to open them again in the pad and then add more organelles to the cell and save the
     new organelles without doing anything to the previously saved organelles, unless of course we
     have also edited those. I don't want to get a new version of an organelle if there are no
     changes to it. ... I see now that the Lysosome 1 of my tracing is renamed to lysosome 5 and is
     now version 3 even though I have not touched it, I have only opened it in the pad and traced
     other organelles."

TWO FAULTS, AND THEY FEED EACH OTHER.

THE NUMBER. A structure saved while it was the only one of its kind on the pad gets `several =
false`, which means it is named bare "Lysosome" and **no instance_index is submitted at all**. Then
tracingPublishedIndex answers 0 for it — TRACING_EDIT_INDEX stores `Number(instanceIndex) || 0`, and
the TRACING_SHARED scan requires `> 0` — and the numbering reads 0 as "this structure is new" and
hands it the next free number. Measured: "Lysosome" came back as "Lysosome 3", beside the real
Lysosome 2. **Zero was doing two jobs**: "published without a number" and "not published at all".

THE VERSION. tracingShareSig has refused an unchanged re-send since 2026-09-23, comparing against
`t.shared_sig`, which tracingKeep carries across a re-add from the matching entry in TRACINGS_KEPT.
A tracing OPENED FROM THE DATASET is not in TRACINGS_KEPT — there is no prior, so there is no
signature, so nothing has anything to compare, and every save posts a version. That machinery only
ever worked for tracings kept in this browser, which is not the case Søren is describing.

AND THEY FEED EACH OTHER: the renumbering rewrites the name, the name is IN the signature, so a
seeded signature alone would still have said "changed". Neither half is a fix on its own.

WHAT IS DONE

  TRACING_EDIT_KNOWN answers "is this structure in the dataset" apart from "what number does it
  carry", so 0 can mean what it says. tracingIsPublished() asks it, and the TRACING_SHARED index by
  id — not by id AND a positive number, which was the whole bug.

  TRACING_EDIT_SIG carries the signature of what the dataset holds, keyed by structureId, built
  through the same toSubmission + tracingShareSig the publish path uses. tracingKeep seeds
  t.shared_sig from it when there is no local prior. So an untouched re-add of something opened from
  the dataset refuses to send, and says so — exactly as an untouched re-add of something kept here
  already did.

  A KEPT NUMBER IS KEPT AS IT IS, including none. `several` was `(mine > 1) || (count[k] > 1)`,
  which renamed a published "Lysosome 1" to "Lysosome" when it was re-added on its own — an
  off-by-one that had never been reached because a lone "Lysosome 1" was never recognised as
  published in the first place. It is `mine > 0` now: the structure is named the way it was
  published, whatever else is on the pad.

WHAT IS NOT CLAIMED. The fields in the signature have to normalise the same way on both sides —
nucleusId through tracingScoped, cellCoord through tracingCoordShow and back — and the check carries
a cell coordinate for that reason. If some future field normalises differently the failure is one
spurious version, which is where this started, not a lost edit.

Check: reopenedtracingcheck.js, written first; 8 of its assertions failed before this went in.
Run: python3 src/opening_an_organelle_is_not_changing_it.py, then python3 src/build_stamps.py,
then python3 wjump-build/build_wjump.py
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


edit("core/tracingcard.js", [
 # ── 1. "is it published" is a different question from "what number does it carry" ────────────
 (u"published, and separately numbered",
  u"""/* Numbers of tracings opened for editing this session, by structureId. Filled by
   tracingOpenShared, which has the tracing in its hand; read by tracingCurrentAll below. */
var TRACING_EDIT_INDEX = {};""",
  u"""/* Numbers of tracings opened for editing this session, by structureId. Filled by
   tracingOpenShared, which has the tracing in its hand; read by tracingCurrentAll below. */
var TRACING_EDIT_INDEX = {};
/* ── AND WHETHER IT IS IN THE DATASET AT ALL ──────────────────────────────────  2026-09-27
   Søren: "Lysosome 1 of my tracing is renamed to lysosome 5 and is now version 3 even though I
   have not touched it, I have only opened it in the pad and traced other organelles."

   A structure saved while it was the only one of its kind carries NO instance_index — `several` is
   false, so the name is bare and no number is submitted. TRACING_EDIT_INDEX then holds 0 for it,
   the TRACING_SHARED scan wants `> 0`, and the numbering read 0 as "new" and handed it the next
   free number. Zero was doing two jobs. This map does the other one.

   TRACING_EDIT_SIG is the second half: the fingerprint of what the DATASET holds, so an untouched
   re-add of something opened from there can be refused the way an untouched re-add of something
   kept here already is. tracingKeep carried shared_sig from TRACINGS_KEPT, and a tracing opened
   from the dataset is not in TRACINGS_KEPT — so nothing had anything to compare.
   See src/opening_an_organelle_is_not_changing_it.py. */
var TRACING_EDIT_KNOWN = {}, TRACING_EDIT_SIG = {};
/* In the dataset, whatever number it carries — including none. */
function tracingIsPublished(structureId){
  var id = String(structureId || "");
  if (!id) return false;
  if (TRACING_EDIT_KNOWN[id]) return true;
  var found = false;
  (TRACING_SHARED || []).forEach(function(t){
    if (t && String(t.structureId || "") === id) found = true;
  });
  return found;
}
/* What the dataset's copy of a structure would sign as, so an unchanged re-add matches it. Built
   through the same toSubmission the publish path uses, with the same normalisers — tracingScoped
   for the nucleus id, and the rings rounded the way the pad rounds them when it opens one. */
function tracingSigOfShared(st){
  try {
    if (!st || !st.rings || !st.rings.length) return "";
    var rings = st.rings.map(function(r){
      return { z: Math.round(r.z), ringIndex: r.ringIndex,
               points: (r.points || []).map(function(p){
                 return [Math.round(p[0]), Math.round(p[1])]; }) };
    });
    var sub = UJ.tracing.toSubmission(rings, {
      structureId: st.structureId, name: st.name, kind: st.kind || "",
      cellType: st.cellType, color: st.color,
      nucleusId: tracingScoped(st.nucleusId || ""), rootId: st.rootId || "",
      cellCoord: st.cellCoord || "",
      instanceIndex: st.instanceIndex, instanceOf: st.instanceOf });
    return tracingShareSig(sub);
  } catch (_e){ return ""; }
}
/* One place both openers record what they have just opened, so they cannot do it differently. */
function tracingNoteOpened(st, sid){
  var id = String((st && st.structureId) || sid || "");
  if (!id) return;
  TRACING_EDIT_KNOWN[id] = 1;
  TRACING_EDIT_INDEX[id] = Math.round(Number(st && st.instanceIndex) || 0);
  var sig = tracingSigOfShared(st);
  if (sig) TRACING_EDIT_SIG[id] = sig;
}"""),

 # ── 2. the numbering asks the right question ─────────────────────────────────────────────────
 (u"an opened structure keeps its number, and none is a number",
  u"""  const first={}, taken={}, count={}, keep={};
  groups.forEach(function(g){
    const k=seriesKey(g.w);
    count[k]=(count[k]||0)+1;
    const has=tracingPublishedIndex(idOf(g));
    if(has){ keep[g.inst]=has; return; }
    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid);
  });""",
  u"""  /* ── AND "PUBLISHED" IS NOT "PUBLISHED WITH A NUMBER" ──────────────────────────  2026-09-27
     This asked tracingPublishedIndex and treated 0 as "new", so a structure saved on its own —
     which carries no instance_index at all — was renumbered every time it was opened. `known`
     asks whether the dataset has it; `keep` says what number it carries, and 0 is an answer.
     See src/opening_an_organelle_is_not_changing_it.py. */
  const first={}, taken={}, count={}, keep={}, known={};
  groups.forEach(function(g){
    const k=seriesKey(g.w);
    count[k]=(count[k]||0)+1;
    const id=idOf(g);
    if(tracingIsPublished(id)){ known[g.inst]=1; keep[g.inst]=tracingPublishedIndex(id); return; }
    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid);
  });"""),

 (u"...and is named the way it was published",
  u"""    const mine=keep[g.inst]||0;
    let index, several;
    if(mine){
      index=mine;
      /* It was published WITH a number, so it keeps one: dropping it on a re-add would rename
         "Lysosome 3" to "Lysosome" and make the same object look like a different one. */
      several=(mine>1)||(count[k]>1);
    } else {""",
  u"""    const mine=keep[g.inst]||0;
    let index, several;
    if(known[g.inst]){
      index=mine;
      /* IT IS NAMED THE WAY IT WAS PUBLISHED, whatever else is on the pad (2026-09-27). With a
         number it keeps that number — dropping it would rename "Lysosome 3" to "Lysosome" and make
         the same object look like a different one. With none it keeps none, which is the case that
         was being renumbered.

         This read `(mine>1)||(count[k]>1)`, which renamed a published "Lysosome 1" to "Lysosome"
         when it was re-added alone — an off-by-one nobody had reached, because a lone "Lysosome 1"
         was never recognised as published to begin with. */
      several=(mine>0);
    } else {"""),

 # ── 3. and the dataset's own signature is what an untouched re-add is compared with ──────────
 (u"what the dataset holds counts as what was last sent",
  u"""    if(prior&&prior.shared_sig)t.shared_sig=prior.shared_sig;""",
  u"""    if(prior&&prior.shared_sig)t.shared_sig=prior.shared_sig;
    /* ── OR WHAT THE DATASET HOLDS, FOR ONE OPENED FROM IT ───────────────────────  2026-09-27
       There is no prior for a tracing opened from the dataset — it was never in TRACINGS_KEPT — so
       it had no signature, so tracingPublish could not tell an untouched re-add from a change and
       posted a version either way. Søren: "I don't want to get a new version of an organelle if
       there are no changes to it." The dataset's own copy signs as TRACING_EDIT_SIG, recorded when
       it was opened. See src/opening_an_organelle_is_not_changing_it.py. */
    if(!t.shared_sig&&TRACING_EDIT_SIG[t.id])t.shared_sig=TRACING_EDIT_SIG[t.id];"""),

 # ── 4. both openers record it the same way ───────────────────────────────────────────────────
 (u"open-all records what it opened",
  u"""      PAD_EDIT_IDS[String(k)] = String(x.st.structureId || x.sid);
      TRACING_EDIT_INDEX[String(x.st.structureId || x.sid)] = Math.round(Number(x.st.instanceIndex || x.t.instanceIndex) || 0);""",
  u"""      PAD_EDIT_IDS[String(k)] = String(x.st.structureId || x.sid);
      /* Through the one helper, so the two openers cannot record it differently (2026-09-27). */
      tracingNoteOpened(x.st, x.sid);"""),

 (u"...and so does the single-tracing opener",
  u"""    TRACING_EDIT_INDEX[String(st.structureId)] = Math.round(Number(st.instanceIndex) || 0);
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: st.structureId };""",
  u"""    /* Through the one helper, as "Open all in the pad" does (2026-09-27). */
    tracingNoteOpened(st, sid);
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: st.structureId };"""),
])
print("\nNow: python3 src/build_stamps.py, then python3 wjump-build/build_wjump.py")
