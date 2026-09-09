/* The home page has a menu, headings, and one board for every tool.                2026-09-09

   Søren: "I would like to make an overall leaderboard for the index page … there should be an
   indication of what tools the different users have reported in. That should be the greek letter
   of the tool of course in the color of the tool. It should come just after the wJump … I think
   it is about time we have a menu for the index page also and some headlines for the different
   sections."

   THE REAL PAGE IN A REAL BROWSER, with only the network stubbed — the same rule
   blendereverywherecheck.js follows, and for the same reason: a jsdom mount against a hand-written
   stub is a second copy of the page that agrees with the check by construction.

   Run: node indexboardcheck.js  */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => { console.log((c ? "PASS " : "*** FAIL *** ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

const BOARD = {
  ok: true,
  updated: "2026-09-09T18:30:57.391Z",
  leaderboard: [
    { handle: "Søren", points: 4210.5, reports: 812,
      datasets: ["ujump", "pjump", "wjump"],
      perDataset: { ujump: 3000, pjump: 900, wjump: 310.5 } },
    { handle: "anonymous", points: 12, reports: 3, datasets: ["djump"], perDataset: { djump: 12 } },
    /* A dataset key nothing on this page knows: it must be skipped, not drawn as an empty box. */
    { handle: "someone <b>else</b>", points: 5, reports: 1, datasets: ["zjump"], perDataset: {} }
  ]
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  async function open(stub){
    const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    const errs = [];
    p.on("pageerror", e => errs.push(String((e && e.stack) || e).split("\n")[0]));
    await p.route("**script.google.com/**", route => {
      if (stub === null) return route.abort();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stub) });
    });
    await p.goto("file://" + page_("index.html"));
    await p.waitForTimeout(900);
    return { p, errs };
  }

  /* ── the happy path ─────────────────────────────────────────────────────────────────────── */
  console.log("\n--- a board with entries ---");
  let { p, errs } = await open(BOARD);
  ok(errs.length === 0, "page loads with no JS error", errs[0] || "clean");

  const nav = await p.evaluate(() => {
    const links = Array.from(document.querySelectorAll(".sitenav a"));
    return links.map(a => {
      const id = a.getAttribute("href").slice(1);
      const t = document.getElementById(id);
      return { id, text: a.textContent.trim(), found: !!t,
               heading: t ? !!(t.querySelector("h2") || t.tagName === "H2") : false };
    });
  });
  ok(nav.length >= 5, "the header has a menu", nav.length + " links");
  ok(nav.every(l => l.found), "every menu link points at a section that exists",
     nav.filter(l => !l.found).map(l => l.id).join(",") || "all resolve");
  ok(nav.every(l => l.heading), "...and every one of those sections has a heading",
     nav.filter(l => !l.heading).map(l => l.id).join(",") || "all headed");

  /* Where it sits: after the last tool card, which is ωJump. */
  const order = await p.evaluate(() => {
    const w = document.querySelector('a.feature.omega'), lb = document.getElementById("leaderboard");
    if (!w || !lb) return null;
    return (w.compareDocumentPosition(lb) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  ok(order === true, "the board comes after the ωJump card");

  const rows = await p.evaluate(() => {
    return Array.from(document.querySelectorAll("#lbAll .lbrow")).map(r => ({
      rank: (r.querySelector(".lbrank") || {}).textContent,
      name: (r.querySelector(".lbname") || {}).textContent,
      num:  (r.querySelector(".lbnum")  || {}).textContent,
      /* textContent DECODES, so an escaped "&lt;b&gt;" reads back as "<b>" here and looks
         identical to markup that got through. The only honest test is whether an ELEMENT was
         created — hence tags, not a regex over the text. */
      tags: Array.from((r.querySelector(".lbname") || { children: [] }).children).map(e => e.tagName),
      letters: Array.from(r.querySelectorAll(".lbtools a")).map(a => ({
        ch: a.textContent, cls: a.className, href: a.getAttribute("href"),
        colour: getComputedStyle(a).color, title: a.getAttribute("title") }))
    }));
  });
  ok(rows.length === 3, "every entry is drawn", rows.length + " rows");
  ok(rows[0].rank === "1." && /Søren/.test(rows[0].name), "ranked, with the handle",
     rows[0].rank + " " + rows[0].name);
  ok(/4,211 points/.test(rows[0].num) && /812 reports/.test(rows[0].num),
     "points and reports, rounded and grouped", rows[0].num);
  ok(rows[2].tags.length === 0 && rows[2].name.indexOf("<b>else</b>") >= 0,
     "a handle with markup in it is escaped, not rendered",
     rows[2].tags.length ? "built a real <" + rows[2].tags[0] + "> element" : "no elements — text only");

  const L = rows[0].letters;
  ok(L.length === 3, "one letter per tool the person has reported in", L.map(x => x.ch).join(""));
  ok(L[0].ch === "µ" && L[1].ch === "π" && L[2].ch === "ω",
     "...the right letters, in the order the server sent", L.map(x => x.ch).join(""));
  ok(L[2].ch === "ω", "...and ω is still ω, not Ω", L[2].ch);
  ok(L[0].cls === "tl-ujump" && L[2].cls === "tl-wjump", "...classed by tool",
     L.map(x => x.cls).join(" "));
  ok(L[2].href === "/wjump.html", "...and each letter opens its tool", L[2].href);
  ok(/points here/.test(L[0].title), "...with that tool's own points on hover", L[0].title);
  ok(rows[2].letters.length === 0, "a dataset key this page does not know is skipped, not drawn");

  /* Each letter its own colour, and all eight distinct — the whole point of colouring them. */
  const cols = await p.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = ["ujump","djump","pjump","ljump","hjump","xjump","bjump","wjump"]
      .map(d => '<span class="tl-' + d + '">x</span>').join("");
    document.body.appendChild(host);
    const out = Array.from(host.children).map(e => getComputedStyle(e).color);
    host.remove();
    return out;
  });
  ok(new Set(cols).size === 8, "all eight tool colours are distinct", new Set(cols).size + " of 8");

  const note = await p.textContent("#lbAllNote");
  ok(/four hours/.test(note), "the board says the totals are a snapshot, not live", note.trim());

  /* Dark mode has to recolour the letters, or four of them go nearly black on a dark card. */
  const darkCols = await p.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    const e = document.querySelector("#lbAll .lbtools a");
    return e ? getComputedStyle(e).color : null;
  });
  ok(darkCols && darkCols !== L[0].colour, "the letters take their dark colours in dark mode",
     L[0].colour + " → " + darkCols);
  await p.close();

  /* ── the two ways to have nothing, which must not say the same thing ─────────────────────── */
  console.log("\n--- an old deployment, and an empty board ---");
  ({ p } = await open({ ok: true }));
  const oldMsg = (await p.textContent("#lbAll")).trim();
  ok(/not available from the server yet/i.test(oldMsg),
     "a backend without the endpoint says so", oldMsg);
  await p.close();

  ({ p } = await open({ ok: true, leaderboard: [] }));
  const emptyMsg = (await p.textContent("#lbAll")).trim();
  ok(/No contributions yet/i.test(emptyMsg), "an empty board says something different", emptyMsg);
  ok(oldMsg !== emptyMsg, "...and the two are not the same sentence");
  await p.close();

  ({ p } = await open(null));
  const deadMsg = (await p.textContent("#lbAll")).trim();
  ok(/Could not reach/i.test(deadMsg), "an unreachable server says that instead", deadMsg);
  await p.close();

  await b.close();
  console.log(fails ? "\nRESULT: " + fails + " FAILED" : "\nRESULT: ALL CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})();
