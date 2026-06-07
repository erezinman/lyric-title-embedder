#!/usr/bin/env bash
# run-tk-tests.sh — run the Tk UI suites headlessly.
# Uses xvfb-run when available (windows never touch the real display); the suites
# also self-withdraw, so a direct run won't pop windows either.
set -u
cd "$(dirname "$0")"
PY=.venv/bin/python
RUN() { "$@"; }
if command -v xvfb-run >/dev/null; then
  RUN() { xvfb-run -a "$@"; }
fi
fail=0
for f in tests/test_ui_persistence.py tests/test_ui_selection.py tests/test_ui_style.py \
         tests/test_ui_undo.py tests/test_v2_ui.py tests/test_mcp_ui.py; do
  out=$(RUN $PY "$f" 2>&1); rc=$?
  echo "== $f: $(echo "$out" | tail -1)"
  [ $rc -ne 0 ] && { fail=1; echo "$out" | tail -15; }
done
exit $fail
