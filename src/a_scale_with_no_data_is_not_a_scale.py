# -*- coding: utf-8 -*-
u"""core/emtiles.js: a page can name a scale that is not really there.           2026-09-20

V1DD's image volume lists EIGHT scales, and the first one is a lie:

    key "placeholder"   4.85 nm   size 573952 x 573952 x 17664   chunk 2048 x 2048 x 128
    key "9.7_9.7_45"    9.7 nm    size 286976 x 286976 x 17664   chunk  128 x  128 x  16
    key "19.4_19.4_45"  …

Probed live through Søren's browser on 2026-09-20: the placeholder returns **404 at its own
voxel_offset and 404 at the origin**, while `9.7_9.7_45` returns a full 262,144-byte chunk at
every one of 16 positions spread across the tissue. It is an entry in a JSON file with no bytes
behind it.

── WHY IT IS NOT SOMETHING emtiles CAN WORK OUT FOR ITSELF ─────────────────────

`sectionScales()` keeps the scales whose z matches the finest z, because past that a "section" is
an averaged slab. The placeholder's z is **45 nm, the same as the real scales**, so it passes that
filter — and since the index IS the mip, δJump's mip 0 would be the dead one and would fail
exactly the way πJump fails.

Nothing else in the info file distinguishes it. Its chunk is 512 MB where the real ones are 256 KB,
which is suggestive, but a size threshold invented from one dataset is a rule that will be wrong
for the next volume somebody adds. **The page knows; the shared module does not.** So the page says
so, next to the source it is describing, the way core/stepthrough.js and core/tracingcard.js take
their per-dataset facts from UJ.cfg.

Default: skip nothing. µJump and λJump pass no skipScales and are unchanged.

Run: python3 src/a_scale_with_no_data_is_not_a_scale.py
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


CONF_OLD = u'''  function configure(cfg){
    CFG = { em: UJ.segread._httpBase(cfg.em), res: cfg.res || [4, 4, 40] };
    return CFG;
  }'''

CONF_NEW = u'''  function configure(cfg){
    CFG = { em: UJ.segread._httpBase(cfg.em), res: cfg.res || [4, 4, 40],
            /* ── SCALES THE PAGE SAYS ARE NOT REALLY THERE ─────────  2026-09-20
               V1DD's list opens with `key: "placeholder"`, 4.85 nm, chunk 2048×2048×128, and 404s
               at its own voxel_offset AND at the origin — an entry with no bytes behind it. Its z
               is 45 nm like the real scales, so sectionScales() keeps it, and since the index IS
               the mip, δJump's mip 0 would be the dead one.

               NOT GUESSED HERE. Nothing in an info file marks a scale as empty; the only honest
               test is to fetch one, and a module that probed every scale on every configure would
               cost a round trip per level to learn something the page already knows. So the page
               names the keys, beside the source it is describing. Skip nothing by default. */
            skipScales: (cfg.skipScales || []).slice() };
    return CFG;
  }

  /* The scale list with those entries removed, in the order the volume gave them. Applied BEFORE
     anything computes a finest-z or indexes a mip, so every later number counts real scales only.
     Refuses to empty the list: a skipScales that matched everything is a typo, and one dead mip is
     a better failure than no imagery at all. */
  function realScales(info){
    var skip = (CFG && CFG.skipScales) || [];
    if (!skip.length) return info.scales;
    var kept = info.scales.filter(function(s){ return skip.indexOf(s.key) < 0; });
    return kept.length ? kept : info.scales;
  }'''

print("core/emtiles.js")
edit("core/emtiles.js", [
    (u"configure() takes the keys this volume does not really have", CONF_OLD, CONF_NEW),
], marker=u"SCALES THE PAGE SAYS ARE NOT REALLY THERE")


SECT_OLD = u'''  function sectionScales(info){
    var fineZ = info.scales[0].resolution[2];
    return info.scales.filter(function(s){ return s.resolution[2] === fineZ; });
  }'''

SECT_NEW = u'''  function sectionScales(info){
    var all = realScales(info);
    var fineZ = all[0].resolution[2];
    return all.filter(function(s){ return s.resolution[2] === fineZ; });
  }'''

edit("core/emtiles.js", [
    (u"sectionScales counts only the scales that exist", SECT_OLD, SECT_NEW),
])


# scaleAt's slabOk path reads info.scales directly, and its fineZ comes from scales[0] too.
SCALE_OLD = u'''    var usable = slabOk ? info.scales : sectionScales(info);
    var i = Math.max(0, Math.min(usable.length - 1, mip | 0));
    var fineZ = info.scales[0].resolution[2];'''

SCALE_NEW = u'''    var usable = slabOk ? realScales(info) : sectionScales(info);
    var i = Math.max(0, Math.min(usable.length - 1, mip | 0));
    /* realScales, not info.scales: on δJump scales[0] is the placeholder, and a `slab` count
       measured against a level that does not exist would be wrong on every page it is shown. */
    var fineZ = realScales(info)[0].resolution[2];'''

edit("core/emtiles.js", [
    (u"scaleAt indexes and measures against the real list", SCALE_OLD, SCALE_NEW),
])


# ── and the header says the module has this option ───────────────────────────────────────────
HDR_OLD = u'''   Run: node emtilescheck.js */'''
HDR_NEW = u'''   CONFIGURE takes { em, res, skipScales }. skipScales names scale keys this volume lists but does
   not serve — V1DD opens its list with `key: "placeholder"`, which 404s — and defaults to none, so
   a page that passes nothing behaves exactly as before.

   Run: node emtilescheck.js */'''

edit("core/emtiles.js", [
    (u"the header documents skipScales", HDR_OLD, HDR_NEW),
])

print(u"\nnow: node emtilescheck.js && node emplanecheck.js && node emljumpcheck.js")
