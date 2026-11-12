import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
	configuredHostRoot,
	HOST_ROOT,
	IsolatedPi,
	PACK_ROOT,
	SKILL_NAMES,
} from "./helpers/rpc.ts";
import { SdkPi } from "./helpers/sdk.ts";

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

// Loader and expansion test with the faux provider; not evidence of live-model compliance.
describe("setup-repo from the mattpocock folder", () => {
	const SKILL = join(PACK_ROOT, "skills/mattpocock/setup-repo/SKILL.md");

	it("loads under its own name, stays out of the model's skill list and expands on /skill:setup-repo", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT] });
		try {
			const listed = (await commands(pi)).filter(
				({ name }) => name === "skill:setup-repo",
			);
			assert.deepEqual(listed, [{ name: "skill:setup-repo", path: SKILL }]);
			assert.equal(pi.stderr, "");

			await pi.prompt("/skill:setup-repo the scratch repo");
			const [request] = pi.requests();
			assert.match(request.systemPrompt, /<name>setup-pstack<\/name>/);
			assert.doesNotMatch(request.systemPrompt, /<name>setup-repo<\/name>/);
			const body = readFileSync(SKILL, "utf8")
				.replace(/^---\n[\s\S]*?\n---\n/, "")
				.trim();
			assert.equal(
				request.user,
				`<skill name="setup-repo" location="${SKILL}">\nReferences are relative to ${join(PACK_ROOT, "skills/mattpocock/setup-repo")}.\n\n${body}\n</skill>\n\nthe scratch repo`,
			);
		} finally {
			await pi.close();
		}
	});
});

/**
 * Loader and expansion tests for one group of skills/mattpocock skills, with
 * the faux provider; not evidence of live-model compliance. `modelInvoked`
 * lists the skills upstream leaves model-invocable; the rest are /skill: only.
 */
function mattpocockSkills(
	title: string,
	group: string[],
	modelInvoked: string[],
) {
	const dirOf = (name: string) => join(PACK_ROOT, "skills/mattpocock", name);
	const skillFile = (name: string) => join(dirOf(name), "SKILL.md");
	const shown = modelInvoked.length
		? `showing only ${modelInvoked.join(", ")} to the model`
		: "showing none to the model";

	describe(title, () => {
		it("loads every skill through Pi's package loader under its unprefixed name, with no diagnostics", async () => {
			const pi = await SdkPi.start();
			try {
				const { skills, diagnostics } = pi.session.resourceLoader.getSkills();
				assert.deepEqual(diagnostics, []);
				for (const name of group) {
					const loaded = skills.filter((skill) => skill.name === name);
					assert.deepEqual(
						loaded.map(({ filePath, disableModelInvocation }) => ({
							filePath,
							disableModelInvocation,
						})),
						[
							{
								filePath: skillFile(name),
								disableModelInvocation: !modelInvoked.includes(name),
							},
						],
						name,
					);
				}
			} finally {
				pi.dispose();
			}
		});

		it(`lists each skill as /skill:<name> and expands it, ${shown}`, async () => {
			const pi = new IsolatedPi({ packages: [PACK_ROOT] });
			try {
				const listed = (await commands(pi)).filter(({ name }) =>
					group.some((skill) => name === `skill:${skill}`),
				);
				assert.deepEqual(
					listed.toSorted((a, b) => a.name.localeCompare(b.name)),
					group.map((name) => ({
						name: `skill:${name}`,
						path: skillFile(name),
					})),
				);
				assert.equal(pi.stderr, "");

				for (const name of group) {
					await pi.prompt(`/skill:${name} the scratch spec`);
					const request = pi.requests().at(-1);
					assert.ok(request, name);
					for (const skill of group)
						assert.equal(
							request.systemPrompt.includes(`<name>${skill}</name>`),
							modelInvoked.includes(skill),
							`${name}: ${skill} in the model's skill list`,
						);
					const body = readFileSync(skillFile(name), "utf8")
						.replace(/^---\n[\s\S]*?\n---\n/, "")
						.trim();
					assert.equal(
						request.user,
						`<skill name="${name}" location="${skillFile(name)}">\nReferences are relative to ${dirOf(name)}.\n\n${body}\n</skill>\n\nthe scratch spec`,
						name,
					);
				}
				assert.equal(pi.stderr, "");
			} finally {
				await pi.close();
			}
		});
	});
}

// The spec, ticket and triage flow (#33).
mattpocockSkills(
	"spec, ticket and triage flow from the mattpocock folder",
	[
		"domain-modeling",
		"grill-me",
		"grill-with-docs",
		"grilling",
		"implement",
		"implement-spec",
		"to-spec",
		"to-tickets",
		"triage",
		"wayfinder",
	],
	["domain-modeling", "grilling"],
);

// The remaining gap skills (#34).
mattpocockSkills(
	"remaining gap skills from the mattpocock folder",
	[
		"codebase-design",
		"handoff",
		"improve-codebase-architecture",
		"pr",
		"research",
		"to-questionnaire",
		"wizard",
	],
	["codebase-design", "pr", "research", "wizard"],
);

const hostRoot = HOST_ROOT;
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
describe("installed pack with a real role-free pi-herdr-agents host", () => {
	it("lists no roles, since pstack contributes none, with no collisions or retired commands", async () => {
		const pi = new IsolatedPi({ packages: [PACK_ROOT, hostRoot] });
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

	for (const choice of ["Yes, save", "No, keep current"])
		it(`saves /setup-pstack models and thinking only when the host's RPC dialog answers "${choice}"`, async () => {
			const config = `${JSON.stringify({
				status: { enabled: false },
				keep: { me: true },
				models: { tasks: { coding: ["faux/faux-1"] } },
			})}\n`;
			const revision = `sha256:${createHash("sha256").update(config).digest("hex")}`;
			const pi = new IsolatedPi({
				packages: [PACK_ROOT, hostRoot],
				herdrAgentsConfig: config,
			});
			const path = join(pi.agentDir, "herdr-agents", "config.json");
			const write = {
				tasks: { coding: ["faux/faux-1"], review: ["faux/faux-2"] },
				tasksThinking: { coding: "medium", review: "medium" },
				tasksMeta: {
					generatedAt: "2026-11-12T00:00:00.000Z",
					method: "registry-only",
				},
				basis: { kind: "registry-only" },
				expectedConfigRevision: revision,
			};
			try {
				await pi.prompt(
					`/test-arm-tool subagents_write_task_models ${JSON.stringify(write)}`,
				);
				const from = pi.records.length;
				pi.send({ type: "prompt", message: "/setup-pstack small" });
				const dialog = await pi.waitFor(
					(record) =>
						record.type === "extension_ui_request" &&
						record.method === "select",
					from,
				);
				assert.match(String(dialog.title), /^Approve task model preferences\n/);
				assert.match(
					String(dialog.title),
					/review: null \/ null -> \["faux\/faux-2"\] \/ "medium"/,
				);
				assert.deepEqual(dialog.options, ["No, keep current", "Yes, save"]);
				const brief = pi.requests().at(-1)?.user ?? "";
				assert.ok(
					brief.includes(`expectedConfigRevision: "${revision}"`),
					"the model saw the revision it submitted",
				);
				assert.equal(
					readFileSync(path, "utf8"),
					config,
					"nothing written before approval",
				);
				pi.send({
					type: "extension_ui_response",
					id: dialog.id,
					value: choice,
				});
				const end = await pi.waitFor(
					(record) =>
						record.type === "tool_execution_end" &&
						record.toolName === "subagents_write_task_models",
					from,
				);
				await pi.waitFor((record) => record.type === "agent_settled", from);
				assert.equal(
					pi.records
						.slice(from)
						.filter(
							(record) =>
								record.type === "extension_ui_request" &&
								(record.method === "select" || record.method === "confirm"),
						).length,
					1,
					"one approval dialog, the host's",
				);
				if (choice === "Yes, save") {
					assert.equal(end.isError, false, JSON.stringify(end.result));
					const saved = JSON.parse(readFileSync(path, "utf8"));
					assert.deepEqual(saved.models.tasks, write.tasks);
					assert.deepEqual(saved.models.tasksThinking, write.tasksThinking);
					assert.deepEqual(saved.keep, { me: true });
				} else {
					assert.equal(end.isError, true);
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
			packages: [PACK_ROOT, rolesPack ?? "", hostRoot],
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
