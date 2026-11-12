import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { skillWrapper } from "./resources.ts";

/**
 * pi-herdr-agents' task-model writer. It registers inactive and shows its own
 * approval dialog on every call (3.10.0 and later), so pstack only makes it
 * callable for the setup flow and never gates or wraps it.
 */
export const WRITER = "subagents_write_task_models";
export const SETUP_MESSAGE_TYPE = "pi-herdr-pstack:setup";
/** First line of the setup brief; poteto-help and the skill quote it. */
export const BRIEF_HEADING = "/setup-pstack started the setup flow.";
export const TASK_CATEGORIES = [
	"coding",
	"review",
	"recon",
	"qa",
	"architecture",
	"docs",
] as const;
/** The thinking levels the host accepts for a category. */
export const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

/**
 * One line of JSON for a value read from the config file, with controls,
 * format characters and line separators escaped so it cannot add brief lines.
 */
function json(value: unknown): string {
	return (JSON.stringify(value ?? null) ?? "null").replace(
		/[\p{Cc}\p{Cf}\u2028\u2029]/gu,
		(char) =>
			char
				.split("")
				.map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`)
				.join(""),
	);
}

/** A JSON object's members, or undefined for any other value. */
type JsonObject = Readonly<Record<string, unknown>>;
function asObject(value: unknown): JsonObject | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonObject)
		: undefined;
}

const isModelList = (value: unknown) =>
	value === undefined ||
	(Array.isArray(value) && value.every((ref) => typeof ref === "string"));
const isLevel = (value: unknown) =>
	value === undefined ||
	(THINKING_LEVELS as readonly unknown[]).includes(value);

/**
 * The keys the brief would show whose values are not a category's model list
 * or thinking level. Categories outside TASK_CATEGORIES are never read.
 */
function malformedKeys(config: JsonObject): string[] {
	const models = asObject(config.models);
	const tasks = asObject(models?.tasks);
	const thinking = asObject(models?.tasksThinking);
	const containers: Array<[string, unknown, JsonObject | undefined]> = [
		["models", config.models, models],
		["models.tasks", models?.tasks, tasks],
		["models.tasksThinking", models?.tasksThinking, thinking],
	];
	return [
		// The host reads a null container as unset.
		...containers.flatMap(([key, value, object]) =>
			value != null && !object ? [key] : [],
		),
		...TASK_CATEGORIES.flatMap((category) => [
			...(isModelList(tasks?.[category]) ? [] : [`models.tasks.${category}`]),
			...(isLevel(thinking?.[category])
				? []
				: [`models.tasksThinking.${category}`]),
		]),
	];
}

/**
 * The saved task choices and the revision the writer's
 * `expectedConfigRevision` takes: `sha256:` over the exact file bytes, or
 * `missing`. Only the six categories' model lists and thinking levels leave
 * this function, and only in those shapes; anything else in the file, which
 * may hold secrets, never reaches the model, not even in a refusal.
 */
export function readTaskChoices():
	| { path: string; revision: string; lines: string[] }
	| { path: string; problem: string } {
	const path = join(getAgentDir(), "herdr-agents", "config.json");
	let bytes: Buffer;
	try {
		bytes = readFileSync(path);
	} catch (error) {
		// SAFETY: readFileSync errors expose the Node errno code.
		const code = (error as NodeJS.ErrnoException).code ?? "unknown";
		if (code !== "ENOENT") return { path, problem: `cannot be read (${code})` };
		return {
			path,
			revision: "missing",
			lines: TASK_CATEGORIES.map((category) => `- ${category}: null / null`),
		};
	}
	let root: unknown;
	try {
		root = JSON.parse(bytes.toString("utf8"));
	} catch {
		return { path, problem: "is not valid JSON" };
	}
	const config = asObject(root);
	if (config?.status === undefined)
		return { path, problem: "is not a pi-herdr-agents config object" };
	const malformed = malformedKeys(config);
	// Name the keys only: a malformed value may be a secret.
	if (malformed.length > 0)
		return {
			path,
			problem: `has malformed ${malformed.join(", ")} (each category takes a list of model strings and one of the thinking levels ${THINKING_LEVELS.join(", ")})`,
		};
	const tasks = asObject(asObject(config.models)?.tasks);
	const thinking = asObject(asObject(config.models)?.tasksThinking);
	return {
		path,
		revision: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
		lines: TASK_CATEGORIES.map(
			(category) =>
				`- ${category}: ${json(tasks?.[category])} / ${json(thinking?.[category])}`,
		),
	};
}

/** Why this session cannot run setup, or undefined when it can. */
function blocker(pi: ExtensionAPI, ctx: ExtensionCommandContext) {
	const writer = pi.getAllTools().find((tool) => tool.name === WRITER);
	if (!writer)
		return `${WRITER} is not loaded. Install pi-herdr-agents 3.10.0 or later; subagent sessions have no writer`;
	// 3.10.0 added category thinking and the writer's approval dialog together.
	if (
		asObject(asObject(writer.parameters)?.properties)?.tasksThinking ===
		undefined
	)
		return `the loaded pi-herdr-agents is older than 3.10.0: its writer takes no thinking and asks for no approval`;
	if (!ctx.hasUI)
		return `this ${ctx.mode} session cannot show the host's approval dialog`;
	if (!ctx.isIdle() || ctx.hasPendingMessages())
		return "a turn is in progress or messages are queued; retry when idle";
	return undefined;
}

/**
 * The setup brief the skill's steps read: the config revision, the current
 * choices and the authenticated models with their thinking levels.
 */
export function setupBrief(
	ctx: ExtensionCommandContext,
	request: string,
): { brief: string } | { problem: string } {
	const config = readTaskChoices();
	if ("problem" in config)
		return {
			problem: `${json(config.path)} ${config.problem}; fix or remove it first, since the writer refuses it too`,
		};
	const models = ctx.modelRegistry
		.getAvailable()
		.map(
			(model) =>
				`- ${json(`${model.provider}/${model.id}`)}: ${getSupportedThinkingLevels(model).join(", ")}`,
		);
	const brief = [
		BRIEF_HEADING,
		"",
		`Config file: ${json(config.path)}`,
		`expectedConfigRevision: ${json(config.revision)}`,
		"",
		"Current choices (models.tasks / models.tasksThinking; null = not set):",
		...config.lines,
		"",
		"Authenticated models and the thinking levels each supports:",
		...(models.length > 0 ? models : ["(none)"]),
		"",
		`tasksMeta for this write: ${json({ generatedAt: new Date().toISOString(), method: "registry-only" })}`,
		"",
		`User request: ${request || "(none)"}`,
	].join("\n");
	return { brief };
}

/**
 * The refusal for `/setup-pstack init ...`: 1.0.0 removed the init flow and
 * pstack's apply tool, and pi-herdr-agents' own `/subagents-init` replaces it.
 */
export const INIT_REMOVED =
	"`/setup-pstack init` was removed in pi-herdr-pstack 1.0.0, with `pstack_apply_task_models`. Use pi-herdr-agents' `/subagents-init` (3.10.0 or later) to draft task models from its registry, or `/setup-pstack [budget]`, for example `/setup-pstack medium`, to choose a budget and each category's models";

export function registerSetup(pi: ExtensionAPI): void {
	pi.registerCommand("setup-pstack", {
		description:
			"Choose the models and thinking budget pstack's delegates use, saved as pi-herdr-agents task preferences after you approve the change",
		handler: async (args, ctx) => {
			// The removed init form must not fall through as a free-text request.
			const problem =
				args.trim().split(/\s+/)[0] === "init"
					? INIT_REMOVED
					: blocker(pi, ctx);
			const setup = problem ? { problem } : setupBrief(ctx, args.trim());
			if ("problem" in setup) {
				pi.sendMessage({
					customType: SETUP_MESSAGE_TYPE,
					content: `/setup-pstack did not start: ${setup.problem}. Nothing was written.`,
					display: true,
				});
				return;
			}
			// The host registers its writer inactive and deactivates it after a
			// successful write; it asks for approval on every call.
			const active = pi.getActiveTools();
			if (!active.includes(WRITER)) pi.setActiveTools([...active, WRITER]);
			pi.sendUserMessage(skillWrapper("setup-pstack", setup.brief));
		},
	});
}
