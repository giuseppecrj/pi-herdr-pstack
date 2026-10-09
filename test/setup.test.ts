import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type {
	ExtensionAPI,
	ExtensionFactory,
	ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import {
	fauxAssistantMessage,
	fauxToolCall,
	type JsonObject,
} from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
	APPLY_TOOL,
	CONFIRM_TIMEOUT_MS,
	REPORT_MESSAGE_TYPE,
	WRITER,
	WRITER_POINTER,
} from "../pi-extension/pstack/setup.ts";
import { configuredHostRoot, PACK_ROOT } from "./helpers/rpc.ts";
import { SdkPi, type SdkOptions } from "./helpers/sdk.ts";

const HOST = configuredHostRoot();
const needsHost = {
	skip:
		HOST === undefined &&
		"set PI_HERDR_AGENTS_HOST=<conditional-writer host root> to run real-writer consent checks",
};

const BASE = {
	status: { enabled: false },
	unrelated: { keep: [1, 2], apiToken: "SECRET-UNRELATED-VALUE" },
	models: {
		default: "faux/faux-1",
		agents: { poteto: "faux/faux-2", other: "elsewhere/other-model" },
		tasks: { coding: ["faux/faux-1"], qa: ["faux/faux-2"] },
		tasksMeta: { generatedAt: "2026-01-01T00:00:00Z", method: "research" },
	},
};
const BASE_TEXT = `${JSON.stringify(BASE, null, 1)}\n`;
const REVIEW_CHANGE = { changes: { review: ["faux/faux-2", "faux/faux-1"] } };

const sha = (bytes: Buffer | string) =>
	`sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function withPi(
	options: SdkOptions,
	run: (pi: SdkPi) => Promise<void>,
): Promise<void> {
	const pi = await SdkPi.start(options);
	try {
		await run(pi);
	} finally {
		pi.dispose();
	}
}

function lastReport(pi: SdkPi): string {
	const message = pi.session.messages.findLast(
		(entry) =>
			entry.role === "custom" && entry.customType === REPORT_MESSAGE_TYPE,
	);
	assert.ok(message, "a setup report message was shown");
	// SAFETY: the setup command sends string content.
	return (message as { content: string }).content;
}

function confirmCalls(pi: SdkPi) {
	return pi.uiCalls.filter((call) => call.method === "confirm");
}

function firstUserText(pi: SdkPi): string {
	const message = pi.session.messages.find((entry) => entry.role === "user");
	assert.ok(message, "a prompt was sent");
	const { content } = message;
	return typeof content === "string"
		? content
		: content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** The text of one user message; negative indexes count from the end. */
function userTextAt(pi: SdkPi, index: number): string {
	const message = pi.session.messages
		.filter((entry) => entry.role === "user")
		.at(index);
	assert.ok(message, "a prompt was sent");
	const { content } = message;
	return typeof content === "string"
		? content
		: content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function initBrief(pi: SdkPi) {
	const json = firstUserText(pi).match(/```json\n([\s\S]*?)\n```/);
	assert.ok(json, "the prompt carries the registry brief");
	return JSON.parse(json[1]);
}

function dialogPayload(pi: SdkPi, index = 0) {
	const [, message] = confirmCalls(pi)[index].args as [string, string];
	const marker = `Exact ${WRITER} arguments:\n`;
	return {
		message,
		payload: JSON.parse(message.slice(message.indexOf(marker) + marker.length)),
	};
}

/** The guard's refusal of a writer call, with its pointer to /setup-pstack. */
const BLOCKED = /pi-herdr-pstack blocked subagents_write_task_models: /;
const NO_APPROVAL = /no approved \/setup-pstack write is in progress/;

function assertBlocked(text: string, reason: RegExp = NO_APPROVAL) {
	assert.match(text, BLOCKED);
	assert.match(text, reason);
	assert.ok(text.includes(WRITER_POINTER), text);
}

/** UI whose confirm dialog records itself and then runs `decide`. */
function dialog(
	decide: (
		message: string,
		options: { signal?: AbortSignal; timeout?: number },
	) => boolean | Promise<boolean>,
	calls: SdkPi[] = [],
): Partial<ExtensionUIContext> {
	return {
		confirm: async (title, message, options = {}) => {
			calls[0]?.uiCalls.push({
				method: "confirm",
				args: [title, message, options],
			});
			return decide(message, options);
		},
	};
}

/** Starts a host session whose dialog decides with `decide`. */
async function withHost(
	decide: Parameters<typeof dialog>[0],
	run: (pi: SdkPi) => Promise<void>,
	options: Partial<SdkOptions> = {},
) {
	const holder: SdkPi[] = [];
	const pi = await SdkPi.start({
		packages: [HOST ?? ""],
		config: BASE_TEXT,
		ui: dialog(decide, holder),
		...options,
	});
	holder.push(pi);
	try {
		await run(pi);
	} finally {
		pi.dispose();
	}
}

const relayTool: ExtensionFactory = (api: ExtensionAPI) => {
	api.registerTool({
		name: "test_relay",
		label: "Test relay",
		description: "Test only: runs another tool with the given arguments.",
		parameters: Type.Object({ tool: Type.String(), args: Type.Any() }),
		async execute(_id, params, signal, _update, ctx) {
			const outcome = await ctx.executeTool(params.tool, params.args, {
				signal,
			});
			return { ...outcome.result, isError: outcome.isError };
		},
	});
};

const oldWriter: ExtensionFactory = (api: ExtensionAPI) => {
	api.registerTool({
		name: WRITER,
		label: "Old writer",
		description: "Test only: the pre-conditional writer schema.",
		parameters: Type.Object({
			tasks: Type.Object({}, { additionalProperties: true }),
			tasksMeta: Type.Object({
				generatedAt: Type.String(),
				method: Type.String(),
			}),
		}),
		async execute() {
			throw new Error("old writer must never run during setup tests");
		},
	});
};

describe("setup report (no write path)", () => {
	it("reports a missing host and stays report-only, even for a change request", async () => {
		await withPi({}, async (pi) => {
			await pi.prompt("/setup-pstack");
			const report = lastReport(pi);
			assert.match(report, /subagent tool: not loaded/);
			assert.match(report, new RegExp(`${WRITER}: not loaded`));
			assert.match(report, /does not exist \(revision "missing"\)/);
			assert.match(report, /packaged config\.json\.example defaults/);
			assert.match(report, /No changes were made\.$/);
			pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
			await pi.prompt("/setup-pstack use faux/faux-2 for review");
			assert.match(
				lastReport(pi),
				/Requested change not started: .*not loaded/,
			);
			assert.equal(existsSync(pi.configPath), false);
			assert.equal(pi.session.getActiveToolNames().includes(APPLY_TOOL), false);
			assert.deepEqual(pi.toolResults(APPLY_TOOL), [], "no model turn started");
		});
	});

	it("keeps an older unconditional writer report-only", async () => {
		await withPi({ extensions: [oldWriter], config: BASE_TEXT }, async (pi) => {
			await pi.prompt("/setup-pstack use faux/faux-2 for review");
			const report = lastReport(pi);
			assert.match(
				report,
				/older unconditional writer without expectedConfigRevision/,
			);
			assert.match(report, /lacks the conditional-write contract/);
			assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
		});
	});

	it("distinguishes unusable config files and never shows their contents", async () => {
		const cases: Array<[string, string, RegExp]> = [
			["malformed", '{"status": SECRET', /is not valid JSON/],
			["invalid-root", '["SECRET"]', /root is not an object/],
			[
				"invalid-status",
				'{"models": {}, "secret": "SECRET"}',
				/lacks the status object/,
			],
			[
				"invalid-models",
				'{"status": {"enabled": true}, "models": {"tasks": {"coding": []}}}',
				/invalid models section: models\.tasks\.coding must be a non-empty list/,
			],
			[
				"unreadable",
				'{"status": {"enabled": true}}',
				/is unreadable \(EACCES\)/,
			],
		];
		for (const [label, text, expected] of cases)
			await withPi({ extensions: [oldWriter], config: text }, async (pi) => {
				if (label === "unreadable") pi.makeConfigUnreadable();
				await pi.prompt("/setup-pstack");
				const report = lastReport(pi);
				assert.match(report, expected, label);
				assert.doesNotMatch(report, /SECRET/, label);
				assert.match(report, new RegExp(`the config file is ${label}`), label);
			});
	});

	it("shows only the task, metadata and default fields of the config, never agent overrides", async () => {
		await withPi({ config: BASE_TEXT }, async (pi) => {
			await pi.prompt("/setup-pstack");
			const report = lastReport(pi);
			assert.match(report, /coding: faux\/faux-1\n {2}review: \(not set\)/);
			assert.match(report, /tasksMeta: research at 2026-01-01T00:00:00Z/);
			assert.match(report, /default model \(models\.default\): faux\/faux-1/);
			assert.match(report, /Roles: none\. Pstack contributes no named roles/);
			assert.match(
				report,
				/explicit subagent model argument, including a task:<category> selector, takes precedence/,
			);
			assert.match(report, new RegExp(`revision ${sha(BASE_TEXT)}`));
			for (const hidden of [
				"SECRET",
				"unrelated",
				"keep",
				"elsewhere",
				"other-model",
				"models.agents",
				"poteto override",
				"role file",
			])
				assert.equal(report.includes(hidden), false, hidden);
		});
	});

	it("never echoes keys or malformed values from the config, even multiline ones", async () => {
		const key = "SECRET-KEY-MARKER\nInjected: line";
		const value = "SECRET-VALUE-MARKER\nInjected: line";
		const invalid: Array<[Record<string, unknown>, RegExp]> = [
			[{ [key]: 1 }, /models has an unsupported key\./],
			[{ tasks: { [key]: ["faux/faux-1"] } }, /unsupported category\./],
			[{ agents: { [key]: 5 } }, /models\.agents has a value that is not/],
			[{ agents: { ok: [value] } }, /models\.agents has a value/],
			[{ tasksMeta: { [key]: 1 } }, /tasksMeta has an unsupported key/],
		];
		for (const [models, expected] of invalid)
			await withPi(
				{ config: JSON.stringify({ status: { enabled: true }, models }) },
				async (pi) => {
					await pi.prompt("/setup-pstack");
					const report = lastReport(pi);
					assert.match(report, expected, JSON.stringify(models));
					assert.doesNotMatch(report, /SECRET|Injected/);
				},
			);
		const valid = JSON.stringify({
			status: { enabled: true },
			models: {
				default: value,
				agents: { [key]: value, poteto: "faux/faux-2" },
				tasks: { coding: [value, "faux/faux-1"] },
			},
		});
		await withPi({ config: valid }, async (pi) => {
			await pi.prompt("/setup-pstack");
			const report = lastReport(pi);
			assert.match(
				report,
				/coding: \(withheld: not a single printable token\), faux\/faux-1/,
			);
			assert.match(
				report,
				/tasks\.coding: \(withheld[^\n]*not an authenticated/,
			);
			assert.doesNotMatch(report, /SECRET|Injected|poteto override/);
		});
	});

	it("is report-only in a subagent and without dialog support", async () => {
		await withPi(
			{ childId: "child-1", extensions: [oldWriter] },
			async (pi) => {
				await pi.prompt("/setup-pstack use faux/faux-2 for review");
				assert.match(
					lastReport(pi),
					/subagent \(PI_SUBAGENT_ID is set\): setup is report-only/,
				);
				assert.match(lastReport(pi), /not started: this is a subagent session/);
			},
		);
		await withPi({ ui: false, extensions: [oldWriter] }, async (pi) => {
			await pi.prompt("/setup-pstack use faux/faux-2 for review");
			assert.match(
				lastReport(pi),
				/this print session cannot show an approval dialog/,
			);
		});
	});

	it("refuses the apply tool outside a flow, even if it is made visible", async () => {
		await withPi({ extensions: [oldWriter] }, async (pi) => {
			pi.session.setActiveToolsByName([
				...pi.session.getActiveToolNames(),
				APPLY_TOOL,
			]);
			pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
			await pi.prompt("/skill:setup-pstack apply review now");
			const [result] = pi.toolResults(APPLY_TOOL);
			assert.equal(result.isError, true);
			assert.match(result.text, /No open \/setup-pstack change flow/);
			assert.deepEqual(confirmCalls(pi), []);
		});
	});
});

describe(
	"setup writes through the real conditional host writer",
	needsHost,
	() => {
		it("shows the complete payload, writes only after approval, verifies the saved file", async () => {
			await withHost(
				() => true,
				async (pi) => {
					await pi.prompt("/setup-pstack");
					assert.match(lastReport(pi), /conditional writes supported/);
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack use faux-2 then faux-1 for review");

					const [call] = confirmCalls(pi);
					const [, message, options] = call.args as [
						string,
						string,
						{ timeout: number },
					];
					assert.equal(options.timeout, CONFIRM_TIMEOUT_MS);
					const payload = JSON.parse(
						message.slice(
							message.indexOf(`Exact ${WRITER} arguments:\n`) +
								`Exact ${WRITER} arguments:\n`.length,
						),
					);
					assert.deepEqual(Object.keys(payload), [
						"tasks",
						"tasksMeta",
						"expectedConfigRevision",
						"basis",
					]);
					assert.deepEqual(payload.basis, { kind: "registry-only" });
					assert.equal(payload.expectedConfigRevision, sha(BASE_TEXT));
					assert.deepEqual(payload.tasks, {
						coding: ["faux/faux-1"],
						review: ["faux/faux-2", "faux/faux-1"],
						qa: ["faux/faux-2"],
					});
					assert.equal(payload.tasksMeta.method, "registry-only");
					assert.match(
						message,
						/review: \(not set\) -> faux\/faux-2, faux\/faux-1/,
					);
					assert.match(message, /coding: faux\/faux-1 \(unchanged\)/);
					assert.match(
						message,
						/used by every workflow and role pack, not only pstack/,
					);
					assert.doesNotMatch(message, /poteto|models\.agents/);

					const saved = readFileSync(pi.configPath);
					const parsed = JSON.parse(saved.toString("utf8"));
					assert.deepEqual(parsed.models.tasks, payload.tasks);
					assert.deepEqual(parsed.models.tasksMeta, payload.tasksMeta);
					assert.deepEqual(parsed.unrelated, BASE.unrelated);
					assert.deepEqual(parsed.status, BASE.status);
					assert.equal(parsed.models.default, BASE.models.default);
					assert.deepEqual(parsed.models.agents, BASE.models.agents);
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, false, result.text);
					assert.ok(
						result.text.includes(`revision ${sha(saved)}`),
						result.text,
					);
					assert.match(result.text, /Verified the saved file\. Reload Pi/);
					assert.equal(
						pi.session.getActiveToolNames().includes(APPLY_TOOL),
						false,
					);
					assert.equal(existsSync(`${pi.configPath}.lock`), false);
				},
			);
		});

		it("discloses default seeding and creates a missing file only after approval", async () => {
			await withHost(
				(message) => {
					assert.match(message, /no file yet \(revision "missing"\)/);
					assert.match(message, /packaged config\.json\.example defaults/);
					assert.match(message, /"expectedConfigRevision": "missing"/);
					return true;
				},
				async (pi) => {
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review models");
					assert.equal(confirmCalls(pi).length, 1);
					const parsed = JSON.parse(readFileSync(pi.configPath, "utf8"));
					assert.deepEqual(parsed.models.tasks, REVIEW_CHANGE.changes);
					assert.equal(typeof parsed.status.enabled, "boolean");
					assert.equal(pi.toolResults(APPLY_TOOL)[0].isError, false);
				},
				{ config: undefined },
			);
		});

		it("writes nothing when the dialog is declined or times out, and closes the flow", async () => {
			// Pi resolves a timed-out confirm as false, like a decline; the finite
			// CONFIRM_TIMEOUT_MS passed to the dialog is asserted in the accept test.
			await withHost(
				() => false,
				async (pi) => {
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					assert.match(
						pi.toolResults(APPLY_TOOL)[0].text,
						/declined or the approval dialog timed out\. Nothing was written/,
					);
					assert.equal(
						pi.session.getActiveToolNames().includes(APPLY_TOOL),
						false,
					);
				},
			);
		});

		it("writes nothing when the turn is aborted during the dialog", async () => {
			let session: SdkPi | undefined;
			await withHost(
				(_message, options) =>
					new Promise<boolean>((resolve) => {
						options.signal?.addEventListener("abort", () => resolve(true));
						void session?.session.abort();
					}),
				async (pi) => {
					session = pi;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, true);
					assert.match(result.text, /cancelled; nothing was written/);
				},
			);
		});

		it("refuses when the config, flow or session changes while the dialog is open", async () => {
			let session: SdkPi | undefined;
			const changed = JSON.stringify({
				...BASE,
				models: {
					...BASE.models,
					tasks: { ...BASE.models.tasks, docs: ["faux/faux-1"] },
				},
			});
			await withHost(
				() => {
					session?.writeConfig(changed);
					return true;
				},
				async (pi) => {
					session = pi;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					assert.equal(readFileSync(pi.configPath, "utf8"), changed);
					assert.match(
						pi.toolResults(APPLY_TOOL)[0].text,
						/Approval is stale \(the config file changed during approval\)/,
					);
				},
			);
			await withHost(
				async () => {
					await session?.session.prompt("/setup-pstack");
					return true;
				},
				async (pi) => {
					session = pi;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					assert.match(
						pi.toolResults(APPLY_TOOL)[0].text,
						/Approval is stale \(the setup flow ended\)/,
					);
				},
			);
		});

		it("lets the real conditional writer refuse a config change made by a later hook", async () => {
			let configPath = "";
			const lateConfigHook: ExtensionFactory = (api) => {
				api.on("tool_call", (event) => {
					if (event.toolName !== WRITER) return;
					const config = JSON.parse(readFileSync(configPath, "utf8"));
					config.models.tasks.architecture = ["faux/faux-1"];
					writeFileSync(configPath, JSON.stringify(config));
				});
			};
			await withHost(
				() => true,
				async (pi) => {
					configPath = pi.configPath;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, true);
					assert.match(result.text, /Stale task model config revision/);
					assert.match(result.text, /Approval is not reused/);
					const saved = JSON.parse(readFileSync(pi.configPath, "utf8"));
					assert.deepEqual(saved.models.tasks, {
						...BASE.models.tasks,
						architecture: ["faux/faux-1"],
					});
					assert.equal(
						pi.session.getActiveToolNames().includes(APPLY_TOOL),
						false,
					);
				},
				{ extensions: [lateConfigHook] },
			);
		});

		it("blocks argument mutation by earlier hooks and freezes input against later ones", async () => {
			await withHost(
				() => true,
				async (pi) => {
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, true);
					assert.match(
						result.text,
						/arguments differ from the approved payload/,
					);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				},
				{
					packagesBefore: [
						join(PACK_ROOT, "test", "fixtures", "early-writer-mutator.ts"),
					],
				},
			);
			const mutators: Array<[string, ExtensionFactory]> = [
				[
					"nested mutation",
					(api) => {
						api.on("tool_call", (event) => {
							if (event.toolName !== WRITER) return;
							(event.input as { tasks: { review: string[] } }).tasks.review[0] =
								"faux/faux-1";
						});
					},
				],
				[
					"input rebinding",
					(api) => {
						api.on("tool_call", (event) => {
							if (event.toolName !== WRITER) return;
							(event as { input: unknown }).input = {
								tasks: { coding: ["faux/faux-2"] },
							};
						});
					},
				],
			];
			for (const [label, mutator] of mutators)
				await withHost(
					() => true,
					async (pi) => {
						pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
						await pi.prompt("/setup-pstack review");
						const [result] = pi.toolResults(APPLY_TOOL);
						assert.equal(result.isError, true, label);
						assert.match(
							result.text,
							/read.only|not extensible|Cannot assign/i,
							label,
						);
						assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT, label);
					},
					{ extensions: [mutator] },
				);
		});

		it("blocks raw and relayed writer calls during setup and outside it", async () => {
			const raw = {
				tasks: { coding: ["faux/faux-2"] },
				tasksMeta: {
					generatedAt: "2026-10-05T00:00:00Z",
					method: "registry-only",
				},
			};
			await withHost(
				() => true,
				async (pi) => {
					pi.armToolCall(WRITER, raw);
					await pi.prompt("/setup-pstack review");
					assertBlocked(pi.toolResults(WRITER)[0].text);
					pi.armToolCall("test_relay", { tool: WRITER, args: raw });
					await pi.prompt("/setup-pstack review");
					assertBlocked(pi.toolResults("test_relay")[0].text);
					pi.armToolCall("test_relay", {
						tool: APPLY_TOOL,
						args: REVIEW_CHANGE,
					});
					await pi.prompt("/setup-pstack review");
					assert.match(
						pi.toolResults("test_relay")[1].text,
						/must be called directly by the model/,
					);
					assert.deepEqual(confirmCalls(pi), []);

					pi.armToolCall(WRITER, raw);
					await pi.prompt("write directly without setup");
					assertBlocked(pi.toolResults(WRITER)[1].text);
					pi.armToolCall("test_relay", { tool: WRITER, args: raw });
					await pi.prompt("relay a write without setup");
					assertBlocked(pi.toolResults("test_relay")[2].text);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				},
				{ extensions: [relayTool] },
			);
		});

		it("rejects unauthenticated, alias, duplicate, padded and unknown references before any dialog", async () => {
			const proposals: Array<[Record<string, unknown>, RegExp]> = [
				[
					{ review: ["noauth/model-x"] },
					/noauth\/model-x is not an authenticated exact model/,
				],
				[{ review: ["task:coding"] }, /is a task alias/],
				[{ review: ["faux/faux-1", "faux/faux-1"] }, /lists a reference twice/],
				[{ review: [" faux/faux-1"] }, /surrounding whitespace/],
				[{ bogus: ["faux/faux-1"] }, /bogus|additional|must NOT have/i],
			];
			await withHost(
				() => true,
				async (pi) => {
					for (const [index, [changes, expected]] of proposals.entries()) {
						pi.armToolCall(APPLY_TOOL, { changes } as never);
						await pi.prompt("/setup-pstack review");
						const result = pi.toolResults(APPLY_TOOL)[index];
						assert.equal(result.isError, true, JSON.stringify(changes));
						assert.match(result.text, expected);
					}
					assert.deepEqual(confirmCalls(pi), []);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				},
			);
		});

		it("does not silently drop or rewrite a retained category it cannot write", async () => {
			const config = `${JSON.stringify({ ...BASE, models: { tasks: { qa: ["noauth/model-x"] } } })}\n`;
			await withHost(
				() => true,
				async (pi) => {
					await pi.prompt("/setup-pstack");
					assert.match(
						lastReport(pi),
						/tasks\.qa: noauth\/model-x is not an authenticated exact model/,
					);
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					assert.match(
						pi.toolResults(APPLY_TOOL)[0].text,
						/qa: noauth\/model-x is not an authenticated .*retained category/,
					);
					assert.equal(readFileSync(pi.configPath, "utf8"), config);
				},
				{ config },
			);
		});

		it("reports no change without a dialog", async () => {
			await withHost(
				() => true,
				async (pi) => {
					pi.armToolCall(APPLY_TOOL, { changes: { coding: ["faux/faux-1"] } });
					await pi.prompt("/setup-pstack keep coding");
					assert.match(pi.toolResults(APPLY_TOOL)[0].text, /^No change/);
					assert.deepEqual(confirmCalls(pi), []);
				},
			);
		});

		it("reports a busy writer as a failure without retrying", async () => {
			let session: SdkPi | undefined;
			await withHost(
				() => {
					writeFileSync(`${session?.configPath}.lock`, "{}");
					return true;
				},
				async (pi) => {
					session = pi;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, true);
					assert.match(result.text, /writer busy/);
					assert.match(
						result.text,
						/config file is unchanged \(revision sha256:[0-9a-f]{64}\), so nothing was written/,
					);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					assert.equal(confirmCalls(pi).length, 1);
					rmSync(`${pi.configPath}.lock`);
				},
			);
		});

		it("does not trust a success claim that the saved file contradicts", async () => {
			const forger: ExtensionFactory = (api) => {
				api.on("tool_result", (event) => {
					if (event.toolName !== WRITER) return;
					return {
						details: {
							...(event.details as object),
							configRevision: `sha256:${"0".repeat(64)}`,
						},
					};
				});
			};
			await withHost(
				() => true,
				async (pi) => {
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, true);
					assert.match(
						result.text,
						/returned configRevision does not match the saved bytes/,
					);
				},
				{ extensions: [forger] },
			);
		});

		it("stays report-only when the writer is inactive", async () => {
			await withHost(
				() => true,
				async (pi) => {
					pi.session.setActiveToolsByName(
						pi.session.getActiveToolNames().filter((name) => name !== WRITER),
					);
					await pi.prompt("/setup-pstack review");
					assert.match(
						lastReport(pi),
						new RegExp(`not started: ${WRITER} is not active`),
					);
					assert.deepEqual(confirmCalls(pi), []);
				},
			);
		});
	},
);

const RAW = {
	tasks: { coding: ["faux/faux-2"] },
	tasksMeta: { generatedAt: "2026-10-05T00:00:00Z", method: "registry-only" },
};

/** The model proposes once, then tries the raw writer in the same run. */
function applyThenRaw(pi: SdkPi, raw: JsonObject = RAW) {
	pi.respond([
		fauxAssistantMessage([fauxToolCall(APPLY_TOOL, REVIEW_CHANGE)]),
		fauxAssistantMessage([fauxToolCall(WRITER, raw)]),
		fauxAssistantMessage([
			fauxToolCall("test_relay", { tool: WRITER, args: raw }),
		]),
		fauxAssistantMessage([fauxToolCall(APPLY_TOOL, REVIEW_CHANGE)]),
		fauxAssistantMessage("done"),
	]);
}

/** Counts the writer calls that reached the host writer's own execute. */
function writerExecutions(): {
	factory: ExtensionFactory;
	count: () => number;
} {
	let count = 0;
	return {
		factory: (api) => {
			api.on("tool_result", (event) => {
				if (
					event.toolName === WRITER &&
					!/blocked/.test(JSON.stringify(event.content))
				)
					count += 1;
			});
		},
		count: () => count,
	};
}

/** A later independent run's direct and relayed writes are blocked too. */
async function assertWriterBlocked(pi: SdkPi) {
	const before = existsSync(pi.configPath)
		? readFileSync(pi.configPath, "utf8")
		: undefined;
	const counts = [
		pi.toolResults(WRITER).length,
		pi.toolResults("test_relay").length,
	];
	const relay = pi.session.getActiveToolNames().includes("test_relay");
	pi.respond([
		fauxAssistantMessage([fauxToolCall(WRITER, RAW)]),
		...(relay
			? [
					fauxAssistantMessage([
						fauxToolCall("test_relay", { tool: WRITER, args: RAW }),
					]),
				]
			: []),
		fauxAssistantMessage("done"),
	]);
	await pi.prompt("write directly, no setup");
	assertBlocked(pi.toolResults(WRITER)[counts[0]].text);
	if (relay) assertBlocked(pi.toolResults("test_relay")[counts[1]].text);
	assert.equal(
		existsSync(pi.configPath) ? readFileSync(pi.configPath, "utf8") : undefined,
		before,
	);
}

describe(
	"the writer gate admits only the approved nested write",
	needsHost,
	() => {
		const cases: Array<{
			label: string;
			decide: (pi: SdkPi) => boolean | Promise<boolean>;
			apply: RegExp;
			saved: (text: string) => void;
		}> = [
			{
				label: "declined",
				decide: () => false,
				apply: /declined or the approval dialog timed out/,
				saved: (text) => assert.equal(text, BASE_TEXT),
			},
			{
				label: "approved and saved",
				decide: () => true,
				apply: /Verified the saved file/,
				saved: (text) =>
					assert.deepEqual(JSON.parse(text).models.tasks, {
						...BASE.models.tasks,
						review: REVIEW_CHANGE.changes.review,
					}),
			},
			{
				label: "approved but the writer failed",
				decide: (pi) => {
					writeFileSync(`${pi.configPath}.lock`, "{}");
					return true;
				},
				apply: /writer busy[\s\S]*nothing was written/,
				saved: (text) => assert.equal(text, BASE_TEXT),
			},
			{
				label: "cancelled by a report command during the dialog",
				decide: async (pi) => {
					await pi.session.prompt("/setup-pstack");
					return true;
				},
				apply: /Approval is stale \(the setup flow ended\)/,
				saved: (text) => assert.equal(text, BASE_TEXT),
			},
		];
		for (const { label, decide, apply, saved } of cases)
			it(`blocks raw and relayed writes after the apply call is ${label}`, async () => {
				const holder: SdkPi[] = [];
				const executions = writerExecutions();
				await withHost(
					() => decide(holder[0]),
					async (pi) => {
						holder.push(pi);
						applyThenRaw(pi);
						await pi.prompt("/setup-pstack review");
						const [first, second] = pi.toolResults(APPLY_TOOL);
						assert.match(first.text, apply, label);
						assert.equal(second.isError, true, label);
						// Pi refuses the deactivated tool before pstack sees it.
						assert.match(
							second.text,
							/pstack_apply_task_models not found|No open \/setup-pstack change flow/,
						);
						assertBlocked(pi.toolResults(WRITER)[0].text);
						assertBlocked(pi.toolResults("test_relay")[0].text);
						assert.equal(confirmCalls(pi).length, 1, "one dialog per flow");
						saved(readFileSync(pi.configPath, "utf8"));
						assert.equal(
							executions.count(),
							label === "declined" || label.startsWith("cancelled") ? 0 : 1,
							"no retry and no raw write reached the host writer",
						);
						rmSync(`${pi.configPath}.lock`, { force: true });
						await assertWriterBlocked(pi);
					},
					{ extensions: [relayTool, executions.factory] },
				);
			});

		it("blocks a nested write whose flow is revoked between approval and tool_call", async () => {
			const holder: SdkPi[] = [];
			const lateCancel: ExtensionFactory = (api) => {
				api.on("tool_execution_start", async (event) => {
					if (event.toolName === WRITER && event.parentToolCallId)
						await holder[0]?.session.prompt("/setup-pstack");
				});
			};
			await withHost(
				() => true,
				async (pi) => {
					holder.push(pi);
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, true);
					assertBlocked(result.text);
					assert.match(result.text, /unchanged[^.]*, so nothing was written/);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					await assertWriterBlocked(pi);
				},
				{ extensions: [lateCancel] },
			);
		});

		it("blocks a nested write when Pi reloads between approval and tool_call", async () => {
			const holder: SdkPi[] = [];
			let reloaded = false;
			const lateReload: ExtensionFactory = (api) => {
				api.on("tool_execution_start", async (event) => {
					if (event.toolName !== WRITER || !event.parentToolCallId || reloaded)
						return;
					reloaded = true;
					// Reload swaps in fresh extension instances without aborting the
					// turn; the new pstack instance never saw the apply call.
					await holder[0]?.session.reload();
				});
			};
			await withHost(
				() => true,
				async (pi) => {
					holder.push(pi);
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					assert.equal(reloaded, true);
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, true);
					assertBlocked(result.text);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					assert.equal(
						pi.session.getActiveToolNames().includes(APPLY_TOOL),
						false,
					);
					await assertWriterBlocked(pi);
				},
				{ extensions: [lateReload] },
			);
		});

		for (const { label, decide, at, apply } of [
			{
				label: "during the approved nested dispatch",
				decide: () => true,
				at: "nested",
				apply: NO_APPROVAL,
			},
			{
				label: "after a declined apply",
				decide: () => false,
				at: "after-apply",
				apply: /declined or the approval dialog timed out/,
			},
			{
				label: "after a successful apply",
				decide: () => true,
				at: "after-apply",
				apply: /Verified the saved file/,
			},
		] as const)
			it(`keeps raw and relayed writes blocked in the same run after a reload ${label}`, async () => {
				const holder: SdkPi[] = [];
				const executions = writerExecutions();
				const lifecycle: string[] = [];
				let reloaded = false;
				const reloadFixture: ExtensionFactory = (api) => {
					api.on("agent_start", () => {
						lifecycle.push("agent_start");
					});
					api.on("agent_settled", () => {
						lifecycle.push("agent_settled");
					});
					const reload = async () => {
						reloaded = true;
						// Fresh extension instances join the running turn.
						await holder[0]?.session.reload();
					};
					api.on("tool_execution_start", async (event) => {
						if (
							at === "nested" &&
							!reloaded &&
							event.toolName === WRITER &&
							event.parentToolCallId
						)
							await reload();
					});
					api.on("tool_execution_end", async (event) => {
						if (
							at === "after-apply" &&
							!reloaded &&
							event.toolName === APPLY_TOOL
						)
							await reload();
					});
				};
				await withHost(
					decide,
					async (pi) => {
						holder.push(pi);
						pi.respond([
							fauxAssistantMessage([fauxToolCall(APPLY_TOOL, REVIEW_CHANGE)]),
							fauxAssistantMessage([fauxToolCall(WRITER, RAW)]),
							fauxAssistantMessage([
								fauxToolCall("test_relay", { tool: WRITER, args: RAW }),
							]),
							fauxAssistantMessage("done"),
						]);
						await pi.prompt("/setup-pstack review");
						assert.equal(reloaded, true);
						assert.deepEqual(lifecycle, ["agent_start", "agent_settled"]);
						const [result] = pi.toolResults(APPLY_TOOL);
						assert.match(result.text, apply);
						assertBlocked(pi.toolResults(WRITER)[0].text);
						assertBlocked(pi.toolResults("test_relay")[0].text);
						assert.equal(confirmCalls(pi).length, 1);
						const saved = JSON.parse(readFileSync(pi.configPath, "utf8"));
						assert.deepEqual(
							saved.models.tasks,
							label === "after a successful apply"
								? { ...BASE.models.tasks, review: REVIEW_CHANGE.changes.review }
								: BASE.models.tasks,
							"retained categories survive; no raw replacement",
						);
						assert.equal(
							executions.count(),
							label === "after a successful apply" ? 1 : 0,
						);
						assert.equal(
							pi.session.getActiveToolNames().includes(APPLY_TOOL),
							false,
						);
						await assertWriterBlocked(pi);
					},
					{ extensions: [relayTool, executions.factory, reloadFixture] },
				);
			});

		it("writes nothing when the session is replaced while approval is pending", async () => {
			const holder: SdkPi[] = [];
			let replacement: Promise<void> | undefined;
			await withHost(
				() => {
					// Like /new from another surface. The dialog ignores the abort
					// signal and approves late.
					replacement = holder[0]?.newSession();
					return new Promise((resolve) => setTimeout(() => resolve(true), 20));
				},
				async (pi) => {
					holder.push(pi);
					const old = pi.session;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					await replacement;
					assert.notEqual(pi.session, old, "the session was replaced");
					const [result] = old.messages.flatMap((message) =>
						message.role === "toolResult" && message.toolName === APPLY_TOOL
							? [message]
							: [],
					);
					assert.equal(result.isError, true);
					assert.match(
						JSON.stringify(result.content),
						/cancelled; nothing was written/,
					);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					await assertWriterBlocked(pi);
				},
			);
		});

		it("blocks the nested write when the session is replaced between approval and tool_call", async () => {
			const holder: SdkPi[] = [];
			let replacement: Promise<void> | undefined;
			const lateReplace: ExtensionFactory = (api) => {
				api.on("tool_execution_start", (event) => {
					if (
						event.toolName === WRITER &&
						event.parentToolCallId &&
						!replacement
					)
						// Not awaited: replacement first aborts and waits for this turn.
						replacement = holder[0]?.newSession();
				});
			};
			await withHost(
				() => true,
				async (pi) => {
					holder.push(pi);
					const old = pi.session;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					await replacement;
					assert.notEqual(pi.session, old);
					const [result] = old.messages.flatMap((message) =>
						message.role === "toolResult" && message.toolName === APPLY_TOOL
							? [message]
							: [],
					);
					const text = JSON.stringify(result.content);
					assert.equal(result.isError, true);
					assert.match(
						text,
						// Pi refuses an aborted nested call before tool_call; pstack's guard
						// refuses it too if a hook aborts later.
						/reported an error: (?:Operation aborted|pi-herdr-pstack blocked subagents_write_task_models: no approved)/,
					);
					assert.match(text, /nothing was written/);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					await assertWriterBlocked(pi);
				},
				{ extensions: [lateReplace] },
			);
		});

		it("writes nothing when Pi shuts down while approval is pending", async () => {
			const holder: SdkPi[] = [];
			let shutdown: Promise<void> | undefined;
			await withHost(
				() => {
					shutdown = holder[0]?.runtime.dispose();
					return new Promise((resolve) => setTimeout(() => resolve(true), 20));
				},
				async (pi) => {
					holder.push(pi);
					const old = pi.session;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					await shutdown;
					const [result] = old.messages.flatMap((message) =>
						message.role === "toolResult" && message.toolName === APPLY_TOOL
							? [message]
							: [],
					);
					assert.equal(result.isError, true);
					assert.match(
						JSON.stringify(result.content),
						/cancelled; nothing was written/,
					);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				},
			);
		});
	},
);

describe(
	"setup reports the saved file after a dispatched write",
	needsHost,
	() => {
		const approvedTasks = {
			...BASE.models.tasks,
			review: REVIEW_CHANGE.changes.review,
		};
		const cases: Array<{
			label: string;
			factory?: ExtensionFactory;
			setup?: (pi: SdkPi) => void;
			reason: RegExp;
		}> = [
			{
				label: "a later tool_result hook marks the completed write as an error",
				factory: (api) => {
					api.on("tool_result", (event) =>
						event.toolName === WRITER ? { isError: true } : undefined,
					);
				},
				reason: /subagents_write_task_models reported an error/,
			},
			{
				label: "Pi fails to process the writer's result",
				factory: (api) => {
					api.on("tool_result", (event) =>
						// SAFETY: deliberately malformed content to make Pi's own result
						// processing throw after the write.
						event.toolName === WRITER
							? { content: [null] as never }
							: undefined,
					);
				},
				reason: /subagents_write_task_models reported an error/,
			},
			{
				label: "reading the result throws",
				factory: (api) => {
					api.on("tool_result", (event) =>
						event.toolName === WRITER
							? {
									details: {
										get configRevision(): string {
											throw new Error("details getter failed");
										},
									},
								}
							: undefined,
					);
				},
				reason: /result could not be processed \(details getter failed\)/,
			},
			{
				label: "executeTool rejects after the write",
				setup: (pi) => {
					pi.session.subscribe((event) => {
						if (
							event.type === "tool_execution_end" &&
							event.toolName === WRITER
						)
							throw new Error("listener failed after the write");
					});
				},
				reason: /call failed \(listener failed after the write\)/,
			},
		];
		for (const { label, factory, setup, reason } of cases)
			it(`does not claim nothing was written when ${label}`, async () => {
				const executions = writerExecutions();
				await withHost(
					() => true,
					async (pi) => {
						setup?.(pi);
						pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
						await pi.prompt("/setup-pstack review");
						const [result] = pi.toolResults(APPLY_TOOL);
						assert.equal(result.isError, true, result.text);
						assert.match(result.text, reason);
						assert.match(
							result.text,
							/now holds exactly the approved task preferences[\s\S]*the write most likely happened/,
						);
						assert.doesNotMatch(
							result.text,
							/nothing was written|did not write/,
						);
						assert.match(result.text, /nothing was retried/);
						const saved = JSON.parse(readFileSync(pi.configPath, "utf8"));
						assert.deepEqual(saved.models.tasks, approvedTasks);
						assert.equal(executions.count(), 1, "the writer ran exactly once");
					},
					{ extensions: [executions.factory, ...(factory ? [factory] : [])] },
				);
			});

		it("reports uncertainty when the file changed but does not match the approval", async () => {
			let configPath = "";
			const rewrite: ExtensionFactory = (api) => {
				api.on("tool_result", (event) => {
					if (event.toolName !== WRITER) return;
					const config = JSON.parse(readFileSync(configPath, "utf8"));
					config.models.tasks.architecture = ["faux/faux-1"];
					writeFileSync(configPath, JSON.stringify(config));
					return { isError: true };
				});
			};
			await withHost(
				() => true,
				async (pi) => {
					configPath = pi.configPath;
					pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
					await pi.prompt("/setup-pstack review");
					const [result] = pi.toolResults(APPLY_TOOL);
					assert.equal(result.isError, true);
					assert.match(
						result.text,
						/changed \(the saved tasks differ from the approval\), so whether subagents_write_task_models wrote is uncertain/,
					);
					assert.doesNotMatch(result.text, /nothing was written/);
				},
				{ extensions: [rewrite] },
			);
		});
	},
);

describe("the writer gate holds in every other run shape", needsHost, () => {
	/** Raw, relayed and apply calls in one run. */
	function rawRelayApply(pi: SdkPi) {
		pi.respond([
			fauxAssistantMessage([fauxToolCall(WRITER, RAW)]),
			fauxAssistantMessage([
				fauxToolCall("test_relay", { tool: WRITER, args: RAW }),
			]),
			fauxAssistantMessage([fauxToolCall(APPLY_TOOL, REVIEW_CHANGE)]),
			fauxAssistantMessage("done"),
		]);
	}

	/**
	 * Every writer call in the session so far was refused before the host ran
	 * it, and no proposal reached a dialog unless `dialogs` says so.
	 */
	function assertNothingWritten(
		pi: SdkPi,
		executions: ReturnType<typeof writerExecutions>,
		dialogs = 0,
	) {
		for (const result of pi.toolResults(WRITER)) assertBlocked(result.text);
		for (const result of pi.toolResults("test_relay"))
			assertBlocked(result.text);
		for (const result of pi.toolResults(APPLY_TOOL))
			assert.match(
				result.text,
				/pstack_apply_task_models not found|No open \/setup-pstack change flow|declined or the approval dialog timed out/,
			);
		assert.equal(confirmCalls(pi).length, dialogs);
		assert.equal(executions.count(), 0);
		assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
	}

	const consumeSetupPrompt: ExtensionFactory = (api) => {
		api.on("input", (event) =>
			event.text.includes("/setup-pstack opened change flow")
				? { action: "handled" as const }
				: undefined,
		);
	};

	it("blocks direct and relayed writes in an ordinary run", async () => {
		const executions = writerExecutions();
		await withHost(
			() => true,
			async (pi) => {
				rawRelayApply(pi);
				await pi.prompt("update my task models");
				assert.equal(pi.toolResults(WRITER).length, 1);
				assert.equal(pi.toolResults("test_relay").length, 1);
				assertNothingWritten(pi, executions);
			},
			{ extensions: [relayTool, executions.factory] },
		);
	});

	it("routes /subagents-init through the approval flow and still refuses a direct write in that run", async () => {
		const executions = writerExecutions();
		await withHost(
			() => true,
			async (pi) => {
				applyThenRaw(pi);
				await pi.prompt("/subagents-init prefer faux-2");
				assert.match(
					firstUserText(pi),
					/Propose through pstack_apply_task_models/,
				);
				const [apply, again] = pi.toolResults(APPLY_TOOL);
				assert.match(apply.text, /Verified the saved file/);
				assert.equal(again.isError, true);
				const [direct] = pi.toolResults(WRITER);
				assertBlocked(direct.text);
				assert.ok(
					direct.text.includes("/subagents-init (also /setup-pstack init)"),
				);
				assertBlocked(pi.toolResults("test_relay")[0].text);
				assert.equal(confirmCalls(pi).length, 1);
				assert.equal(executions.count(), 1, "only the approved write ran");
				await assertWriterBlocked(pi);
			},
			{ extensions: [relayTool, executions.factory] },
		);
	});

	it("still applies under a whitespace-normalizing input hook and blocks a direct write", async () => {
		const normalize: ExtensionFactory = (api) => {
			api.on("input", (event) => ({
				action: "transform" as const,
				text: event.text.replace(/\s+/g, " "),
			}));
		};
		const executions = writerExecutions();
		await withHost(
			() => true,
			async (pi) => {
				applyThenRaw(pi);
				await pi.prompt("/setup-pstack review");
				const [apply, again] = pi.toolResults(APPLY_TOOL);
				assert.match(apply.text, /Verified the saved file/);
				assert.equal(again.isError, true);
				assert.equal(confirmCalls(pi).length, 1);
				assertBlocked(pi.toolResults(WRITER)[0].text);
				assertBlocked(pi.toolResults("test_relay")[0].text);
				assert.equal(executions.count(), 1, "only the approved write ran");
				assert.deepEqual(
					JSON.parse(readFileSync(pi.configPath, "utf8")).models.tasks,
					{ ...BASE.models.tasks, review: REVIEW_CHANGE.changes.review },
				);
				await assertWriterBlocked(pi);
			},
			{ extensions: [normalize, relayTool, executions.factory] },
		);
	});

	it("blocks writes after a before_agent_start hook reloads Pi for the setup prompt", async () => {
		const holder: SdkPi[] = [];
		let reloaded = false;
		const preStartReload: ExtensionFactory = (api) => {
			api.on("before_agent_start", async (event) => {
				if (reloaded || !event.prompt.includes("/setup-pstack opened")) return;
				reloaded = true;
				await holder[0]?.session.reload();
			});
		};
		const executions = writerExecutions();
		await withHost(
			() => true,
			async (pi) => {
				holder.push(pi);
				rawRelayApply(pi);
				await pi.prompt("/setup-pstack review");
				assert.equal(reloaded, true);
				assert.equal(pi.toolResults(WRITER).length, 1);
				assertNothingWritten(pi, executions);
				await assertWriterBlocked(pi);
			},
			{ extensions: [preStartReload, relayTool, executions.factory] },
		);
	});

	it("closes a held setup prompt's window for the run that displaced it, across a reload, and in the late setup run", async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const holdSetupInput: ExtensionFactory = (api) => {
			api.on("input", async (event) => {
				if (event.text.includes("/setup-pstack opened change flow")) await gate;
			});
		};
		const executions = writerExecutions();
		await withHost(
			() => false,
			async (pi) => {
				await pi.session.prompt("/setup-pstack review");
				// The setup prompt waits in an input handler; another prompt's input
				// arrives first and closes the window, so its proposal finds none.
				rawRelayApply(pi);
				await pi.prompt("an unrelated request");
				assert.equal(pi.toolResults(WRITER).length, 1);
				await pi.session.reload();
				rawRelayApply(pi);
				release();
				// The released prompt starts its own run asynchronously.
				for (let i = 0; i < 200 && pi.toolResults(WRITER).length < 2; i++)
					await pi.idle();
				await pi.idle();
				assert.equal(pi.toolResults(WRITER).length, 2, "the late run wrote");
				assertNothingWritten(pi, executions);
				await assertWriterBlocked(pi);
			},
			{ extensions: [holdSetupInput, relayTool, executions.factory] },
		);
	});

	it("closes a consumed setup prompt's window for a custom-message run, before and after a reload", async () => {
		const executions = writerExecutions();
		await withHost(
			() => false,
			async (pi) => {
				await pi.prompt("/setup-pstack review");
				assert.equal(pi.session.messages.length, 0, "no setup run started");
				for (const reload of [false, true]) {
					if (reload) await pi.session.reload();
					rawRelayApply(pi);
					await pi.session.sendCustomMessage(
						{ customType: "test-trigger", content: "go", display: false },
						{ triggerTurn: true },
					);
					await pi.idle();
				}
				assert.equal(pi.toolResults(WRITER).length, 2);
				// The triggered run skipped input and before_agent_start, so it is not
				// the setup prompt's run: its agent_start closed the window.
				assertNothingWritten(pi, executions);
			},
			{ extensions: [consumeSetupPrompt, relayTool, executions.factory] },
		);
	});
});

const RESEARCH_BASIS = {
	kind: "research",
	sources: [
		{
			url: "https://vendor.example/faux-2-evals",
			influence: "review: faux-2 leads faux-1 on the vendor's review suite",
		},
	],
	uncertainty: "one vendor source; no independent comparison found",
};

describe("one-command task-model init", needsHost, () => {
	const orders: Array<[string, Partial<SdkOptions>]> = [
		["host loaded after pstack", {}],
		[
			"host loaded before pstack",
			{ packages: [], packagesBefore: [HOST ?? ""] },
		],
	];
	const commands = [
		"/subagents-init prefer faux-2 for review",
		"/setup-pstack init prefer faux-2 for review",
	];
	for (const [order, packages] of orders)
		for (const command of commands)
			it(`${command.split(" ")[0]} ${command.includes("setup-pstack") ? "init " : ""}drafts from the host brief and writes once after approval (${order})`, async () => {
				const executions = writerExecutions();
				await withHost(
					() => true,
					async (pi) => {
						pi.armToolCall(APPLY_TOOL, {
							changes: { review: ["faux/faux-2"] },
							basis: { kind: "registry-only" },
						});
						await pi.prompt(command);
						const prompt = firstUserText(pi);
						assert.match(prompt, /Complete registry brief: 2 models/);
						assert.match(
							prompt,
							/\n\nPropose through pstack_apply_task_models, not subagents_write_task_models/,
						);
						assert.doesNotMatch(
							prompt,
							/call subagents_write_task_models with the reviewed draft/i,
						);
						const brief = initBrief(pi);
						assert.equal(brief.operatorPreferences, "prefer faux-2 for review");
						assert.equal(brief.configRevision, sha(BASE_TEXT));
						assert.deepEqual(
							brief.models.map((model: { ref: string }) => model.ref),
							["faux/faux-1", "faux/faux-2"],
						);
						assert.deepEqual(brief.current.agents, BASE.models.agents);
						assert.equal(brief.current.default, BASE.models.default);

						assert.equal(confirmCalls(pi).length, 1);
						const { payload } = dialogPayload(pi);
						assert.equal(payload.expectedConfigRevision, sha(BASE_TEXT));
						assert.deepEqual(payload.basis, { kind: "registry-only" });
						assert.equal(payload.tasksMeta.method, "registry-only");
						const [result] = pi.toolResults(APPLY_TOOL);
						assert.match(result.text, /Verified the saved file/);
						assert.equal(executions.count(), 1);
						const saved = JSON.parse(readFileSync(pi.configPath, "utf8"));
						assert.deepEqual(saved.models.tasks, {
							...BASE.models.tasks,
							review: ["faux/faux-2"],
						});
						assert.deepEqual(saved.models.tasksMeta, payload.tasksMeta);
						assert.equal(saved.models.default, BASE.models.default);
						assert.deepEqual(saved.models.agents, BASE.models.agents);
						assert.deepEqual(saved.unrelated, BASE.unrelated);
						assert.equal(Object.hasOwn(saved.models, "basis"), false);
						assert.equal(
							pi.session.getActiveToolNames().includes(APPLY_TOOL),
							false,
						);
					},
					{ ...packages, extensions: [executions.factory] },
				);
			});

	it("saves research only with usable sources, rejecting an unusable claim before the dialog", async () => {
		await withHost(
			() => true,
			async (pi) => {
				pi.respond([
					fauxAssistantMessage([
						fauxToolCall(APPLY_TOOL, {
							changes: { review: ["faux/faux-2"] },
							basis: {
								...RESEARCH_BASIS,
								sources: [{ url: "ftp://vendor.example/x", influence: "x" }],
							},
						}),
					]),
					fauxAssistantMessage([
						fauxToolCall(APPLY_TOOL, {
							changes: { review: ["faux/faux-2"] },
							basis: RESEARCH_BASIS,
						}),
					]),
					fauxAssistantMessage("done"),
				]);
				await pi.prompt("/subagents-init");
				const [rejected, saved] = pi.toolResults(APPLY_TOOL);
				assert.equal(rejected.isError, true);
				assert.match(
					rejected.text,
					/basis\.sources\[0\]\.url must be an http\(s\) URL with a host/,
				);
				assert.match(saved.text, /Verified the saved file/);
				assert.equal(confirmCalls(pi).length, 1);
				const { message, payload } = dialogPayload(pi);
				assert.deepEqual(payload.basis, RESEARCH_BASIS);
				assert.equal(payload.tasksMeta.method, "research");
				assert.match(message, /not independently verified: research/);
				assert.match(
					message,
					/ {2}- https:\/\/vendor\.example\/faux-2-evals: review: faux-2 leads/,
				);
				const file = JSON.parse(readFileSync(pi.configPath, "utf8"));
				assert.equal(file.models.tasksMeta.method, "research");
				assert.doesNotMatch(
					readFileSync(pi.configPath, "utf8"),
					/vendor\.example/,
				);
			},
		);
	});

	it("refuses a proposal after the config changed under the brief, and a model the brief left out", async () => {
		let configPath = "";
		const changed = `${JSON.stringify({ ...BASE, extra: true })}\n`;
		const editBeforeApply: ExtensionFactory = (api) => {
			api.on("tool_call", (event) => {
				if (event.toolName === APPLY_TOOL) writeFileSync(configPath, changed);
			});
		};
		await withHost(
			() => true,
			async (pi) => {
				configPath = pi.configPath;
				pi.armToolCall(APPLY_TOOL, { changes: { review: ["faux/faux-2"] } });
				await pi.prompt("/subagents-init");
				const [result] = pi.toolResults(APPLY_TOOL);
				assert.equal(result.isError, true);
				assert.match(
					result.text,
					/config file changed after pi-herdr-agents read it for this init/,
				);
				assert.deepEqual(confirmCalls(pi), []);
				assert.equal(readFileSync(pi.configPath, "utf8"), changed);
			},
			{ extensions: [editBeforeApply] },
		);
		await withHost(
			() => true,
			async (pi) => {
				pi.armToolCall(APPLY_TOOL, { changes: { review: ["noauth/model-x"] } });
				await pi.prompt("/subagents-init");
				assert.deepEqual(
					initBrief(pi).models.map((model: { ref: string }) => model.ref),
					["faux/faux-1", "faux/faux-2"],
				);
				assert.match(
					pi.toolResults(APPLY_TOOL)[0].text,
					/noauth\/model-x is not an authenticated exact model/,
				);
				assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
			},
		);
	});

	it("refuses init when a second extension also offers approval, opening neither", async () => {
		const competitor: ExtensionFactory = (api) => {
			api.events.on(
				"pi-herdr-subagents:task-models:init:approval:v1",
				(request) => {
					// SAFETY: the host emits this v1 shape.
					(request as { offer(offer: unknown): void }).offer({
						owner: "test-approval",
						open: () => assert.fail("never opened"),
					});
				},
			);
		};
		await withHost(
			() => true,
			async (pi) => {
				await pi.prompt("/subagents-init");
				assert.deepEqual(
					pi.notifications().filter((text) => text.includes("init")),
					[
						"Task-model init not started: more than one extension offered to approve task-model writes (pi-herdr-pstack, test-approval); keep one loaded. Nothing was written.",
					],
				);
				assert.equal(
					pi.session.messages.some((message) => message.role === "user"),
					false,
				);
				assert.equal(
					pi.session.getActiveToolNames().includes(APPLY_TOOL),
					false,
				);
				assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
			},
			{ extensions: [competitor] },
		);
	});

	it("answers once per request after a reload and a new session", async () => {
		await withHost(
			() => true,
			async (pi) => {
				await pi.session.reload();
				await pi.newSession();
				await pi.session.reload();
				pi.armToolCall(APPLY_TOOL, { changes: { review: ["faux/faux-2"] } });
				await pi.prompt("/setup-pstack init");
				assert.deepEqual(
					pi.notifications().filter((text) => text.includes("init")),
					[],
					"no stale listener made a second offer",
				);
				assert.match(
					pi.toolResults(APPLY_TOOL)[0].text,
					/Verified the saved file/,
				);
				assert.equal(confirmCalls(pi).length, 1);
			},
		);
	});

	it("reports the alias as unsupported without a host and writes nothing", async () => {
		await withPi({ config: BASE_TEXT }, async (pi) => {
			pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
			await pi.prompt("/setup-pstack init prefer faux-2");
			assert.match(
				lastReport(pi),
				/^Task-model init not started: no loaded pi-herdr-agents accepted the request\..*Nothing was written\.$/s,
			);
			assert.deepEqual(pi.toolResults(APPLY_TOOL), []);
			assert.equal(pi.session.getActiveToolNames().includes(APPLY_TOOL), false);
			assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
		});
	});

	it("keeps the host's own writer flow, with revision and research basis, when pstack is absent", async () => {
		await withHost(
			() => true,
			async (pi) => {
				const revision = sha(BASE_TEXT);
				pi.armToolCall(WRITER, {
					tasks: { review: ["faux/faux-2"] },
					tasksMeta: {
						generatedAt: "2026-10-09T00:00:00Z",
						method: "research",
					},
					expectedConfigRevision: revision,
					basis: RESEARCH_BASIS,
				});
				await pi.prompt("/subagents-init prefer faux-2");
				assert.match(
					firstUserText(pi),
					/call subagents_write_task_models with the reviewed draft/,
				);
				assert.equal(initBrief(pi).configRevision, revision);
				const [result] = pi.toolResults(WRITER);
				assert.equal(result.isError, false, result.text);
				assert.match(result.text, /"basis": \{\n\s+"kind": "research"/);
				const saved = JSON.parse(readFileSync(pi.configPath, "utf8"));
				assert.deepEqual(saved.models.tasks, { review: ["faux/faux-2"] });
				assert.equal(saved.models.tasksMeta.method, "research");
				assert.equal(saved.models.default, BASE.models.default);
				assert.equal(Object.hasOwn(saved.models, "basis"), false);
			},
			{ pack: false },
		);
	});
});

describe("init reads only the active registry", needsHost, () => {
	it("drafts, approves and writes once through both commands while getAll throws, and explicit setup still reports", async () => {
		const crawls: string[] = [];
		let crawlable = false;
		const noCrawl: ExtensionFactory = (api) => {
			api.on("session_start", (_event, ctx) => {
				const registry = ctx.modelRegistry;
				const getAll = registry.getAll.bind(registry);
				registry.getAll = () => {
					if (crawlable) return getAll();
					crawls.push(new Error("getAll").stack ?? "");
					throw new Error("test: init must not crawl getAll");
				};
			});
		};
		const executions = writerExecutions();
		await withHost(
			() => true,
			async (pi) => {
				const changes = [["faux/faux-2"], ["faux/faux-1"]];
				for (const [index, command] of [
					"/subagents-init",
					"/setup-pstack init",
				].entries()) {
					pi.armToolCall(APPLY_TOOL, {
						changes: { review: changes[index] },
						basis: { kind: "registry-only" },
					});
					await pi.prompt(command);
					assert.deepEqual(
						pi.notifications().filter((text) => text.includes("init")),
						[],
						command,
					);
					const result = pi.toolResults(APPLY_TOOL)[index];
					assert.match(result.text, /Verified the saved file/, command);
					assert.equal(confirmCalls(pi).length, index + 1, command);
					assert.equal(executions.count(), index + 1, command);
					assert.deepEqual(
						JSON.parse(readFileSync(pi.configPath, "utf8")).models.tasks.review,
						changes[index],
					);
				}
				assert.deepEqual(crawls, [], "neither package crawled getAll");

				crawlable = true;
				pi.armToolCall(APPLY_TOOL, REVIEW_CHANGE);
				await pi.prompt("/setup-pstack review");
				assert.match(
					userTextAt(pi, -1),
					/\/setup-pstack opened change flow[\s\S]*2 authenticated exact model\(s\): faux\/faux-1, faux\/faux-2/,
				);
				assert.match(
					pi.toolResults(APPLY_TOOL)[2].text,
					/Verified the saved file/,
				);
				assert.equal(executions.count(), 3);
			},
			{ extensions: [noCrawl, executions.factory] },
		);
	});
});

describe("an init window never outlives its own prompt", needsHost, () => {
	/** Sets the parent model without Pi's auth check, as a stale selection would be. */
	function selectModel(pi: SdkPi, ref: string | undefined) {
		const model = ref
			? pi.session.modelRuntime
					.getModels()
					.find((entry) => `${entry.provider}/${entry.id}` === ref)
			: undefined;
		if (ref) assert.ok(model, ref);
		// SAFETY: Pi reads an unset model as "No model selected" during preflight.
		(pi.session.agent.state as { model: unknown }).model = model;
	}

	const commands = ["/subagents-init", "/setup-pstack init"];
	for (const command of commands)
		for (const [label, selected] of [
			["no parent model is selected", undefined],
			["the parent model has no configured auth", "noauth/model-x"],
		] as const)
			it(`${command} opens nothing a later request can use when ${label}`, async () => {
				const executions = writerExecutions();
				await withHost(
					() => true,
					async (pi) => {
						selectModel(pi, selected);
						await pi.prompt(command);
						assert.equal(
							pi.session.messages.some((message) => message.role === "user"),
							false,
							"no init run started",
						);
						const windowOpen = pi.session
							.getActiveToolNames()
							.includes(APPLY_TOOL);
						if (selected) {
							// Pi rejected the submitted prompt in its own preflight.
							assert.match(
								pi.errors.join("\n"),
								/No API key found for "?noauth/,
							);
							assert.equal(windowOpen, true, "the window waits for its prompt");
						} else {
							const shown = command.startsWith("/setup-pstack")
								? lastReport(pi)
								: pi.notifications().join("\n");
							assert.match(shown, /not started: no model is selected/);
							assert.equal(windowOpen, false, "nothing opened");
						}
						await pi.session.setModel(pi.faux.getModel());
						pi.armToolCall(APPLY_TOOL, {
							changes: { review: ["faux/faux-2"] },
						});
						await pi.prompt("an unrelated request");
						const [apply] = pi.toolResults(APPLY_TOOL);
						assert.equal(apply?.isError, true);
						assert.match(
							apply.text,
							/pstack_apply_task_models not found|No open \/setup-pstack change flow/,
						);
						assert.deepEqual(confirmCalls(pi), []);
						assert.equal(executions.count(), 0);
						assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					},
					{ extensions: [executions.factory] },
				);
			});
});
