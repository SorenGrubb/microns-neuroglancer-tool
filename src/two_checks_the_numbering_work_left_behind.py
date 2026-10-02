# -*- coding: utf-8 -*-
u"""Two checks still asserting the contract of 2026-09-26.                               2026-10-03

Running the whole suite after the Eyewire II work turned up three red files. One,
tracingpanelcheck.js, is a timing flake. The other two are these, and NEITHER IS A BUG IN THE
CODE: both assert rules that Søren deliberately changed on 2026-09-27, and that nobody came back
and re-pointed the checks at.

claude/a-cells-organelles-of-a-kind-are-numbered.md ends with a section called "Two checks
rewritten, deliberately" — reopenedtracingcheck.js and idcollisioncheck.js. It should have said
four. These are the two that were missed, and they sat red for six days without anyone noticing,
which is the real cost: a suite with known-red files in it stops being read.

WHAT CHANGED UNDER THEM

1. tracingnumbercheck.js, two assertions. "An ontology organelle kind is always numbered. A cell's
   first lysosome is 'Lysosome 1'." Before that day a lone first lysosome was bare "Lysosome", and
   the whole reason Søren asked for the change is that bare-because-alone was self-perpetuating:
   Hesham drew seven, one at a time, and every one of them came out unnumbered because the one
   before it was. One of the two failing assertions even has a comment above it that already says
   "numbering starts at 1" — the prose was updated and the expectation under it was not.

2. tracingidcheck.js, two assertions. TRACING_BASE_ID used to be TRACING_PENDING.id whenever
   nothing was open for editing, so three structures drawn in one sitting came out X, X__i1, X__i2.
   It is now ALWAYS freshly minted, because on a whole cell re-read from the dataset the pending id
   is that cell's EXISTING id — and hanging a second structure off it as `<that cell's id>__i1`
   is the compound-id hazard this check's own 2026-09-19 header was written about, arriving from
   inside. A minted base is used only for inst >= 1 and can belong to nothing, which is the point.

   The consequence the check was reading as a failure is cosmetic and worth stating: structures
   drawn together no longer share a filename stem. Søren reads those filenames, so it is a real
   loss of legibility, and it buys the one thing that matters more — an id that cannot already be
   somebody's lysosome. Asserted here as what it now is, with the stem property replaced by the
   property that replaced it.

WHAT IS NOT CHANGED. Neither check's REASON for existing moves. tracingidcheck still asserts that a
new structure's id is one nothing else owns, against the shared index; tracingnumbercheck still
replays Søren's 1/3/5 sequence and asserts that editing does not renumber. Only the two
expectations each that the 27th flipped.

Run: python3 src/two_checks_the_numbering_work_left_behind.py,
     then node tracingnumbercheck.js && node tracingidcheck.js
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
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("tracingnumbercheck.js", [

 (u"the header says which way it used to point",
  u"   It drives tracingCurrentAll on the real page — the numbering, the naming and the ids all come out\n"
  u"   of that one function, so asserting anything less than its output would be asserting a step.\n",
  u"   It drives tracingCurrentAll on the real page — the numbering, the naming and the ids all come out\n"
  u"   of that one function, so asserting anything less than its output would be asserting a step.\n"
  u"\n"
  u"   ── THE FIRST ONE IS \"LYSOSOME 1\" NOW, NOT \"LYSOSOME\" ────────────────────  2026-10-03\n"
  u"\n"
  u"   Two assertions here said a lone first lysosome comes out bare, which was true until\n"
  u"   2026-09-27 and is the opposite of what Søren asked for that day: *\"can we force the\n"
  u"   numbering, so that if you add another lysosome to a cell that already has a lysosome they\n"
  u"   both get a number, first one is 1 and second one is 2\"*.\n"
  u"\n"
  u"   Bare-because-alone was SELF-PERPETUATING, which is why it had to go: a structure drawn on\n"
  u"   its own submitted no instance_index at all, so the next one asked \"what is the highest\n"
  u"   number on this cell\", got 0, and came out bare too. Hesham drew seven lysosomes one at a\n"
  u"   time and every one of them was called \"Lysosome\".\n"
  u"\n"
  u"   This file was missed when reopenedtracingcheck.js and idcollisioncheck.js were re-pointed\n"
  u"   at the new rule, and it sat red for six days. The contract it asserts now:\n"
  u"   an ontology organelle kind is ALWAYS numbered, from the first one; a whole cell and a\n"
  u"   nucleus never are; a hand-named \"something else\" keeps the old rule, because there the name\n"
  u"   is the identifier the user chose. See claude/a-cells-organelles-of-a-kind-are-numbered.md.\n"),

 (u"a cell's first lysosome is Lysosome 1",
  u'    ok(a[0] && a[0].name === "Lysosome", "the first is just “Lysosome” — there is no series yet",\n'
  u"       a[0] && a[0].name);",
  u'    ok(a[0] && a[0].name === "Lysosome 1",\n'
  u'       "the first is “Lysosome 1” — numbered from the first one, or the second is bare too",\n'
  u"       a[0] && a[0].name);"),

 (u"...including when the dataset index is empty",
  u'    ok(got.length === 1 && got[0].name === "Lysosome",\n'
  u'       "it is submitted, with the number it can justify", got[0] && got[0].name);',
  u'    /* "Lysosome 1" rather than bare since 2026-09-27 — the comment above already said\n'
  u'       "numbering starts at 1" while the line under it still wanted the old answer. */\n'
  u'    ok(got.length === 1 && got[0].name === "Lysosome 1",\n'
  u'       "it is submitted, with the number it can justify", got[0] && got[0].name);'),
])


edit("tracingidcheck.js", [

 (u"the header says which way it used to point",
  u"   So: ids are asserted against the shared index, not just against each other. A new structure's id\n"
  u"   must be one that nothing else owns.\n",
  u"   So: ids are asserted against the shared index, not just against each other. A new structure's id\n"
  u"   must be one that nothing else owns.\n"
  u"\n"
  u"   ── AND THE BASE IS NOW ALWAYS MINTED, NOT THE PAD'S OWN ID ──────────────  2026-10-03\n"
  u"\n"
  u"   Two assertions here said the siblings hang off the pad's own id — X, X__i1, X__i2 — which was\n"
  u"   the rule until 2026-09-27 and is no longer one. TRACING_BASE_ID is freshly minted every time,\n"
  u"   and the reason is this check's own hazard arriving from inside the page rather than from\n"
  u"   Drive: open a WHOLE CELL from the dataset and TRACING_PENDING.id is that cell's EXISTING id,\n"
  u"   so a second structure drawn beside it would be filed as `<that cell's id>__i1` — a real and\n"
  u"   different structure's name.\n"
  u"\n"
  u"   WHAT IT COSTS, stated because it is a real loss: structures drawn in one sitting no longer\n"
  u"   share a filename stem, and Søren reads those filenames. What it buys is the thing this file\n"
  u"   exists for. A minted base is only ever used for inst >= 1, editOf() has already answered for\n"
  u"   the ones opened from the dataset, and a fresh id can belong to nothing.\n"
  u"\n"
  u"   This file was missed when reopenedtracingcheck.js and idcollisioncheck.js were re-pointed at\n"
  u"   the new rule on the 27th, and it sat red for six days.\n"),

 (u"the siblings hang off the minted base, which is nobody's id",
  u'    ok(got[1] === got[0] + "__i1" && got[2] === got[0] + "__i2",\n'
  u'       "...and the others are __i1 and __i2 off it, exactly as before", got.join("  "));\n'
  u'    ok(r.base === got[0], "the base IS the pad\'s id when nothing was opened", r.base);',
  u'    ok(got[1] === r.base + "__i1" && got[2] === r.base + "__i2",\n'
  u'       "...and the others are __i1 and __i2 off the BASE, which is where they hang from now",\n'
  u'       got.join("  "));\n'
  u'    /* The property that replaced "the base is the pad\'s id": it is a fresh one, so the thing\n'
  u"       a sibling is named after cannot be a structure that already exists. Asserted as the\n"
  u'       SHAPE of a minted id and as being nobody else\'s, not as a literal, because it carries a\n'
  u"       timestamp. */\n"
  u'    ok(r.base && r.base !== got[0] && /_\\d{10,}_/.test(r.base),\n'
  u'       "the base is minted fresh rather than borrowed from the pad", r.base);\n'
  u'    ok(!got.slice(1).some(id => id === r.base),\n'
  u'       "...and the base itself is submitted as nothing — it is a stem, not a structure",\n'
  u'       got.join("  "));'),

 (u"...and the line after it stops calling got[0] the base",
  u'    ok(!/__i/.test(String(got[0])), "and the base itself carries no suffix", got[0]);',
  u'    ok(!/__i/.test(String(got[0])) && !/__i/.test(String(r.base)),\n'
  u'       "and neither the first structure nor the base carries a suffix",\n'
  u'       got[0] + " / " + r.base);'),
])
print("\nNow: node tracingnumbercheck.js && node tracingidcheck.js")
