# -*- coding: utf-8 -*-
"""The m-type moves into the badge, and a coordinate stops announcing its units.  2026-09-18

Søren, on the "Allen m-type (fine subtype): L3a" line under a cell's name: *"This is very specific
information for advanced users. I don't think we need that right there. Could that be a part of the
mouseover for the grey MICrONS prediction next to the name?"*

He is right about the audience, and the destination he picked is the right one for a reason worth
writing down: the m-type IS the MICrONS prediction, at a finer grain. The grey "MICrONS prediction"
beside the headline is the thing that says where the name came from, so the finer version of the
same prediction belongs in that label's tooltip rather than on a line of its own. It was already
carrying its provenance note in a `title`; this adds the fine subtype to it.

WHAT STAYS VISIBLE. The disagreement warning does -- "Broad class and fine m-type disagree" is not
specialist trivia, it is the page telling you not to trust the headline, and a warning in a tooltip
is a warning nobody reads. Only the line that quietly restated the prediction goes.

AND ONE WORD PAIR ON THE LINE BELOW. Søren: *"Here, we don't need to specify that it is a voxel,
just delete 'at voxel'."* The coordinate is rendered as a chip that is visibly a coordinate, the
whole tool works in voxels, and the three boxes it came from are labelled x/y/z -- "at voxel" was
telling a reader something they could not have got wrong. Only this line: the other three "at voxel"
phrasings in the file read "at voxel (x,y,z) -- outside the predicted volume", where the words are
carrying a contrast rather than restating the obvious.

Run: python3 src/the_m_type_moves_into_the_badge.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    # ── the badge's tooltip gains the fine subtype ──────────────────────────────────────────
    ('''    h+='<div class="celltype" id="ctHeadline"'''
     + '''\'+(unclassified?\' data-unclassified="1"\':\'\')+\' data-microns-name="\'+escHtml(longName(ti.name))+\'" title="\'+(ciBroad?ciBroad.full+" \\u2014 "+ciBroad.role:"")+\'">\'+celltypeLink(pos,longName(ti.name))+favStarHtml(nid,root,NX[i],NY[i],NZ[i])+\' <small>\'+(unclassified?"no MICrONS prediction":"MICrONS prediction")+\'</small></div>\';''',
     '''    /* 2026-09-18 (Søren: "This is very specific information for advanced users ... Could that be
       a part of the mouseover for the grey MICrONS prediction next to the name?") -- the Allen
       m-type used to be a line of its own under the headline. It IS the MICrONS prediction at a
       finer grain, and this grey label is the thing that says where the name came from, so the
       finer version of the same prediction belongs in its tooltip. The label already carried its
       own provenance note there; the subtype joins it. */
    const mtip=ti.mtype
      ?"Allen m-type (fine subtype): "+ti.mtype+" \\u2014 "+MTYPE_SOURCE_NOTE
        +(ciFine?" "+ciFine.full+": "+ciFine.role:"")
      :"";
    h+='<div class="celltype" id="ctHeadline"'''
     + '''\'+(unclassified?\' data-unclassified="1"\':\'\')+\' data-microns-name="\'+escHtml(longName(ti.name))+\'" title="\'+(ciBroad?ciBroad.full+" \\u2014 "+ciBroad.role:"")+\'">\'+celltypeLink(pos,longName(ti.name))+favStarHtml(nid,root,NX[i],NY[i],NZ[i])+\' <small\'+(mtip?\' title="\'+mtip+\'"\':\'\')+\'>\'+(unclassified?"no MICrONS prediction":"MICrONS prediction")+\'</small></div>\';''',
     "the grey prediction label carries the fine subtype"),

    # ── and the line under the headline goes ────────────────────────────────────────────────
    ('''    if(ti.mtype)h+='<div class="meta" title="'+MTYPE_SOURCE_NOTE+(ciFine?" \\u2014 "+ciFine.full+": "+ciFine.role:"")+'">Allen m-type (fine subtype): <b>'+ti.mtype+'</b></div>';
''',
     '''    /* The visible "Allen m-type (fine subtype)" line is gone -- it is in the grey MICrONS
       prediction label's tooltip now, a few lines above. The DISAGREEMENT warning below it stays
       visible on purpose: that one is the page telling you not to trust the headline, and a warning
       in a tooltip is a warning nobody reads. */
''',
     "...and the line that restated it is gone"),

    # ── and a coordinate that no longer announces its units ─────────────────────────────────
    ("""  h+='<div class="meta">nearest nucleus at voxel '+coordSpan(NX[i],NY[i],NZ[i])""",
     """  /* "at voxel" deleted 2026-09-18 (Søren) -- coordSpan renders a chip that is visibly a
     coordinate, this whole tool works in voxels, and the boxes it came from are labelled x/y/z. */
  h+='<div class="meta">nearest nucleus '+coordSpan(NX[i],NY[i],NZ[i])""",
     "the nearest-nucleus line stops saying 'at voxel'"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("ujump.html", PAIRS)
print("\nnow: node jumplayoutcheck.js && python3 src/build_stamps.py")
