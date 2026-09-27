/* A second cell with the same NAME does not take the first one's id.                  2026-09-23

   Søren: "one of the arachnoid barrier cells is missing".

   IT WAS OVERWRITTEN. Two rows in the sheet carry the SAME structureId, whole-cell_1790144992280:

     nucleus 286849   140 sections, 176 contours, 30,948 vertices, 3,615 µm³   <- gone from the list
     nucleus 286159   105 sections, 114 contours,  9,322 vertices,   985 µm³   <- shown, as "v2"

   Two different cells, filed as two versions of one structure, so the list shows only the later.
   tracingCurrentAll picked the id like this:

       const prior = TRACINGS_KEPT.filter(x => x && x.id && x.name === label)[0];
       TRACING_PENDING.id = (prior && prior.id) || UJ.tracing.structureId(label);

   Matching on the NAME alone. "Whole cell" is the default name of every cell anybody traces, and
   "Lysosome 1" of every cell's first lysosome — so the second arachnoid barrier cell found the
   first by name and took its id. The intent was right (an edited tracing keeps its id, so it files
   a version rather than a twin); the key was far too weak.

   A structure is identified by its name AND THE CELL IT IS PART OF. A different nucleus or root is
   a different cell, and nothing about it can be a version of the other.

   ── AND A CELL HAS ONE WHOLE CELL AND TWENTY LYSOSOMES ─────────────────────────────  2026-09-27

   Hesham, through Søren: *"if I'm logging multiple lysosomes I still have to change the color of
   the annotation between each lysosome — if I don't, the new tracing will replace the old one which
   will then be turned from a tracing into a point annotation for some reason."*

   Name AND cell is a sound identity for a whole cell, of which a cell has exactly one. It is not an
   identity for an organelle, of which a cell has as many as somebody draws — and every one of them
   is called "Lysosome". So the second lysosome on a cell found the first by name, on the same cell,
   and took its id.

   THE COLOUR IS THE SYMPTOM, NOT THE CAUSE. A structure's colour is INSTANCE_COLOURS[inst], and its
   id is minted from the same `inst`: the first structure on a pad is `TRACING_PENDING.id` — the id
   this lookup just handed it — and the rest are `TRACING_BASE_ID + "__i" + inst`, with the base set
   to that same id. So every pad session on one cell computed the SAME id for its first structure,
   the same for its second, and so on. Two sessions, and session two's green lysosome replaced
   session one's green lysosome. Advancing the colour with "+ another one" moved to an index the
   other session had not reached yet, which is why changing the colour appeared to be the cure.

   Editing an organelle on purpose has its own route and keeps working: "Show the tracings in the
   dataset" → "Open it in the pad" sets PAD_EDIT_ID / PAD_EDIT_IDS, and `editOf` is consulted before
   any of this.

   Run: node idcollisioncheck.js */
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
    const rings = (n) => {
      const out = [];
      for (let z = 0; z < n; z++){
        const pts = [];
        for (let i = 0; i < 12; i++){
          const a = 2 * Math.PI * i / 12;
          pts.push([Math.round(295000 + 300 * Math.cos(a)), Math.round(151000 + 300 * Math.sin(a))]);
        }
        out.push({ z: 18000 + z, points: pts, inst: 0 });
      }
      return out;
    };
    /* The id is chosen at the top of tracingCurrentAll from TRACING_PENDING and TRACINGS_KEPT. */
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; return !!el; };
    /* A DETERMINISTIC MINT, so this check tests the LOOKUP and nothing else. With the real
       structureId() a fresh id differs from a prior one by its timestamp, which would let this pass
       on minting alone even if the lookup were still matching the wrong cell. Here a fresh id says
       "minted_N" and a reused one says what it was called before, so the two cases cannot be
       confused. structureId's own uniqueness is structureidcheck.js's business. */
    let minted = 0;
    UJ.tracing.structureId = function(){ return "minted_" + (++minted); };
    /* `insts` is how many structures are on the pad: [0] is one, [0,1,2] is three drawn together
       with "+ another one" pressed twice. Every call is a FRESH PAD SESSION — TRACING_BASE_ID
       cleared, exactly as tracingKeep leaves it after "Use these contours". */
    const idFor = (nuc, root, name, kept, what, insts) => {
      TRACINGS_KEPT = kept;
      const ins = insts || [0];
      const rs = [];
      ins.forEach(function(k){ rings(4).forEach(function(r){ rs.push({ z: r.z, points: r.points, inst: k }); }); });
      TRACING_PENDING = { rings: rs, groups: null };
      TRACING_BASE_ID = "";
      try { PAD_EDIT_ID = ""; PAD_EDIT_IDS = {}; } catch (_e){}
      /* "__cell" is the dropdown value that means a whole cell; it names itself "Whole cell",
         which is the whole point of this check. */
      set("tracingWhat", what || "__cell");
      set("tracingName", name);
      set("tracingType", "traced");
      set("tracingNucId", nuc);
      set("tracingRootId", root);
      set("tracingX", ""); set("tracingY", ""); set("tracingZ", "");
      const all = tracingCurrentAll();
      return { id: (all[0] && all[0].id) || (TRACING_PENDING && TRACING_PENDING.id) || "",
               ids: all.map(function(t){ return String(t.id || ""); }),
               names: all.map(function(t){ return String(t.name || ""); }),
               name: (all[0] && all[0].name) || "", n: all.length,
               what: (document.getElementById("tracingWhat") || {}).value || "",
               say: (document.getElementById("tracingStatus") || {}).textContent || "" };
    };

    /* Cell A, traced and kept. */
    const A = idFor("286849", "", "Whole cell", []);
    const keptA = [{ id: A.id, name: A.name || "Whole cell", kind: "cell", nucleus_id: "286849",
                     root_id: "", rings: rings(4) }];
    /* Cell B: a DIFFERENT arachnoid barrier cell, same default name. */
    const B = idFor("286159", "", "Whole cell", keptA);
    /* Cell A again, edited: same name AND same nucleus, so it must keep its id. */
    const A2 = idFor("286849", "", "Whole cell", keptA);
    /* And by ROOT id, for a cell with no nucleus. */
    const keptR = [{ id: "whole-cell_r1", name: "Whole cell", kind: "cell", nucleus_id: "",
                     root_id: "864691135345326066", rings: rings(4) }];
    const R1 = idFor("", "864691135345326066", "Whole cell", keptR);
    const R2 = idFor("", "864691136116229028", "Whole cell", keptR);

    /* ── AND NOW THE LYSOSOMES, ON ONE CELL ──────────────────────────────────────────────── */
    const LYS = "lysosome";
    const kept = [];
    /* EACH STRUCTURE UNDER THE NAME IT WAS ACTUALLY GIVEN. A lysosome drawn alone is named bare
       "Lysosome" — no number, because tracingCurrentAll only numbers a name when there is more than
       one of the kind to tell apart. That is what Hesham's seven kept lysosomes all read as on
       screen, and it is why the name-and-cell key matched every one of them. Pushing the FIRST
       structure's name onto all of them would have hidden exactly the case under test. */
    const push = function(r){
      r.ids.forEach(function(id, k){
        kept.push({ id: id, name: r.names[k], kind: LYS, nucleus_id: "394298",
                    root_id: "864691135488318266", rings: rings(4) });
      });
      return r;
    };
    /* HESHAM'S WORKFLOW: one lysosome, add it, draw the next one. Each pad session starts at
       inst 0, so each gets colour 0 — and, before today, id 0 as well. */
    const S1 = push(idFor("394298", "864691135488318266", "", [], LYS, [0]));
    const S2 = push(idFor("394298", "864691135488318266", "", kept.slice(), LYS, [0]));
    const S3 = push(idFor("394298", "864691135488318266", "", kept.slice(), LYS, [0]));
    /* And three drawn together in one session, "+ another one" twice, after those three are in. */
    const S4 = idFor("394298", "864691135488318266", "", kept.slice(), LYS, [0, 1, 2]);
    /* Editing one on purpose: the route "Open it in the pad" takes, which must still be a version. */
    TRACINGS_KEPT = kept.slice();
    TRACING_PENDING = { rings: rings(4).map(function(r){ return { z: r.z, points: r.points, inst: 0 }; }),
                        groups: null, id: S1.ids[0] };
    TRACING_BASE_ID = "";
    try { PAD_EDIT_ID = S1.ids[0]; PAD_EDIT_IDS = { "0": S1.ids[0] }; } catch (_e){}
    set("tracingWhat", LYS); set("tracingName", ""); set("tracingType", "traced");
    set("tracingNucId", "394298"); set("tracingRootId", "864691135488318266");
    const EDIT = (tracingCurrentAll()[0] || {}).id || "";

    return { idA: A.id, idB: B.id, idA2: A2.id, idR1: R1.id, idR2: R2.id,
             nameA: A.name, nA: A.n, sayA: A.say,
             lysWhat: S1.what, lys1: S1.ids, lys2: S2.ids, lys3: S3.ids, lys4: S4.ids,
             lysNames: S1.names.concat(S2.names, S3.names),
             lysEdit: EDIT, lysEditWanted: S1.ids[0] };
  });

  console.log("two arachnoid barrier cells, both called “Whole cell”");
  ok(!!got.idA && !!got.idB, "both get an id", got.idA + " / " + got.idB);
  ok(got.idA !== got.idB,
     "...and they are DIFFERENT: a different nucleus is a different cell",
     got.idA === got.idB ? "BOTH " + got.idA + " — the second overwrites the first" : "distinct");

  console.log("\nand the thing the name-match was for still works");
  ok(got.idA2 === got.idA,
     "the same cell traced again keeps its id, so it files a version rather than a twin",
     got.idA2 + " == " + got.idA);
  ok(got.idR1 === "whole-cell_r1",
     "...matched on the ROOT id too, for a cell with no nucleus", got.idR1);
  ok(got.idR2 !== "whole-cell_r1",
     "...and a different root is a different cell", got.idR2);

  /* ── the lysosomes ─────────────────────────────────────────────────────────────────────── */
  console.log("\nsix lysosomes on one microglia, every one of them called “Lysosome”");
  ok(got.lysWhat === "lysosome",
     "(the fixture really is an organelle, not a whole cell)", got.lysWhat || "(the option is missing)");
  /* NUMBERED 1, 2, 3 since 2026-09-27 — Søren asked for an organelle kind to be numbered always,
     and the count now includes what this browser has kept but has not yet shared, which is why
     three saved in three sessions against an EMPTY published index do not all come back
     "Lysosome 1". They did, for an hour; this check is what found it. */
  ok(got.lysNames.join(" | ") === "Lysosome 1 | Lysosome 2 | Lysosome 3",
     "(...and they are numbered 1, 2, 3 — one per pad session, against an empty index)",
     got.lysNames.join(" | "));
  ok(got.lys2[0] !== got.lys1[0],
     "the second lysosome gets an id of its own, drawn in a pad session of its own",
     got.lys2[0] === got.lys1[0] ? "BOTH " + got.lys1[0] + " — the second overwrites the first"
                                 : got.lys1[0] + " then " + got.lys2[0]);
  ok(got.lys3[0] !== got.lys1[0] && got.lys3[0] !== got.lys2[0],
     "...and so does the third", got.lys3[0]);
  const prev = got.lys1.concat(got.lys2, got.lys3);
  const overlap = got.lys4.filter(id => prev.indexOf(id) >= 0);
  ok(got.lys4.length === 3 && overlap.length === 0,
     "...and three more drawn together in one session are three more again",
     overlap.length ? "reused: " + overlap.join(", ") : got.lys4.join(" | "));
  ok(new Set(prev.concat(got.lys4)).size === 6,
     "six lysosomes, six ids — nothing overwrites anything",
     new Set(prev.concat(got.lys4)).size + " distinct of 6");
  ok(got.lysEdit === got.lysEditWanted,
     "and opening one on purpose still files a version of it, not a twin",
     got.lysEdit + " == " + got.lysEditWanted);

  ok(errors.length === 0, "no page errors", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
