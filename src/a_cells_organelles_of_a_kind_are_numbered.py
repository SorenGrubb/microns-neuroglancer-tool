# -*- coding: utf-8 -*-
u"""A cell's organelles of a kind are numbered 1..n, however they were drawn.           2026-09-27

Søren:

    "can we force the numbering, so that if you add another lysosome to a cell that already has a
     lysosome they both get a number, first one is 1 and second one is 2 - and so on. I think having
     numbers for multiple organelles of the same kind makes sense, and if the user uses the pad in a
     different way, we should still be able to put numbers on the organelles."

WHY HESHAM'S SEVEN HAVE NO NUMBERS. A structure is numbered only when the card decides there are
"several", which was `(more than one of the kind on the pad) || (the next free number > 1)`. Søren
drew six at once — the first test passed and they came out 1–6. Hesham drew one, saved, drew the
next, so `count === 1` every time and it fell to the second test, which asks tracingNextIndex for
the highest instanceIndex published on the cell. His first lysosome was drawn alone, so it was named
bare and **no instanceIndex was submitted at all**; the highest is 0, the next free is 1, and
`1 > 1` is false. Bare again.

The first one had no number because it was alone. Every one after it had none BECAUSE THE EARLIER
ONES HAD NONE. Measured on his cell before this went in: one more lysosome came out "Lysosome", and
tracingNextIndex answered **1**, not 8.

THREE THINGS

  tracingNextIndex COUNTS THE CELL'S STRUCTURES of the kind, not the highest number they carry.
  Seven bare lysosomes answer 8. `Math.max(top, n) + 1`, so a mixed cell — one numbered 3 and two
  bare — still answers above both.

  AN ONTOLOGY ORGANELLE KIND IS ALWAYS NUMBERED. A cell can have twenty lysosomes and the number is
  how they are told apart, so the first one is "Lysosome 1". A whole cell and a nucleus never are:
  there is one of each and a number on it is noise. A hand-named "something else" keeps the old
  rule, because there the name is the identifier the user chose and "Astrocyte at the glia
  limitans 1" reads badly for one of them.

  AND THE ONES ALREADY SAVED GET THEIRS, ON THE SAVE. Asked and answered: "Automatically, on the
  save." Each unnumbered sibling is fetched, renamed and re-submitted — one version each, a
  name-only change — and the card says how many rows it wrote, because this is a deliberate rewrite
  of published rows and the alternative is a silent one.

ONE ALLOCATOR, TWO CONSUMERS, which is the lesson of the last four days applied before it bit.
tracingBareOf() answers "which of this cell's structures of this kind have no number, oldest first,
and which numbers are free for them" — and it is asked by BOTH the card, for a bare structure that
happens to be open on the pad, and tracingNumberBare(), for the ones that are not. Two allocators
would have handed the same number to two structures.

WHAT IT COSTS, SAID PLAINLY. One Drive read and one post per unnumbered sibling. For the ordinary
case ahead — a cell with one bare lysosome, a second being added — that is one of each. For
Hesham's cell it is seven, once. A read that fails is logged and skipped: the save itself has
already happened, and one structure left unnumbered is recoverable.

Check: organellenumberingcheck.js, written first; 7 of its assertions failed before this went in.
Run: python3 src/a_cells_organelles_of_a_kind_are_numbered.py, then python3 src/build_stamps.py,
then python3 wjump-build/build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracingcard.js", [
 # ── 1. the count, and the one allocator ──────────────────────────────────────────────────────
 (u"the next number counts the cell's structures",
  u"""function tracingNextIndex(kind, label, nuc, root){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  var top = 0;
  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");""",
  u"""/* ── WHICH KINDS CARRY A NUMBER ───────────────────────────────────────────────  2026-09-27
   A cell has one whole cell and one nucleus, so a number on those is noise. Under `other` the user
   typed the name and it is the identifier they chose. Every ontology organelle kind can occur many
   times on one cell, and the number is how they are told apart — so it is always given, from the
   first one. See src/a_cells_organelles_of_a_kind_are_numbered.py. */
function tracingKindNumbered(kind){
  var k = String(kind || "");
  return !!k && k !== "cell" && k !== "nucleus" && k !== "other";
}
/* ── THE ONE ALLOCATOR ────────────────────────────────────────────────────────  2026-09-27
   This cell's structures of this kind that carry NO number, oldest first, each paired with the
   number it is owed — the lowest that no numbered sibling already has.

   Asked by BOTH consumers: the card, for a bare structure that happens to be open on the pad, and
   tracingNumberBare, for the ones that are not. Two allocators would hand the same number to two
   structures, which is the mistake the last four days were made of. */
function tracingBareOf(kind, label, nuc, root){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  if (!tracingKindNumbered(wantK)) return [];
  var bare = [], taken = {};
  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");
    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = (nuc && String(t.nucleusId || "") === String(nuc))
                || (root && String(t.rootId || "") === String(root));
    if (!same || !sameCell) return;
    var n = Math.round(Number(t.instanceIndex) || 0);
    if (n > 0) taken[n] = 1; else bare.push(t);
  });
  /* Oldest first, so 1 is the one that was drawn first and the numbering is stable. */
  bare.sort(function(a, b){
    return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
  });
  var out = [], n = 1;
  bare.forEach(function(row){
    while (taken[n]) n++;
    out.push({ row: row, index: n }); taken[n] = 1;
  });
  return out;
}
/* The number a bare published structure is owed, or 0 if it is not one. */
function tracingBareNumberFor(id, kind, label, nuc, root){
  var list = tracingBareOf(kind, label, nuc, root), want = String(id || "");
  for (var i = 0; i < list.length; i++)
    if (String(list[i].row.structureId || "") === want) return list[i].index;
  return 0;
}
function tracingNextIndex(kind, label, nuc, root){
  var wantK = String(kind || ""), wantL = tracingSeriesLabel(label);
  var top = 0, have = 0;
  (TRACING_SHARED || []).forEach(function(t){
    if (!t) return;
    var k = String(t.instanceOf || t.kind || "");"""),

 (u"...and counts the ones carrying no number too",
  u"""    if (same && sameCell && Number(t.instanceIndex) > top) top = Number(t.instanceIndex);
  });
  return top + 1;
}""",
  u"""    if (same && sameCell){
      have++;
      if (Number(t.instanceIndex) > top) top = Number(t.instanceIndex);
    }
  });
  /* ── HOW MANY IT HAS, NOT THE HIGHEST IT CARRIES ──────────────────────────────  2026-09-27
     This returned top+1, and a structure saved on its own submits no instanceIndex at all — so a
     cell with seven unnumbered lysosomes answered 1, and the eighth was named "Lysosome" like the
     rest. Measured on Hesham's cell. Both terms are kept: a cell with one numbered 5 and nothing
     else must still answer 6. */
  return Math.max(top, have) + 1;
}"""),

 # ── 2. an organelle kind is numbered from the first one ──────────────────────────────────────
 (u"an organelle kind is always numbered",
  u"""      const n=(taken[k]||0); taken[k]=n+1;
      index=first[k]+n;
      several=(count[k]>1)||(first[k]>1);""",
  u"""      const n=(taken[k]||0); taken[k]=n+1;
      index=first[k]+n;
      /* ALWAYS, for a kind a cell can have many of (2026-09-27). It was `(count>1)||(first>1)`,
         which left a cell's FIRST lysosome bare — and a bare one submits no number, so the next one
         asked "what is the highest number here" and got 0, and stayed bare too. Søren: "if you add
         another lysosome to a cell that already has a lysosome they both get a number". */
      several=(count[k]>1)||(first[k]>1)||tracingKindNumbered(g.w.kind);"""),

 (u"...and a bare one already published takes the number it is owed",
  u"""    if(known[g.inst]){
      index=mine;""",
  u"""    if(known[g.inst]){
      index=mine;
      /* IT WAS PUBLISHED WITHOUT A NUMBER AND IS OWED ONE (2026-09-27). Through the same allocator
         the siblings that are NOT on the pad go through, so its position in the cell's order is its
         own and no number is handed out twice. */
      if(!index&&tracingKindNumbered(g.w.kind))
        index=tracingBareNumberFor(idOf(g),g.w.kind,g.w.name,nid,rid);"""),

 (u"...which is what decides whether it shows one",
  u"""         the same object look like a different one. With none it keeps none, which is the case that
         was being renumbered.
""",
  u"""         the same object look like a different one. With none, it is given the one it is owed
         (2026-09-27) — and only a kind a cell has many of is owed one at all.
"""),

 (u"...and the number it has is what decides it",
  u"""      several=(mine>0);
    } else {""",
  u"""      several=(index>0);
    } else {"""),

 (u"...and what this browser has kept but not yet shared",
  u"""  return Math.max(top, have) + 1;""",
  u"""  /* ── AND WHAT THIS BROWSER HAS KEPT BUT NOT YET SHARED ──────────────  2026-09-27
     Found by idcollisioncheck.js, whose fixture has an empty published index on purpose: three
     lysosomes saved in three pad sessions all came back "Lysosome 1", because nothing had reached
     the dataset for the count to find. That is not only a fixture — this card works signed out by
     design and the published index can be a minute stale, so the same thing happens offline.
     Counted by id, so a structure in both lists counts once. */
  (TRACINGS_KEPT || []).forEach(function(t){
    if (!t || !t.id || seen[String(t.id)]) return;
    var k = String(t.instance_of || t.kind || "");
    var same = (k === wantK) && (wantK !== "other" || tracingSeriesLabel(t.name) === wantL);
    var sameCell = (nuc && String(t.nucleus_id || "") === String(nuc))
                || (root && String(t.root_id || "") === String(root));
    if (!same || !sameCell) return;
    have++;
    if (Number(t.instance_index) > top) top = Number(t.instance_index);
  });
  return Math.max(top, have) + 1;"""),

 (u"...and the published ones are remembered by id",
  u"""    if (same && sameCell){
      have++;
      if (Number(t.instanceIndex) > top) top = Number(t.instanceIndex);
    }
  });""",
  u"""    if (same && sameCell){
      have++;
      seen[String(t.structureId || "")] = 1;
      if (Number(t.instanceIndex) > top) top = Number(t.instanceIndex);
    }
  });"""),

 (u"...with somewhere to remember them",
  u"""  var top = 0, have = 0;
  (TRACING_SHARED || []).forEach(function(t){""",
  u"""  var top = 0, have = 0, seen = {};
  (TRACING_SHARED || []).forEach(function(t){"""),

 # ── 3. and the siblings that are not on the pad ──────────────────────────────────────────────
 (u"the siblings already saved are numbered too",
  u"""/* ── ADDING A TRACING IS SHARING IT ─────────────────────────────────────────────  2026-09-17""",
  u"""/* ── AND THE SIBLINGS THAT ARE NOT ON THE PAD ─────────────────────────────────  2026-09-27
   Søren, asked whether these should be numbered on the save or on a press: "Automatically, on the
   save." So each unnumbered sibling of a kind just saved is fetched, renamed and re-submitted: one
   version each, a name-only change, and the card says how many rows it wrote.

   ONE DRIVE READ AND ONE POST EACH. For the ordinary case ahead — a cell with one bare lysosome and
   a second being added — that is one of each. For Hesham's seven it is seven, once. A read that
   fails is logged and skipped: the save has already happened, and a structure left unnumbered is
   recoverable, while a save that threw would not be.

   `skip` is the ids handled on the pad, which took their numbers from the same allocator.
   See src/a_cells_organelles_of_a_kind_are_numbered.py. */
async function tracingNumberBare(kind, label, nuc, root, skip){
  var list = tracingBareOf(kind, label, nuc, root);
  var mine = list.filter(function(e){
    return (skip || []).indexOf(String(e.row.structureId || "")) < 0;
  });
  if (!mine.length) return 0;
  var done = 0;
  for (var i = 0; i < mine.length; i++){
    var row = mine[i].row, idx = mine[i].index;
    try {
      var got = await tracingFetchShared(String(row.structureId));
      var st = got.st;
      var base = String(st.name || row.name || "").replace(/\\s+\\d+$/, "").trim();
      var nt = { id: st.structureId,
                 name: UJ.tracing.instanceName(base, idx, true),
                 kind: st.kind || row.kind || "",
                 type: st.cellType || row.cellType || "traced",
                 color: st.color || row.color || "#3a6b5a",
                 /* EVERYONE WHO DREW ON IT, not whoever pressed Add: a rename is not authorship. */
                 traced_by: (st.contributors && st.contributors.length)
                              ? st.contributors.join(", ") : (st.tracedBy || row.tracedBy || ""),
                 rings: st.rings,
                 instance_index: idx,
                 instance_of: st.instanceOf || st.kind || row.kind || "",
                 nucleus_id: st.nucleusId || "", root_id: st.rootId || "",
                 cell_coord: st.cellCoord || "",
                 volume_um3: st.volumeUm3, volume_method: st.volumeMethod };
      if (tracingPublish(nt, true)){
        done++;
        /* The index in hand is now stale, and the next save reads it — so it is told, rather than
           re-fetched, and a second save numbers nothing. */
        row.name = nt.name;
        row.instanceIndex = String(idx);
        row.instanceOf = nt.instance_of;
      }
    } catch (e){
      console.warn("[uJump tracing] could not number " + row.structureId, e && e.message);
    }
  }
  return done;
}
/* Every numbered kind in one save, and one sentence about what it wrote. */
function tracingNumberBareAfter(all){
  try {
    if (!all || !all.length) return;
    var nuc = String(all[0].nucleus_id || ""), root = String(all[0].root_id || "");
    var ids = all.map(function(t){ return String(t.id || ""); });
    var kinds = {};
    all.forEach(function(t){ if (tracingKindNumbered(t.kind)) kinds[String(t.kind)] = t.name; });
    var todo = Object.keys(kinds);
    if (!todo.length) return;
    todo.reduce(function(chain, k){
      return chain.then(function(n){
        return Promise.resolve(tracingNumberBare(k, kinds[k], nuc, root, ids))
                 .then(function(m){ return n + m; });
      });
    }, Promise.resolve(0)).then(function(n){
      if (!n) return;
      var el = document.getElementById("tracingStatus");
      var was = el ? el.textContent : "";
      tracingSay(was + " " + n + (n === 1 ? " structure" : " structures") + " already on this cell "
        + "had no number, so " + (n === 1 ? "it was renamed" : "they were renamed") + " \\u2014 they "
        + "are numbered 1 to " + n + " now, in the order they were drawn. That is a new version of "
        + (n === 1 ? "that one" : "each of them") + " with nothing but the name changed.");
      /* The rows in hand were patched above, so the list on screen is right; the clock is
         cleared so the next real read goes to the backend rather than trusting a minute-old
         index this just changed. */
      try { TRACING_INDEX_AT = 0; } catch (_e){}
    }, function(e){ console.warn("[uJump tracing] numbering failed", e && e.message); });
  } catch (e){ console.warn("[uJump tracing] numbering failed", e && e.message); }
}

/* ── ADDING A TRACING IS SHARING IT ─────────────────────────────────────────────  2026-09-17"""),

 (u"...on every save",
  u"""     +(all.length===1?'its':'their')+' own.');
  tracingFlushSoon();""",
  u"""     +(all.length===1?'its':'their')+' own.');
  /* After the card's own sentence, because it appends to it (2026-09-27). */
  tracingNumberBareAfter(all);
  tracingFlushSoon();"""),
])
print("\nNow: python3 src/build_stamps.py, then python3 wjump-build/build_wjump.py")
