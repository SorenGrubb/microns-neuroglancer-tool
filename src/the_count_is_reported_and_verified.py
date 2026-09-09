"""The organelle count is reported AND verified.                                     2026-09-09

Søren: *"I still don't get why there is only 1 NR type II in the organelles, if that is because it
only shows the ones that are reported, then that should be changed to reported and verified. I know
that there are many of them."*

He is right, and this morning's answer was only half of it. The backend really does hold exactly one
`nucleoplasmic_reticulum_2` report -- 222 organelle rows in total, 171 centriole, 50 cilium, 1 NR-II.
What I did not check was whether the page holds any of its own. It does:

    ORGANDATA.HOLES   -- ~190 astrocytes, each with astrocyte-hole endpoint pairs. The comment on
                         it says so outright: "Microglia-plug / astrocyte-hole (NR type II)
                         locations, embedded directly (2026-08-07, Søren ... 'Can we just get
                         those organelles into µJump so that we can make graphs of them')".
    ORGANDATA.PLUGS   -- the microglia plugs from the same import.

Both are keyed by nucdata index, both are own-verified, and both are already read everywhere else
that matters -- the Excel export (organelleInstancesForRow), the Neuroglancer point layers, the
cell panel's own "N astrocyte holes (NR type II) reported" line. The one place that never learned
about them is the COUNT beside the filter checkbox, which tallies centriole and cilium densely and
everything else from the community map alone. So a page that can draw two hundred astrocyte holes
was telling him it knew of one.

WHAT THE NUMBER MEANS, still: cells, not organelles (see the tooltip added this morning). A cell
carrying both an embedded hole and a community NR-II report counts once -- the dense pass records
which nucleus ids it has claimed and the sparse pass skips them, the same way centriole and cilium
have always been skipped.

Guarded by `typeof ORGANDATA`, because this snapshot is µJump's: it came from "All own data.xlsx"
and is minnie65 nucdata indices. δJump and πJump have no such block and are unchanged, which is the
honest answer for them -- nobody has reported an NR-II in V1DD or pinky100 either.

Run: python3 src/the_count_is_reported_and_verified.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["ujump.html", "djump.html", "pjump.html"]

COUNTS = [
    ('''    counts.centriole=cent; counts.cilium=cil;
    /* Sparse, from the community map: one count per CELL that carries the kind, not per report,
       so two cilia logged on one cell count once -- otherwise the number beside the checkbox
       would not be the number of cells the filter can return, which is what a user reads it as. */
    if(orgMap){
      Object.keys(orgMap).forEach(function(nid){
        const seen={};
        (orgMap[nid]||[]).forEach(function(o){
          const k=String(o.kind||"").toLowerCase();
          if(!k||seen[k])return; seen[k]=1;
          if(k==="centriole"||k==="cilium")return;   // already counted densely above
          counts[k]=(counts[k]||0)+1;
        });
      });
    }
    return counts;''',
     '''    counts.centriole=cent; counts.cilium=cil;
    /* ── ALSO DENSE, AND ALSO OWN-VERIFIED: the embedded plug/hole snapshot ────────  2026-09-09
       Søren: "I still don't get why there is only 1 NR type II ... if that is because it only shows
       the ones that are reported, then that should be changed to reported and verified. I know
       that there are many of them."

       He is right and the backend is also right: there is exactly ONE community report of an NR-II.
       What this function never knew is that the page carries its own, own-verified, dense set --
       ORGANDATA.HOLES (astrocyte holes = NR type II) and ORGANDATA.PLUGS (microglia plugs),
       embedded on 2026-08-07 precisely so these organelles would be usable without a backend round
       trip. Every other reader of them already exists: the Excel export, the Neuroglancer point
       layers, the cell panel's own "N astrocyte holes (NR type II) reported" line. Only the number
       beside the checkbox was still counting reports alone, on a page that can draw two hundred.

       Keyed by nucdata INDEX (the same key space as cildata's OV_IDX), so the nucleus id has to be
       looked up to dedupe against the community map below. typeof-guarded because this snapshot is
       µJump's -- minnie65 indices out of "All own data.xlsx"; the other datasets have no such
       block, and zero is the honest answer for them. */
    const denseCells={};
    (function(){
      if(typeof ORGANDATA==="undefined"||!ORGANDATA)return;
      const fromMap=function(kind,map){
        if(!map)return;
        let n=0;
        Object.keys(map).forEach(function(idx){
          const v=map[idx];
          if(!v||!v.length)return;
          n++;
          const nid=String((typeof NID!=="undefined"&&NID[Number(idx)])||"");
          if(nid)(denseCells[kind]=denseCells[kind]||{})[nid]=1;
        });
        if(n)counts[kind]=(counts[kind]||0)+n;
      };
      fromMap("microglia_plug",ORGANDATA.PLUGS);
      fromMap("nucleoplasmic_reticulum_2",ORGANDATA.HOLES);
    })();
    /* Sparse, from the community map: one count per CELL that carries the kind, not per report,
       so two cilia logged on one cell count once -- otherwise the number beside the checkbox
       would not be the number of cells the filter can return, which is what a user reads it as. */
    if(orgMap){
      Object.keys(orgMap).forEach(function(nid){
        const seen={};
        (orgMap[nid]||[]).forEach(function(o){
          const k=String(o.kind||"").toLowerCase();
          if(!k||seen[k])return; seen[k]=1;
          if(k==="centriole"||k==="cilium")return;   // already counted densely above
          /* ...and so is a cell the embedded snapshot already claimed for this kind. Without this
             an astrocyte with both an embedded hole and somebody's NR-II report would count twice,
             and the number would stop being "cells this filter can return". */
          if(denseCells[k]&&denseCells[k][String(nid)])return;
          counts[k]=(counts[k]||0)+1;
        });
      });
    }
    return counts;''',
     "the embedded own-verified organelles are counted"),
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
    edit(page, COUNTS)
print("\nnow: node organellecountcheck.js")
