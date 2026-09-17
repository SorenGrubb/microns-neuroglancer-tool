"""A tracing keeps its identity, and sharing it again is a new version.               2026-09-17

The backend branch landed today (backend/src_a_tracing_has_an_author.py) and it versions a shared
tracing by (structureId, reporterEmail, groupId): the newest groupId for a tracing supersedes the
older ones on read-back, with nothing deleted. That only works if the page sends both keys, and
stage 1 sent neither.

WHAT IT SENT INSTEAD. ringsToRows() derives a structureId from `name + Date.now()` when none is
passed, and tracingShare() passed none — so outlining five more sections and sharing again produced
a SECOND tracing with a different id rather than a correction of the first. Nothing was wrong with
the rows; there was simply no thread running between two submissions of the same cell.

THREE CHANGES, all small:

1. `tracingCurrent()` gives the pending tracing a stable `id`, once, the first time it is asked for
   with a name. Keep and Share then talk about the same thing, and the id travels into
   localStorage on the tracing object, so it survives a reload.

   It reuses the id of a KEPT tracing of the same name when there is one. That is the real working
   pattern: paste a link covering more sections of the cell you already traced, give it the same
   name, share — and the backend treats it as a new version of that cell rather than a rival.

2. `tracingKeep()` replaces a kept tracing with the same id instead of appending beside it. Keeping
   twice used to put the cell in the Blender scene twice.

3. `tracingShare()` sends `structureId` and a fresh `groupId` per share. One act of sharing, one
   groupId, N contour rows — the same convention merged_split and organelle_location already use in
   this file, and the one Code.gs's ?tracings=1 reads to decide which version is current.

AND ONE IN core/tracing.js: rowsToStructures() keys by structureId AND tracer, not structureId
alone. Søren, on the feature: *"I don't think the traced structures should have consensus handling,
but it should be marked who traced the structures."* Two people outlining the same cell are two
tracings; keying by id alone would have interleaved their rings into one object whose sections came
from whoever posted last. That is consensus handling, arrived at by accident.

Run: python3 src/a_tracing_is_shared_as_a_version.py
     node tracingcheck.js && node tracingpanelcheck.js


SUPERSEDED PAIRS REMOVED, 2026-09-17: the edits below marked here were later rewritten by another
generator, which now owns that text. The reason they were made is still this file's; the
literal is the other file's, so re-running this one is a no-op rather than a second insert.
Superseded: "a pending tracing has a stable id"; "keeping twice replaces rather than duplicates"; "a share carries a structureId and a groupId"; "the share message says what a re-share does"
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TRACING = [



]


CHECK = [
    ('''console.log("\\nrows out of order, which a sheet gives no guarantee against");''',
     '''console.log("\\ntwo people, one cell");
{
  /* No consensus handling, by instruction -- so the same structureId traced by two people is two
     tracings. Keyed by id alone, their rings interleaved into one object whose shape depended on
     who posted last: consensus handling arrived at by accident, and invisible, because the result
     still meshes. */
  const rows = [
    { structureId: "s1", name: "astrocyte", z: 500, ringIndex: 0, points: "1,1;9,1;9,9",
      reporterName: "S\\u00f8ren Grubb" },
    { structureId: "s1", name: "astrocyte", z: 505, ringIndex: 0, points: "2,2;8,2;8,8",
      reporterName: "S\\u00f8ren Grubb" },
    { structureId: "s1", name: "astrocyte", z: 500, ringIndex: 0, points: "3,3;7,3;7,7",
      reporterName: "Somebody Else" }
  ];
  const back = T.rowsToStructures(rows);
  ok(back.length === 2, "the same cell traced by two people is two structures", back.length);
  const mine = back.find(s => s.tracedBy === "S\\u00f8ren Grubb");
  const theirs = back.find(s => s.tracedBy === "Somebody Else");
  ok(!!mine && mine.rings.length === 2 && !!theirs && theirs.rings.length === 1,
     "...each holding only its own contours",
     (mine && mine.rings.length) + " and " + (theirs && theirs.rings.length));
  ok(!!mine && mine.structureId === "s1" && !!theirs && theirs.structureId === "s1",
     "...and both still say which cell they are of");

  /* A structure read once and fed back in must not split again -- rowsToStructures reads
     reporterName, toTracings writes traced_by, and a re-read has to agree with the first. */
  const again = T.rowsToStructures(T.ringsToRows(mine.rings, { structureId: "s1", name: "astrocyte" })
    .map(r => Object.assign({ tracedBy: "S\\u00f8ren Grubb" }, r)));
  ok(again.length === 1 && again[0].tracedBy === "S\\u00f8ren Grubb",
     "and a round trip through the rows again is stable, on tracedBy as well as reporterName");
}

console.log("\\nrows out of order, which a sheet gives no guarantee against");''',
     "two tracers of one cell stay two tracings"),
]

PANELCHECK = [
    ('''    out.rows = window.__posted.map(x => ({ t: x.type, z: x.z, n: x.name,
                                           pts: (x.points || "").split(";").length }));
    return out;''',
     '''    out.rows = window.__posted.map(x => ({ t: x.type, z: x.z, n: x.name, sid: x.structureId,
                                           gid: x.groupId,
                                           pts: (x.points || "").split(";").length }));
    /* A SECOND share of the same tracing. Same structureId, new groupId -- that pair is what the
       backend keys "this replaces the older version" on, so a re-share after tracing five more
       sections is a correction rather than a rival tracing of the same cell. */
    window.__posted = [];
    document.getElementById("tracingShare").click();
    out.again = window.__posted.map(x => ({ sid: x.structureId, gid: x.groupId }));
    return out;''',
     "the panel check captures the ids a share carries"),

    ('''  ok(shared.rows.every(r => r.pts === 10), "...with all ten points of each contour");''',
     '''  ok(shared.rows.every(r => r.pts === 10), "...with all ten points of each contour");
  ok(shared.rows.every(r => r.sid && r.sid === shared.rows[0].sid),
     "...every row carrying the SAME structureId, which is how they find each other again",
     shared.rows[0].sid);
  ok(shared.rows.every(r => r.gid && r.gid === shared.rows[0].gid),
     "...and the same groupId, one per act of sharing", shared.rows[0].gid);
  ok(shared.again.length === 2 && shared.again[0].sid === shared.rows[0].sid,
     "sharing it again keeps the structureId \\u2014 it is the same cell",
     shared.again.length && shared.again[0].sid);
  ok(shared.again.length === 2 && shared.again[0].gid !== shared.rows[0].gid,
     "...with a NEW groupId, which is what makes it a new version rather than a duplicate",
     shared.again.length && shared.again[0].gid);''',
     "a re-share is a version, not a duplicate"),

    ('''  console.log("\\nremoving one");''',
     '''  console.log("\\nkeeping the same tracing twice");
  {
    const twice = await p.evaluate(({ url }) => {
      const before = TRACINGS_KEPT.length;
      document.getElementById("tracingLink").value = url;
      document.getElementById("tracingRead").click();
      document.getElementById("tracingName").value = "astrocyte at the glia limitans";
      document.getElementById("tracingKeep").click();
      return { before: before, after: TRACINGS_KEPT.length,
               ids: TRACINGS_KEPT.map(t => t.id),
               stored: JSON.parse(localStorage.getItem("ujump_tracings_v1") || "[]").length };
    }, { url: link(polygon(1000, 2000, 500, 44, 12, "r1")
          .concat(polygon(1005, 2005, 505, 42, 12, "r2"),
                  polygon(1010, 2010, 510, 40, 12, "r3"))) });
    ok(twice.after === twice.before,
       "keeping a fuller tracing of a cell already kept REPLACES it \\u2014 it used to be in the "
       + "Blender scene twice", twice.before + " -> " + twice.after);
    ok(twice.ids.every(i => !!i) && new Set(twice.ids).size === twice.ids.length,
       "...and every kept tracing has an id of its own", twice.ids.join(", "));
    ok(twice.stored === twice.after, "...with storage saying the same", twice.stored);
  }

  console.log("\\nremoving one");''',
     "keeping twice is checked in a real page"),
]


# PAGE: every pair here was superseded by a later generator, which now owns that text.
# Kept as an empty list so this file still runs as the no-op it has become; the reason for
# the change is in the docstring above, and the literal is the other generator's.
PAGE = []

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


edit("core/tracing.js", TRACING)
edit("ujump.html", PAGE)
edit("tracingcheck.js", CHECK)
edit("tracingpanelcheck.js", PANELCHECK)
print("\nnow: node tracingcheck.js && node tracingpanelcheck.js")
