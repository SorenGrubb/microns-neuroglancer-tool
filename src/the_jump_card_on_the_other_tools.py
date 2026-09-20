# -*- coding: utf-8 -*-
u"""The Jump card on the other tools.                                            2026-09-20

Søren: *"Now we can start making these changes we have made to uJump during the week to the other
tools… I want them to be as close as possible to uJump in appearance and function."*

δJump and πJump first: of the six they are the closest to µJump, and the survey says how close.
`.dot{...}`, the `CAT_SEQ` line, the optgroup paint, `persistDetailsOpen("randomCellPanel"…)`,
`panel.innerHTML=h` (three render branches, exactly as in µJump) and `class="celltype"` are all
byte-identical in all three files. So the category colouring and the identity-card fold port with
the same anchors µJump used.

WHAT IS NOT IDENTICAL IS THE CARD ITSELF, and it is worth saying why: both pages are at µJump's
pre-2026-09-18 state for three details it has since moved on from.

  · the "Great for learning what a cell type looks like…" sentence still sits as a paragraph under
    the row, where µJump made it the Random example button's title (Søren: *"This could be a
    mouse-over for the random button instead of taking space."*);
  · their coordinate label still describes the PIPELINE ("jump to it, identify the nearest cell &
    its neighbours") rather than why you would type there;
  · their wording differs from each other's and from µJump's in small ways.

"As close as possible" means bringing those too, so the three cards read the same afterwards.

EXTRACTED, NOT TRANSCRIBED. The browse block is six long lines that differ per page, and copying
them into this file by hand is six chances to introduce a difference while removing differences.
So the block is located by a pattern, asserted to match exactly once, and its own controls are
lifted out and reassembled in µJump's order -- each page keeps its own button text and its own
titles, and only the arrangement is made common. Everything else in this file is a literal anchor,
as usual.

Run: python3 src/the_jump_card_on_the_other_tools.py
"""
import io
import os
import re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["djump.html", "pjump.html"]

# ── the two shared halves: the palette, and the fold ──────────────────────────────────────────
DOT = u'''.dot{width:9px;height:9px;border-radius:50%;flex:none}.dot.exc{background:var(--exc)}.dot.inh{background:var(--inh)}.dot.non{background:var(--non)}.dot.none{background:var(--mut)}'''

PALETTE = u'''
/* ── A COLOUR PER CELL-TYPE CATEGORY ────────────────────────────────  2026-09-20
   Søren: *"if the different cell types could have different colors to make them easier to discern,
   then that would also be nice."* Ported from µJump unchanged.

   By CATEGORY, not by type: about forty types and nine categories, and the categories are what
   tells them apart. Two excitatory subtypes in different colours would be noise.

   DEFINED ONCE, THEMED THREE TIMES FOR FREE. These are references, not values, and var() resolves
   where it is USED -- so a light-theme --exc reaches --cat-exc without this block being repeated in
   the light and high-contrast :root blocks below. Leptomeninges is the one category with no token
   of its own; mixing two keeps it themed, where a literal hex would be right in one theme and wrong
   in the other two. */
:root{
  --cat-exc:var(--exc); --cat-inh:var(--inh); --cat-neu:var(--accent);
  --cat-glia:var(--ok); --cat-vasc:var(--warn); --cat-blood:var(--danger);
  --cat-immune:var(--non);
  --cat-lepto:color-mix(in srgb,var(--non) 55%,var(--danger));
  --cat-other:var(--mut);
}
/* The optgroup and its options are painted inline at paint time, and the CLOSED control is painted
   to match whatever is selected -- so the current category is placed at a glance without opening
   anything. Chrome and Firefox colour options; where a platform refuses, the list is exactly what
   it was before. */
#randomTypeSelect optgroup{font-weight:600}
/* ── THE IDENTITY CARD FOLDS BELOW ITS NAME ───────────────────────  2026-09-20
   The summary holds the badge and the cell's name, so the thing you are looking at stays on screen
   whether it is open or shut. The triangle goes at the top rather than centred, because the summary
   is two lines tall and a triangle beside the middle of a name reads as a bullet. */
.cellfold{margin:0}
.cellfold>summary{display:flex;align-items:flex-start;gap:8px;cursor:pointer;list-style:none}
.cellfold>summary::-webkit-details-marker{display:none}
.cellfold>summary::before{content:"\\25B6";display:inline-block;flex:none;font-size:10px;
  color:var(--mut);margin-top:9px;transition:transform .15s ease}
.cellfold[open]>summary::before{transform:rotate(90deg)}
.cellfold>summary>div{flex:1 1 auto;min-width:0}'''

CATSEQ = u'''  const CAT_SEQ=["Excitatory neurons","Inhibitory neurons","Neurons","Glia","Vascular cells","Blood cells","Immune & perivascular cells","Leptomeninges","Other"];'''

CATSEQ_NEW = CATSEQ + u'''
  /* One entry per CAT_SEQ name, pointing at the tokens defined beside .dot in the stylesheet. Kept
     next to the sequence it mirrors so a category added to one and not the other is visible rather
     than silently grey. */
  /* THE CLOSED CONTROL TAKES THE COLOUR OF WHAT IS IN IT. Without this the list is coloured and
     the thing you are actually looking at is not, which is the half you see most of the time. */
  const syncTypeColour=function(){
    const o=randomTypeSelect.selectedOptions&&randomTypeSelect.selectedOptions[0];
    randomTypeSelect.style.color=(o&&o.style.color)||"";
  };
  window.__syncTypeColour=syncTypeColour;
  randomTypeSelect.addEventListener("change",syncTypeColour);
  const CAT_COLOUR={
    "Excitatory neurons":"var(--cat-exc)", "Inhibitory neurons":"var(--cat-inh)",
    "Neurons":"var(--cat-neu)", "Glia":"var(--cat-glia)", "Vascular cells":"var(--cat-vasc)",
    "Blood cells":"var(--cat-blood)", "Immune & perivascular cells":"var(--cat-immune)",
    "Leptomeninges":"var(--cat-lepto)", "Other":"var(--cat-other)"
  };'''

OPTG = u'''    opts+='<optgroup label="'+cat+'">'''
# The closing ">" is part of the anchor AND of the replacement. Dropping it the first time produced
# `<optgroup style=... label="Glia"` with the options run straight on, which Chromium parsed into a
# select where nothing was selectable -- πJump's picker came back with 29 options and no value, and
# δJump's survived the same malformation by luck. Caught by randomtypecheck.js, which drives all
# three pages.
OPTG_NEW = u'''    /* THE GROUP CARRIES THE COLOUR AND THE OPTIONS INHERIT IT, 2026-09-20. Per CATEGORY rather
       than per type -- see the --cat-* block in the stylesheet -- and set inline because the
       category is decided here, at paint time, and a stylesheet cannot know which optgroup is
       which. */
    const catCol=CAT_COLOUR[cat]||"var(--cat-other)";
    opts+='<optgroup label="'+cat+'" style="color:'+catCol+'">'''

# The OPTION line too, not only the optgroup. µJump colours both: an optgroup's colour does NOT
# cascade to its options in Chromium, so colouring only the group leaves the list itself plain --
# which is the half you actually read.
OPTION = u'''      return '<option value="'+p.k+'"'+(c?"":'''
OPTION_NEW = u'''      return '<option value="'+p.k+'" style="color:'+catCol+'"'+(c?"":'''

FAIL = u'''function fail(m){const e=document.getElementById("err");'''

FOLD_FN = u'''/* ── EVERYTHING BELOW THE NAME FOLDS ──────────────────────────  2026-09-20
   Søren: *"We should also be able to collapse the cell history and the cell identity cards, but by
   default they should be expanded."* Asked which part of the identity card, he chose everything
   below the name. Ported from µJump unchanged.

   DONE TO THE DOM, NOT TO THE MARKUP. This card is assembled as a string across three render
   branches, and opening a <details> in one place and closing it in another, three times over, is
   three chances to ship a page with an unclosed tag. Wrapping the finished panel needs one function
   and no branch has to know.

   A LINK IN A SUMMARY IS A TRAP, AND THE OBVIOUS FIX IS A WORSE ONE. preventDefault on the summary
   cancels the whole default action for that click -- and following a link IS the default action, so
   the ↗ stopped working when µJump first tried it. Measured in a browser afterwards: an ANCHOR
   consumes the click by itself and needs nothing from us; the star, a copyable id and a button have
   listeners and no default action worth keeping, so cancelling is free for them. */
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
  /* Read into arrays first -- moving a node out of a live childNodes list while walking it skips
     the one after it. */
  const kids = [].slice.call(panel.childNodes);
  const at = kids.indexOf(head);
  kids.slice(0, at + 1).forEach(function(n){ top.appendChild(n); });
  kids.slice(at + 1).forEach(function(n){ body.appendChild(n); });
  sum.appendChild(top);
  det.appendChild(sum);
  det.appendChild(body);
  panel.appendChild(det);
  sum.addEventListener("click", function(ev){
    const t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest("a,input,select,textarea,label")) return;   // it navigates or types; leave it
    if (t.closest("button,[data-c],.idval,.star,.fav"))
      ev.preventDefault();                    // it has its own job, and folding is not it
  });
  det.addEventListener("toggle", function(){ window.__cellCardOpen = det.open; });
}
''' + FAIL

SHARED = [
    (DOT, DOT + PALETTE, "the categories have colours, and the card has a fold style"),
    (CATSEQ, CATSEQ_NEW, "the colour table and the closed-control sync"),
    (OPTG, OPTG_NEW, "each group is painted in its own colour"),
    (OPTION, OPTION_NEW, "...and every option in it takes that colour"),
    # Painted at the END of every paint, not only on change: the control is repainted twice per
    # call (once from what the page knows, once when the backend reads land), and a colour set only
    # by the change event is lost the moment the second paint arrives.
    (u"""  window.RAND_POOLS=RP;""",
     u"""  window.RAND_POOLS=RP;
  syncTypeColour();""",
     "...and the closed control is repainted with it"),
    (FAIL, FOLD_FN, "the identity card can be folded below its name"),
]

# ── the card itself, which differs per page ───────────────────────────────────────────────────
BROWSE_RE = re.compile(
    r'<!-- 2026-08-10 \(S\w*ren: "\'Or browse a random cell\'.*?</details>\n', re.S)
COORD_RE = re.compile(r'<label>Coordinate <span style="[^"]*">[^<]*</span></label>\n')
HINT_RE = re.compile(r'<p class="hint">Great for learning[^<]*</p>\n')
CTRL_RE = {
    "select": re.compile(r'<select id="randomTypeSelect"[^>]*></select>\n'),
    "ofType": re.compile(r'<button class="idbtn" id="randomOfType"[^>]*>[^<]*</button>\n'),
    "uncl":   re.compile(r'<button class="idbtn" id="randomUnclassified"[^>]*>.*?</button>\n', re.S),
    "count":  re.compile(r'<p class="hint" id="unclCount"[^>]*></p>\n'),
    "comm":   re.compile(r'<button class="idbtn" id="randomCommunityId"[^>]*>.*?</button>\n', re.S),
}


def one(rx, s, what, page):
    hits = rx.findall(s)
    assert len(hits) == 1, "%s: %s matched %d times" % (page, what, len(hits))
    return hits[0]


def rebuild_card(page, s):
    """Reassemble the page's OWN controls in µJump's order, and fold its coordinate box."""
    browse = one(BROWSE_RE, s, "the browse block", page)
    coord = one(COORD_RE, s, "the coordinate label", page)
    ctl = dict((k, one(rx, browse, k, page)) for k, rx in CTRL_RE.items())

    # The stray "Great for learning…" paragraph becomes the Random example button's title, which is
    # what µJump did with it on 2026-09-18 ("This could be a mouse-over for the random button
    # instead of taking space"). Its text is lifted from the page rather than retyped.
    hint = HINT_RE.search(browse)
    ofType = ctl["ofType"]
    if hint and 'title=' not in ofType:
        text = re.sub(r"<[^>]+>", "", hint.group(0)).strip().replace('"', "&quot;")
        ofType = ofType.replace('id="randomOfType"', 'id="randomOfType" title="' + text + '"')

    panel = (
        u'<!-- 2026-09-20 -- µJump\'s card, ported. Browsing is the first thing and no longer a\n'
        u'     <details>: a thing you do every time should not cost a click. The type picker sits\n'
        u'     above the two random buttons -- it is the control that answers "which kind of cell",\n'
        u'     and the buttons are two ways of not choosing. The id is kept so nothing that refers\n'
        u'     to this block has to be found and changed. -->\n'
        u'<div id="randomCellPanel">\n'
        u'<label>Browse a cell <span style="font-weight:400;text-transform:none;'
        u'letter-spacing:normal;color:var(--mut);font-size:12px">&mdash; pick a type and draw an '
        u'example, or take a random one</span></label>\n'
        u'<div class="row" style="gap:8px;margin-top:2px">\n'
        + ctl["select"] + ofType +
        u'</div>\n'
        + ctl["uncl"].replace('margin-top:8px', 'margin-top:10px')
        + ctl["count"] + ctl["comm"] +
        u'</div>\n')

    # 1. lift the old block out, leaving a marker so "already there" can tell a cut that happened
    #    from one that has not: what is left after a cut is a substring of what was there before.
    s = s.replace(browse,
                  u'<!-- "Or browse a random cell" lived here until 2026-09-20; it is the first\n'
                  u'     thing in this card now, always visible. See above the coordinate box. -->\n',
                  1)
    # 2. put it above the coordinate box, and fold that box shut. The label becomes the summary --
    #    keeping both would put the same sentence on two lines, one above the other.
    inner = re.search(r'<label>Coordinate <span style="[^"]*">([^<]*)</span></label>',
                      coord).group(1)
    s = s.replace(coord, panel +
        u'<!-- SHUT BY DEFAULT, 2026-09-20 (Søren: "the coordinate should be expandable and hidden\n'
        u'     by default"). Remembered by the same persistDetailsOpen the panels below it use.\n'
        u'     NOTHING MOVED IN THE JAVASCRIPT: #x, #y, #z and #go keep their ids, and\n'
        u'     getElementById reaches into a closed <details> exactly as it reaches anywhere else. -->\n'
        u'<details class="rv-panel" id="coordPanel">\n'
        u'<summary>Or jump to a coordinate <span style="font-weight:400;color:var(--mut);'
        u'font-size:12px">' + inner + u'</span></summary>\n', 1)
    return s


def close_coord(page, s):
    """The fold closes after the last thing that belongs to typing a coordinate."""
    tail = one(re.compile(r'<p class="hint">Or paste <code>x, y, z</code>[^<]*</p>\n'),
               s, "the paste hint", page)
    return s.replace(tail, tail + u'</details>\n', 1)


PERSIST = u'''persistDetailsOpen("randomCellPanel",'''


def edit(page):
    p = os.path.join(HERE, page)
    s = io.open(p, encoding="utf-8").read()
    print(page)
    if '<div id="randomCellPanel">' in s:
        print("  already there: the card is µJump's")
    else:
        s = close_coord(page, rebuild_card(page, s))
        print("  ok: the card is µJump's — browse first, coordinate folded shut")
    # The browse block is no longer a <details>, so it has no open state to remember; the
    # coordinate box now has one, under its own key.
    if 'persistDetailsOpen("coordPanel"' in s:
        print("  already there: the remembered-open state follows the fold")
    else:
        i = s.index(PERSIST)
        j = s.index("\n", i)
        s = s[:i] + u'/* #randomCellPanel stopped being a <details> on 2026-09-20, so there is\n' \
                    u'   nothing left to remember about it; the coordinate box took its place and\n' \
                    u'   takes its own key -- not the old one, whose stored value would now be read\n' \
                    u'   as meaning the opposite. */\npersistDetailsOpen("coordPanel","' \
            + page.split(".")[0] + u'_coord_panel_open");' + s[j:]
        print("  ok: the remembered-open state follows the fold")
    for old, new, why in SHARED:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    call = u"\n  try{ cellCardFold(panel); }catch(_e){}"
    if call in s:
        assert s.count(call) == 3, "the wrap is on %d of 3 branches" % s.count(call)
        print("  already there: every render branch folds its card")
    else:
        assert s.count(u"  panel.innerHTML=h;") == 3, \
            "%s: expected 3 render branches, found %d" % (page, s.count(u"  panel.innerHTML=h;"))
        s = s.replace(u"  panel.innerHTML=h;", u"  panel.innerHTML=h;" + call, 3)
        print("  ok: all 3 render branches fold their card")
    io.open(p, "w", encoding="utf-8").write(s)


for page in PAGES:
    edit(page)
print("\nnow: node jumpcardcheck.js && node cellfoldcheck.js && node ccpanelcheck.js "
      "&& python3 src/build_stamps.py")
