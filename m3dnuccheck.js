/* The cell you can see into, and the nucleus inside it — which is always blue.      2026-09-17

   Søren: *"can you also make the other 3D window transparent cells and show the nucleus when it is
   available? Nucleus should always be blue."*

   Both halves are older than the request. blender/colour_policy.py has said since 2026-09-08 that
   "red MEANS vessel and blue MEANS nucleus", with NUC_COLOR = "#3a72d8"; and the notebook's own
   rule is that nuclei decide the transparency — a cell goes translucent when there is something
   inside it to see, and stays solid when there is not, because transparency with nothing behind it
   costs contrast and shows nothing. So what is checked here is that the PAGE now agrees with the
   export, in the one way that matters: by looking at the picture.

   IT COUNTS PIXELS, and that is the point. "The nucleus is blue" is a claim about what is on the
   screen, and every cheaper way of checking it — reading an options object, trusting a tint went
   where it was sent — would pass just as happily with the nucleus drawn behind an opaque cell, or
   in the middle of the picture instead of where it is in the cell. Both of those are mistakes this
   change could plausibly have made.

   Run: node m3dnuccheck.js */
const { chromium } = require("playwright");
const fs = require("fs");
const core = require("./corepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* A box, in µm, centred where asked — the unit core/mesh.js and core/nucmesh.js both hand back. */
const BOX = `(cx, cy, cz, r) => {
  const p = [], i = [];
  [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
    .forEach(v => p.push(cx + v[0]*r, cy + v[1]*r, cz + v[2]*r));
  [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,5,1],[0,4,5],
   [2,6,7],[2,7,3],[1,5,6],[1,6,2],[0,3,7],[0,7,4]].forEach(t => i.push(t[0],t[1],t[2]));
  return { positions: new Float32Array(p), indices: new Uint32Array(i) };
}`;

(async () => {
  const b = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"]
  });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.setContent(`<!doctype html><html><body>
    <div class="idrow"><button class="idbtn meshdl" data-root="864691135570733037"
         data-nucid="253863">Download 3D model</button></div>
    <div class="idrow" id="plain"><button class="idbtn meshdl" data-root="111">Download</button></div>
  </body></html>`);
  await p.addScriptTag({ content: fs.readFileSync(core("mesh3d.js"), "utf8") });

  /* The fetches are stubbed; the drawing is not. A cell 10 µm across with a 2 µm nucleus well off
     its centre, so "is the nucleus where it belongs" is answerable from the picture. */
  const shown = await p.evaluate(async ({ boxSrc }) => {
    const box = eval(boxSrc);
    window.__nucAsked = [];
    window.UJ = window.UJ || {};
    UJ.nucmesh = {
      configured: () => true,
      fetchNucleus: async (id) => {
        window.__nucAsked.push(id);
        return id === "253863" ? box(3, 0, 0, 1) : null;     // 3 µm off the cell's centre
      }
    };
    UJ.mesh3d.install({ fetch: async () => box(0, 0, 0, 5) });
    document.querySelector(".meshdl[data-nucid]").parentNode
      .querySelector(".m3d-btn").click();
    await new Promise(r => setTimeout(r, 600));
    const host = document.querySelector(".m3d-host");
    /* Where the blue is, not only that it is there: the nucleus sits 3 µm off the centre of a cell
       10 µm across, so it must be off-centre in the picture too. A nucleus re-centred on itself --
       which is what prepare() does without a `frame` — would paint the same pixels, in the middle,
       and look entirely plausible. */
    let sx = 0, n = 0;
    const blue = UJ.mesh3d.probePixels((r, g, bb, x) => {
      const isBlue = bb > r + 25 && bb > g + 15 && bb > 60;
      if (isBlue){ sx += x; n++; }
      return isBlue;
    });
    const cv = document.querySelector(".m3d-canvas");
    return { asked: window.__nucAsked.slice(), blue: blue,
             total: cv.width * cv.height,
             offCentre: n ? Math.abs(sx / n - cv.width / 2) / cv.width : 0,
             note: host.querySelector(".m3d-note").textContent,
             html: host.querySelector(".m3d-note").innerHTML };
  }, { boxSrc: BOX });

  ok(shown.asked.join(",") === "253863",
     "the nucleus is asked for by the id the tool already writes on the button", shown.asked.join(","));
  ok(shown.blue > 50, "...and blue is on the screen, through the cell around it",
     shown.blue + " blue pixels of " + shown.total);
  ok(/#3a72d8/i.test(shown.html),
     "...the one blue the Blender export uses, not a second one invented here",
     (shown.html.match(/#3a72d8/i) || [""])[0]);
  /* The discriminating pair: the SAME panel with the nucleus at the cell's centre. If the frame
     were not shared, prepare() would re-centre either nucleus on itself and the two would come out
     in the same place -- which is the mistake this asserts against, and the only way to see it is
     to measure both. */
  const centred = await p.evaluate(async ({ boxSrc }) => {
    const box = eval(boxSrc);
    UJ.nucmesh.fetchNucleus = async () => box(0, 0, 0, 1);
    document.body.insertAdjacentHTML("beforeend",
      '<div class="idrow" id="mid"><button class="idbtn meshdl" data-root="333" ' +
      'data-nucid="1" >Download</button></div>');
    await new Promise(r => setTimeout(r, 120));
    document.querySelector("#mid .m3d-btn").click();
    await new Promise(r => setTimeout(r, 600));
    const cv = document.getElementById("mid").nextElementSibling.querySelector(".m3d-canvas");
    let sx = 0, n = 0;
    UJ.mesh3d.probePixels((r, g, bb, x) => {
      const isBlue = bb > r + 25 && bb > g + 15 && bb > 60;
      if (isBlue){ sx += x; n++; }
      return isBlue;
    });
    return { blue: n, offCentre: n ? Math.abs(sx / n - cv.width / 2) / cv.width : 0 };
  }, { boxSrc: BOX });
  ok(centred.blue > 50, "a nucleus at the cell's centre is drawn too", centred.blue + " blue pixels");
  ok(shown.offCentre > centred.offCentre * 3,
     "...and the off-centre one is drawn WHERE IT SITS, not re-centred into the middle",
     "off-centre " + (shown.offCentre * 100).toFixed(1) + "% vs centred "
     + (centred.offCentre * 100).toFixed(1) + "%");
  ok(/Nucleus 253863/.test(shown.note) && /see-through/.test(shown.note),
     "...and the panel says what it did and why", shown.note.slice(-110));

  /* The same cell with no nucleus: solid, and no blue anywhere. */
  const plain = await p.evaluate(async ({ boxSrc }) => {
    const box = eval(boxSrc);
    document.querySelector("#plain .m3d-btn").click();
    await new Promise(r => setTimeout(r, 600));
    /* The panel is inserted AFTER the row, not inside it -- see install()'s own comment: these
       rows are flex, and a 300 px canvas dropped into one lays out as a very tall column. */
    const host = document.getElementById("plain").nextElementSibling;
    return { blue: UJ.mesh3d.probePixels((r, g, bb) => bb > r + 25 && bb > g + 15 && bb > 60),
             note: host.querySelector(".m3d-note").textContent,
             asked: window.__nucAsked.length };
  }, { boxSrc: BOX });
  ok(plain.asked === 1,
     "a button with no data-nucid asks for no nucleus at all", plain.asked + " asked in total");
  ok(plain.blue === 0, "...and nothing blue is drawn", plain.blue + " blue pixels");
  ok(!/see-through/.test(plain.note),
     "...and the cell stays SOLID — transparency with nothing behind it costs contrast and shows "
     + "nothing, which is the notebook's own rule", plain.note.slice(0, 60));

  /* A nucleus the volume does not have. Same outcome as no attribute at all: this is the ordinary
     case for most cells, not an error. */
  const missing = await p.evaluate(async ({ boxSrc }) => {
    const box = eval(boxSrc);
    UJ.nucmesh.fetchNucleus = async () => null;       // this volume has no mesh for that nucleus
    document.body.insertAdjacentHTML("beforeend",
      '<div class="idrow" id="nomesh"><button class="idbtn meshdl" data-root="222" ' +
      'data-nucid="999999">Download</button></div>');
    await new Promise(r => setTimeout(r, 120));          // the observer has to notice it
    document.querySelector("#nomesh .m3d-btn").click();
    await new Promise(r => setTimeout(r, 600));
    const host = document.getElementById("nomesh").nextElementSibling;
    return { blue: UJ.mesh3d.probePixels((r, g, bb) => bb > r + 25 && bb > g + 15 && bb > 60),
             note: host.querySelector(".m3d-note").textContent,
             drew: !!host.querySelector(".m3d-canvas") };
  }, { boxSrc: BOX });
  ok(missing.drew && missing.blue === 0 && !/see-through/.test(missing.note),
     "a nucleus the volume has no mesh for draws the cell solid, and says nothing about it",
     missing.blue + " blue pixels");

  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
