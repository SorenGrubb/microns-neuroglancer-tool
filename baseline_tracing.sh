#!/bin/sh
# The checks that exercise the tracing subsystem directly.                          2026-09-20
#
# Run before an extraction, run after, diff the two outputs: anything that moved is the
# extraction's fault. Written for the core/tracingcard.js extraction, which moves ~3,300 lines out
# of ujump.html and must change nothing.
#
# NOT every check that mentions ujump.html. There are 61 of those and they take about three hours
# on this machine -- measured, two checks in six minutes -- which is not a gate anybody runs twice.
# These twenty-five are the ones that drive the pad, the link reader, the lofts, the volumes, the
# drafts and the organelle read-back for real.
#
# KNOWN RED BEFORE ANY OF THIS: volrowcheck, 3 of 25, all three the same assertion
# ("...and the button is gone, which it always was"). A diff against the recorded baseline is the
# check, not a count of zeros.
cd "$(dirname "$0")" || exit 1
for c in tracingcheck tracingpanelcheck tracepadcheck traceloftcheck tracingidcheck \
         tracingnumbercheck tracingcarrycheck tracinglayerscheck tracingpreviewcheck \
         padholecheck draftlistcheck draftsynccheck organallcheck organjumpcheck \
         organcountcheck organcardcheck emplanecheck emtilescheck segreadcheck segpaintcheck \
         volboxcheck volrowcheck volfreezecheck savenotecheck seedannotcheck; do
  if [ ! -f "$c.js" ]; then printf "%-22s (missing)\n" "$c"; continue; fi
  r=$(timeout 175 node "$c.js" 2>&1 | grep -E "^RESULT|^all good|^all passed|FAILED" | tail -1)
  [ -z "$r" ] && r="(no verdict line)"
  printf "%-22s %s\n" "$c" "$r"
done
