# -*- coding: utf-8 -*-
u"""Five tools shared one cache of "this root has no mesh".                      2026-09-20

Found by widening storagekeycheck.js to read core/*.js — which was done because the tracing
extraction had just moved four keys into a shared module where the check could not see them. The
first thing the widened check reported was not the tracing keys at all:

    nothing is shared by accident  <-  microns_mesh_notfound_roots_v1
                                       (ujump + djump + pjump + hjump + xjump)

core/mesh.js caches the root ids it looked for and did not find, so it stops asking:

    const MESH_NOT_FOUND_KEY = CFG.notFoundKey || "microns_mesh_notfound_roots_v1";

βJump names its own. Nobody else ever did — and βJump's own config says why, in a comment written
a month ago:

    "notFoundKey MUST be namespaced: only ~half of this volume's segments are meshed, so the
     not-found set is large and would poison µJump's cache if the key were shared."

The principle was on record and four other tools never applied it. Five volumes with five different
id spaces have been writing one list: an id that has no mesh in minnie65 is a perfectly good id in
pinky100, in V1DD and in H01, and once it is in the shared set every tool stops looking for it.

THIS IS THE SAME BUG SØREN REPORTED IN SEPTEMBER, in a different cache. His words then: *"For some
reason the refresh live data in pJump makes uJump show the pJump data, and vice versa."* The worse
half of that one was the navigation history, because pinky100's nucleus ids (4809-7570) are also
valid minnie65 ids — a cell visited in πJump appeared in µJump's list and jumped to A DIFFERENT
REAL CELL. Same shape here, and silent: a missing mesh looks like a cell that has no mesh.

µJUMP'S KEY CHANGES TOO, and that is deliberate. It kept the module's default, `microns_...`,
which is not its own namespace — this check's rule 3 wants a page's keys prefixed with the page's
name, and "microns" is the name of a dataset that two of these five tools share. The cost of
changing it is one extra mesh lookup per root, once, because a cache of NEGATIVE results is the
one kind it is safe to throw away.

Run: python3 src/five_tools_shared_one_no_mesh_cache.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NOTE = (u'  /* Its own, not core/mesh.js\'s shared default. Five tools were writing one list of\n'
        u'     "roots with no mesh", and an id absent from one volume is a real id in the next —\n'
        u'     see βJump\'s own note, which said so a month before anybody else applied it. */\n')

PAGES = {
    "ujump.html": "ujump_mesh_notfound_v1",
    "djump.html": "djump_mesh_notfound_v1",
    "pjump.html": "pjump_mesh_notfound_v1",
    "hjump.html": "hjump_mesh_notfound_v1",
    "xjump.html": "xjump_mesh_notfound_v1",
}

for page, key in PAGES.items():
    p = os.path.join(HERE, page)
    s = io.open(p, encoding="utf-8").read()
    if u'notFoundKey' in s:
        print("  already there: " + page)
        continue
    empty = u"UJ.cfg.mesh = {};"
    opener = u"UJ.cfg.mesh = {\n"
    if empty in s:
        assert s.count(empty) == 1, "%s: the empty mesh config is not unique" % page
        s = s.replace(empty, u"UJ.cfg.mesh = {\n" + NOTE
                      + u'  notFoundKey: "' + key + u'"\n};', 1)
    else:
        assert s.count(opener) == 1, "%s: UJ.cfg.mesh's opener is not unique" % page
        s = s.replace(opener, opener + NOTE + u'  notFoundKey: "' + key + u'",\n', 1)
    io.open(p, "w", encoding="utf-8").write(s)
    print("  ok: %-11s %s" % (page, key))

print(u"\nnow: node storagekeycheck.js && node meshlivecheck.js && node bigmeshcheck.js")
