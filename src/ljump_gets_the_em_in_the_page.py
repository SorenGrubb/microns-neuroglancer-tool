# -*- coding: utf-8 -*-
u"""λJump loads the tracing stack, and learns its own contrast.                  2026-09-20

First slice of the tracing card's port (Søren: *"I want the Bulk organelle annotation, the trace a
cell or organelle and the functions related to that in the Filter and Show in all of the other
tools"*; asked which tool first and how much, he chose the whole card).

πJUMP WAS SUPPOSED TO GO FIRST AND CANNOT. Its EM source serves a valid info file and not one
chunk -- 27 probes across the volume, two scales, both chunk alignments, plus the chunk at the
volume origin: every one a 404, not a 403. λJump reads 27/27 and drew a real section in 2.1 s.
Full table in claude/which-datasets-can-be-traced-on.md.

THIS SLICE IS THE PART THE MEASUREMENT ALREADY PROVED: the eight core modules the pad is built
from, and the two numbers that decide whether the section is legible. Nothing on screen changes
yet -- the card markup and the pad wiring are the next slice -- but after this the page can draw
its own EM, which is the thing everything else rests on and the thing most likely to be wrong.

λJUMP IS THE FIRST UNSHARDED VOLUME THE PAD HAS EVER DRAWN FROM. µJump's minnie65 is sharded, so
core/segread.js's unsharded path has never carried a section before. It works -- measured, 560x460
at 8 nm, 2138 ms cold, pixel range 0-255 -- and λJump going first is what proves it.

── THE CONTRAST IS MEASURED, NOT COPIED ──────────────────────────────────────

core/emtiles.js defaults its window to lo 86 / hi 172. Those are minnie65's numbers, living in a
shared file as though they were everyone's -- the same shape of mistake as the four sentences that
said "MICrONS" over an H01 cell. Lee16 is a much brighter stain: measured over three sections at
different depths, 480,000 pixels,

    0.5% -> 16     2% -> 44     5% -> 68     median 189     95% -> 233     98% -> 238

so µJump's window would clip everything above 172, which is more than half of this tissue. A 2-98%
stretch is lo 44 / hi 238, and that is what this page passes.

Named EM_WINDOW, the same name µJump uses, so the pad code ported in the next slice reads
identically on both pages and the difference stays in the one place it belongs.

Run: python3 src/ljump_gets_the_em_in_the_page.py
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


# ── the eight modules, in µJump's own order ───────────────────────────────────────────────────
# Order matters in one place only and it is worth saying which: emtiles asks segread to fetch for
# it (they read the same bucket with the same sharded reader, so duplicating it would be the worst
# kind of copy), and tracepad/traceloft/tracing all sit on top of emtiles. Everything here is a
# function declaration or a UJ.* assignment, so nothing runs at load.
TAGS_OLD = u'''<script src="core/organelles.js"></script>'''
TAGS_NEW = u'''<script src="core/organelles.js"></script>
<!-- ── THE TRACING STACK ────────────────────────────────  2026-09-20
     Eight modules, in µJump's own order. The pad draws one section of EM in the page because no
     viewer a pasted link can reach has a polygon tool (measured 2026-09-17), so the imagery has to
     come here: emtiles asks segread to fetch for it, and tracepad / traceloft / tracing sit on
     top of emtiles.

     Lee16 is the first UNSHARDED volume this reader has drawn a section from -- minnie65 is
     sharded -- so λJump getting the card first is also what proves segread's other path. Measured
     before any of this was written: 27/27 chunks readable, 560x460 at 8 nm in 2138 ms cold.

     πJump was meant to be first and cannot be: its EM source serves an info file and no chunks at
     all. See claude/which-datasets-can-be-traced-on.md. -->
<script src="core/segread.js"></script>
<script src="core/segpaint.js"></script>
<script src="core/organellelink.js"></script>
<script src="core/emtiles.js"></script>
<script src="core/tracepad.js"></script>
<script src="core/traceloft.js"></script>
<script src="core/nucmesh.js"></script>
<script src="core/tracing.js"></script>'''

# ── the window, and one place that configures the reader ──────────────────────────────────────
WIN_ANCHOR = u'''UJ.cfg.viewer = {
  base: "https://ngl.microns-explorer.org/",
  em:   "precomputed://s3://open-neurodata/lee/lee16/image"
};'''
WIN_NEW = u'''UJ.cfg.viewer = {
  base: "https://ngl.microns-explorer.org/",
  em:   "precomputed://s3://open-neurodata/lee/lee16/image"
};

/* ── THE EM WINDOW, MEASURED ON THIS TISSUE ──────────────────────  2026-09-20
   core/emtiles.js stretches [lo,hi] to black-white, and defaults to 86/172 -- minnie65's numbers,
   sitting in a shared file as though they were every dataset's. Lee16 is a far brighter stain, so
   that window would clip more than half of it to white.

   Measured rather than guessed: three sections at 30%, 50% and 70% depth, 480,000 pixels, drawn
   with no stretch at all and histogrammed.

       0.5% → 16     2% → 44     5% → 68     median 189     95% → 233     98% → 238

   A 2-98% stretch is 44 → 238. Same constant name µJump uses, so the pad code reads identically
   on both pages and the difference between the two datasets stays in this one place. */
const EM_WINDOW = { lo: 44, hi: 238 };

/* The one place the reader is pointed at this dataset. Called before any draw; emtiles keeps ONE
   configured source, so configuring twice is harmless and configuring nowhere is a blank canvas.
   Guarded because every other card on this page works without the tracing stack, and a page that
   loses one script should lose one card rather than the cell. */
function emConfigure(){
  if (typeof UJ === "undefined" || !UJ.emtiles || !UJ.segread) return false;
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure({ em: UJ.cfg.viewer.em, res: UJ.cfg.res });
  return true;
}'''

print("ljump.html")
edit("ljump.html", [
    (u"the eight modules the pad is built from", TAGS_OLD, TAGS_NEW),
    (u"...this tissue's own contrast, and one place to point the reader",
     WIN_ANCHOR, WIN_NEW),
])

print(u"\nnow: node emljumpcheck.js && node ljumpcheck.js "
      u"&& python3 src/build_stamps.py && node stampcheck.js")
