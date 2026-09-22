# -*- coding: utf-8 -*-
u"""Every page with the tracing pad loads the renderer its 3D preview draws with.        2026-09-22

Søren, on ωJump: "Could not build the preview: undefined is not an object (evaluating
'tracingM3D().prepare')". The pad's "Show it in 3D" draws with core/mesh3d.js. µ/δ/π/η/β load it
for their cell panels, and χJump loads it as UJ.mesh3dCore; λJump and ωJump never did, so there
was no renderer at all. λJump gets the script tag here (λJump has no core/mesh.js, so mesh3d.js's
auto-install of "Show in 3D" buttons stays off); ωJump inlines it, see
wjump-build/src/wjump_pad_has_the_3d_renderer.py.

Check: pad3dcheck.js [page]. Run: python3 src/every_pad_has_the_3d_renderer.py, then
python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "ljump.html")
s = io.open(P, encoding="utf-8").read()
OLD = u'<script src="core/traceloft.js"></script>\n'
NEW = OLD + u'<!-- The pad\'s 3D preview draws with this (2026-09-22, src/every_pad_has_the_3d_renderer.py). -->\n<script src="core/mesh3d.js"></script>\n'
if NEW in s: print("  already there: λJump loads core/mesh3d.js")
else:
    assert s.count(OLD) == 1; s = s.replace(OLD, NEW, 1)
    io.open(P, "w", encoding="utf-8").write(s); print("  ok: λJump loads core/mesh3d.js")
