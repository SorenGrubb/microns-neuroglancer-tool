# -*- coding: utf-8 -*-
u"""All of them, or the JSON — not a quiet handful.                                       2026-09-24

Søren: "I asked that if the Filter and show fails to make a neuroglancer instance with all of the
whole cell segmentations, it would offer the user to download a json instead to paste themselves
into Neuroglancer. However, what it does now is give an error message and then open Neuroglancer
with fewer whole cell segmentations. That was not the point."

He is right, and the two halves were working against each other.

buildTracedOrganelleLayers had a budget of its own -- FILTER_TRACE_BUDGET, 1,200,000 characters --
and DROPPED whole outlines to stay under it. The JSON offer measures the COMPOSED LINK. So by the
time the link existed it always fitted, the offer could never fire, and what opened was a view short
of the outlines he had asked for, with a toast explaining that it was.

A budget that makes the link fit by leaving things out is precisely the behaviour the offer exists
to replace. Measured on the check's own fixture -- six traced cells of sixty contours -- the state
handed over carried 7,200 of 14,400 annotations: exactly half the cells, silently.

SO THE BUILDER BUILDS WHAT IT WAS ASKED FOR, and the caller decides. It opens when all of it fits;
it hands over the state when it does not. Nothing in between, and nothing dropped without being
said. That is the same rule the cell-name link was given this morning
(src/the_cell_name_opens_where_the_outline_fits.py) and the same one core/openall.js has had since
src/too_big_to_open_is_not_too_big_to_use.py -- there is now one rule rather than two halves of one.

WHICH LEAVES TWO TOOLS THAT COULD NOT OFFER. ηJump and ωJump build their outline layers and open
their own URL with no measurement at all; while the builder trimmed for them they never met a link
they could not open, and without the trimming they would have opened a blank tab. So the measuring
is now a function of its own, tracedOutlinesGo, and they call it -- one rule, in one place, for all
eight tools.

WHAT IS NOT CHANGED. FILTER_TRACE_CAP, the cap of 150 on how many outline FILES to read, stays: it
bounds a hundred and fifty round trips to Drive, not the size of a link, and it says so in its own
words when it fires. tracedOutlinesCost stays too -- it is how the callers measure.

Checks: filterallornothingcheck.js, written first (3 of its 9 assertions failed, including the exact
count -- 7,200 of 14,400); and tracedlinksizecheck.js, which asserted the OLD contract in so many
words ("one that does not fit is trimmed until it does, and says how many it left out") and is
rewritten here to assert the new one.
Run: python3 src/all_of_them_or_the_json.py, then python3 src/build_stamps.py, then
python3 wjump-build/build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _build(name):
    for c in (os.path.join(HERE, "..", name), os.path.join(HERE, "..", "xw", name)):
        if os.path.isdir(c):
            return os.path.normpath(c)
    raise SystemExit("cannot find %s/ beside %s" % (name, HERE))


def edit(path, pairs):
    P = path if os.path.isabs(path) else os.path.join(HERE, path)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


WJ = _build("wjump-build")


# ── 1. the builder stops deciding what fits ────────────────────────────────────────────────────
edit("core/tracedoutlines.js", [
 (u"the link's cap is the caller's business",
  u"""   So the link has a cap of its own, in the unit the browser actually counts. 2,097,152 is where
   Chromium stops (measured in Søren's browser, 2026-09-22); 1,200,000 of it is offered to the
   outlines and the remaining ~900k left for what else the state carries -- segmentation layers,
   region boxes, organelle points, the EM. A caller that knows its own state can pass {budget: n}.
   See src/the_outlines_fit_the_link_they_go_in.py. */
const FILTER_TRACE_CAP=150;
const FILTER_TRACE_BUDGET=1200000;""",
  u"""   THE LINK'S SIZE IS NOT DECIDED HERE, and used to be (2026-09-24). This had a budget of
   1,200,000 characters and dropped whole outlines to stay under it, so the composed link always
   fitted and the offer that hands over the state — which measures the COMPOSED link — could never
   fire. Søren: "what it does now is give an error message and then open Neuroglancer with fewer
   whole cell segmentations. That was not the point." Measured on six traced cells of sixty
   contours: 7,200 of 14,400 annotations survived, silently.

   So this builds what it was asked for and the caller measures: tracedOutlinesGo below opens it
   when it all fits and hands over the state when it does not. Nothing in between.
   See src/all_of_them_or_the_json.py. */
const FILTER_TRACE_CAP=150;"""),

 (u"...so nothing is dropped to make it fit",
  u"""  /* ── AS MANY AS THE LINK WILL TAKE ────────────────────────────────────────────  2026-09-23
     The annotations are made first and measured as they go, and an outline that does not fit the
     remaining budget is left out whole -- never half an outline, which would be a shape nobody
     traced. Order is the index's, so what you get is the first N rather than an arbitrary N. */
  const budget=(opts&&opts.budget!==undefined)?opts.budget:FILTER_TRACE_BUDGET;
  const madeFor={}; let spent=0, tooBig=0;""",
  u"""  /* Everything asked for, whatever it comes to; the caller measures its link and either
     opens it or hands the state over (tracedOutlinesGo). 2026-09-24. */
  const madeFor={};"""),

 (u"...and every outline asked for is built",
  u"""      if(!a||!a.length)return;
      const cost=tracedOutlinesCost(a);
      if(spent+cost>budget){ tooBig++; return; }
      spent+=cost;
      [].push.apply(madeFor[k],a);""",
  u"""      if(!a||!a.length)return;
      [].push.apply(madeFor[k],a);"""),

 (u"...and the trimming toast goes with it",
  u"""  /* SAID, NOT SILENT -- the same rule the reads cap follows six lines down, for the same reason:
     somebody reading this view is deciding what to trace next. */
  if(tooBig&&typeof showSubmitToast==="function"){
    /* WHY, WHEN THE ANSWER IS THE VIEWER. On one that cannot read polylines every EDGE of every
       contour is its own annotation, so a single whole cell is already over the budget and the
       honest view is empty -- measured here: three traced cells are 180 contours and 712k as
       polylines, and nothing at all as lines. An empty view with no reason is the worst of the
       three outcomes, so the reason somebody can act on is named. */
    var shapeWhy="";
    try {
      if(UJ.tracing&&UJ.tracing.viewerTakesPolylines&&!UJ.tracing.viewerTakesPolylines())
        shapeWhy=" This viewer cannot read polyline annotations, so every edge of every contour is "
               +"its own line and these outlines cost about four times what they need to \u2014 "
               +"Spelunker and neuroglancer-demo read polylines, and the same cells fit there.";
    } catch (_sw){}
    showSubmitToast(false,(got.length===tooBig
        ?"Not one of these "+tooBig+" outlines fits a viewer link on its own"
        :"Left "+tooBig+" outline"+(tooBig===1?"":"s")+" out")
      +" \u2014 a viewer link cannot be opened past 2,097,152 characters"
      +(got.length===tooBig?"":", and the ones drawn already fill it")+". Pick one kind rather "
      +"than all, or narrow the filter. A whole cell is a hundred times the contours of a "
      +"lysosome."+shapeWhy);
  }""",
  u"""  /* The READS cap is a different cost and keeps its sentence: it bounds a hundred and fifty
     round trips to Drive, not the size of a link (2026-09-24). */"""),

 # ── 2. one place that opens it, or hands it over ─────────────────────────────────────────────
 (u"one rule for opening it or handing it over",
  u"""function tracedOutlinesWire(){""",
  u"""/* ── OPEN IT, OR HAND IT OVER ───────────────────────────────────  2026-09-24
   The whole of the size decision, in one function, because it was in three places and two tools had
   none of it. `win` is the tab reserved at the click for the popup blocker; it is CLOSED when the
   state is handed over instead, since leaving it on about:blank behind the offer is two confusing
   things at once. `anchor` is the element the offer panel is put beside.
   Returns true if a tab was sent somewhere. See src/all_of_them_or_the_json.py. */
function tracedOutlinesGo(url, json, win, anchor){
  var cap = (typeof tracedLinkMax === "function") ? tracedLinkMax() : 2097152;
  if (url.length > cap){
    if (win){ try { win.close(); } catch (_e){} }
    if (typeof tracedOutlinesStateOffer === "function")
      tracedOutlinesStateOffer(anchor, json, url.length);
    else if (typeof showSubmitToast === "function")
      showSubmitToast(false, "That view is " + Math.round(url.length / 1000) + "k and a tab cannot "
        + "be opened past " + cap.toLocaleString() + " characters. Narrow the filter, or pick one "
        + "kind rather than all.");
    return false;
  }
  if (win){ try { win.opener = null; } catch (_e){} win.location.href = url; }
  else window.open(url, "_blank", "noopener");
  return true;
}
function tracedOutlinesWire(){"""),
])


# ── 3. the two tools that opened their own URL without measuring it ────────────────────────────
edit("hjump.html", [
 (u"η: it opens what fits, and offers what does not",
  u"""    .then(function(layers){
      vb.textContent=label;
      let url=href;
      if(layers.length){
        const k=href.indexOf("#!");
        const st=JSON.parse(decodeURIComponent(href.slice(k+2)));
        st.layers.push.apply(st.layers,layers);
        url=href.slice(0,k)+"#!"+encodeURIComponent(JSON.stringify(st));
      }
      if(win){ try{ win.opener=null; }catch(_e){} win.location.href=url; }
      else window.open(url,"_blank","noopener");
    });""",
  u"""    .then(function(layers){
      vb.textContent=label;
      let url=href, json="";
      if(layers.length){
        const k=href.indexOf("#!");
        const st=JSON.parse(decodeURIComponent(href.slice(k+2)));
        st.layers.push.apply(st.layers,layers);
        json=JSON.stringify(st);
        url=href.slice(0,k)+"#!"+encodeURIComponent(json);
      }
      /* Measured before it is opened (2026-09-24). Nothing is trimmed to make it fit any more, so
         a view that cannot be opened is handed over as state instead of opening short. */
      if(typeof tracedOutlinesGo==="function")tracedOutlinesGo(url,json||"{}",win,vb);
      else if(win){ try{ win.opener=null; }catch(_e){} win.location.href=url; }
      else window.open(url,"_blank","noopener");
    });"""),
])

edit(os.path.join(WJ, "wjump_app.js"), [
 (u"ω: it opens what fits, and offers what does not",
  u"""      .then(function(layers){
        btn.textContent = label;
        var u = url;
        if (layers && layers.length){
          var k = url.indexOf("#!"), st = JSON.parse(decodeURIComponent(url.slice(k + 2)));
          st.layers.push.apply(st.layers, layers);
          u = url.slice(0, k) + "#!" + encodeURIComponent(JSON.stringify(st));
        }
        if (win){ try { win.opener = null; } catch (e){} win.location.href = u; }
        else window.open(u, "_blank", "noopener");
      });""",
  u"""      .then(function(layers){
        btn.textContent = label;
        var u = url, json = "";
        if (layers && layers.length){
          var k = url.indexOf("#!"), st = JSON.parse(decodeURIComponent(url.slice(k + 2)));
          st.layers.push.apply(st.layers, layers);
          json = JSON.stringify(st);
          u = url.slice(0, k) + "#!" + encodeURIComponent(json);
        }
        /* Measured before it is opened (2026-09-24): nothing is trimmed to make it fit any more. */
        if (typeof tracedOutlinesGo === "function") tracedOutlinesGo(u, json || "{}", win, btn);
        else if (win){ try { win.opener = null; } catch (e){} win.location.href = u; }
        else window.open(u, "_blank", "noopener");
      });"""),
])
