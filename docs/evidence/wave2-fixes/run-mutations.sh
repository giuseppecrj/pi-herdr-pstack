#!/usr/bin/env bash
# Applies each named fault, runs the setup SDK and unit tests, restores the source.
set -u
cd "$(dirname "$0")/../../.."
for m in "$@"; do
	python3 docs/evidence/wave2-fixes/mutate.py "$m" || { echo "$m: did not apply"; continue; }
	out=$(node --experimental-strip-types --test --test-concurrency=1 test/setup.test.ts test/setup-unit.test.ts 2>&1)
	fail=$(grep -m1 '^ℹ fail' <<<"$out")
	names=$(grep '^ *✖' <<<"$out" | sed 's/^ *//; s/ ([0-9.]*ms)$//' | grep -v '^✖ failing tests' | sort -u | tr '\n' ';')
	echo "$m: $fail :: $names"
	git checkout -q -- pi-extension/pstack
done
git diff --quiet -- pi-extension/pstack && echo "source restored: identical to HEAD $(git rev-parse --short HEAD)"
