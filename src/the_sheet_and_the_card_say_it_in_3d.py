# -*- coding: utf-8 -*-
u"""The sheet and the card say it in three dimensions too.                               2026-09-30

The geometry is in src/the_same_questions_in_three_dimensions.py; this puts it where it can be
read. Seven columns on the "Traced organelles" sheet and one more line in the sentence beside the
volume on the pad.

BOTH SPHERICITY CONVENTIONS, EACH WITH ITS FORMULA IN THE COLUMN HEADER. Gary's Claude: "You'll
want µJump to state which convention it uses, or the numbers won't line up with FIJI." A footnote
somewhere would not survive the spreadsheet being copied into another spreadsheet, so the formula
travels in the header itself: "Sphericity (MorphoLibJ, 36πV²/S³)" beside "Sphericity (Wadell)".

THE MESH VOLUME AND SURFACE ARE REPORTED BESIDE THE RATIOS THEY CAME FROM, and the Cavalieri
volume stays in its own column. Sphericity is a ratio in which the surface is cubed, so anyone
checking a surprising value needs to see the two numbers that made it, and any disagreement
between the mesh volume and the Cavalieri one is then visible rather than buried.

AND FOR NUCLEI AND SOMA -- "now I think about it these metrics will also be good for nuclei and
soma!" Nothing was needed: the sheet has always written a row per OUTLINED STRUCTURE whatever its
kind. The check now asserts it for the nucleus and the whole-cell outline rather than leaving it
to be noticed.

Check: organellesheetcheck.js.
Run: python3 src/the_sheet_and_the_card_say_it_in_3d.py, then python3 src/build_stamps.py,
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


edit("core/tracedoutlines.js", [

 (u"seven columns for the solid",
  u'''  "Centroid X (voxel)", "Centroid Y (voxel)", "Centroid Z (voxel)",''',
  u'''  /* THE SOLID, NOT THE SECTION (2026-09-30). Circularity becomes sphericity, and two conventions
     are in use: Wadell's π^(1/3)(6V)^(2/3)/S and MorphoLibJ's 36πV²/S³, which is Wadell cubed. Both
     travel, each with its formula IN THE HEADER -- a note elsewhere would not survive this sheet
     being pasted into another one. Aspect ratio splits into elongation and flatness, which is the
     gain over 2D: a cigar and a pancake are the same in one section. Roundness has no 3D column
     because in 2D it was already 1/aspect ratio. The volume and surface the ratios were computed
     from are reported beside them, so a surprising sphericity can be checked. */
  "Sphericity (Wadell)", "Sphericity (MorphoLibJ, 36\\u03c0V\\u00b2/S\\u00b3)",
  "Elongation (3D)", "Flatness (3D)", "Solidity (3D)",
  "Mesh volume (\\u00b5m\\u00b3)", "Mesh surface area (\\u00b5m\\u00b2)",
  "Centroid X (voxel)", "Centroid Y (voxel)", "Centroid Z (voxel)",'''),

 (u"...measured once per outline",
  u'''  var shp = list.map(function(t){
    try { return UJ.traceloft.shape(t.rings, res); } catch (e){ return null; }
  });''',
  u'''  var shp = list.map(function(t){
    try { return UJ.traceloft.shape(t.rings, res); } catch (e){ return null; }
  });
  /* The solid's own descriptors, from the lofted mesh. Wrapped because a tracing whose contours
     cannot be lofted must cost the row its 3D columns, not the whole sheet. */
  var sh3 = list.map(function(t){
    try { return UJ.traceloft.shape3d ? UJ.traceloft.shape3d(t.rings, res) : null; }
    catch (e){ return null; }
  });'''),

 (u"...and written into the row",
  u'''      "Centroid X (voxel)": s.centroid ? Math.round(s.centroid.xVox) : "",''',
  u'''      "Sphericity (Wadell)": r3(d3 ? d3.sphericityWadell : null),
      "Sphericity (MorphoLibJ, 36\\u03c0V\\u00b2/S\\u00b3)": r3(d3 ? d3.sphericityMorphoLibJ : null),
      "Elongation (3D)": r3(d3 ? d3.elongation : null),
      "Flatness (3D)": r3(d3 ? d3.flatness : null),
      "Solidity (3D)": r3(d3 ? d3.solidity3d : null),
      "Mesh volume (\\u00b5m\\u00b3)": r3(d3 ? d3.volumeUm3 : null),
      "Mesh surface area (\\u00b5m\\u00b2)": r3(d3 ? d3.surfaceUm2 : null),
      "Centroid X (voxel)": s.centroid ? Math.round(s.centroid.xVox) : "",'''),

 (u"...with the row knowing where to find it",
  u'''    var top = s.atMaxArea, med = s.median;
    out.push({''',
  u'''    var d3 = (sh3[ti] && sh3[ti].ok) ? sh3[ti] : null;
    var top = s.atMaxArea, med = s.median;
    out.push({'''),
])

edit("core/tracingcard.js", [

 (u"the volume carries the solid's shape too",
  u'''    if (v && UJ.traceloft.shape){
      try { v.shape = UJ.traceloft.shape(rings || [], res); } catch (_e){}
    }''',
  u'''    if (v && UJ.traceloft.shape){
      try { v.shape = UJ.traceloft.shape(rings || [], res); } catch (_e){}
    }
    /* And in three dimensions (2026-09-30): sphericity, elongation and flatness come from the
       lofted mesh, which the pad is building for its preview anyway. */
    if (v && UJ.traceloft.shape3d){
      try { v.shape3d = UJ.traceloft.shape3d(rings || [], res); } catch (_e){}
    }'''),

 (u"...and the sentence says it, naming the convention",
  u'''  if (shape.sections > 1)
    s += " Median over " + shape.sections + " sections: " + shapeFmt(m.circularity) + " / "
       + shapeFmt(m.aspectRatio) + " / " + shapeFmt(m.roundness) + " / " + shapeFmt(m.solidity) + ".";
  return s + tracingNucDistSay(shape);
}''',
  u'''  if (shape.sections > 1)
    s += " Median over " + shape.sections + " sections: " + shapeFmt(m.circularity) + " / "
       + shapeFmt(m.aspectRatio) + " / " + shapeFmt(m.roundness) + " / " + shapeFmt(m.solidity) + ".";
  return s + tracingNucDistSay(shape);
}
/* THE SOLID, AND WHICH CONVENTION (2026-09-30). Sphericity has two definitions in common use and
   MorphoLibJ's is Wadell's cubed, so a sentence that just says "sphericity 0.73" is a number
   nobody can line up with FIJI. Both are named. Elongation and flatness replace the 2D aspect
   ratio, which is the whole gain of measuring the solid: a cigar and a pancake look alike in one
   section and score opposite ways round here. */
function tracingShape3dSay(d3){
  if (!d3 || !d3.ok) return "";
  return " In 3D: sphericity " + shapeFmt(d3.sphericityWadell) + " (Wadell) / "
       + shapeFmt(d3.sphericityMorphoLibJ) + " (MorphoLibJ), elongation "
       + shapeFmt(d3.elongation) + ", flatness " + shapeFmt(d3.flatness)
       + (d3.solidity3d !== null && d3.solidity3d !== undefined
            ? ", solidity " + shapeFmt(d3.solidity3d) : "") + ".";
}'''),

 (u"...appended where the volume is said",
  u'''    + volFmt(v.volumeTrapezoidUm3) + " µm³ between the outermost contours, which is the "
    + "lower bound — the difference is what lies past them."
    + tracingShapeSay(v.shape);''',
  u'''    + volFmt(v.volumeTrapezoidUm3) + " µm³ between the outermost contours, which is the "
    + "lower bound — the difference is what lies past them."
    + tracingShapeSay(v.shape) + tracingShape3dSay(v.shape3d);'''),
])
print("\nNow: node organellesheetcheck.js, then python3 src/build_stamps.py,"
      "\nthen, from inside wjump-build/, python3 build_wjump.py")
