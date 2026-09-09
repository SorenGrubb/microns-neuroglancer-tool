/* Lift one function's REAL text out of a tool page, so a check drives what ships.   2026-09-05

   The pages are 5–8 MB and every interesting function sits inside a <script> tag with a hundred
   dependencies it does not need for the claim under test. The choices were: load the whole page in
   jsdom (slow, and half these functions never run there — mesh3d bails without WebGL, which is how
   the compute-volume bug hid from every check for a week), or retype the function into the check
   (which then passes forever while the page changes underneath it).

   This is the third option: read the shipped file, cut out the named function verbatim, and run
   THAT against stubs. If somebody edits the page, the check runs the edit. If somebody deletes the
   function, the check fails loudly at extraction rather than quietly testing nothing.

   Brace-matched, not regex-terminated, and string/comment-aware — several of these functions
   contain "}" inside a string or a regex literal, and a naive scan stops in the middle of one.

   Usage:  const { fnText } = require("./pagefn.js");
           vm.runInContext(fnText("djump.html", "groupedDotChart"), ctx);  */
const fs = require("fs");
const page_ = require("./pagepath.js");

const CACHE = {};
function source(file) {
  if (!CACHE[file]) CACHE[file] = fs.readFileSync(page_(file), "utf8");
  return CACHE[file];
}

/* Walks from the opening "{" to its match, skipping over '…', "…", `…`, /*…*​/, //… and regex
   literals. Regex vs. division is decided the usual cheap way: a "/" is a regex only when the last
   significant character was one that cannot end an expression. */
function matchBrace(s, open) {
  let depth = 0, i = open, prev = "";
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; i++; }
      i++; prev = q; continue;
    }
    if (c === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i + 2); i = (i < 0 ? s.length : i + 2); continue; }
    if (c === "/" && s[i + 1] === "/") { i = s.indexOf("\n", i); i = (i < 0 ? s.length : i); continue; }
    if (c === "/" && !/[\w$)\]]/.test(prev)) {
      i++;
      let inClass = false;
      while (i < s.length) {
        if (s[i] === "\\") { i += 2; continue; }
        if (s[i] === "[") inClass = true;
        else if (s[i] === "]") inClass = false;
        else if (s[i] === "/" && !inClass) break;
        else if (s[i] === "\n") break;   /* not a regex after all; bail rather than run away */
        i++;
      }
      i++; prev = "/"; continue;
    }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) return i + 1; }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  throw new Error("unbalanced braces from offset " + open);
}

/* One function declaration, verbatim, including a `const NAME=` form.

   Also finds the ASSIGNED form -- `window.NAME = function(...)`, `const NAME = (a,b) =>`, and so
   on -- because several of the most-worth-checking functions on these pages are exported onto
   window rather than declared (buildTypeCheckboxesInto, buildFilterTypeCheckboxes). The returned
   text is rewritten to a plain `function NAME(...)` declaration so a check can drop it into a vm
   context and call it by name without also having to stub `window`. Declarations are tried first,
   so nothing that worked before resolves differently now. */
function fnText(file, name) {
  const s = source(file);
  const decl = new RegExp("(?:^|\\n)\\s*(?:async\\s+)?function\\s+" + name + "\\s*\\(");
  const m = decl.exec(s);
  if (m) {
    const start = m.index + (m[0][0] === "\n" ? 1 : 0);
    const open = s.indexOf("{", m.index + m[0].length - 1);
    return s.slice(start, matchBrace(s, open));
  }
  const asg = new RegExp("(?:^|\\n)\\s*(?:window\\.|const\\s+|let\\s+|var\\s+)?" + name
                         + "\\s*=\\s*(?:async\\s+)?(?:function\\s*)?\\(([^)]*)\\)\\s*(?:=>\\s*)?\\{");
  const a = asg.exec(s);
  if (!a) throw new Error(file + ": no function " + name);
  const open = s.indexOf("{", a.index + a[0].length - 1);
  return "function " + name + "(" + a[1] + ")" + s.slice(open, matchBrace(s, open));
}

/* One `const NAME=<literal>;` line, verbatim. For the small shared tables (MIN_DOTS_TO_PLOT,
   TIGHT_BOX_LAYOUT) a check would otherwise have to hard-code — which is the number under test. */
function constText(file, name) {
  const s = source(file);
  const m = new RegExp("(?:^|\\n)\\s*const\\s+" + name + "\\s*=").exec(s);
  if (!m) throw new Error(file + ": no const " + name);
  let i = m.index + m[0].length, depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === '"' || c === "'") { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; i++; } }
    else if (c === ";" && depth <= 0) return s.slice(m.index, i + 1).trim();
    i++;
  }
  throw new Error(file + ": unterminated const " + name);
}

module.exports = { fnText, constText, source };
