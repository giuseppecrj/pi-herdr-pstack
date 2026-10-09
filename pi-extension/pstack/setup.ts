import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionToolContext,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	type ConfigSnapshot,
	canonicalJson,
	deepFreeze,
	type RankingBasis,
	readConfig,
	type ResearchSource,
	type SharedPreferences,
	TASK_CATEGORIES,
	type TaskCategory,
	type TaskMap,
	type TasksMeta,
	unrelatedSettingsJson,
} from "./config.ts";
import {
	describeSkill,
	loadedSkills,
	resolveOwnedSkill,
	skillWrapper,
} from "./resources.ts";

export const WRITER = "subagents_write_task_models";
export const APPLY_TOOL = "pstack_apply_task_models";
export const REPORT_MESSAGE_TYPE = "pi-herdr-pstack:setup-report";
export const CONFIRM_TIMEOUT_MS = 120_000;
/** Why every writer call outside pstack's approved nested write is refused. */
export const WRITER_POINTER = `While pi-herdr-pstack is loaded, shared task models change only through /setup-pstack <request> or /subagents-init (also /setup-pstack init), which show the exact ${WRITER} payload for your approval. Direct ${WRITER} calls are refused.`;
/**
 * pi-herdr-agents' task-model init protocol, version 1. The host emits the
 * approval request while init runs; pstack emits the start request for
 * `/setup-pstack init`. Both carry the invoking command's live context.
 */
export const INIT_APPROVAL_EVENT =
	"pi-herdr-subagents:task-models:init:approval:v1";
export const INIT_START_EVENT = "pi-herdr-subagents:task-models:init:start:v1";
const OWNER = "pi-herdr-pstack";
const EXTENSION_FILE = fileURLToPath(new URL("./index.ts", import.meta.url));
/**
 * Categories the methodology launches, so an unset one is a finding.
 * architecture is the judgment category: seven model assignments in how,
 * why and reflect (the explainer's two steps and example, the why
 * synthesizer's step and example, and reflect's judgment and synthesizer
 * examples).
 */
const METHODOLOGY_CATEGORIES: readonly TaskCategory[] = [
	"coding",
	"recon",
	"review",
	"architecture",
];

export type WriterPayload = {
	tasks: TaskMap;
	tasksMeta: TasksMeta;
	expectedConfigRevision: string;
	/** Present only when the loaded writer accepts it. */
	basis?: RankingBasis;
};

type WriterStatus =
	| { state: "absent" }
	| { state: "conditional" | "unconditional" | "unrecognized"; tool: ToolInfo };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detects the public conditional-writer contract from the loaded tool schema:
 * optional `expectedConfigRevision` accepting exactly `missing` or a
 * `sha256:` exact-byte revision. Version strings are not consulted.
 */
export function writerContract(
	tool: ToolInfo,
): "conditional" | "unconditional" | "unrecognized" {
	const schema: unknown = tool.parameters;
	if (!isRecord(schema) || !isRecord(schema.properties)) return "unrecognized";
	const required = Array.isArray(schema.required) ? schema.required : [];
	if (!required.includes("tasks") || !required.includes("tasksMeta"))
		return "unrecognized";
	const revision = schema.properties.expectedConfigRevision;
	if (revision === undefined) return "unconditional";
	if (required.includes("expectedConfigRevision") || !isRecord(revision))
		return "unrecognized";
	const options = Array.isArray(revision.anyOf) ? revision.anyOf : [];
	const literal = options.some(
		(option) => isRecord(option) && option.const === "missing",
	);
	const pattern = options.some(
		(option) =>
			isRecord(option) &&
			option.type === "string" &&
			option.pattern === "^sha256:[0-9a-f]{64}$",
	);
	return options.length === 2 && literal && pattern
		? "conditional"
		: "unrecognized";
}

/**
 * Whether the writer's public schema takes the optional `basis` that carries
 * research evidence with one write. An older writer gets no basis, and pstack
 * then refuses research proposals instead of dropping their evidence.
 */
export function writerAcceptsBasis(tool: ToolInfo): boolean {
	const schema: unknown = tool.parameters;
	if (!isRecord(schema) || !isRecord(schema.properties)) return false;
	const basis = schema.properties.basis;
	const required = Array.isArray(schema.required) ? schema.required : [];
	if (!isRecord(basis) || required.includes("basis")) return false;
	const kinds = (Array.isArray(basis.anyOf) ? basis.anyOf : []).map((option) =>
		isRecord(option) &&
		isRecord(option.properties) &&
		isRecord(option.properties.kind)
			? option.properties.kind.const
			: undefined,
	);
	return kinds.includes("registry-only") && kinds.includes("research");
}

function isUsableUrl(value: string): boolean {
	const url = URL.parse(value);
	return (
		url !== null &&
		(url.protocol === "https:" || url.protocol === "http:") &&
		url.hostname !== ""
	);
}

function isNonBlank(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

/**
 * The submitted ranking basis, or why it cannot be recorded. No basis means
 * registry-only: a proposal never claims research it did not describe. Code
 * checks shape only; it cannot prove the model read a source.
 */
export function parseBasis(raw: unknown): RankingBasis | string {
	if (raw === undefined) return { kind: "registry-only" };
	if (!isRecord(raw)) return "basis must be an object";
	if (raw.kind === "registry-only")
		return Object.keys(raw).length === 1
			? { kind: "registry-only" }
			: "a registry-only basis has no other fields";
	if (raw.kind !== "research")
		return 'basis.kind must be "registry-only" or "research"';
	const { sources, uncertainty } = raw;
	if (!Array.isArray(sources))
		return "research needs at least one source that informed the ranking";
	const parsed: ResearchSource[] = [];
	for (const [index, source] of sources.entries()) {
		if (!isRecord(source)) return `basis.sources[${index}] must be an object`;
		if (typeof source.url !== "string" || !isUsableUrl(source.url))
			return `basis.sources[${index}].url must be an http(s) URL with a host`;
		if (!isNonBlank(source.influence))
			return `basis.sources[${index}].influence must say how the source informed the ranking`;
		parsed.push({ url: source.url, influence: source.influence });
	}
	const [first, ...rest] = parsed;
	if (!first)
		return "research needs at least one source that informed the ranking";
	if (!isNonBlank(uncertainty))
		return "research must disclose its remaining uncertainty";
	return { kind: "research", sources: [first, ...rest], uncertainty };
}

function writerStatus(pi: ExtensionAPI): WriterStatus {
	const tool = pi.getAllTools().find((candidate) => candidate.name === WRITER);
	return tool ? { state: writerContract(tool), tool } : { state: "absent" };
}

/**
 * Exact `provider/model-id` references whose provider has configured auth,
 * across every registered model. The report and change flows use this.
 */
export function authenticatedRefs(ctx: ExtensionContext): string[] {
	return ctx.modelRegistry
		.getAll()
		.filter((model) => ctx.modelRegistry.hasConfiguredAuth(model))
		.map((model) => `${model.provider}/${model.id}`)
		.toSorted();
}

/**
 * Exact references in the active registry's available snapshot, the source
 * pi-herdr-agents builds its init brief from. Init flows check against this,
 * so they never crawl every registered model.
 */
export function availableRefs(ctx: ExtensionContext): string[] {
	return ctx.modelRegistry
		.getAvailable()
		.map((model) => `${model.provider}/${model.id}`);
}

/** Reasons a stored or proposed reference cannot be written as-is. */
export function refProblem(ref: string, authenticated: ReadonlySet<string>) {
	if (ref !== ref.trim()) return "has surrounding whitespace";
	if (ref.toLowerCase().startsWith("task:"))
		return "is a task alias, not an exact model";
	if (!authenticated.has(ref))
		return "is not an authenticated exact model in the current registry";
	return undefined;
}

function sourceLabel(tool: ToolInfo): string {
	return `${tool.sourceInfo.source} (${tool.sourceInfo.path})`;
}

function sameFile(a: string, b: string): boolean {
	try {
		return realpathSync(a) === realpathSync(b);
	} catch {
		return false;
	}
}

/**
 * A configured reference as the report shows it. Anything other than one
 * printable token is withheld, so a crafted value cannot add report lines.
 */
function displayRef(ref: string): string {
	return /^[\x21-\x7e]{1,200}$/.test(ref)
		? ref
		: "(withheld: not a single printable token)";
}

function formatRefs(refs: readonly string[] | undefined): string {
	return refs ? refs.map(displayRef).join(", ") : "(not set)";
}

type Report = {
	text: string;
	/** Empty when a change flow may open. */
	applyBlockers: string[];
};

function describeConfig(snapshot: ConfigSnapshot): string[] {
	switch (snapshot.state) {
		case "invalid-path":
			return [`Config: ${snapshot.path} cannot be used. ${snapshot.reason}.`];
		case "missing":
			return [
				`Config: ${snapshot.path} does not exist (revision "missing"). pi-herdr-agents uses its packaged defaults and no task categories are configured.`,
				"An approved write would create the file from pi-herdr-agents' packaged config.json.example defaults plus the approved task preferences.",
			];
		case "unreadable":
			return [`Config: ${snapshot.path} is unreadable (${snapshot.code}).`];
		case "malformed":
			return [
				`Config: ${snapshot.path} is not valid JSON. Its contents are not shown and setup will not overwrite it.`,
			];
		case "invalid-root":
			return [
				`Config: ${snapshot.path} is valid JSON but its root is not an object. Setup will not overwrite it.`,
			];
		case "invalid-status":
			return [
				`Config: ${snapshot.path} lacks the status object pi-herdr-agents requires ({"enabled": true|false}); the host does not load with it. Setup will not overwrite it.`,
			];
		case "invalid-models":
			return [
				`Config: ${snapshot.path} has an invalid models section: ${snapshot.reason}. pi-herdr-agents rejects it too; fix the file yourself.`,
			];
		case "present":
			return [`Config: ${snapshot.path} (revision ${snapshot.revision}).`];
	}
}

function preferenceLines(
	preferences: SharedPreferences,
	authenticated: ReadonlySet<string>,
): { lines: string[]; findings: string[] } {
	const lines = TASK_CATEGORIES.map(
		(category) => `  ${category}: ${formatRefs(preferences.tasks[category])}`,
	);
	lines.push(
		`  tasksMeta: ${preferences.tasksMeta ? `${preferences.tasksMeta.method} at ${preferences.tasksMeta.generatedAt}` : "(not set)"}`,
		`  default model (models.default): ${preferences.defaultModel === undefined ? "(not set)" : displayRef(preferences.defaultModel)}`,
	);
	const findings: string[] = [];
	for (const category of TASK_CATEGORIES)
		for (const ref of preferences.tasks[category] ?? []) {
			const problem = refProblem(ref, authenticated);
			if (problem)
				findings.push(`tasks.${category}: ${displayRef(ref)} ${problem}.`);
		}
	for (const category of METHODOLOGY_CATEGORIES)
		if (!preferences.tasks[category])
			findings.push(
				`tasks.${category} is not set; the methodology launches task:${category}.`,
			);
	return { lines, findings };
}

/**
 * Why changes cannot be applied from this session. `hasModels` says whether
 * the caller's model list is nonempty: the report lists the registry, while
 * an init flow already holds the host's brief. Nothing here lists models.
 */
function applyBlockers(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	hasModels: boolean,
): string[] {
	const blockers: string[] = [];
	if (process.env.PI_SUBAGENT_ID) blockers.push("this is a subagent session");
	if (!ctx.hasUI)
		blockers.push(`this ${ctx.mode} session cannot show an approval dialog`);
	const writer = writerStatus(pi);
	if (writer.state === "absent") blockers.push(`${WRITER} is not loaded`);
	else if (writer.state !== "conditional")
		blockers.push(`${WRITER} lacks the conditional-write contract`);
	else if (!pi.getActiveTools().includes(WRITER))
		blockers.push(`${WRITER} is not active`);
	if (resolveOwnedSkill(loadedSkills(pi), "setup-pstack").state !== "owned")
		blockers.push("the package setup-pstack skill is not the effective skill");
	if (!hasModels) blockers.push("no authenticated models");
	const { state } = readConfig();
	if (state !== "present" && state !== "missing")
		blockers.push(`the config file is ${state}`);
	return blockers;
}

/** Code-built setup report. It never includes unrelated configuration fields. */
export function buildReport(pi: ExtensionAPI, ctx: ExtensionContext): Report {
	const lines: string[] = ["pi-herdr-pstack setup report", ""];
	const child = Boolean(process.env.PI_SUBAGENT_ID);

	lines.push("Session");
	lines.push(
		`  ${child ? "pi-herdr-agents subagent (PI_SUBAGENT_ID is set): setup is report-only here; run it in your own session." : "parent session"}; mode ${ctx.mode}; dialogs ${ctx.hasUI ? "available" : "unavailable"}`,
	);

	lines.push("", "Host (pi-herdr-agents)");
	const tools = pi.getAllTools();
	const subagent = tools.find((tool) => tool.name === "subagent");
	lines.push(
		subagent
			? `  subagent tool: loaded from ${sourceLabel(subagent)}`
			: "  subagent tool: not loaded. Install and enable pi-herdr-agents as its own Pi package; files on disk do not activate it.",
	);
	lines.push(
		`  subagents_list: ${tools.some((tool) => tool.name === "subagents_list") ? "loaded" : "not loaded"}`,
	);
	const writer = writerStatus(pi);
	const writerActive = pi.getActiveTools().includes(WRITER);
	if (writer.state === "absent") {
		lines.push(
			`  ${WRITER}: not loaded (absent host, filtered tool, or a subagent session).`,
		);
	} else {
		const contract = {
			conditional:
				"conditional writes supported (expectedConfigRevision in its public schema)",
			unconditional:
				"older unconditional writer without expectedConfigRevision; setup stays report-only",
			unrecognized: "unrecognized schema; setup stays report-only",
		}[writer.state];
		lines.push(
			`  ${WRITER}: ${contract}; ${writerActive ? "active" : "inactive"}; from ${sourceLabel(writer.tool)}`,
		);
	}

	lines.push("", "Pstack resources");
	const skills = loadedSkills(pi);
	const potetoSkill = resolveOwnedSkill(skills, "poteto-mode");
	const setupSkill = resolveOwnedSkill(skills, "setup-pstack");
	lines.push(`  ${describeSkill("poteto-mode", potetoSkill)}`);
	lines.push(`  ${describeSkill("setup-pstack", setupSkill)}`);
	for (const name of ["poteto-mode", "setup-pstack"]) {
		const invocations = pi
			.getCommands()
			.filter(
				(command) =>
					command.source === "extension" &&
					sameFile(command.sourceInfo.path, EXTENSION_FILE) &&
					command.name.replace(/:\d+$/, "") === name,
			)
			.map((command) => `/${command.name}`);
		lines.push(
			`  command ${name}: ${invocations.length > 0 ? invocations.join(", ") : "not registered by this package"}${invocations.some((value) => value.includes(":")) ? " (another extension registers the same name)" : ""}`,
		);
	}
	lines.push(
		"  Roles: none. Pstack contributes no named roles; comment-sicko is a bare delegate driven by /skill:no-comments, and poteto-mode delegates are bare.",
		"  Child visibility: not verified. Parent discovery does not prove child sessions load this package.",
	);

	lines.push("", "Models");
	const authenticated = authenticatedRefs(ctx);
	lines.push(
		authenticated.length > 0
			? `  ${authenticated.length} authenticated exact model(s): ${authenticated.join(", ")}`
			: "  No authenticated models in the current registry.",
	);

	lines.push("", "Shared preferences");
	const snapshot = readConfig();
	lines.push(...describeConfig(snapshot).map((line) => `  ${line}`));
	const findings: string[] = [];
	if (snapshot.state === "present") {
		const described = preferenceLines(
			snapshot.preferences,
			new Set(authenticated),
		);
		lines.push(...described.lines);
		findings.push(...described.findings);
	}

	lines.push("", "Findings");
	lines.push(
		...(findings.length > 0
			? findings.map((finding) => `  - ${finding}`)
			: ["  - none"]),
	);

	lines.push("", "Next steps");
	lines.push(
		"  Task categories are shared pi-herdr-agents preferences: a change affects every pi-herdr-agents workflow and role pack, not only pstack.",
		"  An explicit subagent model argument, including a task:<category> selector, takes precedence over role, per-agent and default models.",
	);
	const blockers = applyBlockers(pi, ctx, authenticated.length > 0);
	if (blockers.length > 0)
		lines.push(
			`  Changes cannot be applied from this session: ${blockers.join("; ")}.`,
		);
	else
		lines.push(
			"  To change models, run /setup-pstack <request>, for example `/setup-pstack use <provider>/<model-id> for review`. You approve the complete writer payload in a dialog before anything is written.",
		);
	lines.push("", "No changes were made.");
	return { text: lines.join("\n"), applyBlockers: blockers };
}

/**
 * What opened a flow. An init flow proposes against the host's brief: the
 * config revision it read and the models it listed.
 */
type FlowOrigin =
	| { kind: "change" }
	| { kind: "init"; revision: string; refs: ReadonlySet<string> };

/**
 * How far the flow's own prompt has gone. Pi hands a command's prompt to
 * `input` handlers (source "extension"), then checks the model and its auth,
 * then emits `before_agent_start` and `agent_start`. A prompt that fails those
 * checks, or that an input handler consumes, never reaches the later events,
 * so any other input or run before `running` proves it did not start.
 */
type FlowPhase =
	/** Submitted; its `input` event has not arrived. */
	| "submitted"
	/** Its `input` passed; Pi is checking the model and auth. */
	| "preflight"
	/** `before_agent_start` ran for it; its run is starting. */
	| "starting"
	/** Its run started; settlement closes the window. */
	| "running";

/**
 * The apply window a `/setup-pstack <request>` command or a host init request
 * opens for its turn. It is a convenience that keeps the apply tool out of
 * other turns; the approval dialog, not this window, is what lets a write
 * through.
 */
type Flow = {
	sessionId: string;
	origin: FlowOrigin;
	phase: FlowPhase;
	/** The window may still open its one approval dialog. */
	applyOpen: boolean;
	applying: boolean;
};

/**
 * The user's approval of one exact writer payload, held in memory only while
 * the apply call dispatches it.
 */
export type Authorization = {
	parentToolCallId: string;
	canonical: string;
	revision: string;
	consumed: boolean;
};

/** Why a writer call does not match the one-shot approval, if it does not. */
export function authorizationProblem(
	approved: Authorization,
	parentToolCallId: string | undefined,
	input: unknown,
): string | undefined {
	if (approved.consumed) return "the approval was already used";
	if (parentToolCallId !== approved.parentToolCallId)
		return `this call is not the approved ${APPLY_TOOL} call's direct nested write`;
	if (canonicalJson(input) !== approved.canonical)
		return "its arguments differ from the approved payload";
	if (currentRevision() !== approved.revision)
		return "the config file changed after approval";
	return undefined;
}

/**
 * References current authentication allows for a flow's proposal: the active
 * registry an init brief came from, or the registry a change report listed.
 */
function currentRefs(
	origin: FlowOrigin,
	ctx: ExtensionContext,
): ReadonlySet<string> {
	return new Set(
		origin.kind === "init" ? availableRefs(ctx) : authenticatedRefs(ctx),
	);
}

function ok(text: string) {
	return { content: [{ type: "text" as const, text }], details: undefined };
}

function currentRevision(): string | undefined {
	const snapshot = readConfig();
	return "revision" in snapshot ? snapshot.revision : undefined;
}

function tableLines(before: TaskMap, after: TaskMap): string[] {
	return TASK_CATEGORIES.map((category) => {
		const from = formatRefs(before[category]);
		const to = formatRefs(after[category]);
		return `  ${category}: ${from === to ? `${to} (unchanged)` : `${from} -> ${to}`}`;
	});
}

/** Model-submitted text on one line, so it cannot add lines to the dialog. */
function oneLine(text: string): string {
	return text.replace(/[\s\p{Cc}]+/gu, " ").trim();
}

function basisLines(payload: WriterPayload): string[] {
	const { basis } = payload;
	if (!basis)
		return [
			"Ranking basis: registry-only. The loaded writer takes no basis field, so only tasksMeta.method records it.",
		];
	if (basis.kind === "registry-only")
		return [
			"Ranking basis, as submitted by the model: registry-only (no sources informed the ranking).",
		];
	return [
		"Ranking basis, as submitted by the model and not independently verified: research.",
		...basis.sources.map(
			(source) => `  - ${oneLine(source.url)}: ${oneLine(source.influence)}`,
		),
		`  Uncertainty: ${oneLine(basis.uncertainty)}`,
		"The basis goes to the writer with this payload but is not saved.",
	];
}

export function approvalMessage(
	snapshot: Extract<ConfigSnapshot, { state: "present" | "missing" }>,
	payload: WriterPayload,
): string {
	const before =
		snapshot.state === "present" ? snapshot.preferences : undefined;
	return [
		`File: ${snapshot.path}`,
		snapshot.state === "missing"
			? 'Current state: no file yet (revision "missing"). pi-herdr-agents will create it from its packaged config.json.example defaults plus the task preferences below.'
			: `Current state: existing file, revision ${snapshot.revision}. All settings other than models.tasks and models.tasksMeta are preserved.`,
		"",
		"Task categories (before -> after):",
		...tableLines(before?.tasks ?? {}, payload.tasks),
		"",
		`Metadata, generated by pstack: method ${payload.tasksMeta.method}, generatedAt ${payload.tasksMeta.generatedAt} (was ${before?.tasksMeta ? `${before.tasksMeta.method} at ${before.tasksMeta.generatedAt}` : "not set"}).`,
		...basisLines(payload),
		"",
		"Shared effect: task categories are pi-herdr-agents preferences used by every workflow and role pack, not only pstack.",
		"The write is conditional: it fails without changing anything if the file changes before the writer runs. Reload Pi afterwards.",
		"",
		`Exact ${WRITER} arguments:`,
		JSON.stringify(payload, null, 2),
	].join("\n");
}

/** What pstack reads from a host init request. */
type InitRequest = {
	context: ExtensionContext;
	revision: string;
	refs: ReadonlySet<string>;
};

/**
 * pstack's answer when the host opens its offer: the v1 open result. The host
 * calls `cancel` when it does not submit the prompt, which closes this flow.
 */
type InitOpened =
	| {
			kind: "ready";
			destination: { toolName: string; instructions: string };
			cancel: () => void;
	  }
	| { kind: "blocked"; reason: string };

const OWNER_LABEL = /^[\x21-\x7e]{1,100}$/;
const REVISION = /^(?:missing|sha256:[0-9a-f]{64})$/;

/** Replaces the host's direct-writer instruction in its init prompt. */
const INIT_INSTRUCTIONS = [
	`Propose through ${APPLY_TOOL}, not ${WRITER}: pi-herdr-pstack refuses every writer call except the one it makes after the user approves. Call ${APPLY_TOOL} with changes holding every category you drafted, each with its complete ordered list, and with basis. Categories you omit keep their current models.`,
	`Pstack checks the proposal against this brief's models and configRevision and against current authentication, sets tasksMeta from basis, and shows the exact writer payload in one approval dialog. A rejected proposal writes nothing; fix the named problem and call ${APPLY_TOOL} again. The window closes after the dialog or when this turn ends.`,
	"Report the tool result as it states it: declined, rejected or stale, failed or uncertain, or saved and verified. A failed call is not proof that nothing was written. Do not retry after the dialog. A proposal equal to the current tasks writes nothing and leaves tasksMeta unchanged.",
].join("\n\n");

function hasMethods(value: unknown, names: readonly string[]): boolean {
	return (
		isRecord(value) && names.every((name) => typeof value[name] === "function")
	);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null &&
		(typeof value === "object" || typeof value === "function") &&
		"then" in value &&
		typeof value.then === "function"
	);
}

/**
 * Reads a host init approval request (v1). Any other payload is not for
 * pstack. A v1 request pstack cannot use still gets an offer whose open
 * refuses, so the host never falls back to its direct writer.
 */
export function parseInitApproval(
	raw: unknown,
):
	| { offer: (offer: unknown) => unknown; request: InitRequest | string }
	| undefined {
	if (!isRecord(raw) || raw.apiVersion !== 1) return undefined;
	const { offer, brief, context } = raw;
	if (typeof offer !== "function") return undefined;
	const answer = (value: unknown) => offer.call(raw, value);
	const models =
		isRecord(brief) && Array.isArray(brief.models) ? brief.models : [];
	const refs = models.flatMap((model) =>
		isRecord(model) && typeof model.ref === "string" ? [model.ref] : [],
	);
	if (
		!isRecord(brief) ||
		typeof brief.configRevision !== "string" ||
		!REVISION.test(brief.configRevision) ||
		refs.length === 0 ||
		refs.length !== models.length
	)
		return {
			offer: answer,
			request:
				"the host's init brief has no usable configRevision or model list",
		};
	if (
		!isRecord(context) ||
		typeof context.mode !== "string" ||
		typeof context.hasUI !== "boolean" ||
		!hasMethods(context, ["isIdle", "hasPendingMessages"]) ||
		!hasMethods(context.sessionManager, ["getSessionId"]) ||
		!hasMethods(context.modelRegistry, ["getAvailable"])
	)
		return {
			offer: answer,
			request: "the host's init request has no usable command context",
		};
	return {
		offer: answer,
		request: {
			// SAFETY: the members setup reads were checked above; the rest is the
			// host command's own live context, from trusted in-process code.
			context: context as unknown as ExtensionContext,
			revision: brief.configRevision,
			refs: new Set(refs),
		},
	};
}

const CHANGES = Type.Object(
	Object.fromEntries(
		TASK_CATEGORIES.map((category) => [
			category,
			Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
		]),
	),
	{ additionalProperties: false, minProperties: 1 },
);

/** The same shape as pi-herdr-agents' writer `basis`; parseBasis checks the rest. */
const BASIS = Type.Union(
	[
		Type.Object(
			{ kind: Type.Literal("registry-only") },
			{ additionalProperties: false },
		),
		Type.Object(
			{
				kind: Type.Literal("research"),
				sources: Type.Array(
					Type.Object(
						{
							url: Type.String({ minLength: 1 }),
							influence: Type.String({ minLength: 1 }),
						},
						{ additionalProperties: false },
					),
					{ minItems: 1 },
				),
				uncertainty: Type.String({ minLength: 1 }),
			},
			{ additionalProperties: false },
		),
	],
	{
		description:
			'What the ranking rests on. {"kind":"registry-only"} (the default) when no usable source informed it; {"kind":"research"} only with the http(s) sources consulted in this run, how each informed the ranking, and the remaining uncertainty. Shown to the user as submitted, not verified. Not saved; tasksMeta.method records its kind.',
	},
);

export function registerSetup(pi: ExtensionAPI): void {
	/** The open apply window, from the change command until its run settles. */
	let flow: Flow | undefined;
	/** Live only while an approved apply call dispatches its one write. */
	let authorization: Authorization | undefined;
	/** Apply calls the model issued directly, as `tool_call` saw them. */
	const directApplyCalls = new Set<string>();
	/** This instance's session shut down or was replaced; its context is stale. */
	let ended = false;

	function deactivateApply() {
		try {
			const active = pi.getActiveTools();
			if (active.includes(APPLY_TOOL))
				pi.setActiveTools(active.filter((name) => name !== APPLY_TOOL));
		} catch {
			// The runtime was replaced or reloaded; its successor starts without a flow.
		}
	}

	/** Closes the apply window and drops any approval. */
	function closeFlow() {
		flow = undefined;
		authorization = undefined;
		deactivateApply();
	}

	/**
	 * Opens the one-turn apply window, or says why it cannot. Both origins share
	 * the apply blockers and the idle check. The caller submits the flow's
	 * prompt right after, before anything else can reach `input`.
	 */
	function openFlow(
		ctx: ExtensionContext,
		blockers: readonly string[],
		origin: FlowOrigin,
	): Flow | string {
		if (blockers.length > 0) return blockers.join("; ");
		if (!ctx.isIdle() || ctx.hasPendingMessages())
			return "a turn is in progress or messages are queued. Nothing was queued; retry when idle";
		if (!ctx.model)
			return "no model is selected, so Pi cannot run the prompt. Select a model, then retry";
		if (origin.kind === "init" && currentRevision() !== origin.revision)
			return "the config file changed after pi-herdr-agents read it for this init; run init again";
		const opened: Flow = {
			sessionId: ctx.sessionManager.getSessionId(),
			origin,
			phase: "submitted",
			applyOpen: true,
			applying: false,
		};
		flow = opened;
		pi.setActiveTools([...pi.getActiveTools(), APPLY_TOOL]);
		return opened;
	}

	/** pstack's answer when the host selects its offer for one init request. */
	function openInit(request: InitRequest | string): InitOpened {
		closeFlow();
		if (typeof request === "string")
			return { kind: "blocked", reason: request };
		// The brief's models stand in for the report's model list; init lists none.
		const opened = openFlow(
			request.context,
			applyBlockers(pi, request.context, request.refs.size > 0),
			{ kind: "init", revision: request.revision, refs: request.refs },
		);
		if (typeof opened === "string") return { kind: "blocked", reason: opened };
		return {
			kind: "ready",
			destination: { toolName: APPLY_TOOL, instructions: INIT_INSTRUCTIONS },
			// Closes only this request's flow, never a later one.
			cancel: () => {
				if (flow === opened) closeFlow();
			},
		};
	}

	// Offer before any check, so the host never mistakes a busy pstack for an
	// absent one; openInit decides when the host selects this offer.
	const stopInitApproval = pi.events.on(INIT_APPROVAL_EVENT, (raw) => {
		const parsed = parseInitApproval(raw);
		parsed?.offer({ owner: OWNER, open: () => openInit(parsed.request) });
	});

	/**
	 * Starts host init for `/setup-pstack init`. Returns why it did not start;
	 * once a host starts, the host's prompt and pstack's flow take over.
	 */
	function requestHostInit(
		ctx: ExtensionCommandContext,
		preferences: string,
	): string | undefined {
		const hosts: Array<{ owner: string; start: () => unknown }> = [];
		const problems: string[] = [];
		let collecting = true;
		try {
			pi.events.emit(INIT_START_EVENT, {
				apiVersion: 1,
				context: ctx,
				preferences,
				offer: (raw: unknown) => {
					if (!collecting) return "closed";
					const owner = isRecord(raw) ? raw.owner : undefined;
					const start = isRecord(raw) ? raw.start : undefined;
					if (
						typeof owner === "string" &&
						OWNER_LABEL.test(owner) &&
						typeof start === "function"
					)
						hosts.push({ owner, start: () => start.call(raw) });
					else
						problems.push(
							"an offer without an owner label and a start function",
						);
					return "recorded";
				},
			});
		} finally {
			collecting = false;
		}
		if (problems.length > 0)
			return `an init host answered with ${problems.join("; ")}`;
		const [host, ...others] = hosts;
		if (!host)
			return "no loaded pi-herdr-agents accepted the request. The host may be missing or older than this protocol, and hosts do not run init in subagent sessions. /setup-pstack <request> still proposes explicit changes";
		if (others.length > 0)
			return `more than one extension offered to run init (${hosts
				.map((entry) => entry.owner)
				.toSorted()
				.join(", ")}); keep one loaded`;
		let outcome: unknown;
		try {
			outcome = host.start();
		} catch (error) {
			return `${host.owner} failed to start init (${describeError(error)}); pstack cannot undo what it changed`;
		}
		if (isThenable(outcome)) {
			outcome.then(undefined, () => {});
			return `${host.owner} answered asynchronously, but v1 starts synchronously; pstack cannot undo what it changed`;
		}
		if (isRecord(outcome) && outcome.kind === "started") return undefined;
		if (
			isRecord(outcome) &&
			outcome.kind === "not-started" &&
			isNonBlank(outcome.reason)
		)
			return oneLine(outcome.reason);
		return `${host.owner} returned an unrecognized result`;
	}

	pi.on("session_start", () => {
		closeFlow();
		directApplyCalls.clear();
	});
	pi.on("session_tree", closeFlow);
	pi.on("session_shutdown", () => {
		closeFlow();
		ended = true;
		stopInitApproval();
	});
	// Each event moves the window's prompt one step. Anything out of order is
	// another prompt or run, so the window closes before it can use apply.
	// Input during the flow's own run is a steer or follow-up and keeps it.
	pi.on("input", (event) => {
		if (!flow || flow.phase === "running") return;
		if (flow.phase === "submitted" && event.source === "extension")
			flow.phase = "preflight";
		else closeFlow();
	});
	pi.on("before_agent_start", () => {
		if (!flow || flow.phase === "running") return;
		if (flow.phase === "preflight") flow.phase = "starting";
		else closeFlow();
	});
	pi.on("agent_start", () => {
		if (!flow || flow.phase === "running") return;
		if (flow.phase === "starting") flow.phase = "running";
		else closeFlow();
	});
	pi.on("agent_settled", () => {
		if (flow?.phase === "running") closeFlow();
	});

	pi.on("tool_call", (event) => {
		if (event.toolName === APPLY_TOOL) {
			if (event.parentToolCallId !== undefined)
				return {
					block: true,
					reason: `${APPLY_TOOL} must be called directly by the model inside /setup-pstack, not from another tool.`,
				};
			directApplyCalls.add(event.toolCallId);
			return;
		}
		if (event.toolName !== WRITER) return;
		// Blocked by default: only the approved apply call's own nested write passes.
		const approved = authorization;
		const problem = approved
			? authorizationProblem(approved, event.parentToolCallId, event.input)
			: "no approved /setup-pstack write is in progress";
		if (!approved || problem)
			return {
				block: true,
				reason: `pi-herdr-pstack blocked ${WRITER}: ${problem}. Nothing was written. ${WRITER_POINTER}`,
			};
		approved.consumed = true;
		// Later handlers can no longer mutate or rebind what was approved.
		deepFreeze(event.input);
		Object.freeze(event);
	});

	pi.registerTool({
		name: APPLY_TOOL,
		label: "Apply pstack task models",
		description: `Setup-only. Inside an active /setup-pstack change flow or a /subagents-init flow pstack opened, propose new model lists for named pi-herdr-agents task categories (${TASK_CATEGORIES.join(", ")}). Use only exact authenticated provider/model-id references from the setup report or init brief. Every category you omit keeps its current models. Optional basis says what the ranking rests on; without it the proposal is registry-only. The user approves the complete ${WRITER} payload in a dialog before a conditional write. One dialog per flow. Refuses outside the flow.`,
		parameters: Type.Object({ changes: CHANGES, basis: Type.Optional(BASIS) }),
		defaultActive: false,
		executionMode: "sequential",
		annotations: { readOnlyHint: false, openWorldHint: false },
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const active = flow;
			if (
				ended ||
				!active ||
				!active.applyOpen ||
				active.sessionId !== ctx.sessionManager.getSessionId()
			)
				throw new Error(
					`No open /setup-pstack change flow in this session. ${APPLY_TOOL} cannot write; ask the user to run /setup-pstack <request> or /subagents-init.`,
				);
			if (!directApplyCalls.has(toolCallId))
				throw new Error(`${APPLY_TOOL} must be called directly by the model.`);
			if (active.applying)
				throw new Error("Another setup proposal is already awaiting approval.");
			active.applying = true;
			try {
				return await apply(active, toolCallId, params, signal, ctx);
			} finally {
				active.applying = false;
			}
		},
	});

	async function apply(
		active: Flow,
		toolCallId: string,
		proposal: { changes: TaskMap; basis?: unknown },
		signal: AbortSignal | undefined,
		ctx: ExtensionToolContext,
	) {
		if (process.env.PI_SUBAGENT_ID)
			throw new Error("Setup writes are not available in subagent sessions.");
		if (!ctx.hasUI)
			throw new Error("No approval dialog is available; nothing was written.");
		const writer = writerStatus(pi);
		if (
			writer.state !== "conditional" ||
			!ctx.tools.some((tool) => tool.name === WRITER)
		)
			throw new Error(
				`${WRITER} with conditional writes is not callable here; nothing was written.`,
			);
		const snapshot = readConfig();
		if (snapshot.state !== "present" && snapshot.state !== "missing")
			throw new Error(
				`The config file is ${snapshot.state}; setup is report-only and wrote nothing.`,
			);
		// An init proposal answers the host's brief; a newer file needs a new brief.
		if (
			active.origin.kind === "init" &&
			snapshot.revision !== active.origin.revision
		)
			throw new Error(
				`Proposal rejected; nothing was written. The config file changed after pi-herdr-agents read it for this init (revision ${active.origin.revision}). Run /subagents-init again for a fresh brief.`,
			);
		const { changes } = proposal;
		const basis = parseBasis(proposal.basis);
		if (typeof basis === "string")
			throw new Error(`Proposal rejected; nothing was written. ${basis}.`);
		const carriesBasis = writerAcceptsBasis(writer.tool);
		if (basis.kind === "research" && !carriesBasis)
			throw new Error(
				`Proposal rejected; nothing was written. The loaded ${WRITER} takes no basis, so it cannot carry research evidence. Propose again with a registry-only basis, or update pi-herdr-agents.`,
			);
		const unknown = Object.keys(changes).some(
			(key) => !(TASK_CATEGORIES as readonly string[]).includes(key),
		);
		if (unknown)
			throw new Error(
				`Proposal rejected; nothing was written. It names a category other than ${TASK_CATEGORIES.join(", ")}.`,
			);
		const authenticated = currentRefs(active.origin, ctx);
		const current =
			snapshot.state === "present" ? snapshot.preferences.tasks : {};
		const tasks: TaskMap = {};
		for (const category of TASK_CATEGORIES) {
			const refs = changes[category] ?? current[category];
			if (refs) tasks[category] = [...refs];
		}
		const problems: string[] = [];
		for (const category of TASK_CATEGORIES) {
			const refs = tasks[category] ?? [];
			if (new Set(refs).size !== refs.length)
				problems.push(`${category} lists a reference twice`);
			for (const ref of refs) {
				const problem =
					refProblem(ref, authenticated) ??
					(active.origin.kind === "init" && !active.origin.refs.has(ref)
						? "is not among the init brief's models"
						: undefined);
				if (problem)
					problems.push(
						`${category}: ${displayRef(ref)} ${problem}${changes[category] ? "" : " (retained category: include it in changes with authenticated models)"}`,
					);
			}
		}
		if (problems.length > 0)
			throw new Error(
				`Proposal rejected; nothing was written. ${problems.join("; ")}.`,
			);
		if (canonicalJson(tasks) === canonicalJson(current))
			return ok(
				"No change: the proposal equals the current task preferences. Nothing was written, and tasksMeta was not refreshed.",
			);

		const fields = {
			tasks,
			// One timestamp, taken before the dialog, is what the user approves.
			tasksMeta: { generatedAt: new Date().toISOString(), method: basis.kind },
			expectedConfigRevision: snapshot.revision,
		};
		const payload: WriterPayload = deepFreeze(
			carriesBasis ? { ...fields, basis } : fields,
		);
		// One dialog per flow: whatever happens next, this run cannot ask again.
		active.applyOpen = false;
		deactivateApply();
		const approved = await ctx.ui.confirm(
			"Write shared pi-herdr-agents task models?",
			approvalMessage(snapshot, payload),
			{ signal, timeout: CONFIRM_TIMEOUT_MS },
		);
		if (signal?.aborted)
			throw new Error("Setup was cancelled; nothing was written.");
		if (!approved)
			return ok(
				"The user declined or the approval dialog timed out. Nothing was written. Run /setup-pstack again for a new proposal.",
			);

		const stale: string[] = [];
		if (ended || flow !== active) stale.push("the setup flow ended");
		else if (active.sessionId !== ctx.sessionManager.getSessionId())
			stale.push("the session changed");
		if (currentRevision() !== payload.expectedConfigRevision)
			stale.push("the config file changed during approval");
		if (!ended) {
			const nowAuthenticated = currentRefs(active.origin, ctx);
			if (
				Object.values(tasks)
					.flat()
					.some((ref) => !nowAuthenticated.has(ref))
			)
				stale.push("model authentication changed during approval");
			const now = writerStatus(pi);
			if (
				now.state !== "conditional" ||
				(payload.basis !== undefined && !writerAcceptsBasis(now.tool))
			)
				stale.push(`${WRITER} changed`);
		}
		if (stale.length > 0)
			throw new Error(
				`Approval is stale (${stale.join("; ")}). Nothing was written. Run /setup-pstack again for a fresh proposal.`,
			);

		const approval: Authorization = {
			parentToolCallId: toolCallId,
			canonical: canonicalJson(payload),
			revision: payload.expectedConfigRevision,
			consumed: false,
		};
		const revoke = () => {
			if (authorization === approval) authorization = undefined;
		};
		authorization = approval;
		signal?.addEventListener("abort", revoke, { once: true });
		let outcome: Awaited<ReturnType<typeof ctx.executeTool>> | undefined;
		let dispatchError: unknown;
		try {
			outcome = await ctx.executeTool(WRITER, payload, { signal });
		} catch (error) {
			dispatchError = error;
		} finally {
			revoke();
			signal?.removeEventListener("abort", revoke);
		}
		return reconcile(snapshot, payload, outcome, dispatchError);
	}

	pi.registerCommand("setup-pstack", {
		description:
			"Report pstack setup; /setup-pstack <request> proposes shared task-model changes for approval; /setup-pstack init [preferences] runs pi-herdr-agents' task-model init",
		handler: async (args, ctx) => {
			const request = args.trim();
			// Any earlier window, and an approval it holds, ends here.
			closeFlow();
			// Only the exact first word: "initialize ..." is an ordinary request.
			if (/^init(?:\s|$)/.test(request)) {
				const blocked = requestHostInit(ctx, request.slice("init".length));
				if (blocked)
					pi.sendMessage({
						customType: REPORT_MESSAGE_TYPE,
						content: `Task-model init not started: ${blocked}. Nothing was written.`,
						display: true,
					});
				return;
			}
			const report = buildReport(pi, ctx);
			if (
				request === "" ||
				request === "report" ||
				report.applyBlockers.length > 0
			) {
				pi.sendMessage({
					customType: REPORT_MESSAGE_TYPE,
					content:
						request && request !== "report"
							? `${report.text}\n\nRequested change not started: ${report.applyBlockers.join("; ")}.`
							: report.text,
					display: true,
				});
				return;
			}
			const opened = openFlow(ctx, report.applyBlockers, { kind: "change" });
			if (typeof opened === "string") {
				ctx.ui.notify(`Setup change not started: ${opened}.`, "warning");
				return;
			}
			try {
				pi.sendUserMessage(
					skillWrapper(
						"setup-pstack",
						[
							"/setup-pstack opened change flow. It ends when this turn settles.",
							"",
							report.text.replace(/\n\nNo changes were made\.$/, ""),
							"",
							`User request: ${request}`,
						].join("\n"),
					),
				);
			} catch (error) {
				// Nothing was submitted, so nothing may inherit the window.
				if (flow === opened) closeFlow();
				throw error;
			}
		},
	});
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function resultText(outcome: { result: { content: unknown } }): string {
	const { content } = outcome.result;
	if (!Array.isArray(content)) throw new Error("result content is not a list");
	return content
		.map((part: unknown) =>
			isRecord(part) && part.type === "text" && typeof part.text === "string"
				? part.text
				: "",
		)
		.join("");
}

/**
 * Turns a dispatched writer call into a report about the saved file. A failed
 * or unreadable outcome does not prove nothing was written: a later result
 * handler can mark a completed write as an error, and a failure can follow the
 * write. Only the file on disk decides, and nothing is retried.
 */
function reconcile(
	before: Extract<ConfigSnapshot, { state: "present" | "missing" }>,
	payload: WriterPayload,
	outcome: Awaited<ReturnType<ExtensionToolContext["executeTool"]>> | undefined,
	dispatchError: unknown,
) {
	const retry =
		"Approval is not reused and nothing was retried; run /setup-pstack again for a fresh proposal.";
	let reason: string;
	if (dispatchError !== undefined || !outcome)
		reason = `the ${WRITER} call failed (${describeError(dispatchError)})`;
	else {
		let text = "";
		let failure: string | undefined;
		let revision = "";
		let processing: unknown;
		try {
			text = resultText(outcome);
			if (!outcome.isError) {
				failure = verifySaved(before, payload, outcome.result.details);
				revision = String(
					(outcome.result.details as Record<string, unknown>).configRevision,
				);
			}
		} catch (error) {
			processing = error;
		}
		if (processing !== undefined)
			reason = `the ${WRITER} result could not be processed (${describeError(processing)})`;
		else if (outcome.isError) reason = `${WRITER} reported an error: ${text}`;
		else if (failure)
			throw new Error(
				`${WRITER} reported success, but the saved file does not match the approved payload: ${failure}. Inspect ${before.path} before relying on it. ${retry}`,
			);
		else
			return ok(
				`Saved the approved task preferences to ${before.path} (revision ${revision}). Verified the saved file. Reload Pi (/reload) so pi-herdr-agents uses them.`,
			);
	}

	const after = readConfig();
	if ("revision" in after && after.revision === before.revision)
		throw new Error(
			`${reason}. The config file is unchanged (revision ${after.revision}), so nothing was written. ${retry}`,
		);
	const mismatch = savedProblem(before, payload, after);
	if (!mismatch)
		throw new Error(
			`${reason}. However, ${before.path} changed and now holds exactly the approved task preferences (revision ${after.state === "present" ? after.revision : "unknown"}), so the write most likely happened. Inspect the file, then reload Pi (/reload) if you keep it. ${retry}`,
		);
	throw new Error(
		`${reason}. ${before.path} changed (${mismatch}), so whether ${WRITER} wrote is uncertain. Inspect the file before relying on it. ${retry}`,
	);
}

/** Why the saved file differs from the approval, if it does. */
function savedProblem(
	before: Extract<ConfigSnapshot, { state: "present" | "missing" }>,
	payload: WriterPayload,
	after: ConfigSnapshot,
): string | undefined {
	if (after.state !== "present") return `the file is ${after.state}`;
	if (canonicalJson(after.preferences.tasks) !== canonicalJson(payload.tasks))
		return "the saved tasks differ from the approval";
	if (
		canonicalJson(after.preferences.tasksMeta) !==
		canonicalJson(payload.tasksMeta)
	)
		return "the saved tasksMeta differs from the approval";
	if (
		before.state === "present" &&
		unrelatedSettingsJson(before.root) !== unrelatedSettingsJson(after.root)
	)
		return "settings outside models.tasks and models.tasksMeta changed";
	return undefined;
}

/** Confirms the saved bytes, not only the writer's claim, match the approval. */
export function verifySaved(
	before: Extract<ConfigSnapshot, { state: "present" | "missing" }>,
	payload: WriterPayload,
	details: unknown,
): string | undefined {
	const after = readConfig();
	const saved = savedProblem(before, payload, after);
	if (saved) return saved;
	if (
		after.state !== "present" ||
		!isRecord(details) ||
		details.configRevision !== after.revision
	)
		return "the returned configRevision does not match the saved bytes";
	if (canonicalJson(details.tasks) !== canonicalJson(payload.tasks))
		return "the returned tasks differ from the approval";
	return undefined;
}
