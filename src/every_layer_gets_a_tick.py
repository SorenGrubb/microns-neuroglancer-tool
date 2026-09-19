# -*- coding: utf-8 -*-
u"""Every layer gets a tick.                                                     2026-09-19

Søren: *"If there is more than one annotation channel in the neuroglancer link, it should be
suggested that there are more than one organelle, and the user can then deselect tracings if they
are not supposed to be there, but all of them should be shown in the 3D window."*

src/a_layer_is_a_structure.py did the reading half: ringsFromLink now returns one structure per
annotation layer, each tagged with the layer it came from, plus the list of layers and which one it
would have preferred. This is the card half -- the part he can see.

ASKED, BECAUSE IT WAS A REAL FORK: *"when a tracing is deselected, what should happen to it in the
3D window?"* -- stay, see-through, or disappear. He chose **disappear**, so the rule is simple and
the picture carries no asterisk: **the 3D window shows exactly what will be committed.** One filter,
applied in one place -- `tracingApplySelection()` sets TRACING_PENDING.rings from the ticked groups,
and the preview, the volume, the naming rows and the Add button all read that. Nothing downstream
knows a tick exists.

WHY THE NAMING ROWS TURN THEMSELVES ON. Two structures from two layers are two different things by
construction -- a person does not draw the same organelle in two channels -- so "name each one
separately" is ticked for them. That IS the suggestion he asked for, made concrete: the card stops
asking "what did you outline?" in the singular and asks it once per row.

WHY THE DEFAULT SELECTION IS CAUTIOUS. µJump writes annotation layers into its own links all over
this file -- synapses in and out, cell contacts, organelle points, nucleus→centriole vectors. Some
are POINTS, and three points sharing a z are a ring as far as the reader is concerned, so a link
copied from one of those views would offer plausible-looking structures made of synapses. So: if a
layer called "tracing" is present it is the only one ticked (that is the layer this tool makes);
otherwise everything readable is ticked. A structure on fewer than two sections is never ticked --
it has no surface to close, which was a hard error before and is now a row that says so.

COLOUR HAS ONE SOURCE. With one structure the card's own picker is it. With several, each naming
row carries its own, and #tracingColor steps aside. pad3DTint() is where that choice lives, and the
SIBLING surfaces now ask it too -- they were reading padInstTint directly, which was right while the
only multi-structure route was the pad and wrong the moment a pasted link could make three.

Run: python3 src/every_layer_gets_a_tick.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARKUP = [
    (u'''<div id="tracingFound" style="display:none;margin-top:8px">''',
     u'''<div id="tracingFound" style="display:none;margin-top:8px">
<!-- ONE ROW PER ANNOTATION LAYER.  2026-09-19. Søren: "If there is more than one annotation channel
     in the neuroglancer link, it should be suggested that there are more than one organelle, and
     the user can then deselect tracings if they are not supposed to be there." Hidden when the link
     had one layer, because a list of one is not a choice. -->
<div id="tracingLayers" style="display:none;margin-bottom:10px"></div>''',
     "the paste card has somewhere to list the layers"),
]

CARD = [
    # ── the list, and the one place the tick is applied ──────────────────────────────────────
    (u'''function tracingReadLink(){''',
     u'''/* ── WHAT CAME OFF THE LINK, LAYER BY LAYER ────────────────────────────────────  2026-09-19
   Søren: *"...the user can then deselect tracings if they are not supposed to be there, but all of
   them should be shown in the 3D window."*

   Asked which way a deselected one should go, he chose **gone**: the 3D window shows exactly what
   will be committed. That makes this list the only control that matters on the card, so it says
   enough to decide with — the layer's name, how many contours on how many sections, and the colour
   the surface is drawn in. A row that cannot be ticked says why rather than being greyed in
   silence. */
function tracingGroups(){
  return (TRACING_PENDING && TRACING_PENDING.groups) || null;
}
function tracingLayersRender(){
  const box = document.getElementById("tracingLayers");
  const gs = tracingGroups();
  if (!box) return;
  if (!gs || gs.length < 2){ box.style.display = "none"; box.innerHTML = ""; return; }
  box.style.display = "";
  const on = gs.filter(function(g){ return g.on; }).length;
  box.innerHTML = '<label style="margin:0 0 6px">' + gs.length
    + ' annotation layers &mdash; ' + on + ' will be added</label>'
    + gs.map(function(g){
        const flat = g.sections < 2;
        return '<div class="row" style="gap:8px;margin-top:4px;align-items:center;flex-wrap:nowrap">'
          + '<input type="checkbox" class="laytick" data-inst="' + g.inst + '"'
            + (g.on ? " checked" : "") + (flat ? " disabled" : "")
            + ' style="flex:0 0 auto;margin:0">'
          + '<span style="display:inline-block;flex:0 0 10px;height:10px;border-radius:2px;'
            + 'background:' + escHtml(padInstColour(g.inst)) + '"></span>'
          + '<span style="flex:1 1 auto;min-width:0;font-size:13px;'
            + (g.on ? "" : "color:var(--mut);") + 'overflow:hidden;text-overflow:ellipsis;'
            + 'white-space:nowrap">' + escHtml(g.layer || "(unnamed layer)") + '</span>'
          + '<span class="hint" style="flex:0 0 auto">'
            + (flat ? "one section \\u2014 no surface to close"
                    : (g.rings.length + " contour" + (g.rings.length === 1 ? "" : "s")
                       + " on " + g.sections + " section" + (g.sections === 1 ? "" : "s")))
          + '</span></div>';
      }).join("");
  [].slice.call(box.querySelectorAll(".laytick")).forEach(function(t){
    t.addEventListener("change", function(){
      const g = (tracingGroups() || []).filter(function(x){ return x.inst === +t.dataset.inst; })[0];
      if (!g) return;
      g.on = t.checked;
      tracingApplySelection();
    });
  });
}
/* THE ONE PLACE THE TICKS ARE APPLIED. Everything downstream — the 3D preview, the volume, the
   naming rows, the Add button — reads TRACING_PENDING.rings and knows nothing about a tick. */
function tracingApplySelection(){
  const gs = tracingGroups();
  if (!gs) return;
  let rings = [];
  gs.forEach(function(g){ if (g.on) rings = rings.concat(g.rings); });
  TRACING_PENDING.rings = rings;
  /* TWO STRUCTURES FROM TWO LAYERS ARE TWO DIFFERENT THINGS, by construction: nobody draws one
     organelle in two channels. So the card asks what each one is rather than asking once — which is
     the "suggestion" the request is about, made into a control. It is a tick, so it can be turned
     back off for three mitochondria drawn in three layers. */
  const each = document.getElementById("tracingEachOwn");
  const many = gs.filter(function(g){ return g.on; }).length > 1;
  if (each && many && !each.checked) each.checked = true;
  tracingColourSync();
  tracingLayersRender();
  tracingEachRender(true);
  tracingVolShow();
  pad3DSoon();
}
/* ── THE CARD'S OWN PICKER, WHICH WAS DEAD ON THIS ROUTE ───────────────────────  2026-09-19
   It writes PAD_INST_COLOUR for the structure being drawn -- behind `if(!PAD)return;`, so on the
   paste route, where there is no pad, it did nothing at all. The swatch sat at its markup default
   (#3a6b5a) while the structure was committed in the palette's first colour (#40e28c): the control
   and the result disagreed, quietly, and nobody would have found it by looking at either one.
   Caught by tracingpanelcheck.js when the first version of this function pushed the picker's stale
   default INTO the palette and changed the colour in the notebook.

   So it runs BOTH WAYS, and the palette is the source: reading a link seeds the picker from
   padInstColour (the bisection-ordered palette blender/colour_policy.py shares), and touching the
   picker writes back. With several structures each naming row has its own and this steps aside. */
function tracingColourSync(fromPicker){
  const gs = tracingGroups(), col = document.getElementById("tracingColor");
  if (!gs || !col || tracingEachOwn()) return;
  const on = gs.filter(function(g){ return g.on; });
  if (!on.length) return;
  if (fromPicker) on.forEach(function(g){ PAD_INST_COLOUR[String(g.inst)] = col.value; });
  else col.value = padInstColour(on[0].inst);
}

function tracingReadLink(){''',
     "the layer list, the selection and the colour have one place each"),

    # ── reading a link builds the groups ─────────────────────────────────────────────────────
    (u'''  /* The whole paste is ONE structure unless the viewer said otherwise with a Volume. Somebody
     outlining one cell in one layer means one cell; a structure per contour is never wanted. */
  const rings=r.rings;
  const sections=new Set(rings.map(function(x){return x.z;}));
  const named=(r.structures.find(function(s){return s.name;})||{}).name||"";
  TRACING_PENDING={rings:rings};
  tracingVolShow();''',
     u'''  /* ONE STRUCTURE PER ANNOTATION LAYER, since 2026-09-19 (Søren: "If there is more than one
     annotation channel in the neuroglancer link, it should be suggested that there are more than
     one organelle"). Everything readable used to be poured into one structure, so a cell, a
     mitochondrion and a nucleus drawn in three channels came back as one impossible object under
     one name, with nothing on the card ever mentioning a layer. Within a layer the old rule still
     holds: one cell in one layer is one cell, and a Volume can still split it further. */
  const rings=r.rings;
  const sections=new Set(rings.map(function(x){return x.z;}));
  const named=(r.structures.find(function(s){return s.name;})||{}).name||"";
  const groups=(r.structures||[]).map(function(s,i){
    const zs={};
    (s.rings||[]).forEach(function(x){zs[x.z]=1;});
    return {inst:i, layer:s.layer||"", name:s.name||"", from:s.from||"",
            sections:Object.keys(zs).length,
            rings:(s.rings||[]).map(function(x){return {z:x.z,points:x.points,inst:i};})};
  });
  /* CAUTIOUS BY DEFAULT, and the reason is in this file rather than in taste: µJump writes
     annotation layers into its own links everywhere — synapses in and out, cell contacts, organelle
     points, centriole and cilium vectors — and some are POINTS, which three-to-a-section read as a
     contour. A link copied from one of those views would otherwise arrive offering half a dozen
     structures made of synapses. So the layer this tool makes, if it is there, is the one ticked;
     otherwise everything readable is. Nothing is hidden either way — every layer is a row. */
  const prefer=r.preferred&&groups.some(function(g){return g.layer===r.preferred;});
  groups.forEach(function(g){
    g.on=g.sections>=2&&(!prefer||g.layer===r.preferred);
  });
  /* READING A LINK IS A FRESH START, and it has to say so out loud or the card quietly wears the
     last one's clothes. Caught by tracinglayerscheck.js: after a three-layer link the "name each
     one separately" tick was still on for the next link's single structure, because
     tracingApplySelection only ever turns it ON (and should -- a tick turned on by hand mid-link
     must not be turned off by the next tick). The same leak applies to the per-structure colours
     and types, which are keyed by number: structure 1 of a new link would arrive wearing the
     colour somebody picked for structure 1 of the last one.
     Only when the pad is not holding contours of its own -- those numbers are the PAD'S. */
  if(!(PAD&&PAD.rings&&PAD.rings.length))
    groups.forEach(function(g){
      delete PAD_INST_COLOUR[String(g.inst)];
      delete PAD_INST_KIND[String(g.inst)];
    });
  const eachOwn=document.getElementById("tracingEachOwn");
  if(eachOwn)eachOwn.checked=groups.filter(function(g){return g.on;}).length>1;
  TRACING_PENDING={groups:groups,rings:rings};''',
     "a link becomes one group per layer, with a default selection"),

    # ── the status line says how many layers ─────────────────────────────────────────────────
    (u"""    +(r.seen.mixedZ?" \\u2014 "+r.seen.mixedZ+" contour(s) span more than one section, which is "
      +"usually a stray point":""));""",
     u"""    +(r.seen.mixedZ?" \\u2014 "+r.seen.mixedZ+" contour(s) span more than one section, which is "
      +"usually a stray point":"")
    /* WHICH IS SEVERAL THINGS, said in the same breath as how much of it there is. Without this
       the only clue that a link carried three channels was that the numbers looked too big. */
    +(groups.length>1?" \\u2014 from "+groups.length+" annotation layers; tick the ones that "
      +"belong below, and the 3D window shows what will be added":""));""",
     "the status line says it came from several layers"),

    (u'''  if(sections.size<2){
    tracingSay("Only one section has a contour on it. A flat outline has no surface to close \\u2014 "
      +"outline the cell on at least two sections.",true);
    return;
  }
  document.getElementById("tracingFound").style.display="";
  tracingEachRender(true);''',
     u'''  /* NOTHING TICKED HAS DEPTH. This was a flat refusal of the whole link until 2026-09-19; with
     one row per layer it only has to be true of everything at once, and a single flat layer beside
     three good ones is a row that says "one section" rather than a rejection of all four. */
  if(!groups.some(function(g){return g.on;})){
    tracingSay(groups.length>1
      ?"None of those layers has contours on more than one section. A flat outline has no surface "
       +"to close \\u2014 outline it on at least two."
      :"Only one section has a contour on it. A flat outline has no surface to close \\u2014 "
       +"outline the cell on at least two sections.",true);
    return;
  }
  document.getElementById("tracingFound").style.display="";''',
     "...and the line says how many layers it came from"),

    (u'''  /* AFTER the block is shown, never before: a canvas measured inside display:none comes back zero
     by zero, and the renderer has no reason to know it was asked too early. */
  pad3DSoon();
}''',
     u'''  /* AFTER the block is shown, never before: a canvas measured inside display:none comes back zero
     by zero, and the renderer has no reason to know it was asked too early. This also draws the
     layer list, applies the default selection and renders the naming rows — one entry point, so
     ticking a box later takes exactly the same path as reading the link did. */
  tracingApplySelection();
}''',
     "...and one entry point builds the list, the rows and the picture"),

    # ── the volume, per structure ────────────────────────────────────────────────────────────
    (u'''function tracingVolShow(){
  const el = document.getElementById("tracingVolSay");
  if (!el) return null;
  const v = (TRACING_PENDING && TRACING_PENDING.rings) ? tracingVolumeOf(TRACING_PENDING.rings) : null;
  el.textContent = v ? tracingVolumeSay(v) : "";
  return v;
}''',
     u'''function tracingVolShow(){
  const el = document.getElementById("tracingVolSay");
  if (!el) return null;
  const rings = (TRACING_PENDING && TRACING_PENDING.rings) || null;
  if (!rings){ el.textContent = ""; return null; }
  /* ONE LINE EACH once there are several, exactly as padVolume does it: a single figure over a cell
     and its nucleus is the volume of no object at all — it is the sum of two, which is a number
     nobody asked for and which looks exactly like the answer somebody did ask for. */
  const insts = tracingEachInsts().filter(function(i){
    return rings.some(function(r){ return (r.inst || 0) === i; });
  });
  if (insts.length > 1){
    el.innerHTML = insts.map(function(i){
      const v = tracingVolumeOf(rings.filter(function(r){ return (r.inst || 0) === i; }));
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;'
        + 'margin-right:4px;background:' + escHtml(padInstColour(i)) + '"></span>'
        + '<b>' + (i + 1) + '</b> \\u2014 ' + escHtml(v ? tracingVolumeSay(v) : "nothing yet");
    }).join("<br>");
    return null;
  }
  const v = tracingVolumeOf(rings);
  el.textContent = v ? tracingVolumeSay(v) : "";
  return v;
}''',
     "the volume is one line per structure once there are several"),

    # ── colour: one source ───────────────────────────────────────────────────────────────────
    (u'''function pad3DTint(inst){
  if (pad3DTarget() === "paste"){
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
      .exec(String((document.getElementById("tracingColor") || {}).value || ""));
    if (m) return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }
  return padInstTint(inst);
}''',
     u'''function pad3DTint(inst){
  /* ONLY WHILE THE CARD HAS ONE COLOUR TO GIVE, tightened 2026-09-19. A pasted link can now carry
     three structures, each with its own picker in the naming rows; taking the card's single swatch
     then would paint all three the same and contradict the list above them. */
  if (pad3DTarget() === "paste" && !tracingEachOwn()){
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
      .exec(String((document.getElementById("tracingColor") || {}).value || ""));
    if (m) return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }
  return padInstTint(inst);
}''',
     "the card's own colour only applies while it is the only one"),

    (u'''      siblings.push({ geo: q, tint: padInstTint(lofts[i].inst), alpha: 1 });''',
     u'''      /* pad3DTint rather than padInstTint, 2026-09-19: the siblings asked the palette directly,
         which was right while the pad was the only route that could have several structures and
         wrong the moment a pasted link could. */
      siblings.push({ geo: q, tint: pad3DTint(lofts[i].inst), alpha: 1 });''',
     "...and the surfaces beside the subject ask the same question"),
]

# The caption belongs to src/the_tracing_card.py, which is edited alongside the page so a rebuild
# does not put the pad's sentence back on a route where nothing is being drawn.
CAPTION = [
    (u'''        + ". The one you are drawing is the brightest.</span>";''',
     u'''        /* "The one you are drawing" is the pad's sentence; on a pasted link nothing is being
           drawn and the subject is simply the first. 2026-09-19. */
        + (pad3DTarget() === "paste" ? ". The first one is the brightest.</span>"
                                     : ". The one you are drawing is the brightest.</span>");''',
     "the caption stops saying 'drawing' on the pasted-link route"),
]

WIRING = [
    (u'''  ["tracingPasteGhosts","tracingNucId","tracingRootId","tracingColor"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("change",function(){pad3DSoon();});
  });''',
     u'''  ["tracingPasteGhosts","tracingNucId","tracingRootId"].forEach(function(id){
    const el=document.getElementById(id);
    if(el)el.addEventListener("change",function(){pad3DSoon();});
  });
  /* The card's own colour has one more thing to do than the rest: it is the structure's colour
     while there is only one, so it has to reach the swatch in the layer list and the palette the
     preview reads, not just trigger a redraw. */
  const oneCol=document.getElementById("tracingColor");
  if(oneCol)oneCol.addEventListener("input",function(){
    tracingColourSync(true); tracingLayersRender(); pad3DSoon();
  });''',
     "the one colour reaches the swatch and the surface, not just the redraw"),
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


edit("ujump.html", MARKUP + CARD + WIRING + CAPTION)
edit("src/the_tracing_card.py", CAPTION)
print("\nnow: node tracinglayerscheck.js && node tracingpreviewcheck.js && node tracingcheck.js "
      "&& python3 src/build_stamps.py")
