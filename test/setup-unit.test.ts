import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	createEventBus,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ToolDefinition,
	type ToolInfo,
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
	buildReport,
	INIT_APPROVAL_EVENT,
	INIT_START_EVENT,
	parseBasis,
	refProblem,
	registerSetup,
	WRITER,
	WRITER_POINTER,
	writerAcceptsBasis,
	writerContract,
} from "../pi-extension/pstack/setup.ts";
import { ownedSkillFile } from "../pi-extension/pstack/resources.ts";

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
			assert.match(
				authorizationProblem(approved(), "call-1", {
					...input,
					expectedConfigRevision: "missing",
				}) ?? "",
				/arguments differ/,
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
			[
				{ default: "task:coding" },
				/^models\.default cannot use task: references$/,
			],
			[
				{ default: " TaSk:coding " },
				/^models\.default cannot use task: references$/,
			],
			[{ agents: { someone: 3 } }, /^models\.agents has a value that is not/],
			[
				{ agents: { someone: "task:review" } },
				/^models\.agents cannot use task: references$/,
			],
			[
				{ agents: { someone: " TASK:review " } },
				/^models\.agents cannot use task: references$/,
			],
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
			{ agents: { [key]: `task:${key}` } },
			{ default: `task:${key}` },
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

/** Enough of the extension API for `buildReport` to reach the findings section. */
function reportPi(): ExtensionAPI {
	return {
		getAllTools: () => [],
		getActiveTools: () => [],
		getCommands: () => [],
	} as unknown as ExtensionAPI;
}

function reportCtx(): ExtensionContext {
	return {
		mode: "print",
		hasUI: false,
		modelRegistry: {
			getAll: () => [{ provider: "faux", id: "faux-1" }],
			hasConfiguredAuth: () => true,
		},
	} as unknown as ExtensionContext;
}

describe("methodology category findings", () => {
	it("reports an unset architecture category, and not qa", () => {
		const previous = process.env.PI_CODING_AGENT_DIR;
		const dir = mkdtempSync(join(tmpdir(), "pi-herdr-pstack-report-"));
		process.env.PI_CODING_AGENT_DIR = dir;
		try {
			mkdirSync(join(dir, "herdr-agents"));
			const config = join(dir, "herdr-agents", "config.json");
			const tasks = {
				coding: ["faux/faux-1"],
				recon: ["faux/faux-1"],
				review: ["faux/faux-1"],
			};
			const models = {
				tasks,
				tasksMeta: {
					generatedAt: "2026-01-01T00:00:00Z",
					method: "research",
				},
			};
			writeFileSync(
				config,
				JSON.stringify({ status: { enabled: true }, models }),
			);
			const unset = buildReport(reportPi(), reportCtx()).text;
			assert.match(unset, /tasks\.architecture is not set/);
			assert.doesNotMatch(unset, /tasks\.qa is not set/);
			assert.doesNotMatch(unset, /tasks\.coding is not set/);
			writeFileSync(
				config,
				JSON.stringify({
					status: { enabled: true },
					models: {
						...models,
						tasks: { ...tasks, architecture: ["faux/faux-1"] },
					},
				}),
			);
			assert.doesNotMatch(
				buildReport(reportPi(), reportCtx()).text,
				/tasks\.architecture is not set/,
			);
		} finally {
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			rmSync(dir, { recursive: true, force: true });
		}
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

type Decision = { block: true; reason: string } | undefined;
type WriterInput = Record<string, unknown>;

const CONDITIONAL_WRITER = {
	name: WRITER,
	parameters: Type.Object({
		tasks: TASKS,
		tasksMeta: META,
		expectedConfigRevision: Type.Optional(
			Type.Union([
				Type.Literal("missing"),
				Type.String({ pattern: "^sha256:[0-9a-f]{64}$" }),
			]),
		),
	}),
	sourceInfo: { source: "test", path: "/test/writer.ts" },
} as unknown as ToolInfo;

/** The conditional writer plus pi-herdr-agents' optional ranking `basis`. */
const BASIS_WRITER = {
	...CONDITIONAL_WRITER,
	parameters: Type.Object({
		tasks: TASKS,
		tasksMeta: META,
		expectedConfigRevision: Type.Optional(
			Type.Union([
				Type.Literal("missing"),
				Type.String({ pattern: "^sha256:[0-9a-f]{64}$" }),
			]),
		),
		basis: Type.Optional(
			Type.Union([
				Type.Object({ kind: Type.Literal("registry-only") }),
				Type.Object({
					kind: Type.Literal("research"),
					sources: Type.Array(Type.Object({})),
					uncertainty: Type.String(),
				}),
			]),
		),
	}),
} as unknown as ToolInfo;

const REVIEW = { changes: { review: ["a/b"] } };

/**
 * registerSetup on a minimal in-memory API: the real command, apply tool,
 * guard and init listener on Pi's real event bus, with a missing config file,
 * authenticated `models` (default a/b) and a dialog. `ctx.executeTool` runs
 * `before`, then the apply call's own nested `tool_call` (unless
 * `skipNested`), then `after`, and returns a failed outcome so the apply call
 * reports the unchanged file.
 */
function gate(
	options: {
		confirm?: () => boolean;
		before?: (payload: WriterInput, signal?: AbortSignal) => void;
		after?: (payload: WriterInput) => void;
		skipNested?: boolean;
		writerTool?: ToolInfo;
		models?: string[];
		/** Stands in for Pi's sendUserMessage, which can throw synchronously. */
		submit?: () => void;
	} = {},
) {
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	let tool: ToolDefinition | undefined;
	let command:
		| ((args: string, ctx: ExtensionCommandContext) => Promise<void>)
		| undefined;
	let active = [WRITER];
	let calls = 0;
	const nested: Decision[] = [];
	const messages: string[] = [];
	const dialogs: string[] = [];
	let payload: WriterInput | undefined;
	const writerTool = options.writerTool ?? CONDITIONAL_WRITER;
	const registered = () =>
		(options.models ?? ["a/b"]).map((ref) => {
			const [provider, id] = ref.split("/");
			return { provider, id };
		});
	const events = createEventBus();
	const api = {
		events,
		on: (name: string, handler: (...args: unknown[]) => unknown) =>
			handlers.set(name, [...(handlers.get(name) ?? []), handler]),
		registerTool: (definition: ToolDefinition) => {
			tool = definition;
		},
		registerCommand: (
			name: string,
			options: { handler: NonNullable<typeof command> },
		) => {
			if (name === "setup-pstack") command = options.handler;
		},
		getActiveTools: () => active,
		setActiveTools: (names: string[]) => {
			active = names;
		},
		getAllTools: () => [writerTool],
		getCommands: () => [
			{
				name: "skill:setup-pstack",
				source: "skill",
				sourceInfo: { path: ownedSkillFile("setup-pstack") },
			},
		],
		sendMessage: (message: { content: string }) => {
			messages.push(message.content);
		},
		sendUserMessage: () => options.submit?.(),
	};
	// SAFETY: registerSetup uses only the members above.
	registerSetup(api as unknown as ExtensionAPI);
	const emit = (name: string, event: object = {}) =>
		handlers
			.get(name)
			?.map((handler) => handler({ type: name, ...event }, ctx));
	const writer = (parentToolCallId: string | undefined, input: unknown) => {
		calls += 1;
		return emit("tool_call", {
			toolName: WRITER,
			toolCallId: `writer-${calls}`,
			parentToolCallId,
			input,
		})?.[0] as Decision;
	};
	let applyId = "";
	const ctx = {
		mode: "rpc",
		hasUI: true,
		isIdle: () => true,
		hasPendingMessages: () => false,
		model: { provider: "a", id: "b" } as
			| { provider: string; id: string }
			| undefined,
		ui: {
			notify: (message: string) => {
				messages.push(message);
			},
			confirm: async (_title: string, message: string) => {
				dialogs.push(message);
				return options.confirm?.() ?? true;
			},
		},
		sessionManager: { getSessionId: () => "session-1" },
		modelRegistry: {
			getAll: () => registered(),
			hasConfiguredAuth: () => true,
			getAvailable: () => registered(),
		},
		tools: [writerTool],
		executeTool: async (
			_name: string,
			input: WriterInput,
			{ signal }: { signal?: AbortSignal } = {},
		) => {
			payload = input;
			options.before?.(input, signal);
			if (!options.skipNested) nested.push(writer(applyId, input));
			options.after?.(input);
			return {
				isError: true,
				result: { content: [{ type: "text", text: "test outcome" }] },
			};
		},
	};
	/** Runs `/setup-pstack <args>` with this context. */
	async function run(args: string) {
		// SAFETY: the command reads only the context members above.
		await command?.(args, ctx as unknown as ExtensionCommandContext);
	}
	/** Pi's events for a submitted prompt that passes preflight and starts. */
	function startPrompt() {
		emit("input", { source: "extension" });
		emit("before_agent_start");
		emit("agent_start");
	}
	/** Runs `/setup-pstack review` and starts its turn. */
	async function open() {
		await run("review");
		startPrompt();
	}
	/** Lets the model call the apply tool once, in whatever flow is open. */
	async function propose(
		input: object = REVIEW,
		id = "apply-1",
		signal?: AbortSignal,
	) {
		const decision = emit("tool_call", {
			toolName: APPLY_TOOL,
			toolCallId: id,
			input,
		})?.[0];
		assert.equal(decision, undefined, "a direct apply call is allowed");
		applyId = id;
		try {
			const result = await tool?.execute(
				id,
				input as never,
				signal,
				undefined,
				ctx as never,
			);
			const [first] = result?.content ?? [];
			return first?.type === "text" ? first.text : "";
		} catch (error) {
			return String(error);
		}
	}
	/** Opens a window and lets the model apply once. */
	async function apply(id = "apply-1", signal?: AbortSignal) {
		await open();
		return propose(REVIEW, id, signal);
	}
	return {
		run,
		open,
		startPrompt,
		propose,
		apply,
		emit,
		events,
		writer,
		nested,
		messages,
		dialogs,
		ctx,
		payload: () => payload as WriterInput,
		active: () => active,
	};
}

describe("unconditional writer gate", () => {
	const previous = {
		dir: process.env.PI_CODING_AGENT_DIR,
		child: process.env.PI_SUBAGENT_ID,
	};
	let dir = "";
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-herdr-pstack-gate-"));
		process.env.PI_CODING_AGENT_DIR = dir;
		delete process.env.PI_SUBAGENT_ID;
	});
	afterEach(() => {
		for (const [key, value] of [
			["PI_CODING_AGENT_DIR", previous.dir],
			["PI_SUBAGENT_ID", previous.child],
		] as const)
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		rmSync(dir, { recursive: true, force: true });
	});

	const BLOCKED = /^pi-herdr-pstack blocked subagents_write_task_models: /;
	const NONE = /no approved \/setup-pstack write is in progress/;

	it("blocks direct, relayed and apply-parented writes while no approval is live", async () => {
		const setup = gate({ confirm: () => false });
		const input = { tasks: { review: ["a/b"] } };
		for (const parent of [undefined, "relay-1", "apply-1"]) {
			const decision = setup.writer(parent, input);
			assert.match(decision?.reason ?? "", BLOCKED);
			assert.match(decision?.reason ?? "", NONE);
			assert.ok(decision?.reason.endsWith(WRITER_POINTER));
		}
		assert.match(WRITER_POINTER, /\/setup-pstack <request>/);
		assert.match(WRITER_POINTER, /\/subagents-init/);
		// An open window or a declined dialog authorizes nothing.
		assert.match(
			await setup.apply(),
			/declined or the approval dialog timed out\. Nothing was written/,
		);
		assert.match(setup.writer("apply-1", input)?.reason ?? "", NONE);
		assert.deepEqual(setup.nested, [], "a declined apply never dispatches");
	});

	it("passes only the approved call's exact nested write, once, and freezes it", async () => {
		const attempts: Array<[string, Decision]> = [];
		const setup = gate({
			before: (payload) => {
				const other = {
					...payload,
					expectedConfigRevision: `sha256:${"0".repeat(64)}`,
				};
				for (const [label, parent, input] of [
					["direct", undefined, payload],
					["relay", "relay-1", payload],
					["relay beneath the apply call", "apply-1/relay", payload],
					["parent prefix", "apply-", payload],
					["sibling", "apply-2", payload],
					["longer sibling", "apply-10", payload],
					[
						"changed tasks",
						"apply-1",
						{ ...payload, tasks: { review: ["a/c"] } },
					],
					["changed revision", "apply-1", other],
				] as const)
					attempts.push([label, setup.writer(parent, input)]);
			},
			after: (payload) => {
				attempts.push(["second call", setup.writer("apply-1", payload)]);
			},
		});
		assert.match(await setup.apply(), /reported an error: test outcome/);
		for (const [label, decision] of attempts.slice(0, 6))
			assert.match(
				decision?.reason ?? "",
				/not the approved pstack_apply_task_models call's direct nested write/,
				label,
			);
		for (const [label, decision] of attempts.slice(6, 8))
			assert.match(decision?.reason ?? "", /arguments differ/, label);
		assert.deepEqual(setup.nested, [undefined], "the approved write passes");
		assert.ok(Object.isFrozen(setup.payload()));
		assert.ok(Object.isFrozen(setup.payload().tasks));
		assert.match(attempts[8][1]?.reason ?? "", /already used/);
		assert.match(setup.writer("apply-1", setup.payload())?.reason ?? "", NONE);
	});

	it("clears the approval when the nested dispatch returns without using it", async () => {
		const setup = gate({ skipNested: true });
		assert.match(await setup.apply(), /unchanged/);
		assert.match(setup.writer("apply-1", setup.payload())?.reason ?? "", NONE);
	});

	it("clears the approval when the turn is aborted", async () => {
		const controller = new AbortController();
		const setup = gate({ before: () => controller.abort() });
		await setup.apply("apply-1", controller.signal);
		assert.match(setup.nested[0]?.reason ?? "", NONE);
	});

	for (const reason of ["new", "resume", "fork", "reload", "quit"])
		it(`clears the approval at session_shutdown (${reason})`, async () => {
			let setup: ReturnType<typeof gate> | undefined;
			setup = gate({
				before: () => setup?.emit("session_shutdown", { reason }),
			});
			await setup.apply();
			assert.match(setup.nested[0]?.reason ?? "", NONE);
		});

	it("refuses the apply tool from another tool and closes the window at settlement", async () => {
		const setup = gate({ confirm: () => false });
		const relayed = setup.emit("tool_call", {
			toolName: APPLY_TOOL,
			toolCallId: "apply-1",
			parentToolCallId: "relay-1",
			input: {},
		})?.[0] as Decision;
		assert.match(relayed?.reason ?? "", /must be called directly by the model/);
		await setup.open();
		assert.equal(setup.active().includes(APPLY_TOOL), true);
		setup.emit("agent_settled");
		assert.equal(setup.active().includes(APPLY_TOOL), false);
		await setup.open();
		await setup.apply();
		assert.equal(setup.active().includes(APPLY_TOOL), false, "one dialog");
	});

	it("closes a window whose prompt never started before another prompt or run can use it", async () => {
		const NO_FLOW = /No open \/setup-pstack change flow/;
		const cases: Array<[string, Array<[string, object?]>]> = [
			[
				"preflight rejected it, then the user typed",
				[
					["input", { source: "extension" }],
					["input", { source: "interactive" }],
				],
			],
			[
				"preflight rejected it, then another extension prompted",
				[
					["input", { source: "extension" }],
					["input", { source: "extension" }],
				],
			],
			["another prompt's input came first", [["input", { source: "rpc" }]]],
			["a run started without any prompt", [["agent_start"]]],
			[
				"an input handler consumed it, then a custom message ran",
				[["input", { source: "extension" }], ["agent_start"]],
			],
			[
				"a prompt reached before_agent_start out of order",
				[["before_agent_start"]],
			],
		];
		for (const [label, events] of cases) {
			const setup = gate();
			await setup.run("review");
			assert.equal(setup.active().includes(APPLY_TOOL), true, label);
			for (const [name, event] of events) setup.emit(name, event);
			assert.equal(setup.active().includes(APPLY_TOOL), false, label);
			// The next run that does start is not the window's run either.
			setup.startPrompt();
			assert.match(await setup.propose(), NO_FLOW, label);
			assert.deepEqual(setup.dialogs, [], label);
		}
	});

	it("keeps the window for steering input during its own run", async () => {
		const setup = gate({ confirm: () => false });
		await setup.open();
		setup.emit("input", { source: "interactive" });
		setup.emit("agent_start");
		assert.match(await setup.propose(), /declined/);
		assert.equal(setup.dialogs.length, 1);
	});

	it("opens nothing without a selected model and closes the window when Pi refuses the prompt", async () => {
		const unselected = gate();
		unselected.ctx.model = undefined;
		await unselected.run("review");
		assert.deepEqual(unselected.messages, [
			"Setup change not started: no model is selected, so Pi cannot run the prompt. Select a model, then retry.",
		]);
		assert.equal(unselected.active().includes(APPLY_TOOL), false);

		const refused = gate({
			submit: () => {
				throw new Error("stale extension context");
			},
		});
		await assert.rejects(refused.run("review"), /stale extension context/);
		assert.equal(refused.active().includes(APPLY_TOOL), false);
		refused.startPrompt();
		assert.match(await refused.propose(), /No open \/setup-pstack change flow/);
	});
});

const RESEARCH = {
	kind: "research",
	sources: [
		{ url: "https://vendor.example/a", influence: "coding: ranks a/b first" },
	],
	uncertainty: "vendor-reported results only",
};

describe("ranking basis", () => {
	it("defaults to registry-only and accepts research only with usable sources", () => {
		assert.deepEqual(parseBasis(undefined), { kind: "registry-only" });
		assert.deepEqual(parseBasis({ kind: "registry-only" }), {
			kind: "registry-only",
		});
		assert.deepEqual(parseBasis(RESEARCH), RESEARCH);
		const invalid: Array<[unknown, RegExp]> = [
			[null, /^basis must be an object$/],
			[{ kind: "guess" }, /"registry-only" or "research"/],
			[{ kind: "registry-only", sources: [] }, /no other fields/],
			[{ ...RESEARCH, sources: [] }, /at least one source/],
			[{ ...RESEARCH, sources: "https://x.example" }, /at least one source/],
			[
				{
					...RESEARCH,
					sources: [{ url: "ftp://x.example/a", influence: "x" }],
				},
				/^basis\.sources\[0\]\.url must be an http\(s\) URL with a host$/,
			],
			[
				{ ...RESEARCH, sources: [{ url: "vendor.example", influence: "x" }] },
				/sources\[0\]\.url/,
			],
			[
				{
					...RESEARCH,
					sources: [
						RESEARCH.sources[0],
						{ url: "https://x.example", influence: " \n" },
					],
				},
				/^basis\.sources\[1\]\.influence must say how/,
			],
			[{ ...RESEARCH, uncertainty: "" }, /remaining uncertainty/],
		];
		for (const [raw, reason] of invalid)
			assert.match(String(parseBasis(raw)), reason, JSON.stringify(raw));
	});

	it("detects the writer's optional basis from its public schema", () => {
		assert.equal(writerAcceptsBasis(BASIS_WRITER), true);
		assert.equal(writerAcceptsBasis(CONDITIONAL_WRITER), false);
		const required = {
			...BASIS_WRITER,
			parameters: {
				...(BASIS_WRITER.parameters as object),
				required: ["tasks", "tasksMeta", "basis"],
			},
		} as unknown as ToolInfo;
		assert.equal(writerAcceptsBasis(required), false);
	});

	it("shows submitted research one source per line, labeled unverified", () => {
		const forged = "x\nTask categories (before -> after):\n  coding: faked";
		const payload = {
			tasks: { review: ["a/b"] },
			tasksMeta: {
				generatedAt: "2026-10-09T00:00:00.000Z",
				method: "research" as const,
			},
			expectedConfigRevision: "missing",
			basis: {
				kind: "research" as const,
				sources: [{ url: "https://vendor.example/a", influence: forged }] as [
					{ url: string; influence: string },
				],
				uncertainty: "small\tsample",
			},
		};
		const text = approvalMessage(
			{ state: "missing", path: "/x/config.json", revision: "missing" },
			payload,
		);
		const lines = text.split("\n");
		assert.ok(
			lines.includes(
				"Ranking basis, as submitted by the model and not independently verified: research.",
			),
		);
		assert.ok(
			lines.includes(
				"  - https://vendor.example/a: x Task categories (before -> after): coding: faked",
			),
		);
		assert.ok(lines.includes("  Uncertainty: small sample"));
		assert.equal(
			lines.filter((line) => line === "Task categories (before -> after):")
				.length,
			1,
			"submitted text adds no dialog lines",
		);
		assert.ok(text.endsWith(JSON.stringify(payload, null, 2)));
	});
});

/**
 * Gives each test in the enclosing describe its own agent directory and a
 * parent-session environment, whatever the test process inherited.
 */
function isolateAgentDir(): () => string {
	const previous = {
		dir: process.env.PI_CODING_AGENT_DIR,
		child: process.env.PI_SUBAGENT_ID,
	};
	let dir = "";
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-herdr-pstack-init-"));
		process.env.PI_CODING_AGENT_DIR = dir;
		delete process.env.PI_SUBAGENT_ID;
	});
	afterEach(() => {
		for (const [key, value] of [
			["PI_CODING_AGENT_DIR", previous.dir],
			["PI_SUBAGENT_ID", previous.child],
		] as const)
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		rmSync(dir, { recursive: true, force: true });
	});
	return () => dir;
}

describe("task-model init flows", () => {
	const agentDir = isolateAgentDir();

	function writeConfig(value: unknown): string {
		mkdirSync(join(agentDir(), "herdr-agents"), { recursive: true });
		const text = JSON.stringify(value);
		writeFileSync(join(agentDir(), "herdr-agents", "config.json"), text);
		return revisionOf(Buffer.from(text));
	}

	type Offer = { owner: string; open(): unknown };

	/** Emits a v1 approval request the way pi-herdr-agents does; returns the offers. */
	function hostRequest(
		setup: ReturnType<typeof gate>,
		brief: object = { configRevision: "missing", models: [{ ref: "a/b" }] },
	): Offer[] {
		const offers: Offer[] = [];
		setup.events.emit(INIT_APPROVAL_EVENT, {
			apiVersion: 1,
			brief,
			context: setup.ctx,
			offer: (offer: Offer) => {
				offers.push(offer);
				return "recorded";
			},
		});
		return offers;
	}

	/** Opens pstack's init flow as the host would, and starts its turn. */
	function openInit(setup: ReturnType<typeof gate>, brief?: object) {
		const [offer] = hostRequest(setup, brief);
		const opened = offer.open();
		setup.startPrompt();
		return opened;
	}

	it("offers on every v1 request and opens its flow only when the host opens the offer", () => {
		const setup = gate();
		const offers = hostRequest(setup);
		assert.deepEqual(
			offers.map((offer) => offer.owner),
			["pi-herdr-pstack"],
		);
		assert.equal(
			setup.active().includes(APPLY_TOOL),
			false,
			"offering opens nothing",
		);
		const opened = offers[0].open() as {
			kind: string;
			destination: { toolName: string; instructions: string };
		};
		assert.equal(opened.kind, "ready");
		assert.equal(opened.destination.toolName, APPLY_TOOL);
		assert.match(
			opened.destination.instructions,
			/^Propose through pstack_apply_task_models, not subagents_write_task_models/,
		);
		assert.equal(setup.active().includes(APPLY_TOOL), true);

		const other: unknown[] = [];
		setup.events.emit(INIT_APPROVAL_EVENT, {
			apiVersion: 2,
			brief: {},
			context: setup.ctx,
			offer: (offer: unknown) => other.push(offer),
		});
		assert.deepEqual(other, [], "another version is not for pstack");
		const [malformed] = hostRequest(setup, { configRevision: "x", models: [] });
		assert.deepEqual(malformed.open(), {
			kind: "blocked",
			reason:
				"the host's init brief has no usable configRevision or model list",
		});
		assert.equal(
			setup.active().includes(APPLY_TOOL),
			false,
			"opening again first closes the earlier window",
		);
	});

	it("cancels only the flow its own open created", () => {
		type Ready = { kind: "ready"; cancel(): void };
		const setup = gate();
		const first = hostRequest(setup)[0].open() as Ready;
		assert.equal(first.kind, "ready");
		first.cancel();
		assert.equal(setup.active().includes(APPLY_TOOL), false);
		const second = hostRequest(setup)[0].open() as Ready;
		first.cancel();
		assert.equal(
			setup.active().includes(APPLY_TOOL),
			true,
			"a stale cancel leaves a later flow open",
		);
		second.cancel();
		assert.equal(setup.active().includes(APPLY_TOOL), false);
	});

	it("opens, checks and rechecks against the active registry without listing every model", async () => {
		let available = ["a/b", "a/c"];
		let setup: ReturnType<typeof gate> | undefined;
		setup = gate({
			confirm: () => {
				available = ["a/c"];
				return true;
			},
		});
		const registry = {
			getAll: () => assert.fail("init must not list every model"),
			hasConfiguredAuth: () => assert.fail("init must not crawl auth"),
			getAvailable: () =>
				available.map((ref) => {
					const [provider, id] = ref.split("/");
					return { provider, id };
				}),
		};
		setup.ctx.modelRegistry = registry;
		const brief = {
			configRevision: "missing",
			models: [{ ref: "a/b" }, { ref: "a/c" }],
		};
		assert.equal((openInit(setup, brief) as { kind: string }).kind, "ready");
		assert.match(
			await setup.propose(REVIEW),
			/Approval is stale \(model authentication changed during approval\)/,
		);
		assert.equal(setup.dialogs.length, 1, "a/b passed the first check");
		assert.deepEqual(setup.nested, []);

		const again = gate();
		again.ctx.modelRegistry = registry;
		openInit(again, brief);
		assert.match(
			await again.propose(REVIEW),
			/review: a\/b is not an authenticated exact model in the current registry/,
		);
		assert.deepEqual(again.dialogs, []);
	});

	it("refuses to open with the report's blockers, while busy, or after the file moved", () => {
		const cases: Array<
			[(setup: ReturnType<typeof gate>) => void, object, RegExp]
		> = [
			[
				(setup) => {
					setup.ctx.isIdle = () => false;
				},
				{ configRevision: "missing", models: [{ ref: "a/b" }] },
				/^a turn is in progress or messages are queued/,
			],
			[
				(setup) => {
					setup.ctx.hasUI = false;
				},
				{ configRevision: "missing", models: [{ ref: "a/b" }] },
				/cannot show an approval dialog/,
			],
			[
				() => {},
				{
					configRevision: `sha256:${"0".repeat(64)}`,
					models: [{ ref: "a/b" }],
				},
				/^the config file changed after pi-herdr-agents read it for this init; run init again$/,
			],
		];
		for (const [arrange, brief, reason] of cases) {
			const setup = gate();
			arrange(setup);
			const opened = hostRequest(setup, brief)[0].open() as {
				kind: string;
				reason: string;
			};
			assert.equal(opened.kind, "blocked");
			assert.match(opened.reason, reason);
			assert.equal(setup.active().includes(APPLY_TOOL), false);
		}
	});

	it("checks an init proposal against the brief's models, the writer's basis support and the brief's revision", async () => {
		const setup = gate({ models: ["a/b", "a/c"] });
		openInit(setup);
		assert.match(
			await setup.propose({ changes: { review: ["a/c"] } }),
			/review: a\/c is not among the init brief's models/,
		);
		assert.match(
			await setup.propose({ ...REVIEW, basis: RESEARCH }),
			/takes no basis, so it cannot carry research evidence/,
		);
		writeConfig({ status: { enabled: true } });
		assert.match(
			await setup.propose(REVIEW),
			/config file changed after pi-herdr-agents read it for this init \(revision missing\)\. Run \/subagents-init again/,
		);
		assert.deepEqual(
			setup.dialogs,
			[],
			"every rejection comes before a dialog",
		);
		assert.deepEqual(setup.nested, []);
	});

	it("binds a research basis into the one approved payload", async () => {
		const attempts: Decision[] = [];
		let setup: ReturnType<typeof gate> | undefined;
		setup = gate({
			writerTool: BASIS_WRITER,
			before: (payload) => {
				attempts.push(
					setup?.writer("apply-1", {
						...payload,
						basis: { kind: "registry-only" },
					}),
				);
			},
		});
		openInit(setup);
		await setup.propose({ ...REVIEW, basis: RESEARCH });
		const payload = setup.payload();
		assert.deepEqual(payload.basis, RESEARCH);
		assert.deepEqual(
			(payload.tasksMeta as { method: string }).method,
			"research",
		);
		assert.ok(
			Object.isFrozen(RESEARCH) === false && Object.isFrozen(payload.basis),
		);
		assert.equal(setup.dialogs.length, 1);
		assert.match(
			setup.dialogs[0],
			/\n {2}- https:\/\/vendor\.example\/a: coding: ranks a\/b first\n/,
		);
		assert.match(attempts[0]?.reason ?? "", /arguments differ/);
		assert.deepEqual(setup.nested, [undefined], "the exact payload passed");
	});

	it("records registry-only without a basis and reports an unchanged map without refreshing metadata", async () => {
		const setup = gate({ writerTool: BASIS_WRITER });
		openInit(setup);
		await setup.propose(REVIEW);
		assert.deepEqual(setup.payload().basis, { kind: "registry-only" });
		assert.equal(
			(setup.payload().tasksMeta as { method: string }).method,
			"registry-only",
		);

		const same = gate({ writerTool: BASIS_WRITER });
		const revision = writeConfig({
			status: { enabled: true },
			models: {
				tasks: { review: ["a/b"] },
				tasksMeta: { generatedAt: "2026-01-01T00:00:00Z", method: "research" },
			},
		});
		openInit(same, { configRevision: revision, models: [{ ref: "a/b" }] });
		assert.equal(
			await same.propose({ ...REVIEW, basis: RESEARCH }),
			"No change: the proposal equals the current task preferences. Nothing was written, and tasksMeta was not refreshed.",
		);
		assert.deepEqual(same.dialogs, []);
	});
});

describe("/setup-pstack init", () => {
	isolateAgentDir();
	type HostOffer = { owner: string; start(): unknown };
	type StartRequest = {
		apiVersion: number;
		context: unknown;
		preferences: string;
		offer(offer: HostOffer): string;
	};

	it("starts the one host that offers, passing the rest of the line as preferences", async () => {
		const setup = gate();
		const started: StartRequest[] = [];
		setup.events.on(INIT_START_EVENT, (data) => {
			// SAFETY: pstack's own command emits this v1 shape.
			const request = data as StartRequest;
			request.offer({
				owner: "test-host",
				start: () => {
					started.push(request);
					return { kind: "started", destination: APPLY_TOOL };
				},
			});
		});
		await setup.run("init  prefer\ncheap recon ");
		assert.equal(started.length, 1);
		assert.equal(started[0].apiVersion, 1);
		assert.equal(started[0].context, setup.ctx);
		assert.equal(started[0].preferences, "  prefer\ncheap recon");
		assert.deepEqual(setup.messages, []);
		await setup.run("initialize review");
		assert.equal(started.length, 1, '"initialize" is an ordinary request');
		assert.equal(setup.active().includes(APPLY_TOOL), true);
	});

	it("reports instead of starting when no host, several hosts or a failing host answers", async () => {
		const host =
			(owner: string, start: () => unknown) => (request: StartRequest) => {
				request.offer({ owner, start });
			};
		const cases: Array<
			[string, Array<(request: StartRequest) => unknown>, RegExp]
		> = [
			["no host", [], /no loaded pi-herdr-agents accepted the request/],
			[
				"a late offer",
				[
					async (request) => {
						await Promise.resolve();
						request.offer({
							owner: "late",
							start: () => ({ kind: "started" }),
						});
					},
				],
				/no loaded pi-herdr-agents accepted the request/,
			],
			[
				"two hosts",
				[
					host("b-host", () => assert.fail("never started")),
					host("a-host", () => assert.fail("never started")),
				],
				/more than one extension offered to run init \(a-host, b-host\); keep one loaded/,
			],
			[
				"a malformed offer",
				[(request) => request.offer({ owner: "x" } as HostOffer)],
				/an init host answered with an offer without an owner label/,
			],
			[
				"a throwing host",
				[
					host("test-host", () => {
						throw new Error("boom");
					}),
				],
				/test-host failed to start init \(boom\); pstack cannot undo what it changed/,
			],
			[
				"an asynchronous host",
				[host("test-host", () => Promise.reject(new Error("late")))],
				/test-host answered asynchronously, but v1 starts synchronously/,
			],
			[
				"a refusal",
				[
					host("test-host", () => ({
						kind: "not-started",
						reason: "pi-herdr-pstack refused: busy",
					})),
				],
				/^Task-model init not started: pi-herdr-pstack refused: busy\. Nothing was written\.$/,
			],
		];
		for (const [label, listeners, reason] of cases) {
			const setup = gate();
			// SAFETY: pstack's own command emits this v1 shape.
			for (const listener of listeners)
				setup.events.on(INIT_START_EVENT, (data) =>
					listener(data as StartRequest),
				);
			await setup.run("init");
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(setup.messages.length, 1, label);
			assert.match(setup.messages[0], reason, label);
			assert.match(setup.messages[0], /Nothing was written\.$/, label);
			assert.equal(setup.active().includes(APPLY_TOOL), false, label);
		}
	});
});

describe("config lines the poteto-help nudge matches", () => {
	const MISSING_SUFFIX =
		' does not exist (revision "missing"). pi-herdr-agents uses its packaged defaults and no task categories are configured.';
	const PRESENT = / \(revision sha256:[0-9a-f]{64}\)\.$/;
	const skill = readFileSync(
		fileURLToPath(new URL("../skills/poteto-help/SKILL.md", import.meta.url)),
		"utf8",
	);
	const previous = process.env.PI_CODING_AGENT_DIR;
	const subagent = process.env.PI_SUBAGENT_ID;
	const dirs: string[] = [];

	function kind(line: string): "missing" | "present" | "unknown" {
		if (line.endsWith(MISSING_SUFFIX)) return "missing";
		if (PRESENT.test(line)) return "present";
		return "unknown";
	}

	function report(): string {
		delete process.env.PI_SUBAGENT_ID;
		return buildReport(
			{
				getAllTools: () => [],
				getActiveTools: () => [],
				getCommands: () => [],
			} as unknown as ExtensionAPI,
			{
				mode: "print",
				hasUI: false,
				modelRegistry: {
					getAll: () => [{ provider: "provider", id: "model" }],
					hasConfiguredAuth: () => true,
				},
			} as unknown as ExtensionContext,
		).text;
	}

	function configLine(): string {
		const line = report()
			.split("\n")
			.find((entry) => entry.trimStart().startsWith("Config:"));
		assert.ok(line);
		return line;
	}

	afterEach(() => {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		if (subagent === undefined) delete process.env.PI_SUBAGENT_ID;
		else process.env.PI_SUBAGENT_ID = subagent;
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it("classifies real report lines by their ending, not by words in the path", () => {
		const root = mkdtempSync(join(tmpdir(), "pi-herdr-pstack-config-line-"));
		dirs.push(root);
		const hex = "ab".repeat(32);
		const missingDir = join(root, ` (revision sha256:${hex}).`);
		mkdirSync(join(missingDir, "herdr-agents"), { recursive: true });
		process.env.PI_CODING_AGENT_DIR = missingDir;
		const missing = configLine();
		assert.equal(kind(missing), "missing");
		assert.match(missing, /revision sha256:/);
		assert.equal(PRESENT.test(missing), false);

		const presentDir = join(
			root,
			'does not exist (revision "missing"). pi-herdr-agents uses its packaged defaults and no task categories are configured.',
		);
		mkdirSync(join(presentDir, "herdr-agents"), { recursive: true });
		writeFileSync(
			join(presentDir, "herdr-agents", "config.json"),
			JSON.stringify({
				status: { enabled: true },
				models: {
					tasks: {
						coding: [" provider/model "],
						review: ["provider / model"],
					},
				},
			}),
		);
		process.env.PI_CODING_AGENT_DIR = presentDir;
		const text = report();
		const present = text
			.split("\n")
			.find((entry) => entry.trimStart().startsWith("Config:"));
		assert.ok(present);
		assert.equal(kind(present), "present");
		assert.match(present, /does not exist/);
		assert.equal(present.endsWith(MISSING_SUFFIX), false);
		assert.match(text, /coding: \(withheld: not a single printable token\)/);
		assert.match(text, /review: \(withheld: not a single printable token\)/);
		assert.doesNotMatch(text, /coding: \(not set\)/);
		assert.doesNotMatch(text, /review: \(not set\)/);
		assert.match(text, /recon: \(not set\)/);
		assert.match(
			text,
			/tasks\.coding: \(withheld: not a single printable token\) has surrounding whitespace\./,
		);
		assert.match(
			text,
			/tasks\.review: \(withheld: not a single printable token\) is not an authenticated exact model in the current registry\./,
		);

		process.env.PI_CODING_AGENT_DIR = "relative/agent";
		const invalidPath = configLine();
		assert.equal(kind(invalidPath), "unknown");
		assert.match(invalidPath, /cannot be used/);

		const badDir = join(root, "bad");
		mkdirSync(join(badDir, "herdr-agents"), { recursive: true });
		const file = join(badDir, "herdr-agents", "config.json");
		process.env.PI_CODING_AGENT_DIR = badDir;
		const cases: Array<[string, RegExp]> = [
			['{"status":', /is not valid JSON/],
			['["x"]', /root is not an object/],
			['{"models":{}}', /lacks the status object/],
			[
				'{"status":{"enabled":true},"models":{"tasks":{"coding":[]}}}',
				/has an invalid models section/,
			],
		];
		for (const [body, needle] of cases) {
			writeFileSync(file, body);
			const line = configLine();
			assert.equal(kind(line), "unknown", body);
			assert.match(line, needle, body);
		}
	});

	it("pins those endings in poteto-help and does not treat findings as unset", () => {
		assert.ok(skill.includes(MISSING_SUFFIX));
		assert.match(
			skill,
			/ends with ` \(revision sha256:` and 64 lowercase hex digits and `\)\.`/,
		);
		assert.match(skill, /only that exact value is unset/);
		assert.match(skill, /A Finding does not make a category unset/);
		assert.match(skill, /not a reason to tell the user to write config/);
		assert.match(skill, /A comma inside one model id cannot change that/);
		assert.match(
			skill,
			/Surrounding whitespace and spaces around `\/` are findings here and can still launch/,
		);
		assert.doesNotMatch(skill, /every reference/);
		assert.doesNotMatch(skill, /Read `does not exist` before/);
	});
});
