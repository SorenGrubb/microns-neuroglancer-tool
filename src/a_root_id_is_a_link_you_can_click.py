# -*- coding: utf-8 -*-
u"""A root id in a post opens the cell, the way a coordinate opens the place.            2026-10-03

Søren, on a phone, with a post whose root id was purple and inert: *"Clicking the root ID does
nothing at all. I think clicking it or the nucleus ID should show it in Neuroglancer or as a 2D and
3d window."*

THE HANDLER TOOK THE COORDINATE FROM THE LINK, and a root id has none, so it returned -- and a link
that returns is indistinguishable from a link that is broken. A nucleus id had been given a fallback
for exactly this reason, and the comment beside it says so in as many words: *"its link used to do
nothing, which looks exactly like a broken link."* The root id never got the same treatment.

ONE RULE, THREE KINDS, which is easier to predict than three rules: CLICKING A THING SHOWS THAT
THING. A coordinate goes to that coordinate, a nucleus id to that nucleus (unchanged, as it has
been), and a root id to that cell. Only when the thing itself cannot be placed does the post's own
coordinate stand in -- a sentence naming a place and a cell is one picture of the two, which
idsOf() has assumed since it was written.

PLACING A ROOT ID IS THE PAGE'S HALF. µJump holds the nucleus table and already has
rootIdToIndex(): the lazy reverse map behind its own "root ID / nucleus ID" search box. The preview
host gains `cellAt`, beside the `nucleusAt` that has been there since a post could name a nucleus,
and reads that map rather than building a second one.

AND WHERE IT CANNOT BE PLACED, IT SAYS SO. rootIdToIndex only knows this tool's OWN resolved root
ids -- a community-proposed root, or a cell in another volume, is not in it. That used to produce
silence, which is the fault being fixed, so it now produces a sentence naming the id and a link
that opens it in Neuroglancer. Half of what Søren asked for is that link, and it is the half that
works for any id at all.

Check: forumcheck.js (seven new assertions, run red first -- and the first of them passed before
the fix, on a picture the section above it had left open, which is the oldest way for a check to be
worth nothing; it closes that picture first now).

Run: python3 src/a_root_id_is_a_link_you_can_click.py
     python3 src/build_stamps.py
     node forumcheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/forum.js", [

 (u"the page can place a cell as well as a nucleus",
  u'''function nucleusPos(nid){
  try {
    var cfg = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;
    if (cfg && typeof cfg.nucleusAt === "function") return cfg.nucleusAt(nid) || null;
  } catch (_e){}
  return null;
}''',
  u'''function nucleusPos(nid){
  try {
    var cfg = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;
    if (cfg && typeof cfg.nucleusAt === "function") return cfg.nucleusAt(nid) || null;
  } catch (_e){}
  return null;
}
/* The same question for a ROOT id. µJump answers it from the nucleus table it already holds,
   through the reverse map its own root-id search box uses; a page without one simply says no, and
   the caller then falls back to the post's own coordinate. 2026-10-03. */
function cellPos(rid){
  try {
    var cfg = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;
    if (cfg && typeof cfg.cellAt === "function") return cfg.cellAt(rid) || null;
  } catch (_e){}
  return null;
}
/* Neuroglancer, for an id this page cannot place. It is the one answer that works for any id at
   all -- a community-proposed root, another volume's cell -- and it is half of what was asked for:
   "clicking it ... should show it in Neuroglancer or as a 2D and 3d window". */
function viewerUrlFor(h){
  try { if (window.UJ && UJ.jumplink) return UJ.jumplink.url([h]) || ""; } catch (_e){}
  return "";
}'''),

 (u"clicking a thing shows that thing",
  u'''        var ids = idsOf(hs);
        var at = h.voxel;
        /* AND A CELL WITH NO PLACE STILL HAS ONE: a post naming only a nucleus has no coordinate to
           centre on, and its link used to do nothing, which looks exactly like a broken link. */
        if (!at && h.kind === "nucleus") at = nucleusPos(h.id);
        if (!at) return;''',
  u'''        var ids = idsOf(hs);
        /* ── CLICKING A THING SHOWS THAT THING ────────────────────────────────────  2026-10-03
           One rule for three kinds, which is easier to predict than three rules. A coordinate goes
           to that coordinate; a nucleus id to that nucleus, as it has since "a post naming only a
           nucleus has no coordinate to centre on, and its link used to do nothing, which looks
           exactly like a broken link"; and a root id to that cell, which is the case that was
           left out and the one Søren hit: "Clicking the root ID does nothing at all."

           ONLY THEN THE POST'S OWN COORDINATE. A sentence naming a place and a cell is asking for
           one picture of the two -- idsOf() above has assumed that since it was written -- so an
           id this page cannot place still has somewhere to be drawn when the sentence says where.
           Last, because the thing you clicked wins over the thing beside it. */
        var at = h.voxel;
        if (!at && h.kind === "nucleus") at = nucleusPos(h.id);
        if (!at && h.kind === "root") at = cellPos(h.id);
        if (!at) at = (hs.filter(function(x){ return x.voxel; })[0] || {}).voxel || null;
        if (!at){
          /* NOT NOTHING. rootIdToIndex only knows this tool's own resolved root ids: a
             community-proposed root, or a cell in another volume, is not in it. Silence there is
             the fault being fixed, so this says which id it was and offers the one answer that
             works for any id at all. */
          ev.preventDefault();
          ev.stopPropagation();
          var u = viewerUrlFor(h);
          open = "";
          slot.innerHTML = "<p class='forumnoplace' style='font-size:12px;color:var(--mut);"
            + "margin:6px 0;line-height:1.5'>Nothing on this page knows where <b>"
            + esc(h.id || h.text || "that") + "</b> is — it may be a community-proposed root id, "
            + "or a cell in another volume. "
            + (u ? "<a href='" + esc(u) + "' target='_blank' rel='noopener'>Open it in "
                   + "Neuroglancer</a>, or add a coordinate to the post and the picture will "
                   + "draw here."
                 : "Add a coordinate to the post and the picture will draw here.")
            + "</p>";
          return;
        }'''),
])


edit("ujump.html", [

 (u"the preview host can place a root id",
  u'''      nucleusAt:function(nid){
        try{
          const i=nidToIndex(nid);
          return i<0?null:[NX[i],NY[i],NZ[i]];
        }catch(_e){ return null; }
      },''',
  u'''      nucleusAt:function(nid){
        try{
          const i=nidToIndex(nid);
          return i<0?null:[NX[i],NY[i],NZ[i]];
        }catch(_e){ return null; }
      },
      /* And the same for a ROOT id, so a post naming only a cell has somewhere to draw. Søren:
         "Clicking the root ID does nothing at all." Through rootIdToIndex(), which is the lazy
         reverse map this page already builds for its own root-ID search box -- not a second one,
         so a cell this page can find by searching is a cell the Discussion can draw. It knows only
         this tool's OWN resolved root ids, which is what the search box says about itself too;
         core/forum.js says so rather than going quiet when it comes back empty. 2026-10-03. */
      cellAt:function(rid){
        try{
          const i=rootIdToIndex(rid);
          return i<0?null:[NX[i],NY[i],NZ[i]];
        }catch(_e){ return null; }
      },'''),
])
print("\nNow: python3 src/build_stamps.py, then node forumcheck.js")
