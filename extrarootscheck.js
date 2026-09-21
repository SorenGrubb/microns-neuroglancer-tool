/* A tracing opened in Neuroglancer shows the WHOLE cell: its root ID and the community's.   2026-09-21

   Søren, with two screenshots of "Lysosome 6": "when I show the segmented organelle in Neuroglancer,
   it only shows with the default root ID, not with the community reported root IDs. This should be
   changed." A cell the segmentation split is one root ID plus the fragments people have proposed for
   its nucleus (?rootIds=<nucleus>) -- the same list the 3D model, the PowerPoint and the volume
   already combine. The viewer link from the tracing card left them out.

   Checked on the page, with the backend answered here:
     - the link's cell layer selects the root AND every proposed root ID of the nucleus;
     - a tracing filed with a nucleus and no root still shows the cell, from the proposed IDs;
     - the backend not answering does not stop the viewer opening, with the root it has;
     - one tab is opened, before the wait (a tab opened after an await is a blocked popup);
     - the pad's "show the segmentation" paints the proposed fragments too.

   Run: node extrarootscheck.js [page.html]      (default ujump.html; βJump and ηJump have their own lists) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  let HANG = false, SEGTYPE = "img65";
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**accounts.google.com/**", "**storage.googleapis.com/**", "**cdnjs.cloudflare.com/**",
                   "**gstatic.com/**", "**amazonaws.com/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("rootIds")){
      if (HANG) return;               /* never answered: the viewer must not wait for ever */
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ rootIds: [
          { rootId: "864691135000000111", segType: SEGTYPE },
          { rootId: "864691135000000222" },
          { rootId: "864691135000000333", segType: "other" } ] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
                           body: JSON.stringify({ ok: true, tracings: [], reports: [], rootIds: [] }) });
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(4000);

  /* Only where there is a cell segmentation to select them in, and a tracing card to open from:
     δJump's cells are CAVE-gated (nucleus volume only), πJump has no tracing card. */
  /* A cell segmentation in the VIEWER counts, not only one the card can read: δJump's card has none
     (V1DD is behind CAVE) but its links carry v1dd_public, and that is where Søren looked. */
  const where = await p.evaluate(() => ({ card: typeof tracingViewerOpen === "function",
    padSeg: typeof tracingSources === "function" && !!tracingSources().seg,
    seg: (typeof tracingSources === "function" && !!tracingSources().seg)
      || (typeof buildState === "function" && (() => { try {
            return (buildState([1000, 1000, 100]).layers || []).some(l => l && l.type === "segmentation"
              && !/nucle/i.test(String(l.name || "") + " " + String(l.source || ""))); } catch (e){ return false; } })()),
    lists: !!((UJ.cfg && UJ.cfg.tracing && UJ.cfg.tracing.extraRootsFor) || typeof fetchExtraRootIdsFor === "function") }));
  /* χJump keeps no proposals: its cell is its assembly, which cellIdsFor already selects. */
  if (where.card && where.seg && !where.lists){
    console.log(PAGE + ": no proposed root IDs on this tool -- nothing to add");
    await b.close(); console.log("\nall good"); process.exit(0);
  }
  /* The segmentation type this page files proposals under: img65 on µJump, secgan16 on βJump, c3 on ηJump. */
  SEGTYPE = await p.evaluate(() => (UJ.cfg && UJ.cfg.mesh && UJ.cfg.mesh.extraRootSegType) || "img65");
  if (!where.card || !where.seg){
    console.log(PAGE + ": " + (!where.card ? "no tracing card" : "no cell segmentation") + " on this tool -- nothing to show");
    await b.close(); console.log("\nall good"); process.exit(0);
  }
  const open = (ids) => p.evaluate(async (ids) => {
    const opened = [];
    window.open = function(u){ const w = { location: { href: u || "" }, opener: 1 }; opened.push(w); return w; };
    tracingViewerOpen([{ name: "Lysosome 6", color: "#ff0000",
                         rings: [{ z: 19736, points: [[183101, 119844], [183141, 119844], [183141, 119884]] }] }],
                      null, ids);
    const t0 = Date.now();
    while (Date.now() - t0 < 9000 && !(opened[0] && opened[0].location.href)) await new Promise(r => setTimeout(r, 100));
    const href = opened[0] ? opened[0].location.href : "";
    const st = href ? JSON.parse(decodeURIComponent(href.slice(href.indexOf("#!") + 2))) : { layers: [] };
    const seg = st.layers.filter(l => l.type === "segmentation" && !/nucle/i.test(String(l.name) + String(l.source)))[0];
    return { n: opened.length, ms: Date.now() - t0, segs: seg ? (seg.segments || []) : null };
  }, ids);

  console.log(PAGE + "\n\nthe viewer link");
  const a = await open({ root: "864691135000000999", nuc: "521491" });
  ok(a.segs && a.segs.indexOf("864691135000000999") >= 0, "the tracing's own root ID is selected", JSON.stringify(a.segs));
  ok(a.segs && a.segs.indexOf("864691135000000111") >= 0 && a.segs.indexOf("864691135000000222") >= 0,
     "...and the community's proposed root IDs for the nucleus", JSON.stringify(a.segs));
  ok(a.segs && a.segs.indexOf("864691135000000333") < 0,
     "...but not one proposed for another segmentation", "the page's own rule, as for the 3D model");
  ok(a.n === 1, "one tab, opened once", a.n);

  const c = await open({ root: "", nuc: "521491" });
  ok(c.segs && c.segs.length === 2, "a tracing with a nucleus and no root still shows the cell", JSON.stringify(c.segs));

  HANG = true;
  await p.evaluate(() => { try { TRACING_EXTRA_ROOTS = {}; } catch (e){} });
  const h = await open({ root: "864691135000000999", nuc: "777" });
  ok(h.segs && h.segs.length === 1 && h.ms < 8000, "an unanswered backend does not stop it opening, with the root it has",
     h.ms + " ms, " + JSON.stringify(h.segs));
  HANG = false;

  console.log("\nthe pad's segmentation");
  if (!where.padSeg) console.log("  (the card reads no segmentation here -- the pad paints none)");
  const pad = !where.padSeg ? "skip" : await p.evaluate(async () => {
    let got = null;
    PAD_VIEW = PAD_VIEW || { x0: 0, y0: 0, w: 10, h: 10, z: 1, mip: 0 };
    const saved = UJ.segpaint.paint;
    UJ.segpaint.paint = async function(cv, view, o){ got = o; return { root: 1, nuc: 0 }; };
    try { UJ.segpaint.configured = UJ.segpaint.configured || function(){ return true; }; } catch (e){}
    document.getElementById("tracingRootId").value = "864691135000000999";
    document.getElementById("tracingNucId").value = "521491";
    const box = document.getElementById("tracePadSeg"); if (box) box.checked = true;
    try { await padSegOverlay(); } catch (e){}
    UJ.segpaint.paint = saved;
    return got ? { root: got.root, also: got.rootAlso || [] } : null;
  });
  ok(pad === "skip" || pad && pad.also.indexOf("864691135000000111") >= 0 && pad.also.indexOf("864691135000000222") >= 0,
     "the pad paints the proposed fragments with the root", JSON.stringify(pad));
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
