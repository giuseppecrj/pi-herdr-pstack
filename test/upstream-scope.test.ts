import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(PACK_ROOT, path), "utf8");
const exists = (path: string) => existsSync(join(PACK_ROOT, path));
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
/** One upstream's pin (repository, commit, root), its skills folder and its scope. */
type UpstreamScope = {
	/** The upstream's key in docs/skill-inventory.json `sources`. */
	upstream: string;
	/** The folder under skills/ that holds this upstream's skills (ADR-0003). */
	folder: string;
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
};
// SAFETY: test-owned fixture; every field is asserted below.
const fixture = readJson<{
	schemaVersion: number;
	/** The folder for skills drawn from more than one upstream (ADR-0003). */
	merged: {
		folder: string;
		upstreams: string[];
		provenance: string;
		note: string;
	};
	upstreams: UpstreamScope[];
}>("test/fixtures/upstream-scope.json");
const scopeOf = (upstream: string) => {
	const record = fixture.upstreams.find((entry) => entry.upstream === upstream);
	assert.ok(record, `${upstream}: no pin record in upstream-scope.json`);
	return record;
};
/** The cursor/plugins pstack record (decision Q6). */
const scope = scopeOf("cursor");
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
/** Every path of an upstream, relative to its inventory skills root, that the inventory or a skill-provenance fixture accounts for. */
const referencedSkillPaths = (upstream: string) =>
	new Set([
		...readJson<{
			skills: Array<{ sourceFiles: Record<string, string[] | undefined> }>;
		}>("docs/skill-inventory.json").skills.flatMap(
			({ sourceFiles }) => sourceFiles[upstream] ?? [],
		),
		...skillFixtures.flatMap(({ files, planned = [], excluded = [] }) =>
			[...files.flatMap(({ sources }) => sources), ...planned, ...excluded]
				.filter(({ source }) => source === upstream)
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

describe("upstream pins (ADR-0003)", () => {
	it("stores one pin record per upstream, each matching the skill inventory", () => {
		assert.equal(fixture.schemaVersion, 2);
		const names = fixture.upstreams.map(({ upstream }) => upstream);
		assert.equal(new Set(names).size, names.length, "upstream listed twice");
		for (const record of fixture.upstreams) {
			const source = inventory.sources[record.upstream];
			assert.ok(source, `${record.upstream}: not an inventory source`);
			assert.equal(record.repository, source.repository, record.upstream);
			assert.match(record.commit, /^[0-9a-f]{40}$/, record.upstream);
			assert.equal(record.commit, source.commit, record.upstream);
			assert.ok(
				record.inScope.includes(posix.relative(record.root, source.root)),
				`${record.upstream}: the inventory skills root ${source.root} is an in-scope root under ${record.root}`,
			);
		}
		assert.equal(
			posix.join(scope.root, "skills"),
			inventory.sources.cursor.root,
		);
	});

	it("maps every folder under skills/ to exactly one upstream pin, or to the merged folder", () => {
		const folders = [
			...fixture.upstreams.map(({ folder }) => folder),
			fixture.merged.folder,
		];
		assert.equal(new Set(folders).size, folders.length, "folder pinned twice");
		for (const folder of folders)
			assert.match(folder, /^skills\/[a-z0-9-]+$/, folder);
		assert.deepEqual(
			readdirSync(join(PACK_ROOT, "skills"), { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map(({ name }) => `skills/${name}`)
				.toSorted(),
			folders.toSorted(),
		);
		assert.equal(scope.folder, "skills/pstack");
		assert.equal(fixture.merged.folder, "skills/merged");
		// The merged folder combines pinned upstreams and has no pin of its own.
		for (const upstream of fixture.merged.upstreams)
			assert.ok(scopeOf(upstream), upstream);
		assert.ok(fixture.merged.note.length > 40);
		assert.ok(
			exists(fixture.merged.provenance),
			`${fixture.merged.provenance} is the merged files' provenance`,
		);
	});
});

describe("mattpocock pin", () => {
	const record = scopeOf("mattpocock");

	it("pins mattpocock/skills at the repository root, with skills as the one in-scope root", () => {
		assert.equal(record.folder, "skills/mattpocock");
		assert.equal(record.repository, "https://github.com/mattpocock/skills");
		assert.equal(record.root, ".");
		assert.deepEqual(record.inScope, ["skills"]);
		assert.equal(inventory.sources.mattpocock.root, "skills");
		// skills is accounted for by the inventory and test/fixtures/skill-provenance.
		assert.deepEqual(record.files, []);
		assert.deepEqual(
			record.outOfScope.map(({ path }) => path),
			[".claude-plugin"],
		);
		for (const { path, reason } of record.outOfScope)
			assert.ok(reason.length > 40, path);
		for (const { path, note } of record.unscoped) {
			assert.ok(note.length > 20, path);
			assert.ok(!record.inScope.includes(path), path);
		}
	});

	it("watches the repository LICENSE, whose notice THIRD_PARTY_NOTICES.md reproduces", () => {
		const watched = record.unscoped.filter(({ watch }) => watch);
		assert.deepEqual(
			watched.map(({ path }) => path),
			["LICENSE"],
		);
		assert.match(watched[0].watch?.sha256 ?? "", /^[0-9a-f]{64}$/);
		assert.ok(watched[0].watch?.reason.includes("THIRD_PARTY_NOTICES.md"));
		const notices = read("THIRD_PARTY_NOTICES.md");
		assert.match(notices, /Copyright \(c\) 2026 Matt Pocock/);
		assert.ok(notices.includes(record.commit));
		assert.ok(read("docs/provenance.md").includes("`mattpocock`"));
	});
});

describe("upstream scope (Q6)", () => {
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
		for (const record of fixture.upstreams)
			for (const { path, watch } of record.unscoped)
				if (watch)
					assert.ok(
						reproduced.includes(watch.sha256),
						`${record.upstream} ${path}: THIRD_PARTY_NOTICES.md must reproduce upstream ${path} byte for byte (sha256 ${watch.sha256}); update the notice when the watched hash moves`,
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
});

/**
 * The upstream-scope check against each pin, which needs a checkout of that
 * upstream in PSTACK_<UPSTREAM>_SOURCE (PSTACK_CURSOR_SOURCE for cursor).
 */
for (const record of fixture.upstreams)
	describe(`upstream scope at the ${record.upstream} pin`, () => {
		const variable = `PSTACK_${record.upstream.toUpperCase()}_SOURCE`;
		const checkout = process.env[variable];
		// A partial clone must already hold the blobs; never fetch from a test.
		const GIT_OPTIONS = {
			maxBuffer: 64 << 20,
			env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
		};
		const hasCommit =
			checkout !== undefined &&
			spawnSync(
				"git",
				["-C", checkout, "cat-file", "-e", `${record.commit}^{commit}`],
				GIT_OPTIONS,
			).status === 0;
		const git = (...args: string[]) => {
			assert.ok(
				hasCommit,
				`${variable}=${checkout} does not contain ${record.commit}: fetch it (git -C <checkout> fetch origin ${record.commit}) and use a full clone of ${record.repository}`,
			);
			return execFileSync("git", ["-C", checkout ?? "", ...args], GIT_OPTIONS);
		};
		const tree = (...args: string[]) =>
			git("ls-tree", ...args)
				.toString("utf8")
				.split("\n")
				.filter(Boolean)
				.map((path) => posix.relative(record.root, path));
		const upstreamHash = (path: string) =>
			sha256(git("show", `${record.commit}:${posix.join(record.root, path)}`));
		/** The in-scope root that the inventory and skill-provenance fixtures account for. */
		const skillsRoot = posix.relative(
			record.root,
			inventory.sources[record.upstream].root,
		);
		const skip =
			checkout === undefined &&
			`set ${variable} to a ${record.repository} checkout containing the pinned commit`;

		it("matches every upstream path and hash at the pinned commit", {
			skip,
		}, () => {
			const problems: string[] = [];
			const classified = [
				...record.inScope,
				...record.outOfScope.map(({ path }) => path),
				...record.unscoped.map(({ path }) => path),
			];
			const topLevel = tree("--name-only", record.commit, `${record.root}/`);
			for (const path of topLevel)
				if (!classified.includes(path))
					problems.push(`${path}: unclassified top-level entry`);
			for (const path of classified)
				if (!topLevel.includes(path))
					problems.push(`${path}: classified but missing upstream`);
			const otherRoots = record.inScope
				.filter((root) => root !== skillsRoot)
				.map((root) => posix.join(record.root, root));
			// An empty pathspec would list the whole repository.
			const upstream =
				otherRoots.length === 0
					? []
					: tree("-r", "--name-only", record.commit, "--", ...otherRoots);
			const recorded = new Map(record.files.map((file) => [file.path, file]));
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
				`run npm run fixtures:upstream-scope -- ${record.upstream} <checkout>, then classify`,
			);
		});

		it("references every upstream skills file from the inventory or a skill-provenance fixture", {
			skip,
		}, () => {
			const referenced = referencedSkillPaths(record.upstream);
			const unreferenced = tree(
				"-r",
				"--name-only",
				record.commit,
				"--",
				posix.join(record.root, skillsRoot),
			)
				.map((path) => posix.relative(skillsRoot, path))
				.filter((path) => !referenced.has(path));
			assert.deepEqual(unreferenced, []);
		});

		it("flags an upstream change to a watched unscoped file", { skip }, () => {
			for (const { path, watch } of record.unscoped)
				if (watch)
					assert.equal(
						upstreamHash(path),
						watch.sha256,
						`upstream ${posix.join(record.root, path)} at ${record.commit} does not match the recorded hash: review THIRD_PARTY_NOTICES.md against it and call the change out in the sync PR body before moving the pin`,
					);
		});
	});
