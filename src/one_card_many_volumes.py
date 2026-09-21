# -*- coding: utf-8 -*-
u"""core/tracingcard.js on a page that holds many volumes -- ωJump.                   2026-09-21

Every other tool is one volume. ωJump is 62, picked from a menu, all reporting to one spreadsheet.
Three things the card assumed stop being true there, each behind a host setting that is absent on
every other page:

  UJ.cfg.tracing.scope()    the volume open now. With it:
      - the four localStorage keys get ":<scope>" -- a draft of a Meissner corpuscle does not come
        back on a liver;
      - a tracing's nucleusId is filed as "<scope>:<id>" (ωJump's nucleusKeys already are:
        "jrc_mus-liver:7"), or "<scope>:" when no cell is named -- so every row says which volume;
      - the "in the dataset" list, the numbering and the account drafts keep only rows of this
        volume.
  UJ.cfg.tracing.slabOk     true: the pad may draw a coarser level whose sections are thicker.
                            OpenOrganelle is isotropic, so its 16 nm level is a 16 nm slab of two
                            8 nm sections; without this the pad could only draw 8 nm, which is about
                            twenty 1.5 MB chunks per view. The menu says "slab" when it is one.
  sources().u16             a uint16 volume's window, handed to core/emtiles.js.

And UJ.tracingcard.datasetChanging() / datasetChanged(), for the host to call around a change of
volume: the pad closes while the old volume is in force (its work saved as that volume's draft),
then the readers are reconfigured, the lists read again and the zoom menu relabelled.

Run: python3 src/one_card_many_volumes.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def edit(rel, pairs):
    p = os.path.join(HERE, rel); s = io.open(p, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s / %s: %d" % (rel, name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(p, "w", encoding="utf-8").write(s)

print("core/tracingcard.js")
edit("core/tracingcard.js", [
 (u"the scope, and what it keys",
  u'''const TRACING_KEY = tracingCfg().lsKey || "ujump_tracings_v1";''',
  u'''const TRACING_KEY = tracingCfg().lsKey || "ujump_tracings_v1";
/* ── ONE CARD, MANY VOLUMES ───────────────────────────────────────  2026-09-21
   UJ.cfg.tracing.scope(): the volume open now, on a page that holds several (ωJump). "" everywhere
   else, and then every function below returns exactly what it did before. See
   src/one_card_many_volumes.py. */
function tracingScope(){
  try { var f = tracingCfg().scope; return f ? String(typeof f === "function" ? f() : f) : ""; }
  catch (_e){ return ""; }
}
function tracingScopedKey(k){ var s = tracingScope(); return s ? k + ":" + s : k; }
/* A cell id filed under this volume: "<scope>:<id>", or "<scope>:" with no cell named. An id that
   already carries the scope -- ωJump's nucleusKeys do -- is left as it is. */
function tracingScoped(id){
  var s = tracingScope(); id = String(id || "");
  if (!s || id.indexOf(s + ":") === 0) return id;
  return s + ":" + id;
}
function tracingInScope(list){
  var s = tracingScope();
  if (!s) return list || [];
  return (list || []).filter(function(t){
    return String((t && (t.nucleusId || t.nucId || t.nucleus_id)) || "").indexOf(s + ":") === 0;
  });
}'''),
 (u"the list, per volume (read)",
  u'''  try{ const v=JSON.parse(localStorage.getItem(TRACING_KEY)||"[]"); return Array.isArray(v)?v:[]; }''',
  u'''  try{ const v=JSON.parse(localStorage.getItem(tracingScopedKey(TRACING_KEY))||"[]"); return Array.isArray(v)?v:[]; }'''),
 (u"...(write)",
  u'''  try{ localStorage.setItem(TRACING_KEY,JSON.stringify(list)); }catch(_e){}''',
  u'''  try{ localStorage.setItem(tracingScopedKey(TRACING_KEY),JSON.stringify(list)); }catch(_e){}'''),
 (u"drafts, per volume (read)",
  u'''      var raw = JSON.parse(localStorage.getItem(TRACING_DRAFTS_KEY) || "null");''',
  u'''      var raw = JSON.parse(localStorage.getItem(tracingScopedKey(TRACING_DRAFTS_KEY)) || "null");'''),
 (u"...(the old slot)",
  u'''        var one = JSON.parse(localStorage.getItem(TRACING_DRAFT_KEY) || "null");''',
  u'''        var one = JSON.parse(localStorage.getItem(tracingScopedKey(TRACING_DRAFT_KEY)) || "null");'''),
 (u"...(write)",
  u'''    try { localStorage.setItem(TRACING_DRAFTS_KEY, JSON.stringify({ v: 2, drafts: list })); return true; }''',
  u'''    try { localStorage.setItem(tracingScopedKey(TRACING_DRAFTS_KEY), JSON.stringify({ v: 2, drafts: list })); return true; }'''),
 (u"a published tracing says which volume",
  u'''                                             nucleusId:t.nucleus_id||"",rootId:t.root_id||"",''',
  u'''                                             nucleusId:tracingScoped(t.nucleus_id||""),rootId:t.root_id||"",'''),
 (u"...and so does a draft on the account",
  u'''      nucleusId: d.nucId || "", rootId: d.rootId || "", editId: d.editId || "",''',
  u'''      nucleusId: tracingScoped(d.nucId || ""), rootId: d.rootId || "", editId: d.editId || "",'''),
 (u"the account's drafts, this volume's only",
  u'''      if (j && j.ok && j.drafts){ DRAFT_SERVER = j.drafts; draftRender(); }''',
  u'''      if (j && j.ok && j.drafts){ DRAFT_SERVER = tracingInScope(j.drafts); draftRender(); }'''),
 (u"the numbering index, this volume's",
  u'''      .then(function(d){ if (d && d.tracings) TRACING_SHARED = d.tracings; })''',
  u'''      .then(function(d){ if (d && d.tracings) TRACING_SHARED = tracingInScope(d.tracings); })'''),
 (u"the list in the dataset, this volume's",
  u'''    TRACING_SHARED = (d && d.tracings) || [];
    tracingRenderShared();''',
  u'''    TRACING_SHARED = tracingInScope((d && d.tracings) || []);
    tracingRenderShared();'''),
 (u"sources carry slabOk-free u16",
  u'''           segOffsetNm: o.segOffsetNm || null, nucOffsetNm: o.nucOffsetNm || null };''',
  u'''           segOffsetNm: o.segOffsetNm || null, nucOffsetNm: o.nucOffsetNm || null,
           u16: o.u16 || null };'''),
 (u"slabOk, read from the host",
  u'''function tracingWindow(){''',
  u'''/* May the pad draw a level whose sections are thicker than the finest? Only where the host says so
   -- see src/one_card_many_volumes.py. */
function tracingSlabOk(){
  try { var f = tracingCfg().slabOk; return !!(typeof f === "function" ? f() : f); }
  catch (_e){ return false; }
}
function tracingWindow(){'''),
 (u"...the pad draws with it",
  u'''      centre: PAD_CENTRE, mip: mip, zoom: zoom, w: wide, h: cv.height,''',
  u'''      centre: PAD_CENTRE, mip: mip, zoom: zoom, w: wide, h: cv.height, slabOk: tracingSlabOk(),'''),
 (u"...and the menu describes it",
  u'''    try { got = await UJ.emtiles.scaleAt(mip); } catch (_e){ return false; }
    if (!got || !got.scale) return false;
    var nm = got.scale.resolution[0], um = w * nm / zoom / 1000;''',
  u'''    try { got = await UJ.emtiles.scaleAt(mip, tracingSlabOk()); } catch (_e){ return false; }
    if (!got || !got.scale) return false;
    var nm = +got.scale.resolution[0].toFixed(2), um = w * got.scale.resolution[0] / zoom / 1000;'''),
 (u"...saying slab when it is one",
  u'''             + (i === 0 ? " across" : "") + " \\u2014 " + nm + " nm data";''',
  u'''             + (i === 0 ? " across" : "") + " \\u2014 " + nm + " nm data"
             + (got.slab > 1 ? " (" + got.slab + "-section slab)" : "");'''),
 (u"...and the relabel is still idempotent",
  u'''      /^[\\d.]+ \\u00b5m( across)? \\u2014 [\\d.]+ nm data/, head);''',
  u'''      /^[\\d.]+ \\u00b5m( across)? \\u2014 [\\d.]+ nm data( \\(\\d+-section slab\\))?/, head);'''),
 (u"datasetChanged, for the host",
  u'''UJ.tracingcard.wire = function(){''',
  u'''/* ── THE VOLUME CHANGES UNDER THE CARD (ωJump's menu) ───────────────  2026-09-21
   Two calls, in order: datasetChanging() while the OLD volume is still what scope() returns -- the
   pad closes and its work is saved as a draft under that volume's key -- then, once the host has
   switched, datasetChanged(), which points the readers at the new volume and reads its lists. */
UJ.tracingcard.datasetChanging = function(){
  try {
    var wrap = document.getElementById("tracePadWrap");
    if (wrap && wrap.style.display !== "none"){
      var close = document.getElementById("tracePadClose");
      if (close) close.click();
    }
  } catch (_e){}
  return true;
};
UJ.tracingcard.datasetChanged = function(){
  PAD = null; PAD_VIEW = null; PAD_CENTRE = null;
  TRACING_DRAFT_ID = "";
  ["tracingNucId", "tracingRootId", "tracingX", "tracingY", "tracingZ"].forEach(function(id){
    var e = document.getElementById(id); if (e) e.value = "";
  });
  try { TRACING_POS_AUTO = ""; } catch (_e){}
  var src = tracingSources();
  try { UJ.emtiles.configure(src); } catch (_e){}
  try { if (src.seg || src.nuc) UJ.segread.configure(src); } catch (_e){}
  try { if (UJ.segpaint && (src.seg || src.nuc)) UJ.segpaint.configure(src); } catch (_e){}
  TRACING_SHARED = []; TRACING_INDEX_AT = 0; DRAFT_SERVER = []; DRAFT_SERVER_AT = 0;
  try { tracingRenderList(); } catch (_e){}
  try { draftRender(); } catch (_e){}
  try { tracingIndexSoon(); } catch (_e){}
  try { draftServerSoon(true); } catch (_e){}
  try { padRelabelMips(); } catch (_e){}
  return true;
};
UJ.tracingcard.wire = function(){'''),
])
