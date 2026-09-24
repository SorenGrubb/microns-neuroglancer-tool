# -*- coding: utf-8 -*-
u"""Too big to open is not too big to use: the filter hands you the JSON.                 2026-09-24

Søren: "I think there should be an option to paste the JSON code yourself into a Neuroglancer
instance when the file size is too big. Then the Filter and show should warn about the size and offer
the user to either do the search again more limited or download a JSON file (if possible inside the
warning) to paste into the neuroglancer instance themselves. You can paste this image and explain
that you have to open the {} button."

WHAT IT DID. µJump measured the finished URL against VASC_URL_WARN_LENGTH -- Math.round(1.95 * 1024
* 1024) = 2,044,723 -- and asked, in a browser confirm(), whether to open it anyway. Two things
wrong with that:

  the threshold sits 52,429 characters BELOW the real limit (2,097,152, measured in his browser on
  2026-09-22), so "yes" on a view between the two opens about:blank#blocked and nothing else;

  and a confirm() offering yes or no cannot hand over the state, which is the one thing that still
  works at ANY size. Neuroglancer's {} button takes a pasted state with no URL and no limit.

Measured on his own filter, today: 24,757,320 characters. Twelve times the cap. It asked, he could
only say yes, and the tab was blank.

SO THERE ARE THREE DOORS NOW, and the two useful ones are the new ones: copy the JSON, download it
as a file, or go back and narrow the search. The first two are the same offer tracingStateOffer has
made for a single tracing since 2026-09-22, with the same sentence about {}; this is that offer
where the filter can reach it.

AND IT SHOWS WHERE TO PASTE. Søren sent the screenshot and asked for it to be shown, which is
right: "press the {} button" is three words and a hunt through nine unlabelled icons. The picture is
his toolbar with a ring drawn round that one button, carried in the page as a data URI -- 9.5 kB, no
second request, and it cannot go missing the way a file beside the page can.

THE LIMIT IS OVERRIDABLE, `JUMP_LINK_MAX` in the console, the same escape hatch
JUMP_VIEWER_POLYLINES has in core/tracing.js -- and the way the check drives this without having to
build a twenty-three megabyte view.

Check: filterstateoffercheck.js, written first; 14 of its 18 assertions failed before this went in.
Run: python3 src/too_big_to_open_is_not_too_big_to_use.py, then python3 src/build_stamps.py, then
python3 wjump-build/build_wjump.py and python3 xjump-build/build_xjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s: %d" % (name, n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


HINT_B64 = "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"

OFFER = u'''/* ── TOO BIG TO OPEN IS NOT TOO BIG TO USE ─────────────────────────  2026-09-24
   Søren: "there should be an option to paste the JSON code yourself into a Neuroglancer instance
   when the file size is too big ... offer the user to either do the search again more limited or
   download a JSON file (if possible inside the warning)".

   2,097,152 is where Chromium refuses to open a tab -- measured in his browser on 2026-09-22, and
   the reason a view past it shows about:blank#blocked. Overridable as JUMP_LINK_MAX for the same
   reason JUMP_VIEWER_POLYLINES is overridable: so it can be driven without building a
   twenty-three megabyte view. See src/too_big_to_open_is_not_too_big_to_use.py. */
function tracedLinkMax(){
  try { if (window.JUMP_LINK_MAX > 0) return Number(window.JUMP_LINK_MAX); } catch (_e){}
  return 2097152;
}
/* His own toolbar, with a ring round the one button this is about. A data URI rather than a file
   beside the page: 9.5 kB, no second request, and nothing to go missing on a deploy. */
var TRACED_JSON_HINT = "data:image/png;base64,''' + HINT_B64 + u'''";
function tracedSaveBlob(blob, name){
  var u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function(){ try { document.body.removeChild(a); URL.revokeObjectURL(u); } catch (_e){} }, 0);
}
/* The warning, with the state in it. `after` is the element it is put beneath -- the button that
   was pressed -- so it appears where the press happened rather than somewhere the page has to be
   scrolled to. Returns the panel. */
function tracedOutlinesStateOffer(after, json, chars){
  var host = after && after.parentNode ? after.parentNode : document.body;
  var old = host.querySelector ? host.querySelector(".jsonoffer") : null;
  if (old) old.parentNode.removeChild(old);
  var max = tracedLinkMax();
  var box = document.createElement("div");
  box.className = "jsonoffer";
  box.style.cssText = "flex:1 1 100%;margin:8px 0 0;padding:10px 12px;border:1px solid var(--line);"
    + "border-radius:8px;background:var(--panel);font-size:12px;line-height:1.5";
  box.innerHTML =
      '<p style="margin:0 0 6px"><b style="color:var(--bad)">This view is too big to open in a tab.</b> '
    + "It is " + chars.toLocaleString() + " characters, and a browser refuses past "
    + max.toLocaleString() + " — the tab would come up blank (about:blank#blocked). "
    + "Nothing is wrong with the view itself.</p>"
    + '<p style="margin:0 0 8px">Two ways on: narrow the search until it fits, or take the state '
    + "and paste it into Neuroglancer yourself, which has no size limit at all.</p>"
    + '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">'
    + '<button type="button" class="idbtn jsoncopy">Copy the JSON</button>'
    + '<button type="button" class="idbtn jsonsave">Download it as a file</button>'
    + '<button type="button" class="idbtn jsonnarrow">Narrow the search instead</button></div>'
    + '<p style="margin:0 0 6px">Open your Neuroglancer, press the <b>{}</b> button in the top bar, '
    + "select everything in the box that opens and paste over it.</p>"
    + '<img src="' + TRACED_JSON_HINT + '" alt="Neuroglancer\u2019s top bar, with the {} button '
    + 'ringed" style="display:block;max-width:100%;height:auto;border-radius:6px;border:1px solid '
    + 'var(--line)">';
  if (after && after.parentNode) after.parentNode.insertBefore(box, after.nextSibling);
  else document.body.appendChild(box);

  var c = box.querySelector(".jsoncopy");
  if (c) c.addEventListener("click", function(){
    var yes = function(){ c.textContent = "Copied — paste it into the {} box"; };
    var no = function(){ c.textContent = "Could not copy — use the download"; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(json).then(yes, no);
      else no();
    } catch (_e){ no(); }
  });
  var d = box.querySelector(".jsonsave");
  if (d) d.addEventListener("click", function(){
    try { tracedSaveBlob(new Blob([json], { type: "application/json" }),
                         "neuroglancer_state.json"); d.textContent = "Downloaded"; }
    catch (_e){ d.textContent = "Could not download it"; }
  });
  var n = box.querySelector(".jsonnarrow");
  if (n) n.addEventListener("click", function(){
    try { box.parentNode.removeChild(box); } catch (_e){}
  });
  return box;
}
'''

edit("core/tracedoutlines.js", [
 (u"the offer, and the limit it is measured against",
  u'''var FILTER_ORGAN_SEG_FILLED=false;''',
  OFFER + u'''var FILTER_ORGAN_SEG_FILLED=false;'''),
])

OLD_OPEN = u'''    const url=document.getElementById("viewer").value+"#!"+encodeURIComponent(JSON.stringify(state));
    if(url.length>VASC_URL_WARN_LENGTH){
      const mb=(url.length/1024/1024).toFixed(1);
      const proceed=confirm(
        "This view is large ("+mb+" MB, "+url.length.toLocaleString()+" characters) and may fail to open "+
        "or load slowly in Neuroglancer.\\n\\nTo shrink it: uncheck some traced vasculature categories or "+
        "organelle points, turn off EM imagery, narrow your match filters, or reduce the number of "+
        "region boxes.\\n\\n"+
        "Open it anyway?"
      );
      if(!proceed)return;
    }
    window.open(url,"_blank");'''

NEW_OPEN = u'''    const stateJson=JSON.stringify(state);
    const url=document.getElementById("viewer").value+"#!"+encodeURIComponent(stateJson);
    /* ── PAST THE CAP THERE IS NOTHING TO SAY YES TO ──────────────────────  2026-09-24
       Søren: "there should be an option to paste the JSON code yourself into a Neuroglancer
       instance when the file size is too big ... offer the user to either do the search again more
       limited or download a JSON file".

       This asked, in a confirm(), whether to open it anyway — with VASC_URL_WARN_LENGTH set to
       1.95 MiB, which is 52,429 characters BELOW the real limit, so "yes" on a view between the
       two opened about:blank#blocked. Measured on his own filter today: 24,757,320 characters, and
       the only button was yes. The state itself is fine at any size; it is the URL that is not, so
       past the cap the state is handed over instead. core/tracedoutlines.js. */
    if(typeof tracedLinkMax==="function"&&url.length>tracedLinkMax()){
      tracedOutlinesStateOffer(viewAllBtn,stateJson,url.length);
      return;
    }
    if(url.length>VASC_URL_WARN_LENGTH){
      /* Still openable, just slow — so this one keeps the yes/no it always had, and says what to
         turn off. The offer above is for the sizes where yes is not an answer. */
      const mb=(url.length/1024/1024).toFixed(1);
      const proceed=confirm(
        "This view is large ("+mb+" MB, "+url.length.toLocaleString()+" characters) and may load "+
        "slowly in Neuroglancer.\\n\\nTo shrink it: uncheck some traced vasculature categories or "+
        "organelle points, turn off EM imagery, narrow your match filters, or reduce the number of "+
        "region boxes.\\n\\n"+
        "Open it anyway?"
      );
      if(!proceed)return;
    }
    window.open(url,"_blank");'''

for _pg in ("ujump.html", "djump.html", "pjump.html"):
    edit(_pg, [(u"the filter hands over the state past the cap", OLD_OPEN, NEW_OPEN)])

OLD_OA = u'''      .then(function(layers){
        if (btn) btn.textContent = label;
        if (layers && layers.length) state.layers.push.apply(state.layers, layers);
        var u = url(state);
        if (win){ try { win.opener = null; } catch (_e){} win.location.href = u; }
        else window.open(u, "_blank");
      });'''

NEW_OA = u'''      .then(function(layers){
        if (btn) btn.textContent = label;
        if (layers && layers.length) state.layers.push.apply(state.layers, layers);
        var json = JSON.stringify(state);
        var u = url(state);
        /* ── PAST THE CAP, HAND OVER THE STATE ───────────────────────────  2026-09-24
           The same answer µJump\u2019s filter gives, for the three tools that open through here.
           The blank tab opened a moment ago for the popup blocker is closed again: leaving it on
           about:blank while the offer appears behind it is two confusing things at once.
           See src/too_big_to_open_is_not_too_big_to_use.py. */
        if (typeof tracedLinkMax === "function" && u.length > tracedLinkMax()){
          if (win){ try { win.close(); } catch (_e){} }
          if (typeof tracedOutlinesStateOffer === "function")
            tracedOutlinesStateOffer(btn || sel, json, u.length);
          return;
        }
        if (win){ try { win.opener = null; } catch (_e){} win.location.href = u; }
        else window.open(u, "_blank");
      });'''

edit("core/openall.js", [(u"the three tools that open through here get the offer too", OLD_OA, NEW_OA)])
