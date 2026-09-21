# -*- coding: utf-8 -*-
u"""Writes the Zarr stores zarrreadcheck.js reads, one per shape ωJump's volumes come in.   2026-09-21

Every voxel's value is a function of where it is, so the check can say which voxel it read:

    em(x, y, z)  = (x + 3*y + 7*z) % 256          (uint8)
    em16(x,y,z)  = 30000 + x + 10*y + 100*z       (uint16)
    seg(x, y, z) = 864691135000000000 + x + 1000*y + 1000000*z   (uint64)

Written with the real encoders -- zstandard, numcodecs.Blosc -- so a decoder that agrees with this
file agrees with the formats, not with itself. Output: fixtures/zarr_fixtures.json, {path: base64}.

Run: python3 fixtures/make_zarr_fixtures.py
"""
import base64, json, os, struct
import numpy as np, zstandard
from numcodecs import Blosc

OUT = {}
def put(path, data):
    if isinstance(data, (dict, list)): data = json.dumps(data).encode()
    OUT[path] = base64.b64encode(data).decode()

def field(shape_xyz, f, dtype):
    X, Y, Z = shape_xyz
    a = np.zeros((X, Y, Z), dtype=dtype)
    for x in range(X):
        for y in range(Y):
            for z in range(Z):
                a[x, y, z] = f(x, y, z)
    return a
em   = lambda x, y, z: (x + 3 * y + 7 * z) % 256
em16 = lambda x, y, z: 30000 + x + 10 * y + 100 * z
seg  = lambda x, y, z: 864691135000000000 + x + 1000 * y + 1000000 * z

def chunks_of(a_xyz, ch):                         # yields (cx, cy, cz, block) with FULL-size blocks
    X, Y, Z = a_xyz.shape
    for cx in range(-(-X // ch[0])):
        for cy in range(-(-Y // ch[1])):
            for cz in range(-(-Z // ch[2])):
                b = np.zeros(ch, dtype=a_xyz.dtype)            # zarr chunks are always full size
                s = a_xyz[cx*ch[0]:(cx+1)*ch[0], cy*ch[1]:(cy+1)*ch[1], cz*ch[2]:(cz+1)*ch[2]]
                b[:s.shape[0], :s.shape[1], :s.shape[2]] = s
                yield cx, cy, cz, b

# ── 1. WEBKNOSSOS: v2, c,x,y,z, order F, uncompressed, key "0.i.j.k" ──────────────────────────
SH = (10, 6, 5); CH = (4, 4, 4)
put("wk/color/.zattrs", {"multiscales": [{"version": "0.4", "axes": [
    {"name": "c", "type": "channel"}, {"name": "x", "type": "space", "unit": "nanometer"},
    {"name": "y", "type": "space", "unit": "nanometer"}, {"name": "z", "type": "space", "unit": "nanometer"}],
    "datasets": [{"path": "1", "coordinateTransformations": [{"type": "scale", "scale": [1, 11.24, 11.24, 30]}]}]}]})
put("wk/color/1/.zarray", {"dtype": "|u1", "fill_value": 0, "zarr_format": 2, "order": "F",
    "chunks": [1] + list(CH), "compressor": None, "filters": None, "shape": [1] + list(SH),
    "dimension_separator": "."})
for cx, cy, cz, b in chunks_of(field(SH, em, np.uint8), CH):
    put("wk/color/1/0.%d.%d.%d" % (cx, cy, cz), np.asfortranarray(b[None]).tobytes(order="F"))
# a uint64 segmentation beside it
put("wk/seg/.zattrs", json.loads(base64.b64decode(OUT["wk/color/.zattrs"])))
put("wk/seg/1/.zarray", {"dtype": "<u8", "fill_value": 0, "zarr_format": 2, "order": "F",
    "chunks": [1] + list(CH), "compressor": None, "filters": None, "shape": [1] + list(SH),
    "dimension_separator": "."})
for cx, cy, cz, b in chunks_of(field(SH, seg, np.uint64), CH):
    if (cx, cy, cz) == (0, 0, 1): continue                     # never written == background
    put("wk/seg/1/0.%d.%d.%d" % (cx, cy, cz), b[None].tobytes(order="F"))
# and a uint16 one
put("wk/seg16/.zattrs", json.loads(base64.b64decode(OUT["wk/color/.zattrs"])))
put("wk/seg16/1/.zarray", {"dtype": "<u2", "fill_value": 0, "zarr_format": 2, "order": "F",
    "chunks": [1] + list(CH), "compressor": None, "filters": None, "shape": [1] + list(SH),
    "dimension_separator": "."})
for cx, cy, cz, b in chunks_of(field(SH, em16, np.uint16), CH):
    put("wk/seg16/1/0.%d.%d.%d" % (cx, cy, cz), b[None].tobytes(order="F"))

# ── 2. OpenOrganelle v2: z,y,x, order C, zstd, key "k/j/i", with a translated second level ─────
def oo_attrs(levels=2):
    m = {"multiscales": [{"axes": [{"name": n, "type": "space", "unit": "nanometer"} for n in "zyx"],
        "datasets": [{"path": "s0", "coordinateTransformations": [{"scale": [8, 8, 8], "type": "scale"},
                                                                 {"translation": [0, 0, 0], "type": "translation"}]},
                     {"path": "s1", "coordinateTransformations": [{"scale": [16, 16, 16], "type": "scale"},
                                                                 {"translation": [4, 4, 4], "type": "translation"}]}]}]}
    m["multiscales"][0]["datasets"] = m["multiscales"][0]["datasets"][:levels]
    return m
def zyx(b_xyz): return np.ascontiguousarray(np.transpose(b_xyz, (2, 1, 0)))
for name, comp, enc in [("oo", {"id": "zstd", "level": 6}, lambda raw: zstandard.ZstdCompressor(level=6).compress(raw)),
                        ("oob", {"id": "blosc", "cname": "zstd", "clevel": 9, "shuffle": 0, "blocksize": 0},
                         lambda raw: Blosc(cname="zstd", clevel=9, shuffle=0).encode(raw))]:
    put(name + "/.zattrs", oo_attrs())
    for lvl, sh in [("s0", SH), ("s1", (5, 3, 3))]:
        put("%s/%s/.zarray" % (name, lvl), {"chunks": list(CH[::-1]), "compressor": comp,
            "dimension_separator": "/", "dtype": "|u1", "fill_value": 0, "filters": None,
            "order": "C", "shape": list(sh[::-1]), "zarr_format": 2})
        for cx, cy, cz, b in chunks_of(field(sh, em, np.uint8), CH):
            put("%s/%s/%d/%d/%d" % (name, lvl, cz, cy, cx), enc(zyx(b).tobytes()))
# blosc WITH byte shuffle, on uint16 -- the case where the shuffle actually moves bytes
# Big enough that blosc really compresses: a tiny chunk is stored "memcpyed", shuffle and all skipped.
SHB, CHB = (24, 20, 18), (16, 16, 16)
put("oobs/.zattrs", oo_attrs(1))
put("oobs/s0/.zarray", {"chunks": list(CHB[::-1]), "compressor": {"id": "blosc", "cname": "zstd",
    "clevel": 5, "shuffle": 1, "blocksize": 0}, "dimension_separator": "/", "dtype": "<u2",
    "fill_value": 0, "filters": None, "order": "C", "shape": list(SHB[::-1]), "zarr_format": 2})
for cx, cy, cz, b in chunks_of(field(SHB, em16, np.uint16), CHB):
    put("oobs/s0/%d/%d/%d" % (cz, cy, cx), Blosc(cname="zstd", clevel=5, shuffle=Blosc.SHUFFLE).encode(zyx(b)))

# ── 3. OpenOrganelle v3: sharded, uint16, bytes -> zstd -> crc32c, index at the end with crc ───
SHARD = (8, 8, 8)
put("oo3/zarr.json", {"zarr_format": 3, "node_type": "group", "attributes": {"ome": {"version": "0.5",
    "multiscales": [{"axes": [{"name": n, "type": "space", "unit": "nanometer"} for n in "zyx"],
      "coordinateTransformations": [{"scale": [1.0, 1.0, 1.0], "type": "scale"}],
      "datasets": [{"path": "s0", "coordinateTransformations": [{"scale": [8, 8, 8], "type": "scale"},
                                                                {"translation": [0, 0, 0], "type": "translation"}]}]}]}}})
put("oo3/s0/zarr.json", {"chunk_grid": {"configuration": {"chunk_shape": list(SHARD)}, "name": "regular"},
    "chunk_key_encoding": {"name": "default"},
    "codecs": [{"configuration": {"chunk_shape": list(CH), "codecs": [
        {"configuration": {"endian": "little"}, "name": "bytes"},
        {"configuration": {"checksum": False, "level": 3}, "name": "zstd"}, {"name": "crc32c"}],
      "index_codecs": [{"configuration": {"endian": "little"}, "name": "bytes"}, {"name": "crc32c"}]},
      "name": "sharding_indexed"}],
    "data_type": "uint16", "fill_value": 0, "node_type": "array", "shape": list(SH[::-1]), "zarr_format": 3})
full = field(SH, em16, np.uint16)
per = [SHARD[i] // CH[i] for i in range(3)]                   # inner chunks per shard, x,y,z
for sx in range(-(-SH[0] // SHARD[0])):
    for sy in range(-(-SH[1] // SHARD[1])):
        for sz in range(-(-SH[2] // SHARD[2])):
            body, index = b"", []
            for iz in range(per[2]):                          # C order over z,y,x -- the array's axes
                for iy in range(per[1]):
                    for ix in range(per[0]):
                        cx, cy, cz = sx * per[0] + ix, sy * per[1] + iy, sz * per[2] + iz
                        if cx * CH[0] >= SH[0] or cy * CH[1] >= SH[1] or cz * CH[2] >= SH[2] or (cx, cy, cz) == (1, 1, 0):
                            index.append((2**64 - 1, 2**64 - 1)); continue
                        b = np.zeros(CH, dtype=np.uint16)
                        s = full[cx*4:cx*4+4, cy*4:cy*4+4, cz*4:cz*4+4]
                        b[:s.shape[0], :s.shape[1], :s.shape[2]] = s
                        piece = zstandard.ZstdCompressor(level=3).compress(zyx(b).tobytes()) + b"CRC!"
                        index.append((len(body), len(piece))); body += piece
            idx = b"".join(struct.pack("<QQ", o, n) for o, n in index) + b"CRC!"
            put("oo3/s0/c/%d/%d/%d" % (sz, sy, sx), body + idx)

here = os.path.dirname(os.path.abspath(__file__))
json.dump(OUT, open(os.path.join(here, "zarr_fixtures.json"), "w"))
print(len(OUT), "files")
