# -*- coding: utf-8 -*-
u"""One registry of imaged volumes, and everything asks it.                              2026-10-03

Søren: *"We should enable EM section, meshes and 3D structure also for minnie35 data."*

THE RULE WAS ALREADY WRITTEN, AND IN THE WRONG PLACE. core/jumplink.js has resolved a pasted
coordinate to one of the two minnie volumes since the Discussion was built, and
window.jumpLinkHost() has listed both with their boxes, their imagery and their segmentation since
the same day. The pad, the cell card's EM plane, the mesh fetch and the EM preview never saw any of
it: each reached straight into minnie65's SRC, which is why a coordinate in minnie35 shows
"outside minnie65's imagery, so there is no section to draw here" over three ticked boxes.

So: core/volumes.js is that list and that containment test, moved to where everything can ask, and
this is the first of the changes that make the asking happen. It is NOT a second copy —
core/jumplink.js now delegates to it, and jumplinkcheck.js is what proves the answer did not change
in the move.

WHAT IS AND IS NOT DECIDED HERE

  The seam is settled by LIST ORDER, as it already was. minnie65's imagery starts at section 14,816
  and minnie35's runs to 14,860, so forty-four sections are inside both boxes; a point there
  resolves to minnie65, the volume with segmentation, nuclei and cell types over it. Stated as
  priority rather than as a name, and volumescheck.js reverses the list to prove it.

  MESH IS AN OBJECT, NOT A URL. minnie65's mesh store is seg_m1300's, which needs a base, a CORS
  fallback base and a suffix; core/mesh.js already knows that shape. minnie35's is the `mesh`
  directory its own seg info names. The registry carries whatever core/mesh.js wants and has no
  opinion about it.

  NUC IS ABSENT ON minnie35, not empty, because there is no MICrONS nucleus detection out there and
  an empty nuclei layer looks like a dataset with nothing in it rather than like one nobody has run
  a detector over. The same distinction the viewer links have made since they were written.

NOTHING BEHAVES DIFFERENTLY YET. This change adds the registry and points jumplink at it; the pad,
the card, the mesh fetch and the preview still read minnie65 and are the next three steps. Landing
it on its own is deliberate: the registry is the piece every one of those depends on, and a
regression in it would otherwise arrive mixed in with four other things.

Checks: volumescheck.js (new, 17), jumplinkcheck.js (the one that proves the move changed nothing).
Run: python3 src/one_registry_of_imaged_volumes.py, then node volumescheck.js && node jumplinkcheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/jumplink.js", [

 (u"the containment test comes from the registry now",
  u'''function inBox(nm, bb){
  return nm[0] >= bb.xmin && nm[0] <= bb.xmax
      && nm[1] >= bb.ymin && nm[1] <= bb.ymax
      && nm[2] >= bb.zmin && nm[2] <= bb.zmax;
}''',
  u'''/* ── ONE CONTAINMENT TEST, AND IT LIVES IN core/volumes.js ─────────────────────  2026-10-03
   It was written here, because this was the only thing that needed it. The pad, the cell card, the
   mesh fetch and the EM preview need it too now that minnie35 is being drawn, and four copies of
   "is this point in that box" is four chances for one of them to be the wrong one. The fallback is
   the same three lines rather than a refusal: core/volumes.js is loaded before this file on every
   page that has one, and a page that somehow has not loaded it should still linkify. */
function inBox(nm, bb){
  if (window.UJ && UJ.volumes && UJ.volumes.inBox) return UJ.volumes.inBox(nm, bb);
  if (!nm || !bb) return false;
  return nm[0] >= bb.xmin && nm[0] <= bb.xmax
      && nm[1] >= bb.ymin && nm[1] <= bb.ymax
      && nm[2] >= bb.zmin && nm[2] <= bb.zmax;
}'''),
])


edit("ujump.html", [

 (u"core/volumes.js loads before anything that asks it",
  u'<script src="core/mesh.js"></script>',
  u'<!-- WHICH IMAGED VOLUME A COORDINATE IS IN. 2026-10-03. First, because core/jumplink.js, the\n'
  u'     mesh fetch, the pad and the EM preview all resolve against it. -->\n'
  u'<script src="core/volumes.js"></script>\n'
  u'<script src="core/mesh.js"></script>'),

 (u"the two volumes are declared once, where their boxes are",
  u"  window.MINNIE65_EM_BB=MINNIE65_EM_BB;window.MINNIE35_EM_BB=MINNIE35_EM_BB;",
  u'''  window.MINNIE65_EM_BB=MINNIE65_EM_BB;window.MINNIE35_EM_BB=MINNIE35_EM_BB;
  /* ── AND THE REGISTRY EVERYTHING ELSE ASKS ────────────────────────────────────  2026-10-03
     Søren: "We should enable EM section, meshes and 3D structure also for minnie35 data."

     Declared HERE, beside the boxes, because the boxes are the half of a volume that is easy to
     get wrong and they should not be two scrolls away from the sources they describe. SRC is
     defined far above this and is a plain global, so it is in hand by the time this runs.

     ORDER IS PRIORITY: the two slabs overlap by forty-four sections, and a point in the seam is
     reported as minnie65, which is the one with segmentation, nuclei and cell types over it.

     minnie35 CARRIES NO `nuc`. There is no MICrONS nucleus detection over it, and an empty nuclei
     layer out there would look like a dataset with nothing in it. Its mesh store is the `mesh`
     directory its own segmentation info names; minnie65's is seg_m1300's, which is a different
     segmentation from minnie65/seg and the one every root id in this tool comes from. */
  if (window.UJ && UJ.volumes) UJ.volumes.configure([
    { key:"minnie65", label:"minnie65", bb:MINNIE65_EM_BB,
      em:SRC.em, seg:SRC.seg, nuc:SRC.nuc,
      mesh:{ meshBase:"https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300/mesh/",
             meshBaseAlt:"https://storage.googleapis.com/storage/v1/b/iarpa_microns/o/"
                        +"minnie%2Fminnie65%2Fseg_m1300%2Fmesh%2F",
             meshBaseAltSuffix:".shard?alt=media" } },
    { key:"minnie35", label:"minnie35", bb:MINNIE35_EM_BB,
      em:SRC.em35, seg:SRC.seg35,
      mesh:{ meshBase:"https://storage.googleapis.com/iarpa_microns/minnie/minnie35/seg/mesh/",
             meshBaseAlt:"https://storage.googleapis.com/storage/v1/b/iarpa_microns/o/"
                        +"minnie%2Fminnie35%2Fseg%2Fmesh%2F",
             meshBaseAltSuffix:".shard?alt=media" } }
  ]);'''),

 (u"jumpLinkHost reads the registry rather than listing them a second time",
  u'''      volumes:[
        {key:"minnie65",label:"minnie65",bb:window.MINNIE65_EM_BB,
         em:SRC.em,seg:SRC.seg,nuc:SRC.nuc},
        /* No `nuc`: there is no MICrONS nucleus detection over minnie35, and an empty nuclei
           layer out here would look like a dataset with nothing in it. */
        {key:"minnie35",label:"minnie35",bb:window.MINNIE35_EM_BB,
         em:SRC.em35,seg:SRC.seg35}
      ],''',
  u'''      /* ── THE REGISTRY, NOT A SECOND LIST ───────────────────────────────────────  2026-10-03
         These two were written out here, and the pad and the cell card could not see them. They
         are declared once now, beside their bounding boxes, and this reads that — so a source
         corrected in one place is corrected for the viewer links, the pad, the EM preview and the
         mesh fetch together. The empty array is for a page that somehow has no registry: jumplink
         then links nothing, which is what it did before any of this existed. */
      volumes:(window.UJ&&UJ.volumes)?UJ.volumes.all():[],'''),
])
print("\nNow: node volumescheck.js && node jumplinkcheck.js")
