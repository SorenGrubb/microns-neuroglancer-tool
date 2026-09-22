# -*- coding: utf-8 -*-
u"""The pad gets the "drop redundant points" button too, which is where he was looking.  2026-09-22

Søren, with a screenshot of the PAD -- "Volume 3615 µm³ ... 176 contour(s) kept" and the Use these
contours row underneath: "I don't see anywhere I can reduce the number of points".

Because the button went in the wrong place. It was put in the found panel, which only appears after
a link is READ. The 176-contour cell he is actually holding is on the PAD, and the pad had nothing.

So it goes under the pad's volume line as well -- the same line, in both places, that already says
how big the thing in hand is. Same UJ.tracing.simplifyRings at half a voxel, same rule about when
it is offered (a tenth of the points or more) and when it hides, same sentence afterwards with the
volume recomputed. padVolume() runs after every close, every delete and every section change, so
the offer follows the contours without a second hook.

IT CHANGES THE PAD'S CONTOURS IN PLACE, which is what he is about to press "Use these contours" on.
Nothing is shared until he does, and the pad's own undo is not a way back -- so the sentence says
so, and the volume before and after is in it.

Check: padthincheck.js.
Run: python3 src/the_pad_can_drop_redundant_points_too.py, then python3 src/build_stamps.py
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
 (u"the pad's button, under its volume line",
  u'''    "<p class=\\"hint\\" id=\\"tracePadVol\\" style=\\"margin-top:4px\\" title=\\"Cavalieri''',
  u'''    "<!-- DROP REDUNDANT POINTS, ON THE PAD.  2026-09-22. Søren, with a screenshot of the pad:",
    "     \\"I don't see anywhere I can reduce the number of points\\" -- the button had gone in the",
    "     found panel, which only appears after a link is read, and the cell he was holding was here.",
    "     See src/the_pad_can_drop_redundant_points_too.py. -->",
    "<button class=\\"idbtn\\" id=\\"padThin\\" style=\\"display:none;margin-top:4px\\" title=\\"A contour drawn with a pen is sampled by the pointer, not by the shape: a straight stretch of membrane arrives as twenty points that two would draw identically. This drops those, moving no point of the outline by more than half a voxel. It changes the contours on the pad — nothing is shared until you press “Use these contours”.\\">Drop redundant points</button>",
    "<p class=\\"hint\\" id=\\"tracePadVol\\" style=\\"margin-top:4px\\" title=\\"Cavalieri'''),
 (u"what it does",
  u'''function padVolume(){''',
  u'''/* ── DROP REDUNDANT POINTS, ON THE PAD ───────────────────────────────────────  2026-09-22
   Søren: "I don't see anywhere I can reduce the number of points" -- he was on the pad, and the
   button was in the found panel. The same offer, on the contours he is actually holding. See
   src/the_pad_can_drop_redundant_points_too.py. */
function padThinGain(){
  if (!PAD || !PAD.rings || !PAD.rings.length) return null;
  if (!(window.UJ && UJ.tracing && UJ.tracing.simplifyRings)) return null;
  const r = UJ.tracing.simplifyRings(PAD.rings.map(function(x){
    return { z: x.z, points: x.points };
  }));
  if (!r.before || r.before - r.after <= r.before / 10) return null;
  return r;
}
function padThinShow(){
  const btn = document.getElementById("padThin");
  if (!btn) return;
  if (!btn.dataset.wired){ btn.dataset.wired = "1"; btn.addEventListener("click", padThinRun); }
  const g = padThinGain();
  btn.style.display = g ? "" : "none";
  if (g) btn.textContent = "Drop redundant points (" + g.before.toLocaleString() + " \\u2192 "
                         + g.after.toLocaleString() + ")";
}
function padThinRun(){
  const g = padThinGain();
  if (!g){ padSay("There is nothing redundant left to drop."); return; }
  const volBefore = tracingVolumeOf(UJ.tracepad.toRings(PAD));
  /* In place, keeping z and the instance: it is the same contour with fewer vertices on it. */
  PAD.rings.forEach(function(r, i){
    const s = g.rings[i];
    if (s && s.points) r.points = s.points;
  });
  const volAfter = tracingVolumeOf(UJ.tracepad.toRings(PAD));
  padPaint();
  padRings();
  const volSay = (volBefore && volAfter && volBefore.ok)
    ? " The volume is " + tracingVolumeSay(volAfter) + " \\u2014 it was "
      + tracingVolumeSay(volBefore) + "."
    : "";
  padSay("Dropped " + (g.before - g.after).toLocaleString() + " redundant point"
    + (g.before - g.after === 1 ? "" : "s") + ": " + g.before.toLocaleString() + " \\u2192 "
    + g.after.toLocaleString() + ". No point of the outline moved more than " + g.tol
    + " voxel" + (g.tol === 1 ? "" : "s") + "." + volSay
    + " Nothing is shared until you press \\u201cUse these contours\\u201d.");
}
function padVolume(){'''),
 (u"...offered whenever the contours change",
  u'''  const v = tracingVolumeOf(all);
  el.textContent = v ? tracingVolumeSay(v) : "";
  return v;
}''',
  u'''  const v = tracingVolumeOf(all);
  el.textContent = v ? tracingVolumeSay(v) : "";
  /* padVolume runs after every close, every delete and every section change, which is every way
     the contours can change -- so the offer follows them without a hook of its own. */
  try { padThinShow(); } catch (_e){}
  return v;
}'''),
])

# The several-instances branch returns early, so the offer is made there too.
edit("core/tracingcard.js", [
 (u"...including when there are several instances",
  u'''        + escHtml(v ? tracingVolumeSay(v) : "nothing yet");
    }).join("<br>");
    return null;
  }
  const v = tracingVolumeOf(all);''',
  u'''        + escHtml(v ? tracingVolumeSay(v) : "nothing yet");
    }).join("<br>");
    try { padThinShow(); } catch (_e){}
    return null;
  }
  const v = tracingVolumeOf(all);'''),
])
