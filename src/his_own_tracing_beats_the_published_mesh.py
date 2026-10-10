# -*- coding: utf-8 -*-
"""His own tracing beats the published mesh.                                          2026-10-10

Søren: *"If there is a whole cell trace then we don't need to add the root ID to the download and
the same with Nucleus id"*

Yesterday the combined 3D model learnt to bring the published root-ID and nucleus-ID meshes with
it, so the organelles sit inside something. But a cell he has traced by hand ALREADY has that
something. Downloading both gives him the same body twice — two surfaces a fraction of a
micrometre apart, z-fighting in the viewport, and a volume that is neither his measurement nor
the consortium's. Worse, it is the published one that looks authoritative while his own is the
one he drew and checked.

So the published mesh is fetched only for a part NOBODY DREW. It is not fetched and then dropped:
the fetch is the slow part (a whole-cell mesh is megabytes), and asking for a mesh in order to
throw it away is the kind of waste that is invisible until the day the network is bad.

The two kinds are already named the same everywhere in this file — tracingGlbParts() stamps
kind "cell" on a Whole cell and "nucleus" on a Nucleus, tracingGlbAlpha() reads those two words
to decide what you can see through, and rank() reads them to decide the order. So "did he trace
this?" is one line over the parts already in hand, not a sixth copy of anything.

And it is SAID. A download quietly missing the cell looks exactly like a download that never had
one, which is the mistake this project has made before.

Changes: core/tracingcard.js  (tracingSegParts takes what is already traced; one helper line)
Check:   glbcheck.js          (new: three cells — both traced, one traced, neither)
Run: python3 src/his_own_tracing_beats_the_published_mesh.py
     python3 src/build_stamps.py
     node glbcheck.js
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
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace(
            "@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── 1. the fetch asks for what is missing, not for everything ─────────────────────────────────
# Two lines inside tracingSegParts, before the two `if (root && …)` / `if (nuc && …)` gates it
# already has. Emptying the id is the whole mechanism: everything downstream — the gate, the
# proposed-id read, the missed[] line — is already conditioned on it, so there is one new idea
# here and no second path.
edit("core/tracingcard.js", [
    (u"tracingSegParts takes what the cell already has traced",
     u'''async function tracingSegParts(g, missed){
  var out = [];
  var root = String((g && g.root) || ""), nuc = String((g && g.nuc) || "");
  if (root && window.UJ && UJ.mesh''',
     u'''async function tracingSegParts(g, missed, have){
  var out = [];
  var root = String((g && g.root) || ""), nuc = String((g && g.nuc) || "");
  /* HIS OWN TRACING WINS. Søren: *"If there is a whole cell trace then we don't need to add the
     root ID to the download and the same with Nucleus id"*. A hand-traced Whole cell and the
     published root-ID mesh are the same body twice; the one he drew is the one he checked. Note
     it is not fetched and discarded — a whole-cell mesh is megabytes, and the cheapest request
     is the one nobody makes. */
  if (have && have.cell) root = "";
  if (have && have.nucleus) nuc = "";
  if (root && window.UJ && UJ.mesh'''),

    (u"and it says which published mesh it left out, and why",
     u'''/* One tracing, on its own. Solid: there is nothing inside it to look through it at. */''',
     u'''/* SAID OUT LOUD. A download quietly missing the cell looks exactly like a download that never
   had one — this project has made that mistake before, so the line names what was left out and
   why, in the same breath as what was saved. */
function tracingSegSkipSay(g, have){
  var out = [];
  if (have && have.cell && g && g.root) out.push("root ID");
  if (have && have.nucleus && g && g.nuc) out.push("nucleus ID");
  if (!out.length) return "";
  return " The published " + out.join(" and ") + " mesh" + (out.length > 1 ? "es are" : " is")
    + " left out: you traced " + (out.length > 1 ? "those" : "that") + " yourself.";
}
/* One tracing, on its own. Solid: there is nothing inside it to look through it at. */'''),

    (u"the combined export tells the fetch what it already has",
     u'''    var missed = [];
    if (btn) btn.textContent = "fetching the cell\\u2026";
    var segs = await tracingSegParts(g, missed);''',
     u'''    var missed = [];
    var have = {};
    parts.forEach(function(q){ have[String(q.kind || "").toLowerCase()] = 1; });
    if (btn) btn.textContent = "fetching the cell\\u2026";
    var segs = await tracingSegParts(g, missed, have);'''),

    (u"...and the status line says so",
     u'''      + (missed.length ? " Could not fetch " + missed.join(", ") + "." : "")
      + tracingFailedSay(got));''',
     u'''      + tracingSegSkipSay(g, have)
      + (missed.length ? " Could not fetch " + missed.join(", ") + "." : "")
      + tracingFailedSay(got));'''),
])

# ── COUNTED, because this file has been bitten three times ────────────────────────────────────
# edit()'s guard is `if new in s` over the WHOLE new block, and a later edit inside an inserted
# block makes that guard stop matching, so the next run inserts a second copy — which in
# JavaScript wins. The symptom is a fix present in the file and absent in the browser.
_C = os.path.join(HERE, "core/tracingcard.js")
_c = io.open(_C, encoding="utf-8").read()
for _what, _n in [(u"async function tracingSegParts(g, missed, have){", 1),
                  (u"function tracingSegSkipSay(g, have){", 1),
                  (u"await tracingSegParts(g, missed, have)", 1),
                  (u"tracingSegSkipSay(g, have)", 2),
                  (u"async function tracingSegParts(", 1),
                  (u"async function tracingCellGlb", 1)]:
    assert _c.count(_what) == _n, "core/tracingcard.js has %d of %s, wanted %d" % (
        _c.count(_what), _what, _n)
# The two lines must come BEFORE the gate that uses them, or they do nothing at all.
_seg = _c.split(u"async function tracingSegParts(g, missed, have){")[1][:1600]
assert _seg.index(u'if (have && have.cell) root = "";') \
     < _seg.index(u"if (root && window.UJ && UJ.mesh"), \
    "tracingSegParts clears the root id after it has already used it"
print("done 1")

# ── 2. the check ──────────────────────────────────────────────────────────────────────────────
CHK = u'''
  /* \\u2500\\u2500 AND HIS OWN TRACING BEATS THE PUBLISHED MESH \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500  2026-10-10
     S\\u00f8ren: *"If there is a whole cell trace then we don\\u2019t need to add the root ID to the
     download and the same with Nucleus id"*

     Right, and for a reason worth writing down: the published root-ID mesh and a hand-traced
     Whole cell are the same body twice. Downloaded together they z-fight, and the volume you
     measure is neither his nor the consortium\\u2019s. The one he drew is the one he checked.

     WHAT IS ASSERTED:
       - a cell with a traced Whole cell and a traced Nucleus gets NEITHER published mesh
       - ...and does not even ASK for them, because a whole-cell mesh is megabytes
       - a cell with only a traced Whole cell still gets the published nucleus
       - a cell with neither still gets both \\u2014 the feature from yesterday is intact
       - and the line says which one was left out, so a missing cell cannot be mistaken for a
         cell that never existed */
  console.log("\\nand his own tracing beats the published mesh");
  const own = await p.evaluate(async () => {
    if (typeof tracingCellGlb !== "function") return { noCard: true };
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    const rings = [sq(400, 401000, 230000, 60), sq(401, 401010, 230010, 60)];
    const asked = [];
    window.UJ.mesh = window.UJ.mesh || {};
    UJ.mesh.fetchCombinedMesh = async function(){
      asked.push("root");
      return { positions: new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,1]),
               indices: new Uint32Array([0,1,2, 0,1,3, 0,2,3, 1,2,3]) };
    };
    window.UJ.nucmesh = window.UJ.nucmesh || {};
    UJ.nucmesh.configured = function(){ return true; };
    UJ.nucmesh.fetchNucleus = async function(){
      asked.push("nucleus");
      return { positions: new Float32Array([0,0,0, 100,0,0, 0,100,0, 0,0,100]),
               indices: new Uint32Array([0,1,2, 0,1,3, 0,2,3, 1,2,3]) };
    };
    window.tracingExtraRootsFor = tracingExtraRootsFor = async function(){ return []; };
    window.tracingProposedNucsFor = tracingProposedNucsFor = async function(){ return []; };
    /* The kinds are the ones tracingGlbParts() stamps: "cell" for a Whole cell, "nucleus" for a
       Nucleus. The same two words tracingGlbAlpha() reads \\u2014 one vocabulary, not a sixth copy. */
    const KIND = { c1: ["Whole cell", "cell"], n1: ["Nucleus", "nucleus"],
                   o1: ["Lysosome 1", "lysosome"] };
    window.tracingFetchCell = tracingFetchCell = async function(sids){
      return sids.map(function(sid){
        const k = KIND[sid] || ["Thing", "lysosome"];
        return { sid: sid, t: { color: "#9c27b0", kind: k[1] },
                 st: { name: k[0], kind: k[1], rings: rings } };
      });
    };
    let got = null, said = "";
    const realGlb = UJ.traceloft.glb, realSay = window.tracingSay;
    UJ.traceloft.glb = function(parts, res){
      got = parts.map(q => q.name); return realGlb(parts, res);
    };
    window.tracingSaveBlob = tracingSaveBlob = function(){};
    window.tracingSay = tracingSay = function(t){ said = String(t || ""); };
    const run = async (sids) => {
      got = null; said = ""; asked.length = 0;
      await tracingCellGlb({ nuc: "405191", root: "864691136051278323",
                             coord: "234624,228032,17512",
                             items: sids.map(s => ({ t: { structureId: s } })) }, null);
      return { names: got || [], said: said, asked: asked.slice() };
    };
    const both = await run(["c1", "n1", "o1"]);
    const cellOnly = await run(["c1", "o1"]);
    const neither = await run(["o1"]);
    UJ.traceloft.glb = realGlb;
    window.tracingSay = tracingSay = realSay;
    return { both: both, cellOnly: cellOnly, neither: neither };
  });
  if (own.noCard) console.log("  (no tracing card on this page)");
  else {
    const n = (c) => (c.names || []).join(" | ");
    ok((own.both.names || []).join(",").indexOf("(segmentation)") < 0,
       "a cell he traced whole, nucleus and all, gets no published mesh at all \\u2014 the body he "
       + "drew and the body the consortium published are the same body, and two surfaces a "
       + "fraction of a micrometre apart z-fight", n(own.both));
    ok((own.both.names || []).indexOf("Whole cell") >= 0
       && (own.both.names || []).indexOf("Nucleus") >= 0,
       "...and keeps his own two, which are the ones he checked", n(own.both));
    ok((own.both.asked || []).length === 0,
       "...and never asked for them: a whole-cell mesh is megabytes, so fetching one in order to "
       + "throw it away is the waste that is invisible until the network is bad",
       (own.both.asked || []).join(", ") || "nothing fetched");
    ok(/root ID and nucleus ID/.test(own.both.said) && /traced those yourself/.test(own.both.said),
       "...and the line says which ones and why \\u2014 a download quietly missing the cell looks "
       + "exactly like a download that never had one", own.both.said.slice(-140));
    ok((own.cellOnly.names || []).indexOf("Cell (segmentation)") < 0
       && (own.cellOnly.names || []).indexOf("Nucleus (segmentation)") >= 0,
       "a cell he traced but whose nucleus he did not still gets the published nucleus \\u2014 the "
       + "two halves are decided separately, because he asked for them separately",
       n(own.cellOnly));
    ok(/published root ID mesh is left out/.test(own.cellOnly.said)
       && own.cellOnly.said.indexOf("nucleus ID") < 0,
       "...and the line names only the one that was left out, not both", own.cellOnly.said.slice(-140));
    ok((own.neither.names || []).indexOf("Cell (segmentation)") >= 0
       && (own.neither.names || []).indexOf("Nucleus (segmentation)") >= 0,
       "and a cell with only an organelle traced still gets both, so yesterday\\u2019s feature is "
       + "intact and this is a narrowing, not a replacement", n(own.neither));
    ok(own.neither.said.indexOf("left out") < 0,
       "...with nothing claimed to be left out, because nothing was", own.neither.said.slice(-90));
  }
'''

OLD_TAIL = u'''
  /* \\u2500\\u2500 AND A FORM THAT NEEDS NO IMPORTER AT ALL \\u2500\\u2500'''
edit("glbcheck.js", [
    (u"the three cells: both traced, one traced, neither",
     OLD_TAIL, CHK + OLD_TAIL),
])
_g = io.open(os.path.join(HERE, "glbcheck.js"), encoding="utf-8").read()
assert _g.count(u"const own = await p.evaluate") == 1, "glbcheck.js has two of the new block"
print("done 2")

# ── 3. the older generator's own assertion, which this change invalidates ─────────────────────
# src/a_tracing_you_can_open_in_blender.py asserts the call site reads exactly
# "tracingSegParts(g, missed)". It now reads "tracingSegParts(g, missed, have)". The assertion was
# checking that tracingCellGlb fetches the segmentation at all, which is still worth checking, so
# it is narrowed to the part that is the point rather than deleted.
edit("src/a_tracing_you_can_open_in_blender.py", [
    (u"the older generator allows the third argument",
     u'''assert u"tracingSegParts(g, missed)" in _c.split(u"async function tracingCellGlb")[1][:1400], \\''',
     u'''assert u"tracingSegParts(g, missed" in _c.split(u"async function tracingCellGlb")[1][:1600], \\'''),
])
print("done 3")
print("all applied")
