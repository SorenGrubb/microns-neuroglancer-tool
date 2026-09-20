# -*- coding: utf-8 -*-
u"""One way to log an organelle on ηJump's card, and a joint that stopped being needed. 2026-09-20

Found by screenshotting ηJump's card ten minutes after giving it the community block
(src/whose_prediction_is_it_anyway.py): "Log an organelle here" appeared TWICE on it.

Both were correct on the day they were written, and together they are a defect:

  - core/panel.js renders one inside #commReports, beside what is already logged on the cell
    ("nothing logged yet" / "add another, or suggest a different location"). µJump, δJump, πJump,
    λJump and βJump have only ever had this one;
  - ηJump grew its own on 2026-09-03 — Søren: *"I want the same function on the identity cards of
    all the other tools, so that you don't have to run through the guided identification before
    you can report organelles"* — mounted under the guided-ID call to action, BECAUSE ηJump had no
    #commReports for the shared one to live in.

That reason lasted until this afternoon. The card now has #commReports, so the shared affordance is
there, with the read-back ηJump's own mount never had. The local one goes, and the card matches the
other five.

NOT AN ID COLLISION, which is worth recording because it looks like one. panel.js's in-report mount
uses commOrganelleToggle / commOrganelleBody, deliberately distinct from the guided screen's
idfOrganelleToggle / organelleInlineBody (its own comment says why). Nothing was broken; there were
simply two of them.

── AND THE PREFIX GOES WITH IT ──────────────────────────────────────────────

organelleFlagHtml(pfx) / wireOrganelleFlag(slug, pfx) got an optional prefix this afternoon
(src/the_shared_form_learns_a_second_dataset.py) for exactly one caller: ηJump's cell-card mount,
which could not reuse the guided screen's ids because both panels are in the DOM at once.

With that mount gone the prefix has no caller anywhere, and the two remaining mounts are distinct by
construction rather than by parameter. So it goes back to the signature it had this morning.

REMOVING IT IS THE POINT, not tidiness. An optional parameter kept "in case" is a parameter the
next person copies, and the whole argument of this week's work is that machinery with no live
justification is how six tools came to have six versions of the same form. The joint solved a
problem that no longer exists; the honest thing is to say so and take it out, not to leave it
sitting there looking load-bearing.

The OTHER joint from that pass — UJ.panel.cellIds — stays: H01 still has a cell body and a c3
segment where MICrONS has a nucleus and a root, and that is not going to stop being true.

Run: python3 src/one_way_to_log_an_organelle.py
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


# ── 1. ηJump's own mount on the cell card ─────────────────────────────────────────────────────
MOUNT_OLD = u'''  /* ORGANELLES WITHOUT THE GUIDED IDENTIFICATION (Søren, 2026-09-03). Under the guided-ID
     call to action, because these are the two ways of contributing to a cell and neither should
     be a precondition for the other -- knowing there is a cilium on this cell is not the same
     knowledge as knowing what kind of cell it is, and the page should not demand the second
     before accepting the first. */
  h+=organelleFlagHtml("nuc");
'''
MOUNT_NEW = u'''  /* ORGANELLES WITHOUT THE GUIDED IDENTIFICATION (Søren, 2026-09-03): *"I want the same function
     on the identity cards of all the other tools, so that you don\'t have to run through the
     guided identification before you can report organelles."* Still true, and it is now
     core/panel.js that does it — the "Log an organelle here" line inside #commReports above,
     which every other tool in the family has, and which comes with the read-back of what is
     already logged on this cell.

     This page used to mount its OWN copy here, prefixed "nuc", for one reason: it had no
     #commReports for the shared one to live in. It got one on 2026-09-20 and the card was showing
     the same affordance twice, so the local mount is gone. Neither was broken — panel.js keeps
     commOrganelleToggle apart from the guided screen’s idfOrganelleToggle on purpose — there were
     simply two of them. */
'''

WIRE_OLD = u'''  wireOrganelleFlag(null,"nuc");
'''
WIRE_NEW = u''

print("hjump.html")
edit("hjump.html", [
    (u"the cell card stops mounting its own organelle link", MOUNT_OLD, MOUNT_NEW),
    (u"...and stops wiring it", WIRE_OLD, WIRE_NEW),
])

# ── 2. the prefix, now that nothing passes one ────────────────────────────────────────────────
# ANCHORED ON THE SIGNATURE, AND CUT BACKWARDS TO THE COMMENT. The first version quoted the whole
# comment block as a literal and matched nothing: its box-drawing rule is a run of box-drawing
# characters whose length cannot be reproduced by counting -- something this project has written
# down once already and met again here. The function signature is code, is unique, and is the
# thing being replaced.
PFX_HEAD = u'''/* ── AN OPTIONAL PREFIX'''
PFX_OLD = u'''function organelleFlagHtml(pfx){
  var tog = (pfx || "idf") + "OrganelleToggle";
  var bod = pfx ? pfx + "OrganelleInlineBody" : "organelleInlineBody";
  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Log an organelle here <span class="idf-back" id="'+tog+'" style="margin:0">Log one &rarr;</span></span>'
    +'<div id="'+bod+'" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div></div>';
}
function wireOrganelleFlag(slug,pfx){'''

PFX_TAIL = (u'''  const toggle=document.getElementById((pfx||"idf")+"OrganelleToggle"),'''
            u'''body=document.getElementById(pfx?pfx+"OrganelleInlineBody":"organelleInlineBody");''')

PFX_NEW = u'''/* ── A PREFIX THAT LASTED HALF A DAY ──────────────────────────  2026-09-20
   These two took an optional `pfx` for part of 2026-09-20, added so ηJump could mount this form on
   its cell card as well as its guided-ID screen without the two toggles sharing an id.

   It had exactly one caller, and that caller was itself a workaround: ηJump mounted its own copy
   on the card only because it had no #commReports for the shared one to live in. It got one the
   same afternoon, the card started showing "Log an organelle here" twice, and the local mount went
   — taking the prefix's only reason with it. The two mounts that remain are distinct by
   construction: loadCommunityReports uses commOrganelleToggle / commOrganelleBody, and the guided
   screen uses the ids below.

   Taken out rather than left optional. A parameter kept "in case" is one the next person copies,
   and machinery with no live justification is how six tools came to carry six versions of this
   form in the first place. */
function organelleFlagHtml(){
  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Log an organelle here <span class="idf-back" id="idfOrganelleToggle" style="margin:0">Log one &rarr;</span></span>'
    +'<div id="organelleInlineBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div></div>';
}
function wireOrganelleFlag(slug){
  const toggle=document.getElementById("idfOrganelleToggle"),body=document.getElementById("organelleInlineBody");'''

# ── the seed, which was written for one vocabulary ────────────────────────────────────────────
# Found the moment the shared mount became ηJump's only one: opening the form from inside
# #commReports printed no cell at all. That mount seeds ID_CTX for the form, and it seeds it by
# REPLACEMENT, in MICrONS's words -- {nucId, root, pos} -- which wipes ηJump's {i, seg, body, pos,
# layer, depth, published} and leaves UJ.panel.cellIds reading c.body off an object that no longer
# has one.
#
# NOT FIXED BY MERGING, which was the first idea and is wrong: µJump, δJump and πJump also read
# ID_CTX.suggested, ID_CTX.locationOnly and ID_CTX.noNucleus, all set by a guided-ID run, and two
# of those change what a submission MEANS. Preserving them from a run on a different cell is worse
# than losing a label. The replacement is deliberate and stays the default.
#
# So the host gets a say, the same way it does about what its ids are called. A page that keeps
# ID_CTX current for the cell on screen -- which ηJump's showCell does, every time -- says so, and
# its own vocabulary survives.
SEED_OLD = (u'''            ID_CTX={nucId:((typeof CUR_NUCID!=="undefined"&&CUR_NUCID)||nid||""),'''
            u'''root:((typeof CUR_ROOT!=="undefined"&&CUR_ROOT)||""),pos:cellPos||null};''')
SEED_NEW = (u'''            ID_CTX=panelSeedCtx({nucId:((typeof CUR_NUCID!=="undefined"&&CUR_NUCID)||nid||""),'''
            u'''root:((typeof CUR_ROOT!=="undefined"&&CUR_ROOT)||""),pos:cellPos||null});''')

# ANCHORED ON panelSource, NOT panelCellIds, AND THE DIFFERENCE IS NOT COSMETIC.
# src/whose_prediction_is_it_anyway.py inserts panelSource() immediately before panelCellIds(), and
# its "already there" guard is the whole inserted block INCLUDING that trailing anchor line. Putting
# this function in between splits that block, the guard stops matching, and a second run of THAT
# generator inserts panelSource all over again -- caught by a round-trip test showing a duplicated
# 37-line function that neither generator's own run had revealed.
#
# Two generators that share an anchor are only safe while nothing lands between the anchor and
# what was anchored to it -- and moving this above panelSource was NOT enough, because that put it
# between that generator's own comment and its function, splitting the guard the other way. The
# fix is to land nowhere inside the other block at all: panelDsQS is untouched by both.
SEEDFN_ANCHOR = u'''function panelDsQS(){'''
SEEDFN = u'''/* ── WHO DECIDES WHAT THE FORM IS FILED AGAINST ───────────────────  2026-09-20
   Opening the organelle form from inside the community block seeds ID_CTX, because coming from
   there no guided-ID run has populated it. It seeds by REPLACEMENT and in this file's own
   vocabulary, {nucId, root, pos} — which on ηJump wiped {i, seg, body, pos, layer, depth,
   published} and left the form with no cell to name.

   MERGING WOULD BE WORSE, which is why it is a hook and not an Object.assign: µJump, δJump and
   πJump also read ID_CTX.suggested, ID_CTX.locationOnly and ID_CTX.noNucleus, all set by a guided
   run, and two of those change what a submission means. Carrying them over from a run on a
   DIFFERENT cell is a wrong submission, not a wrong label. So replacement stays the default.

   A host whose own showCell already keeps ID_CTX current for the cell on screen can say so by
   defining UJ.panel.seedCtx and returning what it wants kept. */
function panelSeedCtx(seed){
  if (typeof UJ !== "undefined" && UJ.panel && typeof UJ.panel.seedCtx === "function"){
    try { return UJ.panel.seedCtx(seed) || seed; } catch (_e){ return seed; }
  }
  return seed;
}
function panelDsQS(){'''

edit("core/panel.js", [
    (u"the host may keep its own ID_CTX when the form opens", SEEDFN_ANCHOR, SEEDFN),
    (u"...and the seed asks it", SEED_OLD, SEED_NEW),
])

HJ_SEED_OLD = u'''UJ.panel.source = { label: "H01", noun: "published classification" };'''
HJ_SEED_NEW = u'''UJ.panel.source = { label: "H01", noun: "published classification" };
/* showCell sets ID_CTX for the cell on screen every single time, in this page's own terms — the
   cell_bodies id, the c3 segment, the layer, the depth, whether H01 published a type. Opening the
   shared organelle form would otherwise replace all of that with {nucId, root, pos} and leave
   UJ.panel.cellIds above reading a `body` that is no longer there. Nothing to seed: it is already
   right. */
UJ.panel.seedCtx = function(){ return ID_CTX; };'''

edit("hjump.html", [
    (u"...and this page keeps its own, because showCell already set it", HJ_SEED_OLD, HJ_SEED_NEW),
])


def drop_the_prefix():
    p = os.path.join(HERE, "core", "panel.js")
    s = io.open(p, encoding="utf-8").read()
    if u"A PREFIX THAT LASTED HALF A DAY" in s:
        print("  already there: the prefix is gone, with the mount that needed it")
        return
    b = s.find(PFX_OLD)
    assert b >= 0 and s.count(PFX_OLD) == 1, "core/panel.js: organelleFlagHtml(pfx) is not unique"
    a = s.rfind(PFX_HEAD, 0, b)
    assert a >= 0 and b - a < 900, "core/panel.js: the prefix's comment is not just above it"
    end = s.find(PFX_TAIL, b)
    assert end > b, "core/panel.js: wireOrganelleFlag's first line is not where it was"
    end += len(PFX_TAIL)
    io.open(p, "w", encoding="utf-8").write(s[:a] + PFX_NEW + s[end:])
    print("  ok: the prefix goes, with the mount that needed it")


drop_the_prefix()

# Nothing anywhere may still pass one -- this is the assertion that makes the removal safe rather
# than hopeful. Comments stripped first: hjump.html now EXPLAINS the prefix's removal in prose, and
# a substring test would fail on the explanation, which is the trap this repo keeps re-learning.
import re

for rel in ["core/panel.js", "ujump.html", "djump.html", "pjump.html", "ljump.html",
            "bjump.html", "hjump.html"]:
    s = io.open(os.path.join(HERE, rel), encoding="utf-8").read()
    bare = re.sub(r"/\*[\s\S]*?\*/", "", s)
    bare = re.sub(r"^\s*//.*$", "", bare, flags=re.M)
    for bad in [u'organelleFlagHtml("', u"organelleFlagHtml('",
                u'wireOrganelleFlag(null,', u'wireOrganelleFlag(slug,']:
        assert bad not in bare, "%s still passes a prefix: %s" % (rel, bad)
print("  ok: no page passes a prefix any more")

print(u"\nnow: node organcardcheck.js && node cellfoldcheck.js hjump.html "
      u"&& node bulkorgancheck.js && python3 src/build_stamps.py && node stampcheck.js")
