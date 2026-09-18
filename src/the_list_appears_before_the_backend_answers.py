# -*- coding: utf-8 -*-
"""The list appears before the backend answers.                                 2026-09-18

Søren: *"Sometimes it takes minutes to load the cell list. Why? Can we fix it?"* — with a screenshot
of "Or browse a random cell" open and the cell-type picker completely empty.

MEASURED, NOT INFERRED. Loading the page with script.google.com held open (not refused — held, which
is the state a slow Apps Script backend actually puts a browser in) and then reading the control:

    with the backend hanging, the type list has 0 options

WHY. populateRandomTypeSelect() builds its pools from three sources and only paints at the end:

    1. IDX_BY_TYPE / OWN_POS_BY_TYPE   in the page already, no network, instant
    2. getCommunityConsensus()         await — a whole-sheet ?allIds=1 read
    3. fetchIdentifiedMergedSubs()     await — a second whole-sheet read

Source 1 is the entire MICrONS prediction set and every own-verified cell: 33 of the ~35 entries the
list ever shows, and every one a person is likely to want. It is ready before the page has finished
laying out. But the single `randomTypeSelect.innerHTML = opts` sits after both awaits, so the
control shows NOTHING until two whole-sheet reads of a live spreadsheet have come back. As the sheet
has grown, that has gone from imperceptible to minutes — and an empty <select> with no message reads
as a broken page, not a loading one.

THE FIX IS TO PAINT TWICE, not to fetch less. The community data genuinely belongs in this list: it
moves cells between pools and adds types MICrONS never predicted, and the counts would be wrong
without it. So the render is lifted into a function and called at both points it has something true
to say — once with what the page already knows, once with the corrections. Nobody waits for the
second one to start browsing, and nobody is shown a stale count for longer than it takes to arrive.

This is the same shape as the fix two hours earlier for the picker forgetting the chosen type, and
it depends on it: a second paint that discarded the selection would be a new bug of its own. That is
why `const wasType = randomTypeSelect.value` one statement before the assignment had to come first —
it is what makes repainting safe at all.

STRUCTURAL, NOT TEXTUAL. The render tail is twenty-odd lines that already differ in wording between
the three pages' histories, so this locates it by its two ends and wraps it, rather than quoting it.
Idempotent on the name it introduces.

Applied to µJump, δJump and πJump, which have the same function and the same two awaits.

Run: python3 src/the_list_appears_before_the_backend_answers.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ANCHOR = "  var RECLASS_OUT={};\n  try{"
TAIL_START = "  for(const k in RP){const p=RP[k];(groups[p.cat]=groups[p.cat]||[]).push(p);}"
TAIL_END = "  window.RAND_POOLS=RP;\n}"

HEAD = '''  var RECLASS_OUT={};
  /* ── THE LIST APPEARS BEFORE THE BACKEND ANSWERS ────────────────────────────────  2026-09-18
     Søren: "Sometimes it takes minutes to load the cell list." Measured with the backend held open
     rather than refused -- which is what a slow Apps Script does to a browser -- the control had
     ZERO options for as long as it was held.

     Everything below this point that matters to a person browsing is already in the page: the
     MICrONS predictions and the own-verified cells, which are all but a couple of the entries this
     list ever shows. What follows are two awaits on whole-sheet reads, and the single innerHTML
     assignment used to sit after both of them -- so an empty <select>, which reads as broken rather
     than as loading, was the first thing a visitor met.

     So the render is a function now, and it is called at both moments it has something true to say:
     here, with what the page knows on its own, and again below with the community's corrections
     folded in. The corrections are not optional -- they move cells between pools and add types
     MICrONS never predicted -- they are just not worth an empty control to wait for.

     THIS ONLY WORKS BECAUSE THE PICKER KEEPS ITS SELECTION (see the `wasType` read one statement
     before the assignment, added this morning). Repainting a <select> discards its options; without
     that read, the second paint would silently move somebody off the type they had just chosen --
     which is the exact bug that was fixed hours ago, re-introduced by the fix for this one. */
  const paintTypeSelect=function(){
    /* Rebuilt from scratch each time: `groups` accumulates, and a second paint over the top of the
       first one's groups would list every pool twice. */
    for(const gk in groups)delete groups[gk];
'''

FOOT = '''  };
  paintTypeSelect();
  try{'''


def wrap(s, why):
    if "paintTypeSelect" in s:
        print("  already there: " + why)
        return s, False
    assert s.count(ANCHOR) == 1, "anchor not unique (%d)" % s.count(ANCHOR)
    assert s.count(TAIL_START) == 1, "tail start not unique (%d)" % s.count(TAIL_START)
    assert s.count(TAIL_END) == 1, "tail end not unique (%d)" % s.count(TAIL_END)
    i = s.find(TAIL_START)
    j = s.find(TAIL_END) + len("  window.RAND_POOLS=RP;")
    assert j > i, "the tail ends before it starts"
    tail = s[i:j]
    # Out of the body, into the function, and a second call where it used to stand.
    s = s[:i] + "  paintTypeSelect();" + s[j:]
    s = s.replace(ANCHOR, HEAD + tail + "\n" + FOOT, 1)
    print("  ok: " + why)
    return s, True


# The selection-keeping comment written this morning explains itself in terms of "this function
# awaits two whole-sheet reads before it gets this far". That was true of the function; it is not
# true of the FIRST of the two paints, which now runs before either await. The reason the read has
# to sit one statement before the assignment is unchanged and is if anything stronger -- there are
# two paints now, and the second one lands whenever the sheet answers -- so only the sentence that
# names the timing needs correcting.
OLD_WHY = """     assignment, rather than at the top of this function or in a caller: this function awaits two
     whole-sheet backend reads before it gets this far, and the person can have chosen a type while
     those were in flight. That gap is also why the bug only surfaced now -- the two fire-and-forget
     calls at page load resolve seconds late on a cold cache, long after the control is reachable,
     which makes the reset look like the "Random example" click did it."""

NEW_WHY = """     assignment, rather than at the top of the enclosing function or in a caller: this paint runs
     TWICE per call -- once from what the page knows, once when two whole-sheet reads come back --
     and the person can have chosen a type in between. That gap is also why the bug only surfaced
     when it did: the second paint lands seconds late on a cold cache, long after the control is
     reachable, which makes the reset look like the "Random example" click did it."""


for page in ("ujump.html", "djump.html", "pjump.html"):
    p = os.path.join(HERE, page)
    s = io.open(p, encoding="utf-8").read()
    print(page)
    s, did = wrap(s, "the picker is filled from what the page knows, then refilled from the sheet")
    if NEW_WHY in s:
        print("  already there: the selection comment names the right timing")
    elif OLD_WHY in s:
        s = s.replace(OLD_WHY, NEW_WHY, 1)
        did = True
        print("  ok: the selection comment names the right timing")
    if did:
        io.open(p, "w", encoding="utf-8").write(s)
print("\nnow: node listspeedcheck.js && python3 src/build_stamps.py")
