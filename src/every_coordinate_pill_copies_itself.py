# -*- coding: utf-8 -*-
u"""Every coordinate pill copies itself, wherever it is.                                 2026-10-03

Søren, with a screenshot of the coordinate search: *"This nearest nucleus coordinate should be
copied when clicking it"*.

IT ALREADY SAID IT WOULD. coordSpan() has produced `<span class="idval" title="click to copy">`
since it was written, and .idval's CSS gives it `cursor:pointer` and an accent border on hover. So
the pill looks clickable, promises in its tooltip to copy, changes under the pointer -- and on that
line did nothing at all, which is worse than a pill that looked inert.

THE HANDLER WAS WIRED PER PANEL. Three places do

    panel.querySelectorAll(".idval").forEach(el => el.addEventListener("click", ...))

after rendering their own panel, with `panel` being that panel's element. Every .idval inside one of
those three works. The nearest-nucleus line is built by a different function into a different
container, so it got no listener -- and nothing about writing it that way makes that visible: the
markup is identical and the styling comes from a stylesheet.

ONE DELEGATED LISTENER, ON THE DOCUMENT, and the three per-panel wirings go. A delegated listener
cannot miss a pill, because it does not know where the pills are: it matches on the click. That is
the difference between "every place I remembered to wire" and "every pill", and the whole reason
this bug existed.

The behaviour is unchanged where it already worked -- copy the text, say "copied" for 900 ms, put
the text back -- and the three removed wirings would otherwise have fired alongside it, copying
twice and running two overlapping timeouts over the same label.

Check: coordcopycheck.js.
Run: python3 src/every_coordinate_pill_copies_itself.py, then python3 src/build_stamps.py
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


PER_PANEL = (u'  panel.querySelectorAll(".idval").forEach(el=>el.addEventListener("click",()=>'
             u'{navigator.clipboard&&navigator.clipboard.writeText(el.dataset.c);'
             u'const o=el.textContent;el.textContent="copied";'
             u'setTimeout(()=>el.textContent=o,900);}));\n')

DELEGATED = u'''/* ── EVERY COORDINATE PILL COPIES ITSELF ───────────────────────────  2026-10-03
   Søren: "This nearest nucleus coordinate should be copied when clicking it."

   It already said it would: coordSpan() writes title="click to copy" and .idval is styled with a
   pointer cursor and a hover border. What it did not have was a listener, because the listener was
   wired THREE TIMES, each over one panel's own elements -- and the nearest-nucleus line is built by
   a different function into a different container. A pill that looks clickable, promises to copy
   and does nothing is worse than one that looks inert.

   DELEGATED, so it cannot miss one. This listener does not know where the pills are; it matches on
   the click, which means a pill added anywhere in this file next year works without anybody
   remembering this. The three per-panel wirings are gone: left in, they would have fired alongside
   this one, copying twice and running two overlapping timeouts over the same label. */
document.addEventListener("click",function(e){
  var el=e.target&&e.target.closest?e.target.closest(".idval"):null;
  if(!el||!el.dataset||!el.dataset.c)return;
  try{ navigator.clipboard&&navigator.clipboard.writeText(el.dataset.c); }catch(_c){}
  /* The pill says so itself rather than raising a toast: it is a small confirmation about one small
     thing, and it belongs where the pointer already is. */
  if(el.dataset.copying)return;
  el.dataset.copying="1";
  var o=el.textContent;
  el.textContent="copied";
  setTimeout(function(){ el.textContent=o; delete el.dataset.copying; },900);
});
'''

# FIVE, not three: four over a `panel` and one over an `out`. Counted rather than assumed -- the
# first version of this file asserted three, which is how many `panel.` wirings a quick grep showed
# before the two later ones were noticed.
OUT_FORM = PER_PANEL.replace(u"  panel.", u"  out.")

s = io.open(os.path.join(HERE, "ujump.html"), encoding="utf-8").read()
n = s.count(PER_PANEL) + s.count(OUT_FORM)
print("ujump.html")
if DELEGATED in s:
    print("  already there: one delegated copy listener")
else:
    assert n == 5, "expected five per-container wirings, found %d" % n
    s = s.replace(PER_PANEL, u"").replace(OUT_FORM, u"")
    print("  ok: removed %d per-container wirings" % n)
    # The comment that pointed at one of them now points at nothing.
    s = s.replace(u'ID row (see panel.querySelectorAll(".idval") below)',
                  u'ID row (see the delegated .idval listener beside coordSpan)')
    # Beside coordSpan, which is what makes the pills: the rule and the markup in one place.
    anchor = u"function coordSpan(x,y,z){"
    assert s.count(anchor) == 1
    s = s.replace(anchor, DELEGATED + anchor, 1)
    print("  ok: one delegated listener, beside the function that makes the pills")
    io.open(os.path.join(HERE, "ujump.html"), "w", encoding="utf-8").write(s)

print("\nNow: node coordcopycheck.js, then python3 src/build_stamps.py")
