# -*- coding: utf-8 -*-
u"""A cell has one whole cell and twenty lysosomes.                                      2026-09-27

Hesham, through Søren:

    "if I'm logging multiple lysosomes I still have to change the color of the annotation between
     each lysosome — if I don't, the new tracing will replace the old one which will then be turned
     from a tracing into a point annotation for some reason."

HE IS RIGHT, AND IT IS THE FIX FROM FOUR DAYS AGO, APPLIED ONE STEP TOO WIDELY.

On 2026-09-23 a whole cell went missing: two arachnoid barrier cells, both called "Whole cell", the
second having taken the first's structureId by matching on the NAME alone
(src/a_second_cell_does_not_take_the_first_ones_id.py). The key was tightened to the name AND the
cell — nucleus, root or coordinate. That is a sound identity for a whole cell, of which a cell has
exactly one.

IT IS NOT AN IDENTITY FOR AN ORGANELLE. A cell has as many lysosomes as somebody draws, every one of
them is named "Lysosome" — bare, with no number, because tracingCurrentAll numbers a name only when
there is more than one of the kind on the pad to tell apart — and they are all on the same cell. So
the second lysosome found the first and filed itself as the first one's next version.

THE COLOUR IS THE SYMPTOM AND NOT THE CAUSE, which is why the workaround looked so arbitrary. A
structure's colour is INSTANCE_COLOURS[inst]; its id comes from the same `inst`:

    idOf(g) = g.inst ? TRACING_BASE_ID + "__i" + g.inst : TRACING_PENDING.id
    TRACING_BASE_ID = TRACING_PENDING.id          (with nothing opened for editing)

TRACING_PENDING.id is what that lookup just handed over — an existing lysosome's id — so the WHOLE
CHAIN hung off it. Every pad session on one cell computed the same id for its first structure, the
same for its second, and so on. Session two's green lysosome replaced session one's green lysosome;
pressing "+ another one" moved to an index the other session had not reached, and appeared to cure it.

Measured before the fix, in idcollisioncheck.js: three lysosomes drawn in three pad sessions on one
cell came back as **one id, minted_4, three times**.

TWO CHANGES, AND THE SECOND MATTERS AS MUCH AS THE FIRST.

  THE LOOKUP IS FOR KINDS A CELL HAS ONE OF — `cell`, `nucleus`, and `other`, where the user
  TYPED the name and it is therefore a chosen identifier rather than a kind. For everything else a new
  structure is a new structure. Editing one on purpose is not affected: "Show the tracings in the
  dataset" → "Open it in the pad" sets PAD_EDIT_ID / PAD_EDIT_IDS, and `editOf` is consulted first.
  What is given up is that pasting the same link twice for one lysosome now makes two lysosomes
  instead of two versions — two rows to merge, against an afternoon of tracing behind a "v2" label.
  That is the same trade the 2026-09-23 note made, decided the same way.

  THE PAD'S BASE IS ALWAYS ITS OWN. TRACING_BASE_ID was set to TRACING_PENDING.id whenever nothing
  was open for editing, so on a re-read whole cell the second structure on the pad became
  `<that cell's id>__i1` — the compound-id hazard its own comment from 2026-09-19 describes, still
  live for that one case. It is minted now, always, and the base is only ever used for inst >= 1,
  which `editOf` has already had its say about. The draft still carries it (baseId), so resuming a
  draft keeps every id it had.

THE SECOND HALF OF HIS REPORT — "turned from a tracing into a point annotation" — follows from the
same collision and is not separately fixed here: the overwritten structure's id now holds the new
geometry, so the organelle REPORT filed against the old one has no outline of its own left and is
drawn from its logged coordinate instead. Worth confirming on his sheet after this is pushed; if a
row is still reading as a point with this fixed, that is a second thing and I have not found it.

Check: idcollisioncheck.js, extended first; 4 of its assertions failed before this went in.
Run: python3 src/a_cell_has_one_whole_cell_and_twenty_lysosomes.py, then python3 src/build_stamps.py,
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
 (u"the name-and-cell lookup is for kinds a cell has one of",
  u"""    const prior=(TRACINGS_KEPT||[]).filter(function(x){
      return x&&x.id&&x.name===label&&sameCell(x);
    })[0];
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);""",
  u"""    /* ── AND ONLY FOR SOMETHING A CELL HAS ONE OF ──────────────────────────────────  2026-09-27
       Hesham: "if I'm logging multiple lysosomes I still have to change the color of the annotation
       between each lysosome — if I don't, the new tracing will replace the old one."

       Name AND cell identifies a WHOLE CELL, because a cell has exactly one. It identifies nothing
       about a lysosome: a cell has as many as somebody draws, every one of them is named bare
       "Lysosome" (the number is only added when there is more than one of the kind on the pad), and
       they are all on the same cell. So the second lysosome found the first and filed itself as its
       next version. Measured: three lysosomes in three pad sessions came back as ONE id.

       Editing one on purpose is a different route and is unaffected — "Open it in the pad" sets
       PAD_EDIT_ID / PAD_EDIT_IDS, and editOf() is asked before any of this. What is given up is
       that pasting the same link twice for one organelle now makes two of them rather than two
       versions: two rows to merge, against an afternoon of tracing behind a "v2" label. The same
       trade src/a_second_cell_does_not_take_the_first_ones_id.py made, decided the same way.
       See src/a_cell_has_one_whole_cell_and_twenty_lysosomes.py. */
    /* "other" is in, and it is not an exception: under `other` the user TYPED the name, which is
       the one case where a name is a chosen identifier rather than a kind \u2014 tracingSeriesLabel
       already treats it that way for the numbering, for the same reason. Two tracings both called
       "Astrocyte at the glia limitans" on one cell are one structure, traced twice. Two called
       "Lysosome" are two lysosomes. (Found by tracingpanelcheck.js, which went red on five
       assertions when this rule first read cell-or-nucleus alone.) */
    const oneEach=(kindNow==="cell"||kindNow==="nucleus"||kindNow==="other");
    const prior=oneEach?(TRACINGS_KEPT||[]).filter(function(x){
      return x&&x.id&&x.name===label&&sameCell(x);
    })[0]:null;
    TRACING_PENDING.id=(prior&&prior.id)||UJ.tracing.structureId(label);"""),

 (u"...and the kind is read where the name is",
  u"""  if(!TRACING_PENDING.id){
    const label=groups[0].w.name;""",
  u"""  if(!TRACING_PENDING.id){
    const label=groups[0].w.name, kindNow=String(groups[0].w.kind||"");"""),

 (u"the pad's base is always the pad's own",
  u"""  if(!TRACING_BASE_ID)
    TRACING_BASE_ID = PAD_EDIT_ID ? UJ.tracing.structureId(groups[0].w.name || "tracing")
                                  : TRACING_PENDING.id;""",
  u"""  /* ALWAYS MINTED, 2026-09-27. It was TRACING_PENDING.id whenever nothing was open for editing
     — so on a whole cell being re-read, whose pending id is that cell's EXISTING id, a second
     structure drawn beside it became `<that cell's id>__i1`: the compound-id hazard this block's
     own note from 2026-09-19 describes, still live for that one case. The base is only ever used
     for inst >= 1, and editOf() has already had its say about those, so a fresh one can never take
     something else's identity. A draft carries it (baseId), so resuming one keeps every id it had. */
  if(!TRACING_BASE_ID)
    TRACING_BASE_ID = UJ.tracing.structureId(groups[0].w.name || "tracing");"""),
])
print("\nNow: python3 src/build_stamps.py, then python3 wjump-build/build_wjump.py")
