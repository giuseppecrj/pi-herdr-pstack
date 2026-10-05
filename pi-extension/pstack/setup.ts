import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionToolContext,
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
const EXTENSION_FILE = fileURLToPath(new URL("./index.ts", import.meta.url));
const ROLE_FILE = fileURLToPath(
	new URL("../../agents/poteto.md", import.meta.url),
);
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

function formatRefs(refs: readonly string[] | undefined): string {
	return refs ? refs.join(", ") : "(not set)";
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
		`  default model: ${preferences.defaultModel ?? "(not set)"}`,
		`  poteto override (models.agents.poteto): ${preferences.potetoOverride ?? "(not set)"}`,
	);
	const findings: string[] = [];
	for (const category of TASK_CATEGORIES)
		for (const ref of preferences.tasks[category] ?? []) {
			const problem = refProblem(ref, authenticated);
			if (problem) findings.push(`tasks.${category}: ${ref} ${problem}.`);
		}
	for (const category of METHODOLOGY_CATEGORIES)
		if (!preferences.tasks[category])
			findings.push(
				`tasks.${category} is not set; poteto-mode delegation examples use task:${category}.`,
			);
	if (preferences.potetoOverride)
		findings.push(
			`models.agents.poteto (${preferences.potetoOverride}) applies to every poteto launch without an explicit model, ahead of the task categories.`,
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
		`  poteto role file: ${existsSync(ROLE_FILE) ? ROLE_FILE : "missing"}. Use subagents_list to see the role the host actually resolves; a project or global poteto overrides this package's role.`,
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

type Flow = {
	generation: number;
	sessionId: string;
	closed: boolean;
	applying: boolean;
};

export type Authorization = {
	parentToolCallId: string;
	canonical: string;
	revision: string;
	consumed: boolean;
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
		...(before?.potetoOverride
			? [
					`models.agents.poteto (${before.potetoOverride}) is unchanged and still takes precedence for poteto launches without an explicit model.`,
				]
			: []),
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

export function registerSetup(pi: ExtensionAPI): void {
	let generation = 0;
	let flow: Flow | undefined;
	let authorization: Authorization | undefined;
	/** Apply calls the model issued directly; only their nested writer calls can be authorized. */
	const directApplyCalls = new Set<string>();

	function deactivateApply() {
		const active = pi.getActiveTools();
		if (active.includes(APPLY_TOOL))
			pi.setActiveTools(active.filter((name) => name !== APPLY_TOOL));
	}

	function closeFlow() {
		if (flow) flow.closed = true;
		flow = undefined;
		authorization = undefined;
		directApplyCalls.clear();
		deactivateApply();
	}

	pi.on("session_start", () => closeFlow());
	pi.on("session_shutdown", () => closeFlow());
	pi.on("agent_settled", () => closeFlow());

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
		const fromApply =
			event.parentToolCallId !== undefined &&
			directApplyCalls.has(event.parentToolCallId);
		// Outside a setup flow the host's writer behaves exactly as without pstack.
		if (!flow && !authorization && !fromApply) return;
		const approved = authorization;
		const problem = approved
			? authorizationProblem(approved, event.parentToolCallId, event.input)
			: `while /setup-pstack is active, only its approved ${APPLY_TOOL} call may write`;
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
		description: `Setup-only. Inside an active /setup-pstack change flow, propose new model lists for named pi-herdr-agents task categories (${TASK_CATEGORIES.join(", ")}). Use only exact authenticated provider/model-id references from the setup report. Every category you omit keeps its current models. The user approves the complete ${WRITER} payload in a dialog before a conditional write. Refuses outside the flow.`,
		parameters: Type.Object({ changes: CHANGES }),
		defaultActive: false,
		executionMode: "sequential",
		annotations: { readOnlyHint: false, openWorldHint: false },
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const active = flow;
			if (
				!active ||
				active.closed ||
				active.sessionId !== ctx.sessionManager.getSessionId()
			)
				throw new Error(
					`No active /setup-pstack change flow in this session. ${APPLY_TOOL} cannot write; ask the user to run /setup-pstack <request>.`,
				);
			if (!directApplyCalls.has(toolCallId))
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
		const authenticated = new Set(authenticatedRefs(ctx));
		const current =
			snapshot.state === "present" ? snapshot.preferences.tasks : {};
		const tasks: TaskMap = {};
		for (const category of TASK_CATEGORIES) {
			const refs = changes[category] ?? current[category];
			if (refs) tasks[category] = [...refs];
		}
		const unknown = Object.keys(changes).filter(
			(key) => !(TASK_CATEGORIES as readonly string[]).includes(key),
		);
		if (unknown.length > 0)
			throw new Error(`Unknown task categories: ${unknown.join(", ")}.`);
		const problems: string[] = [];
		for (const category of TASK_CATEGORIES) {
			const refs = tasks[category] ?? [];
			if (new Set(refs).size !== refs.length)
				problems.push(`${category} lists a reference twice`);
			for (const ref of refs) {
				const problem = refProblem(ref, authenticated);
				if (problem)
					problems.push(
						`${category}: ${ref} ${problem}${changes[category] ? "" : " (retained category: include it in changes with authenticated models)"}`,
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
		const approved = await ctx.ui.confirm(
			"Write shared pi-herdr-agents task models?",
			approvalMessage(snapshot, payload),
			{ signal, timeout: CONFIRM_TIMEOUT_MS },
		);
		if (signal?.aborted) {
			closeFlow();
			throw new Error("Setup was cancelled; nothing was written.");
		}
		if (!approved) {
			closeFlow();
			return ok(
				"The user declined or the approval dialog timed out. Nothing was written. Run /setup-pstack again for a new proposal.",
			);
		}

		const stale: string[] = [];
		if (flow !== active || active.closed) stale.push("the setup flow ended");
		if (active.sessionId !== ctx.sessionManager.getSessionId())
			stale.push("the session changed");
		if (currentRevision() !== payload.expectedConfigRevision)
			stale.push("the config file changed during approval");
		const nowAuthenticated = new Set(authenticatedRefs(ctx));
		if (
			Object.values(tasks)
				.flat()
				.some((ref) => !nowAuthenticated.has(ref))
		)
			stale.push("model authentication changed during approval");
		if (writerStatus(pi).state !== "conditional")
			stale.push(`${WRITER} changed`);
		if (stale.length > 0) {
			closeFlow();
			throw new Error(
				`Approval is stale (${stale.join("; ")}). Nothing was written. Run /setup-pstack again for a fresh proposal.`,
			);
		}

		authorization = {
			parentToolCallId: toolCallId,
			canonical: canonicalJson(payload),
			revision: payload.expectedConfigRevision,
			consumed: false,
		};
		let outcome: Awaited<ReturnType<typeof ctx.executeTool>>;
		try {
			outcome = await ctx.executeTool(WRITER, payload, { signal });
		} finally {
			authorization = undefined;
			// One write attempt per flow: a failure needs a fresh proposal and approval.
			closeFlow();
		}
		const resultText = outcome.result.content
			.map((part) => (part.type === "text" ? part.text : ""))
			.join("");
		if (outcome.isError)
			throw new Error(
				`${WRITER} did not write: ${resultText} Approval is not reused; run /setup-pstack again for a fresh proposal.`,
			);
		const failure = verifySaved(snapshot, payload, outcome.result.details);
		if (failure)
			throw new Error(
				`${WRITER} reported success, but the saved file does not match the approved payload: ${failure}. Inspect ${snapshot.path} before relying on it.`,
			);
		return ok(
			`Saved the approved task preferences to ${snapshot.path} (revision ${String((outcome.result.details as Record<string, unknown>).configRevision)}). Verified the saved file. Reload Pi (/reload) so pi-herdr-agents uses them.`,
		);
	}

	pi.registerCommand("setup-pstack", {
		description:
			"Report pstack setup; /setup-pstack <request> proposes shared task-model changes for approval",
		handler: async (args, ctx) => {
			const request = args.trim();
			closeFlow();
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
			generation += 1;
			flow = {
				generation,
				sessionId: ctx.sessionManager.getSessionId(),
				closed: false,
				applying: false,
			};
			pi.setActiveTools([...pi.getActiveTools(), APPLY_TOOL]);
			pi.sendUserMessage(
				skillWrapper(
					"setup-pstack",
					[
						`/setup-pstack opened change flow ${generation}. It ends when this turn settles.`,
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

/** Confirms the saved bytes, not only the writer's claim, match the approval. */
export function verifySaved(
	before: Extract<ConfigSnapshot, { state: "present" | "missing" }>,
	payload: WriterPayload,
	details: unknown,
): string | undefined {
	const after = readConfig();
	if (after.state !== "present") return `the file is ${after.state}`;
	if (!isRecord(details) || details.configRevision !== after.revision)
		return "the returned configRevision does not match the saved bytes";
	if (canonicalJson(details.tasks) !== canonicalJson(payload.tasks))
		return "the returned tasks differ from the approval";
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
