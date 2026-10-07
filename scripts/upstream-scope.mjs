#!/usr/bin/env node
// Regenerates test/fixtures/upstream-scope.json at the fixture's own commit.
// Usage: npm run fixtures:upstream-scope -- <cursor/plugins checkout>
// The checkout must hold the commit's blobs (a full clone): lazy fetching is
// disabled so a partial clone fails instead of reaching the network.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = "test/fixtures/upstream-scope.json";
const GIT_OPTIONS = {
	maxBuffer: 64 << 20,
	env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
};

const checkout = process.argv[2] ?? process.env.PSTACK_CURSOR_SOURCE;
if (!checkout) {
	console.error(
		"usage: npm run fixtures:upstream-scope -- <cursor/plugins checkout>",
	);
	process.exit(2);
}

const git = (...args) =>
	execFileSync("git", ["-C", checkout, ...args], GIT_OPTIONS);
const lines = (output) => output.toString("utf8").split("\n").filter(Boolean);

const scope = JSON.parse(readFileSync(join(PACK_ROOT, FIXTURE), "utf8"));
const { commit, root } = scope;
const relative = (path) => posix.relative(root, path);
const hash = (path) =>
	createHash("sha256")
		.update(git("show", `${commit}:${posix.join(root, path)}`))
		.digest("hex");

const topLevel = lines(git("ls-tree", "--name-only", commit, `${root}/`)).map(
	relative,
);
const classified = [
	...scope.inScope,
	...scope.outOfScope.map(({ path }) => path),
	...scope.unscoped.map(({ path }) => path),
];
const unclassified = topLevel.filter((path) => !classified.includes(path));
const vanished = classified.filter((path) => !topLevel.includes(path));

const roots = scope.inScope
	.filter((name) => name !== "skills")
	.map((name) => posix.join(root, name));
const upstream = lines(
	git("ls-tree", "-r", "--name-only", commit, "--", ...roots),
)
	.map(relative)
	.toSorted();
const previous = new Map(scope.files.map((file) => [file.path, file]));
const added = [];
const changed = [];
const removed = [...previous.keys()].filter((path) => !upstream.includes(path));
scope.files = upstream.map((path) => {
	const sha256 = hash(path);
	const old = previous.get(path);
	if (!old) {
		added.push(path);
		return { path, sha256, status: "not-carried" };
	}
	if (old.sha256 !== sha256) changed.push(`${path} (${old.status})`);
	return { ...old, sha256 };
});

// A watched hash is never rewritten here: a person re-checks what depends on
// it (THIRD_PARTY_NOTICES.md for LICENSE) and updates it by hand.
const watchChanged = scope.unscoped
	.filter(({ path, watch }) => watch && topLevel.includes(path))
	.filter(({ path, watch }) => hash(path) !== watch.sha256)
	.map(
		({ path }) =>
			`${path}: upstream changed; the watched hash was NOT updated. Update THIRD_PARTY_NOTICES.md to reproduce the new ${path} byte for byte, then set watch.sha256 by hand and call the change out in the sync PR body.`,
	);

writeFileSync(
	join(PACK_ROOT, FIXTURE),
	`${JSON.stringify(scope, null, "\t")}\n`,
);
execFileSync(
	join(PACK_ROOT, "node_modules/.bin/biome"),
	["format", "--write", FIXTURE],
	{ cwd: PACK_ROOT, stdio: "ignore" },
);

const report = [
	["added (not-carried)", added],
	["removed", removed],
	["hash changed (status kept)", changed],
	["unclassified top-level entry", unclassified],
	["classified top-level entry missing upstream", vanished],
	["watched file changed (hash not updated)", watchChanged],
];
console.log(`${FIXTURE} at ${commit}`);
for (const [label, paths] of report)
	console.log(
		`${label}: ${paths.length === 0 ? "none" : `\n  ${paths.join("\n  ")}`}`,
	);
if (unclassified.length + vanished.length + watchChanged.length > 0)
	process.exitCode = 1;
