"""Points are working too: a letter means contributed, not "filed a report".         2026-09-09

Søren, looking at his own row on the new board -- µ β π λ δ η, no χ and no ω:
*"Why am I not attributed xJump and wJump points? Are they not included?"*

MEASURED, live, before changing anything:

    ?leaderboard=1&ds=xjump  ->  {"handle":"Søren Grubb","points":570.3,"reports":0}
    ?leaderboard=1&ds=wjump  ->  {"handle":"Søren Grubb","points":1987,"reports":0}

So: the POINTS are included -- both pooling and the endpoint add `points` unconditionally, and
those 2,557 are inside the 4,312 on his row. What is missing is the two LETTERS, and the reason is
a rule I wrote yesterday and justified in a comment:

    if (rep > 0) { ...push the dataset... }
    "A dataset row with no reports is not a tool the person has 'reported in', and drawing its
     letter would claim they had."

That reasoning was about a stray computed-volume row. It is wrong about χJump and ωJump, whose
whole contribution model is not a classic report: their work goes through their own state stores
(?xjumpState=1 / ?wjumpState=1), earns points through the points index, and shows up in
aggregateAll()'s `reports` tally as zero. A reports-only gate therefore hides exactly the two tools
that do not file reports -- 1,987 points of ωJump work, invisible.

So the letter means WORKED IN, not FILED A REPORT IN: points or reports, either one. The narrow
case the old rule was protecting against -- a single 0.1-point computed volume earning a letter --
is a fair thing to show anyway: he did work there, and the letter's tooltip says how much.

Fixed in BOTH places, because they are the same rule twice: the page's pooling fallback, and the
`?combinedLeaderboard=1` endpoint, which would have reproduced the bug the moment it was deployed.

Run: python3 src/points_are_working_too.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGE = [
    ('''            var p=Number(u.points)||0,rep=Number(u.reports)||0;
            e.points+=p;e.reports+=rep;
            /* A tool where somebody has points but no reports (a computed volume, say) is not one
               they have "reported in", and drawing its letter would claim they had. */
            if(rep>0){
              if(!e.perDataset.hasOwnProperty(ds))e.datasets.push(ds);
              e.perDataset[ds]=(e.perDataset[ds]||0)+p;
            }''',
     '''            var p=Number(u.points)||0,rep=Number(u.reports)||0;
            e.points+=p;e.reports+=rep;
            /* POINTS OR REPORTS. This read `rep>0` for a day, with a comment arguing that a tool
               where somebody has points but no reports is not one they have "reported in" --
               which is true and is the wrong question. Søren, 2026-09-09: "Why am I not attributed
               xJump and wJump points?" Measured: χJump 570.3 points / 0 reports, ωJump 1987 / 0.
               Their work goes through their own state stores rather than the report sheets, earns
               points through the points index, and lands in aggregateAll()'s report tally as zero
               -- so a reports-only gate hid exactly the two tools whose contribution model is not
               a report. The points were always in the total; only the letters were missing.

               The case the old rule guarded against -- one 0.1-point computed volume earning a
               letter -- is worth showing anyway: that is work done in that tool, and the letter's
               own tooltip says how much. */
            if(rep>0||p>0){
              if(!e.perDataset.hasOwnProperty(ds))e.datasets.push(ds);
              e.perDataset[ds]=(e.perDataset[ds]||0)+p;
            }''',
     "the page draws a letter for points too"),
]

BACKEND = [
    ('''    /* A dataset row exists for anybody the rebuild saw; a row with no reports in it is not a tool
       the person has "reported in", and drawing its letter would claim they had. */
    if (ds && reps > 0) {''',
     '''    /* POINTS OR REPORTS -- see the same fix in index.html's pooling fallback. A dataset row
       exists for anybody the rebuild saw, and a row with points but no reports is still a tool the
       person has worked in: χJump and ωJump earn points through their own state stores and report
       zero "reports" (measured 2026-09-09: 570.3/0 and 1987/0), so a reports-only gate would hide
       exactly those two the moment this endpoint went live. */
    if (ds && (reps > 0 || pts > 0)) {''',
     "and so does the endpoint"),
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


edit("index.html", PAGE)
edit("backend/Datasets.gs", BACKEND)
print("\nnow: node indexboardcheck.js")
