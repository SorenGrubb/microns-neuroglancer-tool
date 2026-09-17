"""There was nowhere to go and draw.                                                  2026-09-17

Søren, on stage 1: *"I see the Trace a cell, but I don't see any link to a neuroglancer instance
anywhere where I can go and use the polygon tool to trace a cell."*

Correct, and worse than missing a button: the card told him to use a tool that does not exist
anywhere he could reach. Measured today, in a real browser, against real MICrONS data:

  - **BrainSharer's viewer (www.brainsharer.org/ng/) ignores a pasted `#!` state entirely.** It
    loaded with "Please log in" and one empty layer, and keeps its states server-side under `?id=`.
    Its polygon/volume tool is real -- it is where core/tracing.js's polygon and volume readers
    came from -- but it is not reachable with a link µJump can build, and its "start a volume
    session" needs an account.
  - **Spelunker (spelunker.cave-explorer.org) takes the state, renders minnie65 EM, and has an
    "Annotate polyline" tool -- which never reaches the link.** Drawn with 4 vertices it renders on
    screen and shows "Num vertices 4" in the selection panel, while `localAnnotations` stayed at
    length 1 and the address bar's `annotations` array never gained it. Checked twice, ending the
    polyline with Escape and with a double-click.
  - **A plain `line` annotation DOES round-trip**, immediately and reliably:
        {"pointA":[240632.19,207943.39,21359.998],"pointB":[240728.19,208002.19,21359.998],
         "type":"line","id":"e6803a43…"}
    appeared in the address bar the moment it was drawn.

So a ring of line annotations is not the fallback the card described it as -- it is THE route, and
`ringsFromLink`'s line-chaining half is the half that matters. The card now says so, and says the
thing that was probably blocking him outright: **annotations are placed with ctrl+click**, not a
plain click. A plain click with the line tool active does nothing at all.

THE BUTTON. "Open a viewer to trace in" builds the state buildState() already builds for the
coordinate on screen -- his EM/segmentation/nuclei ticks, his viewer choice -- and adds an empty
annotation layer called "tracing" with the line tool already active and the layer already selected,
in an "xy" layout because tracing happens on sections.

It STRIPS the "Cortical layers" annotation layer, and that is not tidying. Those bands are `line`
annotations in a local annotation layer, so on the way back in, ringsFromLink() with no layer name
would chain them together with his contours into rings that cross the whole dataset — and mesh,
which is this project's worst failure shape: wrong, and it still produces an object.

Closed from both ends, because he can also paste a link he built himself: ringsFromLink() now never
reads a layer called "Cortical layers" as contours, and PREFERS a layer called "tracing" when the
link has one. So the layer box stays empty in the ordinary case rather than being a name to match
by hand, and naming one explicitly still overrides everything.

Run: python3 src/a_viewer_to_trace_in.py
     node tracingcheck.js && node tracingpanelcheck.js


SUPERSEDED PAIRS REMOVED, 2026-09-17: the edits below marked here were later rewritten by another
generator, which now owns that text. The reason they were made is still this file's; the
literal is the other file's, so re-running this one is a no-op rather than a second insert.
Superseded: "the viewer button is driven in a real page"; "the button is wired"; "the card says how to trace, and offers a viewer"; "tracingOpen builds a viewer link with an empty tracing layer"
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HTML = [


]


CHECK = [
]


# JS: every pair here was superseded by a later generator, which now owns that text.
# Kept as an empty list so this file still runs as the no-op it has become; the reason for
# the change is in the docstring above, and the literal is the other generator's.
JS = []

# TRACING: every pair here was superseded by a later generator, which now owns that text.
# Kept as an empty list so this file still runs as the no-op it has become; the reason for
# the change is in the docstring above, and the literal is the other generator's.
TRACING = []

# PANELCHECK: its one pair was superseded by a later generator, which now owns that text.
# Kept as an empty list so this file still runs as the no-op it has become.
PANELCHECK = []

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


edit("core/tracing.js", TRACING)
edit("ujump.html", HTML + JS)
edit("tracingcheck.js", CHECK)
edit("tracingpanelcheck.js", PANELCHECK)
print("\nnow: node tracingcheck.js && node tracingpanelcheck.js")
