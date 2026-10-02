/* A coordinate written in a sentence is a place you can go.                        2026-10-01

   Søren, on Gary's forum idea: *"what if a user wants to talk about more than one coordinate in a
   post? Can we instead make it recognise when a coordinate or rootID is pasted and then make it
   into a link automatically?"* And: *"Make sure that it recognises the minnie35 and minnie65
   differences but opens the viewer with both segmentation layers and both em layers."*

   RESOLVE, DO NOT PATTERN-MATCH. A bare six-digit number could be a nucleus id, a count or a year,
   and a triple of numbers could be a coordinate or three measurements. So the rule is not "does it
   look like one" but "is it one": a number becomes a nucleus link only if that nucleus is in this
   volume's table, and a triple becomes a coordinate only if it lands INSIDE one of the two imaged
   volumes. Everything else stays as the text somebody typed.

   WHAT IS ASSERTED:
     - a root id, a coordinate, a real nucleus id and a pasted viewer URL each become one link
     - a six-digit number that is NOT a nucleus stays text, which is the whole ambiguity argument
     - a triple inside minnie65 says minnie65; one inside minnie35 only says minnie35; one outside
       both is not a coordinate at all
     - the same triple written in nanometres is recognised and converted
     - a coordinate's own components are not then re-read as nucleus ids
     - THE TEXT IS ESCAPED. This is user-written text going into innerHTML on a page holding a
       Google credential. It is scanned RAW and emitted ESCAPED -- scanning escaped text would let
       the digits inside "&#39;" be read as a number, which is both a wrong link and a broken entity
     - and the viewer state carries BOTH EM layers and BOTH segmentations, wherever the point is,
       with the nuclei layer only where nuclei exist

   Run: node jumplinkcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what
                             + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.fulfill({ status: 200,
    contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [],
                           rows: [], newCells: [] }) }));
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**raw.githubusercontent.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("\nthe page can be asked what a piece of text refers to");
  const have = await p.evaluate(() => ({
    mod: !!(window.UJ && UJ.jumplink && typeof UJ.jumplink.scan === "function"
            && typeof UJ.jumplink.html === "function"),
    host: typeof window.jumpLinkHost === "function"
  }));
  ok(have.mod, "core/jumplink.js is loaded and exposes scan() and html()");
  ok(have.host, "...and µJump answers what it needs to resolve against");
  if (!have.mod){
    console.log("\n" + (fails || 1) + " FAILED");
    await b.close(); process.exit(1);
  }

  /* The fixtures are built FROM THE PAGE'S OWN extents and nucleus table, not written down here a
     second time: a check carrying its own copy of a bounding box tests the copy. */
  const fx = await p.evaluate(() => {
    const r = [UJ_RX, UJ_RY, UJ_RZ];
    const bb65 = window.MINNIE65_EM_BB, bb35 = window.MINNIE35_EM_BB;
    const mid = (a, b) => (a + b) / 2;
    const vox = nm => [Math.round(nm[0] / r[0]), Math.round(nm[1] / r[1]), Math.round(nm[2] / r[2])];
    /* Dead centre of minnie65. */
    const in65 = vox([mid(bb65.xmin, bb65.xmax), mid(bb65.ymin, bb65.ymax),
                      mid(bb65.zmin, bb65.zmax)]);
    /* Inside minnie35's slab and BELOW minnie65's, so it can only be one of them. */
    const in35 = vox([mid(bb35.xmin, bb35.xmax), mid(bb35.ymin, bb35.ymax),
                      mid(bb35.zmin, Math.min(bb35.zmax, bb65.zmin))]);
    /* Past the deep end of both. */
    const nowhere = vox([mid(bb65.xmin, bb65.xmax), mid(bb65.ymin, bb65.ymax),
                         bb65.zmax + 500000]);
    return { in65: in65, in35: in35, nowhere: nowhere,
             in65nm: [in65[0] * r[0], in65[1] * r[1], in65[2] * r[2]],
             aNucleus: String(NID[0]), anotherNucleus: String(NID[1]),
             n: N, res: r };
  });
  const say = a => a.join(", ");

  const scan = t => p.evaluate(s => UJ.jumplink.scan(s).map(h => ({
    kind: h.kind, raw: h.raw, volume: h.volume || "", unit: h.unit || "",
    voxel: h.voxel || null, label: h.label || "" })), t);

  console.log("\nwhat it recognises");
  {
    const h = await scan("Compare 864691135570733037 with the one next to it.");
    ok(h.length === 1 && h[0].kind === "root", "a root id in a sentence is one hit",
       h.map(x => x.kind + ":" + x.raw).join(" "));
    ok(h[0] && h[0].raw === "864691135570733037", "...and it is the whole id", h[0] && h[0].raw);
  }
  {
    const h = await scan("The interesting one is at " + say(fx.in65) + " in my opinion.");
    ok(h.length === 1 && h[0].kind === "coord", "a coordinate triple is one hit, not three numbers",
       h.map(x => x.kind + ":" + x.raw).join(" "));
    ok(h[0] && h[0].volume === "minnie65", "...and it knows which volume it is in", h[0] && h[0].volume);
    ok(h[0] && h[0].unit === "voxel", "...and that it was written in voxels", h[0] && h[0].unit);
  }
  {
    const h = await scan("Out in " + say(fx.in35) + " there is no segmentation.");
    ok(h.length === 1 && h[0].volume === "minnie35",
       "a coordinate in minnie35's slab says minnie35",
       h.map(x => x.kind + ":" + x.volume).join(" "));
  }
  {
    const h = await scan("The numbers " + say(fx.nowhere) + " are from a different experiment.");
    ok(h.length === 0, "three numbers that land outside both volumes are not a coordinate",
       h.map(x => x.kind + ":" + x.raw).join(" ") || "nothing linked");
  }
  {
    const h = await scan("In nanometres that is " + say(fx.in65nm) + ".");
    ok(h.length === 1 && h[0].unit === "nm", "the same place written in nanometres is recognised",
       h.map(x => x.kind + ":" + x.unit).join(" "));
    ok(!!(h[0] && h[0].voxel && Math.abs(h[0].voxel[0] - fx.in65[0]) <= 1),
       "...and converted to voxels, so the link opens the same place",
       h[0] && h[0].voxel && h[0].voxel.join(", "));
  }

  console.log("\nand what it deliberately does not");
  {
    const h = await scan("We looked at cell " + fx.aNucleus + " this morning.");
    ok(h.length === 1 && h[0].kind === "nucleus",
       "a number that IS a nucleus here, and is called one, becomes a link",
       h.map(x => x.kind + ":" + x.raw).join(" "));
    ok(!!(h[0] && h[0].label), "...labelled with what the cell is", h[0] && h[0].label);
    ok(!!(h[0] && h[0].raw === fx.aNucleus),
       "...and the link is the id, not the word in front of it", h[0] && h[0].raw);
  }
  {
    const h = await scan("We looked at #" + fx.aNucleus + " and nucleus " + fx.anotherNucleus + ".");
    ok(h.length === 2, "a hash does as well as the word, and two in a row both land",
       h.map(x => x.kind + ":" + x.raw).join(" "));
  }
  {
    /* THE ONE THE LOOKUP ALONE GOT WRONG. A bare number that happens to be in the table is not a
       reference to a cell -- 2026 is a real nucleus id in this dataset, and in "Between 2024 and
       2026" it is a year. Nothing about the digits can tell those apart, so the author's word does. */
    const real = await p.evaluate(() => nidToIndex("2026") >= 0);
    ok(real, "2026 IS a nucleus id in this dataset (the premise of the next check)", real);
    const h = await scan("Between 2024 and 2026 we traced 42 cells.");
    ok(h.length === 0, "...and a bare number is still not a link, however real it is",
       h.map(x => x.kind + ":" + x.raw).join(" ") || "nothing linked");
  }
  {
    /* 999999 chosen to be outside any plausible nucleus id, and asserted absent rather than
       assumed: the point of this check is that the answer comes from the table. */
    const absent = await p.evaluate(() => nidToIndex("999999") < 0);
    ok(absent, "999999 is not a nucleus in this volume (the premise of the next check)");
    const h = await scan("I counted 999999 vesicles, give or take.");
    ok(h.length === 0, "a number that is NOT a nucleus stays as text",
       h.map(x => x.kind + ":" + x.raw).join(" ") || "nothing linked");
  }
  {
    const h = await scan("At " + say(fx.in65) + " there is a lovely astrocyte.");
    ok(h.filter(x => x.kind === "nucleus").length === 0,
       "a coordinate's own components are not then re-read as nucleus ids",
       h.map(x => x.kind).join(" "));
  }
  {
    /* And the leftovers of a triple that was refused: those numbers are free again by design, so
       that a real id inside a failed triple can still be read -- but with no cue, none is. */
    const h = await scan("The numbers " + say(fx.nowhere) + " are from a different experiment.");
    ok(h.length === 0, "the numbers of a refused triple are not then read as cells",
       h.map(x => x.kind + ":" + x.raw).join(" ") || "nothing linked");
  }

  console.log("\na pasted viewer link opens that view");
  {
    const h = await scan("Here it is: https://spelunker.cave-explorer.org/#!%7B%22position%22%3A%5B1%2C2%2C3%5D%7D ok?");
    ok(h.length === 1 && h[0].kind === "viewer", "a Neuroglancer URL is one hit",
       h.map(x => x.kind).join(" "));
  }

  /* ── THE ONE THAT MATTERS MOST ────────────────────────────────────────────────────
     This is user-written text going into innerHTML on a page that holds a Google credential. */
  console.log("\nthe text is escaped, and escaped the right way round");
  {
    const out = await p.evaluate(() => UJ.jumplink.html(
      'Look <script>alert(1)</script> & "quotes" and <img src=x onerror=alert(2)>'));
    ok(out.indexOf("<script") < 0 && out.indexOf("<img") < 0,
       "no tag the author typed survives as a tag", out.slice(0, 60));
    ok(out.indexOf("&lt;script&gt;") >= 0, "...it is escaped, not stripped", out.slice(0, 40));
    ok(out.indexOf("onerror=") < 0 || out.indexOf("&lt;img") >= 0,
       "...including the attribute trick");
  }
  {
    /* THE ENTITY TRAP. "it's" escapes to "it&#39;s", which contains the digits 39. A linkifier
       that scanned the ESCAPED string could read that 39 as a number, link half an entity, and
       render "it&#3" followed by a link. Scanning raw and emitting escaped cannot do this. */
    const out = await p.evaluate(() => UJ.jumplink.html("it's one of 39 we have"));
    ok(out.indexOf("&#39;") >= 0 || out.indexOf("&#x27;") >= 0 || out.indexOf("'") >= 0,
       "an apostrophe survives as an apostrophe", out);
    ok(!/<a[^>]*>39</.test(out) && !/>3<\/a>/.test(out),
       "...and the digits inside its entity are not linked", out);
  }
  {
    const out = await p.evaluate(() => UJ.jumplink.html("cell 864691135570733037 here"));
    ok(/<a |<button /.test(out), "a real reference does become a link", out.slice(0, 80));
    ok(out.indexOf("864691135570733037") >= 0, "...showing the id it is about");
  }

  /* ── BOTH VOLUMES, ALWAYS ─────────────────────────────────────────────────────────
     Søren: "Make sure that it recognises the minnie35 and minnie65 differences but opens the
     viewer with both segmentation layers and both em layers." */
  console.log("\nand the link opens both volumes, wherever the point is");
  for (const [where, pos] of [["minnie65", fx.in65], ["minnie35", fx.in35]]){
    const st = await p.evaluate(v => {
      const hits = UJ.jumplink.scan("at " + v.join(", "));
      return UJ.jumplink.state(hits);
    }, pos);
    const names = (st && st.layers || []).map(l => (l.name || "") + "|" + (l.source || ""));
    const em = names.filter(n => /minnie65\/em|minnie35\/em/.test(n));
    const seg = names.filter(n => /minnie65\/seg|minnie35\/seg/.test(n));
    ok(em.length === 2, where + ": both EM layers are there", em.join("  ") || "none");
    ok(seg.length === 2, where + ": both segmentations are there", seg.join("  ") || "none");
    ok(em.some(n => /minnie65/.test(n)) && em.some(n => /minnie35/.test(n)),
       where + ": ...one of each, not the same one twice");
    ok(!!(st && st.position && Math.abs(st.position[2] - pos[2]) <= 1),
       where + ": and it opens at the coordinate", st && st.position && st.position.join(", "));
  }
  {
    /* Nuclei exist for minnie65 only -- there is no nucleus detection over minnie35 -- so a
       nuclei layer out there would be an empty layer pretending to be a dataset. */
    const n35 = await p.evaluate(v => {
      const st = UJ.jumplink.state(UJ.jumplink.scan("at " + v.join(", ")));
      return (st.layers || []).filter(l => /nuclei/i.test((l.name || "") + (l.source || ""))).length;
    }, fx.in35);
    const n65 = await p.evaluate(v => {
      const st = UJ.jumplink.state(UJ.jumplink.scan("at " + v.join(", ")));
      return (st.layers || []).filter(l => /nuclei/i.test((l.name || "") + (l.source || ""))).length;
    }, fx.in65);
    ok(n65 === 1, "the nuclei layer comes with a minnie65 point", n65);
    ok(n35 === 0, "...and not with a minnie35 one, where there is no nucleus detection", n35);
  }

  /* ── THE NUCLEUS SHOWS THROUGH THE SOMA ─────────────────────────────────────────────────
     Søren, on a link opened from a Discussion post: "The nucleus should be visible through the soma
     in the neuroglancer view also. Use same settings as for the cell identity cell name neuroglancer
     link." A solid soma hides what is inside it. */
  console.log("\na cell with a nucleus in it is see-through");
  {
    const r = await p.evaluate(v => {
      const st = UJ.jumplink.state(UJ.jumplink.scan("at " + v.join(", ")));
      const seg = (st.layers || []).filter(l => l.type === "segmentation" && /segmentation/.test(l.name));
      const nuc = (st.layers || []).filter(l => /nuclei/.test(l.name || ""))[0];
      const host = window.jumpLinkHost();
      return { segAlpha: seg.map(l => l.objectAlpha),
               nucAlpha: nuc ? nuc.objectAlpha : null,
               hostAlpha: host.alpha || null };
    }, fx.in65);
    ok(r.segAlpha.every(a => a === 0.35),
       "the cell segmentation is turned down so the nucleus reads through it",
       JSON.stringify(r.segAlpha));
    ok(r.nucAlpha === 0.4, "...and the nuclei layer has its own", r.nucAlpha);
    ok(!!(r.hostAlpha && r.hostAlpha.cell === 0.35 && r.hostAlpha.nuc === 0.4),
       "...BOTH READ FROM THE PAGE, which is where the cell-identity link gets them, rather than "
       + "written down a second time here", JSON.stringify(r.hostAlpha));
  }
  {
    /* And a point with no nuclei layer keeps its cell solid: see-through is for seeing something
       inside, and there is nothing inside. */
    const r = await p.evaluate(v => {
      const st = UJ.jumplink.state(UJ.jumplink.scan("at " + v.join(", ")));
      const seg = (st.layers || []).filter(l => l.type === "segmentation" && /segmentation/.test(l.name));
      return { nuclei: (st.layers || []).filter(l => /nuclei/.test(l.name || "")).length,
               alphas: seg.map(l => l.objectAlpha === undefined ? "solid" : l.objectAlpha) };
    }, fx.in35);
    ok(r.nuclei === 0, "a minnie35 point has no nuclei layer (the premise)", r.nuclei);
    ok(r.alphas.every(a => a === "solid"),
       "...so its cell stays solid, which is the right picture for a lone cell",
       JSON.stringify(r.alphas));
  }

  console.log("\na post naming only cells still opens");
  {
    /* No coordinate at all, so nothing to centre on -- and the button must still work, with both
       segments selected, rather than doing nothing. */
    const r = await p.evaluate(() => {
      const st = UJ.jumplink.state(UJ.jumplink.scan(
        "Compare 864691135570733037 with 864691135234029401."));
      if (!st) return { none: true };
      const seg = (st.layers || []).filter(l => l.type === "segmentation" && l.segments);
      return { none: false, hasPos: "position" in st, segLayers: seg.length,
               segs: (seg[0] || {}).segments || [] };
    });
    ok(!r.none, "a state is built even with no coordinate in the post");
    ok(!r.hasPos, "...with no position, so the viewer opens on its own default", r.hasPos);
    ok(r.segLayers === 2 && r.segs.length === 2,
       "...and both ids selected in both segmentations, since prose never says which",
       r.segLayers + " layers, " + r.segs.length + " segments");
  }

  console.log("\nseveral places in one post open together");
  {
    const r = await p.evaluate(v => {
      const txt = "compare " + v.a.join(", ") + " with " + v.b.join(", ") + " and " + v.c;
      const hits = UJ.jumplink.scan(txt);
      const st = UJ.jumplink.state(hits);
      const ann = (st.layers || []).filter(l => l.type === "annotation");
      return { hits: hits.length,
               annLayers: ann.length,
               points: ann.reduce((n, l) => n + ((l.annotations || []).length), 0) };
    }, { a: fx.in65, b: [fx.in65[0] + 500, fx.in65[1] + 500, fx.in65[2] + 5],
         c: "cell " + fx.aNucleus });
    ok(r.hits === 3, "three references in one sentence are three hits", r.hits);
    ok(r.annLayers === 1, "...and ONE annotation layer, not one viewer tab each", r.annLayers);
    ok(r.points === 3, "...carrying every place the post mentions", r.points);
  }

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await p.close();
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
