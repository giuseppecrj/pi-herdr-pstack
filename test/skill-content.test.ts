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
import { lexer, type Tokens, walkTokens } from "marked";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(PACK_ROOT, path), "utf8");
const exists = (path: string) => existsSync(join(PACK_ROOT, path));
const sha256 = (value: string | Buffer) =>
	createHash("sha256").update(value).digest("hex");
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

type SourceKey = "mimir" | "cursor";
type InventoryRow = {
	name: string;
	wave: string;
	status: "planned" | "shipped";
	primarySource: SourceKey;
	/** Paths relative to the source root; `../agents/` reaches a sibling role file. */
	sourceFiles: Partial<Record<SourceKey, string[]>>;
};
type Source = { repository: string; commit: string; root: string };
// SAFETY: parent-owned canonical inventory, schemaVersion checked below.
const inventory = readJson<{
	schemaVersion: number;
	expectedSkillCount: number;
	sources: Record<SourceKey, Source>;
	skills: InventoryRow[];
}>("docs/skill-inventory.json");
const rowOf = new Map(inventory.skills.map((row) => [row.name, row]));
const waveOf = new Map(inventory.skills.map((row) => [row.name, row.wave]));

/**
 * Each fixture owner and the wave whose files it owns: an inventory wave owns
 * its rows' skill directories, and W4-P owns the W4 poteto-mode playbooks and
 * check-plan.mjs inside the W2 hub row (see `ownerWaveOf`).
 */
const W4_OWNERS = { "w4-a": "W4-A", "w4-b": "W4-B", "w4-p": "W4-P" };
const FORWARD_OWNERS = {
	hub: "W2",
	"w3-a": "W3-A",
	"w3-b": "W3-B",
	...W4_OWNERS,
};
const PROVENANCE_OWNERS = {
	w2: "W2",
	"w3-a": "W3-A",
	"w3-b": "W3-B",
	...W4_OWNERS,
};
/** A deferred target's tuples may name this wave instead of the target's own. */
const DEFERRED_WAVE = "W5";

type ForwardReference = {
	sourcePath: string;
	targetPath: string;
	owningWave: string;
	reason?: string;
};
// SAFETY: owner-split fixtures; every field is asserted below.
const forwardFixtures = Object.entries(FORWARD_OWNERS).map(([owner, wave]) => ({
	owner,
	wave,
	...readJson<{ schemaVersion: number; exceptions: ForwardReference[] }>(
		`test/fixtures/forward-references/${owner}.json`,
	),
}));
const exceptions = forwardFixtures.flatMap(({ exceptions }) => exceptions);

type SourceUse = {
	source: SourceKey;
	path: string;
	sha256: string;
	use: "primary" | "context" | "derived";
};
type ProvenanceFile = {
	path: string;
	sha256: string;
	status: "copied" | "adapted" | "new";
	sources: SourceUse[];
	explanation: string;
	/** Required when an adapted file is under half its primary source's length. */
	lengthExplanation?: string;
};
type UnshippedSource = {
	source: SourceKey;
	path: string;
	sha256: string;
	explanation: string;
};
type ProvenanceFixture = {
	schemaVersion: number;
	sources: Record<SourceKey, Source>;
	files: ProvenanceFile[];
	planned: Array<UnshippedSource & { owningWave: string }>;
	excluded: Array<UnshippedSource & { disposition: string }>;
};
// SAFETY: owner-split fixtures; every field is asserted below.
const provenanceFixtures = Object.entries(PROVENANCE_OWNERS).map(
	([owner, wave]) => ({
		owner,
		wave,
		...readJson<ProvenanceFixture>(
			`test/fixtures/skill-provenance/${owner}.json`,
		),
	}),
);
const provenanceFiles = provenanceFixtures.flatMap(({ files }) => files);
const provenanceOf = (owner: string) => {
	const fixture = provenanceFixtures.find((entry) => entry.owner === owner);
	assert.ok(fixture, owner);
	return fixture;
};
/**
 * W4 playbooks still planned, by target path, with their owning wave. A
 * playbook ships when the reconcile commit takes it off w2.json's `planned`
 * list; until then it may exist on a batch branch but is still planned.
 */
const plannedPlaybooks = new Map(
	provenanceOf("w2").planned.map(({ path, owningWave }) => [
		`skills/${path}`,
		owningWave,
	]),
);

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
const W4P_FILES = [
	...W4_PLAYBOOKS.map((name) => `skills/poteto-mode/playbooks/${name}.md`),
	"skills/poteto-mode/scripts/check-plan.mjs",
];
/** The fixture wave that owns a shipped or referencing file. */
const ownerWaveOf = (path: string) =>
	W4P_FILES.includes(path) ? "W4-P" : waveOf.get(path.split("/")[1]);
const FAN_OUT = "skills/poteto-mode/references/fan-out.md";
/** Every script that may ship, with its upstream git mode. */
const SCRIPT_MODES: Record<string, string> = {
	"skills/poteto-mode/scripts/check-plan.mjs": "100644",
	"skills/show-me-your-work/scripts/log.sh": "100755",
};
const W2_FILES = [
	"skills/poteto-mode/SKILL.md",
	"skills/poteto-mode/references/authorization.md",
	"skills/poteto-mode/references/bugbot-triage.md",
	"skills/poteto-mode/references/delegation.md",
	...BASE_PLAYBOOKS.map((name) => `skills/poteto-mode/playbooks/${name}.md`),
	"skills/setup-pstack/SKILL.md",
].toSorted();
const COMMENT_SICKO_PROMPT = "skills/no-comments/references/comment-sicko.md";
const COMMENT_SICKO_SYSTEM_PROMPT =
	"<the full text of references/comment-sicko.md, verbatim>";
/** Files outside `skills/no-comments/` that may name the delegate, on lines that also name `no-comments`. */
const COMMENT_SICKO_DESCRIBERS = [
	"skills/poteto-mode/SKILL.md",
	"skills/poteto-mode/references/delegation.md",
];

// Pinned from pi-herdr-agents 7d35371 `SubagentParams`; parity is checked
// against that commit when a host checkout is available. The schema body and
// task categories are byte-identical to the W2 pin e262c584.
const HOST_HERDR_COMMIT = "7d35371f5d7d0df3edd208a1d5c9a187767d563b";
type ParamKind = "string" | "boolean" | "thinking" | "worktree";
const HOST_SUBAGENT_SCHEMA: Record<
	string,
	{ kind: ParamKind; required: boolean }
> = {
	agent: { kind: "string", required: false },
	cwd: { kind: "string", required: false },
	fork: { kind: "boolean", required: false },
	interactive: { kind: "boolean", required: false },
	model: { kind: "string", required: false },
	name: { kind: "string", required: true },
	persistent: { kind: "boolean", required: false },
	skills: { kind: "string", required: false },
	systemPrompt: { kind: "string", required: false },
	task: { kind: "string", required: true },
	thinking: { kind: "thinking", required: false },
	tools: { kind: "string", required: false },
	worktree: { kind: "worktree", required: false },
};
const HOST_SUBAGENT_PARAMS = Object.keys(HOST_SUBAGENT_SCHEMA);
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
/** A concrete model name; methodology names families and task categories. */
const MODEL_SLUG = /\b(?:grok|claude|gpt|gemini|composer)-[\w.-]+/;
// gh is the only forge. The git remote named origin and the HTTP Origin
// header stay allowed. `E` admits markdown emphasis around a word, so word
// edges are `L` and `R` rather than \b, which `_` would defeat.
const E = "[`*_]*";
const L = "(?<![A-Za-z0-9])";
const R = "(?![A-Za-z0-9])";
const ORIGIN_FORGE = [
	new RegExp(`${L}origin${E}\\s+${E}pr(?![A-Za-z0-9/-])`, "i"),
	new RegExp(
		`${L}(?:which|type|hash|command\\s+-[vV])${E}\\s+${E}origin${R}|${L}origin${E}\\s+--version|${L}npx\\s+origin${R}`,
	),
	/\bcursor[-_]origin\b|origin\.cursor\.com|\borigin[-_]cli\b/i,
	new RegExp(
		`${L}Cursor${E}\\s+${E}Origin${R}|${L}Origin${E}\\s+${E}(?:forge|CLI)${R}`,
		"i",
	),
	new RegExp(
		`${L}(?:[Oo]n|[Ww]ith|[Vv]ia|[Tt]hrough|[Bb]y|or|[Pp]refer|[Ii]f)${E}\\s+${E}Origin${R}(?!${E}(?:\\s+header|:))|${L}Origin${E}\\s+${E}(?:can|reports|merge-when-ready|is\\s+absent|when\\s+its)${R}`,
	),
];
const DELEGATION = "skills/poteto-mode/references/delegation.md";

/** Problems with one call against the pinned host schema; empty when valid. */
function schemaProblems(call: Record<string, unknown>): string[] {
	const problems = Object.entries(HOST_SUBAGENT_SCHEMA)
		.filter(([key, { required }]) => required && !(key in call))
		.map(([key]) => `missing ${key}`);
	for (const [key, value] of Object.entries(call)) {
		const kind = HOST_SUBAGENT_SCHEMA[key]?.kind;
		const valid =
			kind === "string"
				? typeof value === "string"
				: kind === "boolean"
					? typeof value === "boolean"
					: kind === "thinking"
						? THINKING.includes(String(value))
						: kind === "worktree" && validWorktree(value);
		if (!valid) problems.push(`${key}: ${JSON.stringify(value)}`);
	}
	return problems;
}

/** `null`, or `{ branch, base? }` with a non-empty branch. */
function validWorktree(value: unknown): boolean {
	if (value === null) return true;
	if (typeof value !== "object") return false;
	const { branch, base, ...rest } = value as Record<string, unknown>;
	return (
		typeof branch === "string" &&
		branch.length > 0 &&
		(base === undefined || typeof base === "string") &&
		Object.keys(rest).length === 0
	);
}

/**
 * The prompt file a `systemPrompt` placeholder names, resolved from the
 * example's skill directory, or undefined when the placeholder is malformed.
 * See references/fan-out.md, section 2.
 */
function promptTarget(path: string, systemPrompt: unknown): string | undefined {
	const text = String(systemPrompt);
	const skillDir = path.split("/").slice(0, 2).join("/");
	if (
		path === DELEGATION &&
		/^<the (?:Implementer|Investigator|Reviewer|Verifier) prompt above, verbatim>$/.test(
			text,
		)
	)
		return DELEGATION;
	const named =
		/^<the (?:Implementer|Investigator|Reviewer|Verifier) prompt in (\S+), verbatim>$/.exec(
			text,
		);
	if (named) {
		const target = posix.normalize(posix.join(skillDir, named[1]));
		return target === DELEGATION ? target : undefined;
	}
	const fixed = /^<the full text of (\S+\.md), verbatim>$/.exec(text);
	if (fixed) {
		const target = posix.normalize(posix.join(skillDir, fixed[1]));
		return /^skills\/[a-z0-9-]+\/references\//.test(target) &&
			target !== DELEGATION
			? target
			: undefined;
	}
	return undefined;
}

function walk(dir: string): string[] {
	const entries = readdirSync(join(PACK_ROOT, dir));
	assert.ok(entries.length > 0, `${dir} is an empty directory`);
	return entries.flatMap((entry) => {
		const path = posix.join(dir, entry);
		return statSync(join(PACK_ROOT, path)).isDirectory() ? walk(path) : [path];
	});
}

const SHIPPED_FILES = walk("skills").toSorted();
const rowNameOf = (path: string) => path.split("/")[1];
/** Inventory rows whose skill directory exists in this tree. */
const presentRows = inventory.skills.filter(({ name }) =>
	exists(`skills/${name}`),
);
const shippedRows = inventory.skills.filter(
	({ status }) => status === "shipped",
);
const MARKDOWN_FILES = SHIPPED_FILES.filter((path) => path.endsWith(".md"));

type Fence = { info: string; open: string; content: string[] };

/**
 * Each line's fenced block, or undefined for prose, following the CommonMark
 * fence rules (backtick or tilde runs of three or more, closed by a run of the
 * same character at least as long with nothing after it). The delegation
 * contract checks these blocks against the `marked` lexer.
 */
function fences(path: string): Array<Fence | undefined> {
	return fencesOf(read(path));
}

function fencesOf(markdown: string): Array<Fence | undefined> {
	let open: Fence | undefined;
	return markdown.split("\n").map((text) => {
		if (open) {
			const fence = open;
			const run = new RegExp(
				`^\\s*\\${fence.open[0]}{${fence.open.length},}\\s*$`,
			);
			if (run.test(text)) open = undefined;
			else fence.content.push(text);
			return fence;
		}
		const start = /^\s*(`{3,}(?=[^`]*$)|~{3,})(.*)$/.exec(text);
		if (!start) return undefined;
		open = { open: start[1], info: start[2].trim(), content: [] };
		return open;
	});
}

/** Lines outside fenced code blocks, numbered from 1. */
function proseLines(path: string): Array<{ line: number; text: string }> {
	const fenced = fences(path);
	return read(path)
		.split("\n")
		.flatMap((text, index) =>
			fenced[index] ? [] : [{ line: index + 1, text }],
		);
}

/** Prose with inline code spans removed. */
const withoutCodeSpans = (text: string) => text.replace(/(`+)[^`]*?\1/g, "");

/** An exact upstream quotation an adapted file may keep despite a ban. */
type Quotation = { path: string; snippet: string };

/** Placeholder markers that adapted files quote from upstream prompts. */
const QUOTED_MARKERS: Quotation[] = [
	{
		path: "skills/architect/references/runner-prompt.md",
		snippet: "`// TODO` pseudocode for tricky logic",
	},
];

/** Model names that adapted files quote from upstream examples. */
const QUOTED_MODELS: Quotation[] = [];

/**
 * The text a ban applies to. A byte-identical upstream copy is scanned as
 * prose only, without fenced blocks or inline code, because its code quotes
 * upstream. An adapted or new file is scanned in full, less the exact
 * quotations allowlisted for its path; each allowlisted snippet must still
 * occur, so a stale entry fails.
 */
function bannable(
	path: string,
	text: string,
	status: ProvenanceFile["status"] | undefined,
	quotations: Quotation[],
): string {
	if (!path.endsWith(".md")) return text;
	if (status === "copied") {
		const fenced = fencesOf(text);
		return text
			.split("\n")
			.filter((_, index) => !fenced[index])
			.map(withoutCodeSpans)
			.join("\n");
	}
	return quotations
		.filter((quotation) => quotation.path === path)
		.reduce((rest, { snippet }) => {
			assert.ok(rest.includes(snippet), `${path} no longer quotes ${snippet}`);
			return rest.split(snippet).join("");
		}, text);
}

const statusOf = (path: string) =>
	provenanceFiles.find((file) => file.path === path)?.status;
const PLACEHOLDER = /\b(?:TODO|TBD|FIXME)\b/;

type Reference = { sourcePath: string; targetPath: string; text: string };

/** Skill and resource references, resolved to package-relative targets. */
function references(sourcePath: string): Reference[] {
	const skillDir = sourcePath.split("/").slice(0, 2).join("/");
	return proseLines(sourcePath).flatMap(({ text }) => {
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

const allReferences = MARKDOWN_FILES.flatMap(references);
const missingReferences = allReferences.filter(
	({ targetPath }) => !exists(targetPath),
);
const tupleKey = ({ sourcePath, targetPath }: ForwardReference | Reference) =>
	`${sourcePath} -> ${targetPath}`;

/** The wave that owns a reference target, or undefined for unowned paths. */
function expectedWave(targetPath: string): string | undefined {
	const playbook = /^skills\/poteto-mode\/playbooks\/([a-z-]+)\.md$/.exec(
		targetPath,
	);
	if (playbook)
		return W4_PLAYBOOKS.includes(playbook[1])
			? (plannedPlaybooks.get(targetPath) ?? "W4")
			: undefined;
	const skill = /^skills\/([a-z0-9-]+)\/SKILL\.md$/.exec(targetPath);
	return skill ? waveOf.get(skill[1]) : undefined;
}

/** Whether a reference target belongs to a row (or W4 playbook) not yet shipped. */
function targetPlanned(targetPath: string): boolean {
	const skill = /^skills\/([a-z0-9-]+)\//.exec(targetPath);
	if (targetPath.startsWith("skills/poteto-mode/playbooks/"))
		return plannedPlaybooks.has(targetPath);
	return skill ? rowOf.get(skill[1])?.status === "planned" : false;
}

const listedWave = new Map(
	exceptions.map((exception) => [tupleKey(exception), exception.owningWave]),
);
/** The wave a reference waits for: its tuple's, else its target's. */
const waveFor = (reference: Reference) =>
	listedWave.get(tupleKey(reference)) ?? expectedWave(reference.targetPath);

const frontmatter = (path: string) =>
	/^---\n([\s\S]*?)\n---\n/.exec(read(path))?.[1];
const body = (path: string) => read(path).replace(/^---\n[\s\S]*?\n---\n/, "");

describe("shipped skill tree", () => {
	it("matches the canonical inventory partition and statuses", () => {
		assert.equal(inventory.schemaVersion, 2);
		assert.equal(inventory.skills.length, inventory.expectedSkillCount);
		assert.equal(inventory.skills.length, 51);
		const count = (prefix: string) =>
			inventory.skills.filter(({ wave }) => wave.startsWith(prefix)).length;
		assert.deepEqual(
			["W2", "W3-A", "W3-B", "W4-A", "W4-B"].map(count),
			[2, 29, 6, 8, 6],
		);
		for (const row of inventory.skills) {
			assert.ok(["planned", "shipped"].includes(row.status), row.name);
			assert.ok(row.sourceFiles[row.primarySource]?.length, row.name);
			for (const paths of Object.values(row.sourceFiles))
				for (const path of paths ?? [])
					assert.ok(
						path.startsWith(`${row.name}/`) ||
							(row.name === "no-comments" &&
								path === "../agents/comment-sicko.md"),
						`${row.name}: ${path}`,
					);
		}
		for (const name of ["poteto-mode", "setup-pstack"])
			assert.equal(rowOf.get(name)?.status, "shipped", name);
	});

	it("re-authors make-bot-ui from its Cursor source under a valid Pi name (D4)", () => {
		const row = rowOf.get("make-bot-ui");
		assert.equal(row?.wave, "W4-B");
		assert.equal(row?.primarySource, "cursor");
		assert.deepEqual(row?.sourceFiles, { cursor: ["make-bot-ui/SKILL.md"] });
	});

	it("loads make-bot-ui with zero diagnostics", {
		skip: !exists("skills/make-bot-ui") && "make-bot-ui ships with W4-B",
	}, () => {
		const { skills, diagnostics } = loadSkillsFromDir({
			dir: join(PACK_ROOT, "skills/make-bot-ui"),
			source: "pi-herdr-pstack",
		});
		assert.deepEqual(diagnostics, []);
		assert.deepEqual(
			skills.map(({ name }) => name),
			["make-bot-ui"],
		);
	});

	it("has every shipped row present, and only shipped or in-progress W3 and W4 rows", () => {
		for (const { name } of shippedRows)
			assert.ok(exists(`skills/${name}/SKILL.md`), `${name} is shipped`);
		for (const { name, status, wave } of presentRows)
			assert.ok(
				status === "shipped" || /^W[34]-/.test(wave),
				`${name} (${wave}) is present but ${status}`,
			);
		assert.deepEqual(
			readdirSync(join(PACK_ROOT, "skills")).toSorted(),
			presentRows.map(({ name }) => name).toSorted(),
			"every skill directory is an inventory row",
		);
		for (const path of W4P_FILES.filter((file) => file.endsWith(".md")))
			assert.ok(
				plannedPlaybooks.has(path) || exists(path),
				`${path} left w2.json planned but is absent`,
			);
		if (exists("skills/poteto-mode/scripts"))
			assert.deepEqual(
				readdirSync(join(PACK_ROOT, "skills/poteto-mode/scripts")),
				["check-plan.mjs"],
			);
		assert.equal(exists("skills/orchestrate"), false);
		assert.equal(exists("agents"), false);
		for (const path of SHIPPED_FILES.filter(
			(file) => rowNameOf(file) !== "no-comments",
		))
			assert.equal(path.endsWith("comment-sicko.md"), false, path);
	});

	it("loads through the tested Pi skill loader as exactly the present rows", () => {
		// SAFETY: installed devDependency manifest.
		const sdk = readJson<{ version: string }>(
			"node_modules/@earendil-works/pi-coding-agent/package.json",
		);
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
			presentRows
				.map(({ name }) => ({
					name,
					filePath: join(PACK_ROOT, `skills/${name}/SKILL.md`),
					disableModelInvocation: name !== "setup-pstack",
				}))
				.toSorted((a, b) => a.name.localeCompare(b.name)),
		);
		const prompt = formatSkillsForPrompt(skills);
		assert.deepEqual(
			[...prompt.matchAll(/<name>([^<]+)<\/name>/g)].map(([, name]) => name),
			["setup-pstack"],
		);
		for (const { name } of presentRows)
			assert.doesNotMatch(
				frontmatter(`skills/${name}/SKILL.md`) ?? "",
				/^paths\s*:/m,
				`${name}: Pi ignores paths; drop it`,
			);
	});

	it("keeps the W2 files at their frozen entry-contract paths, plus the W4 fan-out protocol", () => {
		for (const path of W2_FILES) assert.ok(SHIPPED_FILES.includes(path), path);
		assert.deepEqual(
			SHIPPED_FILES.filter(
				(path) =>
					["poteto-mode", "setup-pstack"].includes(rowNameOf(path)) &&
					!W4P_FILES.includes(path),
			),
			[...W2_FILES, FAN_OUT].toSorted(),
		);
		assert.match(
			read(DELEGATION),
			/also follow `references\/fan-out\.md`/,
			"delegation.md points at the fan-out protocol",
		);
	});

	it("has substantive content, not placeholders", () => {
		for (const path of SHIPPED_FILES) {
			const text = read(path);
			assert.ok(body(path).trim().length > 0, `${path} has an empty body`);
			// Only copies and allowlisted quotations may quote a marker.
			assert.doesNotMatch(
				bannable(path, text, statusOf(path), QUOTED_MARKERS),
				PLACEHOLDER,
				path,
			);
			assert.doesNotMatch(
				text,
				/coming soon|lorem ipsum|placeholder skill/i,
				path,
			);
		}
		// Length against the primary source is checked with the source hashes.
		for (const file of provenanceFiles.filter(({ status }) => status === "new"))
			assert.ok(read(file.path).length > 1000, `${file.path} is too thin`);
	});
});

describe("quotation exemptions", () => {
	const ADAPTED = "skills/poteto-mode/playbooks/hillclimb.md";
	const RUNNER = "skills/architect/references/runner-prompt.md";

	it("fails an adapted file that quotes a placeholder outside the allowlist", () => {
		const text = "# Step\n\n- `TODO`: define later\n";
		assert.match(
			bannable(ADAPTED, text, "adapted", QUOTED_MARKERS),
			PLACEHOLDER,
		);
	});

	it("fails an adapted file whose fenced block names an unverified model", () => {
		const text = "# Run\n\n```bash\npi --model claude-unverified\n```\n";
		assert.match(bannable(ADAPTED, text, "adapted", QUOTED_MODELS), MODEL_SLUG);
	});

	it("passes the allowlisted runner-prompt quotation and nothing beside it", () => {
		const text = read(RUNNER);
		assert.equal(statusOf(RUNNER), "adapted");
		assert.doesNotMatch(
			bannable(RUNNER, text, "adapted", QUOTED_MARKERS),
			PLACEHOLDER,
		);
		assert.match(
			bannable(
				RUNNER,
				`${text}\n\`// TODO\` elsewhere\n`,
				"adapted",
				QUOTED_MARKERS,
			),
			PLACEHOLDER,
		);
	});

	it("passes quotations in byte-identical copies", () => {
		for (const [path, pattern] of [
			["skills/why/references/sources/code-archaeology.md", PLACEHOLDER],
			["skills/reflect/references/synthesizer.md", MODEL_SLUG],
		] as const) {
			assert.equal(statusOf(path), "copied", path);
			assert.match(read(path), pattern, path);
			assert.doesNotMatch(
				bannable(path, read(path), "copied", []),
				pattern,
				path,
			);
		}
	});
});

describe("Origin forge ban", () => {
	const banned = (text: string) =>
		ORIGIN_FORGE.some((pattern) => pattern.test(text));

	it("catches Origin forge wording, wrapped or emphasized", () => {
		for (const text of [
			"through `gh` by default or Origin when its CLI is available",
			"On Origin, that is the merge-ready state.",
			"after Origin reports the PR mergeable",
			"It does not prove Origin merge-when-ready is armed",
			"If Origin is absent or cannot resolve the repository, stay on `gh`.",
			"If `command -v origin` succeeds and Origin can resolve the repository",
			"With Origin, pass `--status open`.",
			"prefer `origin pr ...`",
			"`origin pr create --status open --base <parent-branch>`",
			"run `origin pr ready <number>`",
			"`Origin PR view 12`",
			"run origin  pr view 12",
			"run `origin`\npr view 12",
			"**origin** pr merge 12 --squash",
			"which origin",
			"`type origin`",
			"hash origin 2>/dev/null",
			"command  -V origin",
			"origin --version",
			"npx origin pr list",
			"install cursor-origin",
			"see origin.cursor.com",
			"the origin_cli wrapper",
			"Cursor's\nOrigin forge",
			"the *Origin* forge",
			"the Origin  CLI",
			"via **Origin**",
			"Arm _Origin_ merge-when-ready.",
			"run _origin pr_ view 3",
			"through\nOrigin",
			"by Origin",
			"Prefer Origin when present.",
		]) {
			assert.ok(banned(text), text);
		}
	});

	it("allows the git remote named origin and the HTTP Origin header", () => {
		for (const text of [
			"git push origin main",
			"git push -u origin cursor/topic",
			"git fetch origin <head-branch> && git checkout <head SHA>",
			"git fetch origin pr/14/head",
			"git push origin pr-123",
			"git diff --name-only $(git merge-base HEAD origin/main) origin/main",
			"git remote get-url origin",
			"refs/remotes/origin/main",
			"an `Origin` header is present and equals the server's own origin",
			"with `Origin: https://example.com` returns `403`",
			"unless any `Origin` header present equals the server's own origin",
			"Add the exposed host name to the `Host` and `Origin` checks.",
			"Find the origin of the bug.",
			"an incident-driven origin plausible",
			"## Original Question",
		]) {
			assert.ok(!banned(text), text);
		}
	});
});

describe("references and forward exceptions", () => {
	it("splits exceptions by owner, each source inside its owner's skill directories", () => {
		assert.deepEqual(
			readdirSync(
				join(PACK_ROOT, "test/fixtures/forward-references"),
			).toSorted(),
			Object.keys(FORWARD_OWNERS)
				.map((owner) => `${owner}.json`)
				.toSorted(),
		);
		for (const { owner, wave, schemaVersion, exceptions } of forwardFixtures) {
			assert.equal(schemaVersion, 1, owner);
			for (const exception of exceptions)
				assert.equal(
					ownerWaveOf(exception.sourcePath),
					wave,
					`${owner}: ${tupleKey(exception)}`,
				);
		}
	});

	it("enumerates every unresolved reference as an exact owned-wave tuple", () => {
		const listed = exceptions.map(tupleKey);
		assert.equal(new Set(listed).size, listed.length, "duplicate exception");
		const actual = new Set(allReferences.map(tupleKey));
		for (const key of new Set(missingReferences.map(tupleKey)))
			assert.ok(listed.includes(key), `${key} is unresolved and unlisted`);
		for (const exception of exceptions) {
			const key = tupleKey(exception);
			assert.ok(SHIPPED_FILES.includes(exception.sourcePath), key);
			assert.ok(actual.has(key), `${key} no longer occurs; retire it`);
			assert.ok(
				targetPlanned(exception.targetPath),
				`${key} targets a shipped or unowned path; retire it`,
			);
			assert.ok(
				[expectedWave(exception.targetPath), DEFERRED_WAVE].includes(
					exception.owningWave,
				),
				`${key}: owningWave ${exception.owningWave}`,
			);
		}
		const deferred = new Set(
			exceptions
				.filter(({ owningWave }) => owningWave === DEFERRED_WAVE)
				.map(({ targetPath }) => targetPath),
		);
		for (const exception of exceptions.filter(({ targetPath }) =>
			deferred.has(targetPath),
		))
			assert.equal(
				exception.owningWave,
				DEFERRED_WAVE,
				`${tupleKey(exception)}: a deferred target is deferred in every tuple`,
			);
	});

	it("marks each forward reference as planned on the line that makes it", () => {
		const listed = new Set(exceptions.map(tupleKey));
		for (const reference of allReferences) {
			const { sourcePath, targetPath, text } = reference;
			if (exists(targetPath) && !listed.has(tupleKey(reference))) continue;
			const wave = waveFor(reference);
			assert.ok(wave, `${sourcePath} -> ${targetPath} has no owning wave`);
			assert.ok(
				text.includes(`planned ${wave.slice(0, 2)}`),
				`${sourcePath} -> ${targetPath} is not marked planned ${wave.slice(0, 2)}: ${text}`,
			);
		}
	});

	it("drops the planned marker from lines whose references have all shipped", () => {
		for (const path of MARKDOWN_FILES)
			for (const { text } of proseLines(path)) {
				const lineReferences = references(path).filter(
					(reference) => reference.text === text,
				);
				for (const major of ["W3", "W4", DEFERRED_WAVE]) {
					if (!text.includes(`planned ${major}`)) continue;
					const shipped = lineReferences.filter(
						(reference) =>
							waveFor(reference)?.startsWith(major) &&
							!targetPlanned(reference.targetPath),
					);
					const pending = lineReferences.filter(
						(reference) =>
							waveFor(reference)?.startsWith(major) &&
							targetPlanned(reference.targetPath),
					);
					assert.ok(
						shipped.length === 0 || pending.length > 0,
						`${path}: "planned ${major}" remains after ${shipped.map(({ targetPath }) => targetPath).join(", ")} shipped: ${text}`,
					);
				}
			}
	});

	it("rejects relative Markdown links; skill-relative paths are backticked", () => {
		for (const path of MARKDOWN_FILES)
			for (const { line, text } of proseLines(path))
				for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g))
					assert.match(
						link,
						/^https:\/\//,
						`${path}:${line} uses a relative Markdown link; use a backticked skill-relative path`,
					);
	});

	it("names principle skills by their full inventory names", () => {
		const principles = inventory.skills
			.map(({ name }) => name)
			.filter((name) => name.startsWith("principle-"));
		for (const path of SHIPPED_FILES)
			for (const name of principles) {
				const short = name.slice("principle-".length);
				assert.doesNotMatch(
					read(path),
					new RegExp(`\\*\\*${short}\\*\\*`),
					path,
				);
			}
	});

	it("keeps all 24 principle summaries in the hub, planned ones marked planned W3", () => {
		const hub = read("skills/poteto-mode/SKILL.md").split("\n");
		const principles = inventory.skills.filter(({ name }) =>
			name.startsWith("principle-"),
		);
		assert.equal(principles.length, 24);
		for (const { name, status } of principles) {
			const planned = status === "planned";
			const marker = planned ? `(**${name}**, planned W3)` : `(**${name}**)`;
			const entries = hub.filter((line) => line.includes(marker));
			assert.equal(entries.length, 1, name);
			assert.match(
				entries[0],
				planned
					? /^- \*\*[^*]+\*\* \(\*\*[a-z-]+\*\*, planned W3\)\. \S/
					: /^- \*\*[^*]+\*\* \(\*\*[a-z-]+\*\*\)\. \S/,
			);
		}
	});

	it("routes every upstream playbook from the hub, unshipped ones visibly planned", () => {
		const hub = proseLines("skills/poteto-mode/SKILL.md");
		for (const name of [...BASE_PLAYBOOKS, ...W4_PLAYBOOKS]) {
			const routes = hub.filter(
				({ text }) =>
					text.startsWith("- **") && text.includes(`\`playbooks/${name}.md\``),
			);
			assert.equal(routes.length, 1, name);
			const wave = plannedPlaybooks.get(
				`skills/poteto-mode/playbooks/${name}.md`,
			);
			if (wave) assert.ok(routes[0].text.includes(`(planned ${wave})`), name);
			else assert.doesNotMatch(routes[0].text, /\(planned W\d\)/, name);
		}
	});
});

describe("delegation contract", () => {
	/** Fenced code blocks as the Markdown lexer sees them, nested ones included. */
	const lexedFences = (path: string) => {
		const blocks: Tokens.Code[] = [];
		walkTokens(lexer(read(path)), (token) => {
			if (token.type === "code" && token.codeBlockStyle !== "indented")
				blocks.push(token as Tokens.Code);
		});
		return blocks;
	};
	/** Parseable examples; the fence check below reports any that do not parse. */
	const examples = MARKDOWN_FILES.flatMap((path) =>
		lexedFences(path)
			.filter(({ lang }) => lang === "json subagent")
			.flatMap(({ text }) => {
				try {
					return [{ path, call: JSON.parse(text) as Record<string, unknown> }];
				} catch {
					return [];
				}
			}),
	);

	it("closes every fenced block, with nothing after a closing fence, and parses every subagent example", () => {
		for (const path of MARKDOWN_FILES) {
			const lexed = lexedFences(path);
			const scanned = [...new Set(fences(path))].filter(
				(fence) => fence !== undefined,
			);
			assert.deepEqual(
				lexed.map(({ lang }) => lang ?? ""),
				scanned.map(({ info }) => info),
				`${path}: the fence scanner and the Markdown lexer disagree`,
			);
			for (const block of lexed) {
				const lines = block.raw.replace(/\n+$/, "").split("\n");
				const run = /^\s*(`{3,}|~{3,})/.exec(lines[0])?.[1] ?? "```";
				const fence = `^\\s*\\${run[0]}{${run.length},}`;
				assert.match(
					lines.length > 1 ? (lines.at(-1) ?? "") : "",
					new RegExp(`${fence}\\s*$`),
					`${path}: the fence opened by ${JSON.stringify(lines[0])} never closes`,
				);
				for (const line of lines.slice(1, -1))
					assert.doesNotMatch(
						line,
						new RegExp(`${fence}\\s*\\S`),
						`${path}: text follows a closing fence: ${line}`,
					);
				if (block.lang === "json subagent")
					assert.doesNotThrow(() => JSON.parse(block.text), path);
			}
		}
	});

	it("gives runnable examples only the public single-call parameters", () => {
		assert.ok(examples.length >= 4);
		for (const { path, call } of examples) {
			assert.deepEqual(
				schemaProblems(call),
				[],
				`${path}: ${String(call.name)} is invalid at host ${HOST_HERDR_COMMIT}`,
			);
			for (const key of Object.keys(call))
				assert.ok(EXAMPLE_PARAMS.has(key), `${path}: ${key}`);
			assert.equal(
				"agent" in call,
				false,
				`${path}: pstack delegates are bare`,
			);
			assert.equal("persistent" in call, false, `${path}: no persistent`);
			if ("systemPrompt" in call)
				assert.equal(
					call.fork,
					false,
					`${path}: a systemPrompt needs fork: false`,
				);
			if (rowNameOf(path) === "no-comments")
				assert.equal(call.systemPrompt, COMMENT_SICKO_SYSTEM_PROMPT, path);
			const target = promptTarget(path, call.systemPrompt);
			assert.ok(
				target,
				`${path}: bare delegates carry their reference prompt: ${String(call.systemPrompt)}`,
			);
			assert.ok(exists(target), `${path}: ${target} does not exist`);
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
					/Implementer/.test(String(call.systemPrompt)) ? "write" : "read",
					"worktree" in call ? "worktree" : "pane",
					call.model === MODEL_PLACEHOLDER ? "exact" : "task",
				].join("/"),
			),
		);
		for (const kind of [
			"write/pane/task",
			"write/worktree/task",
			"read/pane/task",
			"read/pane/exact",
		])
			assert.ok(kinds.has(kind), kind);
		const delegation = read("skills/poteto-mode/references/delegation.md");
		for (const prompt of [
			"Implementer",
			"Investigator",
			"Reviewer",
			"Verifier",
		])
			assert.match(
				delegation,
				new RegExp(`### ${prompt}\\n\\n\`\`\`text\\nYou are `),
			);
	});

	it("launches why investigators without a tools list, so MCP servers stay visible", {
		skip: !exists("skills/why") && "why ships with W4-A",
	}, () => {
		const investigators = examples.filter(
			({ path, call }) =>
				rowNameOf(path) === "why" &&
				/investigator/i.test(
					`${String(call.name)} ${String(call.systemPrompt)}`,
				),
		);
		assert.ok(investigators.length > 0, "why shows an investigator launch");
		for (const { path, call } of investigators)
			assert.equal("tools" in call, false, `${path}: ${String(call.name)}`);
	});

	it("launches comment-sicko as a bare comment editor from its reference prompt", {
		skip: !exists("skills/no-comments") && "no-comments is not present yet",
	}, () => {
		assert.ok(exists(COMMENT_SICKO_PROMPT));
		assert.equal(
			frontmatter(COMMENT_SICKO_PROMPT),
			undefined,
			"a delegate prompt, not a role file",
		);
		const calls = examples.filter(
			({ path }) => rowNameOf(path) === "no-comments",
		);
		assert.equal(calls.length, 1);
		const [{ call }] = calls;
		assert.equal(call.tools, "read, bash, edit");
		assert.equal(call.fork, false);
		assert.equal("worktree" in call, false, "edits the caller's checkout");
		assert.ok(
			call.model === MODEL_PLACEHOLDER || call.model === "task:review",
			String(call.model),
		);
	});

	it("names no pstack role: the retired poteto role is neither provided nor required", () => {
		for (const path of SHIPPED_FILES) {
			const text = read(path);
			assert.doesNotMatch(text, /\bagent"?\s*:/, path);
			assert.doesNotMatch(
				text,
				/`poteto`|poteto role|role this package|this package's role/i,
				path,
			);
		}
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
			/\bTask tool\b|`Task`|\bTask\(/,
			/\bCustom Modes?\b/i,
			/~\/\.cursor/,
			/\.mdc\b/,
			/\/add-plugin\b/,
			/\bcloud agents?\b/i,
			/cursor-team-kit/,
			/\/deslop\b/,
			/\/loop\b/,
			/\bomp\b/,
			/\/(?:iterate|btw)\b/,
			// Cursor-style slash commands; Pi invokes skills as /skill:how.
			/(?<![\w:/.-])\/(?:how|why)\b/,
			// W4: runner leftovers, removed loops and engines, missing tools and
			// paths, false host claims and Cursor-only surfaces
			// (docs/plans/14-wave4-contract.md).
			/\btasks\s*:\s*\[/,
			/parallel `tasks`|`tasks` array|`role` (?:parameter|field|key)/,
			/cloud_base_branch/,
			/\bcloud workers?\b|\b(?:runs?|restacks?) in (?:the )?cloud\b/i,
			/\brun_watch\b/,
			/\bpr:\/\//,
			/\borch\b/,
			/`gt\s+[a-z-]+[^`]*`|(?:^|\$ )gt\s+[a-z-]+/m,
			/\bwatch-pr\b/,
			/worktree-audit\.sh/,
			/\brecall`? tool\b/i,
			/the agent's store/i,
			/(?<![\w.-])pstack\/skills\//,
			/packages\/pi-pstack\//,
			/\btodolist\b/i,
			/Pi Agent Skills standard/i,
			/nesting works to depth/i,
			/cannot be resumed/i,
			/Cmd\+Shift\+I/i,
			/\bupdate_state\b/,
			/\bSendToUser\b/,
			/api2\.cursor\.sh/,
			...ORIGIN_FORGE,
		];
		for (const path of SHIPPED_FILES) {
			const text = read(path);
			for (const pattern of banned) assert.doesNotMatch(text, pattern, path);
			// Only copies and allowlisted quotations may quote a model name.
			assert.doesNotMatch(
				bannable(path, text, statusOf(path), QUOTED_MODELS),
				MODEL_SLUG,
				path,
			);
		}
	});

	it("names comment-sicko only in no-comments and in hub sentences describing that delegate", () => {
		for (const path of SHIPPED_FILES) {
			if (rowNameOf(path) === "no-comments") continue;
			for (const line of read(path).split("\n"))
				if (/\bcomment-sicko\b/.test(line))
					assert.ok(
						COMMENT_SICKO_DESCRIBERS.includes(path) &&
							line.includes("no-comments"),
						`${path}: ${line}`,
					);
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
		const segments = params[1].split(/^\t(?=\w+: )/m).filter(Boolean);
		for (const segment of segments) {
			const [, key, definition] = /^(\w+): ([\s\S]*)$/.exec(segment) ?? [];
			const required = !definition.startsWith("Type.Optional(");
			const type = /ThinkingLevelSchema|Type\.(String|Boolean|Union)/.exec(
				definition.replace(/^Type\.Optional\(\s*/, ""),
			);
			const kind =
				type?.[1] === "String"
					? "string"
					: type?.[1] === "Boolean"
						? "boolean"
						: type?.[1] === "Union"
							? "worktree"
							: type
								? "thinking"
								: undefined;
			assert.deepEqual({ kind, required }, HOST_SUBAGENT_SCHEMA[key], key);
		}
		const worktree = segments.find((segment) =>
			segment.startsWith("worktree:"),
		);
		for (const shape of [
			/branch: Type\.String\(\{\s*minLength: 1,/,
			/base: Type\.Optional\(\s*Type\.String\(/,
			/Type\.Null\(\)/,
		])
			assert.match(worktree ?? "", shape);
		assert.match(
			index,
			/const ThinkingLevelSchema = Type\.Union\(\n\tTHINKING_LEVELS\.map\(\(level\) => Type\.Literal\(level\)\),/,
		);
		const levels = /export const THINKING_LEVELS = \[([\s\S]*?)\]/.exec(
			show("maestro/core/routing.ts"),
		);
		assert.ok(levels);
		assert.deepEqual(
			[...levels[1].matchAll(/"(\w+)"/g)].map(([, level]) => level),
			THINKING,
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

	it("pins host trimming of model refs before the auth check", {
		skip:
			!hasHost &&
			`set PI_HERDR_AGENTS_SOURCE to a pi-herdr-agents checkout containing ${HOST_HERDR_COMMIT}`,
	}, () => {
		const routing = execFileSync("git", [
			"-C",
			hostSource,
			"show",
			`${HOST_HERDR_COMMIT}:maestro/core/routing.ts`,
		]).toString("utf8");
		const parsed = /export function parseExactModelRef\([\s\S]*?\n\}/.exec(
			routing,
		);
		assert.ok(parsed);
		assert.match(parsed[0], /const trimmed = reference\.trim\(\);/);
		assert.match(parsed[0], /const separator = trimmed\.indexOf\("\/"\);/);
		assert.match(
			parsed[0],
			/const provider = trimmed\.slice\(0, separator\)\.trim\(\);/,
		);
		assert.match(
			parsed[0],
			/const modelId = trimmed\.slice\(separator \+ 1\)\.trim\(\);/,
		);
		assert.match(routing, /const parsed = parseExactModelRef\(candidate\);/);
		assert.match(
			routing,
			/return !!model && registry\.hasConfiguredAuth\(model\);/,
		);
	});
});

/** Rules the swarm status mapping must state, in the prose and in the worker task. */
const SWARM_PROSE_RULES: Array<[string, RegExp]> = [
	[
		"prose: claims listed before results",
		/the claims to verify listed one per item before any result/,
	],
	[
		"prose: every provable issue",
		/lists every issue it can prove, not only the first/,
	],
	[
		"prose: a listed claim with no result is inconclusive",
		/A listed claim with no result counts as inconclusive\./,
	],
	[
		"prose: a proved fail wins",
		/A proved fail always means `ISSUES`, even when other checks could not run, and inconclusive claims stay inconclusive\./,
	],
	[
		"prose: PASS needs at least one claim, all passing",
		/Otherwise `PASS` requires at least one listed claim and a pass for every listed claim\./,
	],
	[
		"prose: zero claims is BLOCKED",
		/Otherwise the status is `BLOCKED`, with the reason stated:[^.]*\bzero listed claims\b/,
	],
	[
		"prose: an inconclusive claim is BLOCKED",
		/Otherwise the status is `BLOCKED`, with the reason stated:[^.]*\ban inconclusive claim\b/,
	],
	[
		"prose: no runnable check is BLOCKED",
		/Otherwise the status is `BLOCKED`, with the reason stated:[^.]*\bcannot run any check\b/,
	],
	[
		"aggregate: a claimless or partial PASS is BLOCKED",
		/Treat a `PASS` that lists no claims, or that gives no result for a listed claim, as `BLOCKED`\./,
	],
	[
		"aggregate: only PASS wins a first pass race",
		/For a `first pass` race, only an overall `PASS` wins\. `ISSUES` and `BLOCKED` are not a pass\./,
	],
	[
		"aggregate: a BLOCKED slice is never covered",
		/A BLOCKED slice is unverified\. Report it with its reason next to the gaps, never as covered\./,
	],
	[
		"aggregate: ISSUES carries inconclusive claims to the gaps",
		/An `ISSUES` slice carries its inconclusive claims into the gaps\./,
	],
];
const SWARM_TASK_RULES: Array<[string, RegExp]> = [
	[
		"task: claims slot before results",
		/Claims: <each claim to verify, one per item>\. Report every listed claim as pass, fail or inconclusive before the overall status\./,
	],
	[
		"task: a listed claim with no result is inconclusive",
		/A listed claim with no result counts as inconclusive\./,
	],
	[
		"task: a proved fail wins",
		/A proved fail always means ISSUES, even when other checks could not run/,
	],
	["task: every provable issue", /list every proved issue, not only the first/],
	[
		"task: inconclusive stays inconclusive",
		/inconclusive claims stay inconclusive/,
	],
	[
		"task: PASS needs at least one claim, all passing",
		/Otherwise PASS only when at least one claim is listed and every listed claim passes\./,
	],
	[
		"task: zero claims is BLOCKED",
		/Otherwise BLOCKED, and state why:[^.]*\bzero listed claims\b/,
	],
	[
		"task: an inconclusive claim is BLOCKED",
		/Otherwise BLOCKED, and state why:[^.]*\ban inconclusive claim\b/,
	],
	[
		"task: no runnable check is BLOCKED",
		/Otherwise BLOCKED, and state why:[^.]*\bno check could run\b/,
	],
];
/** Sentences that would reopen a vacuous or partial PASS. */
const SWARM_CONTRADICTIONS: Array<[string, RegExp]> = [
	["vacuous all-claims-pass wording", /all claims pass (?:means|is) `?PASS/i],
	[
		"PASS with no or zero claims",
		/`?PASS`?[^.]*\b(?:with|has|having|given) (?:no|zero) (?:listed )?claims?\b/i,
	],
	[
		"no or zero claims reporting PASS",
		/\b(?:no|zero) (?:listed )?claims?\b[^.]*\b(?:reports?|means|is|gives|counts as) `?PASS\b/i,
	],
	[
		"PASS despite an unrun or missing result",
		/`?PASS`?[^.]*\b(?:even|despite|although)\b[^.]*\b(?:unrun|no result|inconclusive|could not run)\b/i,
	],
	["old run-the-checks wording", /cannot run the checks/],
];

/** Every missing status rule or contradiction in a swarm skill text. */
function swarmStatusProblems(swarm: string): string[] {
	const task = /"task": "([^"]*)"/.exec(swarm)?.[1];
	if (task === undefined) return ["no worker task template"];
	const prose = swarm.replace(task, "");
	return [
		...SWARM_PROSE_RULES.filter(([, rule]) => !rule.test(prose)).map(
			([name]) => `missing ${name}`,
		),
		...SWARM_TASK_RULES.filter(([, rule]) => !rule.test(task)).map(
			([name]) => `missing ${name}`,
		),
		...SWARM_CONTRADICTIONS.filter(([, rule]) => rule.test(swarm)).map(
			([name]) => `contradiction: ${name}`,
		),
		...(task.includes("`") ? ["task template has markdown backticks"] : []),
	];
}

describe("swarm status mapping and boundary parse", () => {
	const swarm = read("skills/swarm/SKILL.md");

	it("maps each verifier claim onto one overall PASS, ISSUES or BLOCKED", () => {
		assert.match(
			read("skills/poteto-mode/references/delegation.md"),
			/Report pass, fail or inconclusive for each claim/,
		);
		assert.deepEqual(swarmStatusProblems(swarm), []);
	});

	it("fails the lock on every dropped rule or contradicting sentence", () => {
		const mutations: Array<[string, string, string]> = [
			[
				"drop the claims slot",
				"Claims: <each claim to verify, one per item>. ",
				"",
			],
			[
				"drop the template's inconclusive-means-BLOCKED clause",
				", an inconclusive claim, or no check could run",
				", or no check could run",
			],
			[
				"drop the template's list-every-issue clause",
				"list every proved issue, not only the first, and ",
				"",
			],
			[
				"drop the template's at-least-one-claim rule",
				"Otherwise PASS only when at least one claim is listed and every listed claim passes.",
				"Otherwise PASS when every listed claim passes.",
			],
			[
				"drop the template's zero-claims-BLOCKED reason",
				"state why: zero listed claims, an inconclusive claim",
				"state why: an inconclusive claim",
			],
			[
				"drop the template's no-result-is-inconclusive rule",
				"before the overall status. A listed claim with no result counts as inconclusive. Then",
				"before the overall status. Then",
			],
			[
				"drop the prose at-least-one-claim rule",
				"Otherwise `PASS` requires at least one listed claim and a pass for every listed claim.",
				"Otherwise `PASS` requires a pass for every listed claim.",
			],
			[
				"drop the prose zero-claims-BLOCKED reason",
				"stated: zero listed claims, an inconclusive claim",
				"stated: an inconclusive claim",
			],
			[
				"drop the prose no-result-is-inconclusive rule",
				"for each claim. A listed claim with no result counts as inconclusive. Map",
				"for each claim. Map",
			],
			[
				"drop the prose proved-fail-wins rule",
				"A proved fail always means `ISSUES`, even when other checks could not run, and inconclusive claims stay inconclusive. ",
				"",
			],
			[
				"drop the aggregate claimless-PASS check",
				"Treat a `PASS` that lists no claims, or that gives no result for a listed claim, as `BLOCKED`. ",
				"",
			],
			[
				"drop the BLOCKED-never-covered sentence",
				"A BLOCKED slice is unverified. Report it with its reason next to the gaps, never as covered. ",
				"",
			],
			[
				"drop the ISSUES-gaps sentence",
				" An `ISSUES` slice carries its inconclusive claims into the gaps.",
				"",
			],
			[
				"add a PASS-with-no-claims sentence",
				"If a worker drops out,",
				"A slice may also be `PASS` with no claims.\n\nIf a worker drops out,",
			],
			[
				"add a no-claims-reports-PASS sentence",
				"If a worker drops out,",
				"A worker with no listed claims reports `PASS`.\n\nIf a worker drops out,",
			],
			[
				"add a PASS-despite-unrun sentence",
				"If a worker drops out,",
				"Report `PASS` even when some claims could not run.\n\nIf a worker drops out,",
			],
			[
				"restore the vacuous all-claims wording",
				"If a worker drops out,",
				"All claims pass means `PASS`.\n\nIf a worker drops out,",
			],
		];
		for (const [name, from, to] of mutations) {
			assert.ok(swarm.includes(from), `${name}: mutation target is gone`);
			const mutated = swarm.replace(from, to);
			assert.notEqual(mutated, swarm, name);
			assert.notDeepEqual(swarmStatusProblems(mutated), [], name);
		}
	});

	it("aligns the patterns boundary lines with the skill row", () => {
		const patterns = read(
			"skills/typescript-best-practices/references/patterns.md",
		);
		const skill = read("skills/typescript-best-practices/SKILL.md");
		const row = /\| Boundary validation \| (.*) \|/.exec(skill)?.[1] ?? "";
		assert.match(
			row,
			/Parse where data crosses in, into a named domain type\. `Record<string, unknown>` \(however spelled\) stops at that parse/,
		);
		assert.doesNotMatch(patterns, /Validate once where data crosses in/);
		assert.doesNotMatch(patterns, /: narrow it/);
		assert.match(
			patterns,
			/Parse where data crosses in, into a named domain type\. `Record<string, unknown>` \(however spelled\) stops at that parse\. Trust types inside\. See the \*\*principle-boundary-discipline\*\* principle skill\./,
		);
		assert.match(
			patterns,
			/parse where data crosses in, into a named domain type\. It stops at that parse/,
		);
		assert.match(patterns, /Parse once at the boundary/);
		assert.doesNotMatch(patterns, /Validate once/);
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

	it("leaves configuration writes to the setup extension's approved flow", () => {
		const setup = read("skills/setup-pstack/SKILL.md");
		assert.match(setup, /never authorizes a configuration write/);
		assert.match(setup, /never call `subagents_write_task_models` yourself/);
		assert.match(setup, /Call `pstack_apply_task_models` once/);
		assert.match(setup, /Metadata is never yours to choose/);
		assert.match(setup, /W2 setup never deletes a category/);
		assert.match(setup, /Do not retry/);
		assert.match(setup, /end with "No changes were made\."/);
		for (const line of setup
			.split("\n")
			.filter((text) => text.includes("subagents_write_task_models")))
			assert.match(line, /\b(?:not|never)\b/i, line);
		assert.doesNotMatch(
			setup,
			/```(?:bash|sh|js)?\n/,
			"no manual config snippet",
		);
	});
});

describe("model precedence", () => {
	it("says an explicit model argument, including task:<category>, wins over defaults", () => {
		const setup = read("skills/setup-pstack/SKILL.md");
		assert.match(
			setup,
			/An explicit `model` in the `subagent` call wins, whether it is an exact `provider\/model-id` or a `task:<category>` selector/,
		);
		assert.match(
			setup,
			/Only a call without `model` falls back to role, per-agent and default models/,
		);
		for (const path of SHIPPED_FILES)
			assert.doesNotMatch(
				read(path),
				/takes? precedence over the (?:task )?categories|override that takes precedence/i,
				path,
			);
	});
});

describe("methodology provenance", () => {
	const sourceRows = (wave: string) =>
		inventory.skills.filter((row) => row.wave === wave);
	/** W4-P cites only the hub row's playbooks and scripts. */
	const listedSource = (wave: string, source: SourceKey, path: string) =>
		wave === "W4-P"
			? /^poteto-mode\/(?:playbooks|scripts)\//.test(path) &&
				(rowOf.get("poteto-mode")?.sourceFiles[source]?.includes(path) ?? false)
			: sourceRows(wave).some((row) => row.sourceFiles[source]?.includes(path));
	const sourceKey = ({ source, path }: { source: SourceKey; path: string }) =>
		`${source}:${path}`;
	/** Primary sources the W4-P batch has shipped. */
	const w4pPrimaries = new Set(
		provenanceOf("w4-p")
			.files.flatMap(({ sources }) => sources)
			.filter(({ use }) => use === "primary")
			.map(sourceKey),
	);
	/**
	 * A w2.json planned or excluded entry that a W4-P file has shipped. The
	 * reconcile commit removes these; until then they are not double counts.
	 */
	const superseded = (owner: string, entry: UnshippedSource) =>
		owner === "w2" && w4pPrimaries.has(sourceKey(entry));

	it("splits provenance by owner and records the inventory's pinned sources", () => {
		assert.deepEqual(
			readdirSync(join(PACK_ROOT, "test/fixtures/skill-provenance")).toSorted(),
			Object.keys(PROVENANCE_OWNERS)
				.map((owner) => `${owner}.json`)
				.toSorted(),
		);
		for (const { owner, schemaVersion, sources } of provenanceFixtures) {
			assert.equal(schemaVersion, 1, owner);
			assert.deepEqual(sources, inventory.sources, owner);
		}
	});

	it("records exactly the shipped tree, each file inside its owner's skill directories", () => {
		const paths = provenanceFiles.map(({ path }) => path);
		assert.equal(new Set(paths).size, paths.length, "duplicate file entry");
		assert.deepEqual(paths.toSorted(), SHIPPED_FILES);
		for (const {
			owner,
			wave,
			files,
			planned,
			excluded,
		} of provenanceFixtures) {
			for (const { path, sources } of files) {
				assert.equal(ownerWaveOf(path), wave, `${owner}: ${path}`);
				for (const use of sources)
					assert.ok(
						listedSource(wave, use.source, use.path),
						`${owner}: ${path} cites ${use.source}:${use.path} outside its rows`,
					);
			}
			for (const { source, path } of [...planned, ...excluded])
				assert.ok(listedSource(wave, source, path), `${owner}: ${path}`);
		}
	});

	it("hashes every shipped file and classifies it as copied, adapted or new", () => {
		for (const file of provenanceFiles) {
			assert.equal(
				sha256(readFileSync(join(PACK_ROOT, file.path))),
				file.sha256,
				`${file.path} changed without updating its reviewed provenance`,
			);
			assert.ok(file.explanation.length > 20, file.path);
			assert.ok(file.sources.length > 0, file.path);
			const primary = file.sources.filter(({ use }) => use === "primary");
			assert.equal(primary.length, file.status === "new" ? 0 : 1, file.path);
			if (file.status === "copied")
				assert.equal(
					file.sha256,
					primary[0].sha256,
					`${file.path} is not a copy`,
				);
			else if (file.status === "new")
				assert.ok(
					file.sources.every(({ use }) => use === "derived"),
					file.path,
				);
			else assert.equal(file.status, "adapted", file.path);
			if (file.lengthExplanation !== undefined)
				assert.ok(file.lengthExplanation.length > 20, file.path);
		}
	});

	it("accounts for each primary source file of every present row exactly once", () => {
		const accounted = provenanceFixtures.flatMap(
			({ owner, files, planned, excluded }) => [
				...files.flatMap(({ sources }) =>
					sources.filter((use) => use.use === "primary"),
				),
				...[...planned, ...excluded].filter(
					(entry) => !superseded(owner, entry),
				),
			],
		);
		const keys = accounted.map(sourceKey);
		assert.equal(new Set(keys).size, keys.length, "source accounted twice");
		for (const row of presentRows) {
			const source = row.primarySource;
			const expected = row.sourceFiles[source] ?? [];
			assert.deepEqual(
				accounted
					.filter(
						(entry) => entry.source === source && expected.includes(entry.path),
					)
					.map(({ path }) => path)
					.toSorted(),
				expected.toSorted(),
				row.name,
			);
		}
		for (const { owner, planned, excluded } of provenanceFixtures) {
			for (const { path, owningWave, explanation } of planned) {
				assert.match(owningWave, /^W[45]/, `${owner}: ${path}`);
				assert.ok(explanation.length > 20, `${owner}: ${path}`);
			}
			for (const { path, disposition } of excluded)
				assert.ok(disposition.length > 20, `${owner}: ${path}`);
		}
		const w2 = provenanceOf("w2");
		const playbookSource = (name: string) => `poteto-mode/playbooks/${name}.md`;
		for (const { path, owningWave } of w2.planned) {
			assert.ok(
				W4_PLAYBOOKS.some((name) => path === playbookSource(name)),
				path,
			);
			assert.ok(["W4", DEFERRED_WAVE].includes(owningWave), path);
		}
		for (const name of W4_PLAYBOOKS)
			assert.ok(
				w2.planned.some(({ path }) => path === playbookSource(name)) ||
					w4pPrimaries.has(`mimir:${playbookSource(name)}`),
				`${name} is neither planned in w2.json nor shipped by w4-p.json`,
			);
		for (const { path } of w2.excluded)
			assert.match(path, /^poteto-mode\/scripts\//);
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
	const blob = (source: SourceKey, path: string) => {
		const { commit, root } = inventory.sources[source];
		return execFileSync("git", [
			"-C",
			checkouts[source] ?? "",
			"show",
			`${commit}:${posix.join(root, path)}`,
		]);
	};
	it("reproduces every recorded source hash from the pinned commits", {
		skip:
			!(checkouts.mimir && checkouts.cursor) &&
			"set PSTACK_MIMIR_SOURCE and PSTACK_CURSOR_SOURCE to checkouts containing the pinned commits",
	}, () => {
		const sources = provenanceFixtures.flatMap(
			({ files, planned, excluded }) => [
				...files.flatMap(({ sources }) => sources),
				...planned,
				...excluded,
			],
		);
		for (const { source, path, sha256: recorded } of sources)
			assert.equal(sha256(blob(source, path)), recorded, `${source}:${path}`);
	});

	it("keeps each adapted file at least half its primary source, unless explained", {
		skip:
			!(checkouts.mimir && checkouts.cursor) &&
			"set PSTACK_MIMIR_SOURCE and PSTACK_CURSOR_SOURCE to checkouts containing the pinned commits",
	}, () => {
		for (const file of provenanceFiles.filter(
			({ status, lengthExplanation }) =>
				status === "adapted" && lengthExplanation === undefined,
		)) {
			const [primary] = file.sources.filter(({ use }) => use === "primary");
			assert.ok(
				readFileSync(join(PACK_ROOT, file.path)).length * 2 >=
					blob(primary.source, primary.path).length,
				`${file.path} is under half its primary source; add lengthExplanation`,
			);
		}
	});

	const shippedScripts = SHIPPED_FILES.filter((path) =>
		path.includes("/scripts/"),
	);
	const gitMode = (path: string) =>
		execFileSync("git", ["-C", PACK_ROOT, "ls-files", "-s", "--", path])
			.toString("utf8")
			.split(" ")[0];
	it("ships only the recorded scripts, each with a shebang and its recorded mode", () => {
		assert.deepEqual(
			shippedScripts.filter((path) => !(path in SCRIPT_MODES)),
			[],
			"every shipped script has a recorded mode",
		);
		for (const path of shippedScripts) {
			assert.match(read(path), /^#!\/\S+/, `${path} has no shebang`);
			const executable = (statSync(join(PACK_ROOT, path)).mode & 0o111) !== 0;
			assert.equal(
				executable,
				SCRIPT_MODES[path] === "100755",
				`${path} working-tree mode`,
			);
			const indexed = gitMode(path);
			if (indexed)
				assert.equal(indexed, SCRIPT_MODES[path], `${path} git mode`);
		}
	});

	it("records each shipped script's mode as its primary source's mode", {
		skip:
			(!(checkouts.mimir && checkouts.cursor) &&
				"set PSTACK_MIMIR_SOURCE and PSTACK_CURSOR_SOURCE to checkouts containing the pinned commits") ||
			(shippedScripts.length === 0 &&
				"no scripts ship yet: log.sh with W4-B, check-plan.mjs with W4-P"),
	}, () => {
		for (const path of shippedScripts) {
			const primary = provenanceFiles
				.find((file) => file.path === path)
				?.sources.find(({ use }) => use === "primary");
			assert.ok(primary, path);
			const { commit, root } = inventory.sources[primary.source];
			const tree = execFileSync("git", [
				"-C",
				checkouts[primary.source] ?? "",
				"ls-tree",
				commit,
				"--",
				posix.join(root, primary.path),
			]).toString("utf8");
			assert.equal(tree.split(" ")[0], SCRIPT_MODES[path], path);
		}
	});

	it("narrows the shipping noise-build exception against a stamped SHA or a pack substitute", () => {
		const step = read("skills/poteto-mode/playbooks/shipping.md")
			.split("\n")
			.find((line) => line.startsWith("3. **Re-check"));
		assert.ok(step, "shipping step 3");
		assert.match(
			step,
			/An embedded commit SHA is not noise on that basis alone: it counts as noise only when the build stamps it and the source diff does not touch that line/,
		);
		assert.doesNotMatch(step, /or if it is an embedded commit SHA/);
		assert.match(step, /A lane that ran tests compares that test output/);
		assert.match(
			step,
			/Use `npm pack` as the comparison only for a lane with no build output of its own/,
		);
		assert.doesNotMatch(
			step,
			/For a docs-only package that build is the npm pack output/,
		);
		for (const phrase of [
			"`skills/**`",
			"`README.md`",
			"`docs/compatibility.md`",
			"`docs/provenance.md`",
			"are not ignorable docs",
			"Paths under `test/**` that enforce those product paths are not ignorable tests",
			"Lint config here excludes config that selects which tests run or that changes emitted files",
			"A patch that touches any of those is re-verified",
		])
			assert.ok(step.includes(phrase), phrase);
		const autopilot = read("skills/poteto-mode/playbooks/autopilot-full.md");
		assert.match(
			autopilot,
			/A new head voids the verdict, except for lane results that stay valid under the patch-id rule in `playbooks\/shipping\.md`/,
		);
		assert.doesNotMatch(
			autopilot,
			/A new head voids the verdict unless the patch-id is unchanged/,
		);
	});

	it("preserves the upstream MIT notices and documents the adaptation", () => {
		const notices = read("THIRD_PARTY_NOTICES.md");
		assert.match(notices, /Copyright \(c\) 2026 Lauren Tan/);
		assert.match(notices, /Copyright \(c\) 2026 Ivan Porto Carrero/);
		assert.match(notices, /Copyright \(c\) 2026 HazAT/);
		for (const { commit } of Object.values(inventory.sources)) {
			assert.ok(notices.includes(commit));
			assert.ok(read("docs/provenance.md").includes(commit));
		}
		for (const dir of ["skill-provenance", "forward-references"])
			assert.ok(read("docs/provenance.md").includes(`test/fixtures/${dir}/`));
	});
});
