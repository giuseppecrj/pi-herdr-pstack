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
	unscoped: Array<{
		path: string;
		note: string;
		watch?: { sha256: string; reason: string };
	}>;
	files: ScopeFile[];
}>("test/fixtures/upstream-scope.json");
// SAFETY: shape asserted by skill-content.test.ts.
const inventory = readJson<{
	sources: Record<string, { repository: string; commit: string; root: string }>;
}>("docs/skill-inventory.json");
type SourceUse = { source: string; path: string; sha256: string };
type UnshippedSource = { source: string; path: string };
// SAFETY: shape asserted by skill-content.test.ts.
const skillFixtures = readdirSync(
	join(PACK_ROOT, "test/fixtures/skill-provenance"),
).map((name) =>
	readJson<{
		files: Array<{ path: string; sources: SourceUse[] }>;
		planned?: UnshippedSource[];
		excluded?: UnshippedSource[];
	}>(`test/fixtures/skill-provenance/${name}`),
);
const skillProvenance = skillFixtures.flatMap(({ files }) => files);
/** Every cursor path, relative to `pstack/skills`, that the inventory or a skill-provenance fixture accounts for. */
const referencedSkillPaths = new Set([
	...readJson<{
		skills: Array<{ sourceFiles: { cursor?: string[] } }>;
	}>("docs/skill-inventory.json").skills.flatMap(
		({ sourceFiles }) => sourceFiles.cursor ?? [],
	),
	...skillFixtures.flatMap(({ files, planned = [], excluded = [] }) =>
		[...files.flatMap(({ sources }) => sources), ...planned, ...excluded]
			.filter(({ source }) => source === "cursor")
			.map(({ path }) => path),
	),
]);

const IN_SCOPE = ["agents", "docs", "skills"];
const OUT_OF_SCOPE = [".cursor-plugin", "automations"];
const DOC_STATUS = {
	carried: "carried",
	excluded: "excluded",
	"not-carried": "not carried",
};
const NONE_PENDING =
	"No file under these roots is in the not-yet-carried state.";
const underRoot = (path: string, roots: string[]) =>
	roots.some((root) => path.startsWith(`${root}/`));
/** The skill-provenance entries whose cursor source resolves to a scope path. */
const cursorUsesOf = (path: string) =>
	skillProvenance.filter(({ sources }) =>
		sources.some(
			(use) =>
				use.source === "cursor" && posix.join("skills", use.path) === path,
		),
	);
/** `| \`pstack/<path or glob>\` ... | <status>: ... |` rows of the scope section's table. */
const docRows = () => {
	const doc = read("docs/provenance.md");
	const section = doc.slice(
		doc.indexOf("## Upstream scope"),
		doc.indexOf("\n## ", doc.indexOf("## Upstream scope") + 1),
	);
	return section
		.split("\n")
		.filter((line) => line.startsWith("| `pstack/"))
		.map((line) => {
			const [, label, status] = line.split("|").map((cell) => cell.trim());
			return {
				label: label.slice(1, label.indexOf("`", 1)),
				status: status.split(":")[0],
			};
		});
};
const rowCovers = (label: string, path: string) =>
	label.endsWith("/**")
		? `pstack/${path}`.startsWith(label.slice(0, -2))
		: label === `pstack/${path}`;

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
		const watched = scope.unscoped.filter(({ watch }) => watch);
		assert.deepEqual(
			watched.map(({ path }) => path),
			["LICENSE"],
		);
		for (const { path, watch } of watched) {
			assert.match(watch?.sha256 ?? "", /^[0-9a-f]{64}$/, path);
			assert.ok((watch?.reason ?? "").includes("THIRD_PARTY_NOTICES.md"), path);
		}
	});

	it("binds each watched hash to the notice reproduced in THIRD_PARTY_NOTICES.md", () => {
		const reproduced = [
			...read("THIRD_PARTY_NOTICES.md").matchAll(/```text\n([\s\S]*?)```/g),
		].map(([, body]) => sha256(body));
		for (const { path, watch } of scope.unscoped)
			if (watch)
				assert.ok(
					reproduced.includes(watch.sha256),
					`${path}: THIRD_PARTY_NOTICES.md must reproduce upstream ${path} byte for byte (sha256 ${watch.sha256}); update the notice when the watched hash moves`,
				);
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
			const uses = cursorUsesOf(file.path);
			if (uses.length > 0)
				assert.equal(
					file.status,
					"carried",
					`${file.path}: a skill-provenance cursor source resolves here, so it is carried`,
				);
			if (file.status === "carried") {
				assert.deepEqual(
					uses.map(({ path }) => path),
					[file.destination],
					`${file.path}: destination is the one skill-provenance entry that uses it`,
				);
				assert.ok(
					existsSync(join(PACK_ROOT, file.destination ?? "")),
					file.path,
				);
				const recorded = uses[0].sources.find(
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

	it("documents the scope and each recorded path's status in docs/provenance.md", () => {
		const doc = read("docs/provenance.md");
		assert.ok(doc.includes("test/fixtures/upstream-scope.json"));
		for (const root of IN_SCOPE)
			assert.ok(doc.includes(`\`pstack/${root}\``), root);
		for (const root of OUT_OF_SCOPE)
			assert.ok(doc.includes(`\`pstack/${root}/**\``), root);
		const rows = docRows();
		const problems: string[] = [];
		for (const { label, status } of rows) {
			if (!Object.values(DOC_STATUS).includes(status))
				problems.push(`${label}: unknown status "${status}"`);
			if (!scope.files.some(({ path }) => rowCovers(label, path)))
				problems.push(`${label}: no fixture file`);
		}
		for (const { path, status } of scope.files) {
			const covering = rows.filter(({ label }) => rowCovers(label, path));
			if (covering.length === 0) problems.push(`${path}: no table row`);
			for (const row of covering)
				if (row.status !== DOC_STATUS[status])
					problems.push(
						`${path}: table says "${row.status}", fixture says ${status}`,
					);
		}
		assert.deepEqual(problems, []);
		assert.equal(
			doc.replace(/\s+/g, " ").includes(NONE_PENDING),
			!scope.files.some(({ status }) => status === "not-carried"),
			"the not-yet-carried sentence matches the fixture",
		);
	});

	const checkout = process.env.PSTACK_CURSOR_SOURCE;
	// A partial clone must already hold the blobs; never fetch from a test.
	const GIT_OPTIONS = {
		maxBuffer: 64 << 20,
		env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
	};
	const hasCommit =
		checkout !== undefined &&
		spawnSync(
			"git",
			["-C", checkout, "cat-file", "-e", `${scope.commit}^{commit}`],
			GIT_OPTIONS,
		).status === 0;
	const git = (...args: string[]) => {
		assert.ok(
			hasCommit,
			`PSTACK_CURSOR_SOURCE=${checkout} does not contain ${scope.commit}: fetch it (git -C <checkout> fetch origin ${scope.commit}) and use a full clone of ${scope.repository}`,
		);
		return execFileSync("git", ["-C", checkout ?? "", ...args], GIT_OPTIONS);
	};
	const tree = (...args: string[]) =>
		git("ls-tree", ...args)
			.toString("utf8")
			.split("\n")
			.filter(Boolean)
			.map((path) => posix.relative(scope.root, path));
	const upstreamHash = (path: string) =>
		sha256(git("show", `${scope.commit}:${posix.join(scope.root, path)}`));
	const skip =
		checkout === undefined &&
		"set PSTACK_CURSOR_SOURCE to a cursor/plugins checkout containing the pinned commit";

	it("matches every upstream path and hash at the pinned commit", {
		skip,
	}, () => {
		const problems: string[] = [];
		const classified = [
			...scope.inScope,
			...scope.outOfScope.map(({ path }) => path),
			...scope.unscoped.map(({ path }) => path),
		];
		const topLevel = tree("--name-only", scope.commit, `${scope.root}/`);
		for (const path of topLevel)
			if (!classified.includes(path))
				problems.push(`${path}: unclassified top-level entry`);
		for (const path of classified)
			if (!topLevel.includes(path))
				problems.push(`${path}: classified but missing upstream`);
		const upstream = tree(
			"-r",
			"--name-only",
			scope.commit,
			"--",
			...scope.inScope
				.filter((root) => root !== "skills")
				.map((root) => posix.join(scope.root, root)),
		);
		const recorded = new Map(scope.files.map((file) => [file.path, file]));
		for (const path of upstream) {
			const file = recorded.get(path);
			if (!file) problems.push(`${path}: upstream but not in the fixture`);
			else if (upstreamHash(path) !== file.sha256)
				problems.push(`${path}: hash changed`);
		}
		for (const path of recorded.keys())
			if (!upstream.includes(path))
				problems.push(`${path}: in the fixture but not upstream`);
		assert.deepEqual(
			problems,
			[],
			"run npm run fixtures:upstream-scope -- <checkout>, then classify",
		);
	});

	it("references every upstream pstack/skills file from the inventory or a skill-provenance fixture", {
		skip,
	}, () => {
		const unreferenced = tree(
			"-r",
			"--name-only",
			scope.commit,
			"--",
			posix.join(scope.root, "skills"),
		)
			.map((path) => posix.relative("skills", path))
			.filter((path) => !referencedSkillPaths.has(path));
		assert.deepEqual(unreferenced, []);
	});

	it("flags an upstream change to a watched unscoped file", { skip }, () => {
		for (const { path, watch } of scope.unscoped)
			if (watch)
				assert.equal(
					upstreamHash(path),
					watch.sha256,
					`upstream ${posix.join(scope.root, path)} at ${scope.commit} does not match the recorded hash: review THIRD_PARTY_NOTICES.md against it and call the change out in the sync PR body before moving the pin`,
				);
	});
});
