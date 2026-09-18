# -*- coding: utf-8 -*-
"""The "Also" comes out.                                                        2026-09-18

Søren: *"Remove 'Also' from Also log an organelle."*

"Also log an organelle here" was χJump's wording, and the "Also" was doing the work of joining this
to the identification above it -- as if logging an organelle were the second half of naming the
cell. It is not: it is its own thing you can do on this card, on a cell you have not named and may
never name, which is exactly the case the link was added for.

ONE WORDING, EVERYWHERE IT IS WRITTEN. The phrase exists in seven files because the family has two
implementations of this card (core/panel.js for the five µJump-style pages, hand-written copies in
ηJump, ωJump and χJump, plus the two demo pages), and it is the kind of string that drifts into two
wordings the moment one of them is edited alone. The generators that first wrote it are updated too,
so re-running them does not put the word back.

The HISTORICAL quotes -- the comment in core/panel.js that records what he named it, and
organcardcheck.js's header quoting the request the whole check came from -- keep the old text and
gain a note. A comment that quotes somebody should go on quoting them.

Run: python3 src/the_also_comes_out.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD = "Also log an organelle here"
NEW = "Log an organelle here"

# Pages and generators. core/panel.js is already done by hand (its historical comment needed a
# note rather than a replacement); it is listed so the count below tells the whole truth.
FILES = ["hjump.html", "wjump.html", "wjump_demo.html", "xjump.html", "xjump_demo.html",
         "src/organelle_on_every_card.py", "src/organelle_paste_everywhere.py"]

total = 0
for rel in FILES:
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    n = s.count(OLD)
    if not n:
        print("%s\n  already there: no 'Also' left" % rel)
        continue
    io.open(p, "w", encoding="utf-8").write(s.replace(OLD, NEW))
    total += n
    print("%s\n  ok: %d occurrence%s" % (rel, n, "" if n == 1 else "s"))

print("\n%d in total; core/panel.js was done by hand so its historical comment could keep the quote."
      % total)
print("now: node organcardcheck.js && python3 src/build_stamps.py")
