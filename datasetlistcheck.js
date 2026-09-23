/* "Show the tracings in the dataset" does not wait for what it already has.           2026-09-23

   Søren: "The loading of the tracings in the dataset is really slow."

   MEASURED against his live backend, from his own browser:

       ?tracings=1   27.7 s on a cold container, 3.6 s warm, 13 kB, ONE request, 18 tracings
       ?whoami=1     11.3 s cold, 2.0 s warm          <- so most of the cold cost is Apps Script
                                                         starting, not this query

   So the query is not the problem and there is no fan-out to remove: it is one cheap request. The
   problem is WHEN it is waited for. tracingIndexSoon() already fetches that exact URL when the pad
   opens, keeps the answer in TRACING_SHARED and caches it for a minute -- and tracingBrowse() then
   threw the list away ("Reading the dataset's tracings…") and fetched the identical URL again,
   ignoring both. Every press bought a blank panel and 3 to 27 seconds for data that was in the page
   already. It did not write TRACING_INDEX_AT either, so the next pad open fetched it a third time.

   WHAT IS ASSERTED:
     - with an index in hand, the list is on screen BEFORE the network answers
     - the refresh still happens, and newer tracings replace what was shown
     - two overlapping asks make ONE request, not two
     - a browse refreshes the index cache, so the pad opening next makes no request
     - a failed refresh does not blank a list that is already up
     - with nothing in hand it says it is reading, and says the backend can take half a minute
     - the first press with an empty page still shows the tracings

   Run: node datasetlistcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(3000);

  const got = await p.evaluate(async () => {
    const host = document.getElementById("tracingShared");
    const rows = () => host.querySelectorAll("button, .row, li").length;
    const text = () => String(host.textContent || "");

    /* A backend that answers only when told to, so "before the network" is a real moment. */
    const CALLS = [];
    const QUEUE = [];                       // pending index requests, oldest first
    const entry = (sid, name, nuc) => ({ structureId: sid, name: name, kind: "cell",
      cellType: "Arachnoid barrier cell", nucleusId: nuc, rootId: "", cellCoord: "",
      tracedBy: "Søren Grubb", startedBy: "Søren Grubb", contributors: ["Søren Grubb"],
      versions: 1, sections: 105, contours: 114, vertices: 9322, volumeUm3: 985,
      fileId: "f_" + sid, fileUrl: "https://drive.google.com/x", timestamp: "2026-09-23T17:42:16.649Z" });
    let SERVE = [entry("whole-cell_a", "Whole cell", "286849")];
    let FAIL_NEXT = false;
    /* ONLY the index request is held. Everything else this page fetches on its own (drafts, the
       panel) is failed at once: leaving those hanging made the queue below release the wrong one. */
    window.fetch = function(u){
      const url = String(u);
      if (!/tracings=1/.test(url) || /structureIds?=/.test(url))
        return Promise.reject(new Error("not this check's business"));
      CALLS.push(url);
      return new Promise(function(res, rej){
        QUEUE.push(function(){
          if (FAIL_NEXT) return rej(new Error("the backend did not answer"));
          res({ ok: true, json: async () => ({ tracings: SERVE.slice() }) });
        });
      });
    };
    /* Release the oldest held request, and let the promise chain behind it run out. */
    const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };
    const release = async () => { const f = QUEUE.shift(); if (f) f(); await settle(); };
    /* Every one of them. The un-fixed code asks twice where it should ask once, so releasing only
       the oldest would leave the second await pending and hang the check on the bug it is here to
       find -- and a hung check reports nothing at all. */
    const releaseAll = async () => { while (QUEUE.length) await release(); await settle(); };
    /* ...and nothing is awaited without a way out, for the same reason. */
    const capped = (pr) => Promise.race([Promise.resolve(pr).catch(function(e){ return "rejected: " + e.message; }),
                                         new Promise(r => setTimeout(() => r("never settled"), 2000))]);

    const out = {};

    /* ── the pad opening fills the index ─────────────────────────────────────────── */
    TRACING_SHARED = []; TRACING_INDEX_AT = 0; CALLS.length = 0;
    tracingIndexSoon();
    await settle();
    out.indexAsked = CALLS.length;
    await release();
    out.indexHas = (TRACING_SHARED || []).length;

    /* ── now the button, with that index in hand ─────────────────────────────────── */
    SERVE = [entry("whole-cell_a", "Whole cell", "286849"),
             entry("whole-cell_b", "Whole cell", "286159")];   // somebody added one
    CALLS.length = 0;
    const browsing = tracingBrowse();
    await settle();
    /* THE MOMENT THAT MATTERS: the network has not answered yet. */
    out.beforeNetwork = { rows: rows(), says: text().slice(0, 120), asked: CALLS.length };
    await releaseAll(); await capped(browsing);
    out.afterNetwork = { rows: rows(), n: (TRACING_SHARED || []).length,
                         hasNew: /286159/.test(JSON.stringify(TRACING_SHARED || [])) };

    /* ── two overlapping asks ────────────────────────────────────────────────────── */
    CALLS.length = 0;
    const two = Promise.all([tracingBrowse(), tracingBrowse()]);
    await settle();
    out.overlapping = CALLS.length;
    await releaseAll(); out.overlappingEnd = await capped(two);

    /* ── and the pad opening after a browse ──────────────────────────────────────── */
    /* The clock is put back first, or this asserts nothing: an earlier tracingIndexSoon() would
       still be inside its own minute and would skip the request whatever a browse did. */
    TRACING_INDEX_AT = 0; CALLS.length = 0;
    const b2 = tracingBrowse();
    await releaseAll(); await capped(b2);
    CALLS.length = 0;
    tracingIndexSoon();
    await settle();
    out.padAfterBrowse = CALLS.length;
    await releaseAll();

    /* ── a refresh that fails, over a list already up ────────────────────────────── */
    const had = rows();
    FAIL_NEXT = true; CALLS.length = 0;
    const bad = tracingBrowse();
    await settle();
    await releaseAll(); await capped(bad);
    FAIL_NEXT = false;
    out.onFailure = { rowsBefore: had, rowsAfter: rows(), says: text().slice(0, 200) };

    /* ── and the very first press, with nothing in hand ──────────────────────────── */
    TRACING_SHARED = []; TRACING_INDEX_AT = 0; host.innerHTML = "";
    const cold = tracingBrowse();
    await settle();
    out.coldSays = text().slice(0, 240);
    await releaseAll(); await capped(cold);
    out.coldRows = rows();

    return out;
  });

  console.log("the pad opening reads the index");
  ok(got.indexAsked === 1, "one request", got.indexAsked);
  ok(got.indexHas === 1, "...and the page has the tracings", got.indexHas);

  console.log("\nthen the button, with that index already in hand");
  ok(got.beforeNetwork.rows > 0,
     "the list is ON SCREEN before the network answers",
     got.beforeNetwork.rows + " row(s); panel said: " + got.beforeNetwork.says);
  ok(!/Reading the dataset/i.test(got.beforeNetwork.says),
     "...rather than being replaced by “Reading the dataset’s tracings…”",
     got.beforeNetwork.says.slice(0, 80));
  ok(got.afterNetwork.hasNew,
     "and the refresh still happens: a tracing somebody else added turns up",
     got.afterNetwork.n + " tracings");

  console.log("\nand it does not ask twice for one answer");
  ok(got.overlapping === 1, "two overlapping asks make ONE request", got.overlapping);
  ok(got.padAfterBrowse === 0,
     "a browse refreshes the index, so the pad opening next asks for nothing",
     got.padAfterBrowse + " request(s)");

  console.log("\nwhen the refresh fails");
  ok(got.onFailure.rowsAfter >= got.onFailure.rowsBefore,
     "the list already up is not blanked",
     got.onFailure.rowsBefore + " -> " + got.onFailure.rowsAfter);
  ok(/could not|not answer/i.test(got.onFailure.says), "...and it says so",
     got.onFailure.says.slice(0, 120));

  console.log("\nthe first press, with nothing in hand");
  ok(/reading/i.test(got.coldSays), "says it is reading", got.coldSays.slice(0, 100));
  ok(/idle|half a minute|30 seconds|a few seconds/i.test(got.coldSays),
     "...and that the backend can take a while — measured at 27 s cold, 3.6 s warm",
     got.coldSays.slice(0, 200));
  ok(got.coldRows > 0, "and the tracings arrive", got.coldRows + " row(s)");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
