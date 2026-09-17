/* 97% is not a hang — the stages after the decode loop say so, and finish unwatched.  2026-09-17

   Søren, µJump nucleus 264317, the moment the cached-"not found" fix let the cell actually try both
   its root IDs: *"Now it is hanging at 97%"*, button reading `decoding… (fragment 2/2) 97%`.

   97% is an exact number and it names the stall. fetchCombinedMesh scales each candidate's own
   progress into (idx+frac)/n; with two candidates and the second one's decode loop at its last tick
   (0.6 + 0.35*(i/nF), just under 0.95) the total is (1+0.95)/2 = 0.975. So the page reached the END
   of the second decode loop — and then did three more synchronous stages in silence: assembling the
   flat arrays, merging the two meshes, and summing every triangle.

   And the decode loops yielded with `await new Promise(requestAnimationFrame)`, which in a
   BACKGROUND TAB never resolves. That is not slow, it is stopped.

   This suite measures the two claims that matter: the chunked volume sum returns exactly what the
   one-tick sum returned, and the whole thing completes with no requestAnimationFrame in the window
   at all — which is what the old code could not do (it would have thrown on `new Promise(undefined)`).

   Run: node meshprogresscheck.js */
const fs = require("fs"), { JSDOM } = require("jsdom");

let fails = 0;
const ok = (c, what, d) => {
  console.log((c ? "  ok   " : "  FAIL ") + what + (d !== undefined ? "  <- " + d : ""));
  if (!c) fails++;
};

function load(withRaf){
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://grubblab.com/" });
  const w = dom.window;
  w.UJ = { cfg: { volume: {}, mesh: {} } };
  w.URL.createObjectURL = () => "blob:stub";
  w.URL.revokeObjectURL = () => {};
  /* THE WHOLE POINT of withRaf=false: a hidden tab is a window where requestAnimationFrame never
     calls back. jsdom's is close enough — remove it and any code that depends on it stops dead. */
  if (!withRaf) { delete w.requestAnimationFrame; w.requestAnimationFrame = undefined; }
  w.eval(fs.readFileSync("core/mesh.js", "utf8"));
  return { w, M: w.UJ.mesh };
}

/* A closed cube of side `s` µm: volume s³ exactly, by hand, whatever the triangle count. Subdivided
   so the mesh can be made big enough to cross the chunk boundary without inventing a shape whose
   answer nobody knows. `n` is the subdivision per edge; triangles = 12n². */
function cube(s, n){
  const V = [], T = [], key = new Map();
  const at = (x, y, z) => {
    const k = x + "," + y + "," + z;
    if (key.has(k)) return key.get(k);
    const i = V.length / 3; V.push(x * s, y * s, z * s); key.set(k, i); return i;
  };
  const face = (o, u, v, flip) => {
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++){
      const p = (i, j) => at(o[0] + u[0]*(a+i)/n + v[0]*(b+j)/n,
                             o[1] + u[1]*(a+i)/n + v[1]*(b+j)/n,
                             o[2] + u[2]*(a+i)/n + v[2]*(b+j)/n);
      const q0 = p(0,0), q1 = p(1,0), q2 = p(1,1), q3 = p(0,1);
      if (flip) { T.push(q0,q2,q1, q0,q3,q2); } else { T.push(q0,q1,q2, q0,q2,q3); }
    }
  };
  face([0,0,0],[1,0,0],[0,1,0], true);    // z = 0, outward is -z
  face([0,0,1],[1,0,0],[0,1,0], false);   // z = 1
  face([0,0,0],[0,1,0],[0,0,1], true);    // x = 0
  face([1,0,0],[0,1,0],[0,0,1], false);   // x = 1
  face([0,0,0],[1,0,0],[0,0,1], false);   // y = 0
  face([0,1,0],[1,0,0],[0,0,1], true);    // y = 1
  return { positions: new Float32Array(V), indices: new Uint32Array(T) };
}

(async () => {
  console.log("the module still loads, and says what it exports");
  const { w, M } = load(true);
  ok(typeof M.volumeOf === "function", "volumeOf is still there for the callers that want it now");
  ok(typeof M.volumeOfProgressive === "function", "volumeOfProgressive is exported");
  ["downloadRoot", "downloadRootPptx", "computeVolume", "fetchCombinedMesh",
   "clearMeshNotFoundCache", "forgetRootNotFound", "currentFragmentCount", "saveGlb", "savePptx",
   "buildGLB"].forEach(n =>
    ok(typeof M[n] === "function", "...and UJ.mesh." + n + " survives the split"));

  console.log("\nthe chunked sum is the same sum");
  {
    /* Small: one chunk, so this is the "did splitting the function break the arithmetic" case. */
    const c = cube(2, 1);
    const sync = M.volumeOf(c);
    const prog = await M.volumeOfProgressive(c, () => {});
    ok(Math.abs(sync.volumeUm3 - 8) < 1e-4, "a 2 µm cube is 8 µm³ by hand", sync.volumeUm3.toFixed(6));
    ok(prog.volumeUm3 === sync.volumeUm3, "...and the chunked sum returns the identical double",
       prog.volumeUm3.toFixed(12));
    ok(prog.vertices === sync.vertices, "...and the same vertex count", prog.vertices);
  }
  {
    /* Big enough to cross the million-triangle chunk boundary several times: 12 * 300² = 1,080,000
       triangles per... no — 12 * 600² = 4,320,000, so four chunks and three seams. The seams are
       the only thing chunking can get wrong. */
    const c = cube(3, 600);
    const tris = c.indices.length / 3;
    const sync = M.volumeOf(c);
    const seen = [];
    const prog = await M.volumeOfProgressive(c, (f, m) => seen.push([f, m]));
    ok(tris > 4e6, "a mesh big enough to be chunked", tris.toLocaleString() + " triangles");
    ok(Math.abs(sync.volumeUm3 - 27) < 1e-2, "a 3 µm cube is 27 µm³ by hand", sync.volumeUm3.toFixed(4));
    ok(Math.abs(prog.volumeUm3 - sync.volumeUm3) < 1e-9,
       "the chunked sum agrees across every seam", (prog.volumeUm3 - sync.volumeUm3).toExponential(2));
    ok(seen.length >= 4, "...and it reported progress while it did it", seen.length + " updates");
    ok(seen.every(s => /measuring/.test(s[1]) && /triangle/.test(s[1])),
       "...saying which stage it is in, not just a number", JSON.stringify(seen[0][1]));
    ok(seen[seen.length - 1][0] <= 1 && seen[seen.length - 1][0] > 0.99,
       "...ending at the top of its range", seen[seen.length - 1][0].toFixed(4));
    ok(seen.every((s, i) => i === 0 || s[0] >= seen[i-1][0]), "...and never going backwards");
  }

  console.log("\nit finishes in a tab nobody is looking at");
  {
    const { w: w2, M: M2 } = load(false);
    ok(typeof w2.requestAnimationFrame !== "function",
       "the window has no requestAnimationFrame, the way a hidden tab effectively has none");
    const c = cube(3, 600);
    /* The old code's yield was `new Promise(requestAnimationFrame)`. With rAF undefined that throws
       TypeError synchronously; in a real background tab it simply never calls back. Either way the
       work does not finish. This is the assertion the whole change exists for. */
    let done = false, err = null;
    const t0 = Date.now();
    await Promise.race([
      M2.volumeOfProgressive(c, () => {}).then(v => { done = v; }, e => { err = e; }),
      new Promise(r => setTimeout(r, 20000))
    ]);
    ok(!err, "no error from the yield", err && String(err.message));
    ok(done && Math.abs(done.volumeUm3 - 27) < 1e-2,
       "the volume still arrives, unwatched", done ? done.volumeUm3.toFixed(4) : "(never resolved)");
    ok(Date.now() - t0 < 20000, "...and within the time allowed", (Date.now() - t0) + " ms");
  }

  /* ── THE STAGES THAT NEED A REAL MESH TO RUN ──────────────────────────────────────────────────
     The assembly, the multi-mesh merge and the decode loops cannot be reached without a sharded
     Draco mesh over the network, which this sandbox cannot fetch. What CAN be checked without one
     is that each of them still announces itself — cheap, and it catches the regeneration that drops
     a line. Named for what it is: a guard, not a measurement. */
  console.log("\nevery stage after the decode loop announces itself (source guard)");
  {
    const srcRaw = fs.readFileSync("core/mesh.js", "utf8");
    /* Comments stripped before the last two assertions: the comment explaining WHY the bare rAF
       yield had to go naturally contains the very text that assertion looks for, and a check that
       fails because the change was documented is a check that teaches people not to document. */
    const src = srcRaw.replace(/\/\*[\s\S]*?\*\//g, "");
    ok(/onProgress&&onProgress\(0\.95,"assembling "/.test(src),
       "the per-mesh assembly says “assembling N vertices”");
    ok(/onProgress&&onProgress\(0\.96,"combining "/.test(src),
       "the multi-mesh merge says “combining N meshes”");
    ok(/"combining…"/.test(src), "...and keeps saying it while the re-offset pass runs");
    ok(src.indexOf("new Promise(requestAnimationFrame)") < 0,
       "and no bare requestAnimationFrame yield is left anywhere");
    ok((src.match(/await breathe\(\)/g) || []).length >= 5,
       "every long loop breathes", (src.match(/await breathe\(\)/g) || []).length + " yields");
  }

  console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
