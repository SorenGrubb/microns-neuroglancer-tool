# =============================================================================
# µJump dashboard: "3 cell types with the most synaptic connections" -- data builder
# =============================================================================
# WHAT THIS DOES
# For each of the ~19 cell types in µJump, this samples up to 40 cells of that type,
# looks up ALL of their real synapses in MICrONS via CAVE (both the synapses they RECEIVE
# and the ones they MAKE), and tallies which cell types those synaptic partners belong to.
# The result is a small summary: "Pericytes' synaptic partners are mostly X, Y, Z" etc,
# for every cell type -- this is the data behind the dashboard's connectivity graph.
#
# WHY THIS RUNS HERE, NOT INSIDE µJump ITSELF
# Querying real synapses needs YOUR PERSONAL CAVE TOKEN (an auth credential), and querying
# thousands of synapses for hundreds of sampled cells takes a couple of minutes -- both are
# a poor fit for something that runs live in every visitor's browser. So this is a ONE-TIME
# (or occasional re-run) offline step: run it here, get one small JSON file out
# (connectivity_aggregate.json), then that file gets embedded into the dashboard, which is
# instant for every visitor after that. Your CAVE token is never seen by anyone else --
# it stays in this Colab session and is never written to the output file.
#
# HOW TO RUN THIS IN GOOGLE COLAB (step by step, since this is your first time)
#  1. Go to https://colab.research.google.com/ and choose "New notebook".
#  2. You'll see one empty grey box ("cell"). Click into it.
#  3. Copy this ENTIRE file's contents and paste it into that box.
#  4. On the LEFT side of the Colab window, click the folder icon (Files). Click the
#     upload icon (a page with an up-arrow) and upload "root_id_to_type.json" --
#     it was generated alongside this script, ask Claude for it if you don't have it.
#     (It's about 5 MB, so the upload takes a few seconds.)
#  5. Click the "play" triangle button next to the code box (or press Shift+Enter).
#     The first run will pause partway through and ask you to paste your CAVE token --
#     see STEP 2 below for how to get one if you don't already have one.
#  6. When it finishes (a couple of minutes), a file called "connectivity_aggregate.json"
#     will appear in the Files panel on the left. Right-click it -> Download, then send
#     that file back (or drop it in the same project folder as the dashboard).
#
# You do NOT need to understand every line below to run this -- just follow the numbered
# STEPs. Re-run the whole thing any time you want fresher/bigger sample data later.
# =============================================================================

# ---- STEP 1: install the CAVE client library (MICrONS' official Python API) ----
get_ipython().system('pip install --quiet caveclient')

import json, time, collections
from caveclient import CAVEclient

DATASTACK = "minnie65_public"
SYNAPSE_TABLE = "synapses_pni_2"

# ---- STEP 2: your CAVE token ----
# Paste your existing CAVE token into TOKEN = "..." below, between the quotes. It's saved
# only to this machine/session, never written to any file this script produces.
#
# IMPORTANT: CAVEclient(DATASTACK) (naming an actual dataset) tries to fetch that dataset's
# info immediately, which needs a token to already be set up -- creating it before a token
# exists fails with AuthException. So set up the token first with a BARE client (no dataset
# name), then create the real, dataset-specific client afterwards.
auth_client = CAVEclient()

TOKEN = "PASTE_YOUR_CAVE_TOKEN_HERE"  # <-- paste your token between the quotes
auth_client.auth.save_token(token=TOKEN, overwrite=True)

client = CAVEclient(DATASTACK)
print("Connected to", DATASTACK)

# ---- STEP 3: upload root_id_to_type.json (see the upload step above), then load it ----
try:
    from google.colab import files
    if "root_id_to_type.json" not in __import__("os").listdir("."):
        print("Please upload root_id_to_type.json now (Files panel, upload icon) ...")
        files.upload()
except ImportError:
    pass  # not running in Colab -- assume the file is already next to this script

with open("root_id_to_type.json") as f:
    ROOT_TO_TYPE = json.load(f)
print("Loaded", len(ROOT_TO_TYPE), "known cell identities.")

# ---- STEP 4: which cells to sample per type (generated alongside this script) ----
# Small enough to paste in directly -- ask Claude to regenerate this block if the µJump
# dataset changes later. Feel free to trim this list (e.g. keep only 10 per type) for a
# much faster first test run.
ROOT_IDS_BY_TYPE = json.load(open("root_ids_by_type_sample.json")) if \
    __import__("os").path.exists("root_ids_by_type_sample.json") else {}
if not ROOT_IDS_BY_TYPE:
    raise SystemExit("Please also upload root_ids_by_type_sample.json (same Files upload step as STEP 3).")

# ---- STEP 5: query real synapses for each sampled cell, batched per type ----
# For each cell type, one call asks CAVE for every synapse where any of that type's sampled
# cells is the PRESYNAPTIC (sending) side, and a second call asks for the POSTSYNAPTIC
# (receiving) side -- batching all ~40 sampled root IDs into one call each, rather than one
# call per cell, is much faster and gentler on CAVE's servers.
#
# NOTE: this has not been run against the live CAVE server while writing this script (this
# assistant's own sandbox cannot reach CAVE's API), so if `synapse_query`'s exact argument
# names have changed since, check the current signature with:
#     help(client.materialize.synapse_query)
# and adjust pre_ids=/post_ids= below to match. The MICrONS tutorial notebooks
# (https://tutorial.microns-explorer.org) are the reference if anything here errors.

# ---- Retry helper (added 2026-08-02) -----------------------------------------------------------
# The shared public CAVE server occasionally returns "503 Service Temporarily Unavailable" under
# load -- this is a SERVER-SIDE issue (nginx itself refusing the request, not an auth/query
# problem on our end), so a client-side fix can't prevent it, but it's usually transient and a
# few spaced-out retries often get through. Every synapse_query call below goes through this.
def query_with_retries(fn, *args, max_attempts=4, base_delay=8, **kwargs):
    last_err = None
    for attempt in range(max_attempts):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            last_err = e
            msg = str(e)
            transient = ("503" in msg or "502" in msg or "504" in msg or "timeout" in msg.lower()
                         or "Temporarily Unavailable" in msg or "ConnectionError" in type(e).__name__)
            if not transient or attempt == max_attempts - 1:
                raise
            wait = base_delay * (2 ** attempt)  # 8s, 16s, 32s by default
            print(f"    transient server error ({msg.splitlines()[0][:120]}) -- retrying in {wait}s "
                  f"(attempt {attempt + 2}/{max_attempts})...")
            time.sleep(wait)
    raise last_err  # pragma: no cover -- loop always returns or raises above

connectivity = {}   # source type -> Counter of partner type -> synapse count
partner_cells = {}  # source type -> Counter of partner type -> DISTINCT partner cell count
synapse_io = {}     # source type -> {input/output synapse totals + per-sampled-cell averages}
failed_types = []   # types that failed even after retries -- re-attempted once more at the end

def query_one_type(src_type, root_ids):
    """Returns True on success (fills connectivity/partner_cells/synapse_io for src_type),
    False if it failed even after retries (caller decides whether to note it as failed)."""
    root_ids_int = [int(r) for r in root_ids]
    syn_counter = collections.Counter()
    seen_partners = collections.defaultdict(set)

    try:
        out_df = query_with_retries(client.materialize.synapse_query, pre_ids=root_ids_int)   # synapses THIS type sends
        time.sleep(0.5)  # brief pause between the two queries for the same type
        in_df = query_with_retries(client.materialize.synapse_query, post_ids=root_ids_int)    # synapses THIS type receives
    except Exception as e:
        print("  Query failed for", src_type, "after retries --", e)
        return False

    for _, row in out_df.iterrows():
        partner = str(row["post_pt_root_id"])
        ptype = ROOT_TO_TYPE.get(partner)
        if ptype:
            syn_counter[ptype] += 1
            seen_partners[ptype].add(partner)

    for _, row in in_df.iterrows():
        partner = str(row["pre_pt_root_id"])
        ptype = ROOT_TO_TYPE.get(partner)
        if ptype:
            syn_counter[ptype] += 1
            seen_partners[ptype].add(partner)

    connectivity[src_type] = dict(syn_counter.most_common(10))
    partner_cells[src_type] = {k: len(v) for k, v in seen_partners.items()}
    # 2026-08-02: input/output synapse counts per type, added for the dashboard's new
    # "input vs output synapses per cell type" chart -- out_df/in_df are already fetched above
    # for the partner-type tally, so this just re-uses them rather than querying again.
    # len(root_ids_int) (not len(out_df)/len(in_df)) is the denominator for the per-cell
    # averages, since it's the actual sample size regardless of how many synapses turned up.
    n_sampled = len(root_ids_int)
    synapse_io[src_type] = {
        "n_sampled_cells": n_sampled,
        "output_synapses_total": int(len(out_df)),
        "input_synapses_total": int(len(in_df)),
        "avg_output_synapses_per_cell": round(len(out_df) / n_sampled, 1) if n_sampled else 0,
        "avg_input_synapses_per_cell": round(len(in_df) / n_sampled, 1) if n_sampled else 0,
    }
    return True

# ---- First pass over every type ----
for src_type, root_ids in ROOT_IDS_BY_TYPE.items():
    print("Querying synapses for", src_type, "(", len(root_ids), "sampled cells )...")
    if not query_one_type(src_type, root_ids):
        failed_types.append(src_type)
    time.sleep(1.5)  # be polite to the shared CAVE server between types (raised from 0.5s
                      # on 2026-08-02 after a run hit repeated 503s -- gentler pacing plus the
                      # retry helper above should make transient server load less disruptive)

# ---- Second pass: one more attempt at whatever failed, after a longer cool-down ----
# If the WHOLE first pass failed (e.g. the server was down for a few minutes), retrying
# immediately would likely just fail again -- wait longer once, then try the failed types again.
if failed_types:
    print(f"\n{len(failed_types)} type(s) failed in the first pass ({', '.join(failed_types)}) "
          f"-- waiting 90s then trying them once more...")
    time.sleep(90)
    still_failed = []
    for src_type in failed_types:
        print("Retrying", src_type, "...")
        if not query_one_type(src_type, ROOT_IDS_BY_TYPE[src_type]):
            still_failed.append(src_type)
        time.sleep(1.5)
    failed_types = still_failed

print(f"\nDone querying. {len(ROOT_IDS_BY_TYPE) - len(failed_types)} of {len(ROOT_IDS_BY_TYPE)} "
      f"types succeeded." + (f" Still failing after retries: {', '.join(failed_types)} -- "
      f"if this list isn't empty, the CAVE server may be down for longer than a couple of "
      f"minutes; wait a while and re-run just this cell (Steps 1-4 don't need to be redone in "
      f"the same Colab session)." if failed_types else ""))

# ---- STEP 6: save the result ----
out = {
    "note": "Synaptic partner-type tallies, sampled up to 40 cells per source type "
            "(fewer for rare types). by_synapse_count sums individual synapses; "
            "by_distinct_partner_cells counts unique partner cells once each regardless "
            "of how many synapses they share with the sampled cells. synapse_io (added "
            "2026-08-02) gives per-type input/output synapse totals AND per-sampled-cell "
            "averages for the same sample -- the average is the fairer cross-type comparison, "
            "since different cell types have very different sample sizes here.",
    "sample_size_per_type": {t: len(v) for t, v in ROOT_IDS_BY_TYPE.items()},
    "by_synapse_count": connectivity,
    "by_distinct_partner_cells": partner_cells,
    "synapse_io": synapse_io,
}
with open("connectivity_aggregate.json", "w") as f:
    json.dump(out, f, indent=2)
print("\nDone. Download connectivity_aggregate.json from the Files panel on the left")
print("(right-click it -> Download), then send it back to fold into the dashboard.")
