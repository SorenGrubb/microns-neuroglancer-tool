# -*- coding: utf-8 -*-
u"""Every link built here shows the organelle.                                   2026-09-20

Søren, with the counts finally right: *"the jump buttons for the organelles do not include the
segmentation data or the centroid annotation."*

TWO FAULTS, AND THE FIRST ONE IS WHY IT LOOKED LIKE NOTHING HAPPENED AT ALL.

  THE LINK HE CLICKS IS NOT THE LINK THAT GOT THE OUTLINE. Driving the live page: after pressing
  Jump beside Lysosome 1, the address in the out-box carries `annotation:Lysosome 1(712)` -- 712
  closed-loop lines, selected, at 295844,151391,17862. The ↗ beside the cell's name, at the same
  coordinate, carries no such layer. It is built inside showNucleus, which runs BEFORE buildState in
  the "go" handler, so a one-shot overlay consumed by buildState could never reach it. Every arrow,
  copy button and neighbour link on the page is in the same position.

  THE FIX IS TO STOP CONSUMING IT. The overlay now lives in buildState itself, applies to every
  state built for THE COORDINATE IT WAS ARMED AT, and is not used up by the first caller. The
  coordinate is what keeps it honest: the one thing an overlay must never do is draw a lysosome's
  contours on a link centred somewhere else, and a position test says exactly that, where "one
  shot" only approximated it. Navigate anywhere else and it simply does not apply.

  AND THE CENTROID WAS NEVER THERE. The overlay drew the outline OR a point, never both, so the row
  that says `centre (295844, 151391, 17862)` sent you to that coordinate with no mark on it. The
  centre goes in beside the contours now, in the same layer, because it is the same organelle: the
  outline says what shape it is and the point says what the record claims about where it is, and
  seeing the two together is the whole reason for having both.

WHAT IS ALREADY RIGHT, and worth writing down so it is not "fixed" twice: the cell segmentation IS
on those links -- `segments:["864691136741958236"]` with the nucleus beside it -- and so is the
cell's own nucleus layer. Only the organelle was missing.

Run: python3 src/every_link_built_here_shows_the_organelle.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OVERLAY = [
    (u'''function organOverlayInto(st){
  const want = (typeof ORGAN_SHOW_NEXT !== "undefined") ? ORGAN_SHOW_NEXT : null;
  if (typeof ORGAN_SHOW_NEXT !== "undefined") ORGAN_SHOW_NEXT = null;
  if (!want || !st) return false;''',
     u'''function organOverlayInto(st, pos){
  const want = (typeof ORGAN_SHOW_NEXT !== "undefined") ? ORGAN_SHOW_NEXT : null;
  if (!want || !st) return false;
  /* ── THE COORDINATE IT WAS ARMED AT, NOT THE FIRST CALLER ──────────────  2026-09-20
     Søren: *"the jump buttons for the organelles do not include the segmentation data or the
     centroid annotation."* They did -- in the out-box link. The ↗ beside the cell's name is built
     by showNucleus, which runs BEFORE buildState, so an overlay consumed by the first caller could
     never reach the link he actually clicks.

     So it is not consumed. What stops a lysosome's contours being drawn somewhere they do not
     belong is now the thing that actually decides it: the position. Armed at a coordinate, applied
     to every state built for that coordinate, and silently absent everywhere else -- which is what
     "one shot" was reaching for and only approximated. */
  const at = want.point;
  if (at && pos && pos.length === 3){
    const same = at.every(function(n, i){ return Math.round(n) === Math.round(pos[i]); });
    if (!same) return false;
  }''',
     "the overlay belongs to a coordinate, not to one caller"),

    (u'''  let anns = null;
  if (want.rings && want.rings.length) anns = tracingRingLines(want.rings, "org");
  else if (want.point && want.point.length === 3)
    anns = [{ type: "point", id: "orgpt", point: want.point.map(Math.round) }];
  if (!anns || !anns.length) return false;''',
     u'''  /* THE OUTLINE AND THE CENTRE, TOGETHER. It used to be one or the other, so the row that reads
     `centre (295844, 151391, 17862)` sent you to that coordinate with nothing marking it. They are
     two different claims about one organelle -- what shape it is, and where the record says it is
     -- and the reason to have both is to see them against each other. One layer, because it is one
     organelle. */
  let anns = [];
  if (want.rings && want.rings.length) anns = tracingRingLines(want.rings, "org");
  if (want.point && want.point.length === 3)
    anns = anns.concat([{ type: "point", id: "orgcentre",
                          point: want.point.map(Math.round) }]);
  if (!anns.length) return false;''',
     "...and it carries the centroid as well as the shape"),
]

BUILD = [
    (u'''      if(CUR_NUCID){const nl=st.layers.find(l=>/nucle/i.test((l.name||"")+(l.source||"")));if(nl)nl.segments=[CUR_NUCID];}
    }
    return st;}''',
     u'''      if(CUR_NUCID){const nl=st.layers.find(l=>/nucle/i.test((l.name||"")+(l.source||"")));if(nl)nl.segments=[CUR_NUCID];}
    }
    /* Here rather than in the "go" handler since 2026-09-20, so that EVERY link this page builds
       for this coordinate shows the organelle -- the arrow beside the cell's name is built before
       the handler ever reaches buildState. See organOverlayInto. */
    try{ organOverlayInto(st, pos); }catch(_e){}
    return st;}''',
     "a custom base state shows it too"),

    (u'''  return{dimensions:DIM,position:pos,crossSectionScale:3.0,projectionScale:PROJECTION_SCALE(CUR_IS_NEURON),...PROJ_ORIENT(),layers,selectedLayer:{layer:layers[0].name,visible:true},layout:{type:"xy-3d",orthographicProjection:true},showDefaultAnnotations:false,crossSectionBackgroundColor:ngBgColor(),perspectiveViewBackgroundColor:ngBgColor()};
}''',
     u'''  const _st={dimensions:DIM,position:pos,crossSectionScale:3.0,projectionScale:PROJECTION_SCALE(CUR_IS_NEURON),...PROJ_ORIENT(),layers,selectedLayer:{layer:layers[0].name,visible:true},layout:{type:"xy-3d",orthographicProjection:true},showDefaultAnnotations:false,crossSectionBackgroundColor:ngBgColor(),perspectiveViewBackgroundColor:ngBgColor()};
  /* The organelle a Jump was about, if this is the coordinate it was about. One call at the one
     place every link on this page comes from, rather than at each of the places that ask for one
     -- which is how the arrow beside the cell's name came to be the only link without it. */
  try{ organOverlayInto(_st, pos); }catch(_e){}
  return _st;
}''',
     "...and so does every ordinary one"),

    (u'''  let state;try{state=buildState(pos);organOverlayInto(state);}catch(err){''',
     u'''  /* buildState carries the organelle itself now (2026-09-20): doing it here reached only this
     one link, and not the arrow beside the cell's name, which showNucleus had already built. */
  let state;try{state=buildState(pos);}catch(err){''',
     "...so the handler no longer has to remember to"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("ujump.html", OVERLAY + BUILD)
print("\nnow: node organjumpcheck.js && node tracingpanelcheck.js && python3 src/build_stamps.py")
