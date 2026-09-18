/* The filtered cells bring their organelle outlines with them.                     2026-09-18

   Søren: *"In the filter and show, it should also be possible to select include organelles
   segmentations of a specific kind or all organelle segmentations for the filtered cells."* — and,
   asked where the switch should act, he chose the Neuroglancer "open all matches".

   Driven end to end on the real page: a real region filter, a real press of "Open all matches", and
   the URL that press hands to window.open decoded and read back. Everything before that — which
   cells matched, what the Excel would hold — must be untouched by it, which is why the layers are
   built beside the state rather than inside it.

   THE THING THAT WILL BE WRONG IF ANYTHING IS: which cells' outlines get in. A tracing is filed
   against a nucleus id OR a root id, whichever the tracer had, so matching on one of them alone
   silently drops half the dataset — and drops it in a way that looks like "nobody has traced these",
   which is the one wrong answer this feature must not give.

   Run: node filterorgansegcheck.js */
const { chromium } = require("playwright");
const page_ = require("./pagepath.js");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", e => { if (!/atob/.test(e.message)) errors.push(e.message); });
  p.on("dialog", d => d.accept().catch(() => {}));
  await p.route("**script.google.com/**", r => r.abort());
  await p.route("**accounts.google.com/**", r => r.abort());
  await p.route("**cdnjs.cloudflare.com/**", r => r.abort());
  await p.goto("file://" + page_("ujump.html"));
  await p.waitForTimeout(5000);

  console.log("the control is there, beside the points it is the other half of");
  {
    const c = await p.evaluate(() => {
      const sel = document.getElementById("filterOrganSeg");
      const pts = document.getElementById("filterOrganellesBox");
      return { sel: !!sel, opts: sel ? [].slice.call(sel.options).map(o => o.value) : [],
               beside: !!(sel && pts &&
                 (pts.compareDocumentPosition(sel) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
               off: sel ? sel.value : null };
    });
    ok(c.sel, "Filter and show has a traced-outlines picker");
    ok(c.beside, "...under the organelle points, which are the same organelles without a shape");
    ok(c.opts.join(",") === ",__all", "...offering none and all before it has asked anything",
       JSON.stringify(c.opts));
    ok(c.off === "", "...and off by default — it costs a Drive read per outline", JSON.stringify(c.off));
  }

  /* The dataset the whole check runs against. Two cells: one matched by NUCLEUS id and one only by
     ROOT id, which is the distinction that matters (see the header). */
  const stub = () => {
    const box = (cx, cy, s, z) => ({ z, points: [[cx-s,cy-s],[cx+s,cy-s],[cx+s,cy+s],[cx-s,cy+s]] });
    const geom = {
      m1: [box(1000, 2000, 100, 100), box(1000, 2000, 100, 105)],
      l1: [box(3000, 4000, 60, 200), box(3000, 4000, 60, 205)],
      m2: [box(5000, 6000, 80, 300), box(5000, 6000, 80, 305)]
    };
    window.__asked = [];
    const realFetch = window.fetch;
    window.fetch = async (u) => {
      const s = String(u);
      window.__asked.push(s);
      const m = /structureId=([^&]+)/.exec(s);
      if (m){
        const id = decodeURIComponent(m[1]);
        const rings = geom[id] || [];
        return { ok: true, json: async () => ({ tracings: [{ structureId: id,
          rows: rings.map((r, i) => ({ structureId: id, kind: id[0] === "m" ? "mitochondrion" : "lysosome",
            z: r.z, ringIndex: i, points: r.points.map(q => q.join(",")).join(";") })) }] }) };
      }
      if (/tracings=1/.test(s)) return { ok: true, json: async () => ({ tracings: [
        { structureId: "m1", name: "Mitochondrion 1", instanceOf: "mitochondrion",
          nucleusId: "__NUC__", rootId: "", color: "#40e28c" },
        { structureId: "l1", name: "Lysosome 1", instanceOf: "lysosome",
          nucleusId: "", rootId: "__ROOT__", color: "#9740e2" },
        { structureId: "m2", name: "Mitochondrion 1", instanceOf: "mitochondrion",
          nucleusId: "999999999", rootId: "999999999", color: "#40e28c" },
        { structureId: "c1", name: "Whole cell", instanceOf: "cell",
          nucleusId: "__NUC__", rootId: "", color: "#888888" }
      ] }) };
      if (/script\.google\.com/.test(s)) return { ok: true, json: async () => ({}) };
      return realFetch(u);
    };
  };

  const preview = async () => {
    await p.evaluate(() => {
      const t = document.querySelector('[data-tab="filter"]');
      if (t) t.click();
      const on = document.getElementById("filterRegionOn");
      if (on) { on.checked = true; on.dispatchEvent(new Event("change")); }
      const set = (c, v) => { const el = document.querySelector("#regionBoxes ." + c);
                              if (el) el.value = String(v); };
      ["rx1", "ry1", "rz1"].forEach(c => set(c, 0));
      ["rx2", "ry2", "rz2"].forEach(c => set(c, 99999999));
      const x = document.querySelector("#regionBoxes .rx1");
      if (x) x.dispatchEvent(new Event("input"));
      document.getElementById("filterRun").click();
    });
    await p.waitForTimeout(1200);
  };

  console.log("\nthe picker lists the kinds that have actually been outlined");
  {
    await p.evaluate(stub);
    const kinds = await p.evaluate(async () => {
      const sel = document.getElementById("filterOrganSeg");
      sel.dispatchEvent(new Event("focus"));
      await new Promise(r => setTimeout(r, 300));
      return [].slice.call(sel.options).map(o => o.value + "|" + o.textContent);
    });
    ok(kinds.length === 4, "two kinds, added to none and all", kinds.length + " options");
    ok(kinds.some(k => /^mitochondrion\|/.test(k)) && kinds.some(k => /^lysosome\|/.test(k)),
       "...the kinds in the index", kinds.slice(2).join(" / "));
    ok(!kinds.some(k => /^cell\|/.test(k)),
       "...and a traced CELL is not an organelle, so it is not one of them");
    ok(kinds.some(k => /\(2 outlined\)/.test(k)),
       "...each counted, in outlines, which is what the label says",
       kinds.find(k => /mitochondrion/.test(k)));
  }

  console.log("\nand the outlines of the matched cells reach the view");
  {
    await preview();
    /* lastResult lives in the filter card's closure, but the step-through was handed the same
       array, so the ids come from THERE -- from cells the filter actually matched, not from the
       first two cells in the file. Taking them from the file was this check's own first bug: cell
       index 3 is not in every preview, so the root-id tracing was filed against a cell that had
       not matched, and the feature was blamed for correctly leaving it out. */
    const ids = await p.evaluate(() => {
      const ms = (UJ.stepthrough.currentMatches && UJ.stepthrough.currentMatches()) || [];
      const out = [];
      for (let k = 0; k < ms.length && out.length < 2; k++){
        const row = ms[k].row;
        if (row.space !== "N") continue;
        const r = rootId(row.i);
        if (r) out.push({ nuc: String(NID[row.i]), root: String(r) });
      }
      return { matched: ms.length, ids: out };
    });
    ok(ids.matched > 2, "the preview matched a real set of cells", ids.matched + " matched");
    ok(ids.ids.length === 2, "...two of which have both ids to file tracings against",
       ids.ids.length);

    const opened = await p.evaluate(async ({ ids }) => {
      /* Re-stub with the REAL ids of two matched cells. */
      const box = (cx, cy, s, z) => ({ z, points: [[cx-s,cy-s],[cx+s,cy-s],[cx+s,cy+s],[cx-s,cy+s]] });
      const geom = { m1: [box(1000,2000,100,100), box(1000,2000,100,105)],
                     l1: [box(3000,4000,60,200), box(3000,4000,60,205)],
                     m2: [box(5000,6000,80,300), box(5000,6000,80,305)] };
      const asked = [];
      window.fetch = async (u) => {
        const s = String(u); asked.push(s);
        const m = /structureId=([^&]+)/.exec(s);
        if (m){
          const id = decodeURIComponent(m[1]); const rings = geom[id] || [];
          return { ok: true, json: async () => ({ tracings: [{ structureId: id,
            rows: rings.map((r, i) => ({ structureId: id,
              kind: id[0] === "m" ? "mitochondrion" : "lysosome",
              z: r.z, ringIndex: i, points: r.points.map(q => q.join(",")).join(";") })) }] }) };
        }
        if (/tracings=1/.test(s)) return { ok: true, json: async () => ({ tracings: [
          { structureId: "m1", instanceOf: "mitochondrion", nucleusId: ids[0].nuc, rootId: "",
            color: "#40e28c" },
          /* ONLY a root id -- matching on nucleusId alone would drop this one silently. */
          { structureId: "l1", instanceOf: "lysosome", nucleusId: "", rootId: ids[1].root,
            color: "#9740e2" },
          /* Neither id is any matched cell's. */
          { structureId: "m2", instanceOf: "mitochondrion", nucleusId: "999999999",
            rootId: "999999999", color: "#40e28c" },
          { structureId: "c1", instanceOf: "cell", nucleusId: ids[0].nuc, rootId: "",
            color: "#888888" }
        ] }) };
        return { ok: true, json: async () => ({}) };
      };
      const urls = [];
      const realOpen = window.open;
      window.open = (u) => { urls.push(u); return null; };
      document.getElementById("filterOrganSeg").value = "__all";
      document.getElementById("filterViewerAll").click();
      for (let i = 0; i < 100 && !urls.length; i++) await new Promise(r => setTimeout(r, 100));
      window.open = realOpen;
      if (!urls.length) return { err: "nothing opened" };
      const st = JSON.parse(decodeURIComponent(urls[0].split("#!")[1]));
      const traced = (st.layers || []).filter(l => /^traced /.test(String(l.name || "")));
      return { layers: traced.map(l => l.name),
               colours: traced.map(l => l.annotationColor),
               types: traced.map(l => (l.annotations[0] || {}).type),
               counts: traced.map(l => l.annotations.length),
               readIds: asked.filter(a => /structureId=/.test(a))
                             .map(a => decodeURIComponent(/structureId=([^&]+)/.exec(a)[1])),
               otherLayers: (st.layers || []).filter(l => !/^traced /.test(String(l.name || ""))).length };
    }, { ids: ids.ids });

    ok(!opened.err, "the button opens a view", opened.err || "opened");
    ok(opened.readIds.indexOf("m1") >= 0,
       "an outline filed against a MATCHED CELL'S NUCLEUS ID is read", opened.readIds.join(", "));
    ok(opened.readIds.indexOf("l1") >= 0,
       "...and so is one filed against a matched cell's ROOT ID — a tracing carries whichever the "
       + "tracer had, and matching on one alone drops half the dataset while looking like nobody "
       + "traced them", opened.readIds.join(", "));
    ok(opened.readIds.indexOf("m2") < 0,
       "...while another cell's outline is left where it belongs", "m2 not read");
    ok(opened.readIds.indexOf("c1") < 0,
       "...and a traced CELL is not an organelle", "c1 not read");
    ok(opened.layers.length === 2,
       "ONE LAYER PER KIND, not per outline — a filter can match hundreds",
       opened.layers.join(" | "));
    ok(opened.layers.some(n => /mitochondrion \(1\)/i.test(n)) &&
       opened.layers.some(n => /lysosome \(1\)/i.test(n)),
       "...named for the kind, and how many of it are in there", opened.layers.join(" | "));
    ok(opened.colours.join(",").toLowerCase().indexOf("#40e28c") >= 0,
       "...in the colour it was drawn in", opened.colours.join(" / "));
    ok(opened.types.every(t => t === "line"),
       "...as line annotations, which every viewer can draw", opened.types.join(","));
    ok(opened.counts.every(n => n === 8),
       "...one closed loop per contour: two squares of four sides each", opened.counts.join(" / "));
    ok(opened.otherLayers > 0,
       "and the cells themselves are still in the view — this adds, it does not replace",
       opened.otherLayers + " other layers");
  }

  console.log("\nnone means none");
  {
    const off = await p.evaluate(async () => {
      const asked = [];
      const prev = window.fetch;
      window.fetch = async (u) => { asked.push(String(u)); return prev(u); };
      const urls = [];
      const realOpen = window.open;
      window.open = (u) => { urls.push(u); return null; };
      document.getElementById("filterOrganSeg").value = "";
      document.getElementById("filterViewerAll").click();
      for (let i = 0; i < 100 && !urls.length; i++) await new Promise(r => setTimeout(r, 100));
      window.open = realOpen;
      const st = urls.length ? JSON.parse(decodeURIComponent(urls[0].split("#!")[1])) : { layers: [] };
      return { traced: (st.layers || []).filter(l => /^traced /.test(String(l.name || ""))).length,
               reads: asked.filter(a => /structureId=/.test(a)).length };
    });
    ok(off.traced === 0, "with the picker off, no outline layers", off.traced);
    ok(off.reads === 0, "...and not one Drive file read for them", off.reads + " reads");
  }

  ok(errors.length === 0, "no script errors", errors.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
