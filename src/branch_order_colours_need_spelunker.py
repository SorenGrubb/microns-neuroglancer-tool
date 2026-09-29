# -*- coding: utf-8 -*-
u"""The branch-order colours only exist in one viewer.                                   2026-09-29

Søren, with a screenshot of the capillary bed rendered in one flat gold:

    "Why are the capillaries all the same color when added to uJump? They were different colors
     in the Shih lab version depending on capillary order."

NOT THE LAYER. MEASURED. The layer µJump emits was compared field by field against the one in the
Shih lab's published state: same source, same segment, same segmentColors, same lineWidth3d, the
authors' shader verbatim, and shaderControls carrying show_BranchOrder_ACT: true. The live viewer
state read back with viewer.state.toJSON() still had show_BranchOrder_ACT: true, the control was
ticked in the rendering panel, and nothing was logged to the console. The layer is right.

IT IS THE VIEWER. That same state, opened in the two viewers one after the other:

    ngl.microns-explorer.org  ->  flat #dcb928 gold, the whole bed
    spelunker.cave-explorer.org -> the paper's jet colouring, blue through cyan to green

and the giveaway is in the shader panel. Spelunker lists the skeleton's per-vertex properties
above the code — prop_BranchOrder_ACT, prop_BranchOrder_CVT, prop_Dist_Path_ACT and the rest.
The MICrONS Neuroglancer build lists none of them: it does not expose skeleton vertex properties
to the shader at all. Every prop_*() branch is therefore dead, main() runs to its last line, and
that line is

    emitRGB(vec3(0.863, 0.725, 0.157));      // = #dcb928

which is precisely the gold in the screenshot. The colour he saw was the shader's own fallback,
not a missing shader.

SO THE FIX IS NOT IN THE LAYER, IT IS IN THE CHOICE OF VIEWER. µJump defaults to MICrONS
Neuroglancer (it has the Share button). This adds a hint that appears only when it matters —
branch order ticked AND the viewer set to something that cannot colour it — and a button that
switches the viewer in one click. Nothing is switched behind his back: he picked that viewer.

The other ten skeletons are unaffected. They colour by segmentColors, which every build honours,
and they look identical in both.

Check: visualareacheck.js (3 more assertions).
Run: python3 src/branch_order_colours_need_spelunker.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


HINT = u'''<div id="shihBOHint" style="display:none;margin-top:6px;padding:8px 10px;border:1px solid #d29922;border-radius:7px;background:#221a07;font-size:12px;line-height:1.45;color:var(--ink)">&#9888; Branch-order colours need <b>Spelunker / CAVE explorer</b>. The viewer you have selected does not expose the skeleton&#39;s per-vertex properties to the shader, so every <code>prop_&hellip;()</code> branch is skipped and the whole capillary bed draws in the shader&#39;s fallback colour — one flat gold. The other ten skeletons are unaffected. <button type="button" class="idbtn" id="shihBOSwitch" style="margin-top:6px;padding:4px 10px;font-size:12px;width:auto">Switch the viewer to Spelunker</button></div>
'''

WIRE = u'''/* ── THE BRANCH-ORDER COLOURS ONLY EXIST IN ONE VIEWER ─────────────────────  2026-09-29
   Measured, both ways, on the same layer JSON: spelunker.cave-explorer.org renders the paper's
   jet colouring and lists the skeleton's per-vertex properties above the shader code, while
   ngl.microns-explorer.org lists none of them and draws the whole bed in the shader's last line,
   emitRGB(vec3(0.863, 0.725, 0.157)) = #dcb928. That flat gold is the fallback, not a missing
   shader -- the control really is ticked and nothing is logged. See
   src/branch_order_colours_need_spelunker.py.

   The hint appears only when both halves of the problem are true, and the button switches the
   viewer rather than this code doing it silently: the viewer is his choice, and MICrONS
   Neuroglancer is the one with the Share button. */
(function(){
  var SPELUNKER="https://spelunker.cave-explorer.org/";
  function viewerHandlesSkeletonProps(){
    var v=document.getElementById("viewer");
    return !!(v&&/spelunker|cave-explorer/i.test(v.value));
  }
  window.viewerHandlesSkeletonProps=viewerHandlesSkeletonProps;
  function sync(){
    var hint=document.getElementById("shihBOHint"),bo=document.getElementById("fss_bo");
    if(!hint||!bo)return;
    hint.style.display=(bo.checked&&!viewerHandlesSkeletonProps())?"block":"none";
  }
  window.syncShihBOHint=sync;
  /* readyState, not a bare DOMContentLoaded listener: this script lives far down a 11 MB page and
     a listener registered after the event has fired never runs, which would leave the hint dead
     without a single error to show for it. */
  function wire(){
    var bo=document.getElementById("fss_bo"),v=document.getElementById("viewer"),
        sw=document.getElementById("shihBOSwitch");
    if(bo)bo.addEventListener("change",sync);
    if(v)v.addEventListener("change",sync);
    if(sw)sw.addEventListener("click",function(){
      var sel=document.getElementById("viewer");
      if(sel){sel.value=SPELUNKER;sel.dispatchEvent(new Event("change",{bubbles:true}));}
      sync();
    });
    sync();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);
  else wire();
})();
'''

edit("ujump.html", [

 (u"a hint under the branch-order tick",
  u'''<label style="margin-top:12px;text-transform:none;font-size:13px;display:flex;align-items:center;gap:7px;color:var(--ink);cursor:pointer" title="Draws the Allen Institute''',
  HINT + u'''<label style="margin-top:12px;text-transform:none;font-size:13px;display:flex;align-items:center;gap:7px;color:var(--ink);cursor:pointer" title="Draws the Allen Institute'''),

 (u"...and the logic that shows it",
  u"  window.shihLayers=shihLayers;\n",
  u"  window.shihLayers=shihLayers;\n" + WIRE),
])
print("\nNow: node visualareacheck.js, then python3 src/build_stamps.py")
