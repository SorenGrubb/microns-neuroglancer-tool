# -*- coding: utf-8 -*-
u"""Bulk organelle annotation on δJump, πJump, βJump and ηJump.                   2026-09-21

Stage H, second slice. core/bulkorgan.js (src/bulkorgan_extraction.py) on every tool whose
segmentation can say which cell a marker is in. Each host was measured live from grubblab.com
before this was written:

  πJump   pinky100_v185/seg (uint64, unsharded) and the Princeton nuclei (uint32): resolveAt at five
          cells from the page's own table returned exactly rootId(i) AND NID[i], five of five. The
          nearest thing to µJump the family has, so it needs NO hooks at all — only the reader,
          which it never loaded.
  δJump   the cell segmentation is graphene behind a CAVE login, so rung 1 is closed; the NUCLEUS
          volume is public, so rungs 2 and 3 carry it — a marker inside or beside a nucleus lands
          on that cell. δJump's cells are filed by nucleus anyway.
  βJump   segmentation_secgan_16nm: resolveAt returned BSEG[i] at 6 of 8 cells (the other two:
          an unlabelled centre voxel). No nucleus volume, so rung 1 only.
  ηJump   c3: resolveAt returned c3Id(i) at 8 of 8 cells. No nucleus volume, so rung 1 only.

λJUMP DOES NOT GET IT. Lee16 has no segmentation at all, so there is nothing to find a cell in; the
nearest-centroid shortcut would put a dendrite's mitochondrion in a stranger's cell, which is why
µJump's ladder never had that rung. The card is absent there, not present and useless.

The card goes where µJump has it — under the cell panel, above the tracing card.

Run: python3 src/bulkorgan_on_the_other_tools.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)


def tag(extra=u""):
    return (u'<script src="core/ontology.js"></script>\n'
            + extra
            + u'<!-- Bulk organelle annotation, shared with µJump since 2026-09-21. After ontology.js,\n'
            + u'     whose Nucleus group it reads; it builds the card into #bulkOrganCard. -->\n'
            + u'<script src="core/bulkorgan.js"></script>\n')


WRAP = u'''<!-- ── BULK ORGANELLE ANNOTATION ─────────────────────────────────────  2026-09-21
     One paste of markers, one structure type, as many cells as you marked — the same card µJump
     has, in the same place. core/bulkorgan.js fills it. -->
<div class="card" id="bulkOrganCard"></div>
'''

RX = u"var UJ_RX = UJ.cfg.res[0], UJ_RY = UJ.cfg.res[1], UJ_RZ = UJ.cfg.res[2];"


def cfg(body):
    return RX + u"\n" + body


# ── δJump: nucleus rungs only ─────────────────────────────────────────────────────────────────
D_CFG = cfg(u'''/* ── BULK ORGANELLE ANNOTATION: THE NUCLEUS ANSWERS ────────────────  2026-09-21
   V1DD's cell segmentation is graphene behind a CAVE login and core/segread.js refuses one, so
   seg is empty and rung 1 of the ladder never fires. The nucleus volume is public: a marker in or
   beside a nucleus lands on that cell (rungs 2 and 3), which is how this page files cells anyway.
   A function, because SRC is defined further down. Everything else is µJump's default. */
UJ.cfg.bulk = {
  sources: function(){ return { seg: "", nuc: SRC.nuc, res: UJ.cfg.res }; }
};''')

print("djump.html")
edit("djump.html", [
    (u"the bulk card's sources: the nucleus, not the CAVE-gated cells", RX, D_CFG),
    (u"core/bulkorgan.js loads", u'<script src="core/ontology.js"></script>\n', tag()),
    (u"its wrapper, above the tracing card", u'<div class="card" id="tracingCard"></div>\n',
     WRAP + u'<div class="card" id="tracingCard"></div>\n'),
], marker=u'<script src="core/bulkorgan.js"></script>')


# ── πJump: µJump's defaults, and the reader it never loaded ───────────────────────────────────
P_WRAP_OLD = u'''<div class="actions"><button class="copy" id="copy">Copy link</button></div></div>
</div>
</div>
<div class="tabpanel" data-tabpanel="filter">'''
P_WRAP_NEW = u'''<div class="actions"><button class="copy" id="copy">Copy link</button></div></div>
</div>
''' + WRAP + u'''</div>
<div class="tabpanel" data-tabpanel="filter">'''

print("\npjump.html")
edit("pjump.html", [
    (u"core/segread.js and core/bulkorgan.js load", u'<script src="core/ontology.js"></script>\n',
     tag(u'<!-- The segmentation reader. pinky100_v185/seg and the Princeton nuclei are both plain\n'
         u'     precomputed and CORS-clean: resolveAt read rootId(i) and NID[i] exactly at five of five\n'
         u'     cells, 2026-09-21. The EM is not readable (see which-datasets-can-be-traced-on), the\n'
         u'     segmentation is. -->\n<script src="core/segread.js"></script>\n')),
    (u"its wrapper, under the cell panel", P_WRAP_OLD, P_WRAP_NEW),
], marker=u'<script src="core/bulkorgan.js"></script>')


# ── βJump: its own table ──────────────────────────────────────────────────────────────────────
B_CFG = cfg(u'''/* ── BULK ORGANELLE ANNOTATION ON THIS TABLE ──────────────────────  2026-09-21
   The cell is segmentation_secgan_16nm — resolveAt returned BSEG[i] at six of eight cells. No
   nucleus volume (the nuclei are Hoechst detections), so only rung 1 of the ladder applies.
   A structure is filed under this page's own ids: the Hoechst nucleus number and the segment,
   exactly as the organelle form on a cell's card files it. A secgan segment that no nucleus in
   the table owns is still accepted and filed by its segment id alone. */
UJ.cfg.bulk = {
  sources: function(){ return { seg: UJ.cfg.viewer.seg, nuc: "", res: UJ.cfg.res }; },
  indexOfRoot: function(r){
    if (!UJ.cfg.bulk._byRoot){
      var m = {};
      for (var i = 0; i < BSEG.length; i++) if (BSEG[i] && BSRC[i] === 1 && !(BSEG[i] in m)) m[BSEG[i]] = i;
      UJ.cfg.bulk._byRoot = m;
    }
    var k = UJ.cfg.bulk._byRoot[String(r)];
    return k == null ? -1 : k;
  },
  indexOfNucleus: function(){ return -1; },
  nucIdOf: function(i){ return String(BID[i]); },
  coordOf: function(i){ return [BX[i], BY[i], BZ[i]].join(","); },
  label: function(i){
    var who = (typeof bjumpIdentityOf === "function") ? bjumpIdentityOf(i) : null;
    return "Nucleus " + BID[i] + " &middot; " + escHtml(who || "unclassified");
  }
};''')

print("\nbjump.html")
edit("bjump.html", [
    (u"the bulk card reads secgan16 and files under this table", RX, B_CFG),
    (u"core/bulkorgan.js loads", u'<script src="core/ontology.js"></script>\n', tag()),
    (u"its wrapper, above the tracing card", u'<div class="card" id="tracingCard"></div>\n',
     WRAP + u'<div class="card" id="tracingCard"></div>\n'),
], marker=u'<script src="core/bulkorgan.js"></script>')


# ── ηJump: c3 and the cell body ───────────────────────────────────────────────────────────────
H_CFG = cfg(u'''/* ── BULK ORGANELLE ANNOTATION ON H01 ────────────────────────────  2026-09-21
   The cell is c3 — resolveAt returned c3Id(i) at eight of eight cells. H01 has no nucleus
   volume, so only rung 1 of the ladder applies. A structure is filed as the organelle form on a
   cell's card files it (UJ.panel.cellIds): the cell body id where µJump puts a nucleus, and the
   c3 segment as the root. c3 ids exceed 32 bits, so they are compared as decimal strings. */
UJ.cfg.bulk = {
  sources: function(){ return { seg: UJ.cfg.viewer.seg, nuc: "", res: UJ.cfg.res }; },
  indexOfRoot: function(r){
    if (!UJ.cfg.bulk._byRoot){
      var m = new Map();
      for (var i = 0; i < N; i++){ var c = c3Id(i); if (!m.has(c)) m.set(c, i); }
      UJ.cfg.bulk._byRoot = m;
    }
    var k = UJ.cfg.bulk._byRoot.get(String(r));
    return k == null ? -1 : k;
  },
  indexOfNucleus: function(){ return -1; },
  nucIdOf: function(i){ return String(HSB[i]); },
  coordOf: function(i){ return [HX[i], HY[i], HZ[i]].join(","); },
  label: function(i){
    return "Cell body " + HSB[i] + " &middot; " + escHtml(longName(typeName(i)));
  }
};''')

print("\nhjump.html")
edit("hjump.html", [
    (u"the bulk card reads c3 and files under the cell body", RX, H_CFG),
    (u"core/bulkorgan.js loads", u'<script src="core/ontology.js"></script>\n', tag()),
    (u"its wrapper, above the tracing card", u'<div class="card" id="tracingCard"></div>\n',
     WRAP + u'<div class="card" id="tracingCard"></div>\n'),
], marker=u'<script src="core/bulkorgan.js"></script>')
