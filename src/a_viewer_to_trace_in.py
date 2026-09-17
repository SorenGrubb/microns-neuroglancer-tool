"""There was nowhere to go and draw.                                                  2026-09-17

Søren, on stage 1: *"I see the Trace a cell, but I don't see any link to a neuroglancer instance
anywhere where I can go and use the polygon tool to trace a cell."*

Correct, and worse than missing a button: the card told him to use a tool that does not exist
anywhere he could reach. Measured today, in a real browser, against real MICrONS data:

  - **BrainSharer's viewer (www.brainsharer.org/ng/) ignores a pasted `#!` state entirely.** It
    loaded with "Please log in" and one empty layer, and keeps its states server-side under `?id=`.
    Its polygon/volume tool is real -- it is where core/tracing.js's polygon and volume readers
    came from -- but it is not reachable with a link µJump can build, and its "start a volume
    session" needs an account.
  - **Spelunker (spelunker.cave-explorer.org) takes the state, renders minnie65 EM, and has an
    "Annotate polyline" tool -- which never reaches the link.** Drawn with 4 vertices it renders on
    screen and shows "Num vertices 4" in the selection panel, while `localAnnotations` stayed at
    length 1 and the address bar's `annotations` array never gained it. Checked twice, ending the
    polyline with Escape and with a double-click.
  - **A plain `line` annotation DOES round-trip**, immediately and reliably:
        {"pointA":[240632.19,207943.39,21359.998],"pointB":[240728.19,208002.19,21359.998],
         "type":"line","id":"e6803a43…"}
    appeared in the address bar the moment it was drawn.

So a ring of line annotations is not the fallback the card described it as -- it is THE route, and
`ringsFromLink`'s line-chaining half is the half that matters. The card now says so, and says the
thing that was probably blocking him outright: **annotations are placed with ctrl+click**, not a
plain click. A plain click with the line tool active does nothing at all.

THE BUTTON. "Open a viewer to trace in" builds the state buildState() already builds for the
coordinate on screen -- his EM/segmentation/nuclei ticks, his viewer choice -- and adds an empty
annotation layer called "tracing" with the line tool already active and the layer already selected,
in an "xy" layout because tracing happens on sections.

It STRIPS the "Cortical layers" annotation layer, and that is not tidying. Those bands are `line`
annotations in a local annotation layer, so on the way back in, ringsFromLink() with no layer name
would chain them together with his contours into rings that cross the whole dataset — and mesh,
which is this project's worst failure shape: wrong, and it still produces an object.

Closed from both ends, because he can also paste a link he built himself: ringsFromLink() now never
reads a layer called "Cortical layers" as contours, and PREFERS a layer called "tracing" when the
link has one. So the layer box stays empty in the ordinary case rather than being a name to match
by hand, and naming one explicitly still overrides everything.

Run: python3 src/a_viewer_to_trace_in.py
     node tracingcheck.js && node tracingpanelcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HTML = [
    ('''<p class="hint" style="margin-top:8px">For a cell the segmentation does not have. Outline it in the viewer section by section &mdash; a <b>polygon</b> if your viewer has the tool, otherwise a ring of <b>line</b> annotations &mdash; then paste the whole address bar here. Two sections is the minimum; every fifth section is about half a percent off the real volume, every fortieth is eleven.</p>''',
     '''<p class="hint" style="margin-top:8px">For a cell the segmentation does not have. Open a viewer, ring the cell with <b>line</b> annotations on one section &mdash; <b>ctrl+click</b> each end of each segment; a plain click does nothing &mdash; step a section with <b>,</b> and <b>.</b>, and go round again. Then paste the whole address bar back here. Two sections is the minimum; tracing every fifth section comes out about half a percent off the real volume, every fortieth about eleven.</p>
<div class="row" style="gap:8px;margin-top:8px">
<button class="idbtn" id="tracingOpen" style="flex:1 1 auto" title="Opens the viewer chosen at the top of the Jump tab, at the coordinate on screen, with an empty annotation layer called &quot;tracing&quot; already selected and the line tool already active.">Open a viewer to trace in</button>
</div>
<p class="hint" style="margin-top:6px">Measured 2026-09-17, in the browser: Spelunker keeps line annotations in the address bar, so they survive the paste. Its <i>polyline</i> tool draws on screen but never reaches the link, and BrainSharer's polygon tool needs an account and ignores a pasted link &mdash; so a ring of lines is the route that actually works.</p>''',
     "the card says how to trace, and offers a viewer"),

    ('''<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingLayer" placeholder="Annotation layer name (optional)"></div>''',
     '''<div class="coord" style="flex:1 1 auto"><input type="text" id="tracingLayer" placeholder="Annotation layer name (optional)" title="Which annotation layer to read. Leave it empty and it does the right thing on its own: a layer called &quot;tracing&quot; (what the button above makes) wins if the link has one, and the Cortical layers bands are never read as contours."></div>''',
     "the layer box says it can be left alone"),
]

TRACING = [
    ('''    (st.layers || []).forEach(function(l){
      if (!l || l.type !== "annotation") return;
      if (layerName && l.name !== layerName) return;
      layers++;''',
     '''    /* WHICH ANNOTATION LAYERS COUNT, when nobody named one.  2026-09-17
       A pasted µJump link normally carries "Cortical layers" -- the pia/white-matter bands, which
       are `line` annotations in a local annotation layer exactly like a hand-drawn contour. Read
       as contours they chain into rings spanning the whole dataset, quietly, and the result still
       meshes. So: never read them.

       And a link from the card's own "Open a viewer to trace in" button carries a layer called
       "tracing". If one is there, it is the answer and nothing else needs looking at -- which
       means the layer box can stay empty in the ordinary case instead of being a name he has to
       match by hand. */
    var annLayers = (st.layers || []).filter(function(l){
      return l && l.type === "annotation" && !/^cortical layers$/i.test(String(l.name || ""));
    });
    if (!layerName && annLayers.some(function(l){ return l.name === "tracing"; }))
      layerName = "tracing";

    annLayers.forEach(function(l){
      if (layerName && l.name !== layerName) return;
      layers++;''',
     "the bands are never contours, and a tracing layer wins on its own"),
]

JS = [
    ('''function tracingKeep(){''',
     '''/* ── SOMEWHERE TO GO AND DRAW ────────────────────────────────────────────────────  2026-09-17
   Søren: "I don't see any link to a neuroglancer instance anywhere where I can go and use the
   polygon tool to trace a cell." There wasn't one, and the tool the card named does not exist in
   any viewer a link can reach -- see src/a_viewer_to_trace_in.py for what was measured.

   Same state buildState() gives the jump arrow -- his viewer, his layer ticks, this coordinate --
   plus an empty annotation layer with the line tool live. */
function tracingOpen(){
  const pos=(window.CUR_POS&&window.CUR_POS.length===3)?window.CUR_POS.slice():null;
  if(!pos){tracingSay("Search a coordinate or a cell first \\u2014 the viewer opens where you are.",true);return;}
  let st;
  try{st=buildState(pos);}catch(e){tracingSay("Could not build a viewer link: "+String(e&&e.message||e),true);return;}
  /* The Cortical layers bands are `line` annotations in a local annotation layer, so leaving them
     on the link he traces over means ringsFromLink() chains them in with his contours into rings
     that span the dataset. They are also a thick grid over the picture he is trying to draw on. */
  st.layers=(st.layers||[]).filter(function(l){
    return !(l&&l.type==="annotation"&&/cortical layers/i.test(String(l.name||"")));});
  st.layers=st.layers.filter(function(l){return !(l&&l.type==="annotation"&&l.name==="tracing");});
  st.layers.push({type:"annotation",source:"local://annotations",tool:"annotateLine",
                  tab:"annotations",name:"tracing",annotations:[]});
  st.selectedLayer={layer:"tracing",visible:true};
  st.layout="xy";   // tracing happens on sections; the 3D pane only takes the width
  const viewerEl=document.getElementById("viewer");
  const base=(viewerEl&&viewerEl.value)||"https://spelunker.cave-explorer.org/";
  window.open(base+"#!"+encodeURIComponent(JSON.stringify(st)),"_blank","noopener");
  tracingSay("Viewer opened at "+pos.join(", ")+", on a layer called \\u201ctracing\\u201d with the line "
    +"tool live. Ctrl+click each end of a segment; , and . step a section. Paste the address bar back here.");
}

function tracingKeep(){''',
     "tracingOpen builds a viewer link with an empty tracing layer"),

    ('''  document.getElementById("tracingKeep").addEventListener("click",tracingKeep);''',
     '''  const openBtn=document.getElementById("tracingOpen");
  if(openBtn)openBtn.addEventListener("click",tracingOpen);
  document.getElementById("tracingKeep").addEventListener("click",tracingKeep);''',
     "the button is wired"),
]


CHECK = [
    ('''console.log("\\nwhat it refuses, and what it says");''',
     '''console.log("\\nthe bands \\u00b5Jump puts on its own links are not contours");
{
  /* buildLayerAnnotationLayers() draws the pia/white-matter boundaries as `line` annotations in a
     local annotation layer called "Cortical layers". They are indistinguishable, shape-wise, from
     a hand-drawn contour segment -- so before 2026-09-17 a link carrying both came back as rings
     that chained his outline to a band spanning the dataset, and MESHED, which is the failure mode
     this project cares about most: wrong, and it still produces an object. */
  const bands = { type: "annotation", name: "Cortical layers", annotations: [
    { type: "line", id: "b1", pointA: [0, 0, 500], pointB: [90000, 1000, 500] },
    { type: "line", id: "b2", pointA: [90000, 1000, 500], pointB: [90000, 90000, 505] },
    { type: "line", id: "b3", pointA: [90000, 90000, 505], pointB: [0, 0, 505] }
  ]};
  const m1 = polygonOf(circle(1000, 2000, 500, 40, 16), "t1");
  const m2 = polygonOf(circle(1005, 2005, 505, 38, 16), "t2");
  const mine = { type: "annotation", name: "tracing",
                 annotations: [m1.poly, m2.poly].concat(m1.lines, m2.lines) };
  const url = (layers) => "https://neuroglancer.example/#!"
    + encodeURIComponent(JSON.stringify({ layers: layers }));

  const both = T.ringsFromLink(url([bands, mine]));
  ok(both.ok === true && both.rings.length === 2,
     "a link with the bands AND a tracing gives back the tracing only",
     both.rings.length + " rings");
  ok(both.ok && both.rings.every(r => r.points.every(p => p[0] < 2000 && p[1] < 3000)),
     "...every point is his cell's, not a band's corner at 90000");

  /* Without a "tracing" layer there is no preference to exercise -- the bands must still be out. */
  const loose = { type: "annotation", name: "annotation",
                  annotations: [m1.poly, m2.poly].concat(m1.lines, m2.lines) };
  const noName = T.ringsFromLink(url([bands, loose]));
  ok(noName.ok === true && noName.rings.length === 2,
     "and with the layer called anything else, the bands are still not read",
     noName.rings.length + " rings");

  const only = T.ringsFromLink(url([bands]));
  ok(only.ok === false && /no annotation layer/.test(only.error || ""),
     "a link carrying nothing BUT the bands says it has no annotation layer, rather than meshing them",
     only.error);

  /* The layer box still wins when he fills it in -- the preference is a default, not a rule. */
  const named = T.ringsFromLink(url([bands, mine, loose]), "annotation");
  ok(named.ok === true && named.rings.length === 2,
     "naming a layer by hand still overrides all of it", named.rings.length + " rings");
}

console.log("\\nwhat it refuses, and what it says");''',
     "the bands are checked out of the contours"),
]

PANELCHECK = [
    ('''  await p.evaluate(() => { document.getElementById("tracingPanel").open = true; });''',
     '''  await p.evaluate(() => { document.getElementById("tracingPanel").open = true; });

  console.log("\\nthe button that gives him somewhere to draw");
  {
    const v = await p.evaluate(() => {
      window.__opened = [];
      window.open = (u) => { window.__opened.push(u); return null; };
      window.CUR_POS = null;
      document.getElementById("tracingOpen").click();
      const refused = document.getElementById("tracingStatus").innerText;
      window.CUR_POS = [240640, 207872, 21360];
      document.getElementById("tracingOpen").click();
      const u = window.__opened[window.__opened.length - 1] || "";
      let s = null;
      try { s = JSON.parse(decodeURIComponent(u.split("#!")[1] || "")); } catch (e) {}
      return { refused: refused, n: window.__opened.length, base: u.split("#!")[0], state: s };
    });
    ok(/coordinate or a cell first/i.test(v.refused) && v.n === 1,
       "with nothing on screen it says where to start, and opens nothing",
       v.refused.slice(0, 55));
    const ann = ((v.state && v.state.layers) || []).filter(l => l.type === "annotation");
    const tr = ann.find(l => l.name === "tracing");
    ok(!!tr, "the link carries an annotation layer called tracing");
    ok(!!tr && tr.tool === "annotateLine",
       "...with the LINE tool live \\u2014 measured 2026-09-17 as the only kind that reaches the "
       + "address bar; the polyline tool draws and is never serialised", tr && tr.tool);
    ok(!!tr && Array.isArray(tr.annotations) && tr.annotations.length === 0,
       "...and empty, so everything that comes back is his");
    ok(!!v.state && !!v.state.selectedLayer && v.state.selectedLayer.layer === "tracing",
       "...and selected, so the tools are on screen rather than three clicks away");
    ok(!ann.some(l => /cortical layers/i.test(l.name || "")),
       "the Cortical layers bands are NOT on it \\u2014 they are lines, and would chain into his contours");
    ok(!!v.state && v.state.layout === "xy",
       "the layout is a section, not a section plus a 3D pane",
       v.state && JSON.stringify(v.state.layout));
    ok(String(v.state && v.state.position) === "240640,207872,21360",
       "...centred where he was", String(v.state && v.state.position));
    ok(/^https?:\\/\\//.test(v.base), "and it opens the viewer chosen at the top of the tab", v.base);
  }''',
     "the viewer button is driven in a real page"),
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


edit("core/tracing.js", TRACING)
edit("ujump.html", HTML + JS)
edit("tracingcheck.js", CHECK)
edit("tracingpanelcheck.js", PANELCHECK)
print("\nnow: node tracingcheck.js && node tracingpanelcheck.js")
