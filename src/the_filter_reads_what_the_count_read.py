"""The filter reads what the count reads.                                            2026-09-10

Søren: *"In uJump, when I filter for astrocytes near the glia limitans, I can see that they have NR
type II in many of them, but if I tick this box, it finds 0 results. Why?"*

Because I fixed half of it yesterday. His screenshot shows the panel saying

    NUCLEOPLASMIC RETICULUM (TYPE II)   191

which is the fix from 2026-09-09: the COUNT learned to read ORGANDATA.HOLES, the embedded
own-verified astrocyte-hole snapshot, on top of the community reports. The MATCHER did not:

    const hasOne = k => k==="centriole" ? hasCent
                      : k==="cilium"    ? hasCil
                      : !!(orgReports && orgReports.some(o => o.kind===k));

Two dense sources named by hand, and NR type II is not one of them -- so every other kind fell
through to window.ORG_MAP, the community map, which holds exactly ONE nucleoplasmic-reticulum-II
report in the whole dataset. 191 on the label, 1 findable, 0 once his other filters applied.

That is precisely the failure the count's own tooltip promises cannot happen -- "the number beside a
checkbox has to be the number of cells the filter can return, or it is lying about the filter it
sits on". It was lying, and I wrote both halves.

So the matcher asks the same question the counter asks, from the same four places: hasCent and
hasCil (dense, own-verified, per row and already computed above), ORGANDATA.HOLES and
ORGANDATA.PLUGS (dense, own-verified, keyed by nucdata index), and the community map for everything
else. `denseHas()` names them once so the next kind added to one side cannot be forgotten on the
other.

The "any structure at all" case -- ticking nothing and asking for annotated cells -- gets the same
two sources, for the same reason.

Guarded by `typeof ORGANDATA` and by row.space==="N": the snapshot is µJump's own (minnie65 nucdata
indices out of "All own data.xlsx"), and a standalone or merged-sub row has no index into it. δJump
and πJump have no such block and are unchanged, which is the honest answer for them.

Run: python3 src/the_filter_reads_what_the_count_read.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

MATCH = [
    ('''        /* Centriole and cilium keep reading the DENSE own-verified arrays computed just above --
           unchanged data source, unchanged behaviour for those two. Every other kind reads the
           sparse community map, where "not annotated" is far more likely to mean "nobody has
           looked" than a genuine absence, which is what the control's own wording says. */
        const orgNid=String(rowNucId(row)||"");
        const orgReports=(window.ORG_MAP&&orgNid)?window.ORG_MAP[orgNid]:null;
        const hasOne=k=>k==="centriole"?hasCent
                       :k==="cilium"?hasCil
                       :!!(orgReports&&orgReports.some(o=>o.kind===k));
        const hasKind=organelleKinds.length
          ? organelleKinds.some(hasOne)
          : (hasCent||hasCil||!!(orgReports&&orgReports.length));''',
     '''        /* ── THE MATCHER READS WHAT THE COUNTER READS ────────────────────────────────  2026-09-10
           Søren: "when I filter for astrocytes near the glia limitans, I can see that they have NR
           type II in many of them, but if I tick this box, it finds 0 results. Why?"

           Because this list named exactly two dense sources -- centriole and cilium -- and let
           every other kind fall through to the community map. On 2026-09-09 the COUNT beside the
           checkbox learned about two more (ORGANDATA.HOLES, the embedded own-verified astrocyte
           holes = NR type II, and ORGANDATA.PLUGS, the microglia plugs) and this did not. So the
           panel said 191 cells carry an NR type II while the filter could find the ONE that had
           been reported through the community form.

           Which is the exact failure the count's own tooltip rules out: the number beside a
           checkbox has to be the number of cells the filter can return. denseHas() names the four
           sources once, so a kind added to one side cannot be forgotten on the other.

           row.space!=="N" and the typeof guard: the snapshot is keyed by µJump's own nucdata index,
           and a standalone or merged-sub row has none. */
        const orgNid=String(rowNucId(row)||"");
        const orgReports=(window.ORG_MAP&&orgNid)?window.ORG_MAP[orgNid]:null;
        const denseHas=function(k){
          if(k==="centriole")return hasCent;
          if(k==="cilium")return hasCil;
          if(row.space!=="N"||typeof ORGANDATA==="undefined"||!ORGANDATA)return false;
          if(k==="nucleoplasmic_reticulum_2")
            return !!(typeof holesForNucIdx==="function"&&holesForNucIdx(row.i));
          if(k==="microglia_plug")
            return !!(typeof plugsForNucIdx==="function"&&plugsForNucIdx(row.i));
          return false;
        };
        const hasOne=k=>denseHas(k)||!!(orgReports&&orgReports.some(o=>o.kind===k));
        const hasKind=organelleKinds.length
          ? organelleKinds.some(hasOne)
          /* "Annotated with anything at all" has to see the same four sources, or ticking nothing
             would find fewer cells than ticking everything. */
          : (hasCent||hasCil||denseHas("nucleoplasmic_reticulum_2")||denseHas("microglia_plug")
             ||!!(orgReports&&orgReports.length));''',
     "the filter sees the embedded holes and plugs"),
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
    edit(page, MATCH)
print("\nnow: node organellefiltercheck.js")
