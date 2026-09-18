/* A cached "no" is not forever, and the propose form never disappears.            2026-09-17

   Søren, µJump nucleus 264317: *"I tried to add a root ID to this cell after it failed to compute
   volume, then after it had registered it, it said cached unavailable. We had this problem
   previously, but we fixed it. Now it is back. Also, now the propose root ID option is gone."*

   Measured against the live backend first (from his own browser, since this sandbox has no egress
   to script.google.com): `?rootIds=264317` returns one proposal, 864691135099837472, segType
   img65. So the proposal is registered and the endpoint is healthy — which is why this drives the
   four orderings that let both of his sentences be true anyway, on the REAL page:

     1. a cached "not found" survives a proposal            -> it must not
     2. the button computes from a global, not from the list -> it must ask
     3. the `?rootIds=` fetch fails                          -> the FORM must still be there
     4. the panel is there but does not say "propose"        -> it must

   Run: node rootidbackcheck.js  */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* Bounded, so a page that stops answering is REPORTED rather than timing the suite out. Same helper
   as volfreezecheck.js, and for the same reason: this file drives a panel whose one historic failure
   mode was a frozen tab (see the 2026-09-17 note on decorateMeshVolButtons). */
async function within(ms, promise){
  let timer;
  const out = await Promise.race([
    promise.then(v => ({ ok: true, v }), e => ({ ok: false, e })),
    new Promise(r => { timer = setTimeout(() => r({ ok: false, timeout: true }), ms); })
  ]);
  clearTimeout(timer);
  return out;
}

/* His cell, his numbers. Nothing here depends on them being these particular digits, but a check
   that reproduces a bug report should read like the bug report. */
const NUC = "264317", MAIN = "864691135499287571", PROPOSED = "864691135099837472";

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  /* The µJump page decodes its embedded nucleus arrays with atob(); served from file:// in this
     sandbox one of the data files it fetches is unreachable, so that call throws on every run of
     every check here, with or without this change (verified against the pre-change page). Ignored
     by name so a REAL script error still fails this check rather than hiding behind it. */
  const preExisting = /atob/;
  p.on("pageerror", e => { if (!preExisting.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.addInitScript(() => {
    window.__alerts = []; window.alert = m => window.__alerts.push(String(m));
    try { localStorage.removeItem("microns_mesh_notfound_roots_v1"); } catch (e) {}
  });
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);
  ok(errors.length === 0, "the page loads without a script error", errors.slice(0, 2).join(" | "));

  console.log("\none root ID can be forgotten, and only that one");
  {
    const c = await p.evaluate(({ MAIN, PROPOSED }) => {
      const K = "microns_mesh_notfound_roots_v1";
      localStorage.setItem(K, JSON.stringify([[MAIN, 1], [PROPOSED, 2], ["999999", 3]]));
      /* The module caches the map in a closure, so a test that only writes localStorage would be
         testing localStorage. Reading through the module's own accessor is what forces it to load. */
      const had = UJ.mesh.forgetRootNotFound(MAIN);
      const again = UJ.mesh.forgetRootNotFound(MAIN);
      const left = JSON.parse(localStorage.getItem(K) || "[]").map(e => e[0]);
      return { exported: typeof UJ.mesh.forgetRootNotFound === "function", had, again, left };
    }, { MAIN, PROPOSED });
    ok(c.exported, "UJ.mesh.forgetRootNotFound is part of the module's surface");
    ok(c.had === true, "...and says so when it actually removed one");
    ok(c.again === false, "...and says so when there was nothing to remove");
    ok(c.left.indexOf(MAIN) < 0, "the forgotten root ID is gone from the persisted cache");
    ok(c.left.indexOf(PROPOSED) >= 0 && c.left.indexOf("999999") >= 0,
       "...and no other cell lost its own cached verdict", c.left.join(", "));
  }

  console.log("\nthe propose form is there even when the list is not");
  {
    const r = await p.evaluate(async (NUC) => {
      window.fetch = async () => { throw new Error("backend down"); };
      const host = document.getElementById("rootIdPanel")
        || (function(){ const d = document.createElement("div"); d.id = "rootIdPanel";
                        document.body.appendChild(d); return d; })();
      loadRootIdPanel(NUC);
      await new Promise(r2 => setTimeout(r2, 250));
      return { html: host.innerHTML, text: host.textContent,
               hasInput: !!host.querySelector("#ridInput"),
               hasButton: !!host.querySelector("#ridPropose"),
               hasType: !!host.querySelector("#ridType") };
    }, NUC);
    ok(r.html.length > 0, "a failed ?rootIds= no longer leaves an empty element",
       r.html.length + " chars");
    ok(r.hasInput && r.hasButton && r.hasType,
       "...the ID box, the segmentation picker and Propose are all still there");
    ok(/could not be read/i.test(r.text),
       "...and it says the list is missing rather than implying there are none",
       r.text.replace(/\s+/g, " ").slice(0, 90));
  }

  console.log("\nand it says what it is for");
  {
    const r = await p.evaluate(async (NUC) => {
      window.fetch = async (u) => ({ ok: true, json: async () =>
        (/[?&]rootIds=/.test(String(u)) ? { rootIds: [] } : {}) });
      loadRootIdPanel(NUC);
      await new Promise(r2 => setTimeout(r2, 200));
      const t = document.getElementById("ridToggle");
      return t ? t.textContent : "";
    }, NUC);
    ok(/propose/i.test(r), "the toggle has the word somebody would look for", JSON.stringify(r));
  }

  console.log("\nproposing a root ID forgets this cell's cached “not found”");
  {
    const r = await p.evaluate(async ({ NUC, MAIN, PROPOSED }) => {
      const K = "microns_mesh_notfound_roots_v1";
      /* Both cached, which is the state his cell was actually in: the main root ID failed, and so
         did the ID he had proposed for it earlier. */
      localStorage.setItem(K, JSON.stringify([[MAIN, 1], [PROPOSED, 2], ["999999", 3]]));
      UJ.mesh.forgetRootNotFound("__reload__");        // force the module to re-read the store
      window.CUR_ROOT = MAIN;
      window.postReport = () => true;                  // the sheet write is not what is under test
      window.fetch = async (u) => ({ ok: true, json: async () =>
        (/[?&]rootIds=/.test(String(u)) ? { rootIds: [] } : {}) });
      loadRootIdPanel(NUC);
      await new Promise(r2 => setTimeout(r2, 200));
      document.getElementById("ridInput").value = PROPOSED;
      document.getElementById("ridPropose").click();
      await new Promise(r2 => setTimeout(r2, 100));
      return JSON.parse(localStorage.getItem(K) || "[]").map(e => e[0]);
    }, { NUC, MAIN, PROPOSED });
    ok(r.indexOf(PROPOSED) < 0, "the proposed ID is rechecked on the next click, not answered from cache");
    ok(r.indexOf(MAIN) < 0,
       "...and so is the main root ID it is being offered as an alternative to");
    ok(r.indexOf("999999") >= 0, "...while an unrelated cell keeps its own", r.join(", "));
  }

  console.log("\nthe button asks the backend which IDs to combine, at click time");
  {
    const r = await p.evaluate(async ({ NUC, MAIN, PROPOSED }) => {
      /* The global is left EMPTY on purpose. That is the whole bug: every ordering where
         loadRootIdPanel has not (or cannot) fill it used to compute the cell with one candidate. */
      window.CUR_EXTRA_ROOTS = [];
      const asked = [];
      window.fetch = async (u) => { asked.push(String(u));
        return { ok: true, json: async () => (/[?&]rootIds=/.test(String(u))
          ? { rootIds: [{ rootId: PROPOSED, segType: "img65", up: 0, down: 0, net: 0 }] } : {}) }; };
      const seen = [];
      const realCompute = UJ.mesh.computeVolume;
      UJ.mesh.computeVolume = async (root, prog, force, extras) => {
        seen.push({ root, extras });
        return { volumeUm3: 1, vertices: 3, fragmentCount: 1, rootIds: [root],
                 mainUnavailable: false, skipped: [], simplified: [] };
      };
      document.body.insertAdjacentHTML("beforeend",
        '<button class="meshvol" data-root="' + MAIN + '" data-nucid="' + NUC + '">Compute volume</button>');
      document.querySelector("body > button.meshvol").click();
      await new Promise(r2 => setTimeout(r2, 400));
      UJ.mesh.computeVolume = realCompute;
      const b = document.querySelector("body > button.meshvol"); if (b) b.remove();
      return { seen, askedRootIds: asked.filter(u => /[?&]rootIds=/.test(u)) };
    }, { NUC, MAIN, PROPOSED });
    ok(r.askedRootIds.length > 0, "clicking Compute volume looks the proposals up",
       r.askedRootIds[0] ? r.askedRootIds[0].slice(-30) : "(none)");
    ok(r.seen.length === 1 && Array.isArray(r.seen[0].extras),
       "...and hands them to computeVolume rather than letting it read a global",
       JSON.stringify(r.seen[0] && r.seen[0].extras));
    ok(r.seen[0] && r.seen[0].extras && r.seen[0].extras.indexOf(PROPOSED) >= 0,
       "...so the ID just proposed IS in the combine, with the global still empty");
  }

  console.log("\nan empty or failed lookup changes nothing");
  {
    const r = await p.evaluate(async ({ NUC, MAIN }) => {
      window.fetch = async () => { throw new Error("down"); };
      const seen = [];
      const real = UJ.mesh.computeVolume;
      UJ.mesh.computeVolume = async (root, prog, force, extras) => {
        seen.push(extras);
        return { volumeUm3: 1, vertices: 3, fragmentCount: 1, rootIds: [root],
                 mainUnavailable: false, skipped: [], simplified: [] };
      };
      document.body.insertAdjacentHTML("beforeend",
        '<button class="meshvol" data-root="' + MAIN + '" data-nucid="' + NUC + '">Compute volume</button>');
      document.querySelector("body > button.meshvol").click();
      await new Promise(r2 => setTimeout(r2, 400));
      UJ.mesh.computeVolume = real;
      const b = document.querySelector("body > button.meshvol"); if (b) b.remove();
      return { n: seen.length, first: seen[0] === undefined ? "undefined" : JSON.stringify(seen[0]) };
    }, { NUC, MAIN });
    ok(r.n === 1 && r.first === "undefined",
       "a backend that is down passes no override, so the old global path still runs", r.first);
  }

  console.log("\na cached failure says what to do, and opens the form");
  {
    const r = await p.evaluate(async ({ NUC, MAIN }) => {
      window.fetch = async (u) => ({ ok: true, json: async () =>
        (/[?&]rootIds=/.test(String(u)) ? { rootIds: [] } : {}) });
      loadRootIdPanel(NUC);
      await new Promise(r2 => setTimeout(r2, 200));
      window.__ridOpen = false;
      const bod = document.getElementById("ridBody");
      if (bod) bod.style.display = "none";
      const real = UJ.mesh.computeVolume;
      UJ.mesh.computeVolume = async () => {
        const e = new Error("root ID " + MAIN + " is cached as unavailable in the seg_m1300 mesh snapshot.");
        e.meshCached = true; throw e;
      };
      document.body.insertAdjacentHTML("beforeend",
        '<button class="meshvol" data-root="' + MAIN + '" data-nucid="' + NUC + '">Compute volume</button>');
      const btn = document.querySelector("body > button.meshvol");
      btn.click();
      await new Promise(r2 => setTimeout(r2, 400));
      const out = { label: btn.textContent,
                    open: (document.getElementById("ridBody") || {}).style
                            ? document.getElementById("ridBody").style.display : "?",
                    toggle: (document.getElementById("ridToggle") || {}).textContent || "" };
      UJ.mesh.computeVolume = real; btn.remove();
      return out;
    }, { NUC, MAIN });
    ok(/shift-click/i.test(r.label),
       "the button says how to force a real check instead of only that it is cached", r.label);
    ok(!/cached unavailable/i.test(r.label), "...and no longer reports its own bookkeeping");
    ok(r.open === "block", "...and the propose form is opened for them", r.open);
    ok(/^▼/.test(r.toggle), "...with the toggle agreeing that it is open",
       JSON.stringify(r.toggle.slice(0, 40)));
  }

  /* ── A PROPOSAL MOVES THE WORLD, SO THE BUTTON IS DECIDED AGAIN ──────────────────  2026-09-17
     Søren, root 864691134517067096 with 864691136708155314 freshly proposed for the same cell:
     *"I found that this time it did not offer to recalculate volume after I had submitted a new
     root ID."*

     "Recalculate" exists because a saved volume can stop being current:

         savedFragCount = known.combinedFrom || known.fragmentCount || 1
         curFragCount   = 1 + CUR_EXTRA_ROOTS.length
         stale          = curFragCount > savedFragCount

     Proposing a root ID is the event that makes that true. But decorateMeshVolButtons() is re-run
     by a MutationObserver that only fires for a mutation touching a .meshvol, and the propose
     panel's own re-render contains none — so every input to the decision changed and the decision
     was never taken again. The button stayed hidden, which means "nothing to recalculate".

     Driven on the REAL panel, because the button this is about is found by
     `#cellPanelCard .meshvol` and a button injected anywhere else is not the one. */
  console.log("\na landed proposal offers the recalculate again");
  {
    const before = await within(20000, p.evaluate(async () => {
      /* A REAL cell, because the button this is about is the one in the cell panel and is found by
         `#cellPanelCard .meshvol`; a button injected anywhere else is a different button. */
      window.fetch = async (u) => ({ ok: true, json: async () =>
        (/[?&]rootIds=/.test(String(u)) ? { rootIds: [] } : {}) });
      let i = 0;
      for (let k = 0; k < NID.length; k++) if (rootId(k)){ i = k; break; }
      document.getElementById("x").value = String(NX[i]);
      document.getElementById("y").value = String(NY[i]);
      document.getElementById("z").value = String(NZ[i]);
      document.getElementById("go").click();
      await new Promise(r => setTimeout(r, 1800));
      const btn = document.querySelector("#cellPanelCard .meshvol");
      if (!btn) return { err: "no .meshvol in the panel" };
      const root = btn.dataset.root || "";
      /* A volume already computed and saved, from ONE root ID — the state his cell was in. */
      window._computedVolumesMap = window._computedVolumesMap || {};
      window._computedVolumesMap[root] = { volumeUm3: 74, fragmentCount: 1, combinedFrom: 1,
                                           cellType: "", timestamp: "2026-09-17T00:00:00Z" };
      /* A bare assignment, NOT window.CUR_EXTRA_ROOTS: it is a top-level `let` in the page script,
         so it lives in the global LEXICAL environment and is not a property of window. Setting the
         window property makes a second, unrelated variable that extraImg65RootIds() never reads —
         which is how the first run of this section reported an empty list while the count said two. */
      CUR_EXTRA_ROOTS = [];
      btn.disabled = false; btn.dataset.volFresh = "";
      decorateMeshVolButtons();
      return { root: root, display: btn.style.display, label: btn.textContent,
               count: UJ.mesh.currentFragmentCount(root) };
    }));
    ok(before.ok && !before.v.err, "the panel has its own Compute volume button",
       before.ok ? (before.v.err || before.v.root) : "no answer");
    ok(before.ok && before.v.display === "none",
       "with the volume current, the button is hidden — nothing to recalculate",
       before.ok && JSON.stringify(before.v.display));
    ok(before.ok && before.v.count === 1,
       "...and one root ID is all this cell has so far", before.ok && before.v.count);

    const after = await within(15000, p.evaluate(async (root) => {
      /* The proposal lands exactly as it does live: the panel re-reads ?rootIds= and fills
         CUR_EXTRA_ROOTS. Nothing else is touched — no click, no DOM poke at the button. */
      window.fetch = async (u) => ({ ok: true, json: async () =>
        (/[?&]rootIds=/.test(String(u))
          ? { rootIds: [{ rootId: "864691136708155314", segType: "img65",
                          up: 0, down: 0, net: 0, by: "Søren Grubb" }] }
          : {}) });
      loadRootIdPanel(String(CUR_NUCID || "264317"));
      await new Promise(r => setTimeout(r, 300));
      const btn = document.querySelector("#cellPanelCard .meshvol");
      return { extras: (CUR_EXTRA_ROOTS || []).length,
               count: UJ.mesh.currentFragmentCount(root),
               display: btn.style.display, label: btn.textContent,
               title: (btn.title || "").slice(0, 90) };
    }, before.ok ? before.v.root : ""));
    ok(after.ok && after.v.extras === 1,
       "the proposal lands in CUR_EXTRA_ROOTS, the way it does live", after.ok && after.v.extras);
    ok(after.ok && after.v.count === 2,
       "...so the cell now has two root IDs to combine against a volume saved from one",
       after.ok && after.v.count);
    ok(after.ok && after.v.display !== "none",
       "THE BUTTON COMES BACK — this is the whole check",
       after.ok && JSON.stringify(after.v.display));
    ok(after.ok && /Recalculate/.test(after.v.label),
       "...and says what it is for now", after.ok && after.v.label);
    ok(after.ok && /proposed/.test(after.v.title),
       "...with the reason on it, so it is not a button that just appeared",
       after.ok && after.v.title);
  }

  ok(errors.length === 0, "and still no script errors at the end", errors.slice(0, 3).join(" | "));
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
