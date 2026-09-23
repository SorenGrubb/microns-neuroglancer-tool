# -*- coding: utf-8 -*-
u"""A chip on the pad takes you to what it names, and a drawing can be deleted.           2026-09-23

Søren, with a screenshot of the two strips:

  "When clicking one of the contours, it should jump to that contour in the EM window, so that I
   don't have to look for it."
  "Also, I should be able to delete one of the drawings, but give a warning first."

WHAT THE CHIPS DID. The "On this section:" chip was a delete button end to end -- the whole chip,
not the × printed on it -- so there was no way to click a contour at all, and the only way to find
one was to look for it. The "Drawing:" chip switched which structure you are drawing and promised,
in its own tooltip, "Go back to this one": it changed the selection and left the view exactly where
it was. And a whole drawing could not be deleted at all, only unpicked one contour at a time.

SO THE CLICK AND THE DELETE ARE SEPARATED, on both strips. The body of a chip GOES THERE; the ×
printed on it deletes. That way round on purpose -- a click that goes somewhere is undone by looking
back, and a click that deletes is not. The × was already drawn on the contour chips, so the thing
that looked like the delete control becomes the delete control.

WHERE "THERE" IS. A contour has one z and one place, so its chip sets both. A drawing has many, so
its chip goes to the contour of it ON THIS SECTION if there is one -- and the z does not move, or
picking up a structure to carry on drawing it would throw the section away underneath you -- and
otherwise to its nearest section, which is what "go back to this one" was always supposed to mean.

THE WARNING NAMES AND COUNTS. "Delete number 3?" does not say that an afternoon goes with it, so it
says "3 contours on 3 sections". And when the drawing was opened from the dataset it says the
dataset's copy stays where it is: deleting on the pad is taking it out of your hands, not
withdrawing it from everyone, and somebody who thinks otherwise will not press it when they should
-- or will press it thinking they have retracted something they have not.

THE SURVIVORS KEEP THEIR NUMBERS. deleteInstance does not close the gap, for the reason newInstance
already gives in its own comment: PAD_INST_KIND, PAD_INST_COLOUR and PAD_EDIT_IDS are all keyed by
that number, so renumbering would slide every structure's type, colour and dataset id one place to
the left. Delete the second of three and you have 1 and 3.

Check: padjumpcheck.js, written first; 13 of its assertions failed before this went in.
Run: python3 src/a_chip_takes_you_to_what_it_names.py, then python3 src/build_stamps.py, then
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


# ── 1. the pad model gains "delete a whole structure" ──────────────────────────────────────────
edit("core/tracepad.js", [
 (u"deleteInstance",
  u'''  function setInstance(pad, i){
    pad.inst = Math.max(0, Math.round(i) || 0);
    pad.pending = [];
    pad.stroke = null;
    return pad.inst;
  }''',
  u'''  function setInstance(pad, i){
    pad.inst = Math.max(0, Math.round(i) || 0);
    pad.pending = [];
    pad.stroke = null;
    return pad.inst;
  }
  /* ── A WHOLE STRUCTURE, GONE ───────────────────────────────────────────────────  2026-09-23
     Søren: "I should be able to delete one of the drawings, but give a warning first." The warning
     belongs to the card, which is what knows how to ask; this is the removal, and it returns how
     many contours went so the card can say.

     THE SURVIVORS KEEP THEIR NUMBERS -- the gap is not closed up. newInstance above already refuses
     to reuse a number, and for the same reason and one more: the card keys PAD_INST_KIND,
     PAD_INST_COLOUR and PAD_EDIT_IDS by this number, so renumbering would slide every structure's
     type, colour and dataset id one place to the left. Delete the second of three and 1 and 3 are
     what is left.

     Deleting the one being drawn moves to the nearest below it, or the first of what remains, so
     the next stroke lands on a structure that exists rather than opening a new empty one. */
  function deleteInstance(pad, i){
    var k = Math.max(0, Math.round(i) || 0);
    var before = (pad.rings || []).length;
    pad.rings = (pad.rings || []).filter(function(r){ return (r.inst || 0) !== k; });
    if ((pad.inst || 0) === k){
      var left = [];
      pad.rings.forEach(function(r){ var j = r.inst || 0; if (left.indexOf(j) < 0) left.push(j); });
      left.sort(function(a, b){ return a - b; });
      var below = left.filter(function(x){ return x < k; });
      pad.inst = below.length ? below[below.length - 1] : (left.length ? left[0] : 0);
      pad.pending = []; pad.stroke = null;
    }
    return before - pad.rings.length;
  }'''),
 (u"...exported",
  u'''           instances: instances, newInstance: newInstance, setInstance: setInstance,''',
  u'''           instances: instances, newInstance: newInstance, setInstance: setInstance,
           deleteInstance: deleteInstance,'''),
])


# ── 2. the card: chips that go there, and a delete that asks ───────────────────────────────────
GO_FNS = u'''/* ── A CHIP GOES TO WHAT IT NAMES ──────────────────────────────────────────────  2026-09-23
   Søren: "When clicking one of the contours, it should jump to that contour in the EM window, so
   that I don't have to look for it." See src/a_chip_takes_you_to_what_it_names.py.

   The centre of a contour is the mean of its vertices. Not its bounding-box centre: a crescent --
   which is what half the organelles on this pad are -- has a bounding-box centre out in the
   neuropil beside it, and the point of this is to put the thing itself under the cursor. */
function padRingCentre(r){
  if (!r || !r.points || !r.points.length) return null;
  var cx = 0, cy = 0;
  r.points.forEach(function(p){ cx += p[0]; cy += p[1]; });
  return [Math.round(cx / r.points.length), Math.round(cy / r.points.length)];
}
function padGoToRing(ring){
  var r = PAD && PAD.rings && PAD.rings[ring];
  var c = padRingCentre(r);
  if (!c) return null;
  /* A half-drawn contour belongs to the section it is on -- padStep's rule, and the same here. */
  if (PAD.z !== r.z){ PAD.z = r.z; PAD.pending = []; }
  PAD_CENTRE = [c[0], c[1], PAD.z];
  padDraw();
  return c;
}
/* A structure has many contours, so: the one on THIS section if it has one -- and then the z does
   not move, or picking a structure up to carry on drawing it would throw the section away
   underneath you -- otherwise the nearest section it is on. */
function padGoToInst(inst){
  var mine = ((PAD && PAD.rings) || []).filter(function(r){ return (r.inst || 0) === inst; });
  if (!mine.length) return null;
  var here = mine.filter(function(r){ return r.z === PAD.z; });
  var r = here.length ? here[0]
        : mine.slice().sort(function(a, b){
            return Math.abs(a.z - PAD.z) - Math.abs(b.z - PAD.z) || (a.z - b.z); })[0];
  var c = padRingCentre(r);
  if (!c) return null;
  if (PAD.z !== r.z){ PAD.z = r.z; PAD.pending = []; }
  PAD_CENTRE = [c[0], c[1], PAD.z];
  padDraw();
  return { at: c, z: r.z, moved: !here.length };
}
'''

edit("core/tracingcard.js", [
 # --- the two "go there" helpers, in front of the strip that uses them
 (u"padGoToRing and padGoToInst",
  u'''/* One chip per contour on this section, each with its own delete. "Delete this one" should not
   mean "Undo until it is gone" -- that is the difference between correcting a tracing and starting
   it again. */
function padRings(){''',
  GO_FNS + u'''/* One chip per contour on this section. The BODY goes to it; the × on it deletes it. "Delete this
   one" should not mean "Undo until it is gone" -- that is the difference between correcting a
   tracing and starting it again. */
function padRings(){'''),

 # --- contour chips: body goes there, the × deletes
 (u"the contour chip separates going from deleting",
  u'''  box.innerHTML = '<span class="hint">On this section:</span> '
    + here.map(function(h, n){
        return '<button type="button" class="hist-chip padring" data-ring="' + h.ring + '" '
          + 'title="Delete this contour \\u2014 it belongs to number ' + ((h.inst || 0) + 1) + '">'
          + '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;'
          + 'margin-right:4px;background:' + escHtml(padInstColour(h.inst || 0)) + '"></span>'
          + (severalHere ? ('#' + ((h.inst || 0) + 1)) : String(n + 1))
          + ' \\u00b7 ' + h.points + ' points \\u00d7</button>';
      }).join(" ");
  [].slice.call(box.querySelectorAll(".padring")).forEach(function(b){
    b.addEventListener("click", function(){
      if (UJ.tracepad.deleteRing(PAD, +b.dataset.ring)){
        padPaint(); padRings();
        padSay("Contour deleted. " + UJ.tracepad.count(PAD).rings + " left.");
      }
    });
  });
}''',
  u'''  box.innerHTML = '<span class="hint">On this section:</span> '
    + here.map(function(h, n){
        return '<button type="button" class="hist-chip padring" data-ring="' + h.ring + '" '
          + 'title="Go to this contour \\u2014 it belongs to number ' + ((h.inst || 0) + 1)
          + '. The \\u00d7 deletes it.">'
          /* NAMED, so a selector can tell the swatch from the × beside it. */
          + '<span class="padswatch" style="display:inline-block;width:8px;height:8px;'
          + 'border-radius:2px;margin-right:4px;background:'
          + escHtml(padInstColour(h.inst || 0)) + '"></span>'
          + (severalHere ? ('#' + ((h.inst || 0) + 1)) : String(n + 1))
          + ' \\u00b7 ' + h.points + ' points'
          /* The × was already printed here and already looked like the delete control. Now it is
             one. Inside the button rather than beside it, so the chip stays one chip. */
          + ' <span class="padx" data-ring="' + h.ring + '" title="Delete this contour"'
          + ' style="padding:0 2px;opacity:.75">\\u00d7</span></button>';
      }).join(" ");
  [].slice.call(box.querySelectorAll(".padring")).forEach(function(b){
    b.addEventListener("click", function(ev){
      /* WHICH HALF OF THE CHIP. The body goes there, the × deletes -- 2026-09-23. It used to be
         delete either way, which left no way to click a contour at all. */
      var onX = ev.target && ev.target.closest && ev.target.closest(".padx");
      if (onX){
        if (UJ.tracepad.deleteRing(PAD, +b.dataset.ring)){
          padPaint(); padRings();
          padSay("Contour deleted. " + UJ.tracepad.count(PAD).rings + " left.");
        }
        return;
      }
      var c = padGoToRing(+b.dataset.ring);
      if (c) padSay("Moved to that contour, at " + c[0] + ", " + c[1] + ".");
    });
  });
}'''),

 # --- drawing chips: body goes there too, and a × that asks first
 (u"the drawing chip goes there, and its \u00d7 asks first",
  u'''      + (it.contours ? '' : ' <span style="opacity:.6">empty</span>') + '</button>';
  }).join("");
  [].slice.call(box.querySelectorAll(".padinst")).forEach(function(b){
    b.addEventListener("click", function(){''',
  u'''      + (it.contours ? '' : ' <span style="opacity:.6">empty</span>')
      /* Nothing drawn yet is nothing to delete, and nothing to go to either. */
      + (it.contours
          ? ' <span class="padx" data-inst="' + it.inst + '" title="Delete this drawing"'
            + ' style="padding:0 2px;opacity:.75">\\u00d7</span>'
          : '') + '</button>';
  }).join("");
  [].slice.call(box.querySelectorAll(".padinst")).forEach(function(b){
    b.addEventListener("click", function(ev){
      /* The × asks before it does anything (2026-09-23). Søren: "I should be able to delete one of
         the drawings, but give a warning first." */
      if (ev.target && ev.target.closest && ev.target.closest(".padx")){
        padInstAsk(+b.dataset.inst);
        return;
      }''')
])


# ── 3. selecting a structure also goes to it, and the warning bar ──────────────────────────────
edit("core/tracingcard.js", [
 (u"selecting a drawing goes to it",
  u'''      padPaint(); padRings();
      padSay("Drawing number " + (PAD.inst + 1) + " now — anything you draw joins that one."
        + (tracingEachOwn() ? " The type box above is its own." : ""));
    });
  });
}''',
  u'''      padPaint(); padRings();
      /* ...AND GOES TO IT. The tooltip on this chip has said "Go back to this one" since it was
         written; until 2026-09-23 it only changed the selection and left the view where it was,
         which on a cell forty sections deep is the difference between a click and a search. */
      var went = padGoToInst(PAD.inst);
      padSay("Drawing number " + (PAD.inst + 1) + " now — anything you draw joins that one."
        + (went ? (went.moved ? " Moved to it, on section " + went.z + "."
                              : " It is at " + went.at[0] + ", " + went.at[1] + " here.") : "")
        + (tracingEachOwn() ? " The type box above is its own." : ""));
    });
  });
}

/* ── ASKING BEFORE A DRAWING GOES ──────────────────────────────────────────────  2026-09-23
   Søren: "I should be able to delete one of the drawings, but give a warning first."

   It NAMES AND COUNTS. "Delete number 3?" does not say that an afternoon goes with it, so the bar
   says how many contours on how many sections -- the two numbers that say how much work it was.

   AND IT SAYS WHAT IS NOT DELETED. A drawing opened from the dataset still has its rows and its
   file up there; taking it off the pad is taking it out of your hands, not withdrawing it from
   everybody. Somebody who thinks this retracts a published tracing will either not press it when
   they should, or press it believing they have retracted something they have not.

   The bar replaces the strip rather than sitting over it, so nothing is hidden behind it and
   padInstances() puts the strip back whichever button is pressed. */
function padInstAsk(inst){
  const box = document.getElementById("tracePadInsts");
  if (!box || !PAD) return;
  const it = UJ.tracepad.instances(PAD).filter(function(x){ return x.inst === inst; })[0];
  if (!it || !it.contours) return;
  const what = (typeof tracingKindFor === "function" && tracingKindFor(inst).name) || "";
  const shared = (typeof PAD_EDIT_IDS !== "undefined" && PAD_EDIT_IDS[String(inst)]) || "";
  box.innerHTML = '<span style="color:var(--bad)">Delete drawing ' + (inst + 1)
    + (what ? ' \\u201c' + escHtml(what) + '\\u201d' : '') + '? '
    + it.contours + ' contour' + (it.contours === 1 ? '' : 's') + ' on '
    + it.sections + ' section' + (it.sections === 1 ? '' : 's') + ' would go, and that cannot be '
    + 'undone.</span> '
    + (shared ? '<span class="hint">It stays in the dataset either way \\u2014 this only takes it '
                + 'off the pad.</span> ' : '')
    + '<button type="button" class="hist-chip padgo" data-go="' + inst + '" '
    + 'style="color:var(--bad)">Delete it</button> '
    + '<button type="button" class="hist-chip padkeep" data-keep="' + inst + '">Keep it</button>';
  const keep = box.querySelector(".padkeep");
  if (keep) keep.addEventListener("click", function(){
    padInstances();
    padSay("Kept. Nothing was deleted.");
  });
  const go = box.querySelector(".padgo");
  if (go) go.addEventListener("click", function(){
    const gone = UJ.tracepad.deleteInstance(PAD, inst);
    /* Its type, its colour and the dataset tracing it was opened from are keyed by its number, and
       a number that no longer names anything must not go on answering for one. */
    try { delete PAD_INST_KIND[String(inst)]; } catch (_e){}
    try { delete PAD_INST_COLOUR[String(inst)]; } catch (_e){}
    try { delete PAD_EDIT_IDS[String(inst)]; } catch (_e){}
    if (typeof PAD_EDIT_ID !== "undefined" && PAD_EDIT_ID && PAD_EDIT_ID === shared) PAD_EDIT_ID = "";
    tracingShowKindOf(PAD.inst);
    padPaint(); padRings();          // which redraws the strip, the volume, the draft and the 3D
    padSay("Drawing " + (inst + 1) + " deleted \\u2014 " + gone + " contour"
      + (gone === 1 ? "" : "s") + " gone. Drawing " + (PAD.inst + 1) + " is the one you are on now."
      + (shared ? " Its tracing in the dataset is untouched." : ""));
  });
}'''),
])
