# -*- coding: utf-8 -*-
u"""core/tracingcard.js, stage F: βJump loads it.                                2026-09-21

The fourth tool on the shared card. Needs src/a_bucket_without_cors_is_read_through_the_json_api.py
and src/bjump_gets_the_em_in_the_page.py first.

── WHAT βJUMP HAS THAT NEITHER λJUMP NOR δJUMP HAD ─────────────────────────────

A SEGMENTATION segread CAN READ. `segmentation_secgan_16nm` is uint64, compressed_segmentation,
sharded with an identity hash — read from its info through the JSON API on 2026-09-21 — which is
the format core/segread.js was written for on µJump. And its ids ARE the cells: BSEG, the segment
column of this page's own table, comes from the same volume. So on βJump, and only here besides
µJump:

  - opening the pad at a coordinate fills the root ID box with the cell that is there;
  - the pad's "show the segmentation" tick stays, and paints that cell in magenta;
  - with a root id in the box, the 3D preview can draw the cell see-through around a tracing.

The volume covers only about half of the imaged block (the page's own hasMesh() note), which is
what the card's intro now says: here a cell the segmentation does not have is an ordinary thing.

NO NUCLEUS VOLUME. βJump's nuclei are Hoechst blob detections kept in the page, not a segmentation
anything can read. `sources` passes no `nuc`, and three places that assumed one — all in shared
files, all silent on every page before this one — are fixed below.

── THREE THINGS THE SHARED CARD ASSUMED, AND βJUMP IS WHERE THEY STOP BEING TRUE ─────────

1. **The cell ghost looked for a page global called `MeshDL`.** µJump and δJump define it —
   `const MeshDL = UJ.mesh;` — and βJump calls core/mesh.js by its own name, `UJ.mesh`. So the
   see-through cell could never load here, AND yesterday's note would then have said "no cell or
   nucleus ID in the boxes above" with a root id sitting in the box. The card now asks for
   `UJ.mesh` first — which IS MeshDL on the two pages that alias it — and the global second.

2. **The nucleus ghost and the pad's paint read a nucleus volume every page was assumed to have.**
   On βJump the nucleus box holds a Hoechst blob number, and handing it to a reader configured with
   no volume fetched `"" + "/info"` — grubblab's own 404 page — which is the exact fault fixed in
   segread yesterday, one module over. Both now skip the nucleus when the dataset names none, and
   core/segpaint.js skips a layer whose volume is not configured, so it cannot be asked again.

3. **"This dataset has no … volume to read" was appended whether or not the box was empty.** On
   βJump the nucleus box is always filled from the cell, so that sentence would have followed every
   coordinate. It is said now only for a box this call left empty, which is the only case it
   explains anything.

Run: python3 src/tracingcard_stage_f_bjump.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)


# ══ core/tracingcard.js ═══════════════════════════════════════════════════════════════════════
GHOST_OLD = u'''  if (ids.root && ids.root !== "0" && typeof MeshDL !== "undefined" && MeshDL.fetchCombinedMesh){
    try {
      const m = await MeshDL.fetchCombinedMesh(ids.root, function(f, msg){'''
GHOST_NEW = u'''  /* core/mesh.js BY ITS OWN NAME FIRST.  2026-09-21. This looked only for a page global `MeshDL`,
     which µJump and δJump define as `const MeshDL = UJ.mesh;` and βJump never has — it calls the
     module UJ.mesh throughout. So the see-through cell could never load on βJump, and the note
     below would then have said there was no ID in a box that had one. */
  const MESH = (window.UJ && UJ.mesh && UJ.mesh.fetchCombinedMesh) ? UJ.mesh
             : ((typeof MeshDL !== "undefined" && MeshDL && MeshDL.fetchCombinedMesh) ? MeshDL : null);
  if (ids.root && ids.root !== "0" && MESH){
    try {
      const m = await MESH.fetchCombinedMesh(ids.root, function(f, msg){'''

NUCG_OLD = u'''  if (ids.nuc && UJ.nucmesh){'''
NUCG_NEW = u'''  /* Only where the dataset HAS a nucleus volume. On βJump the box holds a Hoechst blob number,
     and a reader configured with no volume fetches the host's own 404 page as "/info". */
  if (ids.nuc && UJ.nucmesh && tracingSources().nuc){'''

PADSEG_OLD = u'''  const root = (document.getElementById("tracingRootId").value || "").trim();
  const nuc = (document.getElementById("tracingNucId").value || "").trim();
  if (!root && !nuc){
    padSegSay("Nothing to paint'''
PADSEG_NEW = u'''  /* Each id only where the dataset has the volume to paint it from, 2026-09-21 — on βJump the
     nucleus box holds a Hoechst blob number and there is no nucleus segmentation behind it. */
  const SRCS = tracingSources();
  const root = SRCS.seg ? (document.getElementById("tracingRootId").value || "").trim() : "";
  const nuc = SRCS.nuc ? (document.getElementById("tracingNucId").value || "").trim() : "";
  if (!root && !nuc){
    padSegSay("Nothing to paint'''

MISSED_OLD = u'''    const missed=[];
    if(/no flat cell segmentation|could not be read/.test(r.why||"")) missed.push(r.why);
    if(/no nucleus volume|could not be read/.test(r.nucWhy||"")) missed.push(r.nucWhy);'''
MISSED_NEW = u'''    /* Only for a box this left EMPTY, 2026-09-21: on βJump the nucleus box is always filled from
       the cell, and "no nucleus volume" after every coordinate would explain nothing. */
    const missed=[];
    if(/no flat cell segmentation|could not be read/.test(r.why||"")&&!rootEl.value.trim())
      missed.push(r.why);
    if(/no nucleus volume|could not be read/.test(r.nucWhy||"")&&!nucEl.value.trim())
      missed.push(r.nucWhy);'''

print("core/tracingcard.js")
edit("core/tracingcard.js", [
    (u"the cell ghost asks for core/mesh.js by its own name", GHOST_OLD, GHOST_NEW),
    (u"...the nucleus ghost only where there is a nucleus volume", NUCG_OLD, NUCG_NEW),
    (u"...and so does the pad's segmentation paint", PADSEG_OLD, PADSEG_NEW),
    (u"...and a missing volume is mentioned only for a box left empty", MISSED_OLD, MISSED_NEW),
])


# ══ core/segpaint.js ══════════════════════════════════════════════════════════════════════════
SP_OLD = u'''    var root = idPair(o.root), nuc = idPair(o.nuc);'''
SP_NEW = u'''    /* A layer whose volume is not configured is skipped, not fetched.  2026-09-21. An empty
       source becomes the base "", and "" + "/info" is the host's own 404 page — the fault
       core/segread.js stopped making on 2026-09-20. A caller handing an id for a volume the
       dataset lacks (βJump's nucleus box holds a Hoechst blob number) gets "nothing to show". */
    var root = CFG.seg ? idPair(o.root) : null, nuc = CFG.nuc ? idPair(o.nuc) : null;'''

print("\ncore/segpaint.js")
edit("core/segpaint.js", [
    (u"a layer with no volume is skipped, not fetched", SP_OLD, SP_NEW),
])


# ══ bjump.html ════════════════════════════════════════════════════════════════════════════════
CFG_OLD = u'''  label: "Alzheimer's vCLEM — hippocampal CA1",
  res: [8, 8, 30]                       // nm per voxel, this viewer's native frame
};'''

CFG_NEW = u'''  label: "Alzheimer's vCLEM — hippocampal CA1",
  /* ── THE TRACING CARD ─────────────────────────────  2026-09-21
     core/tracingcard.js, shared with µJump, λJump and δJump. Everything per-dataset about it is
     these lines.

     THE FOUR KEYS ARE βJUMP'S OWN, as literals. localStorage is one store across grubblab.com;
     left unset the module falls back to µJump's keys and the two tools would share one list of
     tracings and one set of drafts. storagekeycheck.js fails until these are here.

     seg IS READABLE HERE. segmentation_secgan_16nm is sharded compressed_segmentation, the format
     core/segread.js reads for µJump, and its ids are the cells in this page's own table. So the
     pad fills the root ID box from the coordinate, keeps the tick that paints the cell, and can
     draw it see-through in 3D. No nuc: the nuclei here are Hoechst blobs, not a segmentation.

     sources is a function because UJ.cfg.viewer is defined further down this script. */
  tracing: {
    lsKey:     "bjump_tracings_v1",
    draftsKey: "bjump_tracing_drafts_v2",
    draftKey:  "bjump_tracing_draft_v1",
    penKey:    "bjump_tracing_pen_v1",
    /* Not µJump's sentence alone: here the segmentation covers only about half the imaged block,
       so a cell it does not have is an ordinary thing rather than an exception. */
    intro:     "The segmentation covers only about half of this block, so many cells here are "
             + "ones you outline yourself.",
    sources:   function(){ return { em: UJ.cfg.viewer.em, seg: UJ.cfg.viewer.seg }; }
  },
  res: [8, 8, 30]                       // nm per voxel, this viewer's native frame
};'''

TAG_OLD = u'''<script src="core/tracing.js"></script>
<script src="core/ontology.js"></script>'''
TAG_NEW = u'''<script src="core/tracing.js"></script>
<!-- The tracing card, shared with µJump, λJump and δJump. After the modules it is built on, before
     this page's own script, which supplies the host contract its header lists. -->
<script src="core/tracingcard.js"></script>
<script src="core/ontology.js"></script>'''

DIV_OLD = u'''<div id="panel"></div>

<div class="card">
<label>About this dataset</label>'''
DIV_NEW = u'''<div id="panel"></div>

<!-- ── TRACE A CELL THE SEGMENTATION DOES NOT HAVE ───────────────  2026-09-21
     The same card µJump has, in the slot λJump uses: under the cell panel. On βJump it covers the
     half of the block the segmentation never reached.

     EMPTY ON PURPOSE. core/tracingcard.js fills it on load: where the card sits is this page's
     decision, what is inside it is the module's. -->
<div class="card" id="tracingCard"></div>

<div class="card">
<label>About this dataset</label>'''

print("\nbjump.html")
edit("bjump.html", [
    (u"βJump names its four tracing keys, its imagery and its segmentation", CFG_OLD, CFG_NEW),
    (u"core/tracingcard.js loads after the modules it needs", TAG_OLD, TAG_NEW),
    (u"an empty wrapper under the cell panel", DIV_OLD, DIV_NEW),
])
