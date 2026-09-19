/* Editing a tracing must not give it a new number.                                  2026-09-19

   Søren: *"I have started to make some lysosomes, but now because I have edited one of the
   lysosomes twice, it is now called Lysosome 5 and the other one Lysosome 3 because I have edited
   it once. I would like that editing it does not increase its number."*

   His card showed **Lysosome 1**, **Lysosome 3**, **Lysosome 5** — three lysosomes on one
   microglia, numbered as if there were five. The cause is one line doing its job too literally:
   `tracingCurrentAll` asked `tracingNextIndex()` for a number for every structure it submits, and
   that function answers "one more than the highest this cell already has" from an index that
   already contains the tracing being edited.

   SO THIS REPLAYS HIS SEQUENCE and asserts the labels, because the labels are what he sees:

       trace A, B, C   -> Lysosome 1, 2, 3
       edit B, re-add  -> Lysosome 2   (was 4)
       edit C, twice   -> Lysosome 3   (was 5, then 6)

   And the two things that must not be broken in the fixing: a genuinely new organelle traced
   beside an edited one still takes the next free number, and a tracing published WITH a number
   keeps it rather than being renamed back to a bare "Lysosome" on a re-add.

   It drives tracingCurrentAll on the real page — the numbering, the naming and the ids all come out
   of that one function, so asserting anything less than its output would be asserting a step.

   Run: node tracingnumbercheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* Put one lysosome on the pad and ask what would be submitted for it. `shared` is the dataset
   index as ?tracings=1 returns it; `editing` is the structureId of a tracing opened for editing,
   which is what makes this a version rather than a new organelle. */
const ASK = `(function(shared, editing, editIndex, extraInst){
  TRACING_SHARED = shared;
  TRACING_EDIT_INDEX = {};
  if (editing && editIndex) TRACING_EDIT_INDEX[editing] = editIndex;
  const ring = (z, inst) => ({ z: z, inst: inst || 0,
                               points: [[1000, 2000], [1060, 2000], [1030, 2060]] });
  const rings = [ring(100, 0), ring(105, 0)];
  if (extraInst) rings.push(ring(100, 1), ring(105, 1));
  TRACING_PENDING = { rings: rings, id: editing || undefined };
  const w = document.getElementById("tracingWhat");
  const has = [].slice.call(w.options).some(o => o.value === "lysosome");
  w.value = has ? "lysosome" : w.options[1].value;
  document.getElementById("tracingNucId").value = "521491";
  document.getElementById("tracingRootId").value = "864691136741958236";
  const ty = document.getElementById("tracingType");
  const tyHas = [].slice.call(ty.options).some(o => o.value === "microglia");
  if (tyHas) ty.value = "microglia";
  document.getElementById("tracingFound").style.display = "";
  PAD_INST_KIND = {}; PAD_INST_COLOUR = {};
  const out = tracingCurrentAll();
  return out.map(t => ({ name: t.name, id: t.id, index: t.instance_index }));
})`;

/* One entry of the dataset index, as the backend hands it back. */
function shared(sid, index, name){
  return { structureId: sid, name: name || ("Lysosome " + index), kind: "lysosome",
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

  const ask = (sharedList, editing, editIndex, extraInst) =>
    p.evaluate(([src, s, e, i, x]) => {
      // eslint-disable-next-line no-eval
      return eval(src)(s, e, i, x);
    }, [ASK, sharedList, editing || "", editIndex || 0, !!extraInst]);

  console.log("three new lysosomes are 1, 2 and 3");
  {
    const a = await ask([], "", 0);
    const b2 = await ask([shared("lys-a", 1)], "", 0);
    const c = await ask([shared("lys-a", 1), shared("lys-b", 2)], "", 0);
    ok(a[0] && a[0].name === "Lysosome", "the first is just “Lysosome” — there is no series yet",
       a[0] && a[0].name);
    ok(b2[0] && b2[0].name === "Lysosome 2", "the second is 2", b2[0] && b2[0].name);
    ok(c[0] && c[0].name === "Lysosome 3", "the third is 3", c[0] && c[0].name);
  }

  console.log("\nediting one does not increase its number — the whole of the request");
  {
    const three = [shared("lys-a", 1), shared("lys-b", 2), shared("lys-c", 3)];
    const once = await ask(three, "lys-b", 2);
    ok(once[0] && once[0].name === "Lysosome 2",
       "editing number 2 and adding it back is still number 2", once[0] && once[0].name);
    ok(once[0] && once[0].index === 2, "...and the submission says so, not only the label",
       once[0] && once[0].index);
    ok(once[0] && once[0].id === "lys-b",
       "...as a version of the same structure, which it always was", once[0] && once[0].id);
    /* Twice, because that is what made his read Lysosome 5. */
    const twice = await ask(three, "lys-c", 3);
    const thrice = await ask(three, "lys-c", 3);
    ok(twice[0].name === "Lysosome 3" && thrice[0].name === "Lysosome 3",
       "...and editing the same one again, and again, leaves it at 3",
       twice[0].name + " then " + thrice[0].name);
  }

  console.log("\nthe index alone is enough, with no memory of having opened it");
  {
    /* A draft of an edit, resumed after a reload: nothing in this session ever opened that
       tracing, so the stash is empty and the dataset index has to carry it. */
    const three = [shared("lys-a", 1), shared("lys-b", 2), shared("lys-c", 3)];
    const got = await ask(three, "lys-c", 0);
    ok(got[0] && got[0].name === "Lysosome 3",
       "a version resumed from a draft keeps its number too", got[0] && got[0].name);
  }

  console.log("\nand a genuinely new one beside it still takes the next free number");
  {
    const three = [shared("lys-a", 1), shared("lys-b", 2), shared("lys-c", 3)];
    const got = await ask(three, "lys-b", 2, true);
    ok(got.length === 2, "two structures are submitted", got.length);
    ok(got[0].name === "Lysosome 2" && got[0].id === "lys-b",
       "...the edited one keeps 2", got[0].name);
    ok(got[1].name === "Lysosome 4",
       "...and the new one beside it takes 4, not 3 and not 2",
       got[1].name + " / " + got[1].id);
    /* It used to be asserted as `lys-b__i1` — the edited tracing's id with a suffix on it. That is
       how the compound ids in Søren's Drive folder were built, and worse, `X + "__i1"` is a name
       that can already belong to a published structure. Since 2026-09-19 a new structure hangs off
       a base the pad mints for itself; what matters here is only that it is new. See
       tracingidcheck.js and src/a_new_structure_gets_its_own_id.py. */
    ok(got[1].id !== "lys-b__i1" && got[1].id !== got[0].id,
       "...with an id of its own rather than one built out of the edited tracing's", got[1].id);
  }

  console.log("\nwith nothing known, a new tracing is still added rather than refused");
  {
    /* No index (not deployed, offline, never browsed) and no stash: numbering starts at 1 and the
       work is recorded. A label that turns out to collide is a label to fix; refusing would lose
       the tracing. */
    const got = await ask([], "", 0);
    ok(got.length === 1 && got[0].name === "Lysosome",
       "it is submitted, with the number it can justify", got[0] && got[0].name);
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
