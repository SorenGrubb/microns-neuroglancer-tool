/* core/volumes.js — which imaged volume a coordinate is in, and what to read it from.  2026-10-03

   Søren: *"We should enable EM section, meshes and 3D structure also for minnie35 data."*

   MICrONS publishes the minnie block as TWO imaged volumes. minnie65 is the one everything here
   has ever read: segmentation, nucleus detection, cell types, meshes. minnie35 sits BELOW it in z
   and has its own EM and its own segmentation — a different segmentation, not a continuation of
   the same one — and no nucleus detection at all. A cell in VISlm is mostly down there, which is
   why µJump's area filter has always said "mostly in subvolume 35" beside that checkbox and then
   had nothing to show anybody who went looking.

   THE RULE ALREADY EXISTED AND WAS ALREADY RIGHT. core/jumplink.js has resolved a pasted
   coordinate to one of the two volumes since the Discussion was built, and window.jumpLinkHost()
   has listed both with their boxes and their sources since the same day. What it did not do is
   reach the pad, the cell card's EM plane, the mesh fetch or the EM preview, each of which went
   straight to minnie65's SRC and drew nothing out here.

   So this file is that one list and that one containment test, moved to where everything can ask.
   It is NOT a second copy of them: core/jumplink.js now asks this module, and jumplinkcheck.js is
   what proves the answer did not change in the move.

   PRIORITY ORDER SETTLES THE SEAM, and it has to be settled by something. The two slabs touch —
   minnie65's imagery starts at section 14,816 and minnie35's runs to 14,860, so forty-four
   sections are inside both — and a point there is reported as minnie65, the volume with
   segmentation, nuclei and cell types over it. First match in list order wins; the list is in the
   order a host declares it.

   WHAT A VOLUME IS
     { key:   "minnie65"         an id that is written into stored rows, so it must not change
       label: "minnie65"         what a person is shown
       bb:    {xmin..zmax}       IN NANOMETRES
       em:    "precomputed://…"  imagery
       seg:   "precomputed://…"  segmentation, or "" where there is none
       nuc:   "precomputed://…"  nucleus segmentation, or absent where there is no detection
       mesh:  "precomputed://…"  the mesh store, or absent }

   `nuc` IS ABSENT RATHER THAN EMPTY on minnie35, and the difference matters: an empty nuclei layer
   out there would look like a dataset with nothing in it rather than like a dataset nobody has run
   a nucleus detector over.

   Run: node volumescheck.js */
var UJ = UJ || {};
UJ.volumes = (function(){
  "use strict";

  var LIST = [];

  /* Declared once by the page, in priority order. Copied rather than held by reference, so a host
     that rebuilds its array later does not silently change what this answered a moment ago. */
  function configure(list){
    LIST = (list || []).filter(function(v){ return v && v.key; }).map(function(v){
      return { key: String(v.key), label: v.label || String(v.key), bb: v.bb || null,
               em: v.em || "", seg: v.seg || "", nuc: v.nuc || "",
               /* PASSED THROUGH, not normalised: minnie65's mesh store needs a base, a CORS
                  fallback base and a suffix, and core/mesh.js already knows that shape. This
                  module's job is to say WHICH volume, not to have an opinion about what a mesh
                  configuration looks like. */
               mesh: v.mesh || null };
    });
    return all();
  }
  function all(){ return LIST.slice(); }
  function count(){ return LIST.length; }
  function byKey(k){
    var want = String(k || "");
    for (var i = 0; i < LIST.length; i++) if (LIST[i].key === want) return LIST[i];
    return null;
  }
  /* The one everything falls back to: the first declared, which is the volume these tools were
     built on. A page that configured nothing gets null and every caller below returns null, which
     is what keeps this module from being a new way for a tool to break. */
  function primary(){ return LIST[0] || null; }

  function inBox(nm, bb){
    if (!nm || !bb) return false;
    return nm[0] >= bb.xmin && nm[0] <= bb.xmax
        && nm[1] >= bb.ymin && nm[1] <= bb.ymax
        && nm[2] >= bb.zmin && nm[2] <= bb.zmax;
  }

  /* The volume a NANOMETRE position is in, or null. `list` is for core/jumplink.js, which is handed
     its volumes by its host and must resolve against those rather than against whatever this
     module was last configured with. */
  function at(nm, list){
    var L = list || LIST;
    for (var i = 0; i < L.length; i++)
      if (L[i] && L[i].bb && inBox(nm, L[i].bb)) return L[i];
    return null;
  }

  /* The same question in VOXELS, which is what every box, link and label in these tools holds.
     `resNm` is the tool's own voxel size. */
  function atVox(vox, resNm){
    if (!vox || !resNm) return null;
    return at([vox[0] * resNm[0], vox[1] * resNm[1], vox[2] * resNm[2]]);
  }

  /* What to read a coordinate from: the volume's sources, or the primary volume's if the point is
     outside every box. FALLING BACK RATHER THAN REFUSING is deliberate — a coordinate a few
     hundred nanometres outside a declared box is a rounding error or a slightly wrong box, and a
     panel that goes blank there is worse than one that shows the nearest thing it has. `inside`
     says which happened, so a caller that needs to know can say so.

     This is also what keeps every existing tool exactly as it was: configure nothing, or ask about
     a minnie65 point, and you get minnie65's sources, which is what the code reached for before. */
  function sourcesAt(nm){
    var v = at(nm), p = v || primary();
    if (!p) return null;
    return { key: p.key, label: p.label, em: p.em, seg: p.seg, nuc: p.nuc, mesh: p.mesh,
             inside: !!v };
  }
  function sourcesAtVox(vox, resNm){
    if (!vox || !resNm) return sourcesAt(null);
    return sourcesAt([vox[0] * resNm[0], vox[1] * resNm[1], vox[2] * resNm[2]]);
  }

  return { configure: configure, all: all, count: count, byKey: byKey, primary: primary,
           inBox: inBox, at: at, atVox: atVox,
           sourcesAt: sourcesAt, sourcesAtVox: sourcesAtVox };
})();
if (typeof module !== "undefined" && module.exports) module.exports = UJ.volumes;
