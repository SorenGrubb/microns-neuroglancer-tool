/* core/forum.js — somewhere to say what you found, and to be answered.             2026-10-01

   Gary: *"a separate space where users can make suggestions for new features, log bug reports, or
   even discuss interesting findings they've noticed."*  Søren: *"one forum for each jump."*

   ── REWRITTEN 2026-10-03, AS AN INDEX AND A THREAD ───────────────────────────────────────────
   Søren: *"We also need a way to index the different conversations. They should be threads. I think
   it is fine to categorise them in questions, bugs, etc. but they should be collapsed by default and
   then open in a view. I think the index should be on the left side of the screen and then the
   window to show the thread on the right and the input field below the thread."*

   The first version showed every post and every reply expanded, one after another, in two long
   cards. That reads well with four posts and not at all with forty: the thing you are reading
   scrolls away from the thing you are replying to, and there is no way to see what conversations
   exist without scrolling past all of them. An index is the fix, and it is the shape every forum
   converges on for the same reason.

   So: threads on the left, the open one on the right, the box you write in underneath it. Within
   the index, threads are grouped by kind — questions, bugs, ideas, findings — and the groups are
   <details>, closed. ONE EXCEPTION, and it is a deliberate departure from "collapsed by default":
   the group holding the newest thread opens on arrival, and so does the group holding whatever
   thread you have open. A panel whose entire content is four closed headings looks broken, and the
   first thing anybody does is open one of them anyway.

   THIS FILE IS NO LONGER WHAT THE EARLY GENERATORS EDITED. src/a_place_to_say_what_you_found.py
   still owns the TAB; but src/the_discussion_notices_you_signing_in.py,
   src/a_coordinate_becomes_a_picture.py and src/the_preview_shows_the_cell_too.py edited functions
   this rewrite replaced. Their reasoning is kept here, in the code they were reasoning about, and
   re-running them against this file will fail on the anchor rather than silently do something odd.

   ── TWO STREAMS, BECAUSE THEY ARE ABOUT DIFFERENT THINGS ─────────────────────────────────────
   "The capillary at 240640, 207872, 21360 has an odd pericyte" is about minnie65 and means nothing
   in H01, so it belongs to this volume. "The pad forgets my colour" is about the tracing pad, which
   is the same code in all eight tools — scattered across eight forums it would be eight half-dead
   threads, so the tools stream is ONE conversation, written here and visible from every Jump. They
   are now the two chips at the top of the index rather than two stacked cards.

   ── A POST IS PROSE, AND THE PROSE IS THE ANCHOR ─────────────────────────────────────────────
   There is no "attach a coordinate" field. core/jumplink.js reads the body and finds the places
   named in it, and core/empreview.js draws one when a reader clicks it. So a post may be about one
   place or six — Søren, on seeing the anchor-field version: *"what if a user wants to talk about
   more than one coordinate in a post?"*

   The compose box SAYS WHAT IT RECOGNISED before anything is sent, because the linkifier resolves
   rather than guesses and will sometimes decline; the author should find that out while they can
   still write the word "cell". And a post naming several places gets ONE "open all of them".

   ── WHAT THIS STILL DOES NOT DO ──────────────────────────────────────────────────────────────
   No rich text, no images, no attachments, no search, no notifications. A forum is the first thing
   on Jump that needs a PERSON. Hiding is there from the first day, because a forum that cannot be
   cleaned eventually embarrasses its owner.

   WHAT A HOST DOES
     markup   <div class="tabpanel" data-tabpanel="forum"><div id="forumCard"></div></div>
              and a tab button with data-tab="forum".
     call     UJ.forum.init({tool:"ujump", volume:"minnie65"});
   Needs REPORT_ENDPOINT, the page's Google sign-in globals, core/jumplink.js for the bodies and
   core/empreview.js for the pictures.

   Check: forumcheck.js */
var UJ = UJ || {};
(function(){
"use strict";

var POSTS = [], CAN_MODERATE = false, LOADED = false, TOOL = "", VOLUME = "", BUSY = false;
/* WHAT THE PANEL IS SHOWING. `SCOPE` is which stream's index is listed, `OPEN` the thread in the
   right-hand pane, `MODE` "new" when that pane is holding a new-thread form instead. */
var SCOPE = "volume", OPEN = "", MODE = "";

function esc(s){
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/* The body, with the places it names made clickable. Falls back to plain escaped text when
   core/jumplink.js is not there: these files deploy one at a time, and a page that arrives before
   the module it wants must lose the links, not the post. */
function bodyHtml(s){
  try { if (window.UJ && UJ.jumplink) return UJ.jumplink.html(s); } catch (_e){}
  return esc(s);
}
function hits(s){
  try { if (window.UJ && UJ.jumplink) return UJ.jumplink.scan(s) || []; } catch (_e){}
  return [];
}
function signedIn(){
  return !!(typeof GOOGLE_VERIFIED !== "undefined" && GOOGLE_VERIFIED
            && typeof GOOGLE_CREDENTIAL !== "undefined" && GOOGLE_CREDENTIAL);
}
function dsQS(){
  try { if (UJ && UJ.cfg && UJ.cfg.backend && UJ.cfg.backend.ds)
          return "&ds=" + encodeURIComponent(UJ.cfg.backend.ds); } catch (_e){}
  return "";
}
function when(iso){
  var s = String(iso || ""); if (!s) return "";
  var d = new Date(s); if (isNaN(d.getTime())) return s;
  var days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  return d.toISOString().slice(0, 10);
}

/* ── THE CATEGORIES ───────────────────────────────────────────────────────────────────────────
   Søren: "it is fine to categorise them in questions, bugs, etc." Four, in the order somebody
   scanning the index would want them: a question is waiting for an answer and a finding is not.
   `plural` heads the group; `one` is what the compose box offers. */
var KINDS = [
  ["question", "A question", "Questions"],
  ["bug",      "A bug",      "Bugs"],
  ["idea",     "An idea",    "Ideas"],
  ["finding",  "A finding",  "Findings"]
];
function kindName(k){
  for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0] === k) return KINDS[i][1];
  return "A note";
}
function kindPlural(k){
  for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0] === k) return KINDS[i][2];
  return "Notes";
}
/* A reply carries kind "reply" and is never a row in the index; an older post may carry a kind this
   list has since dropped, and lands under Findings rather than vanishing. */
function kindOf(p){
  var k = String(p.kind || "");
  for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0] === k) return k;
  return "finding";
}

/* ── READING ──────────────────────────────────────────────────────────────────────────────────
   The credential goes WITH THE READ when there is one, so the backend can mark the caller's own
   posts without ever sending anybody's address to anybody. A signed-out reader gets the same
   forum, minus the Edit buttons. */
async function load(force){
  if (LOADED && !force) return;
  if (typeof REPORT_ENDPOINT === "undefined" || !REPORT_ENDPOINT) return;
  var qs = "?forum=1" + dsQS() + "&tool=" + encodeURIComponent(TOOL);
  if (signedIn()) qs += "&credential=" + encodeURIComponent(GOOGLE_CREDENTIAL);
  var r = await fetch(REPORT_ENDPOINT + qs);
  var d = await r.json();
  POSTS = (d && d.posts) || [];
  CAN_MODERATE = !!(d && d.canModerate);
  LOADED = true;
}

async function send(payload){
  if (!signedIn()) return { ok: false, error: "please sign in with Google first" };
  var body = {};
  for (var k in payload) body[k] = payload[k];
  body.credential = GOOGLE_CREDENTIAL;
  body.tool = TOOL;
  try { if (UJ.cfg.backend.ds) body.ds = UJ.cfg.backend.ds; } catch (_e){}
  var text = "";
  try {
    var r = await fetch(REPORT_ENDPOINT, { method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    text = await r.text();
  } catch (e){ return { ok: false, error: "could not reach the server" }; }
  var d = null; try { d = JSON.parse(text); } catch (_pe){}
  if (!d) return { ok: false, error: "the server did not answer with JSON — the deployment "
                                   + "may be older than this page" };
  return d;
}

/* ── WHAT THE LINKIFIER FOUND, BEFORE ANYTHING IS SENT ────────────────────────────────────────
   Live, under the textarea. A linkifier that resolves rather than guesses declines quietly — a
   coordinate outside both volumes is not a coordinate, a bare number is not a cell — and this is
   where the author finds that out, while they can still fix it. */
function foundSay(text){
  var h = hits(text);
  if (!h.length) return "No places recognised yet. A coordinate inside the volume, an 18-digit "
                      + "root id, or “cell 253863” all become links.";
  var n = {};
  h.forEach(function(x){ n[x.kind] = (n[x.kind] || 0) + 1; });
  var bits = [];
  if (n.coord)   bits.push(n.coord + (n.coord === 1 ? " coordinate" : " coordinates"));
  if (n.nucleus) bits.push(n.nucleus + (n.nucleus === 1 ? " cell" : " cells"));
  if (n.root)    bits.push(n.root + (n.root === 1 ? " segment" : " segments"));
  if (n.viewer)  bits.push(n.viewer + (n.viewer === 1 ? " viewer link" : " viewer links"));
  var vols = {};
  h.forEach(function(x){ if (x.volume) vols[x.volume] = 1; });
  var vk = Object.keys(vols);
  return "Recognised: " + bits.join(", ")
       + (vk.length ? " — in " + vk.join(" and ") : "") + ".";
}

/* The cell a post is about, from the post itself: its first root id and its first nucleus id. Both
   where both are there — core/segpaint.js takes them together and paints the nucleus inside the
   cell, which is the picture somebody who named both is asking for. */
function idsOf(hs){
  var out = {};
  (hs || []).forEach(function(h){
    if (h.kind === "root" && !out.root) out.root = h.id;
    if (h.kind === "nucleus" && !out.nuc) out.nuc = h.id;
  });
  return out;
}
function nucleusPos(nid){
  try {
    var cfg = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;
    if (cfg && typeof cfg.nucleusAt === "function") return cfg.nucleusAt(nid) || null;
  } catch (_e){}
  return null;
}
/* The same question for a ROOT id. µJump answers it from the nucleus table it already holds,
   through the reverse map its own root-id search box uses; a page without one simply says no, and
   the caller then falls back to the post's own coordinate. 2026-10-03. */
function cellPos(rid){
  try {
    var cfg = (typeof window.emPreviewHost === "function") ? window.emPreviewHost() : null;
    if (cfg && typeof cfg.cellAt === "function") return cfg.cellAt(rid) || null;
  } catch (_e){}
  return null;
}
/* Neuroglancer, for an id this page cannot place. It is the one answer that works for any id at
   all -- a community-proposed root, another volume's cell -- and it is half of what was asked for:
   "clicking it ... should show it in Neuroglancer or as a 2D and 3d window". */
function viewerUrlFor(h){
  try { if (window.UJ && UJ.jumplink) return UJ.jumplink.url([h]) || ""; } catch (_e){}
  return "";
}

/* ── THE THREADS ──────────────────────────────────────────────────────────────────────────────
   A thread is a post with no replyTo, plus everything pointing at it. One level: a reply to a reply
   is still a reply to the thread, which is what every forum discovers it wanted after trying two. */
function roots(scope){
  return POSTS.filter(function(p){ return String(p.scope) === scope && !p.replyTo; });
}
function repliesOf(pid){
  return POSTS.filter(function(p){ return String(p.replyTo) === String(pid); })
              .sort(function(a, b){ return String(a.timestamp).localeCompare(String(b.timestamp)); });
}
/* Sorted by LAST ACTIVITY, not by when the thread was started: a question answered this morning is
   the one somebody wants to see, even if it was asked in June. */
function lastAt(p){
  var t = String(p.timestamp || "");
  repliesOf(p.postId).forEach(function(r){
    var s = String(r.timestamp || ""); if (s > t) t = s;
  });
  return t;
}
function postById(pid){
  return POSTS.filter(function(p){ return String(p.postId) === String(pid); })[0] || null;
}
/* A thread with no title is listed by its first line, so the index never shows a blank row. */
function titleOf(p){
  var t = String(p.title || "").trim();
  if (t) return t;
  var b = String(p.body || "").trim().split("\n")[0];
  return b.length > 60 ? b.slice(0, 57) + "…" : (b || "(untitled)");
}

/* ── THE INDEX ────────────────────────────────────────────────────────────────────────────────
   Left column. Two chips for the two streams, a button to start something, then one <details> per
   category with the threads inside it.

   WHICH GROUPS ARE OPEN. Søren asked for collapsed by default, and that is the rule — with one
   exception, because a panel showing four closed headings and nothing else looks broken: the group
   holding the open thread is open, and on arrival the group holding the newest thread is. */
function indexHtml(){
  var rs = roots(SCOPE);
  var openPost = OPEN ? postById(OPEN) : null;
  var openKind = openPost ? kindOf(openPost) : "";
  var newestKind = "";
  if (!openKind && rs.length){
    var newest = rs.slice().sort(function(a, b){
      return lastAt(b).localeCompare(lastAt(a)); })[0];
    newestKind = newest ? kindOf(newest) : "";
  }
  var chip = function(s, label){
    return '<button type="button" class="hist-chip fscope' + (SCOPE === s ? " on" : "")
         + '" data-scope="' + s + '"' + (SCOPE === s ? ' style="border-color:var(--accent);'
         + 'color:var(--accent)"' : "") + ">" + esc(label) + "</button>";
  };
  var groups = KINDS.map(function(k){
    var mine = rs.filter(function(p){ return kindOf(p) === k[0]; })
                 .sort(function(a, b){ return lastAt(b).localeCompare(lastAt(a)); });
    if (!mine.length) return "";
    var isOpen = (k[0] === openKind) || (k[0] === newestKind);
    return "<details class='fcat' data-kind='" + k[0] + "'" + (isOpen ? " open" : "") + ">"
         + "<summary style='cursor:pointer;padding:4px 0;font-size:12px;text-transform:uppercase;"
         + "letter-spacing:.04em;color:var(--mut)'>" + esc(k[2]) + " · " + mine.length
         + "</summary>"
         + mine.map(function(p){
             var n = repliesOf(p.postId).length;
             return "<button type='button' class='fthread" + (OPEN === p.postId ? " on" : "")
                  + "' data-pid='" + esc(p.postId) + "' style=\"display:block;width:100%;"
                  + "text-align:left;background:" + (OPEN === p.postId ? "var(--accent-dim)" : "none")
                  + ";border:0;border-left:2px solid " + (OPEN === p.postId ? "var(--accent)" : "transparent")
                  + ";padding:5px 8px;cursor:pointer;color:inherit;font:inherit\">"
                  + "<span style='display:block'>" + esc(titleOf(p)) + "</span>"
                  + "<span class='hint' style='display:block;font-size:11px'>"
                    + esc(p.authorName || "somebody") + " · " + esc(when(lastAt(p)))
                    + (n ? " · " + n + (n === 1 ? " reply" : " replies") : "")
                    + (SCOPE === "tools" && p.tool ? " · " + esc(p.tool) : "")
                  + "</span></button>";
           }).join("")
         + "</details>";
  }).join("");
  return "<div class='forum-index' style='flex:1 1 230px;min-width:0;max-width:320px'>"
       + "<div style='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px'>"
         + chip("volume", "This volume") + chip("tools", "The tools") + "</div>"
       + "<p class='hint' style='margin:0 0 8px'>"
       + (SCOPE === "tools"
            ? "Bugs and ideas about the Jump tools themselves. <b>Shared across every Jump</b> "
              + "— the tracing pad is the same code everywhere, so one conversation about it "
              + "is worth more than eight."
            : "Findings, oddities and questions about the cells themselves. Posts here belong to "
              + "this dataset. Write coordinates and ids straight into the sentence: a reader "
              + "clicks one and sees the tissue.")
       + "</p>"
       + "<button type='button' class='idbtn' id='forum_new' style=\"width:auto;padding:3px 12px;"
         + "margin-bottom:8px\">+ New thread</button>"
       + (groups || "<p class='hint'>Nothing here yet.</p>")
       + "</div>";
}

/* ── ONE POST, IN THE THREAD VIEW ─────────────────────────────────────────────────────────────
   The root and its replies use the same markup; a reply is just indented and has no title. */
function postHtml(p, isRoot){
  var n = hits(p.body || "").filter(function(h){
    return h.voxel || h.kind === "root"; }).length;
  var mine = !!p.isMine;
  return "<div class='forumpost' data-pid='" + esc(p.postId) + "' style=\"padding:6px 0;"
       + (isRoot ? "" : "margin-left:14px;border-left:2px solid var(--line);padding-left:12px;")
       + "\">"
       + (isRoot && p.title ? "<h3 style='margin:0 0 2px;font-size:16px'>" + esc(p.title) + "</h3>" : "")
       + "<div class='hint' style='margin-bottom:4px'>"
         + (isRoot ? esc(kindName(p.kind)) + " · " : "")
         + esc(p.authorName || "somebody") + " · " + esc(when(p.timestamp))
         + (p.editedAt ? " · edited" : "")
         + (isRoot && String(p.scope) === "tools" && p.tool ? " · from " + esc(p.tool) : "")
       + "</div>"
       + "<div class='forumbody' data-raw='" + esc(p.body || "") + "' style='margin:4px 0'>"
         + bodyHtml(p.body || "") + "</div>"
       + "<div style='display:flex;gap:6px;flex-wrap:wrap;align-items:center'>"
       + (n > 1 ? "<button type='button' class='hist-chip forumopenall' data-pid='" + esc(p.postId)
                  + "' title=\"Opens every place this post mentions in ONE viewer, as a single "
                  + "annotation layer, with both volumes’ imagery and segmentation.\">Open all "
                  + n + " of them</button>" : "")
       + (mine ? "<button type='button' class='hist-chip forumedit' data-pid='" + esc(p.postId)
                 + "'>Edit</button>" : "")
       + ((mine || CAN_MODERATE) ? "<button type='button' class='hist-chip forumhide' data-pid='"
                 + esc(p.postId) + "' title='"
                 + (mine ? "Withdraws your post." : "Hides this post. You are a moderator here.")
                 + "'>" + (mine ? "Withdraw" : "Hide") + "</button>" : "")
       + "</div>"
       + "<div class='forumeditbox' data-pid='" + esc(p.postId) + "'></div>"
       + "</div>";
}

/* ── THE COMPOSE BOX ──────────────────────────────────────────────────────────────────────────
   Søren: "the input field below the thread." So the reply box is the last thing in the right-hand
   pane, under what it is answering, rather than at the top where the first version had it.

   THE FIELDS ARE ALWAYS THERE, whatever Google has or has not said yet — a textarea is not a
   privilege. The BUTTON is the part that knows: it posts when you are signed in and opens the
   sign-in prompt when you are not, so the slow half of signing in happens while you write rather
   than instead of it. (2026-10-02, Søren: "sometimes the discussion does not show the fields to
   write anything. I think it depends on whether you are logged in when it loads." It did.) */
function composeHtml(id, opts){
  var o = opts || {}, inOk = signedIn();
  return "<div class='forumcompose' style='margin-top:10px;border-top:1px solid var(--line);"
       + "padding-top:8px'>"
       + (o.label ? "<label>" + esc(o.label) + "</label>" : "")
       + (o.kinds
           ? "<div style='display:flex;gap:8px;flex-wrap:wrap;margin:6px 0'>"
             + "<select id='" + id + "_kind' style='flex:0 0 auto'>"
             + KINDS.map(function(k){
                 return "<option value='" + k[0] + "'>" + esc(k[1]) + "</option>"; }).join("")
             + "</select>"
             + "<input id='" + id + "_title' placeholder='A one-line title' "
               + "style='flex:1 1 220px;min-width:0'></div>"
           : "")
       + "<textarea id='" + id + "_body' rows='" + (o.rows || 4) + "' style='width:100%' "
         + "placeholder='" + esc(o.placeholder || "") + "'></textarea>"
       + "<div class='hint' id='" + id + "_found' style='margin:4px 0 6px'></div>"
       + "<div id='" + id + "_prev' style='margin:0 0 8px'></div>"
       + "<button type='button' class='idbtn' id='" + id + "_go' style='width:auto;padding:4px 14px'>"
       + (inOk ? esc(o.go || "Post it") : "Sign in with Google to post") + "</button>"
       + " <span class='hint' id='" + id + "_say'>"
       + (inOk ? "" : "Everything here is signed, so people can be answered and credited.")
       + "</span></div>";
}

function viewHtml(){
  var inner;
  if (MODE === "new"){
    inner = "<h3 style='margin:0 0 2px;font-size:16px'>A new thread</h3>"
          + "<p class='hint' style='margin:0 0 4px'>In "
          + (SCOPE === "tools" ? "<b>The tools</b>, where every Jump will see it"
                               : "<b>this volume</b>") + ".</p>"
          + composeHtml("forum_" + SCOPE, { kinds: true, rows: 5, go: "Post it",
              placeholder: SCOPE === "tools"
                ? "What the tool did, and what you expected."
                : "What you saw, and where. Write coordinates and ids straight into the sentence "
                  + "— they become links." });
  } else if (OPEN && postById(OPEN)){
    var p = postById(OPEN), kids = repliesOf(OPEN);
    inner = postHtml(p, true)
          + (kids.length ? kids.map(function(r){ return postHtml(r, false); }).join("")
                         : "<p class='hint' style='margin-left:14px'>No replies yet.</p>")
          + composeHtml("forum_reply", { label: "Reply", rows: 3, go: "Post the reply",
              placeholder: "Your reply. Coordinates and ids become links here too." });
  } else {
    inner = "<p class='hint'>Pick a conversation on the left, or start one.</p>";
  }
  return "<div class='forum-view' style='flex:3 1 340px;min-width:0;border-left:1px solid "
       + "var(--line);padding-left:14px'>" + inner + "</div>";
}

/* ── WHAT IS TYPED SURVIVES A RE-RENDER ───────────────────────────────────────────────────────
   The trap in re-rendering a form at a moment nobody asked for: you are mid-sentence, Google
   answers, and the page helpfully throws the sentence away. Lifted out before the HTML is replaced
   and put back after, per form. */
var FORM_DRAFT = {};
function formIds(){ return ["forum_volume", "forum_tools", "forum_reply"]; }
function grabDrafts(){
  formIds().forEach(function(id){
    var b = document.getElementById(id + "_body");
    if (!b) return;
    var g = function(n){ var el = document.getElementById(id + "_" + n); return el ? el.value : ""; };
    FORM_DRAFT[id] = { body: b.value, title: g("title"), kind: g("kind") };
  });
}
function putDrafts(){
  formIds().forEach(function(id){
    var d = FORM_DRAFT[id];
    if (!d) return;
    var set = function(n, v){ var el = document.getElementById(id + "_" + n); if (el && v) el.value = v; };
    set("body", d.body); set("title", d.title); set("kind", d.kind);
  });
}

/* ── AND THE PANEL LOOKS AGAIN WHEN YOU SIGN IN ───────────────────────────────────────────────
   Edit and Hide rest on `isMine`, which is the BACKEND's answer to a credential, so the posts have
   to be read again, not just redrawn. Nothing on these pages dispatches an event when
   GOOGLE_VERIFIED flips, and adding one would mean editing six hand-maintained pages and two
   generated ones to fix a bug in one module. So this watches, cheaply: the tick reads two variables
   and returns, it runs only while the panel is on screen, and `focus` covers the usual case
   directly, because a One Tap popup handing control back IS a focus event. */
var SIGNED_WAS = null, WATCHING = false, RELOADING = false;
function panelShowing(){
  var el = document.querySelector('[data-tabpanel="forum"]');
  /* No panel at all means a host that put the card somewhere else; then it is always showing. */
  return el ? /(^|\s)active(\s|$)/.test(el.className || "") : true;
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

/* ── A COORDINATE IN A POST OPENS ITS OWN PICTURE ─────────────────────────────────────────────
   ON CLICK, which is Søren's own answer to when: a preview is fifteen chunk fetches, nothing once
   and a lot thirty times. The coordinate stays a link, clicking draws the tissue underneath, and
   clicking it again puts it away.

   THE LINK THEREFORE MEANS SOMETHING NEW: it used to leave for Neuroglancer. Now the PICTURE is the
   Neuroglancer link, so the click that used to leave the page keeps you on it, and the thing that
   leaves is the thing you can see first. */
function wirePreviews(host){
  if (!host || !window.UJ || !UJ.empreview) return;
  [].slice.call(host.querySelectorAll(".forumbody")).forEach(function(body){
    var slot = document.createElement("div");
    slot.className = "forumprev";
    body.parentNode.insertBefore(slot, body.nextSibling);
    var open = "";
    [].slice.call(body.querySelectorAll("a[data-jl]")).forEach(function(a){
      a.addEventListener("click", function(ev){
        var hs = hits(body.dataset.raw || "");
        var h = hs[Number(a.getAttribute("data-jl"))];
        if (!h) return;
        /* A VIEWER LINK KEEPS ITS OLD MEANING: it is already a state somebody built. */
        if (h.kind === "viewer") return;
        /* THE IDS ARE THE POST'S, not the link's. Søren: "if a nucleus or root ID is written, then
           the EM should also show segmentation." A sentence naming a place and a cell is asking for
           one picture of the two, and which word came first does not matter. */
        var ids = idsOf(hs);
        /* ── CLICKING A THING SHOWS THAT THING ────────────────────────────────────  2026-10-03
           One rule for three kinds, which is easier to predict than three rules. A coordinate goes
           to that coordinate; a nucleus id to that nucleus, as it has since "a post naming only a
           nucleus has no coordinate to centre on, and its link used to do nothing, which looks
           exactly like a broken link"; and a root id to that cell, which is the case that was
           left out and the one Søren hit: "Clicking the root ID does nothing at all."

           ONLY THEN THE POST'S OWN COORDINATE. A sentence naming a place and a cell is asking for
           one picture of the two -- idsOf() above has assumed that since it was written -- so an
           id this page cannot place still has somewhere to be drawn when the sentence says where.
           Last, because the thing you clicked wins over the thing beside it. */
        var at = h.voxel;
        if (!at && h.kind === "nucleus") at = nucleusPos(h.id);
        if (!at && h.kind === "root") at = cellPos(h.id);
        if (!at) at = (hs.filter(function(x){ return x.voxel; })[0] || {}).voxel || null;
        if (!at){
          /* NOT NOTHING. rootIdToIndex only knows this tool's own resolved root ids: a
             community-proposed root, or a cell in another volume, is not in it. Silence there is
             the fault being fixed, so this says which id it was and offers the one answer that
             works for any id at all. */
          ev.preventDefault();
          ev.stopPropagation();
          var u = viewerUrlFor(h);
          open = "";
          slot.innerHTML = "<p class='forumnoplace' style='font-size:12px;color:var(--mut);"
            + "margin:6px 0;line-height:1.5'>Nothing on this page knows where <b>"
            + esc(h.id || h.text || "that") + "</b> is — it may be a community-proposed root id, "
            + "or a cell in another volume. "
            + (u ? "<a href='" + esc(u) + "' target='_blank' rel='noopener'>Open it in "
                   + "Neuroglancer</a>, or add a coordinate to the post and the picture will "
                   + "draw here."
                 : "Add a coordinate to the post and the picture will draw here.")
            + "</p>";
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        var key = at.join(",");
        if (open === key){ UJ.empreview.close(slot); open = ""; return; }
        open = key;
        UJ.empreview.open(slot, at, { ids: ids });
      });
    });
  });
}

/* And in the compose box, as you type, so you can see the coordinate you pasted is the place you
   meant before anybody else reads it. KEYED ON WHAT WOULD BE DRAWN — the place and the ids — so
   adding a root id repaints and typing the next word does not. */
function wireComposePreview(id){
  var ta = document.getElementById(id + "_body");
  var slot = document.getElementById(id + "_prev");
  if (!ta || !slot || !window.UJ || !UJ.empreview) return;
  var shown = "";
  var look = function(){
    var hs = hits(ta.value);
    var h = hs.filter(function(x){ return x.voxel && x.kind === "coord"; })[0];
    var at = h ? h.voxel : null;
    var ids = idsOf(hs);
    if (!at && ids.nuc) at = nucleusPos(ids.nuc);
    var key = at ? (at.join(",") + "|" + (ids.root || "") + "|" + (ids.nuc || "")) : "";
    if (key === shown) return;
    shown = key;
    if (!at){ UJ.empreview.close(slot); return; }
    UJ.empreview.open(slot, at, { ids: ids });
  };
  /* A BEAT AFTER THE TYPING STOPS. Pasting fires one input event; typing one by hand fires a dozen,
     and the first eleven are prefixes that may each land inside the volume and each start a read. */
  var t = 0;
  ta.addEventListener("input", function(){
    if (t) clearTimeout(t);
    t = setTimeout(look, 450);
  });
}

function render(){
  var host = document.getElementById("forumCard");
  if (!host) return;
  grabDrafts();
  host.innerHTML = "<div class='forum-wrap' style=\"display:flex;gap:14px;align-items:flex-start;"
                 + "flex-wrap:wrap\">" + indexHtml() + viewHtml() + "</div>";
  putDrafts();
  wire();
}

function wire(){
  var host = document.getElementById("forumCard");
  if (!host) return;
  var byId = function(id){ return document.getElementById(id); };

  [].slice.call(host.querySelectorAll(".fscope")).forEach(function(b){
    b.addEventListener("click", function(){
      if (SCOPE === b.dataset.scope) return;
      SCOPE = b.dataset.scope; OPEN = ""; MODE = "";
      render();
    });
  });
  [].slice.call(host.querySelectorAll(".fthread")).forEach(function(b){
    b.addEventListener("click", function(){
      OPEN = b.dataset.pid; MODE = "";
      render();
    });
  });
  var nb = byId("forum_new");
  if (nb) nb.addEventListener("click", function(){ MODE = "new"; OPEN = ""; render(); });

  /* The new-thread form and the reply box are the same machinery with different payloads: one
     starts a thread, the other points at one. */
  var composer = function(id, payload){
    var ta = byId(id + "_body"), found = byId(id + "_found"), go = byId(id + "_go"),
        say = byId(id + "_say");
    if (!ta || !go) return;
    var refresh = function(){ if (found) found.textContent = foundSay(ta.value); };
    ta.addEventListener("input", refresh);
    refresh();
    go.addEventListener("click", async function(){
      /* NOT SIGNED IN IS NOT AN ERROR, it is the next step. The same One Tap prompt the account
         chip uses, from the button somebody just pressed — and what they have written stays in the
         box, because the re-render after they sign in puts it back. */
      if (!signedIn()){
        try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.prompt(); }
        catch (_gp){}
        if (say) say.textContent = "Sign in with Google and press it again — "
                                 + "what you have written is kept.";
        return;
      }
      var body = String(ta.value || "").trim();
      if (!body){ if (say) say.textContent = "Write something first."; return; }
      if (BUSY) return;
      BUSY = true; go.disabled = true; if (say) say.textContent = "Posting…";
      var d = payload();
      d.body = body;
      var kindEl = byId(id + "_kind"), titleEl = byId(id + "_title");
      if (kindEl) d.kind = kindEl.value || "finding";
      if (titleEl) d.title = titleEl.value || "";
      var r = await send(d);
      BUSY = false; go.disabled = false;
      if (!r.ok){ if (say) say.textContent = "Not posted — " + (r.error || "refused") + "."; return; }
      ta.value = ""; if (titleEl) titleEl.value = "";
      FORM_DRAFT[id] = null;
      if (say) say.textContent = "";
      /* A NEW THREAD OPENS ITSELF. You wrote it to be read; making you find it in the index would
         be a small insult. A reply keeps the thread you are in. */
      if (!d.replyTo && r.postId){ OPEN = r.postId; MODE = ""; }
      await load(true); render();
    });
  };
  composer("forum_" + SCOPE, function(){ return { type: "forum_post", scope: SCOPE }; });
  composer("forum_reply", function(){
    var p = postById(OPEN) || {};
    return { type: "forum_post", scope: p.scope || SCOPE, kind: "reply", replyTo: OPEN };
  });

  wirePreviews(host);
  formIds().forEach(wireComposePreview);

  [].slice.call(host.querySelectorAll(".forumopenall")).forEach(function(b){
    b.addEventListener("click", function(){
      var p = postById(b.dataset.pid);
      if (!p || !window.UJ || !UJ.jumplink) return;
      var u = UJ.jumplink.url(UJ.jumplink.scan(p.body || ""));
      if (u) window.open(u, "_blank", "noopener");
    });
  });

  [].slice.call(host.querySelectorAll(".forumedit")).forEach(function(b){
    b.addEventListener("click", function(){
      var p = postById(b.dataset.pid);
      var box = host.querySelector('.forumeditbox[data-pid="' + b.dataset.pid + '"]');
      if (!p || !box) return;
      if (box.innerHTML){ box.innerHTML = ""; return; }
      box.innerHTML = "<input class='etitle' style='width:100%;margin-top:6px'>"
                    + "<textarea class='ebody' rows='4' style='width:100%;margin-top:4px'></textarea>"
                    + "<div class='hint efound' style='margin:4px 0'></div>"
                    + "<button type='button' class='hist-chip ego'>Save the edit</button>"
                    + " <span class='hint esay'></span>";
      var ti = box.querySelector(".etitle"), ta = box.querySelector(".ebody"),
          note = box.querySelector(".efound"), say = box.querySelector(".esay");
      ti.value = p.title || ""; ta.value = p.body || "";
      ta.addEventListener("input", function(){ note.textContent = foundSay(ta.value); });
      note.textContent = foundSay(ta.value);
      box.querySelector(".ego").addEventListener("click", async function(){
        say.textContent = "Saving…";
        var r = await send({ type: "forum_post", postId: p.postId, title: ti.value, body: ta.value });
        if (!r.ok){ say.textContent = "Not saved — " + (r.error || "refused") + "."; return; }
        await load(true); render();
      });
    });
  });

  [].slice.call(host.querySelectorAll(".forumhide")).forEach(function(b){
    b.addEventListener("click", async function(){
      /* ASKED, BECAUSE THIS PAGE OFFERS NO WAY BACK. The backend can unhide; there is no button for
         it here, so the person pressing this should mean it. */
      if (!window.confirm("Hide this post? It stops being sent to anybody. "
                        + "It stays in the sheet and can be restored there.")) return;
      var r = await send({ type: "forum_post", postId: b.dataset.pid, hide: true });
      if (!r.ok){ window.alert("Not hidden — " + (r.error || "refused")); return; }
      /* Hiding the thread you are reading leaves nothing to read. */
      if (b.dataset.pid === OPEN) OPEN = "";
      await load(true); render();
    });
  });
}

/* Rendered when the tab is first opened rather than on load: the forum is one more request, and a
   page nobody has clicked Discussion on should not pay for it. */
async function init(opts){
  opts = opts || {};
  TOOL = opts.tool || ""; VOLUME = opts.volume || "";
  var host = document.getElementById("forumCard");
  if (!host) return;
  host.innerHTML = '<p class="hint">Reading the discussion…</p>';
  /* Started before the first read, so that a sign-in arriving DURING that read is still noticed:
     the read is the slowest thing here and the likeliest moment for Google to answer. */
  watchSignIn();
  try { await load(true); }
  catch (e){
    host.innerHTML = '<p class="hint" style="color:var(--bad)">Could not read the discussion: '
      + esc(String(e && e.message || e)) + ". If the backend has not been redeployed since "
      + "2026-10-01 it does not answer this question yet.</p>";
    return;
  }
  render();
}

UJ.forum = { init: init, render: render,
             _foundSay: foundSay, _postHtml: postHtml, _indexHtml: indexHtml,
             _open: function(pid){ OPEN = pid || ""; MODE = ""; render(); },
             _scope: function(s){ if (s){ SCOPE = s; OPEN = ""; MODE = ""; } return SCOPE; },
             _new: function(){ MODE = "new"; OPEN = ""; render(); },
             _set: function(p, m){ POSTS = p || []; CAN_MODERATE = !!m; LOADED = true; } };
})();
