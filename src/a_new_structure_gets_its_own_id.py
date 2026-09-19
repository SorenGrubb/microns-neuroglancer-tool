# -*- coding: utf-8 -*-
u"""A new structure gets its own id.                                             2026-09-19

Søren, with his Drive folder: *"The 3 lysosomes also have 6 json files"* — and the filenames are
what matters, not the count:

    lysosome_1789846306269__trace_mu8slsvq_unosr.json
    lysosome_1789846306269__trace_mu8sa74i_4rcmv.json
    lysosome_1789846306269__i1__trace_mu8swkoc_ck2qa.json
    lysosome_1789846306269__i1__trace_mu8slsvs_tsxep.json
    lysosome_1789846306269__i1__i2__trace_mu8szz8h_o8epn.json
    lysosome_1789846306269__i1__i2__trace_mu8swkoe_p6kp6.json

SIX FILES FOR THREE TRACINGS IS CORRECT: one file per share, never overwritten, which is where the
history lives. Three structures, two versions each.

`__i1__i2` IS NOT. The ids come from

    t.id = TRACING_PENDING.id + (g.inst ? ("__i" + g.inst) : "");

and TRACING_PENDING.id is whatever tracing was opened for editing. Open `X__i1`, draw another
organelle beside it, and the new one is filed as `X__i1__i2` — so the third lysosome's identity is
not what it would have been, and a later edit of it files as a rival rather than a version.

THE COMPOUND NAME IS THE HARMLESS HALF. The dangerous one never fired here by luck: open `X` —
lysosome ONE, no suffix — draw a second organelle, and it is filed as `X__i1`, which is not a new
structure at all. It is lysosome TWO. A brand-new organelle would have been written as the next
version of an existing one, quietly, and the older geometry would have stopped being the current
answer for that id. His three ids are distinct, so nothing was overwritten; the arrangement that
allows it is what is being removed.

A BASE THAT IS NEVER SOMEBODY ELSE'S ID. The suffix scheme is only a way to mint distinct ids for
the other structures on a pad — nothing reads the relationship — so the fix is to hang them off a
base the pad owns rather than off whatever was opened:

  · nothing opened for editing -> the base IS the pad's own id, so three structures drawn together
    are still X, X__i1, X__i2, exactly as before;
  · a tracing opened for editing -> that id names somebody's existing structure and is used for
    THAT structure alone. Any other structure hangs off a freshly minted base.

STABLE WITHIN THE SESSION, which is the requirement that rules out "mint one per press": structure
two must get the same id every time it is added, or every press files another tracing. The base is
minted once, kept for the pad session, reset where the draft id is reset, and written into the draft
so that resuming tomorrow continues the same structures rather than making new ones.

Run: python3 src/a_new_structure_gets_its_own_id.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BASE = [
    (u'''var TRACING_EDIT_INDEX = {};''',
     u'''var TRACING_EDIT_INDEX = {};
/* ── THE PAD'S OWN BASE, WHICH IS NEVER SOMEBODY ELSE'S ID ─────────────────────  2026-09-19
   Søren's Drive folder had `lysosome_…__i1__i2.json`: the id of a new organelle built by adding a
   suffix to the id of a DIFFERENT tracing that happened to be open for editing. The compound name
   is the harmless half. The other half never fired only by luck — editing `X` and drawing a second
   organelle files it as `X__i1`, which is not a new structure but the one already published under
   that id, so a new organelle would have become the next version of an existing one.

   The suffix is only a way to mint distinct ids; nothing reads the relationship. So it hangs off a
   base the pad owns. Minted once per pad session and kept, because structure two must get the SAME
   id on every press or each press files another tracing. */
var TRACING_BASE_ID = "";''',
     "the pad has a base id of its own"),

    (u'''  /* THE ID IS SETTLED FIRST, because it is what decides whether a structure is new. It used to
     be assigned after the numbering, which was harmless only while the numbering did not care. */
  if(!TRACING_PENDING.id){
    const label=groups[0].w.name;
    const prior=(TRACINGS_KEPT||[]).filter(function(x){return x&&x.id&&x.name===label;})[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);
  }
  /* The same expression the submission ends with, hoisted so the numbering can use it: the first
     structure keeps the bare id, which is what makes an edited tracing a version of itself. */
  const idOf=function(g){ return TRACING_PENDING.id+(g.inst?("__i"+g.inst):""); };''',
     u'''  /* THE ID IS SETTLED FIRST, because it is what decides whether a structure is new. It used to
     be assigned after the numbering, which was harmless only while the numbering did not care. */
  if(!TRACING_PENDING.id){
    const label=groups[0].w.name;
    const prior=(TRACINGS_KEPT||[]).filter(function(x){return x&&x.id&&x.name===label;})[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);
  }
  /* WHERE THE OTHER STRUCTURES HANG FROM.  2026-09-19
     With nothing opened for editing, the pad's own id — so three structures drawn together are
     still X, X__i1, X__i2. With a tracing opened, TRACING_PENDING.id names somebody's EXISTING
     structure: `X__i1 + "__i2"` is the compound id Søren found in Drive, and `X + "__i1"` is worse,
     because that is a real and different lysosome. A fresh base, minted once and kept, is the only
     thing here that cannot already belong to something else. */
  if(!TRACING_BASE_ID)
    TRACING_BASE_ID = PAD_EDIT_ID ? UJ.tracing.structureId(groups[0].w.name || "tracing")
                                  : TRACING_PENDING.id;
  /* One expression for what a structure is called, used by the numbering below AND by the
     submission at the end. They were two copies of it, which is how they could have disagreed. */
  const idOf=function(g){ return g.inst?(TRACING_BASE_ID+"__i"+g.inst):TRACING_PENDING.id; };''',
     "...that new structures hang off, instead of the opened tracing's"),

    (u'''    /* The pad's own index, not the published number: see the header. The first structure keeps the
       bare id, so editing a shared tracing and adding it back is still a version of THAT tracing. */
    t.id=TRACING_PENDING.id+(g.inst?("__i"+g.inst):"");''',
     u'''    /* The pad's own index, not the published number: see the header. The first structure keeps the
       bare id, so editing a shared tracing and adding it back is still a version of THAT tracing;
       every other one hangs off the pad's base rather than off that tracing's id (2026-09-19). */
    t.id=idOf(g);''',
     "...and the submission uses that one expression too"),
]

RESET = [
    (u'''  /* A FRESH PAD IS A FRESH DRAFT, 2026-09-19. Without this the next tracing would save itself
     over the last one's draft entry -- which is the single-slot behaviour this change exists to
     end, reintroduced one level down. */
  TRACING_DRAFT_ID = "";''',
     u'''  /* A FRESH PAD IS A FRESH DRAFT, 2026-09-19. Without this the next tracing would save itself
     over the last one's draft entry -- which is the single-slot behaviour this change exists to
     end, reintroduced one level down. And a fresh BASE, or the next pad's second structure would
     be filed as this one's second structure. */
  TRACING_DRAFT_ID = ""; TRACING_BASE_ID = "";''',
     "a fresh pad starts a fresh base as well as a fresh draft"),

    (u'''  if (PAD){
    PAD.rings = []; PAD.pending = []; PAD.stroke = null; PAD.inst = 0;
    PAD_INST_KIND = {}; PAD_INST_COLOUR = {};
    try { padPaint(); padRings(); } catch (_e){}
  }
  PAD_EDIT_ID = "";''',
     u'''  if (PAD){
    PAD.rings = []; PAD.pending = []; PAD.stroke = null; PAD.inst = 0;
    PAD_INST_KIND = {}; PAD_INST_COLOUR = {};
    try { padPaint(); padRings(); } catch (_e){}
  }
  PAD_EDIT_ID = ""; TRACING_BASE_ID = "";''',
     "...and committing ends the session the base belonged to"),

    (u'''    /* The identity travels with it, so adding a version does not quietly drop the cell type or the
       ids somebody else filled in. */
    PAD_EDIT_ID = st.structureId;''',
     u'''    /* The identity travels with it, so adding a version does not quietly drop the cell type or the
       ids somebody else filled in. */
    /* ── AND THE PAD BEFORE IT DOES NOT ─────────────────────────────────────────  2026-09-19
       This builds a whole new PAD, so it is a fresh pad by every other measure, but it is not
       padOpen and it was resetting neither of the two things a pad session owns. Draw two
       organelles, leave without committing, open somebody's tracing to edit: the stale base would
       have filed the second structure of THIS session under the second structure of the last one,
       and the stale draft id would have saved the edit over that session's draft. Same fault as
       the compound ids, one level up. */
    TRACING_BASE_ID = ""; TRACING_DRAFT_ID = "";
    PAD_EDIT_ID = st.structureId;''',
     "...and opening somebody's tracing is a fresh pad too"),
]

DRAFT = [
    (u'''           editId: PAD_EDIT_ID || "",
           structureId: (TRACING_PENDING && TRACING_PENDING.id) || "",''',
     u'''           editId: PAD_EDIT_ID || "",
           structureId: (TRACING_PENDING && TRACING_PENDING.id) || "",
           /* THE BASE GOES IN THE DRAFT, 2026-09-19. Without it, resuming tomorrow mints a new one
              and every structure after the first is filed as a NEW tracing rather than a version of
              the one it already is -- the same class of fault as the compound ids this fixes. */
           baseId: TRACING_BASE_ID || "",''',
     "the draft remembers the base its structures hang off"),

    (u'''function draftResumeFrom(d){
  if (!d) return;''',
     u'''function draftResumeFrom(d){
  if (!d) return;
  /* Restored before anything else looks at it: a draft written before this existed has none, and
     "" means the next add mints one, which is what used to happen every time. */
  TRACING_BASE_ID = d.baseId || "";''',
     "...and resuming one restores it"),
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


edit("ujump.html", BASE + RESET + DRAFT)
print("\nnow: node tracingidcheck.js && node tracingnumbercheck.js && node tracingpanelcheck.js "
      "&& python3 src/build_stamps.py")
