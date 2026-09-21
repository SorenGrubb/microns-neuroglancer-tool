# -*- coding: utf-8 -*-
u"""A dataset with no flat cell segmentation still knows its own nucleus.        2026-09-20

Søren: *"Also, the cell and nucleus segmentation is missing from the 3D window in the tracing."*

MEASURED FIRST, on the live δJump, because every part of the machinery looked present:

    UJ.cfg.mesh                     configured (v1dd_pcg graphene_meshes)
    MeshDL                          object, fetchCombinedMesh present
    UJ.nucmesh                      present; _meshDir() -> "mesh_mip_0_err_40"
    fetchNucleus("308149")          2 fragments, 13,903 vertices
    #tracePadGhosts                 present AND ticked by default
    pad3DGhostMeshes() with the
      nucleus id typed in by hand   -> [{what:"nucleus", verts:13903}]

So the ghosts work. What does not is getting an id into the box in the first place:

    UJ.segread.configure(tracingSources());          // δJump: seg:"" on purpose
    await UJ.segread.resolveAt([95086,88093,6130]);
    -> Error: no info at  (404)

Note the empty base in that message. V1DD's cell segmentation is graphene behind a CAVE login, and
segread's own configure() REFUSES a graphene:// source rather than hand back supervoxel ids dressed
as root ids — so δJump configures `seg: ""`, deliberately. The empty string then travelled to
valueAt, which fetched `"" + "/info"`, i.e. grubblab.com's own 404 page, and threw.

TWO BUGS, ONE ON TOP OF THE OTHER:

  1. an unconfigured volume was treated as a broken one. "This dataset has no flat cell
     segmentation" is a fact about the dataset and should be reported, not thrown;
  2. `resolveAt` read both volumes through `Promise.all`, so the cell half's rejection took the
     NUCLEUS half's answer down with it. The nucleus volume is plain public precomputed and had
     read fine; nobody ever saw the result.

padOpen() calls tracingResolveAt(), which is where both id boxes come from. It threw, both boxes
stayed empty, pad3DIds() returned two empty strings, pad3DGhostMeshes() fetched nothing and
returned with NO NOTE EITHER — so the pad's 3D window drew the contours alone and said nothing
about why there was nothing around them. That silence is the third fix here.

WHAT IT SAID BEFORE, on a dataset with no cell segmentation:

    Could not read the segmentation there: no info at  (404)

WHAT IT SAYS NOW (nucleus filled in, cell explained):

    At that coordinate: nucleus 308149 — filled in below.
    (this dataset has no flat cell segmentation to read.)

λJUMP IS NOT AFFECTED and is not changed. It has no UJ.cfg.mesh and no nucleus source at all, so
padTrimForHost() removes the ghost ticks outright — there is genuinely nothing to draw around a
Lee16 tracing, and a tick that promises one would be the overstatement this card has spent the week
removing.

Run: python3 src/the_ghosts_need_an_id_to_be_ghosts_of.py
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


# ── 1. segread: an unconfigured volume is a fact, not a failure ────────────────────────────────
NUC_OLD = u'''  async function nucleusAt(vox){
    if (!CFG) throw new Error("segread.configure() first");
    var r = await valueAt(CFG.nuc, 1, vox, CFG.res);'''

NUC_NEW = u'''  async function nucleusAt(vox){
    if (!CFG) throw new Error("segread.configure() first");
    if (!CFG.nuc)
      return { nucleusId: 0, why: "this dataset has no nucleus volume to read" };
    var r = await valueAt(CFG.nuc, 1, vox, CFG.res);'''

SEG_OLD = u'''  async function segmentAt(vox){
    if (!CFG) throw new Error("segread.configure() first");
    var r = await valueAt(CFG.seg, 2, vox, CFG.res);
    return { rootId: r.value, why: r.why };
  }'''

SEG_NEW = u'''  /* ── A DATASET WITH NO FLAT CELL SEGMENTATION IS NOT A BROKEN ONE ─────  2026-09-20
     δJump configures `seg: ""` ON PURPOSE: V1DD's cell segmentation is graphene behind a CAVE
     login, and configure() above refuses a graphene:// source rather than return supervoxel ids
     dressed as root ids. The empty string went on to valueAt, which fetched `"" + "/info"` — the
     host's own 404 page — and threw `no info at  (404)`, with the base missing from the message
     because there was no base.

     Measured on the live δJump, 2026-09-20. The symptom was two levels away: Søren, *"the cell and
     nucleus segmentation is missing from the 3D window in the tracing"*. padOpen() resolves the
     coordinate to fill the two id boxes, this threw, both boxes stayed empty, and the pad's ghosts
     need an id to be ghosts of. */
  async function segmentAt(vox){
    if (!CFG) throw new Error("segread.configure() first");
    if (!CFG.seg)
      return { rootId: "0", why: "this dataset has no flat cell segmentation to read" };
    var r = await valueAt(CFG.seg, 2, vox, CFG.res);
    return { rootId: r.value, why: r.why };
  }'''

RES_OLD = u'''  async function resolveAt(vox){
    var pair = await Promise.all([segmentAt(vox), nucleusAt(vox)]);
    return { rootId: pair[0].rootId, nucleusId: pair[1].nucleusId,
             inCell: pair[0].rootId !== "0", inNucleus: pair[1].nucleusId !== 0,
             why: pair[0].why || "" };
  }'''

RES_NEW = u'''  /* NEITHER HALF MAY COST THE OTHER ITS ANSWER.  2026-09-20. This was a bare `Promise.all`, so
     one volume rejecting — a bucket moved, a login in the way, a dataset that simply has no cell
     segmentation — rejected the pair, and the caller learned nothing about the point INCLUDING
     the half that had read perfectly well. On δJump the nucleus volume is plain public
     precomputed and answered every time; nobody ever saw it.

     Each half is settled on its own now and its failure becomes its own `why`, so a caller can
     say what it read and what it could not in the same sentence. */
  async function resolveAt(vox){
    var pair = await Promise.all([
      segmentAt(vox).catch(function(e){
        return { rootId: "0",
                 why: "the cell segmentation could not be read: " + String(e && e.message || e) };
      }),
      nucleusAt(vox).catch(function(e){
        return { nucleusId: 0,
                 why: "the nucleus volume could not be read: " + String(e && e.message || e) };
      })
    ]);
    return { rootId: pair[0].rootId, nucleusId: pair[1].nucleusId,
             inCell: pair[0].rootId !== "0", inNucleus: pair[1].nucleusId !== 0,
             why: pair[0].why || "", nucWhy: pair[1].why || "" };
  }'''

print("core/segread.js")
edit("core/segread.js", [
    (u"a nucleus volume that was never configured is said, not fetched", NUC_OLD, NUC_NEW),
    (u"...and so is a cell segmentation that was never configured", SEG_OLD, SEG_NEW),
    (u"...and one volume failing no longer loses the other's answer", RES_OLD, RES_NEW),
], marker=u"NEITHER HALF MAY COST THE OTHER ITS ANSWER")


# ── 2. the card says which half it could not read ──────────────────────────────────────────────
CARD_OLD = u'''    say.textContent=bits.length
      ? "At that coordinate: "+bits.join(", ")+" \\u2014 filled in below."
      : "Nothing is segmented at that coordinate, which is usually why you are tracing it.";
    tracingSuggestType();'''

CARD_NEW = u'''    /* WHAT WAS NOT READ, AND WHY, BESIDE WHAT WAS.  2026-09-20. V1DD has no flat cell
       segmentation this tool may index, so the root ID box stays empty there however good the
       coordinate is — and an empty box under "nothing is segmented at that coordinate" reads as a
       fact about the tissue when it is a fact about the dataset. Only the two answers that are
       about a VOLUME rather than about this point are repeated; "nothing segmented there" is
       already the sentence above. */
    const missed=[];
    if(/no flat cell segmentation|could not be read/.test(r.why||"")) missed.push(r.why);
    if(/no nucleus volume|could not be read/.test(r.nucWhy||"")) missed.push(r.nucWhy);
    say.textContent=(bits.length
      ? "At that coordinate: "+bits.join(", ")+" \\u2014 filled in below."
      : "Nothing is segmented at that coordinate, which is usually why you are tracing it.")
      +(missed.length?" ("+missed.join("; ")+".)":"");
    tracingSuggestType();'''

GHOST_OLD = u'''  PAD3D_MESHES = out; PAD3D_KEY = ids.key; PAD3D_NOTE = notes.join("; ");
  return out;'''

GHOST_NEW = u'''  /* SILENCE WAS THE WORST OF THE THREE.  2026-09-20. With both id boxes empty this returned an
     empty list and an empty note, so the preview drew the contours alone and said nothing at all
     about the surroundings the tick above it had just promised. A tick that is on, and a picture
     with nothing in it, and no sentence joining them. */
  if (!out.length && !notes.length)
    notes.push("no cell or nucleus ID in the boxes above, so there is nothing to draw around it \\u2014 "
             + "type one in, or open the pad from a cell");
  PAD3D_MESHES = out; PAD3D_KEY = ids.key; PAD3D_NOTE = notes.join("; ");
  return out;'''

print("\ncore/tracingcard.js")
edit("core/tracingcard.js", [
    (u"the card says which volume it could not read", CARD_OLD, CARD_NEW),
    (u"...and the 3D preview says why it has no surroundings", GHOST_OLD, GHOST_NEW),
], marker=u"SILENCE WAS THE WORST OF THE THREE")
