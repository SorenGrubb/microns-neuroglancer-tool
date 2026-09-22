/* The cell with all its organelles.                                                 2026-09-20

   Søren, having just opened one lysosome in the viewer and sent back the render of it sitting
   inside its microglia: *"There should also be an option to view the cells with all its organelles,
   but under the organelles list."*

   Each row's Jump answers "where is this one, and what shape is it". Three lysosomes in a microglia
   is a claim about the CELL — where they sit relative to each other, whether they cluster, how much
   of the soma they take up — and that is a picture you cannot assemble by pressing Jump three
   times.

   SO THE ASSERTIONS ARE ABOUT THE LINK IT OPENS, not about the button: one annotation layer per
   outline, each in the colour it was drawn in, centred on the middle of the lot, with the cell and
   its nucleus in the 3D pane. And the two ways it could quietly mislead:

     - an outline whose geometry has not been read here cannot be drawn, so the count in the message
       must match what is actually on the link and the missing ones must be SAID;
     - the button must not appear at all on a cell with no outlines read, or on a page with no
       tracing card — core/panel.js serves six tools and only some of them can open one.

   Run: node organallcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* Three outlined lysosomes on one microglia, rendered through the real Organelles section so the
   button under test is the button he presses. `read` is how many of them have had their geometry
   fetched — the rest are listed but cannot be drawn. */
const SETUP = `(function(read){
  var old = document.getElementById("commReports"); if (old) old.remove();
  var oldOrgan = document.getElementById("cellOrganelles"); if (oldOrgan) oldOrgan.remove();
  document.body.insertAdjacentHTML("beforeend", '<div id="commReports"></div>');
  var square = function(z, o){ return { z: z, points: [[o,o],[o+100,o],[o+100,o+100],[o,o+100]] }; };
  var names = ["Lysosome 1", "Lysosome 2", "Lysosome 3"];
  var cols = ["#c83232", "#32c8a0", "#3264c8"];
  PANEL_ORGAN_RINGS = {};
  PANEL_TRACINGS = names.map(function(nm, i){
    var sid = "lys-" + i;
    if (i < read) PANEL_ORGAN_RINGS[sid] = [square(100 + i, 1000 + i*200), square(101 + i, 1000 + i*200)];
    return { structureId: sid, name: nm, kind: "lysosome", instanceOf: "lysosome",
             instanceIndex: i + 1, color: cols[i], nucleusId: "521491",
             rootId: "864691136741958236", contours: 2, sections: 2, volumeUm3: 1 + i };
  });
  PANEL_ORGAN_NID = "521491";
  PANEL_ORGAN_ANNS = [];
  window.__opened = null;
  /* The viewer opens its tab first and sends it on once the community's root IDs are read
     (2026-09-21), so the stub is a tab whose address is set later. */
  window.open = function(url){ var w = { location: { href: url || "" }, opener: 1 };
                               window.__tab = w; window.__opened = url || ""; return w; };
  renderOrganelleSection("521491", "864691136741958236");
  var host = document.getElementById("cellOrganelles");
  var b = host.querySelector(".organshowall");
  return { label: b ? b.textContent.trim() : "", title: b ? (b.getAttribute("title")||"") : "",
           present: !!b,
           /* It has to be UNDER the rows, which is where he asked for it. */
           afterRows: !!(b && host.querySelector(".organrow")
                         && (host.querySelector(".organrow").compareDocumentPosition(b) & 4)) };
})`;

const press = `(async function(){
  window.__opened = null; window.__tab = null;
  var b = document.getElementById("cellOrganelles").querySelector(".organshowall");
  if (!b) return { pressed: false };
  b.click();
  var t0 = Date.now();
  while (Date.now() - t0 < 7000 && !(window.__tab && window.__tab.location.href))
    await new Promise(function(r){ setTimeout(r, 100); });
  var url = (window.__tab && window.__tab.location.href) || window.__opened || "";
  var st = null;
  try { st = JSON.parse(decodeURIComponent(url.split("#!")[1] || "")); } catch (e){}
  var say = document.getElementById("tracingStatus");
  return { pressed: true, base: url.split("#!")[0],
           said: say ? say.textContent.trim() : "",
           pos: st && st.position,
           layers: st ? st.layers.map(function(l){
             return { type: l.type, name: l.name, colour: l.annotationColor,
                      n: (l.annotations || []).length, segments: l.segments }; }) : null,
           layout: st && st.layout && st.layout.type,
           selected: st && st.selectedLayer && st.selectedLayer.layer,
           cellAt: (typeof tracingCentreOfNucleus === "function") ? tracingCentreOfNucleus("521491") : null };
})`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  const setup = n => p.evaluate(([src, k]) => eval(src)(k), [SETUP, n]);  // eslint-disable-line no-eval
  const click = () => p.evaluate(src => eval(src)(), press);             // eslint-disable-line no-eval

  console.log("the offer sits under the list, and says how many");
  {
    const got = await setup(3);
    ok(got.present, "there is a button", got.present);
    ok(/all 3 organelles/.test(got.label), "...naming the count it will draw", got.label);
    ok(got.afterRows, "...below the rows, where he asked for it", got.afterRows);
    ok(/see-through in the 3D pane/i.test(got.title),
       "...and saying what opening it gets you", got.title.slice(0, 60));
  }

  console.log("\nand it opens the cell with every outline on it");
  {
    const got = await click();
    ok(got.pressed && !!got.pos, "a viewer link is built", got.pos ? got.pos.join(",") : "none");
    const anns = (got.layers || []).filter(l => l.type === "annotation");
    const named = anns.map(l => l.name).sort();
    ok(named.join("|") === "Lysosome 1|Lysosome 2|Lysosome 3",
       "one annotation layer per organelle, named as the rows name them", named.join(", "));
    /* One closed polyline per contour since 2026-09-22 (src/the_viewer_link_is_polylines.py);
       this read 8 when a four-vertex contour was four line annotations. */
    ok(anns.every(l => l.n === 2),
       "...each carrying its own contours, one polyline a section",
       anns.map(l => l.n).join("/"));
    const cols = anns.map(l => l.colour).sort();
    ok(cols.join("|") === "#3264c8|#32c8a0|#c83232",
       "...in the colours they were drawn in, so they are told apart", cols.join(", "));
    /* The cell is the other half of the request: "view the cells with all its organelles". */
    const segs = (got.layers || []).filter(l => l.type === "segmentation");
    ok(segs.some(l => (l.segments || []).indexOf("864691136741958236") >= 0),
       "the cell itself is on it", JSON.stringify(segs.map(l => l.segments)));
    ok(segs.some(l => (l.segments || []).indexOf("521491") >= 0),
       "...and its nucleus", JSON.stringify(segs.map(l => l.segments)));
    ok(got.layout === "xy-3d", "...with a 3D pane for them to appear in", got.layout);
    /* ON THE CELL, 2026-09-21. Søren: "for the microglia it should be on its own center." Centred
       on the cell's nucleus where the page knows it, and between the outlines only where it does
       not -- never on one of them. */
    if (got.cellAt)
      ok(got.pos && got.pos.map(Math.round).join(",") === got.cellAt.join(","),
         "centred on the cell's own nucleus", got.pos && got.pos.join(",") + " (nucleus at " + got.cellAt.join(",") + ")");
    else
      ok(got.pos && got.pos[0] > 1200 && got.pos[0] < 1500,
         "centred between the three, not on one of them", got.pos && got.pos.join(","));
    ok(/3 organelles/.test(got.said), "and the page says what it opened", got.said.slice(0, 70));
  }

  console.log("\nan outline it could not read is left off, and said so");
  {
    /* The index carries no contours — that is what makes listing cheap — so a structure whose
       geometry has not been fetched cannot be drawn. Quietly drawing two and claiming three is the
       failure this guards. */
    await setup(2);
    const got = await click();
    const anns = (got.layers || []).filter(l => l.type === "annotation");
    ok(anns.length === 2, "only the outlines in hand are drawn", anns.length);
    ok(/2 organelles/.test(got.said), "...and the count matches what went on the link",
       got.said.slice(0, 60));
    ok(/1 more outline has not been read/.test(got.said),
       "...with the missing one accounted for rather than dropped", got.said.slice(0, 120));
  }

  console.log("\nand nothing is offered when there is nothing to draw");
  {
    const got = await setup(0);
    ok(got.present === false,
       "no button on a cell whose outlines have not been read", got.present);
  }
  {
    /* core/panel.js serves six tools; only the ones with a tracing card can open a viewer full of
       contours. A button that alerts "not on this page" is worse than no button. */
    const got = await p.evaluate(([src, k]) => {
      const real = window.organShowAllInViewer;
      window.organShowAllInViewer = undefined;
      // eslint-disable-next-line no-eval
      const out = eval(src)(k);
      window.organShowAllInViewer = real;
      return out;
    }, [SETUP, 3]);
    ok(got.present === false, "nor on a page that cannot open one", got.present);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
