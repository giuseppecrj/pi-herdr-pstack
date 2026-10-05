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
	RUN_ENTRY_TYPE,
	WRITER,
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

/** The states pstack recorded for its setup runs on the current branch. */
function runStates(pi: SdkPi): unknown[] {
	return pi.session.sessionManager
		.getBranch()
		.flatMap((entry) =>
			entry.type === "custom" && entry.customType === RUN_ENTRY_TYPE
				? [(entry.data as { state?: unknown }).state]
				: [],
		);
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
					]);
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

		it("blocks raw and relayed writer calls during setup, but not outside it", async () => {
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
					assert.match(
						pi.toolResults(WRITER)[0].text,
						/only its approved pstack_apply_task_models call may write/,
					);
					pi.armToolCall("test_relay", { tool: WRITER, args: raw });
					await pi.prompt("/setup-pstack review");
					assert.match(
						pi.toolResults("test_relay")[0].text,
						/pi-herdr-pstack setup blocked/,
					);
					pi.armToolCall("test_relay", {
						tool: APPLY_TOOL,
						args: REVIEW_CHANGE,
					});
					await pi.prompt("/setup-pstack review");
					assert.match(
						pi.toolResults("test_relay")[1].text,
						/must be called directly by the model/,
					);
					assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
					assert.deepEqual(confirmCalls(pi), []);

					pi.armToolCall(WRITER, raw);
					await pi.prompt("write directly without setup");
					assert.equal(pi.toolResults(WRITER)[1].isError, false);
					const saved = JSON.parse(readFileSync(pi.configPath, "utf8"));
					assert.deepEqual(
						saved.models.tasks,
						raw.tasks,
						"host behavior unchanged outside setup",
					);
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

/** A later independent run keeps the host writer's own behavior. */
async function assertHostWriterOutsideSetup(pi: SdkPi) {
	pi.armToolCall(WRITER, RAW);
	await pi.prompt("write directly, no setup");
	const results = pi.toolResults(WRITER);
	assert.equal(results.at(-1)?.isError, false, results.at(-1)?.text);
	const saved = JSON.parse(readFileSync(pi.configPath, "utf8"));
	assert.deepEqual(saved.models.tasks, RAW.tasks);
}

describe("setup run protection lasts until the run settles", needsHost, () => {
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
					const [raw] = pi.toolResults(WRITER);
					assert.equal(raw.isError, true, label);
					assert.match(
						raw.text,
						/until this \/setup-pstack run settles, only its approved/,
					);
					assert.match(
						pi.toolResults("test_relay")[0].text,
						/pi-herdr-pstack setup blocked/,
					);
					assert.equal(confirmCalls(pi).length, 1, "one dialog per flow");
					saved(readFileSync(pi.configPath, "utf8"));
					assert.equal(
						executions.count(),
						label === "declined" || label.startsWith("cancelled") ? 0 : 1,
						"no retry and no raw write reached the host writer",
					);
					rmSync(`${pi.configPath}.lock`, { force: true });
					await assertHostWriterOutsideSetup(pi);
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
				assert.match(
					result.text,
					/blocked subagents_write_task_models: the approval for that pstack_apply_task_models call has ended/,
				);
				assert.match(result.text, /unchanged[^.]*, so nothing was written/);
				assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				await assertHostWriterOutsideSetup(pi);
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
				assert.match(
					result.text,
					/the approval for that pstack_apply_task_models call has ended/,
				);
				assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				assert.equal(
					pi.session.getActiveToolNames().includes(APPLY_TOOL),
					false,
				);
				await assertHostWriterOutsideSetup(pi);
			},
			{ extensions: [lateReload] },
		);
	});

	for (const { label, decide, at, apply } of [
		{
			label: "during the approved nested dispatch",
			decide: () => true,
			at: "nested",
			apply: /the approval for that pstack_apply_task_models call has ended/,
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
					const [raw] = pi.toolResults(WRITER);
					assert.equal(raw.isError, true);
					assert.match(
						raw.text,
						/until this \/setup-pstack run settles, only its approved/,
					);
					assert.match(
						pi.toolResults("test_relay")[0].text,
						/pi-herdr-pstack setup blocked/,
					);
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
					assert.deepEqual(
						runStates(pi),
						["opened", "started", "settled"],
						"the run is recorded as settled once",
					);
					assert.equal(
						pi.session.getActiveToolNames().includes(APPLY_TOOL),
						false,
					);
					await assertHostWriterOutsideSetup(pi);
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
				await assertHostWriterOutsideSetup(pi);
			},
		);
	});

	it("blocks the nested write when the session is replaced between approval and tool_call", async () => {
		const holder: SdkPi[] = [];
		let replacement: Promise<void> | undefined;
		const lateReplace: ExtensionFactory = (api) => {
			api.on("tool_execution_start", (event) => {
				if (event.toolName === WRITER && event.parentToolCallId && !replacement)
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
					/reported an error: (?:Operation aborted|pi-herdr-pstack setup blocked subagents_write_task_models: the setup turn was cancelled)/,
				);
				assert.match(text, /nothing was written/);
				assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				await assertHostWriterOutsideSetup(pi);
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
});

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

describe("setup run identity does not depend on prompt text", needsHost, () => {
	const UNCONFIRMED =
		/could not confirm this run as the \/setup-pstack change flow[\s\S]*run \/setup-pstack (?:<request> )?again/i;

	/** Raw and relayed writes in one run, then an unrelated run. */
	function rawThenRelay(pi: SdkPi) {
		pi.respond([
			fauxAssistantMessage([fauxToolCall(WRITER, RAW)]),
			fauxAssistantMessage([
				fauxToolCall("test_relay", { tool: WRITER, args: RAW }),
			]),
			fauxAssistantMessage([fauxToolCall(APPLY_TOOL, REVIEW_CHANGE)]),
			fauxAssistantMessage("done"),
		]);
	}

	it("keeps a whitespace-normalized setup run protected and able to apply", async () => {
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
				assert.equal(confirmCalls(pi).length, 1, "the dialog was shown");
				const [raw] = pi.toolResults(WRITER);
				assert.equal(raw.isError, true);
				assert.match(raw.text, /until this \/setup-pstack run settles/);
				assert.match(
					pi.toolResults("test_relay")[0].text,
					/pi-herdr-pstack setup blocked/,
				);
				assert.equal(executions.count(), 1, "only the approved write ran");
				assert.deepEqual(
					JSON.parse(readFileSync(pi.configPath, "utf8")).models.tasks,
					{ ...BASE.models.tasks, review: REVIEW_CHANGE.changes.review },
				);
				assert.deepEqual(runStates(pi), ["opened", "started", "settled"]);
				await assertHostWriterOutsideSetup(pi);
			},
			{ extensions: [normalize, relayTool, executions.factory] },
		);
	});

	it("fails closed for a setup run whose run id an input handler removed", async () => {
		const strip: ExtensionFactory = (api) => {
			api.on("input", (event) => ({
				action: "transform" as const,
				text: event.text.replace(
					/\/setup-pstack opened change flow \S+ It ends when this turn settles\./,
					"",
				),
			}));
		};
		const executions = writerExecutions();
		await withHost(
			() => true,
			async (pi) => {
				rawThenRelay(pi);
				await pi.prompt("/setup-pstack review");
				const [raw] = pi.toolResults(WRITER);
				assert.equal(raw.isError, true);
				assert.match(raw.text, UNCONFIRMED);
				const [relay] = pi.toolResults("test_relay");
				assert.match(relay.text, /pi-herdr-pstack setup blocked/);
				assert.match(relay.text, UNCONFIRMED);
				const [apply] = pi.toolResults(APPLY_TOOL);
				assert.equal(apply.isError, true, "no apply authority");
				assert.match(
					apply.text,
					/pstack_apply_task_models not found|No open \/setup-pstack change flow/,
				);
				assert.equal(confirmCalls(pi).length, 0);
				assert.equal(
					pi.notifications().filter((text) => UNCONFIRMED.test(text)).length,
					1,
					"the user is told why",
				);
				assert.equal(executions.count(), 0);
				assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				assert.deepEqual(runStates(pi), ["opened", "started", "settled"]);
				await assertHostWriterOutsideSetup(pi);
			},
			{ extensions: [strip, relayTool, executions.factory] },
		);
	});

	it("settles a run left open by tree navigation, so an unrelated run can write", async () => {
		await withHost(
			() => false,
			async (pi) => {
				pi.armToolCall(WRITER, RAW);
				await pi.prompt("/setup-pstack review");
				assert.equal(pi.toolResults(WRITER)[0].isError, true);
				const branch = pi.session.sessionManager.getBranch();
				const settledAt = branch.findLastIndex(
					(entry) =>
						entry.type === "custom" && entry.customType === RUN_ENTRY_TYPE,
				);
				const before = branch[settledAt - 1];
				assert.equal(
					before.type === "message" && before.message.role,
					"assistant",
					"the settled entry follows the run's last assistant message",
				);
				await pi.session.navigateTree(before.id);
				assert.deepEqual(
					runStates(pi),
					["opened", "started", "settled"],
					"navigation records the run as over on the new branch",
				);
				assert.equal(
					pi.session.getActiveToolNames().includes(APPLY_TOOL),
					false,
				);
				await assertHostWriterOutsideSetup(pi);
				assert.deepEqual(pi.notifications(), []);
			},
		);
	});
});

describe("an unstarted setup reservation", needsHost, () => {
	const consumeSetupPrompt: ExtensionFactory = (api) => {
		api.on("input", (event) =>
			event.text.includes("/setup-pstack opened change flow")
				? { action: "handled" as const }
				: undefined,
		);
	};

	it("fails closed for the next new run once when an input handler consumed the setup message", async () => {
		await withHost(
			() => true,
			async (pi) => {
				await pi.prompt("/setup-pstack review");
				assert.equal(pi.session.messages.length, 0, "no setup run started");
				// pstack cannot tell a consumed setup prompt from a transformed one,
				// so the next new run is protected as the setup run, without apply.
				pi.respond([
					fauxAssistantMessage([fauxToolCall(WRITER, RAW)]),
					fauxAssistantMessage([fauxToolCall(APPLY_TOOL, REVIEW_CHANGE)]),
					fauxAssistantMessage("done"),
				]);
				await pi.prompt("an unrelated request");
				const [blocked] = pi.toolResults(WRITER);
				assert.equal(blocked.isError, true);
				assert.match(blocked.text, /could not confirm this run/);
				assert.equal(pi.toolResults(APPLY_TOOL)[0].isError, true);
				assert.equal(
					pi.notifications().filter((text) => /could not confirm/.test(text))
						.length,
					1,
				);
				assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				assert.equal(confirmCalls(pi).length, 0);
				// Only once: the following run keeps the host's own behavior.
				await assertHostWriterOutsideSetup(pi);
				assert.equal(
					pi.session.getActiveToolNames().includes(APPLY_TOOL),
					false,
				);
			},
			{ extensions: [consumeSetupPrompt] },
		);
	});

	it("does not block a later run triggered by a custom message", async () => {
		await withHost(
			() => true,
			async (pi) => {
				await pi.prompt("/setup-pstack review");
				pi.respond([
					fauxAssistantMessage([fauxToolCall(WRITER, RAW)]),
					fauxAssistantMessage([fauxToolCall(APPLY_TOOL, REVIEW_CHANGE)]),
					fauxAssistantMessage("done"),
				]);
				await pi.session.sendCustomMessage(
					{ customType: "test-trigger", content: "go", display: false },
					{ triggerTurn: true },
				);
				await pi.idle();
				const [result] = pi.toolResults(WRITER);
				assert.equal(result.isError, false, result.text);
				// That run did not claim the reservation, so it has no apply authority.
				const [apply] = pi.toolResults(APPLY_TOOL);
				assert.equal(apply.isError, true);
				assert.match(apply.text, /No open \/setup-pstack change flow/);
				assert.equal(confirmCalls(pi).length, 0);
			},
			{ extensions: [consumeSetupPrompt] },
		);
	});

	it("protects a setup prompt that starts after another run claimed its reservation", async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const slowSetupInput: ExtensionFactory = (api) => {
			api.on("input", async (event) => {
				if (event.text.includes("/setup-pstack opened change flow")) await gate;
			});
		};
		const executions = writerExecutions();
		await withHost(
			() => true,
			async (pi) => {
				await pi.session.prompt("/setup-pstack review");
				// The setup prompt waits in an input handler; another prompt runs first.
				pi.armToolCall(WRITER, RAW);
				await pi.prompt("an unrelated request");
				assert.match(
					pi.toolResults(WRITER)[0].text,
					/could not confirm this run/,
				);
				pi.respond([
					fauxAssistantMessage([fauxToolCall(WRITER, RAW)]),
					fauxAssistantMessage([fauxToolCall(APPLY_TOOL, REVIEW_CHANGE)]),
					fauxAssistantMessage("done"),
				]);
				release();
				// The released prompt starts its own run asynchronously.
				for (let i = 0; i < 200 && pi.toolResults(WRITER).length < 2; i++)
					await pi.idle();
				await pi.idle();
				const [, late] = pi.toolResults(WRITER);
				assert.equal(late.isError, true, "the late setup prompt is protected");
				assert.match(late.text, /could not confirm this run/);
				assert.equal(pi.toolResults(APPLY_TOOL)[0].isError, true);
				assert.equal(confirmCalls(pi).length, 0);
				assert.equal(executions.count(), 0);
				assert.equal(readFileSync(pi.configPath, "utf8"), BASE_TEXT);
				await assertHostWriterOutsideSetup(pi);
			},
			{ extensions: [slowSetupInput, executions.factory] },
		);
	});

	it("still protects a setup prompt that an input handler transformed", async () => {
		const wrap: ExtensionFactory = (api) => {
			api.on("input", (event) => ({
				action: "transform" as const,
				text: `Wrapped by a test.\n\n${event.text}`,
			}));
		};
		const executions = writerExecutions();
		await withHost(
			() => true,
			async (pi) => {
				pi.respond([
					fauxAssistantMessage([fauxToolCall(WRITER, RAW)]),
					fauxAssistantMessage("done"),
				]);
				await pi.prompt("/setup-pstack review");
				const [raw] = pi.toolResults(WRITER);
				assert.equal(raw.isError, true);
				assert.match(raw.text, /until this \/setup-pstack run settles/);
				assert.equal(executions.count(), 0);
				await assertHostWriterOutsideSetup(pi);
			},
			{ extensions: [wrap, executions.factory] },
		);
	});
});
