/* A tracing that has not changed is not sent to the dataset again.                    2026-09-23

   Søren: "We have an issue that Hesham tried to log an organelle and then was able to log it again
   and again where it overwrites the old one. It should only be possible to log an organelle once
   and then update the same one if there are changes, but not save it as a new organelle."

   HESHAM'S OWN ROWS, classified. The structureId is the SAME on every press — he was never making
   a new organelle, the backend was filing a new VERSION of the same one each time, including the
   times nothing had changed:

       18 rows, 4 distinct organelles, 8 real edits, 10 EXACT repeats (56%)
       lysosome_1789996455594      12/12/214 posted 4 times, 17/17/395 3 times, 27/27/581 twice
       lysosome_1789996455594__i2  2/2/42 posted 4 times

   So the fix is not to forbid a second save — an edited outline must be able to replace its
   predecessor, which is what he asks for in the same sentence. It is to refuse a save that carries
   nothing new. The same reasoning tracingPublish already applies to the centre annotation, in its
   own words: "the test is whether the centre has MOVED rather than whether anything was pressed".

   WHAT IS ASSERTED:
     - the first share posts
     - pressing again with nothing changed posts NOTHING, and the card says why
     - ...and does not leave it queued, to go out by itself later
     - an edited outline DOES post, under the SAME structureId, with a new groupId
     - a changed NAME or type posts too: the row is the record, not just the geometry
     - two drawings on one pad stay two organelles

   Run: node resharecheck.js */
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

  const got = await p.evaluate(() => {
    /* Signed in, and every post captured instead of sent. GOOGLE_VERIFIED is a `let` at the page's
       top level, so it is assigned through the scope chain, not as a window property. */
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "x";
    const SENT = [];
    postReport = function(pl){ SENT.push(pl); return true; };
    /* The centre annotation has its own path and its own rule; not what this is about. */
    tracingRegisterCentre = function(){ return false; };

    const ringsOf = (n, r) => {
      const out = [];
      for (let z = 0; z < n; z++){
        const pts = [];
        for (let i = 0; i < 24; i++){
          const a = 2 * Math.PI * i / 24;
          pts.push([Math.round(295000 + r * Math.cos(a)), Math.round(151000 + r * Math.sin(a))]);
        }
        out.push({ z: 18000 + z, points: pts });
      }
      return out;
    };
    const t = { id: "lysosome_test", name: "Lysosome 1", kind: "lysosome", type: "Microglia",
                color: "#40e28c", nucleus_id: "325785", root_id: "864691136116229028",
                rings: ringsOf(12, 300), pending_share: true };

    const step = (label) => {
      const before = SENT.length;
      const r = tracingPublish(t);
      return { label, posted: SENT.length - before, ret: r,
               gid: SENT.length ? SENT[SENT.length - 1].groupId : null,
               sid: SENT.length ? SENT[SENT.length - 1].structureId : null,
               pending: !!t.pending_share,
               say: (document.getElementById("tracingStatus") || {}).textContent || "" };
    };

    const first = step("first");
    t.pending_share = true;                       // what pressing Add again does
    const again = step("unchanged");
    t.pending_share = true;
    t.rings = ringsOf(17, 300);                   // a real edit
    const edited = step("edited");
    t.pending_share = true;
    t.name = "Lysosome 2";                        // only the name
    const renamed = step("renamed");
    t.pending_share = true;
    const again2 = step("unchanged again");

    /* Counted here, before the button section below adds posts of its own. */
    const nSentDirect = SENT.length, sidsDirect = SENT.map(x => x.structureId);

    /* ── AND THE SAME THING THROUGH THE BUTTON ───────────────────────────────────  2026-09-23
       Everything above drives tracingPublish() directly, which is why this check passed while the
       bug was live: the button is tracingKeep(), and tracingKeep REBUILDS the kept entry from the
       pad on every press. It carries shared_at, centre_registered and centre_at across that
       rebuild -- and did not carry shared_sig, so the guard above never saw what was last sent and
       every press posted again. Søren's sheet has the proof: three rows for
       lysosome_1790192158786_ay6p__i8, 12 contours and 137 vertices on all three.
       So the press is what is pressed here. */
    const ringsFor = (n) => {
      const out = [];
      for (let z = 0; z < n; z++){
        const pts = [];
        for (let i = 0; i < 24; i++){
          const a = 2 * Math.PI * i / 24;
          pts.push([Math.round(295000 + 300 * Math.cos(a)), Math.round(151000 + 300 * Math.sin(a))]);
        }
        out.push({ z: 18000 + z, points: pts, inst: 0 });
      }
      return out;
    };
    const press = (n) => {
      TRACING_PENDING = { rings: ringsFor(n) };
      TRACING_BASE_ID = "";
      try { PAD_EDIT_ID = ""; PAD_EDIT_IDS = {}; } catch (_e){}
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      set("tracingWhat", "__other"); set("tracingName", "Lysosome 9");
      set("tracingType", "Microglia"); set("tracingNucId", "325785");
      set("tracingRootId", "864691136116229028");
      set("tracingX", ""); set("tracingY", ""); set("tracingZ", "");
      const before = SENT.length;
      tracingKeep();
      return SENT.length - before;
    };
    const keep1 = press(12);          // the first press: it goes
    const keep2 = press(12);          // the same again: it must NOT
    const keep3 = press(12);          // and again
    const keep4 = press(17);          // a real edit: it goes
    const keep5 = press(17);          // and settles again

    return { first, again, edited, renamed, again2, nSent: nSentDirect,
             gids: SENT.map(x => x.groupId), sids: sidsDirect,
             keep: { keep1, keep2, keep3, keep4, keep5 } };
  });

  console.log("a lysosome, shared and then shared again");
  ok(got.first.posted === 1, "the first share posts", got.first.posted + " post(s)");
  ok(got.again.posted === 0, "pressing again with nothing changed posts NOTHING",
     got.again.posted + " post(s)");
  ok(/nothing has changed|unchanged|already/i.test(got.again.say),
     "...and the card says why, rather than looking as if it did nothing",
     got.again.say.slice(0, 140) || "(said nothing)");
  ok(got.again.pending === false,
     "...and it is not left queued, to go out by itself later", got.again.pending);

  console.log("\nan edit, which must still go");
  ok(got.edited.posted === 1, "an edited outline posts", got.edited.posted + " post(s)");
  ok(got.edited.sid === got.first.sid,
     "...under the SAME structureId: it is the same organelle, updated",
     got.edited.sid + " == " + got.first.sid);
  ok(got.edited.gid !== got.first.gid,
     "...with a new groupId, so the versions are told apart", got.edited.gid);
  ok(got.renamed.posted === 1,
     "a changed name posts too — the row is the record, not only the geometry",
     got.renamed.posted + " post(s)");
  ok(got.again2.posted === 0, "and it settles again once nothing is changing",
     got.again2.posted + " post(s)");
  ok(got.nSent === 3, "three posts for three real states, not five for five presses",
     got.nSent + " rows for 5 presses");
  ok(new Set(got.sids).size === 1, "...all of them one organelle", [...new Set(got.sids)].join(","));

  console.log("\nand the same, through the button the user actually presses");
  ok(got.keep.keep1 === 1, "the first press posts", got.keep.keep1 + " post(s)");
  ok(got.keep.keep2 === 0 && got.keep.keep3 === 0,
     "pressing it again with nothing changed posts NOTHING \u2014 tracingKeep rebuilds the kept "
     + "entry, and the memory of what was sent has to survive that",
     "press 2: " + got.keep.keep2 + ", press 3: " + got.keep.keep3);
  ok(got.keep.keep4 === 1, "an edit still goes", got.keep.keep4 + " post(s)");
  ok(got.keep.keep5 === 0, "...and settles again", got.keep.keep5 + " post(s)");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
