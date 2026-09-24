# -*- coding: utf-8 -*-
u"""Outlining a whole cell is identifying it.                                             2026-09-24

Søren: "When submitting a whole cell segmentation for an unclassified cell, where you specify which
cell it is, you should be prompted of how certain you are and then the cell should change name to the
name you put in and you should be credited with the identification. It is tedious that I have to
both identify the cell when I input segmentation and then afterwards also identify it again."

HE WAS SAYING IT TWICE, and he is right that he was. The tracing card already asks which cell this
is -- #tracingType, which is the identification tree's own leaf list -- and the answer goes into the
tracing's row as `cellType`. But that column is a LABEL ON THE OUTLINE, not an identification of the
cell: nothing reads it as one, so the headline went on saying "Unclassified", nobody was credited,
and the only way to fix either was to walk the guided identification afterwards and type the same
name again.

THE ONE THING THE CARD DOES NOT HAVE IS HOW SURE HE IS, and it is not a formality. The 1-5 rating is
what breaks ties in core/panel.js's tally when two people propose different names for one cell, so an
identification submitted without one would be a weaker claim than the same claim made through the
guided form. That is the single question the offer asks; everything else it already knows.

WHEN IT IS OFFERED, and each condition is there to stop a specific wrong submission:

  the outline is of a WHOLE CELL          a lysosome's row carries the host cell's type too, and
                                          outlining a lysosome is not a claim about the cell.
  nothing is on file for the cell          "unclassified", in his words. If MICrONS predicted a type,
                                          or the community or Grubb et al. have named it, this stays
                                          out: agreeing or disagreeing with an existing name is what
                                          the guided form is for, and it asks questions this does
                                          not.
  he CHOSE the type himself                tracingSuggestType fills that box from MICrONS, the
                                          community or Grubb et al. and says out loud where it came
                                          from. Submitting the page's own guess as his identification
                                          would be putting a name in his mouth. TRACING_TYPE_TOUCHED
                                          is true only when he picked one.
  it has not been identified already       `identified_at` on the tracing, carried across a re-add
                                          like shared_sig and centre_registered before it -- the
                                          fifth field in that list, which its own comment asked for.

THE CELL IS RENAMED BY THE PATH EVERY OTHER IDENTIFICATION RENAMES IT BY. This does not write over
the headline: it posts an ordinary `new_identification` and then asks loadCommunityReports() to
re-read, which is the function that promotes a winning community name into #ctHeadline. So the name,
the credit, the classification history and the Excel column all behave exactly as they do for a
identification made through the form -- because it IS one. The 2.5 s delay before the re-read is the
same one every other submission on the page uses: Apps Script needs a moment to append the row
before a GET would see it.

CREDIT IS FREE. postReport attaches reporterName, reporterEmail and the Google credential itself, so
the identification is his the moment it is sent.

Check: identifyfromtracingcheck.js, written first; 13 of its 19 assertions failed before this.
Run: python3 src/outlining_a_whole_cell_is_identifying_it.py, then python3 src/build_stamps.py, then
python3 wjump-build/build_wjump.py
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


edit("core/tracingcard.js", [
 # ── 1. a stale offer goes when the pad's context does ─────────────────────────────────────────
 (u"the offer is part of the pending context",
  u'''function tracingPendingClear(){
  TRACING_PENDING = null;''',
  u'''function tracingPendingClear(){
  TRACING_PENDING = null;
  try { tracingIdClear(); } catch (_e){}    // an offer about a tracing that is no longer pending'''),

 # ── 2. what was identified survives a re-add, like the four before it ─────────────────────────
 (u"identified_at is the fifth carried field",
  u'''    if(prior&&prior.shared_sig)t.shared_sig=prior.shared_sig;
    t.pending_share=true;''',
  u'''    if(prior&&prior.shared_sig)t.shared_sig=prior.shared_sig;
    /* ── AND WHETHER IT HAS ALREADY NAMED ITS CELL ───────────────────  2026-09-24
       The fifth field, and the paragraph above asked for it to go here in the same breath. Without
       it, every re-add of an outlined whole cell would offer to identify the cell again — and the
       community index it checks against does not refresh for a minute, so it would say yes.
       See src/outlining_a_whole_cell_is_identifying_it.py. */
    if(prior&&prior.identified_at){
      t.identified_at=prior.identified_at;
      t.identified_as=prior.identified_as;
      t.identified_certainty=prior.identified_certainty;
    }
    t.pending_share=true;'''),

 # ── 3. and the press ends by asking ───────────────────────────────────────────────────────────
 (u"the press offers to identify the cell",
  u"""     +(all.length===1?'its':'their')+' own.');
  tracingFlushSoon();
}""",
  u"""     +(all.length===1?'its':'their')+' own.');
  tracingFlushSoon();
  /* LAST, and after tracingSay: the offer sits under the card's own sentence about the press, and
     tracingPendingClear() above would have removed it if it had been built first (2026-09-24). */
  try { tracingIdAsk(all); } catch (_e){}
}

/* ── OUTLINING A WHOLE CELL IS IDENTIFYING IT ────────────────────────  2026-09-24
   Søren: "It is tedious that I have to both identify the cell when I input segmentation and then
   afterwards also identify it again."

   The card already asked which cell this is; the answer went into the tracing's row as a label and
   was read by nothing as an identification. So the press now offers to make it one. The one thing
   the card does not know is how sure he is, and that is not a formality — the 1-5 rating is what
   settles a tie between two proposed names in core/panel.js's tally — so it is the one question
   asked. See src/outlining_a_whole_cell_is_identifying_it.py for why each guard below is there. */
var TRACING_ID_OFFER = null;

/* The cell's own coordinate, from the page's table rather than from wherever the pad was: an
   identification is filed at the cell, and the nucleus centre is what every other one carries. */
function tracingIdCoord(t, nid){
  try {
    if (nid && typeof nidToIndex === "function" && typeof NX !== "undefined"){
      var i = nidToIndex(String(nid));
      if (i >= 0) return [NX[i], NY[i], NZ[i]].join(",");
    }
  } catch (_e){}
  return String((t && t.cell_coord) || "");
}

function tracingIdCandidate(t){
  try {
    if (!t || !t.id) return null;
    if (String(t.kind || "").toLowerCase() !== "cell") return null;   // a whole cell, nothing else
    if (t.identified_at) return null;                                 // asked and answered once
    var name = String(t.type || "").trim();
    if (!name || name.toLowerCase() === "traced") return null;
    /* THE PAGE'S OWN GUESS IS NOT HIS CLAIM. */
    if (!TRACING_TYPE_TOUCHED) return null;
    var nuc = String(t.nucleus_id || "").trim(), root = String(t.root_id || "").trim();
    if (!nuc && !root) return null;                                   // nowhere to file it
    if (typeof postReport !== "function") return null;                // no backend on this page
    /* ── AND ONLY WHERE THIS IS A THING THE BACKEND TAKES ──────────────────  2026-09-24
       The page must answer "what is this cell" out of its OWN nucleus tables rather than through
       UJ.cfg.tracing.identityFor. That is a proxy, and it was measured rather than assumed: the two
       tools that answer through the hook are ωJump and χJump — a volume’s nucleus keys and an
       assembly’s key — and neither backend has a `new_identification` to send one to.
       ηJump, βJump and λJump do have one and would be welcome here; they are excluded by the line
       after this instead, because nothing on those pages can say a cell is still unnamed, and
       offering to name a cell somebody has already named is the one thing this must not do. */
    var hook = null;
    try { hook = (UJ && UJ.cfg && UJ.cfg.tracing) ? UJ.cfg.tracing.identityFor : null; } catch (_e){}
    if (typeof hook === "function") return null;
    var id = null;
    try { id = tracingIdentityFor(nuc, root); } catch (_e){ return null; }
    if (!id) return null;                        // the page cannot say; guessing would be worse
    if (String(id.name || "").trim()) return null;   // already named, by somebody or something
    return { t: t, name: name,
             nuc: nuc || String(id.nucleusId || ""), root: root || String(id.rootId || ""),
             coord: tracingIdCoord(t, nuc || id.nucleusId) };
  } catch (_e){ return null; }
}

function tracingIdClear(){
  TRACING_ID_OFFER = null;
  var el = document.getElementById("tracingIdOffer");
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
/* Built here rather than in eight pages' markup: the card's own element list is a contract, and
   this is one panel that appears on a press and goes again. It sits directly under
   #tracingStatus, which is where the sentence about the press is. */
function tracingIdHost(){
  var st = document.getElementById("tracingStatus");
  if (!st || !st.parentNode) return null;
  var el = document.getElementById("tracingIdOffer");
  if (!el){
    el = document.createElement("div");
    el.id = "tracingIdOffer";
    el.style.cssText = "margin-top:8px;padding:8px 10px;border:1px solid var(--accent,#40e28c);"
                     + "border-radius:7px;font-size:12px;line-height:1.45";
    st.parentNode.insertBefore(el, st.nextSibling);
  }
  return el;
}

function tracingIdAsk(all){
  tracingIdClear();
  var cands = (all || []).map(tracingIdCandidate).filter(Boolean);
  if (!cands.length) return;
  var c = cands[0], el = tracingIdHost();
  if (!el) return;
  TRACING_ID_OFFER = { c: c, cert: "" };
  var pills = [1, 2, 3, 4, 5].map(function(n){
    return '<button type="button" class="tid-cert" data-val="' + n + '" style="width:32px;'
         + 'height:32px;border-radius:50%;border:1px solid var(--line,#ccc);background:transparent;'
         + 'color:inherit;font-weight:600;cursor:pointer">' + n + '</button>';
  }).join("");
  el.innerHTML =
      '<div><b>Identify this cell as “' + escHtml(c.name) + '”?</b></div>'
    + '<div style="margin-top:3px">You have outlined the whole of it and nothing is on file for it '
    + 'yet — that name is what the “Which cell is it part of?” box above says. One '
    + 'thing is missing: how sure are you? That rating is what settles it if somebody later '
    + 'proposes a different name.</div>'
    + '<div style="display:flex;gap:6px;align-items:center;margin:7px 0">' + pills
    + '<span style="margin-left:6px;opacity:.75">1 = not sure, 5 = certain</span></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button type="button" class="idbtn" id="tracingIdGo" style="width:auto;padding:4px 12px">'
    + 'Identify it</button>'
    + '<button type="button" class="hist-chip" id="tracingIdNo">Not now</button></div>'
    + '<div id="tracingIdSaid" style="margin-top:6px"></div>'
    + (cands.length > 1
        ? '<div style="margin-top:6px;opacity:.75">' + (cands.length - 1) + ' other whole-cell '
          + 'outline' + (cands.length === 2 ? '' : 's') + ' in this press '
          + (cands.length === 2 ? 'is' : 'are') + ' not offered here — one cell at a time, or '
          + 'identify ' + (cands.length === 2 ? 'it' : 'them') + ' from the cell panel as usual.</div>'
        : "");
  [].slice.call(el.querySelectorAll(".tid-cert")).forEach(function(bt){
    bt.addEventListener("click", function(){
      if (!TRACING_ID_OFFER) return;
      TRACING_ID_OFFER.cert = bt.getAttribute("data-val") || "";
      [].slice.call(el.querySelectorAll(".tid-cert")).forEach(function(x){
        var on = x === bt;
        x.style.background = on ? "var(--accent,#40e28c)" : "transparent";
        x.style.color = on ? "var(--on-accent,#000)" : "inherit";
        x.style.borderColor = on ? "var(--accent,#40e28c)" : "var(--line,#ccc)";
      });
      var said = document.getElementById("tracingIdSaid");
      if (said) said.innerHTML = "";
    });
  });
  var go = document.getElementById("tracingIdGo");
  if (go) go.addEventListener("click", tracingIdSubmit);
  var no = document.getElementById("tracingIdNo");
  if (no) no.addEventListener("click", tracingIdClear);
}

function tracingIdSubmit(){
  var o = TRACING_ID_OFFER;
  if (!o) return;
  var said = document.getElementById("tracingIdSaid");
  if (!o.cert){
    if (said) said.innerHTML = '<span style="color:var(--bad,#c33)">Pick how certain you are, '
                             + '1 to 5, before submitting.</span>';
    return;
  }
  var c = o.c, t = c.t;
  var sections = (t.rings || []).length;
  var vol = isFinite(t.volume_um3)
    ? (t.volume_um3 >= 1 ? t.volume_um3.toFixed(2) : t.volume_um3.toFixed(4)) : "";
  /* The row says where the claim came from, in words, before any column is read — the same thing
     tracingRegisterCentre does for an organelle's centre annotation. */
  var comment = "Identified from the whole-cell outline traced on this cell"
    + (sections ? " (" + sections + " contour" + (sections === 1 ? "" : "s")
                + (vol ? ", " + vol + " µm³" : "") + ")" : "")
    + (t.id ? ", structure " + t.id : "") + ".";
  var payload = { type: "new_identification", timestamp: new Date().toISOString(),
                  nucleusId: c.nuc, rootId: c.root, coord: c.coord,
                  identified: (typeof canonSubmitName === "function")
                                ? canonSubmitName(c.name) : c.name,
                  certainty: o.cert,
                  comment: comment,
                  /* No tree was walked, so there is no path. Left empty rather than filled with a
                     sentence: that column means "the questions answered to get here". */
                  path: "",
                  source: "segmentation", fromStructureId: t.id || "" };
  var go = document.getElementById("tracingIdGo");
  if (go){ go.disabled = true; go.textContent = "Identifying…"; }
  var answer = postReport(payload, "Identified — thank you. This cell is now “"
                                   + c.name + "”, credited to you.");
  var landed = function(res){
    if (res && res.ok === false){
      if (go){ go.disabled = false; go.textContent = "Identify it"; }
      if (said) said.innerHTML = '<span style="color:var(--bad,#c33)">It was not recorded — '
                               + 'postReport has said why. Nothing about your outline changed.</span>';
      return;
    }
    /* Remembered on the TRACING, and carried across a re-add, so a second press does not ask again
       (the community index it checks does not refresh for a minute). */
    t.identified_at = new Date().toISOString();
    t.identified_as = payload.identified;
    t.identified_certainty = o.cert;
    try { tracingWrite(TRACINGS_KEPT); } catch (_e){}
    if (go && go.parentNode) go.parentNode.removeChild(go);
    var noBtn = document.getElementById("tracingIdNo");
    if (noBtn && noBtn.parentNode) noBtn.parentNode.removeChild(noBtn);
    if (said) said.innerHTML = "🎉 Identified as “" + escHtml(c.name)
      + "”, certainty " + escHtml(String(o.cert)) + "/5, credited to you. The cell’s name "
      + "changes here in a moment, and anybody who disagrees can propose another — which is why "
      + "the rating matters.";
    TRACING_ID_OFFER = null;
    /* WHAT RENAMES THE CELL. Not a write over the headline: loadCommunityReports is the function
       that promotes a winning community name into #ctHeadline, so this cell is renamed by exactly
       the path an identification made through the guided form renames it by. The delay is the one
       every other submission here uses — Apps Script needs a moment to append the row before a
       GET would see it. */
    setTimeout(function(){
      try {
        var open = (typeof CUR_NUCID !== "undefined") ? CUR_NUCID : null;
        if (typeof loadCommunityReports === "function" && (!open || String(open) === String(c.nuc)))
          loadCommunityReports(c.nuc, (window.CUR_POS || null));
      } catch (_e){}
      try { if (typeof loadClassificationHistory === "function") loadClassificationHistory(c.nuc); }
      catch (_e){}
    }, 2500);
  };
  if (answer === false){ landed({ ok: false }); return; }
  if (answer && typeof answer.then === "function")
    answer.then(landed, function(){ landed({ ok: false }); });
  else landed({ ok: true });
}"""),
])
