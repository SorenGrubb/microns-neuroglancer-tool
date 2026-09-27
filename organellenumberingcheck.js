/* A cell's organelles of one kind are numbered 1..n, however they were drawn.         2026-09-27

   Søren: *"can we force the numbering, so that if you add another lysosome to a cell that already
   has a lysosome they both get a number, first one is 1 and second one is 2 - and so on. I think
   having numbers for multiple organelles of the same kind makes sense, and if the user uses the pad
   in a different way, we should still be able to put numbers on the organelles."*

   WHY HESHAM'S SEVEN HAVE NO NUMBERS, measured before any of this: a structure is numbered only
   when the card decides there are "several", and that was `(more than one of the kind on the pad)
   || (the next free number > 1)`. Søren drew six at once, so the first test passed and they came
   out 1–6. Hesham drew one, saved, drew the next — so `count === 1` every time, and it fell to the
   second test, which asks tracingNextIndex for the highest instanceIndex published on that cell.
   His first lysosome was drawn alone, so it was named bare and **no instanceIndex was submitted at
   all**; the highest is therefore 0, the next free is 1, and `1 > 1` is false. Bare again. The
   first one had no number because it was alone; every one after it had none BECAUSE THE EARLIER
   ONES HAD NONE. Measured on his cell: one more lysosome came out "Lysosome", and tracingNextIndex
   answered **1**, not 8.

   THREE THINGS, THEREFORE:

     tracingNextIndex counts how many of the kind the cell HAS, not the highest number it happens
     to carry. Seven bare lysosomes answer 8.

     An ontology organelle kind is ALWAYS numbered — a cell can have twenty and the number is how
     they are told apart. A whole cell and a nucleus never are: there is one of each, and a number
     on it is noise. A hand-named "something else" keeps the old rule, because there the name is
     the identifier the user chose and "Astrocyte at the glia limitans 1" reads badly for one.

     AND THE ONES ALREADY SAVED GET THEIRS, on the save — Søren's choice, asked and answered:
     "Automatically, on the save." Each is fetched, renamed and re-submitted: one version each, a
     name-only change. This is a deliberate rewrite of published rows, so the card says how many it
     wrote and the check below counts them.

   WHAT IS ASSERTED
     - a cell's first lysosome, drawn alone, is "Lysosome 1"
     - a whole cell is not numbered, and neither is a nucleus
     - on a cell with seven unnumbered lysosomes, the next one is Lysosome 8
     - ...and the seven are renamed Lysosome 1 to 7, oldest first, one post each
     - ...and nothing of another kind on that cell is touched
     - with a numbered sibling in the way, the bare ones take the numbers that are free
     - saving again numbers nothing, because there is nothing left unnumbered
     - tracingNextIndex counts the cell's structures of the kind

   Run: node organellenumberingcheck.js [page.html]      (default ujump.html) */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");
let fails = 0;
const ok = (c, what, d) => { console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : "")); if (!c) fails++; };
const PAGE = process.argv[2] || "ujump.html";

const NUC = "394298", ROOT = "864691135488318266";
const enc = pts => pts.map(p => p.join(",")).join(";");
const ring = z => Array.from({ length: 10 }, (_, i) => {
  const a = 2 * Math.PI * i / 10;
  return [Math.round(237472 + 200 * Math.cos(a)), Math.round(156240 + 200 * Math.sin(a))];
});
/* Hesham's cell: seven lysosomes, all bare, and one whole cell that must not be touched. */
const BARE = Array.from({ length: 7 }, (_, i) => ({
  structureId: "h" + i, kind: "lysosome", instanceOf: "", instanceIndex: "", name: "Lysosome",
  color: "#40e28c", cellType: "traced", nucleusId: NUC, rootId: ROOT, cellCoord: "",
  tracedBy: "Hesham Mohamed", contours: 4, sections: 4,
  timestamp: "2026-09-2" + (i + 1) + "T08:00:00Z" }));
const WHOLE = { structureId: "wc", kind: "cell", instanceOf: "", instanceIndex: "",
  name: "Whole cell", color: "#3a6b5a", cellType: "traced", nucleusId: NUC, rootId: ROOT,
  cellCoord: "", tracedBy: "Hesham Mohamed", contours: 8, sections: 8,
  timestamp: "2026-09-20T08:00:00Z" };
const rowsFor = s => Array.from({ length: s.contours }, (_, i) => ({
  structureId: s.structureId, kind: s.kind, instanceOf: s.instanceOf,
  instanceIndex: s.instanceIndex, name: s.name, color: s.color, cellType: s.cellType,
  nucleusId: s.nucleusId, rootId: s.rootId, cellCoord: s.cellCoord,
  reporterName: s.tracedBy, z: 18750 + i, ringIndex: 0, points: enc(ring(18750 + i)) }));

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 1050 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  for (const h of ["**accounts.google.com/**", "**cdnjs.cloudflare.com/**", "**storage.googleapis.com/**",
                   "**s3.amazonaws.com/**", "**gstatic.com/**", "**allentech.org/**", "**googleapis.com/**",
                   "**microns-explorer.org/**", "**princeton.edu/**"])
    await p.route(h, r => r.abort());
  await p.route("**script.google.com/**", route => {
    const u = new URL(route.request().url()), H = { "Access-Control-Allow-Origin": "*" };
    const J = o => route.fulfill({ status: 200, contentType: "application/json", headers: H,
                                   body: JSON.stringify(o) });
    if (u.searchParams.get("tracings") === "1"){
      const one = u.searchParams.get("structureId"), many = u.searchParams.get("structureIds");
      const ALL = BARE.concat([WHOLE]);
      const pick = ids => ALL.filter(x => ids.indexOf(x.structureId) >= 0)
                            .map(x => ({ structureId: x.structureId, rows: rowsFor(x) }));
      if (one) return J({ tracings: pick([one]) });
      if (many) return J({ tracings: pick(many.split(",")) });
      return J({ tracings: ALL });
    }
    return J({ ok: true, identities: [], organelles: [], reports: [], rows: [] });
  });
  await p.goto("file://" + page_(PAGE));
  await p.waitForTimeout(5000);

  await p.evaluate(([bare, whole]) => {
    window.__BARE = bare; window.__WHOLE = whole;
    /* One place the harness drives a save, so every case below is the same press. */
    window.__save = async function(shared, what, name, nuc, root, insts){
      TRACING_SHARED = shared;
      TRACINGS_KEPT = [];
      const rs = [];
      (insts || [0]).forEach(function(k){
        for (let z = 0; z < 3; z++){
          const a = [];
          for (let i = 0; i < 10; i++){
            const th = 2 * Math.PI * i / 10;
            a.push([Math.round(237472 + 200 * Math.cos(th)), Math.round(156240 + 200 * Math.sin(th))]);
          }
          rs.push({ z: 19000 + z, inst: k, points: a });
        }
      });
      TRACING_PENDING = { rings: rs, groups: null };
      TRACING_BASE_ID = ""; PAD_EDIT_ID = ""; PAD_EDIT_IDS = {};
      try { TRACING_EDIT_KNOWN = {}; TRACING_EDIT_INDEX = {}; TRACING_EDIT_SIG = {}; } catch (_e){}
      PAD_INST_KIND = {};
      (insts || [0]).forEach(function(k){
        PAD_INST_KIND[String(k)] = Object.assign({ value: what }, tracingWhatOf(what, name || ""));
      });
      const set = function(id, v){ const e = document.getElementById(id); if (e) e.value = v; };
      set("tracingWhat", what); set("tracingName", name || ""); set("tracingType", "traced");
      set("tracingNucId", nuc); set("tracingRootId", root);
      set("tracingX", ""); set("tracingY", ""); set("tracingZ", "");
      GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "x";
      window.__SENT = [];
      postReport = function(pl){ window.__SENT.push(pl); return Promise.resolve({ ok: true }); };
      const named = tracingCurrentAll().map(function(t){
        return String(t.name || "") + (t.instance_index === undefined ? "" : "[" + t.instance_index + "]");
      });
      tracingKeep();
      await new Promise(r => setTimeout(r, 1800));
      const tr = window.__SENT.filter(x => x && x.structureId);
      return { named: named,
               posts: tr.map(x => String(x.structureId) + "=" + String(x.name || "")
                                  + "[" + (x.instanceIndex === undefined || x.instanceIndex === "" ? "-"
                                           : x.instanceIndex) + "]"),
               say: (document.getElementById("tracingStatus") || {}).textContent || "" };
    };
  }, [BARE, WHOLE]);

  /* ── an empty cell ────────────────────────────────────────────────────────────────────── */
  console.log("a cell with nothing on it yet");
  const first = await p.evaluate(async () =>
    window.__save([], "lysosome", "", "111111", "222222", [0]));
  ok(first.named[0] === "Lysosome 1[1]",
     "the first lysosome is Lysosome 1, not a bare “Lysosome”", first.named.join(", "));
  const wc = await p.evaluate(async () =>
    window.__save([], "__cell", "", "111111", "222222", [0]));
  ok(wc.named[0] === "Whole cell",
     "...and a whole cell is not numbered, because a cell has one", wc.named.join(", "));
  const nu = await p.evaluate(async () =>
    window.__save([], "__nucleus", "", "111111", "222222", [0]));
  ok(nu.named[0] === "Nucleus", "...nor a nucleus", nu.named.join(", "));

  /* ── Hesham's cell ────────────────────────────────────────────────────────────────────── */
  console.log("\nseven unnumbered lysosomes, and one more drawn beside them");
  const nextIdx = await p.evaluate(async ([nuc, root]) => {
    TRACING_SHARED = window.__BARE.concat([window.__WHOLE]);
    return tracingNextIndex("lysosome", "Lysosome", nuc, root);
  }, [NUC, ROOT]);
  ok(nextIdx === 8, "tracingNextIndex counts the cell's lysosomes, not their numbers",
     nextIdx + " (7 on the cell, so 8)");

  const hesham = await p.evaluate(async ([nuc, root]) =>
    window.__save(window.__BARE.concat([window.__WHOLE]), "lysosome", "", nuc, root, [0]),
    [NUC, ROOT]);
  ok(hesham.named[0] === "Lysosome 8[8]", "the new one is Lysosome 8", hesham.named.join(", "));
  const renamed = hesham.posts.filter(s => /^h\d=/.test(s));
  ok(renamed.length === 7, "...and the seven already saved are re-posted, one each",
     renamed.length + " of 7: " + renamed.join(" | "));
  ok(renamed.join(" ") === "h0=Lysosome 1[1] h1=Lysosome 2[2] h2=Lysosome 3[3] h3=Lysosome 4[4] "
                         + "h4=Lysosome 5[5] h5=Lysosome 6[6] h6=Lysosome 7[7]",
     "...numbered 1 to 7 in the order they were drawn", renamed.join(" | "));
  ok(hesham.posts.filter(s => /^wc=/.test(s)).length === 0,
     "...and the whole cell on that cell is not touched",
     hesham.posts.filter(s => /^wc=/.test(s)).join(", ") || "not touched");
  ok(/had no number/.test(hesham.say) && /numbered 1 to 7/.test(hesham.say),
     "...and the card says it rewrote them, and how many",
     (hesham.say.replace(/\s+/g, " ").match(/[^.]*had no number[^.]*\.[^.]*\./) || ["(said nothing about it)"])[0]);

  console.log("\nand saving again numbers nothing");
  const again = await p.evaluate(async ([nuc, root]) => {
    /* The cell as it stands after the pass above: seven numbered, plus Lysosome 8. */
    const now = window.__BARE.map(function(s, i){
      return Object.assign({}, s, { name: "Lysosome " + (i + 1), instanceIndex: String(i + 1),
                                    instanceOf: "lysosome" });
    }).concat([window.__WHOLE, { structureId: "new8", kind: "lysosome", instanceOf: "lysosome",
      instanceIndex: "8", name: "Lysosome 8", color: "#40e28c", cellType: "traced",
      nucleusId: nuc, rootId: root, cellCoord: "", tracedBy: "Hesham Mohamed",
      contours: 3, sections: 3, timestamp: "2026-09-28T08:00:00Z" }]);
    return window.__save(now, "lysosome", "", nuc, root, [0]);
  }, [NUC, ROOT]);
  ok(again.named[0] === "Lysosome 9[9]", "the next one is Lysosome 9", again.named.join(", "));
  ok(again.posts.filter(s => /^h\d=/.test(s)).length === 0,
     "...and nothing already numbered is rewritten",
     again.posts.filter(s => /^h\d=/.test(s)).join(", ") || "nothing");

  /* ── a numbered sibling in the way ────────────────────────────────────────────────────── */
  console.log("\nwith a numbered sibling already in the way");
  const mixed = await p.evaluate(async ([nuc, root]) => {
    /* The SAME structureIds the backend stub can serve — h0, h1, h2 — because numbering one means
       fetching its contours, and an id nothing can read is skipped and logged, which would have
       looked exactly like the numbering not happening. */
    /* FRESH COPIES. tracingNumberBare patches the index rows in place — deliberately, so a second
       save numbers nothing — and window.__BARE is the very array the Hesham pass above patched.
       Reusing those objects here would hand this case seven already-numbered lysosomes and prove
       nothing. (Which it did, once.) */
    const three = [
      Object.assign({}, window.__BARE[0], { name: "Lysosome", instanceIndex: "", instanceOf: "" }),
      Object.assign({}, window.__BARE[1], { name: "Lysosome", instanceIndex: "", instanceOf: "" }),
      Object.assign({}, window.__BARE[2], { name: "Lysosome 3",
                                            instanceIndex: "3", instanceOf: "lysosome" })
    ];
    return window.__save(three, "lysosome", "", nuc, root, [0]);
  }, [NUC, ROOT]);
  ok(mixed.named[0] === "Lysosome 4[4]", "the new one takes 4", mixed.named.join(", "));
  const mren = mixed.posts.filter(s => /^h[01]=/.test(s)).sort();
  ok(mren.join(" ") === "h0=Lysosome 1[1] h1=Lysosome 2[2]",
     "...and the two bare ones take the numbers that were free", mren.join(" | ") || "(none)");
  ok(mixed.posts.filter(s => /^h2=/.test(s)).length === 0,
     "...while the one that already had 3 keeps it, unwritten",
     mixed.posts.filter(s => /^h2=/.test(s)).join(", ") || "unwritten");

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
