"""The home page gets a menu, section headings, and one board for every tool.       2026-09-09

Søren: *"I would like to make an overall leaderboard for the index page. That leaderboard should
have the collective points from all the different tools, and there should be an indication of what
tools the different users have reported in. That should be the greek letter of the tool of course in
the color of the tool. It should come just after the wJump, so after all the tools. I think it is
about time we have a menu for the index page also and some headlines for the different sections."*

THREE THINGS, and the order they are in matters.

1. THE MENU. index.html had no nav at all -- eight full-bleed cards, then five sections, then a
   footer, and the only way to reach the bottom was to scroll past all of it. The sections get ids
   and the header gets a row of links. Plain anchors, no JS: a menu that needs a script to work is
   a menu that is missing while the script loads.

2. THE HEADINGS. Every section below the cards already had an <h2>; the card block itself did not,
   which is why the menu had nothing to point at for the thing the page is mostly about. It gets
   one, and the sections get ids matching their headings.

3. THE BOARD, right after ωJump -- which is where he asked for it and also where the page already
   says "One account across all eight tools — your points, level and submission history follow you
   between them." That sentence has been a promise with nothing behind it: the home page carries no
   sign-in, no endpoint and no core module, so nothing on it has ever shown a pooled number. The
   board is that sentence, demonstrated.

   Public: ?combinedLeaderboard=1 needs no credential (see src/one_leaderboard_across_every_tool.py
   for the endpoint), so the home page still has no Google client and asks nobody to sign in to
   read it.

   The Greek letters are the tools, in each person's own order -- most points first -- each in its
   own tool's colour, light and dark. The colours are lifted from the .feature cards already on this
   page rather than re-picked, so a letter and the card it stands for can never drift apart.

WHAT IT DOES WHEN THE BACKEND IS OLD. The endpoint is new and the Apps Script has to be redeployed
before it answers. Until then the fetch returns something without a `leaderboard` array and the
section says so in one quiet line rather than showing a spinner forever or an error box. Same for
an empty board.

A NOTE ON THE PALETTE, which cost an hour elsewhere today: this page uses --muted, not the tool
pages' --mut, and has no --inset. Everything below is written in THIS page's variables.

Run: python3 src/the_home_page_gets_a_menu_and_a_board.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSS = [
    (''' .buildline{margin:2px 0 14px}
</style>''',
     ''' .buildline{margin:2px 0 14px}

 /* ── the menu ─────────────────────────────────────────────────────────────────────────────
    Plain anchors. A menu that needs JavaScript to work is a menu that is missing while the
    script loads, and this one is five links. It wraps rather than scrolls on a narrow screen,
    because a horizontally-scrolling nav hides its own last item. */
 .sitenav{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 6px;padding:0;list-style:none}
 .sitenav a{color:var(--muted);text-decoration:none;font-size:14px;padding:3px 0;
   border-bottom:1px solid transparent}
 .sitenav a:hover,.sitenav a:focus{color:var(--ink);border-bottom-color:var(--teal)}
 /* Anchored sections land under nothing -- the nav does not float -- but a little breathing
    room above a jumped-to heading reads far better than the heading hard against the viewport. */
 [id]{scroll-margin-top:18px}
 .sectionhead{margin:26px 0 4px}

 /* ── the combined leaderboard ─────────────────────────────────────────────────────────────
    A list, not a table: the only genuinely tabular part is two numbers, and a table would fight
    the card column's width on a phone. Grid so the rank, the name and the numbers line up
    anyway. */
 .lb{margin:10px 0 0;border:1px solid var(--line);border-radius:12px;background:var(--card);
   overflow:hidden}
 .lbrow{display:grid;grid-template-columns:2.2em 1fr auto;gap:4px 12px;align-items:baseline;
   padding:9px 14px;border-top:1px solid var(--line)}
 .lbrow:first-child{border-top:0}
 .lbrank{color:var(--muted);font-variant-numeric:tabular-nums;font-size:14px}
 .lbname{font-weight:600;overflow-wrap:anywhere}
 .lbnum{color:var(--muted);font-size:13.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
 /* The letters sit under the name on their own line, spanning the two right-hand columns, so a
    person who works in six tools does not squeeze their own name to nothing. */
 .lbtools{grid-column:2 / -1;display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}
 .lbtools a{text-decoration:none;font-size:17px;line-height:1;font-weight:700;
   opacity:.9}
 .lbtools a:hover{opacity:1}
 .lbnote{color:var(--muted);font-size:13px;margin:8px 0 0}
 /* ── one letter per tool, in that tool's own colour ───────────────────────────────────────
    Lifted from the .feature cards above rather than re-picked, so the letter beside a name and
    the card it stands for cannot drift apart. Light values first; the dark overrides follow the
    same order. NOT uppercased anywhere -- see the note on .kicker: text-transform turns ω into Ω,
    which is a different letter. */
 .tl-ujump{color:#12a67f} .tl-djump{color:#6d28d9} .tl-pjump{color:#b81a8f}
 .tl-ljump{color:#1d4ed8} .tl-hjump{color:#9a3412} .tl-xjump{color:#166534}
 .tl-bjump{color:#a4133c} .tl-wjump{color:#854d0e}
 :root[data-theme="dark"] .tl-ujump{color:#27e0b3}
 :root[data-theme="dark"] .tl-djump{color:#b388ff}
 :root[data-theme="dark"] .tl-pjump{color:#f78ad4}
 :root[data-theme="dark"] .tl-ljump{color:#7aa2ff}
 :root[data-theme="dark"] .tl-hjump{color:#ffb454}
 :root[data-theme="dark"] .tl-xjump{color:#4ade80}
 :root[data-theme="dark"] .tl-bjump{color:#ff6b81}
 :root[data-theme="dark"] .tl-wjump{color:#fbbf24}
</style>''',
     "the menu and the board have styles"),
]

NAV = [
    ('''    <p class="buildline"><span class="build" title="When this file was built. If it does not match the file you think you are looking at, your browser is showing you a cached copy — reload with ctrl-shift-R.">build 2026-09-03 08:49</span></p>
  </div>
</header>''',
     '''    <p class="buildline"><span class="build" title="When this file was built. If it does not match the file you think you are looking at, your browser is showing you a cached copy — reload with ctrl-shift-R.">build 2026-09-03 08:49</span></p>
    <nav aria-label="Sections of this page">
      <ul class="sitenav">
        <li><a href="#tools">The tools</a></li>
        <li><a href="#leaderboard">Leaderboard</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#publications">Publications</a></li>
        <li><a href="#data">Data &amp; attribution</a></li>
        <li><a href="#privacy">Privacy</a></li>
        <li><a href="#datasets">Every dataset</a></li>
      </ul>
    </nav>
  </div>
</header>''',
     "the header has a menu"),
]

IDS = [
    ('''<div class="wrap">
  <p class="scalenote">''',
     '''<div class="wrap" id="tools">
  <h2 class="sectionhead">The tools</h2>
  <p class="scalenote">''',
     "the card block is a named section with a heading"),

    ('''<section>
  <div class="wrap">
    <h2>About</h2>''',
     '''<section id="about">
  <div class="wrap">
    <h2>About</h2>''',
     "About is linkable"),

    ('''<section>
  <div class="wrap">
    <h2>Selected publications</h2>''',
     '''<section id="publications">
  <div class="wrap">
    <h2>Selected publications</h2>''',
     "Publications is linkable"),

    ('''<section>
  <div class="wrap">
    <h2>Data &amp; attribution</h2>''',
     '''<section id="data">
  <div class="wrap">
    <h2>Data &amp; attribution</h2>''',
     "Data & attribution is linkable"),

    ('''<section>
  <div class="wrap">
    <h2>Privacy</h2>''',
     '''<section id="privacy">
  <div class="wrap">
    <h2>Privacy</h2>''',
     "Privacy is linkable"),

    ('''<section class="dstables">''',
     '''<section class="dstables" id="datasets">''',
     "the dataset tables are linkable"),
]

BOARD = [
    ('''  <p class="note" style="margin:22px 0 0">
    One account across all eight tools &mdash; your points, level and submission history follow you
    between them. Signing in is optional; you can browse and explore without it.
  </p>
</div>''',
     '''  <p class="note" style="margin:22px 0 0">
    One account across all eight tools &mdash; your points, level and submission history follow you
    between them. Signing in is optional; you can browse and explore without it.
  </p>
</div>

<!-- Directly after the eight cards, which is where Søren asked for it and also where the sentence
     above stops being a promise and starts being a demonstration. -->
<section id="leaderboard">
  <div class="wrap">
    <h2>Leaderboard</h2>
    <p>
      Points pooled across every tool. Contributing an identification, confirming or challenging
      someone else&rsquo;s, logging an organelle, proposing a root ID or measuring a volume all
      earn points; rarer identities and cells nobody has named yet are worth more. The Greek
      letters show which tools each person has worked in.
    </p>
    <div class="lb" id="lbAll"><div class="lbrow"><span class="lbrank"></span><span
      class="lbname" style="font-weight:400;color:var(--muted)">Loading&hellip;</span><span
      class="lbnum"></span></div></div>
    <p class="lbnote" id="lbAllNote"></p>
  </div>
</section>''',
     "the board sits after the eight cards"),
]

SCRIPT = [
    ('''(function(){
  var btn = document.getElementById("themeToggleBtn");
  if (btn) btn.addEventListener("click", toggleTheme);''',
     '''  /* ── the combined leaderboard ───────────────────────────────────────────────────────────
     The one fetch on this page. Public -- ?combinedLeaderboard=1 takes no credential -- so the
     home page still carries no Google client and asks nobody to sign in to read it.

     The endpoint literal is repeated here rather than imported: this page loads no core module
     and has no UJ.cfg, and one string is a smaller price than a module dependency for a single
     read. If the deployment URL ever changes, it changes in nine places, and this is the ninth. */
  var LB_ENDPOINT="https://script.google.com/macros/s/AKfycby2n1bN6NzYJuQc_EwbZeLRxOW1p9_7bs0ljxs4CpL2FMsyXnXmwm2AFjeCME41eUVP/exec";
  /* Greek letter and page per dataset key. The letters match the cards above and are NOT
     uppercased anywhere -- text-transform turns ω into Ω, a different letter. */
  var TOOLS={
    ujump:{ch:"\\u00b5",href:"/ujump.html",name:"\\u00b5Jump \\u2014 MICrONS minnie65"},
    djump:{ch:"\\u03b4",href:"/djump.html",name:"\\u03b4Jump \\u2014 V1DD"},
    pjump:{ch:"\\u03c0",href:"/pjump.html",name:"\\u03c0Jump \\u2014 pinky100"},
    ljump:{ch:"\\u03bb",href:"/ljump.html",name:"\\u03bbJump \\u2014 Lee16"},
    hjump:{ch:"\\u03b7",href:"/hjump.html",name:"\\u03b7Jump \\u2014 H01"},
    xjump:{ch:"\\u03c7",href:"/xjump.html",name:"\\u03c7Jump \\u2014 cb2"},
    bjump:{ch:"\\u03b2",href:"/bjump.html",name:"\\u03b2Jump \\u2014 vCLEM hippocampus"},
    wjump:{ch:"\\u03c9",href:"/wjump.html",name:"\\u03c9Jump \\u2014 61 volumes"}
  };
  function lbEsc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function lbNum(n){var v=Number(n);return isFinite(v)?Math.round(v).toLocaleString("en-GB"):"0";}
  function lbSay(msg){
    var el=document.getElementById("lbAll"),note=document.getElementById("lbAllNote");
    if(el)el.innerHTML='<div class="lbrow"><span class="lbrank"></span><span class="lbname" '
      +'style="font-weight:400;color:var(--muted)">'+lbEsc(msg)+'</span><span class="lbnum"></span></div>';
    if(note)note.textContent="";
  }
  (function loadCombinedLeaderboard(){
    var el=document.getElementById("lbAll");
    if(!el)return;
    fetch(LB_ENDPOINT+"?combinedLeaderboard=1").then(function(r){return r.json();}).then(function(d){
      var rows=(d&&d.leaderboard)||null;
      /* THREE OUTCOMES, THREE SENTENCES. An old deployment answers without a leaderboard array at
         all -- that is not the same as an empty board, and saying "no entries yet" for it would
         send somebody looking for contributors instead of for a redeploy. */
      if(!rows){lbSay("The combined leaderboard is not available from the server yet.");return;}
      if(!rows.length){lbSay("No contributions yet \\u2014 open any tool and identify a cell.");return;}
      el.innerHTML=rows.map(function(u,i){
        var letters=(u.datasets||[]).map(function(ds){
          var t=TOOLS[ds];
          if(!t)return "";
          var pts=(u.perDataset&&u.perDataset[ds])?" \\u2014 "+lbNum(u.perDataset[ds])+" points here":"";
          return '<a class="tl-'+lbEsc(ds)+'" href="'+t.href+'" title="'+lbEsc(t.name+pts)+'">'
                +t.ch+'</a>';
        }).join("");
        return '<div class="lbrow">'
          +'<span class="lbrank">'+(i+1)+'.</span>'
          +'<span class="lbname">'+lbEsc(u.handle||"anonymous")+'</span>'
          +'<span class="lbnum">'+lbNum(u.points)+' points \\u00b7 '+lbNum(u.reports)+' reports</span>'
          +(letters?'<span class="lbtools">'+letters+'</span>':'')
          +'</div>';
      }).join("");
      var note=document.getElementById("lbAllNote");
      /* The totals are a four-hourly snapshot, not live, and a board that looks live while being
         four hours old is the kind of thing somebody argues with. */
      if(note)note.textContent=d.updated
        ? ("Totals recomputed every four hours \\u2014 last on "+String(d.updated).slice(0,16).replace("T"," ")+" UTC.")
        : "Totals are recomputed every four hours.";
    }).catch(function(){
      lbSay("Could not reach the server, so the leaderboard could not be loaded.");
    });
  })();

(function(){
  var btn = document.getElementById("themeToggleBtn");
  if (btn) btn.addEventListener("click", toggleTheme);''',
     "the board loads itself"),
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


edit("index.html", CSS + NAV + IDS + BOARD + SCRIPT)
print("\nnow: node indexboardcheck.js")
