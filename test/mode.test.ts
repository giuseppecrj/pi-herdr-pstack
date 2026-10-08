import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	HUB_MESSAGE_TYPE,
	hubPresent,
	MODE_ENTRY_TYPE,
	MODE_SECTION,
	modeSection,
	parseModeCommand,
	parseModeEntry,
	reduceMode,
} from "../pi-extension/pstack/mode.ts";
import {
	IsolatedPi,
	type IsolatedPiOptions,
	PACK_ROOT,
	type RequestLogEntry,
	type RpcRecord,
	SKILL_NAMES,
} from "./helpers/rpc.ts";

const HUB = join(PACK_ROOT, "skills", "poteto-mode", "SKILL.md");
const SECTION_TAG = `<${MODE_SECTION}>`;
/** The canonical hub: the file without frontmatter, as every full load carries it. */
const HUB_BODY = readFileSync(HUB, "utf8")
	.replace(/^---\n[\s\S]*?\n---\n/, "")
	.trim();
/** The block Pi builds for `/skill:poteto-mode`, which automatic loading reuses. */
const HUB_BLOCK = `<skill name="poteto-mode" location="${HUB}">\nReferences are relative to ${dirname(HUB)}.\n\n${HUB_BODY}\n</skill>`;
const REMINDER = modeSection(HUB);

function custom(data: unknown, id = "e"): SessionEntry {
	// SAFETY: minimal custom entry shape for the pure reducer.
	return {
		type: "custom",
		customType: MODE_ENTRY_TYPE,
		data,
		id,
		parentId: null,
		timestamp: "2026-10-05T00:00:00.000Z",
	} as SessionEntry;
}

describe("mode record and reducer", () => {
	it("accepts only the exact version 1 shape", () => {
		assert.deepEqual(parseModeEntry({ v: 1, active: true, owner: "s" }), {
			v: 1,
			active: true,
			owner: "s",
		});
		for (const bad of [
			null,
			[],
			"on",
			{ v: 2, active: true, owner: "s" },
			{ v: 1, active: "yes", owner: "s" },
			{ v: 1, active: true, owner: "" },
			{ v: 1, active: true },
			{ v: 1, active: true, owner: "s", extra: 1 },
		])
			assert.equal(parseModeEntry(bad), undefined, JSON.stringify(bad));
	});

	it("follows the latest valid record on the branch and fails closed on invalid ones", () => {
		const on = custom({ v: 1, active: true, owner: "parent" });
		const off = custom({ v: 1, active: false, owner: "parent" });
		assert.equal(reduceMode([], "parent", false).active, false);
		assert.equal(reduceMode([on], "parent", false).active, true);
		assert.equal(reduceMode([on, off], "parent", false).active, false);
		assert.deepEqual(reduceMode([on, custom({ v: 9 })], "parent", false), {
			active: false,
			ignoredInherited: 0,
			invalid: 1,
		});
	});

	it("keeps a user fork's copied records but ignores them in a subagent", () => {
		const parentOn = custom({ v: 1, active: true, owner: "parent" });
		assert.equal(reduceMode([parentOn], "fork", false).active, true);
		assert.deepEqual(reduceMode([parentOn], "child", true), {
			active: false,
			ignoredInherited: 1,
			invalid: 0,
		});
		const childOn = custom({ v: 1, active: true, owner: "child" });
		assert.equal(reduceMode([parentOn, childOn], "child", true).active, true);
	});

	it("parses the documented command forms", () => {
		assert.deepEqual(parseModeCommand(""), { kind: "on" });
		assert.deepEqual(parseModeCommand("  on "), { kind: "on" });
		assert.deepEqual(parseModeCommand("off"), { kind: "off" });
		assert.deepEqual(parseModeCommand("status"), { kind: "status" });
		assert.deepEqual(parseModeCommand("off the record"), {
			kind: "task",
			task: "off the record",
		});
	});
});

describe("hub presence", () => {
	it("needs the complete current hub in text a model reads as input", () => {
		const user = (content: string) => ({
			role: "user" as const,
			content,
			timestamp: 0,
		});
		assert.equal(
			hubPresent(
				[
					{
						role: "custom",
						customType: HUB_MESSAGE_TYPE,
						content: [{ type: "text", text: HUB_BLOCK }],
						display: false,
						timestamp: 0,
					},
				],
				HUB_BODY,
			),
			true,
		);
		assert.equal(hubPresent([user(`${HUB_BODY}\n\ntask`)], HUB_BODY), true);
		assert.equal(
			hubPresent([user(HUB_BODY.slice(0, -1))], HUB_BODY),
			false,
			"a partial copy does not count",
		);
		assert.equal(
			hubPresent(
				[
					{
						role: "compactionSummary",
						summary: HUB_BODY,
						tokensBefore: 0,
						timestamp: 0,
					},
				],
				HUB_BODY,
			),
			false,
			"a summary is not a load",
		);
		assert.equal(
			hubPresent(
				[
					{
						role: "bashExecution",
						command: "cat",
						output: HUB_BODY,
						exitCode: 0,
						cancelled: false,
						truncated: false,
						timestamp: 0,
						excludeFromContext: true,
					},
				],
				HUB_BODY,
			),
			false,
			"`!!` output never reaches the model",
		);
	});
});

function modeEntries(entries: RpcRecord[]): boolean[] {
	return entries
		.filter(
			(entry) =>
				entry.type === "custom" && entry.customType === MODE_ENTRY_TYPE,
		)
		.map((entry) => (entry.data as { active: boolean }).active);
}

/** Saved automatic hub copies; each must be hidden and carry the exact block. */
function hubEntries(entries: RpcRecord[]): number {
	const saved = entries.filter(
		(entry) =>
			entry.type === "custom_message" && entry.customType === HUB_MESSAGE_TYPE,
	);
	for (const entry of saved) {
		assert.equal(entry.display, false, "the saved hub is hidden");
		assert.ok(entry.content === HUB_BLOCK, "the saved hub is the exact block");
	}
	return saved.length;
}

async function entries(pi: IsolatedPi): Promise<RpcRecord[]> {
	const response = await pi.request({ type: "get_entries" });
	// SAFETY: get_entries responses carry data.entries per the Pi 1.0.3 RPC docs.
	return (response.data as { entries: RpcRecord[] }).entries;
}

async function savedHubs(pi: IsolatedPi): Promise<number> {
	return hubEntries(await entries(pi));
}

async function status(pi: IsolatedPi): Promise<string> {
	const from = pi.records.length;
	await pi.prompt("/poteto-mode status");
	return pi.notifications(from).join("\n");
}

/** Agent requests, leaving out Pi's compaction summary requests. */
function agentRequests(pi: IsolatedPi, from = 0): RequestLogEntry[] {
	return pi
		.requests()
		.slice(from)
		.filter(
			(request) =>
				!request.systemPrompt.startsWith(
					"You are a context summarization assistant.",
				),
		);
}

/** A compact, assertion-friendly view of what one request carried. */
type Delivered = { section: boolean; hubs: number; tail: string[] };

function delivered(request: RequestLogEntry, tail = 2): Delivered {
	return {
		section: request.systemPrompt.includes(SECTION_TAG),
		hubs: request.messages.filter(({ text }) => text.includes(HUB_BODY)).length,
		tail: request.messages.slice(-tail).map(({ role, text }) => {
			if (text === HUB_BLOCK) return "HUB";
			if (text === REMINDER) return "REMINDER";
			const short = text.slice(0, 30);
			return text.includes(HUB_BODY)
				? `${role}+hub:${short}`
				: `${role}:${short}`;
		}),
	};
}

/** Prompts and describes the run's single model request. */
async function send(pi: IsolatedPi, text: string, tail = 2) {
	const from = pi.requests().length;
	await pi.prompt(text);
	const requests = agentRequests(pi, from);
	assert.equal(requests.length, 1, `one model request for ${text}`);
	return delivered(requests[0], tail);
}

/** Runs a command and checks that it started no model turn. */
async function command(pi: IsolatedPi, text: string) {
	const from = pi.records.length;
	const requests = pi.requests().length;
	await pi.prompt(text);
	assert.equal(pi.requests().length, requests, `${text} made no request`);
	assert.equal(
		pi.records.slice(from).some((record) => record.type === "agent_start"),
		false,
		`${text} started no turn`,
	);
}

const ON: Omit<Delivered, "tail"> = { section: true, hubs: 1 };

describe("/poteto-mode in the real Pi CLI", () => {
	it("registers both commands and skills from this package", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT] });
		try {
			const response = await pi.request({ type: "get_commands" });
			// SAFETY: get_commands data per the Pi 1.0.3 RPC docs.
			const listed = (
				response.data as {
					commands: Array<{
						name: string;
						source: string;
						sourceInfo: { path: string };
					}>;
				}
			).commands
				.filter(
					(command) =>
						command.sourceInfo.path.startsWith(PACK_ROOT) &&
						!command.sourceInfo.path.includes("/test/fixtures/"),
				)
				.map(({ name, source, sourceInfo }) => [
					name,
					source,
					sourceInfo.path.slice(PACK_ROOT.length + 1),
				]);
			assert.deepEqual(
				listed.toSorted(),
				[
					["poteto-mode", "extension", "pi-extension/pstack/index.ts"],
					["setup-pstack", "extension", "pi-extension/pstack/index.ts"],
					...SKILL_NAMES.map((name) => [
						`skill:${name}`,
						"skill",
						`skills/${name}/SKILL.md`,
					]),
				].toSorted(),
			);
		} finally {
			await pi.close();
		}
	});

	it("starts no work, supplies the hub once on the next prompt, and stops on off", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT], persist: true });
		try {
			assert.deepEqual(await send(pi, "before"), {
				section: false,
				hubs: 0,
				tail: ["user:before"],
			});
			await command(pi, "/poteto-mode");
			await command(pi, "/poteto-mode on");
			await command(pi, "/poteto-mode status");
			assert.deepEqual(modeEntries(await entries(pi)), [true]);
			assert.equal(await savedHubs(pi), 0, "enabling adds no context");
			assert.match(await status(pi), /poteto-mode: on \(persisted/);

			assert.deepEqual(await send(pi, "first"), {
				...ON,
				tail: ["user:first", "HUB"],
			});
			assert.equal(await savedHubs(pi), 1);
			const prompt = agentRequests(pi).at(-1)?.systemPrompt ?? "";
			assert.ok(prompt.includes(REMINDER), "the section is the reminder");
			assert.ok(REMINDER.includes(HUB), "it names the owned hub file");
			assert.ok(REMINDER.length < 1000, `reminder is ${REMINDER.length}`);
			assert.doesNotMatch(prompt, /## Principles/);
			for (const text of ["second", "third"])
				assert.deepEqual(await send(pi, text), {
					...ON,
					tail: ["assistant:ok", `user:${text}`],
				});
			assert.equal(await savedHubs(pi), 1, "later prompts add no copy");

			await command(pi, "/poteto-mode off");
			await command(pi, "/poteto-mode off");
			assert.deepEqual(modeEntries(await entries(pi)), [true, false]);
			assert.deepEqual(
				await send(pi, "after off"),
				{ section: false, hubs: 1, tail: ["assistant:ok", "user:after off"] },
				"earlier context is unchanged",
			);
			await command(pi, "/poteto-mode");
			assert.deepEqual(await send(pi, "on again"), {
				...ON,
				tail: ["assistant:ok", "user:on again"],
			});
			assert.equal(await savedHubs(pi), 1, "the retained hub is not repeated");
		} finally {
			await pi.close();
		}
	});

	it("treats /skill:poteto-mode as a one-time load, never sticky, and never doubles it", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT] });
		try {
			assert.deepEqual(await send(pi, "/skill:poteto-mode explain the mode"), {
				section: false,
				hubs: 1,
				tail: ['user+hub:<skill name="poteto-mode" loca'],
			});
			assert.deepEqual(modeEntries(await entries(pi)), []);
			assert.equal((await send(pi, "next")).section, false);

			await command(pi, "/poteto-mode");
			assert.deepEqual(await send(pi, "while on"), {
				...ON,
				tail: ["assistant:ok", "user:while on"],
			});
			assert.deepEqual(await send(pi, "/skill:poteto-mode again"), {
				section: true,
				hubs: 2,
				tail: ["assistant:ok", 'user+hub:<skill name="poteto-mode" loca'],
			});
			assert.equal(await savedHubs(pi), 0, "no automatic copy was needed");
		} finally {
			await pi.close();
		}
	});

	it("sends the task form as one full-skill prompt, or only the task when the hub is loaded", async () => {
		for (const settings of [{}, { enableSkillCommands: false }]) {
			const pi = new IsolatedPi({ packages: [PACK_ROOT], settings });
			try {
				const label = JSON.stringify(settings);
				await pi.prompt("/poteto-mode fix the flaky login test");
				const requests = pi.requests();
				assert.equal(requests.length, 1, `exactly one model turn ${label}`);
				assert.ok(
					requests[0].user === `${HUB_BLOCK}\n\nfix the flaky login test`,
					`the literal full-skill prompt ${label}`,
				);
				assert.deepEqual(delivered(requests[0]), {
					...ON,
					tail: ['user+hub:<skill name="poteto-mode" loca'],
				});
				assert.deepEqual(modeEntries(await entries(pi)), [true]);
				assert.equal(await savedHubs(pi), 0, label);
				assert.deepEqual(await send(pi, "/poteto-mode and the logout test"), {
					...ON,
					tail: ["assistant:ok", "user:and the logout test"],
				});
				assert.equal(await savedHubs(pi), 0, label);
			} finally {
				await pi.close();
			}
		}
	});

	it("recognizes a full read of the hub, but not a partial one", async () => {
		for (const [args, saved] of [
			[{ path: HUB }, 0],
			[{ path: HUB, limit: 20 }, 1],
		] as const) {
			const pi = new IsolatedPi({ packages: [PACK_ROOT] });
			try {
				await pi.prompt(`/test-arm-tool read ${JSON.stringify(args)}`);
				await pi.prompt("read the hub");
				await command(pi, "/poteto-mode");
				const next = await send(pi, "next", 1);
				assert.deepEqual(next, {
					...ON,
					tail: saved ? ["HUB"] : ["user:next"],
				});
				assert.equal(await savedHubs(pi), saved, JSON.stringify(args));
			} finally {
				await pi.close();
			}
		}
	});

	it("reports memory-only persistence without a session file and still loads", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT] });
		try {
			await command(pi, "/poteto-mode");
			assert.match(await status(pi), /on \(memory-only/);
			assert.deepEqual(await send(pi, "go"), {
				...ON,
				tail: ["user:go", "HUB"],
			});
		} finally {
			await pi.close();
		}
	});

	it("refuses the task form while busy and changes only the next prompt mid-turn", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT], persist: true });
		/** Starts a held run, applies `during`, steers, and returns the run's requests. */
		async function heldRun(text: string, during: string[]) {
			await pi.prompt("/test-hold 1500");
			const from = pi.records.length;
			const first = pi.requests().length;
			const started = pi.send({ type: "prompt", message: text });
			await pi.waitFor(
				(record) => record.type === "response" && record.id === started,
				from,
			);
			await pi.waitFor((record) => record.type === "agent_start", from);
			for (const message of during) {
				const response = await pi.request({ type: "prompt", message });
				assert.equal(response.success, true);
			}
			await pi.request({ type: "steer", message: `steer ${text}` });
			await pi.waitFor((record) => record.type === "agent_settled", from);
			return {
				notes: pi.notifications(from),
				requests: agentRequests(pi, first).map((request) =>
					delivered(request, 1),
				),
			};
		}
		try {
			const enabled = await heldRun("off at start", ["/poteto-mode"]);
			assert.deepEqual(
				enabled.requests,
				[
					{ section: false, hubs: 0, tail: ["user:off at start"] },
					{ section: false, hubs: 0, tail: ["user:steer off at start"] },
				],
				"enabling mid-run waits for the next prompt",
			);
			assert.deepEqual(await send(pi, "next", 1), { ...ON, tail: ["HUB"] });

			const disabled = await heldRun("on at start", [
				"/poteto-mode fix X",
				"/poteto-mode off",
			]);
			assert.ok(
				disabled.notes.some((text) =>
					text.startsWith("poteto-mode task not started"),
				),
			);
			assert.deepEqual(
				disabled.requests,
				[
					{ ...ON, tail: ["user:on at start"] },
					{ ...ON, tail: ["user:steer on at start"] },
				],
				"no queued task; the running turn keeps the mode it started with",
			);
			assert.deepEqual(await send(pi, "after", 1), {
				section: false,
				hubs: 1,
				tail: ["user:after"],
			});
			assert.equal(await savedHubs(pi), 1);
		} finally {
			await pi.close();
		}
	});

	it("diagnoses a filtered or shadowed skill instead of enabling", async () => {
		const shadowRoot = join(PACK_ROOT, "test", "fixtures", "shadow-skills");
		const cases: Array<[string, IsolatedPiOptions]> = [
			["filtered", { packages: [{ source: PACK_ROOT, skills: [] }] }],
			[
				"shadowed",
				{ packages: [PACK_ROOT], settings: { skills: [shadowRoot] } },
			],
		];
		for (const [label, options] of cases) {
			const pi = new IsolatedPi(options);
			try {
				const from = pi.records.length;
				await pi.prompt("/poteto-mode");
				await pi.prompt("/poteto-mode do the task");
				const notes = pi.notifications(from);
				assert.equal(notes.length, 2, label);
				for (const note of notes)
					assert.match(
						note,
						label === "filtered"
							? /^poteto-mode was not enabled\. poteto-mode: not loaded/
							: /^poteto-mode was not enabled\. poteto-mode: shadowed by .*shadow-skills/,
					);
				assert.deepEqual(modeEntries(await entries(pi)), [], label);
				assert.deepEqual(pi.requests(), [], label);
			} finally {
				await pi.close();
			}
		}
	});

	it("adds nothing when a branch that is on loses the owned skill", async () => {
		const shadowRoot = join(PACK_ROOT, "test", "fixtures", "shadow-skills");
		const first = new IsolatedPi({ packages: [PACK_ROOT], persist: true });
		const root = first.root;
		let file: string;
		try {
			// Pi writes the session file once it holds an assistant message.
			await send(first, "before");
			await command(first, "/poteto-mode");
			file = await sessionFileOf(first);
		} finally {
			await first.close({ keepRoot: true });
		}
		try {
			const cases: Array<[string, IsolatedPiOptions]> = [
				["filtered", { packages: [{ source: PACK_ROOT, skills: [] }] }],
				[
					"shadowed",
					{ packages: [PACK_ROOT], settings: { skills: [shadowRoot] } },
				],
			];
			for (const [label, options] of cases) {
				const pi = new IsolatedPi({ ...options, root, sessionFile: file });
				try {
					const from = pi.records.length;
					assert.deepEqual(await send(pi, `prompt ${label}`, 1), {
						section: false,
						hubs: 0,
						tail: [`user:prompt ${label}`],
					});
					assert.match(
						pi.notifications(from).join("\n"),
						/poteto-mode is on, but no guidance was added/,
					);
					assert.deepEqual(await send(pi, `/test-wake wake ${label}`, 1), {
						section: false,
						hubs: 0,
						tail: [`user:wake ${label}`],
					});
				} finally {
					await pi.close();
				}
			}
			const reader = new IsolatedPi({
				packages: [PACK_ROOT],
				root,
				sessionFile: file,
			});
			try {
				assert.equal(await savedHubs(reader), 0);
			} finally {
				await reader.close();
			}
		} finally {
			IsolatedPi.removeRoot(root);
		}
	});
});

function sessionFileOf(pi: IsolatedPi) {
	return pi.request({ type: "get_state" }).then((response) => {
		// SAFETY: get_state data per the Pi 1.0.3 RPC docs.
		const file = (response.data as { sessionFile?: string }).sessionFile;
		assert.ok(file);
		return file;
	});
}

/** Fills the context with tool output, each call 30 000 characters. */
function bigTools(count: number): string {
	return `/test-arm-tools ${JSON.stringify([
		...Array.from({ length: count }, (_, index) => [
			"bash",
			{ command: `head -c 30000 /dev/zero | tr '\\0' ${"abc"[index]}` },
		]),
		["bash", { command: "echo small" }],
	])}`;
}

describe("hub loading across compaction and wakes", () => {
	it("keeps or restores the hub after manual compaction", async () => {
		const pi = new IsolatedPi({
			packages: [PACK_ROOT],
			persist: true,
			settings: { compaction: { keepRecentTokens: 5, reserveTokens: 100 } },
		});
		try {
			await command(pi, "/poteto-mode");
			await send(pi, "one");
			assert.equal((await pi.request({ type: "compact" })).success, true);
			assert.deepEqual(
				await send(pi, "retained", 4),
				{
					...ON,
					tail: [
						"user:The conversation history befor",
						"HUB",
						"assistant:ok",
						"user:retained",
					],
				},
				"the kept range still holds the saved hub",
			);
			assert.equal(await savedHubs(pi), 1);

			await send(pi, `filler ${"filler ".repeat(400)}`);
			assert.equal((await pi.request({ type: "compact" })).success, true);
			assert.deepEqual(await send(pi, "evicted", 2), {
				...ON,
				tail: ["user:evicted", "HUB"],
			});
			assert.equal(await savedHubs(pi), 2, "one copy restores it");
			assert.deepEqual(await send(pi, "later"), {
				...ON,
				tail: ["assistant:ok", "user:later"],
			});
			assert.equal(await savedHubs(pi), 2);
		} finally {
			await pi.close();
		}
	});

	it("restores the hub for every request after automatic compaction inside a run", async () => {
		const pi = new IsolatedPi({
			packages: [PACK_ROOT],
			persist: true,
			// Compacts above 20 000 tokens and keeps almost nothing.
			settings: { compaction: { keepRecentTokens: 5, reserveTokens: 80_000 } },
		});
		try {
			await command(pi, "/poteto-mode");
			await send(pi, "go");
			await pi.prompt(bigTools(2));
			const from = pi.requests().length;
			const records = await pi.prompt("work");
			const run = agentRequests(pi, from);
			const compactions = records.filter(
				(record) =>
					record.type === "compaction_start" && record.reason === "threshold",
			).length;
			assert.ok(compactions >= 2, `threshold compactions: ${compactions}`);
			assert.equal(run.length, 4, "three tool turns and a final answer only");
			for (const [index, request] of run.entries())
				assert.equal(delivered(request).hubs, 1, `request ${index}`);
			const restored = run.filter(
				(request) =>
					request.messages[0]?.text.startsWith(
						"The conversation history before this point was compacted",
					) && request.messages[1]?.text === HUB_BLOCK,
			).length;
			assert.ok(restored >= 2, `requests with a restored hub: ${restored}`);
			assert.equal(
				await savedHubs(pi),
				1,
				"the restored copies are request-only",
			);
			assert.equal(
				records.filter((record) => record.type === "agent_settled").length,
				1,
				"no unsolicited extra run",
			);

			assert.deepEqual(await send(pi, "after"), {
				...ON,
				tail: ["user:after", "HUB"],
			});
			assert.equal(await savedHubs(pi), 2, "the next prompt saves one copy");
			assert.equal((await send(pi, "after again")).hubs, 1);
			assert.equal(await savedHubs(pi), 2);
		} finally {
			await pi.close();
		}
	});

	it("does not carry mode from failed prompt preparation into a wake", async () => {
		for (const transition of ["on", "off", "new session"]) {
			const pi = new IsolatedPi({ packages: [PACK_ROOT], persist: true });
			try {
				if (transition !== "on") await command(pi, "/poteto-mode on");
				const from = pi.records.length;
				const response = await pi.request({
					type: "prompt",
					message: "invalid image",
					images: [{ type: "image", data: null, mimeType: "image/png" }],
				});
				assert.equal(response.success, false, "image preparation failed");
				assert.match(String(response.error), /Received null/);
				assert.equal(pi.requests().length, 0, "no model request started");
				assert.equal(
					pi.records
						.slice(from)
						.some((record) => record.type === "agent_start"),
					false,
				);
				if (transition === "new session")
					assert.equal(
						(await pi.request({ type: "new_session" })).success,
						true,
					);
				else await command(pi, `/poteto-mode ${transition}`);
				assert.deepEqual(await send(pi, "/test-wake child complete", 1), {
					section: false,
					hubs: transition === "on" ? 1 : 0,
					tail: transition === "on" ? ["REMINDER"] : ["user:child complete"],
				});
				assert.equal(await savedHubs(pi), 0, "wake additions are request-only");
			} finally {
				await pi.close();
			}
		}
	});

	it("keeps the mode in runs started by an extension message", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT], persist: true });
		try {
			assert.deepEqual(await send(pi, "/test-wake while off", 1), {
				section: false,
				hubs: 0,
				tail: ["user:while off"],
			});
			await command(pi, "/poteto-mode");
			await send(pi, "one");
			await pi.prompt(bigTools(0));
			const from = pi.requests().length;
			await pi.prompt("/test-wake child done");
			const wake = agentRequests(pi, from);
			assert.equal(wake.length, 2, "one tool turn and a final answer");
			assert.deepEqual(
				wake.map((request) => delivered(request, 1)),
				[
					{ section: true, hubs: 1, tail: ["REMINDER"] },
					{ section: false, hubs: 1, tail: ["REMINDER"] },
				],
				"Pi drops the section after the first wake turn; the request-only reminder stays",
			);
			assert.equal(await savedHubs(pi), 1);
			assert.deepEqual(await send(pi, "after"), {
				...ON,
				tail: ["assistant:done", "user:after"],
			});
		} finally {
			await pi.close();
		}
	});
});

describe("mode across Pi session transitions", () => {
	it("follows tree navigation, compaction, reload, clone, fork, new session and resume", async () => {
		const pi = new IsolatedPi({
			packages: [PACK_ROOT],
			persist: true,
			// Small budgets so a few prompts are enough to compact.
			settings: { compaction: { keepRecentTokens: 5, reserveTokens: 100 } },
		});
		try {
			await send(pi, "first");
			await command(pi, "/poteto-mode");
			const onRecord = String((await entries(pi)).at(-1)?.id);
			assert.deepEqual(await send(pi, `second ${"filler ".repeat(400)}`), {
				...ON,
				tail: ["user:second filler filler filler fi", "HUB"],
			});
			const original = await sessionFileOf(pi);
			const all = await entries(pi);
			const firstUser = all.find(
				(entry) =>
					entry.type === "message" &&
					(entry.message as { role: string }).role === "user",
			);
			const leaf = String(all.at(-1)?.id);
			await pi.prompt(`/test-nav ${String(firstUser?.id)}`);
			assert.match(await status(pi), /poteto-mode: off/, "before activation");
			await pi.prompt(`/test-nav ${onRecord}`);
			assert.deepEqual(
				await send(pi, "other branch"),
				{ ...ON, tail: ["user:other branch", "HUB"] },
				"a branch without the hub gets its own copy",
			);
			assert.equal(await savedHubs(pi), 2);
			await pi.prompt(`/test-nav ${leaf}`);
			assert.match(await status(pi), /poteto-mode: on/, "back on the leaf");
			assert.deepEqual(await send(pi, "back"), {
				...ON,
				tail: ["assistant:ok", "user:back"],
			});

			const compacted = await pi.request({ type: "compact" });
			assert.equal(compacted.success, true, JSON.stringify(compacted));
			assert.match(await status(pi), /poteto-mode: on/, "after compaction");
			const before = await savedHubs(pi);
			assert.deepEqual(await send(pi, "after compact"), {
				...ON,
				tail: ["assistant:ok", "user:after compact"],
			});
			assert.equal(await savedHubs(pi), before, "the cut kept the saved hub");

			await command(pi, "/test-reload");
			assert.match(await status(pi), /poteto-mode: on/, "after reload");
			assert.deepEqual(await send(pi, "after reload"), {
				...ON,
				tail: ["assistant:ok", "user:after reload"],
			});
			const saved = await savedHubs(pi);

			assert.equal((await pi.request({ type: "clone" })).success, true);
			assert.notEqual(await sessionFileOf(pi), original);
			assert.match(await status(pi), /poteto-mode: on/, "user clone keeps it");
			assert.deepEqual(await send(pi, "in clone"), {
				...ON,
				tail: ["assistant:ok", "user:in clone"],
			});
			assert.equal(
				await savedHubs(pi),
				1,
				"the clone copies only the active branch, with its one hub",
			);

			const forks = await pi.request({ type: "get_fork_messages" });
			// SAFETY: get_fork_messages data per the Pi 1.0.3 RPC docs.
			const [firstMessage] = (
				forks.data as { messages: Array<{ entryId: string }> }
			).messages;
			assert.equal(
				(await pi.request({ type: "fork", entryId: firstMessage.entryId }))
					.success,
				true,
			);
			assert.match(
				await status(pi),
				/poteto-mode: off/,
				"fork before activation",
			);
			assert.deepEqual(await send(pi, "in fork", 1), {
				section: false,
				hubs: 0,
				tail: ["user:in fork"],
			});

			assert.equal((await pi.request({ type: "new_session" })).success, true);
			assert.match(await status(pi), /poteto-mode: off/, "new session");
			assert.deepEqual(await send(pi, "new", 1), {
				section: false,
				hubs: 0,
				tail: ["user:new"],
			});

			assert.equal(
				(await pi.request({ type: "switch_session", sessionPath: original }))
					.success,
				true,
			);
			assert.match(await status(pi), /poteto-mode: on/, "resumed original");
			assert.deepEqual(await send(pi, "resumed"), {
				...ON,
				tail: ["assistant:ok", "user:resumed"],
			});
			assert.equal(await savedHubs(pi), saved);
		} finally {
			await pi.close();
		}
	});

	it("ignores a parent's copied record in a subagent, keeps the child's own across resume", async () => {
		const parent = new IsolatedPi({ packages: [PACK_ROOT], persist: true });
		const root = parent.root;
		let parentFile: string;
		try {
			await parent.prompt("parent work");
			await parent.prompt("/poteto-mode");
			await parent.prompt("parent work 2");
			parentFile = await sessionFileOf(parent);
		} finally {
			await parent.close({ keepRoot: true });
		}
		try {
			// Emulates pi-herdr-agents fork seeding: a new header, copied entries.
			const lines = readFileSync(parentFile, "utf8")
				.split("\n")
				.filter(Boolean);
			const [header, ...body] = lines.map((line) => JSON.parse(line));
			assert.equal(header.type, "session");
			const childFile = join(root, "agent", "sessions", "child.jsonl");
			mkdirSync(join(root, "agent", "sessions"), { recursive: true });
			writeFileSync(
				childFile,
				`${[
					{
						...header,
						id: "01a10000-0000-7000-8000-00000000c0de",
						parentSession: parentFile,
					},
					...body,
				]
					.map((entry) => JSON.stringify(entry))
					.join("\n")}\n`,
			);
			assert.deepEqual(modeEntries(body), [true]);
			assert.equal(hubEntries(body), 1, "the parent saved one copy");

			const child = new IsolatedPi({
				packages: [PACK_ROOT],
				root,
				sessionFile: childFile,
				env: { PI_SUBAGENT_ID: "child-launch-1" },
			});
			try {
				const text = await status(child);
				assert.match(text, /poteto-mode: off/);
				assert.match(text, /1 copied parent record\(s\) ignored/);
				assert.deepEqual(
					await send(child, "child task"),
					{
						section: false,
						hubs: 1,
						tail: ["assistant:ok", "user:child task"],
					},
					"only the copied history carries the hub",
				);
				await command(child, "/poteto-mode");
				assert.deepEqual(
					await send(child, "child task 2"),
					{ ...ON, tail: ["assistant:ok", "user:child task 2"] },
					"the copied full hub is not repeated",
				);
				assert.equal(await savedHubs(child), 1);
			} finally {
				await child.close();
			}
			const resumed = new IsolatedPi({
				packages: [PACK_ROOT],
				root,
				sessionFile: childFile,
				env: { PI_SUBAGENT_ID: "child-launch-2" },
			});
			try {
				assert.match(await status(resumed), /poteto-mode: on/);
				assert.equal((await send(resumed, "resumed child")).section, true);
			} finally {
				await resumed.close();
			}
			const userFork = new IsolatedPi({
				packages: [PACK_ROOT],
				root,
				sessionFile: childFile,
			});
			try {
				assert.match(
					await status(userFork),
					/poteto-mode: on/,
					"outside a subagent, copied history applies like a user fork",
				);
			} finally {
				await userFork.close();
			}
		} finally {
			IsolatedPi.removeRoot(root);
		}
	});
});
