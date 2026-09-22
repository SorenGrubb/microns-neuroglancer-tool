# -*- coding: utf-8 -*-
u"""Tips across the top of the tracing pad's EM panel, with a tick on the left to turn them off.   2026-09-22

Søren: "We need a tip function where tips about navigating the tracing panel are shown in the top of
the em panel, and a tick in the left side that can turn it off. Also, mix in tips of identifying
organelles and how they can send suggestions to change the tools to me."

A bar is the first thing inside the EM frame, above the section: a "Tips" tick on the left, one tip,
and a › for the next one. A new tip each time the pad opens and every 25 s while it is open and on
screen. Unticked, the tip and the › go and the tick stays, so they can be turned back on; the choice
is kept like the pen tick (tracingStore, key jump_pad_tips_off_v1).

THREE KINDS, MIXED: how to work the pad (every gesture named is one the pad has -- and a tip about a
control a host has trimmed, like λJump's segmentation tick, is left out), how to recognise the
organelles people trace (each with a link to where to check it: the EM atlas the project trusts,
Jastrow's, and PMC7930431 for the microglia/macrophage lysosome cue the identification tree already
cites), and, every sixth tip, how to send a suggestion: a mailto to UJ.cfg.tracing.suggestTo, which
defaults to soren@grubb.dk, with the tool's name in the subject.

Check: padtipscheck.js. Run: python3 src/the_pad_gives_tips.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "core/tracingcard.js")
s = io.open(P, encoding="utf-8").read(); b = s


def edit(name, old, new):
    global s
    if new in s: print("  already there: " + name); return
    assert s.count(old) == 1, "%s: %d" % (name, s.count(old))
    s = s.replace(old, new, 1); print("  ok: " + name)


FRAME = u'''    "<div style=\\"position:relative;margin-top:8px;overflow:auto;border:1px solid var(--line);border-radius:7px;background:#111\\">",'''
# Guarded on the bar's id, not on the whole block: a later edit adds a line inside it.
if u'id=\\"tracePadTipBar\\"' in s: print("  already there: the tip bar, at the top of the EM panel")
else: edit(u"the tip bar, at the top of the EM panel",
     FRAME,
     FRAME + u'''
    "<!-- TIPS, 2026-09-22 (src/the_pad_gives_tips.py): the tick on the left turns them off. -->",
    "<div id=\\"tracePadTipBar\\" style=\\"position:sticky;left:0;display:flex;gap:10px;align-items:center;padding:6px 10px;background:var(--card);color:var(--ink);border-bottom:1px solid var(--line);font-size:12.5px;line-height:1.4\\">",
    "<label style=\\"font-size:12px;display:flex;align-items:center;gap:5px;flex:0 0 auto;margin:0\\" title=\\"Tips about the pad, about recognising organelles, and how to suggest a change. Untick to hide them.\\"><input type=\\"checkbox\\" id=\\"tracePadTips\\" checked> Tips</label>",
    "<span id=\\"tracePadTip\\" style=\\"flex:1 1 auto;min-width:0\\"></span>",
    "<button type=\\"button\\" class=\\"idbtn\\" id=\\"tracePadTipNext\\" style=\\"flex:0 0 auto;padding:1px 9px\\" title=\\"Another tip\\">&rsaquo;</button>",
    "</div>",''')

TIPS = u'''/* ── TIPS ACROSS THE TOP OF THE EM PANEL ────────────────────────────────────────  2026-09-22
   Søren: "tips about navigating the tracing panel ... shown in the top of the em panel, and a tick
   in the left side that can turn it off. Also, mix in tips of identifying organelles and how they
   can send suggestions to change the tools to me." See src/the_pad_gives_tips.py.
   {kind, html, when?} -- `when` leaves out a tip about a control this host has trimmed. */
var PAD_TIP_KEY = "jump_pad_tips_off_v1", PAD_TIP_AT = -1, PAD_TIP_TIMER = null;
var PAD_TIP_ATLAS = "http://www.drjastrow.de/WAI/EM/EMAtlas.html";
function padTipCheck(txt){
  return ' <a href="' + PAD_TIP_ATLAS + '" target="_blank" rel="noopener">' + (txt || "Examples in the EM atlas") + '</a>.';
}
function padTipList(){
  var has = function(id){ return function(){ return !!document.getElementById(id); }; };
  var nav = [
    "<b>,</b> and <b>.</b> step back and on through the sections; the box beside the arrows says how many sections a step is.",
    "The zoom menu goes from a whole cell (<b>drawn half size</b>, at the top) to single organelles (<b>drawn 8&times;</b>). Your contours stay put at every zoom.",
    "<b>shift+drag</b> moves the picture, and <b>shift+click</b> centres it where you click. The arrow buttons in the corner move it half a screen.",
    "Drag any point of a contour to move it. " + PAD_RIGHT.charAt(0).toUpperCase() + PAD_RIGHT.slice(1) + " a point to delete it, or a line to put a new point in it.",
    "<b>" + PAD_MOD + "+click</b> on a contour removes the whole contour. <b>Undo</b> takes back the last point, or the last contour.",
    "Clicking: close a contour by clicking its first point again, or press <b>Enter</b>. <b>Esc</b> drops a half-drawn one.",
    "With <b>draw freehand</b> ticked, press, go all the way round, and lift. A pen switches it on by itself.",
    "Lifted the pen too early? Hold <b>alt</b> (option on a Mac) and draw on from where it stopped. End the stroke on the contour to redraw just that stretch.",
    "Several of the same organelle? <b>+ another one</b> starts the next; each gets its own colour and its own number.",
    "Outline a structure on at least two sections, a few apart, and <b>Show it in 3D</b> lofts them into a shape you can turn.",
    "<b>Save draft</b> keeps the contours, the section and the view; the pad also saves as you go, so a closed page is not lost work.",
    "When you are done, <b>Use these contours</b> hands them to the naming fields below the pad, the same place a pasted Neuroglancer link goes."
  ].map(function(h){ return { kind: "nav", html: h }; });
  nav.push({ kind: "nav", when: has("tracePadSeg"),
    html: "<b>show the segmentation</b> paints the cell the boxes below name over the section, so you can see what the automatic segmentation already has, and what it missed." });
  var organ = [
    ["<b>Mitochondria</b>: two membranes, the inner one folded into cristae across a dark matrix. Step a few sections: a mitochondrion is a tube, so its outline moves and changes length.", 0],
    ["<b>Lysosomes</b>: one membrane round dense, mixed contents. Old ones carry lipofuscin: dark granular material with pale lipid droplets.", 0],
    ["<b>Multivesicular bodies</b>: one membrane holding a handful of small round vesicles. Smaller and paler than most lysosomes.", 0],
    ["<b>Rough ER</b>: flat, parallel cisternae dotted with ribosomes. In neurons the stacks are Nissl substance.", 0],
    ["<b>Golgi apparatus</b>: a stack of curved, flattened cisternae with small vesicles at the rims, usually close to the nucleus.", 0],
    ["<b>The nucleus</b>: a double envelope interrupted by pores, dark heterochromatin along it, and the nucleolus as the densest body inside.", 0],
    ["<b>Neuron or glia?</b> A neuron has a large pale nucleus, a prominent nucleolus and Nissl substance; glia have smaller, darker nuclei and little rough ER.", 0],
    ["<b>Microglia</b>: scant dark cytoplasm, an elongated nucleus with a band of heterochromatin, and large dense lysosomes. A perivascular macrophage looks alike: where it sits decides.",
     ' <a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7930431/" target="_blank" rel="noopener">PMC7930431</a>.'],
    ["<b>Centrioles</b>: short cylinders of nine microtubule triplets, often in pairs at right angles. One at the base of a primary cilium is its basal body.", 0],
    ["<b>Synaptic vesicles</b>: clusters of small, clear, round vesicles about 40 nm across, against a dark presynaptic density.", 0],
    ["<b>Peroxisomes</b>: small, round, one membrane, a fine even granular matrix, without the mixed contents of a lysosome.", 0],
    ["<b>Lipid droplets</b>: round and homogeneous with no membrane of their own, pale or grey depending on the fixation.", 0]
  ].map(function(t){ return { kind: "organelle", html: t[0] + (t[1] || padTipCheck()) }; });
  var to = tracingCfg().suggestTo || "soren@grubb.dk";
  var subj = encodeURIComponent("Suggestion for " + (document.title || "the Jump tools").split(/\\s+[\\u2014-]\\s+/)[0]);
  var mail = '<a href="mailto:' + to + "?subject=" + subj + '">' + to + "</a>";
  var suggest = [
    "Something you would change, a gesture you miss, a tip that is wrong? Send it to S\\u00f8ren Grubb, " + mail + ", and the tool gets better for everybody.",
    "Found an organelle the list does not have, or a cell type you think is wrong? Mail " + mail + " with the coordinate, and it will be looked at."
  ].map(function(h){ return { kind: "suggest", html: h }; });
  nav = nav.filter(function(t){ return !t.when || t.when(); });
  /* Mixed: pad, organelle, pad, organelle ..., and a suggestion every sixth. */
  var mixed = [], out = [], si = 0;
  for (var i = 0; i < Math.max(nav.length, organ.length); i++){
    if (nav[i]) mixed.push(nav[i]);
    if (organ[i]) mixed.push(organ[i]);
  }
  mixed.forEach(function(t, k){
    out.push(t);
    if (k % 5 === 4) out.push(suggest[si++ % suggest.length]);
  });
  return out;
}
function padTipsOn(){
  var t = document.getElementById("tracePadTips");
  return !!(t && t.checked);
}
function padTipShow(step){
  var el = document.getElementById("tracePadTip");
  if (!el) return;
  var list = padTipList();
  if (!list.length){ el.innerHTML = ""; return; }
  PAD_TIP_AT = PAD_TIP_AT < 0 ? Math.floor(Math.random() * list.length) : (PAD_TIP_AT + (step || 1) + list.length) % list.length;
  el.innerHTML = list[PAD_TIP_AT].html;
}
function padTipsApply(){
  var on = padTipsOn();
  var tip = document.getElementById("tracePadTip"), nx = document.getElementById("tracePadTipNext");
  if (tip) tip.style.display = on ? "" : "none";
  if (nx) nx.style.display = on ? "" : "none";
}
function padTipsStart(){
  var t = document.getElementById("tracePadTips");
  if (!t) return;
  try { t.checked = tracingStore().getItem(PAD_TIP_KEY) !== "1"; } catch (_e){}
  padTipsApply();
  if (padTipsOn()) padTipShow(1);
  if (!PAD_TIP_TIMER) PAD_TIP_TIMER = setInterval(function(){
    var wrap = document.getElementById("tracePadWrap");
    if (!padTipsOn() || !wrap || wrap.style.display === "none" || document.hidden) return;
    padTipShow(1);
  }, 25000);
}
function padTipsWire(){
  var t = document.getElementById("tracePadTips"), nx = document.getElementById("tracePadTipNext");
  if (t && !t.dataset.wired){
    t.dataset.wired = "1";
    t.addEventListener("change", function(){
      try { tracingStore().setItem(PAD_TIP_KEY, t.checked ? "0" : "1"); } catch (_e){}
      padTipsApply();
      if (t.checked) padTipShow(1);
    });
  }
  if (nx && !nx.dataset.wired){
    nx.dataset.wired = "1";
    nx.addEventListener("click", function(){ padTipShow(1); });
  }
}
function padOpen(){'''
edit(u"the tips themselves", u'''function padOpen(){''', TIPS)
edit(u"a tip each time the pad opens",
     u'''function padOpen(){
  const got = tracingPos();''',
     u'''function padOpen(){
  try { padTipsStart(); } catch (_e){}
  const got = tracingPos();''')
edit(u"the tick and the › are wired with the rest",
     u'''  const pen = document.getElementById("tracePadPen");''',
     u'''  try { padTipsWire(); } catch (_e){}
  const pen = document.getElementById("tracePadPen");''')
if s != b: io.open(P, "w", encoding="utf-8").write(s)

# The links in a tip in the page's accent: the browser's default blue is unreadable on a dark theme.
s = io.open(P, encoding="utf-8").read(); b = s
edit(u"links in the page's accent",
     u'''    "<!-- TIPS, 2026-09-22 (src/the_pad_gives_tips.py): the tick on the left turns them off. -->",''',
     u'''    "<!-- TIPS, 2026-09-22 (src/the_pad_gives_tips.py): the tick on the left turns them off. -->",
    "<style>#tracePadTipBar a{color:var(--accent);text-decoration:underline}</style>",''')
if s != b: io.open(P, "w", encoding="utf-8").write(s)
