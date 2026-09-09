"""pinky100 does have nuclei, and the box can export them.                          2026-09-09

Søren: *"Th pJump has nuclei also, so that should be included in the same way as uJump and dJump."*

He is right, and the page has said so all along. πJump line 2401:

    SRC.nuc = "precomputed://https://td.princeton.edu/sseung-archive/pinky100-nuclei/seg"

and line 11970 said, three thousand lines further down:

    nucSource:"",          /* pinky100 publishes no nucleus segmentation */

MEASURED, before writing a line -- that volume's own /info, read in a browser:

    type            segmentation, uint32
    resolution      64 x 64 x 40 nm
    size            5632 x 3584 x 2176
    voxel_offset    2187, 1909, 1
    mesh            mesh_mip_0_err_40          <- it publishes MESHES too

So both halves work: the nucleus mesh inside the cell, and the nucleus painted on the EM
sections. And πJump's stored nucleus ids are segment ids in exactly this volume -- its own
nucdata blob says so: "sampled from the pinky100-nuclei segmentation at each soma position".
CloudVolume reads voxel_offset out of the info itself, so the source string is the whole wiring.

THE FOURTH TIME THIS FAMILY OF SENTENCE HAS BEEN WRONG. "ηJump has no bounding-box panel",
"δJump has no Blender notebook", "V1DD publishes no nucleus segmentation" (2026-09-09, same
shape, same file family), and now this one. Every one was written from memory and contradicted by
a constant in the same file. The remedy that has worked is the assertion δJump got: the page
checks its own two nucleus sources against each other at load and says so in the console if they
ever disagree. πJump gets it too, so a claim like this cannot survive a page load again.

Run: python3 src/pinky100_does_have_nuclei.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CFG = [
    ('''UJ.cfg.em = {
  emSource:"gs://microns_public_datasets/pinky100_v0/son_of_alignment_v15_rechunked",
  segSource:"gs://microns_public_datasets/pinky100_v185/seg"
};''',
     '''UJ.cfg.em = {
  emSource:"gs://microns_public_datasets/pinky100_v0/son_of_alignment_v15_rechunked",
  segSource:"gs://microns_public_datasets/pinky100_v185/seg",
  /* IT DOES PUBLISH ONE. This block had no nucSource at all until 2026-09-09 and the Blender
     panel passed `nucSource:""` with the comment "pinky100 publishes no nucleus segmentation" --
     written from memory, and contradicted by SRC.nuc three thousand lines below. The volume's own
     /info: uint32 segmentation, 64x64x40 nm, voxel_offset 2187/1909/1, and "mesh":
     "mesh_mip_0_err_40" -- so it carries meshes as well as voxels, which is both halves of what
     the Nuclei tick does. πJump's nucleus ids are segment ids in this exact volume (see the
     nucdata blob's own `_nucleus_ids` note), so they are the right key to look them up with.

     Repeated here rather than read off SRC.nuc for the same reason µJump repeats it: UJ.cfg.em is
     the block core/blenderexport.js and core/regionbox.js read, and SRC is declared far below in
     script-tag order. The assertion beside SRC.nuc is what stops the two from drifting. */
  nucSource:"precomputed://https://td.princeton.edu/sseung-archive/pinky100-nuclei/seg"
};''',
     "the config knows where the nuclei are"),

    ('''const NUC_INFO="https://td.princeton.edu/sseung-archive/pinky100-nuclei/seg/info";''',
     '''const NUC_INFO="https://td.princeton.edu/sseung-archive/pinky100-nuclei/seg/info";
/* ONE NUCLEUS VOLUME, NOT TWO. UJ.cfg.em.nucSource (top of the file, where the Blender panel
   reads it) and SRC.nuc (here, where the viewer reads it) are the same bucket, and a page that
   painted one volume and exported another would be almost impossible to notice. 2026-09-09. */
if(UJ.cfg.em.nucSource!==SRC.nuc)
  console.warn("nucleus source mismatch: viewer uses "+SRC.nuc
              +", the Blender panel would export "+UJ.cfg.em.nucSource);''',
     "the two sources check each other at load"),
]

PANEL = [
    ('''      /* No Nuclei tick and no Vasculature tick: pinky100 has no nucleus segmentation and Wan &
         Wei's vessels are minnie65's volume. Absent rather than disabled -- a capability this
         dataset was never going to have is a fact about the dataset, not a gap in the tool. */
      +'<span style="flex:1"></span>'
      +'<label style="font-size:11px;color:var(--mut);display:flex;align-items:center;gap:3px;cursor:pointer" title="Write the Blender-scene notebook instead of the EM/segmentation one: a .blend and a .glb, with the cells as 3D models and the EM sections sweeping through them. The three ticks to the left still say what goes in."><input type="checkbox" class="colab-blender">Blender file</label>' ''',
     '''      /* No Vasculature tick: Wan & Wei's vessels are minnie65's volume. Absent rather than
         disabled -- a capability this dataset was never going to have is a fact about the
         dataset, not a gap in the tool. Nuclei ARE here, since 2026-09-09: pinky100 publishes a
         separate, public nucleus segmentation WITH meshes (see UJ.cfg.em.nucSource), so this tick
         does the same two things it does on µJump and δJump. */
      +'<label class="colab-nuc-lab" style="font-size:11px;color:var(--mut);display:flex;align-items:center;gap:3px;cursor:pointer" title="Include the nucleus: its 3D mesh inside the cell, and the nucleus painted on the EM sections. With nuclei in, the cells are drawn translucent so a nucleus stays visible through its own cell, the way it does in Neuroglancer. pinky100 publishes its nuclei as a separate, public volume. Blender file only."><input type="checkbox" class="colab-nuclei" checked>Nuclei</label>'
      +'<span style="flex:1"></span>'
      +'<label style="font-size:11px;color:var(--mut);display:flex;align-items:center;gap:3px;cursor:pointer" title="Write the Blender-scene notebook instead of the EM/segmentation one: a .blend and a .glb, with the cells as 3D models and the EM sections sweeping through them. The ticks to the left still say what goes in."><input type="checkbox" class="colab-blender">Blender file</label>' ''',
     "the Nuclei tick is on the panel"),

    ('''    /* The explainer is the only thing the Blender tick changes on this page -- there is no Nuclei
       or Vasculature tick to dim -- so the closure is short. Run once at build time as well as on
       change, so a fresh row is right before anything is clicked. */
    (function(){
      const bl=row.querySelector(".colab-blender"), help=row.querySelector(".rbox-blender-help");
      if(!bl||!help)return;
      const sync=()=>{help.style.display=bl.checked?"":"none";};
      bl.addEventListener("change",sync); sync();
    })();''',
     '''    /* Nuclei only mean anything to the Blender notebook -- the EM/segmentation notebook writes
       PNG sections and has nowhere to put a 3D model -- so the tick follows the Blender one:
       dimmed and explained when it cannot do anything, rather than present and inert. Same closure
       decides the explainer, so there is one place to look when the question is "what does the
       Blender tick change". Run once at build time as well as on change, so a fresh row is right
       before anything is clicked. */
    (function(){
      const bl=row.querySelector(".colab-blender"), help=row.querySelector(".rbox-blender-help");
      const nu=row.querySelector(".colab-nuclei"), lab=row.querySelector(".colab-nuc-lab");
      if(!bl)return;
      const sync=()=>{
        if(help)help.style.display=bl.checked?"":"none";
        if(nu)nu.disabled=!bl.checked;
        if(lab){
          lab.style.opacity=bl.checked?"":"0.45";
          lab.title=bl.checked
            ? "Include the nucleus: its 3D mesh inside the cell, and the nucleus painted on the EM sections. With nuclei in, the cells are drawn translucent so a nucleus stays visible through its own cell, the way it does in Neuroglancer."
            : "Nuclei are part of the Blender scene only \\u2014 the EM/segmentation notebook has no nucleus step. Tick \\u201cBlender file\\u201d to enable this.";
        }
      };
      bl.addEventListener("change",sync); sync();
    })();''',
     "the tick follows the Blender one"),
]

CLICK = [
    ('''      const blEl=row.querySelector(".colab-blender"), wantBlender=!!(blEl&&blEl.checked);
      if(!wantEM&&!wantSeg&&!wantMeshes){alert("Tick at least one of EM, Segmentation, or Cell 3D model.");return;}''',
     '''      const nuEl=row.querySelector(".colab-nuclei");
      const blEl=row.querySelector(".colab-blender"), wantBlender=!!(blEl&&blEl.checked);
      if(!wantEM&&!wantSeg&&!wantMeshes){alert("Tick at least one of EM, Segmentation, or Cell 3D model.");return;}''',
     "the click reads the tick"),

    ('''            /* For the Blender notebook, which colours by type and puts a nucleus inside a cell
               where the dataset has one. Same loop, same box test -- two lists built from one
               pass cannot disagree about which cells are in the box. */
            if(rid)boxCells.push({type:String(m.row.type||"Unclassified"),root_id:String(rid),
                                  nucleus_id:(typeof rowNucId==="function"?rowNucId(m.row):null)||null});''',
     '''            /* For the Blender notebook, which colours by type and puts a nucleus inside a cell
               where the dataset has one. Same loop, same box test -- two lists built from one
               pass cannot disagree about which cells are in the box. The nucleus id was always
               carried here and had nowhere to go until 2026-09-09, when nucSource stopped being
               "": both the nucleus mesh and the nucleus painted on the sections are looked up by
               THIS id in the pinky100-nuclei volume, not by the root id in the segmentation. */
            if(rid)boxCells.push({type:String(m.row.type||"Unclassified"),root_id:String(rid),
                                  nucleus_id:(typeof rowNucId==="function"?rowNucId(m.row):null)||null});''',
     "the nucleus id has somewhere to go now"),

    ('''          nucSource:"",          /* pinky100 publishes no nucleus segmentation */
          vascSource:"",         /* and the TriSAM vessels are minnie65's volume */''',
     '''          /* IT DOES PUBLISH ONE -- see UJ.cfg.em.nucSource. This line read `nucSource:""` with
             the comment "pinky100 publishes no nucleus segmentation" until 2026-09-09, which was
             written from memory and contradicted by this page's own SRC.nuc. The same sentence
             had already been wrong about V1DD earlier the same day. */
          nucSource:UJ.cfg.em.nucSource||"",
          vascSource:"",         /* the TriSAM vessels are minnie65's volume */''',
     "the notebook is told where the nuclei are"),

    ('''          include:{em:wantEM,seg:wantSeg,meshes:wantMeshes,nuclei:false,vasc:false}''',
     '''          include:{em:wantEM,seg:wantSeg,meshes:wantMeshes,nuclei:!!(nuEl&&nuEl.checked),vasc:false}''',
     "and whether they were asked for"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        old, new = old.rstrip(" "), new.rstrip(" ")
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("pjump.html", CFG + PANEL + CLICK)
print("\nnow: node nucleitickcheck.js")
