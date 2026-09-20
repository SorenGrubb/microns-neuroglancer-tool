# -*- coding: utf-8 -*-
u"""δJump's EM preview can paint the segmentation it actually has.               2026-09-20

Søren: *"The EM preview in dJump should also be able to show segmentation."*

µJump's EM plane has a second tick that paints the cell's own segmentation over the section — the
root ID in magenta and the nucleus in blue. When the block was ported to δJump that half was left
out, on the grounds that V1DD's segmentation is `graphene://middleauth+…`: a live,
CAVE-authenticated volume, not a precomputed one `core/segread.js` can read a chunk of.

**That was right about the cell and wrong about the nucleus.** V1DD's nucleus volume is
`precomputed://gs://v1dd_imagery/v1dd_nuclei/segmentation` — public, anonymous, uint32, and this
page already reads its info file (`NUC_INFO`) and hands it to the viewer as `SRC.nuc`. So one of
the two layers has been available all along.

── SO HALF THE CONTROL, AND SAID AS HALF ───────────────────────────────────────

The tick says **"nucleus"**, not "segmentation", and its tooltip says why there is no cell half.
The alternative — a tick labelled "segmentation" that paints only a nucleus — is the kind of
half-true control this card has been removing all afternoon.

`core/segpaint.js` needs nothing new: `paint()` only touches `CFG.seg` when it is given a `root`,
so configuring with `seg:""` and passing only `nuc` paints the nucleus layer and never reaches for
the volume that is not there.

── AND IT IS THE ALIGNMENT CHECK THIS PAGE HAS NOT HAD ─────────────────────────

Worth more here than on µJump. δJump's frame is 9/9/45 nm, its imagery is 9.7 and its nucleus
volume is 77.6 at mip 0 — three grids that have to agree through nanometres. Painting the nucleus
on the section is the first thing on this page that shows all three agreeing, in a picture, on a
cell the reader chose.

Run: python3 src/the_em_preview_paints_the_nucleus.py
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


PAIRS = [
    (u"its own remembered switch for the overlay",
     u'''var EM_PLANE_KEY = "djump_panel_emplane", EM_PLANE_TOKEN = 0,''',
     u'''var EM_PLANE_KEY = "djump_panel_emplane", EM_PLANE_SEG_KEY = "djump_panel_emseg",
    EM_PLANE_TOKEN = 0,'''),

    (u"...and a reader for it",
     u'''function emPlaneSay(tok, msg, bad){''',
     u'''/* On by default, like the section itself: somebody who has asked for the EM has asked to see
   which nucleus the card is talking about. Remembered per page. */
function emPlaneSegOn(){
  try { var v = localStorage.getItem(EM_PLANE_SEG_KEY); return v === null ? true : v === "1"; }
  catch (_e) { return true; }
}
function emPlaneSay(tok, msg, bad){'''),

    (u"the box knows which nucleus it is about",
     u'''function emPlaneBox(pos){''',
     u'''function emPlaneBox(pos, nucId){'''),

    (u"...and remembers it with the coordinate",
     u'''  EM_PLANE_LAST = { pos: pos };''',
     u'''  EM_PLANE_LAST = { pos: pos, nuc: String(nucId == null ? "" : nucId) };'''),

    (u"...and offers the tick beside the section's own",
     u'''    + 'EM section</label> <span id="emPlaneSay" style="color:var(--mut)">' ''' .rstrip(),
     u'''    + 'EM section</label>'
    /* ── THE NUCLEUS, AND ONLY THE NUCLEUS ────────────────  2026-09-20
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
     + (emPlaneSegOn() ? " checked" : "") + '> nucleus</label>')
    + ' <span id="emPlaneSay" style="color:var(--mut)">' '''.rstrip()),

    (u"the draw paints it after the section",
     u'''    } catch (_t) {}
    emPlaneSay(tok, "");
  } catch (e) {
    if (EM_PLANE_TOKEN !== tok) return;
    emPlaneSay(tok, "could not read the imagery: " + String(e && e.message || e), true);''',
     u'''    } catch (_t) {}
    /* ── AND THE NUCLEUS ON TOP OF IT ─────────────────────  2026-09-20
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
      }
    } else if (!emPlaneSegOn()) {
      emPlaneSay(tok, "");
      return;
    }
    emPlaneSay(tok, "");
  } catch (e) {
    if (EM_PLANE_TOKEN !== tok) return;
    emPlaneSay(tok, "could not read the imagery: " + String(e && e.message || e), true);'''),

    (u"the toggle listens for both ticks",
     u'''    if (!t || t.id !== "emPlaneOn") return;
    try { localStorage.setItem(EM_PLANE_KEY, t.checked ? "1" : "0"); } catch (_e) {}''',
     u'''    if (!t || (t.id !== "emPlaneOn" && t.id !== "emPlaneSeg")) return;
    try { localStorage.setItem(t.id === "emPlaneSeg" ? EM_PLANE_SEG_KEY : EM_PLANE_KEY,
                              t.checked ? "1" : "0"); } catch (_e) {}'''),

    (u"and the card hands it this cell's nucleus",
     u'''  h+=renderLocationDiagram(pos,emPlaneBox(pos));''',
     u'''  h+=renderLocationDiagram(pos,emPlaneBox(pos,NID[i]));'''),
]

print("djump.html")
edit("djump.html", PAIRS, marker=u"THE NUCLEUS, AND ONLY THE NUCLEUS")


# EM_SEG_ALPHA is µJump's constant and δJump has never needed one.
ALPHA_OLD = u'''const EM_WINDOW = { lo: EM_SHADER_CONTROLS.normalized.range[0],
                    hi: EM_SHADER_CONTROLS.normalized.range[1] };'''
ALPHA_NEW = u'''const EM_WINDOW = { lo: EM_SHADER_CONTROLS.normalized.range[0],
                    hi: EM_SHADER_CONTROLS.normalized.range[1] };
/* How solid the nucleus overlay is on the EM section. µJump's number, and the same reasoning:
   dark enough to read the boundary against grey tissue, light enough to see the chromatin
   through it. */
const EM_SEG_ALPHA = 0.32;'''

edit("djump.html", [
    (u"...at µJump's overlay strength", ALPHA_OLD, ALPHA_NEW),
])

print(u"\nnow: node emdjumpcheck.js && node storagekeycheck.js")
