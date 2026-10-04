# -*- coding: utf-8 -*-
u"""Share the view, on the three places Søren posts.                                     2026-10-04

Søren: *"There should also be a share option to share it on Bluesky/LinkedIn/X."* — a third thing
in the ⤓ menu, offering the picture and the turn, as the two entries above it do.

NONE OF THE THREE TAKES AN IMAGE THROUGH A LINK, which is the fact the whole design turns on. Their
composers accept text and a URL and nothing else; no intent URL on any of them carries a picture.
So core/mesh3dshot.js takes whichever of the two honest routes the browser offers — the OS share
sheet with the real file attached, which is what a phone has and is where all three apps appear, or
the clipboard plus a composer in a new tab, which is everywhere else.

WHAT THIS FILE ADDS IS THE SAYING-SO. The two routes leave the person with different work to do: on
a phone the picture is already attached and there is nothing more, and on a desktop it is on the
clipboard and has to be pasted. A button that did the right thing silently would look broken on half
the machines it runs on. So the panel's own note says which happened, and on the desktop route it
carries the three composers as links, with the caption already written.

A GIF CANNOT GO ON A CLIPBOARD. There is no API for it on any browser: ClipboardItem carries PNG and
little else. So a turn shared from a desktop downloads instead, and the note says that too, rather
than leaving somebody pasting into an empty box and wondering.

Check: shotcheck.js.
Run: python3 src/share_it_where_people_will_see_it.py
     python3 src/build_stamps.py
     node shotcheck.js
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    print(rel)
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


edit("core/mesh3d.js", [

 (u"the menu offers to share it too",
  u'''        + "<div class='m3d-saves' hidden>"
        + "<button type='button' class='m3d-savepng'>Picture (PNG)</button>"
        + "<button type='button' class='m3d-savegif'>Turn (GIF)</button>"
        + "</div>"''',
  u'''        + "<div class='m3d-saves' hidden>"
        + "<button type='button' class='m3d-savepng'>Picture (PNG)</button>"
        + "<button type='button' class='m3d-savegif'>Turn (GIF)</button>"
        /* Søren: "a share option to share it on Bluesky/LinkedIn/X". Both of them, as above --
           X and Bluesky animate a GIF and LinkedIn tends to flatten one, so which to send is a
           decision per post rather than one this menu should make. 2026-10-04. */
        + "<button type='button' class='m3d-sharepng m3d-saveshare'>Share picture</button>"
        + "<button type='button' class='m3d-sharegif m3d-saveshare'>Share turn</button>"
        + "</div>"'''),

 (u"and a line above the two share entries",
  u'''    + ".m3d-saves button:hover,.m3d-saves button:focus-visible{border-color:var(--accent,#49b0ff)}"''',
  u'''    + ".m3d-saves button:hover,.m3d-saves button:focus-visible{border-color:var(--accent,#49b0ff)}"
    /* A rule above the first of the two, so saving and sharing read as two groups rather than four
       equal choices. */
    + ".m3d-saves button.m3d-saveshare:first-of-type{margin-top:3px}"'''),

 (u"and the share is wired",
  u'''    on(".m3d-savepng", function(el){ run("png", el); });
    on(".m3d-savegif", function(el){ run("gif", el); });''',
  u'''    on(".m3d-savepng", function(el){ run("png", el); });
    on(".m3d-savegif", function(el){ run("gif", el); });

    /* ── AND SHARING IT ───────────────────────────────────────────────────────────  2026-10-04
       The module takes whichever route the browser offers and says which one it took; this writes
       that into the panel's own note. The two leave the person with different work — on a phone
       the file is already attached and there is nothing more to do, on a desktop it is on the
       clipboard and has to be pasted — and a button that did the right thing silently would look
       broken on half the machines it runs on. */
    var sharing = false;
    var shareRun = function(what, el){
      if (sharing || !window.UJ || !UJ.mesh3dshot || !UJ.mesh3dshot.shareView) return;
      sharing = true;
      var was = el.textContent;
      el.textContent = "preparing\\u2026";
      var note = host.querySelector(".m3d-note");
      UJ.mesh3dshot.shareView({ what: what, name: (o && o.saveName) || "cell" })
        .then(function(r){
          if (!note || !r || r.how === "cancelled") return;
          var say;
          if (r.how === "sheet")
            say = "Shared \\u2014 pick where it goes in the sheet.";
          else {
            var nets = UJ.mesh3dshot.nets().map(function(n){
              return "<a href='" + esc(UJ.mesh3dshot.composerUrl(n.key, r.text))
                   + "' target='_blank' rel='noopener'>" + esc(n.name) + "</a>";
            }).join(" \\u00b7 ");
            say = (r.how === "clipboard"
                   ? "The picture is on your clipboard and the text is written for you \\u2014 open "
                   : "Saved as <b>" + esc(r.file || "the file") + "</b> \\u2014 a GIF cannot go on a "
                     + "clipboard, so attach it yourself in ")
                + nets + " and paste.";
          }
          note.innerHTML += "<br><span class='hint'>" + say + "</span>";
        })
        .catch(function(e){
          if (note) note.innerHTML += "<br><b style='color:var(--bad)'>Could not share that: "
            + esc(e && e.message ? e.message : String(e)) + "</b>";
        })
        .then(function(){
          sharing = false;
          el.textContent = was;
          if (menu) menu.hidden = true;
          var sv = stage.querySelector(".m3d-save");
          if (sv) sv.classList.remove("m3d-on");
        });
    };
    on(".m3d-sharepng", function(el){ shareRun("picture", el); });
    on(".m3d-sharegif", function(el){ shareRun("turn", el); });'''),
])
print("\nNow: python3 src/build_stamps.py, then node shotcheck.js")
