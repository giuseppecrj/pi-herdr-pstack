import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	BUILTIN_EXTENSIONS,
	configuredHostRoot,
	FAUX_EXTENSION,
	LOCAL_PI_CLI,
	PACK_ROOT,
	readRequestLog,
} from "./helpers/rpc.ts";

const HOST = configuredHostRoot();
const hasScript = spawnSync("script", ["--version"]).status === 0;
// The host's own child extension, passed with -e exactly as its launcher does.
const CHILD_EXTENSION = HOST
	? join(HOST, "maestro", "adapters", "pi", "child", "subagent-done.ts")
	: "";
const SKILL_BLOCK = '<skill name="poteto-mode"';
const TASK = "TASK-MARKER fix the failing test";

type Launch = {
	prompts: (taskFile: string) => string[];
	/** Delay of the second model reply; 0 shows how a fast fake hides the race. */
	delayMs?: number;
};

/**
 * Runs Pi 1.0.3 interactively under a pseudo-terminal with the prompt
 * arguments pi-herdr-agents builds for a role with `skills: poteto-mode`
 * (`buildPromptArgs`): direct delivery for forked children, `""` plus an
 * `@task` artifact for fresh ones. The second model reply is delayed past the
 * child extension's auto-exit so a lost task cannot hide behind a fast fake.
 */
function runChild(launch: Launch) {
	const root = mkdtempSync(join(tmpdir(), "pi-herdr-pstack-child-"));
	const agentDir = join(root, "agent");
	const home = join(root, "home");
	const work = join(root, "work");
	for (const dir of [agentDir, home, work]) mkdirSync(dir);
	writeFileSync(
		join(agentDir, "settings.json"),
		JSON.stringify({ packages: [PACK_ROOT], extensions: BUILTIN_EXTENSIONS }),
	);
	const taskFile = join(root, "task.md");
	writeFileSync(taskFile, `${TASK}\n`);
	const sessionFile = join(root, "child.jsonl");
	const log = join(root, "requests.jsonl");
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		TERM: "xterm-256color",
		HOME: home,
		XDG_CONFIG_HOME: join(home, ".config"),
		XDG_DATA_HOME: join(home, ".local", "share"),
		XDG_STATE_HOME: join(home, ".local", "state"),
		XDG_CACHE_HOME: join(home, ".cache"),
		PI_CODING_AGENT_DIR: agentDir,
		PI_OFFLINE: "1",
		PI_SKIP_VERSION_CHECK: "1",
		PI_TELEMETRY: "0",
		PSTACK_TEST_LOG: log,
		PSTACK_TEST_DELAY: `1:${launch.delayMs ?? 3000}`,
		PI_SUBAGENT_NAME: "startup-probe",
		PI_SUBAGENT_AGENT: "poteto",
		PI_SUBAGENT_AUTO_EXIT: "1",
		PI_SUBAGENT_SESSION: sessionFile,
		PI_SUBAGENT_ID: "startup-probe-1",
	};
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
	const command = [
		"cd",
		quote(work),
		"&&",
		"exec",
		quote(process.execPath),
		quote(LOCAL_PI_CLI),
		"--session",
		quote(sessionFile),
		"-e",
		quote(CHILD_EXTENSION),
		"-e",
		quote(FAUX_EXTENSION),
		"-np",
		"-nc",
		"--offline",
		"--provider",
		"faux",
		"--model",
		"faux-1",
		...launch.prompts(taskFile).map(quote),
	].join(" ");
	const result = spawnSync("script", ["-qec", command, "/dev/null"], {
		env,
		timeout: 60_000,
		encoding: "utf8",
	});
	try {
		const entries = readRequestLog(log);
		const messages = readFileSync(sessionFile, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line))
			.filter((entry) => entry.type === "message")
			.map((entry) => entry.message.role as string);
		return {
			status: result.status,
			requests: entries.flatMap((entry) =>
				"user" in entry
					? [
							{
								skill: entry.user.includes(SKILL_BLOCK),
								task: entry.user.includes(TASK),
							},
						]
					: [],
			),
			replied: entries.flatMap((entry) =>
				"replied" in entry ? [entry.replied] : [],
			),
			messages,
			sidecar: existsSync(`${sessionFile}.exit`)
				? JSON.parse(readFileSync(`${sessionFile}.exit`, "utf8"))
				: undefined,
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe("explicit skills: poteto-mode startup for an auto-exit role", {
	skip:
		(HOST === undefined &&
			"set PI_HERDR_AGENTS_HOST=<host root> to characterize role skill startup") ||
		(!hasScript && "util-linux script(1) is required for a pseudo-terminal"),
}, () => {
	it("uses the host's real child extension", () => {
		assert.ok(existsSync(CHILD_EXTENSION), CHILD_EXTENSION);
	});

	// Characterization of the blocker that keeps `skills: poteto-mode` off the
	// role: the host delivers the skill as its own prompt, the child auto-exits
	// when that first run settles, and the task's run is cut off.
	it("direct delivery runs a skill-only turn, then exits before the task completes", () => {
		const run = runChild({ prompts: () => ["/skill:poteto-mode", TASK] });
		assert.equal(run.status, 0);
		assert.deepEqual(run.requests, [
			{ skill: true, task: false },
			{ skill: false, task: true },
		]);
		assert.deepEqual(run.replied, [0], "the task's reply never arrives");
		assert.deepEqual(run.messages, ["system", "user", "assistant", "user"]);
		assert.deepEqual(run.sidecar, { type: "done" }, "reported as completed");
	});

	it("artifact delivery runs the task without the skill, then a skill-only turn is cut off", () => {
		const run = runChild({
			prompts: (taskFile) => ["", "/skill:poteto-mode", `@${taskFile}`],
		});
		assert.equal(run.status, 0);
		assert.deepEqual(run.requests, [
			{ skill: false, task: true },
			{ skill: true, task: false },
		]);
		assert.deepEqual(run.replied, [0]);
		assert.deepEqual(run.sidecar, { type: "done" });
	});

	it("control: an instant fake reply finishes before the exit and would hide the race", () => {
		const run = runChild({
			prompts: () => ["/skill:poteto-mode", TASK],
			delayMs: 0,
		});
		assert.deepEqual(run.replied, [0, 1]);
		assert.deepEqual(run.messages, [
			"system",
			"user",
			"assistant",
			"user",
			"assistant",
		]);
	});

	it("keeps the gate closed: the poteto role does not declare skills", () => {
		assert.doesNotMatch(
			readFileSync(join(PACK_ROOT, "agents", "poteto.md"), "utf8"),
			/^skills?:/m,
		);
	});
});
