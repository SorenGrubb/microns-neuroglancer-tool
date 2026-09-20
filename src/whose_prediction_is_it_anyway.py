# -*- coding: utf-8 -*-
u"""Whose prediction is it anyway — and ηJump gets the community block.        2026-09-20

Søren: *"ηJump gets nothing automatically - we need to change that."*

The last of it. ηJump has the shared organelle form and the shared cell history; this adds the
COMMUNITY IDENTIFICATION BLOCK — #commReports, #ctHeadline, #ctTag — which is the part that changes
what the card says a cell IS.

Three things had to be settled first, all of them named in
claude/hjump-gets-a-cell-history.md before this was started.

── 1. THE SHARED PANEL SAYS "MICrONS" OVER DATASETS THAT HAVE NEVER HEARD OF IT ─────────────

The headline-override block has three sentences with MICrONS written into them: "MICrONS
prediction — confirmed by 2 users", "MICrONS made no prediction here", "shown in place of the
MICrONS prediction". True on µJump, δJump and πJump. On ηJump the source is H01, a different
dataset entirely; on λJump and βJump (Lee16) there is no automated classifier AT ALL, and the page
says so in its own headline — so both have been carrying a tooltip crediting a classifier that was
never involved.

UJ.panel.source is a hook returning {label, noun}, defaulting to {"MICrONS", "prediction"} — so
µ/δ/π are unchanged in meaning. ηJump sets {"H01", "published classification"}, because H01 does
not predict, it publishes. λ/β set label:"" and the sentences drop the attribution instead of
inventing one.

The µJump WORDING does shift slightly — "MICrONS made no prediction here" becomes "There is no
MICrONS prediction for this cell" — because one sentence has to work with both nouns. Same claim,
and these are tooltips; no check asserted the old strings (verified before changing them).

── 2. TWO VOTE PANELS, ONE #idVotePanel ──────────────────────────────────────────

loadCommunityReports() calls loadIdentityVotesPanel(). ηJump has its own loadIdentityVotes(), forty
lines of the same shape, already writing the same element. Both would render and the later one
would win, silently.

COMPARED RATHER THAN CHOSEN BY AGE. The shared one is better in two ways that matter: it folds
window.CUR_COMMUNITY_IDS into the pill list, so you can vote on somebody else's proposal and not
only on the published name, and it refuses to let you vote on your OWN proposal (MY_PROPOSED_IDS —
"your ID"). ηJump's was better in two small ways, and both are carried up into the shared file
rather than lost: the "agree?" label had a tooltip saying what voting is for, and its votable
filter excluded "unknown" as well as "unclassified". Checked before widening that filter: no
cell-type leaf in core/ontology.js is named "Unknown" on any tool — µJump's "Unknown" is a
cortical-LAYER label, nothing to do with this pill list.

So ηJump's copy goes, and the shared one gains the two touches.

── 3. celltypeLink TAKES THREE ARGUMENTS ON ηJUMP AND TWO EVERYWHERE ELSE ───────────────

celltypeLink(pos, segId, innerHtml) here; celltypeLink(pos, innerHtml) on the other five, because
an H01 viewer link carries the c3 segment and the others' do not. The headline override calls the
TWO-argument form — so it would have passed the cell's NAME where this page expects a segment id,
producing a link to a segment called "Astrocyte" and a headline with no text in it.

Fixed in hjump.html, not in panel.js: the shared file's call is the normal one and this page's
signature is the exception, so the exception is where the accommodation belongs. Two arguments now
means "innerHtml, and take the segment from CUR_ROOT" — which is the cell on screen, which is what
the override is naming. The five existing three-argument call sites are untouched.

Run: python3 src/whose_prediction_is_it_anyway.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(rel):
    return io.open(os.path.join(HERE, rel), encoding="utf-8").read()


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
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
        io.open(p, "w", encoding="utf-8").write(s)


# ══════════════════════════════════════════════════════════════════════════════════════════════
# 1. core/panel.js — whose classifier is it, and the two touches carried up from ηJump
# ══════════════════════════════════════════════════════════════════════════════════════════════

SRC_ANCHOR = u'''function panelCellIds(){'''
SRC_FN = u'''/* ── WHOSE AUTOMATED CALL IS THIS, IF THERE IS ONE ────────────────────  2026-09-20
   The headline override below explains itself in three sentences, and all three used to say
   MICrONS. True on µJump, δJump and πJump. ηJump's source is H01 — a different dataset, which does
   not predict but publishes — and λJump and βJump have no automated classifier at all, so they
   were crediting one that was never involved.

   {label, noun}. A host may set UJ.panel.source; unset, it is MICrONS's prediction, which is what
   these sentences have always said. label:"" means there is no classifier here, and the sentences
   drop the attribution rather than inventing one. */
function panelSource(){
  var o = null;
  if (typeof UJ !== "undefined" && UJ.panel && UJ.panel.source){
    o = (typeof UJ.panel.source === "function") ? UJ.panel.source() : UJ.panel.source;
  }
  o = o || {};
  return { label: o.label === undefined ? "MICrONS" : String(o.label || ""),
           noun: o.noun || "prediction" };
}
function panelCellIds(){'''

VOTABLE_OLD = (u'''  var votable=function(nm){return nm&&String(nm).trim()'''
               u'''&&!/unclassif/i.test(String(nm));};''')
VOTABLE_NEW = (u'''  /* "unknown" as well as "unclassified", carried up from ηJump's own vote panel when that was
     retired on 2026-09-20. Neither is a claim about a cell, so neither is something to agree with.
     Checked before widening: no cell-type leaf in core/ontology.js is named "Unknown" on any tool
     — µJump's "Unknown" is a cortical-LAYER label and never reaches this list. */
  var votable=function(nm){return nm&&String(nm).trim()'''
               u'''&&!/unclassif|unknown/i.test(String(nm));};''')

AGREE_OLD = u'''<span>agree?</span>'''
AGREE_NEW = (u'''<span title="Vote on whether each identification is right. More independent '''
             u'''agreement is what makes a call trustworthy.">agree?</span>''')

# The three sentences.
CONF_OLD = (u'''if(smallEl)smallEl.textContent="MICrONS prediction \\u2014 confirmed by "'''
            u'''+users(win.n);''')
CONF_NEW = (u'''var _s=panelSource();\n'''
            u'''              if(smallEl)smallEl.textContent=(_s.label?_s.label+" "+_s.noun'''
            u''':"Published "+_s.noun)+" \\u2014 confirmed by "+users(win.n);''')

# The fourth sentence, and the one that got away: found by driving ηJump in a browser after the
# other three were done, still saying "MICrONS’s prediction" in the tooltip of a headline whose
# visible text had just been corrected to "H01 published classification". Three out of four is how
# a page ends up half-true.
CONF2_OLD = (u'''+users(win.n)+" confirmed this matches MICrONS\\u2019s prediction"'''
             u'''+(win.firstBy?", first confirmed by "+win.firstBy:"")+".";''')
CONF2_NEW = (u'''+users(win.n)+" confirmed this matches "'''
             u'''+(_s.label?_s.label+"\\u2019s "+_s.noun:"the published "+_s.noun)'''
             u'''+(win.firstBy?", first confirmed by "+win.firstBy:"")+".";''')

TITLE_OLD = (u'''+(wasUncl?". MICrONS made no prediction here."'''
             u''':". Shown in place of the MICrONS prediction — user reports take precedence here.");''')
TITLE_NEW = (u'''+(wasUncl?(_src.label?". There is no "+_src.label+" "+_src.noun+" for this cell."'''
             u''':". This dataset has no automated classifier.")'''
             u''':". Shown in place of the "+_src.label+" "+_src.noun'''
             u'''+" — user reports take precedence here.");''')

# _src is read once, at the top of the override branch, so the two sentences below cannot disagree.
SRCVAR_OLD = u'''              headEl.title=win.n+(win.n>1?" users have":" user has")+" identified this cell"'''
SRCVAR_NEW = (u'''              var _src=panelSource();   // read once: the two sentences below must agree\n'''
              u'''              headEl.title=win.n+(win.n>1?" users have":" user has")+" identified this cell"''')

TAG_OLD = (u'''tagEl.title=(wasUncl?"Named by users of this tool, not by MICrONS — MICrONS has no '''
           u'''prediction for this nucleus.":"Named by users of this tool and shown in place of the '''
           u'''MICrONS prediction — user reports take precedence.")''')
TAG_NEW = (u'''tagEl.title=(wasUncl'''
           u'''?(_src.label?"Named by users of this tool, not by "+_src.label+" — there is no "'''
           u'''+_src.label+" "+_src.noun+" for this nucleus."'''
           u''':"Named by users of this tool. This dataset has no automated classifier.")'''
           u''':"Named by users of this tool and shown in place of the "+_src.label+" "+_src.noun'''
           u'''+" — user reports take precedence.")''')

# The step-through's own row label. Reachable only where a page renders #stepVotePanel AND has an
# automated name to show -- stepVoteRowHtml returns "" for a falsy name, so λ/β never draw it and
# the hard-coded word has never been visible in the wrong place. Changed anyway, because the next
# page to grow a step-through is the one that finds out.
STEP_OLD = u'''      :stepVoteRowHtml("Original (MICrONS)",micronsName,map)+stepVoteRowHtml("Community",commName,map);'''
STEP_NEW = (u'''      :stepVoteRowHtml("Original ("+(panelSource().label||"published")+")",micronsName,map)'''
            u'''+stepVoteRowHtml("Community",commName,map);''')

print("core/panel.js")
edit("core/panel.js", [
    (u"a hook for whose automated call it is", SRC_ANCHOR, SRC_FN),
    (u'..."unknown" is not a claim either', VOTABLE_OLD, VOTABLE_NEW),
    (u"...the vote pills say what voting is for", AGREE_OLD, AGREE_NEW),
    (u"...a confirmed call names its own source", CONF_OLD, CONF_NEW),
    (u"...and so does the tooltip behind it", CONF2_OLD, CONF2_NEW),
    (u"...the source is read once for the two sentences below", SRCVAR_OLD, SRCVAR_NEW),
    (u"...and an overridden one says what it replaced", TITLE_OLD, TITLE_NEW),
    (u"...as does the tag beside it", TAG_OLD, TAG_NEW),
    (u"...and the step-through's row label", STEP_OLD, STEP_NEW),
])

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 2. λJump and βJump — Lee16 has no classifier, and the page already says so
# ══════════════════════════════════════════════════════════════════════════════════════════════
LB_ANCHOR = u'''window.CUR_CELLTYPE_DISPLAY=null; window.CUR_POS=pos.slice();'''
LB_NEW = u'''/* No automated classifier in this dataset — the headline says "no classifier for this dataset"
     three lines below. core/panel.js's override sentences credit MICrONS unless told otherwise,
     and MICrONS has never seen a cell in this volume. */
  window.UJ=window.UJ||{}; UJ.panel=UJ.panel||{}; UJ.panel.source={label:"",noun:"prediction"};
  window.CUR_CELLTYPE_DISPLAY=null; window.CUR_POS=pos.slice();'''

for pg in ["ljump.html", "bjump.html"]:
    print(pg)
    edit(pg, [(u"the page says which classifier it has, which is none", LB_ANCHOR, LB_NEW)])

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 3. hjump.html
# ══════════════════════════════════════════════════════════════════════════════════════════════

# ── celltypeLink learns the two-argument call ────────────────────────────────────────────────
LINK_OLD = u'''function celltypeLink(pos, segId, innerHtml){
  return '<a href="'+escHtml(viewerUrl(pos,segId))+'" target="_blank" rel="noopener" '''
LINK_NEW = u'''/* ── TWO SHAPES, ONE LINK ──────────────────────────────────  2026-09-20
   This page's five call sites pass (pos, segId, innerHtml), because an H01 viewer link carries the
   c3 segment and the other five tools' links do not. core/panel.js calls the shape those five
   use — celltypeLink(pos, innerHtml) — when a community identification takes over the headline,
   and would otherwise have passed the cell's NAME as a segment id: a link into a segment called
   "Astrocyte", and a headline with nothing in it.

   Two arguments means "take the segment from the cell on screen", which is the cell the override
   is renaming. The three-argument call sites are untouched. */
function celltypeLink(pos, segId, innerHtml){
  if(innerHtml===undefined){ innerHtml=segId; segId=(typeof CUR_ROOT!=="undefined"&&CUR_ROOT)||""; }
  return '<a href="'+escHtml(viewerUrl(pos,segId))+'" target="_blank" rel="noopener" '''

# ── what H01 is called, beside what its ids are called ───────────────────────────────────────
HOOK_OLD = u'''UJ.panel.cellIds = function(c){
  return { nucId: (c && c.body) || "", root: (c && c.seg) || "",
           nucLabel: "cell body", rootLabel: "c3 segment" };
};'''
HOOK_NEW = u'''UJ.panel.cellIds = function(c){
  return { nucId: (c && c.body) || "", root: (c && c.seg) || "",
           nucLabel: "cell body", rootLabel: "c3 segment" };
};
/* H01 DOES NOT PREDICT, IT PUBLISHES. The shared panel explains a community override by naming
   what it replaced, and says "MICrONS prediction" unless a page says otherwise — which would
   credit a classifier that has never seen this volume. */
UJ.panel.source = { label: "H01", noun: "published classification" };'''

# ── the headline the community can take over ─────────────────────────────────────────────────
HEAD_OLD = u'''  h+='<div class="celltype">'+celltypeLink(pos,seg,escHtml(longName(t)))+star
    +' <small>H01 published classification</small></div>';
  h+='<div id="idVotePanel" style="margin:6px 0"></div>';'''
HEAD_NEW = u'''  /* ── THE HEADLINE A COMMUNITY NAME CAN TAKE OVER ──────────────────  2026-09-20
     #ctHeadline is core/panel.js's, and the two data- attributes are how it decides whether a
     community identification may replace what is written here:

       data-unclassified="1"  H01 made no call, so the first person to name this cell names it;
       data-microns-name      what H01 DID publish, so that everyone agreeing with it is recorded
                              as confirming H01 rather than overriding it. (The attribute keeps
                              µJump's name — it is read as headEl.dataset.micronsName in the shared
                              file, and renaming it would be a rename across six pages to describe
                              one of them better.)

     H01_NO_CALL is the same test the guided-ID call to action and the vote seeds already use, so
     the three cannot disagree about whether this cell has a published type. */
  const noPub=!!H01_NO_CALL[t];
  h+='<div class="celltype" id="ctHeadline" data-unclassified="'+(noPub?"1":"0")+'"'
    +' data-microns-name="'+(noPub?"":escHtml(longName(t)))+'">'
    +celltypeLink(pos,seg,escHtml(longName(t)))+star
    +' <small>H01 published classification</small></div>';
  /* Its own tag, not the class badge above: core/panel.js overwrites #ctTag wholesale the moment
     a community identification wins, and sharing it with the excitatory/inhibitory badge would
     silently delete an anatomical fact. Only on a cell H01 did not call — there is nothing to say
     "unclassified" about otherwise. Same reasoning λJump and βJump use for theirs. */
  if(noPub) h+=' <span class="tag none" id="ctTag" title="H01 published no cell type for this '
    +'segment — nobody has agreed on one here yet">unclassified</span>';
  h+='<div id="idVotePanel" style="margin:6px 0"></div>';
  /* ── WHAT THE COMMUNITY HAS SAID ──────────────────────────────  2026-09-20
     Filled by loadCommunityReports() below, which also builds the organelle read-back and the
     traced-structure list inside it. Directly under the headline it can rewrite, so the name and
     the reason for the name are read together. */
  h+='<div class="meta" id="commReports" style="margin:6px 0 0"></div>';'''

# ── the calls ────────────────────────────────────────────────────────────────────────────────
CALL_OLD = u'''  loadIdentityVotes(String(HSB[i]), H01_NO_CALL[t]?[]:[longName(t)]);
  loadExtraIdPanel(String(HSB[i]));'''
CALL_NEW = u'''  /* core/panel.js's, since 2026-09-20 — this page's own loadIdentityVotes() was retired the same
     day (see where it used to be defined). The seed is H01's published name where there is one, so
     it can be agreed with before anybody has proposed anything; loadCommunityReports re-runs this
     with window.__idvBase once the community's own names are known, which is how a proposal
     becomes votable. Same order µJump uses. */
  loadIdentityVotesPanel(String(HSB[i]), H01_NO_CALL[t]?[]:[longName(t)]);
  loadCommunityReports(String(HSB[i]), pos);
  loadExtraIdPanel(String(HSB[i]));'''

print("hjump.html")
edit("hjump.html", [
    (u"celltypeLink answers the shared panel's two-argument call", LINK_OLD, LINK_NEW),
    (u"what H01 is called, beside what its ids are called", HOOK_OLD, HOOK_NEW),
    (u"a headline a community name can take over, a tag, and somewhere for the reports",
     HEAD_OLD, HEAD_NEW),
    (u"the shared vote panel and the community block are loaded", CALL_OLD, CALL_NEW),
])

# ── and the page's own vote panel goes ───────────────────────────────────────────────────────
VOTE_START = u'''function loadIdentityVotes(bodyId,seedNames){'''
VOTE_GONE = (u'''/* loadIdentityVotes() moved to core/panel.js's loadIdentityVotesPanel() on 2026-09-20.\n'''
             u'''   Both wrote #idVotePanel and the later one silently won. The shared one lists community\n'''
             u'''   proposals as well as the published name, and will not let you vote on your own — two\n'''
             u'''   things this copy never did. The two things this copy did better, the "agree?" tooltip and\n'''
             u'''   excluding "unknown" from the pills, went up into the shared file rather than being lost. */\n''')


def cut_the_vote_panel():
    p = os.path.join(HERE, "hjump.html")
    s = read("hjump.html")
    if u"moved to core/panel.js's loadIdentityVotesPanel()" in s:
        print("  already there: the page uses the shared vote panel")
        return
    a = s.find(VOTE_START)
    assert a >= 0 and s.count(VOTE_START) == 1, "hjump.html: loadIdentityVotes is not unique"
    end = s.find(u"\n}\n", a)
    assert end > 0, "hjump.html: loadIdentityVotes never closes at column 0"
    end += len(u"\n}\n")
    cut = s[a:end]
    # At column 0, not anywhere: this file's comments quote its own code.
    assert u"\nfunction " not in cut, "hjump.html: the cut has swallowed another function"
    s = s[:a] + VOTE_GONE + s[end:]
    # COMMENTS STRIPPED BEFORE THE TEST. The first version asserted the string was simply absent
    # and failed on the replacement comment two hundred lines above, which names the function it
    # is recording the removal of -- the same trap this file's header warns about, met twice in
    # one afternoon. The recursive retry inside the cut went with the cut, as it should.
    import re as _re
    bare = _re.sub(r"/\*[\s\S]*?\*/", "", s)
    bare = _re.sub(r"^\s*//.*$", "", bare, flags=_re.M)
    assert u"loadIdentityVotes(" not in bare, \
        "hjump.html: a call to the retired loadIdentityVotes() is still here"
    io.open(p, "w", encoding="utf-8").write(s)
    print("  ok: the page's own vote panel is cut (%d lines)" % cut.count(u"\n"))


cut_the_vote_panel()

print(u"\nnow: node organcardcheck.js && node ccpanelcheck.js && node bjumpcheck.js "
      u"&& node hjumpvolcheck.js && python3 src/build_stamps.py && node stampcheck.js")
