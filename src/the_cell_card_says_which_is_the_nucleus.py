# -*- coding: utf-8 -*-
u"""The third caller, and the one nobody told.                                           2026-10-03

Søren, with a screenshot of the cell card's 3D panel: *"I only see two buttons"*.

He did. ⟳ and ✦ were there; "show one of them" and "look at the nucleus" were not, on a panel
holding a cell AND its nucleus, which is exactly where both are supposed to appear.

THE CONTRACT HAD THREE CALLERS AND I UPDATED TWO. core/mesh3d.js's buttons ask which surface is
which by a `what` of "cell" or "nucleus", deliberately rather than by its colour — a tint is a
colour and colours get retuned. core/empreview.js and core/tracingcard.js now say so. The third
place is inside core/mesh3d.js ITSELF, in the install() path that decorates every tool's mesh
download button, and it builds its ghost like this:

    opts2.ghosts = [{ geo: ng, tint: NUC_TINT, alpha: 1 }];

No `what`, so hasBoth() answered no and the two buttons were never rendered. Silently, correctly,
and invisibly: a missing contract field reads as "there is no nucleus here", which is a perfectly
good thing for it to mean and the reason nothing failed.

AND A GUARD, because the next caller will be written the same way. mesh3dtoolscheck.js now READS
the three core files and asserts that every ghost tinted NUC_TINT also carries `what`. A
source-level assertion is a blunt instrument and it is the right one here: the failure is not a
wrong value, it is a field nobody wrote, and no amount of driving the code can see a caller that
does not exist yet.

Run: python3 src/the_cell_card_says_which_is_the_nucleus.py, then node mesh3dtoolscheck.js
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
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/mesh3d.js", [

 (u"the cell card's ghost says it is a nucleus",
  u'''                opts2.ghosts = [{ geo: ng, tint: NUC_TINT, alpha: 1 }];''',
  u'''                /* `what` IS THE CONTRACT the panel's buttons read — see hasBoth() and
                   nucleusGeo(). Without it this panel showed two buttons where it should show
                   four, and did so silently, because a missing field reads as "there is no
                   nucleus here", which is a perfectly reasonable thing for it to mean.
                   2026-10-03, from Søren: "I only see two buttons". */
                opts2.ghosts = [{ geo: ng, what: "nucleus", tint: NUC_TINT, alpha: 1 }];'''),

 (u"...and the subject says it is a cell",
  u'''            var opts2 = { lead: lead, emptyMessage: "This cell has no mesh geometry to draw." };''',
  u'''            var opts2 = { what: "cell", lead: lead,
                          emptyMessage: "This cell has no mesh geometry to draw." };'''),
])
print("\nNow: node mesh3dtoolscheck.js")
