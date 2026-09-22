# -*- coding: utf-8 -*-
u"""A button drops the redundant points from the contours in hand.                       2026-09-22

Søren: "OK, if I paste the neuroglancer state in the tracing, will it reduce the number of points
and make it a polyline?"

It did not, and that was the honest answer. Reading a state stores every vertex; the simplification
and the polyline shape both happened on the way OUT. So however small the link got, the sheet kept
the whole cell's full point count -- and a tracing pasted back in was as heavy as it ever was.

Asked whether it should apply to what is SAVED, he chose a BUTTON over doing it on paste. That is
the right way round: the contours in the sheet are the record, and a record is not quietly rewritten
on the way in. So nothing happens until he presses it, it says before -> after in his own numbers
before anything is saved, and reading the link again brings every point back.

WHERE IT SITS: under the volume line in the found panel, which is where the size of the thing in
hand is already being reported. It appears only when there is something to gain -- a tenth of the
points or more -- and hides itself once there is not, so it is never a button that does nothing.

WHAT IT KEEPS: the contour count, the section each one is on, and the INSTANCE each belongs to --
three mitochondria stay three. It runs UJ.tracing.simplifyRings at half a voxel, the same
simplification the viewer link uses (src/fewer_points_and_the_real_cap.py), so what is saved and
what is drawn agree. JUMP_SIMPLIFY_TOL in the console changes the tolerance for both.

AND IT SAYS WHAT IT COST. The volume is recomputed and shown straight after, because the volume is
the number a tracing exists to produce and "I pressed a button and my cell got smaller" is the one
outcome this must not have in silence. Measured in dropredundantcheck.js: 7,200 points to under
half, volume within a fraction of a percent.

Check: dropredundantcheck.js (written first; it failed with the button absent).
Run: python3 src/a_button_drops_the_redundant_points.py, then python3 src/build_stamps.py
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


# ── 1. the button, under the volume line ──────────────────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"the button's markup",
  u'''    "<p class=\\"hint\\" id=\\"tracingVolSay\\" style=\\"margin-top:4px\\"></p>",''',
  u'''    "<p class=\\"hint\\" id=\\"tracingVolSay\\" style=\\"margin-top:4px\\"></p>",
    "<!-- DROP REDUNDANT POINTS.  2026-09-22. Søren, having asked whether pasting a state would",
    "     reduce the points: it did not, because the simplification was on the way OUT only. He chose",
    "     a button over doing it on the way in -- the contours in the sheet are the record. Shown only",
    "     when there is a tenth or more to gain. See src/a_button_drops_the_redundant_points.py. -->",
    "<button class=\\"idbtn\\" id=\\"tracingThin\\" style=\\"display:none;margin-top:4px\\" title=\\"A contour drawn with a pen is sampled by the pointer, not by the shape: a straight stretch of membrane arrives as twenty points that two would draw identically. This drops those, moving no point of the outline by more than half a voxel. Your saved tracing changes only if you add it afterwards — read the link again to get every point back.\\">Drop redundant points</button>",'''),
])

# ── 2. what it does ───────────────────────────────────────────────────────────────────────────
edit("core/tracingcard.js", [
 (u"tracingThinWire",
  u'''function tracingVolShow(){''',
  u'''/* ── DROP REDUNDANT POINTS ───────────────────────────────────────────────────  2026-09-22
   Søren: "OK, if I paste the neuroglancer state in the tracing, will it reduce the number of points
   and make it a polyline?" -- it did not; the simplification was on the way OUT only. He chose a
   button over doing it on paste, so this is the button. See
   src/a_button_drops_the_redundant_points.py.

   It is offered only when a tenth or more of the points would go, and it hides once they have. The
   volume is recomputed and said: "I pressed a button and my cell got smaller" is the one outcome
   this must not have in silence. */
function tracingThinGain(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return null;
  if (!(window.UJ && UJ.tracing && UJ.tracing.simplifyRings)) return null;
  const r = UJ.tracing.simplifyRings(rings.map(function(x){ return { z: x.z, points: x.points }; }));
  if (!r.before || r.before - r.after <= r.before / 10) return null;
  return r;
}
function tracingThinShow(){
  const btn = document.getElementById("tracingThin");
  if (!btn) return;
  const g = tracingThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \\u2192 "
                         + g.after.toLocaleString() + ")";
}
function tracingThinRun(){
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings || !rings.length) return;
  const g = tracingThinGain();
  if (!g){ tracingSay("There is nothing redundant left to drop."); return; }
  const volBefore = tracingVolumeOf(rings);
  /* The INSTANCE goes with the contour: three mitochondria must stay three. */
  const out = [];
  rings.forEach(function(r, i){
    const s = g.rings[i];
    out.push({ z: r.z, points: (s && s.points) || r.points, inst: r.inst || 0 });
  });
  TRACING_PENDING.rings = out;
  /* The ticked layers hold their own copies, or a re-tick would put the old points back. */
  const gs = tracingGroups();
  if (gs){
    gs.forEach(function(grp){
      grp.rings = (grp.rings || []).map(function(r){
        const s = UJ.tracing.simplifyRings([{ z: r.z, points: r.points }]);
        return { z: r.z, points: s.rings[0].points, inst: r.inst };
      });
    });
  }
  const volAfter = tracingVolumeOf(TRACING_PENDING.rings);
  tracingLayersRender();
  tracingVolShow();
  tracingThinShow();
  pad3DSoon();
  const volSay = (volBefore && volAfter && volBefore.ok)
    ? " The volume is " + tracingVolumeSay(volAfter) + " \\u2014 it was "
      + tracingVolumeSay(volBefore) + "."
    : "";
  tracingSay("Dropped " + (g.before - g.after).toLocaleString() + " redundant point"
    + (g.before - g.after === 1 ? "" : "s") + ": " + g.before.toLocaleString() + " \\u2192 "
    + g.after.toLocaleString() + ". No point of the outline moved more than " + g.tol
    + " voxel" + (g.tol === 1 ? "" : "s") + "." + volSay
    + " Nothing is saved until you add it \\u2014 read the link again to get every point back.");
}
function tracingVolShow(){'''),
 (u"...and it is shown wherever the volume is",
  u'''  const v = tracingVolumeOf(rings);
  el.textContent = v ? tracingVolumeSay(v) : "";
  return v;
}''',
  u'''  const v = tracingVolumeOf(rings);
  el.textContent = v ? tracingVolumeSay(v) : "";
  return v;
}
/* The button lives and dies with the volume line, which is the other thing said about the size of
   what is in hand. Wired once, on the first render that finds it. */
function tracingThinWire(){
  const btn = document.getElementById("tracingThin");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";
  btn.addEventListener("click", tracingThinRun);
}'''),
])

# ── 3. wired and refreshed wherever the contours change ───────────────────────────────────────
edit("core/tracingcard.js", [
 (u"the selection refreshes it",
  u'''  tracingEachRender(true);
  tracingVolShow();
  pad3DSoon();
}''',
  u'''  tracingEachRender(true);
  tracingVolShow();
  tracingThinWire(); tracingThinShow();
  pad3DSoon();
}'''),
 (u"...and so does reading a link",
  u'''  document.getElementById("tracingFound").style.display="";''',
  u'''  document.getElementById("tracingFound").style.display="";
  tracingThinWire(); tracingThinShow();'''),
])
