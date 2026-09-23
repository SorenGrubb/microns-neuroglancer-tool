/* Two structures minted in the same millisecond do not get the same id.               2026-09-23

   Found while fixing the arachnoid barrier cell Søren lost. Once the prior-id lookup was narrowed
   to the right cell, the two cells were minting their ids independently — and STILL came back
   identical:

       whole-cell_1790186254669  /  whole-cell_1790186254669

   because structureId() is

       slug + "_" + (stamp || Date.now())

   and both calls happened in the same millisecond. Its own comment claims "unique per submission".
   It is unique per millisecond per name, which is not the same promise, and the consequence is the
   one that cost the cell: two structures sharing an id are one structure with two versions, and the
   list shows the later.

   TWO WAYS IT HAPPENS. Same page, two mints in a millisecond — what this reproduces. And two
   PEOPLE, in two browsers, minting the same slug in the same millisecond, which no page-local
   counter can see; with sixteen fellows tracing the same organelles that is worth a few random
   characters.

   WHAT IS ASSERTED:
     - two mints of the same name in the same millisecond differ
     - a thousand of them are all distinct
     - an explicit stamp is still honoured verbatim (regenerating an id has to be repeatable)
     - the slug is still readable and still leads the id
     - two mints from two independent pages differ

   Run: node structureidcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const mk = async () => {
    const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
    await p.route("**/*", r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await p.goto("file://" + page_("ujump.html"));
    await p.waitForTimeout(2500);
    return p;
  };
  const p = await mk();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });

  const got = await p.evaluate(() => {
    const S = UJ.tracing.structureId;
    /* ── THE CLOCK IS HELD STILL ─────────────────────────────────────────────────  2026-09-23
       This used to mint twice and then ASK whether both had landed in the same millisecond, which
       is a coin toss: one run in a few straddles the boundary and the check fails on its own
       precondition while every real assertion passes. The collision is the point, so it is made to
       happen rather than waited for. */
    const realNow = Date.now;
    Date.now = function(){ return 1790200000000; };
    const a = S("Whole cell"), c = S("Whole cell");
    const sameMs = (Date.now() === 1790200000000);
    /* ...and a thousand more, all claiming the same instant. */
    const many = [];
    for (let i = 0; i < 1000; i++) many.push(S("Lysosome"));
    Date.now = realNow;
    return { a, c, sameMs, uniq: new Set(many).size, n: many.length,
             stamped: S("Whole cell", 1790186254669),
             stampedTwice: S("Whole cell", 1790186254669),
             slug: S("Arachnoid barrier cell") };
  });
  const other = await (await mk()).evaluate(() => UJ.tracing.structureId("Whole cell"));

  console.log("two whole cells minted in the same millisecond");
  ok(got.sameMs, "(the clock was held still, so both mints claim one millisecond)", got.sameMs);
  ok(got.a !== got.c, "...get DIFFERENT ids", got.a === got.c ? "BOTH " + got.a : got.a + " / " + got.c);
  ok(got.uniq === got.n, "a thousand in a row are all distinct",
     got.uniq + " distinct of " + got.n);

  console.log("\nand the things the id is for still hold");
  ok(got.stamped === got.stampedTwice,
     "an explicit stamp is honoured verbatim, so an id can be regenerated", got.stamped);
  ok(/^whole-cell_/.test(got.a), "the slug still leads it, and is still readable", got.a);
  ok(/^arachnoid-barrier-cell_/.test(got.slug), "...for a longer name too", got.slug);
  ok(other !== got.a && other !== got.c,
     "two people in two browsers do not mint the same id", other);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
