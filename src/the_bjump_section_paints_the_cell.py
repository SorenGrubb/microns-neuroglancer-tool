# -*- coding: utf-8 -*-
u"""βJump's EM section paints the cell it is about.                              2026-09-21

Søren, on δJump's section yesterday: *"Now it has the nucleus segmentation, what about the rest of
the segmentation?"* On δJump the rest is a CAVE-gated graphene volume. On βJump it is not: both
segmentations are sharded compressed_segmentation, public, readable through the JSON API route
core/segread.js learnt this morning, and their ids are the page's own BSEG column.

── TWO SEGMENTATIONS, AND A CELL BELONGS TO ONE OF THEM ───────────────────────────

βJump's table records WHICH volume each nucleus's segment came from — BSRC: 1 is
segmentation_secgan_16nm, 2 is segmentation_32nm. A segment id means nothing outside its own
volume, so painting BSEG[i] from the wrong one paints a stranger or nothing. The card passes the
cell's own volume on every draw.

core/segpaint.js keeps ONE configured volume, and the tracing pad configures it with secgan16. So
rather than reconfigure the shared reader under the pad's feet, `paint()` takes an optional
per-call `seg` — ignored by every caller that does not pass one, so µJump, δJump and the pad are
unchanged.

── WHAT IS PAINTED ──────────────────────────────────────────────────────────────

The cell, in the magenta µJump and the pad use, at µJump's 0.32. βJump has no nucleus volume — its
nuclei are Hoechst blob detections — so the tick says "cell", for the reason δJump's says
"nucleus": a control is named for what it paints. A nucleus with no segment gets no tick; its card
already carries the "no segment" tag.

The section is the 64 nm level, a two-section slab. segpaint picks the segmentation's own 64 nm
level for it, which has the same 60 nm z — so the cell is painted at the depth the EM was.

── ITS KEY IS A LITERAL ON ITS OWN LINE ─────────────────────────────────────────

storagekeycheck.js reads `var X_KEY = "..."` declarations. δJump's and µJump's overlay key is the
SECOND declarator of a `var` list and is chosen with a ternary, and both are among that check's two
known reds. This one is its own statement, and the toggle writes each key by name.

Run: python3 src/the_bjump_section_paints_the_cell.py
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


# ══ core/segpaint.js: a per-call segmentation ═════════════════════════════════════════════════
SP_OLD = u'''    var root = CFG.seg ? idPair(o.root) : null, nuc = CFG.nuc ? idPair(o.nuc) : null;'''
SP_NEW = u'''    /* o.seg: THIS CALL'S cell segmentation, 2026-09-21. βJump has two, and each cell's id belongs
       to one of them; the configured volume is the tracing pad's. Absent, it is CFG.seg as ever. */
    var SEG = o.seg ? UJ.segread._httpBase(o.seg) : CFG.seg;
    var root = SEG ? idPair(o.root) : null, nuc = CFG.nuc ? idPair(o.nuc) : null;'''
SP2_OLD = u'''      out.cell = await layer(img.data, view, CFG.seg, [root], [CELL_COLOR], alpha, tick);'''
SP2_NEW = u'''      out.cell = await layer(img.data, view, SEG, [root], [CELL_COLOR], alpha, tick);'''

print("core/segpaint.js")
edit("core/segpaint.js", [
    (u"paint() takes this call's segmentation", SP_OLD, SP_NEW),
    (u"...and paints the cell from it", SP2_OLD, SP2_NEW),
])


# ══ bjump.html ════════════════════════════════════════════════════════════════════════════════
PAIRS = [
    (u"the overlay's strength, µJump's",
     u'''const EM_WINDOW = { lo: 10, hi: 244 };''',
     u'''const EM_WINDOW = { lo: 10, hi: 244 };
/* How solid the cell is over the EM section. µJump's number, for µJump's reason: dark enough to
   read the boundary against grey tissue, light enough to see the membrane through it. */
const EM_SEG_ALPHA = 0.32;'''),

    (u"its own remembered switch for the overlay, as a literal on its own line",
     u'''var EM_PLANE_KEY = "bjump_panel_emplane", EM_PLANE_TOKEN = 0,''',
     u'''var EM_PLANE_SEG_KEY = "bjump_panel_emseg";
var EM_PLANE_KEY = "bjump_panel_emplane", EM_PLANE_TOKEN = 0,'''),

    (u"...and a reader for it",
     u'''function emPlaneSay(tok, msg, bad){''',
     u'''/* On by default, like the section: somebody who has asked for the EM has asked to see which
   cell the card is about. Remembered. */
function emPlaneSegOn(){
  try { var v = localStorage.getItem(EM_PLANE_SEG_KEY); return v === null ? true : v === "1"; }
  catch (_e) { return true; }
}
function emPlaneSay(tok, msg, bad){'''),

    (u"the box knows which cell it is about, and in which volume",
     u'''function emPlaneBox(pos){''',
     u'''function emPlaneBox(pos, segId, segSrc){'''),

    (u"...and remembers both with the coordinate",
     u'''  EM_PLANE_LAST = { pos: pos };''',
     u'''  EM_PLANE_LAST = { pos: pos, seg: segId ? String(segId) : "", src: segSrc || "" };'''),

    (u"...and offers the tick beside the section's own",
     u'''    + 'EM section</label> <span id="emPlaneSay" style="color:var(--mut)">\'''',
     u'''    + 'EM section</label>'
    /* ── THE CELL ────────────────────────────────────────────────────────────────  2026-09-21
       Named for what it paints, as δJump's "nucleus" is. There is no nucleus volume here —
       βJump's nuclei are Hoechst detections — and a nucleus with no segment gets no tick at all:
       its card already says "no segment". */
    + (missing || !EM_PLANE_LAST.seg ? "" :
       ' <label for="emPlaneSeg" style="display:inline-flex;align-items:center;gap:5px;'
     + 'margin:0 0 0 9px;cursor:pointer;text-transform:none;letter-spacing:0;font-size:inherit;'
     + 'color:inherit" title="Paints segment ' + escHtml(EM_PLANE_LAST.seg) + ' over the section '
     + 'in magenta, from the segmentation it belongs to. One more fetch; remembered.">'
     + '<input type="checkbox" id="emPlaneSeg" style="width:auto;margin:0"'
     + (emPlaneSegOn() ? " checked" : "") + '> cell</label>')
    + ' <span id="emPlaneSay" style="color:var(--mut)">\''''),

    (u"the draw paints the cell after the section",
     u'''    } catch (_t) {}
    emPlaneSay(tok, "");
  } catch (e) {
    if (EM_PLANE_TOKEN !== tok) return;
    emPlaneSay(tok, "could not read the imagery: " + String(e && e.message || e), true);''',
     u'''    } catch (_t) {}
    /* ── AND THE CELL ON TOP OF IT ─────────────────────────────────────────────────  2026-09-21
       From the volume this cell's id belongs to — a segment id means nothing outside it — passed
       per call, so the pad's configured volume is never touched. */
    var segId = (EM_PLANE_LAST && EM_PLANE_LAST.seg) || "";
    if (emPlaneSegOn() && segId && EM_PLANE_LAST.src && UJ.segpaint) {
      if (!UJ.segpaint.configured())
        UJ.segpaint.configure({ seg: UJ.cfg.viewer.seg, nuc: "", res: UJ.cfg.res });
      emPlaneSay(tok, "reading the segmentation\\u2026");
      var got = await UJ.segpaint.paint(cv, view, { root: segId, seg: EM_PLANE_LAST.src,
                                                    alpha: EM_SEG_ALPHA });
      if (EM_PLANE_TOKEN !== tok) return;
      /* After the overlay, because segpaint rewrites the whole canvas. */
      emPlaneScaleBar(cv, view);
      if (got && got.ok && !got.painted) {
        emPlaneSay(tok, "the cell is not on this plane");
        return;
      }
    }
    emPlaneSay(tok, "");
  } catch (e) {
    if (EM_PLANE_TOKEN !== tok) return;
    emPlaneSay(tok, "could not read the imagery: " + String(e && e.message || e), true);'''),

    (u"the toggle listens for both ticks, and writes each key by name",
     u'''    if (!t || t.id !== "emPlaneOn") return;
    try { localStorage.setItem(EM_PLANE_KEY, t.checked ? "1" : "0"); } catch (_e) {}''',
     u'''    if (!t || (t.id !== "emPlaneOn" && t.id !== "emPlaneSeg")) return;
    try {
      if (t.id === "emPlaneSeg") localStorage.setItem(EM_PLANE_SEG_KEY, t.checked ? "1" : "0");
      else localStorage.setItem(EM_PLANE_KEY, t.checked ? "1" : "0");
    } catch (_e) {}'''),

    (u"and the card hands it this cell's segment and its volume",
     u'''  h+=emPlaneBox(pos);''',
     u'''  h+=emPlaneBox(pos, seg, src===1 ? UJ.cfg.viewer.seg : src===2 ? UJ.cfg.viewer.seg32 : "");'''),
]

print("\nbjump.html")
edit("bjump.html", PAIRS, marker=u"AND THE CELL ON TOP OF IT")
