import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ToolInfo } from "@earendil-works/pi-coding-agent";
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
	approvalMessage,
	authorizationProblem,
	refProblem,
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
