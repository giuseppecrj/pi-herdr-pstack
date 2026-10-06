import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
	configuredHostRoot,
	IsolatedPi,
	PACK_ROOT,
	SKILL_NAMES,
} from "./helpers/rpc.ts";

const GENERIC_ROLES = [
	"adversarial-reviewer",
	"planner",
	"reviewer",
	"scout",
	"visual-tester",
	"worker",
];
const RETIRED_COMMANDS = ["iterate", "btw", "btw-close"];
const LEGACY_CONFIG = JSON.stringify({
	status: { enabled: true },
	roles: { bundled: false },
});

type CommandInfo = { name: string; path: string };

async function commands(pi: IsolatedPi): Promise<CommandInfo[]> {
	const response = await pi.request({ type: "get_commands" });
	assert.equal(response.success, true);
	// SAFETY: get_commands responses carry data.commands per the Pi 1.0.3 RPC docs.
	const data = response.data as {
		commands: Array<{ name: string; sourceInfo: { path: string } }>;
	};
	return data.commands.map(({ name, sourceInfo }) => ({
		name,
		path: sourceInfo.path,
	}));
}

async function listedRoles(pi: IsolatedPi): Promise<string> {
	await pi.request({ type: "prompt", message: "/test-arm-subagents-list" });
	const from = pi.records.length;
	await pi.request({ type: "prompt", message: "list roles" });
	const end = await pi.waitFor(
		(record) =>
			record.type === "tool_execution_end" &&
			record.toolName === "subagents_list",
		from,
	);
	await pi.waitFor((record) => record.type === "agent_settled", from);
	// SAFETY: tool_execution_end records carry the tool result content blocks.
	const result = end.result as { content: Array<{ text?: string }> };
	return result.content.map((part) => part.text ?? "").join("");
}

/** Role lines from subagents_list, e.g. "scout (package:pi-herdr-roles)". */
function roleLines(listing: string): string[] {
	return [...listing.matchAll(/^• (\S+ \([^)]+\))/gm)]
		.map((match) => match[1])
		.toSorted();
}

const OWN_COMMANDS = ["poteto-mode", "setup-pstack"];

describe("installed pack without pi-herdr-agents", () => {
	it("registers only its two commands and its skills, without host diagnostics", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT] });
		try {
			const owned = (await commands(pi)).filter(
				(command) =>
					command.path.startsWith(`${PACK_ROOT}/`) &&
					!command.path.includes("/test/fixtures/"),
			);
			assert.deepEqual(owned.map(({ name }) => name).toSorted(), [
				...OWN_COMMANDS,
				...SKILL_NAMES.map((name) => `skill:${name}`),
			]);
			assert.equal(pi.stderr, "");
		} finally {
			await pi.close();
		}
	});
});

const hostRoot = configuredHostRoot();
const legacyHostRoot = configuredHostRoot("PI_HERDR_AGENTS_LEGACY_HOST");
const rolesPack = process.env.PI_HERDR_ROLES_PACK
	? resolve(process.env.PI_HERDR_ROLES_PACK)
	: undefined;

function assertNoCommandCollisions(listed: CommandInfo[]) {
	const names = listed.map((command) => command.name);
	assert.equal(new Set(names).size, names.length, "duplicate commands");
	assert.equal(
		names.some((name) => /:\d+$/.test(name)),
		false,
		"no Pi duplicate-command suffixes",
	);
	for (const retired of RETIRED_COMMANDS)
		assert.equal(names.includes(retired), false, `retired /${retired}`);
	assert.deepEqual(
		listed
			.filter((command) =>
				command.path.startsWith(`${PACK_ROOT}/pi-extension/`),
			)
			.map(({ name }) => name)
			.toSorted(),
		OWN_COMMANDS,
		"pstack registers exactly its two commands",
	);
}

// Role-free expectations always apply to PI_HERDR_AGENTS_HOST; a legacy host
// must fail here rather than loosen them. Legacy characterization is opt-in below.
describe("installed pack with a real role-free pi-herdr-agents host", {
	skip:
		hostRoot === undefined &&
		"set PI_HERDR_AGENTS_HOST=<host package root> to run combined-host checks",
}, () => {
	it("lists no roles, since pstack contributes none, with no collisions or retired commands", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT, hostRoot ?? ""] });
		try {
			const listing = await listedRoles(pi);
			assert.deepEqual(roleLines(listing), [], listing);
			assert.match(listing, /^Supervision: /m, "the host listed its catalog");
			assert.doesNotMatch(listing, /^!/m, "no role diagnostics expected");
			const listed = await commands(pi);
			assertNoCommandCollisions(listed);
			assert.equal(
				listed.some((command) => /^plan(:\d+)?$/.test(command.name)),
				false,
				"a role-free host registers no /plan",
			);
		} finally {
			await pi.close();
		}
	});

	for (const confirmed of [true, false])
		it(`applies /setup-pstack only after the RPC dialog is ${confirmed ? "accepted" : "declined"}`, async () => {
			const config = `${JSON.stringify({
				status: { enabled: false },
				keep: { me: true },
				models: { tasks: { coding: ["faux/faux-1"] } },
			})}\n`;
			const pi = new IsolatedPi({
				packages: [PACK_ROOT, hostRoot ?? ""],
				herdrAgentsConfig: config,
			});
			const path = join(pi.agentDir, "herdr-agents", "config.json");
			try {
				await pi.prompt(
					`/test-arm-tool pstack_apply_task_models ${JSON.stringify({ changes: { review: ["faux/faux-2"] } })}`,
				);
				const from = pi.records.length;
				pi.send({
					type: "prompt",
					message: "/setup-pstack use faux-2 for review",
				});
				const dialog = await pi.waitFor(
					(record) =>
						record.type === "extension_ui_request" &&
						record.method === "confirm",
					from,
				);
				assert.equal(dialog.timeout, 120_000);
				assert.match(
					String(dialog.message),
					new RegExp(
						`"expectedConfigRevision": "sha256:${createHash("sha256").update(config).digest("hex")}"`,
					),
				);
				assert.equal(
					readFileSync(path, "utf8"),
					config,
					"nothing written before approval",
				);
				pi.send({ type: "extension_ui_response", id: dialog.id, confirmed });
				const end = await pi.waitFor(
					(record) =>
						record.type === "tool_execution_end" &&
						record.toolName === "pstack_apply_task_models",
					from,
				);
				await pi.waitFor((record) => record.type === "agent_settled", from);
				const saved = JSON.parse(readFileSync(path, "utf8"));
				if (confirmed) {
					assert.equal(end.isError, false, JSON.stringify(end.result));
					assert.deepEqual(saved.models.tasks, {
						coding: ["faux/faux-1"],
						review: ["faux/faux-2"],
					});
					assert.deepEqual(saved.keep, { me: true });
				} else {
					assert.equal(readFileSync(path, "utf8"), config);
				}
			} finally {
				await pi.close();
			}
		});

	it("coexists with pi-herdr-roles without role or command collisions", {
		skip:
			rolesPack === undefined &&
			"set PI_HERDR_ROLES_PACK=<pi-herdr-roles package root> as well",
	}, async () => {
		const pi = new IsolatedPi({
			packages: [PACK_ROOT, rolesPack ?? "", hostRoot ?? ""],
		});
		try {
			const listing = await listedRoles(pi);
			assert.deepEqual(
				roleLines(listing),
				GENERIC_ROLES.map((role) => `${role} (package:pi-herdr-roles)`),
				listing,
			);
			assert.doesNotMatch(listing, /^!/m, "no role diagnostics expected");
			const listed = await commands(pi);
			assertNoCommandCollisions(listed);
			assert.deepEqual(
				listed
					.filter((command) => /^plan(:\d+)?$/.test(command.name))
					.map(({ name, path }) => ({ name, path })),
				[
					{
						name: "plan",
						path: join(rolesPack ?? "", "extensions", "index.ts"),
					},
				],
			);
		} finally {
			await pi.close();
		}
	});
});

// Explicit opt-in only: never inferred from a host's directory layout.
describe("legacy bundled host characterization", {
	skip:
		legacyHostRoot === undefined &&
		"set PI_HERDR_AGENTS_LEGACY_HOST=<pre-extraction host root> to characterize legacy hosts",
}, () => {
	it("keeps the host's own bundled roles; pstack adds no role or collision diagnostic", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT, legacyHostRoot ?? ""] });
		try {
			const listing = await listedRoles(pi);
			assert.deepEqual(
				roleLines(listing),
				[...GENERIC_ROLES, "poteto"]
					.toSorted()
					.map((role) => `${role} (package)`),
				listing,
			);
			assert.doesNotMatch(listing, /^!/m, "no role diagnostics expected");
			assert.doesNotMatch(listing, /pi-herdr-pstack/);
		} finally {
			await pi.close();
		}
	});

	it("with roles.bundled:false, lists no roles because pstack contributes none", async () => {
		const pi = new IsolatedPi({
			packages: [PACK_ROOT, legacyHostRoot ?? ""],
			herdrAgentsConfig: LEGACY_CONFIG,
		});
		try {
			const listing = await listedRoles(pi);
			assert.deepEqual(roleLines(listing), [], listing);
			assert.doesNotMatch(listing, /^!/m);
		} finally {
			await pi.close();
		}
	});
});
