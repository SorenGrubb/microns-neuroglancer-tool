# -*- coding: utf-8 -*-
"""The page was not hanging, it was writing an attribute to itself.            2026-09-17

Søren, twice in a row on µJump nucleus 264317: *"Now it is hanging at 97%"*, then, after the
progress work, *"Now it is hanging at 100%"* — button frozen on `measuring 2.5M triangles… 100%`.

THE SECOND REPORT IS WHAT GAVE IT AWAY. 100% is the LAST thing computeVolume emits; there is
nothing after it but a `return`. A stall there cannot be slow work, because there is no work left.
And two different frozen percentages from the same click sequence is not two bugs — it is one
freeze, photographed at whichever frame happened to be on screen when it hit.

REPRODUCED, on the real page, driven headlessly: click Compute volume with a stubbed computeVolume
that resolves normally, and the page stops answering entirely — the next evaluate never returns.
Not the button. The whole tab.

THE LOOP

`decorateMeshVolButtons()` is called by a MutationObserver watching #cellPanelCard with
`attributeFilter:["disabled","data-vol-fresh"]`. Inside it, for a volume that was computed but not
saved (which is EVERY compute made while signed out — see maybeSaveComputedVolume):

    if(stale||known.unsaved)btn.dataset.volFresh="";

Unconditional. Setting an attribute to the value it already has still produces a mutation record,
that record is on a `.meshvol` and names `data-vol-fresh`, so the observer fires, so decorate runs,
so it writes again. MutationObserver callbacks are delivered as microtasks, so the microtask queue
never drains: no timers, no repaint, no events. The last painted frame stays on screen forever —
whatever the progress callback had just put on the button.

That is why it read 97% the first time and 100% the second. The progress work was worth doing, and
it was not the fault.

THE FIX, both halves

1. Do not write what is already there. One `!==` on that line ends this particular cycle.
2. Do not treat your own writes as news. The observer now drops the records its own call generated
   (`mo.takeRecords()` immediately after decorating), so the NEXT unconditional write somebody adds
   to that function cannot freeze the page again. The bug is easy to reintroduce and impossible to
   guess from the symptom, so the guard belongs in the loop rather than in a comment.

Run: python3 src/a_frozen_page_is_two_attributes.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

PAIRS = [
    ('''    if(btn.dataset.volFresh==="1"&&!stale&&!known.unsaved)return;
    if(stale||known.unsaved)btn.dataset.volFresh="";''',
     '''    if(btn.dataset.volFresh==="1"&&!stale&&!known.unsaved)return;
    /* ── THE WRITE THAT FROZE THE PAGE ──────────────────────────────────────────  2026-09-17
       This line was unconditional. Setting an attribute to the value it already holds still
       produces a mutation record; the observer below watches data-vol-fresh on exactly these
       buttons; so it called this function, which wrote again. MutationObserver callbacks are
       microtasks, so the queue never drained: no repaint, no timers, nothing. The page stopped
       dead showing whatever the progress callback had last put on the button — 97% one time, 100%
       the next — and Søren reported both as hangs, which they were.
       An unsaved volume (every compute made while signed out) is what put it in this branch. */
    if((stale||known.unsaved)&&btn.dataset.volFresh!=="")btn.dataset.volFresh="";''',
     "the attribute is only written when it would change"),

    ('''  const mo=new MutationObserver(function(records){
    if(mutationTouchesMeshVol(records))decorateMeshVolButtons();
  });''',
     '''  const mo=new MutationObserver(function(records){
    if(!mutationTouchesMeshVol(records))return;
    decorateMeshVolButtons();
    /* ── ITS OWN WRITES ARE NOT NEWS ────────────────────────────────────────────  2026-09-17
       decorateMeshVolButtons() writes `disabled` and `data-vol-fresh` on the very buttons this
       observer watches for `disabled` and `data-vol-fresh`. As long as each of those writes
       changes something, that settles after one pass; the moment one of them writes a value that
       is already there, it is a loop of microtasks with no exit, and the whole tab freezes.
       Discarding the records this call just produced makes that structural rather than a rule
       every future edit to the function has to remember. */
    mo.takeRecords();
  });''',
     "the observer discards the records its own call made"),
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
print("\nnow: node volfreezecheck.js")
