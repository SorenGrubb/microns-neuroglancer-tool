# -*- coding: utf-8 -*-
"""An outline registers its own centre, and that centre is the cell's answer.  2026-09-18

Søren: *"When drawing a segmentation of an organelle that does not have an annotation, the
volumetric center of the segmentation should be registered as an annotation."* — and, asked whether
it should defer to a hand-placed point that is already there: *"Silently, but this should be more
precise than the manually annotated, so it should replace it."*

So an organelle outline now posts its own centre as an ordinary `organelle_location` row, in the
same act that adds the outline. Three consequences, each deliberate:

  * IT IS AN ANNOTATION LIKE ANY OTHER. Everything that reads annotations -- the per-cell summary,
    the counts beside the filter's checkboxes, the Master cell list, the dashboard -- sees it without
    knowing anything new. An organelle that has been outlined stops being invisible to half the tool.

  * IT SAYS WHERE IT CAME FROM. `source: "segmentation"` and `fromStructureId`, plus a comment in
    plain words, so the row explains itself in the sheet before any column is read. The columns
    arrive by ensureHeaderColumn, which is how every optional field on that sheet has arrived since
    the hole geometry in August -- no migration, and an older deployment simply ignores them.

  * "REPLACE" IS A STATEMENT ABOUT WHICH COORDINATE ANSWERS, NOT A DELETION. The record is
    append-only and somebody's observation is not ours to erase. The cell panel already prefers the
    traced centre and lists the points it supersedes underneath it, dimmed, with who placed them
    (see core/organellelink.js and renderOrganelleSection). Nothing here has to delete anything for
    his rule to hold, and nothing here could.

SILENTLY MEANS SILENTLY WHEN IT WORKS. It goes through noteSaveResult -- the best-effort sender that
says nothing on success and says what the server said on a refusal -- so three organelles in one
press are one extra line of work and no extra toasts, while a deployment that refuses the write
still gets to say so. The tracing's own toast already announces the press.

A CENTROID CAN LIE OUTSIDE ITS OWN OBJECT (a curved organelle; see centre()'s note). That does not
make it the wrong place to mark, but it does make it worth saying, so the comment says it.

Run: python3 src/an_outline_registers_its_own_centre.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── the page: the label for a refusal, and the sender ────────────────────────────────────────────
PAGE = [
    ('''var SAVE_LABEL={
  save_computed_volume:"The computed volume",''',
     '''var SAVE_LABEL={
  /* An outline's own centre, posted silently beside it -- see tracingRegisterCentre(). Named here
     because a refusal is the one thing it ever says out loud, and "That measurement was not saved"
     would leave somebody hunting for which. */
  organelle_location:"The outlined organelle\\u2019s centre",
  save_computed_volume:"The computed volume",''',
     "a refused centre says what it was"),
]

# ── the tracing card ─────────────────────────────────────────────────────────────────────────────
CARD = [
    ('''function tracingPublish(t,quiet){''',
     '''/* ── AN OUTLINE REGISTERS ITS OWN CENTRE ────────────────────────────────────────  2026-09-18
   Søren: *"When drawing a segmentation of an organelle that does not have an annotation, the
   volumetric center of the segmentation should be registered as an annotation."*

   An ordinary `organelle_location` row, so everything that reads annotations -- the per-cell
   summary, the counts beside the filter, the Master cell list -- sees it without knowing anything
   new. An organelle that has been outlined stops being invisible to half the tool.

   It goes out SILENTLY (his word): noteSaveResult says nothing when it worked and says what the
   server said when it did not, so three organelles in one press cost no extra toasts and a
   deployment that refuses the write still gets to say so. The tracing's own toast announces the
   press already.

   ONLY AN ORGANELLE. A traced cell or nucleus is the cell, not something inside it, and the
   organelle annotations are a list of things inside cells.

   AND ONLY FOR A CELL. An annotation is filed against a nucleus or a root ID; a tracing with
   neither has nowhere to be an annotation OF, and inventing a home for it would put it on whatever
   cell happened to be on screen. */
function tracingRegisterCentre(t){
  try {
    if (!t || !t.rings || !t.rings.length) return false;
    const kind = String(t.kind || "").toLowerCase();
    if (!kind || kind === "cell" || kind === "nucleus") return false;
    if (!window.UJ || !UJ.organellelink) return false;
    const nid = String(t.nucleus_id || ""), rid = String(t.root_id || "");
    if (!nid && !rid) return false;
    const c = UJ.organellelink.centre(t.rings);
    if (!c || !c.point) return false;
    const at = c.point.join(",");
    /* The row explains itself in the sheet before any column is read. */
    const say = "Volumetric centre of the outlined \\u201c" + (t.name || kind) + "\\u201d"
      + (isFinite(t.volume_um3) ? " (" + (t.volume_um3 >= 1 ? t.volume_um3.toFixed(2)
          : t.volume_um3.toFixed(4)) + " \\u00b5m\\u00b3, " + c.sections + " sections)" : "")
      + ", registered from the segmentation rather than placed by hand."
      /* A centroid can fall outside a curved object. It is still where the organelle is; it is not
         a point ON it, and the difference is worth one clause. */
      + (c.inside ? "" : " The centroid lies outside the outline \\u2014 a curved shape \\u2014 so "
                       + "this marks where it is rather than a point on it.");
    const payload = { type: "organelle_location",
      timestamp: new Date().toISOString(),
      nucleusId: nid, rootId: rid, coord: at,
      groupId: "centre_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      subIndex: 1, subCount: 1,
      kind: kind, pointA: at, pointB: "",
      identified: t.type || "", path: "", comment: say,
      /* WHERE IT CAME FROM, in columns as well as in words. ensureHeaderColumn on the backend adds
         both by itself, which is how every optional field on that sheet has arrived; a deployment
         older than today simply ignores them and the row is still a correct annotation. */
      source: "segmentation", fromStructureId: t.id || "",
      reporterName: (typeof REPORTER_NAME !== "undefined" && REPORTER_NAME) || "",
      reporterEmail: (typeof REPORTER_EMAIL !== "undefined" && REPORTER_EMAIL) || "",
      credential: (typeof GOOGLE_CREDENTIAL !== "undefined" && GOOGLE_CREDENTIAL) || "" };
    if (typeof noteSaveResult === "function") noteSaveResult(payload);
    else if (typeof postAndRead === "function") postAndRead(payload);
    else return false;
    /* The panel caches the annotations for a minute; this one should be in the next draw of the
       section it belongs to rather than a minute later. */
    try { if (typeof PANEL_TRACINGS !== "undefined") PANEL_TRACINGS_AT = 0; } catch (_e){}
    return true;
  } catch (e){
    console.warn("[uJump tracing] could not register the centre:", e && e.message);
    return false;
  }
}

function tracingPublish(t,quiet){''',
     "the centre is computed and sent"),

    ('''  t.pending_share=false;
  t.shared_at=new Date().toISOString();
  tracingWrite(TRACINGS_KEPT);
  return true;
}''',
     '''  t.pending_share=false;
  t.shared_at=new Date().toISOString();
  /* AFTER the tracing, and only if the tracing went: an annotation pointing at an outline that was
     refused would be a coordinate with nothing behind it. Once per tracing, not once per press, so
     a queued one registers its centre when it finally goes out too. */
  if(!t.centre_registered&&tracingRegisterCentre(t))t.centre_registered=true;
  tracingWrite(TRACINGS_KEPT);
  return true;
}''',
     "...once the outline itself has gone in"),
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


edit("ujump.html", PAGE)
edit("src/the_tracing_card.py", CARD)
print("\nnow: python3 src/the_tracing_card.py && node organellecentrecheck.js")
