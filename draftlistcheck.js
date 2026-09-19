/* Unfinished tracings are a list, not a slot.                                       2026-09-19

   Søren: *"Perhaps we could also keep saved segmentation drafts here somewhere, so they can be
   easily found and continued."*

   THERE WAS EXACTLY ONE, and nothing ever said so. `ujump_tracing_draft_v1` is a single key, so
   starting a second organelle replaced the first — the same shape of fault as the one that cost
   him three lysosomes the same morning: the tool quietly holding less state than the person
   assumes it does.

   Asked where drafts should live he chose the dataset, following the account between machines.
   This is the first half of that — the list, in the browser, behind one store — and it is the half
   that works signed out and with no deploy. The assertions here are about the PROPERTY, not the
   storage: a draft that is saved is findable and resumable, and saving one never disturbs another.
   That is what has to stay true when the second half files them on the server too.

   Run: node draftlistcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};
/* Run against a page that has no draft store — the one-slot version this replaces — every section
   here has to report a row of FAILs rather than throwing on the first line. "Something is wrong
   somewhere" is worth much less than a list of the things that are, and a check that only ever
   runs green is a check nobody has seen fail. */
const ask = async (p, fn, arg) => {
  try { return await p.evaluate(fn, arg); }
  catch (e){ return { __absent: String(e && e.message || e).split("\n")[0] }; }
};

/* Put a tracing on the pad and save it as a draft, the way the autosave would. */
const MAKE = `(function(what, nuc, nRings, z0){
  const circ = (cx, cy, r, n) => { const o = [];
    for (let i = 0; i < n; i++){ const a = 2*Math.PI*i/n; o.push([cx + r*Math.cos(a), cy + r*Math.sin(a)]); }
    return o; };
  TRACING_DRAFT_ID = "";                      // a fresh pad is a fresh draft
  PAD = UJ.tracepad.create(z0);
  PAD.rings = [];
  for (let k = 0; k < nRings; k++)
    PAD.rings.push({ z: z0 + k*5, inst: 0, points: circ(1000, 2000, 50, 12) });
  const w = document.getElementById("tracingWhat");
  w.value = what;
  document.getElementById("tracingNucId").value = nuc;
  document.getElementById("tracingFound").style.display = "";
  return draftSave(true);
})`;

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

  console.log("three unfinished tracings are three, not the last one");
  {
    const got = await ask(p, ([make]) => {
      localStorage.removeItem("ujump_tracing_drafts_v2");
      localStorage.removeItem("ujump_tracing_draft_v1");
      // eslint-disable-next-line no-eval
      const make_ = eval(make);
      const opts = [].slice.call(document.getElementById("tracingWhat").options)
        .map(function(o){ return o.value; });
      const kinds = ["lysosome", "mitochondrion", "__cell"].map(function(k){
        return opts.indexOf(k) >= 0 ? k : opts[1];
      });
      const a = make_(kinds[0], "521491", 20, 17852);
      const c = make_(kinds[1], "521491", 9, 18000);
      const d = make_(kinds[2], "264317", 19, 19000);
      draftRender();
      return { ids: [a, c, d].map(function(x){ return x && x.id; }),
               list: draftStore.list().map(function(x){
                 return { id: x.id, title: x.title, rings: x.rings.length }; }),
               /* textContent, not innerText: the tracing panel is a <details> and is shut here,
                  and innerText on a hidden element is "" in Chromium — which would make this
                  assertion about whether the panel happens to be open. */
               bar: document.getElementById("tracingDraftBar").textContent.replace(/\s+/g, " "),
               rows: document.querySelectorAll("#tracingDraftBar .draftres,"
                     + " #tracingDraftBar .draftdrop").length };
    }, [MAKE]);
    ok(!got.__absent && (got.list||[]).length === 3, "all three are kept", ((got.list||[]).length) + " kept");
    ok(!got.__absent && new Set(got.ids||[]).size === 3, "...each with an id of its own, so one cannot overwrite another",
       (got.ids||[]).join(", "));
    ok(!got.__absent && (got.list||[]).map(d => d.rings).sort((x, y) => x - y).join(",") === "9,19,20",
       "...with their own contours, 20 / 9 / 19 as drawn",
       (got.list||[]).map(d => d.rings).join(" / "));
    /* FOUND means telling them apart without opening them. */
    ok(!got.__absent && (got.list||[]).length > 0 && got.list.every(d => d.title && d.title !== "Unfinished tracing"),
       "...and a name computed from what was filled in, rather than three “Untitled”",
       (got.list||[]).map(d => d.title).join(" | "));
    ok(!got.__absent && /Unfinished tracings/.test(got.bar||'') && /\(3\)/.test(got.bar),
       "the card lists them and says how many", (got.bar||got.__absent||'').slice(0, 60));
    ok(!got.__absent && got.rows === 6, "...with a Resume and a Discard on every row, not only the newest",
       got.rows / 2 + " rows of two buttons");
  }

  console.log("\nand any one of them can be continued");
  {
    const got = await ask(p, () => {
      const list = draftStore.list();
      const want = list.filter(function(d){ return d.rings.length === 9; })[0];
      const btn = document.querySelector('#tracingDraftBar .draftres[data-id="' + want.id + '"]');
      if (btn) btn.click();
      return { want: want.id, onPad: PAD ? PAD.rings.length : -1, current: TRACING_DRAFT_ID,
               stillThree: draftStore.list().length };
    });
    ok(!got.__absent && got.onPad === 9, "resuming the middle one puts ITS contours on the pad, not the newest'",
       got.onPad + " contours");
    ok(!got.__absent && got.current === got.want,
       "...and the pad adopts its id, so saving updates it rather than making a fourth",
       got.current === got.want ? "adopted" : got.current + " != " + got.want);
    ok(!got.__absent && got.stillThree === 3, "...and the other two are untouched", got.stillThree + " kept");
  }

  console.log("\nsaving the resumed one updates it in place");
  {
    const got = await ask(p, async () => {
      PAD.rings.push({ z: 18100, inst: 0, points: [[0, 0], [10, 0], [10, 10]] });
      draftSave(true);
      const list = draftStore.list();
      return { n: list.length, mine: (draftRead() || {}).rings.length,
               sizes: list.map(function(d){ return d.rings.length; }).sort(function(a, b){ return a - b; }) };
    });
    ok(!got.__absent && got.n === 3, "still three drafts, not four", got.n);
    ok(!got.__absent && got.mine === 10, "...and the one on the pad grew by the contour just drawn", got.mine);
    ok(!got.__absent && (got.sizes||[]).join(",") === "10,19,20", "...while the others are exactly as they were",
       (got.sizes||[]).join(" / "));
  }

  console.log("\ndiscarding one names it, and leaves the rest");
  {
    const got = await ask(p, async () => {
      const gone = draftStore.list().filter(function(d){ return d.rings.length === 20; })[0];
      let asked = "";
      const real = window.confirm;
      window.confirm = function(m){ asked = m; return true; };
      document.querySelector('#tracingDraftBar .draftdrop[data-id="' + gone.id + '"]').click();
      window.confirm = real;
      return { asked: asked, left: draftStore.list().map(function(d){ return d.rings.length; })
                 .sort(function(a, b){ return a - b; }) };
    });
    ok(!got.__absent && (got.asked||'').indexOf("“") >= 0 && got.asked.length > 30,
       "it asks first, and says WHICH one — there is no undo for this",
       JSON.stringify((got.asked||got.__absent||'').slice(0, 70)));
    ok(!got.__absent && (got.left||[]).join(",") === "10,19", "...and only that one goes", (got.left||[]).join(" / "));
  }

  console.log("\na draft saved before today is adopted, and its old copy is left alone");
  {
    const got = await ask(p, () => {
      localStorage.removeItem("ujump_tracing_drafts_v2");
      const old = { v: 1, at: new Date().toISOString(),
                    rings: [{ z: 1, inst: 0, points: [[0, 0], [10, 0], [10, 10]] },
                            { z: 2, inst: 0, points: [[0, 0], [10, 0], [10, 10]] }],
                    pending: [], z: 1, centre: [0, 0, 1], used: true };
      localStorage.setItem("ujump_tracing_draft_v1", JSON.stringify(old));
      const list = draftStore.list();
      return { n: list.length, rings: list[0] && list[0].rings.length, id: list[0] && list[0].id,
               /* BELT AND BRACES, on the day a tracing was destroyed by a save that thought it
                  knew better: the migration reads and never deletes. */
               oldStillThere: !!localStorage.getItem("ujump_tracing_draft_v1") };
    });
    ok(!got.__absent && got.n === 1 && got.rings === 2,
       "the single-slot draft becomes the first entry in the list", got.n + " / " + got.rings);
    ok(!got.__absent && got.oldStillThere === true,
       "...and the old key keeps its copy — the migration reads, it does not delete");
  }

  console.log("\nand a full list is never made room in");
  {
    const got = await ask(p, () => {
      const many = [];
      for (let i = 0; i < 50; i++)
        many.push({ v: 2, id: "x" + i, title: "filler " + i, at: new Date(2020, 0, 1 + i).toISOString(),
                    rings: [{ z: i, inst: 0, points: [[0, 0], [10, 0], [10, 10]] }], pending: [] });
      localStorage.setItem("ujump_tracing_drafts_v2", JSON.stringify({ v: 2, drafts: many }));
      const said = document.getElementById("tracePadSay");
      said.textContent = "";
      TRACING_DRAFT_ID = "";
      PAD = UJ.tracepad.create(9);
      PAD.rings = [{ z: 9, inst: 0, points: [[0, 0], [10, 0], [10, 10]] }];
      const got51 = draftStore.put({ v: 2, id: draftCurrentId(), title: "the fifty-first",
                                     at: new Date().toISOString(), rings: PAD.rings, pending: [] });
      const list = draftStore.list();
      return { accepted: got51, n: list.length, msg: said.textContent,
               oldestStillThere: list.some(function(d){ return d.id === "x0"; }) };
    });
    ok(!got.__absent && got.accepted === false && got.n === 50,
       "the fifty-first is refused rather than evicting the oldest", got.n + " kept");
    ok(!got.__absent && got.oldestStillThere === true,
       "...and the oldest is still there, which is the whole point of refusing");
    ok(!got.__absent && /not added/.test(got.msg||'') && /discard one/.test(got.msg),
       "...and it says so, with what to do about it", JSON.stringify((got.msg||got.__absent||'').slice(0, 80)));
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
