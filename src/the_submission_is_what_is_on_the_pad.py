# -*- coding: utf-8 -*-
u"""The submission is what is on the pad.                                                2026-10-05

Søren: *"I added a whole cell mesh to the [nucleus's tracing] and started drawing it. I saved it as
a draft, that was fine, it saw the whole cell and nucleus. However, as soon as I added it to the
dataset, the whole cell mesh disappeared."*

IT NEVER LEFT THE BROWSER. `TRACING_PENDING` -- the thing "Add it to the dataset" and the
Neuroglancer link are both built from -- is written at five moments: a pasted link, a resumed draft,
either "Open in the pad", and "Use these contours". It is not written when a contour is drawn.
`padRings()` runs after every close, every delete and every reload of a section, and refreshes the
preview, the volume, the Drawing strip, the 3D view and the DRAFT. Not that.

So a tracing opened for editing and then drawn on submits the contours it was opened with, under the
id it was opened with. The draft is right, because draftNow() reads the pad. The dataset gets the old
geometry back with a new timestamp, which is why nothing refused it: the 4 October geometry guard
compares a submission against OTHER structures, and this one matched only itself.

MEASURED, not inferred. nucleus_1790886647285_qf2's Drive file holds contours at x 426 000-427 600,
y 220 100-220 900 -- nucleus 38762771's neighbourhood -- while its row says nucleus 61360735, whose
centre is 401085, 230736, 380. Both versions of it are at the same place, and the sheet's own
measured-centre column has read 426807, 220539, 2017 since 1 October. Nucleus 61360735 has never had
a tracing in the dataset.

THE PAD IS THE TRUTH WHEN THERE IS A PAD, which this file already says in another place: the
link reader at tracingRead() refuses to clear the per-structure colours and types "only when the pad
is not holding contours of its own -- those numbers are the PAD'S". The submission now reads the
same way. A tracing read from a pasted link keeps its own rings (it carries `groups`, which a pad
never does), and a pad with nothing on it still gets the "press Use these contours" gate, because
that gate is about having decided, not about where the contours are.

AND THE SECOND HALF, which is the same confusion one level up: with "name each one separately" off,
tracingKindFor() answers for EVERY structure out of the single #tracingWhat box. A pad holding a
nucleus and a whole cell files both as whatever that box says -- both "Whole cell" on the 4th, both
"Nucleus" on the 5th. So the rows now turn themselves on the moment a second structure appears,
seeded with what the box says, and the pad says so. The submission refuses as a backstop if it ever
finds two structures still sharing one box.

Checks: padtwokindscheck.js (new) -- both halves, red first.
Run: python3 src/the_submission_is_what_is_on_the_pad.py
     python3 src/build_stamps.py
     node padtwokindscheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old)
        assert n == 1, "@NM@ (@F@): @N@".replace("@NM@", name).replace("@F@", os.path.basename(P)).replace("@N@", str(n))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracingcard.js", [

 (u"the submission reads the pad",
  u"""function tracingCurrentAll(){
  /* IT SAYS SO NOW, 2026-09-19.""",
  u"""function tracingCurrentAll(){
  /* ── WHAT IS ON THE PAD, NOT WHAT WAS ON IT WHEN IT OPENED ─────────────  2026-10-05
     Søren: *"as soon as I added it to the dataset, the whole cell mesh disappeared."* It never
     left the browser. TRACING_PENDING is written by a pasted link, a resumed draft, either "Open in
     the pad" and "Use these contours" — and by nothing that draws. padRings() refreshes the
     preview, the volume, the strip, the 3D view and the draft, and left this alone, so a tracing
     opened for editing and drawn on submitted the contours it was opened with, under the id it was
     opened with. Nothing refused it, because the 4 October geometry guard compares a submission
     against OTHER structures and this one matched only itself.

     THE PAD IS THE TRUTH WHEN THERE IS A PAD. This file already says so where the link reader
     declines to clear the per-structure colours and types — "those numbers are the PAD'S". A
     tracing read from a link carries `groups`, which a pad never does, and keeps its own rings. An
     empty TRACING_PENDING still meets the gate below, because that gate is about having decided,
     not about where the contours are. */
  if (PAD && (PAD.rings || []).length && TRACING_PENDING && !TRACING_PENDING.groups){
    try { TRACING_PENDING.rings = UJ.tracepad.toRings(PAD); } catch (_e0){}
  }
  /* ── AND TWO STRUCTURES ARE TWO KINDS ──────────────────────────  2026-10-05
     With the tick off, tracingKindFor() answers for every structure out of the one box, so a pad
     holding a nucleus and a whole cell filed both as whatever it said. tracingEachAuto() turns the
     rows on the moment a second structure appears, so in ordinary use this never fires; it is here
     because the thing it prevents costs an evening. */
  if (tracingEachAuto(true)) return [];
  /* IT SAYS SO NOW, 2026-09-19."""),

 (u"a second structure turns the rows on",
  u"""function tracingSeedKinds(){""",
  '/* ── A SECOND STRUCTURE TURNS THE ROWS ON ───────────────────────  2026-10-05\n   Søren, two days running: *"it says 2x whole cell mesh"*, and then *"the whole cell mesh\n   disappeared and the nucleus... became the same as the other cell\'s nucleus"*.\n\n   ONE BOX FOR THE WHOLE PAD. With "name each one separately" off, tracingKindFor(inst) falls back to\n   the single #tracingWhat select for every structure, so a pad holding a nucleus and a whole cell\n   files both as whatever that box happens to say — both "Whole cell" on the 4th, both "Nucleus"\n   on the 5th. Nothing warned, because one box is a perfectly good answer for a pad holding one\n   structure and nothing asked how many it held.\n\n   So the rows turn themselves on. Seeded through tracingSeedKinds(), which is what the tick does by\n   hand, so every structure starts as what they all already were and the person changes the ones that\n   are something else — on screen, before anything is sent, which is the whole point of the rows.\n\n   `gate` is the submission asking rather than the pad telling: it returns true when it had to turn\n   them on at that moment, and the press is refused once so the rows are read before they are used. */\nfunction tracingEachAuto(gate){\n  const each = document.getElementById("tracingEachOwn");\n  if (!each || each.checked) return false;\n  let insts = [];\n  try {\n    insts = UJ.tracepad.instances(PAD).filter(function(i){ return i.contours; })\n                                      .map(function(i){ return i.inst || 0; });\n  } catch (_e){ return false; }\n  if (insts.length < 2) return false;\n  /* ── ONLY WHERE A KIND IS ALREADY DECIDED ────────────────────────────────────────────────\n     Two lysosomes drawn on a fresh pad are two structures of one kind, and the single box is the\n     right answer for both -- turning the rows on there changes nothing and renumbers them, which\n     tracingpanelcheck.js said in four assertions the first time this fired on every pad.\n\n     The case that costs an evening is narrower and has a mark on it: a tracing OPENED from the\n     dataset already has a published kind, and anything drawn beside it is something else, because\n     a cell has one nucleus and one whole cell. PAD_EDIT_IDS names the opened ones. */\n  const opened = insts.filter(function(k){\n    return (typeof PAD_EDIT_IDS !== "undefined") && PAD_EDIT_IDS[String(k)];\n  });\n  if (!opened.length || opened.length === insts.length) return false;\n  each.checked = true;\n  /* SEEDED WITHOUT DISTURBING WHAT IS ALREADY DECIDED -- tracingSeedKinds() lets the box win, which\n     is right for the tick pressed by hand and wrong here: the box describes the structure being\n     drawn NOW, and the opened one\'s kind came off the sheet. */\n  const w = tracingWhat(), what = document.getElementById("tracingWhat");\n  insts.forEach(function(k){\n    if (PAD_INST_KIND[String(k)]) return;\n    PAD_INST_KIND[String(k)] = { value: what ? what.value : "", kind: w.kind, name: w.name };\n  });\n  try { tracingEachRender(true); } catch (_e2){}\n  const msg = "There are " + insts.length + " structures on the pad and one of them came from the "\n    + "dataset, so each now has its own row — type, colour and name. Check what the new one "\n    + "says before"\n    + (gate ? " pressing again." : " you add them.");\n  try { gate ? tracingSay(msg, true) : padSay(msg, true); } catch (_e3){}\n  return true;\n}\nfunction tracingSeedKinds(){'),

 (u"the pad calls it",
  u"""  padVolume();
  padInstances();
  tracingEachRender();      // a new structure gets a row; a deleted one loses it""",
  u"""  padVolume();
  tracingEachAuto(false);   // a second structure gets the rows, before anything can be filed as one
  padInstances();
  tracingEachRender();      // a new structure gets a row; a deleted one loses it"""),
 (u"and number one is the one that was opened",
  '    TRACING_BASE_ID = ""; TRACING_DRAFT_ID = "";\n    PAD_EDIT_ID = st.structureId; PAD_EDIT_IDS = {};\n',
  '    TRACING_BASE_ID = ""; TRACING_DRAFT_ID = "";\n    /* ── AND NUMBER ONE IS THE ONE THAT WAS OPENED ────────────────  2026-10-05\n       PAD_EDIT_IDS was emptied here while PAD_EDIT_ID was set, which editOf() reads and idOf() does\n       not need — inst 0 takes TRACING_PENDING.id, which is the same string. So it was harmless\n       and it was also the only record of WHICH number on the pad came from the dataset, which\n       tracingEachAuto() now asks for. Its kind too: a published nucleus stays a nucleus when\n       something else is drawn beside it, whatever the box at the top has moved on to saying. */\n    PAD_EDIT_ID = st.structureId; PAD_EDIT_IDS = { "0": st.structureId };\n    PAD_INST_KIND = {};\n    if (st.kind || st.name)\n      PAD_INST_KIND["0"] = { value: st.kind || "", kind: st.kind || "", name: st.name || "" };\n'),
])
print("\nNow: python3 src/build_stamps.py, then node padtwokindscheck.js")
