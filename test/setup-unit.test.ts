import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	canonicalJson,
	deepFreeze,
	parseModels,
	readConfig,
	revisionOf,
	unrelatedSettingsJson,
} from "../pi-extension/pstack/config.ts";
import {
	APPLY_TOOL,
	approvalMessage,
	authorizationProblem,
	recordedRun,
	RUN_ENTRY_TYPE,
	refProblem,
	registerSetup,
	WRITER,
	writerContract,
} from "../pi-extension/pstack/setup.ts";

function tool(parameters: unknown): ToolInfo {
	// SAFETY: writerContract reads only the parameter schema.
	return { name: "subagents_write_task_models", parameters } as ToolInfo;
}

const TASKS = Type.Object({});
const META = Type.Object({});

describe("writer contract detection from the public schema", () => {
	it("recognizes the conditional writer and treats anything else as report-only", () => {
		const revision = Type.Union([
			Type.Literal("missing"),
			Type.String({ pattern: "^sha256:[0-9a-f]{64}$" }),
		]);
		assert.equal(
			writerContract(
				tool(
					Type.Object({
						tasks: TASKS,
						tasksMeta: META,
						expectedConfigRevision: Type.Optional(revision),
					}),
				),
			),
			"conditional",
		);
		assert.equal(
			writerContract(tool(Type.Object({ tasks: TASKS, tasksMeta: META }))),
			"unconditional",
		);
		for (const schema of [
			Type.Object({
				tasks: TASKS,
				tasksMeta: META,
				expectedConfigRevision: revision,
			}),
			Type.Object({
				tasks: TASKS,
				tasksMeta: META,
				expectedConfigRevision: Type.Optional(Type.String()),
			}),
			Type.Object({
				tasks: TASKS,
				tasksMeta: META,
				expectedConfigRevision: Type.Optional(
					Type.Union([
						Type.Literal("missing"),
						Type.String({ pattern: "^sha256:" }),
					]),
				),
			}),
			Type.Object({ tasks: TASKS }),
			{},
		])
			assert.equal(
				writerContract(tool(schema)),
				"unrecognized",
				JSON.stringify(schema),
			);
	});
});

describe("one-shot approval matching", () => {
	const approved = (consumed = false) => ({
		parentToolCallId: "call-1",
		canonical: canonicalJson({ tasks: { review: ["a/b"] } }),
		revision: "missing",
		consumed,
	});
	const previous = process.env.PI_CODING_AGENT_DIR;
	const dir = mkdtempSync(join(tmpdir(), "pi-herdr-pstack-unit-"));

	it("requires the exact direct parent, exact payload, unchanged file and an unused approval", () => {
		process.env.PI_CODING_AGENT_DIR = dir;
		try {
			const input = { tasks: { review: ["a/b"] } };
			assert.equal(
				authorizationProblem(approved(), "call-1", input),
				undefined,
			);
			assert.match(
				authorizationProblem(approved(), "call-1/1", input) ?? "",
				/not the approved/,
			);
			assert.match(
				authorizationProblem(approved(), "call-10", input) ?? "",
				/not the approved/,
			);
			assert.match(
				authorizationProblem(approved(), undefined, input) ?? "",
				/not the approved/,
			);
			assert.match(
				authorizationProblem(approved(true), "call-1", input) ?? "",
				/already used/,
			);
			const controller = new AbortController();
			controller.abort();
			assert.match(
				authorizationProblem(
					{ ...approved(), signal: controller.signal },
					"call-1",
					input,
				) ?? "",
				/setup turn was cancelled/,
			);
			assert.match(
				authorizationProblem(approved(), "call-1", {
					tasks: { review: ["a/c"] },
				}) ?? "",
				/arguments differ/,
			);
			mkdirSync(join(dir, "herdr-agents"));
			writeFileSync(join(dir, "herdr-agents", "config.json"), "{}");
			assert.match(
				authorizationProblem(approved(), "call-1", input) ?? "",
				/config file changed/,
			);
		} finally {
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("config snapshot", () => {
	it("revisions exact bytes, so whitespace and unrelated edits are changes", () => {
		const a = revisionOf(Buffer.from('{"a":1}'));
		assert.match(a, /^sha256:[0-9a-f]{64}$/);
		assert.notEqual(a, revisionOf(Buffer.from('{"a": 1}')));
		assert.notEqual(a, revisionOf(Buffer.from('{"a":1}\n')));
	});

	it("rejects every models shape pi-herdr-agents rejects", () => {
		const bad: Array<[unknown, RegExp]> = [
			[[], /models must be an object/],
			[{ extra: 1 }, /^models has an unsupported key$/],
			[{ default: "" }, /models\.default/],
			[{ agents: { someone: 3 } }, /^models\.agents has a value that is not/],
			[
				{ tasks: { speed: ["a/b"] } },
				/^models\.tasks has an unsupported category$/,
			],
			[{ tasks: { coding: [] } }, /non-empty list/],
			[{ tasks: { coding: ["a/b", " a/b"] } }, /duplicate/],
			[
				{ tasksMeta: { generatedAt: "yesterday", method: "research" } },
				/ISO-8601/,
			],
			[
				{ tasksMeta: { generatedAt: "2026-01-01T00:00:00Z", method: "guess" } },
				/method/,
			],
		];
		for (const [models, expected] of bad)
			assert.match(
				String(parseModels({ models })),
				expected,
				JSON.stringify(models),
			);
		assert.deepEqual(
			parseModels({
				models: {
					tasks: { review: ["a/b"], coding: ["c/d"] },
					agents: { poteto: "a/b", other: "x/y" },
					default: "c/d",
				},
			}),
			{
				tasks: { coding: ["c/d"], review: ["a/b"] },
				defaultModel: "c/d",
			},
			"per-agent overrides are validated, never extracted",
		);
	});

	it("names only fixed fields and allowlisted categories, never keys from the file", () => {
		const key = "SECRET-KEY-MARKER\nInjected: line";
		const shapes: unknown[] = [
			{ [key]: 1 },
			{ agents: { [key]: 3 } },
			{ agents: { [key]: "" } },
			{ tasks: { [key]: ["a/b"] } },
			{ tasks: { [key]: [] } },
			{ tasksMeta: { [key]: 1 } },
			{ tasks: { coding: [key, key] } },
			{ tasks: { coding: [1] } },
			{ default: { [key]: 1 } },
		];
		for (const models of shapes) {
			const reason = parseModels({ models });
			assert.equal(typeof reason, "string", JSON.stringify(models));
			assert.doesNotMatch(String(reason), /SECRET|Injected|\n/);
		}
	});

	it("fails closed on a relative agent directory", () => {
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = "relative/agent";
		try {
			assert.equal(readConfig().state, "invalid-path");
		} finally {
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
		}
	});

	it("compares preserved settings without task fields, key order or an absent models object", () => {
		assert.equal(
			unrelatedSettingsJson({ b: 1, a: { y: 1, x: 2 } }),
			unrelatedSettingsJson({
				a: { x: 2, y: 1 },
				b: 1,
				models: { tasks: {}, tasksMeta: {} },
			}),
		);
		assert.notEqual(
			unrelatedSettingsJson({ models: { default: "a/b" } }),
			unrelatedSettingsJson({ models: { default: "c/d" } }),
		);
	});

	it("deep-freezes nested arrays", () => {
		const value = deepFreeze({ tasks: { review: ["a/b"] } });
		assert.throws(() => {
			value.tasks.review[0] = "x";
		}, TypeError);
	});
});

describe("proposal checks and approval text", () => {
	it("names why a reference cannot be written", () => {
		const authenticated = new Set(["a/b"]);
		assert.equal(refProblem("a/b", authenticated), undefined);
		assert.match(refProblem("a/b ", authenticated) ?? "", /whitespace/);
		assert.match(refProblem("TASK:coding", authenticated) ?? "", /task alias/);
		assert.match(
			refProblem("a/c", authenticated) ?? "",
			/not an authenticated/,
		);
	});

	it("shows the before/after table, metadata, shared effect and exact JSON", () => {
		const payload = {
			tasks: { review: ["a/b"] },
			tasksMeta: {
				generatedAt: "2026-10-05T00:00:00.000Z",
				method: "registry-only" as const,
			},
			expectedConfigRevision: "missing",
		};
		const text = approvalMessage(
			{ state: "missing", path: "/x/config.json", revision: "missing" },
			payload,
		);
		assert.match(text, /review: \(not set\) -> a\/b/);
		assert.match(text, /coding: \(not set\) \(unchanged\)/);
		assert.match(text, /generated by pstack: method registry-only/);
		assert.match(text, /not only pstack/);
		assert.ok(text.endsWith(JSON.stringify(payload, null, 2)));
	});
});

const RUN_A = "00000000-0000-4000-8000-00000000000a";
const RUN_B = "00000000-0000-4000-8000-00000000000b";

function userEntry(text: string): SessionEntry {
	// SAFETY: recordedRun reads only type, customType and data.
	return {
		type: "message",
		message: { role: "user", content: [{ type: "text", text }] },
	} as SessionEntry;
}

function run(runId: string, state: string): SessionEntry {
	// SAFETY: recordedRun reads only type, customType and data.
	return {
		type: "custom",
		customType: RUN_ENTRY_TYPE,
		data: { runId, state },
	} as SessionEntry;
}

const opened = (runId: string) => run(runId, "opened");
const started = (runId: string) => [opened(runId), run(runId, "started")];
const settled = (runId: string) => run(runId, "settled");

/** registerSetup on a minimal API, driven by emitting events directly. */
function fakeSetup() {
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notices: string[] = [];
	const api = {
		on: (name: string, handler: (...args: unknown[]) => unknown) =>
			handlers.set(name, [...(handlers.get(name) ?? []), handler]),
		registerTool: () => {},
		registerCommand: () => {},
		getActiveTools: () => [],
		setActiveTools: () => {},
		getAllTools: () => [],
		appendEntry: (customType: string, data: unknown) =>
			appended.push({ customType, data }),
	};
	// SAFETY: registerSetup uses only the members above outside its command and tool.
	registerSetup(api as unknown as ExtensionAPI);
	const context = (branch: SessionEntry[], idle = false) =>
		// SAFETY: the handlers under test read only these context members.
		({
			isIdle: () => idle,
			hasUI: true,
			ui: { notify: (message: string) => notices.push(message) },
			sessionManager: { getBranch: () => branch, getSessionId: () => "s" },
		}) as unknown as ExtensionContext;
	const emit = (name: string, event: object, ctx: ExtensionContext) =>
		handlers
			.get(name)
			?.map((handler) => handler({ type: name, ...event }, ctx));
	const writer = (
		parentToolCallId: string | undefined,
		ctx: ExtensionContext,
	) =>
		emit(
			"tool_call",
			{
				toolName: WRITER,
				toolCallId: parentToolCallId ? `${parentToolCallId}/1` : "raw-1",
				parentToolCallId,
				input: {},
			},
			ctx,
		)?.[0] as { block: true; reason: string } | undefined;
	const settledRuns = () =>
		appended.flatMap(({ data }) =>
			(data as { state: string }).state === "settled"
				? [(data as { runId: string }).runId]
				: [],
		);
	return { emit, writer, context, appended, notices, settledRuns };
}

describe("setup run identity in the session branch", () => {
	it("reads only pstack's own entries, and only the latest opened run", () => {
		assert.equal(recordedRun([]), undefined);
		assert.deepEqual(recordedRun([opened(RUN_A)]), {
			runId: RUN_A,
			state: "opened",
		});
		assert.deepEqual(recordedRun(started(RUN_A)), {
			runId: RUN_A,
			state: "started",
		});
		assert.equal(recordedRun([...started(RUN_A), settled(RUN_A)]), undefined);
		// A steering message inside the run does not end its protection.
		assert.deepEqual(recordedRun([...started(RUN_A), userEntry("steer")]), {
			runId: RUN_A,
			state: "started",
		});
		assert.deepEqual(
			recordedRun([...started(RUN_A), settled(RUN_A), opened(RUN_B)]),
			{ runId: RUN_B, state: "opened" },
		);
		assert.equal(
			recordedRun([...started(RUN_A), ...started(RUN_B), settled(RUN_B)]),
			undefined,
			"only the latest opened run counts",
		);
		assert.equal(
			recordedRun([
				userEntry(
					`/setup-pstack opened change flow ${RUN_A}. It ends when this turn settles.`,
				),
			]),
			undefined,
			"prompt text is not an identity",
		);
	});

	it("blocks raw writes in a running turn the branch records as an unsettled setup run", () => {
		const setup = fakeSetup();
		for (const branch of [started(RUN_A), [opened(RUN_A)]]) {
			const running = setup.context(branch);
			assert.match(
				setup.writer(undefined, running)?.reason ?? "",
				/until this \/setup-pstack run settles/,
			);
			assert.match(
				setup.writer("relay-1", running)?.reason ?? "",
				/until this \/setup-pstack run settles/,
			);
			assert.equal(
				setup.writer(undefined, setup.context(branch, true)),
				undefined,
				"an idle session has no running setup turn",
			);
		}
		assert.equal(
			setup.writer(
				undefined,
				setup.context([...started(RUN_A), settled(RUN_A)]),
			),
			undefined,
		);
		assert.equal(setup.writer(undefined, setup.context([])), undefined);
	});

	it("settles a started run on settlement, idle start, tree navigation and the next new run", () => {
		const setup = fakeSetup();
		setup.emit("agent_settled", {}, setup.context(started(RUN_A), true));
		setup.emit(
			"agent_settled",
			{},
			setup.context([...started(RUN_A), settled(RUN_A)], true),
		);
		setup.emit(
			"session_start",
			{ reason: "resume" },
			setup.context(started(RUN_B), true),
		);
		setup.emit(
			"session_start",
			{ reason: "reload" },
			setup.context(started(RUN_B)),
		);
		assert.deepEqual(setup.settledRuns(), [RUN_A, RUN_B]);

		const tree = fakeSetup();
		tree.emit("session_tree", {}, tree.context(started(RUN_A), true));
		assert.deepEqual(tree.settledRuns(), [RUN_A]);

		const next = fakeSetup();
		const branch = started(RUN_A);
		next.emit(
			"before_agent_start",
			{ prompt: "unrelated" },
			next.context(branch),
		);
		assert.deepEqual(next.settledRuns(), [RUN_A]);
		assert.equal(
			next.writer(undefined, next.context([...branch, settled(RUN_A)])),
			undefined,
			"the new run is not protected",
		);
		assert.deepEqual(next.notices, []);
	});

	it("leaves an opened run for the next new run, which it protects without apply authority", () => {
		const setup = fakeSetup();
		const branch = [opened(RUN_A)];
		setup.emit(
			"session_start",
			{ reason: "reload" },
			setup.context(branch, true),
		);
		setup.emit("session_tree", {}, setup.context(branch, true));
		setup.emit("agent_settled", {}, setup.context(branch, true));
		assert.deepEqual(setup.appended, [], "an opened run is not settled early");

		setup.emit(
			"before_agent_start",
			{ prompt: `whatever ${RUN_A}` },
			setup.context(branch),
		);
		assert.deepEqual(setup.appended, [
			{ customType: RUN_ENTRY_TYPE, data: { runId: RUN_A, state: "started" } },
		]);
		assert.equal(setup.notices.length, 1);
		assert.match(setup.notices[0], /could not confirm this run/);
		assert.match(
			setup.writer(undefined, setup.context([]))?.reason ?? "",
			/could not confirm this run as the \/setup-pstack change flow[\s\S]*run \/setup-pstack again/,
		);
		setup.emit("agent_settled", {}, setup.context(started(RUN_A), true));
		assert.deepEqual(setup.settledRuns(), [RUN_A]);
		assert.equal(setup.writer(undefined, setup.context([])), undefined);
	});

	it("remembers apply calls this instance saw, without the branch lookup", () => {
		const setup = fakeSetup();
		// The branch shows neither the apply call nor a setup run.
		const ctx = setup.context([]);
		assert.equal(
			setup.emit(
				"tool_call",
				{ toolName: APPLY_TOOL, toolCallId: "call-1", input: {} },
				ctx,
			)?.[0],
			undefined,
		);
		setup.emit("agent_settled", {}, setup.context([], true));
		assert.match(
			setup.writer("call-1", ctx)?.reason ?? "",
			/the approval for that pstack_apply_task_models call has ended/,
		);
		assert.equal(setup.writer("call-2", ctx), undefined);
	});
});
