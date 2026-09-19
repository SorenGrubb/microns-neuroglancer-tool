/* The Jump beside an organelle shows the organelle.                                 2026-09-19

   Søren, pointing at the Jump next to a lysosome's centre: *"For the jump button here, it would
   make sense that it shows the organelle."*

   It wrote the coordinate into the three boxes and pressed the arrow, and the link the page then
   built had the cell on it and nothing else — so opening it put you inside a microglia at the right
   place with no indication of which grey blob was the 3.39 µm³ lysosome the row was about. The
   outline was in hand the whole time: the volume, the contour count and the centre on that same row
   were all computed from it.

   SO THE ASSERTIONS ARE ABOUT THE LINK, not about the button: a row that has an outline puts the
   outline on it, a row that has only a logged point puts a marker on it, and a jump that is about
   nothing puts nothing on it and — the part that is easy to get wrong — clears whatever the last
   one armed. Contours left over from a previous jump would be drawn at a coordinate they have
   nothing to do with, which looks exactly like a correct answer.

   Run: node organjumpcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* One outlined lysosome and one logged-only mitochondrion on the same cell, rendered through the
   real Organelles section so the buttons under test are the buttons he clicks. */
const SETUP = `(function(){
  var old = document.getElementById("commReports"); if (old) old.remove();
  var oldOrgan = document.getElementById("cellOrganelles"); if (oldOrgan) oldOrgan.remove();
  document.body.insertAdjacentHTML("beforeend", '<div id="commReports"></div>');
  var square = function(z){ return { z: z, points: [[1000,2000],[1100,2000],[1100,2100],[1000,2100]] }; };
  var rings = [square(100), square(101), square(102)];
  PANEL_ORGAN_RINGS = { "lys-1": rings };
  PANEL_TRACINGS = [{ structureId: "lys-1", name: "Lysosome 1", kind: "lysosome",
                      instanceOf: "lysosome", instanceIndex: 1, color: "#c83232",
                      nucleusId: "521491", contours: 3, sections: 3, volumeUm3: 3.39 }];
  var c = UJ.organellelink.centre(rings);
  PANEL_ORGAN_NID = "521491";
  PANEL_ORGAN_ANNS = [
    { kind: "lysosome", pointA: c.point.join(","), pointB: "", fromSegmentation: true,
      fromStructureId: "lys-1", by: "Søren Grubb" },
    { kind: "mitochondria", pointA: "9000,9000,50", pointB: "", fromSegmentation: false,
      fromStructureId: "", by: "Somebody" }
  ];
  renderOrganelleSection("521491", "");
  /* The arrow navigates for real and this harness has no network. Neutralised so the click can be
     observed where it is armed; the composition with buildState is asserted separately below. */
  var go = document.getElementById("go");
  go.click = function(){ window.__went = [document.getElementById("x").value,
                                          document.getElementById("y").value,
                                          document.getElementById("z").value].join(","); };
  var host = document.getElementById("cellOrganelles");
  return [].slice.call(host.querySelectorAll(".jumpview")).map(function(b){
    return { x: b.dataset.x, y: b.dataset.y, z: b.dataset.z, sid: b.dataset.sid || "",
             name: b.dataset.name || "", color: b.dataset.color || "",
             title: b.getAttribute("title") || "" };
  });
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

  const btns = await p.evaluate(src => eval(src)(), SETUP);   // eslint-disable-line no-eval

  console.log("the button says which organelle it is for");
  {
    const outlined = btns.filter(x => x.sid)[0];
    ok(btns.length === 2, "two rows, two Jumps", btns.length);
    ok(!!outlined && outlined.sid === "lys-1",
       "the outlined row's Jump names its structure", outlined && outlined.sid);
    ok(!!outlined && outlined.name === "Lysosome 1" && outlined.color === "#c83232",
       "...and carries its name and colour", outlined && (outlined.name + " " + outlined.color));
    ok(!!outlined && /outline on the viewer link/i.test(outlined.title),
       "...and says so, so it is not a mystery button",
       outlined && outlined.title.slice(0, 60));
    const logged = btns.filter(x => !x.sid)[0];
    ok(!!logged && logged.name === "Mitochondrion",
       "a logged point's Jump names what was logged", logged && logged.name);
    ok(!!logged && /no shape to show/i.test(logged.title),
       "...and says there is no outline behind it", logged && logged.title.slice(0, 70));
  }

  console.log("\nclicking it arms the outline for the next link");
  {
    const got = await p.evaluate(() => {
      ORGAN_SHOW_NEXT = null;
      var host = document.getElementById("cellOrganelles");
      var b = [].slice.call(host.querySelectorAll(".jumpview"))
                .filter(function(x){ return x.dataset.sid; })[0];
      b.click();
      return { went: window.__went || "",
               sid: ORGAN_SHOW_NEXT && ORGAN_SHOW_NEXT.sid,
               nRings: ORGAN_SHOW_NEXT && ORGAN_SHOW_NEXT.rings
                       ? ORGAN_SHOW_NEXT.rings.length : 0,
               colour: ORGAN_SHOW_NEXT && ORGAN_SHOW_NEXT.color };
    });
    ok(/^1050,2050,/.test(got.went), "the jump still goes where it always went", got.went);
    ok(got.sid === "lys-1", "...and the organelle is armed with it", got.sid);
    ok(got.nRings === 3, "...with its three contours, copied there and then", got.nRings);
    ok(got.colour === "#c83232", "...in the colour it was drawn in", got.colour);
  }

  console.log("\nand the link that gets built shows it");
  {
    const got = await p.evaluate(() => {
      const st = buildState([1050, 2050, 101]);
      const put = organOverlayInto(st);
      const lyr = (st.layers || []).filter(l => l.type === "annotation"
                                                && String(l.name) === "Lysosome 1")[0];
      const again = organOverlayInto(buildState([1050, 2050, 101]));
      return { put: put, again: again,
               n: lyr ? (lyr.annotations || []).length : -1,
               kinds: lyr ? Array.from(new Set((lyr.annotations || []).map(a => a.type))) : [],
               colour: lyr && lyr.annotationColor,
               local: lyr && lyr.source,
               selected: st.selectedLayer && st.selectedLayer.layer,
               armed: ORGAN_SHOW_NEXT };
    });
    ok(got.put === true, "the outline goes onto the state", got.put);
    /* Four vertices closed is four lines, three sections of it is twelve. */
    ok(got.n === 12, "...as twelve closed-loop lines, three contours' worth", got.n);
    ok(got.kinds.length === 1 && got.kinds[0] === "line",
       "...lines, the shape the tracing card can read back in", got.kinds.join("/"));
    ok(got.colour === "#c83232" && got.local === "local://annotations",
       "...in its own colour, on a local layer", got.colour + " " + got.local);
    ok(got.selected === "Lysosome 1", "...and selected, so the viewer opens on it", got.selected);
    ok(got.armed === null, "the slot is emptied by the read", JSON.stringify(got.armed));
    ok(got.again === false, "...so the next link does not carry it to a different coordinate",
       got.again);
  }

  console.log("\na row with no outline takes a marker, not a borrowed shape");
  {
    const got = await p.evaluate(() => {
      ORGAN_SHOW_NEXT = null;
      var host = document.getElementById("cellOrganelles");
      var b = [].slice.call(host.querySelectorAll(".jumpview"))
                .filter(function(x){ return !x.dataset.sid; })[0];
      b.click();
      const armedRings = ORGAN_SHOW_NEXT && ORGAN_SHOW_NEXT.rings;
      const st = buildState([9000, 9000, 50]);
      const put = organOverlayInto(st);
      const lyr = (st.layers || []).filter(l => l.type === "annotation"
                                                && String(l.name) === "Mitochondrion")[0];
      return { armedRings: armedRings, put: put,
               anns: lyr ? lyr.annotations : null };
    });
    ok(got.armedRings === null, "nothing pretends there is an outline", got.armedRings);
    ok(got.put === true, "...but the place is still marked", got.put);
    ok(!!got.anns && got.anns.length === 1 && got.anns[0].type === "point"
       && got.anns[0].point.join(",") === "9000,9000,50",
       "...with one point annotation, where it was logged",
       got.anns ? JSON.stringify(got.anns) : "none");
  }

  console.log("\na plain jump clears whatever the last one armed");
  {
    /* The failure this is really about: arm a lysosome, then navigate somewhere else, and the
       contours would be drawn at the new coordinate — a wrong answer wearing a right answer's
       clothes. */
    const got = await p.evaluate(() => {
      var host = document.getElementById("cellOrganelles");
      [].slice.call(host.querySelectorAll(".jumpview"))
        .filter(function(x){ return x.dataset.sid; })[0].click();
      const wasArmed = !!ORGAN_SHOW_NEXT;
      document.body.insertAdjacentHTML("beforeend",
        '<button id="plainjump" class="jumpview" data-x="1" data-y="2" data-z="3">Jump</button>');
      document.getElementById("plainjump").click();
      const after = ORGAN_SHOW_NEXT;
      document.getElementById("plainjump").remove();
      return { wasArmed: wasArmed, after: after };
    });
    ok(got.wasArmed === true, "the lysosome was armed", got.wasArmed);
    ok(got.after === null, "...and an unrelated jump empties the slot", JSON.stringify(got.after));
  }

  console.log("\nthe folded list of logged points carries its outline too");
  {
    const got = await p.evaluate(() => {
      const html = organelleStructRowsHtml([{ kind: "lysosome", pointA: "1,2,3", pointB: "",
        fromStructureId: "lys-1", source: "segmentation", by: "Søren Grubb",
        comment: "Volumetric centre of the outlined “Lysosome 1” (3.39 µm³, "
                 + "20 sections), registered from the segmentation rather than placed by hand." }]);
      const d = document.createElement("div"); d.innerHTML = html;
      const b = d.querySelector(".jumpview");
      return { sid: b && b.dataset.sid, name: b && b.dataset.name };
    });
    ok(got.sid === "lys-1", "the fold's Jump names the outline the centre came from", got.sid);
    ok(got.name === "Lysosome 1", "...under the name it was outlined as", got.name);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
