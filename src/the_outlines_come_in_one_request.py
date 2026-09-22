# -*- coding: utf-8 -*-
u"""Traced outlines arrive together: one request for many, several at a time otherwise, and once.   2026-09-22

Søren: "Opening the neuroglancer with 4 filtered cells with 15 traced organelles took a long time.
Can this be made faster?"

core/tracedoutlines.js read the matched outlines ONE AFTER ANOTHER -- fifteen cold Apps Script
calls in a row, each scanning the "Traced structures" sheet for one row and opening one Drive file.
At one to three seconds apiece that is half a minute before the viewer opens.

core/tracing.js gains fetchMany(endpoint, entries, dsQS, onProgress) -> {structureId: {t, st} or
{error}}:
  - ONE REQUEST PER 20 via ?tracings=1&structureIds=a,b,c -- the backend scans once and opens only
    those files (backend/src_several_tracings_in_one_request.py, needs a redeploy);
  - an older deployment ignores structureIds and answers with the bare index, no rows; that is
    noticed, remembered for the page, and it falls back to one request each, SIX AT A TIME;
  - what it read is kept for the life of the page, keyed by structureId AND version (groupId), so a
    second view of the same cells reads nothing and a newer share is never served from the cache.
Used by the filter's outlines (tracedoutlines.js), the tracing card's whole-cell view
(tracingFetchCell) and the cell panel's organelle outlines (panel.js).

Check: outlinesfastcheck.js. Run: python3 src/the_outlines_come_in_one_request.py, then
python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new, mark in pairs:
        if mark in s: print("  already there: " + name); continue
        assert s.count(old) == 1, "%s: %d" % (name, s.count(old))
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


MANY = u'''
  /* ── SEVERAL TRACINGS' GEOMETRY, TOGETHER ────────────────────────────────────  2026-09-22
     Søren: "Opening the neuroglancer with 4 filtered cells with 15 traced organelles took a long
     time." One request per 20 (?structureIds=), one each six at a time from an older deployment,
     and nothing twice in a page. Returns {structureId: {t, st} | {error}}.
     See src/the_outlines_come_in_one_request.py. */
  var MANY_CACHE = {}, MANY_BATCH = null;
  function manyKey(e){ return e && e.groupId ? String(e.structureId) + "|" + String(e.groupId) : ""; }
  function manyResult(t){
    if (!t) return { error: "the dataset has no tracing with that id any more" };
    if (t.error) return { t: t, error: t.error };
    var st = rowsToStructures(t.rows || [])[0] || null;
    if (!st || !st.rings || !st.rings.length) return { t: t, error: "that tracing came back with no contours on it" };
    return { t: t, st: st };
  }
  async function fetchMany(endpoint, entries, qs, onProgress){
    qs = qs || "";
    var out = {}, todo = [], total = (entries || []).length, done = 0;
    var tick = function(){ done++; if (onProgress) try { onProgress(done, total); } catch (_e){} };
    (entries || []).forEach(function(e){
      var k = manyKey(e);
      if (k && MANY_CACHE[k]){ out[e.structureId] = MANY_CACHE[k]; tick(); }
      else if (!(e.structureId in out)) todo.push(e);
    });
    var keep = function(e, r){
      out[e.structureId] = r;
      var k = manyKey(e);
      if (k && r && r.st) MANY_CACHE[k] = r;
      tick();
    };
    var pool = async function(items, n, fn){
      var i = 0;
      var worker = async function(){ while (i < items.length){ var it = items[i++]; await fn(it); } };
      var ws = []; for (var w = 0; w < Math.min(n, items.length); w++) ws.push(worker());
      await Promise.all(ws);
    };
    /* Together, while the deployment answers with rows. */
    if (todo.length && MANY_BATCH !== false){
      var chunks = [];
      for (var c = 0; c < todo.length; c += 20) chunks.push(todo.slice(c, c + 20));
      await pool(chunks, 3, async function(ch){
        if (MANY_BATCH === false) return;
        try {
          var r = await fetch(endpoint + "?tracings=1&structureIds="
                              + encodeURIComponent(ch.map(function(e){ return e.structureId; }).join(",")) + qs);
          var d = await r.json(), ts = (d && d.tracings) || [];
          var withRows = ts.filter(function(t){ return t && Array.isArray(t.rows); });
          if (ts.length && !withRows.length){ MANY_BATCH = false; return; }   // an older deployment
          MANY_BATCH = true;
          var by = {};
          withRows.forEach(function(t){ by[t.structureId] = t; });
          ch.forEach(function(e){ keep(e, manyResult(by[e.structureId])); });
        } catch (_e){ /* left for the one-at-a-time pass */ }
      });
    }
    /* One each, six at a time, for whatever is left. */
    var left = todo.filter(function(e){ return !(e.structureId in out); });
    await pool(left, 6, async function(e){
      try {
        var r = await fetch(endpoint + "?tracings=1&structureId=" + encodeURIComponent(e.structureId) + qs);
        var d = await r.json();
        keep(e, manyResult(((d && d.tracings) || [])[0]));
      } catch (err){ keep(e, { error: String(err && err.message || err) }); }
    });
    return out;
  }
'''
edit("core/tracing.js", [
 (u"fetchMany",
  u'''
  return { ringsFromLink: ringsFromLink, _readLayer: readLayer,''',
  MANY + u'''
  return { ringsFromLink: ringsFromLink, _readLayer: readLayer, fetchMany: fetchMany,''',
  u"function fetchMany(endpoint"),
])

edit("core/tracedoutlines.js", [
 (u"the filter's outlines come together",
  u'''  const got=[];
  for(let i=0;i<mine.length;i++){
    say&&say("Reading outline "+(i+1)+"/"+mine.length+"\\u2026");
    try{
      const r=await fetch(REPORT_ENDPOINT+"?tracings=1&structureId="+encodeURIComponent(mine[i].structureId)
                          +tracedOutlinesDsQS());
      const d=await r.json();
      const one=((d&&d.tracings)||[])[0];
      const st=(one&&!one.error)?(UJ.tracing.rowsToStructures(one.rows||[])[0]||null):null;
      if(st&&st.rings&&st.rings.length)got.push({t:mine[i],rings:st.rings});
    }catch(_e){/* one unreadable outline is not the view's problem */}
  }''',
  u'''  /* TOGETHER, 2026-09-22 -- one request per twenty, and nothing twice in a page. They were read
     one after another, fifteen cold calls in a row. See src/the_outlines_come_in_one_request.py.
     One unreadable outline is not the view's problem: it is simply not drawn. */
  const got=[];
  say&&say("Reading "+mine.length+" outline"+(mine.length===1?"":"s")+"\\u2026");
  const res=await UJ.tracing.fetchMany(REPORT_ENDPOINT,mine,tracedOutlinesDsQS(),function(d,n){
    say&&say("Reading outlines "+d+"/"+n+"\\u2026"); });
  mine.forEach(function(t){
    const x=res[t.structureId];
    if(x&&x.st&&x.st.rings&&x.st.rings.length)got.push({t:t,rings:x.st.rings});
  });''',
  u"UJ.tracing.fetchMany(REPORT_ENDPOINT,mine"),
])

edit("core/tracingcard.js", [
 (u"the card's whole cell comes together",
  u'''  if (btn){ btn.disabled = true; btn.dataset.label = label; }
  try { await Promise.all([one(), one(), one(), one()]); }''',
  u'''  if (btn){ btn.disabled = true; btn.dataset.label = label; }
  /* TOGETHER where core/tracing.js can (2026-09-22, src/the_outlines_come_in_one_request.py). */
  if (UJ.tracing && UJ.tracing.fetchMany){
    try {
      const res = await UJ.tracing.fetchMany(REPORT_ENDPOINT, sids.map(function(s){ return { structureId: s }; }),
        tracingDsQS(), function(d, n){ if (btn) btn.textContent = "reading " + d + " of " + n + "\\u2026"; });
      return sids.map(function(s){
        const x = res[s] || { error: "not read" };
        return x.error ? { sid: s, error: x.error } : { sid: s, t: x.t, st: x.st };
      });
    } finally { if (btn){ btn.disabled = false; btn.textContent = label; } }
  }
  try { await Promise.all([one(), one(), one(), one()]); }''',
  u"UJ.tracing.fetchMany(REPORT_ENDPOINT, sids.map"),
])

edit("core/panel.js", [
 (u"the cell panel's outlines come together",
  u'''  want.forEach(function(t){
    fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(t.structureId)''',
  u'''  /* TOGETHER where core/tracing.js can (2026-09-22, src/the_outlines_come_in_one_request.py). */
  if (window.UJ && UJ.tracing && UJ.tracing.fetchMany){
    UJ.tracing.fetchMany(REPORT_ENDPOINT, want, typeof panelDsQS === "function" ? panelDsQS() : "")
      .then(function(res){
        want.forEach(function(t){
          var x = res[t.structureId];
          PANEL_ORGAN_RINGS[t.structureId] = (x && x.st && x.st.rings) ? x.st.rings : [];
        });
      })
      .catch(function(){ want.forEach(function(t){ PANEL_ORGAN_RINGS[t.structureId] = []; }); })
      .then(function(){ left = 1; done(); });
    return;
  }
  want.forEach(function(t){
    fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(t.structureId)''',
  u"UJ.tracing.fetchMany(REPORT_ENDPOINT, want"),
])
