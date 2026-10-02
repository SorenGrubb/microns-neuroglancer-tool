# -*- coding: utf-8 -*-
u"""The nucleus arrives in micrometres, and was being read as nanometres.                2026-10-03

Søren, with three screenshots of the Discussion's EM preview: *"When I press the cell here in 3D
this is what I get, looks good. However, when I press and its nucleus, this is what I get. It moves
far away and I don't see a nucleus, even when I look closely"*.

THE PANEL SAID SO AND NOBODY READ IT: `0.0 × 0.0 × 0.0 µm · 21,208 triangles`. A real mesh with
twenty-one thousand triangles and a bounding box that rounds to zero at one decimal place. The
nucleus was not missing. It was about ten nanometres across.

ONE SOURCE, TWO READERS, AND THE READERS DISAGREED.

  core/nucmesh.js, at the end of fetchNucleus:
      /* NANOMETRES IN, MICROMETRES OUT — the unit core/mesh.js hands back, so the caller has one
         frame for the cell, the nucleus and the tracing. */
      pos[at + k] = p.verts[k] / 1000;

  core/empreview.js, three lines above where it uses it:
      /* core/mesh.js hands back MICROMETRES; core/nucmesh.js hands back nanometres. Saying so at
         each call is what keeps the two in one frame */
      parts.push({ what: "nucleus", mesh: n, unitNm: 1 });

The comment is not merely wrong, it is confidently wrong, and it is sitting exactly where somebody
would look to check. core/tracingcard.js reads the same function and passes 1000 for the nucleus
ghost as well as the cell, which is why the tracing pad has never shown this.

AND IT EXPLAINS THE SECOND SYMPTOM, which is the one that looked like a camera fault. drawMeshes
builds ONE frame across both meshes so the nucleus is drawn in the cell's place rather than centred
on itself. A nucleus whose coordinates are a thousand times too small sits essentially at the
absolute origin — hundreds of micrometres from a cell at (300000, 400000, 500000) nm — so the joint
box stretches to cover the gap, every vertex normalises against that, and the cell becomes a speck
in the corner. "It moves far away" was the frame, not the camera.

WHAT I GOT WRONG LAST SESSION, since it is the same panel and the same complaint. Søren: "I don't
see the nucleus inside the cell." I inverted the lead and the ghost so the nucleus would be the
solid subject and the cell the thing you look through. That was a real improvement and it was not
the bug: it turned an invisible ten-nanometre sphere into a solidly drawn ten-nanometre sphere.
A fix that makes a symptom better without touching the cause is how a bug survives a fix.

THE CHECK ASSERTS THE AGREEMENT, not the picture. empreviewunitcheck.js hands the panel a cell and
a nucleus of known size in the units their real sources return, and asserts the nucleus's prepared
box is the size it was given — so the next reader of core/nucmesh.js who guesses wrong fails here
rather than shipping a speck.

Run: python3 src/the_nucleus_arrives_in_micrometres.py, then node empreviewunitcheck.js
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


edit("core/empreview.js", [

 (u"the nucleus is micrometres, like everything else here",
  u'''      parts.push({ what: "nucleus", mesh: n, unitNm: 1 });''',
  u'''      /* MICROMETRES, like the cell. core/nucmesh.js divides by 1000 on the way out -- its own
         closing comment says "NANOMETRES IN, MICROMETRES OUT -- the unit core/mesh.js hands back"
         -- and this read it as nanometres, so the nucleus was drawn a thousand times too small and
         the joint frame stretched from the origin to the cell to cover the gap. The panel said so
         the whole time: "0.0 x 0.0 x 0.0 um - 21,208 triangles". 2026-10-03, from Søren's
         screenshots. core/tracingcard.js has always passed 1000 here. */
      parts.push({ what: "nucleus", mesh: n, unitNm: 1000 });'''),

 (u"...and the comment that said otherwise is corrected where it stands",
  u'''      /* core/mesh.js hands back MICROMETRES; core/nucmesh.js hands back nanometres. Saying so at
         each call is what keeps the two in one frame -- see core/mesh3d.js's note on unitNm. */''',
  u'''      /* BOTH hand back MICROMETRES -- core/mesh.js and core/nucmesh.js, which converts on the
         way out for exactly this reason. This comment used to say they differed, which is worse
         than no comment: it is confidently wrong and it sits where somebody would look to check.
         Saying so at each call is what keeps the two in one frame -- see core/mesh3d.js on
         unitNm. */'''),
])
print("\nNow: node empreviewunitcheck.js && node empreviewcheck.js")
