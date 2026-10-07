# -*- coding: utf-8 -*-
u"""The cell goes to the viewer with the cell on it.                                     2026-10-07

Søren, on the endothelial cell he traced by hand: *"When there exist a nucleus and a whole cell
mesh, then they should be shown also in the neuroglancer and not just the organelles."*

"Show the cell with all 2 organelles" handed tracingViewerOpen the organelles and nothing else. For
a cell with a trustworthy c3 segmentation that is survivable: tracingShowCellIn puts the published
mesh in the 3D pane and the organelles sit inside it. For HIS cells it is not survivable, and he has
said why twice this week -- *"the nucleus and rootID are useless, because the vasculature
segmentation is crap. Therefor I am tracing those myself"*. On cell 61360735 the published mesh is
root 6198781614, which covers a hundred cells at once; the only honest outline of that cell is the
172 contours he drew. The button left exactly that behind and opened two organelles floating in
nothing.

WHAT CHANGES

  core/panel.js   The Organelles section already knows this cell's whole-cell and nucleus tracings
                  -- organIsOrganelle() is what keeps them out of its LIST, and that stays, because
                  they are the cell and they are listed with the cell above. They are now also
                  collected, their contours fetched with the organelles' when the section is
                  opened, and handed to the viewer AHEAD of the organelles so the selected layer is
                  the cell rather than a centriole. The button says so on its face.

  core/tracingcard.js  organShowAllInViewer counts the two kinds separately in what it says
                  afterwards, so "with 2 organelles on it" does not describe a link with four
                  layers.

WHAT DOES NOT CHANGE: tracingViewerOpen, which already simplifies redundant points, prices the
other viewer and re-points an oversized link at one that can take it. A whole cell is 172 contours
and will often be the thing that trips that -- and being told so, with the numbers, is the answer
that already exists.

Checks: showallbodycheck.js (new), organcardcheck.js, organjumpcheck.js, panelcellcheck.js
Run: python3 src/the_cell_goes_with_its_organelles.py
     python3 src/build_stamps.py && python3 wjump-build/build_wjump.py && python3 xjump-build/build_xjump.py
     node showallbodycheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── 1. the two kinds, named once ──────────────────────────────────────────────────────────────
OLD_IS = u'''function organIsOrganelle(t){
  var k = String((t && (t.instanceOf || t.kind)) || "").toLowerCase();
  return !!k && k !== "cell" && k !== "nucleus";
}'''

NEW_IS = u'''function organIsOrganelle(t){
  var k = String((t && (t.instanceOf || t.kind)) || "").toLowerCase();
  return !!k && k !== "cell" && k !== "nucleus";
}
/* The other half of the same sentence. A whole cell and a nucleus are not organelles -- that is why
   they are listed with the cell and not in the Organelles list -- but they ARE the cell, and a
   picture of this cell with its organelles in it is not a picture of this cell without it
   (2026-10-07). Cell first, then nucleus: the order they are drawn in and the order they are read
   in. */
function organIsCellBody(t){
  var k = String((t && (t.instanceOf || t.kind)) || "").toLowerCase();
  return k === "cell" || k === "nucleus";
}
function organBodyRank(t){
  return String((t && (t.instanceOf || t.kind)) || "").toLowerCase() === "cell" ? 0 : 1;
}'''

# ── 2. collected beside the organelles ────────────────────────────────────────────────────────
OLD_TRS = u'''  var trs = (PANEL_TRACINGS || []).filter(function(t){
    if (!t || !organIsOrganelle(t)) return false;
    return panelSameCell(t, nid, root);
  });
  if (!anns.length && !trs.length){ host.innerHTML = ""; return; }'''

NEW_TRS = u'''  var trs = (PANEL_TRACINGS || []).filter(function(t){
    if (!t || !organIsOrganelle(t)) return false;
    return panelSameCell(t, nid, root);
  });
  /* THE CELL ITSELF, for the viewer button only -- it is not put in the list below, which is the
     Organelles list and has never held it (2026-10-07). */
  var body = (PANEL_TRACINGS || []).filter(function(t){
    if (!t || !organIsCellBody(t)) return false;
    return panelSameCell(t, nid, root);
  }).sort(function(a, b){ return organBodyRank(a) - organBodyRank(b); });
  if (!anns.length && !trs.length){ host.innerHTML = ""; return; }'''

# ── 3. its contours, from the same cache ──────────────────────────────────────────────────────
OLD_RINGS = u'''  trs.forEach(function(t){
    if (!t.rings && t.structureId && PANEL_ORGAN_RINGS[t.structureId])
      t.rings = PANEL_ORGAN_RINGS[t.structureId];
  });
  var withRings = trs.filter(function(t){ return t.rings && t.rings.length; });
  var noRings = trs.filter(function(t){ return !(t.rings && t.rings.length); });'''

NEW_RINGS = u'''  var fromCache = function(t){
    if (!t.rings && t.structureId && PANEL_ORGAN_RINGS[t.structureId])
      t.rings = PANEL_ORGAN_RINGS[t.structureId];
  };
  trs.forEach(fromCache);
  body.forEach(fromCache);
  var withRings = trs.filter(function(t){ return t.rings && t.rings.length; });
  var noRings = trs.filter(function(t){ return !(t.rings && t.rings.length); });
  var bodyWith = body.filter(function(t){ return t.rings && t.rings.length; });
  var bodyNo = body.filter(function(t){ return !(t.rings && t.rings.length); });'''

# ── 4. the button, and what it promises ───────────────────────────────────────────────────────
OLD_BTN = u'''  var allBtn = "";
  if (withRings.length && typeof organShowAllInViewer === "function")
    allBtn = '<div style="margin-top:8px"><button type="button" class="idbtn organshowall" '
      + 'style="width:auto;padding:4px 10px;font-size:12px" '
      + 'title="Opens the viewer with this cell and every outline on it \\u2014 one annotation layer '
      + 'each, in the colours they were drawn in, with the cell see-through in the 3D pane.">'
      + 'Show the cell with all ' + withRings.length + ' organelle'
      + (withRings.length === 1 ? "" : "s") + ' \\u2197</button></div>';'''

NEW_BTN = u'''  /* \\u2500\\u2500 AND THE CELL HE DREW GOES WITH THEM \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500  2026-10-07
     S\\u00f8ren: *"When there exist a nucleus and a whole cell mesh, then they should be shown also
     in the neuroglancer and not just the organelles."*

     The 3D pane shows the PUBLISHED mesh for ids.root, which on his vascular cells is root
     6198781614 and covers a hundred cells -- the reason he traced this one by hand. His own outline
     is the only true one, and it was the one thing the button left behind. Named on the face of the
     button so the picture is known before the click. */
  var bodySay = bodyWith.map(function(t){
    return String((t.instanceOf || t.kind) || "").toLowerCase() === "cell" ? "whole cell" : "nucleus";
  });
  var andSay = bodySay.length
    ? " \\u2014 and the " + (bodySay.length === 1 ? bodySay[0] : bodySay.join(" and ")) + " you traced"
    : "";
  var allBtn = "";
  if ((withRings.length || bodyWith.length) && typeof organShowAllInViewer === "function")
    allBtn = '<div style="margin-top:8px"><button type="button" class="idbtn organshowall" '
      + 'style="width:auto;padding:4px 10px;font-size:12px" '
      + 'title="Opens the viewer with this cell and every outline on it \\u2014 one annotation layer '
      + 'each, in the colours they were drawn in, with the cell see-through in the 3D pane.'
      + (bodySay.length ? " Your own outline of the cell goes on it too, which is the only one "
          + "there is where the published segmentation cannot be trusted." : "") + '"'
      + '>'
      + 'Show the cell with all ' + withRings.length + ' organelle'
      + (withRings.length === 1 ? "" : "s") + andSay + ' \\u2197</button></div>';'''

# ── 5 and 6. fetched together, or the button has nothing of theirs to hand over ───────────────
OLD_F1 = u'''    if (det.open) organFetchRings(nid, root, trs);
  });'''
NEW_F1 = u'''    if (det.open) organFetchRings(nid, root, trs.concat(body));
  });'''

OLD_F2 = u'''  if (det && det.open) organFetchRings(nid, root, trs);'''
NEW_F2 = u'''  if (det && det.open) organFetchRings(nid, root, trs.concat(body));'''

# ── 7. handed over, cell first ────────────────────────────────────────────────────────────────
OLD_CLICK = u'''      if (typeof organShowAllInViewer === "function")
        organShowAllInViewer(withRings, nid, root, noRings.length);'''
NEW_CLICK = u'''      if (typeof organShowAllInViewer === "function")
        organShowAllInViewer(bodyWith.concat(withRings), nid, root, noRings.length + bodyNo.length);'''

edit("core/panel.js", [
    (u"a cell body is not an organelle, and is named as such", OLD_IS, NEW_IS),
    (u"this cell's own outline is collected", OLD_TRS, NEW_TRS),
    (u"...and its contours come from the same cache", OLD_RINGS, NEW_RINGS),
    (u"...the button says it is coming", OLD_BTN, NEW_BTN),
    (u"...the toggle fetches it", OLD_F1, NEW_F1),
    (u"...and so does an already-open section", OLD_F2, NEW_F2),
    (u"...and the click hands it over first", OLD_CLICK, NEW_CLICK),
])

# ── 8. and the sentence afterwards counts the two kinds apart ─────────────────────────────────
OLD_SHOW = u'''function organShowAllInViewer(trs, nid, root, missing){
  const structs = (trs || []).filter(function(t){ return t && (t.rings || []).length; })
    .map(function(t){
      return { name: t.name || (t.instanceOf || t.kind || "organelle"),
               color: t.color || "#40e28c", rings: t.rings };
    });
  if (!structs.length){
    tracingSay("None of this cell’s outlines have been read here yet — open the "
      + "Organelles list, give it a moment, and try again.", true);
    return;
  }
  const what = structs.length + " organelle" + (structs.length === 1 ? "" : "s");'''

NEW_SHOW = u'''function organShowAllInViewer(trs, nid, root, missing){
  const structs = (trs || []).filter(function(t){ return t && (t.rings || []).length; })
    .map(function(t){
      return { name: t.name || (t.instanceOf || t.kind || "organelle"),
               kind: String((t.instanceOf || t.kind) || "").toLowerCase(),
               color: t.color || "#40e28c", rings: t.rings };
    });
  if (!structs.length){
    tracingSay("None of this cell’s outlines have been read here yet — open the "
      + "Organelles list, give it a moment, and try again.", true);
    return;
  }
  /* ── TWO KINDS, COUNTED APART \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500  2026-10-07
     Since the cell and its nucleus now travel with the organelles (see core/panel.js), "with 4
     organelles on it" would be a miscount of a link with two of them. */
  const isBody = function(s){ return s.kind === "cell" || s.kind === "nucleus"; };
  const nBody = structs.filter(isBody).length, nOrg = structs.length - nBody;
  const what = (nOrg ? nOrg + " organelle" + (nOrg === 1 ? "" : "s") : "")
    + ((nOrg && nBody) ? " and " : "")
    + (nBody ? structs.filter(isBody).map(function(s){
         return s.kind === "cell" ? "the whole cell" : "the nucleus"; }).join(" and ")
         + " you traced" : "");'''

edit("core/tracingcard.js", [
    (u"the message counts cell bodies apart from organelles", OLD_SHOW, NEW_SHOW),
])
print("done")
