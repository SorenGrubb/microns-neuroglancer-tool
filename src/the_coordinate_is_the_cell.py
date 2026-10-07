# -*- coding: utf-8 -*-
u"""The coordinate is the cell.                                                          2026-10-06

Søren, after I proposed repairing his sheet: *"Why would I want to do that? That does not help me.
For these cells I told you the nucleus and rootID are useless, because the vasculature segmentation
is crap. Therefor I am tracing those myself and reporting what cell is there. I want you to fix that
when whole cell meshes and nucleus meshes are traced for a cell that has been newly reported with a
coordinate for the cell center, that is what defines the cell and not the faulty rootID or nucleus
ID."*

HIS ROWS WERE NEVER WRONG. The panel read them wrongly, and it is one line:

    function tracingCellKeyOf(nuc, root, coord){
      return nuc ? "n:" + nuc : (root ? "r:" + root : (coord ? "c:" + coord : ""));
    }

Nucleus first, root second, coordinate LAST. So four structures reported at 427087, 220193, 1940
were filed into cell 394673650's panel purely because they share a junk nucleus id, and the
coordinate -- the one reliable identity for a vascular cell, deliberately reported -- was the last
thing consulted and never reached.

AND IT WAS FOUR LINES, NOT ONE. The same `nuc || root` test, with no coordinate in it at all, is
written out again in tracingBareOf, twice in tracingNextIndex and once in tracingCurrentAll's
sameCell. That is why the second cell's first centriole came back named "Centriole / centrosome 2":
the numbering counted the OTHER cell's centriole as its sibling. Four copies of one decision is how
a rule gets fixed in one place and stays broken in three.

SO THERE IS ONE NOW. tracingSameCell(a, b) -- coordinate, then nucleus, then root -- and every one of
those five places asks it. Exact coordinates, on Søren's instruction: two reported centres 3.7 µm
apart are two cells, not one re-reported.

AND THE GUARD SHIPPED AN HOUR AGO IS WITHDRAWN. tracingCellDisagrees() refused a submission whose
nucleus id and coordinate named different places -- which for a vascular cell is ALWAYS true, so it
would have refused every tracing he is doing now. It becomes a note beside the coordinate box and
never blocks anything. "A guard that refuses correct work is a guard somebody switches off", written
on 4 October and walked into on the 6th.

Check: cellidentitycheck.js (rewritten).
Run: python3 src/the_coordinate_is_the_cell.py
     python3 src/build_stamps.py
     node cellidentitycheck.js
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


ONE = u'''/* ── ONE DEFINITION OF "THE SAME CELL" ────────────────────────  2026-10-06
   Søren: *"the nucleus and rootID are useless, because the vasculature segmentation is crap.
   Therefor I am tracing those myself and reporting what cell is there... a coordinate for the cell
   center, that is what defines the cell and not the faulty rootID or nucleus ID."*

   THE ORDER IS HIS: coordinate, then nucleus, then root. A reported centre is a person saying "this
   is a cell and it is here"; a nucleus id is the segmentation's claim; a root id in vasculature can
   cover a hundred cells at once.

   EXACT, on his instruction. Two reported centres 3.7 µm apart are two cells, not one re-reported
   slightly differently — asked directly, he chose "group on the exact coordinate". So the only
   normalising here is whitespace and rounding, which is formatting rather than tolerance: the box
   shows "427087, 220193, 1940" and the sheet stores "427087,220193,1940", and those are one place.

   THERE WAS ONE OF THESE FOR EVERY CALLER. The same `nuc || root` test, with no coordinate in it at
   all, was written out in tracingBareOf, twice in tracingNextIndex and once in tracingCurrentAll —
   which is why a second cell's first centriole came back named "Centriole / centrosome 2". Five
   copies of one decision is how a rule gets fixed in one place and stays broken in four. */
function tracingCoordKey(v){
  var n = String(v || "").split(/[\\s,;]+/).filter(Boolean).map(Number);
  return (n.length === 3 && n.every(isFinite)) ? n.map(Math.round).join(",") : "";
}
/* A row from any of the three shapes this card holds cells in: the sheet's camelCase, the kept
   list's snake_case, and the card's own boxes. */
function tracingCellOf(x){
  /* ωJump files a tracing with no nucleus as "<volume>:" — a scope, not a cell (2026-09-21). */
  var bare = function(v){ var s = String(v || ""); var i = s.indexOf(":"); return i < 0 ? s : s.slice(i + 1); };
  return { nuc:  bare(x && (x.nucleus_id || x.nucleusId)),
           root: bare(x && (x.root_id || x.rootId)),
           at:   tracingCoordKey(x && (x.cell_coord || x.cellCoord)) };
}
function tracingSameCell(a, b){
  if (!a || !b) return false;
  /* NORMALISED HERE AND NOT ONLY IN tracingCellOf. A caller handing this a raw box value \u2014
     "427087, 220193, 1940" against the sheet's "427087,220193,1940" \u2014 is precisely the drift
     this function exists to end, and it would have reported two cells. Found by the check, which
     asks it directly rather than only through its callers. 2026-10-06. */
  var aa = tracingCoordKey(a.at), bb = tracingCoordKey(b.at);
  if (aa && bb) return aa === bb;
  if (a.nuc && b.nuc) return String(a.nuc) === String(b.nuc);
  return !!(a.root && b.root && String(a.root) === String(b.root));
}
'''

edit("core/tracingcard.js", [

 (u"one definition of the same cell",
  'function tracingCellKeyOf(nuc, root, coord){\n  nuc = String(nuc || ""); root = String(root || ""); coord = String(coord || "");\n  return nuc ? "n:" + nuc : (root ? "r:" + root : (coord ? "c:" + coord : ""));\n}',
  '/* ── ONE DEFINITION OF "THE SAME CELL" ────────────────────────  2026-10-06\n   Søren: *"the nucleus and rootID are useless, because the vasculature segmentation is crap.\n   Therefor I am tracing those myself and reporting what cell is there... a coordinate for the cell\n   center, that is what defines the cell and not the faulty rootID or nucleus ID."*\n\n   THE ORDER IS HIS: coordinate, then nucleus, then root. A reported centre is a person saying "this\n   is a cell and it is here"; a nucleus id is the segmentation\'s claim; a root id in vasculature can\n   cover a hundred cells at once.\n\n   EXACT, on his instruction. Two reported centres 3.7 µm apart are two cells, not one re-reported\n   slightly differently — asked directly, he chose "group on the exact coordinate". So the only\n   normalising here is whitespace and rounding, which is formatting rather than tolerance: the box\n   shows "427087, 220193, 1940" and the sheet stores "427087,220193,1940", and those are one place.\n\n   THERE WAS ONE OF THESE FOR EVERY CALLER. The same `nuc || root` test, with no coordinate in it at\n   all, was written out in tracingBareOf, twice in tracingNextIndex and once in tracingCurrentAll —\n   which is why a second cell\'s first centriole came back named "Centriole / centrosome 2". Five\n   copies of one decision is how a rule gets fixed in one place and stays broken in four. */\nfunction tracingCoordKey(v){\n  var n = String(v || "").split(/[\\s,;]+/).filter(Boolean).map(Number);\n  return (n.length === 3 && n.every(isFinite)) ? n.map(Math.round).join(",") : "";\n}\n/* A row from any of the three shapes this card holds cells in: the sheet\'s camelCase, the kept\n   list\'s snake_case, and the card\'s own boxes. */\nfunction tracingCellOf(x){\n  /* ωJump files a tracing with no nucleus as "<volume>:" — a scope, not a cell (2026-09-21). */\n  var bare = function(v){ var s = String(v || ""); var i = s.indexOf(":"); return i < 0 ? s : s.slice(i + 1); };\n  return { nuc:  bare(x && (x.nucleus_id || x.nucleusId)),\n           root: bare(x && (x.root_id || x.rootId)),\n           at:   tracingCoordKey(x && (x.cell_coord || x.cellCoord)) };\n}\nfunction tracingSameCell(a, b){\n  if (!a || !b) return false;\n  /* NORMALISED HERE AND NOT ONLY IN tracingCellOf. A caller handing this a raw box value —\n     "427087, 220193, 1940" against the sheet\'s "427087,220193,1940" — is precisely the drift\n     this function exists to end, and it would have reported two cells. Found by the check, which\n     asks it directly rather than only through its callers. 2026-10-06. */\n  var aa = tracingCoordKey(a.at), bb = tracingCoordKey(b.at);\n  if (aa && bb) return aa === bb;\n  if (a.nuc && b.nuc) return String(a.nuc) === String(b.nuc);\n  return !!(a.root && b.root && String(a.root) === String(b.root));\n}\n/* ── AND THE KEY EVERY "BY CELL" LIST GROUPS ON ───────────────  2026-10-06\n   This read nucleus, then root, then coordinate — so Søren\'s four structures, reported at\n   427087, 220193, 1940, were filed into cell 394673650\'s panel on the strength of a nucleus id the\n   segmentation had got wrong, and the coordinate he had reported on purpose was never reached. */\nfunction tracingCellKeyOf(nuc, root, coord){\n  nuc = String(nuc || ""); root = String(root || "");\n  var at = tracingCoordKey(coord);\n  return at ? "c:" + at : (nuc ? "n:" + nuc : (root ? "r:" + root : ""));\n}\n'),

 (u"the heading leads with the place",
  u"""  const bits = [];
  if (type && type !== "traced") bits.push("<b>" + escHtml(type) + "</b>");
  if (nuc) bits.push("nucleus " + escHtml(nuc));
  if (root) bits.push("root " + escHtml(root));
  if (coord) bits.push((nuc || root ? "centre " : "cell at ") + escHtml(tracingCoordShow(coord)));""",
  u"""  /* THE PLACE FIRST, since 2026-10-06: it is what the group is keyed on, so it is what tells two
     cells apart in a list. The ids follow as what the segmentation claims. */
  const bits = [];
  if (type && type !== "traced") bits.push("<b>" + escHtml(type) + "</b>");
  if (coord) bits.push("cell at " + escHtml(tracingCoordShow(coord)));
  if (nuc) bits.push("nucleus " + escHtml(nuc));
  if (root) bits.push("root " + escHtml(root));"""),

 (u"the bare list asks the one definition",
  u"""function tracingBareOf(kind, label, nuc, root){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  if (!tracingKindNumbered(wantK)) return [];
  var bare = [], taken = {};
  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");
    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = (nuc && String(t.nucleusId || "") === String(nuc))
                || (root && String(t.rootId || "") === String(root));
    if (!same || !sameCell) return;""",
  u"""function tracingBareOf(kind, label, nuc, root, at){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  if (!tracingKindNumbered(wantK)) return [];
  var here = tracingCellOf({ nucleusId: nuc, rootId: root, cellCoord: at });
  var bare = [], taken = {};
  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");
    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = tracingSameCell(tracingCellOf(t), here);
    if (!same || !sameCell) return;"""),

 (u"and so does the number it is owed",
  u"""function tracingBareNumberFor(id, kind, label, nuc, root){
  var list = tracingBareOf(kind, label, nuc, root), want = String(id || "");""",
  u"""function tracingBareNumberFor(id, kind, label, nuc, root, at){
  var list = tracingBareOf(kind, label, nuc, root, at), want = String(id || "");"""),

 (u"the next number counts siblings of THIS cell",
  u"""function tracingNextIndex(kind, label, nuc, root, skip){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  var top = 0, have = 0, seen = {};""",
  u"""function tracingNextIndex(kind, label, nuc, root, skip, at){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  var here = tracingCellOf({ nucleusId: nuc, rootId: root, cellCoord: at });
  var top = 0, have = 0, seen = {};"""),

 (u"...in the shared list",
  u"""    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = (nuc && String(t.nucleusId || "") === String(nuc))
                || (root && String(t.rootId || "") === String(root));
    if (same && sameCell){""",
  u"""    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = tracingSameCell(tracingCellOf(t), here);
    if (same && sameCell){"""),

 # ANCHORED ON THE LINE ABOVE IT TOO. The first version of this pair was a strict substring of
 # the tracingBareOf replacement -- same two lines, same trailing `return` -- so the generator's
 # own "already there" guard matched the OTHER edit's output and skipped this one in silence,
 # leaving tracingNextIndex's kept-list half still asking `nuc || root`. Caught by grepping for
 # the old text afterwards rather than by trusting the run's own report.
 (u"...and in the kept list",
  u"""    var k = String(t.instance_of || t.kind || "");
    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = (nuc && String(t.nucleus_id || "") === String(nuc))
                || (root && String(t.root_id || "") === String(root));
    if (!same || !sameCell) return;""",
  u"""    var k = String(t.instance_of || t.kind || "");
    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = tracingSameCell(tracingCellOf(t), here);
    if (!same || !sameCell) return;"""),

 (u"the callers hand it the coordinate",
  u"""    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid,[idOf(g)]);""",
  u"""    if(first[k]===undefined)first[k]=tracingNextIndex(g.w.kind,g.w.name,nid,rid,[idOf(g)],
                                                      tracingCellAtVal());"""),

 (u"...and the other one too",
  u"""        index=tracingBareNumberFor(idOf(g),g.w.kind,g.w.name,nid,rid);""",
  u"""        index=tracingBareNumberFor(idOf(g),g.w.kind,g.w.name,nid,rid,tracingCellAtVal());"""),

 (u"the id matcher asks it too",
  u"""      /* ── AND THE ROOT ID IS THE LAST THING ASKED ───────────  2026-10-06
         Søren: *"we can't always trust the root ID, because they are really bad often and
         especially for the vasculature. So, in this case many different cells share the same root
         ID... more important is the cell location."*

         So the order is the order he gave: the nucleus settles it both ways when both have one (the
         2 October rule, unchanged); failing that the LOCATION, which is put at the nucleus centre
         and so is the cell's own place; and only with neither is a shared root id evidence of
         anything. It was root-or-location, which let a root id shared by a hundred vessels outrank
         two coordinates that disagreed. */
      if(here.nuc&&c.nuc) return c.nuc===here.nuc;
      if(here.at&&c.at) return c.at===here.at;
      return !!(here.root&&c.root&&c.root===here.root);""",
  u"""      /* THROUGH THE ONE DEFINITION, since 2026-10-06. This was a fourth copy of it, and on the
         6th it was the only one of the four that had been corrected — which is exactly how a rule
         gets fixed in one place and stays broken everywhere else. */
      return tracingSameCell(c, here);"""),

 (u"the guard stops refusing",
  u"""  {
    const dis = tracingCellDisagrees();
    if (dis){ tracingSay(tracingCellDisagreeSay(dis), true); return []; }
  }""",
  u"""  /* ── AND IT DOES NOT REFUSE ───────────────────────────  2026-10-06
     This refused a submission whose nucleus id and coordinate named different places, for about an
     hour. For a vascular cell — where Søren is tracing precisely BECAUSE the segmentation's
     ids are wrong — that is always true, so it would have refused every tracing he is doing.
     "A guard that refuses correct work is a guard somebody switches off", written on 4 October and
     walked into on the 6th.

     The coordinate decides the cell now, so a stale id is noise rather than a hazard: it is said
     once, beside the box it is about, and nothing is blocked. */
  try { tracingCellNoteShow(); } catch (_eCell){}"""),

 (u"and says it beside the box instead",
  u"""function tracingCellDisagreeSay(d){""",
  u"""/* Beside the coordinate box, which is the thing it is about, and never in the way. */
function tracingCellNoteShow(){
  var el = document.getElementById("tracingAtSay");
  if (!el) return;
  var d = null;
  try { d = tracingCellDisagrees(); } catch (_e){ d = null; }
  if (!d) return;
  el.textContent = "Nucleus " + d.nid + " is " + d.um.toFixed(1) + " \\u00b5m from this coordinate"
    + (d.nearId ? " (the nucleus there is " + d.nearId + ")" : "")
    + " \\u2014 the coordinate is what files this tracing, so this is only worth a look if you "
    + "expected the segmentation to be right here.";
}
function tracingCellDisagreeSay(d){"""),
])
print("\\nNow: python3 src/build_stamps.py, then node cellidentitycheck.js")
