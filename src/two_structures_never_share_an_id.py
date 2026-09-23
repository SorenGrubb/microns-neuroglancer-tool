# -*- coding: utf-8 -*-
u"""Two structures never share a structureId.                                             2026-09-23

Found while fixing the arachnoid barrier cell Søren lost. Once the prior-id lookup was narrowed to
the right cell (src/a_second_cell_does_not_take_the_first_ones_id.py), the two cells were minting
their ids independently -- and STILL came back identical:

    whole-cell_1790186254669  /  whole-cell_1790186254669

because structureId() was

    slug + "_" + (stamp || Date.now())

and both mints fell in the same millisecond. Measured: a thousand mints in a row produced TWO
distinct ids. Its own comment promised "unique per submission"; what it delivered was unique per
millisecond per name, and two structures sharing an id are not two structures -- they are one with
two versions, and the list shows the later one. That is exactly the failure that cost the cell.

TWO WAYS IT COLLIDES, and they need different answers:

  same page, two mints in one millisecond  -> a counter. The stamp never repeats and never goes
                                              backwards within a page, so this becomes impossible
                                              rather than unlikely.
  two PEOPLE, two browsers, one millisecond -> no page-local counter can see the other browser, so
                                              four random characters. 36^4 is 1.7 million to the
                                              millisecond, against sixteen fellows tracing the same
                                              organelles for a year.

AN EXPLICIT STAMP IS STILL HONOURED VERBATIM, with no tail added. That parameter exists so an id can
be regenerated, which randomness would destroy; no caller passes it today, and the ones that might
want to are the ones that must get the same answer twice.

WHAT IS UNCHANGED: the slug still leads the id, so a reader still sees which structure a row belongs
to without a join -- the readable half of the old comment's promise was the half it kept. Ids already
in the sheet are untouched.

The counter can run the stamp a few milliseconds ahead of the clock under a burst. It is an
identifier, not a time; nothing reads the number back, which src/../structureidcheck.js pins.

Check: structureidcheck.js, written first; it measured 2 distinct ids from 1000 mints before this
went in.
Run: python3 src/two_structures_never_share_an_id.py, then python3 src/build_stamps.py, then
python3 wjump-build/src/build_wjump.py and python3 xjump-build/src/build_xjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/tracing.js", [
 (u"a structureId that cannot repeat",
  u'''  function structureId(name, stamp){
    /* Readable, unique per submission, and stable within one: the rows of one tracing have to find
       each other on the way back out, and a reader looking at the sheet should be able to tell
       which cell a row belongs to without a join. */
    var slug = String(name || "traced").toLowerCase().replace(/[^a-z0-9]+/g, "-")
                 .replace(/^-|-$/g, "").slice(0, 40) || "traced";
    return slug + "_" + (stamp || Date.now());
  }''',
  u'''  /* The last stamp this page handed out, so the next one cannot be the same or earlier. */
  var STRUCTURE_STAMP = 0;
  function structureId(name, stamp){
    /* Readable, unique per submission, and stable within one: the rows of one tracing have to find
       each other on the way back out, and a reader looking at the sheet should be able to tell
       which cell a row belongs to without a join.

       ── AND "UNIQUE" USED TO BE A CLAIM RATHER THAN A FACT ─────────────────────────  2026-09-23
       This was slug + "_" + Date.now(). Measured: a THOUSAND mints in a row gave two distinct ids,
       because they shared two milliseconds. Two structures with one id are one structure with two
       versions, and the list shows the later -- which is how Søren came to be missing an arachnoid
       barrier cell whose 30,948 vertices were sitting behind a "v2" label.

       The counter makes a repeat within this page impossible rather than unlikely. The four random
       characters are for the collision no counter here can see: two people, two browsers, the same
       slug in the same millisecond. An explicit stamp is returned verbatim, because that parameter
       exists so an id can be REGENERATED and a random tail would destroy exactly that.
       See src/two_structures_never_share_an_id.py. */
    var slug = String(name || "traced").toLowerCase().replace(/[^a-z0-9]+/g, "-")
                 .replace(/^-|-$/g, "").slice(0, 40) || "traced";
    if (stamp) return slug + "_" + stamp;
    var n = Date.now();
    if (n <= STRUCTURE_STAMP) n = STRUCTURE_STAMP + 1;
    STRUCTURE_STAMP = n;
    return slug + "_" + n + "_" + Math.random().toString(36).slice(2, 6);
  }'''),
])
