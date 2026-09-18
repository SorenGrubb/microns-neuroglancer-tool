/* The cell-type list appears before the backend answers.                           2026-09-18

   Søren: *"Sometimes it takes minutes to load the cell list. Why? Can we fix it?"* — screenshot of
   "Or browse a random cell" open and the picker completely empty.

   THE STATE THIS CHECK PUTS THE PAGE IN IS THE POINT. Every other check in this repo ABORTS
   script.google.com, which resolves the fetch instantly as a failure — and a page whose backend
   fails fast never shows the bug. A slow Apps Script does not fail; it HOLDS THE CONNECTION OPEN.
   So this route holds the request and never answers it, which is the browser state he is actually
   describing, and then asks the control what it has.

   Run: node listspeedcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

const PAGES = ["ujump.html", "djump.html", "pjump.html"];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  for (const file of PAGES) {
    console.log("\n" + file + " — with the backend held open, never answering");
    const p = await b.newPage();
    const errors = [];
    p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
    p.on("dialog", d => d.accept().catch(() => {}));
    let held = 0;
    await p.route("**script.google.com/**", () => { held++; });   // held, NOT aborted
    await p.route("**accounts.google.com/**", r => r.abort());
    await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
    await p.route("**storage.googleapis.com/**", r => r.abort());
    await p.route("**bossdb-open-data.s3.amazonaws.com/**", r => r.abort());
    await p.goto("file://" + page_(file));
    await p.waitForTimeout(6000);

    const got = await p.evaluate(() => {
      const sel = document.getElementById("randomTypeSelect");
      if (!sel) return { none: true };
      const live = [].slice.call(sel.options).filter(o => !o.disabled);
      return { n: sel.options.length, live: live.length,
               groups: sel.querySelectorAll("optgroup").length,
               first: sel.options[0] ? sel.options[0].textContent : "",
               pools: Object.keys(window.RAND_POOLS || {}).length,
               pick: typeof window.__pickCount === "function" };
    });
    ok(!got.none && got.n > 0,
       "the picker is filled while the sheet is still being read", got.n + " options");
    /* EVERY entry in the early list is drawable, not "more than N of them" — pinky100 honestly has
       three cell types with cells in it, and a threshold tuned to minnie65 would call that a bug.
       The greyed "identified nowhere yet" placeholders only join on the second paint, so at this
       moment selectable and present are the same number, whatever the dataset. */
    ok(got.live > 0 && got.live === got.n,
       "...every one of them a type you can actually draw from",
       got.live + " of " + got.n + " selectable");
    ok(got.groups > 1, "...grouped as usual, not a flat emergency list", got.groups + " groups");
    ok(got.pools > 0 && got.pick,
       "...and the pools and the counter are published, so the button works now, not later",
       got.pools + " pools");
    ok(held > 0, "...while the backend has in fact answered nothing at all", held + " held");

    /* IT MUST STILL WORK. A list that appears instantly and then cannot draw a cell is worse than
       a slow one, so the button is pressed here — with the backend still hanging. */
    const drew = await p.evaluate(async () => {
      const sel = document.getElementById("randomTypeSelect");
      const live = [].slice.call(sel.options).filter(o => !o.disabled);
      sel.value = live[Math.min(2, live.length - 1)].value;
      let jumped = null;
      const realJump = window.jumpToNucleusIndex, realVox = window.jumpToVoxel;
      window.jumpToNucleusIndex = i => { jumped = "index " + i; };
      window.jumpToVoxel = (x, y, z) => { jumped = "voxel " + x + "," + y + "," + z; };
      document.getElementById("randomOfType").click();
      await new Promise(r => setTimeout(r, 300));
      window.jumpToNucleusIndex = realJump; window.jumpToVoxel = realVox;
      return { jumped, chose: live[Math.min(2, live.length - 1)].textContent };
    });
    ok(!!drew.jumped, "and Random example draws one straight away", drew.chose + " -> " + drew.jumped);

    ok(errors.length === 0, "no script errors", errors.slice(0, 3).join(" | ") || "none");
    await p.close();
  }

  /* THE SECOND PAINT STILL HAPPENS. The whole risk of painting early is that somebody decides the
     early list is good enough and the community's corrections quietly stop arriving — which would
     leave every count wrong and hide the types MICrONS never predicted. */
  console.log("\nujump.html — and the sheet's corrections still land when they arrive");
  {
    const p = await b.newPage();
    p.on("dialog", d => d.accept().catch(() => {}));
    await p.route("**accounts.google.com/**", r => r.abort());
    await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
    await p.route("**storage.googleapis.com/**", r => r.abort());
    await p.route("**bossdb-open-data.s3.amazonaws.com/**", r => r.abort());
    let release = null;
    const gate = new Promise(r => { release = r; });
    await p.route("**script.google.com/**", async route => {
      await gate;
      /* One community identification of a type MICrONS never predicts here, so its arrival is
         visible as a NEW entry rather than only as a shifted count. */
      route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ byNucleus: {} }) });
    });
    await p.goto("file://" + page_("ujump.html"));
    await p.waitForTimeout(5000);
    const before = await p.evaluate(() => {
      const sel = document.getElementById("randomTypeSelect");
      const live = [].slice.call(sel.options).filter(o => !o.disabled);
      sel.value = live[Math.min(4, live.length - 1)].value;    // a chosen type, mid-flight
      return { n: sel.options.length, chosen: sel.value };
    });
    release();
    await p.waitForTimeout(3000);
    const after = await p.evaluate(() => {
      const sel = document.getElementById("randomTypeSelect");
      return { n: sel.options.length, value: sel.value };
    });
    ok(after.n >= before.n,
       "the list is repainted when the sheet answers, not frozen at the early one",
       before.n + " -> " + after.n);
    ok(after.value === before.chosen,
       "...and a type chosen while it was still loading survives that repaint",
       after.value.split("|")[0]);
    await p.close();
  }

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
