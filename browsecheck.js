/* Browsing a dataset that has no predictions, only the community's own names.      2026-09-20

   Søren: *"λJump and βJump have no browse block and no type picker — we need to implement that"*
   and, asked what it should list: *"yes, we need λJump and βJump community identified type
   picker."*

   Neither tool carries `CT_NAMES` / `IDX_BY_TYPE` — the automated-prediction layer µJump's picker
   is built on is simply absent — so the pools come from `ljumpIdentityOf(i)` / `bjumpIdentityOf(i)`,
   the consensus the community has reached about each cell.

   WHAT THIS GUARDS, in the order the mistakes were actually made:

     - the unidentified pool is a POOL, not an identity. The first version assigned the pools object
       straight across and then hung the sentinel on it, which put "__unclassified__ (488)" in the
       list as though somebody had reported it;
     - the counts come from CELLS, so every cell lands in exactly one pool and the totals add up to
       the dataset — counting report rows would double-count every argued-over cell;
     - microglia is grouped under Glia, not under familyOf()'s "resident immune", because µJump
       files it that way and these tools are meant to look like µJump;
     - the coordinate fold must not swallow the error line, the recent-cells box or the tool's own
       "Show me a random nucleus" button.

   Run: node browsecheck.js [page.html]   (default ljump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

const PAGE = process.argv[2] || "ljump.html";
let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The backend is unreachable here, so the identities are stubbed the way it answers: a map from
   nucleus id to {current}. Deliberately includes a name the ontology has never heard of. */
const NAMES = ["Microglia", "Astrocyte", "Pyramidal neuron", "Endothelial cell",
               "Lymphocyte", "Erythrocyte", "Blob of something"];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);

  console.log(PAGE + "\n\nbrowsing is the first thing, and the coordinate box is the second");
  {
    const got = await p.evaluate(() => {
      const rp = document.getElementById("randomCellPanel");
      const cp = document.getElementById("coordPanel");
      return { tag: rp && rp.tagName, cpTag: cp && cp.tagName, open: cp && cp.open,
               before: !!(rp && cp && (rp.compareDocumentPosition(cp) & 4)),
               shown: !!(rp && rp.getClientRects().length),
               pickerFirst: !!(document.getElementById("randomTypeSelect")
                 .compareDocumentPosition(document.getElementById("randomUnclassified")) & 4),
               xInside: cp.contains(document.getElementById("x"))
                        && cp.contains(document.getElementById("go")),
               xHidden: !document.getElementById("x").checkVisibility(),
               /* The error line, the recent box and this tool's own random-nucleus button all sit
                  after the coordinate box and must stay out of the fold. */
               keptOut: !cp.contains(document.getElementById("err"))
                        && !cp.contains(document.getElementById("recentBox"))
                        && !cp.contains(document.getElementById("rand")) };
    });
    ok(got.tag === "DIV", "the browse block is not a fold at all", got.tag);
    ok(got.shown, "...and is on screen with nothing clicked", got.shown);
    ok(got.pickerFirst, "...the picker above the random button", got.pickerFirst);
    ok(got.before, "...and the whole block above the coordinate box", got.before);
    ok(got.cpTag === "DETAILS" && got.open === false, "the coordinate box is a fold, shut",
       got.cpTag + " open=" + got.open);
    ok(got.xInside && got.xHidden, "...holding the boxes and the arrow, out of the way",
       got.xInside + "/" + got.xHidden);
    ok(got.keptOut, "...and NOT the error line, the recent box or the random-nucleus button",
       got.keptOut);
  }

  console.log("\nthe pools are the community's identities, counted from the cells");
  {
    const got = await p.evaluate(async names => {
      IDENTITY_BY_NID = {};
      for (let i = 0; i < 140; i++) IDENTITY_BY_NID[BID[i]] = { current: names[i % names.length] };
      await populateRandomTypeSelect();
      const s = document.getElementById("randomTypeSelect");
      const sentinel = Object.keys(RAND_POOLS_BY_ID).filter(k => /unclassified/.test(k))[0];
      const named = Object.keys(RAND_POOLS_BY_ID).filter(k => k !== sentinel);
      let total = 0;
      Object.keys(RAND_POOLS_BY_ID).forEach(k => { total += RAND_POOLS_BY_ID[k].length; });
      /* Every cell in exactly one pool: the sum over pools must be the dataset, and no index may
         appear twice. */
      const seen = {};
      let dupes = 0;
      Object.keys(RAND_POOLS_BY_ID).forEach(k => RAND_POOLS_BY_ID[k].forEach(i => {
        if (seen[i]) dupes++; seen[i] = 1; }));
      return { groups: [].slice.call(s.querySelectorAll("optgroup")).map(g => ({
                 label: g.label, colour: g.style.color,
                 opts: [].slice.call(g.children).map(o => o.textContent) })),
               sentinelInList: [].slice.call(s.options).some(o => /unclassified/i.test(o.value)),
               hasSentinelPool: !!sentinel,
               total, cells: BID.length, dupes, named: named.length,
               closedColour: s.style.color,
               note: document.getElementById("unclCount").textContent };
    }, NAMES);

    ok(got.hasSentinelPool && !got.sentinelInList,
       "the unidentified cells are a pool, never an option in the list",
       "pool:" + got.hasSentinelPool + " listed:" + got.sentinelInList);
    ok(got.total === got.cells && got.dupes === 0,
       "every cell lands in exactly one pool, and they add up to the dataset",
       got.total + " of " + got.cells + ", " + got.dupes + " counted twice");
    ok(got.named === NAMES.length, "one pool per identity reported", got.named);
    const byLabel = {};
    got.groups.forEach(g => { byLabel[g.label] = g.opts.join(", "); });
    ok(/Microglia/.test(byLabel["Glia"] || ""),
       "microglia is filed under Glia, the way µJump files it",
       byLabel["Glia"] || "(no Glia group)");
    ok(/Lymphocyte/.test(byLabel["Immune & perivascular cells"] || ""),
       "...and a circulating immune cell under Immune & perivascular",
       byLabel["Immune & perivascular cells"] || "(none)");
    ok(/Blob of something/.test(byLabel["Other"] || ""),
       "...and a name the ontology has never heard of under Other", byLabel["Other"] || "(none)");
    ok(got.groups.every(g => /^var\(--cat-/.test(g.colour)),
       "each group painted from the shared palette",
       got.groups.map(g => g.label + "=" + g.colour).join("  ").slice(0, 100));
    ok(/^var\(--cat-/.test(got.closedColour),
       "...and the closed control takes the colour of what is in it", got.closedColour);
  }
  {
    /* AND IT RECOLOURS WHEN YOU PICK, which is a different wire from the one above. The paint
       syncs the colour at the end of every rebuild; without a change listener the control keeps
       the colour of whatever was selected when the list was last built — pick Microglia and it
       stays the first option's blue. */
    const got = await p.evaluate(() => {
      const s = document.getElementById("randomTypeSelect");
      const before = s.style.color;
      s.value = "Microglia";
      s.dispatchEvent(new Event("change"));
      return { before, after: s.style.color, glia: getComputedStyle(s).color,
               note: document.getElementById("unclCount").textContent };
    });
    ok(got.after === "var(--cat-glia)",
       "choosing an identity recolours the closed control", got.before + " -> " + got.after);
    ok(/^rgb/.test(got.glia), "...to a real colour", got.glia);
    ok(/\d[\d,. ]* cells nobody has identified yet\./.test(got.note),
       "the line under the button counts what is left to do", got.note);
  }

  console.log("\nand the buttons draw from the right pool");
  {
    const got = await p.evaluate(() => {
      const shown = [];
      const realShow = window.showCell;
      window.showCell = function(i){ shown.push(i); };
      window.alert = function(m){ shown.push("ALERT:" + m); };
      const s = document.getElementById("randomTypeSelect");
      s.value = "Microglia";
      document.getElementById("randomOfType").click();
      const micro = shown.slice();
      const inMicro = RAND_POOLS_BY_ID["Microglia"].indexOf(micro[0]) >= 0;
      shown.length = 0;
      document.getElementById("randomUnclassified").click();
      const sentinel = Object.keys(RAND_POOLS_BY_ID).filter(k => /unclassified/.test(k))[0];
      const inUnid = RAND_POOLS_BY_ID[sentinel].indexOf(shown[0]) >= 0;
      window.showCell = realShow;
      return { inMicro, inUnid, first: micro[0], second: shown[0] };
    });
    ok(got.inMicro, "Random example shows a cell from the chosen identity", got.first);
    ok(got.inUnid, "...and the other button one nobody has named", got.second);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
