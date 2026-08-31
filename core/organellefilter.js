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
    if (opts && opts.groups) return opts.groups;
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
          + (showCounts ? ' <span class="nsub" style="color:var(--mut)">' + fmt(n) + '</span>' : '')
          + '</label>';
        if (extra[k.value]) h += extra[k.value];
      });
      h += '</div>';
    });
    h += '</div>';
    if (showCounts){
      h += '<p class="hint" style="margin:6px 0 0">'
        + (total ? fmt(total) + ' organelle annotation' + (total === 1 ? '' : 's') + ' reported here so far.'
                 : 'Nobody has annotated an organelle in this dataset yet — every count is zero, so a '
                   + '&ldquo;has&rdquo; filter will return nothing.')
        + '</p>';
    }
    host.innerHTML = h;

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
  function matches(have, want, m){
    if (!m) return true;
    have = have || []; want = want || [];
    var hit = want.length
      ? want.some(function(k){ return have.indexOf(k) >= 0; })
      : have.length > 0;
    return m === "not" ? !hit : hit;
  }

  return { render:render, checked:checked, mode:mode, matches:matches,
           countsFrom:countsFrom, _groupsOf:groupsOf };
})();
