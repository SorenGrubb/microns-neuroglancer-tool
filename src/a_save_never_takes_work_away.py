# -*- coding: utf-8 -*-
u"""A save never takes work away.                                                2026-09-19

Søren: *"I saved a draft of 3 lysosomes in a microglia cell. I then moved to another coordinate to
continue segmenting, but then the drawing number started over and it looks like this. Can I append
this extra new drawing to the 3 others, or will I lose something? If I click Look at it in
Neuroglancer now, nothing happens."* — and, a minute later: *"add it to the dataset also does
nothing."*

HE HAD ALREADY LOST THEM BY THE TIME HE ASKED. Reproduced exactly, headless, before changing
anything:

    after Use:      pending rings = 48, #tracingFound shown = true
    draft saved:    48 contours, used=true
    after padOpen:  TRACING_PENDING = null, PAD.inst = 0, #tracingFound still shown = true
    volume lines:   STILL THERE (stale)
    draft NOW:      0 contours

Three separate faults, in the order they did damage.

1. AN EMPTY PAD OVERWROTE A GOOD DRAFT. draftSave refuses to save an empty pad -- "saving it would
   quietly destroy the one already kept", says the comment, which is exactly right -- but the guard
   is `!rings.length && !pending.length && !used`, and `used` means "the naming block is showing".
   padOpen leaves that block showing, so `used` was true, so the guard did not fire, so a pad with
   nothing on it replaced a draft with forty-eight contours. The guard was written about the pad and
   should have been written about THE DRAFT: a save may never reduce kept work to nothing. That is
   now unconditional, and `used` keeps its old job only where there is nothing to destroy.

2. OPENING THE PAD SOMEWHERE ELSE THREW THE WORK AWAY. `PAD = UJ.tracepad.create()` and
   `TRACING_PENDING = null`, both unconditionally -- which is why the drawing number started over.
   Nobody types a fresh coordinate to add another SECTION to the organelle they are already on;
   the card teaches `,` and `.` for that. Typing a coordinate means "go there and draw the next
   thing". So with contours in hand the pad now MOVES: same contours, same numbering, and the next
   free number started for you, which is the "append this extra new drawing to the 3 others" he
   asked for. Contours read off a pasted link are adopted the same way -- they are already
   `{z, points, inst}`, the shape the pad stores -- rather than being dropped on the floor.

3. THE CARD WENT ON DESCRIBING CONTOURS THAT WERE GONE. Three volume lines, a cell type, two ids,
   all left on screen by a padOpen that had just set TRACING_PENDING to null -- and both buttons
   under them silent, because tracingCurrentAll() returns [] and tracingKeep() does
   `if(!all.length)return;` without a word. A tool that shows you a volume for contours it does not
   have is worse than one that shows nothing. Clearing is one function now, so the two can never
   drift apart, and the empty case says so out loud.

WHAT THIS DOES NOT DO is get his three lysosomes back. The draft is one localStorage key and it has
been overwritten; TRACINGS_KEPT is empty. They have to be traced again.

Run: python3 src/a_save_never_takes_work_away.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DRAFT = [
    (u'''function draftSave(explicit){
  const d = draftNow();
  if (!d) return null;
  if (!d.rings.length && !d.pending.length && !d.used){
    /* An empty pad is not a draft, and saving it would quietly destroy the one already kept. */
    if (explicit) padSay("Nothing to save yet \\u2014 close a contour first.", true);
    return null;
  }''',
     u'''function draftSave(explicit){
  const d = draftNow();
  if (!d) return null;
  if (!d.rings.length && !d.pending.length){
    /* ── A SAVE MAY NEVER REDUCE KEPT WORK TO NOTHING ──────────────────────────  2026-09-19
       Søren: *"I saved a draft of 3 lysosomes... but then the drawing number started over."*
       He lost all three here. The intent was already right -- "saving it would quietly destroy the
       one already kept" is what the old comment said -- but the guard was `&& !d.used`, and `used`
       only means "the naming block is showing", which padOpen leaves showing. So an empty pad,
       opened at another coordinate, wrote itself over forty-eight contours.

       The guard was about the pad; it should have been about THE DRAFT. An empty pad never
       replaces a draft that has contours in it, whatever else is on screen and whether the save
       was asked for or automatic. `used` keeps its old job underneath, where there is nothing to
       destroy: it is what lets the fields be kept before the first contour is closed. */
    const kept = draftRead();
    if (kept && kept.rings.length){
      if (explicit)
        padSay("Nothing on the pad to save \\u2014 so the " + kept.rings.length + " contour"
          + (kept.rings.length === 1 ? "" : "s") + " already kept " + (kept.rings.length === 1
          ? "is" : "are") + " left alone. Resume them from the bar above.", true);
      return null;
    }
    if (!d.used){
      if (explicit) padSay("Nothing to save yet \\u2014 close a contour first.", true);
      return null;
    }
  }''',
     "an empty pad can never overwrite a draft that has contours"),
]

CLEAR = [
    (u'''function tracingReadLink(){''',
     u'''/* ── THE CARD STOPS DESCRIBING WHAT IT NO LONGER HAS ───────────────────────────  2026-09-19
   Søren: *"If I click Look at it in Neuroglancer now, nothing happens"* — and *"add it to the
   dataset also does nothing."* Both were true, and both had the same cause: padOpen had set
   TRACING_PENDING to null and left the whole block below on screen, three volume lines and all. A
   tool showing a volume for contours it does not have is worse than one showing nothing, and two
   buttons that fail in silence beside it is worse again.

   One function, so the state and the thing describing it cannot drift apart. */
function tracingPendingClear(){
  TRACING_PENDING = null;
  const f = document.getElementById("tracingFound");
  if (f) f.style.display = "none";
  const v = document.getElementById("tracingVolSay");
  if (v) v.textContent = "";
  const l = document.getElementById("tracingLayers");
  if (l){ l.style.display = "none"; l.innerHTML = ""; }
  try { pad3DRelease(); } catch (_e){}
}

function tracingReadLink(){''',
     "clearing the pending tracing clears the card that describes it"),

    (u'''function tracingCurrentAll(){
  if(!TRACING_PENDING)return [];
  const rings=TRACING_PENDING.rings||[];''',
     u'''function tracingCurrentAll(){
  /* IT SAYS SO NOW, 2026-09-19. Returning [] in silence is what made "Add it to the dataset" and
     "Look at it in Neuroglancer" both do nothing at all on a card that was still showing three
     volumes. The other empty case below -- something with no type yet -- has always explained
     itself; this one never did. */
  if(!TRACING_PENDING||!(TRACING_PENDING.rings||[]).length){
    tracingSay("There are no contours in hand. Draw some on the pad and press \\u201cUse these "
      +"contours\\u201d, or paste a Neuroglancer link above and read it.",true);
    return [];
  }
  const rings=TRACING_PENDING.rings||[];''',
     "...and an empty card says why the buttons do nothing"),
]

OPEN = [
    (u'''function padOpen(){
  const got = tracingPos();
  if (got.error){ tracingSay(got.error, true); return; }
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure({ em: SRC.em, res: UJ.cfg ? UJ.cfg.res : [4, 4, 40] });
  PAD = UJ.tracepad.create();
  PAD.z = got.pos[2];
  PAD_CENTRE = got.pos.slice();
  PAD_VIEW = null; PAD_BASE_READY = false;
  /* A FRESH PAD IS A FRESH STRUCTURE. Opening the pad after editing somebody's tracing must not
     leave its id attached, or the next cell you draw would be filed as the next version of theirs.
     The ghosts go too: they belong to the ids that were in the boxes. */
  PAD_EDIT_ID = ""; TRACING_PENDING = null; PAD3D_MESHES = null; PAD3D_KEY = "";''',
     u'''function padOpen(){
  const got = tracingPos();
  if (got.error){ tracingSay(got.error, true); return; }
  if (!UJ.emtiles.configured())
    UJ.emtiles.configure({ em: SRC.em, res: UJ.cfg ? UJ.cfg.res : [4, 4, 40] });

  /* ── WITH WORK IN HAND, THIS MOVES THE PAD; IT DOES NOT REPLACE IT ─────────────  2026-09-19
     Søren: *"I then moved to another coordinate to continue segmenting, but then the drawing
     number started over... Can I append this extra new drawing to the 3 others?"*

     It started over because both lines below ran unconditionally: a brand new pad, and
     TRACING_PENDING thrown away. Everything he had drawn went with them.

     NOBODY TYPES A COORDINATE TO ADD A SECTION. The card teaches `,` and `.` for stepping through
     an organelle you are already on, so typing a coordinate and pressing this means "go there and
     draw the NEXT thing". Hence: keep the contours, keep the numbering, move the field, and start
     the next free number — which is the appending he asked for, without a question to answer.
     Contours read off a pasted link are adopted rather than dropped: they are already
     {z, points, inst}, which is exactly what the pad stores. */
  const inHand = (PAD && PAD.rings && PAD.rings.length) ? PAD.rings.slice()
               : (TRACING_PENDING && (TRACING_PENDING.rings || []).length)
                 ? TRACING_PENDING.rings.map(function(r){
                     return { z: r.z, points: r.points, inst: r.inst || 0 }; })
                 : null;
  if (inHand){
    if (!PAD) PAD = UJ.tracepad.create();
    PAD.rings = inHand;
    PAD.z = got.pos[2];
    PAD_CENTRE = got.pos.slice();
    PAD_VIEW = null; PAD_BASE_READY = false;
    const n = UJ.tracepad.newInstance(PAD);          // the next free number, not the count
    document.getElementById("tracePadWrap").style.display = "";
    /* SAID WHEN THE PAD IS ACTUALLY SHOWING THE NEW PLACE, not before. padDraw is asynchronous and
       ends with a padSay of its own either way, so anything said here would be overwritten a moment
       later by "48 contour(s) kept" — or, if the EM could not be read, by an error this has no
       business burying. One line, consumed once, appended to whatever padDraw concludes. */
    PAD_SAY_NEXT = "Your " + inHand.length + " contour" + (inHand.length === 1 ? "" : "s")
      + " came with you \\u2014 anything you draw here is number " + (n + 1)
      + ". Click a number in the strip to add to that one instead.";
    padDraw();
    padRings();
    tracingResolveAt(got.pos);
    return;
  }

  PAD = UJ.tracepad.create();
  PAD.z = got.pos[2];
  PAD_CENTRE = got.pos.slice();
  PAD_VIEW = null; PAD_BASE_READY = false;
  /* A FRESH PAD IS A FRESH STRUCTURE. Opening the pad after editing somebody's tracing must not
     leave its id attached, or the next cell you draw would be filed as the next version of theirs.
     The ghosts go too: they belong to the ids that were in the boxes.
     tracingPendingClear() rather than `TRACING_PENDING = null` since 2026-09-19: setting it to null
     on its own left the card below showing three volumes for contours that no longer existed. */
  PAD_EDIT_ID = ""; tracingPendingClear(); PAD3D_MESHES = null; PAD3D_KEY = "";''',
     "opening the pad elsewhere carries the work instead of replacing it"),
]

KEEP = [
    (u'''  tracingWrite(TRACINGS_KEPT);
  TRACING_PENDING=null;
  /* Committed: the contours are in the dataset now and the card is about nothing. A preview left
     behind would be of a tracing that is no longer pending -- and the block it lives in is being
     hidden anyway, so its context would sit there lost to nobody. */
  pad3DRelease();
  document.getElementById("tracingFound").style.display="none";''',
     u'''  tracingWrite(TRACINGS_KEPT);
  /* Committed: the contours are in the dataset now and the card is about nothing. The preview goes
     with it -- a context left behind belongs to a tracing that is no longer pending -- and so do
     the volume lines, which is the same clearing padOpen needs and is therefore the same function.
     2026-09-19: this used to be three statements here and one of them missing there. */
  tracingPendingClear();''',
     "committing clears the card through the same one function"),

    # ── AND THE PAD, WHICH IT ALREADY SAID WAS FINISHED ──────────────────────────────────────
    # draftClear() below already states that this work is no longer unfinished. Leaving the
    # contours ON the pad contradicted that, and harmlessly so only while padOpen threw them away
    # anyway -- now that it carries them, a pad still full after a commit would file the next thing
    # drawn together with contours that are already in the dataset, and add them a second time.
    (u'''  draftClear();
  PAD_EDIT_ID = "";''',
     u'''  draftClear();
  /* THE PAD IS FINISHED TOO, 2026-09-19. draftClear() one line up already says this work is no
     longer unfinished; the pad has to agree, or the next thing drawn joins contours that are
     already in the dataset and goes in again with them. (Harmless until today, because padOpen
     replaced the pad regardless -- which is the bug this is part of fixing.) The way back to a
     tracing after it is added is "Show the tracings in the dataset", which opens it for editing
     with its id attached, so nothing is stranded. */
  if (PAD){
    PAD.rings = []; PAD.pending = []; PAD.stroke = null; PAD.inst = 0;
    PAD_INST_KIND = {}; PAD_INST_COLOUR = {};
    try { padPaint(); padRings(); } catch (_e){}
  }
  PAD_EDIT_ID = "";''',
     "...and empties the pad, whose contours are now in the dataset"),
]



SAYNEXT = [
    (u"""var PAD_BASE = null, PAD_BASE_READY = false;""",
     u"""var PAD_BASE = null, PAD_BASE_READY = false;
/* ONE LINE, SAID ONCE, WHEN THE SECTION IS ON SCREEN.  2026-09-19. padDraw is asynchronous and
   finishes with a padSay whatever happens, so a caller that says something before calling it is
   overwritten a moment later -- which is how "your contours came with you" vanished behind
   "48 contour(s) kept" in testing, and would have vanished behind "Could not read the EM there"
   in the field. Set this instead and padDraw appends it to its own conclusion, once. */
var PAD_SAY_NEXT = "";""",
     "a one-shot note the draw appends when it lands"),

    (u'''    padSay(UJ.tracepad.count(PAD).rings + " contour(s) kept, "
      + (PAD.pending.length ? PAD.pending.length + " vertices on this one \\u2014 click the ring to close it"
                            : "click each vertex round the cell"));''',
     u'''    padSay(UJ.tracepad.count(PAD).rings + " contour(s) kept, "
      + (PAD.pending.length ? PAD.pending.length + " vertices on this one \\u2014 click the ring to close it"
                            : "click each vertex round the cell")
      + (PAD_SAY_NEXT ? " " + PAD_SAY_NEXT : ""));
    PAD_SAY_NEXT = "";''',
     "...which the successful draw says and spends"),

    (u'''    padSay("Could not read the EM there: " + String(e && e.message || e), true);''',
     u'''    /* Spent unsaid rather than carried: a note about a move that did not finish would turn
       up appended to the next section that does, out of nowhere. */
    PAD_SAY_NEXT = "";
    padSay("Could not read the EM there: " + String(e && e.message || e), true);''',
     "...and a failed draw spends it without saying it"),
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


edit("ujump.html", DRAFT + CLEAR + SAYNEXT + OPEN + KEEP)
print("\nnow: node tracingcarrycheck.js && node tracingpanelcheck.js && node tracinglayerscheck.js "
      "&& python3 src/build_stamps.py")
