# -*- coding: utf-8 -*-
"""The nearest line moves under the boxes.                                      2026-09-18

Søren: *"And the nearest nucleus line should be just below the coordinate window after looking up a
coordinate."* And: *"Remove 'Also' from Also log an organelle."*

WHAT THE LINE IS FOR decides where it goes. "nearest nucleus 228816, 239776, 19593 · 0.00 µm from
query" is the answer to the lookup you just did -- did it find the cell you meant, and how far off
was the point you pasted. It was reported in the middle of the identity panel, below three diagrams,
which is where you read it only after you have stopped wondering. Under the boxes you typed into, it
is the receipt for the thing you just pressed.

"after looking up a coordinate" IS PART OF THE INSTRUCTION. The element is empty and takes no room
until a lookup fills it, so the card looks exactly as it does now before anyone types.

THE HAZARD, AND IT IS THE ONLY REASON THIS NEEDS CARE. The line now lives OUTSIDE the panel it
describes, so it no longer disappears when the panel is replaced. Four other render paths can take
over that panel -- a verified own point, a user-reported cell, a merged sub-cell, and the guided
identification flow -- and none of them has a nearest MICrONS nucleus to report. If any of them
leaves the old text standing, the card states a nucleus id and a distance belonging to a cell that
is no longer on screen, in the tool's own voice, with nothing to suggest it is stale. So the line is
set through ONE function, and every path that takes the panel calls it: with a value, or with
nothing.

Run: python3 src/the_nearest_line_moves_under_the_boxes.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

COORD_ROW_END = ('''+'\\" title=\\"Jump to this coordinate, build the Neuroglancer link and enable '''
                 '''identification\\">&#8594;</button></div>\n''')

PAIRS_PAGE = [
    # ── the slot, right under the three boxes ───────────────────────────────────────────────
    ('''<button class="go inline" id="go" title="Jump to this coordinate, build the Neuroglancer link and enable identification">&#8594;</button></div>
''',
     '''<button class="go inline" id="go" title="Jump to this coordinate, build the Neuroglancer link and enable identification">&#8594;</button></div>
<!-- 2026-09-18 (Søren: "the nearest nucleus line should be just below the coordinate window after
     looking up a coordinate") -- the receipt for the lookup you just did: which nucleus it landed
     on and how far the point you pasted was from it. It used to be reported in the middle of the
     identity panel, under three diagrams. Empty and zero-height until setNearestLine() fills it,
     so this card is unchanged before anybody types. -->
<div class="meta" id="nearestLine" style="display:none;margin-top:6px"></div>
''',
     "the coordinate row has a place for its own answer"),

    # ── one function owns it ────────────────────────────────────────────────────────────────
    ('''function showNucleus(pos){''',
     '''/* ── ONE FUNCTION OWNS THE NEAREST-NUCLEUS LINE ─────────────────────────────────  2026-09-18
   It sits outside #nucpanel now, so it does NOT vanish when the panel is replaced -- and four other
   render paths can replace that panel with a cell that has no nearest MICrONS nucleus to report (a
   verified own point, a user-reported cell, a merged sub-cell, the guided-identification flow).
   Any of them leaving the old text standing would have the card state a nucleus id and a distance
   for a cell that is no longer on screen, in the tool's own voice, with nothing to mark it stale.
   So: every path that takes the panel calls this, with a value or with nothing. */
function setNearestLine(html){
  const el=document.getElementById("nearestLine");
  if(!el)return;
  el.innerHTML=html||"";
  el.style.display=html?"":"none";
}
function showNucleus(pos){''',
     "...and one function that fills or empties it"),

    # ── showNucleus writes it there instead of into the panel ───────────────────────────────
    ('''  /* THE JUMP IS ON THE LINE THAT NAMES WHAT IT JUMPS TO, 2026-09-18 (Søren: "Jump to this
     nucleus should be next to the nearest nucleus at this voxel, just after 'from query', but
     make it look nice.") It used to sit at the very bottom of the panel, under Cell history,
     which is as far as it is possible to get from the line saying WHICH nucleus it means.
     It keeps class="jump" because the click handler below binds `.jump`, and overrides the
     size: a full-size button in a 12 px monospace line would set the line's height and read as
     a mistake. The override matches the inline "Jump to centriole" button that already lives
     in a .meta line in renderStandalone -- the pattern for this was already in the file. */
  h+='<div class="meta">nearest nucleus '+coordSpan(NX[i],NY[i],NZ[i])+' &middot; '+(r.dist/1000).toFixed(2)+' &micro;m from query'+'<button class="jump" data-x="'+NX[i]+'" data-y="'+NY[i]+'" data-z="'+NZ[i]+'" style="margin:0 0 0 10px;padding:2px 8px;font-size:11px;vertical-align:middle">Jump to this nucleus &#8599;</button>'+'</div>';''',
     '''  /* THE JUMP IS ON THE LINE THAT NAMES WHAT IT JUMPS TO, 2026-09-18 (Søren: "Jump to this
     nucleus should be next to the nearest nucleus at this voxel, just after 'from query', but
     make it look nice.") It used to sit at the very bottom of the panel, under Cell history,
     which is as far as it is possible to get from the line saying WHICH nucleus it means.
     It keeps class="jump" because the click handler below binds `.jump`, and overrides the
     size: a full-size button in a 12 px monospace line would set the line's height and read as
     a mistake. The override matches the inline "Jump to centriole" button that already lives
     in a .meta line in renderStandalone -- the pattern for this was already in the file.
     The whole line now goes UNDER THE COORDINATE BOXES rather than into this panel, so it is
     wired after panel.innerHTML below (the button's handler is bound there, on the card). */
  const nearestHtml='nearest nucleus '+coordSpan(NX[i],NY[i],NZ[i])+' &middot; '+(r.dist/1000).toFixed(2)+' &micro;m from query'+'<button class="jump" data-x="'+NX[i]+'" data-y="'+NY[i]+'" data-z="'+NZ[i]+'" style="margin:0 0 0 10px;padding:2px 8px;font-size:11px;vertical-align:middle">Jump to this nucleus &#8599;</button>';''',
     "showNucleus builds the line instead of appending it"),
]



# ── EVERY PATH THAT TAKES THE PANEL SAYS SOMETHING ABOUT THE LINE ─────────────────────────────────
# Five endpoints, one of them the branch that returns early. The four that are not showNucleus CLEAR
# it, because none of them has a nearest MICrONS nucleus to report -- see the header for what leaving
# it standing would say.
PAIRS_WIRE = [
    ("""  panel.innerHTML=h;
  panel.querySelectorAll(".jump,.njump").forEach(b=>b.addEventListener("click",()=>{""",
     """  panel.innerHTML=h;
  /* The line lives on the CARD, not in this panel, so it is written after the panel and its own
     button is wired here rather than by the panel's .jump/.njump sweep below. */
  setNearestLine(nearestHtml);
  const nlBtn=document.querySelector("#nearestLine button.jump");
  if(nlBtn)nlBtn.addEventListener("click",()=>{
    jumpToVoxel(+nlBtn.dataset.x,+nlBtn.dataset.y,+nlBtn.dataset.z);
  });
  panel.querySelectorAll(".jump,.njump").forEach(b=>b.addEventListener("click",()=>{""",
     "showNucleus writes the line under the boxes and wires its button"),

    ("""    fetchNewCellReports().then(()=>{
      if(token!==LAST_OOB_QUERY)return;
      const ur2=nearestUserReportedCell(vx,vy,vz,5000);
      if(ur2)renderUserReportedCell(ur2,panel);
    });
    return;""",
     """    fetchNewCellReports().then(()=>{
      if(token!==LAST_OOB_QUERY)return;
      const ur2=nearestUserReportedCell(vx,vy,vz,5000);
      if(ur2)renderUserReportedCell(ur2,panel);
    });
    /* No nucleus was detected anywhere near here -- so there is no nearest-nucleus line, and any
       line left from the previous lookup would be reporting a different cell entirely. */
    setNearestLine("");
    return;""",
     "...and clears it where no nucleus was found at all"),

    ("""function renderStandalone(st,panel,outOfRegion){
  panel.classList.add("show");""",
     """function renderStandalone(st,panel,outOfRegion){
  panel.classList.add("show");
  setNearestLine("");   /* a verified own point has no MICrONS nucleus detection to be nearest to */""",
     "a verified own point clears it"),

    ("""function renderUserReportedCell(ur,panel){""",
     """function renderUserReportedCell(ur,panel){
  setNearestLine("");   /* the reporter's own estimated location, not a nucleus detection */""",
     "a user-reported cell clears it"),

    ("""function renderMergedSubCell(sub,panel){
  panel.className="nuc show";""",
     """function renderMergedSubCell(sub,panel){
  panel.className="nuc show";
  setNearestLine("");   /* this sub-cell's nucleus is the FUSED detection, not a nearest one */""",
     "a merged sub-cell clears it"),
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


edit("ujump.html", PAIRS_PAGE)
edit("ujump.html", PAIRS_WIRE)
print("\nnow: node jumplayoutcheck.js && python3 src/build_stamps.py")
