/* core/organellefilter.js -- 2026-08-31, Søren: "The pJump organelle filtration looks different
   from the rest. We should make it consistent across the datasets as far as makes sense." And,
   about µJump: "For the other datasets, it says how many organelles have been identified. Please
   do that also for uJump."

   WHAT WAS INCONSISTENT. Seven tools grew an organelle filter at different times and ended up
   with three different controls:

     µJump, δJump, πJump   TWO DROPDOWNS -- #filterOrganelleKind (one kind, single-select) and
                           #filterOrganelle ("" / has / not annotated yet). One kind at a time,
                           no counts, so there is no way to see that the kind you just picked has
                           never been reported in this dataset until the filter returns nothing.
     ηJump, βJump, λJump   grouped checkboxes WITH per-kind counts, OR-matched. No "not annotated"
                           option at all.
     ωJump                 counted checkboxes, but FLAT -- no topic groups -- because it was
                           written against the short list of kinds actually logged in a volume.

   Every one of those is a reasonable local decision and together they are three answers to one
   question. This module is the single answer, and it is deliberately the UNION rather than the
   intersection: grouped, counted checkboxes (so several kinds can be asked about at once, and
   you can see which have data) PLUS the has/has-not selector (which only the dropdown version
   had, and which is a real question -- "which cells has nobody checked for a cilium yet"). No
   tool loses a capability in the name of consistency.

   COUNTS ARE THE POINT, not decoration. "Nucleolus (0)" tells you, before you filter, that the
   answer will be empty and why -- which is the difference between a filter that seems broken and
   a dataset nobody has annotated yet. Kinds at zero are dimmed rather than hidden: hiding them
   would say this dataset cannot have a nucleolus, and what is true is that nobody has logged one.

   Public surface:
     UJ.organelleFilter.render(host, opts)   -> renders, wires, returns nothing
     UJ.organelleFilter.checked(host)        -> [kindValue]
     UJ.organelleFilter.mode(host)           -> "" | "has" | "not"
     UJ.organelleFilter.matches(have, opts)  -> boolean, the matching rule in one place
     UJ.organelleFilter.countsFrom(n, kindsOf) -> {kind: count}

   WHAT THE NUMBER IS, because it has been misread once (Søren, 2026-09-09: "I don't get why
   Nucleoplasmic reticulum says 1, when there are hundreds of them?"): it is CELLS CARRYING THE
   STRUCTURE, over the cells somebody has examined -- never a count of organelles. Every caller
   dedupes per cell, because the number beside a checkbox has to be the number of cells that
   checkbox can return, or it is lying about the filter it sits on. The panel now says so on screen
   and in the tooltip; it was right all along and simply silent about its unit.
   See render()'s own comment for opts. */
window.UJ = window.UJ || {};
UJ.organelleFilter = (function(){

  function esc(s){
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(n){ return Number(n).toLocaleString("en-GB"); }

  /* The topic groups, from whichever of the two shapes this page has. µ/δ/π/η/β/λ load
     core/ontology.js, which sets a global ORGANELLE_GROUPS; ωJump ships a generated copy of the
     same list at UJ.organelles.GROUPS (generated, never hand-copied -- see build_wjump.py). Both
     are the same 61 kinds in the same 13 groups, so either is correct and neither is preferred. */
  function groupsOf(opts){
    /* ── A GROUP THE ONTOLOGY DOES NOT HAVE ──────────────────────────────────────  2026-09-24
       Søren wanted to filter on "has somebody outlined the whole of this cell", which is a real
       question about the dataset and is not an organelle. `extraGroups` appends without replacing,
       so a caller adds a question rather than taking over the list.
       See src/a_traced_cell_is_a_thing_you_can_tick.py. */
    /* `groups` REPLACES the ontology; `extraGroups` ADDS to whatever it ended up being. The two
       were written a day apart and an early return on `groups` quietly made them exclusive — so
       χJump, the one tool that passes its own vocabulary because it generates it into its own page,
       was the one tool that got no traced-outline group. 2026-09-24. */
    var base = (opts && opts.groups) ? opts.groups : baseGroups();
    if (opts && opts.extraGroups && opts.extraGroups.length)
      return base.concat(opts.extraGroups);
    return base;
  }
  function baseGroups(opts){
    if (typeof ORGANELLE_GROUPS !== "undefined" && ORGANELLE_GROUPS) return ORGANELLE_GROUPS;
    if (window.ORGANELLE_GROUPS) return window.ORGANELLE_GROUPS;
    if (UJ.organelles && UJ.organelles.GROUPS) return UJ.organelles.GROUPS;
    return [];
  }

  /* counts over a nucleus table: n rows, kindsOf(i) -> [kindValue]. Every tool computes this the
     same way and three of them had their own copy of the loop. */
  function countsFrom(n, kindsOf){
    var counts = {};
    for (var i = 0; i < n; i++)
      (kindsOf(i) || []).forEach(function(k){ counts[k] = (counts[k] || 0) + 1; });
    return counts;
  }

  /* opts = {
       counts   : {kindValue: n}. Absent or empty renders the list with every count at 0, which is
                  correct for a dataset nobody has annotated -- not a reason to render nothing.
       cls      : checkbox class, default "forganelle". Kept configurable because the existing
                  pages already query their own class name in a dozen places and renaming those
                  would be a large diff for no behaviour change.
       mode     : true to render the has/has-not selector (default true). µ/δ/π had it; the others
                  gain it. Pass false only where the question makes no sense.
       modeId   : id for that selector, default "forganelleMode".
       onChange : called whenever any control here changes.
       extraAfter : {kindValue: htmlString} -- rows spliced in directly after a kind's own row.
                  µJump's layer picker uses this for the two vector checkboxes (nucleus-to-
                  centriole, cilium base-to-tip), which belong to their kind and to no other.
       showCounts : default true. false for a pure layer picker on a page with no count source.
     } */
  function render(host, opts){
    if (!host) return;
    opts = opts || {};
    var counts = opts.counts || {};
    var cls = opts.cls || "forganelle";
    var showCounts = opts.showCounts !== false;
    var wantMode = opts.mode !== false;
    var modeId = opts.modeId || "forganelleMode";
    var extra = opts.extraAfter || {};
    var groups = groupsOf(opts);

    /* Preserved across a re-render. These lists are rebuilt whenever community data arrives or a
       dataset changes, and losing the user's ticks each time would make the control unusable on
       any page that refreshes counts. */
    var was = {}, wasMode = "";
    host.querySelectorAll("input[type=checkbox]").forEach(function(cb){ if (cb.checked) was[cb.value] = 1; });
    var oldMode = host.querySelector("#" + modeId);
    if (oldMode) wasMode = oldMode.value;

    var total = 0;
    Object.keys(counts).forEach(function(k){ total += counts[k] || 0; });

    var h = "";
    if (wantMode){
      h += '<select id="' + esc(modeId) + '" style="width:100%;margin-bottom:8px" '
        + 'title="&quot;Has&quot; matches a cell carrying at least one of the ticked structures. '
        + '&quot;Not annotated yet&quot; matches a cell carrying none of them — which may mean it '
        + 'genuinely has none, or that nobody has looked. Leave the list unticked to ask about any '
        + 'structure at all.">'
        + '<option value="">Not filtering by organelles</option>'
        + '<option value="has">Has the ticked structure(s) annotated</option>'
        + '<option value="not">Not annotated yet (may just mean nobody has looked)</option>'
        + '</select>';
    }
    h += '<div class="orgf-list" style="max-height:260px;overflow-y:auto;border:1px solid var(--line);'
      + 'border-radius:7px;padding:8px 10px">';
    groups.forEach(function(g){
      h += '<div style="margin-top:8px"><div style="font-size:11px;text-transform:uppercase;'
        + 'letter-spacing:.05em;color:var(--mut);margin-bottom:3px">' + esc(g.label) + '</div>';
      (g.kinds || []).forEach(function(k){
        var n = counts[k.value] || 0;
        /* Dimmed at zero, never hidden -- see the header. The count sits in its own span so a
           page's own .nsub styling can pick it up where one exists. */
        h += '<label style="font-size:12px;display:flex;align-items:center;gap:6px;padding:1px 0'
          + (showCounts && n === 0 ? ';color:var(--mut)' : '') + '">'
          + '<input type="checkbox" class="' + esc(cls) + '" value="' + esc(k.value) + '" '
          + 'style="width:auto"' + (was[k.value] ? ' checked' : '') + '> '
          + esc(k.label)
          + (showCounts ? ' <span class="nsub" style="color:var(--mut)" title="'
              + fmt(n) + ' cell' + (n === 1 ? '' : 's') + ' carry at least one. This counts CELLS, '
              + 'not organelles \u2014 a cell with twenty of them counts once, and a cell nobody has '
              + 'examined yet counts zero.">' + fmt(n) + '</span>' : '')
          + '</label>';
        if (extra[k.value]) h += extra[k.value];
      });
      h += '</div>';
    });
    h += '</div>';
    if (showCounts){
      h += '<p class="hint" style="margin:6px 0 0">'
        + (total ? 'Each number is how many CELLS carry that structure \u2014 not how many of the '
                   + 'structure there are. A cell with twenty counts once; a cell nobody has examined '
                   + 'yet counts zero.'
                 : 'Nobody has annotated an organelle in this dataset yet — every count is zero, so a '
                   + '&ldquo;has&rdquo; filter will return nothing.')
        + '</p>';
    }
    /* ── AND THE VESSELS, WHICH ARE NOT A QUESTION ABOUT CELLS ──────────────────  2026-10-08
       Søren wanted the vascular kinds in the filter, and when asked what ticking one should do:
       *"the ticks pick which traced vessels are listed, shown in the viewer and put in a Blender
       box — they do not filter the cell table at all."* So it is in the same box, under its own
       heading, with its OWN class: checked() returns .forganelle and never these, so a ticked
       capillary cannot change which cells match. Its own list says what it found. */
    h += vesselSectionHtml();
    host.innerHTML = h;
    try { wireVessels(host); } catch (_ev){}

    var m = host.querySelector("#" + modeId);
    if (m && wasMode) m.value = wasMode;
    /* Ticking a kind while the selector still says "not filtering" is the commonest way to end up
       thinking the control is broken, so the first tick turns it on. Only the FIRST -- after that
       the user's choice of has/not is theirs. */
    host.querySelectorAll("." + cls).forEach(function(cb){
      cb.addEventListener("change", function(){
        var sel = host.querySelector("#" + modeId);
        if (sel && !sel.value && cb.checked) sel.value = "has";
        if (opts.onChange) opts.onChange();
      });
    });
    if (m && opts.onChange) m.addEventListener("change", opts.onChange);
  }

  /* The six, from core/tracing.js, never a second list. "" when this page has not loaded it. */
  function vesselSectionHtml(){
    var V = (window.UJ && UJ.tracing && UJ.tracing.VESSELS) || null;
    if (!V || !V.length) return "";
    return '<div class="fvessel-box" style="margin-top:12px;border-top:1px solid var(--line);'
      + 'padding-top:9px">'
      + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);'
      + 'margin-bottom:3px">Vasculature</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px 14px">'
      + V.map(function(v){
          return '<label style="font-size:12px;display:flex;align-items:center;gap:6px">'
            + '<input type="checkbox" class="fvessel" value="' + esc(v.kind) + '" style="width:auto">'
            + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:'
            + esc(v.color) + '"></span>' + esc(v.label)
            + ' <span class="nsub fvessel-n" data-k="' + esc(v.kind) + '" style="color:var(--mut)">'
            + '\u2026</span></label>';
        }).join("")
      + '</div>'
      + '<p class="hint" style="margin:5px 0 0">These are traced vessels, not cells. A vessel is '
      + 'filed against no cell, so ticking one lists the vessels below \u2014 it does not change '
      + 'which cells the filter returns. The number is how many vessels of that kind have been '
      + 'traced, counting all the segments of one vessel as one.</p>'
      + '<div class="fvessel-list" style="margin-top:4px"></div></div>';
  }
  function vesselsChecked(host){
    if (!host) return [];
    return Array.prototype.map.call(host.querySelectorAll(".fvessel:checked"),
      function(cb){ return cb.value; });
  }
  /* Filled from the index when the page has one; silent when it does not, because a tool without
     core/tracedoutlines.js has no vessels to list and an error message about it would be noise. */
  function wireVessels(host){
    var box = host.querySelector(".fvessel-box");
    if (!box) return;
    var draw = function(idx){
      var want = vesselsChecked(host);
      box.querySelectorAll(".fvessel-n").forEach(function(el){
        el.textContent = String((idx.counts || {})[el.dataset.k] || 0);
      });
      var list = box.querySelector(".fvessel-list");
      if (!list) return;
      if (!want.length){
        list.innerHTML = '<p class="hint" style="margin:4px 0 0">Tick a kind to list the vessels '
          + 'traced in this dataset.</p>';
        return;
      }
      var hit = (idx.vessels || []).filter(function(v){ return want.indexOf(v.kind) >= 0; });
      if (!hit.length){
        list.innerHTML = '<p class="hint" style="margin:4px 0 0">Nothing of '
          + (want.length === 1 ? 'that kind' : 'those kinds') + ' has been traced yet.</p>';
        return;
      }
      list.innerHTML = hit.map(function(v, i){
        var seg = v.segments.length;
        return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;'
          + 'border-top:1px solid var(--line);padding:4px 0">'
          + '<span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:'
          + esc(v.color) + '"></span>'
          + '<b style="flex:0 0 auto">' + esc(v.name) + '</b>'
          + '<span style="opacity:.7;flex:1 1 90px;min-width:0">' + esc(v.label) + ' \u00b7 '
          + seg + ' segment' + (seg === 1 ? '' : 's') + ' \u00b7 ' + v.contours + ' contours</span>'
          + '<button type="button" class="idbtn fvessel-ngl" data-i="' + i + '" '
          + 'style="padding:1px 7px;font-size:11px" title="Open every segment of this vessel in '
          + 'the viewer, each in its own layer.">Neuroglancer</button>'
          + '<button type="button" class="idbtn fvessel-pad" data-i="' + i + '" '
          + 'style="padding:1px 7px;font-size:11px" title="Open every segment of this vessel on '
          + 'the tracing pad, to add to it or correct it.">Open in the pad</button>'
          + '</div>';
      }).join("");
      var sidsOf = function(b){
        var v = hit[Number(b.dataset.i)];
        return v ? v.segments.map(function(t){ return t.structureId; }) : [];
      };
      list.querySelectorAll(".fvessel-ngl").forEach(function(b){
        b.addEventListener("click", function(){
          if (typeof tracingCellSharedInViewer === "function") tracingCellSharedInViewer(sidsOf(b), b);
          else alert("The tracing card is not on this page, so there is no viewer to open.");
        });
      });
      list.querySelectorAll(".fvessel-pad").forEach(function(b){
        b.addEventListener("click", function(){
          if (typeof tracingOpenCellShared === "function") tracingOpenCellShared(sidsOf(b), b);
          else alert("The tracing card is not on this page.");
        });
      });
    };
    var idx = { vessels: [], counts: {} };
    draw(idx);
    host.querySelectorAll(".fvessel").forEach(function(cb){
      cb.addEventListener("change", function(){ draw(idx); });
    });
    if (typeof tracedVesselIndex === "function")
      tracedVesselIndex().then(function(r){ idx = r || idx; draw(idx); }, function(){});
  }

  function checked(host, cls){
    if (!host) return [];
    return Array.prototype.map.call(host.querySelectorAll("." + (cls || "forganelle") + ":checked"),
      function(cb){ return cb.value; });
  }
  function mode(host, modeId){
    if (!host) return "";
    var m = host.querySelector("#" + (modeId || "forganelleMode"));
    return m ? m.value : "";
  }

  /* THE MATCHING RULE, in one place rather than re-derived in seven filter loops.

     have  : the kinds annotated on this cell
     want  : the ticked kinds ([] = "any kind at all")
     mode  : "" (not filtering -- everything passes), "has", or "not"

     "has" with nothing ticked means "has anything", and "not" with nothing ticked means "has
     nothing" -- which is how a user reads an empty tick list next to those words, and is the one
     reading under which the two options partition the dataset. */
  function matches(have, want, m, ids){
    if (!m) return true;
    have = have || []; want = want || [];
    /* ── A TRACED WHOLE CELL IS NOT IN THE CALLER'S LIST ───────────────  2026-09-24
       Søren: "The whole cell and nucleus filter should work on all the tools."
       Every tool builds `have` from its own organelle reports, and a traced outline is in neither
       those nor the ontology -- it is in the traced-structures index. A tool that passes the cell's
       ids gets the two kinds answered here rather than in seven filter loops; one that passes
       nothing behaves exactly as before.
       See src/a_traced_cell_is_a_thing_you_can_tick.py. */
    if (ids && typeof tracedKindHas === "function"){
      have = have.slice();
      ["__traced_cell", "__traced_nucleus"].forEach(function(v){
        if (have.indexOf(v) < 0 && tracedKindHas(v, ids.nuc, ids.root)) have.push(v);
      });
    }
    var hit = want.length
      ? want.some(function(k){ return have.indexOf(k) >= 0; })
      : have.length > 0;
    return m === "not" ? !hit : hit;
  }

  return { render:render, checked:checked, mode:mode, matches:matches,
           vesselsChecked:vesselsChecked,
           countsFrom:countsFrom, _groupsOf:groupsOf };
})();
