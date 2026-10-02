# -*- coding: utf-8 -*-
u"""The picture shows the cell the post is about.                                        2026-10-02

Søren: *"clicking a coordinate does not leave for Neuroglancer, but clicking the resulting image
preview should bring you to Neuroglancer. Also, if a nucleus or root ID is written, then the EM
should also show segmentation."*

The first half was already built on 2026-10-02 and is asserted here rather than assumed: the canvas
is wrapped in an anchor carrying the viewer state, and empreviewcheck.js now DISPATCHES A CLICK ON
IT and catches the tab it opens, instead of only reading the href. A link that is present and does
nothing looks identical to a link that works, from the outside.

The second half is this change, in three parts.

THE IDS ARE THE POST'S, NOT THE LINK'S. A sentence saying both "look at this place" and "this cell"
is asking for one picture of the two together, and which of the two words came first is not
something the reader should have to think about. So the first root id and the first nucleus id
anywhere in the post are what gets painted over the tissue at whichever coordinate was clicked --
magenta for the cell, blue for the nucleus, from core/segpaint.js, which is the same pair the cell
card, the tracing pad and the Blender export use.

A CELL WITH NO PLACE STILL HAS ONE. A post that names only a nucleus has no coordinate to centre on,
and until now its link did nothing at all -- which looks exactly like a broken link. µJump knows
where every nucleus is, so the link draws the tissue there.

AND THE MARKS GO ON LAST. segpaint reads the whole canvas back and rewrites it, so the scale bar and
the coordinate stamp have to be drawn after the overlay rather than after the EM. The cell card
learned this the same way; this file is where that order is written down for the preview.

WHY THIS IS A SECOND GENERATOR rather than an edit to src/a_coordinate_becomes_a_picture.py: that
one has already run against the tree. edit()'s idempotency guard is `if new in s`, so changing its
replacement text does not update what it wrote -- it appends a SECOND copy beside it, which is what
happened on the first attempt here (two emPreviewHost hooks, two wirePreviews). A change to what a
generator produced is its own generator, with the old text as the anchor.

Check: empreviewcheck.js, forumcheck.js.
Run: python3 src/the_preview_shows_the_cell_too.py, then python3 src/build_stamps.py
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


edit("ujump.html", [
 (u"the page says its overlay alpha and where a nucleus is",
  u'      window:{lo:EM_WINDOW.lo,hi:EM_WINDOW.hi},',
  u"      window:{lo:EM_WINDOW.lo,hi:EM_WINDOW.hi},\n      /* One alpha for every overlay this page paints, like the window above it. */\n      segAlpha:EM_SEG_ALPHA,\n      /* So a post that names a CELL and no place still has somewhere to draw: the nucleus\n         detection's own centroid, from the table this page already holds. */\n      nucleusAt:function(nid){\n        try{\n          const i=nidToIndex(nid);\n          return i<0?null:[NX[i],NY[i],NZ[i]];\n        }catch(_e){ return null; }\n      },"),
])

edit("core/forum.js", [
 (u"the cell the post names is painted on the tissue",
  u'      a.addEventListener("click", function(ev){\n        var hs = hits(body.dataset.raw || "");\n        var h = hs[Number(a.getAttribute("data-jl"))];\n        if (!h || !h.voxel) return;            /* a root id or a viewer link keeps its old meaning */\n        ev.preventDefault();\n        ev.stopPropagation();\n        var key = h.voxel.join(",");\n        if (open === key){ UJ.empreview.close(slot); open = ""; return; }\n        open = key;\n        UJ.empreview.open(slot, h.voxel);\n      });',
  u'      a.addEventListener("click", function(ev){\n        var hs = hits(body.dataset.raw || "");\n        var h = hs[Number(a.getAttribute("data-jl"))];\n        if (!h) return;\n        /* A VIEWER LINK KEEPS ITS OLD MEANING: it is already a state somebody built, and there is\n           nothing this could add to it. */\n        if (h.kind === "viewer") return;\n        /* ── WHAT THE POST SAYS ABOUT THE CELL ──────────────────  2026-10-02\n           S\\u00f8ren: "if a nucleus or root ID is written, then the EM should also show\n           segmentation." The ids are the POST\'S, not the link\'s: a sentence naming a place and a\n           cell is asking for one picture of the two, and which word came first does not matter. */\n        var ids = idsOf(hs);\n        var at = h.voxel;\n        /* AND A CELL WITH NO PLACE STILL HAS ONE. A post naming only a nucleus has no coordinate\n           to centre on, and its link used to do nothing -- which looks exactly like a broken link.\n           This page knows where every nucleus is. */\n        if (!at && h.kind === "nucleus") at = nucleusPos(h.id);\n        if (!at) return;\n        ev.preventDefault();\n        ev.stopPropagation();\n        var key = at.join(",");\n        if (open === key){ UJ.empreview.close(slot); open = ""; return; }\n        open = key;\n        UJ.empreview.open(slot, at, { ids: ids });\n      });'),

 (u"...read off the post once",
  u'function wirePreviews(host){',
  u'/* The cell a post is about, from the post itself: its first root id and its first nucleus id. Both\n   where both are there -- segpaint takes them together and paints the nucleus inside the cell,\n   which is the picture somebody who named both is asking for. */\nfunction idsOf(hs){\n  var out = {};\n  (hs || []).forEach(function(h){\n    if (h.kind === "root" && !out.root) out.root = h.id;\n    if (h.kind === "nucleus" && !out.nuc) out.nuc = h.id;\n  });\n  return out;\n}\nfunction nucleusPos(nid){\n  try {\n    var cfg = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;\n    if (cfg && typeof cfg.nucleusAt === "function") return cfg.nucleusAt(nid) || null;\n  } catch (_e){}\n  return null;\n}\nfunction wirePreviews(host){'),

 (u"...and the compose box repaints when the ids change, not when the words do",
  u'  var shown = "";\n  var look = function(){\n    var h = hits(ta.value).filter(function(x){ return x.voxel && x.kind === "coord"; })[0];\n    var key = h ? h.voxel.join(",") : "";\n    if (key === shown) return;\n    shown = key;\n    if (!key){ UJ.empreview.close(slot); return; }\n    UJ.empreview.open(slot, h.voxel);\n  };',
  u'  var shown = "";\n  var look = function(){\n    var hs = hits(ta.value);\n    var h = hs.filter(function(x){ return x.voxel && x.kind === "coord"; })[0];\n    var at = h ? h.voxel : null;\n    var ids = idsOf(hs);\n    /* No coordinate but a nucleus named: draw where that nucleus is. The same rule as a post. */\n    if (!at && ids.nuc) at = nucleusPos(ids.nuc);\n    /* KEYED ON WHAT WOULD BE DRAWN -- the place AND the ids. Adding a root id to a sentence that\n       already has a coordinate must repaint; typing the next word must not. */\n    var key = at ? (at.join(",") + "|" + (ids.root || "") + "|" + (ids.nuc || "")) : "";\n    if (key === shown) return;\n    shown = key;\n    if (!at){ UJ.empreview.close(slot); return; }\n    UJ.empreview.open(slot, at, { ids: ids });\n  };'),
])
print("\nNow: node empreviewcheck.js and node forumcheck.js, then python3 src/build_stamps.py")
