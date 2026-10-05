# -*- coding: utf-8 -*-
u"""The coordinate does not say its unit.                                                2026-10-05

Søren, of the corner block: *"Drop the vox after the coordinates"*.

ADDED 4 OCTOBER ON A GUESS THAT WAS WRONG. The reasoning then was that the tool's own on-screen
labels can leave the unit off because they sit in a sentence that supplies it, and a posted picture
has no sentence around it. That is an argument for a reader who does not know the dataset. The
reader of a MICrONS coordinate does: six-figure x and y and a five-figure z are voxels and nothing
else, and the only thing you ever do with them is paste them into Neuroglancer's position box, which
wants exactly those three numbers and not a fourth word.

So the suffix goes, from the corner and from the caption together -- they are one list read twice,
and the caption is the corner's own words plus the dataset. Nothing else about either changes.

Check: shotcheck.js -- the corner's second line is three numbers and a unit is not one of them.
Run: python3 src/the_coordinate_does_not_say_its_unit.py
     python3 src/build_stamps.py
     node shotcheck.js
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
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/mesh3dshot.js", [

 (u"the note stops promising a unit",
  u"""     `vox` ON THE COORDINATE, which the tool's own on-screen labels do not bother with because they
     are surrounded by a sentence that says it. A posted picture has no sentence around it. Voxels
     rather than micrometres for ujump.html's reason: they paste straight back into Neuroglancer's
     position box and micrometres do not. 2026-10-04. */""",
  u"""     VOXELS, AND IT DOES NOT SAY SO. Added on 4 October on the argument that a posted picture has
     no sentence around it to supply the unit; dropped on the 5th, on Søren's *"Drop the vox after
     the coordinates"*, which is the better argument: whoever reads a MICrONS coordinate knows what
     it is, and the one thing anybody does with it is paste it into Neuroglancer's position box,
     which wants those three numbers and not a fourth word. Voxels rather than micrometres for
     ujump.html's reason -- micrometres do not paste back. 2026-10-05. */"""),

 (u"and the line is three numbers",
  u"""    if (L.atVox) out.push(L.atVox[0] + ", " + L.atVox[1] + ", " + L.atVox[2] + " vox");""",
  u"""    if (L.atVox) out.push(L.atVox[0] + ", " + L.atVox[1] + ", " + L.atVox[2]);"""),
])
print("\nNow: python3 src/build_stamps.py, then node shotcheck.js")
