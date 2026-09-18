"""Report an organelle from the identity card, on every tool, without the guided identification.

Søren, 2026-09-03: "I like this 'Log an organelle here'. I want the same function on the
identity cards of all the other tools, so that you don't have to run through the guided
identification before you can report organelles."

WHERE THE WAY IN ACTUALLY WAS. Two entry points existed and both were behind something:

  1. renderResult() -- the guided-ID RESULT screen. organelleFlagHtml() is appended there, so
     logging an organelle meant first answering "what kind of cell is this?", which is a different
     question and often one you cannot answer. That is the door he is describing.
  2. loadCommunityReports() -- the identity card, and this one is the surprise. The card HAS
     carried "Report an organelle ->" since the community block was written, inside a function
     whose first act is:

         if(!reports.length && !mergedGroups.length && !notNucleusReports.length
            && !organelleGroups.length) return;

     So the way in appeared only on cells somebody had ALREADY reported something about. On a
     fresh cell -- the overwhelming majority, and exactly the cell somebody is looking at when
     they want to log the first organelle on it -- the whole block, link included, rendered
     nothing. The feature was there and was invisible precisely when it was needed.

THE FIX IS THE SECOND ONE, and it is small: the organelle affordance is separated from the reports
it used to be appended to, and rendered whether or not there is anything else to show. Everything
about the form, the wiring, ID_CTX seeding and the second-opinion behaviour is untouched.

FIVE TOOLS IN ONE EDIT. µJump, δJump, πJump, λJump and βJump all call loadCommunityReports() from
core/panel.js, so all five gain it from this one change. ηJump does NOT load core/panel.js -- by
deliberate architectural decision, see hjump-architecture-correction-2026-08-19 -- and gets the
same affordance mounted on its own identity card, using the organelleFlagHtml()/wireOrganelleFlag()
pair it already has. χJump has had it since its cards were written; ωJump's sits on its identify
card, which is reachable without finishing the walk.

WORDED THE WAY χJUMP WORDS IT, because he named that phrasing: "Log an organelle here", with
what is already logged beside it -- "2x centriole - 1x mitochondrion", or "nothing logged yet". The
old label switched between "Report an organelle" and "Suggest a different location" depending on
whether anything was on file; the count says that better, and says how much.
"""
import io, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(path, pairs):
    """Apply each replacement once, and say so if it is already there."""
    p = os.path.join(HERE, path)
    s = io.open(p, encoding="utf-8").read()
    for old, new, why in pairs:
        if new in s:
            print(path + ": already done: " + why)
            continue
        assert old in s, path + ": not found: " + why
        assert s.count(old) == 1, path + ": ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
    io.open(p, "w", encoding="utf-8").write(s)
    print(path + ": ok")


# ══ 1. the shared panel: µJump, δJump, πJump, λJump, βJump ════════════════════════════════════
edit("core/panel.js", [

(  """      if(!reports.length&&!mergedGroups.length&&!notNucleusReports.length&&!organelleGroups.length)return;
      let html="";""",
   """      /* NO EARLY RETURN ANY MORE.                                                2026-09-03

         Søren: "I want the same function on the identity cards of all the other tools, so that
         you don't have to run through the guided identification before you can report
         organelles."

         This line used to return here when the cell had no reports of any kind -- and it took the
         "Report an organelle" link down with it, because the link is appended to the same html.
         So the one way into organelle reporting that did NOT require finishing a guided cell-type
         identification was available only on cells somebody had already written about, and absent
         on every fresh cell: exactly the cell you are looking at when you want to log the first
         organelle on it.

         `empty` is kept as a flag rather than a return, because the reports block below still has
         nothing to say and should not draw a heading over nothing. What changes is that the
         organelle affordance is no longer part of that block's fate. */
      const empty=!reports.length&&!mergedGroups.length&&!notNucleusReports.length
                  &&!organelleGroups.length;
      let html="";""",
   "no early return"),

(  """      const already=organelleGroups.length;
      html+=(html?'<br>':'')+'<span class="hint">'
        +(already?'Think an organelle sits somewhere else? ':'Know where an organelle sits on this cell? ')
        +'<span class="idf-back" id="commOrganelleToggle" style="margin:0">'
        +(already?'Suggest a different location':'Report an organelle')+' &rarr;</span></span>'
        +'<div id="commOrganelleBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div>';""",
   """      const already=organelleGroups.length;
      /* χJUMP'S WORDING, because Søren named it: "Log an organelle here", with what is
         already on file beside it. The label used to switch between "Report an organelle" and
         "Suggest a different location" depending on whether anything was logged; the count says
         the same thing and says how much, and one label across the family means somebody who has
         learned χJump recognises this. The second-opinion behaviour is unchanged -- every
         submission is its own group server-side, so a different location sits alongside the
         first rather than overwriting it. */
      /* WHAT GOES BESIDE THE LABEL depends on whether the line above already said it. When the
         cell has organelle reports, the summary two lines up has just listed them ("2 users have
         logged organelle locations for this cell -- 2x centriole, 1x mitochondrion") and every
         one is drawn underneath with its coordinate, so repeating the tally here is the same
         sentence twice. What is worth saying in that case is the thing the old label said: a
         second opinion is welcome and does not overwrite the first. With nothing on file the
         count is the useful half, in χJump's own words. */
      const knownTxt=already?"add another, or suggest a different location"
                            :"nothing logged yet";
      html+=(html?'<br>':'')+'<span class="hint">Log an organelle here'
        +' <span style="opacity:.75">&mdash; '+knownTxt+'</span> '
        +'<span class="idf-back" id="commOrganelleToggle" style="margin:0">Log one &rarr;</span></span>'
        +'<div id="commOrganelleBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div>';""",
   "the label"),

(  """          if(showing){cBody.style.display="none";cTog.innerHTML=(already?"Suggest a different location":"Report an organelle")+" &rarr;";return;}""",
   """          if(showing){cBody.style.display="none";cTog.innerHTML="Log one &rarr;";return;}""",
   "the collapse label"),

# The reports block must not draw its own chrome over an empty card -- see `empty` above.
(  """      el.innerHTML=html+organRowsHtml;""",
   """      el.innerHTML=html+organRowsHtml;
      /* A card with nothing on file is now one line offering the form, rather than nothing at
         all. Marked so a check can tell the two states apart without parsing prose. */
      el.setAttribute("data-empty",empty?"1":"0");""",
   "mark the empty state"),
])


# ══ 2. ηJump, which does not load core/panel.js ═══════════════════════════════════════════════
# See hjump-architecture-correction-2026-08-19: an earlier attempt to force hJump onto the shared
# module stack destroyed its own independently-maintained panel code. It keeps its hand-written
# organelleFlagHtml()/wireOrganelleFlag() pair, which until now was only ever mounted on the
# guided-ID result screen -- so the fix here is to mount the SAME pair on the identity card too,
# not to introduce a second implementation of it.
edit("hjump.html", [

(  """function organelleFlagHtml(){
  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Log an organelle here <span class="idf-back" id="idfOrganelleToggle" style="margin:0">Log one &rarr;</span></span>'
    +'<div id="organelleInlineBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div></div>';
}
function wireOrganelleFlag(slug){
  const toggle=document.getElementById("idfOrganelleToggle"),body=document.getElementById("organelleInlineBody");""",
   """/* TWO MOUNTS, TWO SETS OF IDS.                                                    2026-09-03

   Søren: "I want the same function on the identity cards of all the other tools, so that you
   don't have to run through the guided identification before you can report organelles."

   Until now this pair was mounted once, at the bottom of renderResult() -- the guided-ID RESULT
   screen -- so logging an organelle meant first answering "what kind of cell is this?", which is
   a different question and often one you cannot answer. It is now mounted on the CELL CARD too.

   Both panels (#nucpanel and #idfpanel) can be in the DOM at once, so the second mount cannot
   reuse the first's element ids: whichever wired last would win and the other toggle would be
   dead. `pfx` gives each its own, exactly as core/panel.js keeps commOrganelle* apart from
   idfOrganelle* for the identical reason. The FORM's inner ids (organRows/organSubmit/...) are
   left alone -- wireOrganelleForm scopes every lookup to its container, so two forms open at
   once already behave. */
function organelleFlagHtml(pfx){
  pfx=pfx||"idf";
  return '<div class="idf-organelle" style="margin-top:10px"><span class="hint">Log an organelle here <span class="idf-back" id="'+pfx+'OrganelleToggle" style="margin:0">Log one &rarr;</span></span>'
    +'<div id="'+pfx+'OrganelleInlineBody" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div></div>';
}
function wireOrganelleFlag(slug,pfx){
  pfx=pfx||"idf";
  const toggle=document.getElementById(pfx+"OrganelleToggle"),body=document.getElementById(pfx+"OrganelleInlineBody");""",
   "hJump's flag takes a prefix"),

(  """      toggle.innerHTML="Report an organelle &rarr;";""",
   """      toggle.innerHTML="Log one &rarr;";""",
   "hJump's collapse label"),

# The mount itself, on the cell card, right under the guided-identification call to action --
# so the two ways of contributing sit together and the organelle one does not require the other.
(  """  h+='<div class="idcta-search" style="margin-top:10px">'+leafSearchHtml("mainLeaf")+'</div>';

  panel.innerHTML=h;
  const idfBtn=panel.querySelector("#idfgo");
  if(idfBtn) idfBtn.addEventListener("click",function(){ openIdentify(i); });""",
   """  /* ORGANELLES WITHOUT THE GUIDED IDENTIFICATION (Søren, 2026-09-03). Under the guided-ID
     call to action, because these are the two ways of contributing to a cell and neither should
     be a precondition for the other -- knowing there is a cilium on this cell is not the same
     knowledge as knowing what kind of cell it is, and the page should not demand the second
     before accepting the first. */
  h+=organelleFlagHtml("nuc");

  h+='<div class="idcta-search" style="margin-top:10px">'+leafSearchHtml("mainLeaf")+'</div>';

  panel.innerHTML=h;
  /* ID_CTX is what the form files against, and coming from here no guided run has populated it.
     Seeded from the cell on screen, with NO leaf slug: looking at a cell is not a claim about
     what it is, and organelleFormHtml prints "Identified as:" only when a slug is passed. */
  ID_CTX={i:i, seg:seg, body:String(HSB[i]), pos:pos,
          layer:(volLayer(i)!=="no-layer"?volLayer(i):tagLayer(i)), depth:depthUm(i),
          published:H01_NO_CALL[t]?null:t};
  wireOrganelleFlag(null,"nuc");
  const idfBtn=panel.querySelector("#idfgo");
  if(idfBtn) idfBtn.addEventListener("click",function(){ openIdentify(i); });""",
   "mount on the cell card"),
])
print("done")
