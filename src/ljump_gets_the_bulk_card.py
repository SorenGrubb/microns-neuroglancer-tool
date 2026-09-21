# -*- coding: utf-8 -*-
u"""λJump gets the bulk organelle card: a marker goes to the nearest nucleus, and you confirm it.  2026-09-21

Søren: "Let's build the ljump cell nucleus marker."

Why λJump was left out on 2026-09-21 (bulk-annotation-on-every-tool): Lee16 is image only, and
"nearest-centroid would put a dendrite's organelle in a stranger's cell". Both still true, and the
answer ωJump found the same day for its volumes without a segmentation is the answer here: the
nearest nucleus is EVIDENCE, not proof. So a row comes back unticked with the distance on it, and
you tick the ones that are right; a marker nearly as close to a second nucleus is "too close to
call" and cannot be ticked at all; beyond 10 µm there is no candidate.

What changes:

  core/bulkorgan.js
    - bulkOrganNearest(point, o): rung 3b's arithmetic, once. It was written for ωJump inside its
      host this morning; λJump is the second user, so it moves into core rather than being copied,
      and ωJump's host calls it too (wjump-build/src/wjump_uses_the_core_nearest.py).
    - UJ.cfg.bulk.intro: the card's first paragraph for a host whose cells are not found by a
      segmentation. The default says "Each marker is looked up in the segmentation", which would be
      untrue here.
    - the status line names what is being read: "the segmentation" only where there is one.

  ljump.html
    - the card, where the other tools have it: above the tracing card;
    - UJ.cfg.bulk: the cell table (BX/BY/BZ, BID -- detected and added cells alike, which is what
      λJump's own identifications file under), the nearest nucleus within 10 µm, and the intro;
    - core/bulkorgan.js, after the modules it reads (organelles, segread, ontology).

Run: python3 src/ljump_gets_the_bulk_card.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)


print("core/bulkorgan.js")
edit("core/bulkorgan.js", [
 (u"the contract names the two new settings",
  u'''       afterSubmit:    (sent) -> what postReport returned for each row       (off)   2026-09-21
     }''',
  u'''       afterSubmit:    (sent) -> what postReport returned for each row       (off)   2026-09-21
       intro:          "html" -> the card's first paragraph, for a host whose cells are not
                       found by a segmentation                               (off)   2026-09-21
     }
   bulkOrganNearest(point, o) is rung 3b's arithmetic for a host whose cells are points -- see it.''',
 ),
 (u"the nearest nucleus, once",
  u'''/* Empty the card: rows, table, messages and the pasted link.''',
  u'''/* ── THE NEAREST CELL, for a host whose cells are POINTS ─────────────────────────  2026-09-21
   Rung 3b's arithmetic, written once: ωJump (found nuclei) and λJump (Lee16's nucleus table) both
   answer cellNear with it. o = { n, posOf(i) -> voxel | null, res, nearUm, tooClose, name(i) }.

   Distances in nanometres through the page's own voxel size. Nothing beyond nearUm is offered. A
   second cell within tooClose x the nearest one's distance makes the call a coin toss, and the row
   names both rather than picking -- and that second cell is NOT capped at nearUm: a neighbour just
   outside the radius competes exactly as much as one just inside it. */
function bulkOrganNearest(p, o){
  var r = o.res || [1, 1, 1], best = -1, d1 = Infinity, ds = [];
  for (var i = 0; i < o.n; i++){
    var v = o.posOf(i);
    if (!v){ ds.push(Infinity); continue; }
    var d = Math.sqrt(Math.pow((p[0] - v[0]) * r[0], 2) + Math.pow((p[1] - v[1]) * r[1], 2)
                    + Math.pow((p[2] - v[2]) * r[2], 2));
    ds.push(d);
    if (d < d1){ d1 = d; best = i; }
  }
  if (best < 0 || d1 > o.nearUm * 1000)
    return { i: -1, why: "no nucleus found within " + o.nearUm + " \\u00b5m of this marker" };
  var others = [];
  for (var k = 0; k < ds.length; k++)
    if (k !== best && ds[k] <= d1 * o.tooClose) others.push(o.name ? o.name(k) : String(k));
  return { i: best, distNm: d1, others: others };
}

/* Empty the card: rows, table, messages and the pasted link.'''),
 (u"the intro, for a host with no segmentation",
  u'''function bulkOrganMount(){
  var w = document.getElementById("bulkOrganCard");
  if (!w) return false;
  if (!w.firstElementChild) w.innerHTML = bulkOrganHtml();''',
  u'''function bulkOrganMount(){
  var w = document.getElementById("bulkOrganCard");
  if (!w) return false;
  if (!w.firstElementChild){
    w.innerHTML = bulkOrganHtml();
    /* The default paragraph says each marker is looked up in the segmentation. A host whose cells
       are found another way says how, rather than letting the card say something untrue. */
    if (bulkCfg().intro){ var h = w.querySelector("p.hint"); if (h) h.innerHTML = bulkCfg().intro; }
  }'''),
 (u"the status names what is read",
  u'''  bulkOrganSetStatus("Reading the segmentation for "+built.rows.length+" marker"''',
  u'''  /* "the segmentation" only where there is one: λJump reads a table of nucleus positions. */
  const readWhat=(bulkSources().seg||bulkSources().nuc)?"the segmentation":"the nearest nucleus";
  bulkOrganSetStatus("Reading "+readWhat+" for "+built.rows.length+" marker"'''),
 (u"...and in its progress",
  u'''    bulkOrganSetStatus("Reading the segmentation \\u2014 "+n+" of "+total+"\\u2026");''',
  u'''    bulkOrganSetStatus("Reading "+readWhat+" \\u2014 "+n+" of "+total+"\\u2026");'''),
])

CARD = u'''<!-- ── BULK ORGANELLE ANNOTATION ─────────────────────────────────────  2026-09-21
     One paste of markers, one structure type, as many cells as you marked -- the card the other
     tools have, in the same place. Lee16 has no segmentation, so a marker goes to the NEAREST
     NUCLEUS in this page's table, offered unticked with its distance for you to confirm.
     core/bulkorgan.js fills it; UJ.cfg.bulk below says what a cell is here. -->
<div class="card" id="bulkOrganCard"></div>
'''
TRACE_ANCHOR = u'''     EMPTY ON PURPOSE. core/tracingcard.js fills it on load: where the card sits is this page's
     decision, what is inside it is the module's. -->
<div class="card" id="tracingCard"></div>
'''
# The comment above the tracing card belongs to it, so the bulk card goes before that comment.
TRACE_COMMENT = u'''<!-- ── TRACE A CELL THIS DATASET HAS NO SEGMENTATION FOR ─────────────  2026-09-20'''

CFG = u'''<script>
/* THE BULK CARD'S CELLS, 2026-09-21. Lee16 is image only, so a marker is matched to the nearest
   nucleus in this page's table -- detected and added cells alike, filed under BID, which is what
   λJump's own identifications use -- within 10 µm, and offered UNTICKED with the distance: a
   dendrite's mitochondrion can sit nearer a stranger's nucleus than its own, and only the person
   who marked it can tell. A second nucleus within 1.5x the distance makes it "too close to call". */
UJ.cfg.bulk = {
  sources: function(){ return { seg: "", nuc: "", res: UJ.cfg.res }; },
  indexOfRoot:    function(){ return -1; },
  indexOfNucleus: function(){ return -1; },
  cellNear: function(p){
    return Promise.resolve(bulkOrganNearest(p, {
      n: N, res: UJ.cfg.res, nearUm: 10, tooClose: 1.5,
      posOf: function(i){ return [BX[i], BY[i], BZ[i]]; },
      name:  function(i){ return UJ.cfg.bulk.name(i); } }));
  },
  nucIdOf: function(i){ return String(BID[i]); },
  coordOf: function(i){ return [BX[i], BY[i], BZ[i]].join(","); },
  name:    function(i){ var t = ljumpIdentityOf(i);
    return (BADDED[i] ? "added cell " : "nucleus ") + BID[i] + (t ? " (" + t + ")" : ""); },
  label:   function(i){ var t = ljumpIdentityOf(i);
    return (BADDED[i] ? "Added cell " : "Nucleus ") + escHtml(String(BID[i])) + " &middot; "
      + (t ? escHtml(t) : "<span class='hint'>not named yet</span>"); },
  groupByRow: true,
  intro: "Mark the same kind of structure in as many cells as you like in Neuroglancer &mdash; a "
       + "point, or a <b>line</b> for anything with two ends like a cilium or an NR type II &mdash; "
       + "then paste the whole address bar here. Lee16 has no segmentation, so each marker is "
       + "matched to the <b>nearest nucleus</b> within 10&nbsp;&micro;m and offered <b>unticked</b>, "
       + "with the distance: tick the ones that are in that nucleus&rsquo;s cell. A marker nearly as "
       + "close to two nuclei cannot be ticked."
};
</script>
<script src="core/bulkorgan.js"></script>
'''

print("ljump.html")
edit("ljump.html", [
 (u"the card, above the tracing card", TRACE_COMMENT, CARD + TRACE_COMMENT),
 (u"what a cell is here, and the module",
  u'''<script src="core/ontology.js"></script>
''',
  u'''<script src="core/ontology.js"></script>
''' + CFG),
])
