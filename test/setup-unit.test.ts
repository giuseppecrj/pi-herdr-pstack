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
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolDefinition,
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
	buildReport,
	refProblem,
	registerSetup,
	WRITER,
	WRITER_POINTER,
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

/**
 * registerSetup on a minimal in-memory API: the real command, apply tool and
 * guard, with a missing config file, one authenticated model and a dialog.
 * `ctx.executeTool` runs `before`, then the apply call's own nested
 * `tool_call` (unless `skipNested`), then `after`, and returns a failed
 * outcome so the apply call reports the unchanged file.
 */
function gate(
	options: {
		confirm?: () => boolean;
		before?: (payload: WriterInput, signal?: AbortSignal) => void;
		after?: (payload: WriterInput) => void;
		skipNested?: boolean;
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
	let payload: WriterInput | undefined;
	const api = {
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
		getAllTools: () => [CONDITIONAL_WRITER],
		getCommands: () => [
			{
				name: "skill:setup-pstack",
				source: "skill",
				sourceInfo: { path: ownedSkillFile("setup-pstack") },
			},
		],
		sendMessage: () => {},
		sendUserMessage: () => {},
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
		ui: {
			notify: () => {},
			confirm: async () => options.confirm?.() ?? true,
		},
		sessionManager: { getSessionId: () => "session-1" },
		modelRegistry: {
			getAll: () => [{ provider: "a", id: "b" }],
			hasConfiguredAuth: () => true,
		},
		tools: [CONDITIONAL_WRITER],
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
	/** Runs `/setup-pstack review` and starts its turn. */
	async function open() {
		// SAFETY: the command reads only the context members above.
		await command?.("review", ctx as unknown as ExtensionCommandContext);
		emit("agent_start");
	}
	/** Opens a window and lets the model apply once. */
	async function apply(id = "apply-1", signal?: AbortSignal) {
		await open();
		const decision = emit("tool_call", {
			toolName: APPLY_TOOL,
			toolCallId: id,
			input: { changes: { review: ["a/b"] } },
		})?.[0];
		assert.equal(decision, undefined, "a direct apply call is allowed");
		applyId = id;
		try {
			await tool?.execute(
				id,
				{ changes: { review: ["a/b"] } },
				signal,
				undefined,
				ctx as never,
			);
			return "";
		} catch (error) {
			return String(error);
		}
	}
	return {
		open,
		apply,
		emit,
		writer,
		nested,
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
		assert.match(await setup.apply(), /^$/);
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
