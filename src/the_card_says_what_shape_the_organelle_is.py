# -*- coding: utf-8 -*-
u"""The card says what shape the organelle is, and how far from the nucleus.             2026-09-30

Gary asked for the distance to be *"calculated and displayed for each organelle"*. The sheet is the
calculating half (src/the_organelle_sheet_says_what_shape_and_how_far.py); this is the displaying
half, on the pad, where an organelle is being drawn and where its volume already appears.

NO CALL SITE CHANGES. The volume sentence is rendered from four places -- two in padVolume, two in
tracingVolShow -- and two of those four lines are textually identical, so anchoring on them is a
coin toss. Instead the shape rides along on the object those four already share:
tracingVolumeOf() attaches `shape` to what it returns, and tracingVolumeSay() reads it. One edit to
each function, and every place that shows a volume shows the shape, including the one-line-each
rendering when a pad holds several organelles -- which is exactly where "for each organelle" bites.

THE DISTANCE NEEDS A NUCLEUS, AND core/ DOES NOT HAVE ONE. µJump has 144,118 nucleus centroids;
ωJump and χJump have a volume with no nucleus table at all. So the lookup is a hook -- the page
defines window.tracingNucCentroid(nucleusId) if it can answer, and the sentence simply omits the
distance if nothing does. The same preference as the sheet applies where it can: a traced nucleus
outline beats a detection centroid, and the sentence names which one it used, because they are two
different measurements.

WHY BOTH NUMBERS AND NOT ONE. The widest section is what an electron microscopist would measure and
the median is what survives one bad section at the top of a stack; a swollen organelle and a
carelessly clicked one can look alike in either alone.

Check: organellesheetcheck.js (the display section).
Run: python3 src/the_card_says_what_shape_the_organelle_is.py, then python3 src/build_stamps.py,
then, from inside wjump-build/, python3 build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


SAY = u'''/* Two decimals is the whole useful range of a shape descriptor: they all live in (0, 1] except the
   aspect ratio, and a third digit on a hand-clicked outline is noise being reported as measurement. */
function shapeFmt(v){ return (typeof v === "number" && isFinite(v)) ? v.toFixed(2) : "?"; }
/* How far this organelle's centre is from the cell's nucleus, and which nucleus that was. Returns
   "" when the page cannot answer -- ωJump has no nucleus table, and a cell whose id nobody typed
   has no nucleus to be far from. The hook is window.tracingNucCentroid(nucleusId), which µJump
   defines; see src/the_card_says_what_shape_the_organelle_is.py. */
function tracingNucDistSay(shape){
  try {
    if (!shape || !shape.ok || !shape.centroid) return "";
    if (typeof window.tracingNucCentroid !== "function") return "";
    var el = document.getElementById("tracingNucId");
    var nid = el ? (el.value || "").trim() : "";
    if (!nid) return "";
    var nc = window.tracingNucCentroid(nid);
    if (!nc || !isFinite(nc.xVox)) return "";
    var res = (UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    var dx = (shape.centroid.xVox - nc.xVox) * res[0],
        dy = (shape.centroid.yVox - nc.yVox) * res[1],
        dz = (shape.centroid.zVox - nc.zVox) * res[2];
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;
    return " Its centre is " + d.toFixed(2) + " \\u00b5m from the "
      + (nc.from || "nucleus") + ".";
  } catch (e){ return ""; }
}
function tracingShapeSay(shape){
  if (!shape || !shape.ok || !shape.atMaxArea) return "";
  var t = shape.atMaxArea, m = shape.median || {};
  var s = " Widest section: circularity " + shapeFmt(t.circularity)
        + ", aspect ratio " + shapeFmt(t.aspectRatio)
        + ", roundness " + shapeFmt(t.roundness)
        + ", solidity " + shapeFmt(t.solidity) + ".";
  if (shape.sections > 1)
    s += " Median over " + shape.sections + " sections: " + shapeFmt(m.circularity) + " / "
       + shapeFmt(m.aspectRatio) + " / " + shapeFmt(m.roundness) + " / " + shapeFmt(m.solidity) + ".";
  return s + tracingNucDistSay(shape);
}
'''

edit("core/tracingcard.js", [

 (u"the shape rides along with the volume",
  u'''function tracingVolumeOf(rings){
  try {
    if (!window.UJ || !UJ.traceloft || !UJ.traceloft.volume) return null;
    return UJ.traceloft.volume(rings || [], (UJ.cfg && UJ.cfg.res) || [4, 4, 40]);
  } catch (e){ return null; }
}''',
  u'''function tracingVolumeOf(rings){
  try {
    if (!window.UJ || !UJ.traceloft || !UJ.traceloft.volume) return null;
    var res = (UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    var v = UJ.traceloft.volume(rings || [], res);
    /* ── AND WHAT SHAPE IT IS ──────────────────────────────────────────────  2026-09-30
       Gary: "could you potentially add a circularity metric to the organelles that are being
       segmented... I also want to have the distance from the organelle centroid to the nucleus
       centroid calculated and displayed for each organelle."

       Attached here rather than fetched at each of the four places that render a volume -- two in
       padVolume, two in tracingVolShow, and two of those four lines are identical, which makes
       them a poor thing to anchor an edit on. Riding along means every place that shows a volume
       shows the shape, including the one-line-each rendering when a pad holds several organelles,
       which is where "for each organelle" actually bites. */
    if (v && UJ.traceloft.shape){
      try { v.shape = UJ.traceloft.shape(rings || [], res); } catch (_e){}
    }
    return v;
  } catch (e){ return null; }
}'''),

 (u"...and the sentence says it",
  u'''function tracingVolumeSay(v){
  if (!v) return "";
  if (!v.ok){
    return v.areaUm2 !== undefined
      ? "Outlined area " + volFmt(v.areaUm2) + " µm² on one section — " + v.reason + "."
      : "";
  }
  return "Volume " + volFmt(v.volumeUm3) + " µm³ (Cavalieri, " + v.sections
    + " section" + (v.sections === 1 ? "" : "s") + " every " + Math.round(v.gapNm) + " nm"
    + (v.evenlySpaced ? "" : ", unevenly spaced") + "). "
    + volFmt(v.volumeTrapezoidUm3) + " µm³ between the outermost contours, which is the "
    + "lower bound — the difference is what lies past them.";
}''',
  SAY + u'''function tracingVolumeSay(v){
  if (!v) return "";
  if (!v.ok){
    /* One section has no volume, but it still has a shape and a place -- which is the whole of
       what Gary asked for, so it is said here too rather than only once there are two. */
    return v.areaUm2 !== undefined
      ? "Outlined area " + volFmt(v.areaUm2) + " µm² on one section — " + v.reason + "."
        + tracingShapeSay(v.shape)
      : "";
  }
  return "Volume " + volFmt(v.volumeUm3) + " µm³ (Cavalieri, " + v.sections
    + " section" + (v.sections === 1 ? "" : "s") + " every " + Math.round(v.gapNm) + " nm"
    + (v.evenlySpaced ? "" : ", unevenly spaced") + "). "
    + volFmt(v.volumeTrapezoidUm3) + " µm³ between the outermost contours, which is the "
    + "lower bound — the difference is what lies past them."
    + tracingShapeSay(v.shape);
}'''),
])

edit("ujump.html", [
 (u"µJump can answer where a nucleus is",
  u"  async function addTracedOrganelleSheet(wb,matches,say){",
  u'''/* THE HOOK core/tracingcard.js ASKS ON (2026-09-30). It has no nucleus table of its own -- ωJump
     and χJump open volumes that have none -- so the distance shown beside an organelle's volume on
     the pad comes from whichever page can answer. This one can: nucleus id -> master-array index ->
     the MICrONS detection centroid. A page that cannot simply leaves the hook undefined and the
     sentence omits the distance rather than inventing one. */
  window.tracingNucCentroid=function(nid){
    try{
      const i=nidToIndex(nid);
      if(i<0)return null;
      return {xVox:NX[i],yVox:NY[i],zVox:NZ[i],from:"MICrONS nucleus-detection centroid"};
    }catch(_e){ return null; }
  };
  async function addTracedOrganelleSheet(wb,matches,say){'''),
])
print("\nNow: node organellesheetcheck.js, then python3 src/build_stamps.py,"
      "\nthen, from inside wjump-build/, python3 build_wjump.py")
