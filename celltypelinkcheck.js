/* One shape for the cell-name link, on all six pages.                                2026-09-26

   Søren, looking at an endothelial cell he had identified himself in ηJump:

       "in hJump I have segmented structures in an endothelial cell. First, why does it call the
        endothelial cell Object object?"

   BECAUSE THE SHARED CALLER AND THE PAGE DISAGREED ABOUT THE ARGUMENTS. core/panel.js promotes a
   winning community name into #ctHeadline and builds it with

       celltypeLink(cellPos, escHtml(win.name), {nuc: nid, root: ""})

   — µJump's shape, (pos, innerHtml, ids). ηJump's own function took (pos, segId, innerHtml),
   because an H01 viewer link carries the c3 segment and the other tools' links do not. So the name
   landed in `segId` and the ids object landed in `innerHtml`, and an object rendered into a string
   is "[object Object]". The link still worked; it just had no text.

   IT HAD A GUARD AND THE GUARD WAS THE PROBLEM. ηJump's function tested `innerHtml === undefined`
   and, when it was, shuffled the two-argument call into place — which is exactly what panel.js did
   until 2026-09-24, when the_cell_name_opens_the_cell_with_its_outline.py added the third argument
   so the ↗ could carry the cell's own outline. A third argument made the guard stop firing, and a
   guard that silently stops firing is worse than no guard: nothing threw, nothing logged, and the
   headline of every community-identified H01 cell read "[object Object]".

   AND TWO MORE PAGES WERE QUIETLY WRONG IN THE OTHER DIRECTION. λJump and βJump declare
   (pos, innerHtml) — two parameters — so JavaScript discards panel.js's ids object without a word.
   No "[object Object]" there, and no `class="ctlink"` either, which is the attribute that makes the
   ↗ open the cell WITH its hand-traced outline. That fix has been live since 2026-09-24 and had
   never once run on those two pages.

   SO THE ASSERTION IS THE CONTRACT ITSELF, on every page that defines the function: given the
   shared shape, the name comes back as text and the ids come back as attributes. A page that
   invents its own argument order fails here rather than in a headline.

   WHAT IS ASSERTED, per page:
     - celltypeLink(pos, name, ids) puts the NAME in the link text
     - ...and never renders an object into it
     - ...and carries the ids as class="ctlink" + data-nuc / data-root, so the ↗ can bring outlines
     - ...and is still an anchor to the viewer
     - the two-argument call, which several call sites still use, keeps working
   and on ηJump, end to end:
     - a community identification really does take over the headline, by name

   Run: node celltypelinkcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

/* Every page that defines celltypeLink, and what each one needs before it will build a link at
   all: λJump and βJump read CUR_IDX and return the bare text when there is no cell on screen. */
const PAGES = [
  { f: "ujump.html", prep: "" },
  { f: "hjump.html", prep: "" },
  { f: "djump.html", prep: "" },
  { f: "pjump.html", prep: "" },
  { f: "ljump.html", prep: "CUR_IDX = 0;" },
  { f: "bjump.html", prep: "CUR_IDX = 0;" }
];

const NAME = "Endothelial cell";

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  for (const spec of PAGES){
    console.log("\n" + spec.f);
    const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
    await p.route("**script.google.com/**", r => r.fulfill({ status: 200,
      contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, identities: [], organelles: [], tracings: [], reports: [],
                             rows: [], newCells: [] }) }));
    for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**",
                     "**storage.googleapis.com/**", "**s3.amazonaws.com/**", "**gstatic.com/**",
                     "**allentech.org/**", "**googleapis.com/**", "**microns-explorer.org/**"])
      await p.route(h, r => r.abort());
    await p.goto("file://" + page_(spec.f));
    await p.waitForTimeout(4500);

    const r = await p.evaluate(({ prep, name }) => {
      if (typeof celltypeLink !== "function") return { missing: true };
      try { eval(prep); } catch (_e){}
      /* Exactly the call core/panel.js makes when a community name wins. */
      const three = celltypeLink([100, 200, 30], name, { nuc: "778899", root: "665544" });
      const two   = celltypeLink([100, 200, 30], name);
      const el = document.createElement("div"); el.innerHTML = three;
      const a = el.querySelector("a");
      return { missing: false, three: three, two: two,
               text: (el.textContent || "").trim(),
               href: a ? (a.getAttribute("href") || "") : "",
               cls: a ? (a.getAttribute("class") || "") : "",
               nuc: a ? (a.getAttribute("data-nuc") || "") : "",
               root: a ? (a.getAttribute("data-root") || "") : "",
               arity: celltypeLink.length };
    }, { prep: spec.prep, name: NAME });

    if (r.missing){
      ok(false, "the page defines celltypeLink", "it does not");
    } else {
      ok(r.text.indexOf(NAME) === 0, "the name is the link text", r.text.slice(0, 60) || "(empty)");
      ok(!/\[object/i.test(r.three), "...and no argument is rendered as an object",
         /\[object/i.test(r.three) ? r.three.slice(0, 110) : "clean");
      ok(r.arity >= 3, "...the function takes the shared three arguments",
         r.arity + " parameter" + (r.arity === 1 ? "" : "s"));
      ok(/ctlink/.test(r.cls), "...the ids arrive as a ctlink, so the ↗ can bring the outline",
         r.cls || "(no class)");
      ok(r.nuc === "778899" && r.root === "665544", "...both ids, on the anchor",
         "nuc=" + (r.nuc || "-") + " root=" + (r.root || "-"));
      ok(/^https?:|^\/|#!/.test(r.href), "...and it still links to the viewer",
         (r.href || "(no href)").slice(0, 70));
      ok(r.two.indexOf(NAME) >= 0 && !/\[object/i.test(r.two),
         "the two-argument call, which many call sites use, still reads right",
         r.two.replace(/<[^>]*>/g, "").trim().slice(0, 60) || "(empty)");
    }
    ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 160) || "none");
    await p.close();
  }

  /* ── and the headline itself, on the page where it broke ─────────────────────────────────── */
  console.log("\nηJump, end to end: a community name takes over the headline");
  {
    const p = await b.newPage({ viewport: { width: 1300, height: 1100 } });
    const errors = [];
    p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
    /* One report naming the cell this test is about to open, which is what makes panel.js's
       override path run at all. */
    await p.route("**script.google.com/**", route => {
      const u = new URL(route.request().url()), H = { "Access-Control-Allow-Origin": "*" };
      const body = { ok: true, identities: [], organelles: [], tracings: [], rows: [],
                     newCells: [], reports: [] };
      if (u.searchParams.get("reports") || u.searchParams.get("nucleusId"))
        body.reports = [{ type: "new_identification", nucleusId: String(global.__NID || ""),
                          identified: NAME, reporterName: "Søren Grubb", certainty: "5",
                          timestamp: "2026-09-25T09:00:00Z" }];
      return route.fulfill({ status: 200, contentType: "application/json", headers: H,
                             body: JSON.stringify(body) });
    });
    for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**",
                     "**storage.googleapis.com/**", "**s3.amazonaws.com/**", "**gstatic.com/**",
                     "**googleapis.com/**", "**microns-explorer.org/**"])
      await p.route(h, r => r.abort());
    await p.goto("file://" + page_("hjump.html"));
    await p.waitForTimeout(4500);

    const head = await p.evaluate(async (name) => {
      /* Drive panel.js's own override with one report against the cell on screen, rather than
         guessing what the backend would send: this is the code path that produced the bug. */
      showCell(0, null, false);
      await new Promise(r => setTimeout(r, 400));
      const nid = String(CUR_NUCID);
      window.__origFetch = window.fetch;
      window.fetch = function(u){
        if (String(u).indexOf("script.google.com") >= 0)
          return Promise.resolve(new Response(JSON.stringify({ ok: true, reports: [
            { type: "new_identification", nucleusId: nid, identified: name,
              reporterName: "Søren Grubb", certainty: "5", timestamp: "2026-09-25T09:00:00Z" }
          ] }), { status: 200, headers: { "Content-Type": "application/json" } }));
        return window.__origFetch.apply(window, arguments);
      };
      loadCommunityReports(nid, window.CUR_POS);
      await new Promise(r => setTimeout(r, 1200));
      const el = document.getElementById("ctHeadline");
      const a = el && el.querySelector("a");
      return { text: el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "(no headline)",
               nuc: a ? (a.getAttribute("data-nuc") || "") : "",
               cls: a ? (a.getAttribute("class") || "") : "",
               nid: nid };
    }, NAME);

    ok(head.text.indexOf(NAME) === 0, "the headline reads the name the community gave the cell",
       head.text.slice(0, 80));
    ok(!/\[object/i.test(head.text), "...and not the shape of an argument",
       /\[object/i.test(head.text) ? head.text.slice(0, 80) : "clean");
    ok(/ctlink/.test(head.cls) && head.nuc === head.nid,
       "...and its ↗ carries the cell, so it can open with its outline",
       (head.cls || "(no class)") + " / " + (head.nuc || "-"));
    ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 160) || "none");
    await p.close();
  }

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
