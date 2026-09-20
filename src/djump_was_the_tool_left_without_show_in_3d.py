# -*- coding: utf-8 -*-
u"""δJump gets "Show in 3D", which it has been one line short of since 2026-09-01.

Søren: *"Also, the show in 3D is missing from dJump."*

core/mesh3d.js's own header names the tools it was written for:

> µJump, **δJump** and πJump all render their mesh-download control as
> `<button class="idbtn meshdl" data-root="…">` … So this module installs ITSELF … **Every tool
> needs exactly one line added -- the script tag** -- and none of them needs its own logic touched.

Surveyed across the family:

    ujump.html   tag ✓   .meshdl[data-root] ✓
    djump.html   tag ✗   .meshdl[data-root] ✓      <- the button with nothing to install onto
    pjump.html   tag ✓   .meshdl[data-root] ✓
    bjump.html   tag ✓
    hjump.html   tag ✓   (its missing data-root was the bug fixed on 2026-09-01)
    ljump.html   neither, correctly — Lee16 has no meshes at all

**δJump is the only page in the family that renders the button and never loaded the renderer.**
Nothing was broken by it and nothing said anything: the module installs itself by watching for
those buttons, so a page that does not load it simply never grows the control, which looks exactly
like a page that was never meant to have one. Two of this file's own comments already refer to
"the row the *Show in 3D* button sits in" and to core/mesh3d.js inserting its canvas host — written
while fixing the volume row, against a page where neither could ever happen.

It needs nothing else. UJ.cfg.mesh here is complete — meshBase, meshBaseAlt, the Draco decoder, the
9.7/9.7/45 transform — and core/mesh.js has been fetching and decoding V1DD meshes all along; the
only thing missing was somewhere to draw them. The manifest still needs a CAVE token, exactly as
the .glb download already does, so this adds no new login that the button beside it did not have.

Run: python3 src/djump_was_the_tool_left_without_show_in_3d.py
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


TAG_OLD = u'''<script src="core/mesh.js"></script>
<script src="core/colabexport.js"></script>'''

TAG_NEW = u'''<script src="core/mesh.js"></script>
<!-- Show in 3D, installed onto the .meshdl[data-root] buttons this page already renders. One line,
     which is all core/mesh3d.js has ever asked of a host — it watches for those buttons and puts
     its own control beside each. µJump, πJump, βJump and ηJump got this on 2026-09-01 and δJump
     did not, so the button was here and the renderer was not. After core/mesh.js, which is what
     hands it {positions, indices}. -->
<script src="core/mesh3d.js"></script>
<script src="core/colabexport.js"></script>'''

print("djump.html")
edit("djump.html", [
    (u"the renderer the .meshdl buttons install onto", TAG_OLD, TAG_NEW),
], marker=u'<script src="core/mesh3d.js"></script>')

print(u"\nnow: node emdjumpcheck.js && node m3dnuccheck.js")
