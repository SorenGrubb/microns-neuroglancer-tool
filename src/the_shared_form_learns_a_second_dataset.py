# -*- coding: utf-8 -*-
u"""The shared organelle form learns a second dataset, and ηJump stops keeping its own. 2026-09-20

Søren: *"ηJump gets nothing automatically -- we need to change that."*

WHAT "NOTHING" MEANT. core/panel.js holds the organelle report form that µ/δ/π/λ/β all share, so a
fix to it lands on five tools at once. ηJump carried a hand-written copy of the same four
functions, and that copy did not move: the bulk paste box was folded into a shut <details> in
core/panel.js this morning and ηJump still had the old dashed slab, because nothing connects the
two but a comment saying they are meant to look alike.

WHY THE COPY EXISTED, which is the part worth keeping. It was not laziness. Two real differences:

  1. H01 has no nucleus. µJump files a report against ID_CTX.nucId and ID_CTX.root; ηJump has a
     cell_bodies object id and a c3 segment, and its form says "cell body 1234 . c3 segment 5678"
     because that is what those numbers ARE. A shared form that prints "nucleus" over an H01 cell
     body is wrong in a way no amount of sharing makes right.
  2. TWO MOUNTS. #nucpanel (the cell card) and #idfpanel (the guided-ID result) are in the DOM at
     the same time on ηJump, so the toggle cannot use one fixed id -- whichever wired last would
     win and the other link would be dead. ηJump's copy takes a `pfx`; the shared one does not.

So the fix is not "delete the fork and hope". It is to give the shared form the two joints the
fork was built around, and then delete the fork:

  - `organelleFlagHtml(pfx)` / `wireOrganelleFlag(slug, pfx)` take an OPTIONAL prefix. With no
    prefix the ids are exactly what they are today -- #idfOrganelleToggle and
    #organelleInlineBody, both named in panel.js's own host contract and reached by five pages and
    four checks -- so µ/δ/π/λ/β cannot tell this change happened. ηJump passes "nuc" on the card
    and nothing on the guided screen, which is what its own copy did.
  - `UJ.panel.cellIds` is a hook a host MAY define to say what its two identifiers are called and
    where to read them. Undefined, it reads ID_CTX.nucId/ID_CTX.root and says "nucleus"/"root" --
    today's behaviour, to the byte. ηJump defines it and gets its own vocabulary back.

The hook is read in THREE places and they must agree: the line the form prints, the groupId that
ties one submission's rows together, and the payload's nucleusId/rootId. A form that displays the
cell body id and files the report against an empty nucleus id is the worst of both.

WHAT ηJump GAINS BY BEING ON THE SHARED FILE, beyond not drifting: the folded bulk-paste box it
missed this morning, and every future fix to a form that is now maintained once.

WHAT IT STILL DOES NOT HAVE, deliberately, and not in this pass: the community-identification
block and the cell history (#commReports / #classHistoryPanel / #ctHeadline / #ctTag). Those change
what the card SAYS a cell is -- a community consensus overriding H01's published call -- which is a
decision about the tool, not a refactor, and it deserves its own pass.

TWO GLOBALS ηJUMP WAS MISSING. panel.js's host contract requires `coordSpan` and `REPORTER_EMAIL`;
hjump.html had neither, and a ReferenceError inside organelleFormHtml would have left the form
blank with no visible cause. coordSpan is lifted verbatim from ujump.html (same .idval/data-c
copy-on-click convention hjump's own idRow already uses); REPORTER_EMAIL is declared beside
REPORTER_NAME and filled from the same Google payload.

Run: python3 src/the_shared_form_learns_a_second_dataset.py
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


# ══════════════════════════════════════════════════════════════════════════════════════════════
# 1. core/panel.js -- the two joints
# ══════════════════════════════════════════════════════════════════════════════════════════════

FLAG_OLD = u'''function organelleFlagHtml(){
  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Log an organelle here <span class="idf-back" id="idfOrganelleToggle" style="margin:0">Log one &rarr;</span></span>'
    +'<div id="organelleInlineBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div></div>';
}
function wireOrganelleFlag(slug){
  const toggle=document.getElementById("idfOrganelleToggle"),body=document.getElementById("organelleInlineBody");'''

FLAG_NEW = u'''/* ── WHOSE CELL IS THIS, IN THE HOST'S OWN WORDS ───────────────────────────────  2026-09-20
   Every tool that loads this file had one nucleus and one root until ηJump joined. H01 has
   neither: it has a cell_bodies object and a c3 segment, in two different id spaces, and a form
   that prints "nucleus" over one of them is telling the reporter something untrue about their own
   dataset.

   A host MAY define UJ.panel.cellIds(ID_CTX) and return {nucId, root, nucLabel, rootLabel}.
   Undefined -- which is every tool but ηJump -- this reads ID_CTX.nucId/ID_CTX.root and says
   "nucleus"/"root", exactly as the three call sites did when they read ID_CTX directly.

   READ IN THREE PLACES, and they have to agree: the line the form prints, the groupId that ties
   one submission's rows together, and the nucleusId/rootId that actually go to the sheet. A form
   that shows the cell body id and files against an empty nucleus id is worse than either. */
function panelCellIds(){
  var c = (typeof ID_CTX !== "undefined" && ID_CTX) ? ID_CTX : {};
  var o = null;
  if (typeof UJ !== "undefined" && UJ.panel && typeof UJ.panel.cellIds === "function"){
    try { o = UJ.panel.cellIds(c); } catch (_e){ o = null; }
  }
  o = o || {};
  return { nucId: o.nucId !== undefined ? (o.nucId || "") : (c.nucId || ""),
           root:  o.root  !== undefined ? (o.root  || "") : (c.root  || ""),
           nucLabel: o.nucLabel || "nucleus",
           rootLabel: o.rootLabel || "root" };
}
/* ── AN OPTIONAL PREFIX, BECAUSE ηJUMP MOUNTS THIS TWICE ───────────────────────  2026-09-20
   #nucpanel (the cell card) and #idfpanel (the guided-ID result) are both in the DOM at once on
   ηJump, so a single fixed toggle id leaves one of the two dead -- whichever wired last wins.

   NO PREFIX MEANS TODAY'S IDS, to the byte: #idfOrganelleToggle and #organelleInlineBody. Both
   are named in this file's own host contract at the top, and reached by five pages and four
   checks; renaming them to something symmetrical would have been tidier and would have broken all
   of it for nothing. */
function organelleFlagHtml(pfx){
  var tog = (pfx || "idf") + "OrganelleToggle";
  var bod = pfx ? pfx + "OrganelleInlineBody" : "organelleInlineBody";
  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Log an organelle here <span class="idf-back" id="'+tog+'" style="margin:0">Log one &rarr;</span></span>'
    +'<div id="'+bod+'" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div></div>';
}
function wireOrganelleFlag(slug,pfx){
  const toggle=document.getElementById((pfx||"idf")+"OrganelleToggle"),body=document.getElementById(pfx?pfx+"OrganelleInlineBody":"organelleInlineBody");'''

META_OLD = (u'''h+='<div class="meta">'+(name?"Identified as: <b>"+name+"</b> &middot; ":"")'''
            u'''+(ID_CTX.nucId?"nucleus "+ID_CTX.nucId:"no nucleus ID on file")'''
            u'''+(ID_CTX.root?" &middot; root "+ID_CTX.root:"")'''
            u'''+(ID_CTX.pos?" &middot; voxel ("+coordSpan(ID_CTX.pos[0],ID_CTX.pos[1],ID_CTX.pos[2])+")":"")+'</div>';''')

META_NEW = (u'''  const ids=panelCellIds();   // "nucleus"/"root" here, "cell body"/"c3 segment" on \\u03b7Jump
'''
            u'''  h+='<div class="meta">'+(name?"Identified as: <b>"+name+"</b> &middot; ":"")'''
            u'''+(ids.nucId?ids.nucLabel+" "+ids.nucId:"no "+ids.nucLabel+" ID on file")'''
            u'''+(ids.root?" &middot; "+ids.rootLabel+" "+ids.root:"")'''
            u'''+(ID_CTX.pos?" &middot; voxel ("+coordSpan(ID_CTX.pos[0],ID_CTX.pos[1],ID_CTX.pos[2])+")":"")+'</div>';''')

GROUP_OLD = u'''    const groupId=(ID_CTX.nucId||"nonuc")+"_"+Date.now()+"_org";'''
GROUP_NEW = u'''    const sid=panelCellIds();   // the same two ids the form printed, so they cannot disagree
    const groupId=(sid.nucId||"nonuc")+"_"+Date.now()+"_org";'''

PAY_OLD = u'''      nucleusId:ID_CTX.nucId||"",rootId:ID_CTX.root||"",'''
PAY_NEW = u'''      nucleusId:sid.nucId,rootId:sid.root,'''

# ── "submitted" has to mean it was ───────────────────────────────────────────────────────────
# ηJump's own form waited on its posts and said "Try again" when one failed; the shared form said
# "submitted" the instant the requests left. Retiring the fork would have quietly taken that away
# from ηJump -- and a report refused for an expired token, reported as submitted, is the one
# failure here worth code. Lifted into the shared file, so all six tools get it.
SENT_OLD = u'''    subs.forEach((s,i)=>postReport({
      type:"organelle_location",
      timestamp:new Date().toISOString(),
      nucleusId:sid.nucId,rootId:sid.root,
      coord:ID_CTX.pos?ID_CTX.pos.join(","):"",
      groupId,subIndex:i+1,subCount:subs.length,
      kind:s.kind,pointA:s.pointA,pointB:s.pointB,
      identified:(typeof canonSubmitName==="function"?canonSubmitName(name):name)||"",
      comment,path
    }));
    submitBtn.textContent="submitted";
    container.querySelector("#organThanks").innerHTML='<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">Thanks — '+subs.length+' structure'+(subs.length>1?"s":"")+' logged against this cell.</div>';'''

SENT_NEW = u'''    const posts=subs.map((s,i)=>postReport({
      type:"organelle_location",
      timestamp:new Date().toISOString(),
      nucleusId:sid.nucId,rootId:sid.root,
      coord:ID_CTX.pos?ID_CTX.pos.join(","):"",
      groupId,subIndex:i+1,subCount:subs.length,
      kind:s.kind,pointA:s.pointA,pointB:s.pointB,
      identified:(typeof canonSubmitName==="function"?canonSubmitName(name):name)||"",
      comment,path
    }));
    /* ── "SUBMITTED" HAS TO MEAN IT WAS ───────────────────────────────────────────  2026-09-20
       This used to print "submitted" the moment the requests left, which is true of the click and
       not of the report. A token that lapsed twenty minutes ago is refused before the round trip,
       and the reporter was told their twelve mitochondria were logged.

       postReport does not answer the same way on every tool, so this reads whichever answer it
       was given rather than assuming one: µJump returns false outright when it refuses and toasts
       the server's own sentence later; ηJump returns a promise of {ok,error}. A host whose
       postReport returns nothing useful keeps exactly the old wording, because there is nothing
       to wait for and silence is not a failure. */
    const ok_=()=>{
      submitBtn.textContent="submitted";
      container.querySelector("#organThanks").innerHTML='<div class="idf-flag" style="border-color:var(--accent);color:var(--accent);margin-top:10px">Thanks — '+subs.length+' structure'+(subs.length>1?"s":"")+' logged against this cell.</div>';
      if(typeof loadMyStats==="function"){try{loadMyStats();}catch(_e){}}
    };
    const no_=msg=>{
      submitBtn.disabled=false;submitBtn.textContent="Try again";
      container.querySelector("#organThanks").innerHTML='<div class="idf-flag" style="border-color:var(--bad);color:var(--bad);margin-top:10px">'+panelEsc(msg||"That was not recorded \\u2014 nothing has been logged against this cell.")+'</div>';
    };
    const waits=posts.filter(r=>r&&typeof r.then==="function");
    if(posts.some(r=>r===false)) no_("");
    else if(!waits.length) ok_();
    else Promise.all(waits).then(rs=>{
      const bad=rs.filter(d=>d&&d.ok===false)[0];
      if(bad) no_(bad.error); else ok_();
    }).catch(()=>no_(""));'''

# ── the pill that said "click to copy" and did not ────────────────────────────────────────────
# Found while checking ηJump's new form in a browser, then measured on µJump, where it has been
# dead for as long as the form has existed: the voxel coordinate in the form's header is a
# coordSpan, and coordSpan's .idval is wired PER RENDER by each page over its cell panel -- which
# runs when the cell is drawn, and this form is built later, on the toggle. So the pill carries
# the hand cursor, the hover border and the title, and clicking it does nothing at all.
# loadCommunityReports right above wires its own the same way, scoped to what it just drew;
# this does the same for the container it was handed.
PILL_OLD = u'''function wireOrganelleForm(container,slug){
  const name=(slug&&typeof LEAF_NAMES!=="undefined")?LEAF_NAMES[slug]:null;'''
PILL_NEW = u'''function wireOrganelleForm(container,slug){
  const name=(slug&&typeof LEAF_NAMES!=="undefined")?LEAF_NAMES[slug]:null;
  /* THE VOXEL PILL IN THE HEADER ABOVE, which has been dead since this form was written.  2026-09-20
     coordSpan renders an .idval, and every page wires .idval per render across its CELL PANEL --
     at the moment the cell is drawn. This form is built later, when the toggle is clicked, so the
     pass has long since run: the pill keeps the pointer cursor, the hover border and the "click to
     copy" title, and nothing happens. Scoped to the container it was handed, exactly as
     loadCommunityReports wires the ones it has just drawn. */
  container.querySelectorAll(".idval").forEach(sp=>sp.addEventListener("click",()=>{navigator.clipboard&&navigator.clipboard.writeText(sp.dataset.c);const o=sp.textContent;sp.textContent="copied";setTimeout(()=>sp.textContent=o,900);}));'''

# ── a name box only where something can save what is typed in it ──────────────────────────────
# The second thing ηJump surfaced. The form offers "want credit for this report?" with a name
# field and an empty div for a Google button; both are wired by the host, through
# saveReporterFromInput and initGSI, and only µJump, δJump and πJump define either. On λJump,
# βJump -- and now ηJump -- the field swallows whatever is typed and the sign-in slot stays empty,
# under a note saying sign-in is required and offering no way to do it.
#
# The sentence that replaces it is ηJump's own, from the form this pass retired. It is the true
# one on those pages: the account chip at the top is where signing in happens.
CRED2_OLD = u'''  if(!GOOGLE_VERIFIED){
  h+='<div class="idf-identity" style="margin-top:10px">'''
CRED2_NEW = u'''  if(!GOOGLE_VERIFIED){
  /* ── A NAME BOX ONLY WHERE SOMETHING CAN SAVE WHAT IS TYPED IN IT ───────────────  2026-09-20
     Both controls below are wired by the HOST -- the field through saveReporterFromInput, the
     empty div through initGSI -- and three of the six pages that load this file define neither.
     There, this rendered a box that swallowed the name and an empty slot where the sign-in button
     was supposed to be, under a line saying sign-in was required. Asking somebody to type their
     name and then dropping it is worse than not asking.

     The sentence in the other branch is ηJump's own, from the hand-written form this pass
     retired: those pages sign in from the account chip at the top, and saying so is the whole of
     what they can honestly offer here. */
  if(typeof saveReporterFromInput!=="function"&&typeof initGSI!=="function"){
    h+='<div class="meta" style="margin-top:10px">Reporting anonymously &mdash; sign in with the '
      +'button at the top of the page first if you want credit for this report.</div>';
  } else {
  h+='<div class="idf-identity" style="margin-top:10px">'''

CRED3_OLD = u'''    +'<div id="organGsiButton"></div></div>';
  } else {'''
CRED3_NEW = u'''    +'<div id="organGsiButton"></div></div>';
  }
  } else {'''

edit("core/panel.js", [
    (u"the shared form's two joints: a host id vocabulary and an optional prefix",
     FLAG_OLD, FLAG_NEW),
    (u"...the voxel pill in its header actually copies now", PILL_OLD, PILL_NEW),
    (u"...and the credit box only appears where the page can save a name",
     CRED2_OLD, CRED2_NEW),
    (u"...closing the branch it opened", CRED3_OLD, CRED3_NEW),
    (u"...the line the form prints uses them", META_OLD, META_NEW),
    (u"...and so does the groupId", GROUP_OLD, GROUP_NEW),
    (u"...and so does what actually reaches the sheet", PAY_OLD, PAY_NEW),
    (u'..."submitted" waits until it is true', SENT_OLD, SENT_NEW),
])

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 2. hjump.html -- the two missing globals, the hook, the script tag, and the fork's removal
# ══════════════════════════════════════════════════════════════════════════════════════════════

REPORTER_OLD = u'''let GOOGLE_VERIFIED=false, GOOGLE_CREDENTIAL=null, REPORTER_NAME="";'''
REPORTER_NEW = u'''/* REPORTER_EMAIL is in core/panel.js's required host contract -- its form offers a name box to a
   signed-out reporter and names a signed-in one -- and this page did not have it. An undefined
   global there is a ReferenceError inside organelleFormHtml(), which shows up as a form that
   simply does not appear. Declared here beside the name it travels with, filled from the same
   Google payload below. */
let GOOGLE_VERIFIED=false, GOOGLE_CREDENTIAL=null, REPORTER_NAME="", REPORTER_EMAIL="";'''

CRED_OLD = u'''    REPORTER_NAME=p.name||""; GOOGLE_CREDENTIAL=resp.credential; GOOGLE_VERIFIED=true;'''
CRED_NEW = u'''    REPORTER_NAME=p.name||""; REPORTER_EMAIL=p.email||""; GOOGLE_CREDENTIAL=resp.credential; GOOGLE_VERIFIED=true;'''

# The script tag, and with it coordSpan and the host's id vocabulary. Placed with the other core
# tags rather than further down: the form reads ORGANELLE_KIND_OPTIONS_HTML at call time, so only
# the declaration order of the file matters, and this keeps every core/ tag in one block.
TAG_OLD = u'''<script src="core/ontology.js"></script>'''
TAG_NEW = u'''<script src="core/ontology.js"></script>
<!-- ── core/panel.js, from 2026-09-20 ────────────────────────────────────────────────────────
     Søren: "ηJump gets nothing automatically - we need to change that."

     This page carried its own copy of the organelle report form for a month (see the block that
     used to sit above showCell). The copy was written for two real reasons -- H01's cell body /
     c3 segment instead of a nucleus and a root, and two mounts needing two sets of ids -- and
     core/panel.js now has a joint for each, so the copy is gone and this tag is what replaces it.

     hjump_config.js sets UJ.panel.cellIds just below, which is how the shared form knows to say
     "cell body" over an H01 cell. Nothing else on this page calls into panel.js yet: the
     community-identification block and the cell history are a separate decision about what this
     tool claims a cell is, not a refactor. -->
<script src="core/panel.js"></script>'''

# coordSpan + the hook. Anchored on the page's own idRow(), which uses the identical .idval /
# data-c convention -- so the two copy-on-click spans on this page are built the same way.
HOOK_ANCHOR = u'''function showCell(i, distNm, fromHistory){'''
HOOK_NEW = u'''/* ── WHAT core/panel.js NEEDS FROM THIS PAGE ───────────────────────────────────  2026-09-20
   Two globals and one hook, together because they are one decision: this page shares the organelle
   form now, and the form has to be able to name an H01 cell.

   coordSpan is ujump.html's, verbatim. It builds the same click-to-copy span idRow() above builds,
   so the two on this page cannot drift apart. */
function coordSpan(x,y,z){
  const c=x+', '+y+', '+z;
  return '<span class="idval" title="click to copy" data-c="'+c+'">'+c+'</span>';
}
/* H01 HAS NO NUCLEUS. It has a cell_bodies object and a c3 segment, in two different id spaces.
   The shared form asks this page what its two identifiers are called and where they live, and
   files the report against those -- the same nucleusId/rootId columns the sheet already has, with
   this dataset's own numbers in them, exactly as this page's own form filed them before it was
   retired (nucleusId:ID_CTX.body, rootId:ID_CTX.seg). */
window.UJ = window.UJ || {};
UJ.panel = UJ.panel || {};
UJ.panel.cellIds = function(c){
  return { nucId: (c && c.body) || "", root: (c && c.seg) || "",
           nucLabel: "cell body", rootLabel: "c3 segment" };
};

function showCell(i, distNm, fromHistory){'''

edit("hjump.html", [
    (u"REPORTER_EMAIL, which panel.js requires and this page did not have",
     REPORTER_OLD, REPORTER_NEW),
    (u"...filled from the Google payload", CRED_OLD, CRED_NEW),
    (u"the page loads the shared panel", TAG_OLD, TAG_NEW),
    (u"coordSpan, and what H01 calls its two ids", HOOK_ANCHOR, HOOK_NEW),
])

# ── the fork itself ───────────────────────────────────────────────────────────────────────────
# Cut by both endpoints, asserted against their exact text, never by substring: the file's own
# comments quote the code being removed, which is the trap that bit build_hjump.py twice.
CUT_START = u'''/* ── organelle reporting (2026-08-20, Søren: "I should be able to report the same organelles in'''
CUT_END = u'''function wireOrganelleForm(container,slug){'''

REPLACEMENT = u'''/* ── organelle reporting: SHARED, since 2026-09-20 ─────────────────────────────
   organelleFlagHtml / wireOrganelleFlag / organelleFormHtml / wireOrganelleForm used to be written
   out here, ~250 lines of them, deliberately mirroring core/panel.js's markup and ids so the two
   would "stay recognizable next to each other if anyone compares them". They did not stay
   recognizable. The bulk paste box became a shut <details> in core/panel.js on the morning of
   2026-09-20 and this page still had the old dashed slab, because nothing connected them but that
   sentence.

   Søren: "ηJump gets nothing automatically - we need to change that."

   The two reasons the copy existed are now joints in the shared file:
     - an OPTIONAL PREFIX on organelleFlagHtml/wireOrganelleFlag, so this page can keep mounting
       the form twice -- "nuc" on the cell card, nothing on the guided result -- without the two
       toggles fighting over one id;
     - UJ.panel.cellIds, set above, so the shared form says "cell body" and "c3 segment" over an
       H01 cell and files against those, instead of printing "nucleus" over a number that is not
       one.

   The call sites below are unchanged: organelleFlagHtml("nuc") / wireOrganelleFlag(null,"nuc") on
   the card, organelleFlagHtml() / wireOrganelleFlag(slug) on the guided result. They now reach
   core/panel.js. */
'''


def cut_the_fork():
    p = os.path.join(HERE, "hjump.html")
    s = io.open(p, encoding="utf-8").read()
    if u"organelle reporting: SHARED, since 2026-09-20" in s:
        print("  already there: the fork is gone, the shared form is in use")
        return
    a = s.find(CUT_START)
    assert a >= 0, "hjump.html: the fork's opening comment is not where it was"
    assert s.count(CUT_START) == 1, "hjump.html: the fork's opening comment is not unique"
    b = s.find(CUT_END, a)
    assert b >= 0, "hjump.html: wireOrganelleForm is not after the opening comment"
    # The end of wireOrganelleForm: the first line that is exactly "}" at column 0 after it.
    end = s.find(u"\n}\n", b)
    assert end >= 0, "hjump.html: wireOrganelleForm never closes at column 0"
    end += len(u"\n}\n")
    cut = s[a:end]
    # What is being removed has to BE the four functions and nothing else.
    for f in ["organelleFlagHtml", "wireOrganelleFlag", "organelleFormHtml", "wireOrganelleForm"]:
        assert cut.count(u"function " + f + u"(") == 1, \
            "the cut does not contain exactly one %s()" % f
    assert u"function showCell" not in cut and u"function idfPathText" not in cut, \
        "the cut has swallowed something that is not the form"
    print("  ok: the fork is cut (%d lines) and the shared form takes over"
          % cut.count(u"\n"))
    io.open(p, "w", encoding="utf-8").write(s[:a] + REPLACEMENT + s[end:])


cut_the_fork()

print(u"\nnow: node organcardcheck.js && node hjumpvolcheck.js "
      u"&& python3 src/build_stamps.py && node stampcheck.js")
