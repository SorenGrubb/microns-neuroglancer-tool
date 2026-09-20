# -*- coding: utf-8 -*-
u"""core/tracingcard.js, stage E: δJump loads it.                                2026-09-20

The third tool on the shared card, and the first one that is µJump-shaped. λJump proved the module
works for a host that has LESS than µJump — no segmentation, no meshes, no prediction tables.
δJump has nearly all of it, which tests the opposite edge: that the module's defaults are still
right when the host can answer everything.

── WHAT δJUMP ALREADY HAD, SURVEYED LIVE RATHER THAN ASSUMED ───────────────────

Read off the running page on 2026-09-20 (`typeof` each name, not `window[name]` — every one of
these is a top-level `const`, which never becomes a window property, and the first probe reported
them all undefined for exactly that reason):

    NID NT OWN_TYPE OWN_TYPE_NAMES CT_NAMES CT_CLASS   nidToIndex rootIdToIndex rootId longName
    buildState escHtml postReport REPORT_ENDPOINT REPORTER_NAME REPORTER_EMAIL
    GOOGLE_VERIFIED GOOGLE_CREDENTIAL showSubmitToast refreshFavStars

**The whole host contract, already there.** So δJump needs NO identityFor hook: the module's own
body reads those tables by the same names they have here, and a cell traced on δJump arrives in the
form with its predicted type already chosen — which is what the hook exists to allow, not to
replace.

── THE TWO THINGS IT CANNOT DO, AND ONE IT CAN ─────────────────────────────────

  seg    `graphene://middleauth+https://api.em.brain.allentech.org/...` — a live, CAVE-authenticated
         graphene volume, not a precomputed one core/segread.js could read even with a token. So
         `sources` names em and nuc and leaves seg empty, and the card removes the tick that would
         paint it. **Leaving sources unset would have been worse than wrong**: the fallback is the
         global SRC, whose `seg` is that graphene URL, so the tick would have stayed and failed.

  meshes ARE here — `meshBase` and `meshBaseAlt` are public, and only the root→fragment manifest
         needs a CAVE token. So the see-through cell stays: a control that needs a login is not a
         control that can never act, and the same login already gates this page's 3D.

  nuc    IS a public precomputed volume, so painting the NUCLEUS alone under the contours would
         work. Not offered here: the tick's wording promises the root ID in magenta and the nucleus
         in blue, and half of that is a control that lies. Worth doing as its own change.

── AND skipScales HAD TO REACH emtiles THROUGH THE CARD ────────────────────────

V1DD's scale list opens with a dead `placeholder` level (see
src/a_scale_with_no_data_is_not_a_scale.py). The page passes `skipScales` in its own emConfigure —
but the card configures emtiles itself in FOUR places when it finds it unconfigured, from
`tracingSources()`, which built `{em, seg, nuc, res}` and dropped anything else. Whichever ran
first would win, so opening the pad before the cell card could have left mip 0 on the dead level:
a flat grey rectangle, no chunks fetched, nothing in the console. `tracingSources()` now carries
skipScales through.

Run: python3 src/tracingcard_stage_e_djump.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
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


# ── 1. the card's own view of the sources carries the skip list ───────────────────────────────
SRC_OLD = u'''  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res };'''

SRC_NEW = u'''  /* skipScales COMES THROUGH, and it has to. This object is what the card hands to
     UJ.emtiles.configure() in four places when it finds the reader unconfigured — and on V1DD the
     volume's first scale is a `placeholder` that 404s. Dropping the field here would mean that
     whether δJump's mip 0 is real depended on whether the cell card or the pad configured emtiles
     first: open the pad before looking at a cell and the section is a flat grey rectangle, with no
     chunks fetched and nothing in the console. */
  return { em: o.em || "", seg: o.seg || "", nuc: o.nuc || "", res: res,
           skipScales: o.skipScales || [] };'''

print("core/tracingcard.js")
edit("core/tracingcard.js", [
    (u"tracingSources carries skipScales to emtiles", SRC_OLD, SRC_NEW),
], marker=u"skipScales COMES THROUGH")


# ── 2. δJump's four keys and its imagery ──────────────────────────────────────────────────────
CFG_OLD = u'''  res: [9, 9, 45]           // nm per voxel, x/y/z -- CONFIRMED empirically 2026-08-20 by'''

CFG_NEW = u'''  /* ── THE TRACING CARD ─────────────────────────────  2026-09-20
     core/tracingcard.js is the pad, the polygon tool, the volumes, the drafts and the link
     reader, extracted from µJump so five tools could share one card instead of forking five.
     Everything per-dataset about it is these few lines.

     THE FOUR KEYS ARE LITERALS AND THEY ARE δJUMP'S OWN. localStorage is one store shared by
     every page on grubblab.com; left unset, the module falls back to µJump's keys and the two
     tools read and write ONE list of tracings and ONE set of drafts. storagekeycheck.js fails
     until these are here, which is the point of it. Literals rather than `id + "_tracings_v1"`
     because that check can only audit a key it can read.

     sources IS A FUNCTION, so it is read after SRC exists further down this file.

     NO seg, DELIBERATELY. V1DD's segmentation is a live CAVE-authenticated graphene volume, not
     a precomputed one core/segread.js can read — so the card removes the tick that would paint
     it. Leaving `sources` unset would have been worse than omitting it: the fallback is the
     global SRC, whose seg IS that graphene URL, and the tick would have stayed and failed.

     nuc IS public and IS passed: painting the nucleus alone under the contours would work, and
     is simply not offered yet, because the tick's wording promises the root ID too.

     skipScales, because this volume's scale list opens with an entry that 404s — see
     emConfigure below. The card configures the reader itself when it finds it unconfigured, so
     the skip has to travel with the sources rather than living only in emConfigure.

     AND NO identityFor: this page has NID, NT, OWN_TYPE, OWN_TYPE_NAMES and CT_NAMES under the
     names the module already reads, so the default body answers and a traced cell arrives in the
     form with its predicted type chosen. The hook exists for pages that cannot do that. */
  tracing: {
    lsKey:     "djump_tracings_v1",
    draftsKey: "djump_tracing_drafts_v2",
    draftKey:  "djump_tracing_draft_v1",
    penKey:    "djump_tracing_pen_v1",
    sources:   function(){
                 return { em: SRC.em, nuc: SRC.nuc, skipScales: ["placeholder"] };
               }
  },
  res: [9, 9, 45]           // nm per voxel, x/y/z -- CONFIRMED empirically 2026-08-20 by'''

print("\ndjump.html")
edit("djump.html", [
    (u"δJump names its four tracing keys and its imagery", CFG_OLD, CFG_NEW),
], marker=u'lsKey:     "djump_tracings_v1"')


# ── 3. the module itself ──────────────────────────────────────────────────────────────────────
TAG_OLD = u'''<script src="core/tracing.js"></script>
<script src="core/ontology.js"></script>'''

TAG_NEW = u'''<script src="core/tracing.js"></script>
<!-- The tracing card, shared with µJump and λJump since 2026-09-20. Same slot as there: after
     the modules it is built on, before this page's own script, which supplies the host contract
     its header lists (buildState, escHtml, postReport, the NID/NT/OWN_TYPE tables). -->
<script src="core/tracingcard.js"></script>
<script src="core/ontology.js"></script>'''

edit("djump.html", [
    (u"core/tracingcard.js loads after the modules it needs", TAG_OLD, TAG_NEW),
])


# ── 4. somewhere for it to go ─────────────────────────────────────────────────────────────────
# δJump has no `<div id="panel">` — λJump's slot does not exist here. Its cell panel is
# #cellPanelCard inside the Jump tabpanel, and the card goes immediately after it, which is
# where µJump puts its own. Anchored on the copy-link row and the two closers that follow, because
# a bare `</div>\n</div>` appears all over a 8.6 MB page.
DIV_OLD = u'''<div class="actions"><button class="copy" id="copy">Copy link</button></div></div>
</div>
</div>
<div class="tabpanel" data-tabpanel="filter">'''

DIV_NEW = u'''<div class="actions"><button class="copy" id="copy">Copy link</button></div></div>
</div>

<!-- ── TRACE A CELL THE SEGMENTATION DOES NOT HAVE ───────────────  2026-09-20
     The same card µJump has. Here it matters for a second reason as well: V1DD's segmentation is
     behind a CAVE login, so a visitor without a token can see the EM, outline a cell on it and
     export the result without ever authenticating against the segmentation at all.

     EMPTY ON PURPOSE. core/tracingcard.js fills it on load: where the card sits is this page's
     decision, what is inside it is the module's. -->
<div class="card" id="tracingCard"></div>
</div>
<div class="tabpanel" data-tabpanel="filter">'''

edit("djump.html", [
    (u"an empty wrapper under the cell panel, inside the Jump tab", DIV_OLD, DIV_NEW),
])

print(u"\nnow: node storagekeycheck.js && node emdjumpcheck.js && node tracingcardhtmlcheck.js")
