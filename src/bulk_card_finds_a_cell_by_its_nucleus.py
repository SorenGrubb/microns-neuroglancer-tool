# -*- coding: utf-8 -*-
u"""core/bulkorgan.js, for a dataset whose cells are nucleus POINTS.                     2026-09-21

ωJump, the last tool to get the bulk card. Its cells are not a table somebody else built: they are
the nuclei the community has found, one clicked point each, and most of its volumes publish no
segmentation at all. So the ladder's rungs 1-3 -- which all read a segmentation -- would list every
marker on forty-odd volumes as "nothing here", and the card would be decoration.

Four optional host settings, all off everywhere else, so nothing moves on the other six tools:

  prepare(say)   awaited once per "Find the cells", after the reader is configured and before any
                 marker is read. ωJump uses it to read the segment under each of the volume's found
                 nuclei, so indexOfRoot can answer "which nucleus is in this segment" synchronously.
  cellNear(pt)   RUNG 3b, tried when rungs 1-3 found nothing: the host's own nearest cell ->
                 {i, distNm, others:[names]} or {i:-1, why}. The row carries the distance and starts
                 UNTICKED -- the same standing rung 3 gives a non-envelope kind, and for the same
                 reason: a nearest centre is evidence, not proof (the shortcut core/segread.js
                 rejects, because in a dendrite it names a different cell). He ticks it if it is.
                 Two candidates close together are "too close to call" and not tickable at all.
  afterSubmit(sent)  handed what postReport returned for each row, so a host whose postReport is a
                 promise can say which rows did not reach the sheet, and refresh its own lists.
  bulkOrganReset()   (a function, not a setting) clears the card -- for a host whose volume changes
                 under it, where markers pasted for the old one mean nothing on the new one.

And the Nucleus group is read from UJ.organelles.GROUPS where the page has no ORGANELLE_GROUPS
(ωJump ships the generated copy there), so a nucleoplasm kind outside a nucleus is still flagged.

Run: python3 src/bulk_card_finds_a_cell_by_its_nucleus.py
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


print("core/bulkorgan.js")
edit("core/bulkorgan.js", [
 (u"the contract names the four settings",
  u'''       needsCell:      "why" -> a segment in no cell cannot be ticked       (off)   2026-09-21
     }''',
  u'''       needsCell:      "why" -> a segment in no cell cannot be ticked       (off)   2026-09-21
       prepare:        (say) -> Promise, awaited before the markers are read  (off)   2026-09-21
       cellNear:       (point) -> Promise<{i, distNm, others} | {i:-1, why}>  (off)   2026-09-21
                       rung 3b: the host's nearest cell, UNTICKED with its distance
       afterSubmit:    (sent) -> what postReport returned for each row       (off)   2026-09-21
     }
   bulkOrganReset() clears the card, for a host whose volume changes under it.''',
 ),
 (u"the Nucleus group, from either shape",
  u'''  (typeof ORGANELLE_GROUPS!=="undefined"?ORGANELLE_GROUPS:[]).forEach(function(g){''',
  u'''  /* ωJump ships the generated copy at UJ.organelles.GROUPS rather than the global. 2026-09-21 */
  (typeof ORGANELLE_GROUPS!=="undefined"?ORGANELLE_GROUPS
   :(typeof UJ!=="undefined"&&UJ.organelles&&UJ.organelles.GROUPS)?UJ.organelles.GROUPS:[]).forEach(function(g){'''),
 (u"rung 3b",
  u'''  if(!near){
    out.warn=lastWhy||"no cell and no nucleus within "
      +(BULK_ORGAN_NEAR_NM/1000).toFixed(1)+" \\u00b5m";
    return out;
  }''',
  u'''  /* ── rung 3b: the host's own nearest cell ──  2026-09-21
     ωJump's cells are nucleus POINTS and most of its volumes have no segmentation, so rungs 1-3
     have nothing to read. The nearest found nucleus is evidence, not proof -- the row starts
     unticked with the distance on it, and two candidates close together are not offered at all. */
  if(!near&&bulkCfg().cellNear){
    let best=null,why="";
    for(const e of ends){
      const c=await bulkCfg().cellNear(e[1]);
      if(!c||!(c.i>=0)){ if(c&&c.why)why=c.why; continue; }
      if(!best||c.distNm<best.distNm){ best=c; best.via=e[0]; }
    }
    if(!best){ out.warn=why||lastWhy||"no cell found near this marker"; return out; }
    out.via=best.via; out.distNm=Math.round(best.distNm);
    if(best.others&&best.others.length){
      out.i=-1;
      out.warn="between "+bulkOrganCellName(best.i)+" and "+best.others.join(", ")
        +" \\u2014 too close to call";
      return out;
    }
    out.i=best.i; out.cellKey="row:"+best.i;
    out.warn="no segmentation to confirm it \\u2014 the nearest nucleus found is "
      +(best.distNm/1000).toFixed(1)+" \\u00b5m away. Tick it if this is its cell.";
    return out;
  }
  if(!near){
    out.warn=lastWhy||"no cell and no nucleus within "
      +(BULK_ORGAN_NEAR_NM/1000).toFixed(1)+" \\u00b5m";
    return out;
  }'''),
 (u"prepare, before the markers",
  u'''  btn.disabled=true;
  const t0=Date.now();''',
  u'''  btn.disabled=true;
  if(bulkCfg().prepare){
    try{ await bulkCfg().prepare(function(m){ bulkOrganSetStatus(m); }); }
    catch(e){ btn.disabled=false; bulkOrganSetStatus(String(e&&e.message||e),true); return; }
  }
  const t0=Date.now();'''),
 (u"what went out is handed back",
  u'''  const stamp=Date.now();
  let posted=0;''',
  u'''  const stamp=Date.now();
  let posted=0;
  const sent=[];'''),
 (u"...each row's return kept",
  u'''      if(postReport({''',
  u'''      const back=postReport({'''),
 (u"...kept, then counted",
  u'''        identified:"",comment:comment,path:"bulk paste"
      })!==false)posted++;''',
  u'''        identified:"",comment:comment,path:"bulk paste"
      });
      sent.push(back);
      if(back!==false)posted++;'''),
 (u"...and given to the host",
  u'''    +"Thanks \\u2014 "+posted+" structure"+(posted===1?"":"s")+" logged across "
    +Object.keys(byCell).length+" cell"+(Object.keys(byCell).length===1?"":"s")+".</div>";
}''',
  u'''    +"Thanks \\u2014 "+posted+" structure"+(posted===1?"":"s")+" logged across "
    +Object.keys(byCell).length+" cell"+(Object.keys(byCell).length===1?"":"s")+".</div>";
  if(bulkCfg().afterSubmit){ try{ bulkCfg().afterSubmit(sent); }catch(_e){} }
}

/* Empty the card: rows, table, messages and the pasted link. For a host whose volume changes under
   it -- markers pasted for one volume are coordinates in another's voxels on the next. 2026-09-21 */
function bulkOrganReset(){
  BULK_ORGAN_ROWS=[];
  ["bulkOrganLink","bulkOrganComment"].forEach(function(id){
    const e=document.getElementById(id); if(e)e.value=""; });
  ["bulkOrganStatus","bulkOrganThanks"].forEach(function(id){
    const e=document.getElementById(id); if(e)e.innerHTML=""; });
  const b=document.getElementById("bulkOrganSubmit");
  if(b){ b.disabled=false; b.textContent="Submit"; }
  bulkOrganRender();
}'''),
])
