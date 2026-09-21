# -*- coding: utf-8 -*-
u"""πJump gets its imagery back, the EM section on the cell card, and the tracing card.   2026-09-21

Søren: "The tracing does not exist of pJump, why?" and then, told why: "Go ahead".

── THE IMAGERY WAS IN THE OTHER BUCKET ──────────────────────────────────────────

πJump's EM source, gs://microns_public_datasets/pinky100_v0/son_of_alignment_v15_rechunked, serves
a valid info file and not one chunk: every probe returned 404, measured on 2026-09-20 and again on
2026-09-21 from grubblab.com at the cell Søren was looking at, at four scales and both alignments.
That is why the tracing card was never ported: the pad draws EM in the page, and there was none to
draw. It also means every Neuroglancer link this page built had an EM layer with nothing in it.

The same volume is served, chunks and all, from Neuroglancer's own public bucket:

    gs://neuroglancer/pinky100_v0/son_of_alignment_v15_rechunked

Its info is the old one exactly: 4_4_40 … 512_512_40, 90000×53500×2176 at 4 nm, offset
35000/31000/1, 256×256×16 chunks, raw, unsharded. So nothing about coordinates changes. Measured
from grubblab.com: every chunk probed came back 200 with 1 MB of tissue (mean 132–146, median
131–153), including the one under nucleus 13776's neighbour at 4 nm. Swapped in all three places a
viewer or the Colab notebook reads it: SRC.em/em35, UJ.cfg.em.emSource, cellContactsViewerBase.

── THEN WHAT EVERY OTHER TOOL GOT ───────────────────────────────────────────────

  the EM stack       segpaint, organellelink, emtiles, tracepad, traceloft (segread, nucmesh and
                     tracing were already here), then core/tracingcard.js after tracing.js.
  EM_WINDOW          read off EM_SHADER_CONTROLS, [33,231] -- the window Søren tuned on this volume
                     in Neuroglancer on 2026-08-27 -- so the pad, the cell card and the viewer
                     links stretch the section the same way.
  UJ.cfg.tracing     πJump's own four storage keys, and sources {em, seg, nuc}. Unlike δJump the
                     SEGMENTATION IS READABLE here (pinky100_v185/seg and the Princeton nuclei are
                     plain precomputed and CORS-clean; resolveAt read five of five cells on
                     2026-09-21), so the pad's "show the segmentation" tick stays and paints.
  the section        δJump's @emplane block, pointed at pinky100: 300×162 at mip 4 (64 nm), which
                     is µJump's 19.2 µm; every pinky100 scale keeps 40 nm z, so it is one plane.
                     And the cell as well as the nucleus, as on µJump, because both volumes are
                     readable here.
  the card           an empty #tracingCard under the bulk card, the slot µJump and δJump use.

No identityFor hook: this page has NID, NT, OWN_TYPE and the rest under the names the module reads.
The community's proposed root IDs come through the page's own fetchExtraRootIdsFor.

Run: python3 src/pjump_gets_the_tracing_card.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = "pjump.html"
OLD_B = u"microns_public_datasets/pinky100_v0/son_of_alignment_v15_rechunked"
NEW_B = u"neuroglancer/pinky100_v0/son_of_alignment_v15_rechunked"


def rd(rel): return io.open(os.path.join(HERE, rel), encoding="utf-8").read()
def wr(rel, s): io.open(os.path.join(HERE, rel), "w", encoding="utf-8").write(s)


def edit(s, name, old, new, count=1):
    if new in s and old not in s:
        print("  already there: " + name); return s
    n = s.count(old); assert n == count, "%s: %d (wanted %d)" % (name, n, count)
    print("  ok: " + name)
    return s.replace(old, new)


s = rd(PAGE)
print(PAGE)

# ── 1. the imagery ─────────────────────────────────────────────────────────────────────────────
s = edit(s, u"the viewer links and the pad read the bucket that has the chunks",
         u'"precomputed://https://storage.googleapis.com/' + OLD_B + u'"',
         u'"precomputed://https://storage.googleapis.com/' + NEW_B + u'"', count=3)
s = edit(s, u"...and so does the Colab notebook",
         u'''  emSource:"gs://''' + OLD_B + u'''",''',
         u'''  /* gs://neuroglancer/..., NOT microns_public_datasets/...: the same volume, but that copy
     serves an info file and no chunks (404 everywhere, 2026-09-20 and -21). See
     src/pjump_gets_the_tracing_card.py. */
  emSource:"gs://''' + NEW_B + u'''",''')
s = edit(s, u"the note beside the reader says what is true now",
         u'''     cells, 2026-09-21. The EM is not readable (see which-datasets-can-be-traced-on), the
     segmentation is. -->''',
         u'''     cells, 2026-09-21. The EM is readable too, since it is read from gs://neuroglancer/ rather
     than the copy with no chunks -- see src/pjump_gets_the_tracing_card.py. -->''')

# ── 2. the EM stack and the card module ───────────────────────────────────────────────────────
s = edit(s, u"the EM modules load after the reader",
         u'''<script src="core/segread.js"></script>
<!-- Reads a tracing's rows into rings''',
         u'''<script src="core/segread.js"></script>
<!-- ── THE EM STACK ───────────────────────────────────  2026-09-21
     The modules the tracing card is built on, in the order µJump and δJump load them. -->
<script src="core/segpaint.js"></script>
<script src="core/organellelink.js"></script>
<script src="core/emtiles.js"></script>
<script src="core/tracepad.js"></script>
<script src="core/traceloft.js"></script>
<!-- Reads a tracing's rows into rings''')
s = edit(s, u"core/tracingcard.js loads after tracing.js",
         u'''<script src="core/tracing.js"></script>
<!-- Bulk organelle annotation''',
         u'''<script src="core/tracing.js"></script>
<!-- The tracing card, shared with every tool that has imagery to draw on since 2026-09-20; here
     since 2026-09-21. After the modules it is built on, before this page's own script, which
     supplies the host contract its header lists. -->
<script src="core/tracingcard.js"></script>
<!-- Bulk organelle annotation''')

# ── 3. the card's settings ────────────────────────────────────────────────────────────────────
s = edit(s, u"πJump names its tracing keys and its three volumes",
         u'''  res: [4, 4, 40]           // nm per voxel, x/y/z
};''',
         u'''  /* ── THE TRACING CARD ─────────────────────────────  2026-09-21
     core/tracingcard.js. Everything per-dataset about it is these lines.

     THE FOUR KEYS ARE LITERALS AND THEY ARE πJUMP'S OWN: localStorage is one store for every page
     on grubblab.com, and unset they fall back to µJump's, so the two tools would share one list
     of tracings. storagekeycheck.js reads them, which is why they are not built from `id`.

     sources IS A FUNCTION, so it is read after SRC exists further down. ALL THREE VOLUMES: unlike
     δJump's, this segmentation and nucleus volume are plain public precomputed that
     core/segread.js reads, so the pad's "show the segmentation" tick paints the cell. */
  tracing: {
    lsKey:     "pjump_tracings_v1",
    draftsKey: "pjump_tracing_drafts_v2",
    draftKey:  "pjump_tracing_draft_v1",
    penKey:    "pjump_tracing_pen_v1",
    sources:   function(){ return { em: SRC.em, seg: SRC.seg, nuc: SRC.nuc }; }
  },
  res: [4, 4, 40]           // nm per voxel, x/y/z
};''')

# ── 4. the window, the section block, the one place the reader is pointed at pinky100 ─────────
def emplane_block():
    d = rd("djump.html")
    i = d.index(u"/* @emplane:start */")
    j = d.index(u"/* @emplane:end */") + len(u"/* @emplane:end */")
    return d[i:j]


SUBS = [
 (u"its own remembered switches",
  u'''var EM_PLANE_KEY = "djump_panel_emplane", EM_PLANE_SEG_KEY = "djump_panel_emseg",''',
  u'''var EM_PLANE_KEY = "pjump_panel_emplane", EM_PLANE_SEG_KEY = "pjump_panel_emseg",'''),
 (u"the header says what this page's volume is",
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
   count moves instead of the level; see EM_PLANE_W.''',
  u'''   πJump's copy, 2026-09-21, ported from δJump's page with pinky100's numbers.

   WHAT IT COSTS, SAID PLAINLY. One 300x162 window at 64 nm is two to four of pinky100's
   256x256x16 chunks (1 MB each). Cold, that is a second or two; afterwards it is free, because
   core/segread.js caches by URL and range. The switch is REMEMBERED, so somebody who turns it
   off on a slow connection does not meet it again on the next cell.

   THE CELL AND ITS NUCLEUS, as on µJump: pinky100_v185/seg and the Princeton nuclei are both plain
   public precomputed that core/segread.js reads, so both are painted -- the cell in magenta, the
   nucleus in blue.

   MIP 4 IS 64 nm HERE, AND IT IS A REAL SECTION. µJump needs emtiles' slabOk to reach 64 nm,
   because minnie65's 64 nm level averages two 40 nm sections. pinky100 downsamples in x and y
   only -- every one of its scales keeps 40 nm z -- so 64 nm is mip 4 and one plane.'''),
 (u"300x162 at mip 4",
  u'''/* 248x134 DRAWN, 260 SHOWN, AND THE WIDTH IS THE TISSUE RATHER THAN THE PIXELS.
   µJump draws 19.2 µm of cortex here because that is what Søren asked for, and it reaches it with
   300 px at 64 nm. V1DD has no 64 nm level -- its usable scales are 9.7 / 19.4 / 38.8 / 77.6 -- so
   the pixel count is what moves: 248 px at 77.6 nm is **the same 19.2 µm**.

   AND THE SAME COST. V1DD chunks 64³ at its coarse levels, the way minnie65 does and unlike
   Lee16's constant 512x512x16, so 19.2 µm is about fifteen chunks here exactly as it is on µJump.
   300 px would have been 23.3 µm and about twenty-four. One level finer, 38.8 nm, would be twice
   as sharp and roughly three times the fetches for the same picture. */
var EM_PLANE_W = 248, EM_PLANE_H = 134, EM_PLANE_CSS = 260, EM_PLANE_MIP = 3;''',
  u'''/* 300x162 DRAWN, 260 SHOWN, at 64 nm: µJump's 19.2 µm of cortex, at µJump's own level. */
var EM_PLANE_W = 300, EM_PLANE_H = 162, EM_PLANE_CSS = 260, EM_PLANE_MIP = 4;'''),
 (u"the source line names this page",
  u'''   page that carries it. λJump keeps it on UJ.cfg.viewer, δJump in the global SRC. */''',
  u'''   page that carries it. λJump keeps it on UJ.cfg.viewer, δJump and πJump in the global SRC. */'''),
 (u"the box takes the cell's ids, not only its nucleus",
  u'''function emPlaneBox(pos, nucId){''',
  u'''/* ids = { root, nuc } -- the cell and its nucleus, both painted here (see the header). */
function emPlaneBox(pos, ids){'''),
 (u"...and remembers both",
  u'''  EM_PLANE_LAST = { pos: pos, nuc: String(nucId == null ? "" : nucId) };''',
  u'''  ids = ids || {};
  EM_PLANE_LAST = { pos: pos, root: String(ids.root == null ? "" : ids.root),
                    nuc: String(ids.nuc == null ? "" : ids.nuc) };'''),
 (u"the tick says segmentation, because it paints both",
  u'''    /* ── THE NUCLEUS, AND ONLY THE NUCLEUS ────────────────  2026-09-20
       µJump's version of this paints the cell in magenta AND the nucleus in blue. V1DD's cell
       segmentation is graphene behind a CAVE login, which core/segread.js cannot read a chunk of
       at all; its NUCLEUS volume is plain public precomputed, and this page already hands it to
       the viewer. So the label says nucleus rather than segmentation: a tick called
       "segmentation" that paints one of the two layers is exactly the half-true control this
       card removes elsewhere. */
    + (missing ? "" :
       ' <label for="emPlaneSeg" style="display:inline-flex;align-items:center;gap:5px;'
     + 'margin:0 0 0 9px;cursor:pointer;text-transform:none;letter-spacing:0;font-size:inherit;'
     + 'color:inherit" title="Paints this cell\\'s nucleus over the section in blue, from the same '
     + 'volume Neuroglancer paints. V1DD\\'s CELL segmentation is not offered here: it is a '
     + 'CAVE-authenticated graphene volume, and this reader can only fetch plain precomputed '
     + 'chunks. Costs one more fetch, and it is remembered.">'
     + '<input type="checkbox" id="emPlaneSeg" style="width:auto;margin:0"'
     + (emPlaneSegOn() ? " checked" : "") + '> nucleus</label>')''',
  u'''    /* The cell AND its nucleus, as µJump's: both volumes are readable on pinky100. */
    + (missing ? "" :
       ' <label for="emPlaneSeg" style="display:inline-flex;align-items:center;gap:5px;'
     + 'margin:0 0 0 9px;cursor:pointer;text-transform:none;letter-spacing:0;font-size:inherit;'
     + 'color:inherit" title="Paints this cell\\'s own segmentation over the section \\u2014 the '
     + 'cell in magenta, its nucleus in blue \\u2014 from the same volumes Neuroglancer paints. '
     + 'Costs a few more fetches, and it is remembered.">'
     + '<input type="checkbox" id="emPlaneSeg" style="width:auto;margin:0"'
     + (emPlaneSegOn() ? " checked" : "") + '> segmentation</label>')'''),
 (u"outside pinky100's imagery",
  u'"outside V1DD\\u2019s imagery, so there is no section to draw here"',
  u'"outside pinky100\\u2019s imagery, so there is no section to draw here"'),
 (u"40 nm sections",
  u'''    /* No slab caveat here, unlike µJump: all four of V1DD's usable scales keep 45 nm sections,
       so this is one plane at every level of them and saying otherwise would invent a warning. */''',
  u'''    /* No slab caveat here, unlike µJump: every pinky100 scale keeps 40 nm sections, so this is
       one plane at every level and saying otherwise would invent a warning. */'''),
 (u"...in the caption too",
  u'''". One 45 nm section. Contrast "''', u'''". One 40 nm section. Contrast "'''),
 (u"the cell and the nucleus are painted",
  u'''    /* ── AND THE NUCLEUS ON TOP OF IT ─────────────────────  2026-09-20
       segpaint only reaches for CFG.seg when it is handed a `root`, so configuring with seg:""
       and passing nuc alone paints one layer and never asks for the volume this dataset keeps
       behind a login. Three grids have to agree for this to land on the nucleus — the page's
       9/9/45 frame, the imagery's 9.7, and this volume's 77.6 at mip 0 — and they agree through
       nanometres, which is what the picture shows. */
    var nucId = (EM_PLANE_LAST && EM_PLANE_LAST.nuc) || "";
    if (emPlaneSegOn() && nucId && UJ.segpaint) {
      if (!UJ.segpaint.configured())
        UJ.segpaint.configure({ seg: "", nuc: SRC.nuc, res: UJ.cfg.res });
      emPlaneSay(tok, "reading the nucleus\\u2026");
      var got = await UJ.segpaint.paint(cv, view, { nuc: nucId, alpha: EM_SEG_ALPHA });
      if (EM_PLANE_TOKEN !== tok) return;
      /* After the overlay, because segpaint rewrites the whole canvas. */
      emPlaneScaleBar(cv, view);
      if (got && got.ok && !got.painted) {
        emPlaneSay(tok, "the nucleus is not on this plane");
        return;
      }''',
  u'''    /* ── AND THE CELL ON TOP OF IT ─────────────────────  2026-09-21
       The cell in magenta and its nucleus in blue, from the volumes the viewer links paint. */
    var rootId = (EM_PLANE_LAST && EM_PLANE_LAST.root) || "";
    var nucId = (EM_PLANE_LAST && EM_PLANE_LAST.nuc) || "";
    if (emPlaneSegOn() && (rootId || nucId) && UJ.segpaint) {
      if (!UJ.segpaint.configured())
        UJ.segpaint.configure({ seg: SRC.seg, nuc: SRC.nuc, res: UJ.cfg.res });
      emPlaneSay(tok, "reading the segmentation\\u2026");
      var got = await UJ.segpaint.paint(cv, view, { root: rootId, nuc: nucId, alpha: EM_SEG_ALPHA });
      if (EM_PLANE_TOKEN !== tok) return;
      /* After the overlay, because segpaint rewrites the whole canvas. */
      emPlaneScaleBar(cv, view);
      if (got && got.ok && !got.painted) {
        emPlaneSay(tok, "this cell is not on this plane");
        return;
      }'''),
]


def pjump_block():
    b = emplane_block()
    for name, old, new in SUBS:
        n = b.count(old); assert n == 1, "emplane / %s: %d" % (name, n)
        b = b.replace(old, new, 1); print("  sub: " + name)
    for bad in [u"djump_", u"V1DD\\u2019s imagery", u"One 45 nm", u"nucleus</label>"]:
        assert bad not in b, "the ported block still says %r" % bad
    return b


CONF = u'''/* ── THE SAME WINDOW THE VIEWER LINKS USE ────────────────  2026-09-21
   Read off EM_SHADER_CONTROLS -- Søren's [33,231], tuned on this volume in Neuroglancer -- so the
   pad, the cell card's section and every viewer link stretch pinky100 the same way. */
const EM_WINDOW = { lo: EM_SHADER_CONTROLS.normalized.range[0],
                    hi: EM_SHADER_CONTROLS.normalized.range[1] };
/* How strongly the cell and nucleus are painted over a section: µJump's and δJump's number. */
const EM_SEG_ALPHA = 0.32;
''' + u"%s" + u'''
/* The one place the reader is pointed at this dataset. Guarded, so a page that loses one script
   loses one card rather than the cell. */
function emConfigure(){
  if (typeof UJ === "undefined" || !UJ.emtiles || !UJ.segread) return false;
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure({ em: SRC.em, res: UJ.cfg.res });
  return true;
}
'''

if u"@emplane:start" in s:
    print("  already there: the window, the section and emConfigure")
else:
    anchor = u'''const NUC_INFO="https://td.princeton.edu/sseung-archive/pinky100-nuclei/seg/info";'''
    assert s.count(anchor) == 1
    s = s.replace(anchor, (CONF % pjump_block()) + anchor, 1)
    print("  ok: the window, the section and emConfigure")

# ── 5. the section sits under the top view, as on δJump ───────────────────────────────────────
s = edit(s, u"the location diagram takes something to put under the top view",
         u'''function renderLocationDiagram(pos){
  const[vx,vy,vz]=pos;
  const layerSvg=renderLayerDiagram(estimateLayer(vx,vy,vz));
  const topSvg=renderTopViewDiagram(vx,vy,vz);
  if(!layerSvg&&!topSvg)return "";
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">'
    +(layerSvg?'<div style="flex:1 1 200px;min-width:180px">'+layerSvg+'</div>':'')
    +(topSvg?'<div style="flex:1 1 200px;min-width:180px">'+topSvg+'</div>':'')
    +'</div>';
}''',
         u'''function renderLocationDiagram(pos,under){
  const[vx,vy,vz]=pos;
  const layerSvg=renderLayerDiagram(estimateLayer(vx,vy,vz));
  const topSvg=renderTopViewDiagram(vx,vy,vz);
  under=under||"";
  if(!layerSvg&&!topSvg&&!under)return "";
  /* The EM section goes under the top view (2026-09-21), as on δJump. */
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">'
    +(layerSvg?'<div style="flex:1 1 200px;min-width:180px">'+layerSvg+'</div>':'')
    +((topSvg||under)?'<div style="flex:1 1 200px;min-width:180px">'+topSvg+under+'</div>':'')
    +'</div>';
}''')
s = edit(s, u"...and the cell card hands it the section",
         u'''  h+=renderLocationDiagram(pos);''',
         u'''  h+=renderLocationDiagram(pos,emPlaneBox(pos,{root:root||"",nuc:nid}));''')

# ── 6. somewhere for the card to go ───────────────────────────────────────────────────────────
s = edit(s, u"an empty wrapper under the bulk card",
         u'''<div class="card" id="bulkOrganCard"></div>
</div>
<div class="tabpanel" data-tabpanel="filter">''',
         u'''<div class="card" id="bulkOrganCard"></div>
<!-- ── TRACE A CELL OR ORGANELLE ─────────────────────────────  2026-09-21
     The card µJump has, in the same place. Empty on purpose: core/tracingcard.js fills it. -->
<div class="card" id="tracingCard"></div>
</div>
<div class="tabpanel" data-tabpanel="filter">''')

wr(PAGE, s)
