# -*- coding: utf-8 -*-
u"""The pad's "show the segmentation" tick follows the volume on a many-volume tool.        2026-09-21

Found in the live test on grubblab.com: ωJump's tracing card is built on whichever volume opens
first. padTrimForHost removes the segmentation tick when that volume has no segmentation -- right
for λJump, whose one volume never will -- and on ωJump it then never came back, so the WEBKNOSSOS
volumes, whose segment reads live in 0.4 s, offered no way to see it under the contours.

On a host with scope() (a tool whose volume changes under the card), the tick is HIDDEN rather
than removed, and datasetChanged() shows it again when the new volume has a segmentation, and
hides and unticks it when it has none. Single-volume hosts are unchanged: removed, as the
2026-09-20 rule says.

Run: python3 src/the_seg_tick_follows_the_volume.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)


edit("core/tracingcard.js", [
 (u"hidden, not removed, where the volume can change",
  u'''  var seg = "";
  try { seg = tracingSources().seg || ""; } catch (_e){ seg = ""; }
  if (!seg) drop("tracePadSeg", "tracePadSegSay");   // its own status line goes with it''',
  u'''  var seg = "";
  try { seg = tracingSources().seg || ""; } catch (_e){ seg = ""; }
  /* A TOOL WHOSE VOLUME CHANGES (scope(), ωJump) keeps the tick and hides it: the next volume may
     have a segmentation, and datasetChanged() shows it again. 2026-09-21, found live. */
  if (!seg && tracingCfg().scope) padSegTickSync();
  else if (!seg) drop("tracePadSeg", "tracePadSegSay");   // its own status line goes with it'''),
 (u"the tick is shown or hidden for the volume open now",
  u'''function padTrimForHost(el){''',
  u'''/* Show the segmentation tick when the volume open now has a segmentation; hide AND untick it
   when it has not, so a hidden tick can never keep asking for a volume that is not there. */
function padSegTickSync(){
  var box = document.getElementById("tracePadSeg");
  if (!box) return;
  var seg = "";
  try { seg = tracingSources().seg || ""; } catch (_e){ seg = ""; }
  var lab = (box.closest && box.closest("label")) || box;
  var say = document.getElementById("tracePadSegSay");
  lab.style.display = seg ? "" : "none";
  if (say) say.style.display = seg ? "" : "none";
  if (!seg) box.checked = false;
}
function padTrimForHost(el){'''),
 (u"...and again when the volume changes",
  u'''  try { padRelabelMips(); } catch (_e){}
  return true;
};
UJ.tracingcard.wire = function(){''',
  u'''  try { padRelabelMips(); } catch (_e){}
  try { padSegTickSync(); } catch (_e){}
  return true;
};
UJ.tracingcard.wire = function(){'''),
])
