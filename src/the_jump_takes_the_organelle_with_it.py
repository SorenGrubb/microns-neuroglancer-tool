# -*- coding: utf-8 -*-
u"""The Jump takes the organelle with it.                                        2026-09-19

Søren, pointing at the Jump beside a lysosome's centre: *"For the jump button here, it would make
sense that it shows the organelle."*

WHAT IT DID. Wrote the coordinate into the three boxes and pressed the arrow. The page then rebuilt
the Neuroglancer link for that place, with the cell on it and nothing else -- so opening it put you
inside a microglia at the right coordinate with no indication of which of the grey blobs in front of
you was the 3.39 µm³ lysosome the row was about. The panel had the outline in hand the whole time:
it is what the volume, the contour count and the centre on that same row were computed from.

SO THE OUTLINE TRAVELS WITH THE JUMP, as one annotation layer in the organelle's own colour -- the
same closed loops of lines tracingViewerOpen writes, and the same shape the link can be pasted back
into the tracing card from. A row that has only a logged point and no outline takes a single point
annotation instead, which is all that row honestly knows.

ONE SHOT, CONSUMED BY THE NEXT JUMP. Every navigation in this tool rebuilds the link, and an overlay
that outlived its coordinate would put a lysosome's contours on a link centred somewhere else
entirely -- a wrong answer that looks exactly like a right one. Armed by the click, read once by the
build, cleared either way. Same one-shot pattern as NAV_FROM_NJUMP a few hundred lines above it.

ARMED IN ONE PLACE, NOT THREE. `.jumpview` buttons are wired by three different handlers in this
project (the fold's rows, the Organelles section, the reports list), so the arming is a single
capture-phase listener on the document rather than a fourth copy of the same four lines. It also
CLEARS on a click of any jump button that carries no organelle, which is what makes "consumed by the
next jump" true for the jumps that were never about an organelle.

Run: python3 src/the_jump_takes_the_organelle_with_it.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ARM = [
    (u'''var PANEL_ORGAN_ANNS = null, PANEL_ORGAN_NID = "", PANEL_ORGAN_RINGS = {}, PANEL_ORGAN_BUSY = false;''',
     u'''var PANEL_ORGAN_ANNS = null, PANEL_ORGAN_NID = "", PANEL_ORGAN_RINGS = {}, PANEL_ORGAN_BUSY = false;
/* ── WHAT THE NEXT JUMP SHOULD SHOW ────────────────────────────────  2026-09-19
   Søren: *"For the jump button here, it would make sense that it shows the organelle."*

   A Jump wrote a coordinate and rebuilt the viewer link for it, with the cell on it and no sign of
   WHICH thing at that coordinate the row was about. The outline is in hand -- the row's volume and
   centre were computed from it -- so it rides along, and the page that builds the link picks it up
   from here.

   ONE CAPTURE-PHASE LISTENER, because .jumpview buttons are wired by three separate handlers in
   this project and a copy of this in each of them is the drift this file keeps warning about. It
   runs before any of them, and a jump button with no organelle on it CLEARS the slot rather than
   leaving the last one armed -- which is what makes it one-shot for every jump, not only ours.

   The rings are copied in HERE rather than looked up later: by the time the link is built the panel
   has been told to render a different cell, and reading a cache mid-rebuild is how an outline ends
   up drawn on the wrong coordinate. */
var ORGAN_SHOW_NEXT = null;
if (typeof document !== "undefined" && !window.__organJumpArmed){
  window.__organJumpArmed = 1;
  document.addEventListener("click", function(ev){
    var b = null;
    try { b = ev.target && ev.target.closest ? ev.target.closest(".jumpview") : null; }
    catch (_e){ b = null; }
    if (!b){ return; }                       // not a jump at all: leave whatever is armed alone
    var sid = (b.dataset && b.dataset.sid) || "";
    /* data-mark: a row that has a logged point and no outline. It still marks the thing, with a
       point annotation, because "which of these blobs" is the question either way -- it just does
       not pretend to a shape nobody has drawn. */
    var mark = !!(b.dataset && b.dataset.mark);
    if (!sid && !mark){ ORGAN_SHOW_NEXT = null; return; }
    var rings = sid ? PANEL_ORGAN_RINGS[sid] : null;
    var pt = [b.dataset.x, b.dataset.y, b.dataset.z].map(Number);
    ORGAN_SHOW_NEXT = { sid: sid, name: b.dataset.name || "", color: b.dataset.color || "",
                        rings: (rings && rings.length) ? rings : null,
                        point: pt.every(function(n){ return isFinite(n); }) ? pt : null };
  }, true);
}''',
     "a jump can carry an organelle with it"),
]

BUTTON = [
    (u'''function organJump(p){
  return '<button type="button" class="jumpview" data-x="' + p[0] + '" data-y="' + p[1]
       + '" data-z="' + p[2] + '" style="margin-left:6px;padding:1px 7px;font-size:11px">Jump</button>';
}''',
     u'''/* `t` is the thing the row is about, when the row is about something: a tracing (structureId,
   name, colour) whose outline should go on the link, or a bare {name} for a logged point that has
   no outline and takes a marker instead. Left out entirely, this is the plain coordinate jump it
   always was -- and such a jump CLEARS the slot, which is what keeps one organelle's contours from
   being drawn at the next place you navigate to. */
function organJump(p, t){
  var sid = (t && t.structureId) ? String(t.structureId) : "";
  var nm = t ? String(t.name || "") : "";
  var col = t ? String(t.color || "") : "";
  return '<button type="button" class="jumpview" data-x="' + p[0] + '" data-y="' + p[1]
       + '" data-z="' + p[2] + '"'
       + (sid ? ' data-sid="' + panelEsc(sid) + '"' : "")
       + ((!sid && nm) ? ' data-mark="1"' : "")
       + (nm ? ' data-name="' + panelEsc(nm) + '"' : "")
       + (col ? ' data-color="' + panelEsc(col) + '"' : "")
       + ' title="' + (sid
           ? 'Jumps here and puts this organelle&#39;s outline on the viewer link, so opening it '
             + 'shows the organelle rather than only the place it is in.'
           : nm
             ? 'Jumps here and marks this logged point on the viewer link. Nobody has outlined it, '
               + 'so there is no shape to show.'
             : 'Jumps to this coordinate.')
       + '" style="margin-left:6px;padding:1px 7px;font-size:11px">Jump</button>';
}''',
     "a Jump button can say which organelle it is for"),

    (u'''      + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"
        + ((t.contours === 1) ? "" : "s") + " on " + (t.sections || 0) + " section"
        + ((t.sections === 1) ? "" : "s") + '</span>'
      + (best ? '<span style="flex:0 0 auto">centre (' + best.join(", ") + ')' + organJump(best) + '</span>' : "")''',
     u'''      + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"
        + ((t.contours === 1) ? "" : "s") + " on " + (t.sections || 0) + " section"
        + ((t.sections === 1) ? "" : "s") + '</span>'
      + (best ? '<span style="flex:0 0 auto">centre (' + best.join(", ") + ')' + organJump(best, t) + '</span>' : "")''',
     "...and a paired row's Jump carries its outline"),

    (u'''      + '<span style="opacity:.7;flex:0 0 auto">outlined, not logged</span>'
      + (best ? '<span style="flex:0 0 auto">centre (' + best.join(", ") + ')' + organJump(best) + '</span>' : "")''',
     u'''      + '<span style="opacity:.7;flex:0 0 auto">outlined, not logged</span>'
      + (best ? '<span style="flex:0 0 auto">centre (' + best.join(", ") + ')' + organJump(best, t) + '</span>' : "")''',
     "...so does an outline nobody has logged"),

    (u'''      + '<span style="opacity:.7;flex:0 0 auto">logged, not outlined</span>'
      + '<span style="flex:0 0 auto">(' + pt.join(", ") + ')' + organJump(pt) + '</span>\'''',
     u'''      + '<span style="opacity:.7;flex:0 0 auto">logged, not outlined</span>'
      /* No outline exists for this one, so the jump carries a point and says so rather than
         pretending to a shape nobody has drawn. */
      + '<span style="flex:0 0 auto">(' + pt.join(", ") + ')'
        + organJump(pt, { name: organCap(organKindLabel(a.kind)) }) + '</span>\'''',
     "...and a logged point takes a marker instead of a shape"),
]

FOLD = [
    (u'''  const jumpBtn=p=>'<button type="button" class="jumpview" data-x="'+p[0]+'" data-y="'+p[1]+'" data-z="'+p[2]+'" style="margin-left:6px;padding:2px 8px;font-size:11px">Jump</button>';''',
     u'''  /* The second argument is the organelle the row is about, when there is one: organJump's
     reasons, one file-section up, and the same dataset attributes so the one capture listener
     picks up both kinds of row. */
  const jumpBtn=(p,t)=>'<button type="button" class="jumpview" data-x="'+p[0]+'" data-y="'+p[1]+'" data-z="'+p[2]+'"'
    +((t&&t.structureId)?' data-sid="'+escHtml(String(t.structureId))+'"':"")
    +((t&&!t.structureId&&t.name)?' data-mark="1"':"")
    +((t&&t.name)?' data-name="'+escHtml(String(t.name))+'"':"")
    +' style="margin-left:6px;padding:2px 8px;font-size:11px">Jump</button>';''',
     "the folded rows' Jump can carry an organelle too"),

    (u'''    return '<div class="meta" style="margin-top:4px;display:flex;align-items:baseline;gap:4px;'
      +'flex-wrap:wrap"><span>'+escHtml(named)+'</span>'+size+from
      +'<span style="flex:1 1 auto"></span><span>('+coordSpan(pa[0],pa[1],pa[2])+')</span>'
      +jumpBtn(pa)+'</div>';''',
     u'''    return '<div class="meta" style="margin-top:4px;display:flex;align-items:baseline;gap:4px;'
      +'flex-wrap:wrap"><span>'+escHtml(named)+'</span>'+size+from
      +'<span style="flex:1 1 auto"></span><span>('+coordSpan(pa[0],pa[1],pa[2])+')</span>'
      +jumpBtn(pa,{structureId:s.fromStructureId||"",name:named})+'</div>';''',
     "...which is the outline its centre was computed from"),
]

OVERLAY = [
    (u'''function tracingRingLines(rings, idPrefix){''',
     u'''/* ── AND THE LINK IT BUILDS SHOWS IT ─────────────────────────────  2026-09-19
   Søren: *"For the jump button here, it would make sense that it shows the organelle."*

   The other end of core/panel.js's ORGAN_SHOW_NEXT: a Jump beside an organelle arms it, and the
   next link this page builds gets that organelle on it. Read once and cleared, because every
   navigation rebuilds the link and contours left over from the last jump would be drawn at a
   coordinate they have nothing to do with -- which looks exactly like a correct answer.

   Returns whether anything went on, so the check can tell "nothing was armed" from "something was
   armed and dropped". */
function organOverlayInto(st){
  const want = (typeof ORGAN_SHOW_NEXT !== "undefined") ? ORGAN_SHOW_NEXT : null;
  if (typeof ORGAN_SHOW_NEXT !== "undefined") ORGAN_SHOW_NEXT = null;
  if (!want || !st) return false;
  /* Neuroglancer keys layers by name, and the page's own base state may already carry one called
     this -- tracingViewerOpen's reason, and the same answer. */
  const nm = (String(want.name || "").replace(/[^\\w .\\u00b5-]+/g, "").trim() || "organelle");
  let anns = null;
  if (want.rings && want.rings.length) anns = tracingRingLines(want.rings, "org");
  else if (want.point && want.point.length === 3)
    anns = [{ type: "point", id: "orgpt", point: want.point.map(Math.round) }];
  if (!anns || !anns.length) return false;
  st.layers = (st.layers || []).filter(function(l){
    return !(l && l.type === "annotation" && String(l.name || "") === nm);
  });
  st.layers.push({ type: "annotation", source: "local://annotations", tab: "annotations",
                   name: nm, annotationColor: want.color || "#40e28c", annotations: anns });
  st.selectedLayer = { layer: nm, visible: true };
  return true;
}
function tracingRingLines(rings, idPrefix){''',
     "a built state can carry the organelle a jump was about"),

    (u'''  let state;try{state=buildState(pos);}catch(err){''',
     u'''  /* An organelle's Jump armed this; anything else cleared it. One shot, read here, so the link
     that opens shows the lysosome the row was about and not only the place it sits in. */
  let state;try{state=buildState(pos);organOverlayInto(state);}catch(err){''',
     "...and every jump reads it, once"),
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


edit("core/panel.js", ARM + BUTTON + FOLD)
edit("ujump.html", OVERLAY)
print("\nnow: node organjumpcheck.js && node organcardcheck.js && node ccpanelcheck.js "
      "&& python3 src/build_stamps.py")
