# -*- coding: utf-8 -*-
u"""The discussion notices you signing in.                                               2026-10-02

Søren: *"I see the Discussion button and sometimes it works but sometimes the discussion does not
show the fields to write anything. I think it depends on whether you are logged in when it loads."*

He is right, and the diagnosis is exact. core/forum.js decided ONCE, when the tab was first opened,
whether to draw a compose box or a "sign in to post" line -- and nothing ever looked again. Open the
tab before Google has come back, and the forum is read-only until a reload. Google's One Tap arrives
whenever it arrives, so which of the two you got was a race.

TWO FIXES, AND THE FIRST ONE IS THE REAL ONE.

  THE FIELDS ARE ALWAYS THERE. A textarea is not a privilege. You can write your post while the
  sign-in is still settling, and the BUTTON is what knows: "Post it" when you are signed in, "Sign
  in with Google to post" when you are not -- and pressing that opens the prompt rather than
  scolding you. Nothing about what you have typed depends on an answer from Google.

  AND IT LOOKS AGAIN. The Edit and Hide buttons, and the whole `isMine` flag they rest on, are the
  backend's answer to a credential, so signing in genuinely does change what the forum should show.
  There is no event to listen for -- nothing in these pages dispatches one when GOOGLE_VERIFIED
  flips, and adding one would mean editing six pages plus two generated ones. So this watches, and
  watches CHEAPLY: a check every 1.2 s that reads two variables, running only while the Discussion
  panel is actually on screen, plus one on window focus because that is the moment a One Tap popup
  hands control back.

WHAT IS TYPED SURVIVES THE RE-RENDER. This is the trap in re-rendering a form at a moment nobody
asked for: you are halfway through a sentence, Google answers, and the page helpfully throws it
away. The title, the kind and the body are lifted out before the HTML is replaced and put back
after, per stream.

Check: forumcheck.js.
Run: python3 src/the_discussion_notices_you_signing_in.py, then python3 src/build_stamps.py
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


COMPOSE = u'''/* ── THE FIELDS ARE ALWAYS THERE ───────────────────────────────  2026-10-02
   Søren: "sometimes the discussion does not show the fields to write anything. I think it depends
   on whether you are logged in when it loads."

   It did, and this is why it no longer can: a textarea is not a privilege. The box is drawn
   whatever Google has or has not said yet, and the BUTTON is the part that knows -- it posts when
   you are signed in and opens the sign-in prompt when you are not. Which means the slow half of
   signing in happens while you write rather than instead of it. */
function composeHtml(scope){
  var id = "forum_" + scope;
  var inOk = signedIn();
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
       + '<select id="' + id + '_kind" style="flex:0 0 auto">'
       + KINDS.map(function(k){ return '<option value="' + k[0] + '">' + esc(k[1]) + "</option>"; }).join("")
       + "</select>"
       + '<input id="' + id + '_title" placeholder="A one-line title" style="flex:1 1 220px;min-width:0">'
       + "</div>"
       + '<textarea id="' + id + '_body" rows="4" style="width:100%" placeholder="'
       + (scope === "tools"
            ? "What the tool did, and what you expected. Everybody sees this, from every Jump."
            : "What you saw, and where. Write coordinates and ids straight into the sentence \u2014 "
              + "they become links.")
       + '"></textarea>'
       + '<div class="hint" id="' + id + '_found" style="margin:4px 0 6px"></div>'
       + '<div id="' + id + '_prev" style="margin:0 0 8px"></div>'
       + '<button type="button" class="idbtn" id="' + id + '_go" style="width:auto;padding:4px 14px">'
       + (inOk ? "Post it" : "Sign in with Google to post") + "</button>"
       + ' <span class="hint" id="' + id + '_say">'
       + (inOk ? "" : "Everything here is signed, so people can be answered and credited.")
       + "</span>";
}

/* ── WHAT IS TYPED SURVIVES A RE-RENDER ─────────────────────────────
   The trap in re-rendering a form at a moment nobody asked for: you are mid-sentence, Google
   answers, and the page helpfully throws the sentence away. Lifted out before the HTML is replaced
   and put back after, per stream. */
var FORM_DRAFT = {};
function grabDrafts(){
  ["volume", "tools"].forEach(function(s){
    var b = document.getElementById("forum_" + s + "_body");
    if (!b) return;
    var g = function(n){ var el = document.getElementById("forum_" + s + "_" + n);
                         return el ? el.value : ""; };
    FORM_DRAFT[s] = { body: b.value, title: g("title"), kind: g("kind") };
  });
}
function putDrafts(){
  ["volume", "tools"].forEach(function(s){
    var d = FORM_DRAFT[s];
    if (!d) return;
    var set = function(n, v){ var el = document.getElementById("forum_" + s + "_" + n);
                              if (el && v) el.value = v; };
    set("body", d.body); set("title", d.title); set("kind", d.kind);
  });
}

/* ── AND IT LOOKS AGAIN ───────────────────────────────────────
   Signing in really does change what the forum should show: Edit and Hide rest on `isMine`, which
   is the BACKEND's answer to a credential, so the posts have to be read again, not just redrawn.

   NOTHING DISPATCHES AN EVENT when GOOGLE_VERIFIED flips -- not on any of these pages -- and adding
   one would mean editing six hand-maintained pages and two generated ones to fix a bug in one
   module. So this watches instead, and watches cheaply: the tick reads two variables and returns,
   it only runs while the Discussion panel is actually on screen, and `focus` covers the usual case
   directly, because a One Tap popup handing control back IS a focus event. */
var SIGNED_WAS = null, WATCHING = false, RELOADING = false;
function panelShowing(){
  var el = document.querySelector('[data-tabpanel="forum"]');
  /* No panel at all means a host that put the card somewhere else; then it is always showing. */
  return el ? /(^|\\s)active(\\s|$)/.test(el.className || "") : true;
}
async function signInChanged(){
  var now = signedIn();
  if (now === SIGNED_WAS || RELOADING) return;
  SIGNED_WAS = now;
  RELOADING = true;
  try { await load(true); } catch (_e){}
  RELOADING = false;
  render();
}
function watchSignIn(){
  if (WATCHING) return;
  WATCHING = true;
  SIGNED_WAS = signedIn();
  setInterval(function(){ if (panelShowing()) signInChanged(); }, 1200);
  window.addEventListener("focus", function(){ if (panelShowing()) signInChanged(); });
}
'''

edit("core/forum.js", [

 (u"the fields do not depend on being signed in",
  u'''function composeHtml(scope){
  var id = "forum_" + scope;
  if (!signedIn())
    return '<p class="hint">Sign in with Google to post. Everything here is signed, so people can '
         + "be answered and credited.</p>";
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
       + '<select id="' + id + '_kind" style="flex:0 0 auto">'
       + KINDS.map(function(k){ return '<option value="' + k[0] + '">' + esc(k[1]) + "</option>"; }).join("")
       + "</select>"
       + '<input id="' + id + '_title" placeholder="A one-line title" style="flex:1 1 220px;min-width:0">'
       + "</div>"
       + '<textarea id="' + id + '_body" rows="4" style="width:100%" placeholder="'
       + (scope === "tools"
            ? "What the tool did, and what you expected. Everybody sees this, from every Jump."
            : "What you saw, and where. Write coordinates and ids straight into the sentence \u2014 "
              + "they become links.")
       + '"></textarea>'
       + '<div class="hint" id="' + id + '_found" style="margin:4px 0 6px"></div>'
       + '<button type="button" class="idbtn" id="' + id + '_go" style="width:auto;padding:4px 14px">'
       + "Post it</button>"
       + ' <span class="hint" id="' + id + '_say"></span>';
}''',
  COMPOSE.rstrip("\n")),

 (u"...and what was typed is kept across a redraw",
  u'''function render(){
  var host = document.getElementById("forumCard");
  if (!host) return;
  host.innerHTML =''',
  u'''function render(){
  var host = document.getElementById("forumCard");
  if (!host) return;
  grabDrafts();
  host.innerHTML ='''),

 (u"...put back after",
  u'''        + "it is worth more than eight.");
  wire();
}''',
  u'''        + "it is worth more than eight.");
  putDrafts();
  wire();
}'''),

 (u"the button signs you in rather than scolding you",
  u'''    if (go) go.addEventListener("click", async function(){
      var body = String(ta.value || "").trim();
      if (!body){ if (say) say.textContent = "Write something first."; return; }''',
  u'''    if (go) go.addEventListener("click", async function(){
      /* NOT SIGNED IN IS NOT AN ERROR, it is the next step. The same One Tap prompt the account
         chip uses, from the button somebody just pressed -- and what they have written stays in
         the box, because the re-render after they sign in puts it back. */
      if (!signedIn()){
        try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.prompt(); }
        catch (_gp){}
        if (say) say.textContent = "Sign in with Google and press it again \u2014 "
                                 + "what you have written is kept.";
        return;
      }
      var body = String(ta.value || "").trim();
      if (!body){ if (say) say.textContent = "Write something first."; return; }'''),

 (u"and the watcher starts with the forum",
  u'''  try { await load(true); }
  catch (e){''',
  u'''  /* Started before the first read, so that a sign-in arriving DURING that read is still noticed:
     the read is the slowest thing here and the likeliest moment for Google to answer. */
  watchSignIn();
  try { await load(true); }
  catch (e){'''),
])
print("\nNow: node forumcheck.js")
