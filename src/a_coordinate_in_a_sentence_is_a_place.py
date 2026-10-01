# -*- coding: utf-8 -*-
u"""A coordinate written in a sentence is a place you can go.                            2026-10-01

Søren, on Gary's forum proposal: *"what if a user wants to talk about more than one coordinate in a
post? Can we instead make it recognise when a coordinate or rootID is pasted and then make it into a
link automatically?"* And: *"Make sure that it recognises the minnie35 and minnie65 differences but
opens the viewer with both segmentation layers and both em layers."*

The geometry and the rules are in core/jumplink.js and its header; this file is the half that wires
it to a page — the hook µJump answers with, the script tag on every hand-maintained page, and the
comment fields that already exist and have been showing bare numbers all along.

WHAT µJump CAN ANSWER THAT THE MODULE CANNOT. Two things, and they are the two that make this
resolve rather than guess:

  THE TWO IMAGED EXTENTS, in nanometres, already in this file for the region-filter diagram
  (MINNIE65_EM_BB / MINNIE35_EM_BB) and now read by a second caller rather than written out again.
  A triple that lands in neither is not a coordinate, and the one that lands in one of them is
  labelled with which.

  THE NUCLEUS TABLE, which is in memory anyway: nidToIndex plus NX/NY/NZ plus typeInfo. That turns
  "is 253863 a cell" from a guess into a lookup, and gives the link something to say.

minnie65 IS LISTED FIRST, and the order is the tie-break. The two slabs touch in z -- 592,640 to
594,400 nm is in both -- and a point in that seam is reported as minnie65, which is the one with
segmentation and nucleus detection over it. Left to object key order this would have been settled by
nothing at all.

THE COMMENT FIELDS GO FIRST, BEFORE ANY FORUM EXISTS. Four places already render somebody's prose
through escHtml: the classification history, a tracing's comment, the organelle notes, and the
identification result. Those have been carrying bare root ids and coordinates since the day they
were added, and now they carry links. It means the feature is exercised on real data rather than on
posts nobody has written, and it means the forum arrives with its hardest part already proven.

ωJUMP IS NOT WIRED HERE. It inlines core/ at build time rather than linking it, and it has no tab
bar for the forum to live in either; both are one job, later.

Check: jumplinkcheck.js.
Run: python3 src/a_coordinate_in_a_sentence_is_a_place.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The six hand-maintained pages that link core/panel.js. ωJump and χJump are GENERATED -- ωJump
# inlines core/ at build time, χJump is built by build_xjump.py and carries no panel.js at all --
# so editing their HTML here would be reverted by the next build. They are one job with the forum.
PAGES = ["ujump.html", "djump.html", "pjump.html", "ljump.html",
         "hjump.html", "bjump.html"]


def edit(rel, pairs, quiet=False):
    P = os.path.join(HERE, rel)
    if not os.path.exists(P):
        print("  (no %s)" % rel); return
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


# ── THE TAG, ON EVERY PAGE THAT LINKS core/ ─────────────────────────────────────────────────────
# Before core/panel.js, which renders the classification history that uses it. Load order matters
# for nothing else here -- the module resolves its host at call time, not at load -- but a reader
# should not have to know that.
TAG_OLD = u'<script src="core/panel.js"></script>'
TAG_NEW = (u'<!-- A coordinate or root id written in a comment becomes a link to the place it names'
           u' -- core/jumplink.js, 2026-10-01. -->\n'
           u'<script src="core/jumplink.js"></script>\n'
           u'<script src="core/panel.js"></script>')
for page in PAGES:
    edit(page, [(u"core/jumplink.js is loaded", TAG_OLD, TAG_NEW)])


# ── WHAT µJump ANSWERS WITH ─────────────────────────────────────────────────────────────────────
HOOK = u'''  /* ── WHAT A REFERENCE IN SOMEBODY'S PROSE CAN BE RESOLVED AGAINST ─────  2026-10-01
     core/jumplink.js reads a comment and finds the places named in it. It deliberately knows
     nothing about this dataset: a triple of numbers is a coordinate only if it lands inside one of
     the two imaged volumes, and a bare number is a cell only if it is in the nucleus table. Both
     answers are here, and only here.

     minnie65 IS FIRST, AND THE ORDER IS THE TIE-BREAK. The two slabs touch in z -- 592,640 to
     594,400 nm belongs to both -- and a point in the seam should be reported as the volume that
     has segmentation and nucleus detection over it. Left to chance this would be decided by
     whichever entry an iteration reached first.

     The EM extents are the same two constants the region-filter diagram draws, read rather than
     copied. The viewer is whichever one is picked at the top of the Jump tab, read at call time so
     changing it changes the next link rather than needing a re-render. */
  window.jumpLinkHost=function(){
    return {
      resNm:[UJ_RX,UJ_RY,UJ_RZ],
      volumes:[
        {key:"minnie65",label:"minnie65",bb:window.MINNIE65_EM_BB,
         em:SRC.em,seg:SRC.seg,nuc:SRC.nuc},
        /* No `nuc`: there is no MICrONS nucleus detection over minnie35, and an empty nuclei
           layer out here would look like a dataset with nothing in it. */
        {key:"minnie35",label:"minnie35",bb:window.MINNIE35_EM_BB,
         em:SRC.em35,seg:SRC.seg35}
      ],
      dim:DIM, emShader:EM_SHADER_CONTROLS, bg:ngBgColor(),
      viewer:function(){
        const el=document.getElementById("viewer");
        return el?el.value:"https://spelunker.cave-explorer.org/";
      },
      /* THE LOOKUP THAT STOPS THIS BEING A GUESS. -1 means "not a cell in this volume", and the
         number then stays as the text somebody typed. */
      nucleus:function(nid){
        try{
          const i=nidToIndex(nid);
          if(i<0)return null;
          return {xVox:NX[i],yVox:NY[i],zVox:NZ[i],volume:"minnie65",
                  label:(typeInfo(i)||{}).name||""};
        }catch(_e){ return null; }
      }
    };
  };
'''

edit("ujump.html", [
 (u"what a reference can be resolved against",
  u"  window.tracingNucCentroid=function(nid){",
  HOOK + u"  window.tracingNucCentroid=function(nid){"),
])


# ── AND THE COMMENT FIELDS THAT ALREADY EXIST ───────────────────────────────────────────────────
# Each of these already escapes. Swapping escHtml(x) for jumpLinkHtml(x) keeps the escaping -- the
# module escapes everything it does not turn into a link -- and adds the links. jumpLinkHtml is the
# shim, so a page whose core/ is older than its markup shows the text rather than throwing.
SHIM = u'''/* The comment, with the places it names made clickable -- core/jumplink.js, 2026-10-01. Falls
   back to plain escaped text when the module is not there: these files are deployed one at a time,
   and a page that arrives before the module it wants must lose the links, not the comment. */
function jumpLinkHtml(s){
  try { if (window.UJ && UJ.jumplink) return UJ.jumplink.html(s); } catch (_e){}
  return escHtml(s);
}
'''

edit("core/panel.js", [

 (u"the shim",
  u"function cellCardFold(",
  SHIM + u"function cellCardFold("),

 (u"a classification comment names places",
  u'''      const comment=h.comment?'<div class="chist-comment">“'+escHtml(h.comment)+'”</div>':"";''',
  u'''      const comment=h.comment?'<div class="chist-comment">“'+jumpLinkHtml(h.comment)+'”</div>':"";'''),

 (u"...and so does a note",
  u'''    const note=h.note?'<div class="chist-comment">“'+escHtml(h.note)+'”</div>':"";''',
  u'''    const note=h.note?'<div class="chist-comment">“'+jumpLinkHtml(h.note)+'”</div>':"";'''),
])

edit("ujump.html", [
 (u"an identification's own comment names places",
  u'''  if(ur.comment)oh+='<div class="meta">'+escHtml(ur.comment)+'</div>';''',
  u'''  if(ur.comment)oh+='<div class="meta">'+jumpLinkHtml(ur.comment)+'</div>';'''),
])

print("\nNow: node jumplinkcheck.js, then python3 src/build_stamps.py")
