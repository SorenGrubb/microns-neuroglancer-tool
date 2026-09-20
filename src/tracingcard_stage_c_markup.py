# -*- coding: utf-8 -*-
u"""core/tracingcard.js, stage C: the card builds itself.                        2026-09-20

The last thing still µJump's: 196 lines of the card's MARKUP, sitting in ujump.html's body. The
module wires it by id and cannot produce it, so a tool that loads core/tracingcard.js today gets
3,500 lines of behaviour and nothing on screen.

THE MARKUP IS NOT RETYPED. It is read out of ujump.html and emitted as a JS array of
JSON-encoded lines, mechanically — 196 lines of HTML carrying single quotes, double quotes,
&mdash; entities, inline styles and forty title="..." tooltips is exactly the kind of thing a
human transcription gets 99% right, and the 1% is a tooltip that silently loses its closing quote
and eats the next attribute. Nothing here is typed by hand, so nothing can be mistyped.

    function tracingCardHtml(){
      return [
        "<details id=\\"tracingPanel\\">",
        ...
      ].join("\\n");
    }

A LINE ARRAY RATHER THAN ONE LONG STRING, so a future diff of this file is line-for-line against
the markup it came from. A template literal would read better and was rejected: this block has no
backtick and no ${ in it today, and the first one somebody adds would be a syntax error in a file
nobody was editing.

── WHAT µJUMP KEEPS ────────────────────────────────────────────────────

The wrapper: `<div class="card" id="tracingCard"></div>`, empty. WHERE the card sits on the page is
the page's decision — µJump puts it in the Jump tab between two other cards, and a tool with a
different layout will put it somewhere else. What is inside it is the module's.

The comment above the wrapper stays in ujump.html too. It explains why this dataset needs the
feature at all (\"the top of minnie65 is the case: nuclei are segmented up there and cells are
not\"), which is a fact about minnie65, not about the card.

── AND THE MOUNT ─────────────────────────────────────────────────────

UJ.tracingcard.wire() became UJ.tracingcard.mount(): fill the wrapper, then wire what was filled.
It refuses to overwrite a wrapper that already has something in it, so a page that still carries
its own copy of the markup is left alone rather than having it replaced underneath.

Run: python3 src/tracingcard_stage_c_markup.py
"""
import io
import os
import json

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(HERE, "ujump.html")
MOD = os.path.join(HERE, "core", "tracingcard.js")

OPEN_LINE = u'<div class="card" id="tracingCard">'
MARKER = u"function tracingCardHtml("


def main():
    src = io.open(PAGE, encoding="utf-8").read()
    L = src.split("\n")

    starts = [i for i, l in enumerate(L) if l.startswith(OPEN_LINE)]
    assert len(starts) == 1, "ujump.html: %d candidates for the card's wrapper" % len(starts)
    a = starts[0]

    # Depth over div AND details -- counting only div lands five lines short, on the </details>
    # that closes #tracingPanel, and takes the card's own closing tag with it.
    import re
    depth = 0
    b = None
    for j in range(a, len(L)):
        depth += (len(re.findall(r'<(?:div|details)\b', L[j]))
                  - len(re.findall(r'</(?:div|details)>', L[j])))
        if j > a and depth <= 0:
            b = j
            break
    assert b is not None, "ujump.html: the tracing card never closes"
    assert L[b].strip() == u"</div>", "the card's last line is %r, not </div>" % L[b][:40]

    inner = L[a + 1:b]
    print("  the card: lines %d-%d, %d of markup inside the wrapper" % (a + 1, b + 1, len(inner)))

    # What must be in it, so a range that is short says so rather than shipping half a card.
    blob = "\n".join(inner)
    for must in ['id="tracingPanel"', 'id="tracePad"', 'id="tracingLink"', 'id="tracingWhat"',
                 'id="tracePadMip"', 'id="tracingShared"', 'id="tracePadHelp"',
                 'id="tracingDraftBar"']:
        assert must in blob, "the card's markup does not contain %s" % must
    for never in ['id="filterCard"', 'data-tabpanel', 'id="nucpanel"']:
        assert never not in blob, "the card's markup has run on into %s" % never
    print("  8 required ids present, 3 neighbours absent")

    # ── the function, emitted rather than transcribed ─────────────────────────────────────────
    lines = ",\n".join('    ' + json.dumps(l, ensure_ascii=False) for l in inner)
    fn = (u'''/* ── THE CARD'S OWN MARKUP ────────────────────────────────  2026-09-20
   Read out of ujump.html and emitted mechanically by src/tracingcard_stage_c_markup.py — not
   retyped. 196 lines of HTML with single quotes, double quotes, entities, inline styles and forty
   title="..." tooltips is the kind of thing a transcription gets 99%% right, and the 1%% is a
   tooltip that quietly loses a quote and swallows the next attribute.

   A LINE ARRAY, not one long string, so a diff of this file reads line-for-line against the markup
   it came from. Not a template literal: there is no backtick and no ${} in here today, and the
   first one somebody added would be a syntax error in a file they were not editing.

   The WRAPPER is not here. `<div class="card" id="tracingCard">` stays in the host page, because
   where the card sits is the page's decision and what is inside it is this module's. */
function tracingCardHtml(){
  return [
%s
  ].join("\\n");
}
''' % lines)

    mod = io.open(MOD, encoding="utf-8").read()
    assert MARKER not in mod, "core/tracingcard.js already has tracingCardHtml"
    anchor = u"/* ── WHERE THE TWO WIRING PASSES ARE CALLED FROM"
    assert mod.count(anchor) == 1, "the wiring block's comment is not where it was"
    mod = mod.replace(anchor, fn + u"\n" + anchor, 1)

    # ── wire() becomes mount() ────────────────────────────────────────────────────────────────
    OLD_WIRE = u'''UJ.tracingcard = UJ.tracingcard || {};
UJ.tracingcard.wire = function(){
  if (UJ.tracingcard._wired) return false;
  var padEl = document.getElementById("tracePad"),
      typeEl = document.getElementById("tracingType");
  if (!padEl && !typeEl) return false;        // the card is not on the page (yet)'''
    NEW_WIRE = u'''UJ.tracingcard = UJ.tracingcard || {};
/* ── FILL THE WRAPPER, THEN WIRE WHAT WAS FILLED ───────────────────  2026-09-20
   A host supplies an empty `<div class="card" id="tracingCard"></div>` wherever the card belongs
   in its layout, and this puts the card in it.

   IT WILL NOT OVERWRITE A WRAPPER THAT ALREADY HAS SOMETHING IN IT. A page still carrying its own
   copy of the markup keeps it — the module wires what is there instead of replacing it underneath
   somebody who has edited it. */
UJ.tracingcard.mount = function(el){
  el = el || document.getElementById("tracingCard");
  if (el && !el.firstElementChild) {
    try { el.innerHTML = tracingCardHtml(); }
    catch (e){ try { console.warn("tracingcard: mount", e); } catch (_c){} return false; }
  }
  return UJ.tracingcard.wire();
};
UJ.tracingcard.wire = function(){
  if (UJ.tracingcard._wired) return false;
  var padEl = document.getElementById("tracePad"),
      typeEl = document.getElementById("tracingType");
  if (!padEl && !typeEl) return false;        // the card is not on the page (yet)'''
    assert mod.count(OLD_WIRE) == 1, "the wire() entry point is not where stage A left it"
    mod = mod.replace(OLD_WIRE, NEW_WIRE, 1)

    OLD_CALL = u'''    document.addEventListener("DOMContentLoaded", function(){ UJ.tracingcard.wire(); });
  else UJ.tracingcard.wire();'''
    NEW_CALL = u'''    document.addEventListener("DOMContentLoaded", function(){ UJ.tracingcard.mount(); });
  else UJ.tracingcard.mount();'''
    assert mod.count(OLD_CALL) == 1, "the DOMContentLoaded call is not where stage A left it"
    mod = mod.replace(OLD_CALL, NEW_CALL, 1)
    io.open(MOD, "w", encoding="utf-8").write(mod)
    print("  ok: core/tracingcard.js builds the card and mounts it")

    # ── the page keeps the wrapper and the reason it wants one ────────────────────────────────
    out = L[:a] + [OPEN_LINE + u"<!-- filled by core/tracingcard.js's tracingCardHtml() on load; "
                   u"where the card sits is this page's decision, what is in it is the module's "
                   u"-->" + u"</div>"] + L[b + 1:]
    io.open(PAGE, "w", encoding="utf-8").write("\n".join(out))
    print("  ok: ujump.html keeps an empty wrapper (%d lines shorter)" % (len(L) - len(out)))


if __name__ == "__main__":
    if MARKER in io.open(MOD, encoding="utf-8").read():
        print("  already there: the module builds the card")
    else:
        main()
    print(u"\nnow: node tracingcardhtmlcheck.js && ./baseline_tracing.sh > /tmp/afterD.txt "
          u"&& diff /tmp/after.txt /tmp/afterD.txt")
