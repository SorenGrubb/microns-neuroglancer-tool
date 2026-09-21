# -*- coding: utf-8 -*-
u"""βJump gets the EM in the page, and a section on the cell card.                2026-09-21

Stage F of the tracing card's port, second slice — the same slice λJump and δJump each needed
before the card could exist. Uses src/a_bucket_without_cors_is_read_through_the_json_api.py.

── WHAT THE VOLUME IS, MEASURED FROM grubblab.com ON 2026-09-20/21 ─────────────────

    gs://vclem-xh/alzheimers/em_clahe    uint8, raw, SHARDED (identity, gzip), 9 scales

    8.0x8.0x30.0     chunk 128x128x32    }
    16.0x16.0x30.0   chunk 128x128x64    }  three true 30 nm sections
    32.0x32.0x30.0   chunk  64x 64x64    }
    64.0x64.0x60.0   chunk  64x 64x64    <- z doubles: one plane here averages TWO sections

Every one of those four answered with a non-empty minishard entry at three cells taken from the
page's own table (nuclei 1, 51 and 121, z = 33, 149 and 398) — so there is no dead level to skip,
unlike V1DD's placeholder. The page frame is 8/8/30, the finest scale's own grid.

── THE SECTION ON THE CARD IS µJUMP'S, NOT λJUMP'S ─────────────────────────────

The block is read out of ljump.html and pointed at this page, as δJump's was — but βJump's
pyramid has µJump's shape, not Lee16's. At 64 nm the z doubles, exactly as minnie65's does, so the
card draws what µJump draws: **300x162 at the 64 nm level through emtiles' slabOk, 19.2 µm
across, about fifteen 64³ chunks**, with µJump's caveat in the title that the plane averages two
30 nm sections. A tracing never uses that level; the pad asks for true sections only.

── THE WINDOW ───────────────────────────────────────────────────────────────────

βJump's viewer links carry no contrast on the EM layer at all — em_clahe is CLAHE-equalised, so
the stain already fills the byte. Measured over 198,000 tissue pixels at three positions:

    2% → 10    5% → 20    median 130    95% → 234    98% → 244

So the window is 10–244, a 2–98% stretch, which is within a few levels of the identity the viewer
applies and keeps a section from looking washed out on the downsampled levels.

── THE BUCKET HAS NO CORS ──────────────────────────────────────────────────────

`UJ.segread.useJsonApi("vclem-xh")`, once, at the top of this page's script — before any card
configures anything — and again inside emConfigure for anyone who calls that first.

Run: python3 src/bjump_gets_the_em_in_the_page.py
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


def read(rel):
    return io.open(os.path.join(HERE, rel), encoding="utf-8").read()


# ══ 1. the eight modules ══════════════════════════════════════════════════════════════════════
TAGS_OLD = u'''<script src="core/gamify.js"></script>
<script src="core/organelles.js"></script>
<script src="core/ontology.js"></script>'''

TAGS_NEW = u'''<script src="core/gamify.js"></script>
<script src="core/organelles.js"></script>
<!-- ── THE EM STACK ───────────────────────────────────  2026-09-21
     The same eight modules, in the same order, µJump, λJump and δJump load. segread fetches and
     caches chunks — and knows how to reach this bucket through Google's JSON API, which is what
     had kept all of this off βJump; emtiles turns a coordinate into a section; tracepad and
     traceloft are the polygon tool and its lofting; tracing reads contours out of a viewer link. -->
<script src="core/segread.js"></script>
<script src="core/segpaint.js"></script>
<script src="core/organellelink.js"></script>
<script src="core/emtiles.js"></script>
<script src="core/tracepad.js"></script>
<script src="core/traceloft.js"></script>
<script src="core/nucmesh.js"></script>
<script src="core/tracing.js"></script>
<script src="core/ontology.js"></script>'''

print("bjump.html")
edit("bjump.html", [
    (u"the eight EM modules load", TAGS_OLD, TAGS_NEW),
], marker=u'<script src="core/emtiles.js"></script>')


# ══ 2. the window, the reader, and the section block ══════════════════════════════════════════
def emplane_block():
    s = read("ljump.html")
    i = s.index(u"/* @emplane:start */")
    j = s.index(u"/* @emplane:end */") + len(u"/* @emplane:end */")
    b = s[i:j]
    assert u"drawPanelEmPlane" in b and u"emPlaneScaleBar" in b and u"wireEmPlaneToggle();" in b
    assert b.count(u"EM_PLANE_TOKEN !== tok") >= 5, "the stale-draw token checks are not all there"
    return b


SUBS = [
    (u"its own remembered switch",
     u'var EM_PLANE_KEY = "ljump_panel_emplane"', u'var EM_PLANE_KEY = "bjump_panel_emplane"'),

    (u"300x162 at the 64 nm level, as on µJump",
     u'''/* 300x162 DRAWN, 260 SHOWN -- µJump's proportions, for the same reason: "how much tissue" and
   "how much room" are different questions. 300 data pixels into 260 display pixels costs nothing
   extra to fetch and is sharper on any 2x screen. */
var EM_PLANE_W = 300, EM_PLANE_H = 162, EM_PLANE_CSS = 260, EM_PLANE_MIP = 4;''',
     u'''/* 300x162 DRAWN, 260 SHOWN, AT THE 64 nm LEVEL -- µJump's numbers exactly, because this pyramid
   has µJump's shape: 8 / 16 / 32 nm keep 30 nm sections and 64 nm is the first level whose z
   doubles. 300 px at 64 nm is 19.2 µm, about fifteen 64³ chunks. MIP 3 counts from the finest
   REAL level, which is reached only through emtiles' slabOk -- see the title below. */
var EM_PLANE_W = 300, EM_PLANE_H = 162, EM_PLANE_CSS = 260, EM_PLANE_MIP = 3;'''),

    (u"slabOk, which the 64 nm level needs",
     u'''      centre: pos, w: EM_PLANE_W, h: EM_PLANE_H, mip: EM_PLANE_MIP, zoom: 1,''',
     u'''      centre: pos, w: EM_PLANE_W, h: EM_PLANE_H, mip: EM_PLANE_MIP, zoom: 1, slabOk: true,'''),

    # These two lines carry LITERAL \\u escapes in ljump.html (they sit in JS strings and a
    # comment), so they are matched as written.
    (u"the title says the plane is a slab when it is one",
     u'''    /* No slab caveat here, unlike \\u00b5Jump: every Lee16 scale keeps 40 nm sections, so this is one
       plane at every level and saying otherwise would be inventing a warning. */
    try {
      cv.title = view.umAcross.toFixed(1) + " \\u00b5m across at " + view.nmPerPx + " nm/px, z="
        + view.z + ". One 40 nm section. Contrast " + view.lo + "\\u2013" + view.hi''',
     u'''    /* THE SLAB CAVEAT µJump prints, for µJump's reason: the 64 nm level is 60 nm deep and each
       plane of it averages two 30 nm sections. Read off the view (view.slab) rather than assumed,
       so a finer EM_PLANE_MIP would say "one 30 nm section" without anyone editing this. */
    try {
      cv.title = view.umAcross.toFixed(1) + " \\u00b5m across at " + view.nmPerPx + " nm/px, z="
        + view.z + ". " + (view.slab > 1
          ? "One plane of the " + view.sectionNm + " nm level, which averages " + view.slab
            + " of the 30 nm sections \\u2014 the tracing pad draws single ones"
          : "One 30 nm section") + ". Contrast " + view.lo + "\\u2013" + view.hi'''),

    (u"it says which imagery the coordinate is outside of",
     u'"outside Lee16\\u2019s imagery, so there is no section to draw here"',
     u'"outside the vCLEM imagery, so there is no section to draw here"'),

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
     u'''   WHAT IT COSTS, SAID PLAINLY. One 300x162 window at 64 nm is about fifteen chunks: this volume
   chunks 64³ at its coarse levels, as minnie65 does. Every chunk comes through Google's JSON API,
   because the bucket sends no CORS headers -- see core/segread.js's useJsonApi. Cold, that is a few
   seconds; afterwards it is free, because core/segread.js caches by URL and range. Which is why this
   has a switch, and why the switch is REMEMBERED: somebody who turns it off on a slow connection
   should not meet it again on the next cell.

   NO SEGMENTATION HALF YET. segmentation_secgan_16nm is sharded compressed_segmentation, the very
   format core/segread.js reads for µJump, so painting the cell over the section can be done here;
   it is a change of its own rather than part of bringing the imagery in.

   MIP 3 IS THE 64 nm LEVEL, reached with slabOk, and it is a SLAB. 8 / 16 / 32 nm keep 30 nm z;
   64 nm is 60 nm deep, so one of its planes averages two sections -- µJump's situation exactly,
   and the title says so.'''),
]


def bjump_block():
    b = emplane_block()
    for name, old, new in SUBS:
        n = b.count(old)
        assert n == 1, "emplane / %s: %d matches" % (name, n)
        b = b.replace(old, new, 1)
        print("  sub: " + name)
    for bad in [u"ljump_", u'"outside Lee16', u"One 40 nm section", u"all ten of its scales",
                u"EM_PLANE_MIP = 4"]:
        assert bad not in b, "the ported block still says %r" % bad
    assert u"bjump_panel_emplane" in b and u"slabOk: true" in b
    return b


CONF = u'''/* ── THE EM, IN THE PAGE ───────────────────────────────────────────────────────  2026-09-21
   gs://vclem-xh SENDS NO CORS HEADERS. The browser refuses its ordinary public URLs, and this is
   what kept the section, the tracing pad and everything else built on core/emtiles.js off βJump.
   Google's JSON API serves the same objects with them; core/segread.js routes a named bucket there.
   Said here, at the top of the page's own script and before any card can configure a reader,
   because the tracing card configures emtiles itself when it finds it unconfigured. */
if (window.UJ && UJ.segread && UJ.segread.useJsonApi) UJ.segread.useJsonApi("vclem-xh");

/* THE WINDOW, MEASURED. βJump's viewer links put no contrast on the EM layer: em_clahe is
   CLAHE-equalised, so the stain already spans the byte. Over 198,000 tissue pixels at three
   positions, 2% → 10, 5% → 20, median 130, 95% → 234, 98% → 244. A 2–98% stretch is within a few
   levels of what the viewer shows, and keeps a downsampled plane from looking washed out. The pad
   reads this too, through core/tracingcard.js's tracingWindow(). */
const EM_WINDOW = { lo: 10, hi: 244 };

/* The one place the reader is pointed at this dataset. No skipScales: all four of the finer levels
   answered at three cells from this page's own table, so there is no dead level to name. */
function emConfigure(){
  if (typeof UJ === "undefined" || !UJ.emtiles || !UJ.segread) return false;
  if (UJ.segread.useJsonApi) UJ.segread.useJsonApi("vclem-xh");
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure({ em: UJ.cfg.viewer.em, res: UJ.cfg.res });
  return true;
}

'''

ANCHOR = u'''const SRC_NAME = ["none","secgan16","seg32"];'''

MOUNT_OLD = u'''  h+='<div class="meta">nucleus '+copyCode(BID[i])
    +(seg?' &middot; segment '+copyCode(seg)'''
MOUNT_NEW = u'''  /* One plane of the EM, under the two "where is this?" diagrams — the slot µJump uses, where
     the reader is already asking where the cell is rather than what it is. */
  h+=emPlaneBox(pos);
  h+='<div class="meta">nucleus '+copyCode(BID[i])
    +(seg?' &middot; segment '+copyCode(seg)'''

print("\nbjump.html, the section")
BLOCK = bjump_block()
edit("bjump.html", [
    (u"the window, the reader and one plane of the EM", ANCHOR, CONF + BLOCK + u"\n" + ANCHOR),
    (u"...shown under the location diagrams", MOUNT_OLD, MOUNT_NEW),
], marker=u"@emplane:start")
