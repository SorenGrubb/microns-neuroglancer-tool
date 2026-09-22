# -*- coding: utf-8 -*-
u"""The 3D preview and the OBJ export can round the surface between sections.            2026-09-22

Søren: "Can we also interpolate between polylines in z?" -- for a smoother 3D view and Blender
export, the made contours marked as interpolated, doing its best where the shape does not pair up.

THE PART THAT WOULD HAVE BEEN A WASTE. loft() bands STRAIGHT between consecutive sections, so a
contour interpolated LINEARLY between two of them lies exactly on the band it was meant to improve:
more triangles, identical surface. UJ.traceloft.interpolate curves in z instead -- Catmull-Rom
through the corresponding vertex on four consecutive contours -- and that is what makes the
difference visible. See src/contours_interpolate_in_z.py.

A CHECKBOX, off by default, beside the see-through one. On, both the 3D preview and the OBJ export
loft an interpolated set: the missing sections filled, plus two rings between every adjacent pair
at fractional z. Off, nothing changes at all -- the same rings loft as before.

WHAT IT IS NOT. It is not a measurement. The volume stays computed from the DRAWN contours and
does not move when this is ticked (Cavalieri already accounts for skipped sections by multiplying
area by the spacing, so interpolating can only add bias). It is not saved either: these rings live
for the length of one loft. A contour made for a MISSING SECTION is a different thing -- integer z,
a section to belong to -- and that is what carries interp:true into a tracing.

AND WHERE IT IS WORST: at the two ends of a chain, where the tangent has to be clamped and the
shape stops dead. interpcheck.js compares in the body of a sphere and says so rather than choosing
a kind comparison -- cubic lands 0.2 voxels from the truth there where a straight line is 3.9 off,
and no made contour bulges past the two it sits between.

Checks: interpcheck.js, smoothzcheck.js.
Run: python3 src/the_mesh_can_be_smoothed_in_z.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracingcard.js", [
 (u"the checkbox",
  u'''<input type=\\"checkbox\\" id=\\"tracePadGhosts\\" checked> with the cell and nucleus, see-through</label>",''',
  u'''<input type=\\"checkbox\\" id=\\"tracePadGhosts\\" checked> with the cell and nucleus, see-through</label>",
    "<!-- SMOOTH IN Z.  2026-09-22. Søren: \\"Can we also interpolate between polylines in z?\\" Off by",
    "     default: on, the preview and the OBJ loft an interpolated set that CURVES between sections",
    "     rather than cutting straight across. It changes no volume and saves nothing.",
    "     See src/the_mesh_can_be_smoothed_in_z.py. -->",
    "<label style=\\"font-size:12px;display:flex;align-items:center;gap:6px;flex:0 0 auto\\" title=\\"Rounds the surface between sections instead of cutting straight across, by interpolating contours in z — a Catmull-Rom through four consecutive outlines, so a cell that is round stays round between the sections you drew. It affects the 3D view and the OBJ only: no volume changes, and nothing is saved.\\"><input type=\\"checkbox\\" id=\\"tracePadSmoothZ\\"> smooth between sections</label>",'''),
 (u"one place decides what gets lofted",
  u'''/* The pad's own loft, in nanometres, as OBJ. */''',
  u'''/* ── WHAT GETS LOFTED ────────────────────────────────────────────────────────  2026-09-22
   The rings as drawn, or -- with "smooth between sections" ticked -- an interpolated set that
   curves in z. loft() bands straight between consecutive sections, so this is the only way the
   surface between them becomes anything but flat. Nothing here is saved or measured.
   See src/the_mesh_can_be_smoothed_in_z.py. */
function tracingSmoothZ(){
  try { const el = document.getElementById("tracePadSmoothZ"); return !!(el && el.checked); }
  catch (_e){ return false; }
}
function tracingLoftRings(rings){
  if (!tracingSmoothZ()) return rings;
  try {
    if (UJ.traceloft && UJ.traceloft.interpolate)
      return UJ.traceloft.interpolate(rings, { per: 2 }).rings;
  } catch (_e){}
  return rings;
}
/* The pad's own loft, in nanometres, as OBJ. */'''),
 (u"...the preview uses it",
  u'''      try { lg = UJ.traceloft.loft(byInst[k], res); } catch (_e){ lg = null; }''',
  u'''      try { lg = UJ.traceloft.loft(tracingLoftRings(byInst[k]), res); } catch (_e){ lg = null; }'''),
 (u"...and so does the OBJ",
  u'''  const g = UJ.traceloft.loft(rings, res);''',
  u'''  const g = UJ.traceloft.loft(tracingLoftRings(rings), res);'''),
 (u"...and ticking it redraws",
  u'''function padThinGain(){''',
  u'''/* Ticking it is a different picture, so the preview is rebuilt. Wired where the button is. */
function padSmoothWire(){
  const el = document.getElementById("tracePadSmoothZ");
  if (!el || el.dataset.wired) return;
  el.dataset.wired = "1";
  el.addEventListener("change", function(){ try { pad3DSoon(); } catch (_e){} });
}
function padThinGain(){'''),
 (u"...wired beside the other one",
  u'''  if (!btn.dataset.wired){ btn.dataset.wired = "1"; btn.addEventListener("click", padThinRun); }''',
  u'''  if (!btn.dataset.wired){ btn.dataset.wired = "1"; btn.addEventListener("click", padThinRun); }
  try { padSmoothWire(); } catch (_e){}'''),
])
