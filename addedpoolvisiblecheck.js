/* A pool you cannot see is a pool you do not have.                                    2026-10-07

   Søren: *"Great, now it finds the endothelial cells. Now, give me the option to filter for them
   also again, I don't understand why you removed it."*

   Nothing was removed. The tick was there the whole time — "Not in H01 — named here → Endothelial
   cell 1", built by rebuildTypePools, grouped by typeGroups, drawn by renderTypeCheckboxes. It was
   the LAST group in a box 230 px tall holding 470 px of list, with no scrollbar visible until the
   pointer is inside it. Measured on this page: scrollHeight 470, clientHeight 228. Half the cell
   types in ηJump are below the fold of that box, and the half below is the half he added himself.

   So the answer is not to restore anything. It is to put the group he made at the top of the list,
   where the one cell he named is the first thing in the box — H01's own vocabulary has not changed
   in a year and does not need the best seat — and to give the box enough height that the fold is
   not in the middle of a group.

   WHAT IS ASSERTED:
     - a named added cell has its own tick, with its own name on it
     - ...and it is in the visible part of the box without scrolling
     - ...and first in the random-example dropdown too, for the same reason
     - H01's own groups are all still there, in their own order
     - a tick already set survives the redraw

   Run: node addedpoolvisiblecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The cell on his card: traced by hand because the vasculature segmentation is not usable. */
const NEWCELLS = [{ coord: "401085,230736,380", rootId: "6198781614",
                    identified: "Endothelial cell", by: "Søren Grubb",
                    at: "2026-10-01T00:00:00Z" }];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url()), H = { "Access-Control-Allow-Origin": "*" };
    if (u.searchParams.get("newCells"))
      return route.fulfill({ status: 200, contentType: "application/json", headers: H,
                             body: JSON.stringify({ newCells: NEWCELLS }) });
    return route.fulfill({ status: 200, contentType: "application/json", headers: H,
      body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [], rows: [] }) });
  });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**googleapis.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_("hjump.html"));
  await p.waitForTimeout(6000);

  const r = await p.evaluate(() => {
    const tab = document.querySelector('[data-tab="filter"]');
    if (tab) tab.click();
    const box = document.getElementById("filterTypes");
    if (!box) return { noBox: true };
    const labs = [].slice.call(box.querySelectorAll("label"));
    const mine = labs.filter(l => /Endothelial cell/.test(l.textContent))[0];
    const bTop = box.getBoundingClientRect().top;
    const within = mine ? (mine.getBoundingClientRect().top - bTop) : -1;
    const heads = [].slice.call(box.querySelectorAll("div > div.nsub"))
      .map(d => (d.textContent || "").trim().toUpperCase());
    const sel = document.getElementById("randomTypeSelect");
    return {
      pools: ADDED_POOLS.slice(),
      found: !!mine,
      tickValue: mine ? (mine.querySelector("input") || {}).value : "",
      label: mine ? (mine.textContent || "").replace(/\s+/g, " ").trim() : "",
      /* The distance from the top of the SCROLL BOX, which is what "without scrolling" means. */
      offsetInBox: Math.round(within),
      clientH: box.clientHeight, scrollH: box.scrollHeight,
      groups: heads,
      firstOpt: sel ? (sel.querySelector("optgroup") || {}).label || "" : "(no dropdown)",
      h01Groups: ["NEURONS — EXCITATORY", "NEURONS — INHIBITORY", "GLIA", "VASCULAR",
                  "NO CONFIDENT CALL"].every(g => heads.indexOf(g) >= 0)
    };
  });

  if (r.noBox){ console.log("  FAIL no Cell type box on this page"); await b.close(); process.exit(1); }

  console.log("the cell he named himself, in the Cell type box");
  ok(r.found, "it has its own tick", r.pools.join(", ") || "(no added pools at all)");
  ok(r.tickValue === "added:Endothelial cell",
     "...keyed on the pool, not on H01's not-in-h01 label", r.tickValue || "(none)");
  ok(/Endothelial cell/.test(r.label) && !/added:/.test(r.label),
     "...and reads as the name he gave it", r.label || "(none)");
  ok(r.found && r.offsetInBox >= 0 && r.offsetInBox < r.clientH,
     "...and it is inside the visible part of the box, which is the whole complaint: the box is "
     + r.clientH + " px tall around " + r.scrollH + " px of list, and this group used to be last",
     r.found ? r.offsetInBox + " px down a " + r.clientH + " px box" : "(not found)");

  console.log("\nand H01's own vocabulary is untouched");
  ok(r.h01Groups, "all five of H01's groups are still listed", r.groups.join(" | "));
  ok(r.groups[0] === "NOT IN H01 — NAMED HERE",
     "...under the one group that is his own, which is the one that moved",
     r.groups[0] || "(no groups)");
  ok(/NOT IN H01/i.test(r.firstOpt),
     "...and the random-example dropdown agrees, so the two lists cannot drift", r.firstOpt);

  console.log("\nand a redraw does not take away a choice already made");
  const kept = await p.evaluate(() => {
    const box = document.getElementById("filterTypes");
    const t = box.querySelector('input[value="added:Endothelial cell"]');
    if (!t) return { none: true };
    t.checked = true;
    rebuildTypePools(); renderTypeCheckboxes();
    const again = box.querySelector('input[value="added:Endothelial cell"]');
    return { still: !!(again && again.checked) };
  });
  ok(!kept.none && kept.still, "the tick survives the rebuild the identity fetch triggers",
     kept.none ? "no tick" : String(kept.still));

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.slice(0, 2).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
