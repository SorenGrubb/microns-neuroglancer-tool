# -*- coding: utf-8 -*-
u"""The bulk paste folds inside the form.                                        2026-09-20

Søren: *"The bulk organelle annotation should be moved into the log an organelle and be collapsed by
default there."*

IT IS ALREADY INSIDE IT -- and that is the whole problem. Open "Log an organelle here" and the first
thing under the blurb is a dashed box holding a sixty-one-item dropdown, a link field and a button,
before you reach the rows you came to fill in. It reads as the main path because it is at the top
and it is the biggest thing there. It is not the main path: it is the shortcut for the day you have
twelve mitochondria to log.

SO IT KEEPS ITS PLACE AND LOSES ITS SIZE. One summary line, shut, directly under the blurb, where
somebody who wants it will find it on the way past and somebody who does not will not have to step
over it. Everything inside is unchanged -- same ids, same wiring, same kind picker -- because the
feature is right and only its loudness was wrong.

CLOSED IS THE DEFAULT, NOT THE MEMORY. Unlike the cell history and the identity card, which
remember what he did with them, this one opens shut every time: it is a tool you reach for
occasionally, and a form that quietly grows a dropdown again three cells later is a form that
surprises you.

Run: python3 src/the_bulk_paste_folds_inside_the_form.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    (u'''function organellePasteHtml(){
  return '<div class="organ-paste-box" style="border:1px dashed var(--line);border-radius:8px;'
    +'padding:10px;margin:0 0 10px">'
    +'<div class="hint" style="margin:0">Or point at them instead: Ctrl+click each structure in the '
    +'viewer, then paste that link here &mdash; every marker becomes a row of the kind you pick.</div>'
    +'<div style="margin-top:8px"><label for="organPasteKind">What are these?</label>''',
     u'''/* ── FOLDED, AND SHUT TO BEGIN WITH ─────────────────────────────  2026-09-20
   Søren: *"The bulk organelle annotation should be moved into the log an organelle and be collapsed
   by default there."*

   It was already inside the form -- that was the problem. A dashed box with a 61-item dropdown, a
   link field and a button, sitting above the rows you came to fill in, reads as the main path
   because it is the biggest thing on screen. It is the shortcut for the day you have twelve
   mitochondria, not the way in.

   So it keeps its place and loses its size: one summary line, shut. Nothing inside changes -- same
   ids, same wiring, same kind picker -- because the feature was right and only its loudness was
   wrong.

   SHUT EVERY TIME, deliberately, where the cell history and the identity card remember what he did
   with them. This is a tool you reach for occasionally, and a form that has quietly grown a
   dropdown again three cells later is a form that surprises you. */
function organellePasteHtml(){
  return '<details class="organ-paste-box rv-panel" style="border:1px dashed var(--line);'
    +'border-radius:8px;padding:10px;margin:0 0 10px">'
    +'<summary style="margin:0">Or point at them in the viewer &mdash; paste a link, get a row per '
    +'marker</summary>'
    +'<div class="hint" style="margin:8px 0 0">Ctrl+click each structure in the '
    +'viewer, then paste that link here &mdash; every marker becomes a row of the kind you pick.</div>'
    +'<div style="margin-top:8px"><label for="organPasteKind">What are these?</label>''',
     "the bulk paste is a fold"),

    (u'''    +'</div><div class="hint" id="organPasteNote" style="margin:6px 0 0"></div></div>';
}''',
     u'''    +'</div><div class="hint" id="organPasteNote" style="margin:6px 0 0"></div></details>';
}''',
     "...and it closes as one"),
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


edit("core/panel.js", PAIRS)
print("\nnow: node organcardcheck.js && node bulkorgancheck.js && node cellfoldcheck.js "
      "&& python3 src/build_stamps.py")
