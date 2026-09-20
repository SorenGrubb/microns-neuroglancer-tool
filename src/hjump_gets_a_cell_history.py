# -*- coding: utf-8 -*-
u"""ηJump gets a cell history, and its card folds.                              2026-09-20

Søren: *"ηJump gets nothing automatically - we need to change that."*

The organelle form moved to core/panel.js this afternoon
(src/the_shared_form_learns_a_second_dataset.py). This is the next thing that file already has and
this page never did: the CELL HISTORY -- who has said what about this cell, and when.

ηJump has had none. `chist-` appears nowhere in hjump.html outside the stylesheet, which is why
chistfoldcheck.js exempts it: the page carries 25 lines of CSS for a panel it has never rendered.
Now it loads panel.js, and the history is two placeholders and one call away.

AND THE CARD FOLDS, which is the same request from the same day
(*"We should also be able to collapse the cell history and the cell identity cards, but by default
they should be expanded"*) and the last page not to have it. ηJump's card is shaped like µJump's --
badges first, then `.celltype` -- so it needs no tail selector, unlike λ/β.

WHAT THIS DELIBERATELY DOES NOT DO, and why it is a separate pass:

  the COMMUNITY IDENTIFICATION block (#commReports, #ctHeadline, #ctTag). Two things have to be
  settled first, and neither is a refactor:

    1. loadCommunityReports() calls loadIdentityVotesPanel() -- and ηJump has its own
       loadIdentityVotes(), forty lines of the same shape, already writing #idVotePanel. Both
       would render into it and the second would win. One of the two has to go, and deciding
       which is the same comparison the organelle form needed.
    2. ηJump's celltypeLink() is celltypeLink(pos, segId, innerHtml) -- three arguments, unique
       among the six tools, because an H01 viewer link carries the c3 segment. core/panel.js's
       headline override calls the two-argument form, so it would pass the cell's NAME where this
       page expects a segment id.

  Neither blocks the history, which is why the history ships now rather than waiting for them.

WHAT THE HISTORY NEEDS FROM THIS PAGE, all of it either already here or added below:
  REPORT_ENDPOINT, GOOGLE_VERIFIED, GOOGLE_CREDENTIAL, UJ.cfg.backend.ds  -- already here
  window.CUR_POS, CUR_ROOT                                                -- added: the history
    row prints the coordinate it was filed at and matches tracings by root id, and both were
    simply missing. CUR_NUCID goes in beside them because panel.js's contract names it and a page
    that defines two of three is a page somebody will trip over.

ONE THING IT STILL CANNOT DO: `restoreClassification` is not defined here, so a "Restore this
version" button would confirm, disable itself and do nothing. It is reached through a typeof guard,
and the button only appears when the BACKEND says canRestore -- λJump and βJump have had exactly
this gap since they joined, so this is not a new hole, but it is a real one and it is written down
here rather than discovered later.

Run: python3 src/hjump_gets_a_cell_history.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
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
        io.open(p, "w", encoding="utf-8").write(s)


# ── where the history goes ────────────────────────────────────────────────────────────────────
# Directly above the guided-identification call to action, which is where λJump puts it: the
# history is the record of what has been said about this cell, and the call to action is the
# invitation to say something -- reading the one before being asked the other is the right order.
PANEL_OLD = u'''  /* Same .idcta call-to-action µJump ends its cell panel with.'''
PANEL_NEW = u'''  /* ── WHO HAS SAID WHAT ABOUT THIS CELL ─────────────────────────  2026-09-20
     Filled by core/panel.js's loadClassificationHistory() below. Empty until then, and empty for
     good on a cell nobody has written about -- the panel says so itself rather than being hidden,
     because "nothing recorded yet" is an answer to the question somebody just asked.

     Above the call to action, the way λJump has it: the record of what has been said comes before
     the invitation to say something. */
  h+='<div id="classHistoryPanel" style="margin:14px 0 0"></div>';

  /* Same .idcta call-to-action µJump ends its cell panel with.'''

# ── the three globals panel.js reads ──────────────────────────────────────────────────────────
CTX_OLD = u'''  ID_CTX={i:i, seg:seg, body:String(HSB[i]), pos:pos,
          layer:(volLayer(i)!=="no-layer"?volLayer(i):tagLayer(i)), depth:depthUm(i),
          published:H01_NO_CALL[t]?null:t};'''
CTX_NEW = u'''  ID_CTX={i:i, seg:seg, body:String(HSB[i]), pos:pos,
          layer:(volLayer(i)!=="no-layer"?volLayer(i):tagLayer(i)), depth:depthUm(i),
          published:H01_NO_CALL[t]?null:t};
  /* ── WHAT core/panel.js READS OFF THE PAGE ────────────────────────  2026-09-20
     Three globals its contract names, none of which existed here. The history row prints the
     coordinate the report was filed at (CUR_POS) and matches hand-traced structures by root id
     (CUR_ROOT); CUR_NUCID is set beside them because a page defining two of the three is a page
     somebody trips over later.

     H01 HAS NO NUCLEUS, so these carry what this dataset actually has, exactly as UJ.panel.cellIds
     does for the organelle form: the cell_bodies object id, and the c3 segment as the root. */
  window.CUR_POS=pos.slice();
  CUR_NUCID=String(HSB[i]);
  CUR_ROOT=seg;'''

GLOBALS_OLD = u'''let GOOGLE_VERIFIED=false, GOOGLE_CREDENTIAL=null, REPORTER_NAME="", REPORTER_EMAIL="";'''
GLOBALS_NEW = u'''let GOOGLE_VERIFIED=false, GOOGLE_CREDENTIAL=null, REPORTER_NAME="", REPORTER_EMAIL="";
/* Declared here rather than only assigned in showCell: core/panel.js reaches both through
   `typeof CUR_ROOT !== "undefined"` guards, and an assignment inside a function would make them
   implicit globals that do not exist until the first cell is drawn. `var`, not `let`, because
   panel.js is a separate script and a `let` in temporal dead zone throws where an undefined `var`
   simply reads undefined. */
var CUR_NUCID="", CUR_ROOT="";'''

# ── the call, and the fold ────────────────────────────────────────────────────────────────────
CALL_OLD = u'''  loadIdentityVotes(String(HSB[i]), H01_NO_CALL[t]?[]:[longName(t)]);
  loadExtraIdPanel(String(HSB[i]));
  if(typeof refreshFavStars==="function") refreshFavStars();'''
CALL_NEW = u'''  loadIdentityVotes(String(HSB[i]), H01_NO_CALL[t]?[]:[longName(t)]);
  loadExtraIdPanel(String(HSB[i]));
  /* core/panel.js's, shared with the other five tools since this page started loading it.
     Guarded because everything else on this card works without it, and a page that loses one
     script should lose one panel rather than the cell. */
  if(typeof loadClassificationHistory==="function") loadClassificationHistory(String(HSB[i]));
  if(typeof refreshFavStars==="function") refreshFavStars();
  /* ── AND THE CARD FOLDS ─────────────────────────────────  2026-09-20
     The last of the six to get it. No tail selector: this card is shaped like µJump's -- the class
     badge, the layer and the morphological modifiers all come BEFORE `.celltype`, so they ride
     into the summary on their own. λJump and βJump build it the other way round and have to say
     `.cardtags`; this one does not. */
  try{ cellCardFold(panel); }catch(_e){}'''

print("hjump.html")
edit("hjump.html", [
    (u"somewhere for the history to go", PANEL_OLD, PANEL_NEW),
    (u"CUR_NUCID and CUR_ROOT exist before the first cell is drawn", GLOBALS_OLD, GLOBALS_NEW),
    (u"...and carry this cell once one is", CTX_OLD, CTX_NEW),
    (u"the history loads, and the card folds", CALL_OLD, CALL_NEW),
])

print(u"\nnow: node cellfoldcheck.js hjump.html && node chistfoldcheck.js "
      u"&& node organcardcheck.js && node hjumpvolcheck.js "
      u"&& python3 src/build_stamps.py && node stampcheck.js")
