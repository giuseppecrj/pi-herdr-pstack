import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** pi-herdr-agents' documented task categories, in its order. */
export const TASK_CATEGORIES = [
	"coding",
	"review",
	"recon",
	"qa",
	"architecture",
	"docs",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type TaskMap = Partial<Record<TaskCategory, string[]>>;
export type TasksMeta = {
	generatedAt: string;
	method: RankingBasis["kind"];
};
/**
 * What a proposed ranking rests on, as the model submitted it. pi-herdr-agents'
 * writer takes the same optional `basis` and saves only its kind as
 * `tasksMeta.method`.
 */
export type RankingBasis =
	| { kind: "registry-only" }
	| {
			kind: "research";
			sources: [ResearchSource, ...ResearchSource[]];
			uncertainty: string;
	  };
export type ResearchSource = { url: string; influence: string };

/** The models fields setup reports. Nothing else from the file is retained. */
export type SharedPreferences = {
	tasks: TaskMap;
	tasksMeta?: TasksMeta;
	defaultModel?: string;
};

export type ConfigSnapshot =
	| { state: "invalid-path"; path: string; reason: string }
	| { state: "missing"; path: string; revision: "missing" }
	| { state: "unreadable"; path: string; code: string }
	| { state: "malformed"; path: string; revision: string }
	| { state: "invalid-root"; path: string; revision: string }
	| { state: "invalid-status"; path: string; revision: string }
	| { state: "invalid-models"; path: string; revision: string; reason: string }
	| {
			state: "present";
			path: string;
			revision: string;
			/** Held only for preservation checks; never reported. */
			root: Record<string, unknown>;
			preferences: SharedPreferences;
	  };

/**
 * pi-herdr-agents resolves its durable config as
 * `$PI_CODING_AGENT_DIR/herdr-agents/config.json`, defaulting to
 * `~/.pi/agent/herdr-agents/config.json`, using the variable verbatim.
 */
export function configPath():
	| { path: string }
	| { path: string; invalid: string } {
	const dir =
		process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const path = join(dir, "herdr-agents", "config.json");
	return isAbsolute(dir)
		? { path }
		: {
				path,
				invalid:
					"PI_CODING_AGENT_DIR is not an absolute path, so Pi and pi-herdr-agents can resolve different files",
			};
}

/** `sha256:<lowercase hex>` over exact bytes, the host's public revision format. */
export function revisionOf(bytes: Buffer): string {
	return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ISO_8601 =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Validates the shapes pi-herdr-agents itself rejects; returns the reason or
 * the extracted fields. Reasons name only fixed field names and the allowlisted
 * task categories, never a key or value taken from the file.
 */
export function parseModels(
	root: Record<string, unknown>,
): SharedPreferences | string {
	const models = root.models;
	if (models === undefined || models === null) return { tasks: {} };
	if (!isRecord(models)) return "models must be an object";
	for (const key of Object.keys(models))
		if (!["default", "agents", "tasks", "tasksMeta"].includes(key))
			return "models has an unsupported key";
	const preferences: SharedPreferences = { tasks: {} };
	if (models.default !== undefined && models.default !== null) {
		if (typeof models.default !== "string" || models.default.trim() === "")
			return "models.default must be a non-empty string";
		if (models.default.trim().toLowerCase().startsWith("task:"))
			return "models.default cannot use task: references";
		preferences.defaultModel = models.default;
	}
	if (models.agents !== undefined && models.agents !== null) {
		if (!isRecord(models.agents)) return "models.agents must be an object";
		// Per-agent overrides are validated for the report but never shown:
		// they are unrelated settings the writer preserves.
		for (const model of Object.values(models.agents)) {
			if (typeof model !== "string" || model.trim() === "")
				return "models.agents has a value that is not a non-empty string";
			if (model.trim().toLowerCase().startsWith("task:"))
				return "models.agents cannot use task: references";
		}
	}
	if (models.tasks !== undefined && models.tasks !== null) {
		if (!isRecord(models.tasks)) return "models.tasks must be an object";
		for (const category of Object.keys(models.tasks))
			if (!(TASK_CATEGORIES as readonly string[]).includes(category))
				return "models.tasks has an unsupported category";
		for (const category of TASK_CATEGORIES) {
			if (!Object.hasOwn(models.tasks, category)) continue;
			const refs = models.tasks[category];
			if (!Array.isArray(refs) || refs.length === 0)
				return `models.tasks.${category} must be a non-empty list`;
			if (refs.some((ref) => typeof ref !== "string" || ref.trim() === ""))
				return `models.tasks.${category} must contain only non-empty strings`;
			const trimmed = (refs as string[]).map((ref) => ref.trim());
			if (new Set(trimmed).size !== trimmed.length)
				return `models.tasks.${category} has a duplicate reference`;
		}
		for (const category of TASK_CATEGORIES)
			if (Object.hasOwn(models.tasks, category))
				preferences.tasks[category] = [...(models.tasks[category] as string[])];
	}
	if (models.tasksMeta !== undefined && models.tasksMeta !== null) {
		const meta = models.tasksMeta;
		if (!isRecord(meta)) return "models.tasksMeta must be an object";
		if (
			Object.keys(meta).some((key) => key !== "generatedAt" && key !== "method")
		)
			return "models.tasksMeta has an unsupported key";
		if (
			typeof meta.generatedAt !== "string" ||
			!ISO_8601.test(meta.generatedAt) ||
			Number.isNaN(Date.parse(meta.generatedAt))
		)
			return "models.tasksMeta.generatedAt must be an ISO-8601 string";
		if (meta.method !== "research" && meta.method !== "registry-only")
			return 'models.tasksMeta.method must be "research" or "registry-only"';
		preferences.tasksMeta = {
			generatedAt: meta.generatedAt,
			method: meta.method,
		};
	}
	return preferences;
}

/** Reads one exact-byte snapshot. Every non-present state is report-only. */
export function readConfig(): ConfigSnapshot {
	const location = configPath();
	if ("invalid" in location)
		return {
			state: "invalid-path",
			path: location.path,
			reason: location.invalid,
		};
	const { path } = location;
	let bytes: Buffer;
	try {
		bytes = readFileSync(path);
	} catch (error) {
		// SAFETY: readFileSync errors expose the Node errno code.
		const code = (error as NodeJS.ErrnoException).code ?? "unknown";
		return code === "ENOENT"
			? { state: "missing", path, revision: "missing" }
			: { state: "unreadable", path, code };
	}
	const revision = revisionOf(bytes);
	let root: unknown;
	try {
		root = JSON.parse(bytes.toString("utf8"));
	} catch {
		return { state: "malformed", path, revision };
	}
	if (!isRecord(root)) return { state: "invalid-root", path, revision };
	// pi-herdr-agents refuses to load an existing file without this exact shape.
	const status = root.status;
	if (
		!isRecord(status) ||
		Object.keys(status).some((key) => key !== "enabled") ||
		typeof status.enabled !== "boolean"
	)
		return { state: "invalid-status", path, revision };
	const preferences = parseModels(root);
	return typeof preferences === "string"
		? { state: "invalid-models", path, revision, reason: preferences }
		: { state: "present", path, revision, root, preferences };
}

/** Deterministic JSON with sorted object keys, for exact payload comparison. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, item: unknown) =>
		isRecord(item)
			? Object.fromEntries(
					Object.keys(item)
						.toSorted()
						.map((key) => [key, item[key]]),
				)
			: item,
	);
}

/**
 * Canonical JSON of everything the host writer must preserve: all but
 * models.tasks and models.tasksMeta. An absent `models` compares as `{}`,
 * the object the writer creates around the new task fields.
 */
export function unrelatedSettingsJson(root: Record<string, unknown>): string {
	if (!isRecord(root.models)) return canonicalJson({ ...root, models: {} });
	const { tasks: _tasks, tasksMeta: _tasksMeta, ...models } = root.models;
	return canonicalJson({ ...root, models });
}

export function deepFreeze<T>(value: T): T {
	if (typeof value === "object" && value !== null) {
		for (const item of Object.values(value)) deepFreeze(item);
		Object.freeze(value);
	}
	return value;
}
