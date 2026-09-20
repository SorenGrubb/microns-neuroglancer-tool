# -*- coding: utf-8 -*-
u"""core/tracingcard.js, stage D: the second tool loads it.                      2026-09-20

Stages A–C moved 3,700 lines and the card's markup out of ujump.html into core/tracingcard.js and
left µJump byte-for-byte unchanged. That proves nothing was broken; it does not prove the module is
usable by anybody else. **A shared file with one caller is not shared, it is just moved.** This is
the edit that tests the host contract by being the first page to satisfy it.

λJump rather than πJump, and that reversal was measured, not argued: πJump's pinky100 EM answered
404 on 27 chunk probes across the volume at two scales and both chunk alignments, so it has no
imagery to trace on — see claude/which-datasets-can-be-traced-on.md. Lee16 reads 27/27.

── WHAT λJUMP HAS TO SUPPLY, AND WHAT IT DELIBERATELY DOES NOT ────────────────

  the script tag       after core/tracing.js, before the page's own script — the same slot µJump
                       uses, and for the same reason: the eight modules it is built on load first,
                       the host contract (buildState, escHtml, postReport) comes after.
  #tracingCard         empty. Where the card sits is the page's decision; what is inside it is the
                       module's. µJump puts it in the Jump tab; λJump puts it under the panel,
                       which is where its own cell card ends.
  four storage keys    literals, its own. storagekeycheck.js FAILS UNTIL THEY ARE THERE — with the
                       tag added and the keys missing it reports four collisions by name, which is
                       the guard doing its job, not a regression.
  sources              a function, so it is read after UJ.cfg.viewer exists. em only: Lee16 has no
                       segmentation and no nucleus volume, and the card removes the controls that
                       would need them.

  NO identityFor.      Lee16 has no prediction tables, so tracingIdentityFor returns null and the
                       community-identity line does not appear. **That is a real state, not a
                       degraded one** — the alternative is a card claiming a cell type nobody
                       predicted.

Run: python3 src/tracingcard_stage_d_ljump.py
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


# ── 1. the four keys and the imagery, in CONFIG where an auditor can read them ────────────────
CFG_OLD = u'''  res: [4, 4, 40]
};'''

CFG_NEW = u'''  res: [4, 4, 40],
  /* ── THE TRACING CARD ─────────────────────────────  2026-09-20
     core/tracingcard.js is 3,700 lines of pad, polygon tool, volumes, drafts and link reading,
     extracted from µJump so it could be shared rather than forked. λJump is the first page other
     than µJump to load it, and everything per-dataset about it is these few lines.

     THE FOUR KEYS ARE LITERALS AND THEY ARE λJUMP'S OWN. localStorage is one store shared by
     every page on grubblab.com: had these been left unset, the module's fallbacks are µJump's
     keys and the two tools would read and write ONE list of tracings and ONE set of drafts — the
     bug storagekeycheck.js was written after µJump and πJump spent a week overwriting each
     other's navigation history. Literals rather than `id + "_tracings_v1"` because that check can
     only audit a key it can read, and because µJump's own id is "microns", not "ujump".

     sources IS A FUNCTION so it is read after UJ.cfg.viewer is assigned, further down this file.
     em only. Lee16 is image only — no segmentation, no nucleus volume, no meshes — and the card
     removes the two ticks that would need them rather than offering controls that can only fail.

     AND NO identityFor. There are no prediction tables for this dataset, so the card's community
     identity line stays away. Absent rather than stubbed, which is this page's whole rule. */
  tracing: {
    lsKey:     "ljump_tracings_v1",
    draftsKey: "ljump_tracing_drafts_v2",
    draftKey:  "ljump_tracing_draft_v1",
    penKey:    "ljump_tracing_pen_v1",
    sources:   function(){ return { em: UJ.cfg.viewer.em }; }
  }
};'''

print("ljump.html")
edit("ljump.html", [
    (u"λJump names its four tracing keys and its imagery", CFG_OLD, CFG_NEW),
], marker=u'lsKey:     "ljump_tracings_v1"')


# ── 2. the module itself ──────────────────────────────────────────────────────────────────────
TAG_OLD = u'''<script src="core/tracing.js"></script>
<script src="core/ontology.js"></script>'''

TAG_NEW = u'''<script src="core/tracing.js"></script>
<!-- The tracing card, shared with µJump since 2026-09-20. Same slot as there: after the modules
     it is built on, before this page's own script, which supplies the host contract its header
     lists (buildState, escHtml, postReport, UJ.cfg.tracing). -->
<script src="core/tracingcard.js"></script>
<script src="core/ontology.js"></script>'''

edit("ljump.html", [
    (u"core/tracingcard.js loads after the modules it needs", TAG_OLD, TAG_NEW),
])


# ── 3. somewhere for it to go ─────────────────────────────────────────────────────────────────
DIV_OLD = u'''<div id="panel"></div>'''

DIV_NEW = u'''<div id="panel"></div>

<!-- ── TRACE A CELL THIS DATASET HAS NO SEGMENTATION FOR ─────────────  2026-09-20
     On µJump this card is for the cells minnie65's segmentation missed. Here it is for ALL of
     them: the Lee16 public release is image only, so every cell in this volume is a cell you have
     to outline yourself. The pad draws the EM section, the polygon tool puts vertices on it, and
     what comes out is a mesh the Blender export can take — the same path µJump uses.

     EMPTY ON PURPOSE. core/tracingcard.js fills it on load: where the card sits is this page's
     decision, what is inside it is the module's. -->
<div class="card" id="tracingCard"></div>'''

edit("ljump.html", [
    (u"an empty wrapper under the cell panel", DIV_OLD, DIV_NEW),
])

print(u"\nnow: node storagekeycheck.js && node emljumpcheck.js && node tracingcardhtmlcheck.js")
