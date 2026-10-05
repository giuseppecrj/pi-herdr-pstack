import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	formatSkillsForPrompt,
	loadSkillsFromDir,
} from "@earendil-works/pi-coding-agent";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(PACK_ROOT, path), "utf8");
const exists = (path: string) => existsSync(join(PACK_ROOT, path));
const sha256 = (value: string | Buffer) =>
	createHash("sha256").update(value).digest("hex");

type SourceKey = "mimir" | "cursor";
type InventoryRow = {
	name: string;
	wave: string;
	status: string;
	primarySource: SourceKey;
	sourceFiles: Partial<Record<SourceKey, string[]>>;
};
type Source = { repository: string; commit: string; root: string };
// SAFETY: parent-owned canonical inventory, schemaVersion checked below.
const inventory = JSON.parse(read("docs/skill-inventory.json")) as {
	schemaVersion: number;
	expectedSkillCount: number;
	sources: Record<SourceKey, Source>;
	skills: InventoryRow[];
};
const waveOf = new Map(inventory.skills.map((row) => [row.name, row.wave]));

type ForwardReference = {
	sourcePath: string;
	targetPath: string;
	owningWave: string;
	reason?: string;
};
// SAFETY: methodology-owned fixture; every field is asserted below.
const forward = JSON.parse(
	read("test/fixtures/wave2-forward-references.json"),
) as { schemaVersion: number; exceptions: ForwardReference[] };

type SourceUse = {
	source: SourceKey;
	path: string;
	sha256: string;
	use: "primary" | "context" | "derived";
};
type ProvenanceFile = {
	path: string;
	sha256: string;
	status: "adapted" | "new";
	sources: SourceUse[];
	explanation: string;
};
type UnshippedSource = {
	source: SourceKey;
	path: string;
	sha256: string;
	explanation: string;
};
// SAFETY: methodology-owned fixture; every field is asserted below.
const provenance = JSON.parse(read("test/fixtures/skill-provenance.json")) as {
	schemaVersion: number;
	sources: Record<SourceKey, Source>;
	files: ProvenanceFile[];
	planned: Array<UnshippedSource & { owningWave: string }>;
	excluded: Array<UnshippedSource & { disposition: string }>;
};

const BASE_PLAYBOOKS = [
	"autonomous-run",
	"bug-fix",
	"feature",
	"investigation",
	"opening-a-pr",
	"pause-safely",
	"perf-issue",
	"prototype",
	"refactoring",
	"runtime-forensics",
	"session-pickup",
	"trace-forensics",
];
const W4_PLAYBOOKS = [
	"authoring-a-skill",
	"autopilot-full",
	"autopilot-stack",
	"babysit",
	"eval",
	"hillclimb",
	"multi-phase-plan",
	"orchestrate",
	"shipping",
	"visual-parity",
	"worktree-cleanup",
];
const OWNED_FILES = [
	"skills/poteto-mode/SKILL.md",
	"skills/poteto-mode/references/authorization.md",
	"skills/poteto-mode/references/bugbot-triage.md",
	"skills/poteto-mode/references/delegation.md",
	...BASE_PLAYBOOKS.map((name) => `skills/poteto-mode/playbooks/${name}.md`),
	"skills/setup-pstack/SKILL.md",
].toSorted();

// Pinned from pi-herdr-agents e262c584 `SubagentParams`; parity is checked
// against that commit when a host checkout is available.
const HOST_HERDR_COMMIT = "e262c584f54a7c8d60eb1fa5510f47c1299e3801";
const HOST_SUBAGENT_PARAMS = [
	"agent",
	"cwd",
	"fork",
	"interactive",
	"model",
	"name",
	"persistent",
	"skills",
	"systemPrompt",
	"task",
	"thinking",
	"tools",
	"worktree",
];
const HOST_TASK_CATEGORIES = [
	"coding",
	"review",
	"recon",
	"qa",
	"architecture",
	"docs",
];
const EXAMPLE_PARAMS = new Set([
	"name",
	"task",
	"agent",
	"model",
	"thinking",
	"tools",
	"systemPrompt",
	"cwd",
	"fork",
	"interactive",
	"worktree",
]);
const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const MODEL_PLACEHOLDER = "<provider>/<model-id>";

function walk(dir: string): string[] {
	return readdirSync(join(PACK_ROOT, dir)).flatMap((entry) => {
		const path = posix.join(dir, entry);
		return statSync(join(PACK_ROOT, path)).isDirectory() ? walk(path) : [path];
	});
}

/** Lines outside fenced code blocks, numbered from 1. */
function proseLines(path: string): Array<{ line: number; text: string }> {
	let fenced = false;
	return read(path)
		.split("\n")
		.flatMap((text, index) => {
			if (text.startsWith("```")) {
				fenced = !fenced;
				return [];
			}
			return fenced ? [] : [{ line: index + 1, text }];
		});
}

type Reference = { sourcePath: string; targetPath: string; text: string };

/** Skill and resource references, resolved to package-relative targets. */
function references(sourcePath: string): Reference[] {
	const skillDir = sourcePath.split("/").slice(0, 2).join("/");
	return proseLines(sourcePath).flatMap(({ line, text }) => {
		for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g))
			assert.match(
				link,
				/^https:\/\//,
				`${sourcePath}:${line} uses a relative Markdown link; use a backticked skill-relative path`,
			);
		const skills = [
			...text.matchAll(
				/\*\*([a-z0-9-]+)\*\*|`([a-z0-9-]+)`|\/skill:([a-z0-9-]+)/g,
			),
		]
			.map((match) => match[1] ?? match[2] ?? match[3])
			.filter((name) => waveOf.has(name))
			.map((name) => `skills/${name}/SKILL.md`);
		const paths = [...text.matchAll(/`([^`\s]+)`/g)]
			.map(([, span]) => span)
			.filter((span) =>
				/^(?:\.\.\/[a-z0-9-]+\/)?(?:(?:playbooks|references|scripts)\/[\w./-]+|SKILL\.md)$/.test(
					span,
				),
			)
			.map((span) => posix.normalize(posix.join(skillDir, span)));
		return [...skills, ...paths].map((targetPath) => ({
			sourcePath,
			targetPath,
			text,
		}));
	});
}

const allReferences = OWNED_FILES.flatMap(references);
const missingReferences = allReferences.filter(
	({ targetPath }) => !exists(targetPath),
);
const tupleKey = ({ sourcePath, targetPath }: ForwardReference | Reference) =>
	`${sourcePath} -> ${targetPath}`;

function expectedWave(targetPath: string): string | undefined {
	const playbook = /^skills\/poteto-mode\/playbooks\/([a-z-]+)\.md$/.exec(
		targetPath,
	);
	if (playbook) return W4_PLAYBOOKS.includes(playbook[1]) ? "W4" : undefined;
	const skill = /^skills\/([a-z0-9-]+)\/SKILL\.md$/.exec(targetPath);
	return skill ? waveOf.get(skill[1]) : undefined;
}

describe("W2 methodology skill tree", () => {
	it("ships exactly the frozen entry contract: two skills, three references, twelve base playbooks", () => {
		assert.deepEqual(walk("skills").toSorted(), OWNED_FILES);
		for (const name of W4_PLAYBOOKS)
			assert.equal(exists(`skills/poteto-mode/playbooks/${name}.md`), false);
		assert.equal(exists("skills/poteto-mode/scripts"), false);
		assert.equal(exists("skills/orchestrate"), false);
	});

	it("loads through the tested Pi skill loader as exactly two skills", () => {
		// SAFETY: installed devDependency manifest.
		const sdk = JSON.parse(
			read("node_modules/@earendil-works/pi-coding-agent/package.json"),
		) as { version: string };
		assert.equal(sdk.version, "1.0.3");

		const { skills, diagnostics } = loadSkillsFromDir({
			dir: join(PACK_ROOT, "skills"),
			source: "pi-herdr-pstack",
		});
		assert.deepEqual(diagnostics, []);
		assert.deepEqual(
			skills
				.map(({ name, filePath, disableModelInvocation }) => ({
					name,
					filePath,
					disableModelInvocation,
				}))
				.toSorted((a, b) => a.name.localeCompare(b.name)),
			[
				{
					name: "poteto-mode",
					filePath: join(PACK_ROOT, "skills/poteto-mode/SKILL.md"),
					disableModelInvocation: true,
				},
				{
					name: "setup-pstack",
					filePath: join(PACK_ROOT, "skills/setup-pstack/SKILL.md"),
					disableModelInvocation: false,
				},
			],
		);
		const prompt = formatSkillsForPrompt(skills);
		assert.match(prompt, /<name>setup-pstack<\/name>/);
		assert.doesNotMatch(prompt, /poteto-mode/);
	});

	it("matches the canonical inventory's W2 rows and partition", () => {
		assert.equal(inventory.schemaVersion, 1);
		assert.equal(inventory.skills.length, inventory.expectedSkillCount);
		assert.equal(inventory.skills.length, 51);
		const count = (prefix: string) =>
			inventory.skills.filter(({ wave }) => wave.startsWith(prefix)).length;
		assert.deepEqual(
			["W2", "W3-A", "W3-B", "W4-A", "W4-B"].map(count),
			[2, 29, 6, 8, 6],
		);
		assert.deepEqual(
			inventory.skills
				.filter(({ wave }) => wave === "W2")
				.map(({ name }) => name)
				.toSorted(),
			["poteto-mode", "setup-pstack"],
		);
	});

	it("has substantive content, not placeholders", () => {
		for (const path of OWNED_FILES) {
			const text = read(path);
			assert.ok(text.length > 1000, `${path} is too thin`);
			assert.doesNotMatch(text, /\b(?:TODO|TBD|FIXME)\b/, path);
			assert.doesNotMatch(
				text,
				/coming soon|lorem ipsum|placeholder skill/i,
				path,
			);
		}
	});
});

describe("references and forward exceptions", () => {
	it("enumerates every unresolved reference as an exact owned-wave tuple", () => {
		assert.equal(forward.schemaVersion, 1);
		const actual = [...new Set(missingReferences.map(tupleKey))].toSorted();
		const listed = forward.exceptions.map(tupleKey);
		assert.equal(new Set(listed).size, listed.length, "duplicate exception");
		assert.deepEqual(listed.toSorted(), actual);
		for (const exception of forward.exceptions) {
			assert.ok(
				OWNED_FILES.includes(exception.sourcePath),
				tupleKey(exception),
			);
			assert.equal(
				exists(exception.targetPath),
				false,
				`${tupleKey(exception)} now resolves; retire the exception`,
			);
			assert.equal(
				exception.owningWave,
				expectedWave(exception.targetPath),
				tupleKey(exception),
			);
		}
	});

	it("marks each forward reference as planned on the line that makes it", () => {
		for (const { sourcePath, targetPath, text } of missingReferences) {
			const wave = expectedWave(targetPath);
			assert.ok(wave, `${sourcePath} -> ${targetPath} has no owning wave`);
			assert.ok(
				text.includes(`planned ${wave.slice(0, 2)}`),
				`${sourcePath} -> ${targetPath} is not marked planned ${wave.slice(0, 2)}: ${text}`,
			);
		}
	});

	it("names principle skills by their full inventory names", () => {
		const principles = inventory.skills
			.map(({ name }) => name)
			.filter((name) => name.startsWith("principle-"));
		for (const path of OWNED_FILES)
			for (const name of principles) {
				const short = name.slice("principle-".length);
				assert.doesNotMatch(
					read(path),
					new RegExp(`\\*\\*${short}\\*\\*`),
					path,
				);
			}
	});

	it("keeps all 24 principle summaries in the hub, each marked planned W3", () => {
		const hub = read("skills/poteto-mode/SKILL.md").split("\n");
		const principles = inventory.skills.filter(({ name }) =>
			name.startsWith("principle-"),
		);
		assert.equal(principles.length, 24);
		for (const { name } of principles) {
			const entries = hub.filter((line) =>
				line.includes(`(**${name}**, planned W3)`),
			);
			assert.equal(entries.length, 1, name);
			assert.match(
				entries[0],
				/^- \*\*[^*]+\*\* \(\*\*[a-z-]+\*\*, planned W3\)\. \S/,
			);
		}
	});

	it("routes every upstream playbook from the hub, W4 rows visibly planned", () => {
		const hub = proseLines("skills/poteto-mode/SKILL.md");
		for (const name of [...BASE_PLAYBOOKS, ...W4_PLAYBOOKS]) {
			const routes = hub.filter(
				({ text }) =>
					text.startsWith("- **") && text.includes(`\`playbooks/${name}.md\``),
			);
			assert.equal(routes.length, 1, name);
			assert.equal(
				routes[0].text.includes("(planned W4)"),
				W4_PLAYBOOKS.includes(name),
				name,
			);
		}
	});
});

describe("delegation contract", () => {
	const examples = OWNED_FILES.flatMap((path) =>
		[...read(path).matchAll(/```json subagent\n([\s\S]*?)\n```/g)].map(
			([, body]) => ({
				path,
				call: JSON.parse(body) as Record<string, unknown>,
			}),
		),
	);

	it("gives runnable examples only the public single-call parameters", () => {
		assert.ok(examples.length >= 4);
		for (const { path, call } of examples) {
			for (const key of Object.keys(call))
				assert.ok(EXAMPLE_PARAMS.has(key), `${path}: ${key}`);
			assert.equal(typeof call.name, "string", path);
			assert.equal(typeof call.task, "string", path);
			if ("agent" in call) assert.equal(call.agent, "poteto", path);
			else
				assert.equal(
					typeof call.systemPrompt,
					"string",
					`${path}: bare delegates carry their prompt`,
				);
			assert.ok(
				call.model === MODEL_PLACEHOLDER ||
					HOST_TASK_CATEGORIES.some(
						(category) => call.model === `task:${category}`,
					),
				`${path}: ${String(call.model)}`,
			);
			assert.ok(THINKING.includes(String(call.thinking)), path);
			assert.equal(typeof call.fork, "boolean", path);
			for (const key of ["tools", "cwd"] as const)
				if (key in call) assert.equal(typeof call[key], "string", path);
			if ("worktree" in call) {
				const worktree = call.worktree as Record<string, unknown>;
				assert.equal(typeof worktree.branch, "string", path);
				for (const key of Object.keys(worktree))
					assert.ok(["branch", "base"].includes(key), path);
			}
		}
		const kinds = new Set(
			examples.map(({ call }) =>
				[
					"agent" in call ? "poteto" : "bare",
					"worktree" in call ? "worktree" : "pane",
					call.model === MODEL_PLACEHOLDER ? "exact" : "task",
				].join("/"),
			),
		);
		for (const kind of [
			"poteto/pane/task",
			"poteto/worktree/task",
			"bare/pane/task",
			"bare/pane/exact",
		])
			assert.ok(kinds.has(kind), kind);
	});

	it("names no other role, obsolete runner API, alias or platform tool", () => {
		const banned = [
			/subagent_type/,
			/poteto-agent/,
			/inherit-parent/,
			/\bset_tasks\b/,
			/run_in_background/,
			/"role"\s*:/,
			/"tasks"\s*:\s*\[/,
			/"chain"\s*:/,
			/AskQuestion/,
			/cursor-team-kit/,
			/\/deslop\b/,
			/\/loop\b/,
			/\bomp\b/,
			/~\/\.cursor/,
			/\.mdc\b/,
			/\b(?:grok|claude|gpt|gemini)-[\w.-]+/,
			/\/(?:iterate|btw)\b/,
			/\bcomment-sicko\b/,
		];
		for (const path of OWNED_FILES) {
			const text = read(path);
			for (const pattern of banned) assert.doesNotMatch(text, pattern, path);
			for (const [, role] of text.matchAll(/\bagent"?\s*:\s*"([^"]+)"/g))
				assert.equal(role, "poteto", path);
		}
	});

	const hostSource =
		process.env.PI_HERDR_AGENTS_SOURCE ??
		resolve(PACK_ROOT, "..", "pi-herdr-agents");
	const hasHost =
		existsSync(join(hostSource, ".git")) &&
		spawnSync("git", [
			"-C",
			hostSource,
			"cat-file",
			"-e",
			`${HOST_HERDR_COMMIT}^{commit}`,
		]).status === 0;
	it("pins the subagent schema and task categories of the tested host", {
		skip:
			!hasHost &&
			`set PI_HERDR_AGENTS_SOURCE to a pi-herdr-agents checkout containing ${HOST_HERDR_COMMIT}`,
	}, () => {
		const show = (path: string) =>
			execFileSync("git", [
				"-C",
				hostSource,
				"show",
				`${HOST_HERDR_COMMIT}:${path}`,
			]).toString("utf8");
		const index = show("pi-extension/subagents/index.ts");
		const params =
			/const SubagentParams = Type\.Object\(\{\n([\s\S]*?)\n\}\);/.exec(index);
		assert.ok(params);
		assert.deepEqual(
			[...params[1].matchAll(/^\t(\w+): /gm)].map(([, key]) => key).toSorted(),
			HOST_SUBAGENT_PARAMS,
		);
		const categories = /TASK_CATEGORIES = \[([\s\S]*?)\]/.exec(
			show("maestro/core/config/task-model-types.ts"),
		);
		assert.ok(categories);
		assert.deepEqual(
			[...categories[1].matchAll(/"(\w+)"/g)].map(([, name]) => name),
			HOST_TASK_CATEGORIES,
		);
	});
});

describe("authorization boundaries", () => {
	it("never lets activation, autonomy or a playbook step grant permission", () => {
		assert.match(
			read("skills/poteto-mode/SKILL.md"),
			/Neither path grants permission\./,
		);
		assert.match(
			read("skills/poteto-mode/references/authorization.md"),
			/never grants permission/,
		);
		assert.match(
			read("skills/poteto-mode/playbooks/opening-a-pr.md"),
			/only when the task authorizes opening a pull request/,
		);
		assert.match(
			read("skills/poteto-mode/references/bugbot-triage.md"),
			/Replying to, resolving or reacting to a remote thread is an external action/,
		);
	});

	it("keeps setup report-only without invoking the writer", () => {
		const setup = read("skills/setup-pstack/SKILL.md");
		assert.match(setup, /\*\*Configuration writes are currently blocked\.\*\*/);
		assert.match(setup, /End with "No changes were made\."/);
		for (const line of setup
			.split("\n")
			.filter((text) => text.includes("subagents_write_task_models")))
			assert.match(line, /\b(?:not|never)\b/i, line);
		const snippet = /```bash\n([\s\S]*?)\n```/.exec(setup);
		assert.ok(snippet);
		assert.doesNotMatch(
			snippet[1],
			/write|append|rename|unlink|mkdir|rmSync|copyFile|chmod/i,
		);
	});
});

describe("methodology provenance", () => {
	it("records the inventory's pinned sources", () => {
		assert.equal(provenance.schemaVersion, 1);
		assert.deepEqual(provenance.sources, inventory.sources);
	});

	it("hashes every shipped methodology file", () => {
		assert.deepEqual(
			provenance.files.map(({ path }) => path).toSorted(),
			OWNED_FILES,
		);
		for (const file of provenance.files) {
			assert.equal(
				sha256(readFileSync(join(PACK_ROOT, file.path))),
				file.sha256,
				`${file.path} changed without updating its reviewed provenance`,
			);
			assert.ok(file.explanation.length > 20, file.path);
			assert.equal(
				file.sources.filter(({ use }) => use === "primary").length,
				file.status === "adapted" ? 1 : 0,
				file.path,
			);
			assert.ok(file.sources.length > 0, file.path);
		}
	});

	it("accounts for each upstream source file of both W2 rows exactly once", () => {
		for (const row of inventory.skills.filter(({ wave }) => wave === "W2")) {
			const source = row.primarySource;
			const expected = (row.sourceFiles[source] ?? []).toSorted();
			const accounted = [
				...provenance.files.flatMap(({ sources }) =>
					sources.filter((use) => use.use === "primary"),
				),
				...provenance.planned,
				...provenance.excluded,
			]
				.filter(
					(entry) =>
						entry.source === source && entry.path.startsWith(`${row.name}/`),
				)
				.map(({ path }) => path)
				.toSorted();
			assert.deepEqual(accounted, expected, row.name);
		}
		assert.deepEqual(
			provenance.planned
				.map(({ path, owningWave }) => `${owningWave} ${path}`)
				.toSorted(),
			W4_PLAYBOOKS.map((name) => `W4 poteto-mode/playbooks/${name}.md`),
		);
		for (const { path, disposition } of provenance.excluded) {
			assert.match(path, /^poteto-mode\/scripts\//);
			assert.ok(disposition.length > 20, path);
		}
		const context = provenance.files.flatMap(({ sources }) =>
			sources.filter(({ source }) => source === "cursor"),
		);
		for (const { path } of context)
			assert.ok(
				inventory.skills.some((row) => row.sourceFiles.cursor?.includes(path)),
				path,
			);
	});

	const checkout = (key: SourceKey) => {
		const path =
			process.env[
				key === "mimir" ? "PSTACK_MIMIR_SOURCE" : "PSTACK_CURSOR_SOURCE"
			];
		return path &&
			spawnSync("git", [
				"-C",
				path,
				"cat-file",
				"-e",
				`${inventory.sources[key].commit}^{commit}`,
			]).status === 0
			? path
			: undefined;
	};
	const checkouts = { mimir: checkout("mimir"), cursor: checkout("cursor") };
	it("reproduces every recorded source hash from the pinned commits", {
		skip:
			!(checkouts.mimir && checkouts.cursor) &&
			"set PSTACK_MIMIR_SOURCE and PSTACK_CURSOR_SOURCE to checkouts containing the pinned commits",
	}, () => {
		const sources = [
			...provenance.files.flatMap(({ sources }) => sources),
			...provenance.planned,
			...provenance.excluded,
		];
		for (const { source, path, sha256: recorded } of sources) {
			const { commit, root } = inventory.sources[source];
			const blob = execFileSync("git", [
				"-C",
				checkouts[source] ?? "",
				"show",
				`${commit}:${root}/${path}`,
			]);
			assert.equal(sha256(blob), recorded, `${source}:${path}`);
		}
	});

	it("preserves both upstream MIT notices and documents the W2 adaptation", () => {
		const notices = read("THIRD_PARTY_NOTICES.md");
		assert.match(notices, /Copyright \(c\) 2026 Lauren Tan/);
		assert.match(notices, /Copyright \(c\) 2026 Ivan Porto Carrero/);
		assert.match(notices, /Copyright \(c\) 2026 HazAT/);
		for (const { commit } of Object.values(inventory.sources)) {
			assert.ok(notices.includes(commit));
			assert.ok(read("docs/provenance.md").includes(commit));
		}
		assert.ok(
			read("docs/provenance.md").includes(
				"test/fixtures/skill-provenance.json",
			),
		);
	});
});
