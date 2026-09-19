# -*- coding: utf-8 -*-
u"""A centre is registered once.                                                 2026-09-19

Søren: *"the 3 lysosomes I have segmented seem to have 2 annotation points each, where one of them
has 2 different point locations, perhaps because I edited it. We need to fix this, they should only
have one annotation point."*

His own annotation list, six rows for three lysosomes:

    295844 151391 17862     295974 151346 17838     295812 151370 17901
    295844 151391 17862     295974 151346 17838     295813 151358 17899
    └ identical            └ identical            └ MOVED: the geometry changed

WHAT DOES IT. tracingPublish guards the centre with `t.centre_registered`, and the comment above it
is right about what it wants: *"Once per tracing, not once per press."* But tracingKeep builds a
FRESH record every time and carries only one field across from the previous one:

    if(prior&&prior.shared_at)t.shared_at=prior.shared_at;

`centre_registered` is not carried, so the new record has never registered anything and posts a
second point. Adding the same tracing twice gives two identical points; editing it first gives two
different ones, which is the pair he noticed.

WHY NOT SIMPLY CARRY THE FLAG. Because for the edited lysosome the OLD point is now wrong: the
outline moved and its centroid moved with it. Refusing to post would leave the stale coordinate
standing, which is a quieter error than a duplicate and a worse one. So the coordinate is carried
too, and a centre is re-registered exactly when it has MOVED -- which is the same rule the flag was
reaching for, stated about the thing that matters rather than about the act of pressing.

AND THE BACKEND IS THE ONE THAT CAN ACTUALLY PROMISE IT. This flag lives in localStorage: another
browser, a cleared cache, or a second person adding to the same tracing all get past it. So
backend/src_one_centre_per_tracing.py makes an organelle_location carrying a `fromStructureId`
REPLACE the row that structure already has, and `tidyTracingCentres()` folds the ones already
written. The page's job is not to send a duplicate; the backend's is to be unable to keep one.

Run: python3 src/a_centre_is_registered_once.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    (u'''    const prior=at>=0?TRACINGS_KEPT[at]:null;
    if(prior&&prior.shared_at)t.shared_at=prior.shared_at;''',
     u'''    const prior=at>=0?TRACINGS_KEPT[at]:null;
    if(prior&&prior.shared_at)t.shared_at=prior.shared_at;
    /* ── AND WHAT IT HAS ALREADY REGISTERED ─────────────────────────────────────  2026-09-19
       Søren: *"the 3 lysosomes I have segmented seem to have 2 annotation points each... they
       should only have one annotation point."*

       `shared_at` was carried across a re-add and `centre_registered` was not, so every re-add
       looked like a tracing that had never registered its centre and posted a second point. The
       COORDINATE comes with it, because the flag alone would be the wrong fix for the other half of
       what he saw: when an outline is edited its centroid moves, and a tracing that refuses to
       re-register leaves the stale point standing. Moved is the question; pressed is not. */
    if(prior&&prior.centre_registered)t.centre_registered=prior.centre_registered;
    if(prior&&prior.centre_at)t.centre_at=prior.centre_at;''',
     "a re-add carries what the tracing has already registered"),

    (u'''  /* AFTER the tracing, and only if the tracing went: an annotation pointing at an outline that was
     refused would be a coordinate with nothing behind it. Once per tracing, not once per press, so
     a queued one registers its centre when it finally goes out too. */
  if(!t.centre_registered&&tracingRegisterCentre(t))t.centre_registered=true;''',
     u'''  /* AFTER the tracing, and only if the tracing went: an annotation pointing at an outline that was
     refused would be a coordinate with nothing behind it. Once per tracing, not once per press, so
     a queued one registers its centre when it finally goes out too.

     ONCE PER PLACE, since 2026-09-19. "Once per tracing" was the intent and `centre_registered`
     the mechanism, but tracingKeep did not carry it and every re-add posted again. It carries it
     now, and the test is whether the centre has MOVED rather than whether anything was pressed:
     an unchanged re-add posts nothing, and an edited outline posts its new centre, which the
     backend files over the old one rather than beside it. */
  const centreNow=tracingCentreAt(t);
  /* A RECORD THAT SAYS REGISTERED BUT NOT WHERE is every tracing kept before today, and treating
     "place unknown" as "moved" would have re-registered all of them at once. So: never registered
     and it has a centre -> register; registered and the place is KNOWN to have changed -> register;
     registered with no place recorded -> leave it alone. The last of those means an old tracing
     edited tomorrow keeps its old point rather than gaining a second, which is the conservative
     direction of the two and the one this whole change is about. Caught by tracingpanelcheck.js,
     whose fourth tracing is exactly that record. */
  const moved=t.centre_registered
    ? !!(t.centre_at&&centreNow&&centreNow!==t.centre_at)
    : !!centreNow;
  if(moved&&tracingRegisterCentre(t)){
    t.centre_registered=true;
    t.centre_at=centreNow;
  }''',
     "...and only registers again when the centre has actually moved"),

    (u'''function tracingRegisterCentre(t){''',
     u'''/* Where a tracing's centre is, as the string the annotation carries, or "" for a tracing that
   has no business having one. Split out of tracingRegisterCentre so that "has this moved?" can be
   asked without posting anything -- the two were one function, which is why the only question
   available was "has anything been pressed?". */
function tracingCentreAt(t){
  try {
    if (!t || !t.rings || !t.rings.length) return "";
    const kind = String(t.kind || "").toLowerCase();
    if (!kind || kind === "cell" || kind === "nucleus") return "";
    if (!window.UJ || !UJ.organellelink) return "";
    if (!String(t.nucleus_id || "") && !String(t.root_id || "")) return "";
    const c = UJ.organellelink.centre(t.rings);
    return (c && c.point) ? c.point.join(",") : "";
  } catch (_e){ return ""; }
}
function tracingRegisterCentre(t){''',
     "there is a way to ask where the centre is without posting it"),
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


edit("ujump.html", PAIRS)
print("\nnow: node tracingcentrecheck.js && node tracingpanelcheck.js && python3 src/build_stamps.py")
