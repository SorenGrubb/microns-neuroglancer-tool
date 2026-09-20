# -*- coding: utf-8 -*-
u"""δJump shows one plane of the EM beside the cell.                             2026-09-20

Søren, looking at δJump's cell card after stage E: *"Looks great, but I don't see the EM preview in
dJump."* He is right — stage E gave the page the EM stack and the tracing card, but the cell card
itself had no section on it. λJump got that in its own second slice; this is the same slice for
δJump.

── THE BLOCK IS READ OUT OF ljump.html, NOT RETYPED ────────────────────────────

178 lines carrying a token-guarded async draw, a scale bar, a delegated toggle and a dozen strings
is exactly the kind of thing a hand transcription gets 99% right — and the 1% is a token check that
silently stops dropping stale draws, so stepping through cells paints whichever fetch lands last.
The same rule stage C followed for the card's markup: nothing is typed, so nothing can be mistyped.
What IS typed is the substitution table below, and every entry in it is a measured difference
between the two datasets.

── WHAT V1DD DOES DIFFERENTLY ──────────────────────────────────────────────────

1. **mip 3 is 77.6 nm, and 248 px of it is 19.2 µm.** λJump draws 300 px at mip 4 (64 nm) because
   all ten of its scales keep 40 nm z. V1DD's usable levels are 9.7 / 19.4 / 38.8 / 77.6 nm, so
   there is no 64 nm to ask for. 300 px at 77.6 nm would be 23.3 µm and about 24 chunks; 248 px is
   **19.2 µm — the same tissue µJump shows — at about 15 chunks, the same cost µJump measured**.
   One level finer would be twice as sharp and roughly three times the fetches, because V1DD chunks
   64³ at every coarse level the way minnie65 does and unlike Lee16's constant 512×512×16.

2. **A section is 45 nm**, not 40. It is still one plane: all four usable scales keep 45 nm z, so
   the slab caveat µJump has to print does not apply here either.

3. **No segmentation half**, for a different reason than λJump's. Lee16 has no segmentation at all;
   V1DD has one and it is `graphene://middleauth+…`, a live CAVE-authenticated volume that
   core/segread.js cannot read even with a token. Same decision as the tracing card's seg tick,
   made for the same reason, and the nucleus volume — which IS public — is left for a change of its
   own rather than half-filling a control whose label promises both.

── AND ONE FAULT IN THE BLOCK ITSELF, FIXED IN BOTH COPIES ─────────────────────

`emPlaneBB()` read `info.scales[0]` and compared its voxel box against the tool's coordinate
DIRECTLY. That works on λJump only because Lee16's finest scale and λJump's frame are both 4 nm.
On V1DD it would have been wrong twice over: `scales[0]` is the dead `placeholder` level, and its
4.85 nm grid is not the page's 9/9/45 frame. The guard would have refused to draw real cells and
drawn ones that are outside.

Fixed by the module's own rule — **everything converts through nanometres** — and by asking
`UJ.emtiles.sectionScales()` for the first level that actually exists, which is where skipScales
already removed the placeholder. On λJump the change is a **no-op**, provably: its finest scale is
4 nm and its frame is 4 nm, so both sides of every comparison are multiplied by the same number.
Applied to both pages so the two copies stay identical and a later extraction into core/ is a move
rather than a merge.

Run: python3 src/djump_shows_the_section.py
"""
import io
import os
import re

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


def read(rel):
    return io.open(os.path.join(HERE, rel), encoding="utf-8").read()


# ══ 1. the box is computed in nanometres, on both pages ═══════════════════════════════════════
BB_OLD = u'''  try {
    var info = await UJ.segread._getInfo(UJ.segread._httpBase(UJ.cfg.viewer.em));
    var s = info.scales[0], o = s.voxel_offset || [0, 0, 0];
    EM_PLANE_BB = { x: [o[0], o[0] + s.size[0]], y: [o[1], o[1] + s.size[1]],
                    z: [o[2], o[2] + s.size[2]], res: s.resolution };
  } catch (_e) { EM_PLANE_BB = null; }'''

BB_NEW = u'''  try {
    var info = await UJ.segread._getInfo(UJ.segread._httpBase(EM_PLANE_SRC));
    /* THE FIRST LEVEL THAT EXISTS, AND IN NANOMETRES.  2026-09-20
       This read `info.scales[0]` and compared its voxel box against the tool's coordinate
       directly, which is right only where the two grids agree — they do here (4 nm and 4 nm) and
       they do not on δJump, whose frame is 9/9/45 against a 9.7 nm volume whose scales[0] is a
       dead `placeholder` level. sectionScales() is already the list with that removed. */
    var us = (UJ.emtiles && UJ.emtiles.sectionScales) ? UJ.emtiles.sectionScales(info) : null;
    var s = (us && us.length ? us : info.scales)[0], o = s.voxel_offset || [0, 0, 0],
        r = s.resolution;
    EM_PLANE_BB = { x: [o[0] * r[0], (o[0] + s.size[0]) * r[0]],
                    y: [o[1] * r[1], (o[1] + s.size[1]) * r[1]],
                    z: [o[2] * r[2], (o[2] + s.size[2]) * r[2]], nm: true, res: r };
  } catch (_e) { EM_PLANE_BB = null; }'''

GUARD_OLD = u'''    if (bb && (pos[0] < bb.x[0] || pos[0] > bb.x[1] || pos[1] < bb.y[0] || pos[1] > bb.y[1]
               || pos[2] < bb.z[0] || pos[2] > bb.z[1])) {'''

GUARD_NEW = u'''    /* The coordinate in nanometres, because the box is. A page whose frame happens to match the
       volume's finest scale gets the same answer either way — both sides multiplied by the same
       number — which is why this was invisible until a page came along where they differ. */
    var R = (UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    var pnm = [pos[0] * R[0], pos[1] * R[1], pos[2] * R[2]];
    if (bb && (pnm[0] < bb.x[0] || pnm[0] > bb.x[1] || pnm[1] < bb.y[0] || pnm[1] > bb.y[1]
               || pnm[2] < bb.z[0] || pnm[2] > bb.z[1])) {'''

# λJump names its source through UJ.cfg.viewer; δJump through SRC. One name in the block, set
# once per page, so the block itself is identical on both.
SRC_OLD = u'''var EM_PLANE_BB = null;'''
SRC_NEW = u'''/* The one name the block uses for this page's imagery, so the block itself is identical on every
   page that carries it. λJump keeps it on UJ.cfg.viewer, δJump in the global SRC. */
var EM_PLANE_SRC = UJ.cfg.viewer.em;
var EM_PLANE_BB = null;'''

print("ljump.html")
edit("ljump.html", [
    (u"the imagery has one name in the block", SRC_OLD, SRC_NEW),
    (u"the extent box is read in nanometres, off the first real scale", BB_OLD, BB_NEW),
    (u"...and the coordinate is compared in nanometres too", GUARD_OLD, GUARD_NEW),
])


# ══ 2. δJump gets the block, read out of λJump's page ═════════════════════════════════════════
def emplane_block():
    s = read("ljump.html")
    i = s.index(u"/* @emplane:start */")
    j = s.index(u"/* @emplane:end */") + len(u"/* @emplane:end */")
    b = s[i:j]
    assert u"drawPanelEmPlane" in b and u"emPlaneScaleBar" in b and u"wireEmPlaneToggle();" in b, \
        "the block read back does not look like the block"
    assert b.count(u"EM_PLANE_TOKEN !== tok") >= 5, "the stale-draw token checks are not all there"
    return b


SUBS = [
    # (what, from, to) -- every one a measured difference between the two datasets
    (u"its own remembered switch",
     u'var EM_PLANE_KEY = "ljump_panel_emplane"', u'var EM_PLANE_KEY = "djump_panel_emplane"'),

    (u"its own imagery",
     u'var EM_PLANE_SRC = UJ.cfg.viewer.em;', u'var EM_PLANE_SRC = SRC.em;'),

    (u"248x134 at mip 3",
     u'''/* 300x162 DRAWN, 260 SHOWN -- µJump's proportions, for the same reason: "how much tissue" and
   "how much room" are different questions. 300 data pixels into 260 display pixels costs nothing
   extra to fetch and is sharper on any 2x screen. */
var EM_PLANE_W = 300, EM_PLANE_H = 162, EM_PLANE_CSS = 260, EM_PLANE_MIP = 4;''',
     u'''/* 248x134 DRAWN, 260 SHOWN, AND THE WIDTH IS THE TISSUE RATHER THAN THE PIXELS.
   µJump draws 19.2 µm of cortex here because that is what Søren asked for, and it reaches it with
   300 px at 64 nm. V1DD has no 64 nm level -- its usable scales are 9.7 / 19.4 / 38.8 / 77.6 -- so
   the pixel count is what moves: 248 px at 77.6 nm is **the same 19.2 µm**.

   AND THE SAME COST. V1DD chunks 64³ at its coarse levels, the way minnie65 does and unlike
   Lee16's constant 512x512x16, so 19.2 µm is about fifteen chunks here exactly as it is on µJump.
   300 px would have been 23.3 µm and about twenty-four. One level finer, 38.8 nm, would be twice
   as sharp and roughly three times the fetches for the same picture. */
var EM_PLANE_W = 248, EM_PLANE_H = 134, EM_PLANE_CSS = 260, EM_PLANE_MIP = 3;'''),

    (u"45 nm sections, not 40",
     u'". One 40 nm section. Contrast "', u'". One 45 nm section. Contrast "'),

    # µ is written as a LITERAL BACKSLASH-u ESCAPE on this line of ljump.html -- it sits in a JS
    # comment, where nothing interprets it, so it reads as "\\u00b5Jump" to a person. Matched as it
    # really is; the replacement uses the character, which is what the rest of the block does.
    (u"...and the comment that says why it is still one",
     u'''    /* No slab caveat here, unlike \\u00b5Jump: every Lee16 scale keeps 40 nm sections, so this is one
       plane at every level and saying otherwise would be inventing a warning. */''',
     u'''    /* No slab caveat here, unlike µJump: all four of V1DD's usable scales keep 45 nm sections,
       so this is one plane at every level of them and saying otherwise would invent a warning. */'''),

    (u"it says which dataset the coordinate is outside of",
     u'"outside Lee16\\u2019s imagery, so there is no section to draw here"',
     u'"outside V1DD\\u2019s imagery, so there is no section to draw here"'),

    (u"the header says what this page's tissue and chunks are",
     u'''   WHAT IT COSTS, SAID PLAINLY. One 300x162 window at 64 nm is about fifteen chunks. Lee16's chunks
   are 512x512x16 at every level, so a section costs the same wherever you look -- unlike minnie65,
   whose coarse levels have narrower chunks and get MORE expensive as they show more. Cold, that is
   a few seconds; afterwards it is free, because core/segread.js caches by URL and range. Which is
   why this has a switch, and why the switch is REMEMBERED: somebody who turns it off on a slow
   connection should not meet it again on the next cell.

   NO SEGMENTATION HALF. µJump paints the cell's own segmentation over the section. Lee16's public
   release is image only -- see the Colab card's own note -- so there is nothing to paint and no
   tick offering to. A control that can never do anything is worse than no control.

   MIP 4 IS 64 nm HERE, AND IT IS A REAL SECTION. µJump needs emtiles' slabOk to reach 64 nm,
   because minnie65's 64 nm level averages two 40 nm sections and a tracing is section by section.
   Lee16 downsamples in x and y only -- all ten of its scales keep 40 nm z -- so 64 nm is just
   mip 4, it is one plane, and the caveat µJump has to print does not apply.''',
     u'''   WHAT IT COSTS, SAID PLAINLY. One 248x134 window at 77.6 nm is about fifteen chunks -- the same
   count µJump measured for the same 19.2 µm, because V1DD chunks 64³ at its coarse levels just as
   minnie65 does. Cold, that is a few seconds; afterwards it is free, because core/segread.js
   caches by URL and range. Which is why this has a switch, and why the switch is REMEMBERED:
   somebody who turns it off on a slow connection should not meet it again on the next cell.

   NO SEGMENTATION HALF, and for a different reason than λJump's. Lee16 has no segmentation at
   all; V1DD has one and it is graphene://middleauth+ -- a live CAVE-authenticated volume that
   core/segread.js cannot read even with a token. Same decision as the tracing card's seg tick.
   The NUCLEUS volume is public and could be painted; that is left for a change of its own rather
   than half-filling a control whose label promises the cell as well.

   MIP 3 IS 77.6 nm HERE, AND IT IS A REAL SECTION. µJump needs emtiles' slabOk to reach 64 nm,
   because minnie65's 64 nm level averages two 40 nm sections. V1DD downsamples in x and y only
   until 155.2 nm, so all four usable levels keep 45 nm z -- this is one plane, and the caveat
   µJump has to print does not apply. There is no 64 nm level to ask for, which is why the pixel
   count moves instead of the level; see EM_PLANE_W.''')
]


def djump_block():
    b = emplane_block()
    for name, old, new in SUBS:
        n = b.count(old)
        assert n == 1, "emplane / %s: %d matches" % (name, n)
        b = b.replace(old, new, 1)
        print("  sub: " + name)
    # NOTHING THAT WOULD BE A CLAIM ABOUT THE WRONG DATASET may survive the move. Not "no mention
    # of Lee16" -- the header compares the two deliberately, and that sentence is worth keeping.
    # These are the five that would be false on this page.
    for bad in [u"ljump_",                    # λJump's remembered switch
                u"= UJ.cfg.viewer",           # reading from a config object δJump has not got
                                              # (the comment beside it names both, and should)
                u'"outside Lee16',            # the message a reader would actually see
                u"One 40 nm section",         # in the canvas title; V1DD's are 45
                u"all ten of its scales"]:    # Lee16 has ten, V1DD has four
        assert bad not in b, "the ported block still says %r" % bad
    assert u"djump_panel_emplane" in b and u"SRC.em" in b, "the block was not pointed at this page"
    return b


print("\ndjump.html")
BLOCK = djump_block()

PLANE_ANCHOR = u'''function emConfigure(){'''
MOUNT_OLD = u'''  h+=renderLocationDiagram(pos);
  h+='<div class="meta">nearest nucleus at voxel '''
MOUNT_NEW = u'''  h+=renderLocationDiagram(pos);
  /* The section goes under the layer diagram and the top view, which is the slot µJump uses:
     the reader is already asking where this cell is rather than what it is. */
  h+=emPlaneBox(pos);
  h+='<div class="meta">nearest nucleus at voxel '''

edit("djump.html", [
    (u"one plane of the EM, ported from λJump's page", PLANE_ANCHOR, BLOCK + u"\n" + PLANE_ANCHOR),
    (u"...shown under the location diagrams", MOUNT_OLD, MOUNT_NEW),
], marker=u"@emplane:start")

print(u"\nnow: node emdjumpcheck.js && node emljumpcheck.js && node emplanecheck.js "
      u"&& node storagekeycheck.js")
