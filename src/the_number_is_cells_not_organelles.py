"""The number beside an organelle is CELLS, not organelles.                          2026-09-09

Søren: *"I don't get why Nucleoplasmic reticulum says 1, when there are hundreds of them?"* and then
*"there are many astrocytes that have these NR type II, why does it only say 1? Did you put all of
them into 1 cell?"*

Measured on the live backend before touching anything (µJump, 2026-09-09):

    ?allOrganelles=1  ->  222 rows total
                          centriole                   171
                          cilium                       50
                          nucleoplasmic_reticulum_2     1   <- nucleus 349448, one vector pair
                          nucleoplasmic_reticulum_1     0

So nothing was folded into one cell. ONE nucleoplasmic-reticulum-II has ever been reported, by
anyone, in the whole table. The panel is right; the panel is just not saying what it is counting.

Two sentences on that panel are wrong enough to have caused the question:

1. The bare number after a label reads as "how many of these exist". It is how many CELLS carry at
   least one, over the cells somebody has actually examined -- `ujumpOrganelleCounts` dedupes per
   cell on purpose, so a cell with twenty NR-II counts once.

2. The summary line says "N organelle annotations reported here so far", and N is the sum of the
   per-kind numbers. On µJump that is 16,858 -- 12,420 centriole + 4,437 cilium + 1 -- but those
   two come from Søren's own dense verified arrays, not from anybody's report. 222 things were
   reported. Calling 16,858 of them "annotations reported" is a second way to read the panel as a
   census of organelles.

Both become one sentence that says the unit out loud, plus a tooltip on the number itself.

Run: python3 src/the_number_is_cells_not_organelles.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FILTER = [
    # ── the number itself says what it counts ────────────────────────────────────────────────────
    ('''          + (showCounts ? ' <span class="nsub" style="color:var(--mut)">' + fmt(n) + '</span>' : '')''',
     '''          + (showCounts ? ' <span class="nsub" style="color:var(--mut)" title="'
              + fmt(n) + ' cell' + (n === 1 ? '' : 's') + ' carry at least one. This counts CELLS, '
              + 'not organelles \\u2014 a cell with twenty of them counts once, and a cell nobody has '
              + 'examined yet counts zero.">' + fmt(n) + '</span>' : '')''',
     "the count carries its own unit"),

    # ── and the line under the list stops calling dense data a report ────────────────────────────
    ('''        + (total ? fmt(total) + ' organelle annotation' + (total === 1 ? '' : 's') + ' reported here so far.'
                 : 'Nobody has annotated an organelle in this dataset yet — every count is zero, so a '
                   + '&ldquo;has&rdquo; filter will return nothing.')''',
     '''        + (total ? 'Each number is how many CELLS carry that structure \\u2014 not how many of the '
                   + 'structure there are. A cell with twenty counts once; a cell nobody has examined '
                   + 'yet counts zero.'
                 : 'Nobody has annotated an organelle in this dataset yet — every count is zero, so a '
                   + '&ldquo;has&rdquo; filter will return nothing.')''',
     "the summary says the unit, not a false report total"),
]

HEADER = [
    ('''     UJ.organelleFilter.countsFrom(n, kindsOf) -> {kind: count}''',
     '''     UJ.organelleFilter.countsFrom(n, kindsOf) -> {kind: count}

   WHAT THE NUMBER IS, because it has been misread once (Søren, 2026-09-09: "I don't get why
   Nucleoplasmic reticulum says 1, when there are hundreds of them?"): it is CELLS CARRYING THE
   STRUCTURE, over the cells somebody has examined -- never a count of organelles. Every caller
   dedupes per cell, because the number beside a checkbox has to be the number of cells that
   checkbox can return, or it is lying about the filter it sits on. The panel now says so on screen
   and in the tooltip; it was right all along and simply silent about its unit.''',
     "the header says it too"),
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


edit("core/organellefilter.js", HEADER + FILTER)
print("\nnow: node -e \"require('./core/organellefilter.js')\" is not a thing; open a page instead")
