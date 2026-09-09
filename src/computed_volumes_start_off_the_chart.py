"""Computed volumes start off the cumulative chart.                                  2026-09-09

Søren: *"I would like for this graph that it was default that computed volumes are disabled, so that
you can add them by clicking but they don't show by default."*

"Cumulative community reports over time" stacks every report type, and computed volumes are the one
band that is not really a community judgement -- a volume is a button press over geometry that was
already there, worth 0.1 points against 4 for an identification, and it stacks like anything else.
On a stacked area that inflates every band above it and makes the shape of the actual identification
work harder to read.

Plotly has exactly the right state for this and it is not `visible:false`: `visible:"legendonly"`
draws the legend entry, greyed, and leaves the trace clickable -- so it is off, and one click puts
it back. Off-by-default that cannot be turned on would be hiding data; this is a starting position.

Matched case-insensitively rather than by an exact string, because the series name is a sheet name
coming back from Apps Script and a sheet is a thing somebody can rename in a spreadsheet.

The sub-heading says so too. A chart that quietly omits a category it also lists in its own
description is worse than one that never mentioned it.

Run: python3 src/computed_volumes_start_off_the_chart.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

PAIRS = [
    ('''  const traces=Array.from(allTypes).map(function(t){
    return {type:"scatter",mode:"lines",name:t,x:dates,y:cumByType[t],
      line:{color:colorFor(t),width:2},stackgroup:"one"};
  });''',
     '''  const traces=Array.from(allTypes).map(function(t){
    /* ── COMPUTED VOLUMES START OFF ───────────────────────────────────────────────  2026-09-09
       Søren: "I would like for this graph that it was default that computed volumes are disabled,
       so that you can add them by clicking but they don't show by default."

       "legendonly", not visible:false -- the legend entry stays, greyed and clickable, so this is
       a starting position rather than hidden data. One click puts the band back.

       Why this band: a computed volume is a button press over geometry that was already there
       (0.1 points, against 4 for an identification), and on a STACKED area it lifts every series
       above it, which makes the shape of the identification work harder to read.

       Case-insensitive rather than an exact match: the series name is a sheet name arriving from
       Apps Script, and a sheet is a thing somebody can rename in a spreadsheet. */
    const off=/computed volumes/i.test(t);
    return {type:"scatter",mode:"lines",name:t,x:dates,y:cumByType[t],
      visible:off?"legendonly":true,
      line:{color:colorFor(t),width:2},stackgroup:"one"};
  });''',
     "computed volumes start as a legend entry, not a band"),

    ('''root-ID proposals/votes, computed volumes), cumulative by day. LIVE.''',
     '''root-ID proposals/votes, computed volumes), cumulative by day. Computed volumes start hidden &mdash; click them in the legend to stack them in. LIVE.''',
     "...and the description says so"),
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


for page in PAGES:
    edit(page, PAIRS)
print("\nnow: node overtimecheck.js")
