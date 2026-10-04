# -*- coding: utf-8 -*-
u"""core/mesh3dshot.js onto the eight pages, and the renderer χJump reaches it by.       2026-10-03

The six hand-maintained pages load it after core/mesh3d.js — after, because the button is offered
only where the module is and mesh3d.js asks at the moment it builds the strip.

ωJump inlines it with the rest, in TRACING_MODULES beside mesh3d.js. It fetches core/vendor/gifenc.js
at the moment somebody exports a turn, which is the arrangement core/jxl.js already has in that
list: ωJump is served from the repo, so core/vendor/ is beside it, and most sessions never read
either file.

χJump IS THE ONE THAT NEEDS A WORD. Since src/one_renderer_for_every_tool.py its 3D panel is drawn
by core/mesh3d.js, which that page keeps as `UJ.mesh3dCore` because `UJ.mesh3d` there is χJump's own
fetching half. So the module asks for the CORE one first and falls back to UJ.mesh3d — on seven
pages those are the same object, and on the eighth that distinction is the whole reason the panel
works at all.

Run: python3 src/every_panel_can_be_saved.py
     python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, root=None):
    P = os.path.join(root or HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b:
        os.chmod(P, 0o644)
        io.open(P, "w", encoding="utf-8").write(s)


TAG = u'<script src="core/mesh3d.js"></script>'
BOTH = u'<script src="core/mesh3d.js"></script>\n<script src="core/mesh3dshot.js"></script>'

for page in ["ujump.html", "djump.html", "pjump.html", "ljump.html", "hjump.html", "bjump.html"]:
    edit(page, [(u"the panel can be saved from here", TAG, BOTH)])


# ── χJump: the module asks for the renderer the page actually uses ────────────────────────────
XJ = os.path.normpath(os.path.join(HERE, "..", "xjump-build"))
if not os.path.isdir(XJ):
    XJ = os.path.normpath(os.path.join(HERE, "..", "xw", "xjump-build"))
if os.path.isdir(XJ):
    edit("build_xjump.py", [
     (u"χJump loads it too",
      u'''<script src="core/mesh3d.js"></script>
<script>UJ.mesh3dCore = UJ.mesh3d;</script>''',
      u'''<script src="core/mesh3d.js"></script>
<script>UJ.mesh3dCore = UJ.mesh3d;</script>
<!-- core/mesh3dshot.js, 2026-10-03: the picture and the turn. It asks for UJ.mesh3dCore first,
     which on this page is the renderer and on the other seven is the same object. -->
<script src="core/mesh3dshot.js"></script>'''),
    ], root=XJ)
else:
    print("xjump-build/ not here -- skipped")


# ── ωJump: inlined with the rest ──────────────────────────────────────────────────────────────
WJ = os.path.normpath(os.path.join(HERE, "..", "wjump-build"))
if not os.path.isdir(WJ):
    WJ = os.path.normpath(os.path.join(HERE, "..", "xw", "wjump-build"))
if os.path.isdir(WJ):
    edit("build_wjump.py", [
     (u"ωJump inlines it beside the renderer",
      u"'mesh3d.js', 'nucmesh.js'",
      u"'mesh3d.js', 'mesh3dshot.js', 'nucmesh.js'"),
    ], root=WJ)
else:
    print("wjump-build/ not here -- skipped")
print("\nNow: python3 src/build_stamps.py")
