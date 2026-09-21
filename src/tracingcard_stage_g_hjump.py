# -*- coding: utf-8 -*-
u"""core/tracingcard.js, stage G: ηJump loads it.                                2026-09-21

The fifth and last tool with imagery to get the shared card. Needs
src/a_chunk_can_be_a_jpeg.py and src/hjump_gets_the_em_in_the_page.py first.

After this, every tool whose EM can be read carries the card: µJump, λJump, δJump, βJump and ηJump.
πJump cannot — its bucket serves an info file and no chunks (claude/which-datasets-can-be-traced-on.md).

── WHAT ηJUMP HANDS THE CARD ────────────────────────────────────────────────────

  em    the JPEG imagery, through the JSON API
  seg   c3 — readable, and the page's own id space (eight of eight cells read back as c3Id(i)).
        So, as on µJump and βJump: the pad fills the root ID from a coordinate, keeps the tick that
        paints the cell, and the 3D preview can draw it see-through — H01's meshes need no token.
  nuc   none. H01 has no nucleus volume. The card's nucleus box holds the cell-body id here, and
        since stage F the card sends a nucleus id nowhere a dataset has no volume for.

The intro stays µJump's — "For a cell the segmentation does not have." — because that is exactly
H01's case: c3 is a conservative agglomeration, and this page's own extra-id panel exists because
it splits cells.

Run: python3 src/tracingcard_stage_g_hjump.py
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


CFG_OLD = u'''  datasetCredit: "H01 \\u00b7 Shapson-Coe et al., Science 2024",
  res: [8, 8, 33]                       // nm per voxel, the H01 viewer's native frame
};'''
CFG_NEW = u'''  datasetCredit: "H01 \\u00b7 Shapson-Coe et al., Science 2024",
  /* ── THE TRACING CARD ─────────────────────────────  2026-09-21
     core/tracingcard.js, shared with µJump, λJump, δJump and βJump.

     THE FOUR KEYS ARE ηJUMP'S OWN, as literals — localStorage is one store across grubblab.com,
     and storagekeycheck.js fails until a host names them.

     seg IS c3, and c3 is readable: segread read it at eight cells' somata and returned exactly
     c3Id(i) every time. So the pad fills the root ID from a coordinate and keeps the tick that
     paints the cell. No nuc: H01 has no nucleus volume, and the card's nucleus box holds the
     cell-body id, which nothing here can paint by.

     sources is a function because UJ.cfg.viewer is defined further down this script. */
  tracing: {
    lsKey:     "hjump_tracings_v1",
    draftsKey: "hjump_tracing_drafts_v2",
    draftKey:  "hjump_tracing_draft_v1",
    penKey:    "hjump_tracing_pen_v1",
    sources:   function(){ return { em: UJ.cfg.viewer.em, seg: UJ.cfg.viewer.seg }; }
  },
  res: [8, 8, 33]                       // nm per voxel, the H01 viewer's native frame
};'''

TAG_OLD = u'''<script src="core/tracing.js"></script>
<script src="core/ontology.js"></script>'''
TAG_NEW = u'''<script src="core/tracing.js"></script>
<!-- The tracing card, shared with µJump, λJump, δJump and βJump. After the modules it is built
     on, before this page's own script, which supplies the host contract its header lists. -->
<script src="core/tracingcard.js"></script>
<script src="core/ontology.js"></script>'''

DIV_OLD = u'''<div class="idf" id="idfpanel"></div>
</div>
<div class="card">
<label>About this dataset</label>'''
DIV_NEW = u'''<div class="idf" id="idfpanel"></div>
</div>

<!-- ── TRACE A CELL THE SEGMENTATION DOES NOT HAVE ───────────────  2026-09-21
     The same card µJump has, under the cell panel. On H01 it is for what c3's conservative
     agglomeration split off or missed — the reason this page already has an extra-id panel.

     EMPTY ON PURPOSE. core/tracingcard.js fills it on load. -->
<div class="card" id="tracingCard"></div>

<div class="card">
<label>About this dataset</label>'''

print("hjump.html")
edit("hjump.html", [
    (u"ηJump names its four tracing keys, its imagery and c3", CFG_OLD, CFG_NEW),
    (u"core/tracingcard.js loads after the modules it needs", TAG_OLD, TAG_NEW),
    (u"an empty wrapper under the cell panel", DIV_OLD, DIV_NEW),
])
