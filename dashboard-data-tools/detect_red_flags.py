"""
Checks every row of "All own data.xlsx" for red font/red fill formatting (Excel's standard "Bad"
cell style -- font FF9C0006 on fill FFFFC7CE -- plus literal pure red FFFF0000 font and a couple of
looser reddish fills FFFF9999/FFF59393 seen elsewhere in the file). Soren: "those of them that were
red text or red background in the all own data, I don't trust and should not be included" (about
the 462 new-cell candidates specifically, but this scans every row so it's reusable for any future
red-flag check on this file too).

Run: python3 detect_red_flags.py
Output: /tmp/dash/row_red_flags.pkl -- {row_number (1-indexed, matches the worksheet): is_red}
"""
import openpyxl
import pickle
import os

XLSX = "/sessions/optimistic-intelligent-carson/mnt/brain_cell_image_library/All own data.xlsx"

RED_FONTS = {"FF9C0006", "FFFF0000"}
RED_FILLS = {"FFFFC7CE", "FFFF9999", "FFF59393"}

def is_red(cell):
    f = cell.font
    if f and f.color and f.color.rgb and str(f.color.rgb) in RED_FONTS:
        return True
    fl = cell.fill
    if fl:
        for attr in ("fgColor", "start_color"):
            col = getattr(fl, attr, None)
            if col and col.rgb and str(col.rgb) in RED_FILLS:
                return True
    return False

wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
ws = wb["Sheet1"]

row_red = {}

for i, row in enumerate(ws.iter_rows(min_row=2), start=2):
    row_red[i] = any(is_red(c) for c in row)

print("Total data rows scanned:", len(row_red))
print("Rows with ANY red-flagged cell:", sum(1 for v in row_red.values() if v))

os.makedirs("/tmp/dash", exist_ok=True)
with open("/tmp/dash/row_red_flags.pkl", "wb") as f:
    pickle.dump(row_red, f)
print("saved /tmp/dash/row_red_flags.pkl")
