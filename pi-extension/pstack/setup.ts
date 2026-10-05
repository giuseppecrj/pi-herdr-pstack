import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionToolContext,
	SessionEntry,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	type ConfigSnapshot,
	canonicalJson,
	deepFreeze,
	readConfig,
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
const UNCONFIRMED_NOTICE =
	"pi-herdr-pstack could not confirm this run as the /setup-pstack change flow: another extension changed or consumed its prompt. Shared task-model writes are blocked until the run settles and no change can be applied in it. Run /setup-pstack <request> again.";
/**
 * Session entries pstack appends for a change-flow run: `opened` by the
 * command before it sends the setup prompt, `started` when a new run claims
 * it, and `settled` when that run is over.
 */
export const RUN_ENTRY_TYPE = "pi-herdr-pstack:setup-run";
const EXTENSION_FILE = fileURLToPath(new URL("./index.ts", import.meta.url));
/** Categories poteto-mode's delegation examples route through. */
const METHODOLOGY_CATEGORIES: readonly TaskCategory[] = [
	"coding",
	"recon",
	"review",
];

export type WriterPayload = {
	tasks: TaskMap;
	tasksMeta: TasksMeta;
	expectedConfigRevision: string;
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

function writerStatus(pi: ExtensionAPI): WriterStatus {
	const tool = pi.getAllTools().find((candidate) => candidate.name === WRITER);
	return tool ? { state: writerContract(tool), tool } : { state: "absent" };
}

/** Exact `provider/model-id` references whose provider has configured auth. */
export function authenticatedRefs(ctx: ExtensionContext): string[] {
	return ctx.modelRegistry
		.getAll()
		.filter((model) => ctx.modelRegistry.hasConfiguredAuth(model))
		.map((model) => `${model.provider}/${model.id}`)
		.toSorted();
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
				`tasks.${category} is not set; poteto-mode delegation examples use task:${category}.`,
			);
	return { lines, findings };
}

/** Code-built setup report. It never includes unrelated configuration fields. */
export function buildReport(pi: ExtensionAPI, ctx: ExtensionContext): Report {
	const blockers: string[] = [];
	const lines: string[] = ["pi-herdr-pstack setup report", ""];
	const child = Boolean(process.env.PI_SUBAGENT_ID);

	lines.push("Session");
	lines.push(
		`  ${child ? "pi-herdr-agents subagent (PI_SUBAGENT_ID is set): setup is report-only here; run it in your own session." : "parent session"}; mode ${ctx.mode}; dialogs ${ctx.hasUI ? "available" : "unavailable"}`,
	);
	if (child) blockers.push("this is a subagent session");
	if (!ctx.hasUI)
		blockers.push(`this ${ctx.mode} session cannot show an approval dialog`);

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
		blockers.push(`${WRITER} is not loaded`);
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
		if (writer.state !== "conditional")
			blockers.push(`${WRITER} lacks the conditional-write contract`);
		else if (!writerActive) blockers.push(`${WRITER} is not active`);
	}

	lines.push("", "Pstack resources");
	const skills = loadedSkills(pi);
	const potetoSkill = resolveOwnedSkill(skills, "poteto-mode");
	const setupSkill = resolveOwnedSkill(skills, "setup-pstack");
	lines.push(`  ${describeSkill("poteto-mode", potetoSkill)}`);
	lines.push(`  ${describeSkill("setup-pstack", setupSkill)}`);
	if (setupSkill.state !== "owned")
		blockers.push("the package setup-pstack skill is not the effective skill");
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
		"  Roles: none. Pstack contributes no named roles; poteto-mode delegates are bare.",
		"  Child visibility: not verified. Parent discovery does not prove child sessions load this package.",
	);

	lines.push("", "Models");
	const authenticated = authenticatedRefs(ctx);
	lines.push(
		authenticated.length > 0
			? `  ${authenticated.length} authenticated exact model(s): ${authenticated.join(", ")}`
			: "  No authenticated models in the current registry.",
	);
	if (authenticated.length === 0) blockers.push("no authenticated models");

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
	} else if (snapshot.state !== "missing") {
		blockers.push(`the config file is ${snapshot.state}`);
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
 * One `/setup-pstack <request>` run. It protects the shared writer from the
 * change command until that run settles, independently of whether its single
 * apply attempt is still open.
 */
type Flow = {
	/** Names the run in pstack's own session entries. */
	runId: string;
	/** A new run claimed the reservation; until then another run may start first. */
	started: boolean;
	/**
	 * The claiming run's prompt carries this run's id. Without it the run is
	 * still protected, but it cannot apply changes.
	 */
	confirmed: boolean;
	sessionId: string;
	/** The run may still open its one approval dialog. */
	applyOpen: boolean;
	/** A report command, settlement or shutdown ended the run's apply authority. */
	revoked: boolean;
	applying: boolean;
};

export type Authorization = {
	parentToolCallId: string;
	canonical: string;
	revision: string;
	consumed: boolean;
	/** The apply call's signal; an aborted turn cancels the approval. */
	signal?: AbortSignal;
};

/** Why a nested writer call does not match its one-shot approval, if it does not. */
export function authorizationProblem(
	approved: Authorization,
	parentToolCallId: string | undefined,
	input: unknown,
): string | undefined {
	if (approved.consumed) return "the approval was already used";
	if (parentToolCallId !== approved.parentToolCallId)
		return `this call is not the approved ${APPLY_TOOL} call's direct nested write`;
	if (approved.signal?.aborted) return "the setup turn was cancelled";
	if (canonicalJson(input) !== approved.canonical)
		return "its arguments differ from the approved payload";
	if (currentRevision() !== approved.revision)
		return "the config file changed after approval";
	return undefined;
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
		"",
		"Shared effect: task categories are pi-herdr-agents preferences used by every workflow and role pack, not only pstack.",
		"The write is conditional: it fails without changing anything if the file changes before the writer runs. Reload Pi afterwards.",
		"",
		`Exact ${WRITER} arguments:`,
		JSON.stringify(payload, null, 2),
	].join("\n");
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

/** Whether the active branch shows `toolCallId` as a model-issued apply call. */
function isApplyCall(ctx: ExtensionContext, toolCallId: string): boolean {
	return ctx.sessionManager
		.getBranch()
		.some(
			(entry) =>
				entry.type === "message" &&
				entry.message.role === "assistant" &&
				entry.message.content.some(
					(part) =>
						part.type === "toolCall" &&
						part.id === toolCallId &&
						part.name === APPLY_TOOL,
				),
		);
}

export type RecordedRun = { runId: string; state: "opened" | "started" };

/**
 * The change-flow run pstack's own entries on the branch record as not yet
 * settled. Prompt text is never consulted, so input handlers cannot hide a
 * run. Only the latest opened run counts.
 */
export function recordedRun(
	branch: readonly SessionEntry[],
): RecordedRun | undefined {
	const states = new Map<string, Set<unknown>>();
	for (const entry of branch.toReversed()) {
		if (entry.type !== "custom" || entry.customType !== RUN_ENTRY_TYPE)
			continue;
		if (!isRecord(entry.data) || typeof entry.data.runId !== "string") continue;
		const { runId, state } = entry.data;
		if (state !== "opened") {
			states.set(runId, (states.get(runId) ?? new Set()).add(state));
			continue;
		}
		const later = states.get(runId);
		if (later?.has("settled")) return undefined;
		return { runId, state: later?.has("started") ? "started" : "opened" };
	}
	return undefined;
}

export function registerSetup(pi: ExtensionAPI): void {
	/** The protected setup run, from the change command until that run settles. */
	let flow: Flow | undefined;
	let authorization: Authorization | undefined;
	/**
	 * Every apply call the model issued in this extension instance. Kept after
	 * the flow ends, so a late nested write under an expired approval is still
	 * recognized as one rather than as an unrelated call.
	 */
	const applyCalls = new Set<string>();
	/**
	 * Runs whose reservation another run claimed first. If their own prompt
	 * starts later, it is still protected.
	 */
	const displacedRuns = new Set<string>();
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

	/** Ends the run's apply authority. Protection lasts until the run settles. */
	function revokeApply() {
		if (flow) {
			flow.applyOpen = false;
			flow.revoked = true;
		}
		authorization = undefined;
		deactivateApply();
	}

	function recorded(ctx: ExtensionContext): RecordedRun | undefined {
		return recordedRun(ctx.sessionManager.getBranch());
	}

	function record(runId: string, state: "opened" | "started" | "settled") {
		try {
			pi.appendEntry(RUN_ENTRY_TYPE, { runId, state });
		} catch {
			// A stale runtime; its successor reads the branch as it stands.
		}
	}

	/**
	 * Records that the branch's started change-flow run is over. A run that is
	 * only opened stays recorded: its prompt may still start, and the next new
	 * run claims it instead.
	 */
	function settleRecordedRun(ctx: ExtensionContext) {
		try {
			const run = recorded(ctx);
			if (run?.state === "started") record(run.runId, "settled");
		} catch {
			// A stale context; the successor settles the run instead.
		}
	}

	/**
	 * Starts protecting a new run as a setup run whose identity pstack cannot
	 * confirm. It never gains apply authority.
	 */
	function protectUnconfirmed(runId: string, ctx: ExtensionContext) {
		flow = {
			runId,
			started: true,
			confirmed: false,
			sessionId: ctx.sessionManager.getSessionId(),
			applyOpen: false,
			revoked: true,
			applying: false,
		};
		authorization = undefined;
		deactivateApply();
		record(runId, "started");
		if (ctx.hasUI) ctx.ui.notify(UNCONFIRMED_NOTICE, "warning");
	}

	pi.on("session_start", (_event, ctx) => {
		revokeApply();
		flow = undefined;
		// A run that a crash or shutdown left unsettled is over once nothing runs.
		// After /reload during a run, the guard below keeps it protected instead.
		if (ctx.isIdle()) settleRecordedRun(ctx);
	});
	pi.on("session_tree", (_event, ctx) => {
		// Navigation needs an idle session. A branch that now ends inside a setup
		// run records that run as over, and restored tools do not reopen apply.
		if (flow?.started === false) return;
		revokeApply();
		flow = undefined;
		settleRecordedRun(ctx);
	});
	pi.on("session_shutdown", () => {
		revokeApply();
		ended = true;
	});
	pi.on("before_agent_start", (event, ctx) => {
		// Every new run emits this; steering and follow-ups inside a run do not.
		const pending = flow?.started === false ? flow : undefined;
		if (pending) {
			// Fail closed: the first new run after the command is treated as the
			// setup run, whatever input handlers did to its prompt. It may apply
			// changes only if its prompt still carries the run's id.
			pending.started = true;
			pending.confirmed = event.prompt.includes(pending.runId);
			if (pending.confirmed) record(pending.runId, "started");
			else {
				displacedRuns.add(pending.runId);
				protectUnconfirmed(pending.runId, ctx);
			}
			return;
		}
		// A setup run that never reported settling is over now.
		if (flow) {
			revokeApply();
			flow = undefined;
		}
		let run: RecordedRun | undefined;
		try {
			run = recorded(ctx);
		} catch {
			run = undefined;
		}
		if (run?.state === "started") record(run.runId, "settled");
		const displaced = [...displacedRuns].find((runId) =>
			event.prompt.includes(runId),
		);
		if (displaced !== undefined) {
			displacedRuns.delete(displaced);
			protectUnconfirmed(displaced, ctx);
		} else if (run?.state === "opened")
			// Opened by a command this instance did not see, such as one before a
			// reload: this may be its prompt.
			protectUnconfirmed(run.runId, ctx);
	});
	pi.on("agent_settled", (_event, ctx) => {
		// A run that did not claim the reservation leaves it waiting.
		if (flow?.started === false) return;
		revokeApply();
		flow = undefined;
		settleRecordedRun(ctx);
	});

	pi.on("tool_call", (event, ctx) => {
		if (event.toolName === APPLY_TOOL) {
			if (event.parentToolCallId !== undefined)
				return {
					block: true,
					reason: `${APPLY_TOOL} must be called directly by the model inside /setup-pstack, not from another tool.`,
				};
			applyCalls.add(event.toolCallId);
			return;
		}
		if (event.toolName !== WRITER) return;
		const parent = event.parentToolCallId;
		let underApply = parent !== undefined && applyCalls.has(parent);
		if (!underApply && parent !== undefined)
			try {
				// After a reload, this instance never saw the apply call itself.
				underApply = isApplyCall(ctx, parent);
			} catch {
				// A stale context cannot rule it out.
				underApply = true;
			}
		if (!flow?.started && !underApply) {
			// While a reservation waits, the running run did not claim it, so it is
			// not the setup prompt.
			let joined = false;
			if (!flow)
				try {
					// After a reload, the running turn may be a setup run this instance
					// never opened. Its approval is gone, but its protection is not.
					joined = !ctx.isIdle() && recorded(ctx) !== undefined;
				} catch {
					joined = true;
				}
			// Outside a setup run the host's writer behaves exactly as without pstack.
			if (!joined) return;
		}
		const approved = authorization;
		let problem: string | undefined =
			`until this /setup-pstack run settles, only its approved ${APPLY_TOOL} call may write`;
		if (flow?.started && !flow.confirmed)
			problem = `${problem}. pstack could not confirm this run as the /setup-pstack change flow (another extension changed or consumed its prompt), so it cannot apply changes; run /setup-pstack again`;
		if (approved) problem = authorizationProblem(approved, parent, event.input);
		else if (underApply)
			problem = `the approval for that ${APPLY_TOOL} call has ended (declined, cancelled, revoked, stale or already used)`;
		if (!approved || problem)
			return {
				block: true,
				reason: `pi-herdr-pstack setup blocked ${WRITER}: ${problem}. Nothing was written.`,
			};
		approved.consumed = true;
		// Later handlers can no longer mutate or rebind what was approved.
		deepFreeze(event.input);
		Object.freeze(event);
	});

	pi.registerTool({
		name: APPLY_TOOL,
		label: "Apply pstack task models",
		description: `Setup-only. Inside an active /setup-pstack change flow, propose new model lists for named pi-herdr-agents task categories (${TASK_CATEGORIES.join(", ")}). Use only exact authenticated provider/model-id references from the setup report. Every category you omit keeps its current models. The user approves the complete ${WRITER} payload in a dialog before a conditional write. One dialog per flow. Refuses outside the flow.`,
		parameters: Type.Object({ changes: CHANGES }),
		defaultActive: false,
		executionMode: "sequential",
		annotations: { readOnlyHint: false, openWorldHint: false },
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const active = flow;
			if (
				ended ||
				!active ||
				!active.applyOpen ||
				!active.started ||
				!active.confirmed ||
				active.sessionId !== ctx.sessionManager.getSessionId()
			)
				throw new Error(
					`No open /setup-pstack change flow in this session. ${APPLY_TOOL} cannot write; ask the user to run /setup-pstack <request>.`,
				);
			if (!applyCalls.has(toolCallId))
				throw new Error(`${APPLY_TOOL} must be called directly by the model.`);
			if (active.applying)
				throw new Error("Another setup proposal is already awaiting approval.");
			active.applying = true;
			try {
				return await apply(active, toolCallId, params.changes, signal, ctx);
			} finally {
				active.applying = false;
			}
		},
	});

	async function apply(
		active: Flow,
		toolCallId: string,
		changes: TaskMap,
		signal: AbortSignal | undefined,
		ctx: ExtensionToolContext,
	) {
		if (process.env.PI_SUBAGENT_ID)
			throw new Error("Setup writes are not available in subagent sessions.");
		if (!ctx.hasUI)
			throw new Error("No approval dialog is available; nothing was written.");
		if (
			writerStatus(pi).state !== "conditional" ||
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
		const unknown = Object.keys(changes).some(
			(key) => !(TASK_CATEGORIES as readonly string[]).includes(key),
		);
		if (unknown)
			throw new Error(
				`Proposal rejected; nothing was written. It names a category other than ${TASK_CATEGORIES.join(", ")}.`,
			);
		const authenticated = new Set(authenticatedRefs(ctx));
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
				const problem = refProblem(ref, authenticated);
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
				"No change: the proposal equals the current task preferences. Nothing was written.",
			);

		const payload: WriterPayload = deepFreeze({
			tasks,
			tasksMeta: {
				generatedAt: new Date().toISOString(),
				method: "registry-only",
			},
			expectedConfigRevision: snapshot.revision,
		});
		// One dialog per flow: whatever happens next, this run cannot ask again.
		// The run stays protected until it settles.
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
		if (ended || flow !== active || active.revoked)
			stale.push("the setup flow ended");
		else if (active.sessionId !== ctx.sessionManager.getSessionId())
			stale.push("the session changed");
		if (currentRevision() !== payload.expectedConfigRevision)
			stale.push("the config file changed during approval");
		if (!ended) {
			const nowAuthenticated = new Set(authenticatedRefs(ctx));
			if (
				Object.values(tasks)
					.flat()
					.some((ref) => !nowAuthenticated.has(ref))
			)
				stale.push("model authentication changed during approval");
			if (writerStatus(pi).state !== "conditional")
				stale.push(`${WRITER} changed`);
		}
		if (stale.length > 0)
			throw new Error(
				`Approval is stale (${stale.join("; ")}). Nothing was written. Run /setup-pstack again for a fresh proposal.`,
			);

		authorization = {
			parentToolCallId: toolCallId,
			canonical: canonicalJson(payload),
			revision: payload.expectedConfigRevision,
			consumed: false,
			signal,
		};
		let outcome: Awaited<ReturnType<typeof ctx.executeTool>> | undefined;
		let dispatchError: unknown;
		try {
			outcome = await ctx.executeTool(WRITER, payload, { signal });
		} catch (error) {
			dispatchError = error;
		} finally {
			authorization = undefined;
		}
		return reconcile(snapshot, payload, outcome, dispatchError);
	}

	pi.registerCommand("setup-pstack", {
		description:
			"Report pstack setup; /setup-pstack <request> proposes shared task-model changes for approval",
		handler: async (args, ctx) => {
			const request = args.trim();
			// A running setup turn loses its apply authority but stays protected.
			revokeApply();
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
			if (!ctx.isIdle() || ctx.hasPendingMessages()) {
				ctx.ui.notify(
					"Setup change not started: a turn is in progress or messages are queued. Nothing was queued; retry when idle.",
					"warning",
				);
				return;
			}
			// An earlier reservation whose prompt never started may still start.
			if (flow?.started === false) displacedRuns.add(flow.runId);
			const runId = randomUUID();
			flow = {
				runId,
				started: false,
				confirmed: false,
				sessionId: ctx.sessionManager.getSessionId(),
				applyOpen: true,
				revoked: false,
				applying: false,
			};
			// Identifies the run from pstack's own state, never from prompt text
			// that input handlers can change.
			record(runId, "opened");
			pi.setActiveTools([...pi.getActiveTools(), APPLY_TOOL]);
			pi.sendUserMessage(
				skillWrapper(
					"setup-pstack",
					[
						`/setup-pstack opened change flow ${runId}. It ends when this turn settles.`,
						"",
						report.text.replace(/\n\nNo changes were made\.$/, ""),
						"",
						`User request: ${request}`,
					].join("\n"),
				),
			);
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
