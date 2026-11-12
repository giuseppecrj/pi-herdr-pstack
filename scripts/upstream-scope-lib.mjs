// Shared by scripts/upstream-scope.mjs (regenerates a pin record) and
// scripts/upstream-drift.mjs (reports how far an upstream moved past its pin):
// repository paths, JSON loading, git runners and the per-file accounting that
// docs/skill-inventory.json and test/fixtures/skill-provenance/ keep.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import {
	isAbsolute,
	join,
	relative as relativePath,
	resolve,
	sep,
} from "node:path";
import { fileURLToPath } from "node:url";

export const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const FIXTURE = "test/fixtures/upstream-scope.json";
export const PROVENANCE_DIR = "test/fixtures/skill-provenance";
// Lazy fetching is disabled so a partial clone fails instead of reaching the
// network.
export const GIT_OPTIONS = {
	maxBuffer: 64 << 20,
	env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
};

/** Parses a repository JSON file, naming it when it is missing or invalid. */
export function readJson(path) {
	try {
		return JSON.parse(readFileSync(join(PACK_ROOT, path), "utf8"));
	} catch (error) {
		console.error(`cannot read ${path}: ${error.message}`);
		process.exit(2);
	}
}

/** Runs git in `checkout` and returns stdout as a Buffer. */
export const gitIn =
	(checkout) =>
	(...args) =>
		execFileSync("git", ["-C", checkout, ...args], GIT_OPTIONS);

export const lines = (output) =>
	output.toString("utf8").split("\n").filter(Boolean);

/**
 * Every recorded use of an upstream's files: the shipped files that cite it as
 * a source (`kind: "file"`, with the pack file as `destination`), plus the
 * planned and excluded entries. Paths are relative to that upstream's skills
 * root, as the fixtures write them. A person maintains these fixtures.
 */
export function provenanceUses(name) {
	const uses = [];
	for (const file of readdirSync(join(PACK_ROOT, PROVENANCE_DIR)).toSorted()) {
		const {
			files,
			planned = [],
			excluded = [],
		} = readJson(`${PROVENANCE_DIR}/${file}`);
		for (const entry of files)
			for (const use of entry.sources)
				if (use.source === name)
					uses.push({
						kind: "file",
						path: use.path,
						sha256: use.sha256,
						use: use.use,
						status: entry.status,
						destination: entry.path,
					});
		for (const [kind, entries] of [
			["planned", planned],
			["excluded", excluded],
		])
			for (const use of entries)
				if (use.source === name)
					uses.push({
						kind,
						path: use.path,
						sha256: use.sha256,
						owningIssue: use.owningIssue,
						disposition: use.disposition,
					});
	}
	return uses;
}

/**
 * For each merged file, the sources of upstream `name` whose path is in
 * `touched` (a Set of skills-root paths the upstream changed or removed), with
 * the names of the other upstreams the file combines.
 */
export function mergedSourceFlags(mergedFiles, name, touched) {
	return mergedFiles.flatMap(({ path, sources }) => {
		const own = sources.filter(
			(use) => use.source === name && touched.has(use.path),
		);
		const others = [
			...new Set(
				sources.filter((use) => use.source !== name).map((use) => use.source),
			),
		];
		return own.map((use) => ({ file: path, use, others }));
	});
}

/**
 * The merged-skill provenance entries that combine more than one upstream
 * (ADR-0003). The fixture names the provenance file, so refuse a path that
 * leaves the pack.
 */
export function mergedProvenanceFiles(fixture) {
	if (!fixture.merged) return [];
	const away = relativePath(
		PACK_ROOT,
		resolve(PACK_ROOT, fixture.merged.provenance),
	);
	if (away === ".." || away.startsWith(`..${sep}`) || isAbsolute(away)) {
		console.error(
			`merged.provenance ${fixture.merged.provenance} is outside the pack root`,
		);
		process.exit(2);
	}
	return readJson(fixture.merged.provenance).files.filter(
		({ sources }) => new Set(sources.map(({ source }) => source)).size > 1,
	);
}
