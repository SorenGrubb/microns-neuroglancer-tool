/* A draft follows the account.                                                      2026-09-19

   Søren, asked where drafts should live: **in the dataset** — following the account between
   machines rather than sitting in one browser.

   The browser keeps every autosave and the server is a throttled mirror of it, and that division
   is where the ways to be wrong are. This drives the real page against a stubbed endpoint and
   asserts the four that matter:

     - SIGNED OUT, NOTHING IS SENT AND NOTHING COMPLAINS. The card already promises a tracing is
       kept whether or not anybody has signed in, and postReport — which fires Google One Tap and
       shows an alert — is exactly the wrong thing to reach for here. Asserted by counting requests
       AND alerts, because "it did not send" and "it did not nag" are separate failures.
     - THE AUTOSAVE IS THROTTLED. The pad saves itself about every 1.2 s; a Drive write per second
       per tracer is a quota mail. Ten saves in a row must not be ten pushes.
     - AN EXPLICIT PRESS BEATS THE THROTTLE, because somebody pressing Save draft is saying "make
       sure", and making sure is what the timer does not do.
     - A DRAFT KEPT ONLY ON THE ACCOUNT IS FETCHED BEFORE IT IS RESUMED. The index carries counts
       and not one coordinate — that is what makes listing cheap — so the geometry has to be asked
       for, and the row has to say so rather than offering a Resume that opens an empty pad.

   Nothing here reaches Google: REPORT_ENDPOINT is pointed at a route this file answers.

   Run: node draftsynccheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

/* The account's drafts, as the backend's ?drafts= index returns them: counts, no geometry. */
const SERVER = {
  "d-laptop": { draftId: "d-laptop", title: "Mitochondrion · L2/3 pyramidal",
                contours: 12, sections: 12, structures: 1, updated: "2026-09-19T21:00:00.000Z",
                nucleusId: "264317", rootId: "", editId: "", fileId: "f1" }
};
const GEOM = {
  "d-laptop": { v: 2, id: "d-laptop", title: "Mitochondrion · L2/3 pyramidal",
                at: "2026-09-19T21:00:00.000Z", z: 4000, centre: [1000, 2000, 4000],
                rings: [{ z: 4000, inst: 0, points: [[10, 10], [90, 10], [90, 90]] },
                        { z: 4005, inst: 0, points: [[12, 12], [92, 12], [92, 92]] }],
                pending: [] }
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.route("**storage.googleapis.com/**", r => r.abort());

  /* The stub endpoint, and the tally that every assertion below is made of. */
  const seen = { posts: [], lists: 0, loads: [] };
  await p.route("**script.google.com/**", async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === "POST"){
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch (_e){}
      seen.posts.push(body);
      return route.fulfill({ status: 200, contentType: "application/json",
                             body: JSON.stringify({ ok: true, draftId: body.draftId }) });
    }
    if (/[?&]drafts=/.test(url)){
      const m = /[?&]draftId=([^&]*)/.exec(url);
      if (m && m[1]){
        seen.loads.push(decodeURIComponent(m[1]));
        const g = GEOM[decodeURIComponent(m[1])];
        return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify(g ? { ok: true, draft: g } : { ok: false, error: "no such draft of yours" }) });
      }
      seen.lists++;
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, drafts: Object.keys(SERVER).map(k => SERVER[k]) }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });

  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  /* Put a tracing on the pad and save it, the way the autosave does. */
  const SAVE = `(function(n, explicit){
    PAD = PAD || UJ.tracepad.create(100);
    PAD.rings = PAD.rings || [];
    PAD.rings.push({ z: 100 + PAD.rings.length, inst: 0, points: [[0,0],[10,0],[10,10]] });
    document.getElementById("tracingFound").style.display = "";
    return draftSave(!!explicit);
  })`;

  console.log("signed out, nothing is sent and nothing nags");
  {
    const got = await p.evaluate(async ([save]) => {
      localStorage.removeItem("ujump_tracing_drafts_v2");
      localStorage.removeItem("ujump_tracing_draft_v1");
      GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
      window.__alerts = 0;
      const realAlert = window.alert; window.alert = function(){ window.__alerts++; };
      TRACING_DRAFT_ID = ""; PAD = null;
      // eslint-disable-next-line no-eval
      const save_ = eval(save);
      save_(1, false); save_(2, true);
      await new Promise(r => setTimeout(r, 400));
      window.alert = realAlert;
      return { alerts: window.__alerts, kept: draftStore.list().length,
               signedIn: typeof draftSignedIn === "function" ? draftSignedIn() : null,
               say: (document.getElementById("tracePadSay") || {}).textContent || "" };
    }, [SAVE]);
    ok(got.signedIn === false, "the page knows it is signed out", String(got.signedIn));
    ok(seen.posts.length === 0, "...so nothing was posted", seen.posts.length + " post(s)");
    ok(got.alerts === 0, "...and nothing was alerted about it — an autosave must not nag",
       got.alerts + " alert(s)");
    ok(got.kept === 1, "...while the browser keeps it, which is the promise the card makes",
       got.kept + " kept");
    ok(/Sign in and it is kept on your account too/.test(got.say),
       "...and the explicit save says what signing in would add", got.say.slice(-56));
  }

  console.log("\nsigned in, the autosave is throttled and an explicit press is not");
  {
    const got = await p.evaluate(async ([save]) => {
      GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "tok"; GOOGLE_EXP = Date.now() / 1000 + 3600;
      DRAFT_PUSH_AT = 0;
      // eslint-disable-next-line no-eval
      const save_ = eval(save);
      for (let i = 0; i < 10; i++) save_(i, false);      // ten autosaves in a row
      await new Promise(r => setTimeout(r, 500));
      return { kept: (draftRead() || {}).rings.length };
    }, [SAVE]);
    const afterAuto = seen.posts.filter(x => x.type === "tracing_draft").length;
    ok(got.kept === 12, "ten more autosaves all reach the browser", got.kept + " contours kept");
    ok(afterAuto === 1, "...and exactly one of them reaches the account",
       afterAuto + " push(es) for 10 saves");

    await p.evaluate(([save]) => { /* eslint-disable-next-line no-eval */ eval(save)(99, true); }, [SAVE]);
    await p.waitForTimeout(400);
    const afterPress = seen.posts.filter(x => x.type === "tracing_draft").length;
    ok(afterPress === 2, "pressing Save draft pushes at once, throttle or no throttle",
       afterPress + " push(es)");
    const last = seen.posts[seen.posts.length - 1];
    ok(last.action === "save" && last.draftId && last.draft && last.draft.length > 100,
       "...carrying the geometry, with the counts beside it for the index",
       last.contours + " contours, " + last.draft.length + " bytes");
    ok(last.credential === "tok" && !last.ownerEmail,
       "...and the credential, never a claim about whose it is — the server decides that",
       JSON.stringify(last.credential));
    const say = await p.evaluate(() => (document.getElementById("tracePadSay") || {}).textContent || "");
    ok(/on your account/.test(say), "...and it says where it went", say.slice(0, 60));
  }

  console.log("\na draft kept only on the account is listed, and fetched before it is resumed");
  {
    const got = await p.evaluate(async () => {
      DRAFT_SERVER_AT = 0;
      draftServerSoon(true);
      await new Promise(r => setTimeout(r, 600));
      const all = draftStore.all();
      return { n: all.length, remote: all.filter(function(d){ return d.remote; }).length,
               bar: document.getElementById("tracingDraftBar").textContent.replace(/\s+/g, " "),
               local: draftStore.list().length };
    });
    ok(got.remote === 1 && got.n === 2,
       "the account's draft joins the list without being in this browser",
       got.n + " listed, " + got.local + " here");
    ok(/on your account/.test(got.bar) && /Mitochondrion/.test(got.bar),
       "...and the row says so, rather than looking like a local one", got.bar.slice(0, 90));

    const before = seen.loads.length;
    const back = await p.evaluate(async () => {
      const btn = document.querySelector('#tracingDraftBar .draftres[data-id="d-laptop"]');
      if (!btn) return { clicked: false };
      btn.click();
      await new Promise(r => setTimeout(r, 900));
      return { clicked: true, onPad: PAD ? PAD.rings.length : -1, current: TRACING_DRAFT_ID,
               nowLocal: draftStore.list().filter(function(d){ return d.id === "d-laptop"; }).length };
    });
    ok(back.clicked, "it has a Resume of its own");
    ok(seen.loads.length === before + 1 && seen.loads[seen.loads.length - 1] === "d-laptop",
       "...which asks the account for the geometry, by id",
       seen.loads.slice(-1)[0]);
    ok(back.onPad === 2, "...and puts ITS contours on the pad", back.onPad + " contours");
    ok(back.current === "d-laptop", "...keeping its id, so saving updates it", back.current);
    ok(back.nowLocal === 1,
       "...and it is written into this browser as it arrives, so a reload need not fetch it again");
  }

  console.log("\ndiscarding one discards it on the account too");
  {
    const before = seen.posts.length;
    const got = await p.evaluate(async () => {
      const real = window.confirm; window.confirm = function(){ return true; };
      const btn = document.querySelector('#tracingDraftBar .draftdrop[data-id="d-laptop"]');
      if (btn) btn.click();
      window.confirm = real;
      await new Promise(r => setTimeout(r, 600));
      return { here: draftStore.list().filter(function(d){ return d.id === "d-laptop"; }).length };
    });
    const del = seen.posts.slice(before).filter(x => x.action === "delete");
    ok(got.here === 0, "it is gone from this browser", got.here + " left here");
    ok(del.length === 1 && del[0].draftId === "d-laptop",
       "...and a delete was sent for it, by id", del.length + " delete(s)");
  }

  ok(errors.length === 0, "the page still loads with no new errors",
     errors.length ? errors[0] : "none");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
