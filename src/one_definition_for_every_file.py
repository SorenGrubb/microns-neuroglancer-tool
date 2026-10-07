# -*- coding: utf-8 -*-
u"""One definition of "the same cell", for every file that has one.                      2026-10-07

Søren, looking at cell 61360735's panel the morning after: *"This is the cell that I lost the whole
cell and nucleus trace for, but it appears to have all the organelles and whole cell trace associated
with the other cells I have traced. What is going on here?"*

THE SAME BUG, IN A FILE I DID NOT GREP. On 6 October I found five copies of the cell test in
core/tracingcard.js and fixed those five. There were three more:

    core/panel.js:675        "Traced on this cell"
    core/panel.js:907        the Organelles section
    core/blenderexport.js:305 what travels in a Blender export

all of them

    return (nid && String(t.nucleusId || "") === String(nid))
        || (root && String(t.rootId || "") === String(root));

nucleus or root, no coordinate anywhere. His vascular cells share root 6198781614 -- which is his
whole point about root ids -- so every structure traced on any of them appeared on all of their
panels, and would have travelled in any one of their Blender exports.

EIGHT COPIES OF ONE DECISION, and yesterday I stopped at five because five was where I happened to be
reading. So this time the definition does not live in a file: UJ.tracing.sameCell() is in
core/tracing.js, which panel.js, blenderexport.js and tracingcard.js all already load, and all three
ask it. tracingcard.js's own three become one-line delegates rather than a sixth implementation.

AND THE PANEL SAYS WHAT IT IS NOT SHOWING. A tracing excluded only because its coordinate names
another cell is counted in one line under the list. Work that silently disappears off its own panel
is how this week started, and a filter without a remainder is exactly that.

Checks: panelcellcheck.js (new), cellidentitycheck.js.
Run: python3 src/one_definition_for_every_file.py
     python3 src/build_stamps.py
     node panelcellcheck.js && node cellidentitycheck.js
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


SHARED = u'''  /* ── WHICH CELL A TRACING IS ON ───────────────────────────  2026-10-07
     Søren: *"the nucleus and rootID are useless, because the vasculature segmentation is crap.
     Therefor I am tracing those myself and reporting what cell is there... a coordinate for the cell
     center, that is what defines the cell and not the faulty rootID or nucleus ID."*

     THE ORDER IS HIS: coordinate, then nucleus, then root. A reported centre is a person saying
     "this is a cell and it is here"; a nucleus id is the segmentation's claim; a root id in
     vasculature can cover a hundred cells at once — his share 6198781614.

     IT LIVES HERE BECAUSE IT HAD EIGHT HOMES. core/tracingcard.js carried five copies of this test
     and core/panel.js two and core/blenderexport.js one, none of which looked at the coordinate. On
     6 October I fixed the five I was reading and left the three I was not, and the next morning the
     cell panel was still showing three cells' tracings on one card. A decision written out once per
     caller is a decision that gets half-fixed; this module is loaded by all of them. */
  function coordKey(v){
    var n = String(v || "").split(/[\\s,;]+/).filter(Boolean).map(Number);
    return (n.length === 3 && n.every(isFinite)) ? n.map(Math.round).join(",") : "";
  }
  /* A row in any of the shapes this project holds cells in: the sheet's camelCase, the kept list's
     snake_case, the export's, and the card's own boxes. */
  function cellOf(x){
    /* ωJump files a tracing with no nucleus as "<volume>:" — a scope, not a cell. */
    var bare = function(v){ var s = String(v || ""); var i = s.indexOf(":"); return i < 0 ? s : s.slice(i + 1); };
    return { nuc:  bare(x && (x.nucleus_id || x.nucleusId)),
             root: bare(x && (x.root_id || x.rootId)),
             at:   coordKey(x && (x.cell_coord || x.cellCoord || x.at)) };
  }
  function sameCell(a, b){
    if (!a || !b) return false;
    var aa = coordKey(a.at), bb = coordKey(b.at);
    if (aa && bb) return aa === bb;
    if (a.nuc && b.nuc) return String(a.nuc) === String(b.nuc);
    return !!(a.root && b.root && String(a.root) === String(b.root));
  }
  /* True only when the coordinate is the reason — so a caller can say what it is not showing
     rather than dropping it in silence. */
  function elsewhereByCoord(a, b){
    if (!a || !b) return false;
    var aa = coordKey(a.at), bb = coordKey(b.at);
    return !!(aa && bb && aa !== bb);
  }
'''

edit("core/tracing.js", [
 (u"the one definition lives in the shared module",
  u"""  return { ringsFromLink: ringsFromLink, _readLayer: readLayer, fetchMany: fetchMany,""",
  SHARED + u"""  return { coordKey: coordKey, cellOf: cellOf, sameCell: sameCell,
           elsewhereByCoord: elsewhereByCoord,
           ringsFromLink: ringsFromLink, _readLayer: readLayer, fetchMany: fetchMany,"""),
])

edit("core/tracingcard.js", [
 (u"the card delegates rather than keeping a sixth copy",
  u"""function tracingCoordKey(v){
  var n = String(v || "").split(/[\\s,;]+/).filter(Boolean).map(Number);
  return (n.length === 3 && n.every(isFinite)) ? n.map(Math.round).join(",") : "";
}""",
  u"""/* ── DELEGATES, SINCE 2026-10-07 ────────────────────────────
   These three were written here on the 6th, and core/panel.js and core/blenderexport.js went on
   carrying their own `nuc || root` tests because this file is not where they look. The definition
   moved to core/tracing.js, which all three load; these keep their names so every call site in this
   file reads as it did. */
function tracingCoordKey(v){ return UJ.tracing.coordKey(v); }"""),

 (u"...and so does cellOf",
  u"""function tracingCellOf(x){
  /* ωJump files a tracing with no nucleus as "<volume>:" — a scope, not a cell (2026-09-21). */
  var bare = function(v){ var s = String(v || ""); var i = s.indexOf(":"); return i < 0 ? s : s.slice(i + 1); };
  return { nuc:  bare(x && (x.nucleus_id || x.nucleusId)),
           root: bare(x && (x.root_id || x.rootId)),
           at:   tracingCoordKey(x && (x.cell_coord || x.cellCoord)) };
}""",
  u"""function tracingCellOf(x){ return UJ.tracing.cellOf(x); }"""),
 (u"...and so does sameCell",
  'function tracingSameCell(a, b){\n  if (!a || !b) return false;\n  /* NORMALISED HERE AND NOT ONLY IN tracingCellOf. A caller handing this a raw box value —\n     "427087, 220193, 1940" against the sheet\'s "427087,220193,1940" — is precisely the drift\n     this function exists to end, and it would have reported two cells. Found by the check, which\n     asks it directly rather than only through its callers. 2026-10-06. */\n  var aa = tracingCoordKey(a.at), bb = tracingCoordKey(b.at);\n  if (aa && bb) return aa === bb;\n  if (a.nuc && b.nuc) return String(a.nuc) === String(b.nuc);\n  return !!(a.root && b.root && String(a.root) === String(b.root));\n}\n',
  'function tracingSameCell(a, b){ return UJ.tracing.sameCell(a, b); }\n'),
])

# ── THE TWO IN THE PANEL, which is the file this morning's card is drawn by ────────
edit("core/panel.js", [

 (u"what is traced on this cell is traced on THIS cell",
  u"""      if (typeof organIsOrganelle === "function" && organIsOrganelle(t)) return false;
      return (nid && String(t.nucleusId || "") === String(nid))
          || (root && String(t.rootId || "") === String(root));
    });
    if (!mine.length){ host.innerHTML = ""; return; }""",
  u"""      if (typeof organIsOrganelle === "function" && organIsOrganelle(t)) return false;
      return panelSameCell(t, nid, root);
    });
    /* \u2500\u2500 AND WHAT IS NOT SHOWN IS COUNTED \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-07
       A tracing left out only because its coordinate names another cell is a tracing that used to
       be ON this card. Dropping it in silence would swap one invisible mistake for another, which
       is how this week started. */
    var away = (list || []).filter(function(t){
      if (!t) return false;
      if (typeof organIsOrganelle === "function" && organIsOrganelle(t)) return false;
      return panelElsewhere(t, nid, root);
    }).length;
    if (!mine.length && !away){ host.innerHTML = ""; return; }"""),

 (u"and it says what it is not showing",
  u"""      + \'<p class="hint" style="margin-top:4px">Hand-traced, not from the segmentation. Open one in \'
      + \'\\u00b5Jump\\u2019s tracing card to add to it or correct it.</p>\';""",
  u"""      + \'<p class="hint" style="margin-top:4px">Hand-traced, not from the segmentation. Open one in \'
      + \'\\u00b5Jump\\u2019s tracing card to add to it or correct it.\'
      /* \u2500\u2500 THE REMAINDER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-07
         Until this morning these WERE on this card, wrongly. A filter that removes them without
         saying so swaps a visible mistake for an invisible one, and the invisible kind is what cost
         S\u00f8ren two evenings. */
      + (away ? \' \' + away + \' tracing\' + (away === 1 ? \'\' : \'s\')
                + \' filed at a different cell centre \\u2014 not shown here.\' : \'\')
      + \'</p>\';""" ),

 (u"...and the organelles below it too",
  u"""  var trs = (PANEL_TRACINGS || []).filter(function(t){
    if (!t || !organIsOrganelle(t)) return false;
    return (nid && String(t.nucleusId || "") === String(nid))
        || (root && String(t.rootId || "") === String(root));
  });""",
  u"""  var trs = (PANEL_TRACINGS || []).filter(function(t){
    if (!t || !organIsOrganelle(t)) return false;
    return panelSameCell(t, nid, root);
  });"""),

 (u"through the one definition every file shares",
  u"""function organIsOrganelle(t){""",
  u"""/* \u2500\u2500 WHICH CELL A TRACING IS ON, ASKED OF THE SHARED MODULE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-07
   S\u00f8ren, on cell 61360735's panel: *"it appears to have all the organelles and whole cell
   trace associated with the other cells I have traced."* It did. This file tested
   `nucleusId === nid || rootId === root`, in two places, with no coordinate anywhere \u2014 and his
   vascular cells share root 6198781614, which is the whole reason he traces them by hand. So every
   structure traced on any of them was listed on all of their cards.

   The same test was in core/tracingcard.js five times and core/blenderexport.js once. It is now in
   core/tracing.js once, and this asks it. window.CUR_POS is the cell this panel is showing \u2014
   the VOXEL pill in its own header \u2014 and is what the coordinate is compared against. */
function panelCellHere(nid, root){
  var at = "";
  try { at = (window.CUR_POS && window.CUR_POS.length === 3) ? window.CUR_POS.join(",") : ""; }
  catch (_e){ at = ""; }
  return { nuc: String(nid || ""), root: String(root || ""), at: at };
}
function panelSameCell(t, nid, root){
  try { return UJ.tracing.sameCell(UJ.tracing.cellOf(t), panelCellHere(nid, root)); }
  catch (_e){
    /* A page whose core/tracing.js has not loaded keeps the old behaviour rather than showing
       nothing: wrong is better than blank only when the alternative is blank. */
    return (nid && String(t.nucleusId || "") === String(nid))
        || (root && String(t.rootId || "") === String(root));
  }
}
/* ── WHAT USED TO BE ON THIS CARD, NOT WHAT EXISTS ELSEWHERE ───────  2026-10-07
   The first version of this counted every tracing in the dataset whose coordinate differs from this
   cell's — which, for any cell, is nearly all of them. Søren opened an ηJump card and
   got "7 tracings filed at a different cell centre", a running total of the dataset dressed up as a
   warning, on a card that had never shown any of them.

   The set worth naming is the one the OLD rule would have listed here: a tracing that matches this
   cell by nucleus or root id and whose coordinate says another cell. Those are the ones that were on
   this card yesterday and are not today; everything else was never here. */
function panelElsewhere(t, nid, root){
  try {
    var here = panelCellHere(nid, root);
    var mine = UJ.tracing.cellOf(t);
    var wouldHave = (nid && String(t.nucleusId || "") === String(nid))
                 || (root && String(t.rootId || "") === String(root));
    return !!wouldHave && UJ.tracing.elsewhereByCoord(mine, here);
  } catch (_e){ return false; }
}
function organIsOrganelle(t){"""),
])

# ── AND THE ONE IN THE BLENDER EXPORT ─────────────────────────────
edit("core/blenderexport.js", [
 (u"an export carries this cell's tracings",
  u"""      var mine = cells.some(function(c){
        return (nuc && String(c.nucleus_id || "") === nuc) || (root && String(c.root_id || "") === root);
      });""",
  u"""      /* \u2500\u2500 THROUGH THE ONE DEFINITION \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  2026-10-07
         This was `nuc || root`, with no coordinate \u2014 and S\u00f8ren's vascular cells share one
         root id, so an export of any one of them would have carried every tracing made on all of
         them. core/tracing.js answers it now, coordinate first, for this file and the card and the
         panel alike. */
      var here = UJ.tracing.cellOf(t);
      var mine = cells.some(function(c){ return UJ.tracing.sameCell(here, UJ.tracing.cellOf(c)); });"""),
])

print("\\nNow: the panel and the export")
