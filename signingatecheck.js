/* One warning, before anything is sent.                                            2026-09-11

   Søren: "I clicked submit without being logged in, and it gave me a warning for each of the failed
   submissions and then had a greyed out button and then asked me to log in. None of them are saved
   and now I can't click submit."

   Drives the REAL µJump page signed out, with alert() and postReport captured, and presses the
   real Submit button. Three things have to be true and each of them was false:

     * ONE alert, not one per structure.
     * NOTHING posted — the check happens before the first post, not inside the loop.
     * the button still live afterwards, because his rows are still on screen and the only thing
       missing is a sign-in.

   Then it signs in and presses Submit again, because a gate that never opens is not a gate.

   Run: node signingatecheck.js  */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

function link(lines){
  const state = { layers: [{ type: "annotation", name: "annotation",
    annotations: lines.map(l => ({ type: "line", pointA: l[0], pointB: l[1] })) }] };
  return "https://neuroglancer.example/#!" + encodeURIComponent(JSON.stringify(state));
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  /* A real alert() blocks the page and would hang this check — captured, exactly as a person's
     three stacked modals were three real ones. */
  await p.addInitScript(() => {
    window.__alerts = [];
    window.alert = (m) => { window.__alerts.push(String(m)); };
  });
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);
  await p.evaluate(() => { document.getElementById("bulkOrganPanel").open = true; });

  console.log("the gate itself");
  const gate = await p.evaluate(() => ({
    exists: typeof reportGateBlock === "function",
    signedOut: typeof reportGateBlock === "function" ? reportGateBlock() : null,
    endpoint: !!REPORT_ENDPOINT
  }));
  ok(gate.exists, "reportGateBlock() is on the page");
  ok(gate.endpoint, "...and the backend IS configured, so sign-in is the only thing in the way");
  ok(/sign in with Google/i.test(gate.signedOut || ""),
     "signed out, it says what to do", (gate.signedOut || "").split("\n")[0].slice(0, 60));
  ok(/Nothing has been sent/.test(gate.signedOut || ""),
     "...and that nothing was lost, which is the part he could not tell",
     "his three rows were still on screen");

  console.log("\nsubmitting three structures while signed out");
  const cells = await p.evaluate(() => {
    const out = [];
    for (let i = 0; i < N && out.length < 2; i++) { const r = rootId(i); if (r) out.push(r); }
    return out;
  });
  const out = await p.evaluate(async ({ url, cells }) => {
    /* Three markers across two cells — his exact shape, which is what made it three alerts. */
    UJ.segread.configure = () => ({});
    UJ.segread.resolveAt = async (v) => ({ rootId: v[0] < 30 ? cells[0] : cells[1],
                                           nucleusId: 0, inCell: true, inNucleus: false });
    UJ.segread.nearestNucleus = async () => ({ nucleusId: 0, distanceNm: 0, others: [] });
    window.__posted = [];
    const realPost = window.postReport;
    window.postReport = (payload) => { window.__posted.push(payload); return realPost(payload); };

    window.__alerts = [];
    document.getElementById("bulkOrganKind").value = "cilium";     // a vector kind, two ends
    document.getElementById("bulkOrganLink").value = url;
    await bulkOrganFindCells();
    const tickable = [...document.querySelectorAll(".bulkorgpick")].length;

    const btn = document.getElementById("bulkOrganSubmit");
    btn.click();
    return { tickable, alerts: window.__alerts.slice(), posted: window.__posted.length,
             disabled: btn.disabled, label: btn.textContent,
             thanks: document.getElementById("bulkOrganThanks").innerText.trim() };
  }, { url: link([[[10,1,1],[11,1,1]], [[20,1,1],[21,1,1]], [[40,1,1],[41,1,1]]]), cells });

  ok(out.tickable === 3, "three markers resolved and are ready to send", out.tickable + " rows");
  ok(out.alerts.length === 1, "ONE warning, not one per structure",
     out.alerts.length + " alert(s)" + (out.alerts.length ? ": " + out.alerts[0].split("\n")[0].slice(0, 50) : ""));
  ok(out.posted === 0, "NOTHING was posted — the check ran before the first one, not inside the loop",
     out.posted + " posts");
  ok(out.disabled === false, "the Submit button is still live", "label: " + out.label);
  ok(out.label === "Submit", "...and still says Submit, not 'submitted'", out.label);
  ok(out.thanks === "", "...with no thank-you for a submission that never happened",
     JSON.stringify(out.thanks));

  console.log("\nthen he signs in and presses it again");
  const after = await p.evaluate(async () => {
    /* What handleGoogleCred() sets on a real sign-in. postAndRead is stubbed so nothing leaves. */
    GOOGLE_VERIFIED = true; GOOGLE_CREDENTIAL = "test.credential.jwt";
    GOOGLE_EXP = Math.floor(Date.now() / 1000) + 3600;
    window.postAndRead = async () => ({ ok: true });
    window.__alerts = []; window.__posted = [];
    const btn = document.getElementById("bulkOrganSubmit");
    btn.click();
    return { alerts: window.__alerts.length, posted: window.__posted.length,
             disabled: btn.disabled, label: btn.textContent,
             thanks: document.getElementById("bulkOrganThanks").innerText.trim(),
             credentials: window.__posted.map(x => !!x.credential) };
  });
  ok(after.alerts === 0, "no warning once he is signed in", after.alerts + " alerts");
  ok(after.posted === 3, "the same three structures go out, unchanged", after.posted + " posts");
  ok(after.credentials.every(Boolean), "each carrying his credential, as every report does");
  ok(after.disabled === true && after.label === "submitted",
     "NOW the button locks, because the work is actually done", after.label);
  ok(/3 structures logged across 2 cells/.test(after.thanks), "and it says what it did", after.thanks);

  console.log("\ngetting back to a live button");
  const rearm = await p.evaluate(() => {
    const btn = document.getElementById("bulkOrganSubmit");
    const states = [];
    document.getElementById("bulkOrganResolve").click();
    states.push(btn.disabled);
    btn.disabled = true;
    document.getElementById("bulkOrganKind").dispatchEvent(new Event("change", { bubbles: true }));
    states.push(btn.disabled);
    return states;
  });
  ok(rearm[0] === false, "'Find the cells' re-arms Submit");
  ok(rearm[1] === false, "...and so does changing the structure",
     "editing the link was the only way back before");

  console.log("\nthe backstop, if a loop ever slips past the gate");
  const backstop = await p.evaluate(() => {
    GOOGLE_VERIFIED = false; GOOGLE_CREDENTIAL = "";
    window.__alerts = [];
    /* Three direct calls, the way an ungated loop would make them. */
    const rets = [postReport({ type: "x" }), postReport({ type: "x" }), postReport({ type: "x" })];
    return { alerts: window.__alerts.length, rets };
  });
  ok(backstop.rets.every(r => r === false), "each call still refuses, individually");
  ok(backstop.alerts === 1, "but the same modal is raised ONCE, not three times",
     backstop.alerts + " alert(s) for 3 refusals");

  console.log("\nthe shared organelle form asks the same question");
  /* Read from disk rather than through the page: a file:// document cannot fetch its own sibling,
     and the assertion is about the source either way. */
  const panel = require("fs").readFileSync(require("./corepath.js")("panel.js"), "utf8");
  const gateAt = panel.indexOf("reportGateBlock");
  const disableAt = panel.indexOf('submitBtn.textContent="submitting');
  ok(gateAt >= 0, "core/panel.js's organelle form asks for the gate");
  ok(gateAt >= 0 && disableAt > gateAt,
     "...before it disables its own button, not after", "gate at " + gateAt + ", disable at " + disableAt);
  ok(/typeof reportGateBlock==="function"/.test(panel),
     "...and asks the PAGE for it, so the tools that lack one are unchanged",
     "the remaining gap, stated rather than assumed");

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("THREW: " + e.stack); process.exit(1); });
