# -*- coding: utf-8 -*-
u"""The tracing card carries a default look for its link box, below any page's own.       2026-09-22

Søren, with a screenshot of ωJump: "This looks weird in wJump" -- the Neuroglancer link box was the
browser's bare textarea: white, two rows, a fifth of the card wide. ωJump styles input[type=text]
and select but has no textarea rule; the other pages have one. mount() now puts a <style> FIRST in
<head> with the card's defaults (width, height, the page's own --bg/--ink/--line/--mono tokens), so
a page with its own textarea rule keeps it -- same specificity, earlier in the cascade -- and a page
without one gets a box that matches its inputs.

Check: cardtextareacheck.js. Run: python3 src/the_card_styles_its_own_link_box.py, then
python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "core/tracingcard.js")
s = io.open(P, encoding="utf-8").read()
OLD = u'''UJ.tracingcard.mount = function(el){
  el = el || document.getElementById("tracingCard");'''
NEW = u'''/* ── A DEFAULT LOOK FOR THE LINK BOX ─────────────────────────────────────────  2026-09-22
   First in <head>, so any page's own textarea rule wins over it; ωJump has none, and showed the
   browser's bare white box. See src/the_card_styles_its_own_link_box.py. */
function tracingCardDefaultStyle(){
  if (document.getElementById("tracingCardDefaults")) return;
  var st = document.createElement("style");
  st.id = "tracingCardDefaults";
  st.textContent = "textarea{width:100%;box-sizing:border-box;min-height:64px;resize:vertical;"
    + "background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;"
    + "padding:9px 11px;font-family:var(--mono,ui-monospace,monospace);font-size:12px}";
  var head = document.head || document.documentElement;
  head.insertBefore(st, head.firstChild);
}
UJ.tracingcard.mount = function(el){
  try { tracingCardDefaultStyle(); } catch (_e){}
  el = el || document.getElementById("tracingCard");'''
if NEW in s: print("  already there: the card's default link box")
else:
    assert s.count(OLD) == 1; s = s.replace(OLD, NEW, 1)
    io.open(P, "w", encoding="utf-8").write(s); print("  ok: the card's default link box")
