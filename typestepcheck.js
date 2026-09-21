/* Previous / Next of the same type, on the identity card.                           2026-09-21

   Søren: "Now do the Next/previous buttons on µJump's identity card. But implement it for all
   tools." He chose a fixed list with a counter, wrapping at the ends, and the type as the name on
   the card. core/typestep.js is the row; each tool says what its cells are. Checked, on each page:

     - a cell with a type gets the row, at the top of its card: "<Type> · k of n";
     - Next shows the NEXT cell of that type -- another cell, the card names the same type, and the
       counter reads k+1;
     - Previous comes back to where it was;
     - from the last, Next goes round to the first ("1 of n"), and from the first Previous to the last;
     - the card is rebuilt on every jump, and there is still exactly one row on it;
     - a cell with no type gets no row.

   λJump and βJump have no classifier, so their types are the community's: three are named here
   before the check starts, as the backend would.

   Run: node typestepcheck.js [page.html]        (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
const PAGE = process.argv[2] || "ujump.html";
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1000, height: 1200 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => d.dismiss());
  for (const h of ["**script.google.com/**", "**accounts.google.com/**", "**storage.googleapis.com/**",
                   "**cdnjs.cloudflare.com/**", "**gstatic.com/**", "**amazonaws.com/**"])
    await p.route(h, r => r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);

  /* The community's names on λJump and βJump, where there is nothing else to step through. */
  await p.evaluate(() => {
    if (typeof IDENTITY_BY_NID !== "undefined" && typeof BID !== "undefined"){
      const m = {}; [3, 7, 11].forEach(i => { m[BID[i]] = { nucleusId: BID[i], current: "Astrocyte" }; });
      m[BID[5]] = { nucleusId: BID[5], current: "Microglia" };
      IDENTITY_BY_NID = m;
    }
  });

  const has = await p.evaluate(() => !!(window.UJ && UJ.typestep));
  ok(has, PAGE + ": core/typestep.js is loaded");
  if (!has){ await b.close(); console.log("\n" + (fails) + " FAILED"); process.exit(1); }

  /* A type with at least three cells, and the page's own way to show one. */
  const plan = await p.evaluate(async () => {
    let rows = null; const t0 = Date.now();
    while (Date.now() - t0 < 10000 && !(rows = UJ.typestep._rows())) await new Promise(r => setTimeout(r, 200));
    if (!rows) return { none: true };
    const g = {}; rows.forEach((r, i) => (g[r.key] = g[r.key] || []).push(i));
    const key = Object.keys(g).filter(k => g[k].length >= 3).sort((a, b) => g[a].length - g[b].length)[0];
    return { key, n: key ? g[key].length : 0, label: key ? rows[g[key][0]].label : "", total: rows.length };
  });
  ok(!plan.none && plan.key, "the tool's cells with a type are listed", plan.total + " cells, walking \"" + plan.label + "\" (" + plan.n + ")");

  const go = async (k) => p.evaluate(async ([key, k]) => {
    const rows = UJ.typestep._rows(); const g = []; rows.forEach((r, i) => { if (r.key === key) g.push(i); });
    const row = rows[g[(k + g.length) % g.length]];
    if (UJ.cfg.typestep && UJ.cfg.typestep.go) UJ.cfg.typestep.go(row); else jumpToVoxel(row.pos[0], row.pos[1], row.pos[2]);
    await new Promise(r => setTimeout(r, 900));
  }, [plan.key, k]);
  const read = async () => p.evaluate(() => {
    const rows = document.querySelectorAll(".typestep");
    const t = rows[0] ? rows[0].querySelector(".tscount").textContent : "";
    const m = /·\s*([\d,]+) of ([\d,]+)/.exec(t);
    const card = rows[0] ? rows[0].closest("[id]") : null;
    return { n: rows.length, text: t, at: m ? +m[1].replace(/,/g, "") : 0, of: m ? +m[2].replace(/,/g, "") : 0,
             pos: (window.CUR_POS || []).map(Math.round).join(","),
             cardText: card ? card.textContent.replace(/\s+/g, " ") : "", cardId: card ? card.id : "" };
  });
  const click = async (sel) => { await p.evaluate(s => document.querySelector(".typestep " + s).click(), sel); await p.waitForTimeout(1200); };

  console.log("\nthe row on a card");
  await go(0);
  const a = await read();
  ok(a.n === 1, "one row on the card", a.n + " row(s), in #" + a.cardId);
  ok(a.at === 1 && a.of === plan.n && a.text.indexOf(plan.label) >= 0, "...naming the type and where this cell is in it", a.text);

  console.log("\nNext and Previous");
  await click(".tsnext");
  const b1 = await read();
  ok(b1.pos !== a.pos, "Next shows another cell", a.pos + " -> " + b1.pos);
  ok(b1.at === 2 && b1.of === plan.n, "...the next of the same type", b1.text);
  ok(b1.cardText.toLowerCase().indexOf(plan.label.toLowerCase()) >= 0, "...and the card names that type");
  ok(b1.n === 1, "...with still exactly one row on the rebuilt card", b1.n);
  await click(".tsprev");
  const c1 = await read();
  ok(c1.pos === a.pos && c1.at === 1, "Previous comes back", c1.text + " at " + c1.pos);

  console.log("\ngoing round");
  await click(".tsprev");
  const d1 = await read();
  ok(d1.at === plan.n, "Previous from the first goes to the last", d1.text);
  await click(".tsnext");
  const e1 = await read();
  ok(e1.at === 1 && e1.pos === a.pos, "...and Next from the last goes round to the first", e1.text);

  console.log("\na cell with no type");
  const u = await p.evaluate(async () => {
    const rows = UJ.typestep._rows(), typed = {};
    rows.forEach(r => { if (r.pos) typed[r.pos.map(Math.round).join(",")] = 1; });
    /* A cell the page knows that is not in the list: the first one whose position is untyped. */
    let pos = null;
    if (typeof NX !== "undefined"){ for (let i = 0; i < N && pos === null; i++) if (!typed[[NX[i], NY[i], NZ[i]].join(",")]) pos = [NX[i], NY[i], NZ[i]]; }
    else if (typeof BX !== "undefined"){ for (let i = 0; i < N && pos === null; i++) if (!typed[[BX[i], BY[i], BZ[i]].join(",")]) pos = i; }
    else if (typeof HX !== "undefined"){ for (let i = 0; i < N && pos === null; i++) if (!typed[[HX[i], HY[i], HZ[i]].join(",")]) pos = i; }
    if (pos === null) return { skip: true };
    if (Array.isArray(pos)) jumpToVoxel(pos[0], pos[1], pos[2]);
    else if (typeof showCell === "function") showCell(pos, null);
    await new Promise(r => setTimeout(r, 1000));
    return { n: document.querySelectorAll(".typestep").length };
  });
  ok(u.skip || u.n === 0, "no row on a cell with no type", u.skip ? "every cell has a type" : u.n + " row(s)");
  ok(errors.length === 0, "no page errors", errors.join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
