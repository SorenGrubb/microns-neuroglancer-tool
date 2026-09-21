# -*- coding: utf-8 -*-
u"""The ωJump card on the index says what the roster is.                              2026-09-21

Three sentences had drifted from wjump_config.js, and wjcardcheck.js (now taught BossDB, see
wjump-build/src/wjcardcheck_knows_three_sources.py) says which:

  - "29 tissues" -- 23, folding layers and areas into their organ, which is what the list beside it
    enumerates. The list names all 23 now; it left out choroid plexus, olfactory bulb, spinal cord,
    skeletal muscle and the guard hair follicle.
  - "seven tenths of the grid" -- the three millimetre-scale surveys hold 61.6%: three fifths.
  - "11,707 of them" -- 13,031, which the chip under it already said.

Run: python3 src/the_omega_card_tells_the_truth.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(HERE, "index.html"); s = io.open(p, encoding="utf-8").read(); b = s

PAIRS = [
 (u"the tissues, all of them",
  u'''thirteen from <em>BossDB</em>, across <em>six species</em> and 29 tissues: heart,
      kidney, liver, pancreas, thymus, skin, lung, duodenum, cochlea, retina, human airway
      epithelium and two mechanoreceptor corpuscles alongside cortex, hippocampus, thalamus,
      nucleus accumbens and a zebra finch song nucleus.''',
  u'''thirteen from <em>BossDB</em>, across <em>six species</em> and 23 tissues: heart,
      kidney, liver, pancreas, thymus, skin and a guard hair follicle, lung, human airway
      epithelium, duodenum, skeletal muscle, cochlea, retina, choroid plexus, olfactory bulb,
      spinal cord and two mechanoreceptor corpuscles alongside cortex, hippocampus, thalamus,
      nucleus accumbens and a zebra finch song nucleus.'''),
 (u"the share of the grid",
  u'''three of them millimetre-scale surveys holding seven tenths of the grid between them.''',
  u'''three of them millimetre-scale surveys holding three fifths of the grid between them.'''),
 (u"the boxes, as the chip says",
  u'''looked at, 11,707 of them, and reporting''',
  u'''looked at, 13,031 of them, and reporting'''),
 (u"the chip",
  u'''<span class="chip">61 volumes, 29 tissues</span>''',
  u'''<span class="chip">61 volumes, 23 tissues</span>'''),
]
for name, old, new in PAIRS:
    if new in s and old not in s: print("  already there: " + name); continue
    assert s.count(old) == 1, name
    s = s.replace(old, new, 1); print("  ok: " + name)
if s != b: io.open(p, "w", encoding="utf-8").write(s)
