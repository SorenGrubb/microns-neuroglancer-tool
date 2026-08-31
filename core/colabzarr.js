/* core/colabzarr.js -- 2026-08-31, Søren: "we should add Filter and show to wJump ... including
   also the bounding box limitation + colab code for download". Asked what the notebook should be
   able to fetch, he chose EM cutouts and segmentation where it exists.

   WHY THIS IS NOT core/colabexport.js WITH A DIFFERENT PATH. colabexport generates a notebook
   built entirely on the Python `cloud-volume` library, which reads Neuroglancer PRECOMPUTED
   volumes. Every one of µJump's, βJump's, λJump's and πJump's sources is precomputed. Not one of
   ωJump's is: the fifteen OpenOrganelle blocks are OME-Zarr on public S3, and the twenty-six
   WEBKNOSSOS volumes are OME-Zarr streamed over HTTP from a WEBKNOSSOS data store. cloud-volume
   cannot open either. So this is a second template rather than a branch inside the first --
   sharing the shell would have meant a file where half the cells are dead on every run.

   THE PATHS ARE NOT HARDCODED, AND THAT IS DELIBERATE RATHER THAN CAUTIOUS.
   ------------------------------------------------------------------------------------
   I cannot reach either host from where this was written: janelia-cosem-datasets.s3 and
   data-humerus.webknossos.org both refuse the egress proxy, exactly as webknossos.org did when
   the roster was built (that is why those probes ran in Colab on Søren's machine). So I do not
   know, first-hand, which multiscale level names each volume uses, whether it is zarr v2 or v3,
   or whether the voxel size in the OME metadata matches the res_nm in wjump_config.js.

   Writing a notebook that assumes an answer to any of those would be writing a guess and letting
   Søren discover it forty cells into a Colab run. So the notebook DISCOVERS instead:

     - it opens the group at the layer URL and LISTS what is actually inside it,
     - it reads the voxel size out of the OME-NGFF multiscales metadata rather than being told,
     - it picks the finest level by that metadata, not by a name it expects to find,
     - it prints all of the above before fetching a single byte,
     - and it CROSS-CHECKS the discovered voxel size against the one ωJump has in its config,
       printing a clear warning if they disagree, because if they do then either the config is
       wrong (and every search box in the app is in the wrong place) or the metadata is, and
       Søren needs to know which volume is affected.

   That last check is the point of the whole arrangement: it turns "I could not verify this" into
   something the notebook verifies on Søren's machine, every run, and reports.

   Public surface: UJ.colabzarr.buildNotebook(opts), UJ.colabzarr.downloadNotebook(opts). */
window.UJ = window.UJ || {};
UJ.colabzarr = (function(){

  function srcLines(s){
    var lines = s.split("\n");
    return lines.map(function(l, i){ return i < lines.length - 1 ? l + "\n" : l; });
  }
  function mdCell(s){ return {cell_type:"markdown", metadata:{}, source:srcLines(s)}; }
  function codeCell(s){ return {cell_type:"code", execution_count:null, metadata:{}, outputs:[], source:srcLines(s)}; }
  function pyStr(s){ return JSON.stringify(String(s)); }
  function pyNum(n){ return Number.isFinite(n) ? String(n) : "0"; }
  function pyList(a){ return "[" + (a||[]).map(pyNum).join(", ") + "]"; }

  /* ωJump's config carries Neuroglancer source strings: "zarr://https://host/..." and
     "zarr://s3://bucket/...". The "zarr://" prefix is Neuroglancer telling ITSELF which reader to
     use; Python's zarr/fsspec take the bare URL. Also strips the v2/v3-pinning variants
     ("zarr2://", "zarr3://") that appear on a few rows -- same prefix convention, same removal,
     and the version is then discovered from the store rather than asserted. */
  function bareUrl(src){
    return String(src || "").replace(/^zarr[23]?:\/\//, "");
  }

  var PY_OPEN =
`# ---------------------------------------------------------------------------------------------
# Opening one layer, without assuming anything about how it is laid out.
#
# Two very different hosts are in play across this roster:
#   s3://janelia-cosem-datasets/...   OpenOrganelle, public S3, anonymous
#   https://<host>/data/zarr/<id>/<layer>   a WEBKNOSSOS data store, plain HTTP, no account
# fsspec handles both from the URL alone, so nothing here branches on which one it is.
#
# What we do NOT assume: the zarr version, the names of the multiscale levels, or the voxel size.
# All three are read from the store.
def open_layer(url):
    import zarr, fsspec
    if url.startswith("s3://"):
        store = fsspec.get_mapper(url, anon=True)      # anonymous -- these buckets need no keys
    else:
        store = fsspec.get_mapper(url)
    g = zarr.open(store, mode="r")
    return g

def multiscale_levels(g):
    """Every array in this group that could be a resolution level, finest first.

    Preference order:
      1. OME-NGFF 'multiscales' metadata, which names the datasets AND their voxel sizes. This is
         what both OpenOrganelle and WEBKNOSSOS write, and when it is present it is authoritative.
      2. Failing that, every array in the group, sorted by size, largest first -- a fallback that
         is right for any pyramid whose finest level is its biggest array, which is all of them.
    The fallback exists because a group with no OME metadata should still be downloadable rather
    than producing 'this dataset is not supported'."""
    attrs = dict(g.attrs)
    ms = attrs.get("multiscales")
    out = []
    if ms:
        try:
            entry = ms[0]
            axes = entry.get("axes")
            for ds in entry.get("datasets", []):
                path = ds["path"]
                scale = None
                for t in ds.get("coordinateTransformations", []) or []:
                    if t.get("type") == "scale":
                        scale = list(t.get("scale"))
                # older OME writes the scale on the multiscales entry instead of per dataset
                if scale is None:
                    for t in entry.get("coordinateTransformations", []) or []:
                        if t.get("type") == "scale":
                            scale = list(t.get("scale"))
                out.append({"path": path, "scale": scale, "axes": axes})
        except Exception as e:
            print("  ! multiscales metadata present but unreadable (", e, ") -- falling back to array listing")
            out = []
    if not out:
        for key in list(g.array_keys()):
            out.append({"path": key, "scale": None, "axes": None})
        out.sort(key=lambda d: -int(np.prod(g[d["path"]].shape)))
    return out

def describe(g, levels, label):
    print(label)
    print("  zarr format :", getattr(g, "metadata", None).zarr_format if hasattr(g, "metadata") else "?")
    print("  arrays      :", list(g.array_keys()))
    print("  groups      :", list(g.group_keys()))
    for lv in levels:
        a = g[lv["path"]]
        print("   level %-12s shape=%-24s dtype=%-8s scale=%s"
              % (lv["path"], str(a.shape), str(a.dtype), lv["scale"]))
`;

  var PY_AXES =
`# ---------------------------------------------------------------------------------------------
# Axis order, which is the single easiest thing to get silently wrong here.
#
# ωJump stores shape, origin and res_nm as (z, y, x) -- its own convention, stated in
# wjump_config.js. A zarr array's axes are whatever the OME metadata says, and for these volumes
# that is usually ["z","y","x"] but is not guaranteed to be. Rather than trusting either, the axis
# names are read when present and used to build the index order; when absent, (z,y,x) is assumed
# AND SAID SO, so a wrong assumption shows up in the printout rather than in a silently transposed
# cutout that looks like a plausible piece of tissue rotated 90 degrees.
def axis_order(level, ndim):
    names = None
    if level.get("axes"):
        try:
            names = [ (a["name"] if isinstance(a, dict) else str(a)).lower() for a in level["axes"] ]
        except Exception:
            names = None
    if names and len(names) == ndim and set("xyz") <= set(names):
        return names, True
    return (["z","y","x"][-ndim:], False)

def nm_box_to_slices(level, arr, box_nm, cfg_res_zyx):
    """Physical nm box -> a tuple of slices into THIS array, using THIS level's own scale."""
    names, from_meta = axis_order(level, arr.ndim)
    scale = level.get("scale")
    if scale and len(scale) == arr.ndim:
        res = {names[i]: float(scale[i]) for i in range(arr.ndim)}
    else:
        # No scale in the metadata: fall back to what the app believes, and say so loudly.
        res = {"z": float(cfg_res_zyx[0]), "y": float(cfg_res_zyx[1]), "x": float(cfg_res_zyx[2])}
        print("  ! no voxel size in this level's metadata -- using wJump's configured",
              cfg_res_zyx, "(z,y,x) nm. If the cutout looks like the wrong region, this is why.")
    lo_nm = {"x": box_nm["xmin"], "y": box_nm["ymin"], "z": box_nm["zmin"]}
    hi_nm = {"x": box_nm["xmax"], "y": box_nm["ymax"], "z": box_nm["zmax"]}
    sl, shape_out = [], []
    for i, nm in enumerate(names):
        if nm not in ("x", "y", "z"):
            sl.append(slice(None)); shape_out.append(arr.shape[i]); continue
        r = res[nm]
        a = max(0, int(np.floor(lo_nm[nm] / r)))
        b = min(arr.shape[i], int(np.ceil(hi_nm[nm] / r)))
        if b <= a:
            b = min(arr.shape[i], a + 1)
        sl.append(slice(a, b)); shape_out.append(b - a)
    return tuple(sl), names, shape_out, from_meta, res
`;

  /* opts: {
       datasetId, datasetLabel : strings
       emSource   : ωJump's own source string for the EM layer (zarr:// form; stripped here)
       segSource  : same for the segmentation layer, or "" when this volume has none
       resNmZYX   : [z,y,x] nm/voxel from wjump_config.js -- passed as a CROSS-CHECK against what
                    the store reports, never as the thing that decides the cutout
       boxNM      : {xmin,xmax,ymin,ymax,zmin,zmax} physical nanometres
       boxLabel   : "Box 1"
       include    : {em, seg}
     } */
  function buildNotebook(opts){
    var box = opts.boxNM;
    var dims = [box.xmax-box.xmin, box.ymax-box.ymin, box.zmax-box.zmin];
    var inc = opts.include || {};
    var wantEM = inc.em !== false;
    var wantSeg = inc.seg === true && !!opts.segSource;
    var cells = [];

    var parts = [];
    if (wantEM) parts.push("EM imagery");
    if (wantSeg) parts.push("segmentation");
    var partsText = parts.length ? parts.join(" and ")
      : "nothing (no layer was selected -- regenerate with at least one ticked)";

    cells.push(mdCell(
`# ${opts.datasetLabel} — region download

Generated by ωJump's "Colab notebook for this box" button for **${opts.boxLabel}** of
\`${opts.datasetId}\`.

Bounding box (physical nanometres):
- X: ${box.xmin.toFixed(0)} to ${box.xmax.toFixed(0)} (${(dims[0]/1000).toFixed(2)} µm)
- Y: ${box.ymin.toFixed(0)} to ${box.ymax.toFixed(0)} (${(dims[1]/1000).toFixed(2)} µm)
- Z: ${box.zmin.toFixed(0)} to ${box.zmax.toFixed(0)} (${(dims[2]/1000).toFixed(2)} µm)

This downloads ${partsText} for that box. Run every cell in order (**Runtime → Run all**); the
last cell zips what was fetched and offers it as a download.

### What this notebook does not assume

ωJump's volumes are OME-Zarr — the OpenOrganelle blocks on public S3, the rest streamed from a
WEBKNOSSOS data store — rather than the Neuroglancer *precomputed* format the other Jump tools
download through \`cloud-volume\`. Zarr layouts vary between publishers, so instead of assuming a
level naming scheme or a voxel size, the "Inspect" cell below **opens the layer and prints what is
actually there**: the zarr version, the arrays present, each level's shape and its voxel size from
the OME metadata. Read that output before running the fetch cells — it is also the point at which
a wrong URL announces itself, rather than forty cells later.

It also **cross-checks the voxel size** the store reports against the one ωJump has recorded for
this dataset. If those disagree, one of the two is wrong and the difference matters: ωJump places
every search box using its own figure, so a mismatch means the app has been sending people to the
wrong coordinates in this volume. The notebook prints a clear warning rather than quietly
preferring one.

*Neither host is reachable from where this notebook was generated, so the discovery and the
cross-check are how it is verified — on your machine, on every run.*`));

    cells.push(codeCell("!pip install -q zarr fsspec aiohttp s3fs tifffile"));

    cells.push(mdCell("## Parameters\n\nEverything specific to this box and dataset. Nothing below needs editing unless you want a different chunk budget."));
    cells.push(codeCell(
`import numpy as np

DATASET_ID  = ${pyStr(opts.datasetId)}
EM_URL      = ${pyStr(bareUrl(opts.emSource))}
SEG_URL     = ${pyStr(bareUrl(opts.segSource || ""))}

BOX_NM = {
    "xmin": ${pyNum(box.xmin)}, "xmax": ${pyNum(box.xmax)},
    "ymin": ${pyNum(box.ymin)}, "ymax": ${pyNum(box.ymax)},
    "zmin": ${pyNum(box.zmin)}, "zmax": ${pyNum(box.zmax)},
}

# What wJump believes this volume's finest voxel size is, in (z, y, x) nanometres. Used ONLY as a
# cross-check against what the store reports, and as a last-resort fallback if a level carries no
# scale metadata at all. The store wins wherever it has an opinion.
CFG_RES_ZYX = ${pyList(opts.resNmZYX || [])}

# One z-slab at a time, so peak memory stays near the size of a slab rather than the whole box and
# no box size has to be refused up front. Lower it if a runtime still runs out; raise it for fewer,
# larger, faster reads.
CHUNK_BUDGET_GB = 1.5

print("dataset :", DATASET_ID)
print("EM      :", EM_URL)
print("seg     :", SEG_URL or "(this volume publishes none)")
print("box     : %.2f x %.2f x %.2f um" % (
    (BOX_NM["xmax"]-BOX_NM["xmin"])/1000,
    (BOX_NM["ymax"]-BOX_NM["ymin"])/1000,
    (BOX_NM["zmax"]-BOX_NM["zmin"])/1000))`));

    cells.push(mdCell("## Helpers — opening a layer and finding its levels"));
    cells.push(codeCell(PY_OPEN));
    cells.push(codeCell(PY_AXES));

    cells.push(mdCell(
`## Inspect before fetching

**Read this output.** It is the answer to "is this URL right, which level am I about to download,
and does its voxel size agree with the app". Nothing has been fetched yet at this point beyond a
few metadata files.`));
    cells.push(codeCell(
`g_em = open_layer(EM_URL)
lv_em = multiscale_levels(g_em)
describe(g_em, lv_em, "EM layer: " + EM_URL)

def check_res(levels, label):
    """Compare the finest level's voxel size against wJump's configured one, and say plainly if
    they differ. Not an exception: a mismatch may well mean the config is the wrong one, and
    stopping here would prevent the very download that would let you see which."""
    if not levels or not levels[0].get("scale") or not CFG_RES_ZYX:
        print("  (no cross-check possible for %s -- one side has no voxel size)" % label); return
    names, _ = axis_order(levels[0], len(levels[0]["scale"]))
    got = {names[i]: float(levels[0]["scale"][i]) for i in range(len(names))}
    want = {"z": float(CFG_RES_ZYX[0]), "y": float(CFG_RES_ZYX[1]), "x": float(CFG_RES_ZYX[2])}
    bad = [k for k in "zyx" if k in got and abs(got[k] - want[k]) > 0.01 * max(1.0, want[k])]
    if bad:
        print()
        print("  *** VOXEL SIZE DISAGREEMENT on %s, axes %s ***" % (label, ",".join(bad)))
        print("      store says  (z,y,x) =", [got.get(k) for k in "zyx"])
        print("      wJump says  (z,y,x) =", [want[k] for k in "zyx"])
        print("      The cutout below uses the STORE's numbers, which are the ones that describe")
        print("      these actual voxels. But wJump places its search boxes with its own figure,")
        print("      so if the store is right then this dataset's boxes in the app are in the")
        print("      wrong place and its row in wjump_config.js needs correcting. Worth telling")
        print("      Soren either way -- this check exists precisely to catch it.")
    else:
        print("  voxel size agrees with wJump's config:", [got.get(k) for k in "zyx"], "(z,y,x) nm")

check_res(lv_em, "EM")`));

    if (wantSeg){
      cells.push(codeCell(
`g_seg = open_layer(SEG_URL)
lv_seg = multiscale_levels(g_seg)
describe(g_seg, lv_seg, "Segmentation layer: " + SEG_URL)
check_res(lv_seg, "segmentation")`));
    }

    cells.push(mdCell(
`## Slab-wise fetch

Chunked along z so that peak memory is the size of one slab rather than of the whole box — the
same approach the other Jump tools' notebooks settled on after two attempts at predicting whole-box
memory in advance both got it wrong in opposite directions.

Every TIFF is written with \`bigtiff=True\`. Classic TIFF carries 32-bit offsets and dies with
\`'I' format requires 0 <= number <= 4294967295\` once the *file* passes ~4 GB, which is unrelated
to how carefully memory is managed. BigTIFF is read by FIJI/ImageJ exactly like any other .tif, so
there is no reason to use it only where it is known in advance to be needed.`));
    cells.push(codeCell(
`import tifffile, os

def fetch_to_tiff(g, levels, out_path, box_nm, bytes_per_voxel, label):
    lv = levels[0]
    arr = g[lv["path"]]
    sl, names, out_shape, from_meta, res = nm_box_to_slices(lv, arr, box_nm, CFG_RES_ZYX)
    print("%s: level %s, axes %s%s" % (label, lv["path"], names,
          "" if from_meta else " (assumed -- not stated in the metadata)"))
    print("   slices", sl, "-> shape", out_shape, "dtype", arr.dtype)
    if any(s == 0 for s in out_shape):
        print("   !! the box does not overlap this volume -- nothing to write."); return None
    zi = names.index("z") if "z" in names else 0
    plane = max(1, int(np.prod([s for i, s in enumerate(out_shape) if i != zi])))
    zchunk = max(1, int(CHUNK_BUDGET_GB * 1e9 / (plane * bytes_per_voxel)))
    z0, z1 = sl[zi].start, sl[zi].stop
    print("   %d z-slices, %d per chunk" % (z1 - z0, zchunk))
    with tifffile.TiffWriter(out_path, bigtiff=True) as tw:
        for a in range(z0, z1, zchunk):
            b = min(z1, a + zchunk)
            s = list(sl); s[zi] = slice(a, b)
            block = np.asarray(arr[tuple(s)])
            tw.write(block, contiguous=True)
            print("   ...%d/%d" % (b - z0, z1 - z0))
    print("   wrote", out_path, "(%.1f MB)" % (os.path.getsize(out_path) / 1e6))
    return out_path

written = []`));

    if (wantEM){
      cells.push(mdCell("## EM cutout"));
      cells.push(codeCell(
`p = fetch_to_tiff(g_em, lv_em, "em_cutout.tif", BOX_NM, 2, "EM")
if p: written.append(p)`));
    }

    if (wantSeg){
      cells.push(mdCell(
`## Segmentation cutout

Segment IDs in these volumes are large integers that FIJI/ImageJ cannot show as a label image, so
the saved TIFF uses small sequential label numbers and \`segmentation_label_lookup.csv\` maps each
one back to its real ID. The remap is built in a first pass over the whole box before writing, so
the same cell keeps the same label number in every slab — a per-slab numbering would give one cell
several different labels down the stack, which looks like a segmentation error and is not one.`));
      cells.push(codeCell(
`import csv

def fetch_segmentation(g, levels, out_path, lookup_path, box_nm):
    lv = levels[0]; arr = g[lv["path"]]
    sl, names, out_shape, from_meta, res = nm_box_to_slices(lv, arr, box_nm, CFG_RES_ZYX)
    print("segmentation: level %s, axes %s -> shape %s, dtype %s" % (lv["path"], names, out_shape, arr.dtype))
    if any(s == 0 for s in out_shape):
        print("   !! the box does not overlap this volume -- nothing to write."); return None
    zi = names.index("z") if "z" in names else 0
    plane = max(1, int(np.prod([s for i, s in enumerate(out_shape) if i != zi])))
    zchunk = max(1, int(CHUNK_BUDGET_GB * 1e9 / (plane * 20)))
    z0, z1 = sl[zi].start, sl[zi].stop

    print("   pass 1/2 -- collecting the distinct ids in this box")
    ids = set()
    for a in range(z0, z1, zchunk):
        b = min(z1, a + zchunk)
        s = list(sl); s[zi] = slice(a, b)
        ids.update(np.unique(np.asarray(arr[tuple(s)])).tolist())
    ids.discard(0)
    ordered = sorted(ids)
    remap = {v: i + 1 for i, v in enumerate(ordered)}     # 0 stays 0 = background
    print("   %d distinct segments in this box" % len(ordered))
    with open(lookup_path, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["label_in_tiff", "segment_id"])
        for v in ordered: w.writerow([remap[v], v])

    dtype = np.uint16 if len(ordered) < 65535 else np.uint32
    print("   pass 2/2 -- remapping and writing as", dtype.__name__)
    with tifffile.TiffWriter(out_path, bigtiff=True) as tw:
        for a in range(z0, z1, zchunk):
            b = min(z1, a + zchunk)
            s = list(sl); s[zi] = slice(a, b)
            block = np.asarray(arr[tuple(s)])
            out = np.zeros(block.shape, dtype=dtype)
            for v, lab in remap.items():
                out[block == v] = lab
            tw.write(out, contiguous=True)
            print("   ...%d/%d" % (b - z0, z1 - z0))
    print("   wrote", out_path, "and", lookup_path)
    return out_path

p = fetch_segmentation(g_seg, lv_seg, "segmentation_cutout.tif", "segmentation_label_lookup.csv", BOX_NM)
if p: written.extend([p, "segmentation_label_lookup.csv"])`));
    }

    cells.push(mdCell("## Zip and download"));
    cells.push(codeCell(
`import zipfile
name = "%s_%s.zip" % (DATASET_ID, ${pyStr((opts.boxLabel || "box").replace(/\s+/g, "_"))})
if not written:
    print("Nothing was written -- see the messages above.")
else:
    with zipfile.ZipFile(name, "w", zipfile.ZIP_DEFLATED) as z:
        for f in written:
            z.write(f)
    print("zipped:", written, "->", name)
    try:
        from google.colab import files; files.download(name)
    except Exception:
        print("(not on Colab -- take", name, "from the file browser)")`));

    return {
      cells: cells,
      metadata: {
        kernelspec: {name:"python3", display_name:"Python 3"},
        language_info: {name:"python"},
        colab: {name: (opts.datasetId || "region") + "_" + (opts.boxLabel || "box").replace(/\s+/g, "_") + ".ipynb", provenance: []}
      },
      nbformat: 4, nbformat_minor: 0
    };
  }

  function downloadNotebook(opts){
    var nb = buildNotebook(opts);
    var filename = (opts.datasetId || "region") + "_" + (opts.boxLabel || "box").replace(/\s+/g, "_") + ".ipynb";
    var blob = new Blob([JSON.stringify(nb, null, 1)], {type:"application/json"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  return { buildNotebook: buildNotebook, downloadNotebook: downloadNotebook, _bareUrl: bareUrl };
})();
