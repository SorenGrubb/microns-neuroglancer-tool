/* "Submitted" has to mean it was.                                                   2026-09-20

   Found while retiring ηJump's forked copy of the organelle form (see
   src/the_shared_form_learns_a_second_dataset.py). The fork waited on its posts and said "Try
   again" when one came back refused; the shared form in core/panel.js printed "submitted" the
   instant the requests left the page. Moving ηJump onto the shared file would have taken that
   away from it, so the fork's behaviour was lifted into the shared file instead — and with it,
   five other tools stopped claiming success they had not been told about.

   WHY THIS IS THE FAILURE WORTH CODE. A Google ID token lasts about an hour. ηJump refuses a post
   outright when the token has lapsed — before the round trip, deliberately — and µJump does the
   same. So the common case is not a server error: it is somebody who signed in forty minutes ago,
   logging twelve mitochondria they have just spent ten minutes finding, being told all twelve were
   recorded when none of them were. There is no second chance at that data; they close the tab.

   THREE ANSWERS, BECAUSE postReport DOES NOT ANSWER THE SAME WAY ON EVERY TOOL. That is the real
   trap here — a check that only stubbed one shape would pass while the form silently mis-read the
   others:

     - µJump returns `false` when it refuses outright, and toasts the server's own sentence later;
     - ηJump returns a Promise of {ok, error};
     - a host whose postReport returns nothing useful must keep the old wording, because there is
       nothing to wait for and silence is not a failure.

   Run: node organsubmitcheck.js */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const core = require("./corepath.js");

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* core/panel.js with just enough page around it to build and submit the form. `answer` is what
   this case's postReport hands back; `sent` collects the payloads so a refusal that never reached
   postReport at all cannot be mistaken for one it refused. */
function formWindow(answerSrc, extraHostSrc) {
  const vc = new VirtualConsole(); const errs = [];
  vc.on("jsdomError", e => errs.push(String(e.message).slice(0, 160)));
  const host =
      '<div id="host"></div>'
    + "<script>" + fs.readFileSync(core("ontology.js"), "utf8") + "<" + "/script>"
    + "<script>" + fs.readFileSync(core("organelles.js"), "utf8") + "<" + "/script>"
    + "<script>"
    + 'var REPORT_ENDPOINT="https://example.invalid/exec";'
    + 'var GOOGLE_VERIFIED=true, GOOGLE_CREDENTIAL="c", REPORTER_NAME="S", REPORTER_EMAIL="s@x";'
    + 'var ID_CTX={nucId:"521491", root:"8646", pos:[10,20,30]};'
    + 'var SENT=[];'
    + 'function escHtml(s){return String(s==null?"":s);}'
    + 'function coordSpan(x,y,z){var c=x+", "+y+", "+z;'
    + '  return "<span class=\'idval\' data-c=\'"+c+"\'>"+c+"</span>";}'
    + 'function neuroglancerLinkForPos(){return "#";}'
    + 'function canonSubmitName(n){return n||"";}'
    + 'function postReport(p){ SENT.push(p); return (' + answerSrc + ')(p); }'
    + (extraHostSrc || "")
    + "<" + "/script>"
    + "<script>" + fs.readFileSync(core("panel.js"), "utf8") + "<" + "/script>";
  const dom = new JSDOM(host, { runScripts: "dangerously",
    url: "https://grubblab.com/ujump.html", virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) { w.alert = () => {}; w.fetch = () => new w.Promise(() => {}); } });
  return { w: dom.window, D: dom.window.document, errs };
}

/* Build the form, put one complete structure in it, press submit. Returns what the reporter is
   left looking at. */
async function submitOne(answerSrc) {
  const { w, D, errs } = formWindow(answerSrc);
  await sleep(120);
  const el = D.getElementById("host");
  el.innerHTML = w.organelleFormHtml(null);
  w.wireOrganelleForm(el, null);
  /* One row, filled. A half-filled row is refused before postReport is reached, which would make
     every case below pass for the wrong reason. */
  const row = el.querySelector(".organ-row-kind").closest("div.merged-row");
  row.querySelector(".orx").value = "1";
  row.querySelector(".ory").value = "2";
  row.querySelector(".orz").value = "3";
  const btn = D.getElementById("organSubmit");
  btn.click();
  await sleep(120);
  return { label: btn.textContent, disabled: btn.disabled, errs,
           thanks: D.getElementById("organThanks").textContent.trim(),
           sent: w.SENT.length };
}

(async () => {
  console.log("--- a post that was refused outright (µJump returns false) ---");
  {
    const r = await submitOne("function(){ return false; }");
    ok("it reached postReport at all", r.sent === 1, r.sent + " posted");
    ok("...and the button does NOT say submitted", !/submitted/i.test(r.label), r.label);
    ok("...it offers the retry, enabled", r.disabled === false && /try again/i.test(r.label),
       r.label + ", disabled=" + r.disabled);
    ok("...and nothing is thanked for", !/Thanks/.test(r.thanks),
       r.thanks.slice(0, 60) || "(empty)"
       + "  <- twelve mitochondria reported as logged, when none were, is the whole bug");
  }

  console.log("\n--- a post the server said no to (ηJump returns a promise of {ok,error}) ---");
  {
    const r = await submitOne(
      'function(){ return Promise.resolve({ok:false, error:"Your Google sign-in has expired"}); }');
    ok("the button does not say submitted", !/submitted/i.test(r.label), r.label);
    ok("...and the server's own sentence is shown", /sign-in has expired/.test(r.thanks),
       r.thanks.slice(0, 70)
       + "  <- the actionable half; no wording invented here could name the reason");
  }

  console.log("\n--- a post that landed ---");
  {
    const r = await submitOne('function(){ return Promise.resolve({ok:true}); }');
    ok("it says submitted", /submitted/i.test(r.label), r.label);
    ok("...and thanks for the one structure", /Thanks/.test(r.thanks) && /1 structure/.test(r.thanks),
       r.thanks.slice(0, 60));
  }

  console.log("\n--- a host whose postReport answers with nothing ---");
  {
    /* THE COMPATIBILITY CASE. Several tools' postReport returns undefined and reports its own
       outcome through a toast. There is nothing here to wait on, and treating silence as failure
       would turn every successful submission on those pages into "Try again". */
    const r = await submitOne("function(){ return undefined; }");
    ok("the old wording is kept, not turned into a failure",
       /submitted/i.test(r.label) && /Thanks/.test(r.thanks),
       r.label + " / " + r.thanks.slice(0, 40)
       + "  <- silence is not a refusal; those pages toast their own outcome");
    ok("no page errors", r.errs.length === 0, r.errs[0] || "none");
  }

  console.log("\n--- and the credit box, which only some pages can honour ---");
  {
    /* THE SECOND THING ηJump SURFACED. The form's "want credit for this report?" block is a name
       field plus an empty div for a Google button, and BOTH are wired by the host —
       saveReporterFromInput and initGSI. Only µJump, δJump and πJump define either. On λJump,
       βJump and now ηJump the field swallowed the name and the sign-in slot stayed empty, under a
       line saying sign-in was required and offering no way to do it. Asking somebody to type
       their name and then dropping it is worse than not asking. */
    const seen = src => {
      const { w, D } = formWindow("function(){return undefined;}", src);
      const el = D.getElementById("host");
      el.innerHTML = w.organelleFormHtml(null);
      return { box: !!el.querySelector("#organReporterInput"),
               anon: /Reporting anonymously/.test(el.textContent) };
    };
    /* Signed OUT, which is the only state in which this block is rendered at all — signed in, the
       form says who it is submitting as and asks nothing. */
    const canSave = seen('GOOGLE_VERIFIED=false;'
                         + 'function saveReporterFromInput(v){ window.__saved=v; }');
    const cannot = seen("GOOGLE_VERIFIED=false;");
    ok("a page that can save a typed name still offers the box",
       canSave.box && !canSave.anon, JSON.stringify(canSave));
    ok("...and one that cannot says so instead of taking it",
       !cannot.box && cannot.anon, JSON.stringify(cannot)
       + "  <- λJump, βJump and ηJump define neither hook");
  }

  const bad = R.filter(x => !x).length;
  console.log("\n" + (bad ? "*** " + bad + " of " + R.length + " FAILED ***"
                          : "RESULT: ALL " + R.length + " CHECKS PASSED"));
  process.exit(bad ? 1 : 0);
})();
