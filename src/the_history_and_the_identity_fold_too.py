# -*- coding: utf-8 -*-
u"""The history and the identity fold too.                                       2026-09-20

Søren: *"We should also be able to collapse the cell history and the cell identity cards, but by
default they should be expanded."* Asked which part of the identity card should fold, he chose
**everything below the name**.

CELL HISTORY IS THE EASY HALF. Six organelle reports is six cards of four lines each, and each one
quotes back a sentence this project generated -- useful once, and 700 px of it under a cell you are
reading for something else. It becomes the same `<details class="rv-panel">` the sections around it
already are, with `Cell history (6)` as the summary, so it reads as the heading it was rather than
as a new kind of thing.

THE IDENTITY CARD IS WRAPPED, NOT REWRITTEN. Its markup is assembled as a string across three render
branches (verified, community-reported, merged-nucleus split), and editing all three to open a
`<details>` in one place and close it in another is three chances to leave a page with an unclosed
tag. So it is done to the DOM, once, after the panel is filled: the badge and the headline become
the summary, everything after the headline becomes the body. One function, one call site per branch,
and no branch has to know it is happening.

A LINK IN A SUMMARY IS A TRAP, AND THE OBVIOUS FIX IS A WORSE ONE. The headline carries the ↗ to
Neuroglancer, the favourite star and the copyable ids. The first version cancelled the fold from the
summary with preventDefault, and Søren came back within the hour: *"Now the cell link does not
work."* Of course not -- preventDefault cancels the whole default action for that click, and
following a link IS the default action.

Measured in a browser rather than reasoned about, because three plausible answers disagreed. An
ANCHOR consumes the click by itself: Chrome walks default handlers up the path and stops at the
first that takes it, so a link inside a summary navigates and does not fold, with nothing needed
from us. Everything else in there -- the star, a copyable id, a button -- has listeners and no
default action worth keeping, so cancelling costs nothing. Anchors and form controls are left
strictly alone; the rest are cancelled; bare space still folds the card.

OPEN BY DEFAULT, AND THEN IT REMEMBERS. Both start expanded, as he asked, and each keeps the state
he last put it in while he moves from cell to cell -- the same `window.__organOpen` pattern the
Organelles section has used since 2026-09-18. Collapsing a card on one cell and having it spring
open on the next is the kind of thing that makes a person stop bothering.

Run: python3 src/the_history_and_the_identity_fold_too.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HISTORY = [
    (u'''  el.innerHTML='<div class="chist-panel"><h4>Cell history ('+items.length+')</h4>'+rows+'</div>';''',
     u'''  /* ── FOLDABLE, AND OPEN TO BEGIN WITH ────────────────────────────  2026-09-20
     Søren: *"We should also be able to collapse the cell history and the cell identity cards, but
     by default they should be expanded."* Six organelle reports is six cards of four lines, each
     quoting back a sentence this project wrote -- worth reading once and worth getting out of the
     way afterwards.

     .rv-panel supplies the rotating triangle and the summary typography the sections around it
     use, and the <h4> stays inside the summary so the heading still looks like the heading. The
     choice is remembered across cells: collapsing this on one cell and finding it open on the next
     is how a person learns not to bother. */
  el.innerHTML='<details class="chist-panel rv-panel"'+(window.__histOpen===false?"":" open")
    +'><summary><h4 style="margin:0">Cell history ('+items.length+')</h4></summary>'
    +'<div style="margin-top:8px">'+rows+'</div></details>';
  var _det=el.querySelector("details");
  if(_det)_det.addEventListener("toggle",function(){ window.__histOpen=_det.open; });''',
     "the cell history folds, and starts open"),
]

CSS = [
    (u'''.chist-panel{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.chist-panel h4{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:0 0 8px}''',
     u'''.chist-panel{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.chist-panel h4{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:0 0 8px}
/* The history is a <details> since 2026-09-20 and its <h4> lives in the <summary>, where the
   margin below it would push the triangle off the text's baseline. */
.chist-panel>summary>h4{margin:0}
/* ── THE IDENTITY CARD FOLDS BELOW ITS NAME ───────────────────────  2026-09-20
   Søren: *"We should also be able to collapse the cell history and the cell identity cards, but by
   default they should be expanded."* The summary holds the badge and the cell's name, so the thing
   you are looking at stays on screen whether it is open or shut. The triangle goes at the top
   rather than centred, because the summary is two lines tall and a triangle beside the middle of a
   name reads as a bullet. */
.cellfold{margin:0}
.cellfold>summary{display:flex;align-items:flex-start;gap:8px;cursor:pointer;list-style:none}
.cellfold>summary::-webkit-details-marker{display:none}
.cellfold>summary::before{content:"\\25B6";display:inline-block;flex:none;font-size:10px;
  color:var(--mut);margin-top:9px;transition:transform .15s ease}
.cellfold[open]>summary::before{transform:rotate(90deg)}
.cellfold>summary>div{flex:1 1 auto;min-width:0}''',
     "...and the identity card has somewhere to put its triangle"),
]

FOLD = [
    (u'''function tracingPos(){''',
     u'''/* ── EVERYTHING BELOW THE NAME FOLDS ──────────────────────────  2026-09-20
   Søren: *"We should also be able to collapse the cell history and the cell identity cards, but by
   default they should be expanded."* Asked which part of the identity card, he chose everything
   below the name.

   DONE TO THE DOM, NOT TO THE MARKUP. This card is assembled as a string across three render
   branches -- verified, community-reported, merged-nucleus split -- and opening a <details> in one
   place and closing it in another, three times over, is three chances to ship a page with an
   unclosed tag. Wrapping the finished panel needs one function and no branch has to know.

   THE SPLIT IS THE HEADLINE. Everything up to and including `.celltype` (the badge, the name, the
   ↗ and the star) becomes the summary; everything after it becomes the body. So the cell you are
   looking at is on screen either way, which is the only reason to fold from the top rather than
   hide the lot.

   A LINK IN A SUMMARY IS A TRAP: a click on the ↗, the star or a copyable id would both do its own
   job AND toggle the fold. The summary swallows the toggle for anything clickable inside it, so
   only bare space folds the card. */
function cellCardFold(panel){
  if (!panel || panel.querySelector(":scope > details.cellfold")) return;
  const head = panel.querySelector(":scope > .celltype");
  if (!head) return;                          // a branch with no headline: nothing to fold under
  const det = document.createElement("details");
  det.className = "cellfold";
  det.open = (window.__cellCardOpen !== false);
  const sum = document.createElement("summary");
  const top = document.createElement("div");
  const body = document.createElement("div");
  /* Everything before the headline, then the headline, into the summary; the rest into the body.
     Read into arrays first -- moving a node out of a live childNodes list while walking it skips
     the one after it, which is how the first version left the star behind. */
  const kids = [].slice.call(panel.childNodes);
  const at = kids.indexOf(head);
  kids.slice(0, at + 1).forEach(function(n){ top.appendChild(n); });
  kids.slice(at + 1).forEach(function(n){ body.appendChild(n); });
  sum.appendChild(top);
  det.appendChild(sum);
  det.appendChild(body);
  panel.appendChild(det);
  /* ── WHAT preventDefault COSTS ON A LINK ───────────────────────  2026-09-20
     Søren, an hour after the first version shipped: *"Now the cell link does not work."* It did not:
     cancelling the fold from here cancels the whole default action for that click, and following a
     link IS the default action. The ↗ stopped opening Neuroglancer.

     MEASURED RATHER THAN REASONED ABOUT, because three plausible answers disagree and only a
     browser settles it. An ANCHOR already consumes the click: Chrome walks default handlers up the
     path and stops at the first that takes it, so a link inside a summary navigates and does not
     fold, with nothing needed from us. Everything else -- the star, a copyable id, a button -- has
     only listeners and no default action worth keeping, so cancelling is free for them.

     So anchors and form controls are left strictly alone, and the rest are cancelled. Bare space
     still folds the card, which is the affordance. */
  sum.addEventListener("click", function(ev){
    const t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest("a,input,select,textarea,label")) return;   // it navigates or types; leave it
    if (t.closest("button,[data-c],.idval,.star,.fav"))
      ev.preventDefault();                    // it has its own job, and folding is not it
  });
  det.addEventListener("toggle", function(){ window.__cellCardOpen = det.open; });
}
function tracingPos(){''',
     "the identity card can be folded below its name"),

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


def call_after_each(rel, anchor, call, marker):
    """The three `panel.innerHTML=h` branches, each followed by the wrap."""
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    if marker in s:
        assert s.count(marker) == 3, ("the wrap is on %d of 3 branches" % s.count(marker))
        print("  already there: every render branch folds its card")
        return
    n = s.count(anchor)
    assert n == 3, "expected 3 render branches, found %d" % n
    s = s.replace(anchor, anchor + call, 3)
    io.open(p, "w", encoding="utf-8").write(s)
    print("  ok: all 3 render branches fold their card")


edit("core/panel.js", HISTORY)
edit("ujump.html", CSS + FOLD)
call_after_each("ujump.html", u"  panel.innerHTML=h;",
                u"\n  try{ cellCardFold(panel); }catch(_e){}", u"try{ cellCardFold(panel); }")
print("\nnow: node cellfoldcheck.js && node ccpanelcheck.js && node organjumpcheck.js "
      "&& python3 src/build_stamps.py")
