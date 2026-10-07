import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(PACK_ROOT, path), "utf8");
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;
const sha256 = (value: string | Buffer) =>
	createHash("sha256").update(value).digest("hex");

type ScopeFile = {
	path: string;
	sha256: string;
	status: "carried" | "excluded" | "not-carried";
	destination?: string;
	reason?: string;
};
// SAFETY: test-owned fixture; every field is asserted below.
const scope = readJson<{
	schemaVersion: number;
	repository: string;
	commit: string;
	root: string;
	inScope: string[];
	outOfScope: Array<{ path: string; reason: string }>;
	unscoped: Array<{ path: string; note: string }>;
	files: ScopeFile[];
}>("test/fixtures/upstream-scope.json");
// SAFETY: shape asserted by skill-content.test.ts.
const inventory = readJson<{
	sources: Record<string, { repository: string; commit: string; root: string }>;
}>("docs/skill-inventory.json");
type SourceUse = { source: string; path: string; sha256: string };
// SAFETY: shape asserted by skill-content.test.ts.
const skillProvenance = readdirSync(
	join(PACK_ROOT, "test/fixtures/skill-provenance"),
).flatMap(
	(name) =>
		readJson<{ files: Array<{ path: string; sources: SourceUse[] }> }>(
			`test/fixtures/skill-provenance/${name}`,
		).files,
);

const IN_SCOPE = ["agents", "docs", "skills"];
const OUT_OF_SCOPE = [".cursor-plugin", "automations"];
const underRoot = (path: string, roots: string[]) =>
	roots.some((root) => path.startsWith(`${root}/`));

describe("upstream scope (Q6)", () => {
	it("pins the same cursor commit and root as the skill inventory", () => {
		assert.equal(scope.schemaVersion, 1);
		const cursor = inventory.sources.cursor;
		assert.equal(scope.repository, cursor.repository);
		assert.equal(scope.commit, cursor.commit);
		assert.equal(posix.join(scope.root, "skills"), cursor.root);
	});

	it("tracks agents, docs and skills and excludes automations and .cursor-plugin with reasons", () => {
		assert.deepEqual(scope.inScope.toSorted(), IN_SCOPE);
		assert.deepEqual(scope.outOfScope.map(({ path }) => path).toSorted(), [
			...OUT_OF_SCOPE,
		]);
		for (const { path, reason } of scope.outOfScope)
			assert.ok(reason.length > 40, path);
		for (const { path, note } of scope.unscoped) {
			assert.ok(![...IN_SCOPE, ...OUT_OF_SCOPE].includes(path), path);
			assert.ok(note.length > 20, path);
		}
	});

	it("records a status for each file under the in-scope roots other than skills", () => {
		const paths = scope.files.map(({ path }) => path);
		assert.equal(new Set(paths).size, paths.length, "path listed twice");
		for (const file of scope.files) {
			assert.ok(
				underRoot(
					file.path,
					IN_SCOPE.filter((root) => root !== "skills"),
				),
				`${file.path}: skills files belong in docs/skill-inventory.json`,
			);
			assert.match(file.sha256, /^[0-9a-f]{64}$/, file.path);
			if (file.status === "carried") {
				assert.ok(file.destination, file.path);
				assert.ok(existsSync(join(PACK_ROOT, file.destination)), file.path);
				const recorded = skillProvenance
					.find(({ path }) => path === file.destination)
					?.sources.find(
						(use) =>
							use.source === "cursor" &&
							posix.join("skills", use.path) === file.path,
					);
				assert.equal(
					recorded?.sha256,
					file.sha256,
					`${file.path}: the destination's skill-provenance entry records this cursor blob`,
				);
			} else if (file.status === "excluded") {
				assert.equal(file.destination, undefined, file.path);
				assert.ok((file.reason ?? "").length > 20, file.path);
			} else {
				assert.equal(file.status, "not-carried", file.path);
				assert.equal(file.destination, undefined, file.path);
			}
		}
	});

	it("documents the scope and each recorded path in docs/provenance.md", () => {
		const doc = read("docs/provenance.md");
		assert.ok(doc.includes("test/fixtures/upstream-scope.json"));
		for (const root of IN_SCOPE)
			assert.ok(doc.includes(`\`pstack/${root}\``), root);
		for (const root of OUT_OF_SCOPE)
			assert.ok(doc.includes(`\`pstack/${root}/**\``), root);
		for (const { path } of scope.files) {
			const segments = path.split("/");
			const globs = segments
				.slice(1, -1)
				.map(
					(_, index) =>
						`\`pstack/${segments.slice(0, index + 2).join("/")}/**\``,
				);
			assert.ok(
				[`\`pstack/${path}\``, ...globs].some((form) => doc.includes(form)),
				path,
			);
		}
	});

	const checkout = process.env.PSTACK_CURSOR_SOURCE;
	const hasCommit =
		checkout !== undefined &&
		spawnSync("git", [
			"-C",
			checkout,
			"cat-file",
			"-e",
			`${scope.commit}^{commit}`,
		]).status === 0;
	const git = (...args: string[]) =>
		execFileSync("git", ["-C", checkout ?? "", ...args]);
	it("matches every upstream path and hash at the pinned commit", {
		skip:
			!hasCommit &&
			"set PSTACK_CURSOR_SOURCE to a cursor/plugins checkout containing the pinned commit",
	}, () => {
		const topLevel = git(
			"ls-tree",
			"--name-only",
			scope.commit,
			`${scope.root}/`,
		)
			.toString("utf8")
			.trim()
			.split("\n")
			.map((path) => posix.relative(scope.root, path));
		assert.deepEqual(
			topLevel.toSorted(),
			[
				...scope.inScope,
				...scope.outOfScope.map(({ path }) => path),
				...scope.unscoped.map(({ path }) => path),
			].toSorted(),
			"every top-level upstream entry is in scope, out of scope or unscoped",
		);
		const roots = scope.inScope
			.filter((root) => root !== "skills")
			.map((root) => posix.join(scope.root, root));
		const upstream = git(
			"ls-tree",
			"-r",
			"--name-only",
			scope.commit,
			"--",
			...roots,
		)
			.toString("utf8")
			.trim()
			.split("\n")
			.map((path) => posix.relative(scope.root, path));
		assert.deepEqual(
			scope.files.map(({ path }) => path).toSorted(),
			upstream.toSorted(),
		);
		for (const { path, sha256: recorded } of scope.files)
			assert.equal(
				sha256(git("show", `${scope.commit}:${posix.join(scope.root, path)}`)),
				recorded,
				path,
			);
	});
});
