import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { configuredHostRoot, IsolatedPi, PACK_ROOT } from "./helpers/rpc.ts";

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

/** Role lines from subagents_list, e.g. "poteto (package:pi-herdr-pstack)". */
function roleLines(listing: string): string[] {
	return [...listing.matchAll(/^• (\S+ \([^)]+\))/gm)]
		.map((match) => match[1])
		.toSorted();
}

describe("installed pack without pi-herdr-agents", () => {
	it("loads without registering commands or skills in Wave 1", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT] });
		try {
			const owned = (await commands(pi)).filter((command) =>
				command.path.startsWith(`${PACK_ROOT}/`),
			);
			assert.deepEqual(
				owned.filter((command) => !command.path.includes("/test/fixtures/")),
				[],
			);
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
	assert.equal(
		listed.some((command) =>
			command.path.startsWith(`${PACK_ROOT}/pi-extension/`),
		),
		false,
		"pstack registers no commands in Wave 1",
	);
}

// Role-free expectations always apply to PI_HERDR_AGENTS_HOST; a legacy host
// must fail here rather than loosen them. Legacy characterization is opt-in below.
describe("installed pack with a real role-free pi-herdr-agents host", {
	skip:
		hostRoot === undefined &&
		"set PI_HERDR_AGENTS_HOST=<host package root> to run combined-host checks",
}, () => {
	it("lists only poteto with pstack provenance, with no collisions or retired commands", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT, hostRoot ?? ""] });
		try {
			const listing = await listedRoles(pi);
			assert.deepEqual(
				roleLines(listing),
				["poteto (package:pi-herdr-pstack)"],
				listing,
			);
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
				[
					"poteto (package:pi-herdr-pstack)",
					...GENERIC_ROLES.map((role) => `${role} (package:pi-herdr-roles)`),
				].toSorted(),
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
	it("keeps the host's own poteto collision diagnostic", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT, legacyHostRoot ?? ""] });
		try {
			const listing = await listedRoles(pi);
			assert.ok(
				listing.includes('Role pack cannot replace bundled role "poteto"'),
				listing,
			);
		} finally {
			await pi.close();
		}
	});

	it("with roles.bundled:false, lists poteto with pstack provenance", async () => {
		const pi = new IsolatedPi({
			packages: [PACK_ROOT, legacyHostRoot ?? ""],
			herdrAgentsConfig: LEGACY_CONFIG,
		});
		try {
			const listing = await listedRoles(pi);
			assert.deepEqual(roleLines(listing), [
				"poteto (package:pi-herdr-pstack)",
			]);
			assert.doesNotMatch(listing, /^!/m);
		} finally {
			await pi.close();
		}
	});
});
