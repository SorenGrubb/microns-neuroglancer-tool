/* A new structure gets its own id.                                                   2026-09-19

   Søren, looking at his Drive folder: *"The 3 lysosomes also have 6 json files"*. Six files for
   three tracings is right — one file per share, never overwritten, which is where the history
   lives. The filenames were not:

       lysosome_1789846306269__trace_….json          lysosome 1, two versions
       lysosome_1789846306269__i1__trace_….json      lysosome 2, two versions
       lysosome_1789846306269__i1__i2__trace_….json  lysosome 3, two versions

   `t.id = TRACING_PENDING.id + "__i" + inst` built the id of a NEW organelle by suffixing the id of
   whichever tracing happened to be open for editing. The compound name is the harmless half.

   THE OTHER HALF NEVER FIRED HERE BY LUCK, and it is what this check is mostly about: open `X` —
   lysosome ONE, no suffix — draw a second organelle beside it, and it is filed as `X__i1`. That is
   not a new structure. That is lysosome TWO, already published, and the new organelle would have
   been written as its next version while the older geometry quietly stopped being the answer.

   So: ids are asserted against the shared index, not just against each other. A new structure's id
   must be one that nothing else owns.

   Run: node tracingidcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* Put `count` structures on the pad and ask what would be submitted. `editing` is the structureId
   of a tracing opened for editing — the thing that used to poison every other id on the pad.
   `presses` > 1 calls it again without touching anything, which is the stability question: the same
   structure must get the same id every time, or every press files another tracing. */
const ASK = `(function(o){
  TRACING_SHARED = o.shared || [];
  TRACING_EDIT_INDEX = {};
  if (o.editing && o.editIndex) TRACING_EDIT_INDEX[o.editing] = o.editIndex;
  TRACING_BASE_ID = (o.baseNow === undefined) ? "" : o.baseNow;
  PAD_EDIT_ID = o.editing || "";
  const ring = (z, inst) => ({ z: z, inst: inst || 0,
                               points: [[1000, 2000], [1060, 2000], [1030, 2060]] });
  const rings = [];
  for (let i = 0; i < (o.count || 1); i++) rings.push(ring(100, i), ring(105, i));
  TRACING_PENDING = { rings: rings, id: o.editing || undefined };
  const w = document.getElementById("tracingWhat");
  const has = [].slice.call(w.options).some(x => x.value === "lysosome");
  w.value = has ? "lysosome" : w.options[1].value;
  document.getElementById("tracingNucId").value = "521491";
  document.getElementById("tracingRootId").value = "864691136741958236";
  const ty = document.getElementById("tracingType");
  if ([].slice.call(ty.options).some(x => x.value === "microglia")) ty.value = "microglia";
  document.getElementById("tracingFound").style.display = "";
  PAD_INST_KIND = {}; PAD_INST_COLOUR = {};
  const runs = [];
  for (let p = 0; p < (o.presses || 1); p++)
    runs.push((tracingCurrentAll() || []).map(t => ({ id: t.id, name: t.name })));
  return { runs: runs, base: TRACING_BASE_ID, pending: TRACING_PENDING && TRACING_PENDING.id };
})`;

/* One entry of the dataset index, as the backend hands it back. */
function shared(sid, index){
  return { structureId: sid, name: "Lysosome " + index, kind: "lysosome",
           instanceIndex: index, instanceOf: "lysosome",
           nucleusId: "521491", rootId: "864691136741958236", cellType: "microglia" };
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  const ask = o => p.evaluate(([src, opt]) => {
    // eslint-disable-next-line no-eval
    return eval(src)(opt);
  }, [ASK, o]);

  const idsOf = r => (r && r.runs && r.runs[0]) ? r.runs[0].map(t => t.id) : [];

  console.log("three structures drawn together, nothing opened for editing");
  {
    const r = await ask({ count: 3 });
    const got = idsOf(r);
    ok(got.length === 3, "three ids come out", got.length);
    ok(got[0] === r.pending, "the first is the pad's own id", got[0]);
    ok(got[1] === got[0] + "__i1" && got[2] === got[0] + "__i2",
       "...and the others are __i1 and __i2 off it, exactly as before", got.join("  "));
    ok(r.base === got[0], "the base IS the pad's id when nothing was opened", r.base);
    ok(!/__i/.test(String(got[0])), "and the base itself carries no suffix", got[0]);
  }

  console.log("\nediting a suffixed tracing — the compound id Søren found in Drive");
  {
    const three = [shared("lys-a", 1), shared("lys-a__i1", 2), shared("lys-a__i1__i2", 3)];
    const r = await ask({ shared: three, editing: "lys-a__i1", editIndex: 2, count: 2 });
    const got = idsOf(r);
    ok(got.length === 2, "two structures are submitted", got.length);
    ok(got[0] === "lys-a__i1", "the edited one is still itself, a version not a rival", got[0]);
    ok(got[1] !== "lys-a__i1__i2", "the new one beside it is NOT lys-a__i1__i2", got[1]);
    ok(!/__i\d+__i/.test(String(got[1])), "...no suffix is stacked on a suffix at all", got[1]);
    ok(three.every(s => s.structureId !== got[1]),
       "...and it is not the id of anything already in the dataset", got[1]);
  }

  console.log("\nediting an UNsuffixed tracing — the half that would have overwritten somebody");
  {
    /* `X + "__i1"` is not a free name: it is lysosome 2, already published. This is the case that
       never fired for him, and the only reason the six files were merely oddly named. */
    const three = [shared("lys-a", 1), shared("lys-a__i1", 2), shared("lys-a__i1__i2", 3)];
    const r = await ask({ shared: three, editing: "lys-a", editIndex: 1, count: 2 });
    const got = idsOf(r);
    ok(got[0] === "lys-a", "the edited one is still lysosome 1", got[0]);
    ok(got[1] !== "lys-a__i1",
       "the new organelle is NOT filed as lysosome 2's next version", got[1]);
    ok(three.every(s => s.structureId !== got[1]),
       "...nor as anything else the dataset already has", got[1]);
    ok(/__i1$/.test(String(got[1])) && String(got[1]).indexOf("lys-a") !== 0,
       "...it hangs off a base of the pad's own", got[1]);
    const r2 = await ask({ shared: three, editing: "lys-a", editIndex: 1, count: 3 });
    const g2 = idsOf(r2);
    ok(g2.length === 3 && g2[1] !== g2[2] && g2[1].replace(/__i1$/, "") === g2[2].replace(/__i2$/, ""),
       "three of them share one base and differ by their suffix", g2.join("  "));
  }

  console.log("\nthe same structure gets the same id on every press");
  {
    /* The requirement that rules out minting a fresh base per submission: press Add twice and the
       second structure must be the SAME tracing both times, or each press files another one. */
    const three = [shared("lys-a", 1), shared("lys-a__i1", 2)];
    const r = await ask({ shared: three, editing: "lys-a__i1", editIndex: 2, count: 2, presses: 3 });
    const a = (r.runs[0] || []).map(t => t.id).join("|");
    const c = (r.runs[2] || []).map(t => t.id).join("|");
    ok(a && a === c, "three presses in one pad session give the same ids", a + "   vs   " + c);
  }
  {
    const r = await ask({ count: 2, presses: 2 });
    const a = (r.runs[0] || []).map(t => t.id).join("|");
    const c = (r.runs[1] || []).map(t => t.id).join("|");
    ok(a && a === c, "...and so does a pad with nothing opened", a + "   vs   " + c);
  }

  console.log("\na base already in hand is kept, not re-minted");
  {
    const r = await ask({ editing: "lys-a", editIndex: 1, count: 2, baseNow: "carried_123" });
    const got = idsOf(r);
    ok(got[1] === "carried_123__i1",
       "a resumed pad's structures hang off the base it came back with", got[1]);
    ok(r.base === "carried_123", "...and it is not replaced", r.base);
  }

  console.log("\nthe draft carries the base, so resuming continues the same structures");
  {
    const got = await p.evaluate(() => {
      TRACING_BASE_ID = "basefromtoday_1";
      PAD_EDIT_ID = "lys-a";
      PAD = UJ.tracepad.create();
      PAD.rings = [{ z: 100, inst: 0, points: [[1, 2], [3, 4], [5, 6]] },
                   { z: 100, inst: 1, points: [[7, 8], [9, 10], [11, 12]] }];
      PAD.z = 100; PAD_CENTRE = [1, 2, 100];
      const d = draftNow();
      TRACING_BASE_ID = "something_else";      // as a reload, or another pad, would leave it
      let err = "";
      try { draftResumeFrom(d); } catch (e){ err = String(e && e.message || e); }
      return { wrote: d && d.baseId, after: TRACING_BASE_ID, err: err };
    });
    ok(got.wrote === "basefromtoday_1", "the draft writes the base down", got.wrote);
    ok(got.after === "basefromtoday_1", "...and resuming it puts that base back", got.after);
  }
  {
    /* Every draft saved before today. "" is the honest answer — the next add mints one — and it
       must not throw or resume as the string "undefined". */
    const got = await p.evaluate(() => {
      TRACING_BASE_ID = "left_over";
      let err = "";
      try { draftResumeFrom({ id: "dold", rings: [], pending: [], z: 5, centre: [0, 0, 5] }); }
      catch (e){ err = String(e && e.message || e); }
      return { after: TRACING_BASE_ID, err: err };
    });
    ok(got.after === "", "an old draft with no base resumes with none rather than the last one",
       JSON.stringify(got.after));
    ok(!got.err, "...and resuming it does not throw", got.err || "no error");
  }

  console.log("\nopening somebody's tracing ends the pad session that was running");
  {
    /* The route that builds a whole new PAD without going through padOpen. Draw two organelles,
       leave without committing, open a shared tracing to edit: a stale base would file this
       session's second structure under the last session's second structure. */
    const got = await p.evaluate(async () => {
      const rings = [{ z: 100, points: [[1000, 2000], [1060, 2000], [1030, 2060]] }];
      const rows = UJ.tracing.ringsToRows(rings, { structureId: "lys-a__i1", name: "Lysosome 2",
        kind: "lysosome", cellType: "microglia", nucleusId: "521491",
        rootId: "864691136741958236" });
      const real = window.fetch;
      window.fetch = () => Promise.resolve({ json: () => Promise.resolve({ tracings: [{ rows: rows }] }) });
      TRACING_BASE_ID = "stale_from_the_last_pad";
      TRACING_DRAFT_ID = "dstale";
      let err = "";
      try { await tracingOpenShared("lys-a__i1"); } catch (e){ err = String(e && e.message || e); }
      window.fetch = real;
      return { base: TRACING_BASE_ID, draft: TRACING_DRAFT_ID, edit: PAD_EDIT_ID, err: err };
    });
    ok(!got.err, "the tracing opens", got.err || "no error");
    ok(got.edit === "lys-a__i1", "...as a version of itself", got.edit);
    ok(got.base === "", "...with no base carried over from the pad before it", got.base);
    ok(got.draft === "", "...and no draft carried over either", got.draft);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
