# -*- coding: utf-8 -*-
u"""A bucket without CORS is read through Google's JSON API.                     2026-09-21

Stage F of the tracing card's port, first slice, and the one that unblocks both βJump and ηJump.

── WHAT WAS MEASURED, in Søren's browser from grubblab.com, 2026-09-20 ─────────────

    fetch("https://storage.googleapis.com/vclem-xh/alzheimers/em_clahe/info")
        -> TypeError: Failed to fetch                    <- the bucket sends no CORS headers
    fetch("https://storage.googleapis.com/storage/v1/b/vclem-xh/o/alzheimers%2Fem_clahe%2Finfo?alt=media")
        -> 200                                           <- the JSON API does
    the same form on a real .shard object with a Range header
        -> 206, on a 113,007,595-byte shard              <- so the sharded reader works through it

βJump's mesh and synapse readers already knew this — `meshBaseAlt`, `volumeBaseAlt` — but each
as a hand-encoded BASE STRING. That shape cannot work for segread, and the probe proved it: a
rewrite that encoded the base and appended `/16.0x16.0x30.0/07.shard` unencoded drew a flat grey
canvas from zero chunks. **The JSON API wants the whole object name as ONE percent-encoded path
segment**, and segread appends `/key/shard` to its base — so the alternative is a URL builder that
sees the full object path, not a second base.

── WHAT CHANGED ──────────────────────────────────────────────────────────────────────

core/segread.js has ONE place a URL is made now, `urlOf(base, path)`, and the three sites that
concatenated strings — info, the unsharded chunk, the shard — all go through it. By default it is
`base + "/" + path`, byte-identical to before, so every page that does not ask is unchanged.

A page names the buckets that need the other route: `UJ.segread.useJsonApi("vclem-xh")`. CORS is a
property of a bucket, so that is what is named — not a dataset, not a URL prefix. Module-wide on
purpose: core/emtiles.js reads through segread's own fetchers and never configures it, and the
tracing card configures emtiles in four places of its own, so a setting that had to travel with a
`configure()` call would be one that some path forgot.

A URL already on the JSON API is left alone, so a page that hands segread a hand-built alt base
still works.

Run: python3 src/a_bucket_without_cors_is_read_through_the_json_api.py
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs, marker=None):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    if marker and marker in s:
        for name, _o, _n in pairs:
            print("  already there: " + name)
        return
    before = s
    for name, old, new in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + name)
            continue
        n = s.count(old)
        assert n == 1, "%s / %s: anchor found %d times" % (rel, name, n)
        s = s.replace(old, new, 1)
        print("  ok: " + name)
    if s != before:
        io.open(p, "w", encoding="utf-8").write(s)


HELPER_OLD = u'''  function isGraphene(src){ return /^graphene:\\/\\//.test(String(src || "")); }'''

HELPER_NEW = u'''  function isGraphene(src){ return /^graphene:\\/\\//.test(String(src || "")); }

  /* ── A BUCKET WITHOUT CORS ───────────────────────────────────────────────────  2026-09-21
     gs://vclem-xh (βJump's Alzheimer's vCLEM, and ηJump's H01) sends no CORS headers, so the
     browser refuses the ordinary public URL: `TypeError: Failed to fetch`. Google's JSON API serves
     the same object WITH them, and honours Range — measured 206 on a 113 MB shard.

     THE WHOLE OBJECT NAME IS ONE ENCODED SEGMENT there, `/b/<bucket>/o/<a%2Fb%2Fc>?alt=media`, and
     this file appends `/key/shard` to a base — which is why this is a URL BUILDER that sees the full
     path, and not a second base string like βJump's meshBaseAlt. A probe that encoded only the
     base drew a flat grey canvas from zero chunks.

     Named per BUCKET, because CORS is a bucket's property. Module-wide, because core/emtiles.js
     reads through this file's fetchers without ever configuring it. Default: no bucket, and
     urlOf() is `base + "/" + path`, byte for byte what the three call sites built before. */
  var GCS = "https://storage.googleapis.com/";
  var JSON_API = {};
  function useJsonApi(bucket){ if (bucket) JSON_API[String(bucket)] = true; }
  function urlOf(base, path){
    var full = base + "/" + path;
    if (full.indexOf(GCS) !== 0 || full.indexOf(GCS + "storage/v1/") === 0) return full;
    var rest = full.slice(GCS.length), cut = rest.indexOf("/");
    if (cut < 0 || !JSON_API[rest.slice(0, cut)]) return full;
    return GCS + "storage/v1/b/" + rest.slice(0, cut) + "/o/"
         + encodeURIComponent(rest.slice(cut + 1)) + "?alt=media";
  }'''

INFO_OLD = u'''      infoCache[base] = fetch(base + "/info", { cache: "force-cache" }).then(function(r){'''
INFO_NEW = u'''      infoCache[base] = fetch(urlOf(base, "info"), { cache: "force-cache" }).then(function(r){'''

UNSH_OLD = u'''    var url = base + "/" + scale.key + "/"
            + at.start[0] + "-" + at.end[0] + "_"'''
UNSH_NEW = u'''    var url = urlOf(base, scale.key + "/"
            + at.start[0] + "-" + at.end[0] + "_"'''
UNSH2_OLD = u'''            + at.start[2] + "-" + at.end[2];
    if (!chunkCache[url]) chunkCache[url] = (async function(){'''
UNSH2_NEW = u'''            + at.start[2] + "-" + at.end[2]);
    if (!chunkCache[url]) chunkCache[url] = (async function(){'''

SH_OLD = u'''    var url = base + "/" + scale.key + "/"
            + shard.toString(16).padStart(Math.ceil(sh.shard_bits / 4), "0") + ".shard";'''
SH_NEW = u'''    var url = urlOf(base, scale.key + "/"
            + shard.toString(16).padStart(Math.ceil(sh.shard_bits / 4), "0") + ".shard");'''

EXP_OLD = u'''  return { configure: configure, configured: configured,
           nucleusAt: nucleusAt, segmentAt: segmentAt, resolveAt: resolveAt,'''
EXP_NEW = u'''  return { configure: configure, configured: configured, useJsonApi: useJsonApi,
           _urlOf: urlOf,
           nucleusAt: nucleusAt, segmentAt: segmentAt, resolveAt: resolveAt,'''

print("core/segread.js")
edit("core/segread.js", [
    (u"one place a URL is made, and the buckets that need the JSON API", HELPER_OLD, HELPER_NEW),
    (u"...the info file goes through it", INFO_OLD, INFO_NEW),
    (u"...the unsharded chunk (head)", UNSH_OLD, UNSH_NEW),
    (u"...the unsharded chunk (tail)", UNSH2_OLD, UNSH2_NEW),
    (u"...and the shard", SH_OLD, SH_NEW),
    (u"...and a page can name its bucket", EXP_OLD, EXP_NEW),
], marker=u"A BUCKET WITHOUT CORS")
