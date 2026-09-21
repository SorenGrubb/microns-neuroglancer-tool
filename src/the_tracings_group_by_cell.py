# -*- coding: utf-8 -*-
u"""Tracings are grouped under the cell they were traced in.                          2026-09-21

Søren: "For the kept tracings, it is confusing that lysosomes from different microglia have the
same number. What I would like is that they are organized as sub-elements of the cell they were
traced in, where you can click the neuroglancer next to the microglia and see all of the traced
organelles for that cell or remove all of them. Same system below for the pad, also where you can
open all of the tracings for one cell in the pad or in Neuroglancer or download a zip-file with all
of the files related to that cell."

The numbers were never wrong -- a series is per cell, so two microglia each have a Lysosome 1 --
but a flat list hides the cell that makes them right. Both lists now group by cell: the nucleus ID,
else the root ID, else a group for tracings filed against no cell.

  KEPT       the cell's row: Neuroglancer (all of its tracings, with its ids, so the viewer also
             adds the community's root IDs) and "Remove all" (asks once more, in the button itself
             -- no browser dialog).
  DATASET    the cell's row: "Open all in the pad", Neuroglancer, "Download zip".

OPEN ALL IN THE PAD needs something the pad did not have: several structures, each an edit of its
OWN shared tracing. The pad knew one (PAD_EDIT_ID) and filed every other structure as new. Now
PAD_EDIT_IDS maps a structure number on the pad to the structureId it was opened from, idOf() asks
it first, and each keeps its own type, colour and published number -- so adding them back is the
next version of each, never a second Lysosome 2. It goes in the draft too, or a draft resumed
tomorrow would file them as new.

THE ZIP holds, per tracing, its contours as JSON (tool voxels, with the voxel size, the ids and
who traced it), a mesh as OBJ in nanometres (the same loft the pad's 3D window draws), and a
cell.json and README.txt for the cell, with the Drive link of each tracing's own file. JSZip comes
from cdnjs, as the PowerPoint export's already does.

Run: python3 src/the_tracings_group_by_cell.py, then python3 src/build_stamps.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(HERE, "core/tracingcard.js")


def edit(pairs):
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


def replace_between(name, start, end, new, marker):
    """Replace from `start` up to (not including) `end`, once. Skipped when `marker` is there."""
    s = io.open(P, encoding="utf-8").read()
    if marker in s:
        print("  already there: " + name); return
    a = s.index(start); assert s.count(start) == 1, name
    z = s.index(end, a)
    s = s[:a] + new + s[z:]
    io.open(P, "w", encoding="utf-8").write(s); print("  ok: " + name)


KEPT = u'''/* ── KEPT TRACINGS, BY CELL ──────────────────────────────────────────────────  2026-09-21
   Søren: "it is confusing that lysosomes from different microglia have the same number. What I
   would like is that they are organized as sub-elements of the cell they were traced in". A series
   is per cell, so two cells each having a Lysosome 1 is right; the flat list hid the cell. See
   src/the_tracings_group_by_cell.py. */
function tracingCellKeyOf(nuc, root){
  nuc = String(nuc || ""); root = String(root || "");
  return nuc ? "n:" + nuc : (root ? "r:" + root : "");
}
/* The cell's own line: its type, its nucleus, its root, how many. */
function tracingCellHead(nuc, root, type, n){
  const bits = [];
  if (type && type !== "traced") bits.push("<b>" + escHtml(type) + "</b>");
  if (nuc) bits.push("nucleus " + escHtml(nuc));
  if (root) bits.push("root " + escHtml(root));
  if (!nuc && !root) bits.push("<b>Not filed against a cell</b>");
  return '<span class="tracingcellhead" style="flex:1 1 200px;min-width:0">' + bits.join(" &middot; ")
    + ' <span style="opacity:.6">&middot; ' + n + " tracing" + (n === 1 ? "" : "s") + "</span></span>";
}
/* Groups in the order their first member comes, so the list does not jump when one is added. */
function tracingGroupByCell(list, nucOf, rootOf){
  const by = {}, order = [];
  list.forEach(function(t, i){
    const k = tracingCellKeyOf(nucOf(t), rootOf(t));
    if (!by[k]){ by[k] = { key: k, nuc: String(nucOf(t) || ""), root: String(rootOf(t) || ""), items: [] }; order.push(k); }
    const g = by[k];
    if (!g.root && rootOf(t)) g.root = String(rootOf(t));
    g.items.push({ t: t, i: i });
  });
  /* No cell last: it is the group nobody is looking for. */
  order.sort(function(a, b){ return (a === "" ? 1 : 0) - (b === "" ? 1 : 0); });
  return order.map(function(k){ return by[k]; });
}
/* "Remove all" asks in the button itself: a browser dialog would stop the page. */
function tracingArm(b, ask, go){
  if (!b.dataset.armed){
    const label = b.textContent;
    b.dataset.armed = "1"; b.textContent = ask; b.style.color = "var(--bad)";
    setTimeout(function(){
      if (b.isConnected && b.dataset.armed){ delete b.dataset.armed; b.textContent = label; b.style.color = ""; }
    }, 4000);
    return;
  }
  go();
}
const TRACING_BTN = 'style="padding:2px 9px;font-size:12px;flex:0 0 auto"';
const TRACING_CELL_BOX = 'class="tracingcell" style="border-top:1px solid var(--line);padding:6px 0 2px"';
const TRACING_CELL_ROW = 'style="display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap"';

function tracingRenderList(){
  const host=document.getElementById("tracingList");
  if(!host)return;
  if(!TRACINGS_KEPT.length){
    host.innerHTML='<p class="hint">Nothing traced yet. A kept tracing is included in every '
      +'Blender download from this page until you remove it.</p>';
    return;
  }
  const groups=tracingGroupByCell(TRACINGS_KEPT,function(t){return t.nucleus_id;},function(t){return t.root_id;});
  host.innerHTML='<label>Kept tracings, by cell &mdash; these go into the 3D export</label>'
    +groups.map(function(g,gi){
      const type=(g.items.filter(function(x){return x.t.type&&x.t.type!=="traced";})[0]||{t:{}}).t.type||"";
      return '<div '+TRACING_CELL_BOX+' data-g="'+gi+'">'
        +'<div '+TRACING_CELL_ROW+'>'+tracingCellHead(g.nuc,g.root,type,g.items.length)
        +'<button class="idbtn tracingcellngl" data-g="'+gi+'" '+TRACING_BTN+' title="All of this '
        +'cell&rsquo;s kept tracings in the viewer, each in its own colour, with the cell.">Neuroglancer</button>'
        +'<button class="idbtn tracingcelldrop" data-g="'+gi+'" '+TRACING_BTN+' title="Take all of '
        +'this cell&rsquo;s tracings off this page. What is already in the dataset stays there.">'
        +'Remove all</button></div>'
        +g.items.map(function(x){
          const t=x.t, i=x.i;
          const sections=new Set((t.rings||[]).map(function(r){return r.z;})).size;
          return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0 4px 18px;font-size:12px;'
            +'border-left:2px solid var(--line);margin-left:5px">'
            +'<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
              +escHtml(t.color||"#3a6b5a")+'"></span>'
            +'<span style="flex:1 1 auto">'+escHtml(t.name||"traced")+'</span>'
            +'<span style="opacity:.7">'+(t.rings||[]).length+' contour'
              +((t.rings||[]).length===1?"":"s")+' on '+sections+' section'+(sections===1?"":"s")
              +(isFinite(t.volume_um3)?' &middot; '+volFmt(t.volume_um3)+' µm³':'')+'</span>'
            /* A tracing that has not reached the dataset says so HERE, where the tracing is, rather
               than in a status line that the next action overwrites. */
            +(t.pending_share
                ?'<span style="color:var(--warn);font-weight:600" title="Kept here, not in the shared '
                 +'dataset yet. Sign in with Google and it goes up on its own.">waiting for sign-in</span>'
                :'<span style="opacity:.55" title="In the shared dataset — anyone can open it and add '
                 +'to it.">in the dataset</span>')
            +'<button class="idbtn tracingview" data-n="'+i+'" style="padding:2px 9px;font-size:12px" '
            +'title="Open this tracing in the viewer — its contours as an annotation layer in its '
            +'own colour.">Neuroglancer</button>'
            +'<button class="idbtn tracingdrop" data-n="'+i+'" style="padding:2px 9px;font-size:12px">'
            +'Remove</button></div>';
        }).join("")
        +'</div>';
    }).join("");
  host.querySelectorAll(".tracingview").forEach(function(b){
    b.addEventListener("click",function(){
      const t=TRACINGS_KEPT[Number(b.dataset.n)];
      if(t)tracingViewerOpen([t],null,{nuc:t.nucleus_id||"",root:t.root_id||""});
    });
  });
  host.querySelectorAll(".tracingdrop").forEach(function(b){
    b.addEventListener("click",function(){
      TRACINGS_KEPT.splice(Number(b.dataset.n),1);
      tracingWrite(TRACINGS_KEPT);tracingRenderList();
    });
  });
  host.querySelectorAll(".tracingcellngl").forEach(function(b){
    b.addEventListener("click",function(){
      const g=groups[Number(b.dataset.g)];
      if(g)tracingViewerOpen(g.items.map(function(x){return x.t;}),
        "Opened all "+g.items.length+" of this cell’s kept tracings in the viewer, each in its own colour.",
        {nuc:g.nuc,root:g.root});
    });
  });
  host.querySelectorAll(".tracingcelldrop").forEach(function(b){
    const g=groups[Number(b.dataset.g)];
    b.addEventListener("click",function(){
      if(!g)return;
      tracingArm(b,"Click again to remove "+g.items.length,function(){
        const waiting=g.items.filter(function(x){return x.t.pending_share;}).length;
        TRACINGS_KEPT=TRACINGS_KEPT.filter(function(t){return tracingCellKeyOf(t.nucleus_id,t.root_id)!==g.key;});
        tracingWrite(TRACINGS_KEPT);tracingRenderList();
        tracingSay("Removed "+g.items.length+" tracing"+(g.items.length===1?"":"s")+" of that cell from this page. "
          +(waiting?waiting+" had not reached the dataset yet and are gone. ":"")
          +"What is in the dataset stays there.");
      });
    });
  });
}

'''

SHARED = u'''/* ── THE DATASET'S TRACINGS, BY CELL ─────────────────────────────────────────  2026-09-21
   The same grouping as the kept list, with three things for the whole cell: open all of it in the
   pad, in Neuroglancer, or as a zip. Groups newest first -- the cell somebody is working on now is
   the one most likely to be wanted -- and inside a cell by kind and number, so Lysosome 1, 2, 3
   read in order. See src/the_tracings_group_by_cell.py. */
function tracingRenderShared(){
  const host = document.getElementById("tracingShared");
  if (!host) return;
  if (!TRACING_SHARED.length){
    host.innerHTML = '<p class="hint">Nothing has been traced into the dataset yet. Yours would be '
      + "the first.</p>";
    return;
  }
  const groups = tracingGroupByCell(TRACING_SHARED, function(t){ return t.nucleusId; },
                                    function(t){ return t.rootId; });
  const newest = function(g){ return g.items.reduce(function(m, x){
    const s = String(x.t.timestamp || ""); return s > m ? s : m; }, ""); };
  groups.sort(function(a, b){
    if ((a.key === "") !== (b.key === "")) return a.key === "" ? 1 : -1;
    return newest(b).localeCompare(newest(a));
  });
  groups.forEach(function(g){
    g.items.sort(function(a, b){
      const ka = String(a.t.instanceOf || a.t.kind || ""), kb = String(b.t.instanceOf || b.t.kind || "");
      if (ka !== kb) return ka.localeCompare(kb);
      const na = Number(a.t.instanceIndex) || 0, nb = Number(b.t.instanceIndex) || 0;
      if (na !== nb) return na - nb;
      return String(a.t.name || "").localeCompare(String(b.t.name || ""), undefined, { numeric: true });
    });
  });
  TRACING_SHARED_GROUPS = groups;
  host.innerHTML = '<label>In the dataset, by cell — open one to add to it or correct it</label>'
    + groups.map(function(g, gi){
        const type = (g.items.filter(function(x){ return x.t.cellType; })[0] || { t: {} }).t.cellType || "";
        return '<div ' + TRACING_CELL_BOX + ' data-g="' + gi + '">'
          + '<div ' + TRACING_CELL_ROW + '>' + tracingCellHead(g.nuc, g.root, type, g.items.length)
          + '<button class="idbtn tracingcellpad" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell onto the pad, each as its own numbered structure. Adding them back '
            + 'is the next version of each.">Open all in the pad</button>'
          + '<button class="idbtn tracingcellngl" data-g="' + gi + '" ' + TRACING_BTN + ' title="Every '
            + 'tracing of this cell in the viewer, each in its own colour, with the cell.">Neuroglancer</button>'
          + '<button class="idbtn tracingcellzip" data-g="' + gi + '" ' + TRACING_BTN + ' title="A zip '
            + 'of this cell: each tracing&rsquo;s contours (JSON), a mesh of each (OBJ, nm), and an '
            + 'index.">Download zip</button></div>'
          + g.items.map(function(x){
              const t = x.t;
              const who = (t.contributors && t.contributors.length) ? t.contributors.join(", ")
                                                                    : (t.tracedBy || "");
              return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0 4px 18px;'
                + 'font-size:12px;flex-wrap:wrap;border-left:2px solid var(--line);margin-left:5px">'
                + '<span style="width:11px;height:11px;border-radius:2px;flex:0 0 auto;background:'
                  + escHtml(t.color || "#3a6b5a") + '"></span>'
                + '<span style="flex:1 1 140px;min-width:0">' + escHtml(t.name || t.structureId) + '</span>'
                + '<span style="opacity:.7;flex:0 0 auto">' + (t.contours || 0) + " contour"
                  + ((t.contours === 1) ? "" : "s") + " on " + (t.sections || 0) + " section"
                  + ((t.sections === 1) ? "" : "s") + '</span>'
                + '<span style="opacity:.7;flex:1 1 120px;min-width:0" title="Everyone who has added a '
                  + 'version of this tracing, in the order they first did.">' + escHtml(who)
                  + ((t.versions > 1) ? " &middot; v" + t.versions : "") + '</span>'
                + '<button class="idbtn tracingopen" data-sid="' + escHtml(t.structureId) + '" '
                  + TRACING_BTN + '>Open it in the pad</button>'
                /* Looking is not editing: see tracingSharedInViewer. */
                + '<button class="idbtn tracingngl" data-sid="' + escHtml(t.structureId) + '" '
                  + TRACING_BTN + ' title="Open this tracing in the viewer, as an annotation layer in '
                  + 'its own colour — without taking it onto your pad.">Neuroglancer</button>'
                + (t.fileUrl ? ' <a href="' + escHtml(t.fileUrl) + '" target="_blank" rel="noopener" '
                    + 'style="font-size:12px;opacity:.7" title="The tracing’s own file in Drive">file</a>' : "")
                + '</div>';
            }).join("")
          + '</div>';
      }).join("");
  [].slice.call(host.querySelectorAll(".tracingopen")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenShared(b.dataset.sid, b); });
  });
  [].slice.call(host.querySelectorAll(".tracingngl")).forEach(function(b){
    b.addEventListener("click", function(){ tracingSharedInViewer(b.dataset.sid, b); });
  });
  const sidsOf = function(b){ const g = groups[Number(b.dataset.g)];
    return g ? g.items.map(function(x){ return x.t.structureId; }) : []; };
  [].slice.call(host.querySelectorAll(".tracingcellpad")).forEach(function(b){
    b.addEventListener("click", function(){ tracingOpenCellShared(sidsOf(b), b); });
  });
  [].slice.call(host.querySelectorAll(".tracingcellngl")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellSharedInViewer(sidsOf(b), b); });
  });
  [].slice.call(host.querySelectorAll(".tracingcellzip")).forEach(function(b){
    b.addEventListener("click", function(){ tracingCellZip(groups[Number(b.dataset.g)], b); });
  });
}
var TRACING_SHARED_GROUPS = [];

/* One tracing's geometry, as tracingOpenShared reads it. */
async function tracingFetchShared(sid){
  const r = await fetch(REPORT_ENDPOINT + "?tracings=1&structureId=" + encodeURIComponent(sid)
                        + tracingDsQS());
  const d = await r.json();
  const t = ((d && d.tracings) || [])[0];
  if (!t) throw new Error("the dataset has no tracing with that id any more");
  if (t.error) throw new Error(t.error);
  const st = UJ.tracing.rowsToStructures(t.rows || [])[0];
  if (!st || !st.rings.length) throw new Error("that tracing came back with no contours on it");
  return { t: t, st: st };
}
/* A whole cell's, four at a time -- each is a Drive read on the backend. One that fails is
   reported, not fatal: the others are still the cell. */
async function tracingFetchCell(sids, btn){
  const out = new Array(sids.length);
  let next = 0, done = 0;
  const label = btn ? btn.textContent : "";
  const one = async function(){
    while (next < sids.length){
      const k = next++;
      try { out[k] = Object.assign({ sid: sids[k] }, await tracingFetchShared(sids[k])); }
      catch (e){ out[k] = { sid: sids[k], error: String(e && e.message || e) }; }
      done++;
      if (btn) btn.textContent = "reading " + done + " of " + sids.length + "…";
    }
  };
  if (btn){ btn.disabled = true; btn.dataset.label = label; }
  try { await Promise.all([one(), one(), one(), one()]); }
  finally { if (btn){ btn.disabled = false; btn.textContent = label; } }
  return out;
}
function tracingFailedSay(got){
  const bad = got.filter(function(x){ return x.error; });
  return bad.length ? " " + bad.length + " could not be read (" + bad.map(function(x){
    return x.sid + ": " + x.error; }).join("; ") + ")." : "";
}

async function tracingCellSharedInViewer(sids, btn){
  if (!sids.length) return;
  const got = await tracingFetchCell(sids, btn);
  const good = got.filter(function(x){ return !x.error; });
  if (!good.length){ tracingSay("Could not open that cell's tracings." + tracingFailedSay(got), true); return; }
  const ids = { nuc: "", root: "" };
  good.forEach(function(x){
    ids.nuc = ids.nuc || x.t.nucleusId || x.st.nucleusId || "";
    ids.root = ids.root || x.t.rootId || x.st.rootId || "";
  });
  tracingViewerOpen(good.map(function(x){
      return { name: x.st.name || x.t.name || x.sid, color: x.t.color || x.st.color || "#40e28c", rings: x.st.rings }; }),
    "Opened all " + good.length + " of this cell’s tracings in the viewer, each in its own colour. "
    + "Nothing has been taken onto your pad." + tracingFailedSay(got), ids);
}

/* ── A WHOLE CELL ON THE PAD ─────────────────────────────────────────────────  2026-09-21
   Each tracing becomes its own numbered structure, and PAD_EDIT_IDS remembers which shared tracing
   each number was opened from -- idOf() in tracingCurrentAll() asks it first. Its type, colour
   and published number come with it, so adding them back is the next version of each. */
var PAD_EDIT_IDS = {};
function tracingKindValue(kind, name){
  const what = document.getElementById("tracingWhat");
  if (kind === "cell") return "__cell";
  if (kind === "nucleus") return "__nucleus";
  const has = what && [].slice.call(what.options).some(function(o){ return o.value === kind; });
  return (kind && kind !== "other" && has) ? kind : "__other";
}
async function tracingOpenCellShared(sids, btn){
  if (!sids.length) return;
  if (sids.length === 1) return tracingOpenShared(sids[0], btn);
  const got = await tracingFetchCell(sids, btn);
  const good = got.filter(function(x){ return !x.error; });
  if (!good.length){ tracingSay("Could not open that cell's tracings." + tracingFailedSay(got), true); return; }
  try {
    if (!UJ.emtiles.configured()) UJ.emtiles.configure(tracingSources());
    PAD = UJ.tracepad.create();
    PAD.rings = [];
    PAD_INST_KIND = {}; PAD_INST_COLOUR = {}; PAD_EDIT_IDS = {};
    TRACING_BASE_ID = ""; TRACING_DRAFT_ID = "";
    good.forEach(function(x, k){
      x.st.rings.forEach(function(r){
        PAD.rings.push({ z: Math.round(r.z), inst: k,
          points: r.points.map(function(p){ return [Math.round(p[0]), Math.round(p[1])]; }) });
      });
      PAD_EDIT_IDS[String(k)] = String(x.st.structureId || x.sid);
      TRACING_EDIT_INDEX[String(x.st.structureId || x.sid)] = Math.round(Number(x.st.instanceIndex || x.t.instanceIndex) || 0);
      if (x.t.color || x.st.color) PAD_INST_COLOUR[String(k)] = x.t.color || x.st.color;
      const kind = String(x.st.kind || x.t.kind || "");
      const v = tracingKindValue(kind, x.st.name);
      PAD_INST_KIND[String(k)] = Object.assign({ value: v },
        tracingWhatOf(v, v === "__other" ? String(x.st.name || x.t.name || "").replace(/\\s+\\d+$/, "") : ""));
    });
    PAD.inst = 0;
    PAD.z = PAD.rings[0].z;
    const p0 = PAD.rings[0].points;
    let cx = 0, cy = 0;
    p0.forEach(function(p){ cx += p[0]; cy += p[1]; });
    PAD_CENTRE = [Math.round(cx / p0.length), Math.round(cy / p0.length), PAD.z];
    PAD_VIEW = null; PAD_BASE_READY = false;
    document.getElementById("tracePadWrap").style.display = "";
    PAD_EDIT_ID = PAD_EDIT_IDS["0"];
    TRACING_PENDING = { rings: UJ.tracepad.toRings(PAD), id: PAD_EDIT_ID };
    /* Each its own type: they are a lysosome AND a mitochondrion, not three of one thing. */
    const each = document.getElementById("tracingEachOwn");
    if (each) each.checked = true;
    const first = good[0], set = function(id, v){ const e = document.getElementById(id); if (e && v) e.value = v; };
    const what = document.getElementById("tracingWhat");
    if (what) what.value = PAD_INST_KIND["0"].value;
    set("tracingNucId", first.st.nucleusId || first.t.nucleusId);
    set("tracingRootId", first.st.rootId || first.t.rootId);
    const typeSel = document.getElementById("tracingType");
    const ct = first.st.cellType || first.t.cellType;
    if (typeSel && ct && [].slice.call(typeSel.options).some(function(o){ return o.value === ct; })){
      typeSel.value = ct; TRACING_TYPE_TOUCHED = true;
    }
    document.getElementById("tracingFound").style.display = "";
    tracingEachRender(true);
    try { padDraw(); } catch (_e){}
    try { padRings(); } catch (_e){}
    draftSoon();
    tracingSay("All " + good.length + " of this cell’s tracings are on the pad, numbered 1 to " + good.length
      + " in the Drawing strip, each in its own colour and with its own type. Correct any of them, "
      + "press “Use these contours” and add them again: each becomes the next version of itself, and "
      + "nothing of the old ones is deleted." + tracingFailedSay(got));
    if (PAD3D_ON){ PAD3D_MESHES = null; pad3DSoon(); }
  } catch (e){
    tracingSay("Could not open that cell's tracings: " + String(e && e.message || e), true);
  }
}

/* ── A WHOLE CELL AS A ZIP ───────────────────────────────────────────────────  2026-09-21 */
var TRACING_JSZIP = null;
function tracingJSZip(){
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!TRACING_JSZIP) TRACING_JSZIP = new Promise(function(res, rej){
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = function(){ window.JSZip ? res(window.JSZip) : rej(new Error("JSZip did not load")); };
    s.onerror = function(){ TRACING_JSZIP = null; rej(new Error("could not load JSZip from cdnjs")); };
    document.head.appendChild(s);
  });
  return TRACING_JSZIP;
}
function tracingSaveBlob(blob, name){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function tracingSafeName(s){
  return String(s || "tracing").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "tracing";
}
/* The pad's own loft, in nanometres, as OBJ. */
function tracingObjOf(name, rings, res){
  const g = UJ.traceloft.loft(rings, res);
  if (!g || !g.positions || !g.positions.length) return "";
  const out = ["# " + name + " — lofted from its contours by µJump's tracing card; units: nm", "o " + tracingSafeName(name)];
  for (let i = 0; i < g.positions.length; i += 3)
    out.push("v " + g.positions[i].toFixed(1) + " " + g.positions[i + 1].toFixed(1) + " " + g.positions[i + 2].toFixed(1));
  for (let i = 0; i < g.indices.length; i += 3)
    out.push("f " + (g.indices[i] + 1) + " " + (g.indices[i + 1] + 1) + " " + (g.indices[i + 2] + 1));
  return out.join("\\n") + "\\n";
}
async function tracingCellZip(g, btn){
  if (!g || !g.items.length) return;
  const label = btn ? btn.textContent : "";
  try {
    const JSZip = await tracingJSZip();
    const got = await tracingFetchCell(g.items.map(function(x){ return x.t.structureId; }), btn);
    if (btn){ btn.disabled = true; btn.textContent = "zipping…"; }
    const res = (window.UJ && UJ.cfg && UJ.cfg.res) || [4, 4, 40];
    const cell = tracingSafeName(g.nuc ? "nucleus_" + g.nuc : (g.root ? "root_" + g.root : "no_cell"));
    const zip = new JSZip(), dir = zip.folder(cell);
    const index = { nucleusId: g.nuc, rootId: g.root, dataset: (UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds) || "",
                    exported: new Date().toISOString(), voxelSizeNm: res, tracings: [], failed: [] };
    got.forEach(function(x){
      if (x.error){ index.failed.push({ structureId: x.sid, error: x.error }); return; }
      const t = x.t, st = x.st, name = st.name || t.name || x.sid;
      const base = tracingSafeName(name) + "__" + tracingSafeName(x.sid);
      const meta = { structureId: x.sid, name: name, kind: st.kind || t.kind || "", cellType: t.cellType || st.cellType || "",
                     color: t.color || st.color || "", nucleusId: t.nucleusId || st.nucleusId || "",
                     rootId: t.rootId || st.rootId || "", instanceIndex: t.instanceIndex, instanceOf: t.instanceOf || "",
                     volumeUm3: t.volumeUm3, contributors: t.contributors || [], versions: t.versions || 1,
                     tracedBy: t.tracedBy || "", timestamp: t.timestamp || "", fileUrl: t.fileUrl || "",
                     voxelSizeNm: res, units: "tool voxels (x, y) and section (z)" };
      dir.file(base + ".json", JSON.stringify(Object.assign({}, meta, { contours: st.rings }), null, 1));
      let obj = "";
      try { obj = tracingObjOf(name, st.rings, res); } catch (_e){ obj = ""; }
      if (obj) dir.file(base + ".obj", obj);
      index.tracings.push(Object.assign({ file: base + ".json", mesh: obj ? base + ".obj" : "" }, meta));
    });
    dir.file("cell.json", JSON.stringify(index, null, 1));
    dir.file("README.txt", [
      "Tracings of " + (g.nuc ? "nucleus " + g.nuc : g.root ? "root " + g.root : "no named cell")
        + (g.nuc && g.root ? ", root " + g.root : "") + (index.dataset ? " — " + index.dataset : ""),
      "Exported " + index.exported, "",
      "<name>__<structureId>.json   the tracing: its contours in tool voxels, its ids and who traced it",
      "<name>__<structureId>.obj    a mesh lofted from those contours, in nanometres",
      "cell.json                    this list, machine-readable", "",
      "Voxel size (nm): " + res.join(" x "), ""].concat(index.tracings.map(function(t){
        return t.name + "  " + t.structureId + (t.fileUrl ? "  " + t.fileUrl : ""); }))
      .concat(index.failed.length ? ["", "Could not be read:"].concat(index.failed.map(function(f){
        return f.structureId + ": " + f.error; })) : []).join("\\n") + "\\n");
    const blob = await zip.generateAsync({ type: "blob" });
    tracingSaveBlob(blob, cell + "_tracings.zip");
    tracingSay("Saved " + cell + "_tracings.zip — " + index.tracings.length + " tracing"
      + (index.tracings.length === 1 ? "" : "s") + ", each with its contours and a mesh." + tracingFailedSay(got));
  } catch (e){
    tracingSay("Could not make the zip: " + String(e && e.message || e), true);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}

'''

print("core/tracingcard.js")
replace_between(u"the kept list, by cell", u"function tracingRenderList(){",
                u"/* ── WHAT CAME OFF THE LINK, LAYER BY LAYER", KEPT, u"KEPT TRACINGS, BY CELL")
replace_between(u"the dataset's list, by cell", u"function tracingRenderShared(){",
                u"/* The same fetch tracingOpenShared() does, ending in a viewer instead", SHARED,
                u"THE DATASET'S TRACINGS, BY CELL")
edit([
 (u"idOf asks which shared tracing each structure was opened from",
  u'''  if(!TRACING_BASE_ID)
    TRACING_BASE_ID = PAD_EDIT_ID ? UJ.tracing.structureId(groups[0].w.name || "tracing")
                                  : TRACING_PENDING.id;''',
  u'''  if(!TRACING_BASE_ID)
    TRACING_BASE_ID = PAD_EDIT_ID ? UJ.tracing.structureId(groups[0].w.name || "tracing")
                                  : TRACING_PENDING.id;
  /* A WHOLE CELL OPENED ON THE PAD, 2026-09-21: each number knows the shared tracing it came from
     (PAD_EDIT_IDS, tracingOpenCellShared), and is a version of that one. */
  const editOf=function(g){ return (typeof PAD_EDIT_IDS!=="undefined"&&PAD_EDIT_IDS[String(g.inst)])||""; };'''),
 (u"...and uses it",
  u'''  const idOf=function(g){ return g.inst?(TRACING_BASE_ID+"__i"+g.inst):TRACING_PENDING.id; };''',
  u'''  const idOf=function(g){ return editOf(g)||(g.inst?(TRACING_BASE_ID+"__i"+g.inst):TRACING_PENDING.id); };'''),
 (u"a committed pad forgets them",
  u'''  PAD_EDIT_ID = ""; TRACING_BASE_ID = "";
  tracingRenderList();''',
  u'''  PAD_EDIT_ID = ""; TRACING_BASE_ID = ""; PAD_EDIT_IDS = {};
  tracingRenderList();'''),
 (u"a fresh pad forgets them",
  u'''  PAD_EDIT_ID = ""; tracingPendingClear(); PAD3D_MESHES = null; PAD3D_KEY = "";''',
  u'''  PAD_EDIT_ID = ""; PAD_EDIT_IDS = {}; tracingPendingClear(); PAD3D_MESHES = null; PAD3D_KEY = "";'''),
 (u"one tracing opened forgets a cell opened before it",
  u'''    TRACING_BASE_ID = ""; TRACING_DRAFT_ID = "";
    PAD_EDIT_ID = st.structureId;''',
  u'''    TRACING_BASE_ID = ""; TRACING_DRAFT_ID = "";
    PAD_EDIT_ID = st.structureId; PAD_EDIT_IDS = {};'''),
 (u"the draft keeps them",
  u'''           editId: PAD_EDIT_ID || "",''',
  u'''           editId: PAD_EDIT_ID || "",
           /* Which shared tracing each number is a version of (2026-09-21), or a resumed draft of a
              whole cell would file all but the first as new tracings. */
           editIds: (typeof PAD_EDIT_IDS !== "undefined") ? PAD_EDIT_IDS : {},'''),
 (u"...and gives them back",
  u'''  PAD_EDIT_ID = d.editId || "";
  const set = function(id, v){''',
  u'''  PAD_EDIT_ID = d.editId || "";
  PAD_EDIT_IDS = (d.editIds && typeof d.editIds === "object") ? d.editIds : {};
  const set = function(id, v){'''),
])
