#!/usr/bin/env node
// Regenerates one upstream's pin record in test/fixtures/upstream-scope.json
// at that record's own commit.
// Usage: npm run fixtures:upstream-scope -- <upstream> [<checkout>]
// <upstream> names a record (cursor or mattpocock); <checkout> defaults to
// PSTACK_<UPSTREAM>_SOURCE. The older single-argument form
// `npm run fixtures:upstream-scope -- <checkout>` still means cursor.
// The checkout must hold the commit's blobs (a full clone): lazy fetching is
// disabled so a partial clone fails instead of reaching the network.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = "test/fixtures/upstream-scope.json";
const GIT_OPTIONS = {
	maxBuffer: 64 << 20,
	env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
};

const fixture = JSON.parse(readFileSync(join(PACK_ROOT, FIXTURE), "utf8"));
const names = fixture.upstreams.map(({ upstream }) => upstream);
const args = process.argv.slice(2);
const [name, checkoutArg] =
	args.length === 1 && !names.includes(args[0]) ? ["cursor", args[0]] : args;
const scope = fixture.upstreams.find(({ upstream }) => upstream === name);
const checkout =
	checkoutArg ?? process.env[`PSTACK_${String(name).toUpperCase()}_SOURCE`];
if (!scope || !checkout || !existsSync(checkout)) {
	console.error(
		`usage: npm run fixtures:upstream-scope -- <upstream> [<checkout>]\nupstreams: ${names.join(", ")}; <checkout> defaults to PSTACK_<UPSTREAM>_SOURCE`,
	);
	process.exit(2);
}

const git = (...args) =>
	execFileSync("git", ["-C", checkout, ...args], GIT_OPTIONS);
const lines = (output) => output.toString("utf8").split("\n").filter(Boolean);

const { commit, root } = scope;
// SAFETY: docs/skill-inventory.json is checked by test/skill-content.test.ts.
const inventory = JSON.parse(
	readFileSync(join(PACK_ROOT, "docs/skill-inventory.json"), "utf8"),
);
/** The in-scope root the inventory and skill-provenance fixtures account for. */
const skillsRoot = posix.relative(root, inventory.sources[name].root);
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
	.filter((path) => path !== skillsRoot)
	.map((path) => posix.join(root, path));
// With no root besides skills there is nothing to list: an empty pathspec
// would list the whole repository.
const upstream =
	roots.length === 0
		? []
		: lines(git("ls-tree", "-r", "--name-only", commit, "--", ...roots))
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

// The skills root is accounted for by the inventory and the skill-provenance
// fixtures, which a person maintains: report what a pin move changed there and
// never rewrite it.
const FIXTURES = "test/fixtures/skill-provenance";
const recorded = new Map();
for (const file of readdirSync(
	join(PACK_ROOT, FIXTURE, "..", "skill-provenance"),
)) {
	const {
		files,
		planned = [],
		excluded = [],
	} = JSON.parse(readFileSync(join(PACK_ROOT, FIXTURES, file), "utf8"));
	for (const use of [
		...files.flatMap(({ sources }) => sources),
		...planned,
		...excluded,
	])
		if (use.source === name) recorded.set(use.path, use.sha256);
}
const accounted = new Set([
	...recorded.keys(),
	...inventory.skills.flatMap(({ sourceFiles }) => sourceFiles[name] ?? []),
]);
const skillFiles = lines(
	git(
		"ls-tree",
		"-r",
		"--name-only",
		commit,
		"--",
		posix.join(root, skillsRoot),
	),
).map((path) => posix.relative(posix.join(root, skillsRoot), path));
const skillsNew = skillFiles.filter((path) => !accounted.has(path));
// Only provenance entries are hash-checked against the pin, so only they can
// be reported as removed; a path outside the skills root (../agents/...) is
// accounted for under files.
const skillsRemoved = [...recorded.keys()].filter(
	(path) => !path.startsWith("../") && !skillFiles.includes(path),
);
const skillsChanged = skillFiles
	.filter((path) => recorded.has(path))
	.filter((path) => hash(posix.join(skillsRoot, path)) !== recorded.get(path))
	.map((path) => `${path} (recorded provenance hash differs)`);

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
	`${JSON.stringify(fixture, null, "\t")}\n`,
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
	[`new ${skillsRoot}/ file with no inventory or provenance entry`, skillsNew],
	[
		`${skillsRoot}/ file in the inventory or provenance but removed upstream`,
		skillsRemoved,
	],
	[
		`${skillsRoot}/ file changed since its recorded provenance hash`,
		skillsChanged,
	],
];
console.log(`${FIXTURE} ${name} at ${commit}`);
for (const [label, paths] of report)
	console.log(
		`${label}: ${paths.length === 0 ? "none" : `\n  ${paths.join("\n  ")}`}`,
	);
if (
	unclassified.length +
		vanished.length +
		watchChanged.length +
		skillsNew.length +
		skillsRemoved.length +
		skillsChanged.length >
	0
)
	process.exitCode = 1;
