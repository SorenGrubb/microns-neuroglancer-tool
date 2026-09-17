"""The page writes TRACINGS too — and a check that would have said so.               2026-09-16

Found while wiring stage 1, not by a report, and it would have broken every real export.

`core/blenderexport.js` carries the tested notebook verbatim and REPLACES exactly one cell: the one
tagged "params". Section 4b, added on 2026-09-16, reads `TRACINGS`. The notebook's own params cell
defines `TRACINGS = []`; the page's replacement did not define it at all. So:

    NameError: name 'TRACINGS' is not defined

on the first run of every notebook the panel writes. `tracedscenecheck.py` never saw it — it
supplies TRACINGS in its own namespace — and `notebookcheck.py` never saw it either, because its
"the params cell covers every capitalised global" assertion runs over the NOTEBOOK's params cell,
which is the one that was already right.

This is the exact shape of the vasculature bug that assertion was written for: *"core/
blenderexport.js REPLACES the params cell when the panel writes a notebook, and for one delivery
its replacement did not carry VASC / VASC_IDS / VASC_* at all."* Same file, same cell, same
mechanism, eleven days later. The check was in the wrong place.

TWO CHANGES

1. `paramsCell()` emits `TRACINGS`, from `opts.tracings` — the structures the page currently holds,
   in trace_mesh.py's own key names, so nothing translates them twice. Empty by default, which is
   what every export that traces nothing wants.

2. `blenderexportcheck.js` asserts that **every capitalised name the notebook's own params cell
   assigns AND another cell reads is also assigned by the page's replacement**. Needs no Python AST
   in JavaScript, and it is the invariant that actually holds: the page's cell replaces that one,
   so a name it drops is a name the rest of the notebook can no longer see. The "and another cell
   reads" half is not decoration — PALETTE is assigned in the notebook's params cell and used
   nowhere else, so requiring it would be a rule about style rather than about breakage.

Run: python3 src/the_page_writes_the_tracings_too.py
     node blenderexportcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PARAMS = [
    ('''    lines.push("VASC_IDS   = None    # None = any non-zero label; [1] = only the segment uJump selects");''',
     '''    /* ── HAND-TRACED STRUCTURES ────────────────────────────────────────────  2026-09-16
       Section 4b reads this. The NOTEBOOK's own params cell has carried `TRACINGS = []` since the
       day that section landed; THIS cell replaces that one, and for its first day it did not,
       which is a NameError on the first run of every notebook the panel writes.

       Written in trace_mesh.py's own key names -- name/type/traced_by/color/nucleus_id/rings --
       so a structure read out of the sheet by core/tracing.js goes straight in with nothing
       translating it a second time. */
    var tracings = Array.isArray(opts.tracings) ? opts.tracings : [];
    lines.push("# Cells the segmentation does not have, outlined section by section by a person.");
    lines.push("# Section 4b meshes each of these and appends it to CELLS as an ordinary cell.");
    if (!tracings.length){
      lines.push("TRACINGS = []");
    } else {
      lines.push("TRACINGS = [");
      tracings.forEach(function(t){
        lines.push("    {'name': " + pyStr(t.name || "traced")
                   + ", 'type': " + pyStr(t.type || "traced")
                   + ", 'traced_by': " + pyStr(t.traced_by || "")
                   + (t.color ? ", 'color': " + pyStr(t.color) : "")
                   + (t.nucleus_id ? ", 'nucleus_id': " + pyStr(String(t.nucleus_id)) : "")
                   + ",");
        lines.push("     'rings': [");
        (t.rings || []).forEach(function(r){
          lines.push("         {'z': " + Math.round(Number(r.z)) + ", 'points': ["
                     + (r.points || []).map(function(p){
                         return "[" + Math.round(Number(p[0])) + "," + Math.round(Number(p[1])) + "]";
                       }).join(",") + "]},");
        });
        lines.push("     ]},");
      });
      lines.push("]");
    }
    lines.push("");
    lines.push("VASC_IDS   = None    # None = any non-zero label; [1] = only the segment uJump selects");''',
     "the page's params cell carries TRACINGS"),
]

CHECK = [
    ('''console.log("\\n--- the params cell says what the panel decided ---");''',
     '''/* ── THE PAGE'S PARAMS CELL MUST NOT DROP A NAME ────────────────────────────────  2026-09-16
   The bug this is for, twice now. core/blenderexport.js REPLACES the notebook's params cell, so
   any capitalised name that cell assigned and this one does not is a name the rest of the notebook
   can no longer see -- a NameError at runtime, often inside a try, often reported as an absence.
   It cost the vasculature its vessels on 2026-09-05 and TRACINGS its whole section on 2026-09-16.

   notebookcheck.py has a cleverer version of this (a Python AST, "covers every global the other
   cells READ") and it runs over the NOTEBOOK's own params cell -- the one that was right both
   times. This is the same idea pointed at the replacement, where the mistakes actually happen. */
console.log("\\n--- the page's params cell drops no name the notebook's own defines ---");
{
  const shipped = JSON.parse(fs.readFileSync("blender/ujump_blender_scene.ipynb", "utf8"));
  const own = text(shipped.cells.find(c => c.metadata && c.metadata.ujump === "params"));
  const mine = text(nb.cells.find(c => c.metadata && c.metadata.ujump === "params"));
  const assigned = (src) => {
    const out = new Set();
    src.split("\\n").forEach(l => {
      const m = /^([A-Z][A-Z0-9_]*)\\s*=[^=]/.exec(l);
      if (m) out.add(m[1]);
    });
    return out;
  };
  /* Only the names another cell actually READS. PALETTE is assigned in the notebook's params cell
     and used nowhere but that cell -- it builds COLORS there -- so the page dropping it costs
     nothing, and requiring it would be a rule about style rather than about breakage. */
  let others = "";
  shipped.cells.forEach(c => {
    if (c.cell_type === "code" && !(c.metadata && c.metadata.ujump === "params"))
      others += "\\n" + text(c);
  });
  const a = assigned(own), b = assigned(mine);
  const needed = [...a].filter(n => new RegExp("\\\\b" + n + "\\\\b").test(others));
  const missing = needed.filter(n => !b.has(n)).sort();
  ok("every name the notebook's params cell assigns AND another cell reads, the page assigns too",
     missing.length === 0,
     missing.length ? missing.join(", ") + " \\u2014 a NameError waiting in Colab"
                    : needed.length + " names read elsewhere, all present");
}

console.log("\\n--- the params cell says what the panel decided ---");''',
     "the check compares the two params cells name for name"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("src/core_blenderexport.py", PARAMS)
edit("blenderexportcheck.js", CHECK)
print("\nnow: python3 src/core_blenderexport.py   and   node blenderexportcheck.js")
