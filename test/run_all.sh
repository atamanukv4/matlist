#!/bin/sh
# Все проверки Матлиста: ядро, решатели, импорт/экспорт .xmcd, сценарии в браузере.
set -e
cd "$(dirname "$0")/.."
SHOTS=${1:-/tmp/matlist-shots}
node build.js
node test/engine.test.js | tail -1
node test/solvers.test.js | tail -1
node test/wsp.test.js | tail -1
node test/roundtrip.test.js | head -1
node test/units.test.js | tail -1
for t in ui_interact ui_edit ui_stage2 ui_system ui_save ui_plot ui_v04 ui_v05; do
  out=$(python3 test/$t.py "$SHOTS/$t" test/fixtures/test.png 2>&1)
  okn=$(printf '%s\n' "$out" | sed -n '/^OK:/,/^FAIL:/p' | grep -c '^  ' || true)
  bad=$(printf '%s\n' "$out" | sed -n '/^FAIL:/,$p' | grep -c '^  ' || true)
  echo "$t: ok=$okn fail=$bad"
  [ "$bad" = "0" ] || { printf '%s\n' "$out" | sed -n '/^FAIL:/,$p'; exit 1; }
done
