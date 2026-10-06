import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	MODE_ENTRY_TYPE,
	MODE_SECTION,
	parseModeCommand,
	parseModeEntry,
	reduceMode,
} from "../pi-extension/pstack/mode.ts";
import {
	IsolatedPi,
	type IsolatedPiOptions,
	PACK_ROOT,
	type RpcRecord,
} from "./helpers/rpc.ts";

const HUB = join(PACK_ROOT, "skills", "poteto-mode", "SKILL.md");
const SECTION_TAG = `<${MODE_SECTION}>`;

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

function modeEntries(entries: RpcRecord[]): boolean[] {
	return entries
		.filter(
			(entry) =>
				entry.type === "custom" && entry.customType === MODE_ENTRY_TYPE,
		)
		.map((entry) => (entry.data as { active: boolean }).active);
}

async function entries(pi: IsolatedPi): Promise<RpcRecord[]> {
	const response = await pi.request({ type: "get_entries" });
	// SAFETY: get_entries responses carry data.entries per the Pi 1.0.3 RPC docs.
	return (response.data as { entries: RpcRecord[] }).entries;
}

async function status(pi: IsolatedPi): Promise<string> {
	const from = pi.records.length;
	await pi.prompt("/poteto-mode status");
	return pi.notifications(from).join("\n");
}

/** Whether the latest model request carried the mode section. */
async function nextPromptHasSection(pi: IsolatedPi, text: string) {
	await pi.prompt(text);
	const request = pi.requests().at(-1);
	assert.ok(request, "a model request was made");
	assert.equal(request.user, text);
	return request.systemPrompt.includes(SECTION_TAG);
}

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
			assert.deepEqual(listed.toSorted(), [
				["poteto-mode", "extension", "pi-extension/pstack/index.ts"],
				["setup-pstack", "extension", "pi-extension/pstack/index.ts"],
				["skill:poteto-mode", "skill", "skills/poteto-mode/SKILL.md"],
				["skill:setup-pstack", "skill", "skills/setup-pstack/SKILL.md"],
			]);
		} finally {
			await pi.close();
		}
	});

	it("enables idempotently, adds a short section with the hub path, and turns off for the next prompt", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT], persist: true });
		try {
			assert.equal(await nextPromptHasSection(pi, "before"), false);
			await pi.prompt("/poteto-mode");
			await pi.prompt("/poteto-mode on");
			assert.deepEqual(modeEntries(await entries(pi)), [true]);
			assert.match(await status(pi), /poteto-mode: on \(persisted/);
			assert.equal(await nextPromptHasSection(pi, "while on"), true);
			const prompt = pi.requests().at(-1)?.systemPrompt ?? "";
			const section = prompt.slice(prompt.indexOf(SECTION_TAG));
			assert.ok(section.includes(HUB), "section names the owned hub file");
			assert.ok(
				section.length < 800,
				"the reminder is short, not the skill body",
			);
			assert.doesNotMatch(section, /## Principles/);
			await pi.prompt("/poteto-mode off");
			await pi.prompt("/poteto-mode off");
			assert.deepEqual(modeEntries(await entries(pi)), [true, false]);
			assert.equal(await nextPromptHasSection(pi, "after off"), false);
		} finally {
			await pi.close();
		}
	});

	it("treats /skill:poteto-mode as a one-time load, never sticky", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT] });
		try {
			await pi.prompt("/skill:poteto-mode explain the mode");
			const request = pi.requests().at(-1);
			assert.ok(request?.user.startsWith('<skill name="poteto-mode"'));
			assert.equal(request?.systemPrompt.includes(SECTION_TAG), false);
			assert.deepEqual(modeEntries(await entries(pi)), []);
			assert.equal(await nextPromptHasSection(pi, "next"), false);
		} finally {
			await pi.close();
		}
	});

	for (const settings of [{}, { enableSkillCommands: false }])
		it(`sends the task form as one literal full-skill prompt (${JSON.stringify(settings)})`, async () => {
			const pi = new IsolatedPi({ packages: [PACK_ROOT], settings });
			try {
				await pi.prompt("/poteto-mode fix the flaky login test");
				const requests = pi.requests();
				assert.equal(requests.length, 1, "exactly one model turn");
				const body = readFileSync(HUB, "utf8").replace(
					/^---\n[\s\S]*?\n---\n/,
					"",
				);
				assert.equal(
					requests[0].user,
					`<skill name="poteto-mode" location="${HUB}">\nReferences are relative to ${join(PACK_ROOT, "skills", "poteto-mode")}.\n\n${body.trim()}\n</skill>\n\nfix the flaky login test`,
				);
				assert.equal(requests[0].systemPrompt.includes(SECTION_TAG), true);
				assert.deepEqual(modeEntries(await entries(pi)), [true]);
			} finally {
				await pi.close();
			}
		});

	it("reports memory-only persistence without a session file", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT] });
		try {
			await pi.prompt("/poteto-mode");
			assert.match(await status(pi), /on \(memory-only/);
		} finally {
			await pi.close();
		}
	});

	it("refuses the task form while busy and changes only the next prompt mid-turn", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT], persist: true });
		try {
			await pi.prompt("/poteto-mode");
			await pi.prompt("/test-hold 1500");
			const from = pi.records.length;
			const started = pi.send({ type: "prompt", message: "long turn" });
			await pi.waitFor(
				(record) => record.type === "response" && record.id === started,
				from,
			);
			await pi.waitFor((record) => record.type === "agent_start", from);
			const busy = await pi.request({
				type: "prompt",
				message: "/poteto-mode fix X",
			});
			assert.equal(busy.success, true);
			await pi.request({ type: "prompt", message: "/poteto-mode off" });
			await pi.request({ type: "steer", message: "also check Y" });
			await pi.waitFor((record) => record.type === "agent_settled", from);
			assert.ok(
				pi
					.notifications(from)
					.some((text) => text.startsWith("poteto-mode task not started")),
			);
			const turn = pi.requests();
			assert.deepEqual(
				turn.map(({ user, systemPrompt }) => [
					user,
					systemPrompt.includes(SECTION_TAG),
				]),
				[
					["long turn", true],
					["also check Y", true],
				],
				"no queued task; the running turn keeps the prompt it started with",
			);
			assert.equal(await nextPromptHasSection(pi, "next prompt"), false);
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
});

function sessionFileOf(pi: IsolatedPi) {
	return pi.request({ type: "get_state" }).then((response) => {
		// SAFETY: get_state data per the Pi 1.0.3 RPC docs.
		const file = (response.data as { sessionFile?: string }).sessionFile;
		assert.ok(file);
		return file;
	});
}

describe("mode across Pi session transitions", () => {
	it("follows tree navigation, compaction, clone, fork, new session and resume", async () => {
		const pi = new IsolatedPi({
			packages: [PACK_ROOT],
			persist: true,
			// Small budgets so a few prompts are enough to compact.
			settings: { compaction: { keepRecentTokens: 5, reserveTokens: 100 } },
		});
		try {
			await pi.prompt("first");
			await pi.prompt("/poteto-mode");
			await pi.prompt(`second ${"filler ".repeat(400)}`);
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
			await pi.prompt(`/test-nav ${leaf}`);
			assert.match(await status(pi), /poteto-mode: on/, "back on the leaf");

			const compacted = await pi.request({ type: "compact" });
			assert.equal(compacted.success, true, JSON.stringify(compacted));
			assert.match(await status(pi), /poteto-mode: on/, "after compaction");
			assert.equal(await nextPromptHasSection(pi, "after compact"), true);

			assert.equal((await pi.request({ type: "clone" })).success, true);
			assert.notEqual(await sessionFileOf(pi), original);
			assert.match(await status(pi), /poteto-mode: on/, "user clone keeps it");

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

			assert.equal((await pi.request({ type: "new_session" })).success, true);
			assert.match(await status(pi), /poteto-mode: off/, "new session");

			assert.equal(
				(await pi.request({ type: "switch_session", sessionPath: original }))
					.success,
				true,
			);
			assert.match(await status(pi), /poteto-mode: on/, "resumed original");
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
				assert.equal(await nextPromptHasSection(child, "child task"), false);
				await child.prompt("/poteto-mode");
				assert.equal(await nextPromptHasSection(child, "child task 2"), true);
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
