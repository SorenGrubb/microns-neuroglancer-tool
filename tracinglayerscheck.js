/* Several annotation layers on one link are several structures.                     2026-09-19

   Søren: *"If there is more than one annotation channel in the neuroglancer link, it should be
   suggested that there are more than one organelle, and the user can then deselect tracings if they
   are not supposed to be there, but all of them should be shown in the 3D window."*

   WHAT IT USED TO DO, which is what makes the first assertion worth making: every readable layer was
   poured into ONE structure. A cell, a mitochondrion and a nucleus drawn in three channels came back
   as one object with all of it in it, lofted into one impossible surface, committed under one name —
   and nothing on the card ever said the word "layer", so there was no way to notice.

   Asked which way a deselected tracing should go in the 3D window, he chose GONE, so the rule under
   test is exactly: **the picture is what will be committed.** That is asserted both ways — unticking
   takes a structure out of the preview AND out of what the Add button would submit, from the same
   TRACING_PENDING.rings, because two filters would be two chances to disagree.

   THE DEFAULT SELECTION IS THE OTHER HALF, and it is cautious for a reason this file can point at:
   µJump writes annotation layers into its own links everywhere — synapses, cell contacts, organelle
   points, centriole vectors — and some are POINTS, which three-to-a-section read as a contour. So a
   link carrying a layer called "tracing" ticks only that one; a link with no such layer ticks
   everything readable. Both are asserted, because the first is the one that stops a synapse layer
   being committed by somebody who did not look.

   Nothing here touches the network.

   Run: node tracinglayerscheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

function circle(cx, cy, z, r, n){
  const pts = [];
  for (let i = 0; i < n; i++){
    const t = 2 * Math.PI * i / n;
    pts.push([Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), z]);
  }
  pts.push(pts[0].slice());
  return pts;
}
/* One layer of one structure: a polyline per section, the shape Spelunker writes. */
function layer(name, cx, cy, zs, r){
  return { type: "annotation", name: name,
           annotations: zs.map(function(z, i){
             return { type: "polyline", id: name + i, points: circle(cx, cy, z, r, 20) };
           }) };
}
function url(layers){
  return "https://spelunker.cave-explorer.org/#!"
       + encodeURIComponent(JSON.stringify({ layers: layers }));
}
const ZS = [100, 105, 110];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 1300 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  /* Paste a link, press the button, and report what the card made of it. */
  async function read(link){
    return p.evaluate(async (link) => {
      document.getElementById("tracingPanel").open = true;
      document.getElementById("tracingLink").value = link;
      document.getElementById("tracingRead").click();
      await new Promise(r => setTimeout(r, 900));
      const box = document.getElementById("tracingLayers");
      const gs = (typeof tracingGroups === "function" && tracingGroups()) || [];
      return {
        groups: gs.map(g => ({ layer: g.layer, on: !!g.on, inst: g.inst,
                               rings: g.rings.length, sections: g.sections })),
        listShown: !!box && getComputedStyle(box).display !== "none",
        rows: box ? box.querySelectorAll(".laytick").length : 0,
        headline: box ? (box.querySelector("label") || {}).textContent || "" : "",
        pendingRings: ((TRACING_PENDING || {}).rings || []).length,
        pendingInsts: Array.from(new Set(((TRACING_PENDING || {}).rings || [])
                        .map(r => r.inst || 0))).sort((x, y) => x - y),
        eachOwn: !!(document.getElementById("tracingEachOwn") || {}).checked,
        status: (document.getElementById("tracingStatus") || {}).textContent || ""
      };
    }, link);
  }

  console.log("three channels are three structures, not one object with everything in it");
  {
    const got = await read(url([layer("cell", 1000, 2000, ZS, 160),
                                layer("mitochondrion", 1400, 2000, ZS, 40),
                                layer("nucleus", 1000, 2400, ZS, 70)]));
    ok(got.groups.length === 3, "one structure per annotation layer", got.groups.length);
    ok(got.groups.map(g => g.layer).join(", ") === "cell, mitochondrion, nucleus",
       "...each knowing which layer it came from", got.groups.map(g => g.layer).join(", "));
    ok(got.groups.every(g => g.rings === 3 && g.sections === 3),
       "...with its own contours, not the whole link's",
       got.groups.map(g => g.rings + "/" + g.sections).join(" "));
    ok(got.listShown && got.rows === 3, "the card lists them, one tick each",
       got.rows + " ticks, shown: " + got.listShown);
    ok(/3 annotation layers/.test(got.headline), "...and says how many there are", got.headline);
    ok(/3 annotation layers/.test(got.status),
       "...as does the line that reports the read", got.status.slice(-80));
    /* No layer called "tracing" here, so all three are his own channels and all three are ticked. */
    ok(got.groups.every(g => g.on) && got.pendingInsts.join(",") === "0,1,2",
       "with no “tracing” layer, everything readable is ticked",
       "insts " + got.pendingInsts.join(","));
    ok(got.eachOwn === true,
       "...and the card asks what each one is, rather than once for all three",
       "name each one separately: " + got.eachOwn);
  }

  console.log("\nunticking takes it out of the picture AND out of what would be committed");
  {
    const got = await p.evaluate(async () => {
      /* NULL-GUARDED so that a page with no layer list reports a row of FAILs rather than
         throwing: "something is wrong somewhere" is worth much less than five named things. */
      const t = document.querySelector('.laytick[data-inst="1"]');
      if (t){ t.checked = false; t.dispatchEvent(new Event("change")); }
      await new Promise(r => setTimeout(r, 900));
      const res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
      const rings = (TRACING_PENDING || {}).rings || [];
      /* What the preview is drawing, from the same rings the Add button would submit — one filter,
         so the two cannot disagree. */
      const byInst = {};
      rings.forEach(r => { byInst[r.inst || 0] = 1; });
      return {
        insts: Object.keys(byInst).map(Number).sort((a, b) => a - b),
        rings: rings.length,
        tris: UJ.traceloft.loft(rings.filter(r => (r.inst || 0) === 1), res).indices.length / 3,
        headline: ((document.getElementById("tracingLayers") || { querySelector: () => null })
                     .querySelector("label") || {}).textContent || "",
        text: (document.getElementById("tracingPaste3DHost") || { innerText: "" })
                .innerText.replace(/\s+/g, " ")
      };
    });
    ok(got.insts.join(",") === "0,2",
       "the unticked structure is gone from the contours in hand", got.insts.join(","));
    ok(got.rings === 6, "...so six contours are left of the nine", got.rings);
    ok(got.tris === 0, "...and it lofts to nothing, because it is not there to loft", got.tris);
    ok(/6 contours on 3 sections/.test(got.text),
       "the 3D window is showing what would be committed and nothing else",
       got.text.slice(0, 120));
    ok(/2 will be added/.test(got.headline || ""),
       "...and the list says how many that is", got.headline);
  }

  console.log("\nticking it back puts it back");
  {
    const got = await p.evaluate(async () => {
      const t = document.querySelector('.laytick[data-inst="1"]');
      if (t){ t.checked = true; t.dispatchEvent(new Event("change")); }
      await new Promise(r => setTimeout(r, 900));
      return { rings: ((TRACING_PENDING || {}).rings || []).length,
               text: (document.getElementById("tracingPaste3DHost") || { innerText: "" })
                       .innerText.replace(/\s+/g, " ") };
    });
    ok(got.rings === 9 && /9 contours on 3 sections/.test(got.text),
       "all nine are back, and all three are in the window",
       got.rings + " rings, " + got.text.slice(0, 60));
  }

  console.log("\na “tracing” layer is the one this tool makes, so it is the only one ticked");
  {
    /* THE CASE THAT MATTERS FOR THE SHARED RECORD. µJump's own links carry annotation layers of
       synapses and organelle points; three points sharing a z read as a contour. Beside a layer
       this tool made, they start unticked — visible, one click away, not committed by accident. */
    const got = await read(url([layer("tracing", 1000, 2000, ZS, 160),
                                layer("Synapses in", 3000, 3000, ZS, 30),
                                layer("Nucleus→centriole vectors", 5000, 3000, ZS, 30)]));
    ok(got.groups.length === 3, "all three are read and listed", got.groups.length);
    ok(got.groups.filter(g => g.on).length === 1 && !!got.groups[0] && got.groups[0].on,
       "...and only the one called “tracing” is ticked",
       got.groups.map(g => g.layer + ":" + (g.on ? "on" : "off")).join(" "));
    ok(got.pendingRings === 3,
       "...so what would be committed is the tracing alone, as it was before any of this",
       got.pendingRings + " rings");
    ok(got.eachOwn === false,
       "...and with one structure ticked the card asks what it is, once",
       "name each one separately: " + got.eachOwn);
  }

  console.log("\nand a new link does not wear the last one's clothes");
  {
    /* Both halves of this were live bugs, found by the two assertions above going the wrong way
       after an earlier section of this same check had run. The card keys colours and types BY
       NUMBER, so structure 1 of a new link would arrive wearing whatever somebody picked for
       structure 1 of the last one — and "name each one separately", which tracingApplySelection
       only ever turns ON (rightly: a tick set by hand mid-link must survive the next tick), stayed
       on for a link that has one structure. Reading a link is a fresh start, and this is the
       assertion that says so. */
    await p.evaluate(() => {
      const c = document.getElementById("tracingColor");
      c.value = "#ff00ff"; c.dispatchEvent(new Event("input"));
    });
    const before = await p.evaluate(() =>
      typeof padInstColour === "function" ? padInstColour(0) : "");
    const seeded = await p.evaluate(() =>
      (document.getElementById("tracingColor") || {}).value || "");
    const got = await read(url([layer("cell", 1000, 2000, ZS, 160),
                                layer("mitochondrion", 1400, 2000, ZS, 40)]));
    const after = await p.evaluate(() =>
      typeof padInstColour === "function" ? [padInstColour(0), padInstColour(1)] : ["", ""]);
    ok(before.toLowerCase() === "#ff00ff",
       "a colour picked on a one-structure link is that structure's colour", before);
    ok(seeded.toLowerCase() === "#ff00ff",
       "...and the picker is showing it, not its markup default", seeded);
    ok(after[0].toLowerCase() !== "#ff00ff" && after[0] !== after[1],
       "...and the next link starts from the palette again, one colour each",
       after.join(" / "));
    ok(got.eachOwn === true,
       "...while two structures turn the per-row naming back on", String(got.eachOwn));
  }

  console.log("\nand the picker is not decoration: it was dead on this route");
  {
    /* `#tracingColor` wrote PAD_INST_COLOUR behind `if(!PAD)return;`, so on the paste route — where
       there is no pad — it did nothing. The swatch sat at its markup default while the structure
       was committed in the palette's first colour. Both directions are asserted, because getting
       this wrong in the other direction is what broke tracingpanelcheck.js: the first version
       pushed the picker's stale default into the palette and changed the colour in the notebook. */
    /* A ONE-LAYER LINK, because with two structures the picker rightly steps aside and each naming
       row carries its own — which is what the previous section left the card in. */
    await read(url([layer("cell", 1000, 2000, ZS, 160)]));
    const got = await p.evaluate(async () => {
      const col = document.getElementById("tracingColor");
      const seeded = col.value;                       // straight after a read, untouched
      col.value = "#123456"; col.dispatchEvent(new Event("input"));
      await new Promise(r => setTimeout(r, 400));
      return { seeded: seeded, after: padInstColour(0),
               swatch: (document.querySelector("#tracingLayers span[style*=background]") || {})
                         .getAttribute ? document.querySelector("#tracingLayers span[style*=background]")
                         .getAttribute("style") : "" };
    });
    ok(got.seeded.toLowerCase() === "#40e28c",
       "a freshly read link seeds the picker from the palette, not the other way round", got.seeded);
    ok(got.after.toLowerCase() === "#123456",
       "...and picking a colour reaches the structure, which it never did before", got.after);
  }

  console.log("\na flat layer cannot be ticked, and does not refuse the others");
  {
    /* One section has no surface to close. Before 2026-09-19 a flat contour anywhere in the link
       refused the WHOLE link; now it is a row that says why, beside three that are fine. */
    const got = await read(url([layer("cell", 1000, 2000, ZS, 160),
                                layer("a stray outline", 4000, 2000, [100], 40)]));
    ok(got.groups.length === 2, "both layers are listed", got.groups.length);
    ok(!!got.groups[1] && got.groups[1].on === false && got.groups[1].sections === 1,
       "the one-section layer is not ticked", JSON.stringify(got.groups[1] || null));
    ok(got.pendingRings === 3 && /Volume|contour/.test(got.status) === true,
       "...and the good one is read rather than the link being refused outright",
       got.pendingRings + " rings — " + got.status.slice(0, 70));
    const why = await p.evaluate(() =>
      (document.getElementById("tracingLayers") || { innerText: "" })
        .innerText.replace(/\s+/g, " "));
    ok(/no surface to close/.test(why), "...and the row says why it cannot be", why.slice(-60));
  }

  console.log("\nthe bands µJump puts on its own links are still not a layer you can choose");
  {
    const bands = { type: "annotation", name: "Cortical layers", annotations: [
      { type: "line", id: "b1", pointA: [0, 0, 100], pointB: [90000, 1000, 100] },
      { type: "line", id: "b2", pointA: [90000, 1000, 100], pointB: [90000, 90000, 105] },
      { type: "line", id: "b3", pointA: [90000, 90000, 105], pointB: [0, 0, 105] }
    ]};
    const got = await read(url([bands, layer("cell", 1000, 2000, ZS, 160)]));
    ok(got.groups.length === 1 && (got.groups[0] || {}).layer === "cell",
       "they are excluded before anything is listed, not offered and unticked",
       got.groups.map(g => g.layer).join(", "));
    ok(got.listShown === false,
       "...so one real layer beside them is still not a choice worth showing",
       "list shown: " + got.listShown);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
