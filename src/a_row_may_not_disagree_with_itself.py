# -*- coding: utf-8 -*-
u"""A row may not disagree with itself about which cell it is.                           2026-10-06

Søren: *"now it mixed two different tracings completely.... WE NEED TO FIX THIS!"*

FOUR STRUCTURES FILED UNDER A CELL 125 MICROMETRES AWAY. `nucleus_1791311494766_j6b2` and three
others carry nucleusId 394673650 and rootId 6475165144, whose own centre is 402334, 232283, 479 --
while their own cellCoord, and their contours, are at 427087, 220193, 1940. Cell 394673650's panel
then showed two whole cells, two nuclei, two centrioles and two cilia: four structures from another
cell, filed under it.

THE COORDINATE WAS RIGHT THE WHOLE TIME. So a test asking "are the contours near the cell
coordinate?" would have passed every one of them. What is wrong is that the row disagrees WITH
ITSELF: its coordinate says one place and its nucleus id names a cell a hundred micrometres from
there. Two expressions of one fact, drifted apart -- which is the shape of every fault this week.

AND THE ROOT ID IS NOT THE THING TO ASK. Søren: *"in h01 we can't always trust the root ID, because
they are really bad often and especially for the vasculature. So, in this case many different cells
share the same root ID... We can count on the traces for cell nucleus and whole cell mesh... But,
more important is the cell location, which is put as close to the nucleus center as possible."* So
the guard leans on the LOCATION, the nucleus id second, and never on the root id; and sameCell now
ranks them in that order too, where it used to let a shared root id outrank a coordinate.

FOUR CHANGES:

  1. tracingCellDisagrees() -- the named nucleus's own centre against the coordinate in the box,
     through window.tracingNucCentroid, which µJump defines. More than 25 µm apart and they are not
     the same cell: a cell coordinate is PUT at the nucleus centre, so a few µm is slack and a
     hundred is a different cell. Where the page cannot answer it says so by returning nothing,
     which is the honest answer rather than a guess.

  2. tracingCurrentAll() refuses on it, naming the cell the coordinate is actually at.

  3. Opening a tracing in the pad decides the three cell fields TOGETHER. It was three independent
     `if`s -- nucleus id, root id, coordinate, three sources and nothing requiring them to agree --
     so a tracing carrying a coordinate and no nucleus id moved the coordinate to its cell and left
     the ids on the last one. Now a coordinate that arrives without ids CLEARS them.

  4. Changing the coordinate by hand re-derives the ids from the cell at that location, out loud,
     rather than leaving them naming the cell you have just left.

Check: cellidentitycheck.js (new).
Run: python3 src/a_row_may_not_disagree_with_itself.py
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


GUARD = u'''/* ── A ROW MAY NOT DISAGREE WITH ITSELF ABOUT WHICH CELL IT IS ──────  2026-10-06
   Søren, four structures filed under a cell 125 µm from where they were drawn: *"now it mixed
   two different tracings completely."*

   THE COORDINATE WAS RIGHT. 427087, 220193, 1940 is where those contours are. The nucleus id was
   394673650, whose own centre is 402334, 232283, 479. So "are the contours near the cell
   coordinate?" would have passed all four; what is wrong is that the row names two different places
   at once.

   LOCATION FIRST, NUCLEUS SECOND, ROOT NEVER. Søren: *"we can't always trust the root ID...
   many different cells share the same root ID... more important is the cell location, which is put
   as close to the nucleus center as possible."* A cell coordinate is PUT at the nucleus centre, so
   25 µm is generous slack for one typed by hand and nowhere near a hundred.

   IT RETURNS NOTHING WHEN THE PAGE CANNOT ANSWER -- ωJump has no nucleus table, and a cell
   nobody has named has no centre to be far from. A guard that guesses is worse than one that is
   quiet, and this one has to be right every time or it will be switched off. */
var TRACING_CELL_FAR_UM = 25;
function tracingCellDisagrees(){
  try {
    var nid = (document.getElementById("tracingNucId") || {}).value;
    nid = String(nid || "").trim();
    var at = tracingCellAtVal();
    if (!nid || !at) return null;
    if (typeof window.tracingNucCentroid !== "function") return null;
    var nc = window.tracingNucCentroid(nid);
    if (!nc || !isFinite(nc.xVox)) return null;
    var c = at.split(",").map(Number);
    if (c.length !== 3 || !c.every(isFinite)) return null;
    var res = (UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    var dx = (c[0] - nc.xVox) * res[0], dy = (c[1] - nc.yVox) * res[1],
        dz = (c[2] - nc.zVox) * res[2];
    var um = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;
    if (!(um > TRACING_CELL_FAR_UM)) return null;
    /* WHICH CELL IT REALLY IS, when the page can say. The same reader the coordinate box is filled
       from, so the answer offered here is the answer that box would have given. */
    var near = null;
    try { near = tracingNearestCell(c); } catch (_e){ near = null; }
    return { um: um, nid: nid, at: at,
             nearId: (near && near.nucleusId) ? String(near.nucleusId) : "",
             nearUm: near ? (near.distNm / 1000) : 0 };
  } catch (_e){ return null; }
}
function tracingCellDisagreeSay(d){
  return "These contours are filed at " + tracingCoordShow(d.at) + ", and nucleus " + d.nid
    + " is " + d.um.toFixed(1) + " \\u00b5m from there \\u2014 they are two different cells, so "
    + "nothing has been added."
    + (d.nearId
        ? " The cell at that coordinate is nucleus " + d.nearId + ", "
          + d.nearUm.toFixed(1) + " \\u00b5m away. Put that in the nucleus box, or clear the box and "
          + "the coordinate and read them again."
        : " Clear the nucleus and cell-centre boxes and read them again from the coordinate.");
}
'''

edit("core/tracingcard.js", [

 (u"the guard exists",
  u"""function tracingCurrentAll(){""",
  GUARD + u"""function tracingCurrentAll(){"""),

 (u"and the submission refuses on it",
  u"""  const nid=(document.getElementById("tracingNucId").value||"").trim();
  const rid=(document.getElementById("tracingRootId").value||"").trim();
  const type=document.getElementById("tracingType").value||"traced";""",
  u"""  const nid=(document.getElementById("tracingNucId").value||"").trim();
  const rid=(document.getElementById("tracingRootId").value||"").trim();
  const type=document.getElementById("tracingType").value||"traced";
  /* ── BEFORE ANYTHING IS BUILT ─────────────────────────────  2026-10-06
     Here rather than at the button, because the Neuroglancer link goes through this function too and
     a link naming the wrong cell is a quieter version of the same mistake. */
  {
    const dis = tracingCellDisagrees();
    if (dis){ tracingSay(tracingCellDisagreeSay(dis), true); return []; }
  }"""),

 (u"opening one decides the three cell fields together",
  u"""    if (st.nucleusId) document.getElementById("tracingNucId").value = st.nucleusId;
    if (st.rootId) document.getElementById("tracingRootId").value = st.rootId;
    { const ca = document.getElementById("tracingCellAt"), cc = st.cellCoord || t.cellCoord;
      if (ca && cc) ca.value = tracingCoordShow(cc); }""",
  u"""    /* ── ONE DECISION, NOT THREE ─────────────────────────  2026-10-06
       This was three independent `if`s — nucleus id, root id, coordinate, three sources with
       nothing requiring them to agree. A tracing carrying a coordinate and no nucleus id moved the
       coordinate to ITS cell and left the two ids naming the last one, which is a row that
       disagrees with itself before a single contour is drawn.

       The three fields are one fact: which cell this is. They arrive together or the ones that did
       not arrive are CLEARED, because an empty box is a question and a stale box is a wrong
       answer. */
    {
      const nucBox = document.getElementById("tracingNucId");
      const rootBox = document.getElementById("tracingRootId");
      const ca = document.getElementById("tracingCellAt");
      const cc = st.cellCoord || t.cellCoord;
      if (nucBox) nucBox.value = st.nucleusId || "";
      if (rootBox) rootBox.value = st.rootId || "";
      if (ca) ca.value = cc ? tracingCoordShow(cc) : "";
    }"""),

 (u"a coordinate typed by hand re-derives the ids",
  u"""  /* Typing an id in by hand suggests the type too -- the ids are not only ever filled by the
     coordinate read, and somebody who knows the cell should not have to open the pad to get it. */""",
  u"""  /* ── MOVE THE COORDINATE AND THE IDS FOLLOW ───────────────────  2026-10-06
     Søren, asked what the boxes should do when the cell changes: *"Clear them when the cell
     changes."* They used to keep whatever was in them -- "never over something typed", which is
     right for a typo and wrong for a different cell, and is how four structures came to be filed
     under a cell 125 µm from where they were drawn.

     ONLY WHEN THE CELL REALLY CHANGED: the nearest nucleus to the new coordinate has to BE a
     different one. Nudging a coordinate a micrometre within the same cell leaves everything alone,
     and a page with no nucleus table says nothing and changes nothing. */
  (function(){
    const at = document.getElementById("tracingCellAt");
    if (!at) return;
    at.addEventListener("change", function(){
      const v = tracingCellAtVal();
      if (!v) return;
      let c = null;
      try { c = tracingNearestCell(v.split(",").map(Number)); } catch (_e){ return; }
      if (!c || !c.nucleusId) return;
      const nucEl = document.getElementById("tracingNucId");
      const rootEl = document.getElementById("tracingRootId");
      const had = nucEl ? String(nucEl.value || "").trim() : "";
      if (had === String(c.nucleusId)) return;
      if (nucEl) nucEl.value = String(c.nucleusId);
      /* THE ROOT ID IS NOT CARRIED OVER. S\\u00f8ren: *"we can't always trust the root ID... many
         different cells share the same root ID."* One belonging to the cell you have left is worse
         than none, and an empty box is read again from the coordinate. */
      if (rootEl) rootEl.value = "";
      try { tracingSuggestType(); } catch (_e){}
      tracingSay(had
        ? "That coordinate is in a different cell \\u2014 nucleus " + c.nucleusId + ", "
          + (c.distNm / 1000).toFixed(1) + " \\u00b5m away. The nucleus box now says so and the "
          + "fragment box is cleared; read it again if you need it."
        : "Nucleus " + c.nucleusId + " is " + (c.distNm / 1000).toFixed(1)
          + " \\u00b5m from that coordinate, and is filled in below.");
    });
  })();
  /* Typing an id in by hand suggests the type too -- the ids are not only ever filled by the
     coordinate read, and somebody who knows the cell should not have to open the pad to get it. */"""),

 (u"a coordinate outranks a shared root id",
  u"""      if(here.nuc&&c.nuc) return c.nuc===here.nuc;
      return !!((here.root&&c.root&&c.root===here.root)
              ||(here.at&&c.at&&c.at===here.at));""",
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
      return !!(here.root&&c.root&&c.root===here.root);"""),
])
print("\\nNow: python3 src/build_stamps.py, then node cellidentitycheck.js")
