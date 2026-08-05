"""
One-time companion backfill CSV for the "Master cell list" Google Sheet tab (2026-08-08) -- Soren:
"How come I can only count 9 points in the dashboard graph for Dural border cells primary cilium
length, when I can see in the graph above that 79/419 cells have a primary cilium?"

ROOT CAUSE (see Code.gs.txt's own 2026-08-02 bugfix comment on safeNumGs()): when
master_cell_list_seed.csv was first imported into Google Sheets, Sheets' "convert text to numbers,
dates and formulas automatically" auto-detection ran under Soren's Danish-locale spreadsheet, which
reads a bare decimal-looking string like "2.59" as a European D.M date ("2. juni") rather than a
number, silently storing a Date object in that cell instead of a number. has_cilium/cilium_checked
(plain "1"/blank flags) were never at risk -- only the DECIMAL columns were: cilium_length_um,
centriole_dist_um, nucleus_volume_um3. safeNumGs() in Code.gs.txt was already patched to treat a
Date cell as "no data" instead of returning its epoch-millisecond garbage (previously showed as
e.g. "-2 trillion um" on these charts) -- but that only stops the garbage from DISPLAYING; the
underlying Sheet cell is still wrong, so the value is silently missing from every chart instead.

This script re-derives all 3 numeric columns fresh from ujump.html's own embedded data (the exact
same source build_master_cell_list.py used, never touched by the Sheets import bug) and writes a
small companion CSV: cell_key + the 3 numeric columns only, for every row that has at least one of
them. Code.gs.txt's backfillNumericObservations() joins this onto "Master cell list" by cell_key
and writes each value with Range.setValue(number) -- which sets a genuine numeric cell type
directly via the Sheets API, completely bypassing the CSV-import text-parsing/date-detection that
caused the original corruption. This is a SEPARATE small CSV, not a full seed re-import, for the
same reason build_root_id_backfill.py is separate: the live "Master cell list" sheet has already
accumulated real report-driven updates (current_identity, community_top_identity, etc.) since its
original seed, and a full re-import would silently revert all of that.

IMPORTANT for Soren when importing this CSV as a new sheet tab: uncheck "Convert text to numbers,
dates, and formulas automatically" in the import dialog. This import doesn't strictly need to
survive as numbers itself (backfillNumericObservations() re-parses with parseFloat() and writes
real numbers to the TARGET sheet regardless of how this source sheet's cells got typed) -- but
leaving auto-convert ON risks the exact same date-misparse happening again on THIS sheet, silently
turning some of these values into Date objects before the backfill function ever sees them.
Unchecking it costs nothing and removes that risk entirely.

Run: python3 build_numeric_observations_backfill.py
Output: /tmp/numeric_observations_backfill.csv
"""
import csv

SEED = "/sessions/optimistic-intelligent-carson/mnt/MICrONS cell classifier/microns-neuroglancer-tool/dashboard-data-tools/master_cell_list_seed.csv"
OUT = "/tmp/numeric_observations_backfill.csv"

n_total = 0
n_written = 0
with open(SEED, newline='', encoding='utf-8') as f, open(OUT, "w", newline='', encoding='utf-8') as outf:
    r = csv.DictReader(f)
    w = csv.writer(outf)
    w.writerow(["cell_key", "cilium_length_um", "centriole_dist_um", "nucleus_volume_um3"])
    for row in r:
        n_total += 1
        cl = row.get("cilium_length_um", "")
        cd = row.get("centriole_dist_um", "")
        nv = row.get("nucleus_volume_um3", "")
        if not (cl or cd or nv):
            continue
        w.writerow([row["cell_key"], cl, cd, nv])
        n_written += 1

print("total seed rows:", n_total)
print("rows written (at least one numeric value present):", n_written)
