# -*- coding: utf-8 -*-
u"""A draft is named for what is on the pad, not for the box at the top.                  2026-10-05

Søren, with a pad holding a nucleus and a whole cell: *"I have starting tracing a whole cell mesh in
the same pad as a nucleus, but it says 2x whole cell mesh."*

It did. The sheet row says `2 \\u00d7 Whole cell — the cell's own mesh · Endothelial cell 61360735`, and
the pad's own list says #1 Nucleus, #2 Whole cell.

ONE BOX, MULTIPLIED. `draftTitleNow()` read the shared #tracingWhat select — which, with "name each
one separately" ticked, shows the SELECTED structure's type and nothing about the others — and then
multiplied it by how many structures had contours. Two structures, and whichever one happened to be
selected got counted twice.

The same file already knows better: `tracingKindFor(inst)` returns each structure's own kind, and
`tracingCurrentAll()` has used it to file them as separate tracings since separate naming existed.
The title was the one place still asking the box.

SO IT COUNTS KINDS, IN THE ORDER THEY WERE DRAWN. "Nucleus + Whole cell" for his pad; "2 \\u00d7
Mitochondrion + Lysosome" for three organelles of two kinds; and with separate naming OFF every
structure shares one kind, so "2 \\u00d7 Mitochondrion" comes out exactly as before.

Check: draftlistcheck.js.
Run: python3 src/a_draft_is_named_for_what_is_on_the_pad.py
     python3 src/build_stamps.py
     node draftlistcheck.js
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

 (u"a draft is named for what is on the pad",
  u"""  let what = "";
  try {
    const sel = document.getElementById("tracingWhat");
    if (sel && sel.selectedIndex >= 0) what = sel.options[sel.selectedIndex].textContent || "";
  } catch (_e){}
  if (val("tracingWhat") === "__other" && val("tracingName")) what = val("tracingName");
  let n = 0;
  try { n = UJ.tracepad.instances(PAD).filter(function(i){ return i.contours; }).length; } catch (_e2){}
  const bits = [];
  if (n > 1) bits.push(n + " \\u00d7 " + (what || "structure"));
  else if (what) bits.push(what);""",
  u"""  /* ── EVERY STRUCTURE'S OWN KIND, COUNTED ─────────────────────────────────────  2026-10-05
     Søren, with a nucleus and a whole cell on one pad: "it says 2x whole cell mesh". It did, because
     this read the shared #tracingWhat select — which with "name each one separately" ticked shows
     the SELECTED structure's type and nothing about the others — and multiplied it by how many
     structures had contours.

     tracingKindFor(inst) has returned each structure's own kind since separate naming existed, and
     tracingCurrentAll() has used it to file them as separate tracings all along. This was the one
     place still asking the box. With separate naming OFF every structure shares one kind, so the
     old "2 \\u00d7 Mitochondrion" comes out of the same arithmetic. */
  const seen = {}, order = [];
  try {
    UJ.tracepad.instances(PAD).filter(function(i){ return i.contours; }).forEach(function(i){
      const w = tracingKindFor(i.inst) || {};
      const nm = String(w.name || "").trim() || "structure";
      if (seen[nm] === undefined){ seen[nm] = 0; order.push(nm); }
      seen[nm]++;
    });
  } catch (_e2){}
  const what = order.map(function(nm){
    return (seen[nm] > 1 ? seen[nm] + " \\u00d7 " : "") + nm;
  }).join(" + ");
  const bits = [];
  if (what) bits.push(what);"""),
])
print("\nNow: python3 src/build_stamps.py, then node draftlistcheck.js")
