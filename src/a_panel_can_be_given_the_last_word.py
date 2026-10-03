# -*- coding: utf-8 -*-
u"""A caller can put a sentence under the panel as well as over it.                      2026-10-03

core/mesh3d.js's note has had `o.lead` since the Discussion preview needed to say which surface was
the nucleus: a caller's sentence ABOVE the size line. χJump needs one BELOW it -- the orientation
paragraph that lets Søren settle "is this cell upside down?" by eye rather than by argument:

    Before you turn it: up is towards the pia (molecular layer), down is deeper (granular layer,
    then white matter). A Purkinje cell's dendritic tree should be above its soma.

That sentence has to come after the size, because it is about the picture and the size is about the
measurement. So: `o.tail`, appended last -- after the oversize warning too, which is the one thing
that should never have anything between it and the picture it is warning about.

Written as part of moving χJump's 3D panel onto this renderer (xjump-build/src/
one_renderer_for_every_tool.py); it is the one thing the shared panel could not already do.

Run: python3 src/a_panel_can_be_given_the_last_word.py
     python3 src/build_stamps.py
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


edit("core/mesh3d.js", [

 (u"the caller's last word",
  u'''        + geo.oversize.axis + ", and the whole volume is only "
        + (geo.oversize.max/1000).toFixed(1) + " µm. Something is wrong with the mesh transform "
        + "rather than with this cell.</span>";
''',
  u'''        + geo.oversize.axis + ", and the whole volume is only "
        + (geo.oversize.max/1000).toFixed(1) + " µm. Something is wrong with the mesh transform "
        + "rather than with this cell.</span>";
    /* ── AND THE CALLER'S LAST WORD ───────────────────────────────────────────  2026-10-03
       `lead` is a sentence above the size line; this is one below it, and χJump's orientation
       paragraph is why it exists -- "up is towards the pia" is about the PICTURE, where the size
       line is about the measurement, so it belongs the other side of it. After the oversize
       warning as well: nothing should come between that and the shape it is warning about. */
    if (o.tail) note.innerHTML += "<br>" + o.tail;
'''),
])
print("\nNow: python3 src/build_stamps.py")
