"""What has been traced on this cell, on the cell's own panel.                       2026-09-17

Søren: *"...when publishing they should have different numbers, also when shown on the cell
identity page."*

The numbers were the easy half. The second clause is the one that makes them worth having: a number
is only useful where the things it distinguishes are listed together, and until now the cell panel
knew nothing about tracings at all. So the panel gains a block -- **Traced on this cell** -- listing
every hand-traced structure filed against the nucleus or root id on screen, in its own colour, with
its number, its volume and who drew it.

WHY IT LIVES IN core/panel.js. That file IS the cell identity panel, and it is shared: µJump, δJump,
πJump, βJump and ηJump all render their cell through it. Putting the block here gives it to every
tool at once and, more to the point, keeps it beside loadCommunityReports() -- the other block that
answers "what do we know about this cell that is not in the segmentation". A page edit would have
given it to one tool and left the others to be remembered later.

IT INSTALLS ITS OWN CONTAINER, the way core/mesh3d.js installs its button: a div inserted after
#commReports if it is not already there. No tool's markup has to change, so no tool's markup can be
forgotten.

THE INDEX IS CHEAP AND IS CACHED ANYWAY. ?tracings=1 is one sheet scan and opens no Drive files --
that is the whole reason the geometry was moved out of the sheet -- but the panel re-renders on
every cell, so a minute's cache keeps it to one request per burst of clicking. Failure is silent and
leaves nothing behind: a cell with no tracings and a backend that is not deployed look the same from
here, which is correct, because in both cases there is nothing to show.

Run: python3 src/traced_structures_on_the_cell_panel.py
     node tracingpanelcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PANEL = [
    ("""function loadCommunityReports(nid,cellPos){
  const el=document.getElementById("commReports");
  if(!el)return;
  el.innerHTML="";
  if(!REPORT_ENDPOINT||!nid)return;""",
     """/* ── WHAT HAS BEEN TRACED ON THIS CELL ─────────────────────────────────────────  2026-09-17
   Søren, asking for organelle numbers: *"...also when shown on the cell identity page."*

   A number distinguishes things only where they are listed together, so this is where the numbers
   earn their keep: every hand-traced structure filed against this cell, in its own colour, with its
   number, its volume and who drew it.

   MATCHED BY EITHER ID. A tracing carries the nucleus id and the root id it was drawn on, and which
   of them is known depends on where the tracer started -- a coordinate inside a process reads a root
   id and nothing in the nucleus volume. Matching on either is the only way to find both.

   NOTHING HERE FETCHES GEOMETRY. The index says the name, the number, the size and the link; the
   contours stay in Drive until somebody opens one in the pad. */
var PANEL_TRACINGS = null, PANEL_TRACINGS_AT = 0;
function tracedOnCellBox(){
  var host = document.getElementById("tracedOnCell");
  if (host) return host;
  var after = document.getElementById("commReports");
  if (!after || !after.parentNode) return null;
  host = document.createElement("div");
  host.id = "tracedOnCell";
  host.style.marginTop = "10px";
  after.parentNode.insertBefore(host, after.nextSibling);
  return host;
}
function loadTracedStructures(nid, root){
  var host = tracedOnCellBox();
  if (!host) return;
  host.innerHTML = "";
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return;
  if (!nid && !root) return;
  var render = function(list){
    var mine = (list || []).filter(function(t){
      if (!t) return false;
      return (nid && String(t.nucleusId || "") === String(nid))
          || (root && String(t.rootId || "") === String(root));
    });
    if (!mine.length){ host.innerHTML = ""; return; }
    /* By kind, then by number: the point of a number is that 1, 2 and 3 of a kind read as a set. */
    mine.sort(function(a, b){
      var ka = String(a.instanceOf || a.kind || ""), kb = String(b.instanceOf || b.kind || "");
      if (ka !== kb) return ka < kb ? -1 : 1;
      return (Number(a.instanceIndex) || 0) - (Number(b.instanceIndex) || 0);
    });
    var vol = function(v){
      if (!(Number(v) > 0)) return "";
      var n = Number(v);
      return " \\u00b7 " + (n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(4))
           + " \\u00b5m\\u00b3";
    };
    host.innerHTML = '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;'
      + 'color:var(--mut);font-weight:600;margin-bottom:4px">Traced on this cell</div>'
      + mine.map(function(t){
          var who = (t.contributors && t.contributors.length) ? t.contributors.join(", ")
                                                              : (t.tracedBy || "");
          return '<div style="display:flex;align-items:center;gap:8px;font-size:12px;'
            + 'border-top:1px solid var(--line);padding:4px 0;flex-wrap:wrap">'
            + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:'
              + panelEsc(t.color || "#3a6b5a") + '"></span>'
            + '<span style="flex:1 1 140px;min-width:0"><b>' + panelEsc(t.name || t.structureId)
              + '</b>' + panelEsc(vol(t.volumeUm3)) + '</span>'
            + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"
              + ((t.contours === 1) ? "" : "s") + " on " + (t.sections || 0) + " section"
              + ((t.sections === 1) ? "" : "s") + '</span>'
            + '<span style="opacity:.7;flex:1 1 100px;min-width:0">' + panelEsc(who) + '</span>'
            + (t.fileUrl ? ' <a href="' + panelEsc(t.fileUrl) + '" target="_blank" rel="noopener" '
                + 'style="opacity:.7">file</a>' : "")
            + '</div>';
        }).join("")
      + '<p class="hint" style="margin-top:4px">Hand-traced, not from the segmentation. Open one in '
      + '\\u00b5Jump\\u2019s tracing card to add to it or correct it.</p>';
  };
  if (PANEL_TRACINGS && Date.now() - PANEL_TRACINGS_AT < 60000){ render(PANEL_TRACINGS); return; }
  fetch(REPORT_ENDPOINT + "?tracings=1" + (typeof panelDsQS === "function" ? panelDsQS() : ""))
    .then(function(r){ return r.json(); })
    .then(function(d){
      PANEL_TRACINGS = (d && d.tracings) || [];
      PANEL_TRACINGS_AT = Date.now();
      render(PANEL_TRACINGS);
    })
    /* Silently. A cell with no tracings and a backend that does not answer this question yet look
       the same from here, and they should: in both cases there is nothing to show. */
    .catch(function(){});
}
function panelEsc(s){ return String(s == null ? "" : s)
  .replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

function loadCommunityReports(nid,cellPos){
  const el=document.getElementById("commReports");
  if(!el)return;
  el.innerHTML="";
  /* Before the guard below, and independent of the community fetch: the two blocks answer different
     questions and one being unavailable is no reason to hide the other. */
  try { loadTracedStructures(nid, (typeof CUR_ROOT !== "undefined" && CUR_ROOT) || ""); }
  catch (_e){}
  if(!REPORT_ENDPOINT||!nid)return;""",
     "the cell panel lists what has been traced on this cell"),
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


edit("core/panel.js", PANEL)
print("\nnow: node tracingpanelcheck.js && node organcardcheck.js")
