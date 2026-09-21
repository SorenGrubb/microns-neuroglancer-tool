# -*- coding: utf-8 -*-
u"""ηJump gets the EM in the page, a section on the cell card, and the cell on it.   2026-09-21

Stage G, second slice. Needs src/a_bucket_without_cors_is_read_through_the_json_api.py (the
bucket) and src/a_chunk_can_be_a_jpeg.py (the encoding) first.

── WHAT H01 IS, MEASURED THROUGH THE JSON API FROM grubblab.com ON 2026-09-21 ──────

    4nm_raw   uint8, JPEG, sharded   4 / 8 / 16 / 32 nm keep 33 nm sections; 64 nm is 66 nm deep
    c3        uint64, compressed_segmentation, sharded   8 / 16 / 32 nm at 33 nm

The imagery's pyramid has µJump's shape, one level finer: the 64 nm level is a two-section slab.
So the card draws what µJump and βJump draw — 300x162 at 64 nm through slabOk, 19.2 µm, about
fifteen 64³ chunks — with the slab caveat in the title. Mip 4 here, because the finest real level
is 4 nm.

c3 IS THIS PAGE'S OWN ID SPACE, AND IT IS READABLE. core/segread.js read c3 at the soma position
of eight cells from the page's table (rows 0-3, 100, 500, 1000, 2000) and returned **exactly
c3Id(i) for all eight**. So the section paints the cell, as βJump's does, from the one volume every
id on this page belongs to.

── THE WINDOW ───────────────────────────────────────────────────────────────────────────

ηJump's viewer links put no contrast on the EM layer. Over four decoded 16 nm chunks at four
cells, 4.2 million pixels (0.14% zeros, left in):

    2% → 29    5% → 46    median 133    95% → 198    98% → 212

A 2–98% stretch, 29–212.

── THE BUCKET HAS NO CORS ──────────────────────────────────────────────────────────────

`UJ.segread.useJsonApi("h01-release")` at the top of this page's script, and again in emConfigure.
ηJump's own mesh config already said why, in August: *"Google's JSON API endpoint for the same
objects DOES send CORS headers and honours Range requests."*

── THE BLOCK IS βJUMP'S, READ OUT OF bjump.html ─────────────────────────────────────────

Not retyped: every difference is a substitution below, and a must-not-contain list refuses a block
that still says anything about the vCLEM volume.

Run: python3 src/hjump_gets_the_em_in_the_page.py
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
     The same eight modules, in the same order, every other tool on the tracing card loads. What
     kept them off ηJump was two things about H01's imagery, both now in core/: the bucket sends no
     CORS headers (segread's useJsonApi) and the chunks are JPEG (emtiles' decodeChunk). -->
<script src="core/segread.js"></script>
<script src="core/segpaint.js"></script>
<script src="core/organellelink.js"></script>
<script src="core/emtiles.js"></script>
<script src="core/tracepad.js"></script>
<script src="core/traceloft.js"></script>
<script src="core/nucmesh.js"></script>
<script src="core/tracing.js"></script>
<script src="core/ontology.js"></script>'''

print("hjump.html")
edit("hjump.html", [
    (u"the eight EM modules load", TAGS_OLD, TAGS_NEW),
], marker=u'<script src="core/emtiles.js"></script>')


# ══ 2. the block, read out of βJump's page ════════════════════════════════════════════════════
def block_from_bjump():
    s = read("bjump.html")
    i = s.index(u"/* @emplane:start */")
    j = s.index(u"/* @emplane:end */") + len(u"/* @emplane:end */")
    b = s[i:j]
    assert b.count(u"EM_PLANE_TOKEN !== tok") >= 5, "the stale-draw token checks are not all there"
    assert u"AND THE CELL ON TOP OF IT" in b, "this is not the block with the cell paint"
    return b


SUBS = [
    (u"its own remembered switches",
     u'''var EM_PLANE_SEG_KEY = "bjump_panel_emseg";
var EM_PLANE_KEY = "bjump_panel_emplane", EM_PLANE_TOKEN = 0,''',
     u'''var EM_PLANE_SEG_KEY = "hjump_panel_emseg";
var EM_PLANE_KEY = "hjump_panel_emplane", EM_PLANE_TOKEN = 0,'''),

    (u"mip 4, because the finest real level is 4 nm",
     u'''/* 300x162 DRAWN, 260 SHOWN, AT THE 64 nm LEVEL -- µJump's numbers exactly, because this pyramid
   has µJump's shape: 8 / 16 / 32 nm keep 30 nm sections and 64 nm is the first level whose z
   doubles. 300 px at 64 nm is 19.2 µm, about fifteen 64³ chunks. MIP 3 counts from the finest
   REAL level, which is reached only through emtiles' slabOk -- see the title below. */
var EM_PLANE_W = 300, EM_PLANE_H = 162, EM_PLANE_CSS = 260, EM_PLANE_MIP = 3;''',
     u'''/* 300x162 DRAWN, 260 SHOWN, AT THE 64 nm LEVEL -- µJump's numbers, because this pyramid has
   µJump's shape one level finer: 4 / 8 / 16 / 32 nm keep 33 nm sections and 64 nm is the first
   level whose z doubles. 300 px at 64 nm is 19.2 µm, about fifteen 64³ JPEG chunks. MIP 4 counts
   from the finest REAL level, 4 nm, and is reached only through emtiles' slabOk. */
var EM_PLANE_W = 300, EM_PLANE_H = 162, EM_PLANE_CSS = 260, EM_PLANE_MIP = 4;'''),

    (u"the header says what this page's volume is",
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
   and the title says so.''',
     u'''   Read out of βJump's page on 2026-09-21, which had it from λJump, which had it from µJump.

   WHAT IT COSTS, SAID PLAINLY. One 300x162 window at 64 nm is about fifteen chunks: H01 chunks 64³
   at its coarse levels, as minnie65 does. Every chunk comes through Google's JSON API, because the
   bucket sends no CORS headers, and every chunk is a JPEG that emtiles decodes -- about 1.6 s cold
   per chunk at 16 nm, measured. Afterwards it is free: segread caches the bytes by URL and range
   and emtiles keeps the decoded chunk against them. Which is why this has a switch, and why the
   switch is REMEMBERED.

   THE CELL IS PAINTED FROM c3, the page's own id space. segread read c3 at eight cells' somata and
   returned exactly c3Id(i) every time.

   MIP 4 IS THE 64 nm LEVEL, reached with slabOk, and it is a SLAB. 4 / 8 / 16 / 32 nm keep 33 nm
   z; 64 nm is 66 nm deep, so one of its planes averages two sections -- µJump's situation, and
   the title says so.'''),

    (u"the tick's note is about c3, not Hoechst",
     u'''       Named for what it paints, as δJump's "nucleus" is. There is no nucleus volume here —
       βJump's nuclei are Hoechst detections — and a nucleus with no segment gets no tick at all:
       its card already says "no segment". */''',
     u'''       Named for what it paints, as δJump's "nucleus" is. H01 has no nucleus volume; its cell
       bodies are a separate id space nothing here can paint by. Every cell on this page has a c3
       segment, so the tick is always offered. */'''),

    (u"it says which imagery the coordinate is outside of",
     u'"outside the vCLEM imagery, so there is no section to draw here"',
     u'"outside the H01 imagery, so there is no section to draw here"'),

    (u"33 nm sections in the caveat",
     u'''    /* THE SLAB CAVEAT µJump prints, for µJump's reason: the 64 nm level is 60 nm deep and each
       plane of it averages two 30 nm sections. Read off the view (view.slab) rather than assumed,
       so a finer EM_PLANE_MIP would say "one 30 nm section" without anyone editing this. */''',
     u'''    /* THE SLAB CAVEAT µJump prints, for µJump's reason: the 64 nm level is 66 nm deep and each
       plane of it averages two 33 nm sections. Read off the view (view.slab) rather than assumed,
       so a finer EM_PLANE_MIP would say "one 33 nm section" without anyone editing this. */'''),

    (u"...and in the title",
     u'''            + " of the 30 nm sections \\u2014 the tracing pad draws single ones"
          : "One 30 nm section") + ". Contrast " + view.lo + "\\u2013" + view.hi''',
     u'''            + " of the 33 nm sections \\u2014 the tracing pad draws single ones"
          : "One 33 nm section") + ". Contrast " + view.lo + "\\u2013" + view.hi'''),
]


def hjump_block():
    b = block_from_bjump()
    for name, old, new in SUBS:
        n = b.count(old)
        assert n == 1, "emplane / %s: %d matches" % (name, n)
        b = b.replace(old, new, 1)
        print("  sub: " + name)
    for bad in [u"bjump_", u"vCLEM", u"secgan", u"Hoechst", u"30 nm", u"EM_PLANE_MIP = 3",
                u"60 nm deep"]:
        assert bad not in b, "the ported block still says %r" % bad
    return b


CONF = u'''/* ── THE EM, IN THE PAGE ───────────────────────────────────────────────────────  2026-09-21
   gs://h01-release SENDS NO CORS HEADERS — this page's own mesh config has said so since August.
   core/segread.js routes a named bucket through Google's JSON API. Said at the top of the page's
   script, before any card can configure a reader, because the tracing card configures emtiles
   itself when it finds it unconfigured. */
if (window.UJ && UJ.segread && UJ.segread.useJsonApi) UJ.segread.useJsonApi("h01-release");

/* THE WINDOW, MEASURED. The viewer links put no contrast on H01's EM. Over 4.2 million pixels of
   four decoded 16 nm chunks at four cells: 2% → 29, 5% → 46, median 133, 95% → 198,
   98% → 212. A 2–98% stretch. The pad reads this too, through core/tracingcard.js. */
const EM_WINDOW = { lo: 29, hi: 212 };
/* How solid the cell is over the EM section. µJump's number. */
const EM_SEG_ALPHA = 0.32;

/* The one place the reader is pointed at this dataset. No skipScales: the 4 nm level serves. */
function emConfigure(){
  if (typeof UJ === "undefined" || !UJ.emtiles || !UJ.segread) return false;
  if (UJ.segread.useJsonApi) UJ.segread.useJsonApi("h01-release");
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure({ em: UJ.cfg.viewer.em, res: UJ.cfg.res });
  return true;
}

'''

ANCHOR = u'''function c3Id(i){ return (BigInt(D.HI[HHB[i]]) * 4294967296n + BigInt(HLB[i] >>> 0)).toString(); }'''

MOUNT_OLD = u'''    +'<div style="flex:1 1 260px;min-width:220px">'+layerDiagram(HX[i],HY[i],volLayer(i))+'</div>\''''
MOUNT_NEW = u'''    /* One plane of the EM under the layer wedge — the slot µJump uses, beside the orientation
       diagram, where the reader is asking where the cell is. Painted with this cell's c3 segment. */
    +'<div style="flex:1 1 260px;min-width:220px">'+layerDiagram(HX[i],HY[i],volLayer(i))
    +emPlaneBox(pos, seg, UJ.cfg.viewer.seg)+'</div>\''''

print("\nhjump.html, the section")
BLOCK = hjump_block()
edit("hjump.html", [
    (u"the window, the reader and one plane of the EM", ANCHOR, CONF + BLOCK + u"\n" + ANCHOR),
    (u"...shown under the layer wedge, painted with c3", MOUNT_OLD, MOUNT_NEW),
], marker=u"@emplane:start")
