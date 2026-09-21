/* The computed volume reaches the row it is meant for, 3D panel or not.          2026-09-04

   Søren: "when I press compute volume, it does not show the volume although the button
   disappears after it is done calculating."

   The click handler and decorateMeshVolButtons() both took `rowEl.nextElementSibling` and tested
   it for .volrow. True when written -- the markup emits the two adjacent -- and false since
   core/mesh3d.js began inserting its canvas host after the row the "Show in 3D" button sits in.
   Measured on the live page before anything was edited:

       idrow  ->  m3d-host  ->  idrow volrow

   volEl was null, the handler hides the button one line earlier regardless, and the number was
   computed, saved and written nowhere.

   THIS CHECK EXISTS BECAUSE THE OLD ONES COULD NOT SEE IT. jsdom has no WebGL, mesh3d bails, no
   host is inserted, and the adjacency the code assumed still held — so every existing check
   passed on a page that was visibly broken in a browser. The fix for that is not "run everything
   in a real browser"; it is to reproduce, here, the one DOM change the real browser makes. The
   simulation is checked against mesh3d.js's own source below, so it cannot quietly stop matching
   what the real thing does.

   Run: node volrowcheck.js */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const core = require("./corepath.js");
const page = require("./pagepath.js");

const R = [];
const ok = (n, c, d) => { R.push(!!c); console.log((c ? "PASS " : "*** FAIL *** ") + n
                                                   + (d !== undefined ? "  <- " + d : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* THE SIMULATION IS ONLY HONEST IF IT STILL MATCHES. mesh3d.js decides where the host goes; if
   that ever changes, this check must be told rather than left quietly testing a layout the
   browser no longer produces. */
const M3D = fs.readFileSync(core("mesh3d.js"), "utf8");
ok("mesh3d still inserts its host AFTER the button's row",
   /host\.className = "m3d-host"/.test(M3D)
   && /row\.parentNode\.insertBefore\(host, row\.nextSibling\)/.test(M3D),
   "which is why the volume row is not the next sibling in a real browser");

(async () => {
  for (const file of ["ujump.html", "djump.html", "pjump.html"]){
    console.log("\n--- " + file + " ---");
    let html = fs.readFileSync(page(file), "utf8");
    html = html.replace(/<script src="(core\/[A-Za-z0-9_.\-]+\.js)"><\/script>/g, (m, rel) => {
      try { return "<script>\n" + fs.readFileSync(core(rel.slice(5)), "utf8") + "\n</script>"; }
      catch (e) { return m; }
    });

    const dom = new JSDOM(html, { runScripts:"dangerously", url:"https://grubblab.com/" + file,
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
      beforeParse(w){
        w.open = () => null; w.alert = () => {};
        w.fetch = () => w.Promise.resolve({ ok:true, status:200, type:"cors",
          json: () => w.Promise.resolve({}), text: () => w.Promise.resolve("{}") });
      } });
    const w = dom.window;
    await sleep(1200);

    const ev = s => { try { return w.eval(s); } catch (e){ return "ERR:" + e.message; } };
    ev("showNucleus([NX[0],NY[0],NZ[0]])");
    await sleep(300);

    const btn = w.document.querySelector("#cellPanelCard .meshvol");
    ok("the panel has a compute button", !!btn, btn ? btn.textContent : "(none)");
    if (!btn) continue;
    const rowEl = btn.closest(".idrow");

    /* WHAT THE BROWSER DOES AND JSDOM MOSTLY DOES NOT. One node, in the one place mesh3d.js puts
       it -- unless mesh3d already managed to decorate this page here, which it does on πJump and
       not on the other two. Adding a second host would be testing a layout no browser produces,
       so only insert when there is none. */
    let host = rowEl.nextElementSibling;
    let simulated = false;
    if (!host || !host.classList.contains("m3d-host")){
      host = w.document.createElement("div");
      host.className = "m3d-host";
      rowEl.parentNode.insertBefore(host, rowEl.nextSibling);
      simulated = true;
    }
    ok("...and the 3D host sits between it and the volume row",
       rowEl.nextElementSibling === host
       && host.nextElementSibling && host.nextElementSibling.classList.contains("volrow"),
       "idrow -> m3d-host -> idrow volrow, as measured on grubblab.com"
       + (simulated ? "  (host simulated here)" : "  (mesh3d inserted it itself)"));

    ok("volRowFor still finds it", w.volRowFor(rowEl) === host.nextElementSibling,
       "the whole bug in one assertion");

    w.eval("MeshDL.computeVolume=function(id,prog){prog&&prog(0.5,'x');"
         + "return Promise.resolve({volumeUm3:1234.5,vertices:9876,fragmentCount:1,rootIds:['1']});};");
    btn.dispatchEvent(new w.Event("click", { bubbles:true }));
    await sleep(200);

    const volrow = w.document.querySelector("#cellPanelCard .volrow");
    ok("the volume is on screen after a compute",
       volrow.style.display === "flex" && /1,235/.test(volrow.textContent),
       volrow.style.display + " · " + volrow.textContent.trim());
    /* Since 2026-09-09 a compute that was not saved keeps its button, as "Save volume" -- this
       check runs signed out, so that is the case here. A saved one hides it, as it always did. */
    const unsaved = /not saved/.test(volrow.textContent);
    ok(unsaved ? "...and, not saved, the button stays and offers to save it"
               : "...and, saved, the button is gone",
       unsaved ? (btn.style.display !== "none" && /Save volume/.test(btn.textContent))
               : btn.style.display === "none",
       (unsaved ? "not saved" : "saved") + " · button " + (btn.style.display || "shown")
       + " · \u201c" + btn.textContent.trim() + "\u201d");

    /* AND IT MUST NOT REACH TOO FAR. These panels carry several root-ID rows, each with its own
       volume row; a number written into a different cell's row is worse than none. */
    console.log("  it stops rather than guessing");
    const stray = w.document.createElement("div");
    stray.className = "idrow";
    const lonely = w.document.createElement("div");
    lonely.className = "idrow";
    const other = w.document.createElement("div");
    other.className = "idrow volrow";
    const holder = w.document.createElement("div");
    holder.appendChild(lonely); holder.appendChild(other);
    ok("a volume row behind another ordinary row is not taken",
       w.volRowFor(lonely) === other && w.volRowFor(stray) === null,
       "the first is this row's own; the second has nothing after it at all");
    const withBtn = w.document.createElement("div");
    withBtn.className = "idrow";
    const nextCell = w.document.createElement("div");
    nextCell.className = "idrow";
    nextCell.innerHTML = '<button class="meshvol"></button>';
    const nextCellVol = w.document.createElement("div");
    nextCellVol.className = "idrow volrow";
    const holder2 = w.document.createElement("div");
    holder2.appendChild(withBtn); holder2.appendChild(nextCell); holder2.appendChild(nextCellVol);
    ok("...nor one belonging to the next cell's button", w.volRowFor(withBtn) === null,
       "a number in somebody else's row is worse than a number nowhere");

    /* decorateMeshVolButtons had the identical expression, which is why an ALREADY-SAVED volume
       never showed either and the button kept offering "Compute volume". */
    console.log("  a volume saved earlier");
    const btn2 = w.document.querySelector("#cellPanelCard .meshvol");
    btn2.style.display = ""; btn2.dataset.volFresh = ""; btn2.disabled = false;
    const key = btn2.dataset.root || ("nuc:" + btn2.dataset.nucid);
    w.eval("window._computedVolumesMap={};");
    w._computedVolumesMap[key] = { volumeUm3: 4321.5, nucVolumeUm3: 0, cellType: "t",
                                   fragmentCount: 1, timestamp: "2026-09-01T00:00:00Z" };
    const vr = w.volRowFor(btn2.closest(".idrow"));
    vr.style.display = "none";
    vr.querySelector(".idval").textContent = "—";
    w.decorateMeshVolButtons();
    ok("...is shown without clicking anything",
       vr.style.display === "flex" && /4,322/.test(vr.textContent),
       vr.style.display + " · " + vr.textContent.trim()
       + "  <- half of \"nothing appears in the master cell list\" was this");
  }

  const bad = R.filter(x => !x).length;
  console.log(bad ? `\n*** ${bad} of ${R.length} FAILED ***`
                  : `\nRESULT: ALL ${R.length} CHECKS PASSED`);
  process.exit(bad ? 1 : 0);
})();
