/* core/colabexport.js -- 2026-08-29, Søren: "I want to look into the possibility to either allow
   direct download of EM data and EM segmentation from each of the datasets by setting a box around
   the area to download... give the user a colab code they can upload to colab and make it download
   the cutout... also include download of the 3D mesh of the selected cells in the filtering whose
   nuclei coordinates are within the bounding box... I want the output to be a code that can be
   uploaded directly to colab. I think it's called .IPYNB". Revised in the same conversation: EM
   volume cutouts can't realistically be decoded/stitched client-side for segmentation (the
   precomputed compressed_segmentation codec is not something with a standalone JS decoder outside
   Neuroglancer's own bundled WASM), so EVERYTHING here -- EM, segmentation, and meshes -- goes
   through one generated .ipynb using the Python `cloud-volume` library, which already has tested,
   working decoders for all three. There is no "try a direct browser download first" path.

   Dataset-agnostic, same pattern as core/mesh.js: the only per-dataset values (EM/segmentation
   source paths) live in UJ.cfg.em, set by the page before this file loads. Any Jump tool that
   defines UJ.cfg.em and loads this script gets the same "Download this region" notebook generator
   for free -- see UJ.cfg.em's own comment in ujump.html for what the two fields must contain.

   Public surface: UJ.colab.buildNotebook(opts), UJ.colab.downloadNotebook(opts).

   Python-side technique notes (so the generated notebook doesn't repeat mistakes already made and
   fixed elsewhere in this project):
     - CloudVolume(path, use_https=True) -- converts a gs:// path to public, anonymous HTTPS access,
       no CAVE token or Google credential lookup at all (confirmed working for this dataset family
       in the H01 Colab notebook).
     - The connection-pool patch (see PY_POOL_PATCH below) avoids requests/urllib3's default
       10-socket pool silently discarding connections above 10 parallel workers, which can make a
       many-thread job SLOWER than a 10-thread one -- hit and fixed once already in
       h01_build_cell_table.ipynb. Must run before the first CloudVolume(...) is constructed --
       a CloudVolume built earlier keeps whatever pool size existed at its own construction time.
     - EM and segmentation are NOT assumed to share a voxel grid/resolution -- each CloudVolume's
       OWN .resolution (read at runtime from that volume's info file) converts the shared physical-nm
       bounding box to that volume's own voxel indices, never a hardcoded per-axis nm/voxel value.
     - Segment IDs in this dataset family are large uint64 values that FIJI/ImageJ (and most label-
       image viewers) can't display -- the segmentation cutout is remapped to small sequential
       integers for the saved TIFF, with the real root IDs kept in an accompanying lookup CSV.
     - Peak RAM, not the raw uint8 cutout size, is what kills a Colab kernel silently (a kernel
       restart with no Python traceback is an OOM kill, not a code bug) -- see the "Colab slab
       memory budget" lesson elsewhere in this project. The generated notebook estimates peak bytes
       BEFORE fetching and raises with a clear message rather than fetching into a crash.
     - Not every dataset's segmentation is a static, public, anonymously-readable volume like
       MICrONS/H01/pinky100's. V1DD's (δJump) is a live "graphene://middleauth+https://..." CAVE-
       backed segmentation -- there is no anonymous access at all, and Søren himself cannot read it
       without his own CAVE credentials for that dataset (see the project's own V1DD notes). Set
       opts.segCaveAuth=true for a dataset like this (see UJ.cfg.em's own comment) and the generated
       notebook adds a CAVE-token cell and passes the token into ONLY the segmentation/mesh
       CloudVolume -- the EM cutout is unaffected since V1DD's EM volume is a separate, plain
       precomputed source with no auth wall. This is the standard cloud-volume `secrets={"token":
       ...}` pattern for a graphene source; untested against the live endpoint from here (this
       sandbox has no V1DD access either) -- flagged clearly in the notebook itself rather than
       silently assumed to work. */
window.UJ = window.UJ || {};
UJ.colab = (function(){

  // nbformat 4 cell source is an array of lines, each ending in "\n" except the last -- this is
  // the convention Jupyter/Colab itself writes; a single joined string also happens to work in
  // most readers, but matching the real convention avoids surprises in stricter parsers.
  function srcLines(s){
    const lines = s.split("\n");
    return lines.map((l, i) => i < lines.length - 1 ? l + "\n" : l);
  }
  function mdCell(s){ return {cell_type: "markdown", metadata: {}, source: srcLines(s)}; }
  function codeCell(s){ return {cell_type: "code", execution_count: null, metadata: {}, outputs: [], source: srcLines(s)}; }

  // "middleauth+" is a Neuroglancer-FRONTEND auth-negotiation convention (its own browser OAuth
  // handshake) baked into the source string for Neuroglancer's benefit -- cloud-volume's graphene
  // reader expects a plain "graphene://https://<server>/<path>" and takes the token separately via
  // its own `secrets` parameter (see the segCaveAuth branch below), so this is stripped before the
  // path reaches Python. A no-op for every source that doesn't have it (i.e. every non-CAVE
  // dataset this template supports).
  function toCloudVolumePath(src){ return String(src||"").replace("middleauth+", ""); }

  // Python float literal -- nm coordinates from the app are already plain numbers, but keep this
  // as a single choke point in case a NaN/Infinity ever slips through (would otherwise produce
  // invalid Python source like "nan" with no quotes, still technically valid Python actually, but
  // guarding here is cheap and matches the file's general "don't trust upstream values blindly"
  // convention).
  function pyNum(n){ return Number.isFinite(n) ? String(n) : "0"; }
  function pyStr(s){ return JSON.stringify(String(s)); } // JSON string escaping == Python string escaping for our purposes (ASCII paths/ids only)
  function pyIdList(ids){ return "[" + (ids||[]).map(id => pyStr(String(id))).join(", ") + "]"; }

  const PY_POOL_PATCH =
`# Cloud-volume/urllib3 connection-pool fix -- without this, more than ~10 parallel chunk/mesh
# fetches log "Connection pool is full, discarding connection" and silently fall back to a fresh
# TLS handshake per request, which can make a many-thread job SLOWER than a 10-thread one. Must
# run before the first CloudVolume(...) below is constructed -- a CloudVolume built earlier keeps
# whatever (small) pool size existed when IT was constructed, so re-running just this cell later
# does nothing for an already-created CloudVolume object.
import requests.adapters as _ad
N_THREADS = 10
_POOL = max(N_THREADS * 2, 20)
_ad.DEFAULT_POOLSIZE = _POOL
_orig_init = getattr(_ad.HTTPAdapter, "_orig_init", _ad.HTTPAdapter.__init__)
def _init(self, *args, **kw):
    if not args:  # only inject when nothing was passed positionally, matching the original fix
        kw["pool_connections"] = max(kw.get("pool_connections") or _POOL, _POOL)
        kw["pool_maxsize"] = max(kw.get("pool_maxsize") or _POOL, _POOL)
    return _orig_init(self, *args, **kw)
_ad.HTTPAdapter._orig_init = _orig_init
_ad.HTTPAdapter.__init__ = _init
print("Connection-pool patch applied (pool size", _POOL, ").")`;

  /* opts: {
       datasetId, datasetLabel: strings, from UJ.cfg.id/label
       emSource, segSource: gs:// paths, from UJ.cfg.em
       boxNM: {xmin,xmax,ymin,ymax,zmin,zmax} -- physical nanometres
       boxLabel: e.g. "Box 1"
       rootIds: string[] -- matched cells' root IDs whose nucleus fell inside this box, at
                 generation time (may be empty -- see the mesh cell below for what that means)
       include: {em, seg, meshes} -- booleans, each defaulting to true if `include` itself is
                 omitted (backward compatible with the first round of this feature). 2026-08-29
                 (2nd round), Søren: "we need to be able to specify whether it should download EM
                 and/or segmentation, and/or 3D meshes" -- each tool's per-box UI now has its own
                 three checkboxes, threaded through here so the generated notebook only pip-
                 installs/imports/fetches the pieces actually asked for. This is also the direct
                 fix for a real failure: a box that only needed meshes was still hitting the EM
                 cutout's memory-budget guard (correctly -- 87 GB estimated, ~12 GB available) for
                 a fetch the user never wanted in the first place.
     } */
  function buildNotebook(opts){
    const box = opts.boxNM, dims = [box.xmax-box.xmin, box.ymax-box.ymin, box.zmax-box.zmin];
    const inc = opts.include || {};
    const wantEM = inc.em !== false, wantSeg = inc.seg !== false, wantMeshes = inc.meshes !== false;

    const cells = [];

    const parts = [];
    if (wantEM) parts.push("EM imagery");
    if (wantSeg) parts.push("segmentation");
    if (wantMeshes) parts.push(`meshes for ${opts.rootIds.length} matched cell(s)`);
    const partsText = parts.length ? parts.join(", ").replace(/, ([^,]*)$/, " and $1") : "nothing (no format was selected -- regenerate with at least one ticked)";

    cells.push(mdCell(
`# ${opts.datasetLabel} — region download

Generated by ${opts.datasetLabel}'s "Download this region" button for **${opts.boxLabel}**.

Bounding box (physical nanometres):
- X: ${box.xmin.toFixed(0)} to ${box.xmax.toFixed(0)} (${dims[0].toFixed(0)} nm)
- Y: ${box.ymin.toFixed(0)} to ${box.ymax.toFixed(0)} (${dims[1].toFixed(0)} nm)
- Z: ${box.zmin.toFixed(0)} to ${box.zmax.toFixed(0)} (${dims[2].toFixed(0)} nm)

This downloads ${partsText} for this box. Run every cell in order (**Runtime → Run all**). The last cell zips whatever was fetched and offers it as a download.

EM and segmentation are decoded here with the Python \`cloud-volume\` library rather than in the browser -- this dataset's segmentation is stored in a compact format Neuroglancer decodes internally but that has no standalone JavaScript decoder, so a browser-side cutout isn't practical for segmentation.${opts.segCaveAuth && (wantSeg||wantMeshes) ? "\n\n**This dataset's segmentation requires your own CAVE access** -- EM downloads without any login, but the segmentation and mesh cells need a CAVE token (see the cell below titled \"CAVE token\")." : ""}`
    ));

    const pipPkgs = ["cloud-volume"];
    if (wantEM || wantSeg) pipPkgs.push("tifffile");
    cells.push(codeCell(`!pip install -q ${pipPkgs.join(" ")}`));

    cells.push(mdCell(`## Connection-pool fix\n\nRun before creating any \`CloudVolume\` below -- see this file's own comment for why.`));
    cells.push(codeCell(PY_POOL_PATCH));

    cells.push(mdCell(`## Parameters\n\nEverything specific to this box and dataset. Nothing below this cell should need editing unless you want a bigger box, a different memory budget, or fewer/more mesh threads.`));
    cells.push(codeCell(
`from cloudvolume import CloudVolume
import numpy as np

DATASET_ID    = ${pyStr(opts.datasetId)}
EM_SOURCE     = ${pyStr(toCloudVolumePath(opts.emSource))}
SEG_SOURCE    = ${pyStr(toCloudVolumePath(opts.segSource))}

# Physical nanometres -- converted below to each volume's OWN voxel grid via that volume's own
# .resolution (read at runtime from its info file). EM and segmentation are not assumed to share
# a voxel grid.
BOX_NM = {
    "xmin": ${pyNum(box.xmin)}, "xmax": ${pyNum(box.xmax)},
    "ymin": ${pyNum(box.ymin)}, "ymax": ${pyNum(box.ymax)},
    "zmin": ${pyNum(box.zmin)}, "zmax": ${pyNum(box.zmax)},
}

# Root IDs of cells the app's Filter-and-show query matched inside this exact box, at the time
# this notebook was generated. Empty if no filter was run, or nobody matched inside this specific
# box -- the mesh-download cell below just prints a note and skips itself in that case.
MESH_ROOT_IDS = ${pyIdList(opts.rootIds)}

def nm_box_to_voxels(cv, box_nm):
    res = np.array(cv.resolution, dtype=float)  # nm/voxel, this volume's own -- never hardcoded
    lo = np.array([box_nm["xmin"], box_nm["ymin"], box_nm["zmin"]]) / res
    hi = np.array([box_nm["xmax"], box_nm["ymax"], box_nm["zmax"]]) / res
    return np.floor(lo).astype(int), np.ceil(hi).astype(int)`
    ));

    if (wantEM || wantSeg) {
      cells.push(mdCell(`## Memory-budget guard\n\nA Colab kernel that dies with **no Python traceback** (just a "restarting kernel" message) was killed for running out of RAM, not a code bug -- this estimates peak memory for a cutout BEFORE fetching it and raises a clear error instead, so a too-large box fails fast rather than mid-download. If you hit this, either shrink the box in the app, or regenerate the notebook with EM/segmentation unticked and download meshes only.`));
      cells.push(codeCell(
`import psutil

BYTES_PER_VOXEL = 22  # conservative headroom for cloud-volume's own decompression buffers -- measure, don't just trust this if you push it
RAM_BUDGET_GB = 6     # stay well under Colab's free-tier RAM; raise this only if you know your runtime has more

def check_budget(shape, label):
    n_vox = int(np.prod(shape))
    est_gb = n_vox * BYTES_PER_VOXEL / 1e9
    avail_gb = psutil.virtual_memory().available / 1e9
    print(f"{label}: shape {tuple(shape)} = {n_vox:,} voxels, ~{est_gb:.2f} GB estimated peak, {avail_gb:.2f} GB available")
    if est_gb > RAM_BUDGET_GB or est_gb > 0.75 * avail_gb:
        raise MemoryError(
            f"{label} cutout looks too large for this session (~{est_gb:.1f} GB estimated). "
            f"Shrink the bounding box in the app and regenerate this notebook, or raise "
            f"RAM_BUDGET_GB above if you know this Colab runtime has more memory."
        )`
      ));
    }

    if (wantEM) {
      cells.push(mdCell(`## EM cutout\n\nSaved as a multi-page TIFF stack (\`em_cutout.tif\`) -- opens directly in FIJI/ImageJ.`));
      cells.push(codeCell(
`import tifffile

cv_em = CloudVolume(EM_SOURCE, use_https=True, mip=0, fill_missing=True)
lo, hi = nm_box_to_voxels(cv_em, BOX_NM)
check_budget(hi - lo, "EM")
em_vol = np.asarray(cv_em[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]])[..., 0]  # drop the trailing channel axis
em_vol = np.moveaxis(em_vol, 2, 0)  # cloud-volume gives (x, y, z) -- TIFF stacks want (z, y, x)
tifffile.imwrite("em_cutout.tif", em_vol)
print("Saved em_cutout.tif", em_vol.shape, em_vol.dtype)`
      ));
    }

    if (opts.segCaveAuth && (wantSeg || wantMeshes)) {
      cells.push(mdCell(`## CAVE token (required for this dataset's segmentation)\n\nUnlike this template's other datasets, ${opts.datasetLabel}'s segmentation is a live, CAVE-authenticated volume -- there is no anonymous access. You need your own CAVE credentials for this dataset. Run the cell below, follow the printed link, and paste the token it gives you.`));
      cells.push(codeCell(
`from caveclient import CAVEclient

# Opens/prints a URL to authorize this session and get a token -- paste it when prompted.
# If you already have a saved CAVE token, this may pick it up automatically instead.
_cave_client = CAVEclient()
try:
    CAVE_TOKEN = _cave_client.auth.token
except Exception:
    CAVE_TOKEN = ""
if not CAVE_TOKEN:
    print("No saved token found -- run _cave_client.auth.get_new_token() in a new cell, "
          "follow the link, then set CAVE_TOKEN to the token it gives you.")
else:
    print("Using a saved CAVE token.")`
      ));
    }

    if (wantSeg) {
      cells.push(mdCell(`## Segmentation cutout\n\nSegment IDs here are large 64-bit values FIJI/ImageJ can't display as a label image, so the saved TIFF (\`segmentation_cutout.tif\`) uses small sequential label numbers instead -- \`segmentation_label_lookup.csv\` maps each label back to its real root ID.${opts.segCaveAuth ? " Uses the CAVE token from the cell above." : ""}`));
      cells.push(codeCell(
`import csv
import tifffile

cv_seg = CloudVolume(SEG_SOURCE, use_https=True, mip=0, fill_missing=True${opts.segCaveAuth ? `, secrets={"token": CAVE_TOKEN} if CAVE_TOKEN else None` : ""})
lo_s, hi_s = nm_box_to_voxels(cv_seg, BOX_NM)
check_budget(hi_s - lo_s, "Segmentation")
seg_vol = np.asarray(cv_seg[lo_s[0]:hi_s[0], lo_s[1]:hi_s[1], lo_s[2]:hi_s[2]])[..., 0]
seg_vol = np.moveaxis(seg_vol, 2, 0)

uniq = np.unique(seg_vol)
remap = {v: i for i, v in enumerate(uniq)}  # 0 (background) maps to 0 if present, since np.unique is sorted
seg_small = np.vectorize(remap.get)(seg_vol).astype(np.uint32)
tifffile.imwrite("segmentation_cutout.tif", seg_small)
with open("segmentation_label_lookup.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["label", "root_id"])
    for v, i in remap.items():
        w.writerow([i, int(v)])
print("Saved segmentation_cutout.tif", seg_small.shape, "and segmentation_label_lookup.csv (", len(uniq), "distinct IDs incl. background)")`
      ));
    } else if (wantMeshes) {
      cells.push(mdCell(`## Segmentation volume (meshes only)\n\nSegmentation itself wasn't ticked for download, but meshes are read through the same segmentation volume's built-in mesh support, so it still needs to be opened here -- no voxel cutout happens in this cell.${opts.segCaveAuth ? " Uses the CAVE token from the cell above." : ""}`));
      cells.push(codeCell(
`cv_seg = CloudVolume(SEG_SOURCE, use_https=True, mip=0, fill_missing=True${opts.segCaveAuth ? `, secrets={"token": CAVE_TOKEN} if CAVE_TOKEN else None` : ""})`
      ));
    }

    if (wantMeshes) {
      cells.push(mdCell(`## Meshes for matched cells\n\nOne \`.obj\` file per root ID in \`MESH_ROOT_IDS\` (defined above), via the same segmentation volume's built-in mesh support -- cloud-volume finds and decodes the mesh directory from the segmentation's own info file, so no separate mesh path is needed.`));
      cells.push(codeCell(
`import os

os.makedirs("meshes", exist_ok=True)
if not MESH_ROOT_IDS:
    print("MESH_ROOT_IDS is empty -- no cells were matched inside this box when the notebook was "
          "generated. Run Filter and show with this box active in the app, then regenerate this "
          "notebook, if you want mesh downloads.")
else:
    meshes = cv_seg.mesh.get(MESH_ROOT_IDS)
    for rid, mesh in meshes.items():
        path = f"meshes/{rid}.obj"
        with open(path, "w") as f:
            for v in mesh.vertices:
                f.write(f"v {v[0]} {v[1]} {v[2]}\\n")
            for face in mesh.faces:
                f.write(f"f {face[0]+1} {face[1]+1} {face[2]+1}\\n")  # OBJ vertex indices are 1-based
        print("Saved", path, "--", len(mesh.vertices), "vertices,", len(mesh.faces), "faces")`
      ));
    }

    cells.push(mdCell(`## Zip and download`));
    cells.push(codeCell(
`import os
import zipfile
from google.colab import files

with zipfile.ZipFile("region_download.zip", "w") as zf:
    for fn in ("em_cutout.tif", "segmentation_cutout.tif", "segmentation_label_lookup.csv"):
        if os.path.exists(fn):
            zf.write(fn)
    if os.path.isdir("meshes"):
        for fn in os.listdir("meshes"):
            zf.write(os.path.join("meshes", fn), arcname=os.path.join("meshes", fn))
print("Zipped region_download.zip")
files.download("region_download.zip")`
    ));

    return {
      cells: cells,
      metadata: {
        colab: {name: (opts.datasetId || "region") + "_" + (opts.boxLabel || "box").replace(/\s+/g, "_") + ".ipynb", provenance: []},
        kernelspec: {display_name: "Python 3", name: "python3"},
        language_info: {name: "python"}
      },
      nbformat: 4,
      nbformat_minor: 5
    };
  }

  function downloadNotebook(opts){
    const nb = buildNotebook(opts);
    const filename = (opts.datasetId || "region") + "_" + (opts.boxLabel || "box").replace(/\s+/g, "_") + ".ipynb";
    const blob = new Blob([JSON.stringify(nb, null, 1)], {type: "application/x-ipynb+json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }

  return {buildNotebook, downloadNotebook};
})();
