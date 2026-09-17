"""A cell you can see into, and its nucleus, always blue.                           2026-09-17

Søren: *"can you also make the other 3D window transparent cells and show the nucleus when it is
available? Nucleus should always be blue."*

"The other 3D window" is the ordinary Show in 3D panel -- the one installed beside every mesh
download button across µJump, πJump, βJump and ηJump -- as against the tracing preview, which got
see-through companions this morning.

BOTH HALVES OF THIS ARE ALREADY POLICY, written down for the Blender export and now true in the
page as well, which is the point:

  blender/colour_policy.py, 2026-09-08, quoting him:  *"The vasculature, however, should always be
  red and the nucleus always blue."*  NUC_COLOR = "#3a72d8". That exact value is used here, and the
  comment says where it comes from, because two blues would be worse than none.

  blender/make_colab_notebook.py, on the scene it writes:  *"Nuclei decide the transparency.
  Included, the cells are translucent so a nucleus stays visible through its own cell the way it
  does in Neuroglancer; not included, the cells are solid, because the transparency then costs
  contrast and shows nothing."*  So the cell turns see-through ONLY when there is a nucleus inside
  it to see. A panel that made every cell translucent would trade contrast for nothing on the
  majority of cells, which have no nucleus mesh to show.

WHAT HAD TO CHANGE IN THE RENDERER. `ghosts` (this morning) draws companions AFTER the subject with
depth writes off -- right when the subject is the solid thing. Here it is the other way round: the
NUCLEUS is solid and the CELL is what you see through. So draw() now sorts by opacity rather than
by role: everything opaque first, with depth writes on, then everything transparent over it with
depth writes off. The old behaviour is the case where the subject is opaque and the ghosts are not,
so nothing that called it before changes.

WHERE THE NUCLEUS ID COMES FROM. µJump, δJump and πJump already write `data-nucid` on the mesh
download button -- it has been there since the volume row learned to key by nucleus -- so this
module reads the id off the button it is already decorating and needs no tool to be told anything.
A tool with no such attribute, or no core/nucmesh.js, or a nuclei volume that publishes no meshes,
simply draws the cell solid the way it always did.

πJump gets the script tag here too: it has a nuclei source and `data-nucid` on its buttons, so the
only thing standing between it and a nucleus was the file not being loaded. Whether pinky100's
nuclei volume publishes meshes at all is a question this answers by asking it -- core/nucmesh.js
reads the volume's own info and returns null when there is no mesh directory.

Run: python3 src/the_cell_is_see_through_when_the_nucleus_is_there.py
     node m3dnuccheck.js && node m3dcheck.js && node m3dlivecheck.js && node m3dpinchcheck.js
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MESH3D = [
    # ── 1. one pass for the opaque, one for the see-through ────────────────────────────────────
    ('''      gl.disable(gl.BLEND); gl.depthMask(true);
      drawOne(MAIN, o.tint || themeTint(), 1);
      if (GHOSTS.length){
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        GHOSTS.forEach(function(g){ drawOne(g.d, g.tint || themeTint(), g.alpha); });
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }''',
     '''      /* SORTED BY OPACITY, NOT BY ROLE.  2026-09-17
         Until today the subject was always the solid thing and the ghosts were always the
         see-through ones, so "subject first, ghosts after with depth writes off" was the same
         sentence twice. Søren then asked for the reverse: *"make the other 3D window transparent
         cells and show the nucleus when it is available"* -- the NUCLEUS is solid and the CELL is
         what you see through. Drawing the cell first with depth writes on would have hidden the
         nucleus inside it completely.

         So: everything opaque, in order, writing depth; then everything transparent over it with
         depth writes OFF, so the see-through parts neither hide each other nor hide what is inside
         them. Depth TESTING stays on throughout, which is what keeps "inside" legible. Every
         earlier caller lands in the first branch exactly as before. */
      var opaque = [], clear = [];
      ALL.forEach(function(it){ (it.alpha >= 1 ? opaque : clear).push(it); });
      gl.disable(gl.BLEND); gl.depthMask(true);
      opaque.forEach(function(it){ drawOne(it.d, it.tint || themeTint(), 1); });
      if (clear.length){
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        clear.forEach(function(it){ drawOne(it.d, it.tint || themeTint(), it.alpha); });
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }''',
     "mesh3d: opaque first, see-through after, whichever one is the subject"),

    # ── 2. the subject can be the see-through one ──────────────────────────────────────────────
    ('''    gl.enable(gl.DEPTH_TEST);
    function drawOne(d, tint, alpha){''',
     '''    /* `o.alpha` is the SUBJECT's opacity, 1 unless a caller says otherwise. The cell panel sets
       it below 1 when it has a nucleus to show inside the cell. */
    var ALL = [{ d: MAIN, tint: o.tint || null,
                 alpha: (o.alpha === undefined ? 1 : o.alpha) }].concat(GHOSTS);
    gl.enable(gl.DEPTH_TEST);
    function drawOne(d, tint, alpha){''',
     "mesh3d: the subject carries an opacity too"),

    # ── 3. a pixel counter, so a check can ask what colour the picture actually is ──────────────
    ('''  function esc(s){ return String(s == null ? "" : s)''',
     '''  /* HOW MANY PIXELS ANSWER A QUESTION. probe() above counts distinct colours, which says "did
     anything get drawn"; this says WHAT. The nucleus being blue is a claim about the picture, and
     the only honest way to check a claim about a picture is to look at it. Same one-turn rule as
     probe(): repaint and read in the same turn, because the drawing buffer is not preserved. */
  function probePixels(pred){
    if (!LAST) return -1;
    LAST.paint();
    var gl = LAST.gl, c = LAST.canvas;
    var px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    var n = 0, w = c.width;
    /* x and y as well as the colour, because WHERE a colour is answers a different question from
       whether it is there: a nucleus re-centred on itself rather than left where it sits in its
       cell would paint exactly the same pixels, in the middle. */
    for (var i = 0; i < px.length; i += 4)
      if (pred(px[i], px[i+1], px[i+2], (i / 4) % w, Math.floor((i / 4) / w))) n++;
    return n;
  }

  function esc(s){ return String(s == null ? "" : s)''',
     "mesh3d: a check can ask what colour the picture is"),

    ('''  return { prepare: prepare, draw: draw, show: show, install: install, probe: probe,''',
     '''  return { prepare: prepare, draw: draw, show: show, install: install, probe: probe,
           probePixels: probePixels, NUC_TINT: NUC_TINT, NUC_COLOR: NUC_COLOR,''',
     "mesh3d: exported"),

    # ── 4. the nucleus, and the colour it is always ────────────────────────────────────────────
    ('''  function install(opts){
    var o = opts || {};''',
     '''  /* ── THE NUCLEUS, AND THE ONE BLUE IT IS ───────────────────────────────────────  2026-09-17
     Søren: *"show the nucleus when it is available? Nucleus should always be blue."*

     Not a new decision -- the export has said so since 2026-09-08, and this is the same value:
     blender/colour_policy.py, NUC_COLOR = "#3a72d8", "red MEANS vessel and blue MEANS nucleus, and
     the cell palette contains neither". A second blue chosen here would quietly make the page and
     the .blend disagree about what a colour means, which is worse than either being wrong alone. */
  var NUC_COLOR = "#3a72d8";
  var NUC_TINT = [0x3a / 255, 0x72 / 255, 0xd8 / 255];
  /* How see-through the cell goes WHEN there is a nucleus in it. Low enough to read a nucleus
     through, high enough that the cell is still a shape rather than a haze. */
  var CELL_ALPHA_WITH_NUCLEUS = 0.30;

  /* The nucleus mesh for a button's `data-nucid`, or null for every ordinary reason there might not
     be one: the tool does not write the attribute, the page has not loaded core/nucmesh.js, the
     volume publishes no meshes, or this nucleus has none. None of those is an error -- they all
     mean "draw the cell the way it was always drawn". */
  function nucleusMeshFor(nucId){
    if (!nucId || nucId === "0") return Promise.resolve(null);
    if (!(window.UJ && UJ.nucmesh && UJ.nucmesh.fetchNucleus)) return Promise.resolve(null);
    try {
      if (!UJ.nucmesh.configured()){
        var src = (UJ.cfg && UJ.cfg.em && UJ.cfg.em.nucSource) || (UJ.cfg && UJ.cfg.nucSource);
        if (!src) return Promise.resolve(null);
        UJ.nucmesh.configure({ nuc: src });
      }
      return UJ.nucmesh.fetchNucleus(nucId).catch(function(){ return null; });
    } catch (e){ return Promise.resolve(null); }
  }

  function install(opts){
    var o = opts || {};''',
     "mesh3d: the nucleus fetch, and the blue the export already uses"),

    # ── 5. draw it, and say so ─────────────────────────────────────────────────────────────────
    ('''          show(host, geo, { lead: lead,
                            emptyMessage: "This cell has no mesh geometry to draw." });''',
     '''          /* THE NUCLEUS, WHEN THERE IS ONE. Prepared in the CELL'S frame -- see prepare's
             `frame` option -- because a nucleus centred on itself would sit in the middle of the
             picture rather than where it is in the cell, which looks right and is a lie. */
          var nucId = dl.getAttribute("data-nucid") || "";
          return nucleusMeshFor(nucId).then(function(nm){
            var opts2 = { lead: lead, emptyMessage: "This cell has no mesh geometry to draw." };
            if (nm && nm.positions && nm.positions.length){
              var ng = prepare(nm.positions, nm.indices,
                               { unitNm: 1000, frame: { mid: geo.mid, span: geo.span } });
              if (!ng.empty){
                opts2.ghosts = [{ geo: ng, tint: NUC_TINT, alpha: 1 }];
                /* The cell goes see-through ONLY now that there is something inside it to see --
                   the notebook's rule, and for its reason: transparency with nothing behind it
                   costs contrast and shows nothing. */
                opts2.alpha = CELL_ALPHA_WITH_NUCLEUS;
                opts2.lead = (lead ? lead + "<br>" : "")
                  + "<span class='hint'>Nucleus " + esc(nucId) + " is drawn in "
                  + "<b style='color:" + NUC_COLOR + "'>blue</b>, and the cell around it is "
                  + "see-through so you can see it. Blue always means nucleus here and in the "
                  + "Blender export.</span>";
              }
            }
            show(host, geo, opts2);
          });''',
     "mesh3d: the nucleus is drawn inside a cell you can see through"),
]

PJUMP = [
    ('<script src="core/mesh3d.js"></script>',
     '<script src="core/mesh3d.js"></script>\n<script src="core/nucmesh.js"></script>',
     "pjump.html: the nucleus reader, which is all that was missing there"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("core/mesh3d.js", MESH3D)
edit("pjump.html", PJUMP)
print("\nnow: node m3dnuccheck.js && node m3dcheck.js && node m3dlivecheck.js && node m3dpinchcheck.js")
