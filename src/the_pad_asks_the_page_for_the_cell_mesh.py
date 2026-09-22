# -*- coding: utf-8 -*-
u"""The pad's see-through cell comes from the page when the page has its own mesh reader.   2026-09-22

Søren: "The xJump 3D view does not show the cell mesh".

pad3DGhostMeshes fetched the cell with core/mesh.js (UJ.mesh.fetchCombinedMesh), which is µJump's
chunked-graph reader. χJump loads core/mesh.js for its exports, so the pad found it and asked it
for a cb2 fragment -- which it cannot read. A page whose cells are not one chunked-graph root now
answers for itself: UJ.cfg.tracing.cellMesh(root, key, say) -> Promise of {positions (µm, where
the cell is in the page's frame), indices, note} or null. Where a page has none, nothing changes.

Also: tracingM3D() was defined twice (the_pad_draws_with_the_core_renderer.py re-applied itself,
because its new text contained its anchor). One copy goes, and that generator's test is fixed.

Check: xjpadcheck.js. Run: python3 src/the_pad_asks_the_page_for_the_cell_mesh.py, then
python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "core/tracingcard.js")
s = io.open(P, encoding="utf-8").read(); b = s

OLD = u'''  if (ids.root && ids.root !== "0" && MESH){
    try {
      const m = await MESH.fetchCombinedMesh(ids.root,'''
NEW = u'''  /* THE PAGE'S OWN READER FIRST (2026-09-22). χJump's cells are assemblies of cb2 fragments
     with their own mesh store; core/mesh.js is loaded there only for its exports and cannot read
     them. See src/the_pad_asks_the_page_for_the_cell_mesh.py. */
  const HOSTMESH = (window.UJ && UJ.cfg && UJ.cfg.tracing && typeof UJ.cfg.tracing.cellMesh === "function")
                 ? UJ.cfg.tracing.cellMesh : null;
  if (HOSTMESH){
    if (ids.root || ids.nuc){
      try {
        const hm = await HOSTMESH(ids.root, ids.nuc, function(msg){
          pad3DNote("fetching the cell\\u2019s mesh\\u2026 " + (msg || ""));
        });
        if (hm && hm.positions && hm.positions.length) out.push({ what: "cell", mesh: hm });
        else if (!hm || !hm.note) notes.push("the cell has no mesh to draw");
        if (hm && hm.note) notes.push(hm.note);
      } catch (e){ notes.push("the cell\\u2019s mesh could not be read: " + String(e && e.message || e)); }
    }
  } else if (ids.root && ids.root !== "0" && MESH){
    try {
      const m = await MESH.fetchCombinedMesh(ids.root,'''
if NEW in s: print("  already there: the page's own reader first")
else:
    assert s.count(OLD) == 1, "reader: %d" % s.count(OLD)
    s = s.replace(OLD, NEW, 1); print("  ok: the page's own reader first")

DUP = u'''/* core/mesh3d.js's renderer: UJ.mesh3dCore where a page keeps its own UJ.mesh3d (χJump), else
   UJ.mesh3d. See src/the_pad_draws_with_the_core_renderer.py. */
function tracingM3D(){
  return (window.UJ && UJ.mesh3dCore && UJ.mesh3dCore.prepare) ? UJ.mesh3dCore : UJ.mesh3d;
}
'''
n = s.count(DUP)
if n > 1:
    i = s.index(DUP); s = s[:i] + s[i + len(DUP):]; print("  ok: tracingM3D once")
else: print("  already there: tracingM3D once")
if s != b: io.open(P, "w", encoding="utf-8").write(s)
