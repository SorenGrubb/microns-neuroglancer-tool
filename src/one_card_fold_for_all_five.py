# -*- coding: utf-8 -*-
u"""One card fold, in one place, and λJump and βJump finally get it.            2026-09-20

Søren: *"We should also be able to collapse the cell history and the cell identity cards, but by
default they should be expanded."* Asked which part of the identity card, he chose **everything
below the name**.

That shipped to µJump, and was ported to δJump and πJump with the Jump card. λJump and βJump never
got it -- `cellfoldcheck.js` dies on both with `cellCardFold is not defined`, which is how it was
noticed.

WHY THIS IS NOT JUST A FOURTH AND FIFTH COPY. There are already three, and they have ALREADY
DRIFTED: µJump's is 2545 bytes and δ/π's are 1407, differing only in comments -- the thirteen lines
recording what `preventDefault` costs on a link, which is the single hardest-won thing anybody
knows about this function, present in one copy of three. Adding two more copies of a function whose
signature this pass also has to change is the drift `core/panel.js` exists to stop.

So it moves. All six tools load `core/panel.js` as of this morning, so one declaration reaches all
of them; the three page-local copies are deleted, and because a page's own script runs AFTER the
core tags, deleting them is what lets the shared one take over rather than being overwritten by it.

THE CSS STAYS PER PAGE, as it must: every page carries its own stylesheet, and `.cellfold` is six
rules of triangle. µ/δ/π already have them; λ/β get them here. This is the same pairing
`chistfoldcheck.js` was written to guard -- a fold that ships in core/ with its styling left behind
looks like a bug on arrival.

THE ONE REAL DIFFERENCE BETWEEN THE DATASETS, and the reason the signature changes. The split is
"everything up to and including the headline goes in the summary", so the cell you are looking at
stays on screen when it is shut. On µJump the badge is a sibling BEFORE `.celltype`, so it lands in
the summary for free. On λJump and βJump the order is reversed: the name comes first and the layer
tag, the detector-pass tags and `#ctTag` -- which is where a community identification is written --
all come after it. Folding at `.celltype` there would collapse a card down to "Nucleus 521491" and
hide the only part that says anything about it.

So `cellCardFold(panel, lastInHeadSel)` takes an optional second argument naming the last direct
child to keep in the summary. Omitted, it behaves exactly as it does today on all three pages that
call it that way. λ/β pass `.cardtags`, a class this generator puts on the row that was an
anonymous `<div style="margin-top:6px">`.

Run: python3 src/one_card_fold_for_all_five.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(rel):
    return io.open(os.path.join(HERE, rel), encoding="utf-8").read()


def write(rel, s):
    io.open(os.path.join(HERE, rel), "w", encoding="utf-8").write(s)


def edit(rel, pairs):
    s = read(rel)
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        write(rel, s)


# ══════════════════════════════════════════════════════════════════════════════════════════════
# 1. core/panel.js -- the one copy
# ══════════════════════════════════════════════════════════════════════════════════════════════
# Placed beside renderCellHistory, the other thing on this card that folds, rather than at the end
# of the file: the two were asked for in one sentence and are read together.

FOLD_ANCHOR = u'''function renderCellHistory(items,nucleusId,rootId,coord){'''

FOLD_FN = u'''/* ── EVERYTHING BELOW THE NAME FOLDS ────────────────────────  2026-09-20
   Søren: *"We should also be able to collapse the cell history and the cell identity cards, but by
   default they should be expanded."* Asked which part of the identity card, he chose everything
   below the name.

   MOVED HERE FROM ujump.html/djump.html/pjump.html on 2026-09-20, because three copies had already
   become two different things -- identical code, and the thirteen lines below about preventDefault
   present in one of them. λJump and βJump were about to make it five.

   DONE TO THE DOM, NOT TO THE MARKUP. This card is assembled as a string across up to three render
   branches -- verified, community-reported, merged-nucleus split -- and opening a <details> in one
   place and closing it in another, three times over, is three chances to ship a page with an
   unclosed tag. Wrapping the finished panel needs one function and no branch has to know.

   THE SPLIT IS THE HEADLINE. Everything up to and including `.celltype` (the badge, the name, the
   ↗ and the star) becomes the summary; everything after it becomes the body. So the cell you are
   looking at is on screen either way, which is the only reason to fold from the top rather than
   hide the lot.

   lastInHeadSel (optional) names a LATER direct child to end the summary at instead. µJump, δJump
   and πJump put the badge BEFORE the name, so it rides along for free and they pass nothing.
   λJump and βJump put the layer tag, the detector-pass tags and #ctTag -- where a community
   identification gets written -- AFTER it, and folding at `.celltype` there collapses the card to
   "Nucleus 521491" and hides the only part that says anything about the cell.

   A LINK IN A SUMMARY IS A TRAP: a click on the ↗, the star or a copyable id would both do its own
   job AND toggle the fold. The summary swallows the toggle for anything clickable inside it, so
   only bare space folds the card. */
function cellCardFold(panel, lastInHeadSel){
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
  /* The later of the two, never the earlier: a page that names a tail which turns out to sit
     ABOVE the headline would otherwise push the name itself into the body, and a fold whose
     summary does not say which cell it is is the one thing this must not do. */
  const tail = lastInHeadSel ? panel.querySelector(":scope > " + lastInHeadSel) : null;
  const at = Math.max(kids.indexOf(head), tail ? kids.indexOf(tail) : -1);
  kids.slice(0, at + 1).forEach(function(n){ top.appendChild(n); });
  kids.slice(at + 1).forEach(function(n){ body.appendChild(n); });
  sum.appendChild(top);
  det.appendChild(sum);
  det.appendChild(body);
  panel.appendChild(det);
  /* ── WHAT preventDefault COSTS ON A LINK ──────────────────────  2026-09-20
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
'''

edit("core/panel.js", [
    (u"the card fold, one copy, with a joint for a card built the other way round",
     FOLD_ANCHOR, FOLD_FN + FOLD_ANCHOR),
])

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 2. the three page-local copies go
# ══════════════════════════════════════════════════════════════════════════════════════════════
# By both endpoints, asserted against their exact text. The call sites are untouched: a page's own
# script runs after the core tags, so deleting the declaration is precisely what lets the shared
# one answer those calls -- leaving it in place would have it override the shared one instead.

CUT_START = u'/* ── EVERYTHING BELOW THE NAME FOLDS'
CUT_FN = u'function cellCardFold(panel){'
GONE = (u'/* cellCardFold moved to core/panel.js on 2026-09-20 — three copies had already drifted '
        u'in\n   their comments, and λJump and βJump were about to make it five. See the header '
        u'there. */\n')

for pg in ["ujump.html", "djump.html", "pjump.html"]:
    s = read(pg)
    if u"cellCardFold moved to core/panel.js" in s:
        print("  already there: " + pg + " calls the shared one")
        continue
    assert s.count(CUT_START) == 1, "%s: the comment is not unique" % pg
    assert s.count(CUT_FN) == 1, "%s: the function is not unique" % pg
    a = s.find(CUT_START)
    b = s.find(CUT_FN, a)
    assert b > a, "%s: the function does not follow its own comment" % pg
    end = s.find(u"\n}\n", b)
    assert end > 0, "%s: cellCardFold never closes at column 0" % pg
    end += len(u"\n}\n")
    cut = s[a:end]
    # It has to be that function and nothing else. AT COLUMN 0, not anywhere: the prose in this
    # very comment block contains "one function and no branch has to know", and a substring test
    # for "function " fails on the text explaining the code it is testing -- which is the trap
    # this file's own header warns about, met on the first run.
    assert cut.count(CUT_FN) == 1 and (u"\nfunction " not in cut.replace(u"\n" + CUT_FN, "", 1)), \
        "%s: the cut has swallowed another function" % pg
    s = s[:a] + GONE + s[end:]
    # And the calls must survive, or the fold silently stops happening. Three: the fourth match
    # before the cut was the declaration itself, which is the thing being removed.
    assert s.count(u"cellCardFold(panel)") == 3, \
        "%s: %d call sites left, expected 3" % (pg, s.count(u"cellCardFold(panel)"))
    write(pg, s)
    print("  ok: " + pg + " drops its copy (%d lines) and calls the shared one" % cut.count(u"\n"))

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 3. λJump and βJump: the styling, the tail marker, and the call
# ══════════════════════════════════════════════════════════════════════════════════════════════

CSS_ANCHOR = u'''.chist-row{border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin-bottom:8px}'''
CSS_RULES = u'''/* ── THE IDENTITY CARD FOLDS BELOW ITS NAME ─────────────────  2026-09-20
   The fold itself is core/panel.js's cellCardFold(); these six rules are its triangle, and they
   have to travel with it because every page carries its own stylesheet. A fold that ships in
   core/ with its styling left behind is the exact failure chistfoldcheck.js was written for.

   The triangle sits at the top rather than centred: the summary is two lines tall here, and a
   triangle beside the middle of a name reads as a bullet. */
.cellfold{margin:0}
.cellfold>summary{display:flex;align-items:flex-start;gap:8px;cursor:pointer;list-style:none}
.cellfold>summary::-webkit-details-marker{display:none}
.cellfold>summary::before{content:"\\25B6";display:inline-block;flex:none;font-size:10px;
  color:var(--mut);margin-top:9px;transition:transform .15s ease}
.cellfold[open]>summary::before{transform:rotate(90deg)}
.cellfold>summary>div{flex:1 1 auto;min-width:0}
'''

# The row that holds the layer tag, "added by the community", the detector-pass tags and #ctTag.
# It was an anonymous <div style="margin-top:6px">; it gets a class so the fold can be told to end
# the summary there, and so that "what belongs beside the name" is a thing the markup states.
TAGS_OLD = u'''h+='<div style="margin-top:6px">'
    +'<span class="tag '''
TAGS_NEW = u'''/* .cardtags: the row core/panel.js's cellCardFold() is told to keep in the summary. On µJump
     the badge sits BEFORE the name and rides along for free; here it comes after, and a card
     folded at the name alone would read "Nucleus 521491" and hide its layer, its detector pass
     and #ctTag -- which is where a community identification gets written. */
  h+='<div class="cardtags" style="margin-top:6px">'
    +'<span class="tag '''

CALL_OLD = u'''  const panelEl=document.getElementById("panel");
  panelEl.innerHTML=h;'''
CALL_NEW = u'''  const panelEl=document.getElementById("panel");
  panelEl.innerHTML=h;
  /* ── THE CARD FOLDS, AND REMEMBERS ─────────────────────────  2026-09-20
     The .card div, not #panel: this page wraps its whole cell card in one, so the headline is not
     a direct child of the panel and the fold would find nothing to fold under. Told to keep
     .cardtags in the summary too, since the badges come after the name here rather than before it.

     Before the wiring below rather than after, on purpose: every querySelectorAll here is rooted
     at panelEl and the nodes stay inside it either way, but folding last would mean two orders to
     keep in step for no gain. */
  try{ cellCardFold(panelEl.querySelector(".card"), ".cardtags"); }catch(_e){}'''

for pg in ["ljump.html", "bjump.html"]:
    print(pg)
    edit(pg, [
        (u"the triangle the shared fold draws with", CSS_ANCHOR, CSS_RULES + CSS_ANCHOR),
        (u"...the badges are named as part of the headline", TAGS_OLD, TAGS_NEW),
        (u"...and the card folds", CALL_OLD, CALL_NEW),
    ])

print(u"\nnow: for p in ujump djump pjump ljump bjump; do node cellfoldcheck.js $p.html; done"
      u"\n     && python3 src/build_stamps.py && node stampcheck.js")
