# -*- coding: utf-8 -*-
u"""δJump gets the EM in the page.                                               2026-09-20

First slice of the tracing card's port to δJump, and the same slice λJump needed in
src/ljump_gets_the_em_in_the_page.py. The card draws one section of EM *in the page*, so before
any of it can exist the page has to be able to fetch and stretch its own imagery.

δJump loads **none** of the EM stack today — no segread, no emtiles, no tracepad. Surveyed live
rather than assumed: its thirteen core tags are mesh, colabexport, blenderexport, organellefilter,
points, matchcount, gamify, organelles, ontology, panel, tree, report, stepthrough.

── WHAT THE VOLUME IS, READ FROM ITS OWN info ON 2026-09-20 ────────────────────

    gs://v1dd_imagery/image/aligned_image   uint8, 1 channel, raw, UNSHARDED, 8 scales

    placeholder      4.85 nm   chunk 2048x2048x128   ** 404 at two alignments **
    9.7_9.7_45       9.7 nm    chunk  128x 128x 16   200, 262,144 bytes, 16/16 positions
    19.4_19.4_45     19.4 nm   chunk   64x  64x 64
    38.8_38.8_45     38.8 nm   chunk   64x  64x 64
    77.6_77.6_45     77.6 nm   chunk   64x  64x 64
    155.2_155.2_90   <- z doubles here, so a "section" stops being one

So four usable levels and **45 nm sections**, not 40. The placeholder is skipped by name through
core/emtiles.js's skipScales — see src/a_scale_with_no_data_is_not_a_scale.py.

── THE TOOL'S FRAME IS 9/9/45 AND THE IMAGERY'S IS 9.7 ─────────────────────────

They do not agree, and emtiles converts through nanometres for exactly this reason. Checked rather
than trusted: sixteen nucleus coordinates taken from δJump's own browse button, converted
`voxel x 9 nm / 9.7 nm`, all sixteen landed on chunks full of tissue. The first attempt, at
coordinates picked off the volume's nominal size instead, hit padding eight times out of nine —
so this is a test that can fail, and it passed.

── THE CONTRAST WINDOW IS SØREN'S OWN, NOT A SECOND OPINION ────────────────────

This page already carries one: `EM_SHADER_CONTROLS = {normalized:{range:[115,144]}}`, tuned
against the EM in Spelunker on 2026-08-20 and used for every viewer link it builds. The pad reads
THAT, so the section drawn in the page and the section in the viewer are stretched the same way and
cannot drift apart.

Measured independently anyway, the way λJump's was: 770,048 tissue pixels over 16 chunks spread
across the volume, three planes each, zeros excluded because 2.1% of the sample is padding at the
tissue edge rather than stain.

    0.5% → 101   2% → 111   5% → 118   median 131   95% → 147   98% → 149   range 60–173

A 2–98% stretch is 111 → 149 against Søren's 115 → 144. **The two agree**, his being the tighter
and more contrasty of the two, which is a choice and not an error. V1DD is a far lower-contrast
stain than either of the others: emtiles' default 86–172 is 86 levels wide and Lee16's is 194,
where this tissue lives in about 38.

Run: python3 src/djump_gets_the_em_in_the_page.py
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


# ── 1. the eight modules the pad is built from ────────────────────────────────────────────────
TAGS_OLD = u'''<script src="core/gamify.js"></script>
<script src="core/organelles.js"></script>
<script src="core/ontology.js"></script>'''

TAGS_NEW = u'''<script src="core/gamify.js"></script>
<script src="core/organelles.js"></script>
<!-- ── THE EM STACK ───────────────────────────────────  2026-09-20
     Eight modules, the same eight and in the same order µJump and λJump load them, because the
     tracing card is built on all of them and a different order here would be a difference nobody
     could see until something failed. segread fetches and caches chunks; emtiles turns a
     coordinate into a section; tracepad and traceloft are the polygon tool and the lofting;
     tracing reads contours out of a pasted viewer link.

     THEY GO BEFORE ontology/panel, not after: core/tracingcard.js reads LEAF_NAMES out of
     core/ontology.js at wire time, not at parse time, but the page's own script is what supplies
     the host contract and that runs last either way. -->
<script src="core/segread.js"></script>
<script src="core/segpaint.js"></script>
<script src="core/organellelink.js"></script>
<script src="core/emtiles.js"></script>
<script src="core/tracepad.js"></script>
<script src="core/traceloft.js"></script>
<script src="core/nucmesh.js"></script>
<script src="core/tracing.js"></script>
<script src="core/ontology.js"></script>'''

print("djump.html")
edit("djump.html", [
    (u"the eight EM modules load", TAGS_OLD, TAGS_NEW),
], marker=u'<script src="core/emtiles.js"></script>')


# ── 2. the window and the one place the reader is pointed at this dataset ─────────────────────
CONF_OLD = u'''const NUC_INFO="https://storage.googleapis.com/v1dd_imagery/v1dd_nuclei/segmentation/info";'''

CONF_NEW = u'''
/* ── THE SAME WINDOW THE VIEWER LINKS USE ────────────────  2026-09-20
   core/emtiles.js stretches [lo,hi] to black-white and defaults to 86/172 — minnie65's numbers,
   sitting in a shared file as though they were every dataset's. V1DD's stain is far flatter than
   that: its tissue lives in about 38 levels where minnie65's default spans 86.

   READ OFF EM_SHADER_CONTROLS RATHER THAN WRITTEN AGAIN. That is the invlerp window Søren tuned
   against this EM in Spelunker on 2026-08-20, and every viewer link this page builds already uses
   it. Deriving the pad's window from it means the section drawn HERE and the section drawn THERE
   are stretched identically, and that one edit moves both. A second literal would be a second
   opinion that nothing would notice had drifted.

   MEASURED INDEPENDENTLY ANYWAY, the way λJump's was: 770,048 tissue pixels over 16 chunks spread
   across the volume, three planes each, zeros excluded — 2.1% of the sample is black padding at
   the tissue edge rather than stain, and averaging it in would drag the low end to nothing.

       0.5% → 101    2% → 111    5% → 118    median 131    95% → 147    98% → 149    range 60–173

   A 2–98% stretch is 111–149 against Søren's 115–144. The two agree; his is the tighter and more
   contrasty, which is a choice, so his is the one that ships. */
const EM_WINDOW = { lo: EM_SHADER_CONTROLS.normalized.range[0],
                    hi: EM_SHADER_CONTROLS.normalized.range[1] };

/* The one place the reader is pointed at this dataset. Called before any draw; emtiles keeps ONE
   configured source, so configuring twice is harmless and configuring nowhere is a blank canvas.
   Guarded because every other card on this page worked before the EM stack existed, and a page
   that loses one script should lose one card rather than the cell.

   skipScales NAMES THE DEAD LEVEL. V1DD's scale list opens with `key: "placeholder"`, 4.85 nm,
   chunk 2048×2048×128, and it 404s at its own voxel_offset and at the origin — probed live
   2026-09-20. Its z is 45 nm like the real scales, so emtiles' section filter cannot tell it apart
   and mip 0 would be the dead one. The page knows; the shared module does not. */
function emConfigure(){
  if (typeof UJ === "undefined" || !UJ.emtiles || !UJ.segread) return false;
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure({ em: SRC.em, res: UJ.cfg.res, skipScales: ["placeholder"] });
  return true;
}

const NUC_INFO="https://storage.googleapis.com/v1dd_imagery/v1dd_nuclei/segmentation/info";'''

edit("djump.html", [
    (u"the pad reads the window the viewer links already use", CONF_OLD, CONF_NEW),
], marker=u"THE SAME WINDOW THE VIEWER LINKS USE")

print(u"\nnow: node emdjumpcheck.js")
