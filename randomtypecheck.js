/* The random-example picker keeps the type somebody chose.                         2026-09-18

   Søren: *"When having pressed random cell, it switches back to l2/3 pyramidal neuron. It should
   stay on the selected cell type. It used to work fine."*

   THE THING THAT WILL BE WRONG IF ANYTHING IS the gap between choosing and rebuilding.
   populateRandomTypeSelect() is async and awaits two whole-sheet backend reads before it reaches
   its innerHTML assignment, so the selection has to be read INSIDE the function, one statement
   before the assignment. A version that reads it at the top of the function passes a naive check
   and still loses a type chosen while the fetches were in flight — which is the real case, since
   the two calls that bite are the fire-and-forget ones at page load. So this check chooses a type
   DURING the await, not before the call.

   Run: node randomtypecheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

const PAGES = ["ujump.html", "djump.html", "pjump.html"];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  for (const file of PAGES) {
    console.log("\n" + file);
    const p = await b.newPage();
    const errors = [];
    p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
    p.on("dialog", d => d.accept().catch(() => {}));
    await p.route("**script.google.com/**", r => r.abort());
    await p.route("**accounts.google.com/**", r => r.abort());
    await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
    await p.goto("file://" + page_(file));
    await p.waitForTimeout(6000);

    const present = await p.evaluate(() => ({
      sel: !!document.getElementById("randomTypeSelect"),
      fn: typeof populateRandomTypeSelect === "function",
      n: (document.getElementById("randomTypeSelect") || { options: [] }).options.length
    }));
    ok(present.sel && present.fn, "the picker and its builder are both here");
    ok(present.n > 2, "...with a list worth keeping a place in", present.n + " options");
    if (!present.sel || !present.fn || present.n < 3) { await p.close(); continue; }

    /* A type that is NOT the first option — the first is what a lost selection falls back to, so
       asserting against it would pass on a page that had no memory at all. */
    const chosen = await p.evaluate(() => {
      const s = document.getElementById("randomTypeSelect");
      const live = [].slice.call(s.options).filter(o => !o.disabled);
      const pick = live[Math.min(5, live.length - 1)];
      return { value: pick.value, label: pick.textContent, first: s.options[0].value };
    });
    ok(chosen.value !== chosen.first, "a type other than the one it falls back to", chosen.label);

    /* 1. The plain case: chosen, then rebuilt. */
    const plain = await p.evaluate(async (want) => {
      const s = document.getElementById("randomTypeSelect");
      s.value = want;
      await populateRandomTypeSelect();
      return { value: s.value, n: s.options.length };
    }, chosen.value);
    ok(plain.value === chosen.value, "a rebuild leaves the chosen type where it was",
       plain.value.split("|")[0]);

    /* 2. THE REAL CASE. Chosen DURING the rebuild's own awaits, which is when the two calls at page
          load actually land: the person reaches the control while two whole-sheet reads are still
          in flight. A fix that read the value at the top of the function would fail here. */
    const raced = await p.evaluate(async (want) => {
      const s = document.getElementById("randomTypeSelect");
      s.selectedIndex = 0;                      // start where a lost selection would end up
      const pending = populateRandomTypeSelect();
      await new Promise(r => setTimeout(r, 0)); // the function is now past its first await
      s.value = want;                           // ...and the person chooses
      await pending;
      return { value: s.value };
    }, chosen.value);
    ok(raced.value === chosen.value,
       "...and so does one chosen WHILE the rebuild was waiting on the backend",
       raced.value.split("|")[0]);

    /* 3. It is the picker's memory, not a hardcoded index: a second, different type behaves the
          same, and the value is read back off the DOM rather than from a variable we set. */
    const second = await p.evaluate(async () => {
      const s = document.getElementById("randomTypeSelect");
      const live = [].slice.call(s.options).filter(o => !o.disabled);
      const other = live[live.length - 1];
      s.value = other.value;
      await populateRandomTypeSelect();
      const now = s.options[s.selectedIndex];
      return { want: other.value, got: s.value, label: now ? now.textContent : "" };
    });
    ok(second.got === second.want, "...for any type, not one remembered index", second.label);

    /* 4. The counts still rebuild — this must preserve the SELECTION, not freeze the list. A
          picker that kept its options would go on offering a pool the community has emptied. */
    const fresh = await p.evaluate(async () => {
      const s = document.getElementById("randomTypeSelect");
      const before = s.options[0].textContent;
      s.options[0].textContent = "TAMPERED";
      await populateRandomTypeSelect();
      return { rebuilt: s.options[0].textContent !== "TAMPERED", before, now: s.options[0].textContent };
    });
    ok(fresh.rebuilt, "...while the list itself is still rebuilt, so the counts stay honest",
       fresh.now);

    /* 5. A chosen type whose pool no longer exists must not throw or leave a phantom value.
          "The first option" is not the assertion: a select skips DISABLED options when it picks
          its own default, and δJump's list opens on a type with no examples in that dataset, so it
          lands on index 1. What matters is that the picker ends up on a real, selectable option
          rather than at selectedIndex -1, where "Random example" would read an empty value and do
          nothing with no explanation. */
    const gone = await p.evaluate(async () => {
      const s = document.getElementById("randomTypeSelect");
      s.value = "";                              // no such option
      await populateRandomTypeSelect();
      const cur = s.options[s.selectedIndex];
      return { value: s.value, idx: s.selectedIndex,
               real: !!cur && cur.value === s.value, disabled: !!cur && cur.disabled,
               label: cur ? cur.textContent : "(nothing selected)" };
    });
    ok(gone.idx >= 0 && gone.real && !gone.disabled,
       "a type that has vanished falls back to a real selectable option, quietly", gone.label);

    /* 6. The call site that used to carry the selection BY HAND. ensureCommunityOverride() read the
          value before calling and wrote it back after — which protected that one path, and, once
          the rebuild kept its own selection, would have undone it: it forces back a pre-await
          value over a type chosen while two whole-sheet reads were in flight. The hand-carry is
          gone; this is what proves it does not come back. */
    const viaOverride = await p.evaluate(async (want) => {
      if (typeof window.ensureCommunityOverride !== "function") return { skip: true };
      const s = document.getElementById("randomTypeSelect");
      s.selectedIndex = 0;
      const pending = window.ensureCommunityOverride();
      await new Promise(r => setTimeout(r, 0));
      s.value = want;
      await pending;
      await new Promise(r => setTimeout(r, 400));   // its populate is fire-and-forget inside
      return { value: s.value };
    }, chosen.value);
    ok(viaOverride.skip || viaOverride.value === chosen.value,
       "...and through ensureCommunityOverride, which no longer forces back a stale value",
       viaOverride.skip ? "not on this page" : viaOverride.value.split("|")[0]);

    ok(errors.length === 0, "no script errors", errors.slice(0, 3).join(" | ") || "none");
    await p.close();
  }

  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
