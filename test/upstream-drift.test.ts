import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPTS = ["upstream-drift.mjs", "upstream-scope-lib.mjs"];
const sha256 = (value: string) =>
	createHash("sha256").update(value).digest("hex");

type Item = {
	path: string;
	change: string;
	area: string;
	group: string;
	classification: string;
	action: string;
	skills: string[];
	destinations: Array<{ path: string; use: string }>;
	detail: string;
};
type UpstreamReport = {
	upstream: string;
	folder: string;
	contextSource: boolean;
	repository: string;
	root: string;
	checkout: string;
	pin: string;
	target: { ref: string; commit: string };
	commitsAhead: number;
	compare: string;
	warnings: string[];
	drift: boolean;
	counts: Record<string, number>;
	changes: Item[];
	unaccounted: Array<{
		directory: string;
		files: number;
		added: number;
		changed: number;
		removed: number;
		action: string;
	}>;
	ignored: Array<{ path: string; change: string; classification: string }>;
	mergedSkills: Array<{
		file: string;
		source: string;
		sourcePath: string;
		use: string;
		otherSources: string[];
		provenance: string;
	}>;
};
type Report = {
	schemaVersion: number;
	drift: boolean;
	upstreams: UpstreamReport[];
};

describe("upstream-drift.mjs", () => {
	const scratch = mkdtempSync(join(tmpdir(), "pstack-drift-"));
	after(() => rmSync(scratch, { recursive: true, force: true }));

	const git = (cwd: string, ...args: string[]) =>
		execFileSync(
			"git",
			[
				"-c",
				"user.name=t",
				"-c",
				"user.email=t@example.com",
				"-c",
				"commit.gpgsign=false",
				"-C",
				cwd,
				...args,
			],
			{ encoding: "utf8" },
		).trim();
	const put = (path: string, text: string) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, text);
	};
	/** Commits the given files (a null body deletes the file) and returns the commit. */
	const commit = (repo: string, files: Record<string, string | null>) => {
		for (const [path, body] of Object.entries(files))
			if (body === null) rmSync(join(repo, path));
			else put(join(repo, path), body);
		git(repo, "add", "-A");
		git(repo, "commit", "-qm", "change");
		return git(repo, "rev-parse", "HEAD");
	};

	/**
	 * A scratch pack and three scratch upstreams:
	 * - `u1` (scope record, root `r`; in scope `agents` and `skills`; `manifest`
	 *   out of scope; `README.md` unscoped; `LICENSE` watched),
	 * - `u2` (scope record, root `.`; in scope `skills`, buckets one deep),
	 * - `u3` (no scope record: a pin in docs/skill-inventory.json only, like pi-mimir).
	 * Merged skill `m` combines u2's `skills/b/m/SKILL.md` (primary), u1's
	 * `s1/SKILL.md` (merged) and u3's `m/SKILL.md` (context).
	 */
	const setup = (name: string) => {
		const root = join(scratch, name);
		const repos = {
			u1: join(root, "u1"),
			u2: join(root, "u2"),
			u3: join(root, "u3"),
		};
		const base: Record<keyof typeof repos, Record<string, string>> = {
			u1: {
				"r/agents/a.md": "a\n",
				"r/agents/b.md": "b\n",
				"r/skills/s1/SKILL.md": "s1\n",
				"r/skills/s1/ref.md": "ref\n",
				"r/skills/s2/SKILL.md": "s2\n",
				"r/skills/p/SKILL.md": "p\n",
				"r/skills/e/SKILL.md": "e\n",
				"r/manifest/plugin.json": "{}\n",
				"r/README.md": "readme\n",
				"r/LICENSE": "license\n",
			},
			u2: {
				"skills/b/m/SKILL.md": "m2\n",
				"skills/b/t/SKILL.md": "t\n",
				LICENSE: "license\n",
			},
			u3: { "pkg/skills/m/SKILL.md": "m3\n", "pkg/skills/x/SKILL.md": "x\n" },
		};
		const pins = {} as Record<keyof typeof repos, string>;
		for (const key of Object.keys(repos) as Array<keyof typeof repos>) {
			mkdirSync(repos[key], { recursive: true });
			git(repos[key], "init", "-q");
			pins[key] = commit(repos[key], base[key]);
		}
		for (const script of SCRIPTS)
			put(
				join(root, "scripts", script),
				readFileSync(join(PACK_ROOT, "scripts", script), "utf8"),
			);
		symlinkSync(join(PACK_ROOT, "node_modules"), join(root, "node_modules"));
		const inventory = {
			sources: {
				u1: { root: "r/skills" },
				u2: { root: "skills" },
				u3: {
					repository: "https://example.com/u3",
					commit: pins.u3,
					root: "pkg/skills",
				},
			},
			skills: [
				{ name: "s1", sourceFiles: { u1: ["s1/SKILL.md", "s1/ref.md"] } },
				{ name: "s2", sourceFiles: { u1: ["s2/SKILL.md"] } },
				{ name: "t", sourceFiles: { u2: ["b/t/SKILL.md"] } },
				{
					name: "m",
					sourceFiles: {
						u2: ["b/m/SKILL.md"],
						u1: ["s1/SKILL.md"],
						u3: ["m/SKILL.md"],
					},
				},
				{ name: "x", sourceFiles: { u3: ["x/SKILL.md"] } },
			],
		};
		put(join(root, "docs/skill-inventory.json"), JSON.stringify(inventory));
		const use = (source: string, path: string, kind: string, text: string) => ({
			source,
			path,
			sha256: sha256(text),
			use: kind,
		});
		put(
			join(root, "test/fixtures/skill-provenance/p.json"),
			JSON.stringify({
				files: [
					{
						path: "skills/u1/s1/ref.md",
						status: "copied",
						sources: [use("u1", "s1/ref.md", "primary", "ref\n")],
					},
					{
						path: "skills/u1/s1/SKILL.md",
						status: "adapted",
						sources: [use("u1", "s1/SKILL.md", "primary", "s1\n")],
					},
					{
						path: "skills/u2/t/SKILL.md",
						status: "adapted",
						sources: [use("u2", "b/t/SKILL.md", "primary", "t\n")],
					},
				],
				planned: [
					{
						source: "u1",
						path: "p/SKILL.md",
						sha256: sha256("p\n"),
						owningIssue: "#99",
					},
				],
				excluded: [
					{
						source: "u1",
						path: "e/SKILL.md",
						sha256: sha256("e\n"),
						disposition: "Excluded: scratch",
					},
				],
			}),
		);
		put(
			join(root, "test/fixtures/skill-provenance/merged.json"),
			JSON.stringify({
				files: [
					{
						path: "skills/merged/m/SKILL.md",
						status: "adapted",
						sources: [
							use("u2", "b/m/SKILL.md", "primary", "m2\n"),
							use("u1", "s1/SKILL.md", "merged", "s1\n"),
							use("u3", "m/SKILL.md", "context", "m3\n"),
						],
					},
				],
			}),
		);
		const record = (
			key: "u1" | "u2",
			extra: Record<string, unknown>,
		): Record<string, unknown> => ({
			upstream: key,
			folder: `skills/${key}`,
			repository: `https://example.com/${key}`,
			commit: pins[key],
			outOfScope: [],
			unscoped: [],
			files: [],
			...extra,
		});
		put(
			join(root, "test/fixtures/upstream-scope.json"),
			JSON.stringify({
				schemaVersion: 2,
				merged: {
					folder: "skills/merged",
					provenance: "test/fixtures/skill-provenance/merged.json",
				},
				upstreams: [
					record("u1", {
						root: "r",
						inScope: ["agents", "skills"],
						outOfScope: [{ path: "manifest", reason: "platform" }],
						unscoped: [
							{ path: "README.md", note: "n" },
							{
								path: "LICENSE",
								note: "n",
								watch: { sha256: sha256("license\n"), reason: "notices" },
							},
						],
						files: [
							{
								path: "agents/a.md",
								sha256: sha256("a\n"),
								status: "carried",
								destination: "skills/u1/a.md",
							},
							{
								path: "agents/b.md",
								sha256: sha256("b\n"),
								status: "excluded",
								reason: "role",
							},
						],
					}),
					record("u2", {
						root: ".",
						inScope: ["skills"],
						unscoped: [{ path: "LICENSE", note: "n" }],
					}),
				],
			}),
		);
		const env: NodeJS.ProcessEnv = { ...process.env };
		for (const key of Object.keys(env))
			if (/^PSTACK_.*_SOURCE$/.test(key)) delete env[key];
		// The default run covers only scoped upstreams (u1, u2); the context
		// source u3 is frozen (ADR-0004). These helpers name all three unless the
		// caller picks with --upstream, so each test still sees u3 when it asks.
		const every = (args: string[]) =>
			args.includes("--upstream") ? args : ["--upstream", "u1,u2,u3", ...args];
		return {
			root,
			repos,
			pins,
			env,
			run: (...args: string[]) =>
				spawnSync(
					process.execPath,
					[
						join(root, "scripts/upstream-drift.mjs"),
						...(["u1", "u2", "u3"] as const).flatMap((key) => [
							"--source",
							`${key}=${repos[key]}`,
						]),
						...every(args),
					],
					{ encoding: "utf8", env },
				),
			json: (...args: string[]) => {
				const result = spawnSync(
					process.execPath,
					[
						join(root, "scripts/upstream-drift.mjs"),
						...(["u1", "u2", "u3"] as const).flatMap((key) => [
							"--source",
							`${key}=${repos[key]}`,
						]),
						"--format",
						"json",
						...every(args),
					],
					{ encoding: "utf8", env },
				);
				return {
					status: result.status,
					stderr: result.stderr,
					report:
						result.stdout === ""
							? undefined
							: (JSON.parse(result.stdout) as Report),
				};
			},
			/** Hashes every file under the pack and the three upstream worktrees. */
			snapshot: () => {
				const out: string[] = [];
				const walk = (dir: string) => {
					for (const entry of readdirSync(dir).toSorted()) {
						if (entry === "node_modules") continue;
						const path = join(dir, entry);
						if (statSync(path).isDirectory()) walk(path);
						else out.push(`${path} ${sha256(readFileSync(path, "utf8"))}`);
					}
				};
				walk(root);
				return out;
			},
		};
	};
	const classes = (upstream: UpstreamReport) =>
		Object.fromEntries(
			upstream.changes.map((item) => [
				item.path,
				`${item.change} ${item.classification} ${item.action}`,
			]),
		);
	const find = (report: Report, name: string) => {
		const found = report.upstreams.find(({ upstream }) => upstream === name);
		assert.ok(found, `${name} missing from the report`);
		return found;
	};

	it("exits 0 with no drift and says so in both formats", () => {
		const scope = setup("clean");
		const before = scope.snapshot();
		const markdown = scope.run();
		assert.equal(markdown.status, 0, markdown.stdout + markdown.stderr);
		assert.match(markdown.stdout, /^# Upstream drift\n\nDrift: none\./);
		const { status, report } = scope.json();
		assert.equal(status, 0);
		assert.equal(report?.drift, false);
		for (const upstream of report?.upstreams ?? []) {
			assert.equal(upstream.drift, false, upstream.upstream);
			assert.equal(upstream.commitsAhead, 0);
			assert.deepEqual(upstream.changes, []);
		}
		assert.deepEqual(scope.snapshot(), before, "the command wrote something");
	});

	it("maps new, changed and removed files in each folder to what the pack recorded", () => {
		const scope = setup("classify");
		commit(scope.repos.u1, {
			"r/agents/a.md": "a2\n",
			"r/agents/b.md": null,
			"r/agents/new.md": "new\n",
			"r/skills/s1/SKILL.md": "s1b\n",
			"r/skills/s1/ref.md": "ref2\n",
			"r/skills/s2/SKILL.md": "s2b\n",
			"r/skills/p/SKILL.md": "p2\n",
			"r/skills/e/SKILL.md": null,
			"r/skills/s3/SKILL.md": "s3\n",
			"r/newtop/x.md": "x\n",
			"r/LICENSE": "license2\n",
			"r/manifest/plugin.json": '{"v":2}\n',
			"r/README.md": "readme2\n",
		});
		commit(scope.repos.u2, {
			"skills/b/t/SKILL.md": "t2\n",
			"skills/b/t/extra.md": "extra\n",
			"skills/b/gone/SKILL.md": "g\n",
		});
		commit(scope.repos.u3, {
			"pkg/skills/x/SKILL.md": null,
			"pkg/skills/y/SKILL.md": "y\n",
			"pkg/skills/y/more.md": "y\n",
			"pkg/skills/m/SKILL.md": "m3b\n",
		});
		const before = scope.snapshot();
		const markdown = scope.run();
		assert.equal(markdown.status, 1, markdown.stdout + markdown.stderr);
		assert.deepEqual(scope.snapshot(), before, "the command wrote something");
		const { status, report } = scope.json();
		assert.equal(status, 1);
		assert.ok(report);
		const u1 = find(report, "u1");
		assert.deepEqual(classes(u1), {
			"agents/a.md": "changed shipped update",
			"agents/b.md": "removed excluded record",
			"agents/new.md": "added unaccounted decide",
			LICENSE: "changed watched update-notices",
			"newtop/x.md": "added unclassified classify",
			"skills/e/SKILL.md": "removed excluded record",
			"skills/p/SKILL.md": "changed planned decide",
			"skills/s1/SKILL.md": "changed adapted update",
			"skills/s1/ref.md": "changed shipped update",
			"skills/s2/SKILL.md": "changed inventory-only update",
			"skills/s3/SKILL.md": "added unaccounted decide",
		});
		assert.deepEqual(
			u1.ignored.map(({ path, classification }) => [path, classification]),
			[
				["README.md", "unscoped"],
				["manifest/plugin.json", "out-of-scope"],
			],
		);
		assert.deepEqual(u1.counts, {
			added: 3,
			changed: 6,
			removed: 2,
			ignored: 2,
			unaccounted: 0,
		});
		const a = u1.changes.find(({ path }) => path === "agents/a.md");
		assert.deepEqual(a?.destinations, [
			{ path: "skills/u1/a.md", use: "context" },
		]);
		assert.equal(a?.area, "agents");
		const s1 = u1.changes.find(({ path }) => path === "skills/s1/SKILL.md");
		assert.deepEqual(s1?.destinations, [
			{ path: "skills/merged/m/SKILL.md", use: "merged" },
			{ path: "skills/u1/s1/SKILL.md", use: "primary" },
		]);
		assert.deepEqual(s1?.skills, ["s1", "m"]);
		assert.equal(
			u1.changes.find(({ path }) => path === "skills/p/SKILL.md")?.detail,
			"owned by #99",
		);

		const u2 = find(report, "u2");
		assert.deepEqual(classes(u2), {
			"skills/b/gone/SKILL.md": "added unaccounted decide",
			"skills/b/t/SKILL.md": "changed adapted update",
			"skills/b/t/extra.md": "added unaccounted decide",
		});
		assert.equal(
			u2.changes.find(({ path }) => path === "skills/b/gone/SKILL.md")?.group,
			"b",
		);

		const u3 = find(report, "u3");
		// u3 has no scope record: a cited context source. Only paths the pack
		// records are listed; the new y/ files are summarized and skipped.
		assert.equal(u3.contextSource, true);
		assert.deepEqual(classes(u3), {
			"m/SKILL.md": "changed adapted update",
			"x/SKILL.md": "removed inventory-only decide",
		});
		assert.deepEqual(u3.unaccounted, [
			{
				directory: "y/",
				files: 2,
				added: 2,
				changed: 0,
				removed: 0,
				action: "skip",
			},
		]);
		assert.deepEqual(u3.counts, {
			added: 0,
			changed: 1,
			removed: 1,
			ignored: 0,
			unaccounted: 2,
		});
	});

	it("flags a merged skill when any of its sources changes, naming the other sources", () => {
		const scope = setup("merged");
		commit(scope.repos.u1, { "r/skills/s1/SKILL.md": "s1b\n" });
		commit(scope.repos.u2, { "skills/b/m/SKILL.md": "m2b\n" });
		commit(scope.repos.u3, { "pkg/skills/m/SKILL.md": null });
		const { report } = scope.json();
		assert.ok(report);
		const merged = (name: string) => find(report, name).mergedSkills;
		const provenance = "test/fixtures/skill-provenance/merged.json";
		assert.deepEqual(merged("u1"), [
			{
				file: "skills/merged/m/SKILL.md",
				source: "u1",
				sourcePath: "s1/SKILL.md",
				use: "merged",
				otherSources: ["u2", "u3"],
				provenance,
			},
		]);
		assert.deepEqual(merged("u2"), [
			{
				file: "skills/merged/m/SKILL.md",
				source: "u2",
				sourcePath: "b/m/SKILL.md",
				use: "primary",
				otherSources: ["u1", "u3"],
				provenance,
			},
		]);
		assert.deepEqual(merged("u3"), [
			{
				file: "skills/merged/m/SKILL.md",
				source: "u3",
				sourcePath: "m/SKILL.md",
				use: "context",
				otherSources: ["u2", "u1"],
				provenance,
			},
		]);
		const markdown = scope.run().stdout;
		assert.match(markdown, /### Merged skills needing a manual merge/);
		assert.match(
			markdown,
			/`skills\/merged\/m\/SKILL\.md`: u2 source `b\/m\/SKILL\.md` \(primary\) changed or was removed; merge it by hand with the u1 and u3 sources, then record the new hashes in `test\/fixtures\/skill-provenance\/merged\.json`\./,
		);
	});

	it("does not flag a merged skill for an added file or an unrelated change", () => {
		const scope = setup("merged-unrelated");
		commit(scope.repos.u2, {
			"skills/b/t/SKILL.md": "t2\n",
			"skills/b/m/new.md": "new\n",
		});
		const { status, report } = scope.json();
		assert.equal(status, 1);
		assert.deepEqual(report && find(report, "u2").mergedSkills, []);
	});

	it("exits 0 when only out-of-scope or unscoped paths changed, and says so", () => {
		const scope = setup("ignored");
		commit(scope.repos.u1, {
			"r/manifest/plugin.json": '{"v":2}\n',
			"r/README.md": "readme2\n",
		});
		const { status, report } = scope.json();
		assert.equal(status, 0);
		assert.ok(report);
		const u1 = find(report, "u1");
		assert.equal(u1.drift, false);
		assert.equal(u1.commitsAhead, 1);
		assert.equal(u1.counts.ignored, 2);
		const markdown = scope.run();
		assert.equal(markdown.status, 0);
		assert.match(
			markdown.stdout,
			/No in-scope change in 1 commit; 2 out-of-scope or unscoped paths changed and are ignored\./,
		);
	});

	it("restricts to --upstream and honours --ref", () => {
		const scope = setup("ref");
		const first = commit(scope.repos.u1, { "r/agents/a.md": "a2\n" });
		commit(scope.repos.u1, { "r/agents/a.md": "a3\n", "r/agents/c.md": "c\n" });
		commit(scope.repos.u2, { "skills/b/t/SKILL.md": "t2\n" });
		const only = scope.json("--upstream", "u1", "--ref", `u1=${first}`);
		assert.equal(only.status, 1);
		assert.deepEqual(
			only.report?.upstreams.map(({ upstream }) => upstream),
			["u1"],
		);
		const u1 = only.report && find(only.report, "u1");
		assert.deepEqual(u1 && Object.keys(classes(u1)), ["agents/a.md"]);
		assert.equal(u1?.target.ref, first);
		assert.equal(u1?.target.commit, first);
		assert.equal(u1?.commitsAhead, 1);
		assert.equal(
			u1?.compare,
			`https://example.com/u1/compare/${scope.pins.u1}...${first}`,
		);
		const atPin = scope.json(
			"--ref",
			`u1=${scope.pins.u1}`,
			"--upstream",
			"u1",
		);
		assert.equal(atPin.status, 0);
	});

	it("keeps a stable JSON shape", () => {
		const scope = setup("shape");
		commit(scope.repos.u1, {
			"r/agents/a.md": "a2\n",
			"r/skills/s1/SKILL.md": "s1b\n",
			"r/README.md": "readme2\n",
		});
		const { report } = scope.json();
		assert.ok(report);
		assert.deepEqual(Object.keys(report), [
			"schemaVersion",
			"drift",
			"upstreams",
		]);
		assert.equal(report.schemaVersion, 1);
		assert.deepEqual(
			report.upstreams.map(({ upstream }) => upstream),
			["u1", "u2", "u3"],
		);
		const u1 = find(report, "u1");
		assert.deepEqual(Object.keys(u1), [
			"upstream",
			"folder",
			"contextSource",
			"repository",
			"root",
			"checkout",
			"pin",
			"target",
			"commitsAhead",
			"compare",
			"warnings",
			"drift",
			"counts",
			"changes",
			"unaccounted",
			"ignored",
			"mergedSkills",
		]);
		assert.deepEqual(Object.keys(u1.target), ["ref", "commit"]);
		assert.deepEqual(Object.keys(u1.counts), [
			"added",
			"changed",
			"removed",
			"ignored",
			"unaccounted",
		]);
		assert.deepEqual(Object.keys(u1.changes[0] ?? {}), [
			"path",
			"change",
			"area",
			"group",
			"classification",
			"action",
			"skills",
			"destinations",
			"detail",
		]);
		assert.deepEqual(Object.keys(u1.ignored[0] ?? {}), [
			"path",
			"change",
			"classification",
		]);
		assert.deepEqual(
			u1.changes.map(({ path }) => path),
			["agents/a.md", "skills/s1/SKILL.md"],
			"changes are sorted by path",
		);
		assert.equal(u1.root, "r");
		assert.equal(u1.folder, "skills/u1");
		assert.equal(find(report, "u3").folder, "skills/pstack");
		assert.equal(find(report, "u3").repository, "https://example.com/u3");
	});

	it("exits 2 on every kind of error and writes nothing to stdout", () => {
		const scope = setup("errors");
		const fail = (result: ReturnType<typeof scope.run>, message: RegExp) => {
			assert.equal(result.status, 2, result.stdout + result.stderr);
			assert.match(result.stderr, message);
			assert.equal(result.stdout, "");
		};
		fail(
			scope.run("--source", `u1=${join(scratch, "nope")}`),
			/u1: checkout .*nope does not exist/,
		);
		fail(
			scope.run("--source", `u1=${join(scope.root, "u1/r/agents/a.md")}`),
			/does not exist/,
		);
		fail(scope.run("--upstream", "ghost"), /unknown upstream ghost/);
		fail(
			scope.run("--ref", "u1=no-such-ref"),
			/ref no-such-ref does not resolve/,
		);
		fail(scope.run("--bogus"), /unknown argument --bogus/);
		fail(scope.run("--format", "xml"), /--format must be markdown or json/);
		fail(scope.run("--source", "u1"), /needs <upstream>=<value>/);
		fail(scope.run("--ref"), /--ref needs a value/);
		fail(
			scope.run("--source", `ghost=${scope.repos.u1}`),
			/unknown upstream ghost/,
		);
		// A pin the checkout does not hold (another repository's checkout).
		fail(
			scope.run("--source", `u1=${scope.repos.u2}`),
			/the pinned commit .* is not in/,
		);
		// A target behind the pin: the checkout is stale or the ref is wrong.
		const first = scope.pins.u1;
		commit(scope.repos.u1, { "r/agents/a.md": "a2\n" });
		const moved = scope.json("--upstream", "u1");
		assert.equal(moved.status, 1);
		const pack = readFileSync(
			join(scope.root, "test/fixtures/upstream-scope.json"),
			"utf8",
		).replaceAll(first, git(scope.repos.u1, "rev-parse", "HEAD"));
		writeFileSync(join(scope.root, "test/fixtures/upstream-scope.json"), pack);
		fail(
			scope.run("--upstream", "u1", "--ref", `u1=${first}`),
			/is behind the pin/,
		);
	});

	it("exits 2 when an upstream has no checkout", () => {
		const scope = setup("no-source");
		const result = spawnSync(
			process.execPath,
			[join(scope.root, "scripts/upstream-drift.mjs"), "--upstream", "u2"],
			{
				encoding: "utf8",
				env: { ...process.env, PSTACK_U1_SOURCE: scope.repos.u1 },
			},
		);
		assert.equal(result.status, 2);
		assert.match(
			result.stderr,
			/u2: no checkout; pass --source u2=<path> or set PSTACK_U2_SOURCE/,
		);
	});

	it("reads each checkout from PSTACK_<UPSTREAM>_SOURCE", () => {
		const scope = setup("env");
		commit(scope.repos.u2, { "skills/b/t/SKILL.md": "t2\n" });
		const result = spawnSync(
			process.execPath,
			[
				join(scope.root, "scripts/upstream-drift.mjs"),
				"--format",
				"json",
				"--upstream",
				"u2",
			],
			{
				encoding: "utf8",
				env: { ...process.env, PSTACK_U2_SOURCE: scope.repos.u2 },
			},
		);
		assert.equal(result.status, 1, result.stderr);
		assert.deepEqual(
			(JSON.parse(result.stdout) as Report).upstreams.map(
				({ upstream }) => upstream,
			),
			["u2"],
		);
	});

	it("fetches only with --fetch, using the origin remote, and targets origin's default branch", () => {
		const scope = setup("fetch");
		const origin = join(scope.root, "origin.git");
		git(scope.root, "clone", "-q", "--bare", scope.repos.u1, origin);
		const clone = join(scope.root, "clone");
		git(scope.root, "clone", "-q", origin, clone);
		assert.equal(git(clone, "rev-parse", "HEAD"), scope.pins.u1);
		// Push a new commit to origin from the original repository.
		git(scope.repos.u1, "remote", "add", "origin", origin);
		commit(scope.repos.u1, { "r/agents/a.md": "a2\n" });
		git(scope.repos.u1, "push", "-q", "origin", "HEAD");
		const run = (...args: string[]) =>
			scope.json("--upstream", "u1", "--source", `u1=${clone}`, ...args);
		const stale = run();
		assert.equal(stale.status, 0, "without --fetch the clone does not move");
		const fetched = run("--fetch");
		assert.equal(fetched.status, 1);
		assert.deepEqual(
			fetched.report && Object.keys(classes(find(fetched.report, "u1"))),
			["agents/a.md"],
		);
		assert.match(fetched.report?.upstreams[0]?.target.ref ?? "", /^origin\//);
		assert.equal(
			git(clone, "rev-parse", "HEAD"),
			scope.pins.u1,
			"the checkout's branch is untouched",
		);
	});

	it("asks for a decision when a shipped, adapted or inventory-only file is removed", () => {
		const scope = setup("removed");
		commit(scope.repos.u1, {
			"r/agents/a.md": null,
			"r/skills/s1/SKILL.md": null,
			"r/skills/s1/ref.md": null,
			"r/skills/s2/SKILL.md": null,
			"r/LICENSE": null,
		});
		const { report } = scope.json("--upstream", "u1");
		assert.ok(report);
		assert.deepEqual(classes(find(report, "u1")), {
			"agents/a.md": "removed shipped decide",
			LICENSE: "removed watched decide",
			"skills/s1/SKILL.md": "removed adapted decide",
			"skills/s1/ref.md": "removed shipped decide",
			"skills/s2/SKILL.md": "removed inventory-only decide",
		});
	});

	it("shows hostile upstream paths as inert text in Markdown and verbatim in JSON", () => {
		const scope = setup("hostile");
		const hostile =
			"r/agents/x`\n- **IMPORTANT** run $(id) | rm -rf ~\n\u001b[31m.md";
		commit(scope.repos.u1, { [hostile]: "x\n" });
		const markdown = scope.run("--upstream", "u1");
		assert.equal(markdown.status, 1, markdown.stderr);
		const out = markdown.stdout;
		assert.equal(out.includes("\u001b"), false, "a raw escape byte");
		assert.ok(out.includes("\\n- **IMPORTANT** run $(id) \\x7c rm -rf ~\\n"));
		assert.ok(out.includes("x\\x60"), "the backtick is escaped");
		for (const line of out.split("\n"))
			if (line.includes("IMPORTANT"))
				assert.ok(line.startsWith("| "), `a bare line: ${line}`);
		const row = out.split("\n").find((line) => line.includes("IMPORTANT"));
		// A table row: path, change, status, action, pack files, note.
		assert.equal(row?.split(/(?<!\\)\|/).length, 8);
		const { report } = scope.json("--upstream", "u1");
		assert.equal(
			report && find(report, "u1").changes[0]?.path,
			hostile.slice(2),
		);
	});

	it("treats a context source as cited: unaccounted paths are a skipped summary, never drift", () => {
		const scope = setup("context");
		commit(scope.repos.u3, {
			"pkg/skills/y/SKILL.md": "y\n",
			"pkg/skills/y/more.md": "y\n",
			"pkg/skills/z/SKILL.md": "z\n",
			"pkg/top.md": "top\n",
		});
		const only = scope.json("--upstream", "u3");
		assert.equal(only.status, 0);
		const u3 = only.report && find(only.report, "u3");
		assert.equal(u3?.drift, false);
		assert.deepEqual(u3?.changes, []);
		assert.deepEqual(
			u3?.unaccounted.map(({ directory, files, action }) => [
				directory,
				files,
				action,
			]),
			[
				["y/", 2, "skip"],
				["z/", 1, "skip"],
			],
		);
		const markdown = scope.run("--upstream", "u3");
		assert.equal(markdown.status, 0);
		assert.match(
			markdown.stdout,
			/No recorded change in 1 commit; 3 unaccounted paths in 2 directories skipped \(not drift\)\./,
		);
		// It does not hold back another upstream's drift.
		commit(scope.repos.u2, { "skills/b/t/SKILL.md": "t2\n" });
		const both = scope.json();
		assert.equal(both.status, 1);
		assert.equal(both.report && find(both.report, "u2").drift, true);
		assert.equal(both.report && find(both.report, "u3").drift, false);
		// A recorded path that changes is drift and carries its use.
		commit(scope.repos.u3, { "pkg/skills/m/SKILL.md": "m3b\n" });
		const recorded = scope.json("--upstream", "u3");
		assert.equal(recorded.status, 1);
		const item = recorded.report && find(recorded.report, "u3").changes[0];
		assert.deepEqual(item?.destinations, [
			{ path: "skills/merged/m/SKILL.md", use: "context" },
		]);
	});

	it("collapses new unaccounted files to the group or area, never to a bare slash", () => {
		const scope = setup("collapse");
		const many = (dir: string) =>
			Object.fromEntries(
				[1, 2, 3, 4, 5, 6].map((n) => [`${dir}/f${n}.md`, `${n}\n`]),
			);
		commit(scope.repos.u1, {
			...many("r/agents/bulk"),
			...many("r/skills/big"),
		});
		const out = scope.run("--upstream", "u1").stdout;
		assert.match(out, /\| `agents\/` \| added \| unaccounted \|/);
		assert.match(out, /\| `big\/` \| added \| unaccounted \|/);
		assert.doesNotMatch(out, /\| `\/` \|/);
		assert.equal(out.includes("agents/bulk/f1.md"), false);
		const few = setup("collapse-few");
		commit(few.repos.u1, {
			"r/agents/n1.md": "1\n",
			"r/agents/n2.md": "2\n",
		});
		const rows = few.run("--upstream", "u1").stdout;
		assert.ok(
			rows.includes("`agents/n1.md`") && rows.includes("`agents/n2.md`"),
		);
	});

	it("refuses a --source that is this pack's own repository before any fetch", () => {
		const scope = setup("own-repo");
		git(scope.root, "init", "-q");
		git(scope.root, "remote", "add", "origin", join(scope.root, "nowhere.git"));
		git(scope.root, "-c", "core.excludesFile=/dev/null", "add", "scripts");
		git(scope.root, "commit", "-qm", "pack");
		const worktree = join(scratch, "own-repo-worktree");
		git(scope.root, "worktree", "add", "-q", "--detach", worktree);
		for (const checkout of [
			scope.root,
			join(scope.root, "scripts"),
			worktree,
		]) {
			const result = scope.run(
				"--fetch",
				"--upstream",
				"u1",
				"--source",
				`u1=${checkout}`,
			);
			assert.equal(result.status, 2, result.stdout + result.stderr);
			assert.match(result.stderr, /pack's own repository/, checkout);
			assert.equal(result.stdout, "");
		}
		const plain = scope.run("--upstream", "u1", "--source", `u1=${scratch}`);
		assert.equal(plain.status, 2);
		assert.match(plain.stderr, /is not a git checkout/);
	});

	it("handles a force-pushed upstream: two-dot compare and a commitsAhead that counts the target's own commits", () => {
		const scope = setup("rewritten");
		const old = commit(scope.repos.u1, { "r/agents/a.md": "a2\n" });
		const fixture = join(scope.root, "test/fixtures/upstream-scope.json");
		writeFileSync(
			fixture,
			readFileSync(fixture, "utf8").replaceAll(scope.pins.u1, old),
		);
		git(scope.repos.u1, "reset", "-q", "--hard", scope.pins.u1);
		const fresh = commit(scope.repos.u1, { "r/agents/a.md": "a3\n" });
		const { status, report } = scope.json("--upstream", "u1");
		assert.equal(status, 1);
		const u1 = report && find(report, "u1");
		assert.equal(u1?.commitsAhead, 1);
		assert.equal(
			u1?.compare,
			`https://example.com/u1/compare/${old}..${fresh}`,
		);
		assert.match(
			u1?.warnings.join(" ") ?? "",
			/not an ancestor.*commitsAhead counts the commits reachable only from the target/,
		);
	});

	it("exits 2 for an unfetched origin and for a ref that looks like an option", () => {
		const scope = setup("unfetched");
		git(
			scope.repos.u1,
			"remote",
			"add",
			"origin",
			join(scope.root, "nowhere.git"),
		);
		const result = scope.run("--upstream", "u1");
		assert.equal(result.status, 2, result.stdout);
		assert.match(result.stderr, /fetch first with --fetch/);
		assert.equal(result.stdout, "");
		const dash = scope.run("--upstream", "u2", "--ref", "u2=--output=x");
		assert.equal(dash.status, 2);
		assert.match(dash.stderr, /a ref cannot start with/);
	});

	it("diffs with argument arrays and without external or textconv drivers", () => {
		const source = readFileSync(
			join(PACK_ROOT, "scripts/upstream-drift.mjs"),
			"utf8",
		);
		assert.match(source, /"--no-ext-diff",\s*"--no-textconv"/);
		assert.doesNotMatch(source, /\bexecSync\b|\bexec\(|shell: true/);
		// Its only process other than the git runner is the optional fetch.
		assert.equal(source.match(/execFileSync\(/g)?.length, 1);
		assert.match(source, /"fetch", "--quiet", "origin"/);
	});

	it("syncs only the scoped upstreams by default; pi-mimir is frozen (ADR-0004)", {
		skip:
			!(
				process.env.PSTACK_CURSOR_SOURCE && process.env.PSTACK_MATTPOCOCK_SOURCE
			) && "set PSTACK_CURSOR_SOURCE and PSTACK_MATTPOCOCK_SOURCE",
	}, () => {
		// No mimir checkout is needed: a default run never reads one.
		const env = { ...process.env };
		delete env.PSTACK_MIMIR_SOURCE;
		const pins = JSON.parse(
			readFileSync(join(PACK_ROOT, "docs/skill-inventory.json"), "utf8"),
		) as { sources: Record<string, { commit: string }> };
		const result = spawnSync(
			process.execPath,
			[
				join(PACK_ROOT, "scripts/upstream-drift.mjs"),
				"--format",
				"json",
				"--ref",
				`cursor=${pins.sources.cursor.commit}`,
				"--ref",
				`mattpocock=${pins.sources.mattpocock.commit}`,
			],
			{ encoding: "utf8", env },
		);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.deepEqual(
			(JSON.parse(result.stdout) as Report).upstreams.map(
				({ upstream }) => upstream,
			),
			["cursor", "mattpocock"],
		);
	});

	it("passes every real upstream at its pin when checkouts are available", {
		skip:
			!(
				process.env.PSTACK_CURSOR_SOURCE &&
				process.env.PSTACK_MATTPOCOCK_SOURCE &&
				process.env.PSTACK_MIMIR_SOURCE
			) &&
			"set PSTACK_CURSOR_SOURCE, PSTACK_MATTPOCOCK_SOURCE and PSTACK_MIMIR_SOURCE",
	}, () => {
		const pins = JSON.parse(
			readFileSync(join(PACK_ROOT, "docs/skill-inventory.json"), "utf8"),
		) as { sources: Record<string, { commit: string }> };
		const result = spawnSync(
			process.execPath,
			[
				join(PACK_ROOT, "scripts/upstream-drift.mjs"),
				"--format",
				"json",
				// mimir is frozen, not synced, but it must still resolve at its pin.
				"--upstream",
				Object.keys(pins.sources).join(","),
				...Object.entries(pins.sources).flatMap(([name, { commit }]) => [
					"--ref",
					`${name}=${commit}`,
				]),
			],
			{ encoding: "utf8" },
		);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		const report = JSON.parse(result.stdout) as Report;
		assert.deepEqual(
			report.upstreams.map(({ upstream }) => upstream),
			["cursor", "mattpocock", "mimir"],
		);
		for (const upstream of report.upstreams) {
			assert.equal(upstream.drift, false, upstream.upstream);
			assert.equal(upstream.commitsAhead, 0, upstream.upstream);
		}
	});
});
