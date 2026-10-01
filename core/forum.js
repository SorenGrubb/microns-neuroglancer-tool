/* core/forum.js — somewhere to say what you found, and to be answered.             2026-10-01

   Gary: *"Do you think we should include a separate space where users can make suggestions for new
   features, log bug reports, or even discuss interesting findings they've noticed? ... I wonder if
   Jump could help in this by hosting an interactive forum to allow discussions to happen."*
   Søren: *"I think we should do one forum for each jump."*

   ── TWO STREAMS, BECAUSE THEY ARE ABOUT DIFFERENT THINGS ─────────────────────────────────────
   "The capillary at 240640, 207872, 21360 has an odd pericyte" is about minnie65 and means nothing
   in H01, so it belongs to this volume. "The pad forgets my colour" is about the tracing pad, which
   is the same code in all eight tools — scattered across eight forums it would be eight half-dead
   threads, so the tools stream is ONE conversation, written here and visible from every Jump. The
   backend keeps them in two books; this shows them as two lists on one screen.

   ── A POST IS PROSE, AND THE PROSE IS THE ANCHOR ─────────────────────────────────────────────
   There is no "attach a coordinate" field. core/jumplink.js reads the body and finds the places
   named in it — a coordinate that lands inside one of the two imaged volumes, an 18-digit root id,
   a cued nucleus id, a pasted viewer URL — so a post may be about one place or six, which is what
   Søren asked for when he saw the anchor-field version: *"what if a user wants to talk about more
   than one coordinate in a post?"*

   Two things follow. The compose box SAYS WHAT IT RECOGNISED before anything is sent, because a
   linkifier that resolves rather than guesses will sometimes decline, and the author should find
   that out while they can still write the word "cell" rather than afterwards. And a post with
   several places gets ONE "open all of them" — a paragraph comparing four capillaries opens as one
   picture, which is the thing a list of links cannot do and the reason this lives inside a Jump
   rather than on a forum somewhere else.

   ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────────────────────
   No rich text, no images, no attachments, no notifications. A forum that needs moderating is the
   first thing on Jump that needs a PERSON, and every feature added before anyone has posted twice
   is a feature nobody asked for. Hiding is there from the first day, because a forum that cannot
   be cleaned is one that eventually embarrasses its owner.

   WHAT A HOST DOES
     markup   <div class="tabpanel" data-tabpanel="forum"><div id="forumCard"></div></div>
              and a tab button with data-tab="forum".
     call     UJ.forum.init({tool:"ujump", volume:"minnie65"});
   Needs REPORT_ENDPOINT, the page's Google sign-in globals, and core/jumplink.js for the bodies.

   Check: forumcheck.js */
var UJ = UJ || {};
(function(){
"use strict";

var POSTS = [], CAN_MODERATE = false, LOADED = false, TOOL = "", VOLUME = "", BUSY = false;

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

var KINDS = [["finding", "A finding"], ["bug", "A bug"], ["idea", "An idea"],
             ["question", "A question"]];
function kindName(k){
  for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0] === k) return KINDS[i][1];
  return "A note";
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

/* ── THE COMPOSE BOX, AND WHAT IT SAYS IT FOUND ───────────────────────────────────────────────
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

function composeHtml(scope){
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
            : "What you saw, and where. Write coordinates and ids straight into the sentence — "
              + "they become links.")
       + '"></textarea>'
       + '<div class="hint" id="' + id + '_found" style="margin:4px 0 6px"></div>'
       + '<button type="button" class="idbtn" id="' + id + '_go" style="width:auto;padding:4px 14px">'
       + "Post it</button>"
       + ' <span class="hint" id="' + id + '_say"></span>';
}

/* ── ONE POST ─────────────────────────────────────────────────────────────────────────────────
   The body is the interesting part; everything else is one small line above it. "Open all of them"
   appears only when there is more than one place, because for one place the link in the sentence
   is already the button. */
function postHtml(p, replies){
  /* WHAT THE BUTTON WILL ACTUALLY SHOW, which is not the same as the number of links: a root id has
     no position, so it is not a point in the annotation layer -- but it IS selected in both
     segmentations, so the viewer does show it, and a button that said "2" beside three links would
     be quietly wrong. A pasted viewer link is excluded: it replaces the state rather than joining
     it, so it opens on its own. */
  var n = hits(p.body || "").filter(function(h){
    return h.voxel || h.kind === "root"; }).length;
  var mine = !!p.isMine;
  return '<div class="forumpost" data-pid="' + esc(p.postId) + '" '
       + 'style="border-left:2px solid var(--line);padding:6px 0 6px 12px;margin:10px 0 10px 2px">'
       + '<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">'
       + (p.title ? '<b style="flex:1 1 200px;min-width:0">' + esc(p.title) + "</b>" : "")
       + '<span class="hint" style="flex:0 0 auto">' + esc(kindName(p.kind)) + " · "
         + esc(p.authorName || "somebody") + " · " + esc(when(p.timestamp))
         + (p.editedAt ? " · edited" : "")
         + (String(p.scope) === "tools" && p.tool ? " · from " + esc(p.tool) : "")
       + "</span></div>"
       + '<div class="forumbody" style="margin:4px 0">' + bodyHtml(p.body || "") + "</div>"
       + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
       + (n > 1 ? '<button type="button" class="hist-chip forumopenall" data-pid="' + esc(p.postId)
                  + '" title="Opens every place this post mentions in ONE viewer, as a single '
                  + 'annotation layer, with both volumes’ imagery and segmentation.">Open all '
                  + n + " of them</button>" : "")
       + (signedIn() ? '<button type="button" class="hist-chip forumreply" data-pid="'
                       + esc(p.postId) + '">Reply</button>' : "")
       + (mine ? '<button type="button" class="hist-chip forumedit" data-pid="' + esc(p.postId)
                 + '">Edit</button>' : "")
       + ((mine || CAN_MODERATE) ? '<button type="button" class="hist-chip forumhide" data-pid="'
                 + esc(p.postId) + '" title="'
                 + (mine ? "Withdraws your post." : "Hides this post. You are a moderator here.")
                 + '">' + (mine ? "Withdraw" : "Hide") + "</button>" : "")
       + "</div>"
       + '<div class="forumreplybox" data-pid="' + esc(p.postId) + '"></div>'
       + (replies.length
            ? '<div style="margin-left:14px">' + replies.map(function(r){
                return postHtml(r, []); }).join("") + "</div>"
            : "")
       + "</div>";
}

function streamHtml(scope, label, blurb){
  var top = POSTS.filter(function(p){ return String(p.scope) === scope && !p.replyTo; });
  var kids = function(pid){
    return POSTS.filter(function(p){ return String(p.replyTo) === String(pid); })
                .sort(function(a, b){ return String(a.timestamp).localeCompare(String(b.timestamp)); });
  };
  /* NEWEST FIRST for the top level, because what somebody posted this morning is what the next
     person wants to see; OLDEST FIRST inside a thread, because a conversation read backwards is
     not a conversation. */
  top.sort(function(a, b){ return String(b.timestamp).localeCompare(String(a.timestamp)); });
  return '<div class="card" style="margin-top:12px">'
       + "<label>" + esc(label) + "</label>"
       + '<p class="hint" style="margin:2px 0 10px">' + blurb + "</p>"
       + '<div id="forum_' + scope + '_compose">' + composeHtml(scope) + "</div>"
       + '<div id="forum_' + scope + '_list">'
       + (top.length ? top.map(function(p){ return postHtml(p, kids(p.postId)); }).join("")
                     : '<p class="hint">Nothing here yet.</p>')
       + "</div></div>";
}

function render(){
  var host = document.getElementById("forumCard");
  if (!host) return;
  host.innerHTML =
      streamHtml("volume", "About this volume — " + (VOLUME || "what is in the data"),
        "Findings, oddities, questions about the cells themselves. Write coordinates and ids "
        + "straight into the sentence and they become links: a reader opens exactly what you saw. "
        + "Posts here belong to this dataset.")
    + streamHtml("tools", "About the tools",
        "Bugs and ideas about the Jump tools themselves. This stream is <b>shared across every "
        + "Jump</b> — the tracing pad is the same code everywhere, so one conversation about "
        + "it is worth more than eight.");
  wire();
}

/* ── WIRING ───────────────────────────────────────────────────────────────────────────────────
   Re-bound on every render, which is simplest and costs nothing at this size: a forum with enough
   posts for that to matter is a forum worth rewriting for. */
function wire(){
  var host = document.getElementById("forumCard");
  if (!host) return;
  var byId = function(id){ return document.getElementById(id); };

  ["volume", "tools"].forEach(function(scope){
    var id = "forum_" + scope;
    var ta = byId(id + "_body"), found = byId(id + "_found"), go = byId(id + "_go"),
        say = byId(id + "_say");
    if (!ta) return;
    var refresh = function(){ if (found) found.textContent = foundSay(ta.value); };
    ta.addEventListener("input", refresh);
    refresh();
    if (go) go.addEventListener("click", async function(){
      var body = String(ta.value || "").trim();
      if (!body){ if (say) say.textContent = "Write something first."; return; }
      if (BUSY) return;
      BUSY = true; go.disabled = true; if (say) say.textContent = "Posting…";
      var r = await send({ type: "forum_post", scope: scope,
                           kind: (byId(id + "_kind") || {}).value || "finding",
                           title: (byId(id + "_title") || {}).value || "", body: body });
      BUSY = false; go.disabled = false;
      if (!r.ok){ if (say) say.textContent = "Not posted — " + (r.error || "refused") + "."; return; }
      ta.value = ""; if (byId(id + "_title")) byId(id + "_title").value = "";
      if (say) say.textContent = "";
      await load(true); render();
    });
  });

  [].slice.call(host.querySelectorAll(".forumopenall")).forEach(function(b){
    b.addEventListener("click", function(){
      var p = POSTS.filter(function(x){ return x.postId === b.dataset.pid; })[0];
      if (!p || !window.UJ || !UJ.jumplink) return;
      var u = UJ.jumplink.url(UJ.jumplink.scan(p.body || ""));
      if (u) window.open(u, "_blank", "noopener");
    });
  });

  [].slice.call(host.querySelectorAll(".forumreply")).forEach(function(b){
    b.addEventListener("click", function(){
      var box = host.querySelector('.forumreplybox[data-pid="' + b.dataset.pid + '"]');
      if (!box) return;
      if (box.innerHTML){ box.innerHTML = ""; return; }
      box.innerHTML = '<textarea rows="3" style="width:100%;margin-top:6px" '
                    + 'placeholder="Your reply"></textarea>'
                    + '<div class="hint" style="margin:4px 0"></div>'
                    + '<button type="button" class="hist-chip rgo">Post the reply</button>'
                    + ' <span class="hint rsay"></span>';
      var ta = box.querySelector("textarea"), note = box.querySelector(".hint"),
          say = box.querySelector(".rsay");
      ta.addEventListener("input", function(){ note.textContent = foundSay(ta.value); });
      note.textContent = foundSay("");
      ta.focus();
      box.querySelector(".rgo").addEventListener("click", async function(){
        var body = String(ta.value || "").trim();
        if (!body){ say.textContent = "Write something first."; return; }
        say.textContent = "Posting…";
        var parent = POSTS.filter(function(x){ return x.postId === b.dataset.pid; })[0] || {};
        var r = await send({ type: "forum_post", replyTo: b.dataset.pid,
                             scope: parent.scope || "volume", kind: "reply", body: body });
        if (!r.ok){ say.textContent = "Not posted — " + (r.error || "refused") + "."; return; }
        await load(true); render();
      });
    });
  });

  [].slice.call(host.querySelectorAll(".forumedit")).forEach(function(b){
    b.addEventListener("click", function(){
      var p = POSTS.filter(function(x){ return x.postId === b.dataset.pid; })[0];
      var box = host.querySelector('.forumreplybox[data-pid="' + b.dataset.pid + '"]');
      if (!p || !box) return;
      if (box.innerHTML){ box.innerHTML = ""; return; }
      box.innerHTML = '<input class="etitle" style="width:100%;margin-top:6px">'
                    + '<textarea class="ebody" rows="4" style="width:100%;margin-top:4px"></textarea>'
                    + '<div class="hint efound" style="margin:4px 0"></div>'
                    + '<button type="button" class="hist-chip ego">Save the edit</button>'
                    + ' <span class="hint esay"></span>';
      var ti = box.querySelector(".etitle"), ta = box.querySelector(".ebody"),
          note = box.querySelector(".efound"), say = box.querySelector(".esay");
      ti.value = p.title || ""; ta.value = p.body || "";
      ta.addEventListener("input", function(){ note.textContent = foundSay(ta.value); });
      note.textContent = foundSay(ta.value);
      box.querySelector(".ego").addEventListener("click", async function(){
        say.textContent = "Saving…";
        var r = await send({ type: "forum_post", postId: p.postId,
                             title: ti.value, body: ta.value });
        if (!r.ok){ say.textContent = "Not saved — " + (r.error || "refused") + "."; return; }
        await load(true); render();
      });
    });
  });

  [].slice.call(host.querySelectorAll(".forumhide")).forEach(function(b){
    b.addEventListener("click", async function(){
      /* ASKED, BECAUSE IT IS NOT REVERSIBLE FROM HERE. The backend can unhide; this page offers no
         button for it, so the person pressing this should mean it. */
      if (!window.confirm("Hide this post? It stops being sent to anybody. "
                        + "It stays in the sheet and can be restored there.")) return;
      var r = await send({ type: "forum_post", postId: b.dataset.pid, hide: true });
      if (!r.ok){ window.alert("Not hidden — " + (r.error || "refused")); return; }
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
  try { await load(true); }
  catch (e){
    host.innerHTML = '<p class="hint" style="color:var(--bad)">Could not read the discussion: '
      + esc(String(e && e.message || e)) + ". If the backend has not been redeployed since "
      + "2026-10-01 it does not answer this question yet.</p>";
    return;
  }
  render();
}

UJ.forum = { init: init, render: render, _foundSay: foundSay, _postHtml: postHtml,
             _set: function(p, m){ POSTS = p || []; CAN_MODERATE = !!m; LOADED = true; } };
})();
