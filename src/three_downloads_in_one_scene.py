# -*- coding: utf-8 -*-
"""Three downloads in one scene keep their distance.                                  2026-10-10

Søren: *"I downloaded 3 models and put them into the same Blender instance, but they are not in
the correct place relative to each other, it seems like their centres are in the same place.
Please when I load them into Blender they should have the coordinates that they have in the
dataset, so their relative locations are correct."*

Exactly what the files said they did. glbParts() centres every file on its own middle, and the
header of glbcheck.js argued for it: "Nanometres puts a 15 µm cell 15,000 units across and 1.6
MILLION units from the origin, which in Blender's default viewport is an invisible speck beyond
the clip plane." That argument is about the UNIT, and it is still right. Centring was the part
that came along for the ride, and it is only right for one file at a time.

THE FIX IS NOT TO BAKE ABSOLUTE COORDINATES INTO THE VERTICES. glTF has a node translation and
Blender has an object location, and using them is better in three ways at once:

  - the vertices stay small, so float32 keeps sub-nanometre precision instead of spending its
    seven digits on a 1 mm offset
  - each object's ORIGIN is its own middle, so rotating and scaling it in Blender behaves
  - Alt+G clears the location, so a single cell at the world origin is one keystroke away — the
    old behaviour is still available, it is just no longer the only behaviour

So one new fact, in one place: glbParts() returns `offsetUm`, the file's middle in micrometres in
the same un-flipped frame as the vertices. Each writer turns it into its own axes exactly as it
already does for the vertices — the GLB flips y and puts it on the node, the script permutes to
(x, -z, -y) and puts it on the object. The two must land in the same place, and the check says so.

THE COST, SAID OUT LOUD: a lone download now opens up to ~1.8 mm from the world origin, which in
Blender's default view is off screen past the clip plane. Home frames it. Both tooltips and both
status lines say so, from ONE string, because this project's standing bill is one fact written in
several places that drift.

Also here: core/traceloft.js's export object said `glb: glb` three times — the fingerprint of an
insert that ran three times, harmless in JavaScript because the value is identical, and exactly
the signal not to leave lying around.

Changes: core/traceloft.js    (offsetUm; the node translation; ob.location; the headers)
         core/tracingcard.js  (TRACING_PLACE_HELP, in both tooltips and both status lines)
Check:   glbcheck.js          (new: two cells 100 µm apart stay 100 µm apart)
Run: python3 src/three_downloads_in_one_scene.py
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


# ── 1. ONE NEW FACT: where the file sits ──────────────────────────────────────────────────────
edit("core/traceloft.js", [
    (u"glbParts says where the file sits, in the same frame as its vertices",
     u'''    return { parts: out, centreNm: mid.map(function(v){ return Math.round(v); }),
             centreVoxel: [0, 1, 2].map(function(k){
               return Math.round(mid[k] / (Number(res[k]) || 1)); }) };''',
     u'''    return { parts: out, centreNm: mid.map(function(v){ return Math.round(v); }),
             /* WHERE IT SITS, in micrometres, in the same un-flipped frame as xyz above, so each
                writer turns it into its own axes exactly as it does for the vertices. Søren put
                three downloads in one Blender scene and they landed on top of each other: the
                geometry is local, so an object's origin is its own middle; the PLACE is this, and
                it travels on the node rather than in the vertices. 2026-10-10. */
             offsetUm: mid.map(function(v){ return v / NM_PER_UM; }),
             centreVoxel: [0, 1, 2].map(function(k){
               return Math.round(mid[k] / (Number(res[k]) || 1)); }) };'''),

    # ── 2. the GLB: the node carries it ────────────────────────────────────────────────────────
    (u"the GLB node is translated to the dataset place",
     u'''    prep.parts.forEach(function(q, qi){
      var n = q.xyz.length / 3;''',
     u'''    /* THE SAME FLIP THE VERTICES GET. Below, a vertex's y is negated for glTF's Y-up; the
       place has to be negated with it or the model is mirrored about the wrong plane. */
    var place = [prep.offsetUm[0], -prep.offsetUm[1], prep.offsetUm[2]];
    prep.parts.forEach(function(q, qi){
      var n = q.xyz.length / 3;'''),

    (u"...on every node of the file",
     u'''      nodes.push({ mesh: qi, name: q.name });''',
     u'''      nodes.push({ mesh: qi, name: q.name, translation: place });'''),

    (u"...and the asset says what it did",
     u'''                         centreNm: prep.centreNm,
                         note: "Moved to the origin and scaled to micrometres so it opens inside "
                             + "a default viewport; y is negated for glTF's Y-up. centreVoxel is "
                             + "where it came from, in this tool's voxels." } },''',
     u'''                         centreNm: prep.centreNm,
                         placedUm: place,
                         note: "Scaled to micrometres; y is negated for glTF's Y-up. The vertices "
                             + "are local to the file's own middle and every node is TRANSLATED "
                             + "to the dataset place, so several of these downloaded separately "
                             + "line up correctly in one scene. centreVoxel is where it came "
                             + "from, in this tool's voxels." } },'''),

    # ── 3. the Blender script: the object carries it ───────────────────────────────────────────
    (u"the script's header says it is placed, not centred",
     u'''    L.push("# One Blender unit is one MICROMETRE. The scene is centred on itself; it came from");
    L.push("# voxel " + b.centreVoxel.join(", ") + " in this tool's frame.");''',
     u'''    L.push("# One Blender unit is one MICROMETRE. Each object's MESH is local to its own middle");
    L.push("# and the object is PLACED at voxel " + b.centreVoxel.join(", ") + " of this tool's");
    L.push("# frame, so several of these run into one scene land in their true relative positions.");
    L.push("# Home frames everything; Alt+G on an object clears its location to the world origin.");'''),

    (u"_add takes where it goes",
     u'''    L.push("def _add(name, group, rgba, verts, faces):");''',
     u'''    L.push("def _add(name, group, rgba, at, verts, faces):");'''),

    (u"...and sets it on the object, not on the mesh",
     u'''    L.push("    ob = bpy.data.objects.new(name, me)");''',
     u'''    L.push("    ob = bpy.data.objects.new(name, me)");
    L.push("    ob.location = at                  # the dataset place, in micrometres");'''),

    (u"the call site passes it, in Blender's axes",
     u'''    b.parts.forEach(function(q){
      var v = [];''',
     u'''    /* BLENDER'S AXES, the same permutation the vertices get three lines down: X = x,
       Y = -z, Z = -y. This is where the .glb of the same cell lands after import, so the two
       downloads of one cell cannot contradict each other about where it is. */
    var at = "(" + n3(b.offsetUm[0]) + "," + n3(-b.offsetUm[2]) + "," + n3(-b.offsetUm[1]) + ")";
    b.parts.forEach(function(q){
      var v = [];'''),

    (u"...into the _add() call",
     u'''      L.push("_add(" + pyStr(q.name) + ", " + pyStr(q.group) + ", ("
             + n3(rgb[0]) + "," + n3(rgb[1]) + "," + n3(rgb[2]) + "," + q.alpha + "), [");''',
     u'''      L.push("_add(" + pyStr(q.name) + ", " + pyStr(q.group) + ", ("
             + n3(rgb[0]) + "," + n3(rgb[1]) + "," + n3(rgb[2]) + "," + q.alpha + "), "
             + at + ", [");'''),

    (u"...and what it prints when it is done",
     u'''    L.push("print('" + b.parts.length + " structure(s) added — micrometres, centred on "
           + b.centreVoxel.join(", ") + "')");''',
     u'''    L.push("print('" + b.parts.length + " structure(s) added — micrometres, placed at voxel "
           + b.centreVoxel.join(", ") + "')");'''),

    # ── 4. and the export object says glb once ─────────────────────────────────────────────────
    # Three identical `glb: glb` keys: the fingerprint of an insert that ran three times. The
    # value is the same function so nothing was ever wrong, which is why it survived -- and why
    # it is worth removing before the day the three are not identical.
    # The new text must not be a PREFIX of the old, or edit()'s `if new in s` guard reads the
    # unfixed line as already fixed and skips it -- which it did, once, before the next line was
    # pulled into both sides of the pair.
    (u"the export object names glb once",
     u'''           glb: glb, glbParts: glbParts, blenderPy: blenderPy, glb: glb, glb: glb,
           surfacePoints: surfacePoints,''',
     u'''           glb: glb, glbParts: glbParts, blenderPy: blenderPy,
           surfacePoints: surfacePoints,'''),
])
_T = os.path.join(HERE, "core/traceloft.js")
_t = io.open(_T, encoding="utf-8").read()
for _what, _n in [(u"offsetUm: mid.map(", 1), (u"translation: place", 1),
                  (u"var place = [prep.offsetUm[0]", 1), (u"glb: glb", 1),
                  (u"function glb(parts, resNm){", 1), (u"function glbParts(parts, resNm){", 1),
                  (u"function blenderPy(parts, resNm, meta){", 1),
                  (u"ob.location = at", 1), (u"rgba, at, verts, faces", 1)]:
    assert _t.count(_what) == _n, "core/traceloft.js has %d of %s, wanted %d" % (
        _t.count(_what), _what, _n)
# The place must be computed BEFORE the loop that writes it onto each node, or it is undefined.
assert _t.index(u"var place = [prep.offsetUm[0]") < _t.index(u"translation: place"), \
    "core/traceloft.js writes the node translation before it computes the place"
# ...and the script's `at` likewise, before the forEach that uses it.
assert _t.index(u'var at = "(" + n3(b.offsetUm[0])') < _t.index(u'+ at + ", [");'), \
    "core/traceloft.js writes the object location before it computes it"
print("done 1")

# ── 5. and both buttons and both lines say so, from one string ────────────────────────────────
# A lone download now opens up to ~1.8 mm from the world origin, which in Blender's default view
# is off screen past the clip plane. That is a real cost of a real fix, so it is stated where the
# click happens rather than discovered afterwards -- and from ONE string, because the thing this
# project pays for over and over is one fact written in four places that drift.
PLACE = (u'var TRACING_PLACE_HELP = "Placed at its dataset coordinates, so several of these open '
         u'in one scene in their true relative positions \\u2014 press Home in Blender to frame '
         u'it, or Alt+G to move it to the world origin.";\n')
edit("core/tracingcard.js", [
    (u"one string for where the model sits",
     u'''var TRACING_GLTF_HELP = ''',
     PLACE + u'''var TRACING_GLTF_HELP = '''),

    (u"the combined 3D model button says it",
     u"""            + 'the organelles inside them show, each in the colour it was drawn in. Micrometres, centred '
            + 'on itself, so it opens inside the viewport in Blender, PowerPoint or any glTF viewer. '
            + escHtml(TRACING_GLTF_HELP) + '">'""",
     u"""            + 'the organelles inside them show, each in the colour it was drawn in. Micrometres. '
            + escHtml(TRACING_PLACE_HELP) + ' ' + escHtml(TRACING_GLTF_HELP) + '">'"""),

    (u"the lone 3D model button says it",
     u'''                  + 'colour. Micrometres, centred on itself. ' + escHtml(TRACING_GLTF_HELP)''',
     u'''                  + 'colour. Micrometres. ' + escHtml(TRACING_PLACE_HELP) + ' '
                  + escHtml(TRACING_GLTF_HELP)'''),

    (u"the lone status line says it",
     u'''                    : "Saved " + parts[0].name + " as a 3D model (GLB, micrometres, centred on "
                      + "itself). Blender: File \\u203a Import \\u203a glTF 2.0. " + TRACING_GLTF_HELP)''',
     u'''                    : "Saved " + parts[0].name + " as a 3D model (GLB, micrometres). "
                      + "Blender: File \\u203a Import \\u203a glTF 2.0. " + TRACING_PLACE_HELP
                      + " " + TRACING_GLTF_HELP)'''),

    (u"the combined status line says it",
     u'''      + " Micrometres, centred on itself."
      + ((fmt === "py") ? "" : " " + TRACING_GLTF_HELP)''',
     u'''      + " Micrometres. " + TRACING_PLACE_HELP
      + ((fmt === "py") ? "" : " " + TRACING_GLTF_HELP)'''),
])
_C = os.path.join(HERE, "core/tracingcard.js")
_c = io.open(_C, encoding="utf-8").read()
for _what, _n in [(u"var TRACING_PLACE_HELP = ", 1), (u"TRACING_PLACE_HELP", 5),
                  (u"var TRACING_GLTF_HELP = ", 1), (u"centred on itself", 0)]:
    assert _c.count(_what) == _n, "core/tracingcard.js has %d of %s, wanted %d" % (
        _c.count(_what), _what, _n)
print("done 2")

# ── 6. the check that would have caught it ────────────────────────────────────────────────────
CHK = u'''
  /* \\u2500\\u2500 AND THREE DOWNLOADS IN ONE SCENE KEEP THEIR DISTANCE \\u2500\\u2500\\u2500  2026-10-10
     S\\u00f8ren: *"I downloaded 3 models and put them into the same Blender instance, but they are
     not in the correct place relative to each other, it seems like their centres are in the same
     place. Please when I load them into Blender they should have the coordinates that they have
     in the dataset, so their relative locations are correct."*

     Which is what the files said they did, and what the header of THIS file argued for: a cell
     1.6 million units from the origin is an invisible speck past the clip plane. That argument is
     about the UNIT and it is still right. Centring came along for the ride and is only right for
     one file at a time.

     The fix keeps the vertices local \\u2014 float32 precision, and an object origin at its own
     middle \\u2014 and puts the dataset place on the glTF node and the Blender object. So this
     asserts the thing he actually did: two cells 100 \\u00b5m apart, downloaded separately, are
     still 100 \\u00b5m apart when both are in one scene.

     WHAT IS ASSERTED:
       - the geometry is still local and still micrometres, so the clip-plane argument holds
       - every node carries a translation, and it is the file's own dataset middle
       - two separate downloads 100 \\u00b5m apart differ by 100 \\u00b5m, in all three axes
       - the GLB's translation and the script's ob.location are the SAME point
       - the place is flipped and permuted the same way the vertices are, or the scene is mirrored */
  console.log("\\nand three downloads in one scene keep their distance");
  const far = await p.evaluate(() => {
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    const res = [4, 4, 40];                    /* 4 nm in x and y, 40 nm in z */
    /* Two cells 100 \\u00b5m apart in x: 25,000 voxels at 4 nm. And 20 \\u00b5m in y, 8 \\u00b5m in z,
       so a dropped or swapped axis cannot hide behind a single-axis test. */
    const cell = (cx, cy, cz) => {
      const out = [];
      for (let z = cz; z <= cz + 8; z++) out.push(sq(z, cx, cy, 250));
      return out;
    };
    const head = (u8) => {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      return JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + dv.getUint32(12, true))));
    };
    const a = head(UJ.traceloft.glb(
      [{ name: "Cell A", rings: cell(400000, 230000, 400), color: "#cddc39", alpha: 0.25 }], res));
    const b2 = head(UJ.traceloft.glb(
      [{ name: "Cell B", rings: cell(425000, 235000, 600), color: "#5b8def", alpha: 0.25 }], res));
    /* ...and the same two in ONE file, which is the answer the two separate files must agree
       with: assembled by glbParts in one go, their separation is not in question. */
    const one = head(UJ.traceloft.glb([
      { name: "Cell A", rings: cell(400000, 230000, 400), color: "#cddc39", alpha: 0.25 },
      { name: "Cell B", rings: cell(425000, 235000, 600), color: "#5b8def", alpha: 0.25 }
    ], res));
    const vec = (j) => (j.nodes[0] || {}).translation || null;
    const mid = (j, i) => {
      const acc = (j.accessors || []).filter(x => x.type === "VEC3")[i];
      return acc ? [0, 1, 2].map(k => (acc.min[k] + acc.max[k]) / 2) : null;
    };
    /* The script of cell A, for the one place both writers must agree about. */
    const py = UJ.traceloft.blenderPy(
      [{ name: "Cell A", rings: cell(400000, 230000, 400), color: "#cddc39", alpha: 0.25 }],
      res, { title: "Cell A" });
    const loc = /ob\\.location = at/.test(py)
      ? (py.match(/_add\\('Cell A',[^[]*?,\\s*\\(([-0-9.,]+)\\),\\s*\\[/) || [])[1] : null;
    return {
      ta: vec(a), tb: vec(b2),
      /* Both nodes of the single file, so the within-file assembly is checked too. */
      inOne: [mid(one, 0), mid(one, 1)],
      oneT: (one.nodes || []).map(n => (n.translation || []).join(",")),
      localSpan: (() => { const m = mid(a, 0); return m ? Math.max.apply(null, m.map(Math.abs)) : -1; })(),
      extras: a.asset && a.asset.extras,
      loc: loc ? loc.split(",").map(Number) : null,
      pyHasLoc: /ob\\.location = at/.test(py)
    };
  });
  {
    const TA = far.ta || [], TB = far.tb || [];
    ok(TA.length === 3 && TB.length === 3,
       "every node carries a translation \\u2014 the place lives on the node, not in the vertices, "
       + "so float32 keeps sub-nanometre precision and the object origin is its own middle",
       JSON.stringify(far.ta) + " / " + JSON.stringify(far.tb));
    ok(far.localSpan >= 0 && far.localSpan < 5,
       "...while the geometry is still local and still micrometres, so this file\\u2019s own "
       + "clip-plane argument still holds: 1.6 million units is an invisible speck",
       "vertices centred within " + far.localSpan.toFixed(2) + " µm of the object origin");
    /* 25,000 voxels \\u00d7 4 nm = 100 \\u00b5m in x; 5,000 \\u00d7 4 = 20 \\u00b5m in y; 200 \\u00d7 40
       = 8 \\u00b5m in z. glTF y is negated, so the y difference is -20. */
    const d = (TA.length === 3 && TB.length === 3) ? [0, 1, 2].map(k => TB[k] - TA[k]) : [];
    ok(d.length === 3 && Math.abs(d[0] - 100) < 0.05 && Math.abs(d[1] + 20) < 0.05
       && Math.abs(d[2] - 8) < 0.05,
       "...and two cells 100 \\u00b5m, 20 \\u00b5m and 8 \\u00b5m apart, downloaded SEPARATELY, are "
       + "still that far apart in one scene \\u2014 which is the whole of what he reported",
       d.map(v => v.toFixed(2)).join(", ") + " µm (want 100, -20, 8; y negated for glTF)");
    /* THE TWO ROUTES MUST AGREE. One file holding both cells assembles them in glbParts; two
       files assemble them by their node translations. A scene must not depend on which. */
    const o = far.inOne || [];
    const dOne = (o[0] && o[1]) ? [0, 1, 2].map(k => o[1][k] - o[0][k]) : [];
    ok(dOne.length === 3 && d.length === 3
       && [0, 1, 2].every(k => Math.abs(dOne[k] - d[k]) < 0.05),
       "...and the same two in ONE file are the same distance apart, so a scene does not depend "
       + "on whether they were downloaded together or separately",
       dOne.map(v => v.toFixed(2)).join(", ") + " vs " + d.map(v => v.toFixed(2)).join(", "));
    /* NOT MERELY EQUAL: both non-empty. Written as `oneT[0] === oneT[1]` alone this passed
       against the UNFIXED code, where both were "" \u2014 a check that cannot fail. */
    ok((far.oneT || []).length === 2 && far.oneT[0].split(",").length === 3
       && far.oneT[0] === far.oneT[1],
       "...with the parts of one file sharing one translation, because glbParts already assembled "
       + "them and a second offset would move them apart", (far.oneT || []).join("  |  "));
    /* THE SCRIPT AND THE GLB. The importer maps glTF (x, y, z) to Blender (x, -z, y), so the
       script's object location must be (tx, -tz, ty) of the GLB's node translation. The vertex
       check further down does the same for the geometry; this does it for the place. */
    ok(far.pyHasLoc, "the Blender script places its objects too, not only the GLB",
       String(far.pyHasLoc));
    const L = far.loc || [], want = (TA.length === 3) ? [TA[0], -TA[2], TA[1]] : [];
    ok(L.length === 3 && want.length === 3
       && [0, 1, 2].every(k => Math.abs(L[k] - want[k]) < 0.01),
       "...at the SAME point the GLB lands at \\u2014 Blender (x, -z, y) of the glTF translation, "
       + "the same permutation the vertices get, so the two downloads of one cell cannot "
       + "contradict each other about where it is",
       "script " + L.map(v => v.toFixed(1)).join(", ") + " vs glb \\u2192 "
       + want.map(v => v.toFixed(1)).join(", "));
    ok(far.extras && (far.extras.placedUm || []).length === 3
       && /TRANSLATED/.test(String(far.extras.note || "")),
       "...and the file says in its own asset extras that it is placed rather than centred, "
       + "because the next person to read one will believe the note",
       JSON.stringify(far.extras && far.extras.placedUm));
  }
'''

OLD_TAIL = u'''
  /* \\u2500\\u2500 AND A FORM THAT NEEDS NO IMPORTER AT ALL \\u2500\\u2500'''
# GUARDED ON A SIGNATURE, NOT ON THE WHOLE BLOCK. edit()'s `if new in s` compares the entire
# inserted text, so the moment anything edits that text -- including me, fixing an assertion that
# could not fail -- the guard stops matching and the next run inserts a SECOND copy. It happened
# once while writing this, and the count assertion below is what caught it.
_G = os.path.join(HERE, "glbcheck.js")
if u"const far = await p.evaluate" in io.open(_G, encoding="utf-8").read():
    print("glbcheck.js\n  already there: two cells 100 micrometres apart stay 100 micrometres apart")
else:
    edit("glbcheck.js", [
        (u"two cells 100 micrometres apart stay 100 micrometres apart", OLD_TAIL, CHK + OLD_TAIL),
    ])
edit("glbcheck.js", [

    # ── and the assertion this change supersedes ───────────────────────────────────────────────
    # It read "...and it sits at the origin rather than 1.6 million units away" and it still
    # passes: the GEOMETRY is still local. But the OBJECT no longer sits at the origin, so the
    # wording was about to become the most misleading line in the file. Superseded, not loosened.
    (u"the origin assertion says what it actually reads",
     u'''  ok(Math.abs(B.min[0]) < span && Math.abs(B.max[0]) < span,
     "...and it sits at the origin rather than 1.6 million units away",
     "x from " + B.min[0] + " to " + B.max[0]);''',
     u'''  ok(Math.abs(B.min[0]) < span && Math.abs(B.max[0]) < span,
     "...and the GEOMETRY is local to the object rather than 1.6 million units of float32 away "
     + "\\u2014 the dataset place is on the node, which is checked further down",
     "x from " + B.min[0] + " to " + B.max[0]);'''),

    (u"the header paragraph says centring was only ever right for one file",
     u'''     UNITS. Nanometres puts a 15 µm cell 15,000 units across and 1.6 MILLION units from the
        origin, which in Blender's default viewport is an invisible speck beyond the clip plane.
        Micrometres, centred on the model's own middle, opens as something you can see. The
        offset that was subtracted travels in the file so the coordinate is not lost.''',
     u'''     UNITS. Nanometres puts a 15 µm cell 15,000 units across and 1.6 MILLION units from the
        origin, which in Blender's default viewport is an invisible speck beyond the clip plane.
        Micrometres opens as something you can see.

     THE PLACE, which is not the unit.  2026-10-10. The above also CENTRED each file on its own
        middle, and that is right for exactly one file at a time: S\\u00f8ren put three in one
        Blender scene and they landed on top of each other. The geometry is still local \\u2014
        float32 precision, and an object origin at its own middle \\u2014 and the dataset place now
        travels on the glTF node and the Blender object, where Alt+G can still clear it.''' ),
])
_g = io.open(os.path.join(HERE, "glbcheck.js"), encoding="utf-8").read()
assert _g.count(u"const far = await p.evaluate") == 1, "glbcheck.js has two of the new block"
assert _g.count(u"it sits at the origin rather than") == 0, "the superseded wording is still there"
print("done 3")
print("all applied")
