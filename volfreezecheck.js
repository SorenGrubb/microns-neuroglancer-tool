/* The page was not hanging. It was writing an attribute to itself.               2026-09-17

   Søren, twice: *"Now it is hanging at 97%"*, then *"Now it is hanging at 100%"* — the Compute
   volume button frozen on `measuring 2.5M triangles… 100%`.

   100% is the LAST thing computeVolume emits; after it there is a `return` and nothing else. A
   stall there cannot be slow work. And two different frozen percentages from one click sequence is
   not two bugs — it is one freeze, photographed at whichever frame was on screen when it hit.

   `decorateMeshVolButtons()` ran `btn.dataset.volFresh=""` unconditionally for a volume computed
   but not saved (i.e. every compute made while signed out). Writing an attribute the value it
   already holds still produces a mutation record; the MutationObserver on #cellPanelCard watches
   `data-vol-fresh` on exactly those buttons; so it called decorate, which wrote again.
   MutationObserver callbacks are microtasks, so the queue never drained — no repaint, no timers,
   no events. The whole tab.

   THE ASSERTION THAT MATTERS is the last one: after a completed compute, the page still answers.
   Everything above it is there to make a failure legible rather than just "it timed out".

   Run: node volfreezecheck.js  */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* Every wait in this file is bounded. A check for a freeze must never itself hang: it has to come
   back and SAY the page stopped answering, or the next person sees a timeout and learns nothing. */
async function within(ms, promise){
  let timer;
  const out = await Promise.race([
    promise.then(v => ({ ok: true, v }), e => ({ ok: false, e })),
    new Promise(r => { timer = setTimeout(() => r({ ok: false, timeout: true }), ms); })
  ]);
  clearTimeout(timer);
  return out;
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => d.dismiss().catch(() => {}));
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.addInitScript(() => {
    window.alert = () => {}; window.confirm = () => false; window.prompt = () => null;
  });
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("a real cell, with its real Compute volume button");
  {
    const found = await p.evaluate(async () => {
      window.fetch = async (u) => ({ ok: true, json: async () =>
        (/[?&]rootIds=/.test(String(u)) ? { rootIds: [] } : {}) });
      document.getElementById("x").value = String(NX[0]);
      document.getElementById("y").value = String(NY[0]);
      document.getElementById("z").value = String(NZ[0]);
      document.getElementById("go").click();
      await new Promise(r => setTimeout(r, 1500));
      const btn = document.querySelector("#cellPanelCard .meshvol");
      return { has: !!btn, label: btn ? btn.textContent : "",
               observed: !!document.getElementById("cellPanelCard") };
    });
    ok(found.observed, "the cell panel the observer watches is on the page");
    ok(found.has, "...with a .meshvol button in it", found.label);
  }

  /* SIGNED OUT is the case, and it is the ordinary one: computing a volume without signing in is
     deliberate (the number is for you), and it is what marks the result `unsaved`, which is the
     branch that held the unconditional write. */
  console.log("\na volume computed while signed out");
  {
    const clicked = await within(15000, p.evaluate(async () => {
      UJ.mesh.computeVolume = async (root, prog) => {
        prog && prog(0.97, "measuring 2.5M triangles…");
        await new Promise(r => setTimeout(r, 30));
        prog && prog(1, "measuring 2.5M triangles…");
        await new Promise(r => setTimeout(r, 30));
        return { volumeUm3: 12345.6, vertices: 1250000, fragmentCount: 2,
                 rootIds: [root, "864691135099837472"], mainUnavailable: false,
                 skipped: [], simplified: [] };
      };
      const btn = document.querySelector("#cellPanelCard .meshvol");
      window.__btn = btn;
      btn.click();
      await new Promise(r => setTimeout(r, 1200));
      return { gate: typeof saveGateNote === "function" ? !!saveGateNote() : null,
               map: !!window._computedVolumesMap };
    }));
    ok(clicked.ok, "the click itself comes back", clicked.timeout ? "the page stopped answering"
       : (clicked.e && clicked.e.message));
    ok(clicked.ok && clicked.v.gate === true,
       "...and this compute is an unsaved one, which is the branch that froze",
       clicked.ok && String(clicked.v.gate));
  }

  /* ── THE ONE THAT MATTERS ─────────────────────────────────────────────────────────────────────
     Not "did the label update" — a frozen tab never repaints, so the label is the last thing you
     would learn anything from. Whether the page is still ALIVE is the question, and the only way to
     ask it is to ask the page something and see whether an answer comes back. */
  console.log("\nand the page still answers afterwards");
  {
    const alive = await within(10000, p.evaluate(() => {
      const btn = window.__btn;
      return { pong: 1 + 1, label: btn ? btn.textContent : "(gone)",
               fresh: btn ? btn.dataset.volFresh : null,
               display: btn ? btn.style.display : null };
    }));
    ok(alive.ok, "THE TAB IS STILL ALIVE — this is the whole check",
       alive.timeout ? "no answer in 10 s: the microtask queue never drained" : "answered");
    ok(alive.ok && alive.v.pong === 2, "...and can still run script");
    ok(alive.ok && !/measuring/.test(alive.v.label),
       "...and the button moved off the progress text it used to freeze on",
       alive.ok && JSON.stringify(alive.v.label));
    ok(alive.ok && alive.v.label === "Save volume",
       "...to what an unsaved volume should offer", alive.ok && alive.v.label);
  }

  /* A second click must not reopen the cycle: the first one leaves data-vol-fresh at "", which is
     the value the unconditional write kept re-writing. */
  console.log("\nand again, from the state the first click left behind");
  {
    const again = await within(15000, p.evaluate(async () => {
      window.__btn.click();
      await new Promise(r => setTimeout(r, 1200));
      return { pong: 3, label: window.__btn.textContent };
    }));
    ok(again.ok, "a second compute comes back too",
       again.timeout ? "the page stopped answering on the second click" : "answered");
    ok(again.ok && again.v.pong === 3, "...and the page is still alive after it", again.ok && again.v.label);
  }

  console.log("\nthe observer cannot be fed its own writes");
  {
    const src = require("fs").readFileSync("ujump.html", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    ok(/mo\.takeRecords\(\);/.test(src),
       "the records a decorate pass produced are discarded by the observer that called it");
    ok(/if\(\(stale\|\|known\.unsaved\)&&btn\.dataset\.volFresh!==""\)/.test(src),
       "...and the write that started it is conditional on changing something");
  }

  ok(errors.length === 0, "no script errors", errors.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
