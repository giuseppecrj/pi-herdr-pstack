#!/usr/bin/env bash
# Rerun: proves /skill:statechart checks a TLA+ fixture via tla-ts with java
# absent from PATH and without TLA2TOOLS/JAVA.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
fixture="$root/test/fixtures/statechart/Break.tla"
entry="$root/skills/statechart/scripts/statechart.ts"
node_bin=$(command -v node)
safe=$(mktemp -d)
outdir=$(mktemp -d)
out="$outdir/chart"
trap 'rm -rf -- "$safe" "$outdir"' EXIT
ln -s "$node_bin" "$safe/node"
for name in sh bash dirname readlink sed; do
  target=$(command -v "$name")
  ln -s "$target" "$safe/$name"
done
if PATH="$safe" command -v java >/dev/null 2>&1; then
  echo "java still visible on PATH=$safe" >&2
  exit 2
fi
status=0
env -u TLA2TOOLS -u JAVA PATH="$safe" \
  "$safe/node" --disable-warning=ExperimentalWarning "$entry" "$fixture" --out "$out" \
  || status=$?
if [[ "$status" -ne 1 ]]; then
  echo "expected exit 1 (invariant broken), got $status" >&2
  exit 2
fi
test -f "$out/report.md"
grep -q 'Inv' "$out/report.md"
echo "ok: statechart via tla-ts without java (exit $status)"
