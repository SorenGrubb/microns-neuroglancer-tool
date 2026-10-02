# -*- coding: utf-8 -*-
u"""A coordinate becomes a picture.                                                      2026-10-02

Søren: *"I would like that when pasting a coordinate, the EM view in a around 20µm wide image shows
for that coordinate and the EM view is a neuroglancer link and the coordinate is written in the top
left corner and there is a scalebar. There should also be buttons to add the 3D view of the
segmentation next to the em view of the nearest cell with a segmentation at that coordinate and the
nucleus of the cell."*

The picture is core/empreview.js's; this is the wiring. The hook µJump answers with, the script tag,
and the two places a coordinate turns into one: a post, on click, and the compose box, as you type.

ON CLICK IN A POST, NEVER ON SIGHT. His own answer when asked. Fifteen chunk fetches is nothing once
and a lot thirty times, and a forum has to open instantly or nobody reads it. So a coordinate stays
a link, clicking it opens the picture underneath, and clicking it again closes it.

WHICH MEANS THE LINK CHANGED ITS MIND about what it is for, and that has to be said on screen: it
used to open Neuroglancer. Now the PICTURE is the Neuroglancer link -- Søren asked for exactly that
-- so the click that used to leave the page now stays on it, and the thing that leaves is the thing
you can see first. That is the better order: nobody should have to open a viewer to find out whether
a coordinate was worth opening a viewer for.

IN THE COMPOSE BOX, AS YOU TYPE. One preview, for the FIRST coordinate recognised, redrawn when that
coordinate changes and not when anything else does. Typing a word after a coordinate must not refetch
the tissue, so the redraw is keyed on the coordinate itself rather than on the text.

A CELL MESH IS MEGABYTES, so the two 3D buttons fetch nothing until pressed -- and the segmentation
lookup behind them is deferred the same way, so a reader who only wanted the tissue never pays for it.

Check: empreviewcheck.js, forumcheck.js.
Run: python3 src/a_coordinate_becomes_a_picture.py, then python3 src/build_stamps.py
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


# ── THE TAG ─────────────────────────────────────────────────────────────────────────────────────
edit("ujump.html", [
 (u"core/empreview.js is loaded",
  u'<script src="core/forum.js"></script>',
  u'<!-- A coordinate becomes a picture: the EM here, its scale bar, and the cell in 3D beside it\n'
  u'     -- core/empreview.js, 2026-10-02. Before core/forum.js, which opens one per coordinate. -->\n'
  u'<script src="core/empreview.js"></script>\n'
  u'<script src="core/forum.js"></script>'),
])

# ── THE HOOK ────────────────────────────────────────────────────────────────────────────────────
HOOK = u'''  /* ── WHAT A PICTURE OF A COORDINATE NEEDS FROM THIS PAGE ────────────  2026-10-02
     core/empreview.js draws 19.2 µm of EM at a coordinate, finds the cell whose segmentation
     covers it, and draws that cell and its nucleus in 3D beside it. It knows none of the sources:
     the EM, the segmentation and the nuclei volumes are this page's, and so is the contrast window
     -- EM_WINDOW is read from EM_SHADER_CONTROLS, which is what this page sends Neuroglancer, so
     the pad, the cell card, this preview and every link written here cannot drift apart.

     minnie65 ONLY, deliberately. UJ.emtiles keeps ONE configured source and the tracing pad has
     already pointed it at minnie65; re-pointing it for a minnie35 coordinate would silently move
     the pad to the other volume. The preview says the EM could not be read there instead.

     viewerUrl is core/jumplink.js's, so the picture opens the same view the sentence's link does
     -- both volumes' imagery and segmentation -- rather than a second state built here that could
     disagree with it. */
  window.emPreviewHost=function(){
    return {
      res:[UJ_RX,UJ_RY,UJ_RZ],
      em:SRC.em, seg:SRC.seg, nuc:SRC.nuc,
      window:{lo:EM_WINDOW.lo,hi:EM_WINDOW.hi},
      viewerUrl:function(pos){
        try{
          if(window.UJ&&UJ.jumplink)
            return UJ.jumplink.url(UJ.jumplink.scan(pos.join(", ")));
        }catch(_e){}
        return "";
      }
    };
  };
'''

edit("ujump.html", [
 (u"what a picture of a coordinate needs from the page",
  u"  window.jumpLinkHost=function(){",
  HOOK + u"  window.jumpLinkHost=function(){"),
])


# ── THE FORUM: A CLICK OPENS THE PICTURE, A SECOND CLICK CLOSES IT ──────────────────────────────
PREVIEW = u'''/* ── A COORDINATE IN A POST OPENS ITS OWN PICTURE ──────────────────  2026-10-02
   Søren: "when pasting a coordinate, the EM view in a around 20µm wide image shows for that
   coordinate."

   ON CLICK, and that is his own answer to the question of when: a preview is fifteen chunk fetches,
   which is nothing once and a lot thirty times, and a forum has to open instantly or nobody reads
   it. So the coordinate stays a link, clicking it draws the tissue underneath, and clicking it
   again puts it away.

   THE LINK THEREFORE MEANS SOMETHING NEW, and that is a real change rather than an addition: it
   used to leave for Neuroglancer. Now the PICTURE is the Neuroglancer link -- which is what he
   asked for -- so the click that used to leave the page keeps you on it, and the thing that leaves
   is the thing you can see first. Nobody should have to open a viewer to find out whether a
   coordinate was worth opening a viewer for.

   One open preview per post, not one per coordinate: two 19.2 µm pictures side by side in a
   paragraph is a wall, and the comparison people want is between a picture and the sentence about
   it. Clicking a second coordinate moves the picture to it. */
function wirePreviews(host){
  if (!host || !window.UJ || !UJ.empreview) return;
  [].slice.call(host.querySelectorAll(".forumbody")).forEach(function(body){
    var slot = document.createElement("div");
    slot.className = "forumprev";
    body.parentNode.insertBefore(slot, body.nextSibling);
    var open = "";
    [].slice.call(body.querySelectorAll("a[data-jl]")).forEach(function(a){
      a.addEventListener("click", function(ev){
        var hs = hits(body.dataset.raw || "");
        var h = hs[Number(a.getAttribute("data-jl"))];
        if (!h || !h.voxel) return;            /* a root id or a viewer link keeps its old meaning */
        ev.preventDefault();
        ev.stopPropagation();
        var key = h.voxel.join(",");
        if (open === key){ UJ.empreview.close(slot); open = ""; return; }
        open = key;
        UJ.empreview.open(slot, h.voxel);
      });
    });
  });
}
'''

COMPOSE_PREV = u'''/* ── AND IN THE COMPOSE BOX, AS YOU TYPE ────────────────────────  2026-10-02
   So you can see that the coordinate you pasted is the place you meant, before anybody else reads
   it. The FIRST coordinate only -- a compose box is not a gallery -- and KEYED ON THE COORDINATE,
   not on the text: typing the rest of the sentence after a coordinate must not refetch the tissue. */
function wireComposePreview(scope){
  var ta = document.getElementById("forum_" + scope + "_body");
  var slot = document.getElementById("forum_" + scope + "_prev");
  if (!ta || !slot || !window.UJ || !UJ.empreview) return;
  var shown = "";
  var look = function(){
    var h = hits(ta.value).filter(function(x){ return x.voxel && x.kind === "coord"; })[0];
    var key = h ? h.voxel.join(",") : "";
    if (key === shown) return;
    shown = key;
    if (!key){ UJ.empreview.close(slot); return; }
    UJ.empreview.open(slot, h.voxel);
  };
  /* A BEAT AFTER THE TYPING STOPS. Pasting a coordinate fires one input event, but typing one by
     hand fires a dozen -- and the first eleven are prefixes that may each land inside the volume
     and each start a read. */
  var t = 0;
  ta.addEventListener("input", function(){
    if (t) clearTimeout(t);
    t = setTimeout(look, 450);
  });
}
'''

edit("core/forum.js", [

 (u"a coordinate in a post opens its own picture",
  u"function streamHtml(scope, label, blurb){",
  PREVIEW + COMPOSE_PREV + u"function streamHtml(scope, label, blurb){"),

 # The raw body has to survive onto the element: the anchors carry an index into a scan of the
 # ORIGINAL text, and the rendered HTML is not that text.
 (u"...so the body keeps the text its links were scanned from",
  u'''       + '<div class="forumbody" style="margin:4px 0">' + bodyHtml(p.body || "") + "</div>"''',
  u'''       + '<div class="forumbody" data-raw="' + esc(p.body || "") + '" style="margin:4px 0">'
         + bodyHtml(p.body || "") + "</div>"'''),

 (u"...and the previews are wired with everything else",
  u'''  [].slice.call(host.querySelectorAll(".forumopenall")).forEach(function(b){''',
  u'''  wirePreviews(host);
  ["volume", "tools"].forEach(wireComposePreview);
  [].slice.call(host.querySelectorAll(".forumopenall")).forEach(function(b){'''),
])
print("\nNow: node empreviewcheck.js and node forumcheck.js, then python3 src/build_stamps.py")
