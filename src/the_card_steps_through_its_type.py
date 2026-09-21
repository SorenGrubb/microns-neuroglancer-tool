# -*- coding: utf-8 -*-
u"""Previous / Next of the same type, on the identity card of every tool.              2026-09-21

Søren: "Now do the Next/previous buttons on µJump's identity card. But implement it for all
tools." Asked how: a fixed list with a counter, wrapping at the ends; the type is the name on the
card. The row itself is core/typestep.js (see its header); this puts it on the six hand pages.

  µJump, δJump, πJump   nothing to configure. The Filter's buildAllIdentities() is exactly the list
                        (own, then community, then the dataset's own prediction), and rowPos +
                        jumpToVoxel is how core/stepthrough.js already walks it. The one change is
                        making buildAllIdentities reachable, as window.rowPos was made on 2026-08-20
                        -- it lives inside the Filter's closure.
  λJump, βJump          the community's name (xIdentityOf) -- neither dataset has a classifier --
                        over the page's own cell table; showCell(i) is the jump.
  ηJump                 the name its card prints: the community's, else H01's published type.

χJump is done in its own build (xjump-build/src/xjump_card_steps_through_its_type.py). ωJump's
identify card already walks a cell type with back / next / "3 of 12".

Run: python3 src/the_card_steps_through_its_type.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)


TAG = u'<script src="core/stepthrough.js"></script>\n'
MOD = (u'<!-- Previous / Next of the same type on the identity card -- core/typestep.js, 2026-09-21. -->\n'
       u'<script src="core/typestep.js"></script>\n')

for page in ["ujump.html", "djump.html", "pjump.html"]:
    print(page)
    edit(page, [
     (u"the Filter's list is reachable",
      u'''  window.rowPos=rowPos;''',
      u'''  window.rowPos=rowPos;
  /* And the list it walks, for core/typestep.js's Previous / Next on the identity card (2026-09-21):
     the same identities, in the same order, the Filter and the step-through use. */
  window.buildAllIdentities=buildAllIdentities;'''),
     (u"the module", TAG, TAG + MOD),
    ])


def table_cfg(ident, fetch, panel):
    return u'''<script>
/* PREVIOUS / NEXT OF THE SAME TYPE on the identity card -- core/typestep.js, 2026-09-21. This
   dataset has no classifier, so a cell's type is the community's name for it (%(ident)s), over
   the page's own cell table. Built once per identity read and per table (an added cell replaces
   the arrays), not on every look. */
UJ.cfg.typestep = {
  panel: "%(panel)s",
  rows: (function(){
    var memo = { by: null, bx: null, n: -1, rows: null };
    return function(){
      if (!IDENTITY_BY_NID){ try { %(fetch)s(); } catch (e){} return null; }
      if (memo.by === IDENTITY_BY_NID && memo.bx === BX && memo.n === N) return memo.rows;
      var out = [];
      for (var i = 0; i < N; i++){
        var t = %(ident)s(i);
        if (!t) continue;
        out.push({ key: t.toLowerCase(), label: t.charAt(0).toUpperCase() + t.slice(1),
                   pos: [BX[i], BY[i], BZ[i]], i: i });
      }
      memo = { by: IDENTITY_BY_NID, bx: BX, n: N, rows: out };
      return out;
    };
  })(),
  go: function(row){ showCell(row.i, null); }
};
</script>
''' % {"ident": ident, "fetch": fetch, "panel": panel}


for page, ident, fetch in [("ljump.html", "ljumpIdentityOf", "fetchLjumpIdentities"),
                           ("bjump.html", "bjumpIdentityOf", "fetchBjumpIdentities")]:
    print(page)
    edit(page, [(u"the module and what a type is here", TAG, TAG + MOD + table_cfg(ident, fetch, "panel"))])

HJ_ANCHOR = u'<script src="core/report.js"></script>\n'
HJ_CFG = u'''<!-- Previous / Next of the same type on the identity card -- core/typestep.js, 2026-09-21. -->
<script src="core/typestep.js"></script>
<script>
/* ηJump's type is the name its card prints: the community's when there is one, else H01's
   published type (hjumpCellTypeFor, less its "Unclassified"). Rebuilt when the community's
   identities arrive, not on every look. */
UJ.cfg.typestep = {
  panel: "nucpanel",
  rows: (function(){
    var memo = { by: undefined, rows: null };
    return function(){
      if (memo.by === HJUMP_IDENTITY_BY_NID && memo.rows) return memo.rows;
      var out = [];
      for (var i = 0; i < N; i++){
        var t = hjumpIdentityOf(i) || longName(typeName(i)) || "";
        t = String(t).trim();
        if (!t || /^unclassified$/i.test(t)) continue;
        out.push({ key: t.toLowerCase(), label: t.charAt(0).toUpperCase() + t.slice(1),
                   pos: [HX[i], HY[i], HZ[i]], i: i });
      }
      memo = { by: HJUMP_IDENTITY_BY_NID, rows: out };
      return out;
    };
  })(),
  go: function(row){ showCell(row.i, null, false); }
};
</script>
'''
print("hjump.html")
edit("hjump.html", [(u"the module and what a type is here", HJ_ANCHOR, HJ_ANCHOR + HJ_CFG)])
