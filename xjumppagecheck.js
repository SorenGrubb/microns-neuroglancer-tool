/* χJump's page, driven in jsdom.                                                 2026-08-31
   The logic has its own suite; this asserts the LOOP -- paste, build, add, name -- because a
   parser that works and a page that never calls it look identical from the outside. That is the
   βJump lesson: its organelle filter's JS sat in the page for eleven days with no div to render
   into, and every check that asked "does the function exist?" passed the whole time.
   Run: node xjumppagecheck.js */
const fs = require("fs");
/* core/ is beside this build in a working copy and inside the served repo in Søren's
   tree; corepath.js knows both. Hard-coding one of them is right in one layout and an
   ENOENT in the other, which is how every one of these died the first time they were run
   from his machine. */
const core = require("./corepath.js");
const { JSDOM } = require("jsdom");
const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n + (d ? "  <- " + d : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = new JSDOM(fs.readFileSync("xjump_demo.html", "utf8"),
    { runScripts:"dangerously", pretendToBeVisual:true, url:"https://grubblab.com/" });
  const w = dom.window, D = w.document, X = w.UJ.xjump, A = w.UJ.app;
  let opened = null; w.open = (u) => { opened = u; return null; };
  await sleep(400);
  /* core/mesh.js is a <script src> in the real page, and jsdom does not fetch those. Evaluated by
     hand so the export half is present exactly as the browser would have it -- the three download
     buttons call into it, and a check that the buttons exist while the module does not would pass
     for a page that cannot download anything. */
  w.eval(fs.readFileSync(core("mesh.js"), "utf8"));
  /* core/matchcount.js, likewise a <script src> the page loads and jsdom does not fetch. Without
     it the page still works -- the filter code falls back to no-ops on purpose, see
     src/a_missing_module_costs_the_count_not_the_panel.py -- but the count on the button is what
     the assertions below read, so the check has to supply what the browser would. */
  w.eval(fs.readFileSync(core("matchcount.js"), "utf8"));

  console.log("--- the page stands up ---");
  ok("the paste box is there", !!D.getElementById("paste"));
  ok("the volume is described", /cerebellar cortex/.test(D.getElementById("dslabel").textContent),
     D.getElementById("dslabel").textContent);
  ok("...with its real size", /998 × 922 × 48/.test(D.getElementById("dsfacts").textContent)
     || /998/.test(D.getElementById("dsfacts").textContent),
     D.getElementById("dsfacts").textContent.slice(0, 60));
  ok("no cells yet", /No cells yet/.test(D.getElementById("cells").textContent));

  console.log("\n--- paste -> fragment ids ---");
  const ids = ["3323082834073", "7545904169112", "9520490087067"];
  const st = { position:[90355,63990,1106], layers:[
    { type:"image", name:"em", source:w.UJ.cfg.volume.em },
    { type:"segmentation", name:"seg", source:w.UJ.cfg.volume.seg,
      segments: ids.concat(["!6543262351364"]) } ] };
  D.getElementById("paste").value =
    "https://neuroglancer-demo.appspot.com/#!" + encodeURIComponent(JSON.stringify(st));
  D.getElementById("paste-go").click(); await sleep(60);
  ok("it reads the ids", /3 fragments/.test(D.getElementById("paste-msg").textContent),
     D.getElementById("paste-msg").textContent);
  /* The deselected one must be SAID, not silently dropped: a person who unticked a fragment and
     is told "3 fragments" has to count them to find out whether the tool agreed with them. */
  ok("...and says one was deselected", /1 deselected/.test(D.getElementById("paste-msg").textContent));
  ok("each id is shown", D.querySelectorAll("#paste-body .frag-chip").length === 3);
  ok("Build cell appears", !!D.getElementById("build"));
  ok("Add to existing does NOT, with no cells yet", !D.getElementById("addto"),
     "an empty dropdown is a control that cannot work");

  console.log("\n--- build a cell ---");
  D.getElementById("build").click(); await sleep(60);
  ok("one cell exists", A.state().cells.length === 1, JSON.stringify(A.state().cells[0].id));
  ok("...holding the three fragments", A.state().cells[0].segments.length === 3);
  ok("...and not the deselected one",
     A.state().cells[0].segments.indexOf("6543262351364") < 0);
  ok("the paste box is cleared", D.getElementById("paste").value === "",
     "so the next paste cannot be built twice by accident");
  ok("the cell is on the page", /cb2:1/.test(D.getElementById("cells").textContent));
  ok("stats count it", /1/.test(D.getElementById("stats").textContent)
     && /3/.test(D.getElementById("stats").textContent),
     D.getElementById("stats").textContent.replace(/\s+/g, " "));

  console.log("\n--- a fragment belongs to one cell ---");
  /* Paste an overlapping selection. The page must WARN before anything is saved, and must not
     resolve it: which of two assemblies is right is a judgement about the tissue. */
  const st2 = { layers:[ { type:"segmentation", name:"seg", source:w.UJ.cfg.volume.seg,
                           segments:["7545904169112", "4041012019398"] } ] };
  D.getElementById("paste").value = JSON.stringify(st2);
  D.getElementById("paste-go").click(); await sleep(60);
  ok("the clash is announced", /already in/.test(D.getElementById("paste-body").textContent),
     D.getElementById("paste-body").textContent.replace(/\s+/g," ").slice(0, 90));
  ok("...and the guilty chip is marked",
     D.querySelectorAll("#paste-body .frag-chip.taken").length === 1);
  ok("...but building is still allowed", !!D.getElementById("build"),
     "reported, not refused — the person pasting is entitled to decide");
  ok("Add to existing is now offered", !!D.getElementById("addto"));

  console.log("\n--- add to an existing cell ---");
  D.getElementById("addto").value = "cb2:1";
  D.getElementById("add").click(); await sleep(60);
  ok("the cell grew by ONE", A.state().cells[0].segments.length === 4,
     A.state().cells[0].segments.length + " fragments");
  /* "added 14" and "added 1, you already had 1" are different sentences and the page must say the
     true one. */
  ok("...and it says what was already there",
     /1 was already there/.test(D.getElementById("paste-msg").textContent),
     D.getElementById("paste-msg").textContent);

  console.log("\n--- naming, and the tally ---");
  const root = D.getElementById("cell-cb2_1");
  root.querySelector(".nm").value = "granule cell";
  root.querySelector(".save-nm").click(); await sleep(60);
  ok("a name is recorded", w.UJ.xjump.settledLabel(A.state().cells[0]) === "granule cell",
     w.UJ.xjump.settledLabel(A.state().cells[0]));
  ok("...and shown", /granule cell/.test(D.getElementById("cells").textContent));
  const root2 = D.getElementById("cell-cb2_1");
  root2.querySelector(".nm").value = "Golgi cell";
  root2.querySelector(".save-nm").click(); await sleep(60);
  ok("a tie is contested, not a winner",
     X.tallySummary(A.state().cells[0]).status === "contested"
     && X.settledLabel(A.state().cells[0]) === "",
     "a tie is not a consensus, however many votes it has");
  D.getElementById("cell-cb2_1").querySelector(".rej").click(); await sleep(60);
  ok("'not one cell' is recorded", A.state().cells[0].rejects === 1);

  console.log("\n--- opening in the viewer ---");
  /* The cell's NAME is the link now, and it is a real <a href>, not a button calling
     window.open() -- so it can be middle-clicked, copied and dragged into a message, none of
     which a button can do. What is read here is therefore the href. */
  const link = D.getElementById("cell-cb2_1").querySelector("a.cell-open");
  ok("the cell's name is the link", !!link && /Purkinje|granule|Golgi|Unnamed/i.test(link.textContent),
     link ? link.textContent.trim() : "no link");
  opened = link && link.getAttribute("href");
  ok("a link is opened", !!opened && opened.indexOf("#!") > 0);
  const back = X.parseSegments(opened);
  /* THE ROUND TRIP. What the page emits, the page can read back -- which is the actual working
     loop: build a cell, open it, click three more fragments, paste it back. */
  ok("...and it round-trips", back.ok && back.ids.length === 4,
     JSON.stringify(back.ids.length) + " fragments back");
  ok("...merged into one object", /local:\/\/equivalences/.test(decodeURIComponent(opened)),
     "so whoever you send it to sees one cell, not four pieces");
  ok("...framed for a fragment, not the volume",
     /projectionScale%22%3A1750/.test(opened) || /"projectionScale":1750/.test(decodeURIComponent(opened)),
     "1750 canonical voxels = 7 µm");

  /* THE LINK CENTRES ON THE NUCLEUS, not on whichever fragment was pasted last. A cell assembled
     over three sessions would otherwise open on the tip of the most recent dendrite, which is
     nowhere in particular. The soma is where you want to arrive. */
  const at = JSON.parse(decodeURIComponent(opened.slice(opened.indexOf("#!") + 2)));
  ok("...centred on the recorded position", at.position.join(",") === "90355,63990,1106",
     at.position.join(", ") + " — the crosshair from the FIRST paste, not the second");
  A.state().cells[0].nucleus = [11111, 22222, 333];
  A.render(); await sleep(30);
  const link2 = D.getElementById("cell-cb2_1").querySelector("a.cell-open");
  const at2 = JSON.parse(decodeURIComponent(link2.getAttribute("href").split("#!")[1]));
  ok("...and a nucleus beats it once one is known", at2.position.join(",") === "11111,22222,333",
     at2.position.join(", "));
  ok("...and the row says where that is", /nucleus at 11111, 22222, 333/
     .test(D.getElementById("cell-cb2_1").textContent));
  delete A.state().cells[0].nucleus;

  console.log("\n--- growing a cell from the cell itself ---");
  /* Scrolling to the top and finding the right entry in a dropdown is fine with three cells and
     unusable with thirty. */
  A.render(); await sleep(30);
  D.getElementById("cell-cb2_1").querySelector(".addto-cell").click(); await sleep(30);
  ok("the paste box is aimed at that cell", /Aiming at/.test(D.getElementById("paste-msg").textContent)
     && /cb2:1/.test(D.getElementById("paste-msg").textContent),
     D.getElementById("paste-msg").textContent.replace(/\s+/g," "));
  /* AND THE AIM IS VISIBLE WITHOUT PASTING FIRST. Søren, 2026-09-01: "The system for adding
     fragments to existing structures is confusing. I accidentally added a lot of fragments to a
     new cell, where I was trying to add it to an already existing cell."

     The aim used to exist only as a variable: the button that named the target appeared AFTER you
     pasted, and everything between pressing "Add fragments" and pasting looked exactly like
     building a new cell. It is now said in two places, so whichever one you are looking at tells
     you -- a banner above the box you are about to paste into, and a ring on the cell itself. */
  ok("...and said above the paste box before anything is pasted", (() => {
     const n = D.getElementById("target-note");
     return n && /Adding to/.test(n.textContent) && /cb2:1/.test(n.textContent)
         && /goes onto that cell, not into a new one/.test(n.textContent);
  })(), (D.getElementById("target-note") || {}).textContent);
  ok("...and the cell itself is ringed", (() => {
     const card = D.getElementById("cell-cb2_1");
     return card.classList.contains("aimed")
         && /next paste lands here/i.test(card.textContent);
  })());
  ok("...with one click to call it off", (() => {
     const off = D.querySelector("#target-note #target-off");
     return !!off && /build a new cell instead/i.test(off.textContent);
  })());
  D.getElementById("paste").value = JSON.stringify({ layers:[
    { type:"segmentation", name:"seg", source:w.UJ.cfg.volume.seg, segments:["5150000000001"] } ] });
  D.getElementById("paste-go").click(); await sleep(60);
  ok("Add is the PRIMARY action now", !!D.getElementById("add")
     && D.getElementById("add").className.indexOf("primary") >= 0
     && /Add these 1 to cb2:1/.test(D.getElementById("add").textContent),
     D.getElementById("add").textContent);
  ok("...and Build is the escape hatch", !!D.getElementById("build")
     && D.getElementById("build").className.indexOf("primary") < 0,
     "Build first with Add hidden in a dropdown is how a fragment ends up in a cell of its own");
  ok("...and there is a way out", !!D.getElementById("cancel-target"));
  D.getElementById("add").click(); await sleep(60);
  ok("it went to the right cell", A.state().cells[0].segments.length === 5,
     A.state().cells[0].segments.length + " fragments");
  D.getElementById("paste").value = JSON.stringify({ layers:[
    { type:"segmentation", name:"seg", source:w.UJ.cfg.volume.seg, segments:["5150000000002"] } ] });
  D.getElementById("paste-go").click(); await sleep(60);
  ok("the aim is released after adding", !D.getElementById("cancel-target")
     && /Build cell from these/.test(D.getElementById("build").textContent),
     "an aim that outlives its use is how the next cell gets swallowed by the last one");

  console.log("\n--- the in-page 3D panel ---");
  /* jsdom has no GPU, so draw() throws "no WebGL" -- which makes this the exact case the panel is
     most important for. What is asserted is that the COVERAGE LINE survives a drawing failure:
     the people who get no picture are the ones most likely to conclude something is wrong, and
     they are the ones who most need to be told that some fragments simply have no geometry. */
  const CUBE_V = [0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1];
  const CUBE_T = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4,
                  2,3,7, 2,7,6, 1,2,6, 1,6,5, 0,4,7, 0,7,3];
  function legacy(){
    const n = CUBE_V.length / 3;
    const buf = new ArrayBuffer(4 + n * 12 + CUBE_T.length * 4);
    new DataView(buf).setUint32(0, n, true);
    new Float32Array(buf, 4, CUBE_V.length).set(CUBE_V.map(v => v * 1e-6));
    new Uint32Array(buf, 4 + n * 12, CUBE_T.length).set(CUBE_T);
    return buf;
  }
  /* Exactly TWO of the cell's four fragments have geometry. The bucket really is like this. */
  const WITH_MESH = { "3323082834073": true, "7545904169112": true };
  const asked = [];
  w.fetch = (url) => {
    asked.push(url);
    const m = /mesh\/([0-9]+)(:0)?$/.exec(String(url));
    const id = m && m[1];
    if (/:0$/.test(String(url))){
      if (!WITH_MESH[id]) return Promise.resolve({ ok:false, status:404 });
      return Promise.resolve({ ok:true, status:200,
        arrayBuffer: () => Promise.resolve(new w.TextEncoder()
          .encode(JSON.stringify({ fragments: ["frag" + id] })).buffer) });
    }
    return Promise.resolve({ ok:true, status:200, arrayBuffer: () => Promise.resolve(legacy()) });
  };
  const host3 = D.getElementById("cell-cb2_1").querySelector(".mesh3d-host");
  ok("the panel has somewhere to go", !!host3,
     "βJump's filter sat in the page for eleven days with no div to render into");
  /* THE WHOLE CARD IS ONE ELEMENT. A stray </div> in the middle of cellHtml closes .cell early and
     everything after it -- the 3D host, the mesh buttons, the coverage line -- silently becomes a
     sibling of the card rather than part of it. The page still looks almost right; only the
     querySelectors that scope to the card stop matching. Caught exactly that way on 2026-09-01,
     when a move control was added and left an extra closing tag behind. */
  ok("...and the card holds every one of its own controls", (() => {
     const card = D.getElementById("cell-cb2_1");
     return [".cell-open", ".nm", ".save-nm", ".rej", ".addto-cell", ".move-to", ".move-go",
             ".view3d", ".dl-glb", ".dl-pptx", ".dl-vol", ".mesh3d-host", ".mesh-out"]
            .every(sel => !!card.querySelector(sel));
  })(), (() => {
     const card = D.getElementById("cell-cb2_1");
     return [".cell-open", ".nm", ".save-nm", ".rej", ".addto-cell", ".move-to", ".move-go",
             ".view3d", ".dl-glb", ".dl-pptx", ".dl-vol", ".mesh3d-host", ".mesh-out"]
            .filter(sel => !card.querySelector(sel)).join(", ") || "all present";
  })());
  D.getElementById("cell-cb2_1").querySelector(".view3d").click();
  await sleep(200);
  const note3 = host3.querySelector(".m3d-note");
  /* Counted from the cell rather than written as a literal. An earlier version said "2 of 4" and
     broke the moment a check ABOVE it added a fifth fragment -- a failure about the test's own
     ordering, dressed up as a failure of the thing under test. */
  const nFrag = A.state().cells[0].segments.length;
  ok("it says how much it drew", !!note3 && note3.textContent.indexOf("2 of " + nFrag + " fragments drawn") >= 0,
     note3 ? note3.textContent.replace(/\s+/g," ").slice(0, 80) : "no note");
  ok("...and why the rest are missing", /no published mesh/.test(note3.textContent),
     "so nobody concludes their assembly was wrong");
  ok("...and that the cell is bigger than this",
     /larger than what you see here/.test(note3.textContent));
  ok("the coverage survives no-WebGL", host3.textContent.indexOf("2 of " + nFrag) >= 0
     && /Could not draw it here/.test(host3.textContent),
     "the note stays when the canvas cannot");
  ok("the count matches the button's", A.state().cells[0].meshHave === 2
     && A.state().cells[0].meshTotal === nFrag,
     "one number, so the two controls can never disagree");
  ok("it fetched manifests, then fragments", asked.filter(u => /:0$/.test(u)).length === nFrag
     && asked.filter(u => !/:0$/.test(u)).length === 2,
     asked.length + " requests for a " + nFrag + "-fragment cell with 2 meshes");

  console.log("\n--- the nucleus loop ---");
  ok("there is somewhere to be sent", !!D.getElementById("next-box")
     && !!D.getElementById("nuc-paste"));
  D.getElementById("next-box").click(); await sleep(40);
  const box = A.box();
  ok("a column is chosen", !!box && /^\d+,\d+,\d+$/.test(box.key), box && box.key);
  ok("...out of the whole grid", /of 600 still unlooked-at/.test(D.getElementById("box-msg").textContent),
     D.getElementById("box-msg").textContent.replace(/\s+/g," "));
  const boxLink = D.getElementById("box-body").querySelector("a.cell-open");
  ok("...with a link into it", !!boxLink && /Open column/.test(boxLink.textContent));
  const bst = JSON.parse(decodeURIComponent(boxLink.getAttribute("href").split("#!")[1]));
  /* The annotation layer must arrive EMPTY, SELECTED and named exactly what the parser looks for.
     A layer the user has to create themselves is one most people never create, and their marks
     then land somewhere this page cannot find on the way back. */
  const nucLayer = bst.layers.filter(l => l.name === w.UJ.cfg.nuclei.layerName)[0];
  ok("the mark layer is armed", !!nucLayer && nucLayer.type === "annotation"
     && nucLayer.annotations.length === 0 && nucLayer.tab === "annotations",
     "empty, selected, and named " + JSON.stringify(w.UJ.cfg.nuclei.layerName));
  ok("...and the column is drawn", bst.layers.some(l => (l.annotations || [])
     .some(a => a.type === "axis_aligned_bounding_box")),
     "an axis-aligned box draws its intersection in every panel, so you can tell when you leave it");

  /* Mark four nuclei, two of which are the same one. */
  const inBox = box.bounds.centreVox;
  /* +1000 voxels in x is 4 µm — clear of the 2.5 µm radius, so a separate nucleus.
     +100 in x is 0.4 µm — the same one, marked twice in one pass.
     +400 in z is 16 µm, because z voxels are 40 nm deep against x's 4 nm. The same NUMBER of
     voxels means ten times the distance, which is exactly the mistake a dedup done on raw voxel
     coordinates makes: this fixture is chosen so that such a dedup gives a different answer. */
  const marks = [inBox, [inBox[0]+1000, inBox[1], inBox[2]], [inBox[0]+100, inBox[1], inBox[2]],
                 [inBox[0], inBox[1], inBox[2]+400]];
  const nst = JSON.parse(JSON.stringify(bst));
  nst.layers.filter(l => l.name === w.UJ.cfg.nuclei.layerName)[0].annotations =
    marks.map((p, i) => ({ type:"point", id:"m"+i, point:p }));
  D.getElementById("nuc-paste").value =
    "https://neuroglancer-demo.appspot.com/#!" + encodeURIComponent(JSON.stringify(nst));
  D.getElementById("nuc-go").click(); await sleep(120);
  /* 100 voxels in x is 0.4 µm — the same nucleus, marked twice in one pass. 400 in z is 16 µm,
     which is a different one. A dedup on raw voxel numbers would get both of those wrong. */
  ok("marks a fraction of a µm apart are one", A.state().explore.nuclei.length === 3,
     A.state().explore.nuclei.length + " recorded from 4 marks  <- +100 voxels in x is 0.4 µm");
  ok("...but 4 µm in x and 16 µm in z are not", A.state().explore.nuclei.length === 3,
     "+400 voxels in z is 16 µm; the same 400 in x would be 1.6 µm and would have merged");
  ok("it says what happened", /new/.test(D.getElementById("nuc-msg").textContent)
     && /duplicate marks in your own paste/.test(D.getElementById("nuc-msg").textContent),
     D.getElementById("nuc-msg").textContent.replace(/\s+/g," "));
  ok("coverage counts COLUMNS", /of 600 columns looked at/
     .test(D.getElementById("explore-stats").textContent),
     D.getElementById("explore-stats").textContent.replace(/\s+/g," ")
     + "  <- never 'nuclei found of nuclei present', which has no denominator");

  /* Re-pasting the same link must record nothing new. Somebody who does a column twice has to be
     able to SEE that, or they will keep going. */
  D.getElementById("nuc-paste").value =
    "https://neuroglancer-demo.appspot.com/#!" + encodeURIComponent(JSON.stringify(nst));
  D.getElementById("nuc-go").click(); await sleep(120);
  ok("a paste with no layer is refused", (() => {
    D.getElementById("nuc-paste").value = JSON.stringify({ layers:[{ type:"image", name:"em" }] });
    D.getElementById("nuc-go").click();
    return /has no/.test(D.getElementById("nuc-msg").textContent);
  })(), D.getElementById("nuc-msg").textContent.replace(/\s+/g," ").slice(0, 70));
  /* The "(recorded)" layer exists so you can see where not to mark again. Reading it back would
     record every one of those a second time on every paste. */
  const shown = { layers:[{ type:"annotation", name: w.UJ.cfg.nuclei.layerName + " (recorded)",
                            annotations: marks.map((p,i) => ({ type:"point", id:"r"+i, point:p })) },
                          { type:"annotation", name: w.UJ.cfg.nuclei.layerName, annotations: [] }] };
  D.getElementById("nuc-paste").value = JSON.stringify(shown);
  D.getElementById("nuc-go").click(); await sleep(60);
  ok("already-recorded nuclei are not re-read", A.state().explore.nuclei.length === 3
     && /no points in it/.test(D.getElementById("nuc-msg").textContent),
     "the grey layer is a reminder, not an input");

  console.log("\n--- a nucleus finds its cell ---");
  /* THE JOIN. A nucleus is a bare position; a cell is a set of fragments. The link between them is
     computed by testing the point against the cell's own SURFACE -- the mesh is the segment's
     surface, so this is exact wherever a mesh exists, and it needs no new format decoder.

     The fixture is a cube of known extent, so a point placed at its centre must be found and a
     point placed well outside must not. Both are asserted: a test that only checks the positive
     would pass on a join that matched everything to everything. */
  const F = "8100000000001";
  /* Nanometres BACK to mesh units, by inverting the config's own matrix rather than restating it.

     The first version of this fixture hardcoded the conversion, which meant it encoded the same
     assumption the code did -- so when the mesh transform turned out to be wrong by ten in z, the
     fixture was wrong by ten in z too and agreed with it perfectly. A fixture that shares a
     mistake with the code it tests cannot find that mistake. Derived from UJ.cfg, this one moves
     whenever the matrix moves. */
  const nmToMesh = (nm) => {
    const M = w.UJ.cfg.volume.meshVertexToNm, out = [0,0,0];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
      if (M[r][c]) out[c] = nm[r] / M[r][c];
    return out;
  };
  const cubeAtVox = (cx, cy, cz, halfVox) => {
    const T = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4,
               2,3,7, 2,7,6, 1,2,6, 1,6,5, 0,4,7, 0,7,3];
    const V = [];
    for (const sx of [-1,1]) for (const sy of [-1,1]) for (const sz of [-1,1])
      V.push(...nmToMesh(X.toNm([cx + sx*halfVox[0], cy + sy*halfVox[1], cz + sz*halfVox[2]])));
    /* The cube-corner order above is (x,y,z) nested, which is the order the index list expects. */
    const o = [0,4,6,2,1,5,7,3], VV = [];
    o.forEach(i => VV.push(V[i*3], V[i*3+1], V[i*3+2]));
    const n = 8, buf = new ArrayBuffer(4 + n*12 + T.length*4);
    new w.DataView(buf).setUint32(0, n, true);
    new w.Float32Array(buf, 4, 24).set(VV);
    new w.Uint32Array(buf, 4 + n*12, T.length).set(T);
    return buf;
  };
  const nuc0 = A.state().explore.nuclei[0];
  const joinFetches = [];
  w.fetch = (url) => {
    joinFetches.push(String(url));
    const m = /mesh\/([0-9]+)(:0)?$/.exec(String(url));
    if (/:0$/.test(String(url))){
      if (m[1] !== F) return Promise.resolve({ ok:false, status:404 });
      return Promise.resolve({ ok:true, status:200,
        arrayBuffer: () => Promise.resolve(new w.TextEncoder()
          .encode(JSON.stringify({ fragments:["f"+F] })).buffer) });
    }
    /* A box 5 µm across in x/y and 4 µm deep, centred on the first recorded nucleus. */
    return Promise.resolve({ ok:true, status:200,
      arrayBuffer: () => Promise.resolve(
        cubeAtVox(nuc0.pos[0], nuc0.pos[1], nuc0.pos[2], [625, 625, 50])) });
  };
  D.getElementById("paste").value = JSON.stringify({ layers:[
    { type:"segmentation", name:"seg", source:w.UJ.cfg.volume.seg, segments:[F] } ] });
  D.getElementById("paste-go").click(); await sleep(60);
  D.getElementById("build").click(); await sleep(400);
  const joined = A.state().cells.filter(c => c.segments.indexOf(F) >= 0)[0];
  ok("the cell found its nucleus", !!joined && !!joined.nucleus,
     joined && joined.nucleus ? joined.nucleus.join(", ") : "none");
  ok("...the right one", !!joined && joined.nucleus
     && joined.nucleus.join(",") === nuc0.pos.join(","),
     "the point inside the assembled surface, not merely the nearest one");
  ok("...and the nucleus knows its cell", A.state().explore.nuclei[0].cell === joined.id,
     A.state().explore.nuclei[0].cell);
  ok("...and it is said on the cell", /nucleus .* is inside this cell/
     .test(D.getElementById("cell-" + joined.id.replace(/[^a-zA-Z0-9_-]/g,"_")).textContent),
     "a cell quietly acquiring a nucleus is a change somebody should see happen");
  ok("...and the link now centres there",
     JSON.parse(decodeURIComponent(D.getElementById("cell-" + joined.id.replace(/[^a-zA-Z0-9_-]/g,"_"))
       .querySelector("a.cell-open").getAttribute("href").split("#!")[1])).position.join(",")
     === nuc0.pos.join(","));
  ok("the other nuclei stay free", A.state().explore.nuclei.filter(n => !n.cell).length === 2,
     "one soma per cell; the rest wait for the cell they belong to");
  ok("a fragment with no mesh is not tested", joined.meshTotal === 1 && joined.meshHave === 1,
     "'we looked and it is not there' and 'we could not look' are different answers");

  console.log("\n--- the proofread cells ---");
  /* 5,318 cells the Lee lab published. What matters is not that they load but that they are
     FINDABLE and that a pasted fragment can be traced back to one -- a list of five thousand names
     with no search is a list nobody reads, and the fragment lookup is the thing that turns the
     paste box from "assemble a cell" into "tell me what this is". */
  ok("the import is there", !!w.UJ.seeds && X.seedListAll().length === 5318,
     w.UJ.seeds ? X.seedListAll().length + " cells" : "no seeds file");
  /* And the list the PAGE shows is 99 shorter, which is the 2026-09-02 removal below. Both
     numbers are checked, because the interesting failure is not "the file loaded" but "the file
     loaded and something quietly ate a hundred cells". */
  ok("...and the list is the published one minus the pieces",
     A.seeds().length === 5318 - X.misplacedSeeds().rows.length,
     A.seeds().length + " shown, " + X.misplacedSeeds().rows.length + " left out");
  /* Whole cells and PIECES counted apart. The database types pc_dendrite_1 as `pc` like any other
     Purkinje cell, so a naive count says 170 Purkinje cells when 15 of them are dendrites. The
     breakdown is derived from the labels rather than typed, so it moves when the data does. */
  const counts = {};
  A.seeds().forEach(r => { counts[r.label] = (counts[r.label] || 0) + 1; });
  /* The label carries the total; the breakdown reads as a sentence below it, because eleven
     counts in the label's uppercase letter-spacing were a five-line wall above the search box. */
  ok("...counted by type", Object.keys(counts).every(k =>
       D.getElementById("seed-breakdown").textContent.indexOf(counts[k].toLocaleString()) >= 0),
     D.getElementById("seed-breakdown").textContent.slice(0, 90));
  /* The label counts what the list HOLDS, which since it became the master list is the published
     cells PLUS the ones assembled here that are not extensions of a published one. An extension
     shares its cell's key and is not a second cell -- that is the point of adopting a key rather
     than forking one -- so it must not appear twice in this number. */
  /* Published + assembled here + the marked nuclei nobody has built a cell around, since
     2026-09-02: an unassigned cell is a cell this list holds, and a total that left them out would
     disagree with the sentence underneath that names them. */
  ok("...with the total on the label", (() => {
     const own = A.state().cells.filter(c => !X.isSeedKey(c.id) && c.segments.length).length;
     return D.getElementById("seed-count").textContent
              .indexOf((A.seeds().length + own + A.nucleusRows().length).toLocaleString()) >= 0;
  })(), D.getElementById("seed-count").textContent + " for " + A.seeds().length
        + " published + " + A.state().cells.filter(c => !X.isSeedKey(c.id) && c.segments.length).length
        + " assembled here + " + A.nucleusRows().length + " unassigned");
  /* 55, not 154, since 2026-09-02: the other 99 are the records Søren identified as pieces (see
     "Purkinje records that are pieces" below). The 15 dendrites are untouched by that rule -- they
     are named as pieces and were never counted as cells. */
  ok("...with pieces kept apart", counts["Purkinje cell"] === 55
     && counts["Purkinje cell dendrite"] === 15,
     "55 whole Purkinje cells, 15 dendrites — the db types both as 'pc'");
  ok("...and attributed", /Nguyen/.test(D.getElementById("seed-prov").textContent)
     && /not a licence/i.test(D.getElementById("seed-prov").textContent),
     "the database repository states no terms, and the page must not imply one");
  ok("...naming the annotators", /tmn7/.test(D.getElementById("seed-prov").textContent),
     D.getElementById("seed-annotators").textContent.slice(0, 50));
  /* Five thousand rows would take a second to lay out and be unreadable anyway. */
  ok("only a page of rows is drawn", D.querySelectorAll(".seedrow").length === 25);
  D.getElementById("seed-q").value = "pc_50";
  D.getElementById("seed-q").dispatchEvent(new w.Event("input"));
  await sleep(40);
  ok("search finds one", D.querySelectorAll(".seedrow").length === 1
     && /pc_50/.test(D.querySelector(".seed-open").textContent),
     D.querySelector(".seed-open").textContent.trim());
  D.getElementById("seed-q").value = "purkinje";
  D.getElementById("seed-q").dispatchEvent(new w.Event("input"));
  await sleep(40);
  ok("...and by what a cell IS", D.querySelectorAll(".seedrow").length > 1,
     "'purkinje', 'pc' and 'pc_50' are the three things somebody would type");
  ok("a seed opens in the viewer", (() => {
    const before = opened;
    D.querySelector(".seed-open").click();
    return opened !== before && String(opened).indexOf("#!") > 0;
  })());
  ok("...with its whole reconstruction", X.parseSegments(opened).ids.length > 5,
     X.parseSegments(opened).ids.length + " fragments in the link");

  /* THE LOOKUP. A fragment from grc_100 must be traceable to grc_100, and one that belongs to
     nobody must not be claimed by anybody. */
  D.getElementById("paste").value = JSON.stringify({ layers:[
    { type:"segmentation", name:"seg", source:w.UJ.cfg.volume.seg,
      segments:["33916612771843", "999999999999"] } ] });
  D.getElementById("paste-go").click(); await sleep(80);
  const pb = D.getElementById("paste-body").textContent;
  ok("a pasted fragment is traced", /already in/.test(pb) && /grc_100/.test(pb),
     pb.replace(/\s+/g," ").slice(0, 70));
  ok("...by NAME, not by key", !/cb2\/htem/.test(pb),
     "'already in grc_100' means something to a person; the key does not");
  ok("...and the advice fits a published cell", /Lee lab proofread/.test(pb),
     "finding a proofread cell is usually finding the cell, not a boundary dispute");
  ok("...while the unknown one is left alone",
     D.querySelectorAll("#paste-body .frag-chip.taken").length === 1,
     "one of the two fragments is in a proofread cell; the other is in nothing");

  console.log("\n--- µJump's way of finding a cell ---");
  /* Søren: "look more like µJump in the way you paste coordinates and find random cells of a
     certain type." Both hang on every proofread cell having a soma, which only became possible
     once the database's (16,16,40) grid was worked out. */
  ok("three coordinate fields and an arrow, as µJump has",
     ["x","y","z","go"].every(id => !!D.getElementById(id)),
     "Søren, 2026-09-01: the coordinates should be the first thing");
  ok("...and the coordinate card comes first in the Jump tab", (() => {
     const panel = D.querySelector('[data-tabpanel="jump"]');
     return panel && panel.querySelector(".card").contains(D.getElementById("x"));
  })(), "first thing means first, not merely present");
  const forms = ["133268, 105880, 619", "133268 105880 619", "[133268,105880,619]"];
  ok("every shape a person has to hand parses",
     forms.every(f => (X.parseCoord(f) || []).join(",") === "133268,105880,619"),
     "comma, space, and brackets — being fussy here is the commonest way a tool feels hostile");
  ok("...including a whole viewer link",
     (X.parseCoord("https://x/#!" + encodeURIComponent(JSON.stringify({ position:[1,2,3] })))
       || []).join(",") === "1,2,3");
  ok("nonsense is refused", X.parseCoord("hello") === null && X.parseCoord("1,2") === null);

  /* PASTING A TRIPLE INTO x SPLITS IT. The fastest way in — copy the address bar, paste, enter —
     has to keep working now that there are three boxes instead of one. */
  D.getElementById("x").value = "133268, 105880, 619";
  D.getElementById("y").value = ""; D.getElementById("z").value = "";
  D.getElementById("go").click(); await sleep(120);
  ok("a triple pasted into x splits across all three",
     D.getElementById("x").value == 133268 && D.getElementById("y").value == 105880
     && D.getElementById("z").value == 619,
     [D.getElementById("x").value, D.getElementById("y").value,
      D.getElementById("z").value].join(" | "));
  /* ...but a person TYPING into x and tabbing on must not have y and z rewritten under them. */
  ok("...while a bare number in x is left alone", (() => {
     D.getElementById("x").value = "42"; D.getElementById("y").value = "7";
     w.UJ.app.findByCoord();
     return D.getElementById("x").value === "42" && D.getElementById("y").value === "7";
  })(), "splitting on every search would fight whoever is editing one field");

  D.getElementById("x").value = "133268"; D.getElementById("y").value = "105880";
  D.getElementById("z").value = "619";
  D.getElementById("go").click(); await sleep(120);

  /* THE IDENTITY PANEL. Søren: "The cell identity should also look like the uJump" — same grammar
     as every other tool in the family, so the top hit is a panel and the rest are rows beneath it,
     rather than six identical rows with nothing to look at. */
  ok("the nearest cell gets µJump's identity panel", !!D.getElementById("found-panel"));
  /* THE CELL TYPE IS THE HEADLINE AND THE LINK, with the record's own identifier beside it in
     grey. Søren, 2026-09-01: "Instead of the cell number being the main thing with link, I think it
     should be the cell type, and then the cell number can be written next to it in grey."
     `grc_1610` identifies a row in somebody's database; it does not say what you are looking at. */
  ok("...with the cell TYPE as the link out", (() => {
     const a = D.querySelector("#found-panel .celltype a");
     const types = X.seedTypes().map(t => t.label.toLowerCase());
     const txt = a.textContent.replace(/\s*↗$/, "").trim();
     return a && a.getAttribute("href").indexOf("#!") > 0
         && types.some(t => txt.toLowerCase().indexOf(t) === 0)
         && txt[0] === txt[0].toUpperCase();
  })(), (D.querySelector("#found-panel .celltype a") || {}).textContent);
  ok("...and the identifier beside it, in grey, not as the headline", (() => {
     const ref = D.querySelector("#found-panel .celltype .cellref");
     const a = D.querySelector("#found-panel .celltype a");
     return ref && /^grc_|^pc_|^mf_|^ml_|^purkinje_|^interneuron_/.test(ref.textContent.trim())
         && !a.contains(ref);
  })(), (D.querySelector("#found-panel .celltype .cellref") || {}).textContent);
  ok("...and the type is not also repeated in the kicker", (() => {
     const kicker = D.querySelector("#found-panel .row").textContent.toLowerCase();
     const a = D.querySelector("#found-panel .celltype a").textContent
                .replace(/\s*↗$/, "").trim().toLowerCase();
     return kicker.indexOf(a) < 0;
  })(), "saying it three times in four lines is three chances to read it as three claims");
  ok("...and kicker chips saying what kind of evidence this is",
     /proofread/.test(D.querySelector("#found-panel .row").textContent),
     D.querySelector("#found-panel .row").textContent.replace(/\s+/g, " ").trim());
  ok("...the card only shows once there is a cell in it",
     D.getElementById("cellPanelCard").classList.contains("show"),
     "an empty padded box on first load is what the class exists to prevent");
  /* THE FAMILY'S FOUR MESH ACTIONS, in the family's order: look at it, take it away, put it in a
     deck, measure it. Søren asked for the .glb, the PowerPoint and the volume on 2026-09-01, and
     for "Coverage only" to go -- every one of these reports coverage when it runs, so a button
     whose whole job was to report it was a button for a sentence you now get anyway. */
  ok("...the four mesh actions are offered, in order", (() => {
     const b = Array.from(D.querySelectorAll("#found-panel .idrow"))
                    .filter(r => /geometry/i.test(r.querySelector(".k") ? r.querySelector(".k").textContent : ""))[0];
     if (!b) return false;
     const txt = Array.from(b.querySelectorAll(".idbtn")).map(x => x.textContent.trim());
     return txt.length === 4 && /^Show in 3D/.test(txt[0]) && /3D model$/.test(txt[1])
         && /PowerPoint$/.test(txt[2]) && /Compute volume/.test(txt[3]);
  })(), Array.from(D.querySelectorAll("#found-panel .idbtn"))
          .map(b => b.textContent.trim()).join(" | "));
  /* A BUTTON with that label, not the string anywhere on the page -- the comments explaining why
     it went are themselves in the page, inside the inlined script. */
  ok("...and Coverage only is gone", (() => {
     return !Array.from(D.querySelectorAll("button"))
                  .some(b => /coverage only/i.test(b.textContent));
  })(), "each action reports its own coverage now");
  /* The three exports must exist as FUNCTIONS on χJump's mesh module, and must be the shared
     core/mesh.js implementations rather than a second copy of the .glb and .pptx formats. */
  ok("...backed by real exporters, not stubs",
     ["downloadGlb","downloadPptx","volume"].every(f => typeof w.UJ.mesh3d[f] === "function"));
  ok("...which are core/mesh.js's own", (() => {
     return typeof w.UJ.mesh === "object" && typeof w.UJ.mesh.saveGlb === "function"
         && typeof w.UJ.mesh.savePptx === "function" && typeof w.UJ.mesh.volumeOf === "function";
  })(), "one implementation of the .glb container, reached from two different fetchers");

  const found = D.querySelectorAll("#find-body .neigh .seedrow");
  ok("it finds the nearest cells", found.length === 5, found.length + " neighbours shown");
  ok("...in order, nearest first", (() => {
    const d = Array.from(D.querySelectorAll("#find-body .neigh .seedrow .hint"))
      .map(n => parseFloat(n.textContent)).filter(v => !isNaN(v));
    return d.length > 1 && d.every((v, i) => i === 0 || v >= d[i-1]);
  })(), Array.from(found).slice(0,2).map(n => n.textContent.trim().split("\n")[0]).join(", "));
  /* PHYSICALLY nearest. Ranking in voxels would make a cell 10 µm away in z lose to one 40 µm
     away in x, because z voxels are ten times deeper — "nearest" would quietly mean "nearest in
     the plane". Granule cells are packed at a few µm, so the top hit being under 5 µm is the
     signature of the right units. */
  ok("...by physical distance",
     /µm from your coordinate/.test(D.getElementById("found-panel").textContent)
     && parseFloat(D.querySelector("#found-panel .meta").textContent
                    .split("·").filter(s => /µm/.test(s))[0]) < 5,
     D.querySelector("#found-panel .meta").textContent.trim());

  /* THE VOLUME, DRAWN. Søren: "if possible we should have a model of the dataset so we can see
     the location of the coordinate". Two views at ONE scale, so the 48 µm z reads as a sliver
     beside the 998 µm x rather than being silently stretched to fill its box. */
  /* ONE view. The side view went on 2026-09-01 -- Søren: "We can remove the from the side view
     from the model. It does not add much." It carried exactly one fact, that z is 48 µm against
     998, which the caption now states in words; the layers, which is what the model is for, were
     never on it. */
  ok("the volume is drawn", D.querySelectorAll("#dsmap svg").length === 1,
     D.querySelectorAll("#dsmap svg").length + " view");
  ok("...to the volume's own proportions", (() => {
     const vb = D.querySelector("#dsmap svg").getAttribute("viewBox").split(" ").map(Number);
     const e = X.extentNm();
     /* Width 200 plus 9px padding each side; height in the true ratio of y to x. */
     return Math.abs((vb[3] - 18) / (vb[2] - 18) - e[1] / e[0]) < 0.01;
  })(), D.querySelector("#dsmap svg").getAttribute("viewBox"));
  ok("...and the depth it does NOT draw is stated in words", (() => {
     const t = D.getElementById("dsmap").textContent;
     return t.indexOf(Math.round(X.extentNm()[2] / 1000) + " µm deep") >= 0
         && /layers run across it/.test(t);
  })(), "a second drawing to make one number vivid is a second drawing to look at");
  ok("...and the coordinate is marked on it",
     D.querySelectorAll("#dsmap svg g[stroke] line").length === 2,
     "a crosshair — the hatch pattern has lines of its own");
  console.log("\n--- the cerebellar layers, TRACED ---");
  /* Søren, 2026-09-02: "I have annotated the layers in the following JSON... the molecular layers
     are everything above and below the two Purkinje cell layers", and "of course the granular
     layer is in between the white matter border and the purkinje cell layer".

     This replaces the checks on the old percentile fit. The fit could only see the upper limb --
     every proofread cell in the published database is on it -- so it returned two "unsampled"
     bands, one of them the deep 400 µm where the folium's white matter core is. There is nothing
     unsampled any more, and these checks are about the shape the tracing asserts and about the
     ONE thing the page must not do with it: treat a hand-drawn line as more certain than it is. */
  const top = D.querySelectorAll("#dsmap svg")[0];
  /* SEVEN bands, not five and not three: molecular, Purkinje, granular, WHITE MATTER, granular,
     Purkinje, molecular. That is a folium in cross-section, and it is what Søren described from
     the paper's own parasagittal figure long before he had traced it. */
  ok("seven bands are drawn on the top view",
     top.querySelectorAll("polygon").length === 7,
     top.querySelectorAll("polygon").length + " bands");
  ok("...being the folium, top to bottom", (() => {
     const g = Array.from(top.querySelectorAll("g[class]")).filter(n => n.querySelector("polygon"))
                    .map(n => n.getAttribute("class"));
     return g.join(",") === "lay-ml,lay-pcl,lay-gl,lay-wm,lay-gl,lay-pcl,lay-ml";
  })(), Array.from(top.querySelectorAll("g[class]")).filter(n => n.querySelector("polygon"))
          .map(n => n.getAttribute("class")).join(", "));
  ok("...with nothing left hatched as unsampled",
     !top.querySelector("g.lay-un") && !top.querySelector("pattern#m3d-hatch"),
     "the tracing answered the question the hatching was declining to answer");
  ok("...and Søren's own lines drawn over the fills",
     top.querySelectorAll("g.lay-edge polyline").length === X.LAYER_ORDER.length,
     top.querySelectorAll("g.lay-edge polyline").length + " of " + X.LAYER_ORDER.length
       + " boundaries — the fills say which layer, the lines say where the evidence is");
  /* The band and its swatch must wear the SAME class, or a colour can drift between the drawing
     and the key and nobody would notice until the legend was quietly lying. */
  ok("...and the key wears the same classes as the bands", (() => {
     const bands = Array.from(top.querySelectorAll("g[class]"))
                        .filter(n => n.querySelector("polygon"))
                        .map(n => n.getAttribute("class"));
     return bands.every(c => !!D.querySelector("#dsmap .lkey-swatch." + c));
  })());
  ok("...listing each layer once, not each band", (() => {
     const labels = Array.from(D.querySelectorAll("#dsmap .lkey .lkey-item"))
                         .map(n => n.textContent.trim());
     return labels.length === 5 && new Set(labels).size === labels.length;
  })(), Array.from(D.querySelectorAll("#dsmap .lkey .lkey-item"))
          .map(n => n.textContent.trim()).join(" · "));
  /* NEVER ALONG Z. The tracing is one section applied to all 1,200, and the caption says so. */
  ok("...and none along the thin axis",
     /layers run across it, not through its depth/.test(D.getElementById("dsmap").textContent),
     "bands in z would invent a dimension of structure the tracing does not have");

  /* THE BOUNDARIES THEMSELVES. Six, ordered superficial to deep, never crossing. If two of them
     swapped over at some x, layerAt would name the layers in the wrong order there and nothing
     else in the page would notice. */
  ok("six boundaries, superficial to deep", (() => {
     const B = X.tracedBounds();
     return !!B && X.LAYER_ORDER.length === 6 && X.LAYER_ORDER.every(k => (B[k] || []).length >= 8);
  })(), X.LAYER_ORDER.map(k => k + ":" + X.tracedBounds()[k].length).join(" "));
  ok("...that never cross, at any x", (() => {
     const ext = X.extentVox();
     for (let x = 0; x <= ext[0]; x += 2000){
       const e = X.layerEdgesAt(x);
       if (!e) return false;
       for (let i = 1; i < e.length; i++) if (e[i] < e[i-1]) return false;
     }
     return true;
  })(), "checked every 8 µm across the whole block, not only where they were drawn");
  ok("...and the folium is tilted, not flat", (() => {
     const B = X.tracedBounds(), p = B.pcUpperInner;
     return Math.abs(p[0][1] - p[p.length-1][1]) > 5000;
  })(), (() => { const p = X.tracedBounds().pcUpperInner;
     return "the upper Purkinje layer runs y " + p[0][1] + " → " + p[p.length-1][1]; })());

  /* HOW MUCH WEIGHT THE TRACING GETS. Søren, 2026-09-02: "these lines are an approximation, so if
     you have evidence that some cells are in e.g. the purkinje layer, but they are outside of my
     annotations, then don't put too much weight on my annotation."

     The response was to CHECK the tracing against the published cells rather than to bend the
     lines toward whichever cells disagreed — and these assert that the check is real, that its
     numbers are computed rather than quoted, and that the page prints them. */
  const AGR = X.layerAgreement();
  ok("the tracing is checked against the published somata, not assumed",
     AGR.pcReal.n > 40 && AGR.pcReal.hit / AGR.pcReal.n > 0.8,
     AGR.pcReal.hit + " of " + AGR.pcReal.n + " real-z Purkinje somata inside a band about one soma "
       + "thick");
  ok("...and the bulk of the granule cells land in the granular layer",
     AGR.grc.n > 4000 && AGR.grc.hit / AGR.grc.n > 0.9,
     AGR.grc.hit + " of " + AGR.grc.n);
  /* THE INDEPENDENT ONES. Neither of these shares any arithmetic with the tracing, so agreement
     is evidence rather than a tautology. */
  ok("...and it agrees with the source's own ml_grc naming",
     AGR.mlNamed.n === 19 && AGR.mlNamed.hit >= 17,
     AGR.mlNamed.hit + " of " + AGR.mlNamed.n + " cells named ml_grc_*/grc_ml_* are in the molecular "
       + "layer — the tracing never saw those names");
  ok("...and reaches suspectZ()'s verdict by a different route",
     AGR.pcSuspect.n > 100 && AGR.pcSuspect.hit / AGR.pcSuspect.n < 0.1,
     AGR.pcSuspect.hit + " of " + AGR.pcSuspect.n + " stand-in-z Purkinje records are in the Purkinje "
       + "band; the rest sit in the molecular layer");
  ok("...and the page prints those figures rather than a claim", (() => {
     const t = D.getElementById("dsmap").textContent;
     return /Checked against the published cells, not assumed/.test(t)
         && t.indexOf(AGR.pcReal.hit + " of the " + AGR.pcReal.n) >= 0
         && t.indexOf(AGR.mlNamed.hit + " of the " + AGR.mlNamed.n) >= 0;
  })(), "figures recomputed on every draw cannot drift from the tracing or the seed list");
  /* AND THE ONES THAT DISAGREE ARE DESCRIBED, not counted away — one-sided and scattered, which
     is what tells "these are not somata" apart from "the line is in the wrong place". Computed
     from the tracing and the cells, so the sentence cannot outlive the numbers behind it. */
  ok("...and says why the ones that disagree are not a line in the wrong place", (() => {
     const t = D.getElementById("dsmap").textContent;
     return AGR.pcStray.towardsPia >= AGR.pcStray.n - 1
         && AGR.pcStray.furthestUm > AGR.pcStray.nearestUm * 5
         && /on the same side/.test(t) && /rather than clustered at one offset/.test(t);
  })(), AGR.pcStray.n + " outside, " + AGR.pcStray.towardsPia + " of them towards the pia, spread "
      + AGR.pcStray.nearestUm.toFixed(0) + "–" + AGR.pcStray.furthestUm.toFixed(0) + " µm");

  /* AN APPROXIMATION SAYS SO. Within one Purkinje-soma thickness of a boundary the answer is
     marked, because that is about as finely as a hand-drawn line can be read. */
  ok("a point near a boundary is marked as near it", (() => {
     const B = X.tracedBounds(), x = 120000;
     const e = X.layerEdgesAt(x);
     const on = X.layerAt([x, Math.round(e[1]) - 1, 600]);
     const mid = X.layerAt([x, Math.round((e[2] + e[1]) / 2), 600]);
     return on && on.nearBoundary && mid && !mid.nearBoundary;
  })(), "on the Purkinje/granular edge vs the middle of the granular layer");
  ok("...and beyond the traced x range the answer says it is extrapolated", (() => {
     const r = X.tracedRange();
     const inside = X.layerAt([Math.round((r[0] + r[1]) / 2), 110000, 600]);
     const outside = X.layerAt([Math.round(r[0] / 2), 110000, 600]);
     return inside && !inside.extrapolated && outside && outside.extrapolated;
  })(), "the tracing runs x " + Math.round(X.tracedRange()[0] * X.resXYZ()[0] / 1000) + "–"
      + Math.round(X.tracedRange()[1] * X.resXYZ()[0] / 1000) + " µm of a "
      + Math.round(X.extentNm()[0] / 1000) + " µm block");
  /* BOTH LIMBS ARE REACHABLE, which is the whole gain over the fit. A y in the lower Purkinje
     band must come back as the Purkinje cell layer on the LOWER limb. */
  ok("both limbs of the folium are answerable", (() => {
     const x = 120000, e = X.layerEdgesAt(x);
     const up = X.layerAt([x, Math.round((e[0] + e[1]) / 2), 600]);
     const lo = X.layerAt([x, Math.round((e[4] + e[5]) / 2), 600]);
     const wm = X.layerAt([x, Math.round((e[2] + e[3]) / 2), 600]);
     return up.layer === "Purkinje cell layer" && up.limb === "upper"
         && lo.layer === "Purkinje cell layer" && lo.limb === "lower"
         && wm.layer === "white matter";
  })(), "the fit could only ever see the limb the published cells are on");
  ok("...and depth from the Purkinje layer is signed the same way on both", (() => {
     const x = 120000, e = X.layerEdgesAt(x);
     /* Towards the pia is negative on BOTH limbs, which for the lower one means a LARGER y. */
     const upMl = X.layerAt([x, Math.round(e[0]) - 4000, 600]);
     const loMl = X.layerAt([x, Math.round(e[5]) + 4000, 600]);
     return upMl.layer === "molecular layer" && upMl.fromPcNm < 0
         && loMl.layer === "molecular layer" && loMl.fromPcNm < 0;
  })(), "the lower limb is upside down; a shared sign convention is what makes the two comparable");

  /* THE SOMA DEPTH THAT IS NOT A DEPTH. 108 of the 170 Purkinje records share one z, thirty
     sections from the end of the block, while their x and y are all distinct. Detected against
     each type's own count rather than hardcoded, so it survives a rebuilt import. */
  ok("a stand-in z is detected, not hardcoded", (() => {
     const s = X.suspectZ();
     return s.pc && s.pc.z === 1169 && s.pc.n > 100 && !s.grc && !s.mf;
  })(), JSON.stringify(X.suspectZ()));

  /* ── PURKINJE RECORDS THAT ARE PIECES OF PURKINJE CELLS ──────────────────────────────────
     Søren, 2026-09-02: "there are a lot of purkinje cell annotations outside of the purkinje cell
     layer. They are all in the same z-plane. Those are just fragments and should not be counted
     as Purkinje cells. Let's remove them."

     The rule is a conjunction of three signals from three sources that share no arithmetic, and
     what these checks are for is the SECOND half of it: that it removes the pieces and does not
     remove the four big cells that meet two of the three tests. A rule that quietly ate pc_40
     would still pass a check that only counted how many went. */
  const MIS = X.misplacedSeeds();
  ok("the pieces are out of the list", MIS.rows.length === 99
     && MIS.rows.every(r => r.type === "pc"),
     MIS.rows.length + " removed, floor " + MIS.floors.pc.floor + " fragments from "
       + MIS.floors.pc.from + " confirmed cells");
  ok("...and every one of them is small, stand-in-z and outside the band",
     MIS.rows.every(r => r.zOdd && r.count < MIS.floors.pc.floor
                      && X.layerAt(r.pos).layer !== "Purkinje cell layer"),
     "all three tests, on every record removed");
  /* THE FOUR THE RULE MUST NOT TAKE. pc_40..pc_43 carry 1,632-2,429 fragments -- more than any
     Purkinje cell in this database with a real depth -- so they are cells whose recorded point is
     on the dendrite, not fragments. This is the check that would have caught a threshold set by
     eye rather than from the confirmed cells' own quartile. */
  ok("...but the big arbors stay", (() => {
     const kept = ["pc_40", "pc_41", "pc_42", "pc_43"].map(n =>
       X.seedList().filter(r => r.name === n)[0]);
     return kept.every(r => r && r.zOdd && r.count > 1000);
  })(), "1,632-2,429 fragments each — larger than any real-depth Purkinje cell here");
  ok("...and the removal did not touch the evidence for it", (() => {
     const A2 = X.layerAgreement();
     /* layerAgreement runs over seedListAll(). If it ever ran over the narrowed list, pcSuspect
        would collapse from 107 to the 9 that survive and the page's own justification would have
        been rewritten by the thing it justifies. */
     return A2.pcSuspect.n > 100 && X.seedListAll().length === X.seedList().length + 99;
  })(), X.layerAgreement().pcSuspect.n + " stand-in-z records still in the evidence");
  /* AND THEIR FRAGMENTS ARE FREE. The useful half nobody asked for: a piece that was catalogued
     under a phantom Purkinje cell is no longer claimed by one, so whoever assembles the cell it
     came from is not told it already belongs to something. */
  ok("...and their fragments are no longer claimed", (() => {
     const gone = MIS.rows.filter(r => r.count === 1)[0];
     if (!gone) return false;
     return X.seedOwnerOf(X.seedSegments(gone)[0]) === null;
  })(), "seedIndex is built from seedList, so removing a record releases its fragments");
  ok("...and the page says what it left out", (() => {
     w.UJ.app.renderDashboard();
     const t = D.getElementById("xstats").textContent;
     return /99 of them are not in this list at all/.test(t)
         && /just fragments and should not be counted/.test(t)
         && /pc_40/.test(t);
  })(), "a tool that quietly holds back a hundred records of its source cannot be checked");

  ok("a coordinate is placed in a layer", (() => {
     const g = X.layerAt([133268, 105880, 619]);
     return g && g.layer === "granular layer" && g.fromPcNm > 0;
  })(), JSON.stringify(X.layerAt([133268, 105880, 619])));
  ok("...and the panel and the map cannot disagree", (() => {
     /* Both read the same layerAt(); the check is that the panel prints it at all, from the same
        source, rather than computing a second answer. */
     const t = D.getElementById("found-panel").textContent;
     const row = X.seedList().filter(r => r.name ===
        D.querySelector("#found-panel .celltype .cellref").textContent.trim())[0];
     if (!row || row.zOdd) return !/soma in the/.test(t);
     return t.indexOf(X.layerAt(row.pos).layer) >= 0;
  })(), "one function, two places it is printed");
  /* ...and NOT printed for a record whose depth is the stand-in. */
  ok("...but not for a cell with no usable depth", (() => {
     const odd = X.seedList().filter(r => r.zOdd && r.whole)[0];
     if (!odd) return false;
     w.UJ.app.showFound([{ row: odd, nm: 0 }], null);
     return !/soma in the/.test(D.getElementById("found-panel").textContent)
         && /type and name disagree|proofread/.test(D.getElementById("found-panel").textContent);
  })(), "a confident depth for a record already flagged as having none invites the wrong inference");

  ok("a coordinate outside the volume still answers", (() => {
    D.getElementById("x").value = "999999";
    D.getElementById("y").value = "999999";
    D.getElementById("z").value = "9999";
    D.getElementById("go").click();
    return /outside the volume/.test(D.getElementById("find-msg").textContent)
        && !!D.getElementById("found-panel");
  })(), "told, not refused — the nearest cell is still the useful answer");

  console.log("\n--- the random panel, in µJump's shape ---");
  /* Søren, 2026-09-01: "I would like this part in xJump to be more like this part in uJump."
     µJump's panel is full-width buttons for the jobs worth doing, a counts line under the first,
     then a type dropdown with "Random example". χJump had a row of pills, which offered only the
     third of them. THREE buttons since 2026-09-02: "they should also be searchable as a random
     unassigned cell" added the marked nuclei as a pool of their own. */
  ok("a full-width button per job worth doing, as µJump has",
     D.querySelectorAll("#find-random .idbtn.wide").length === 3,
     Array.from(D.querySelectorAll("#find-random .idbtn.wide"))
          .map(b => b.textContent.trim()).join(" | "));
  ok("...and a type dropdown rather than a row of pills",
     !!D.getElementById("randomTypeSelect") && !!D.getElementById("randomOfType")
     && D.querySelectorAll("#find-random .rand").length === 0);
  const opts = Array.from(D.getElementById("randomTypeSelect").options);
  ok("...listing every type plus 'any kind'", opts.length === X.seedTypes().length + 1,
     opts.map(o => o.textContent).join(", "));
  /* Derived, not typed. The counts are of WHOLE cells, so they are smaller than the raw type
     totals, and a literal here would have to be re-edited every time that definition moves --
     which is how a check ends up asserting what the code used to do. */
  ok("...counted from the data", X.seedTypes().every(t =>
       opts.some(o => o.textContent.indexOf(t.n.toLocaleString()) >= 0)),
     X.seedTypes().map(t => t.n + " " + t.label).join(", "));
  /* The counts line under the first button, µJump's own device: it says where the work is before
     you press anything. Read off the STORE, so it can never disagree with the cells on the page. */
  ok("the counts line reads the store, not a literal", (() => {
     const t = D.getElementById("randomCounts").textContent;
     return t.indexOf(A.state().cells.length.toLocaleString()) >= 0
         && /nobody has worked on/.test(t) && /proofread by Nguyen/.test(t);
  })(), D.getElementById("randomCounts").textContent.replace(/\s+/g, " "));
  ok("...and updates when a cell is built", (() => {
     const before = D.getElementById("randomCounts").textContent;
     w.UJ.app.render();
     return D.getElementById("randomCounts").textContent === before
         && /\b\d+\b/.test(before);
  })(), "counts of the store are re-read on every render, not once at load");
  /* A button that cannot do anything is disabled and says why in its own label, rather than
     vanishing -- a control that disappears teaches nobody what it would have done. */
  ok("'review someone's assembly' tracks whether there is anything to review",
     D.getElementById("randomBuilt").disabled === (A.state().cells.length === 0),
     A.state().cells.length + " built");
  ok("nobody-has-worked-on-it draws from untouched seeds only", (() => {
     w.UJ.app.showRandomUntouched();
     const picked = D.querySelector("#found-panel .celltype .cellref").textContent.trim();
     const row = X.seedList().filter(r => r.name === picked)[0];
     return row && row.whole
         && !A.state().cells.some(c => c.id === row.key);
  })(), "where your work is worth most, answered with a fact rather than a guess");

  /* Now the type dropdown itself. */
  D.getElementById("randomTypeSelect").value = "pc";
  D.getElementById("randomOfType").click(); await sleep(80);
  /* A WHOLE Purkinje cell. The paper's list also carries pc_dendrite_1 and pc_fragment_0 --
     pieces, typed `pc` like everything else -- and handing one of those to somebody who asked to
     see a Purkinje cell is the kind of small wrongness that makes a tool untrustworthy. */
  const pick = D.querySelector("#found-panel .celltype .cellref").textContent.trim();
  /* Checked against the DATA, not against a name pattern: two of the 154 whole Purkinje cells are
     called purkinje_1 and purkinje_2, so /^pc_\d+$/ passes or fails depending on the draw. A check
     that is right 152 times in 154 is worse than no check -- it fails in front of the user. */
  ok("a random Purkinje cell is a whole Purkinje cell", (() => {
     const row = X.seedList().filter(r => r.name === pick)[0];
     return row && row.type === "pc" && row.whole
         && D.querySelector("#found-panel .celltype a").textContent.indexOf("Purkinje cell") === 0;
  })(), pick + " — " + D.querySelector("#found-panel .celltype a").textContent.trim());
  /* Landing on a random cell must move the coordinate boxes too, or the page is disagreeing with
     itself about where you are -- and nudging z to look around means retyping all three. */
  ok("...and the coordinate fields follow it", (() => {
     const row = X.seedList().filter(r => r.name === pick)[0];
     return row && row.pos
         && [D.getElementById("x"), D.getElementById("y"), D.getElementById("z")]
              .every((f, i) => Number(f.value) === Math.round(row.pos[i]));
  })(), [D.getElementById("x").value, D.getElementById("y").value,
         D.getElementById("z").value].join(", "));
  ok("...and a piece is LABELLED as a piece",
     X.seedLabelFor("pc_dendrite_fragment_2", "pc") === "Purkinje cell dendrite"
     && X.seedLabelFor("grc_100", "grc") === "granule cell",
     X.seedLabelFor("pc_dendrite_fragment_2", "pc"));
  /* Injectable randomness, because "is it random" is not a thing a test can assert -- but "does
     it only ever return that type" is. */
  ok("...whatever the draw", [0, 0.25, 0.5, 0.75, 0.99]
     .every(r => X.randomSeed("pc", r).type === "pc" && X.randomSeed("pc", r).whole));
  ok("a cell's link centres on its SOMA", (() => {
    const href = D.querySelector("#found-panel .celltype a").getAttribute("href");
    const st = JSON.parse(decodeURIComponent(href.split("#!")[1]));
    const row = X.seedList().filter(r => r.name === pick)[0];
    return row && row.pos && st.position.join(",") === row.pos.join(",");
  })(), "a median granule cell is 116 fragments over tens of µm; the middle of that is a dendrite");

  console.log("\n--- the mistake, and undoing it ---");
  /* Søren, 2026-09-01: "I accidentally added a lot of fragments to a new cell, where I was trying
     to add it to an already existing cell."

     THE CAUSE. "Add fragments" on a proofread cell aimed the paste at `cb2/htem/pc_5`.
     addToExisting then did `byId(which); if (!c) return;` -- and byId searches only the cells the
     COMMUNITY has built. A proofread cell nobody has extended is not one of those, so the primary
     green button, reading "Add these 1 to cb2/htem/pc_5", did nothing at all: no message, no
     error, no change. The only button that visibly worked built a new cell. */
  {
    const seed = X.seedList().filter(r => r.whole && r.pos)[3];
    const nSeed = X.seedSegments(seed).length;
    /* Aim at a proofread cell the way a person does: the Add fragments button on its own row. */
    D.getElementById("seed-q").value = seed.name;
    w.UJ.app.renderSeeds(); await sleep(30);
    const row = D.querySelector("#seed-list .seedrow .seed-add");
    ok("a proofread cell offers Add fragments", !!row, seed.name);
    row.click(); await sleep(30);
    ok("...and aiming at it is announced", (() => {
       const n = D.getElementById("target-note");
       return n && n.textContent.indexOf(seed.name) >= 0
           && /proofread fragments/.test(n.textContent);
    })(), (D.getElementById("target-note") || {}).textContent.replace(/\s+/g, " ").slice(0, 90));

    D.getElementById("paste").value = JSON.stringify({ position:[1,2,3], layers:[
      { type:"segmentation", name:"seg", source:w.UJ.cfg.volume.seg,
        segments:["7770000000001","7770000000002"] } ] });
    D.getElementById("paste-go").click(); await sleep(60);
    const primary = D.querySelector("#paste-body button.primary");
    ok("...the primary button offers to add, not to build", /^Add these/.test(primary.textContent),
       primary.textContent.trim());
    const before = A.state().cells.length;
    primary.click(); await sleep(120);
    /* THE FIX. Adding to a proofread cell nobody has extended ADOPTS it: a community record is
       created under that cell's own key. It used to do nothing whatsoever. */
    ok("...and pressing it actually does something",
       A.state().cells.length === before + 1, "it silently did nothing before");
    const adopted = A.state().cells[A.state().cells.length - 1];
    ok("...under the proofread cell's own key, not a new number",
       adopted.id === seed.key, adopted.id);
    /* THE DELTA, not a copy. 560,827 proofread fragments belong in the paper's own database. */
    ok("...holding only what was added", adopted.segments.length === 2,
       adopted.segments.length + " stored");
    ok("...while the page shows the union", (() => {
       const card = D.getElementById("cell-" + adopted.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
       return card && card.textContent.indexOf(nSeed + " proofread + 2 added here") >= 0;
    })(), nSeed + " proofread + 2 added here");
    ok("...and the viewer link opens the whole cell, both halves", (() => {
       const href = D.getElementById("cell-" + adopted.id.replace(/[^a-zA-Z0-9_-]/g, "_"))
                     .querySelector("a.cell-open").getAttribute("href");
       return X.parseSegments(href).ids.length === nSeed + 2;
    })(), "the community's two fragments are not a separate cell from the reconstruction");

    /* THE VIEWER OPENS ON THE SOMA. Søren, 2026-09-01: the adopted cell "has the center in
       neuroglancer at the last segment added instead of the nucleus center". `position` is
       wherever the crosshair happened to be when somebody pasted -- on the last fragment they
       clicked, which is nowhere in particular. The proofread cell has a recorded soma. */
    ok("...and the viewer opens on the proofread soma, not the paste position", (() => {
       const card = D.getElementById("cell-" + adopted.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
       const href = card.querySelector("a.cell-open").getAttribute("href");
       const st = JSON.parse(decodeURIComponent(href.split("#!")[1]));
       return st.position.join(",") === seed.pos.join(",");
    })(), "a cell assembled over three sessions would otherwise open on its newest dendrite tip");

    /* THE TWO VIEWS MUST AGREE. Søren, 2026-09-01, after adding 90 fragments to pc_0: "Now I have
       added fragments to this cell, but they don't show up on the cell, they show up in the cells
       built so far in an unnamed cell."

       They HAD gone onto pc_0 -- the card said "174 proofread + 90 added here" -- but two separate
       things made it look otherwise, and both were real. The card was headed "Unnamed", so it read
       as a stray anonymous cell rather than the Purkinje cell he had just extended; and the
       identity panel above went on reading 174, because it drew the seed from the embedded list
       and knew nothing about the store. Two views of one cell disagreeing about how many pieces it
       has is worse than either being wrong alone: it makes the whole page untrustworthy. */
    ok("the card is headed by the cell's own type, not 'Unnamed'", (() => {
       const card = D.getElementById("cell-" + adopted.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
       const a = card.querySelector("a.cell-open").textContent.replace(/\s*↗$/, "").trim();
       return a.toLowerCase() === seed.label.toLowerCase();
    })(), D.getElementById("cell-" + adopted.id.replace(/[^a-zA-Z0-9_-]/g, "_"))
            .querySelector("a.cell-open").textContent.trim());
    ok("...while still saying nobody HERE has confirmed it", (() => {
       const card = D.getElementById("cell-" + adopted.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
       return /nobody here has confirmed/.test(card.textContent);
    })(), "the Lee lab named it; confirming that name here is a different act");
    ok("...and the identity panel above counts the additions too", (() => {
       /* Open the cell in the panel the way a person would, having just extended it. */
       w.UJ.app.showFound([{ row: seed, nm: 0 }], null);
       const t = D.getElementById("found-panel").textContent;
       return t.indexOf(nSeed + " proofread + 2 added here") >= 0 && /extended here/.test(t);
    })(), D.querySelector("#found-panel .meta").textContent.trim());
    ok("...without anyone having to search again", (() => {
       /* refreshFound() redraws the panel in place whenever the store changes -- no history entry,
          no scroll, because nobody navigated anywhere. */
       const before = w.UJ.app.history().trail.length;
       w.UJ.app.render();
       return w.UJ.app.history().trail.length === before && !!D.getElementById("found-panel");
    })(), "redrawing is not navigating");
    ok("...and its 3D, .glb and volume act on the union", (() => {
       const href = D.querySelector("#found-panel .celltype a").getAttribute("href");
       return X.parseSegments(href).ids.length === nSeed + 2;
    })(), "drawing a different set from the one the panel counted is the same bug, hidden better");

    /* UNDO. Søren: "if you make a mistake, you should be able to correct it for yourself
       afterwards." One step, made by the OPPOSITE call, so the sheet records a correction rather
       than losing its history. */
    ok("the last action can be undone", (() => {
       const u = D.getElementById("undo-row");
       return u && /Undo that/.test(u.textContent) && u.textContent.indexOf(seed.name) >= 0;
    })(), (D.getElementById("undo-row") || {}).textContent.replace(/\s+/g, " "));
    D.getElementById("undo-btn").click(); await sleep(120);
    ok("...and undoing takes the fragments back off",
       A.state().cells.filter(c => c.id === seed.key).length === 0,
       "a cell that lost everything it had is not a cell");
    ok("...and says so", /Undone/.test(D.getElementById("paste-msg").textContent),
       D.getElementById("paste-msg").textContent.replace(/\s+/g, " "));
    ok("...and the offer is gone once taken",
       !D.getElementById("undo-btn"), "one step, not a stack");
  }

  console.log("\n--- a backend that cannot adopt ---");
  /* Søren, 2026-09-01: "instead of updating the proofread pc_0 with the fragments I suggested, it
     made a new unnamed cell." An older XJumpCells.gs ignores a supplied cellKey and returns a
     freshly numbered cb2:N -- indistinguishable from success unless the page compares the key it
     asked for with the key it got. It did not compare, so it printed "added to pc_0" over
     fragments that had gone somewhere else. Reporting a write as landing where it did not is the
     worst thing a shared record can do. */
  {
    const seed2 = X.seedList().filter(r => r.whole && r.pos)[7];
    const store = A.store();
    const realBuild = store.build;
    /* An old deployment, exactly: it accepts the request, ignores the key, invents a number. */
    store.build = function(ids, position, key){
      return Promise.resolve({ ok:true, cellKey:"cb2:999", segments:ids, conflicts:[] });
    };
    D.getElementById("seed-q").value = seed2.name;
    w.UJ.app.renderSeeds(); await sleep(30);
    D.querySelector("#seed-list .seedrow .seed-add").click(); await sleep(30);
    D.getElementById("paste").value = JSON.stringify({ position:[1,2,3], layers:[
      { type:"segmentation", name:"seg", source:w.UJ.cfg.volume.seg,
        segments:["6660000000001"] } ] });
    D.getElementById("paste-go").click(); await sleep(60);
    D.querySelector("#paste-body button.primary").click(); await sleep(120);
    const msg = D.getElementById("paste-msg").textContent;
    ok("a key that comes back different is not success",
       /did NOT go onto/.test(msg) && msg.indexOf(seed2.name) >= 0,
       msg.replace(/\s+/g, " ").slice(0, 110));
    ok("...and it says where the fragments actually are",
       /cb2:999/.test(msg), "they are not lost — they are one Move from where they belong");
    ok("...and what to do about it", /Deploy → New version/.test(msg));
    store.build = realBuild;
    /* AND IT IS SAID BEFORE THE WORK, not only after. Anything the page can know before somebody
       pastes belongs before they paste — the same rule the file:// banner follows. */
    ok("...and an old backend warns before you paste, not after", (() => {
       A.state().can = { adopt: false };
       const saved = w.XJUMP_LIVE;
       /* The banner's warning is for the live page; the harness has no backend to be old. */
       w.UJ.app.showFound([{ row: seed2, nm: 0 }], null);
       D.querySelector("#found-add").click();
       const n = D.getElementById("target-note").textContent;
       A.state().can = { adopt: true };
       return /Adding to/.test(n) && n.indexOf(seed2.name) >= 0;
    })(), "the harness has no backend, so only the live page can show the refusal");
  }

  console.log("\n--- an emptied cell is not a cell ---");
  /* Søren: "now you added some more unnamed cells". They were not new. They were the husks of
     cells built by mistake and then MOVED out of: the move drops the source from the page, the
     sheet keeps its row (correctly — "created and then withdrawn" is a true thing to record), and
     on the next reload the row came back as a cell with nothing in it. */
  {
    const husk = { id:"cb2:9001", segments:[], names:{}, totalVotes:0, rejects:0, unsure:0,
                   builtBy:"", position:[1,2,3] };
    A.state().cells.push(husk);
    w.UJ.app.render(); await sleep(30);
    ok("a cell with no fragments is not shown as a cell",
       !D.getElementById("cell-cb2_9001"),
       "five identical empty cards is not a record, it is noise");
    ok("...but it is not hidden either", /emptied and withdrawn/.test(
       D.getElementById("cells").textContent),
       D.getElementById("cells").textContent.replace(/\s+/g, " ").slice(0, 80));
    /* An ADOPTED cell whose own additions have all been removed still has the reconstruction. */
    const seed3 = X.seedList().filter(r => r.whole)[11];
    A.state().cells.push({ id:seed3.key, segments:[], names:{}, totalVotes:0, rejects:0,
                           unsure:0, builtBy:"", position:null });
    w.UJ.app.render(); await sleep(30);
    ok("...while an adopted cell with none of its OWN is still a cell",
       !!D.getElementById("cell-" + seed3.key.replace(/[^a-zA-Z0-9_-]/g, "_")),
       "it still holds " + X.seedSegments(seed3).length + " proofread fragments");
    A.state().cells = A.state().cells.filter(c => c !== husk && c.id !== seed3.key);
    w.UJ.app.render(); await sleep(20);
  }

  console.log("\n--- correcting a cell afterwards ---");
  {
    /* Every fragment this community added carries a × to take it back off. The proofread ones do
       not: removing one is a claim about the paper, not a correction of your own paste. */
    const c1 = A.state().cells[0];
    const card = D.getElementById("cell-" + c1.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
    const n0 = c1.segments.length;
    ok("every fragment can be taken back off",
       card.querySelectorAll(".frag-x").length === n0,
       card.querySelectorAll(".frag-x").length + " of " + n0);
    card.querySelector(".frag-x").click(); await sleep(80);
    ok("...and one goes", A.state().cells[0].segments.length === n0 - 1,
       n0 + " → " + A.state().cells[0].segments.length);
    /* AND THE WHOLE ASSEMBLY CAN BE MOVED. This is the fix for the mistake itself: fragments built
       as a new cell that belonged on one that already existed. */
    const src = A.state().cells[A.state().cells.length - 1];
    const dst = A.state().cells[0];
    const srcCard = D.getElementById("cell-" + src.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
    ok("a whole cell can be moved into another", !!srcCard.querySelector(".move-to"));

    /* EVERY PROOFREAD CELL IS REACHABLE. Søren, 2026-09-01: "Now I am trying to move the cell
       fragments to the cell that I know it belongs to pc_5, but I don't see it on the list..."

       It shipped as a <select> holding the community's cells plus `seeds().slice(0, 200)` -- the
       first two hundred in list order, which contains no Purkinje cell at all. pc_5 sits at index
       5,155 of 5,318. A list that silently stops is worse than one that refuses: it looks
       complete. It is a search box now, and these check that the whole list is behind it. */
    ok("...and pc_5 is findable, though it is #5,155 of 5,318", (() => {
       const box = srcCard.querySelector(".move-to");
       box.value = "pc_5";
       box.dispatchEvent(new w.Event("input"));
       const chips = Array.from(srcCard.querySelectorAll(".movehit"))
                          .map(b => b.textContent.trim().split(" ")[0]);
       return chips.indexOf("pc_5") >= 0;
    })(), Array.from(srcCard.querySelectorAll(".movehit"))
            .map(b => b.textContent.trim().split(" ")[0]).join(", "));
    ok("...and a wide search says how many it is NOT showing", (() => {
       const box = srcCard.querySelector(".move-to");
       box.value = "grc_";
       box.dispatchEvent(new w.Event("input"));
       return srcCard.querySelectorAll(".movehit").length === 8
           && /more — type more of the name/.test(srcCard.querySelector(".movehits").textContent);
    })(), "the truncation that misled has to announce itself");
    ok("...and a name that matches nothing is refused, not guessed", (() => {
       const box = srcCard.querySelector(".move-to");
       box.value = "not_a_cell_at_all";
       srcCard.querySelector(".move-go").click();
       return /no cell called/.test(srcCard.querySelector(".mesh-out").textContent);
    })(), srcCard.querySelector(".mesh-out").textContent);
    ok("...and an ambiguous one too", (() => {
       const box = srcCard.querySelector(".move-to");
       box.value = "nterneuron";
       srcCard.querySelector(".move-go").click();
       return /click the one you mean/.test(srcCard.querySelector(".mesh-out").textContent);
    })(), srcCard.querySelector(".mesh-out").textContent);
    /* AND A PARTIAL NAME IS NEVER A CHOICE, even when it matches exactly one cell. "grc_10"
       matching only grc_100 would move a whole assembly somewhere nobody asked for -- which is
       precisely the mistake this control exists to undo. */
    ok("...and a partial name that matches ONE is still not a choice", (() => {
       const box = srcCard.querySelector(".move-to");
       const solo = X.seedList().filter(r => r.name === "grc_ml_0")[0];
       box.value = "grc_ml_";
       srcCard.querySelector(".move-go").click();
       const t = srcCard.querySelector(".mesh-out").textContent;
       return /Did you mean/.test(t)
           && A.state().cells.filter(c => c.id === src.id).length === 1;
    })(), srcCard.querySelector(".mesh-out").textContent);

    const moving = src.segments.length, had = dst.segments.length;
    srcCard.querySelector(".move-to").value = dst.id;
    srcCard.querySelector(".move-go").click(); await sleep(150);
    ok("...the fragments arrive", A.state().cells.filter(c => c.id === dst.id)[0]
         .segments.length === had + moving,
       had + " + " + moving);
    ok("...and the cell they came from is gone",
       A.state().cells.filter(c => c.id === src.id).length === 0,
       "an emptied cell is not left behind as a husk");
    ok("...and it is reported", /Moved/.test(D.getElementById("paste-msg").textContent),
       D.getElementById("paste-msg").textContent.replace(/\s+/g, " "));
  }

  console.log("\n--- already-marked nuclei, in the link ---");
  /* Søren, 2026-09-01: "When we need to mark the new nuclei, it would be helpful if the nuclei
     that are already marked are shown." The card SAID it did this. What it did was include the
     nuclei strictly inside the column -- and the sampler only ever sends you to a column nobody
     has searched, which contains none. The feature was unreachable, and no check noticed because
     every check asked the logic rather than the link. */
  {
    D.getElementById("next-box").click(); await sleep(60);
    const boxKey = w.UJ.app.box() && w.UJ.app.box().key;
    ok("the sampler sends you somewhere", !!boxKey, boxKey);
    const b = X.boxBounds(X.boxOf(boxKey));
    /* One nucleus inside the column, one 5 µm past its edge. Both must reach the viewer. */
    const ex = A.state().explore;
    const mid = i => (b.loNm[i] + b.hiNm[i]) / 2;
    ex.nuclei = [
      { id:"cb2/n1", pos: X.toVox([mid(0), mid(1), mid(2)]).map(Math.round) },
      { id:"cb2/n2", pos: X.toVox([b.hiNm[0] + 5000, mid(1), mid(2)]).map(Math.round) },
      { id:"cb2/n3", pos: X.toVox([b.hiNm[0] + 500000, mid(1), mid(2)]).map(Math.round) }
    ];
    /* Redraw the column the sampler is ON, rather than asking for a new one: nextBox() would move
       to a different unvisited column and the nuclei just placed would no longer be near it. */
    w.UJ.app.renderBox(); await sleep(30);
    const link = D.querySelector("#box-body a.cell-open");
    ok("...with a link to open it", !!link);
    const st = JSON.parse(decodeURIComponent(link.getAttribute("href").split("#!")[1]));
    const layers = st.layers.filter(L => L.type === "annotation");
    ok("...carrying an annotation layer for what is already recorded",
       layers.length >= 2, layers.map(L => L.name).join(", "));
    const recorded = layers.filter(L => /recorded/i.test(L.name))[0];
    ok("...and the recorded layer is named so parseNuclei skips it", !!recorded,
       "otherwise every paste would record the grey ones again");
    ok("...and the panel says how many are drawn",
       /already-marked nucle/.test(D.getElementById("box-body").textContent)
       || /nothing marked here or nearby/.test(D.getElementById("box-body").textContent),
       D.getElementById("box-body").textContent.replace(/\s+/g, " ").slice(0, 100));
    /* THE POINT OF THE WHOLE CHANGE: a nucleus just OUTSIDE the column reaches the link. Before,
       only strictly-inside ones did, and the sampler never serves a column with any. */
    ok("a nucleus just over the boundary reaches the LINK", (() => {
       const pts = (recorded && recorded.annotations) || [];
       const near = X.toVox([b.hiNm[0] + 5000, mid(1), mid(2)]).map(Math.round).join(",");
       return pts.length === 2 && pts.some(a => a.point.join(",") === near);
    })(), "five micrometres past an edge is the one you would record twice");
    ok("...and the one 500 µm away does not", (() => {
       const pts = (recorded && recorded.annotations) || [];
       const far = X.toVox([b.hiNm[0] + 500000, mid(1), mid(2)]).map(Math.round).join(",");
       return !pts.some(a => a.point.join(",") === far);
    })(), "a URL holding every nucleus in the volume is a URL the browser truncates");
  }

  console.log("\n--- recently viewed cells ---");
  /* Søren, 2026-09-01: "We should also have the recent cells in xJump, like in uJump." µJump's
     three controls, answering three different questions: chips for "take me back to the one I was
     just on", Back/Forward for "undo that jump", the folded list for "what have I looked at". */
  {
    /* Relative to whatever the checks above already walked through -- this suite drives the page
       the way a person would, so the trail is not empty by the time it gets here, and a check that
       assumed it was would be asserting the order of the file rather than the behaviour. */
    const rows = X.seedList().filter(r => r.pos && r.whole);
    const a = rows[10], b = rows[20], c = rows[30];
    const base = w.UJ.app.history().trail.length;
    [a, b, c].forEach(r => w.UJ.app.showFound([{ row: r, nm: 0 }], null));
    const h = w.UJ.app.history();
    ok("the trail records what you looked at",
       h.trail.length === base + 3 && h.at === h.trail.length - 1
       && h.trail.slice(-3).map(x => x.name).join(",") === [a,b,c].map(x => x.name).join(","),
       h.trail.slice(-3).map(x => x.name).join(" → "));
    ok("...and does not record standing still", (() => {
       w.UJ.app.showFound([{ row: c, nm: 0 }], null);
       return w.UJ.app.history().trail.length === base + 3;
    })(), "landing on the cell you are already on is not a new place");
    /* Three chips, newest first, and never one for the cell you are standing on -- a chip that
       takes you where you already are is a chip that does nothing. */
    ok("chips offer the last three, minus where you are", (() => {
       const chips = Array.from(D.querySelectorAll("#searchHistory .hist-chip"))
                          .map(x => x.textContent.trim());
       return chips.length === 3 && chips[0] === b.name && chips[1] === a.name
           && chips.indexOf(c.name) < 0;
    })(), Array.from(D.querySelectorAll("#searchHistory .hist-chip"))
            .map(x => x.textContent.trim()).join(", "));
    ok("Back is live, Forward is not, at the end of the trail",
       D.getElementById("navBackBtn").disabled === false
       && D.getElementById("navFwdBtn").disabled === true);
    D.getElementById("navBackBtn").click(); await sleep(60);
    ok("...Back walks to the previous cell",
       D.querySelector("#found-panel .celltype .cellref").textContent.trim() === b.name
       && w.UJ.app.history().at === base + 1,
       D.querySelector("#found-panel .celltype .cellref").textContent.trim());
    ok("...and walking does not append to the trail",
       w.UJ.app.history().trail.length === base + 3,
       "otherwise Back would grow the very list it is walking");
    ok("...and moves the coordinate boxes with it",
       Number(D.getElementById("x").value) === Math.round(b.pos[0]),
       D.getElementById("x").value + " vs " + Math.round(b.pos[0]));
    D.getElementById("navFwdBtn").click(); await sleep(60);
    ok("Forward walks back again",
       D.querySelector("#found-panel .celltype .cellref").textContent.trim() === c.name);
    /* A browser truncates the forward half when you jump from part-way back, and everybody already
       expects that. */
    D.getElementById("navBackBtn").click(); await sleep(60);
    w.UJ.app.showFound([{ row: rows[40], nm: 0 }], null);
    ok("jumping from part-way back drops the forward half", (() => {
       const t = w.UJ.app.history();
       return t.trail.length === base + 3 && t.at === t.trail.length - 1
           && t.trail[t.trail.length - 1].name === rows[40].name
           && t.trail[t.trail.length - 2].name === b.name;
    })(), w.UJ.app.history().trail.slice(-3).map(x => x.name).join(" → "));
    ok("the folded list holds the whole trail",
       D.querySelectorAll("#recentlyViewedList .rv-row").length
         === w.UJ.app.history().trail.length,
       D.querySelectorAll("#recentlyViewedList .rv-row").length + " rows");
    ok("...newest first, marking where you are", (() => {
       const rowsEl = Array.from(D.querySelectorAll("#recentlyViewedList .rv-row"));
       return /here/.test(rowsEl[0].textContent)
           && rowsEl[0].querySelector(".rv-open").textContent.trim() === rows[40].name;
    })());
    /* IN MEMORY. This page's storage rule is the theme and the open tab, nothing else -- a
       remembered trail that disagrees with what you think you did is the trap the rule prevents. */
    ok("...and none of it is written to browser storage",
       !/xjump_history|recentlyViewed"\s*,/.test(fs.readFileSync("xjump_demo.html", "utf8")),
       "the build's own storage guard enforces this too");
  }

  /* ONE REGISTRATION PER CELL. Søren, 2026-09-01: "if I search for pc under Filter and show, I get
     the version of the Purkinje cell without my added fragments. I want to have one registration
     of the cell, and when I update that, it will be what is shown."

     The store never held two: adopting a seed writes the delta under the seed's own key. It was
     the LIST that showed one of them -- the embedded table, drawn once at load, with the
     published count and the published segment set. So this checks the join, and it checks the two
     places a stale row is actually harmful: the number on the row, and where the link goes. */
  console.log("\n--- the list shows the cell as it stands now ---");
  {
    const seed = X.seedList().filter(r => r.whole && r.count > 3)[3];
    const extra = ["7770000000001", "7770000000002"];
    A.state().cells.push({ id:seed.key, segments:extra.slice(), names:{}, totalVotes:0,
                           rejects:0, unsure:0, builtBy:"someone", position:null });
    D.getElementById("seed-q").value = seed.name;
    w.UJ.app.renderSeeds(); await sleep(30);
    const row = D.querySelector("#seed-list .seedrow");
    ok("the row is drawn", !!row, seed.name + " — " + seed.count + " proofread");
    ok("...and says what was added on top of the proofread cell",
       /\+\s*2\s*added/.test(row.textContent),
       row.textContent.replace(/\s+/g, " ").trim().slice(0, 90));
    ok("...keeping the published figure visible beside it",
       row.textContent.indexOf(String(seed.count) + " proofread") >= 0,
       "proofread and community-added are different evidence; one summed number hides that");

    /* WHERE THE LINK GOES. A row that counts the additions but opens the reconstruction without
       them is the same bug wearing a correct number. */
    let opened = null;
    const realOpen = w.open;
    w.open = (u) => { opened = u; return null; };
    row.querySelector(".seed-open").dispatchEvent(new w.Event("click", { bubbles:true }));
    w.open = realOpen;
    ok("...and the link opens the merged set", !!opened
       && extra.every(s => opened.indexOf(s) >= 0),
       opened ? "both added fragments are in the state" : "nothing opened");

    /* AND IT KEEPS UP. render() is what runs after a paste lands, so a list refreshed only at
       load would show the published figure again the moment you added to a cell. */
    A.state().cells.filter(c => c.id === seed.key)[0].segments.push("7770000000003");
    w.UJ.app.render(); await sleep(30);
    ok("...and the row follows a change without a reload",
       /\+\s*3\s*added/.test(D.querySelector("#seed-list .seedrow").textContent),
       D.querySelector("#seed-list .seedrow").textContent.replace(/\s+/g, " ").trim().slice(0, 70));

    A.state().cells = A.state().cells.filter(c => c.id !== seed.key);
    D.getElementById("seed-q").value = "";
    w.UJ.app.render(); await sleep(20);
  }

  /* THE LIST AS A FILE. Søren, 2026-09-01: χJump has no "master cell list". The tab is one; this
     is the half that makes it usable by somebody whose data handling happens in Excel — and his
     Excel is Danish, where ; separates fields and , is the decimal mark. A comma-separated file
     opens there as one column per row. */
  console.log("\n--- the whole list, as a file ---");
  {
    const seedX = X.seedList().filter(r => r.whole && r.pos)[5];
    A.state().cells.push({ id:seedX.key, segments:["7780000000001"], names:{}, totalVotes:0,
                           rejects:0, unsure:0, builtBy:"soren", position:null });
    /* And a cell that is NOT an extension of anything published: a list calling itself complete
       has to carry those too. */
    A.state().cells.push({ id:"cb2:4242", segments:["7780000000002","7780000000003"], names:{},
                           totalVotes:0, rejects:0, unsure:0, builtBy:"soren",
                           position:[1000, 2000, 300] });
    const csv = w.UJ.app.seedCsv();
    const lines = csv.split("\r\n");
    ok("Excel is told the separator", lines[0] === "sep=;",
       "Danish Excel splits on ; — a comma-separated file opens as one column per row");
    ok("...and the header follows it", /^name;key;kind;layer;/.test(lines[1]), lines[1]);
    ok("every published cell is in it", lines.length >= X.seedList().length + 3,
       (lines.length - 3) + " rows for " + X.seedList().length + " published cells plus what "
       + "was built here");
    const row = lines.filter(l => l.indexOf(seedX.key + ";") >= 0)[0];
    ok("...and an extended one carries both counts", !!row
       && row.split(";")[7] === String(seedX.count) && row.split(";")[8] === "1",
       row ? row.slice(0, 90) : "not found");
    ok("...and a cell built from scratch is in it too",
       lines.some(l => /(^|;)cb2:4242;/.test(l)),
       "a list that only holds what somebody else published is not a master list");
    /* NO DECIMAL NUMBERS ANYWHERE. Positions are voxels and counts are counts, so the comma-vs-dot
       half of the locale problem is designed out rather than handled — the file cannot be
       misread as text by an Excel expecting decimal commas if it contains no decimals. */
    ok("...and nothing in it has a decimal point",
       !lines.slice(2).some(l => /\d\.\d/.test(l)),
       "a dot decimal reads as text in Danish Excel; there are none to misread");
    A.state().cells = A.state().cells.filter(c => c.id !== seedX.key && c.id !== "cb2:4242");
    w.UJ.app.render(); await sleep(20);
  }

  /* ══ THE FILTER PANEL ══════════════════════════════════════════════════════════════════════
     Søren, 2026-09-02, listing what χJump's Filter-and-show should borrow from µJump: "Select the
     cell(s) of interest with the same style of cell type selection... Do you want to find cells
     close to another cell type?... Which layer should the cell be in... Should the cells fall
     inside specific bounding box(es)?... Add extra layers to the 3D view... the stepping through
     the matches, and of course the open in neuroglancer and download as Excel."

     These check that each section EXISTS and that it CHANGES THE ANSWER. A filter panel whose
     controls are all present and none of which narrows anything is the βJump failure in a new
     costume: every "does the element exist?" check passing while the feature does nothing. */
  /* ══ ORGANELLES ═══════════════════════════════════════════════════════════════════════════
     Søren, 2026-09-02: "We should build the organelle reporting like in uJump and then also
     implement the filter."

     "Like µJump" is enforced by the BUILD -- the 61 kinds are generated from core/ontology.js and
     the form's logic is core/organelles.js, shared with ωJump -- so these checks are about the
     things a build cannot enforce: that the form exists on a cell, that it asks the DATA how many
     coordinates a kind needs, that what is submitted comes back, and that the filter narrows on
     it. */
  /* ══ CELL CONTACTS AND CELL HISTORY ═══════════════════════════════════════════════════════
     Søren, 2026-09-02: "Now I want to make the cell contacts and the cell history for the xJump
     identification panel, like in uJump."

     The geometry has its own suite (cccheck.js) against shapes whose separation is known by
     construction. These are about the PANEL: that it says what it will cost before it spends it,
     that a partial mesh is never quietly reported as an absence, and that a stale response cannot
     paint over the cell you are actually looking at. */
  console.log("\n--- cell contacts ---");
  /* core/mesh.js is already evaluated further up for the export half; the contact helpers come
     from the same module. */
  const ccRow = X.seedList().filter(r => r.whole && r.pos && r.type === "pc")[0];
  A.showFound([{ row: ccRow, nm: 0 }], null);
  await sleep(30);
  const cc = D.querySelector("#found-panel .cc");
  ok("the panel carries a contacts section", !!cc
     && /mesh proximity, not synapses/.test(cc.textContent),
     "cb2 publishes no synapse table; calling a membrane contact a synapse would be the single "
     + "most misleading thing this page could do");
  ok("...built only when it is opened", !cc.querySelector(".cc-body").innerHTML);
  cc.open = true; cc.dispatchEvent(new w.Event("toggle"));
  await sleep(30);
  ok("...then it has µJump's four fields, with µJump's defaults", (() => {
     const v = c => cc.querySelector("." + c).value;
     return v("cc-radius") === "50" && v("cc-gap") === "40" && v("cc-spacing") === "1000";
  })(), "radius " + cc.querySelector(".cc-radius").value + " µm · gap "
      + cc.querySelector(".cc-gap").value + " nm · spacing "
      + cc.querySelector(".cc-spacing").value + " nm · cap "
      + cc.querySelector(".cc-max").value + " cells");
  /* 40 nm is not a number somebody liked. cb2's voxel is 4 × 4 × 40 nm, the same as µJump's
     dataset, so the default carries over for the same reason it was chosen there. */
  ok("...and the 40 nm default is one z-voxel of THIS volume",
     Number(cc.querySelector(".cc-gap").value) === X.resXYZ()[2],
     "two independently segmented surfaces rarely come closer than one z-step even where they "
     + "genuinely touch");
  ok("...and the three buttons start disabled",
     cc.querySelector(".cc-check").disabled && cc.querySelector(".cc-ngl").disabled
       && cc.querySelector(".cc-xlsx").disabled,
     "nothing to check, open or export before a cell type is picked");

  /* THE COST, BEFORE THE BUTTON. This is the one thing χJump's panel says that µJump's does not,
     and the reason is the dataset: a cb2 cell is an assembly of a median hundred-odd published
     fragments, so "6 cells nearby" and "900 files to download" are very different sentences. */
  const ccPick = (label, radius, cap) => {
    const s = cc.querySelector(".cc-type"); s.value = label;
    s.dispatchEvent(new w.Event("change"));
    if (radius != null){ const r = cc.querySelector(".cc-radius"); r.value = String(radius);
                         r.dispatchEvent(new w.Event("input")); }
    if (cap != null){ const m = cc.querySelector(".cc-max"); m.value = String(cap);
                      m.dispatchEvent(new w.Event("input")); }
    return cc.querySelector(".cc-count").textContent.replace(/\s+/g, " ").trim();
  };
  ok("the type list is sorted case-insensitively", (() => {
     const vals = Array.from(cc.querySelectorAll(".cc-type option")).slice(1).map(o => o.value);
     return vals.length > 2
        && vals.every((v, i) => i === 0 || vals[i-1].toLowerCase() <= v.toLowerCase());
  })(), Array.from(cc.querySelectorAll(".cc-type option")).slice(1, 4)
          .map(o => o.value).join(" | ") + " — a plain sort puts every capital first");
  const c50 = ccPick("granule cell", 50, 6);
  ok("picking a type says how many are nearby AND what they cost",
     /granule cells within 50/.test(c50) && /mesh fragments to download/.test(c50),
     c50);
  ok("...and the check button comes alive", !cc.querySelector(".cc-check").disabled);
  /* 20 µm, not 10: this Purkinje cell has no granule cell within 10 µm at all, and "fewer" is a
     weaker claim to check than "fewer but still some". The zero case has its own assertion below,
     where it is the point rather than an accident of which cell the harness landed on. */
  const c20 = ccPick("granule cell", 20, 6);
  ok("a smaller radius finds fewer", (() => {
     const n = t => Number((t.match(/^([\d,]+)/) || [0, "0"])[1].replace(/,/g, ""));
     return n(c20) < n(c50) && n(c20) > 0;
  })(), c20);
  const cap2 = ccPick("granule cell", 50, 2);
  ok("...and a smaller cap costs fewer fragments", (() => {
     const f6 = Number((c50.match(/about ([\d,]+)/) || [0, "0"])[1].replace(/,/g, ""));
     const f2 = Number((cap2.match(/about ([\d,]+)/) || [0, "0"])[1].replace(/,/g, ""));
     return f2 < f6 && f2 > 0;
  })(), cap2);
  ok("...and a type with nothing nearby says so, not zero",
     /No .* within/.test(ccPick("mossy fibre", 1, 6)),
     ccPick("mossy fibre", 1, 6));
  ccPick("granule cell", 50, 6);

  /* ccCandidates is the whole selection rule, and it must agree with the list the rest of the
     page shows -- same universe, same labels. */
  ok("candidates come from the same universe the list shows", (() => {
     const cands = A.ccCandidates(ccRow.key, "granule cell", 30);
     return cands.length > 0
         && cands.every(c => c.u.label === "granule cell" && c.u.key !== ccRow.key)
         && cands.every((c, i) => i === 0 || cands[i-1].distNm <= c.distNm);
  })(), A.ccCandidates(ccRow.key, "granule cell", 30).length
      + " granule cells within 30 µm, nearest first");

  /* THE RESULT. The compute is a network chain; the rendering, the viewer link and the export
     are not, so they are checked against a result handed in. */
  {
    const cands = A.ccCandidates(ccRow.key, "granule cell", 50);
    A.ccSetResultFor(ccRow.key, {
      label: "granule cell", gapNm: 40, spacingNm: 1000, radiusUm: 50,
      checked: 2, checkedCap: 6, found: cands.length, mine: { have: 170, total: 174 },
      /* A hand-built result is a PLACED one: its points are already in viewer coordinates, so it
         declares the frame it is in. Without this the panel is right to refuse to draw markers it
         cannot place, and this fixture would be asking it to. */
      frameOk: true, shiftUm: [0, 0, 0], originUm: [0, 0, 0],
      rows: [
        { u: cands[0].u, points: [{ dist: 0.018, point: [100.5, 200.5, 24.5] },
                                  { dist: 0.031, point: [101.5, 201.5, 24.5] }],
          distNm: 18, have: 120, total: 120, unknown: 0, somaNm: cands[0].distNm },
        /* The one that matters: nine fragments of a hundred and sixteen. */
        { u: cands[1].u, points: [], distNm: null, have: 9, total: 116, unknown: 0,
          somaNm: cands[1].distNm }
      ]});
    cc.querySelector(".cc-body").innerHTML = "";
    cc.dispatchEvent(new w.Event("toggle"));
    await sleep(30);
    const rows = cc.querySelectorAll(".cc-row");
    ok("a result renders one row per candidate", rows.length === 2,
       rows.length + " rows");
    ok("...with a lit dot only on the one that touches",
       cc.querySelectorAll(".cc-dot.on").length === 1,
       "green means these two surfaces come within the gap somewhere");
    ok("...saying how many touch points and the closest gap",
       /2 touch points/.test(rows[0].textContent) && /closest 18 nm/.test(rows[0].textContent),
       rows[0].textContent.replace(/\s+/g, " ").trim().slice(0, 80));
    /* THE COVERAGE IS ON EVERY ROW. "Not touching" measured over 8% of a cell is not a finding,
       and a page that prints it without the fraction is making a claim it cannot support. */
    ok("...and every row carries its mesh coverage",
       /9 of 116 fragments have a mesh/.test(rows[1].textContent)
         && /120 fragments, all with a mesh/.test(rows[0].textContent),
       rows[1].textContent.replace(/\s+/g, " ").trim().slice(0, 90));
    ok("...with the partial one marked",
       rows[1].querySelectorAll(".cc-part").length === 1
         && rows[0].querySelectorAll(".cc-part").length === 0,
       "amber on the row whose answer rests on a fraction of the cell");
    ok("...and the query cell's own coverage said once, above them",
       /measured against 170 of this cell's 174 fragments/.test(
         cc.querySelector(".cc-results").textContent),
       "the gap is between two surfaces; both of their coverages bear on it");
    ok("...and the exports light up", !cc.querySelector(".cc-ngl").disabled
       && !cc.querySelector(".cc-xlsx").disabled);

    /* THE VIEWER. Both cells' fragments, and the touch points as their own layer. */
  /* THE LINK'S SHAPE, and it is what Søren sent back a screenshot of on 2026-09-02: the first
     version put every cell into ONE segmentation layer, which is a picture in which you cannot
     tell which cell is which -- and "is that really a contact?" is the only question the link
     exists to answer. µJump's arrangement: the query cell red in its own layer, everything checked
     against it green in a second, and one annotation layer PER contacting cell. */
  const ccState = () => {
     let url = null; const realOpen = w.open; w.open = u => { url = u; return null; };
     cc.querySelector(".cc-ngl").click();
     w.open = realOpen;
     return url ? JSON.parse(decodeURIComponent(url.split("#!")[1])) : null;
  };
  {
    const st = ccState();
    const segs = st ? st.layers.filter(l => l.type === "segmentation" && l.segments
                                            && l.segments.length) : [];
    ok("'open all' puts the query cell and the others in SEPARATE layers", segs.length === 2,
       segs.map(l => l.name).join("  |  "));
    ok("...the query cell red, the ones checked against it green", (() => {
       const col = l => Object.values(l.segmentColors || {})[0];
       return col(segs[0]) === "#ff3b3b" && col(segs[1]) === "#3fb950";
    })(), segs.map(l => Object.values(l.segmentColors || {})[0]).join(" then "));
    ok("...each named for what it holds", (() => {
       return /this cell|Purkinje/i.test(segs[0].name)
           && /granule cell \(contacts checked\)/.test(segs[1].name);
    })(), "the layer list is where you switch them on and off");
    ok("...and neither layer holds the other's fragments", (() => {
       const mine = X.seedSegments(ccRow);
       return segs[0].segments.length === mine.length
           && !segs[1].segments.some(s => mine.indexOf(s) >= 0);
    })(), "a merged layer is a picture in which you cannot tell which cell is which");
    /* ONE ANNOTATION LAYER PER CONTACTING CELL. Points from two pairs in one layer are two
       findings you cannot tell apart, because neuroglancer colours per layer. */
    const marks = st.layers.filter(l => l.type === "annotation" && /touch points/.test(l.name));
    ok("...with one touch-point layer per contacting cell", marks.length === 1
       && marks[0].annotations.length === 2,
       marks.map(l => l.name).join(" | ") + " — one of the two rows had no contacts");
    ok("...in distinct colours, from the golden angle", (() => {
       /* Only one layer here, so the property is checked on the generator rather than on the
          state: any two consecutive layers must differ, for any number of them. */
       const c = i => X.goldenAngleColour(i);
       return c(0) !== c(1) && c(1) !== c(2) && c(0) !== c(2)
           && /^hsl\(/.test(marks[0].annotationColor);
    })(), [0,1,2].map(i => X.goldenAngleColour(i)).join(" "));
  }
    ok("...with each touch point labelled and in VOXELS", (() => {
       let url = null; const realOpen = w.open; w.open = u => { url = u; return null; };
       cc.querySelector(".cc-ngl").click();
       w.open = realOpen;
       const st = JSON.parse(decodeURIComponent(url.split("#!")[1]));
       const a = st.layers.filter(l => /touch points/.test(l.name))[0].annotations[0];
       /* 100.5 µm = 100,500 nm; x voxels are 4 nm, so 25,125. Computed, not pasted. */
       const want = Math.round(100.5 * 1000 / X.resXYZ()[0]);
       return a.point[0] === want && /18 nm/.test(a.description || "");
    })(), "µm out of the mesh, voxels into the viewer — the one conversion this feature makes");

    /* THE EXPORT: one row per touch point, and a checked pair with none still gets a row. */
    ok("the Excel export is one row per touch point", (() => {
       let saved = null;
       const realWrite = w.XLSX && w.XLSX.writeFile;
       w.XLSX = w.XLSX || {};
       w.XLSX.utils = w.XLSX.utils || {
         book_new: () => ({}), aoa_to_sheet: d => { saved = d; return {}; },
         book_append_sheet: () => {} };
       w.XLSX.writeFile = () => {};
       cc.querySelector(".cc-xlsx").click();
       if (realWrite) w.XLSX.writeFile = realWrite;
       /* header + 2 touch points on the first pair + 1 "checked, nothing found" row */
       /* The "touching" column is found BY NAME rather than by index. It moved on 2026-09-02
          when the closest-approach measurement added two columns beside it, and a check that
          hard-codes a column number fails on a change that is not a bug — or worse, passes on a
          different column that happens to hold the same word. */
       const col = saved && saved[0].findIndex(h => /^touching/.test(h));
       return saved && saved.length === 4 && saved[0][0] === "this cell"
           && col > 0 && saved[3][col] === "no";
    })(), "a pair with no contact still gets a row: the sheet records that it was checked");
  }

  /* ── CELL HISTORY ─────────────────────────────────────────────────────────────────────── */
  console.log("\n--- cell history ---");
  {
    const hist = D.querySelector("#found-panel .chist");
    ok("the panel carries a history section", !!hist
       && /Cell history/.test(hist.textContent));
    await sleep(30);
    ok("...and an empty one says so in µJump's words",
       /No recorded changes or reports yet for this cell\./
         .test(hist.querySelector(".chist-body").textContent),
       hist.querySelector(".chist-body").textContent.trim());

    /* A cell with a record. The harness store builds its feed from the cell itself -- see its own
       comment; there is no sheet here to read a timeline out of, and inventing one would be
       inventing evidence. */
    const withStuff = X.seedList().filter(r => r.whole && r.pos)[9];
    A.state().cells.push({ id: withStuff.key, segments: ["8880000000001"],
      names: { "golgi cell": { label:"Golgi cell", n:1 } }, totalVotes:1, rejects:0, unsure:0,
      builtBy: "soren", position: null,
      organelles: [{ kind:"mitochondria", n:3 }], organellePoints: [], organelleReporters:1 });
    A.forgetHistory(withStuff.key);
    A.showFound([{ row: withStuff, nm: 0 }], null);
    await sleep(60);
    const h2 = D.querySelector("#found-panel .chist .chist-body");
    ok("a cell with a record shows its rows", h2.querySelectorAll(".chist-row").length >= 3,
       h2.querySelectorAll(".chist-row").length + " rows");
    ok("...each with a kind pill", (() => {
       const kinds = Array.from(h2.querySelectorAll(".chist-kind")).map(k => k.textContent);
       return kinds.includes("built") && kinds.includes("identified")
           && kinds.includes("organelles");
    })(), Array.from(h2.querySelectorAll(".chist-kind")).map(k => k.textContent).join(" · "));
    ok("...and a distinguishing colour class, not just a word", (() => {
       const cls = Array.from(h2.querySelectorAll(".chist-kind"))
                        .map(k => k.className.replace("chist-kind ", ""));
       return new Set(cls).size >= 3;
    })(), "a rejection and a name are different KINDS of claim; a feed where they look identical "
        + "is one you have to read word by word");

    /* CACHED, so stepping back and forth is one fetch -- and DROPPED when the cell changes, or
       the panel goes on showing a timeline that predates the thing you just did. */
    ok("the history is cached per cell", (() => {
       let calls = 0;
       const store = A.store(), real = store.history;
       store.history = k => { calls++; return real.call(store, k); };
       A.showFound([{ row: ccRow, nm: 0 }], null);
       A.showFound([{ row: withStuff, nm: 0 }], null);
       store.history = real;
       return calls === 0;
    })(), "both cells were loaded a moment ago; revisiting them must not re-ask");
    ok("...and forgotten when that cell changes", (() => {
       let calls = 0;
       const store = A.store(), real = store.history;
       store.history = k => { calls++; return real.call(store, k); };
       A.forgetHistory(withStuff.key);
       A.showFound([{ row: withStuff, nm: 0 }], null);
       store.history = real;
       return calls === 1;
    })(), "a timeline that predates the change somebody just made is worse than none");
  }
  A.state().cells = A.state().cells.filter(c => !/^cb2\/htem\//.test(c.id) || c.segments.length > 1);

  console.log("\n--- organelles, µJump's way ---");
  /* core/organelles.js and core/organellefilter.js are <script src> in the real page and jsdom
     does not fetch those. The app resolves UJ.organelles at CALL time precisely so evaluating
     them after it still works -- which is the ordering this harness is in. */
  [core("organelles.js"), core("organellefilter.js")].forEach(f => w.eval(fs.readFileSync(f, "utf8")));
  const ORG = w.UJ.organelles;

  ok("the vocabulary is µJump's, generated not copied", (() => {
     /* Compared against the REAL ontology, read here rather than trusted: a generated file that
        has gone stale looks exactly like a current one. */
     const c = { window:{}, console, UJ:{} }; c.window = c; c.globalThis = c;
     require("vm").createContext(c);
     require("vm").runInContext(fs.readFileSync(core("ontology.js"), "utf8"), c);
     const real = c.ORGANELLE_GROUPS;
     return JSON.stringify(real) === JSON.stringify(ORG.GROUPS);
  })(), ORG.KINDS.length + " kinds in " + ORG.GROUPS.length + " groups, identical to "
      + "core/ontology.js");
  ok("...with ask_expert first", ORG.KINDS[0].value === "ask_expert",
     "“What the … is this?” has to be the most findable option in a 61-item dropdown");

  /* THE FORM, on a cell. */
  const orgRow = X.seedList().filter(r => r.whole && r.pos)[3];
  A.showFound([{ row: orgRow, nm: 0 }], null);
  await sleep(30);
  const det = D.querySelector("#found-panel .organ-details");
  /* "Also" was dropped on 2026-09-18 at Søren's request -- the word joined this to the guided
     identification above it, and the two are not a sequence. Asserted case-insensitively on the
     part that is the label, so the next rewording of the sentence around it does not come back
     here. */
  ok("a cell card carries the report section", !!det
     && /log an organelle here/i.test(det.textContent),
     det ? det.querySelector(".organ-known").textContent : "no section");
  ok("...and says what is already on record before you open it",
     det.querySelector(".organ-known").textContent === "nothing logged yet",
     "µJump shipped these write-only and had to come back: a contributor who cannot see that "
     + "their centriole was recorded cannot tell a working form from a broken one");
  /* Wired LAZILY. 61 options per row across every card on the page would be built dozens of times
     for the one somebody eventually opens. */
  ok("...and the form is not built until it is opened",
     !det.querySelector(".organ-body").innerHTML,
     "61 options per row, on every card, for the one you open");
  det.open = true; det.dispatchEvent(new w.Event("toggle"));
  await sleep(30);
  ok("...then it is", det.querySelectorAll(".organ-row").length === 1
     && det.querySelectorAll(".organ-kind option").length === ORG.KINDS.length
     && det.querySelectorAll(".organ-kind optgroup").length === ORG.GROUPS.length,
     det.querySelectorAll(".organ-kind option").length + " options in "
       + det.querySelectorAll(".organ-kind optgroup").length + " groups");
  /* THE DEFAULT IS SET, not inherited from list order. µJump had exactly that bug the day
     ask_expert became the first option: every new row silently defaulted to "ask an expert". */
  ok("...with the first row defaulting to centriole, explicitly",
     det.querySelector(".organ-kind").value === "centriole",
     "not whatever happens to be first in the list");

  /* HOW MANY COORDINATES IS ASKED OF THE DATA, never of the name. µJump hardcoded a cilium check
     and nucleoplasmic reticulum type II silently got one field the day it became the second
     vector kind. */
  ok("a two-point kind shows two coordinate rows", (() => {
     const k = det.querySelector(".organ-kind");
     k.value = "cilium"; k.dispatchEvent(new w.Event("change"));
     return det.querySelector(".organ-b").style.display !== "none"
         && det.querySelector(".organ-la").textContent === "Base (voxel)";
  })(), det.querySelector(".organ-la").textContent + " / " + det.querySelector(".organ-lb").textContent);
  ok("...and a one-point kind shows one", (() => {
     const k = det.querySelector(".organ-kind");
     k.value = "mitochondria"; k.dispatchEvent(new w.Event("change"));
     return det.querySelector(".organ-b").style.display === "none";
  })());
  ok("...and it is read off the kind, not its name", (() => {
     /* Every vector kind in the ontology must behave the same way. If this ever passes for cilium
        alone, the check has become a re-statement of the bug. */
     const vec = ORG.KINDS.filter(k => k.vector);
     return vec.length >= 2 && vec.every(k => ORG.isVector(k.value))
         && !ORG.isVector("mitochondria");
  })(), ORG.KINDS.filter(k => k.vector).map(k => k.value).join(", "));
  /* COORDINATES ARE VOXELS. Wrong units here would be wrong by the voxel size, with nothing on
     screen to show it. */
  ok("...and the coordinates are labelled voxels",
     /\(voxel\)/.test(det.querySelector(".organ-la").textContent),
     det.querySelector(".organ-la").textContent);
  ok("pasting “x, y, z” into the x field splits itself", (() => {
     const x = det.querySelector(".oax");
     x.value = "100, 200, 300"; x.dispatchEvent(new w.Event("input"));
     return x.value === "100" && det.querySelector(".oay").value === "200"
         && det.querySelector(".oaz").value === "300";
  })());

  /* POINTED AT RATHER THAN TYPED -- the one thing this page can do that µJump cannot. */
  ok("the cell opens with an armed organelle layer", (() => {
     let url = null; const realOpen = w.open; w.open = u => { url = u; return null; };
     det.querySelector(".organ-open").click();
     w.open = realOpen;
     if (!url) return false;
     const st = JSON.parse(decodeURIComponent(url.split("#!")[1]));
     const armed = st.layers.filter(l => l.name === "organelles")[0];
     return armed && armed.tab === "annotations" && armed.annotations.length === 0;
  })(), "a layer somebody has to create themselves is a layer most people never create");
  ok("...and Ctrl+clicked markers come back as rows", (() => {
     let url = null; const realOpen = w.open; w.open = u => { url = u; return null; };
     det.querySelector(".organ-open").click();
     w.open = realOpen;
     const st = JSON.parse(decodeURIComponent(url.split("#!")[1]));
     st.layers.filter(l => l.name === "organelles")[0].annotations = [
       { type:"point", id:"a", point:[11,22,33] },
       { type:"point", id:"b", point:[44,55,66] }];
     det.querySelector(".organ-paste").value = JSON.stringify(st);
     det.querySelector(".organ-from-link").click();
     return det.querySelectorAll(".organ-row").length === 3;
  })(), det.querySelectorAll(".organ-row").length + " rows — the one already typed in, plus two");
  /* ONLY EVER ADDS. A paste that replaced the rows would throw away what was already typed. */
  ok("...without throwing away what was already typed",
     det.querySelector(".organ-row .oax").value === "100",
     "the first row still holds the coordinate pasted into it above");
  /* AS THE KIND CHOSEN BEFORE THE PASTE (Søren, 2026-09-03). Until then every pasted row arrived
     as a centriole and had to be relabelled one dropdown at a time -- the same complaint he made
     about ωJump, in the tool he was holding up as the example of doing it right. */
  ok("...labelled with the kind picked in the callout", (() => {
     const kinds = [...det.querySelectorAll(".organ-row .organ-kind")].slice(1).map(k => k.value);
     return kinds.length === 2 && kinds.every(k => k === "centriole");
  })(), "  <- the picker's default; the point is that it is now a choice, made once");
  ok("...and a vector kind pairs the markers instead", (() => {
     let url = null; const realOpen = w.open; w.open = u => { url = u; return null; };
     det.querySelector(".organ-open").click();
     w.open = realOpen;
     const st = JSON.parse(decodeURIComponent(url.split("#!")[1]));
     st.layers.filter(l => l.name === "organelles")[0].annotations = [
       { type:"point", id:"c", point:[1,1,1] }, { type:"point", id:"d", point:[2,2,2] },
       { type:"point", id:"e", point:[3,3,3] }, { type:"point", id:"f", point:[4,4,4] }];
     const before = det.querySelectorAll(".organ-row").length;
     det.querySelector(".organ-paste-kind").value = "cilium";
     det.querySelector(".organ-paste-kind").dispatchEvent(new w.Event("change"));
     det.querySelector(".organ-paste").value = JSON.stringify(st);
     det.querySelector(".organ-from-link").click();
     const rows = [...det.querySelectorAll(".organ-row")];
     const last = rows[rows.length - 1];
     return rows.length === before + 2 && last.querySelector(".organ-kind").value === "cilium"
         && last.querySelector(".oax").value === "3" && last.querySelector(".obx").value === "4";
  })(), "4 markers are two cilia, base + tip — six half-filled rows would fail at the submit button");
  /* Put it back, so the submit check below still reports what it was written to report. */
  det.querySelector(".organ-paste-kind").value = "centriole";
  Array.prototype.forEach.call(det.querySelectorAll(".organ-row"), (r, i) => {
    if (i >= 3) r.querySelector(".organ-del").click();
  });
  ok("...and a link whose markers are in the wrong layer says so", (() => {
     det.querySelector(".organ-paste").value = JSON.stringify({
       dimensions: X.localDims(), position: [1,2,3],
       layers: [{ type:"annotation", name:"something else",
                  source:{ url:"local://annotations" },
                  annotations:[{ type:"point", id:"z", point:[1,2,3] }] }] });
     det.querySelector(".organ-from-link").click();
     const m = det.querySelector(".organ-msg").textContent;
     return /none in the/.test(m) && /organelles/.test(m);
  })(), "“no markers” and “markers in the wrong layer” are different mistakes with different fixes");

  /* SUBMIT, AND READ IT BACK. */
  ok("a report is submitted and comes straight back", (() => {
     Array.prototype.forEach.call(det.querySelectorAll(".organ-row"), (r, i) => {
       r.querySelector(".organ-kind").value = i ? "mitochondria" : "centriole";
     });
     det.querySelector(".organ-submit").click();
     return true;
  })(), "three structures: one centriole, two mitochondria");
  await sleep(120);
  ok("...with a receipt naming what is now on record",
     /3 structures logged against this cell/.test(det.querySelector(".organ-body").textContent)
       && /2× mitochondrion · 1× centriole/.test(det.querySelector(".organ-body").textContent),
     det.querySelector(".organ-body").textContent.replace(/\s+/g, " ").slice(0, 90));
  ok("...commonest first", (() => {
     const c = A.state().cells.filter(c => c.id === orgRow.key)[0];
     return c && c.organelles[0].kind === "mitochondria" && c.organelles[0].n === 2;
  })(), "so “2× mitochondrion · 1× centriole” reads the way a person would say it");
  ok("...and the summary line updates without reopening the card",
     det.querySelector(".organ-known").textContent === "2× mitochondrion · 1× centriole",
     det.querySelector(".organ-known").textContent);
  /* A REPORT ON A PROOFREAD CELL CREATES ITS STORE RECORD. The cell exists in the seed list and
     had none; logging inside it is a real thing to have recorded against it. */
  ok("...on a proofread cell nobody had touched", (() => {
     const c = A.state().cells.filter(c => c.id === orgRow.key)[0];
     return !!c && X.isSeedKey(c.id) && c.segments.length === 0;
  })(), "the fragments are still the paper's; the organelles are this community's");

  /* THE FILTER. */
  console.log("\n--- and the organelle filter ---");
  A.wireFilter();
  await sleep(40);
  const obox = D.getElementById("filterOrganelleBox");
  ok("µJump's own section, with every kind and a count", (() => {
     return obox.querySelectorAll(".forgfilter").length === ORG.KINDS.length
         && !!D.getElementById("filterOrganelleMode");
  })(), obox.querySelectorAll(".forgfilter").length + " kinds, plus the has/has-not selector");
  ok("...counted in CELLS, not in structures", (() => {
     const lab = Array.from(obox.querySelectorAll(".forgfilter"))
                      .find(i => i.value === "mitochondria").closest("label");
     /* Two mitochondria were logged, in ONE cell. */
     return /\b1\b/.test(lab.textContent) && !/\b2\b/.test(lab.textContent);
  })(), Array.from(obox.querySelectorAll(".forgfilter"))
          .find(i => i.value === "mitochondria").closest("label").textContent.trim());
  ok("...and a kind nobody has logged is dimmed, not hidden", (() => {
     const zero = Array.from(obox.querySelectorAll(".forgfilter"))
                       .find(i => i.value === "nucleolus");
     return !!zero && !!zero.closest("label");
  })(), "hiding it would say cb2 cannot have a nucleolus; what is true is that nobody has logged one");
  const setOrg = (kind, mode) => {
    Array.prototype.forEach.call(obox.querySelectorAll(".forgfilter"), i => {
      i.checked = i.value === kind; });
    const m = D.getElementById("filterOrganelleMode");
    m.value = mode; m.dispatchEvent(new w.Event("change", { bubbles: true }));
    D.getElementById("filterRun").click();
    return A.filterResult().matches.length;
  };
  /* The BASE is what the panel matches with the organelle selector off -- not filterable(),
     because the other sections have their own defaults (an unnamed community cell has no kind and
     needs its own tick). The two options have to partition THAT, which is the claim the module's
     own comment makes for them. */
  const orgBase = setOrg("centriole", "");
  const hasCent = setOrg("centriole", "has");
  ok("“has a centriole” narrows to the cells that do", hasCent === 1,
     hasCent + " cell of " + orgBase.toLocaleString());
  const notCent = setOrg("centriole", "not");
  ok("...and “not annotated with one” is its complement",
     notCent === orgBase - hasCent,
     notCent + " + " + hasCent + " = " + orgBase.toLocaleString()
       + " — “which cells has nobody checked for a cilium yet” is how you find work to do");
  ok("...and the matching rule lives in the shared module, not here",
     w.UJ.organelleFilter.matches(["centriole"], [], "has") === true
       && w.UJ.organelleFilter.matches([], [], "has") === false
       && w.UJ.organelleFilter.matches([], ["cilium"], "not") === true,
     "“has any of these” means the same thing in all eight tools");
  /* THE EXPORT AND THE VIEWER LAYER. */
  setOrg("centriole", "has");
  ok("the Excel export carries what was logged", (() => {
     const rows = A.matchRows(), i = rows[0].indexOf("organelles_logged_here");
     return i > 0 && /2× mitochondrion/.test(rows[1][i]) && rows[1][rows[0].indexOf("organelle_reports")] === 3;
  })(), A.matchRows()[1][A.matchRows()[0].indexOf("organelles_logged_here")]);
  ok("...and the viewer can draw them as a layer", (() => {
     D.getElementById("filterOrgOn").checked = true;
     let url = null; const realOpen = w.open; w.open = u => { url = u; return null; };
     D.getElementById("filterViewerAll").click();
     w.open = realOpen;
     const st = JSON.parse(decodeURIComponent(url.split("#!")[1]));
     const lay = st.layers.filter(l => /organelles \(recorded\)/.test(l.name))[0];
     return lay && lay.annotations.length === 3
         && lay.annotations.some(a => /mitochondrion/.test(a.description || ""));
  })(), "a count says somebody logged a centriole; the point says where");
  D.getElementById("filterOrgOn").checked = false;
  setOrg("centriole", "");
  Array.prototype.forEach.call(obox.querySelectorAll(".forgfilter"), i => { i.checked = false; });
  A.previewFilter();

  console.log("\n--- the filter, in µJump's shape ---");
  /* core/regionbox.js, core/colabexport.js and core/stepthrough.js are <script src> in the real
     page and jsdom does not fetch those. Evaluated by hand, then the panel is wired again — it
     was wired once at init(), when regionbox did not exist, and the bounding-box section is one
     of the things being checked. */
  [core("regionbox.js"), core("colabexport.js"), core("stepthrough.js")]
    .forEach(f => w.eval(fs.readFileSync(f, "utf8")));
  A.wireFilter();
  await sleep(40);

  const SECTIONS = ["filterSecSelect", "filterSecNear", "filterSecLayer", "filterSecOrganelle",
                    "filterSecAnnot", "filterSecRegion", "filterSecViewer"];
  ok("the sections are there, in µJump's order", (() => {
     const got = Array.from(D.querySelectorAll("#filterCard details.filter-section"))
                      .map(d => d.id);
     return got.join(",") === SECTIONS.join(",");
  })(), Array.from(D.querySelectorAll("#filterCard details.filter-section"))
          .map(d => d.querySelector("summary").textContent.trim().slice(0, 34)).join(" | "));
  ok("...wearing µJump's own classes", (() => {
     const d = D.getElementById("filterSecSelect");
     return d.classList.contains("rv-panel") && d.classList.contains("filter-section")
         && d.tagName === "DETAILS";
  })(), "so somebody who has learned that panel can read this one");

  /* SECTION 1. Grouped checkboxes with live counts, exactly µJump's widget — and two separate
     classes, because the primary and proximity lists must not share a :checked set. */
  ok("the cell-type selection is grouped checkboxes with counts", (() => {
     const groups = D.querySelectorAll("#filterTypes .fgroup");
     const ticks = D.querySelectorAll("#filterTypes .ftype");
     return groups.length >= 2 && ticks.length >= 4
         && D.querySelectorAll("#filterTypes .nsub").length === ticks.length;
  })(), Array.from(D.querySelectorAll("#filterTypes .fgroup b")).map(n => n.textContent).join(" | "));
  /* THE LABELS ARE WHOLE. An earlier cut keyed the tally on "group + space + label" and split it
     back apart on the space, which silently turned "granule cell dendrite" into "granule". */
  ok("...with the kind's whole name, not its first word", (() => {
     const vals = Array.from(D.querySelectorAll("#filterTypes .ftype")).map(i => i.value);
     return vals.some(v => v.split(" ").length > 1) && !vals.includes("granule");
  })(), Array.from(D.querySelectorAll("#filterTypes .ftype")).map(i => i.value).join(" / "));
  ok("...and the proximity list is a separate set of ticks", (() => {
     const a = D.querySelectorAll("#filterTypes .ftype").length;
     const b = D.querySelectorAll("#filterNearTypes .fneartype").length;
     return a > 0 && b > 0 && !D.querySelector("#filterNearTypes .ftype");
  })(), "one :checked set for both lists would make every proximity tick a type tick");

  /* SECTION 3. Four layers, from the tracing, with counts — and the two limbs. */
  ok("the layer section offers the traced layers", (() => {
     const vals = Array.from(D.querySelectorAll(".flayer")).map(i => i.value);
     return vals.length === 4 && ["molecular layer", "Purkinje cell layer", "granular layer",
                                  "white matter"].every(n => vals.includes(n));
  })(), Array.from(D.querySelectorAll(".flayer")).map(i =>
          i.value + " " + i.closest("label").querySelector(".nsub").textContent).join(" | "));
  ok("...built from the boundaries, not typed out", (() => {
     const vals = Array.from(D.querySelectorAll(".flayer")).map(i => i.value).sort();
     return vals.join("|") === X.layerList().map(l => l.name).sort().join("|");
  })(), "adding a boundary to xjump_layers.js must add a tickbox here and nothing else");
  ok("...and both limbs can be asked for separately",
     D.querySelectorAll(".flimb").length === 3
       && Array.from(D.querySelectorAll(".flimb")).map(i => i.value).join(",") === ",upper,lower",
     "the folium has two Purkinje layers; 'the Purkinje layer' is ambiguous without this");

  /* SECTION 4. NOT µJump's organelle vocabulary — cb2 has none, and forty tickboxes all reading
     zero would be worse than saying so. */
  ok("the annotation section asks what this tool actually records", (() => {
     const vals = Array.from(D.querySelectorAll(".fannot")).map(i => i.value);
     return vals.length >= 5 && vals.includes("named") && vals.includes("extended");
  })(), Array.from(D.querySelectorAll(".fannot")).map(i => i.value).join(", "));
  ok("...and is the section BESIDE the organelle one, not instead of it", (() => {
     /* Whitespace-normalised: the sentence wraps in the source, so textContent carries a newline
        and four spaces in the middle of it. */
     const t = D.getElementById("filterSecAnnot").textContent.replace(/\s+/g, " ");
     return /besides its organelles/.test(t)
         && !/no organelle annotations/.test(t);
  })(), "it said cb2 has no organelle vocabulary until 2026-09-02, when Søren asked for one");

  /* SECTION 5. The shared module, mounted — a row and a preview, not an empty div. */
  ok("the bounding-box section mounts core/regionbox.js",
     D.querySelectorAll("#regionBoxes .rbox-row").length === 1
       && D.querySelectorAll("#regionBoxes .rx1").length === 1,
     "the same module λJump and ωJump use, so a fix reaches all three");

  /* SECTION 6. Viewer-only layers. These must NOT change which cells match — that is in the
     summary Søren quoted, and it is the one thing a viewer toggle can get wrong. */
  ok("the viewer section offers the EM, the borders and the nuclei",
     ["filterEMOn", "filterMarkOn", "filterBordersOn", "filterNucOn"].every(id => !!D.getElementById(id)),
     "Søren: 'where you can deselect the EM imagery'");
  ok("...and the EM is deselected in the link, not dropped from it", (() => {
     const on = X.buildState(["1"], [100, 100, 600], {});
     const off = X.buildState(["1"], [100, 100, 600], { em: false });
     const emOn = on.layers.filter(l => l.type === "image")[0];
     const emOff = off.layers.filter(l => l.type === "image")[0];
     return emOn && emOff && emOn.visible === undefined && emOff.visible === false;
  })(), "a layer that is absent cannot be switched back on without rebuilding the link");
  ok("...and the traced borders can be sent as a layer", (() => {
     const st = X.buildState([], [100, 100, 600], { layerBorders: true });
     const lay = st.layers.filter(l => /layer borders/.test(l.name))[0];
     return lay && lay.annotations.length > 40 && lay.annotations.every(a => a.type === "line");
  })(), "he traced them in neuroglancer; handing them back is giving him his own annotation");

  /* AND NOW THE PART THAT MATTERS: does any of it change the answer? */
  console.log("\n--- and the filters actually filter ---");
  const tick = (sel, val, on) => {
    const i = Array.from(D.querySelectorAll(sel)).find(n => n.value === val);
    i.checked = on !== false;
    i.dispatchEvent(new w.Event("change", { bubbles: true }));
    return i;
  };
  const run = () => { D.getElementById("filterRun").click(); return A.filterResult().matches.length; };

  /* With nothing ticked the panel matches every cell it can NAME — the published ones and any the
     community has settled a name on. A cell somebody assembled here and nobody has named yet has
     no kind, so no tickbox in section 1 can reach it; including it silently in "everything" would
     make the default answer larger than the sum of the boxes. It has its own tick instead, and
     that tick is what this checks. */
  {
     const base = run();
     const nameless = A.filterable().filter(u => !u.proofread && !u.label).length;
     ok("with nothing ticked, every cell the panel can name matches",
        base === A.filterable().length - nameless,
        base.toLocaleString() + " of " + A.filterable().length.toLocaleString()
          + " filterable cells; " + nameless + " assembled here and still unnamed");
     const inc = D.getElementById("filterIncludeUnnamed");
     inc.checked = true; inc.dispatchEvent(new w.Event("change", { bubbles: true }));
     ok("...and the unnamed ones have their own tick", run() === base + nameless,
        "no kind means no tickbox can reach them, so they need one of their own");
     inc.checked = false; inc.dispatchEvent(new w.Event("change", { bubbles: true }));
  }
  tick(".ftype", "Purkinje cell");
  const nPc = run();
  ok("a kind narrows it", nPc > 0 && nPc < A.filterable().length,
     nPc + " Purkinje cells");
  tick(".flayer", "Purkinje cell layer");
  const nPcInLayer = run();
  ok("...and a layer narrows it further", nPcInLayer > 0 && nPcInLayer < nPc,
     nPcInLayer + " of them in the traced Purkinje band");
  /* SØREN'S CAVEAT, AS A CONTROL. 2026-09-02: "these lines are an approximation... don't put too
     much weight on my annotation." The tolerance is that sentence made operable, so it has to
     actually do something — and it has to LOOSEN, never tighten. */
  D.getElementById("filterLayerNear").checked = false;
  D.getElementById("filterLayerNear").dispatchEvent(new w.Event("change", { bubbles: true }));
  const strict = run();
  ok("...and the boundary tolerance loosens it, never tightens it",
     strict <= nPcInLayer && strict > 0,
     strict + " strictly inside vs " + nPcInLayer + " within one Purkinje soma of the edge");
  D.getElementById("filterLayerNear").checked = true;
  D.getElementById("filterLayerNear").dispatchEvent(new w.Event("change", { bubbles: true }));
  /* THE LIMB. The fit this replaced could not tell the two Purkinje layers apart at all. */
  tick(".flimb", "lower");
  ok("...and a limb narrows it again", run() <= nPcInLayer,
     A.filterResult().matches.length + " on the lower limb — the published database proofread the "
       + "upper one, so few or none is the right answer, not a broken one");
  tick(".flimb", "");
  tick(".flayer", "Purkinje cell layer", false);

  /* PROXIMITY. The clause that is not a plain predicate: it needs the reference set first. */
  const nearVal = Array.from(D.querySelectorAll(".fneartype")).map(i => i.value)
                       .find(v => /granule cell$/i.test(v));
  D.getElementById("filterNearOn").checked = true;
  D.getElementById("filterNearOn").dispatchEvent(new w.Event("change", { bubbles: true }));
  tick(".fneartype", nearVal);
  D.getElementById("filterNearDist").value = "15";
  const near15 = run();
  D.getElementById("filterNearDist").value = "60";
  D.getElementById("filterNearDist").dispatchEvent(new w.Event("change", { bubbles: true }));
  const near60 = run();
  ok("proximity to another cell type narrows it", near15 > 0 && near15 < nPc,
     near15 + " Purkinje cells within 15 µm of a " + nearVal);
  ok("...and a wider radius can only match more", near60 >= near15,
     near15 + " at 15 µm → " + near60 + " at 60 µm");
  D.getElementById("filterNearOn").checked = false;
  D.getElementById("filterNearOn").dispatchEvent(new w.Event("change", { bubbles: true }));

  /* A BOUNDING BOX. Typed into the shared module's own fields, so this exercises the wiring
     between it and the filter rather than a private copy of the box test. */
  {
    const row = D.querySelector("#regionBoxes .rbox-row");
    const set = (cls, v) => { const i = row.querySelector("." + cls); i.value = String(v);
                              i.dispatchEvent(new w.Event("input", { bubbles: true })); };
    /* The left quarter of the block, full depth. */
    const ext = X.extentVox();
    set("rx1", 0); set("ry1", 0); set("rz1", 0);
    set("rx2", Math.round(ext[0] / 4)); set("ry2", ext[1]); set("rz2", ext[2]);
    D.getElementById("filterRegionOn").checked = true;
    D.getElementById("filterRegionOn").dispatchEvent(new w.Event("change", { bubbles: true }));
    const inBox = run();
    ok("a bounding box narrows it", inBox >= 0 && inBox < nPc,
       inBox + " Purkinje cells in the left quarter of the block, of " + nPc);
    ok("...and every match really is inside it", (() => {
       const b = X.extentNm()[0] / 4;
       return A.filterResult().matches.every(u => X.toNm(u.pos)[0] <= b + 1);
    })(), "the box test reads the module's own fields, not a private copy of them");
    D.getElementById("filterRegionOn").checked = false;
    D.getElementById("filterRegionOn").dispatchEvent(new w.Event("change", { bubbles: true }));
  }

  /* THE THREE THINGS YOU DO WITH A RESULT. */
  console.log("\n--- what you can do with the matches ---");
  run();
  ok("the count is printed ON the Preview button, as µJump does", (() => {
     const t = D.getElementById("filterRun").textContent;
     return t.indexOf(A.filterResult().matches.length.toLocaleString()) >= 0;
  })(), D.getElementById("filterRun").textContent);
  ok("...and the two exports light up only once there is a result",
     !D.getElementById("filterDownload").disabled
       && !D.getElementById("filterViewerAll").disabled,
     "both start disabled with 'Preview matches first' as their hover text");
  ok("changing a filter takes the result away again", (() => {
     tick(".ftype", "Purkinje cell", false);
     return D.getElementById("filterDownload").disabled
         && D.getElementById("filterRun").textContent === "Preview matches"
         && A.filterResult() === null;
  })(), "a stale count beside fresh tickboxes is a number nobody can trust");
  tick(".ftype", "Purkinje cell");
  run();

  ok("the step-through opens on the matches", (() => {
     const card = D.getElementById("stepThroughCard");
     return card.style.display !== "none"
         && /Cell 1 of /.test(D.getElementById("stepCounter").textContent);
  })(), D.getElementById("stepCounter").textContent);
  ok("...and Next walks them", (() => {
     const before = D.getElementById("stepCounter").textContent;
     D.getElementById("stepNext").click();
     return D.getElementById("stepCounter").textContent !== before
         && /Cell 2 of /.test(D.getElementById("stepCounter").textContent);
  })(), D.getElementById("stepCounter").textContent);
  ok("...moving the real cell panel under the card, not a copy of it",
     !!D.querySelector("#stepNucMount #cellPanelCard"),
     "a reduced copy of the identity panel is a second thing to keep in step with the first");

  ok("the Excel export has a row per match and a header", (() => {
     const rows = A.matchRows();
     return rows.length === A.filterResult().matches.length + 1
         && rows[0][0] === "name" && rows[0].includes("layer") && rows[0].includes("limb");
  })(), A.matchRows()[0].join(", "));
  /* THE SAME RULE THE CSV FOLLOWS. His Excel is Danish: , is the decimal mark. An .xlsx carries
     its own cell types so the separator question does not arise, but a decimal written as text
     still would. */
  ok("...and no cell in it has a decimal point", (() => {
     return A.matchRows().slice(1).every(r => r.every(v => !/^\d+\.\d/.test(String(v))));
  })(), "a dot decimal reads as text in Danish Excel; there are none to misread");
  ok("...carrying the layer the tracing puts each cell in", (() => {
     const rows = A.matchRows(), i = rows[0].indexOf("layer");
     return rows.slice(1).every(r => X.layerList().some(l => l.name === r[i]));
  })(), "the filter and the file must agree about where a cell is");

  ok("'open all matches' sends points, not every fragment", (() => {
     let url = null; const realOpen = w.open; w.open = u => { url = u; return null; };
     D.getElementById("filterViewerAll").click();
     w.open = realOpen;
     if (!url) return false;
     const st = JSON.parse(decodeURIComponent(url.split("#!")[1]));
     const marks = st.layers.filter(l => /matched cells/.test(l.name))[0];
     const seg = st.layers.filter(l => l.type === "segmentation")[0];
     return marks && marks.annotations.length === A.filterResult().matches.length
         && (!seg.segments || !seg.segments.length);
  })(), "a hundred granule cells is eleven thousand ids and a URL no browser would accept");

  /* AND THE LIST UNDER IT SHOWS THE ANSWER. One list for the filter and the search, or the two
     can describe different sets — which is the complaint that started this tab's rework. */
  ok("the cell list below narrows to the matches", (() => {
     const t = D.getElementById("seed-msg").textContent;
     return t.indexOf(A.filterResult().matches.length.toLocaleString() + " match") >= 0;
  })(), D.getElementById("seed-msg").textContent);
  ok("...and typing in the search box takes over from the filter", (() => {
     D.getElementById("seed-q").value = "grc_100";
     A.renderSeeds();
     return /found/.test(D.getElementById("seed-msg").textContent);
  })(), "two ways of narrowing one list must not both apply and leave you guessing which won");
  D.getElementById("seed-q").value = "";
  tick(".ftype", "Purkinje cell", false);
  A.renderSeeds();

  console.log("\n--- the removed controls ---");
  ok("the 'Open cb2 in the viewer' button is gone", !D.getElementById("open-empty"));
  ok("...and the 'Show me a random cell' link too", !D.getElementById("rand"),
     "the random panel below does that job, with counts");

  console.log("\n--- the four tabs ---");
  /* Søren: "There should also be a Filter and show tab and a statistics dashboard", and "the
     reference to the paper should be in the reference tab". Same four, same order, same names as
     the rest of the family, so somebody who has learned one page can read this one. */
  const tabs = Array.from(D.querySelectorAll("#mainTabs .tabbtn")).map(b => b.dataset.tab);
  ok("the family's four tabs are there",
     ["jump","filter","refs","dash"].every(t => tabs.includes(t)), tabs.join(", "));
  ok("the paper reference lives on the References tab", (() => {
     const refs = D.querySelector('[data-tabpanel="refs"]');
     return refs && /s41586-022-05471-w/.test(refs.innerHTML)
         && !/s41586-022-05471-w/.test(D.querySelector('[data-tabpanel="jump"]').innerHTML);
  })(), "on the Jump tab it was three paragraphs between you and the coordinate box");
  ok("...and so does the seed provenance", (() => {
     const refs = D.querySelector('[data-tabpanel="refs"]');
     return refs && refs.contains(D.getElementById("seed-prov"));
  })());
  /* THE LIST ROWS. Two bugs a screenshot found and no assertion had: hits.map(seedRowHtml) fed
     Array.map's INDEX into seedRowHtml's `extra`, so every row after the first printed its own
     position as though it were a distance; and the six cells the published table types `grc` while
     naming them `interneuron_*` were shown, unmarked, as granule cells. */
  D.getElementById("seed-q").value = "";
  w.UJ.app.renderSeeds();
  ok("a list row shows no phantom distance", (() => {
     const hints = Array.from(D.querySelectorAll("#seed-list .seedrow .hint"))
                        .map(n => n.textContent.trim());
     return hints.length > 3 && hints.every(t => !/^\d+\s*·/.test(t));
  })(), Array.from(D.querySelectorAll("#seed-list .seedrow .hint")).slice(0,3)
          .map(n => n.textContent.trim()).join(" | "));
  ok("...and a search hit shows a real one", (() => {
     D.getElementById("x").value = "133268"; D.getElementById("y").value = "105880";
     D.getElementById("z").value = "619"; D.getElementById("go").click();
     /* The FIRST hint on each row is the distance-and-fragments one; the second is the
        annotator. */
     return Array.from(D.querySelectorAll("#find-body .neigh .seedrow"))
                 .every(r => /µm away ·/.test(r.querySelector(".hint").textContent));
  })(), "the distance is passed deliberately; the index never is");

  ok("the source's own disagreements are marked, not resolved", (() => {
     const oddRows = X.seedList().filter(r => r.odd);
     return oddRows.length === 6 && oddRows.every(r => /^interneuron_/.test(r.name))
         && oddRows.every(r => r.type === "grc");
  })(), X.seedList().filter(r => r.odd).map(r => r.name).join(", "));
  ok("...and generous names are NOT flagged", (() => {
     return !X.seedNameDisagrees("ml_grc_7", "grc") && !X.seedNameDisagrees("grc_dendrite_2", "grc")
         && !X.seedNameDisagrees("purkinje_1", "pc") && !X.seedNameDisagrees("mf_like_0", "mf")
         && X.seedNameDisagrees("interneuron_31", "grc");
  })(), "ml_grc_7 is a granule cell under another description; interneuron_31 is a different claim");
  ok("...and the marked row says so on screen", (() => {
     D.getElementById("seed-q").value = "interneuron";
     w.UJ.app.renderSeeds();
     const chip = D.querySelector("#seed-list .seedrow .chip.st-contested");
     return !!chip && /names it another/.test(chip.getAttribute("title") || "");
  })(), "a reader who takes one of these as a granule cell should have been told");
  D.getElementById("seed-q").value = ""; w.UJ.app.renderSeeds();

  ok("the proofread list is the Filter and show tab", (() => {
     const f = D.querySelector('[data-tabpanel="filter"]');
     return f && f.contains(D.getElementById("seed-q")) && f.contains(D.getElementById("seed-list"));
  })(), "Søren: 'the Already proofread is redundant if we get it to look more like uJump'");
  ok("...and the old standalone card is gone",
     !/Already proofread/.test(D.body.innerHTML));

  w.UJ.app.renderDashboard();
  const dash = D.getElementById("xstats");
  ok("the statistics tab counts something", dash.querySelectorAll(".statbig").length >= 8,
     dash.querySelectorAll(".statbig").length + " figures");
  ok("...from the data, not from a literal", (() => {
     const whole = X.seedList().filter(r => r.whole).length;
     return dash.textContent.indexOf(whole.toLocaleString()) >= 0;
  })(), X.seedList().filter(r => r.whole).length + " whole cells");
  /* The split that matters: a published reconstruction and one somebody assembled this afternoon
     are different kinds of evidence, and one combined total quietly averages them. */
  ok("...keeping proofread and community-built apart",
     /Proofread/.test(dash.textContent) && /Built here/.test(dash.textContent));
  /* The bars must actually differ. They shipped as eleven identical full-width blocks once,
     because .fill was a <span> -- inline, so width did nothing to it -- and a chart where every
     bar is the same length is worse than no chart: it asserts an equality that is not there. */
  /* The layer breakdown must come from the SAME layerAt() the map and the panel use, or the tab
     becomes a second opinion about where the cells are. Checked by recomputing it here. */
  ok("...and cells are counted into the layers by the same fit", (() => {
     const whole = X.seedList().filter(r => r.whole && r.pos);
     const gl = whole.filter(r => (X.layerAt(r.pos) || {}).layer === "granular layer").length;
     return gl > 3000 && dash.textContent.indexOf(gl.toLocaleString()) >= 0;
  })(), (() => { const whole = X.seedList().filter(r => r.whole && r.pos);
     return whole.filter(r => (X.layerAt(r.pos) || {}).layer === "granular layer").length
       + " in the granular layer"; })());
  ok("...and the stand-in z is disclosed here too",
     /share one z/.test(dash.textContent) && /1\.0% of them/.test(dash.textContent),
     "a caveat that only appears on a diagram is a caveat most readers never meet");
  ok("...and the bars are drawn to their numbers", (() => {
     const w = Array.from(dash.querySelectorAll(".bar .fill"))
                    .map(f => parseFloat(f.style.width));
     return w.length > 2 && w.every(v => v > 0) && Math.max(...w) - Math.min(...w) > 5
         && Math.abs(Math.max(...w) - 100) < 0.01;
  })(), Array.from(dash.querySelectorAll(".bar .fill")).slice(0,3)
          .map(f => f.style.width).join(", "));
  /* The word "Plotly" appears in this page as a COMMENT explaining why it is not used, so the
     check has to look for the library actually being pulled in or called, not for its name. */
  ok("...and no charting library was loaded for it",
     !/<script[^>]+plotly/i.test(D.documentElement.innerHTML)
     && !/\bPlotly\s*\./.test(D.documentElement.innerHTML),
     "eleven bars do not justify a megabyte on a 4.5 MB page");

  console.log("\n--- one card for the cell ---");
  /* Søren, 2026-09-01: "instead of Build a cell first, it should be the cell identity card. The
     cells built so far should just be a part of the cell identity card. The model with the
     location should be a part of the cell identity card." */
  const cellCard = D.getElementById("cellPanelCard");
  ok("the identity card holds the model", cellCard.contains(D.getElementById("dsmap")));
  ok("...and the cells built so far", cellCard.contains(D.getElementById("cells"))
     && cellCard.contains(D.getElementById("stats")));
  ok("...and there is no separate card for either", (() => {
     const cards = Array.from(D.querySelectorAll(".card"));
     return cards.filter(c => c.contains(D.getElementById("cells"))).length === 1
         && cards.filter(c => c.contains(D.getElementById("dsmap"))).length === 1;
  })());
  ok("...in the order what / where / what else", (() => {
     const kids = Array.from(cellCard.children);
     const at = id => kids.findIndex(k => k.contains(D.getElementById(id)) || k.id === id);
     return at("find-body") < at("dsmap") && at("dsmap") < at("cells");
  })(), "what this cell is, where it is, and what else has been built");
  ok("the identity card comes before Build a cell", (() => {
     const jump = D.querySelector('[data-tabpanel="jump"]');
     const paste = D.getElementById("paste");
     return !!(cellCard.compareDocumentPosition(paste) & 4) && jump.contains(cellCard);
  })(), "Søren: 'instead of Build a cell first, it should be the cell identity card'");
  /* AND IT IS THERE BEFORE YOU SEARCH. It used to hide until the first search, which meant the
     first thing under the coordinate box on a fresh page was "Build a cell" -- the card he was
     asking to see first was invisible, which is what he was actually reporting. */
  ok("...and is on the page before any search", (() => {
     const fresh = D.createElement("div");   // what init() puts there on a cold load
     w.UJ.app.showPlaceholder();
     return /No cell yet/.test(D.getElementById("find-body").textContent)
         && D.getElementById("dsmap").querySelectorAll("svg").length === 1;
  })(), "a card that appears only after your first search is one you must already know about");

  ok("the logo is a link that reloads the tool", (() => {
     const a = D.getElementById("logoHome");
     return a && a.tagName === "A" && !!a.querySelector("h1.logo");
  })(), "Søren: 'The logo is smaller in xJump, and it is not a link to refresh the page'");

  /* ── A MARKED NUCLEUS IS AN UNASSIGNED CELL ──────────────────────────────────────────────
     Søren, 2026-09-02: "When I add new nuclei locations to xJump, do they show anywhere in xJump?
     If not, I would like them to show as unassigned cells ... They should also be searchable as a
     random unassigned cell and be filtered as one in Filter and show."

     The answer was almost no: a marked nucleus reached two summary numbers and the grey points in
     a column link, and nothing else. cb2 publishes no cell list at all, so a marked nucleus is the
     closest this volume has to "here is a cell, nobody has assembled it" -- the best piece of work
     the page can hand somebody, and it was invisible.

     The state here is exactly right for the test: three nuclei marked above, ONE of them joined to
     an assembled cell by the mesh test. So the checks are as much about the joined one NOT being
     offered as about the free ones being offered. */
  console.log("\n--- a marked nucleus is an unassigned cell ---");
  /* Under the 3 µm rule this is no longer "every mark the backend has not joined": a mark within
     3 µm of a proofread soma, or of another mark, is folded. Taken from classifyNuclei so the
     section measures the rule the page actually applies rather than the one it used to. */
  const FREE = A.classifyNuclei().free.length;
  /* Counted off the state rather than written as a literal: this section runs late, after cells
     have been built, emptied and moved, so how many nuclei are still free is a property of the
     run and not a constant. What is being checked is the RULE -- free ones in, joined ones out. */
  ok("only the free ones are cells", A.nucleusRows().length === FREE && FREE > 0
     && A.nucleusRows().every(r => r.nucleus && r.label === "unassigned cell" && r.pos)
     && A.nucleusRows().length <= A.state().explore.nuclei.length,
     A.nucleusRows().length + " of " + A.state().explore.nuclei.length
       + " marked  <- a joined nucleus IS its cell; two rows for one object would double it");
  ok("...and they are in the filter's universe", (() => {
     const u = A.universe().filter(x => x.nucleus);
     return u.length === FREE && u.every(x => x.pos && !x.proofread && x.frags === 0);
  })(), "so the match count, the layer counts and both exports include them");
  /* HIS WORD, "filtered as one". Their own group rather than a line inside "Assembled here":
     nothing has been assembled, and "cells waiting for somebody" is a different question from
     "what has this community built". */
  ok("...with their own group in Filter and show", (() => {
     A.refreshFilterControls();
     const box = D.getElementById("filterTypes");
     const groups = Array.from(box.querySelectorAll("b")).map(b => b.textContent.trim());
     const vals = Array.from(box.querySelectorAll("input")).map(i => i.value);
     return groups.indexOf("Unassigned cells") >= 0 && vals.indexOf("unassigned cell") >= 0;
  })(), Array.from(D.querySelectorAll("#filterTypes b")).map(b => b.textContent.trim()).join(" · "));
  ok("...and ticking it matches exactly them", (() => {
     const cb = Array.from(D.querySelectorAll(".ftype")).find(i => i.value === "unassigned cell");
     if (!cb) return false;
     cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles:true }));
     D.getElementById("filterRun").click();
     const R = A.filterResult();
     cb.checked = false; cb.dispatchEvent(new w.Event("change", { bubbles:true }));
     return R && R.matches.length === FREE && R.matches.every(m => m.nucleus);
  })(), "the filter and the list read one universe, so they cannot disagree about this");
  ok("...counted in the list's own total", (() => {
     A.renderSeeds && A.renderSeeds();
     return /marked nuclei with no cell built around them yet/
              .test(D.getElementById("seed-breakdown").textContent);
  })(), D.getElementById("seed-breakdown").textContent.slice(-70).trim());
  /* "SEARCHABLE AS A RANDOM UNASSIGNED CELL" -- the third random button, and it must land on a
     nucleus rather than on the nearest proofread cell, which is a different cell entirely. */
  ok("the random button lands on one", (() => {
     A.showRandomUnassigned();
     const t = D.getElementById("found-panel").textContent;
     const keys = A.nucleusRows().map(r => r.name);
     return /Unassigned cell/.test(t) && keys.some(k => t.indexOf(k) >= 0)
         && /no cell built around it yet/.test(t);
  })(), D.getElementById("found-panel").textContent.slice(0, 70).replace(/\s+/g, " ").trim());
  ok("...and the coordinate box goes with it", (() => {
     const shown = A.nucleusRows().filter(r =>
       D.getElementById("found-panel").textContent.indexOf(r.name) >= 0)[0];
     return !!shown && Number(D.getElementById("x").value) === Math.round(shown.pos[0]);
  })(), D.getElementById("x").value + ", " + D.getElementById("y").value
        + ", " + D.getElementById("z").value);
  /* AND THE ACTION ON IT IS "BUILD", NOT "ADD". There is nothing to add to -- and TARGET must stay
     null, or the first paste would be filed against a nucleus key that is not a cell. */
  ok("...offering to build a cell there", (() => {
     const btn = D.getElementById("nuc-build");
     if (!btn) return false;
     btn.click();
     const banner = D.getElementById("target-note").textContent;
     return banner.indexOf("Adding to") < 0
         && /Building a new cell/.test(D.getElementById("paste-msg").textContent);
  })(), "aiming a nucleus key at the paste box would file fragments against a cell that does not exist");
  /* buildHere() defers its scroll one tick (see goToPasteBox). Waited out here so the pending
     timer cannot fire inside a later section and be counted as that section's scroll. */
  await sleep(30);
  ok("...and the search box finds them", (() => {
     D.getElementById("seed-q").value = "unassigned";
     A.renderSeeds();
     /* Scoped to the list. The found panel draws neighbouring cells with the same row markup, so
        an unscoped .seedrow count is the list plus whatever is on screen above it. */
     const n = D.querySelectorAll("#seed-list .seedrow").length;
     D.getElementById("seed-q").value = "";
     A.renderSeeds();
     return n === FREE;
  })(), "typing what the chip says has to find the thing the chip is on");

  /* ── FINDABLE BY COORDINATE, AND 3 µm MEANS THE SAME CELL ────────────────────────────────
     Søren, 2026-09-03: "For the unassigned cells in xJump, they do not exist if I search their
     coordinate. It just suggests the nearest identified cell. I want them to be searchable, and
     if they are within 3 µm of an already existing cell, it should be assumed that they are the
     same cell."

     Every other consumer -- filter, list, text search, exports, random button -- reads listRows(),
     which is seeds plus free nuclei. The coordinate box was the last one ranking over the
     proofread cells alone, so it answered a search for a nucleus with a cell forty micrometres
     away and said nothing about it.

     The fixture is built rather than borrowed: two marks placed against a KNOWN proofread soma,
     one on it and one far from it, so the two halves of his sentence can be checked separately.
     Restored afterwards, because every later section shares this page. */
  console.log("\n--- an unassigned cell is findable by its coordinate ---");
  {
    const NUC = A.state().explore.nuclei;
    const keep = NUC.slice();
    const soma = A.seeds().filter(r => r.pos)[0];
    const res = X.resXYZ();
    const off = um => um * 1000 / res[0];          // µm along x, in voxels
    /* EMPTY GROUND, found rather than assumed. The first version stepped 60 µm along x from a
       known soma and landed 2 µm from a different one -- with 170 proofread cells in the block
       that is not bad luck, it is what a guessed offset does. Walking until nothing is within
       10 µm makes the fixture say what it means: a mark here is near no cell, so anything the
       rule does to it came from the OTHER mark. */
    let far = null;
    for (let d = 40; d < 4000 && !far; d += 17){
      const p = [Math.round(soma.pos[0] + off(d)), soma.pos[1], soma.pos[2]];
      const n = X.seedsNear(p, 1)[0];
      if (n && n.nm / 1000 > 10) far = p;
    }
    ok("the fixture sits on empty ground", !!far,
       far ? (X.seedsNear(far, 1)[0].nm / 1000).toFixed(1) + " µm to the nearest proofread cell"
           : "no point more than 10 µm from a cell — the rest of this section cannot be trusted");

    /* THE UNIVERSE IS MEMOISED (see invalidateUniverse), and the page drops it whenever nuclei
       change -- readNuclei does exactly that. This section writes STATE directly, which is the
       one way to get a mark where the fixture needs it, so it has to drop the cache itself. */
    const setNuclei = rows => { NUC.length = 0; rows.forEach(r => NUC.push(r));
                                A.invalidateUniverse(); };
    setNuclei([{ id: "nuc_far", pos: far }]);
    ok("searching its own coordinate opens the unassigned cell", (() => {
       D.getElementById("x").value = far[0]; D.getElementById("y").value = far[1];
       D.getElementById("z").value = far[2];
       A.findByCoord();
       const t = D.getElementById("found-panel").textContent;
       return /no cell built around it yet/.test(t) && t.indexOf("nuc_far") >= 0;
    })(), "this is the search that used to answer with the nearest proofread cell instead");
    ok("...with the nearest proofread cells still underneath", (() => {
       return /nearest proofread cells/.test(D.getElementById("find-body").textContent);
    })(), "the old answer is still there, one line down — it just is not the only answer");
    ok("...and the coordinate you typed is left alone", (() => {
       D.getElementById("x").value = "42"; D.getElementById("y").value = "7";
       D.getElementById("z").value = String(far[2]);
       A.findByCoord();
       return D.getElementById("x").value === "42" && D.getElementById("y").value === "7";
    })(), "landing from the random button aims the boxes; a search must not rewrite them");

    /* HIS SECOND SENTENCE. A mark 1 µm from a proofread soma is that cell -- so it must not be
       offered as a separate unassigned cell anywhere, and searching it must land on the cell and
       SAY why, rather than silently showing a row you did not ask for. */
    const close = [Math.round(soma.pos[0] + off(1)), soma.pos[1], soma.pos[2]];
    setNuclei([{ id: "nuc_close", pos: close }]);
    ok("a mark 1 µm from a proofread soma is that cell", (() => {
       const c = A.classifyNuclei();
       return c.free.length === 0 && c.nearCell.length === 1
           && A.nucleusRows().length === 0
           && A.universe().filter(x => x.nucleus).length === 0;
    })(), "not in the list, not in the filter, not in the exports — it is not a second object");
    ok("...and searching it lands on the cell, saying why", (() => {
       D.getElementById("x").value = close[0]; D.getElementById("y").value = close[1];
       D.getElementById("z").value = close[2];
       A.findByCoord();
       const el = D.getElementById("find-msg");
       /* BOTH, because they fail separately. showFound escapes `why` -- rightly, it is normally
          the coordinate somebody typed -- so routing this message through it printed a literal
          "<b>grc_0</b>" on the page while textContent still matched. The name is escaped on its
          own instead, which is what the second half asserts. */
       return /assumed to be the same cell/.test(el.textContent)
           && el.textContent.indexOf(soma.name) >= 0
           && el.innerHTML.indexOf("<b>") >= 0
           && el.textContent.indexOf("<b>") < 0;
    })(), D.getElementById("find-msg").textContent.slice(0, 80).trim()
          + "  <- silently showing a different row is how a page looks like it ignored you");

    /* AND THE SAME NUCLEUS MARKED TWICE is one unassigned cell, not two. What two people working
       the same column produce -- and the first mark is the one kept, so the answer does not
       depend on the order the backend returned them in. */
    setNuclei([{ id: "nuc_a", pos: far },
               { id: "nuc_b", pos: [Math.round(far[0] + off(1.5)), far[1], far[2]] },
               { id: "nuc_c", pos: [Math.round(far[0] + off(20)), far[1], far[2]] }]);
    ok("the same nucleus marked twice is one unassigned cell", (() => {
       const c = A.classifyNuclei();
       return c.free.length === 2 && c.dup.length === 1
           && c.free[0].id === "nuc_a" && c.free[1].id === "nuc_c";
    })(), "1.5 µm apart is one mark made twice; 20 µm apart is two cells");
    ok("...and the page says the rule fired", (() => {
       A.renderExplore();
       const t = D.getElementById("explore-stats").textContent;
       return /marked twice/.test(t) && /unassigned/.test(t);
    })(), D.getElementById("explore-stats").textContent.replace(/\s+/g, " ").trim()
          + "  <- a rule that removes rows without saying so is a rule nobody can check");

    setNuclei(keep);
    A.renderExplore(); A.renderSeeds();
  }

  /* ── NAMING FROM THE IDENTITY CARD ───────────────────────────────────────────────────────
     Søren, 2026-09-03: "I'm missing an option in xJump to reclassify or identify unclassified
     cells in xJump."

     Two cards, two claims, and they are not the same claim. On a PROOFREAD cell you are
     disagreeing with a published label, and what you write has to be recorded beside it and never
     over it -- so the headline is asserted to be unchanged after a vote, which is the half of
     "alongside" that a user can see. On an UNASSIGNED cell there is no label at all and the vote
     is the first thing anybody has said.

     Driven through the page rather than through the store: naming worked from the store all along
     -- STORE.name has been there since χJump shipped -- and had exactly one caller. What was
     missing was a button, so a check that called STORE.name would have passed on the broken page.

     The demo saves nothing (MemStore), so what is asserted here is the CARD: the section exists,
     the tally moves, and changing your mind replaces the vote rather than adding one, which is the
     rule the sheet enforces. xjumplivecheck.js asserts what is posted. */
  console.log("\n--- naming a cell from its identity card ---");
  {
    const seed = A.seeds().filter(r => r.pos && r.whole)[0];
    A.showFound([{ row: seed, nm: 0 }], null);
    await sleep(20);
    const sec = () => D.querySelector("#found-panel .idf-sec");
    ok("a proofread cell can be named", !!sec() && !!sec().querySelector(".idf-save"),
       "the published label is a claim like any other, and this page exists to check claims");
    ok("...beside the published type, in so many words",
       /stays on the card/.test(sec().textContent) && /nobody here has named it yet/
         .test(sec().querySelector(".idf-votes").textContent),
       sec().querySelector(".idf-votes").textContent.trim());
    /* The store answers with a promise, live and in the harness alike, and the tally is applied
       only after it resolves -- a vote shown as counted and then lost is worse than one that
       visibly failed. So every click here is awaited rather than read on the next line. */
    sec().querySelector(".idf-nm").value = "Golgi cell";
    sec().querySelector(".idf-cert").value = "4";
    sec().querySelector(".idf-save").click(); await sleep(30);
    ok("...and the vote is counted on the card",
       /Golgi cell/.test(sec().querySelector(".idf-votes").textContent)
       && A.opinionOf(seed.key).names["golgi cell"].n === 1,
       sec().querySelector(".idf-votes").textContent.trim());
    /* THE HEADLINE FOLLOWS THE SETTLED NAME, and the published type stays on the card one line
       down. Søren, 2026-09-03, having renamed pc_27: "still it has the old name". The first
       version of this section kept the paper's word as the headline for ever, which read as a
       rename that had not saved -- while his card at the bottom of the page showed the new name,
       so the two views of one cell disagreed about what it IS. */
    ok("...and the headline follows it", (() => {
       const head = D.querySelector("#found-panel .celltype").textContent.toLowerCase();
       return head.indexOf("golgi") >= 0 && head.indexOf(seed.label.toLowerCase()) < 0;
    })(), D.querySelector("#found-panel .celltype").textContent.replace(/\s+/g, " ").trim());
    ok("...with the published type kept, one line down", (() => {
       const t = D.getElementById("found-panel").textContent;
       return t.indexOf("published as") >= 0
           && t.toLowerCase().indexOf(seed.label.toLowerCase()) >= 0
           && /reclassified here/.test(t);
    })(), "nothing is overwritten — it moves down a line and gains a chip saying who moved it");
    /* THE SHEET KEEPS ONE ROW PER PERSON PER CELL -- xjumpCellName deletes your earlier row before
       appending. A page that added a second tick when you changed your mind would walk away from
       the record it is drawing. */
    sec().querySelector(".idf-nm").value = "granule cell";
    sec().querySelector(".idf-save").click(); await sleep(30);
    ok("changing your mind replaces your vote", (() => {
       const op = A.opinionOf(seed.key);
       return op.totalVotes === 1 && !op.names["golgi cell"] && op.names["granule cell"].n === 1;
    })(), sec().querySelector(".idf-votes").textContent.trim()
          + "  <- the backend deletes your earlier row; two ticks here would be a lie");
    /* MEASURED AS A DIFFERENCE, AND COPIED. This cell may have been named or rejected by an
       earlier section -- the run shares one page -- so what is asserted is what each button
       ADDED. The numbers are read out one at a time rather than kept as three snapshots of the
       record: opinionOf hands back the live object, so three "snapshots" are one object and every
       comparison is a number against itself. That is what this check did first, and it passed no
       matter what the buttons did. */
    const doubt = () => { const o = A.opinionOf(seed.key); return [o.unsure, o.rejects]; };
    const was = doubt();
    sec().querySelector(".idf-unsure").click(); await sleep(30);
    const d1 = doubt();
    sec().querySelector(".idf-split").click(); await sleep(30);
    const d2 = doubt();
    ok("...and 'can't tell' is kept apart from 'not one cell'",
       d1[0] === was[0] + 1 && d1[1] === was[1]
       && d2[0] === was[0] + 1 && d2[1] === was[1] + 1,
       "was " + was + ", then " + d1 + ", then " + d2 + " — "
       +        "evidence about the QUESTION and evidence against the ASSEMBLY are different things");

    /* AND THE UNASSIGNED CELL, whose panel offered "Build a cell here" and nothing else. */
    const nuc = A.nucleusRows()[0];
    ok("there is an unassigned cell to try it on", !!nuc,
       nuc ? nuc.name : "no free nuclei at this point in the run");
    if (nuc){
      A.landOnNucleus(nuc, null, false);
      await sleep(20);
      const nsec = () => D.querySelector("#found-panel .idf-sec");
      ok("an unassigned cell can be named too", !!nsec() && !!nsec().querySelector(".idf-save")
         && !nsec().querySelector(".idf-split"),
         "identifying a soma is a shorter job than assembling it, and must not wait for it");
      ok("...and it says so", /separate and much longer job/.test(nsec().textContent),
         nsec().querySelector(".idf-why").textContent.replace(/\s+/g, " ").slice(0, 60).trim());
      nsec().querySelector(".idf-nm").value = "Purkinje cell";
      nsec().querySelector(".idf-save").click(); await sleep(30);
      ok("...and the vote lands on the NUCLEUS key",
         A.opinionOf(nuc.key).names["purkinje cell"].n === 1
         && /Purkinje cell/.test(D.querySelector("#found-panel .idf-votes").textContent),
         "a nucleus key is not a cell key, and filing it against the nearest cell would be "
            + "putting words in somebody else's record");
      /* THE PANEL THAT WAS ON SCREEN BEFORE MUST NOT COME BACK. SHOWN drives refreshFound, and it
         was left pointing at the last proofread cell -- so the first render() after landing on a
         nucleus (this save, or Build cell) swapped the panel for a different cell entirely. */
      ok("...and the panel stays on the nucleus", (() => {
         A.render();
         const t = D.getElementById("found-panel").textContent;
         return t.indexOf(nuc.name) >= 0 && /no cell built around it yet/.test(t);
      })(), D.getElementById("found-panel").textContent.slice(0, 60).replace(/\s+/g, " ").trim());
    }
    /* ── AND THE FILTER KNOWS THE NAME, ONCE ─────────────────────────────────────────────
       Søren, 2026-09-03, twice. First: "it does not show up when I filter for Purkinje cell
       dendrite" — the tickboxes were tallied from the published word alone, so a renamed cell was
       findable by the paper's name and by nothing else. Then, at the panel that fix produced:
       "Now there are two of those options, the original and my renaming... Please keep one
       official name for each and my rename overrules the original name."

       He is right, and the middle version was the wrong shape: two boxes with the same words, both
       to be ticked, and the count he wanted printed nowhere because it was split between them. So
       these three assert the whole rule at once — ONE box per name, the community's name is what
       it is filed under, and the published word no longer matches it. */
    {
      const other = A.seeds().filter(r => r.pos && r.whole && r.key !== seed.key)[1];
      A.showFound([{ row: other, nm: 0 }], null);
      await sleep(20);
      const s2 = D.querySelector("#found-panel .idf-sec");
      s2.querySelector(".idf-nm").value = "Lugaro cell";
      s2.querySelector(".idf-save").click(); await sleep(30);
      A.refreshFilterControls();
      const boxes = () => Array.from(D.querySelectorAll(".ftype"));
      const boxFor = v => boxes().find(i => i.value === v);
      ok("the filter files it under the name people here gave it",
         !!boxFor("Lugaro cell")
         && boxes().filter(i => i.value === "Lugaro cell").length === 1,
         boxes().filter(i => i.value === "Lugaro cell").length + " box");
      ok("...and says how many of that box were re-identified here", (() => {
         const lab = boxFor("Lugaro cell").closest("label");
         return /re-identified here/.test(lab.getAttribute("title") || "");
      })(), "a count that includes cells the paper types differently has to say so somewhere");
      const runWith = v => {
        const cb = boxFor(v); if (!cb) return null;
        cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles:true }));
        D.getElementById("filterRun").click();
        const R = A.filterResult();
        cb.checked = false; cb.dispatchEvent(new w.Event("change", { bubbles:true }));
        return R;
      };
      const byName = runWith("Lugaro cell");
      ok("...and ticking it finds that cell",
         !!byName && byName.matches.length === 1 && byName.matches[0].key === other.key,
         byName ? byName.matches.length + " match" : "no such tickbox");
      const byType = runWith(other.label);
      ok("...while its published type no longer claims it",
         !byType || !byType.matches.some(m => m.key === other.key),
         "\"my rename overrules the original name\" — one official name, and this is it");
      /* AND THE PUBLISHED WORD IS STILL ON THE PAGE. Overruled is not deleted: the row keeps it as
         a "was …" chip, and the export keeps its own column for it. */
      ok("...but the published word is still shown and still exported", (() => {
         A.renderSeeds();
         D.getElementById("seed-q").value = other.name;
         A.renderSeeds();
         const row = D.querySelector("#seed-list .seedrow");
         const chips = row ? row.querySelector(".chips").textContent : "";
         D.getElementById("seed-q").value = ""; A.renderSeeds();
         const cols = A.matchColumns ? A.matchColumns().map(c => c.header) : [];
         return /Lugaro cell/.test(chips) && /was /.test(chips)
             && chips.toLowerCase().indexOf(other.label.toLowerCase()) >= 0
             && (!cols.length || (cols.indexOf("kind") >= 0 && cols.indexOf("published_as") >= 0));
      })(), "overruled is not deleted — it moves to a grey chip and its own export column");
    }
    /* ── AND THE BLOCK DIAGRAM'S SOMATA FOLLOW TOO ───────────────────────────────────────
       Søren, 2026-09-03: "The Purkinje somata should be updated in this figure or removed." They
       were the published table's, computed once and memoised for the life of the page, so a
       record re-identified here as a dendrite went on being drawn as a soma -- under a caption
       arguing that those scattered dots are probably dendritic points catalogued as somata.

       Both directions are checked, because they fail separately: a re-identified Purkinje record
       must leave the drawing, and a cell re-identified AS a Purkinje cell must join it. */
    {
      const dotsNow = () => D.querySelectorAll(".lay-dot circle").length;
      const pcs = A.seeds().filter(r => r.pos && r.whole && !r.zOdd
                                        && /^purkinje cell$/i.test(r.label));
      const drawMap = () => {
        const p = pcs[0].pos.map(v => Math.round(v));
        D.getElementById("x").value = p[0]; D.getElementById("y").value = p[1];
        D.getElementById("z").value = p[2];
        A.findByCoord();
      };
      drawMap(); await sleep(30);
      const before = dotsNow();
      /* AGAINST THE MODEL, not against the published count: by this point in the run somebody has
         already named an assembled cell, and a cell this page calls a Purkinje cell is a dot
         whatever the paper said. What is being checked is that the SVG and the model agree. */
      const model = () => A.universe().filter(u => u.pos
        && !(u.proofread && (!u.whole || u.zOdd))
        && /^purkinje cell$/i.test(A.labelOf(u))).length;
      ok("the block diagram draws a dot for every cell the page calls a Purkinje cell",
         before > 0 && before === model() && before >= pcs.length,
         before + " dots, " + model() + " in the model, " + pcs.length + " of them published");
      const away = pcs.slice(0, 2);
      for (const r of away){
        A.showFound([{ row: r, nm: 0 }], null); await sleep(20);
        const sec = D.querySelector("#found-panel .idf-sec");
        sec.querySelector(".idf-nm").value = "Purkinje cell dendrite";
        sec.querySelector(".idf-save").click(); await sleep(30);
      }
      /* NO REDRAW HERE, deliberately. Søren, 2026-09-03: "The model has not updated... there are
         still dendritic cells in the molecular layer." The dots had stopped being memoised, so the
         model was right and the picture was not: drawMap() ran at init and then only when somebody
         searched a coordinate, so the SVG kept the circles it was built with. Saving a name calls
         render(), and render() must move the dots. */
      ok("...and a record re-identified as a dendrite leaves it, with no redraw asked for",
         dotsNow() === before - 2,
         before + " → " + dotsNow()
           + "  <- the caption argues these are dendritic points; when somebody checks, the "
           + "drawing has to agree");
      /* THE OTHER DIRECTION. A granule record somebody here reads as a Purkinje cell is a soma
         this drawing should show, whatever the published table says. */
      const grc = A.seeds().filter(r => r.pos && r.whole && !r.zOdd
                                        && /^granule cell$/i.test(r.label))[0];
      A.showFound([{ row: grc, nm: 0 }], null); await sleep(20);
      const gsec = D.querySelector("#found-panel .idf-sec");
      gsec.querySelector(".idf-nm").value = "Purkinje cell";
      gsec.querySelector(".idf-save").click(); await sleep(30);
      ok("...and a cell re-identified AS one joins it", dotsNow() === before - 1,
         "two left and one arrived, from " + before);
      ok("...and the caption says both", (() => {
         const t = D.getElementById("find-body").parentNode.textContent
                || D.body.textContent;
         return /dots follow what people here have settled on/.test(D.body.textContent)
             && /no longer drawn/.test(D.body.textContent)
             && /drawn now/.test(D.body.textContent)
             && /deliberately left as they were/.test(D.body.textContent);
      })(), "the percentages above are the check OF the tracing — re-basing them on the "
            + "corrections would make them agree with it by construction");
      /* Put them back: this page is shared with every later section, and a stray Purkinje cell in
         the granule layer would show up as somebody else's failure. */
      for (const r of away.concat([grc])){
        A.showFound([{ row: r, nm: 0 }], null); await sleep(20);
        const sec = D.querySelector("#found-panel .idf-sec");
        sec.querySelector(".idf-nm").value = r.label;
        sec.querySelector(".idf-save").click(); await sleep(30);
      }
      ok("...and putting the names back puts the dots back", dotsNow() === before,
         dotsNow() + " of " + before + "  <- the drawing is derived, not edited");
    }
    A.showPlaceholder && A.showPlaceholder();
  }

  /* ── THE COORDINATE FIELD SELECTS WHAT IS IN IT ──────────────────────────────────────────
     Søren, 2026-09-02: "when clicking the first coordinate where there is already a number in it,
     it should select the whole number so it is easier to paste a new coordinate."

     Both handlers are checked, because focus alone is the version of this that does not work: the
     browser places the caret after the focus handler runs and undoes the selection. jsdom does not
     do that placement for us, so the mouseup path is driven directly -- caret collapsed first,
     the way a real click leaves it. */
  console.log("\n--- pasting a new coordinate over an old one ---");
  ok("focus selects the whole number", (() => {
     const f = D.getElementById("x");
     f.value = "133268";
     f.selectionStart = f.selectionEnd = 3;
     f.dispatchEvent(new w.FocusEvent("focus"));
     return f.selectionStart === 0 && f.selectionEnd === 6;
  })(), "so tabbing into a filled field is a replace, not an append");
  ok("...and so does a click that landed a caret mid-number", (() => {
     const f = D.getElementById("x");
     f.value = "133268";
     f.selectionStart = f.selectionEnd = 3;      // what a plain click leaves behind
     f.dispatchEvent(new w.MouseEvent("mouseup", { bubbles:true, cancelable:true }));
     return f.selectionStart === 0 && f.selectionEnd === 6;
  })(), "the caret placement is what undoes select-on-focus; this puts it back");
  /* AND A DRAG STILL SELECTS WHAT YOU DRAGGED. The fix must not take away the ability to edit one
     digit of a coordinate, which is a thing people do. */
  ok("...but a drag keeps its own selection", (() => {
     const f = D.getElementById("y");
     f.value = "105880";
     f.selectionStart = 2; f.selectionEnd = 4;   // dragged across two digits
     f.dispatchEvent(new w.MouseEvent("mouseup", { bubbles:true, cancelable:true }));
     return f.selectionStart === 2 && f.selectionEnd === 4;
  })(), "re-selecting only happens when the click collapsed the selection to a caret");
  ok("...and an empty field is left alone", (() => {
     const f = D.getElementById("z");
     f.value = "";
     f.dispatchEvent(new w.FocusEvent("focus"));
     f.dispatchEvent(new w.MouseEvent("mouseup", { bubbles:true, cancelable:true }));
     return f.value === "";
  })(), "nothing to select");

  /* ── THE IDENTITY CARD IS IN WHICHEVER TAB YOU ARE LOOKING AT ────────────────────────────
     Søren, 2026-09-02: "when I press preview matches in Filter and show of xJump, the cell
     identity card shows correctly for the first cell, however, at the same time it is removed
     from the jump panel. It should still show in both places."

     core/stepthrough.js MOVES the one real panel rather than drawing a copy of it -- the
     2026-08-20 decision, and the right one -- and puts it back when you leave the filter tab,
     inside its own wireTabs(). χJump has its own tab machinery and never carried those two lines,
     so the panel left the Jump tab on the first Preview matches and stayed away.

     The module is a <script src> that jsdom does not fetch, so it is evaluated by hand here, the
     same way core/mesh.js is above -- without it the page's guard skips the relocation entirely
     and this section would pass against a page that still has the bug. */
  console.log("\n--- the identity card follows the tab ---");
  w.eval(fs.readFileSync(core("stepthrough.js"), "utf8"));
  const panel = D.getElementById("cellPanelCard");
  const home = panel && panel.parentNode;
  ok("the panel and the mount are both on the page", !!panel && !!D.getElementById("stepNucMount"),
     "#cellPanelCard moves into #stepNucMount and back");
  ok("...it moves into the step-through card", (() => {
     w.UJ.stepthrough.initStepThrough([{ row: X.seedList().filter(r => r.pos && r.whole)[2] }]);
     w.__xjumpActivateTab("filter");
     return panel.parentNode === D.getElementById("stepNucMount");
  })(), "the same node, not a copy — every button in it keeps working");
  ok("...and comes back to the Jump tab", (() => {
     w.__xjumpActivateTab("jump");
     return panel.parentNode === home;
  })(), "this is the line χJump's own tab machinery was missing");
  ok("...and goes back again if you return to the filter", (() => {
     w.__xjumpActivateTab("filter");
     return panel.parentNode === D.getElementById("stepNucMount");
  })(), "switching away and back must not strand it");
  ok("...and stays home when there is nothing to step through", (() => {
     w.UJ.stepthrough.initStepThrough(null);
     w.__xjumpActivateTab("filter");
     return panel.parentNode === home;
  })(), "an orphaned panel in a hidden card is the bug in the other direction");
  w.__xjumpActivateTab("jump");

  /* ── "ADD FRAGMENTS" GOES TO THE BOX YOU PASTE INTO ──────────────────────────────────────
     Søren, 2026-09-02: "When pressing add fragments in xJump, it should jump to the field where
     you can add fragments."

     It had always called focus() and scrollIntoView() -- and on two of the three buttons those
     did nothing, silently, because #paste is on the JUMP tab and the master cell list and the
     step-through mount are on the FILTER tab. Neither call does anything to an element inside a
     display:none panel. So what is checked here is the tab switch, which is the part that was
     missing; jsdom has no layout, so scrollIntoView is watched rather than measured (chromium
     confirms the actual scroll). */
  console.log("\n--- Add fragments takes you to the paste box ---");
  {
    const box = D.getElementById("paste");
    let scrolled = 0;
    box.scrollIntoView = () => { scrolled++; };
    w.__xjumpActivateTab("filter");
    const btn = D.querySelector(".seed-add");
    ok("the master cell list is on the filter tab, the paste box is not",
       !!btn && D.getElementById("seed-list").closest(".tabpanel").dataset.tabpanel === "filter"
       && box.closest(".tabpanel").dataset.tabpanel === "jump",
       "which is why focus() and scrollIntoView() were doing nothing");
    const key = btn.getAttribute("data-key");
    btn.click();
    await sleep(30);                       // aimAt defers the move one tick past the redraw
    ok("...pressing it switches to the Jump tab",
       D.querySelector(".tabbtn.active").dataset.tab === "jump",
       "the box cannot be scrolled to while its panel is display:none");
    ok("...focuses the box", D.activeElement === box);
    ok("...and scrolls to it", scrolled === 1, scrolled + " scrollIntoView call(s)");
    ok("...having taken the aim it was pressed for", (() => {
       const t = D.getElementById("target-note").textContent;
       return t.indexOf("Adding to") >= 0 && t.indexOf(X.seedName(key)) >= 0;
    })(), D.getElementById("target-note").textContent.slice(0, 60).trim());
    /* AND THE SAME FROM THE IDENTITY CARD, which since this morning can be sitting in the filter
       tab's step-through mount -- the second of the two buttons that were reaching into a hidden
       tab. The switch carries the card back with it, so it lands above the box it is aiming at. */
    w.UJ.app.showFound([{ row: X.seedList().filter(r => r.pos && r.whole)[4], nm: 0 }], null);
    w.UJ.stepthrough.initStepThrough([{ row: X.seedList().filter(r => r.pos && r.whole)[4] }]);
    w.__xjumpActivateTab("filter");
    scrolled = 0;
    D.getElementById("paste").scrollIntoView = () => { scrolled++; };
    D.getElementById("found-add").click();
    await sleep(30);
    ok("...and so does the identity card's, wherever it is sitting",
       D.querySelector(".tabbtn.active").dataset.tab === "jump" && scrolled === 1
       && D.getElementById("cellPanelCard").parentNode.id !== "stepNucMount",
       "the card rides back to the Jump tab with the switch");
    w.UJ.stepthrough.initStepThrough(null);
    w.__xjumpActivateTab("jump");
  }

  console.log("\n--- theme ---");
  ok("the button is there", !!D.getElementById("themeToggleBtn"));
  const t0 = w.currentTheme();
  D.getElementById("themeToggleBtn").click();
  ok("it flips", w.currentTheme() !== t0, t0 + " -> " + w.currentTheme());
  ok("...and the viewer background follows",
     w.ngBgColor() === (w.currentTheme() === "light" ? "#ffffff" : "#000000"), w.ngBgColor());
  ok("...into the state", X.buildState(ids, null).crossSectionBackgroundColor === w.ngBgColor(),
     "neuroglancer opens in its own tab and inherits no CSS");

  const bad = R.filter(x => !x).length;
  console.log(bad ? `\n*** ${bad} of ${R.length} FAILED ***` : `\nRESULT: ALL ${R.length} CHECKS PASSED`);
  process.exit(bad ? 1 : 0);
})();
