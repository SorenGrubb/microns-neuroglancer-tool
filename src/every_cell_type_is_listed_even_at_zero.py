"""Every cell type is listed, dimmed at zero, and a reported cell counts.            2026-09-09

Søren, on πJump: *"I have reported some cells in pJump but they do not show up in the filter. It
would be nice if all the possible cells are just greyed out until they are identified."*

His screenshot: one box, "Cell types — excitatory neuron 359, inhibitory neuron 33, glia 59".
Those three are pinky100's own coarse classes, rendered by the `extra` fallback. Not one of the
forty-odd ontology types was offered.

TWO SEPARATE CAUSES, both of them written down in the file already.

1. THE LIST HIDES AN EMPTY TYPE.

       const members=(CATEGORY_MEMBERS[cat]||[]).filter(n=>countFor(n)>0);

   The 2026-08-20 rule: only offer a type that EXISTS. It was right about the thing it fixed --
   ticking a checkbox and getting nothing back with no hint why. δJump already stopped doing it on
   2026-09-02, on his words *"Even though they have not been reported yet, they should be in the
   list"*, and dims the empty ones instead: shown, and shown to be empty. That change was made in
   δJump alone and never carried across. This carries it to µJump and πJump, keeping πJump's
   `extra` box (the three pinky100 classes, which belong to no ontology category).

2. THE COUNT DOES NOT SEE A COMMUNITY REPORT.

   filterTypeTally() says so in its own comment: *"a type that exists ONLY as community reports,
   with no predicted, verified or standalone cell, is not offered."* Which is exactly the cell he
   reported. buildAllIdentities() consults `window.__COMM_ROWTYPE` -- and learned on 2026-08-30,
   from the same kind of report ("identified a microglia by bounding box and it never showed up
   under the Microglia checkbox"), that the community lookup must come BEFORE the "no MICrONS
   prediction, skip" bail, because the types MICrONS handles worst are the ones people report. The
   tally never got that lesson. It does now, in the same order.

   And the numbers are recomputed when the community fetch lands: it resolves after the panel is
   first drawn, so without a rebuild they would stay at their pre-community values for the life of
   the page. The rebuild preserves what is ticked, so it is safe to call at any time.

Run: python3 src/every_cell_type_is_listed_even_at_zero.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALL = ["ujump.html", "djump.html", "pjump.html"]

# ── the tally counts a community identification ─────────────────────────────────────────────────
TALLY = [
    ('''      const k=NT[i];if(k===0)continue;
      const mg=mergedInfo(i);
      if(mg){for(const m of mg)add(m.type);continue;}
      add(CT_NAMES[k-1]);''',
     '''      const mg=mergedInfo(i);
      if(mg){for(const m of mg)add(m.type);continue;}
      /* THE COMMUNITY LOOKUP COMES BEFORE THE "NO PREDICTION, SKIP" BAIL, and the order is the
         whole fix. buildAllIdentities() learned this on 2026-08-30 -- Søren identified a microglia
         by bounding box and it never appeared under the Microglia checkbox, because the override
         was consulted after `if(t===0)continue` and MICrONS makes no prediction at all for exactly
         the types people report most. This tally kept the old order until 2026-09-09 ("I have
         reported some cells in pJump but they do not show up in the filter"), which is why a cell
         he had named himself counted as nothing. Same precedence as buildAllIdentities: own >
         merged breakdown > community > prediction. */
      const covr=window.__COMM_ROWTYPE?window.__COMM_ROWTYPE[String(NID[i])]:null;
      if(covr){add(covr);continue;}
      const k=NT[i];if(k===0)continue;
      add(CT_NAMES[k-1]);''',
     "a community identification is counted"),
]

# ── the counts are redrawn once the community data arrives ──────────────────────────────────────
REBUILD = [
    ('''    ALL_IDENTITIES=null; // force rebuild so the override is reflected wherever ALL_IDENTITIES is read''',
     '''    ALL_IDENTITIES=null; // force rebuild so the override is reflected wherever ALL_IDENTITIES is read
    /* ...and the numbers beside the type checkboxes, which filterTypeTally() now reads
       __COMM_ROWTYPE for. This fetch resolves AFTER the filter panel is first drawn, so without a
       rebuild the counts would keep their pre-community values for the life of the page and a cell
       somebody just identified would go on reading as zero. Safe to call at any time: the builder
       carries the ticked boxes across a rebuild. typeof-guarded because this fires at init, which
       can be before the filter panel's own IIFE has defined either function. */
    try{
      if(typeof window.buildFilterTypeCheckboxes==="function")window.buildFilterTypeCheckboxes();
      if(typeof window.buildNearTypeCheckboxes==="function")window.buildNearTypeCheckboxes();
    }catch(_e2){}''',
     "the counts are redrawn when the community data lands"),
]

# ── a rebuild keeps what was ticked ─────────────────────────────────────────────────────────────
KEEP = [
    ('''    if(!container)return;
    const tally=filterTypeTally();''',
     '''    if(!container)return;
    /* What is ticked survives a rebuild. Before the counts were redrawn on the community fetch
       this never came up -- the list was built once, at init, with nothing checked. It does now,
       and silently clearing somebody's selection while they are choosing would be worse than the
       stale numbers this rebuild exists to fix. */
    const was={};
    container.querySelectorAll("input[type=checkbox]").forEach(function(cb){if(cb.checked)was[cb.value]=1;});
    const tally=filterTypeTally();''',
     "a rebuild keeps the ticks"),
]

# ── µJump: every member, dimmed at zero (δJump's 2026-09-02 shape) ──────────────────────────────
UJUMP = [
    ('''      const members=(CATEGORY_MEMBERS[cat]||[]).filter(n=>countFor(n)>0);
      if(!members.length)continue;
      html+='<div style="margin-top:8px"><b style="font-size:12px;color:var(--mut)">'+cat+'</b><div class="toggles" style="margin-top:4px">';
      for(const n of members)html+='<label style="font-size:12px" title="'+typeTitle(n)+'"><input type="checkbox" class="'+cls+'" value="'+n+'"> '+n+' <span class="nsub">'+countFor(n).toLocaleString()+'</span></label>';
      html+="</div></div>";''',
     '''      /* EVERY member, not only the ones with cells -- δJump's 2026-09-02 shape, brought here
         2026-09-09 on the same request ("It would be nice if all the possible cells are just
         greyed out until they are identified"). The 2026-08-20 rule this replaces was "only offer
         a type that EXISTS", and it was right about the thing it fixed: ticking a checkbox and
         getting nothing back, with no hint why. That is still not allowed -- an empty type is
         DIMMED, its count says 0, and its tooltip says what that means. Shown, and shown to be
         empty. ηJump has drawn its zero-count pools this way since it was written. */
      const members=CATEGORY_MEMBERS[cat]||[];
      if(!members.length)continue;
      html+='<div style="margin-top:8px"><b style="font-size:12px;color:var(--mut)">'+cat+'</b><div class="toggles" style="margin-top:4px">';
      for(const n of members){
        const c=countFor(n), empty=!c;
        const tip=empty
          ? typeTitle(n)+" — no cell in this dataset carries this identity yet. Tick it anyway: it "
            +"starts matching the moment somebody reports one."
          : typeTitle(n);
        html+='<label style="font-size:12px'+(empty?';opacity:.55':'')+'" title="'+tip+'">'
          +'<input type="checkbox" class="'+cls+'" value="'+n+'"'+(was[n]?' checked':'')+'> '+n
          +' <span class="nsub">'+c.toLocaleString()+'</span></label>';
      }
      html+="</div></div>";''',
     "every type is listed, dimmed at zero"),
]

# ── δJump: already lists every member; only the ticks need carrying ─────────────────────────────
DJUMP = [
    ('''        html+='<label style="font-size:12px'+(empty?';opacity:.55':'')+'" title="'+tip+'">'
          +'<input type="checkbox" class="'+cls+'" value="'+n+'"> '+n
          +' <span class="nsub">'+c.toLocaleString()+'</span></label>';''',
     '''        html+='<label style="font-size:12px'+(empty?';opacity:.55':'')+'" title="'+tip+'">'
          +'<input type="checkbox" class="'+cls+'" value="'+n+'"'+(was[n]?' checked':'')+'> '+n
          +' <span class="nsub">'+c.toLocaleString()+'</span></label>';''',
     "δJump's list keeps its ticks across a rebuild"),
]

# ── πJump: same, through its own box() helper, keeping the `extra` box ──────────────────────────
PJUMP = [
    ('''    const box=(cat,members)=>{
      let h='<div style="margin-top:8px"><b style="font-size:12px;color:var(--mut)">'+cat+'</b><div class="toggles" style="margin-top:4px">';
      for(const n of members)h+='<label style="font-size:12px" title="'+typeTitle(n)+'"><input type="checkbox" class="'+cls+'" value="'+n+'"> '+n+' <span class="nsub">'+countFor(n).toLocaleString()+'</span></label>';
      return h+"</div></div>";
    };''',
     '''    /* An empty type is DIMMED, not hidden -- δJump's 2026-09-02 shape, brought here 2026-09-09:
       "It would be nice if all the possible cells are just greyed out until they are identified."
       The 2026-08-20 rule this replaces was "only offer a type that EXISTS", right about the thing
       it fixed (a checkbox that returns nothing, with no hint why) and wrong about the remedy: the
       count says 0 and the tooltip says what that means, which is the hint, without implying that
       pinky100 contains no glia and no vasculature. */
    const box=(cat,members)=>{
      let h='<div style="margin-top:8px"><b style="font-size:12px;color:var(--mut)">'+cat+'</b><div class="toggles" style="margin-top:4px">';
      for(const n of members){
        const c=countFor(n), empty=!c;
        const tip=empty
          ? typeTitle(n)+" — no cell in this dataset carries this identity yet. Tick it anyway: it "
            +"starts matching the moment somebody reports one."
          : typeTitle(n);
        h+='<label style="font-size:12px'+(empty?';opacity:.55':'')+'" title="'+tip+'">'
          +'<input type="checkbox" class="'+cls+'" value="'+n+'"'+(was[n]?' checked':'')+'> '+n
          +' <span class="nsub">'+c.toLocaleString()+'</span></label>';
      }
      return h+"</div></div>";
    };''',
     "πJump's box dims rather than hides"),

    ('''      const members=(CATEGORY_MEMBERS[cat]||[]).filter(n=>countFor(n)>0);
      if(members.length)html+=box(cat,members);''',
     '''      const members=CATEGORY_MEMBERS[cat]||[];
      if(members.length)html+=box(cat,members);''',
     "...and every category is drawn"),
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


for page in ALL:
    edit(page, TALLY + REBUILD + KEEP)
edit("ujump.html", UJUMP)
edit("djump.html", DJUMP)
edit("pjump.html", PJUMP)
print("\nnow: node celltypelistcheck.js")
