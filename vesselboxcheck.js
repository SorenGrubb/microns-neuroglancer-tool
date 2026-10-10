/* A vessel is longer than the box, and is chosen rather than caught.                  2026-10-09

   Søren: *"What if I want to include vasculature together with the bounding box I have, but it
   does not download it because the bounding box is smaller than the vasculature. Maybe it would
   be better if the vasculature could be added in some other way? Like for the cells? Then I could
   choose whether to include it or not."*

   He is right and it is my mistake from yesterday. I wrote that a vessel "travels in a region
   box's notebook by the box test, which for a vessel is exactly the right question". It is
   exactly the wrong question. The box test keeps a tracing whose CENTRE is inside the box, and a
   capillary's centre is wherever its middle happens to be — draw a box around one endothelial
   cell on a 60 µm capillary and the vessel's centre is 25 µm outside it. The whole reason to put
   a vessel in the scene is that it runs through and out of the picture.

   SO IT IS CHOSEN, LIKE THE CELLS. A tick on the box row, and the vessels come in WHOLE, every
   segment, box or no box. And then the box test must not apply to a vessel at all: two ways in is
   the architecture this project keeps paying for, so there is one — the tick.

   WHAT IS ASSERTED:
     - a vessel chosen by the tick travels even with its centre far outside the box
     - a vessel NOT chosen does not travel, even with its centre inside it
     - the tick reads "all traced vessels" or only the kinds ticked in Filter and show
     - ...and asking for ticked kinds with none ticked refuses rather than writing an empty list
     - a vessel carries its own colour into the notebook, which an organelle deliberately does not
     - every region-box row on every page has the tick, from one definition

   Run: node vesselboxcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};
const R = [4, 4, 40];
const BOX = { xmin: 398472 * 4, xmax: 408844 * 4, ymin: 227782 * 4, ymax: 232124 * 4,
              zmin: 181 * 40, zmax: 972 * 40 };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(3000);

  const has = await p.evaluate(() => !!(window.UJ && UJ.blender && UJ.blender.buildNotebook));
  if (!has){
    console.log("  (this page has no Blender export — nothing to check)");
    await b.close(); process.exit(0);
  }

  console.log("a vessel that runs out of the box");
  const nb = await p.evaluate(({ BOX, R }) => {
    const sq = (z, cx, cy, h) => ({ z: z,
      points: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] });
    /* Its centre is at x 430000 voxels — 86 µm past the box's own edge, which is the case he
       described: the box is round one cell, the capillary is not. */
    const far = { name: "Capillary A", kind: "capillary", type: "traced", is_vessel: 1,
                  color: "#c44bc4",
                  rings: [sq(1800, 430000, 220000, 300), sq(1801, 430100, 220050, 300)] };
    /* The same vessel without the flag: nobody ticked it, so it must not arrive by any other
       route — not even by sitting inside the box. */
    const inside = { name: "Capillary B", kind: "capillary", type: "traced",
                     color: "#c44bc4",
                     rings: [sq(400, 402000, 230000, 300), sq(401, 402010, 230010, 300)] };
    const run = (trs) => JSON.stringify(UJ.blender.buildNotebook({
      datasetId: "hjump", datasetLabel: "ηJump", emSource: "", segSource: "",
      boxNM: BOX, boxLabel: "Box 1", cells: [], tracings: trs, resNm: R,
      datasetTracings: false,
      include: { em: true, seg: true, meshes: true, nuclei: false, vasc: false }
    }));
    const a = run([far, inside]);
    return { chosen: a.indexOf("Capillary A") >= 0,
             unchosen: a.indexOf("Capillary B") >= 0,
             colour: /Capillary A[\s\S]{0,400}?#c44bc4/.test(a) };
  }, { BOX, R });
  ok(nb.chosen,
     "a vessel the tick chose travels whole, with its centre 86 µm outside the box — which "
     + "is the whole point: the vessel runs out of the picture", String(nb.chosen));
  ok(!nb.unchosen,
     "...and one nobody chose does not, even sitting inside the box, so the tick is the only way "
     + "a vessel gets in", nb.unchosen ? "arrived anyway" : "stayed out");
  ok(nb.colour,
     "...and it carries its own colour, which an organelle deliberately does not — a capillary "
     + "is magenta in the pad, the viewer and the scene or the picture lies", String(nb.colour));

  console.log("\nthe tick itself, from one definition");
  const ui = await p.evaluate(() => {
    if (typeof UJ.blender.vesselTickHtml !== "function") return { missing: true };
    const d = document.createElement("div");
    d.innerHTML = '<div class="rbox-row">' + UJ.blender.vesselTickHtml() + '</div>';
    document.body.appendChild(d);
    const row = d.querySelector(".rbox-row");
    const tick = row.querySelector(".colab-vessels");
    const which = row.querySelector(".colab-vessels-which");
    const off = UJ.blender.vesselWantFrom(row);
    tick.checked = true;
    const all = UJ.blender.vesselWantFrom(row);
    which.value = "ticked";
    const tickedNone = UJ.blender.vesselWantFrom(row);
    /* Tick a kind in the Filter-and-show Vasculature list, which is where the choice lives. */
    const host = document.createElement("div");
    document.body.appendChild(host);
    UJ.organelleFilter.render(host, { counts: {} });
    const cap = host.querySelector('.fvessel[value="capillary"]');
    if (cap) cap.checked = true;
    const tickedOne = UJ.blender.vesselWantFrom(row);
    return { off: off, all: all, tickedNone: tickedNone, tickedOne: tickedOne,
             opts: [].slice.call(which.options).map(o => o.value) };
  });
  if (ui.missing){
    console.log("  FAIL UJ.blender.vesselTickHtml is not on this page");
  } else {
    ok(ui.off === null, "unticked, no vessels are asked for at all", JSON.stringify(ui.off));
    ok(ui.all && ui.all.want === "all",
       "ticked, every traced vessel comes in — the default, because that is what he asked for",
       JSON.stringify(ui.all));
    ok(ui.opts.join(",") === "all,ticked",
       "...with the other choice being the kinds ticked in Filter and show", ui.opts.join(", "));
    ok(ui.tickedNone && ui.tickedNone.error,
       "...and asking for the ticked kinds with none ticked says so rather than writing an empty "
       + "list, which is the failure that looks like success",
       JSON.stringify(ui.tickedNone));
    ok(ui.tickedOne && Array.isArray(ui.tickedOne.want)
       && ui.tickedOne.want.join(",") === "capillary",
       "...once a kind is ticked there, that is what the box asks for",
       JSON.stringify(ui.tickedOne && ui.tickedOne.want));
  }

  console.log("\nand the box row on this page carries it");
  const inRow = await p.evaluate(() => {
    const host = document.getElementById("regionBoxes") || document.getElementById("rboxList");
    if (!host) return { noBox: true };
    /* The pages build a row on demand; add one the way the Add button does. */
    const add = document.getElementById("regionAdd") || document.getElementById("rboxAdd")
             || document.querySelector(".rbox-add");
    if (add) add.click();
    const row = host.querySelector(".rbox-row");
    const t = row && row.querySelector(".colab-vessels");
    const bl = row && row.querySelector(".colab-blender");
    let dimmed = null, live = null;
    if (t && bl){
      dimmed = t.disabled === true;
      bl.checked = true; bl.dispatchEvent(new Event("change", { bubbles: true }));
      live = t.disabled === false;
    }
    return { has: !!t, dimmed: dimmed, live: live,
             rows: host.querySelectorAll(".rbox-row").length };
  });
  if (inRow.noBox) console.log("  (no region-box panel on this page)");
  else {
    ok(inRow.has, "the Traced vasculature tick is on the box row",
       inRow.has ? "there" : "missing (" + inRow.rows + " row(s))");
    ok(inRow.dimmed === true,
       "...dimmed until Blender file is ticked, because the EM/segmentation notebook has nowhere "
       + "to put a 3D model \u2014 the same rule the Nuclei tick follows", String(inRow.dimmed));
    ok(inRow.live === true, "...and live once it is", String(inRow.live));
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
